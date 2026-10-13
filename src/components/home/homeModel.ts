import type { CcwCreator, Conversation, HomeGroup, HomeStats, User } from '@/types/api';

/** 主页两端共用的文案和数字格式。 */

export interface StatDefinition {
  key: keyof HomeStats;
  label: string;
}

export const WALL_STATS: StatDefinition[] = [
  { key: 'registered_users', label: '注册用户' },
  { key: 'messages', label: '累计消息' },
  { key: 'messages_last_7_days', label: '近七天消息' },
  { key: 'groups', label: '群聊总数' }
];

export const MINI_STATS: StatDefinition[] = [
  { key: 'public_groups', label: '公开群聊' },
  { key: 'public_posts', label: '公开动态' },
  { key: 'friendships', label: '好友关系' },
  { key: 'post_likes', label: '动态获赞' }
];

export function compactNumber(value: number): string {
  if (value >= 100000000) return `${(value / 100000000).toFixed(value >= 1000000000 ? 0 : 1)}亿`;
  if (value >= 10000) return `${(value / 10000).toFixed(value >= 100000 ? 0 : 1)}万`;
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
  return new Intl.NumberFormat('zh-CN').format(value);
}

/** 近七天消息占在册消息的百分比。 */
export function weeklyMessageShare(stats: HomeStats): number {
  return stats.messages ? Math.min(100, Math.round((stats.messages_last_7_days / stats.messages) * 100)) : 0;
}

/** 四个小指标里最大的那个，用来给它们画相对长短。 */
export function miniStatMax(stats: HomeStats): number {
  return Math.max(stats.public_groups, stats.public_posts, stats.friendships, stats.post_likes, 1);
}

export function creatorAsUser(creator: CcwCreator): User {
  return creator as User;
}

export function groupTitle(group: Conversation): string {
  return group.display_title?.trim() || group.title?.trim() || `群聊 ${group.id}`;
}

export function groupSummary(group: Conversation): string {
  return group.description?.trim() || group.announcement?.trim() || '欢迎加入这个公开群聊，与社区成员一起交流。';
}

export function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return '夜深了';
  if (hour < 12) return '早上好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

/** 加入这个群要不要先提交申请（审核制，或者要回答问题）。 */
export function groupNeedsRequest(group: HomeGroup): boolean {
  return (group.join_mode === 'approval' || group.join_mode === 'question') && !group.auto_approve;
}

export function groupActionLabel(group: HomeGroup): string {
  if (group.joined) return '进入群聊';
  if (group.join_request_status === 'pending') return '等待审核';
  if (groupNeedsRequest(group)) return '申请加入';
  return '加入群聊';
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
