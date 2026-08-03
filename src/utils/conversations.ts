import type { Conversation, Message } from '@/types/api';

export function isConversationPinnedForMe(conversation: Conversation): boolean {
  return Boolean(conversation.my_pinned);
}

export function conversationActivityTime(conversation: Conversation): number {
  const value = conversation.last_message?.created_at ?? conversation.updated_at ?? conversation.created_at ?? '';
  const time = Date.parse(value);
  return Number.isNaN(time) ? 0 : time;
}

export function sortConversationsByActivity(conversations: Conversation[]): Conversation[] {
  return [...conversations].sort((left, right) => {
    const pinnedDiff = Number(isConversationPinnedForMe(right)) - Number(isConversationPinnedForMe(left));
    if (pinnedDiff !== 0) return pinnedDiff;
    const timeDiff = conversationActivityTime(right) - conversationActivityTime(left);
    if (timeDiff !== 0) return timeDiff;
    return right.id - left.id;
  });
}

export function applyLatestMessageToConversations(
  conversations: Conversation[] | undefined,
  message: Message,
  options: { visibleConversationId?: number | null; incrementUnread?: boolean } = {}
): Conversation[] | undefined {
  if (!conversations) return conversations;
  let found = false;
  const updated = conversations.map((conversation) => {
    if (conversation.id !== message.conversation_id) {
      return conversation;
    }
    found = true;
    const visible = options.visibleConversationId === conversation.id;
    return {
      ...conversation,
      last_message: message,
      unread_count: visible ? 0 : options.incrementUnread ? (conversation.unread_count ?? 0) + 1 : conversation.unread_count,
      updated_at: message.created_at || conversation.updated_at
    };
  });
  return found ? sortConversationsByActivity(updated) : conversations;
}
