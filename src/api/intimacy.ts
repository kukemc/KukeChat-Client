import type { User } from '@/types/api';
import type {
  BadgeDisplay,
  BadgeRef,
  BadgeTier,
  FriendIntimacy,
  FriendIntimacyDetail,
  FriendIntimacyList,
  IntimacyBadgeEvent,
  IntimacyFriendBrief,
  IntimacyHistoryDay,
  IntimacyLevelUpEvent,
  IntimacyRules,
  IntimacyUpdatedEvent,
  SeriesLevelView,
  SeriesView
} from '@/types/intimacy';
import { apiRequest } from './client';
import { isRecord } from './normalizers';

/**
 * 好友亲密度接口（KukeChat-Server/docs/intimacy.md）。旧后端没有这些接口，GET /intimacy/rules 会 404 ——
 * 调用方（components/intimacy/data.ts）把它当成「没有亲密度功能」。
 *
 * 响应在这里整理成 types/intimacy.ts 的形状：缺字段补默认值、形状不对的条目丢掉。数值一律是非负整数。
 */

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function textOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function count(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback;
}

function countOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : null;
}

function tierOf(value: unknown): BadgeTier {
  return value === 2 || value === 3 || value === 4 ? value : 1;
}

function userOf(value: unknown): User | null {
  return isRecord(value) && typeof value.id === 'number' ? value as unknown as User : null;
}

function list<T>(value: unknown, normalize: (item: unknown) => T | null): T[] {
  return Array.isArray(value) ? value.map(normalize).filter((item): item is T => item !== null) : [];
}

export function normalizeBadgeRef(value: unknown): BadgeRef | null {
  if (!isRecord(value) || typeof value.series !== 'string' || typeof value.level !== 'number') {
    return null;
  }
  return {
    series: value.series,
    series_name: text(value.series_name),
    level: count(value.level, 1),
    name: text(value.name, text(value.series_name)),
    tier: tierOf(value.tier),
    icon: text(value.icon),
    unlocked_at: textOrNull(value.unlocked_at)
  };
}

export async function getIntimacyRules(): Promise<IntimacyRules> {
  const source = await apiRequest<unknown>('/intimacy/rules');
  const data = isRecord(source) ? source : {};
  return {
    enabled: data.enabled === true,
    daily_cap: count(data.daily_cap, 40),
    sources: list(data.sources, (item) => (isRecord(item) && typeof item.key === 'string' ? { key: item.key, label: text(item.label, item.key), cap: countOrNull(item.cap), detail: text(item.detail) } : null)),
    levels: list(data.levels, (item) => (isRecord(item) && typeof item.level === 'number' ? { level: count(item.level), name: text(item.name), threshold: count(item.threshold) } : null)),
    series: list(data.series, (item) => {
      if (!isRecord(item) || typeof item.key !== 'string') {
        return null;
      }
      return {
        key: item.key,
        hidden: item.hidden === true,
        name: textOrNull(item.name),
        condition: textOrNull(item.condition),
        icon: text(item.icon),
        levels: list(item.levels, (level) => (isRecord(level) && typeof level.level === 'number' ? { level: count(level.level), tier: tierOf(level.tier), name: textOrNull(level.name), threshold: countOrNull(level.threshold) } : null))
      };
    }),
    total_badges: count(data.total_badges)
  };
}

function normalizeFriend(value: unknown): FriendIntimacy | null {
  if (!isRecord(value)) {
    return null;
  }
  const friend = userOf(value.friend);
  if (!friend) {
    return null;
  }
  return {
    rank: count(value.rank, 0),
    friend,
    intimacy: count(value.intimacy),
    level: count(value.level),
    level_name: text(value.level_name),
    today_gained: count(value.today_gained),
    streak_days: count(value.streak_days),
    badge: normalizeBadgeRef(value.badge),
    badge_count: count(value.badge_count),
    new_badges: count(value.new_badges),
    friends_since: textOrNull(value.friends_since)
  };
}

export async function getIntimacyFriends(): Promise<FriendIntimacyList> {
  const source = await apiRequest<unknown>('/intimacy/friends');
  const data = isRecord(source) ? source : {};
  const items = list(data.items, normalizeFriend);
  return { enabled: data.enabled === true, daily_cap: count(data.daily_cap, 40), items, total: count(data.total, items.length) };
}

function normalizeSeriesLevel(value: unknown): SeriesLevelView | null {
  if (!isRecord(value) || typeof value.level !== 'number') {
    return null;
  }
  return {
    level: count(value.level),
    name: textOrNull(value.name),
    tier: tierOf(value.tier),
    threshold: countOrNull(value.threshold),
    unlocked_at: textOrNull(value.unlocked_at),
    is_new: value.is_new === true
  };
}

function normalizeSeries(value: unknown): SeriesView | null {
  if (!isRecord(value) || typeof value.key !== 'string') {
    return null;
  }
  const levels = list(value.levels, normalizeSeriesLevel);
  return {
    key: value.key,
    hidden: value.hidden === true,
    revealed: value.revealed !== false,
    name: textOrNull(value.name),
    condition: textOrNull(value.condition),
    icon: text(value.icon),
    current: countOrNull(value.current),
    level: count(value.level),
    max_level: count(value.max_level, levels.length),
    next_threshold: countOrNull(value.next_threshold),
    levels
  };
}

function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

export async function getFriendIntimacy(friendId: number): Promise<FriendIntimacyDetail> {
  const data = record(await apiRequest<unknown>(`/intimacy/friends/${friendId}`));
  const friend = userOf(data.friend);
  if (!friend) {
    throw new Error('好友亲密度的数据不完整');
  }
  const level = record(data.level);
  const today = record(data.today);
  const stats = record(data.stats);
  return {
    friend,
    friends_since: textOrNull(data.friends_since),
    friend_days: count(data.friend_days),
    intimacy: count(data.intimacy),
    level: {
      level: count(level.level),
      name: text(level.name),
      threshold: count(level.threshold),
      next_level: countOrNull(level.next_level),
      next_name: textOrNull(level.next_name),
      next_threshold: countOrNull(level.next_threshold)
    },
    rank: countOrNull(data.rank),
    friend_count: count(data.friend_count),
    display: text(data.display, 'auto') as BadgeDisplay,
    badge: normalizeBadgeRef(data.badge),
    today: {
      date: text(today.date),
      gained: count(today.gained),
      counted: count(today.counted),
      cap: count(today.cap, 40),
      chat: count(today.chat),
      gift: count(today.gift),
      streak: count(today.streak),
      birthday: count(today.birthday),
      messages_mine: count(today.messages_mine),
      messages_theirs: count(today.messages_theirs),
      chat_cap: count(today.chat_cap),
      gift_cap: count(today.gift_cap)
    },
    stats: {
      messages_total: count(stats.messages_total),
      messages_mine: count(stats.messages_mine),
      messages_theirs: count(stats.messages_theirs),
      mutual_days: count(stats.mutual_days),
      streak_days: count(stats.streak_days),
      best_streak: count(stats.best_streak),
      night_days: count(stats.night_days),
      dawn_days: count(stats.dawn_days),
      weekend_days: count(stats.weekend_days),
      best_day_messages: count(stats.best_day_messages),
      gift_count: count(stats.gift_count),
      birthday_gifts: count(stats.birthday_gifts)
    },
    badge_count: count(data.badge_count),
    total_badges: count(data.total_badges),
    series: list(data.series, normalizeSeries)
  };
}

export async function setFriendBadge(friendId: number, badge: BadgeDisplay): Promise<{ display: BadgeDisplay; badge: BadgeRef | null }> {
  const data = record(await apiRequest<unknown>(`/intimacy/friends/${friendId}/badge`, { method: 'PUT', body: { badge } }));
  return { display: text(data.display, badge) as BadgeDisplay, badge: normalizeBadgeRef(data.badge) };
}

export async function markFriendBadgesSeen(friendId: number): Promise<number> {
  const data = record(await apiRequest<unknown>(`/intimacy/friends/${friendId}/seen`, { method: 'POST' }));
  return count(data.cleared);
}

export async function getIntimacyHistory(friendId: number, days: number): Promise<IntimacyHistoryDay[]> {
  const data = record(await apiRequest<unknown>(`/intimacy/friends/${friendId}/history?days=${days}`));
  return list(data.items, (item) => (isRecord(item) && typeof item.date === 'string'
    ? { date: item.date, gained: count(item.gained), chat: count(item.chat), gift: count(item.gift), streak: count(item.streak), birthday: count(item.birthday), mutual: item.mutual === true }
    : null));
}

// ---------------------------------------------------------------- 实时事件

function friendBrief(value: unknown): IntimacyFriendBrief | null {
  return isRecord(value) && typeof value.id === 'number' ? { id: value.id, display_name: text(value.display_name), avatar_url: textOrNull(value.avatar_url) } : null;
}

export function normalizeIntimacyUpdated(value: unknown): IntimacyUpdatedEvent | null {
  if (!isRecord(value) || typeof value.friend_id !== 'number') {
    return null;
  }
  return {
    friend_id: value.friend_id,
    intimacy: count(value.intimacy),
    level: count(value.level),
    level_name: text(value.level_name),
    today_gained: count(value.today_gained),
    badge: normalizeBadgeRef(value.badge)
  };
}

export function normalizeIntimacyLevelUp(value: unknown): IntimacyLevelUpEvent | null {
  if (!isRecord(value) || typeof value.friend_id !== 'number') {
    return null;
  }
  return { friend_id: value.friend_id, friend: friendBrief(value.friend), level: count(value.level), level_name: text(value.level_name) };
}

export function normalizeIntimacyBadges(value: unknown): IntimacyBadgeEvent | null {
  if (!isRecord(value) || typeof value.friend_id !== 'number') {
    return null;
  }
  const badges = list(value.badges, normalizeBadgeRef);
  return badges.length > 0 ? { friend_id: value.friend_id, friend: friendBrief(value.friend), badges } : null;
}
