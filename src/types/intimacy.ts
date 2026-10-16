import type { User } from '@/types/api';

/**
 * 好友亲密度与好友成就（契约见 KukeChat-Server/docs/intimacy.md）。
 * api/intimacy.ts 把响应整理成这里的形状：缺字段补默认值、形状不对的条目丢掉。
 */

/** 徽章外框：1 铜、2 银、3 金、4 彩虹 */
export type BadgeTier = 1 | 2 | 3 | 4;

/** 挂在好友名字旁：auto 自动、none 不挂、否则是系列的 key */
export type BadgeDisplay = 'auto' | 'none' | (string & {});

export interface BadgeRef {
  series: string;
  series_name: string;
  level: number;
  name: string;
  tier: BadgeTier;
  icon: string;
  unlocked_at: string | null;
}

export interface IntimacySource {
  key: 'chat' | 'gift' | 'streak' | 'birthday' | (string & {});
  label: string;
  /** null：不占每日上限（生日礼物） */
  cap: number | null;
  detail: string;
}

export interface IntimacyLevelRule {
  level: number;
  name: string;
  threshold: number;
}

export interface SeriesLevelRule {
  level: number;
  tier: BadgeTier;
  /** 隐藏成就没揭晓时为 null */
  name: string | null;
  threshold: number | null;
}

export interface SeriesRule {
  key: string;
  hidden: boolean;
  name: string | null;
  condition: string | null;
  icon: string;
  levels: SeriesLevelRule[];
}

export interface IntimacyRules {
  enabled: boolean;
  daily_cap: number;
  sources: IntimacySource[];
  levels: IntimacyLevelRule[];
  series: SeriesRule[];
  total_badges: number;
}

/** GET /intimacy/friends 的一项（好友亲密榜，也是好友名字旁徽章的数据源） */
export interface FriendIntimacy {
  rank: number;
  friend: User;
  intimacy: number;
  level: number;
  level_name: string;
  today_gained: number;
  streak_days: number;
  badge: BadgeRef | null;
  badge_count: number;
  new_badges: number;
  friends_since: string | null;
}

export interface FriendIntimacyList {
  enabled: boolean;
  daily_cap: number;
  items: FriendIntimacy[];
  total: number;
}

export interface IntimacyLevelView {
  level: number;
  name: string;
  threshold: number;
  next_level: number | null;
  next_name: string | null;
  next_threshold: number | null;
}

export interface IntimacyToday {
  date: string;
  gained: number;
  /** 计入每日上限的部分（不含生日加成） */
  counted: number;
  cap: number;
  chat: number;
  gift: number;
  streak: number;
  birthday: number;
  messages_mine: number;
  messages_theirs: number;
  chat_cap: number;
  gift_cap: number;
}

export interface IntimacyStats {
  messages_total: number;
  messages_mine: number;
  messages_theirs: number;
  mutual_days: number;
  streak_days: number;
  best_streak: number;
  night_days: number;
  dawn_days: number;
  weekend_days: number;
  best_day_messages: number;
  gift_count: number;
  birthday_gifts: number;
}

export interface SeriesLevelView {
  level: number;
  name: string | null;
  tier: BadgeTier;
  threshold: number | null;
  unlocked_at: string | null;
  is_new: boolean;
}

export interface SeriesView {
  key: string;
  hidden: boolean;
  /** 隐藏成就解锁了第一级才揭晓；没揭晓时名字、条件、门槛都是 null */
  revealed: boolean;
  name: string | null;
  /** 带 {n} 占位，展示时换成门槛 */
  condition: string | null;
  icon: string;
  current: number | null;
  level: number;
  max_level: number;
  next_threshold: number | null;
  levels: SeriesLevelView[];
}

export interface FriendIntimacyDetail {
  friend: User;
  friends_since: string | null;
  friend_days: number;
  intimacy: number;
  level: IntimacyLevelView;
  rank: number | null;
  friend_count: number;
  display: BadgeDisplay;
  badge: BadgeRef | null;
  today: IntimacyToday;
  stats: IntimacyStats;
  badge_count: number;
  total_badges: number;
  series: SeriesView[];
}

export interface IntimacyHistoryDay {
  date: string;
  gained: number;
  chat: number;
  gift: number;
  streak: number;
  birthday: number;
  mutual: boolean;
}

/** 实时事件 intimacy.updated */
export interface IntimacyUpdatedEvent {
  friend_id: number;
  intimacy: number;
  level: number;
  level_name: string;
  today_gained: number;
  badge: BadgeRef | null;
}

export interface IntimacyFriendBrief {
  id: number;
  display_name: string;
  avatar_url: string | null;
}

/** 实时事件 intimacy.level.up */
export interface IntimacyLevelUpEvent {
  friend_id: number;
  friend: IntimacyFriendBrief | null;
  level: number;
  level_name: string;
}

/** 实时事件 intimacy.badge.unlocked */
export interface IntimacyBadgeEvent {
  friend_id: number;
  friend: IntimacyFriendBrief | null;
  badges: BadgeRef[];
}
