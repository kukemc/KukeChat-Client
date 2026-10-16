import { create } from 'zustand';
import type { QueryClient } from '@tanstack/react-query';
import { uploadGroupFile } from '@/api/groupPlus';
import { upsertMessageIntoFirstPage, type MessagesInfiniteData } from '@/realtime/cache';
import { applyLatestMessageToConversations } from '@/utils/conversations';
import type { Conversation } from '@/types/api';
import { useKukeStore } from '@/store/kukeStore';
import { groupPlusErrorCode, groupPlusErrorDetail, groupPlusKeys } from './data';
import { formatFileSize } from './tier';

/**
 * 群文件上传的任务列表。放在全局 store 里而不是组件状态：上传大文件要一会儿，用户可能中途关掉文件面板，
 * 任务不能跟着面板一起没（进度也要能在重新打开面板时接着看）。每个任务可以单独取消。
 */
export interface UploadTask {
  id: number;
  conversationId: number;
  name: string;
  size: number;
  loaded: number;
  status: 'uploading' | 'done' | 'failed' | 'canceled';
  /** 失败原因，直接展示给用户 */
  error: string | null;
  /** 失败的错误码：quota_exceeded 之类，界面据此给「去升级」 */
  code: string | null;
  permanent: boolean;
  /** 会（或已经）存成 24 小时临时文件：上传前按空间预判，传完以服务端返回的为准 */
  temporary: boolean;
  /** 直传存储桶（重试时沿用） */
  direct: boolean;
}

interface UploadState {
  tasks: UploadTask[];
  start: (queryClient: QueryClient, conversationId: number, file: File, options?: { permanent?: boolean; temporary?: boolean; direct?: boolean }) => void;
  cancel: (id: number) => void;
  dismiss: (id: number) => void;
  retry: (queryClient: QueryClient, id: number) => void;
}

let nextId = 1;
const controllers = new Map<number, AbortController>();
const files = new Map<number, File>();

/** 给 file_too_large / quota_exceeded 补上能读懂的数字（服务端的 message 里没有） */
function failureText(error: unknown, size: number): { message: string; code: string | null } {
  const code = groupPlusErrorCode(error);
  const detail = groupPlusErrorDetail(error);
  const serverMessage = typeof detail.message === 'string' && detail.message ? detail.message : null;
  if (code === 'file_too_large' && typeof detail.temp_max_bytes === 'number') {
    return { code, message: `文件太大了（${formatFileSize(size)}）：群空间放不下，临时文件单个最大 ${formatFileSize(detail.temp_max_bytes)}。` };
  }
  if (code === 'file_too_large' && typeof detail.max_file_bytes === 'number') {
    return { code, message: `文件太大了（${formatFileSize(size)}），单个文件最大 ${formatFileSize(detail.max_file_bytes)}。` };
  }
  if (code === 'quota_exceeded' && typeof detail.quota_bytes === 'number' && typeof detail.used_bytes === 'number') {
    return { code, message: `群文件空间不够：已用 ${formatFileSize(detail.used_bytes)} / ${formatFileSize(detail.quota_bytes)}，这个文件 ${formatFileSize(size)}。` };
  }
  const fallback = error instanceof Error && error.message ? error.message : '上传失败，请稍后再试。';
  return { code, message: serverMessage ?? fallback };
}

export const useGroupFileUploads = create<UploadState>((set, get) => ({
  tasks: [],
  start: (queryClient, conversationId, file, options) => {
    const id = nextId;
    nextId += 1;
    const controller = new AbortController();
    controllers.set(id, controller);
    files.set(id, file);
    const task: UploadTask = { id, conversationId, name: file.name, size: file.size, loaded: 0, status: 'uploading', error: null, code: null, permanent: options?.permanent === true, temporary: options?.temporary === true, direct: options?.direct === true };
    set((state) => ({ tasks: [...state.tasks, task] }));
    const patch = (change: Partial<UploadTask>): void => set((state) => ({ tasks: state.tasks.map((item) => (item.id === id ? { ...item, ...change } : item)) }));
    uploadGroupFile(conversationId, file, {
      permanent: options?.permanent,
      direct: options?.direct,
      signal: controller.signal,
      onProgress: (loaded) => patch({ loaded })
    }).then((result) => {
      patch({ status: 'done', loaded: file.size, temporary: result.file?.temporary ?? false });
      files.delete(id);
      void queryClient.invalidateQueries({ queryKey: groupPlusKeys.files(conversationId) });
      void queryClient.invalidateQueries({ queryKey: groupPlusKeys.info(conversationId) });
      // 落了文件消息：和发普通消息一样直接写进缓存，不等实时事件
      const message = result.message;
      if (message) {
        queryClient.setQueryData<MessagesInfiniteData | undefined>(['messages', message.conversation_id], (current) => upsertMessageIntoFirstPage(current, message));
        queryClient.setQueryData<Conversation[] | undefined>(['conversations'], (current) => applyLatestMessageToConversations(current, message, { visibleConversationId: useKukeStore.getState().visibleConversationId }));
      }
      // 完成的任务留 3 秒再收起，让人看到「已上传」
      window.setTimeout(() => get().dismiss(id), 3000);
    }, (error: unknown) => {
      if (error instanceof DOMException && error.name === 'AbortError') {
        patch({ status: 'canceled', error: '已取消' });
        return;
      }
      const failure = failureText(error, file.size);
      patch({ status: 'failed', error: failure.message, code: failure.code });
      if (failure.code === 'quota_exceeded' || failure.code === 'files_locked') {
        void queryClient.invalidateQueries({ queryKey: groupPlusKeys.info(conversationId) });
      }
    }).finally(() => controllers.delete(id));
  },
  cancel: (id) => controllers.get(id)?.abort(),
  dismiss: (id) => {
    files.delete(id);
    set((state) => ({ tasks: state.tasks.filter((item) => item.id !== id) }));
  },
  retry: (queryClient, id) => {
    const task = get().tasks.find((item) => item.id === id);
    const file = files.get(id);
    if (!task || !file) {
      return;
    }
    get().dismiss(id);
    get().start(queryClient, task.conversationId, file, { permanent: task.permanent, temporary: task.temporary, direct: task.direct });
  }
}));
