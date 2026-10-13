import type { RefObject } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getUserOnlineStatus } from '@/api/users';
import { ccwStudentProfileUrl } from '@/config';
import type { User } from '@/types/api';
import { userPresenceLabel } from '@/utils/presence';
import { getDisplayName } from './Avatar';
import type { ProfileAction } from './MobileUserProfilePage';

export interface UserCardProps {
  user?: User | null;
  /** 卡片贴着哪个点弹出，坐标相对 containerRef */
  anchor?: { left: number; top: number } | null;
  containerRef?: RefObject<HTMLElement | null>;
  /** 拿不到用户资料时显示的名字 */
  label?: string;
  /** 卡片底部的主操作（发消息、加好友……），由打开卡片的地方按关系和权限决定 */
  action?: ProfileAction;
  onClose: () => void;
}

/** 资料卡要显示的在线状态和几个派生值。两种布局的卡片共用。 */
export function useUserCardData(user: User | null | undefined, label?: string) {
  const userId = user?.id;
  const onlineQuery = useQuery({
    queryKey: ['user-online', userId],
    queryFn: () => getUserOnlineStatus(userId ?? 0),
    enabled: Boolean(userId),
    staleTime: 15_000,
    retry: false
  });
  const isBot = Boolean(user?.is_bot);
  const online = Boolean(onlineQuery.data?.online);

  return {
    name: getDisplayName(user, label || '用户'),
    isBot,
    online,
    statusLabel: isBot ? (online ? '机器人在线' : '机器人离线') : userPresenceLabel(user, onlineQuery.data),
    ccwProfileUrl: user?.ccw_student_oid ? ccwStudentProfileUrl(user.ccw_student_oid) : null
  };
}

export function formatCompactCount(value?: number | null): string {
  if (typeof value !== 'number') {
    return '-';
  }
  return Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}
