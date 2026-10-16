import type { QueryClient } from '@tanstack/react-query';
import { create } from 'zustand';
import { sendMessage, uploadMessageImage, uploadMessageVoice } from '@/api/messages';
import { toast } from '@/components/ui/toast';
import { upsertMessageIntoFirstPage } from '@/realtime/cache';
import { useKukeStore } from '@/store/kukeStore';
import { absorbMuteError } from '@/store/moderationStore';
import type { Conversation, Message, MessageMetadata, User } from '@/types/api';
import { applyLatestMessageToConversations } from '@/utils/conversations';
import type { MessagesInfiniteData, SendMessageVariables } from './types';

/*
 * 乐观发送（docs/chat-features.md 第 11 节，后端 client_nonce）。
 *
 * 点发送后先在列表末尾放一条本地消息（负数 id），再上传、再发；服务器确认后按 client_nonce 原地换成真消息。
 * 本地消息只在内存里，不进消息缓存（react-query 的 ['messages', id] 里永远只有服务器的消息），应用重启就没了。
 *
 * 顺序：同一个会话的 POST 严格按点发送的顺序一条接一条发（上传可以并行），所以服务器顺序 = 发送顺序。
 */

/** sent：服务器已确认，等真消息画出来替换掉它 */
export type PendingStatus = 'sending' | 'sent' | 'failed';

export interface PendingEntry {
  nonce: string;
  conversationId: number;
  /** 列表里显示的那条本地消息。id 为负数 */
  message: Message;
  status: PendingStatus;
  /** 失败原因（中文，可直接展示） */
  error: string | null;
  variables: SendMessageVariables;
  /** 图片 / 语音的本地 object URL，和 variables.files 一一对应 */
  localUrls: string[];
  /** 已经上传好的地址（重发时直接复用） */
  uploaded: { urls: string[]; contentType?: string | null } | null;
  /** 服务器确认后的消息 id；列表里看到这条真消息后，本地那条就不再显示 */
  serverId: number | null;
  /** 这一轮开始发送的时间，转圈「超过 1 秒才出现」用 */
  startedAt: number;
}

interface PendingState {
  byConversation: Record<number, PendingEntry[]>;
}

const usePendingStore = create<PendingState>(() => ({ byConversation: {} }));
const EMPTY: PendingEntry[] = [];

let localIdSeed = 0;
/** 每个会话最后一个「发送槽」：后一条的 POST 等前一条的 POST 结束（成功失败都算）才发 */
const sendTails = new Map<number, Promise<void>>();
/** 服务器图片地址 → 本地 object URL。确认后的消息继续用本地已解码的图，不重新下载、不闪 */
const localPreviewByUrl = new Map<string, string>();
/** 服务器消息 id → 当初的 client_nonce。列表用它当 React key，本地那条换成真消息时同一个行组件原地更新 */
const nonceByServerId = new Map<number, string>();

function randomNonce(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return `c${Date.now().toString(36)}${Array.from(bytes, (byte) => byte.toString(36).padStart(2, '0')).join('')}`.slice(0, 40);
}

function updateEntries(conversationId: number, updater: (entries: PendingEntry[]) => PendingEntry[]): void {
  usePendingStore.setState((state) => {
    const current = state.byConversation[conversationId] ?? EMPTY;
    const next = updater(current);
    return next === current ? state : { byConversation: { ...state.byConversation, [conversationId]: next } };
  });
}

function patchEntry(conversationId: number, nonce: string, patch: Partial<PendingEntry>): void {
  updateEntries(conversationId, (entries) => entries.map((entry) => (entry.nonce === nonce ? { ...entry, ...patch } : entry)));
}

function findEntry(conversationId: number, nonce: string): PendingEntry | undefined {
  return usePendingStore.getState().byConversation[conversationId]?.find((entry) => entry.nonce === nonce);
}

export function describeSendError(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (/20 messages|per minute|429/i.test(message)) {
    return '发送太频繁了，每分钟最多发送 20 条消息。';
  }
  if (/3MB|413|too large/i.test(message)) {
    return /voice|语音/i.test(message) ? '语音不能超过 2MB。' : '图片压缩后不能超过 3MB（GIF 保留原图，原图不能超过 3MB）。';
  }
  if (/group is muted/i.test(message)) {
    return '本群已开启全员禁言。';
  }
  if (/muted members/i.test(message)) {
    return '你已被禁言，暂时不能发言。';
  }
  return message || '发送失败，请稍后重试。';
}

/** 自己最近一条消息上的群名片、头衔、等级，给本地消息照抄一份，免得确认前后名字那一行变样 */
function senderExtrasFrom(queryClient: QueryClient, conversationId: number, userId: number): Pick<Message, 'sender_display_name' | 'sender_title' | 'sender_level'> {
  const pages = queryClient.getQueryData<MessagesInfiniteData>(['messages', conversationId])?.pages ?? [];
  for (const page of pages) {
    for (let index = page.length - 1; index >= 0; index -= 1) {
      const message = page[index];
      if ((message.sender_id ?? message.sender?.id) === userId && message.type !== 'system') {
        return { sender_display_name: message.sender_display_name ?? null, sender_title: message.sender_title ?? null, sender_level: message.sender_level ?? null };
      }
    }
  }
  return {};
}

function buildLocalMessage(conversationId: number, user: User, variables: SendMessageVariables, localUrls: string[], nonce: string, extras: Partial<Message>): Message {
  localIdSeed -= 1;
  const base = { id: localIdSeed, conversation_id: conversationId, sender_id: user.id, sender: user, created_at: new Date().toISOString(), reactions: [], ...extras };
  const metadata: MessageMetadata = { ...(variables.metadata ?? {}) };
  if (variables.type === 'voice' && variables.voiceFile) {
    return {
      ...base,
      type: 'voice',
      content: localUrls[0] ?? '',
      metadata: { ...metadata, voice: { duration_ms: variables.voiceDurationMs, content_type: variables.voiceFile.type, size: variables.voiceFile.size, waveform: variables.voiceWaveform } },
      client_nonce: nonce
    } as Message;
  }
  if (localUrls.length === 1 && variables.type === 'image' && !variables.content.trim()) {
    return { ...base, type: 'image', content: localUrls[0], metadata: Object.keys(metadata).length > 0 ? metadata : null, client_nonce: nonce } as Message;
  }
  if (localUrls.length > 0) {
    return { ...base, type: 'text', content: variables.content, metadata: { ...metadata, images: localUrls }, client_nonce: nonce } as Message;
  }
  return { ...base, type: variables.type, content: variables.content, metadata: Object.keys(metadata).length > 0 ? metadata : null, client_nonce: nonce } as Message;
}

function writeConfirmed(queryClient: QueryClient, message: Message): void {
  queryClient.setQueryData<MessagesInfiniteData | undefined>(['messages', message.conversation_id], (current) => upsertMessageIntoFirstPage(current, message));
  queryClient.setQueryData<Conversation[] | undefined>(['conversations'], (current) => applyLatestMessageToConversations(current, message, { visibleConversationId: useKukeStore.getState().visibleConversationId }));
}

/** 服务器确认了这条：记下 key 和本地图，标上 serverId（列表里真消息出现后本地那条自动让位），稍后从内存里清掉 */
function settle(conversationId: number, nonce: string, message: Message): void {
  const entry = findEntry(conversationId, nonce);
  if (!entry || entry.serverId !== null) {
    return;
  }
  nonceByServerId.set(message.id, nonce);
  if (entry.uploaded && entry.variables.type !== 'voice') {
    entry.uploaded.urls.forEach((url, index) => {
      const local = entry.localUrls[index];
      if (local) {
        localPreviewByUrl.set(url, local);
      }
    });
  }
  patchEntry(conversationId, nonce, { serverId: message.id, status: 'sent', error: null });
  // react-query 的通知是异步批量的：留足时间，等真消息确实画出来了再摘掉本地这条
  window.setTimeout(() => updateEntries(conversationId, (entries) => entries.filter((item) => item.nonce !== nonce)), 3000);
}

async function run(queryClient: QueryClient, conversationId: number, nonce: string): Promise<void> {
  const previous = sendTails.get(conversationId) ?? Promise.resolve();
  let release: () => void = () => undefined;
  const slot = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.then(() => slot);
  sendTails.set(conversationId, tail);
  void tail.then(() => {
    if (sendTails.get(conversationId) === tail) {
      sendTails.delete(conversationId);
    }
  });

  try {
    const entry = findEntry(conversationId, nonce);
    if (!entry) {
      return;
    }
    const { variables } = entry;
    let uploaded = entry.uploaded;
    if (!uploaded && variables.type === 'voice' && variables.voiceFile) {
      const result = await uploadMessageVoice(variables.voiceFile);
      uploaded = { urls: [result.url], contentType: result.content_type };
    } else if (!uploaded && variables.files && variables.files.length > 0) {
      uploaded = { urls: await Promise.all(variables.files.map(async (file) => (await uploadMessageImage(file)).url)) };
    }
    if (uploaded) {
      patchEntry(conversationId, nonce, { uploaded });
    }

    let content = variables.content;
    let type = variables.type;
    let metadata = variables.metadata;
    if (variables.type === 'voice' && variables.voiceFile && uploaded) {
      content = uploaded.urls[0];
      metadata = { ...(metadata ?? {}), voice: { duration_ms: variables.voiceDurationMs, content_type: uploaded.contentType ?? variables.voiceFile.type, size: variables.voiceFile.size, waveform: variables.voiceWaveform } };
    } else if (uploaded && uploaded.urls.length === 1 && !content.trim() && type === 'image') {
      content = uploaded.urls[0];
    } else if (uploaded && uploaded.urls.length > 0) {
      type = type === 'image' ? 'text' : type;
      metadata = { ...(metadata ?? {}), images: uploaded.urls };
    }

    await previous;
    if (!findEntry(conversationId, nonce)) {
      return; // 等待期间被删掉了
    }
    const message = await sendMessage(conversationId, content, type, metadata, nonce);
    writeConfirmed(queryClient, { ...message, client_nonce: nonce } as Message);
    settle(conversationId, nonce, message);
  } catch (error) {
    // 平台禁言：输入框会换成锁定提示，不再额外弹错误
    const muted = absorbMuteError(error);
    const reason = describeSendError(error);
    patchEntry(conversationId, nonce, { status: 'failed', error: muted ? '你已被禁言，暂时不能发言。' : reason });
    if (!muted) {
      toast.error(reason);
    }
  } finally {
    release();
  }
}

/** 点发送：立刻在列表末尾显示，然后在后台上传、发送。 */
export function enqueueSend(queryClient: QueryClient, conversationId: number, user: User, variables: SendMessageVariables): void {
  const nonce = randomNonce();
  const localFiles: Blob[] = variables.type === 'voice' && variables.voiceFile ? [variables.voiceFile] : variables.files ?? [];
  const localUrls = localFiles.map((file) => URL.createObjectURL(file));
  const message = buildLocalMessage(conversationId, user, variables, localUrls, nonce, senderExtrasFrom(queryClient, conversationId, user.id));
  const entry: PendingEntry = { nonce, conversationId, message, status: 'sending', error: null, variables, localUrls, uploaded: null, serverId: null, startedAt: Date.now() };
  updateEntries(conversationId, (entries) => [...entries, entry]);
  void run(queryClient, conversationId, nonce);
}

/** 失败的那条重发：挪到末尾，用同一份内容重走一遍（已经传好的图直接用）。 */
export function retrySend(queryClient: QueryClient, conversationId: number, nonce: string): void {
  const entry = findEntry(conversationId, nonce);
  if (!entry || entry.status !== 'failed') {
    return;
  }
  const message = { ...entry.message, created_at: new Date().toISOString() };
  updateEntries(conversationId, (entries) => [...entries.filter((item) => item.nonce !== nonce), { ...entry, message, status: 'sending', error: null, startedAt: Date.now() }]);
  void run(queryClient, conversationId, nonce);
}

/** 删掉一条还没发出去的本地消息。 */
export function discardPending(conversationId: number, nonce: string): void {
  const entry = findEntry(conversationId, nonce);
  if (!entry || entry.serverId !== null) {
    return;
  }
  updateEntries(conversationId, (entries) => entries.filter((item) => item.nonce !== nonce));
  entry.localUrls.forEach((url) => URL.revokeObjectURL(url));
}

/** 实时推送的 message.created 先于 POST 回来时：按 client_nonce 对上本地那条。缓存已经由调用方写好。 */
export function settleFromRealtime(message: Message): void {
  const nonce = (message as Message & { client_nonce?: unknown }).client_nonce;
  if (typeof nonce !== 'string' || !nonce || !findEntry(message.conversation_id, nonce)) {
    return;
  }
  settle(message.conversation_id, nonce, message);
}

export function usePendingEntries(conversationId: number): PendingEntry[] {
  return usePendingStore((state) => state.byConversation[conversationId] ?? EMPTY);
}

export function usePendingEntry(message: Message): PendingEntry | null {
  const nonce = message.id < 0 ? pendingNonceOf(message) : null;
  return usePendingStore((state) => (nonce ? state.byConversation[message.conversation_id]?.find((entry) => entry.nonce === nonce) ?? null : null));
}

export function isLocalMessage(message: Message): boolean {
  return message.id < 0;
}

export function pendingNonceOf(message: Message): string | null {
  const nonce = (message as Message & { client_nonce?: unknown }).client_nonce;
  return typeof nonce === 'string' && nonce ? nonce : null;
}

/** 列表行的 React key：本地消息和换上来的真消息用同一个，行组件原地更新、不重新挂载。 */
export function messageRowKey(message: Message): string | number {
  if (message.id < 0) {
    return `n:${pendingNonceOf(message) ?? message.id}`;
  }
  const nonce = nonceByServerId.get(message.id);
  return nonce ? `n:${nonce}` : message.id;
}

/** 刚发出去的图：服务器地址对应的本地 object URL（有就优先用它显示）。 */
export function localPreviewFor(url: string): string | undefined {
  return localPreviewByUrl.get(url);
}
