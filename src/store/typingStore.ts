import { create } from 'zustand';
import { isRecord, pickNumber } from '@/api/normalizers';
import { subscribeRealtimeEvents } from '@/realtime/events';
import { useKukeStore } from './kukeStore';

export interface TypingUser {
  userId: number;
  name: string;
}

interface TypingState {
  /** 会话 id → 正在输入的人，按开始输入的先后排。没人输入的会话不留键。 */
  byConversation: Record<number, readonly TypingUser[]>;
}

/** 服务端没有「停止输入」事件：对方输入时约 3 秒推一次，这边每次续 5 秒，等不到下一次就自己过期。 */
const EXPIRE_MS = 5000;

export const useTypingStore = create<TypingState>(() => ({ byConversation: {} }));

/** 「会话:用户」→ 过期定时器。有定时器就等于这个人正显示在 store 里。 */
const expiryTimers = new Map<string, number>();

function stopTyping(conversationId: number, userId: number): void {
  const key = `${conversationId}:${userId}`;
  const timer = expiryTimers.get(key);
  if (timer === undefined) {
    return;
  }
  window.clearTimeout(timer);
  expiryTimers.delete(key);
  useTypingStore.setState(({ byConversation }) => {
    const { [conversationId]: users = [], ...others } = byConversation;
    const remaining = users.filter((user) => user.userId !== userId);
    return { byConversation: remaining.length > 0 ? { ...others, [conversationId]: remaining } : others };
  });
}

function startTyping(conversationId: number, userId: number, name: string): void {
  const key = `${conversationId}:${userId}`;
  const known = expiryTimers.has(key);
  window.clearTimeout(expiryTimers.get(key));
  expiryTimers.set(key, window.setTimeout(() => stopTyping(conversationId, userId), EXPIRE_MS));
  // 续期不动 store：对方持续输入期间订阅它的组件不用跟着重渲染
  if (!known) {
    useTypingStore.setState(({ byConversation }) => ({
      byConversation: { ...byConversation, [conversationId]: [...(byConversation[conversationId] ?? []), { userId, name }] }
    }));
  }
}

// 模块加载时订阅一次：输入状态跟着连接走，不属于哪个组件
subscribeRealtimeEvents((event) => {
  const isMessage = event.type === 'message.created';
  if (!isMessage && event.rawType !== 'conversation.typing') {
    return;
  }
  const data = isRecord(event.data) ? event.data : {};
  const conversationId = pickNumber(data, 'conversation_id');
  const userId = isMessage ? pickNumber(data, 'sender_id') ?? pickNumber(data.sender, 'id') : pickNumber(data, 'user_id');
  if (conversationId === null || userId === null) {
    return;
  }
  if (isMessage) {
    // 话已经发出来了，不用等提示自己过期
    stopTyping(conversationId, userId);
  } else if (userId !== useKukeStore.getState().currentUser?.id) {
    startTyping(conversationId, userId, typeof data.name === 'string' && data.name.trim() ? data.name.trim() : `用户 ${userId}`);
  }
});
