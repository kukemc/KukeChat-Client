import { useQueryClient } from '@tanstack/react-query';
import { useShallow } from 'zustand/react/shallow';
import { chatUploadNonce, useGroupFileUploads, type UploadTask } from '@/components/groupPlus/uploads';
import { useKukeStore } from '@/store/kukeStore';
import type { Message } from '@/types/api';
import { senderExtrasFrom } from './pendingSend';

/*
 * 聊天里的文件上传卡片。
 *
 * 在聊天里发文件（输入框的文件按钮、拖进来、粘贴）走群文件上传（groupPlus/uploads.ts，直传对象存储或经后端），
 * 传完由服务端落一条文件消息。上传期间在消息列表末尾放一条本地消息（负数 id，和乐观发送的本地消息一样不进缓存），
 * 消息行按 metadata.upload_task_id 画成带进度和取消的卡片；真消息进了缓存后本地这条让位，两者同一个行 key。
 */

/** 和乐观发送的本地 id（从 -1 往下数）错开 */
const LOCAL_ID_BASE = -1_000_000_000;

/** 任务 id → 列表里那条本地消息。同一个任务一直用同一个对象：进度变化不该让整个消息列表重渲染 */
const localMessages = new Map<number, Message>();

function localMessageOf(task: UploadTask, extras: Partial<Message>): Message {
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
    metadata: { upload_task_id: task.id },
    reactions: [],
    client_nonce: chatUploadNonce(task.id),
    ...extras
  } as Message;
  localMessages.set(task.id, message);
  return message;
}

/** 本地上传卡片对应的任务 id；不是上传卡片返回 null。 */
export function chatUploadTaskIdOf(message: Message): number | null {
  if (message.id >= 0) {
    return null;
  }
  const metadata = message.metadata as Record<string, unknown> | null | undefined;
  const value = metadata?.upload_task_id;
  return typeof value === 'number' ? value : null;
}

/**
 * 这个会话里要接在列表末尾的上传卡片。取消了的不显示；传完、而真消息已经在列表里（loadedIds）的也不显示。
 * 返回的数组只在卡片增减时变，进度变化不会触发调用方重渲染（进度由卡片自己订阅）。
 */
export function useChatUploadMessages(conversationId: number, loadedIds: ReadonlySet<number>): Message[] {
  const queryClient = useQueryClient();
  const userId = useKukeStore((state) => state.currentUser?.id ?? 0);
  return useGroupFileUploads(useShallow((state) => {
    const shown: Message[] = [];
    for (const task of state.tasks) {
      if (!task.inChat || task.conversationId !== conversationId || task.status === 'canceled') {
        continue;
      }
      if (task.messageId !== null && loadedIds.has(task.messageId)) {
        continue;
      }
      shown.push(localMessages.get(task.id) ?? localMessageOf(task, senderExtrasFrom(queryClient, conversationId, userId)));
    }
    return shown;
  }));
}

// 任务从上传列表里拿掉（收起、取消、重试换了新任务）后，对应的本地消息也不用再留
useGroupFileUploads.subscribe((state) => {
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
