import { getDisplayName } from '@/components/ui/Avatar';
import { parseApiDate } from '@/utils/dateTime';
import type { Conversation, FriendRequest, Friendship, GroupJoinRequest, UnifiedNotification, UnifiedNotificationCategory, User } from '@/types/api';

/** 联系人页用到的纯函数：取对象、搜索匹配、状态文案、通知的去向。桌面端和移动端共用。 */

export type NotificationFilter = UnifiedNotificationCategory;

export function friendUser(friendship: Friendship): User | null | undefined {
  return friendship.friend ?? friendship.user;
}

export function conversationTitle(conversation: Conversation): string {
  return conversation.display_title?.trim() || conversation.my_remark?.trim() || conversation.title?.trim() || `群聊 ${conversation.id}`;
}

export function groupRequestTitle(request: GroupJoinRequest): string {
  return request.conversation_display_title?.trim() || request.conversation_title?.trim() || `群聊 ${request.conversation_id}`;
}

export function contactInitial(user?: User | null): string {
  const name = getDisplayName(user, user?.username || '#').trim();
  const first = name.charAt(0).toUpperCase();
  return /^[A-Z]$/.test(first) ? first : '#';
}

export function matchesContactUser(user: User | null | undefined, keyword: string): boolean {
  if (!keyword) {
    return true;
  }
  const text = [getDisplayName(user), user?.username, user?.nickname, user?.email, user?.bio, user?.id].join(' ').toLowerCase();
  return text.includes(keyword);
}

export function matchesGroupConversation(conversation: Conversation, keyword: string): boolean {
  if (!keyword) {
    return true;
  }
  const text = [conversationTitle(conversation), conversation.title, conversation.display_title, conversation.description, conversation.announcement, conversation.category, conversation.id].join(' ').toLowerCase();
  return text.includes(keyword);
}

export function formatFriendRequestStatus(status: FriendRequest['status']): string {
  if (status === 'pending') {
    return '等待验证';
  }
  if (status === 'accepted') {
    return '已通过';
  }
  return '已拒绝';
}

export function formatGroupRequestStatus(status: GroupJoinRequest['status']): string {
  if (status === 'pending') {
    return '等待审核';
  }
  if (status === 'accepted') {
    return '已通过';
  }
  return '已拒绝';
}

function groupJoinRequestTime(request: GroupJoinRequest): number {
  const parsed = parseApiDate(request.created_at || request.updated_at)?.getTime() ?? Number.NaN;
  return Number.isFinite(parsed) ? parsed : request.id;
}

export function sortGroupJoinRequestsNewestFirst(requests: GroupJoinRequest[]): GroupJoinRequest[] {
  return [...requests].sort((left, right) => groupJoinRequestTime(right) - groupJoinRequestTime(left) || right.id - left.id);
}

export function formatNotificationTime(value: string): string {
  // 服务端的时间不带时区、内容是 UTC：直接 new Date 会把刚到的通知算成「8 小时前」
  const time = parseApiDate(value);
  if (!time) {
    return '';
  }
  const now = Date.now();
  const diff = Math.max(0, now - time.getTime());
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  return time.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
}

export const NOTIFICATION_CATEGORY_LABELS: Record<NotificationFilter, string> = { all: '全部', friend: '好友', group: '群聊', post: '动态', interact: '互动', system: '系统' };

/** 通知左边放谁的头像：系统和群通知用群头像，其余用触发人的。 */
export function notificationAvatarSource(notification: UnifiedNotification): { user?: User | null; label?: string | null; avatarUrl?: string | null } {
  const useConversationAvatar = notification.category === 'system' || notification.category === 'group' || (!notification.actor && !!notification.conversation_avatar_url);
  if (useConversationAvatar) {
    return {
      label: notification.conversation_title || '群聊',
      avatarUrl: notification.conversation_avatar_url
    };
  }
  if (notification.actor) {
    return { user: notification.actor };
  }
  return {
    label: notification.conversation_title || notification.title || '通知',
    avatarUrl: notification.conversation_avatar_url
  };
}

export type NotificationTarget =
  | { kind: 'penalty' }
  | { kind: 'reports' }
  | { kind: 'level' }
  | { kind: 'post'; id: number }
  | { kind: 'teamup'; id: number }
  | { kind: 'bot'; id: number }
  | { kind: 'conversation'; id: number };

/** 点一条通知会去哪。返回 null 表示这条通知点不动。处罚通知点开直接看处罚详情，可以在那里申诉。 */
export function notificationTarget(notification: UnifiedNotification): NotificationTarget | null {
  if (notification.type === 'moderation_penalty') {
    return { kind: 'penalty' };
  }
  // 账号等级的升级通知（docs/account-level.md 3.6）：去等级页
  if (notification.type === 'account_level') {
    return { kind: 'level' };
  }
  // 风纪 v2 三期（docs/jury-v2.md 3.7.1）：申诉结果去「处罚与申诉」，举报人复议的结果去「举报记录」
  if (notification.type === 'jury') {
    const kind = notification.payload?.kind;
    if (kind === 'appeal_result') return { kind: 'penalty' };
    if (kind === 'reconsider_result') return { kind: 'reports' };
  }
  if (notification.action === 'open_post' && notification.post_id) {
    return { kind: 'post', id: notification.post_id };
  }
  const profileId = notification.payload?.profile_id;
  if (notification.action === 'open_teamup' && typeof profileId === 'number' && profileId) {
    return { kind: 'teamup', id: profileId };
  }
  const botId = notification.payload?.bot_id;
  if (notification.action === 'open_bot' && typeof botId === 'number' && botId) {
    return { kind: 'bot', id: botId };
  }
  if (notification.action === 'open_conversation' && notification.conversation_id) {
    return { kind: 'conversation', id: notification.conversation_id };
  }
  return null;
}
