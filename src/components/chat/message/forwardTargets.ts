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

/** 按名称或会话号筛选可以转发到的会话。「我的设备」排最前面：把消息转给自己的另一台设备是最常用的一种（self-chat.md 3.1） */
export function filterForwardTargets(conversations: Conversation[], currentUser: User, query: string): Conversation[] {
  const cleanQuery = query.trim().toLowerCase();
  const matches = conversations.filter((conversation) => {
    const title = conversationDisplayTitle(conversation, currentUser);
    return !cleanQuery || title.toLowerCase().includes(cleanQuery) || String(conversation.id).includes(cleanQuery);
  });
  const self = matches.findIndex((conversation) => conversation.type === 'self');
  return self > 0 ? [matches[self], ...matches.slice(0, self), ...matches.slice(self + 1)] : matches;
}
