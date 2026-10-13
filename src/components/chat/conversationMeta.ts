import { getDisplayName } from '@/components/ui/Avatar';
import type { Conversation, MessageSetting, User } from '@/types/api';
import { isConversationPinnedForMe } from '@/utils/conversations';

/** 会话列表用到的纯函数：标题、最后一条消息的预览、搜索匹配、消息提醒设置。桌面端和移动端的列表共用。 */

export function imageCount(conversation: Conversation): number {
  const images = conversation.last_message?.metadata?.images;
  return Array.isArray(images) ? images.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).length : 0;
}

export function myMembership(conversation: Conversation, currentUser: User) {
  return conversation.members?.find((member) => member.user_id === currentUser.id || member.user?.id === currentUser.id);
}

export function isConversationPinned(conversation: Conversation, currentUser: User, pinnedOverrides: Record<number, boolean>): boolean {
  return pinnedOverrides[conversation.id] ?? (isConversationPinnedForMe(conversation) || Boolean(myMembership(conversation, currentUser)?.pinned));
}

export function conversationTitle(conversation: Conversation, currentUser: User): string {
  if (conversation.type === 'group') {
    const title = conversation.display_title?.trim() || conversation.title || '未命名群聊';
    return `${title} (${conversation.member_count ?? 0})`;
  }

  const directMember = conversation.members?.find((member) => member.user_id !== currentUser.id)?.user;
  return conversation.display_title?.trim() || getDisplayName(conversation.direct_user ?? directMember, conversation.title || '私聊');
}

export function lastMessagePreview(conversation: Conversation): string {
  const message = conversation.last_message;
  if (!message) {
    return conversation.type === 'group' ? '群聊已创建' : '开始聊天吧';
  }
  if (message.recalled_at) {
    return '消息已撤回';
  }
  const senderPrefix = conversation.type === 'group'
    ? `${message.sender_display_name || message.sender?.nickname || message.sender?.username || '有人'}: `
    : '';
  if (message.type === 'image') {
    return `${senderPrefix}[图片]`;
  }
  if (message.type === 'voice') {
    return `${senderPrefix}[语音]`;
  }
  if (message.type === 'system') {
    return message.content || '系统消息';
  }
  if (message.type === 'forward_bundle') {
    return `${senderPrefix}[聊天记录]`;
  }

  const images = imageCount(conversation);
  if (images > 0) {
    const label = images > 1 ? `[图片] ${images}张图片` : '[图片]';
    return message.content ? `${senderPrefix}${message.content} ${label}` : `${senderPrefix}${label}`;
  }

  return `${senderPrefix}${message.content || '新消息'}`;
}

export function fieldText(value?: string | number | null): string {
  return String(value ?? '').trim().toLowerCase();
}

export function matchesConversation(conversation: Conversation, currentUser: User, keyword: string): boolean {
  const peer = conversation.direct_user ?? conversation.members?.find((member) => member.user_id !== currentUser.id)?.user;
  const text = [
    conversation.id,
    conversationTitle(conversation, currentUser),
    conversation.title,
    conversation.description,
    conversation.category,
    peer?.id,
    peer?.username,
    peer?.nickname,
    peer?.email,
    peer?.bio
  ].map(fieldText).join(' ');
  return text.includes(keyword);
}

export function currentMessageSetting(conversation: Conversation): MessageSetting {
  if (conversation.my_message_setting === 'ignore') {
    return 'ignore';
  }
  if (conversation.my_do_not_disturb || conversation.my_message_setting === 'silent') {
    return 'silent';
  }
  return conversation.my_message_setting ?? 'notify';
}

export function messageSettingLabel(setting: MessageSetting): string {
  if (setting === 'ignore') {
    return '屏蔽消息';
  }
  if (setting === 'silent') {
    return '接收不提醒';
  }
  return '接收并提醒';
}

export function messageSettingPayload(setting: MessageSetting): { message_setting: MessageSetting; do_not_disturb: boolean } {
  if (setting === 'ignore') {
    return { message_setting: 'ignore', do_not_disturb: true };
  }
  if (setting === 'silent') {
    return { message_setting: 'silent', do_not_disturb: true };
  }
  return { message_setting: 'notify', do_not_disturb: false };
}
