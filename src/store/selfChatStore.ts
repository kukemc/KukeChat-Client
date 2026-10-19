import { create } from 'zustand';
import type { Conversation } from '@/types/api';

/*
 * 「我的设备」会话的本地未读（KukeChat-Server/docs/self-chat.md 3.3）。
 *
 * 服务端不给这个会话算未读（未读按人记，而消息都是自己发的，unread_count 恒为 0），客户端自己算：
 * 另一类设备（手机）发来的、本机还没看过的消息条数。记在本机，按账号分开，重启后还在：
 *   lastSeenId   本机看到的最后一条（打开会话时更新）
 *   countedUpTo  已经数过的最后一条：实时推送来一条数一条，重连后拉一页补数，两边不重复算
 *   unread       角标上的数
 */

interface SelfChatPersisted {
  conversationId: number | null;
  lastSeenId: number;
  countedUpTo: number;
  unread: number;
}

interface SelfChatState extends SelfChatPersisted {
  userId: number | null;
}

const EMPTY: SelfChatPersisted = { conversationId: null, lastSeenId: 0, countedUpTo: 0, unread: 0 };

function storageKey(userId: number): string {
  return `kukechat:self-chat:v1:${userId}`;
}

function load(userId: number): SelfChatPersisted {
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) {
      return EMPTY;
    }
    const value = JSON.parse(raw) as Partial<SelfChatPersisted>;
    const number = (input: unknown): number => (typeof input === 'number' && Number.isFinite(input) && input > 0 ? Math.floor(input) : 0);
    return {
      conversationId: number(value.conversationId) || null,
      lastSeenId: number(value.lastSeenId),
      countedUpTo: number(value.countedUpTo),
      unread: number(value.unread)
    };
  } catch {
    return EMPTY;
  }
}

function save(state: SelfChatState): void {
  if (state.userId === null) {
    return;
  }
  try {
    const value: SelfChatPersisted = { conversationId: state.conversationId, lastSeenId: state.lastSeenId, countedUpTo: state.countedUpTo, unread: state.unread };
    window.localStorage.setItem(storageKey(state.userId), JSON.stringify(value));
  } catch {
    // 存不下就只在这次运行里记着
  }
}

export const useSelfChatStore = create<SelfChatState>(() => ({ userId: null, ...EMPTY }));

function update(patch: Partial<SelfChatPersisted>): void {
  const current = useSelfChatStore.getState();
  const next = { ...current, ...patch };
  if (next.conversationId === current.conversationId && next.lastSeenId === current.lastSeenId && next.countedUpTo === current.countedUpTo && next.unread === current.unread) {
    return;
  }
  useSelfChatStore.setState(patch);
  save(next);
}

/** 换了账号（或者第一次用）时读出这个账号在本机记的状态 */
export function bindSelfChatUser(userId: number | null): void {
  if (useSelfChatStore.getState().userId !== userId) {
    useSelfChatStore.setState({ userId, ...(userId === null ? EMPTY : load(userId)) });
  }
}

export function selfChatSnapshot(): SelfChatState {
  return useSelfChatStore.getState();
}

/** 记下这个账号的「我的设备」会话 id（每个人不同、各端相同；只用来在推送里认出它） */
export function noteSelfConversationId(conversationId: number): void {
  if (useSelfChatStore.getState().conversationId !== conversationId) {
    update({ conversationId });
  }
}

export function isKnownSelfConversationId(conversationId: number | null | undefined): boolean {
  return conversationId !== null && conversationId !== undefined && useSelfChatStore.getState().conversationId === conversationId;
}

/** 本机看到了这一条（会话开着、消息在眼前）：未读清零 */
export function markSelfSeen(messageId: number | null | undefined): void {
  const state = useSelfChatStore.getState();
  const id = Math.max(messageId ?? 0, state.lastSeenId);
  update({ lastSeenId: id, countedUpTo: Math.max(state.countedUpTo, id), unread: 0 });
}

/** 推送来了一条另一类设备发的、会话没开着：数一条（已经数过的不重复数） */
export function bumpSelfUnread(messageId: number): boolean {
  const state = useSelfChatStore.getState();
  if (messageId <= state.countedUpTo || messageId <= state.lastSeenId) {
    return false;
  }
  update({ countedUpTo: messageId, unread: state.unread + 1 });
  return true;
}

/** 这类设备自己发的：不算未读，但数过的位置往后挪，补数时不用再看它 */
export function noteSelfOwnMessage(messageId: number): void {
  const state = useSelfChatStore.getState();
  if (messageId > state.countedUpTo) {
    update({ countedUpTo: messageId });
  }
}

/** 补数的结果：拉回来一页，lastSeenId 之后另一类设备发的有 unread 条，数到了 newestId */
export function applySelfRecount(unread: number, newestId: number): void {
  const state = useSelfChatStore.getState();
  if (newestId <= state.countedUpTo) {
    return;
  }
  update({ unread, countedUpTo: newestId });
}

/** 本机第一次见到这个会话：以前的消息不算未读，从现在开始数 */
export function initSelfBaseline(lastMessageId: number): void {
  update({ lastSeenId: lastMessageId, countedUpTo: lastMessageId, unread: 0 });
}

/** 给从服务端拿到的会话列表套上本机算的未读数（服务端给的恒为 0） */
export function applySelfUnread<T extends Pick<Conversation, 'id' | 'type' | 'unread_count'>>(conversations: T[]): T[] {
  const { unread } = useSelfChatStore.getState();
  return conversations.map((conversation) => (conversation.type === 'self' && (conversation.unread_count ?? 0) !== unread ? { ...conversation, unread_count: unread } : conversation));
}
