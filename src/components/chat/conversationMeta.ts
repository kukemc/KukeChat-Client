import { getDisplayName } from '@/components/ui/Avatar';
import type { Conversation, MessageSetting, User } from '@/types/api';
import { isConversationPinnedForMe } from '@/utils/conversations';
import { giftPreview } from '@/utils/gift';
import { redPacketGreeting, redPacketPreview } from '@/utils/redPacket';

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

export interface ConversationPrefix {
  kind: 'mention' | 'red-packet' | 'todo';
  text: string;
}

/**
 * 最后一条消息预览前面的提示前缀，按重要性排：@ 提示 > 有红包（以后有「草稿」排在最后）。免打扰的会话也有。
 * @ 提示同一个会话只出一个，点名优先于 @全体成员。画它们的是 ConversationPrefixes。
 */
export function conversationPrefixes(conversation: Conversation): ConversationPrefix[] {
  const prefixes: ConversationPrefix[] = [];
  if (conversation.mention_pending === 'all' && isTodoReminder(conversation)) {
    // 群待办的提醒走 @全体成员 链路：这里换成更具体的「[群待办]」，预览正文里的同名前缀由 lastMessagePreview 去掉
    prefixes.push({ kind: 'todo', text: '[群待办]' });
  } else if (conversation.mention_pending === 'me') {
    prefixes.push({ kind: 'mention', text: '[有人@我]' });
  } else if (conversation.mention_pending === 'all') {
    prefixes.push({ kind: 'mention', text: '[@全体成员]' });
  }
  if (conversation.red_packet_pending) {
    prefixes.push({ kind: 'red-packet', text: '[有红包]' });
  }
  return prefixes;
}

/** 最后一条是不是群待办的提醒消息（metadata.group_todo，content 是「[群待办] 摘要」） */
function isTodoReminder(conversation: Conversation): boolean {
  const todo = conversation.last_message?.metadata?.group_todo;
  return typeof todo === 'object' && todo !== null && !conversation.last_message?.recalled_at;
}

const TODO_PREFIX = '[群待办]';

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
  const redPacket = redPacketPreview(message);
  if (redPacket) {
    // 有能领的红包时列表在预览前面另画一个红色的「[有红包]」（conversationPrefixes），这里只接祝福语，免得写成「[有红包] [红包] …」
    return `${senderPrefix}${conversation.red_packet_pending ? redPacketGreeting(message) : redPacket}`;
  }
  // 礼物：「[礼物] 送给 阿夸 蛋糕 ×3」。content 是给旧客户端的兜底文字，不直接显示
  const gift = giftPreview(message);
  if (gift) {
    return `${senderPrefix}${gift}`;
  }

  // 待办提醒：列表上已经单独画了「[群待办]」前缀，预览里去掉重复的那一段；已读（没有前缀）时保留原文
  if (conversation.mention_pending === 'all' && isTodoReminder(conversation) && message.content.startsWith(TODO_PREFIX)) {
    return `${senderPrefix}${message.content.slice(TODO_PREFIX.length).trim() || '群待办'}`;
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
