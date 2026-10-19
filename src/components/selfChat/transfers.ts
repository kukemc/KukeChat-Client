import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import type { QueryClient } from '@tanstack/react-query';
import { ApiError, NetworkError, StorageUploadError } from '@/api/client';
import { completeSelfTransfer, createSelfTransfer, getSelfTransfers, selfChatErrorCode, selfChatErrorDetail, uploadSelfTransferContent } from '@/api/selfChat';
import { formatFileSize } from '@/components/groupPlus/tier';
import { adoptServerMessage } from '@/components/chat/message/pendingSend';
import { toast } from '@/components/ui/toast';
import { upsertMessageIntoFirstPage, type MessagesInfiniteData } from '@/realtime/cache';
import { useKukeStore } from '@/store/kukeStore';
import { absorbMuteError } from '@/store/moderationStore';
import { noteSelfOwnMessage } from '@/store/selfChatStore';
import type { Conversation, Message, SelfTransferCreated, SelfTransferList } from '@/types/api';
import { applyLatestMessageToConversations } from '@/utils/conversations';
import { parseApiDate } from '@/utils/dateTime';

/*
 * 「我的设备」的临时文件发送（KukeChat-Server/docs/self-chat.md 第 5 节）：
 *   开单 POST /transfers → 把字节 PUT 到 upload.url（直传对象存储，或经后端）→ complete（带 client_nonce）→ 会话里落一条文件消息。
 *
 * 任务放在全局 store 里（和群文件上传 groupPlus/uploads.ts 同一个做法）：大文件要传一会儿，切走会话不能把它丢了。
 * 上传期间在消息列表末尾放一条本地消息（负数 id，不进缓存），画成带进度、能取消的卡片；
 * complete 回来的真消息和推送来的 message.created 都按 client_nonce 认领这一行，原地换掉（pendingSend 的 adoptServerMessage）。
 *
 * 失败了可以重试：卡在 complete（限频 429、还没传完）就只重新 complete，不重传；上传单作废了（1 小时）或直传地址过期（15 分钟）才重新开单。
 */

export type SelfTransferStatus = 'uploading' | 'finishing' | 'done' | 'failed' | 'canceled';

export interface SelfTransferTask {
  id: number;
  conversationId: number;
  name: string;
  size: number;
  contentType: string;
  loaded: number;
  status: SelfTransferStatus;
  /** 失败原因（中文，可以直接展示） */
  error: string | null;
  startedAt: number;
  /** complete 用的 client_nonce，也是列表行的 key */
  nonce: string;
  transferId: number | null;
  /** 落下的文件消息；列表里看到它之后上传卡片就不再显示 */
  messageId: number | null;
}

interface TaskRuntime {
  file: File;
  controller: AbortController | null;
  created: SelfTransferCreated | null;
  uploaded: boolean;
}

interface TransferState {
  tasks: SelfTransferTask[];
}

export const useSelfTransfers = create<TransferState>(() => ({ tasks: [] }));

const runtimes = new Map<number, TaskRuntime>();
let nextTaskId = 1;

export const selfTransferKeys = {
  list: (conversationId: number) => ['self-transfers', conversationId] as const
};

function patchTask(id: number, change: Partial<SelfTransferTask>): void {
  useSelfTransfers.setState((state) => ({ tasks: state.tasks.map((task) => (task.id === id ? { ...task, ...change } : task)) }));
}

function findTask(id: number): SelfTransferTask | undefined {
  return useSelfTransfers.getState().tasks.find((task) => task.id === id);
}

function randomNonce(): string {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return `t${Date.now().toString(36)}${Array.from(bytes, (byte) => byte.toString(36).padStart(2, '0')).join('')}`.slice(0, 40);
}

/** 错误 → 一句能直接展示的话。限额类补上数字 */
function failureText(error: unknown, size: number): string {
  const code = selfChatErrorCode(error);
  const detail = selfChatErrorDetail(error);
  const serverMessage = typeof detail.message === 'string' && detail.message ? detail.message : null;
  if (code === 'file_too_large') {
    const max = typeof detail.max_file_bytes === 'number' ? detail.max_file_bytes : null;
    return max ? `文件太大了（${formatFileSize(size)}），单个文件最大 ${formatFileSize(max)}。` : serverMessage ?? '文件太大了。';
  }
  if (code === 'transfer_quota_exceeded') {
    const quota = typeof detail.quota_bytes === 'number' ? detail.quota_bytes : null;
    const used = typeof detail.used_bytes === 'number' ? detail.used_bytes : null;
    return quota !== null && used !== null
      ? `临时文件空间不够：已用 ${formatFileSize(used)} / ${formatFileSize(quota)}，这个文件 ${formatFileSize(size)}。等之前的文件过期，或撤回不要的文件再发。`
      : serverMessage ?? '临时文件空间不够了。';
  }
  if (code === 'rate_limited' || (error instanceof ApiError && error.status === 429)) {
    return '发送太频繁了，过一会儿点「重试」就行，文件不用重新传。';
  }
  if (code === 'account_muted') {
    return '你已被禁言，暂时不能发送。';
  }
  if (code === 'upload_not_found') {
    return '上传已经过期，点「重试」重新上传。';
  }
  if (code === 'upload_size_mismatch' || code === 'upload_incomplete') {
    return '文件没有传完整，点「重试」重新上传。';
  }
  if (error instanceof StorageUploadError) {
    return '存储服务拒绝了上传，点「重试」重新上传。';
  }
  if (error instanceof NetworkError) {
    return '网络连接断了，点「重试」再传一次。';
  }
  if (error instanceof ApiError && error.status === 413 && !code) {
    // 经后端上传时被前面的反代挡下（client_max_body_size），不是额度问题
    return '文件超过了服务器允许的上传大小。';
  }
  return serverMessage ?? (error instanceof Error && error.message ? error.message : '发送失败，请稍后重试。');
}

/** 失败之后，重试要从哪一步重新来 */
function rewindAfter(error: unknown, runtime: TaskRuntime): void {
  const code = selfChatErrorCode(error);
  if (code === 'upload_not_found' || error instanceof StorageUploadError) {
    // 上传单作废 / 签名过期或不对：重新开单
    runtime.created = null;
    runtime.uploaded = false;
  } else if (code === 'upload_size_mismatch' || code === 'upload_incomplete' || error instanceof NetworkError) {
    runtime.uploaded = false;
  }
}

/** 上传地址快过期了（直传 15 分钟、经后端 1 小时）就别拿它重传 */
function ticketUsable(created: SelfTransferCreated | null): boolean {
  if (!created) {
    return false;
  }
  const until = parseApiDate(created.upload.expires_at)?.getTime();
  return until === undefined || until - Date.now() > 60_000;
}

function writeMessage(queryClient: QueryClient, message: Message): void {
  queryClient.setQueryData<MessagesInfiniteData | undefined>(['messages', message.conversation_id], (current) => upsertMessageIntoFirstPage(current, message));
  queryClient.setQueryData<Conversation[] | undefined>(['conversations'], (current) => applyLatestMessageToConversations(current, message, { visibleConversationId: useKukeStore.getState().visibleConversationId }));
}

async function run(queryClient: QueryClient, id: number): Promise<void> {
  const task = findTask(id);
  const runtime = runtimes.get(id);
  if (!task || !runtime) {
    return;
  }
  const controller = new AbortController();
  runtime.controller = controller;
  const { conversationId } = task;
  try {
    if (!runtime.uploaded && !ticketUsable(runtime.created)) {
      runtime.created = await createSelfTransfer(conversationId, runtime.file);
      patchTask(id, { transferId: runtime.created.transfer_id });
      // 开了单就占了额度：信息面板里的「已用」跟着变
      void queryClient.invalidateQueries({ queryKey: selfTransferKeys.list(conversationId) });
    }
    const created = runtime.created;
    if (!created) {
      throw new Error('上传单丢失，请重试。');
    }
    if (!runtime.uploaded) {
      patchTask(id, { status: 'uploading', loaded: 0 });
      await uploadSelfTransferContent(created, runtime.file, (loaded) => patchTask(id, { loaded }), controller.signal);
      runtime.uploaded = true;
    }
    if (controller.signal.aborted) {
      throw new DOMException('上传已取消', 'AbortError');
    }
    patchTask(id, { status: 'finishing', loaded: task.size });
    const result = await completeSelfTransfer(conversationId, created.transfer_id, task.nonce);
    const message = result.message;
    if (message) {
      // 先登记行 key 再写缓存：真消息画出来时和上传卡片是同一行
      adoptServerMessage(message.id, task.nonce);
      noteSelfOwnMessage(message.id);
      writeMessage(queryClient, { ...message, client_nonce: task.nonce } as Message);
    }
    patchTask(id, { status: 'done', loaded: task.size, messageId: message?.id ?? null, error: null });
    runtimes.delete(id);
    void queryClient.invalidateQueries({ queryKey: selfTransferKeys.list(conversationId) });
    window.setTimeout(() => dismissSelfTransfer(id), 3000);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      patchTask(id, { status: 'canceled', error: '已取消' });
      dismissSelfTransfer(id);
      return;
    }
    absorbMuteError(error);
    rewindAfter(error, runtime);
    patchTask(id, { status: 'failed', error: failureText(error, task.size) });
    void queryClient.invalidateQueries({ queryKey: selfTransferKeys.list(conversationId) });
  } finally {
    if (runtime.controller === controller) {
      runtime.controller = null;
    }
  }
}

function startOne(queryClient: QueryClient, conversationId: number, file: File): void {
  const id = nextTaskId;
  nextTaskId += 1;
  runtimes.set(id, { file, controller: null, created: null, uploaded: false });
  const task: SelfTransferTask = {
    id,
    conversationId,
    name: file.name || 'file',
    size: file.size,
    contentType: file.type || 'application/octet-stream',
    loaded: 0,
    status: 'uploading',
    error: null,
    startedAt: Date.now(),
    nonce: randomNonce(),
    transferId: null,
    messageId: null
  };
  useSelfTransfers.setState((state) => ({ tasks: [...state.tasks, task] }));
  void run(queryClient, id);
}

/** 还没传完的（占着额度的）字节数 */
function inFlightBytes(conversationId: number): number {
  return useSelfTransfers.getState().tasks.filter((task) => task.conversationId === conversationId && (task.status === 'uploading' || task.status === 'finishing')).reduce((sum, task) => sum + task.size, 0);
}

/**
 * 在「我的设备」里发一批文件。先按 GET /transfers 给的上限在本地挡一道（单个上限、总额度），
 * 挡不住的服务端还会拒绝（413），失败原因在上传卡片上说。返回排进去了几个。
 */
export async function sendSelfTransfers(queryClient: QueryClient, conversationId: number, files: File[]): Promise<number> {
  if (files.length === 0) {
    return 0;
  }
  let limits: SelfTransferList | null = null;
  try {
    limits = await queryClient.fetchQuery({ queryKey: selfTransferKeys.list(conversationId), queryFn: () => getSelfTransfers(conversationId), staleTime: 30_000 });
  } catch (error) {
    // 拿不到额度（网络、被禁言之类）：不在本地挡，交给服务端判断
    if (absorbMuteError(error)) {
      toast.error('你已被禁言，暂时不能发送。');
      return 0;
    }
  }
  let reserved = inFlightBytes(conversationId);
  let queued = 0;
  for (const file of files) {
    if (file.size <= 0) {
      toast.error(`「${file.name}」是空文件，不能发送。`);
      continue;
    }
    if (limits && limits.max_file_bytes > 0 && file.size > limits.max_file_bytes) {
      toast.error(`「${file.name}」有 ${formatFileSize(file.size)}，单个文件最大 ${formatFileSize(limits.max_file_bytes)}。`);
      continue;
    }
    if (limits && limits.quota_bytes > 0 && file.size > Math.max(0, limits.free_bytes - reserved)) {
      toast.error(`临时文件空间不够：还能放 ${formatFileSize(Math.max(0, limits.free_bytes - reserved))}，「${file.name}」有 ${formatFileSize(file.size)}。`, { subtitle: '文件 24 小时后自动清理，撤回文件消息也会马上腾出空间' });
      continue;
    }
    reserved += file.size;
    startOne(queryClient, conversationId, file);
    queued += 1;
  }
  return queued;
}

export function cancelSelfTransfer(id: number): void {
  const runtime = runtimes.get(id);
  if (runtime?.controller) {
    runtime.controller.abort();
    return;
  }
  // 没有在跑的请求（失败停着）：直接拿掉
  dismissSelfTransfer(id);
}

export function retrySelfTransfer(queryClient: QueryClient, id: number): void {
  const task = findTask(id);
  if (!task || task.status !== 'failed' || !runtimes.has(id)) {
    return;
  }
  patchTask(id, { status: 'uploading', error: null, startedAt: Date.now() });
  void run(queryClient, id);
}

export function dismissSelfTransfer(id: number): void {
  runtimes.get(id)?.controller?.abort();
  runtimes.delete(id);
  useSelfTransfers.setState((state) => ({ tasks: state.tasks.filter((task) => task.id !== id) }));
}

/** 推送来的 message.created 先于 complete 的返回到了：按 client_nonce 认领，上传卡片原地换成真消息 */
export function settleSelfTransferFromRealtime(message: Message): void {
  const nonce = (message as Message & { client_nonce?: unknown }).client_nonce;
  if (typeof nonce !== 'string' || !nonce) {
    return;
  }
  const task = useSelfTransfers.getState().tasks.find((item) => item.nonce === nonce);
  if (!task || task.messageId !== null) {
    return;
  }
  adoptServerMessage(message.id, nonce);
  patchTask(task.id, { messageId: message.id });
}

// ───────── 列表里的本地上传卡片 ─────────

/** 和乐观发送（-1 往下）、群文件上传卡片（-1e9 往下）错开 */
const LOCAL_ID_BASE = -2_000_000_000;
const localMessages = new Map<number, Message>();

export function selfTransferTaskIdOf(message: Message): number | null {
  if (message.id >= 0) {
    return null;
  }
  const value = (message.metadata as Record<string, unknown> | null | undefined)?.self_transfer_task;
  return typeof value === 'number' ? value : null;
}

function localMessageOf(task: SelfTransferTask): Message {
  const cached = localMessages.get(task.id);
  if (cached) {
    return cached;
  }
  const user = useKukeStore.getState().currentUser;
  const message = {
    id: LOCAL_ID_BASE - task.id,
    conversation_id: task.conversationId,
    sender_id: user?.id ?? 0,
    sender: user,
    created_at: new Date(task.startedAt).toISOString(),
    type: 'text',
    content: `[文件] ${task.name}`,
    // device：本机发的，画在右边
    metadata: { self_transfer_task: task.id, device: 'desktop' },
    reactions: [],
    client_nonce: task.nonce
  } as Message;
  localMessages.set(task.id, message);
  return message;
}

/** 这个会话里要接在列表末尾的上传卡片。取消了的、真消息已经在列表里的不显示；进度变化不会让调用方重渲染 */
export function useSelfTransferMessages(conversationId: number, loadedIds: ReadonlySet<number>, enabled = true): Message[] {
  return useSelfTransfers(useShallow((state) => {
    if (!enabled) {
      return [];
    }
    const shown: Message[] = [];
    for (const task of state.tasks) {
      if (task.conversationId !== conversationId || task.status === 'canceled') {
        continue;
      }
      if (task.messageId !== null && loadedIds.has(task.messageId)) {
        continue;
      }
      shown.push(localMessageOf(task));
    }
    return shown;
  }));
}

/** 这个会话里还没收起的任务 id（手机布局把上传卡片排在输入框上面） */
export function useSelfTransferTaskIds(conversationId: number): number[] {
  return useSelfTransfers(useShallow((state) => state.tasks.filter((task) => task.conversationId === conversationId && task.status !== 'canceled' && task.status !== 'done').map((task) => task.id)));
}

useSelfTransfers.subscribe((state) => {
  if (localMessages.size === 0) {
    return;
  }
  const alive = new Set(state.tasks.map((task) => task.id));
  for (const taskId of localMessages.keys()) {
    if (!alive.has(taskId)) {
      localMessages.delete(taskId);
    }
  }
});
