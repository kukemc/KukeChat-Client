import type { QueryClient } from '@tanstack/react-query';
import { markConversationRead } from '@/api/messages';
import type { Conversation } from '@/types/api';
import { isKnownSelfConversationId, markSelfSeen } from './selfChatStore';

/**
 * 已读状态「客户端优先」。
 *
 * 打开一个会话的瞬间就应该清掉它的未读数，而不是等「标记已读」请求在服务端落地、
 * 会话列表重新拉回来之后。这里记下每个会话本机已经读到哪条消息：
 * 之后任何一次从服务端拿到的会话数据，只要它的最后一条消息没超过这个位置，未读数一律按 0 处理。
 * 这样即使标记已读的请求还在路上、或者中途有别的刷新先回来了，红点也不会闪回来。
 */
const readUpTo = new Map<number, number>();

function isLocallyRead(conversation: Conversation): boolean {
  const mark = readUpTo.get(conversation.id);
  return mark !== undefined && (conversation.last_message?.id ?? 0) <= mark;
}

/** 给从服务端拿到的会话数据套上本机的已读位置。 */
export function applyLocalReadMarks(conversations: Conversation[]): Conversation[] {
  // 「[有人@我]」是未读消息里的 @，跟着未读数一起清
  return conversations.map((conversation) => ((conversation.unread_count || conversation.mention_pending) && isLocallyRead(conversation) ? { ...conversation, unread_count: 0, mention_pending: null } : conversation));
}

/** 这次运行里本机把这个会话读到了哪条（会话数据里的 my_last_read_message_id 不跟着本机标已读更新，可能是旧的） */
export function localReadMarkOf(conversationId: number): number | null {
  return readUpTo.get(conversationId) ?? null;
}

/**
 * 把一个会话标记为已读：先改本机状态和缓存（界面立刻更新），再通知服务端。
 *
 * @param lastMessageId 已经读到的最后一条消息；还没拿到消息列表时可以不传，会用会话自己的最后一条。
 * @param options.after 通知服务端之前先等它落定（进会话时要先问服务端「已读位置之后有哪些 @我」，见 MessageList）；本机状态照样立刻改。
 */
export function markConversationReadLocally(queryClient: QueryClient, conversationId: number, lastMessageId?: number | null, options: { after?: Promise<unknown> | null } = {}): void {
  const cached = queryClient.getQueryData<Conversation[]>(['conversations'])?.find((conversation) => conversation.id === conversationId);
  const mark = Math.max(lastMessageId ?? 0, cached?.last_message?.id ?? 0, readUpTo.get(conversationId) ?? 0);
  readUpTo.set(conversationId, mark);
  if (cached?.unread_count || cached?.mention_pending) {
    queryClient.setQueryData<Conversation[] | undefined>(['conversations'], (current) => current?.map((conversation) => (
      conversation.id === conversationId ? { ...conversation, unread_count: 0, mention_pending: null } : conversation
    )));
  }
  // 「我的设备」的未读是本机算的（selfChatStore），服务端不按设备记已读，标不标都一样（self-chat.md 3.3）
  if (cached?.type === 'self' || isKnownSelfConversationId(conversationId)) {
    markSelfSeen(mark);
    return;
  }
  // 服务端这一步失败也不回滚：下次打开会话还会再标一次，而把红点弹回来只会让人困惑
  const readId = lastMessageId ?? cached?.last_message?.id ?? null;
  const gate = options.after ?? Promise.resolve();
  void gate.catch(() => undefined).then(() => markConversationRead(conversationId, readId)).then((mentionPending) => {
    // 返回里带着读完之后的 mention_pending：读到的位置后面又来了 @我 的消息时它不是 null，以服务端说的为准
    if (mentionPending) {
      queryClient.setQueryData<Conversation[] | undefined>(['conversations'], (current) => current?.map((conversation) => (
        conversation.id === conversationId && (conversation.mention_pending ?? null) !== mentionPending && (conversation.unread_count ?? 0) > 0 ? { ...conversation, mention_pending: mentionPending } : conversation
      )));
    }
  }).catch(() => undefined);
}
