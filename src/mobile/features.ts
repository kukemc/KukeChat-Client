import type { IconName } from '@/components/ui/Icon';

export type MobileSortableFeatureId = 'contacts' | 'posts' | 'announcement' | 'teamup' | 'tasks' | 'bots' | 'home' | 'favorites' | 'shop';
export type MobileFeatureId = MobileSortableFeatureId | 'space';

export interface MobileFeatureDefinition {
  id: MobileFeatureId;
  label: string;
  detail: string;
  icon: IconName;
}

const MOBILE_SPACE_FEATURE: MobileFeatureDefinition = { id: 'space', label: '空间', detail: '功能入口、收藏和内容管理', icon: 'profile' };

export const MOBILE_FEATURES: Array<MobileFeatureDefinition & { id: MobileSortableFeatureId }> = [
  { id: 'contacts', label: '联系人', detail: '好友、申请和会话入口', icon: 'contacts' },
  { id: 'posts', label: '动态', detail: '好友近况与公开分享', icon: 'feed' },
  { id: 'announcement', label: '公告', detail: '查看公告列表和公告详情', icon: 'announcement' },
  { id: 'teamup', label: '组队中心', detail: '发布名片、寻找搭档', icon: 'users' },
  { id: 'tasks', label: '任务系统', detail: '任务看板、分组和动态', icon: 'checkSquare' },
  { id: 'bots', label: '机器人', detail: '查看机器人和我的机器人', icon: 'bot' },
  { id: 'home', label: '主页', detail: '社区数据、热门群聊与大佬入住', icon: 'home' },
  { id: 'favorites', label: '收藏', detail: '收藏消息、图片和转发记录', icon: 'star' },
  { id: 'shop', label: '商店', detail: '用 CCW 金币换气泡和头像框', icon: 'store' }
];

export const DEFAULT_MOBILE_FEATURE_ORDER: MobileSortableFeatureId[] = MOBILE_FEATURES.map((item) => item.id);

const mobileFeatureIds = new Set<MobileSortableFeatureId>(DEFAULT_MOBILE_FEATURE_ORDER);

export function isMobileFeatureId(value: unknown): value is MobileSortableFeatureId {
  return typeof value === 'string' && mobileFeatureIds.has(value as MobileSortableFeatureId);
}

export function getMobileFeatureDefinition(id: MobileFeatureId): MobileFeatureDefinition {
  if (id === 'space') {
    return MOBILE_SPACE_FEATURE;
  }
  return MOBILE_FEATURES.find((item) => item.id === id) ?? MOBILE_FEATURES[0];
}

export function normalizeMobileFeatureOrder(value: unknown): MobileSortableFeatureId[] {
  const ordered = Array.isArray(value) ? value.filter(isMobileFeatureId) : [];
  const deduped: MobileSortableFeatureId[] = [];
  for (const item of ordered) {
    if (!deduped.includes(item)) {
      deduped.push(item);
    }
  }
  for (const item of DEFAULT_MOBILE_FEATURE_ORDER) {
    if (!deduped.includes(item)) {
      deduped.push(item);
    }
  }

  return deduped;
}

/**
 * hidden：现在不该出现的功能（比如当前连接的服务端没有商店）。它们仍然留在用户存下来的顺序里，
 * 只是这一刻不占位置：不进底栏，也不进空间页的入口。
 */
export function getVisibleMobileFeatureIds(order: MobileFeatureId[], hidden?: ReadonlySet<MobileSortableFeatureId>): MobileSortableFeatureId[] {
  const normalized = normalizeMobileFeatureOrder(order);
  return hidden && hidden.size > 0 ? normalized.filter((item) => !hidden.has(item)) : normalized;
}

export function getMobileBottomFeatureIds(order: MobileFeatureId[], hidden?: ReadonlySet<MobileSortableFeatureId>): MobileSortableFeatureId[] {
  return getVisibleMobileFeatureIds(order, hidden).slice(0, 2);
}

export function getMobileSpaceFeatureIds(order: MobileFeatureId[], hidden?: ReadonlySet<MobileSortableFeatureId>): MobileSortableFeatureId[] {
  return getVisibleMobileFeatureIds(order, hidden).slice(2);
}
