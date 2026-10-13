import type { Conversation, User } from '@/types/api';
import { conversationDisplayTitle } from './messageMeta';

export interface ForwardTargetModalProps {
  conversations: Conversation[];
  currentUser: User;
  activeConversationId: number;
  messageIds: number[];
  isPending: boolean;
  onConfirm: (targetConversationId: number, note?: string) => void;
  onClose: () => void;
}

/** 按名称或会话号筛选可以转发到的会话。 */
export function filterForwardTargets(conversations: Conversation[], currentUser: User, query: string): Conversation[] {
  const cleanQuery = query.trim().toLowerCase();
  return conversations.filter((conversation) => {
    const title = conversationDisplayTitle(conversation, currentUser);
    return !cleanQuery || title.toLowerCase().includes(cleanQuery) || String(conversation.id).includes(cleanQuery);
  });
}
