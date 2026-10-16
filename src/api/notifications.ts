import type { UnifiedNotificationList } from '@/types/api';
import { apiRequest } from './client';


export async function getNotifications(limit = 100): Promise<UnifiedNotificationList> {
  return apiRequest<UnifiedNotificationList>(`/notifications?limit=${limit}`);
}

/** 通知中心「看过了」：之后来的通知才算新的、才进角标。服务器同时给本人其他设备推 `notification.seen`。 */
export async function markNotificationsSeen(): Promise<{ seen_at: string }> {
  return apiRequest<{ seen_at: string }>('/notifications/seen', { method: 'POST' });
}

/** 角标该显示的数。老后端没有 new_count 时退回 unread_count。 */
export function notificationNewCount(list: UnifiedNotificationList | undefined): number {
  return list?.new_count ?? list?.unread_count ?? 0;
}

/**
 * 本地把列表标成「看过了」：只改 seen_at 和计数（动态类仍按各自的已读标记），条目上的 unread 先留着，
 * 这样正开着的通知中心里刚到的几条还能高亮到下次刷新。
 */
export function applyNotificationsSeen(list: UnifiedNotificationList | undefined, seenAt: string): UnifiedNotificationList | undefined {
  if (!list) return list;
  if (list.seen_at && Date.parse(list.seen_at) >= Date.parse(seenAt)) return list;
  const postUnread = list.items.filter((item) => item.category === 'post' && item.unread).length;
  return { ...list, seen_at: seenAt, new_count: postUnread, unread_count: postUnread };
}

/** 有没有 seen_at 之后来、还没「看过」的非动态通知（决定打开通知中心时要不要调 seen） */
export function hasUnseenNotifications(list: UnifiedNotificationList | undefined): boolean {
  if (!list) return false;
  const seenAt = list.seen_at ? Date.parse(list.seen_at) : null;
  return list.items.some((item) => item.category !== 'post' && item.unread && (seenAt === null || Date.parse(item.time) > seenAt));
}
