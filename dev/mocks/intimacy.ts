/**
 * 好友亲密度的假后端（dev/intimacy-harness 用）。成就目录 intimacy-catalog.json 是从后端 app/services/intimacy_catalog.py 导出的，
 * 和真的一致；每个好友的累计数据写在 FRIENDS 里，徽章按和后端一样的规则（统计值跨过门槛就解锁）算出来。
 * 后端改了目录要重新导出：见 dev/intimacy-harness.tsx 顶上的说明。
 */
import { people } from '../posts-harness.mock';
import catalog from './intimacy-catalog.json';
import type { User } from '@/types/api';

interface CatalogLevel { level: number; name: string; tier: number; threshold: number }
interface CatalogSeries { key: string; name: string; condition: string; stat: string; icon: string; hidden: boolean; levels: CatalogLevel[] }

const SERIES = catalog.series as CatalogSeries[];
const LEVELS = catalog.levels as Array<{ level: number; name: string; threshold: number }>;
const DAY = 86_400_000;
const NOW = Date.now();

interface MockFriend {
  user: User;
  intimacy: number;
  todayChat: number;
  todayGift: number;
  todayStreak: number;
  todayBirthday: number;
  messagesMine: number;
  messagesTheirs: number;
  friendDays: number;
  stats: Record<string, number>;
  /** 挂在名字旁：auto / none / 系列 key */
  display: string;
  /** 还没看过的徽章（系列.级别） */
  unseen: Set<string>;
}

function stats(values: Partial<Record<string, number>>): Record<string, number> {
  const base: Record<string, number> = {
    messages_total: 0, mutual_days: 0, best_streak: 0, night_days: 0, dawn_days: 0, best_day_messages: 0, best_night_messages: 0,
    weekend_days: 0, gift_count: 0, birthday_gifts: 0, intimacy: 0, friend_days: 0, newyear_days: 0, sunmoon_days: 0, series_count: 0, streak_days: 0
  };
  return { ...base, ...values } as Record<string, number>;
}

const user = (id: number): User => people.find((item) => item.id === id) ?? people[1];

export const FRIENDS: MockFriend[] = [
  {
    user: user(2), intimacy: 3260, todayChat: 18, todayGift: 8, todayStreak: 3, todayBirthday: 0, messagesMine: 46, messagesTheirs: 39, friendDays: 412, display: 'auto',
    stats: stats({ messages_total: 8420, mutual_days: 186, best_streak: 41, streak_days: 12, night_days: 33, dawn_days: 4, best_day_messages: 1032, best_night_messages: 120, weekend_days: 58, gift_count: 23, birthday_gifts: 1, newyear_days: 1, sunmoon_days: 2 }),
    unseen: new Set(['rainboom.1', 'chatter.3'])
  },
  {
    user: user(3), intimacy: 860, todayChat: 6, todayGift: 0, todayStreak: 0, todayBirthday: 30, messagesMine: 3, messagesTheirs: 2, friendDays: 95, display: 'night',
    stats: stats({ messages_total: 1680, mutual_days: 44, best_streak: 9, streak_days: 2, night_days: 12, best_day_messages: 260, best_night_messages: 80, weekend_days: 9, gift_count: 4, birthday_gifts: 1 }),
    unseen: new Set(['birthday.1'])
  },
  {
    user: user(4), intimacy: 140, todayChat: 0, todayGift: 0, todayStreak: 0, todayBirthday: 0, messagesMine: 0, messagesTheirs: 0, friendDays: 33, display: 'auto',
    stats: stats({ messages_total: 210, mutual_days: 8, best_streak: 3, best_day_messages: 64 }),
    unseen: new Set()
  },
  {
    user: user(6), intimacy: 12, todayChat: 6, todayGift: 0, todayStreak: 0, todayBirthday: 0, messagesMine: 1, messagesTheirs: 1, friendDays: 2, display: 'auto',
    stats: stats({ messages_total: 9, mutual_days: 2 }),
    unseen: new Set()
  },
  {
    user: user(5), intimacy: 0, todayChat: 0, todayGift: 0, todayStreak: 0, todayBirthday: 0, messagesMine: 0, messagesTheirs: 0, friendDays: 1, display: 'auto',
    stats: stats({}),
    unseen: new Set()
  }
];

function levelOf(intimacy: number): { level: number; name: string; threshold: number } {
  return [...LEVELS].reverse().find((item) => intimacy >= item.threshold) ?? LEVELS[0];
}

function reached(series: CatalogSeries, value: number): number {
  return series.levels.filter((level) => value >= level.threshold).length;
}

/** 和后端 _sync_badges 一样：先算台面上的系列，再按「集齐了几个」算和谐之元 */
function unlocked(friend: MockFriend): Map<string, number> {
  const values: Record<string, number> = { ...friend.stats, intimacy: friend.intimacy, friend_days: friend.friendDays };
  const result = new Map<string, number>();
  for (const series of SERIES.filter((item) => item.stat !== 'series_count')) {
    const top = reached(series, values[series.stat] ?? 0);
    if (top > 0) {
      result.set(series.key, top);
    }
  }
  const visible = SERIES.filter((item) => !item.hidden && result.has(item.key)).length;
  for (const series of SERIES.filter((item) => item.stat === 'series_count')) {
    const top = reached(series, visible);
    if (top > 0) {
      result.set(series.key, top);
    }
  }
  return result;
}

/** 解锁时间：越高的级别越近 */
function unlockedAt(series: CatalogSeries, level: number, friend: MockFriend): string {
  const offset = (series.levels.length - level + 1) * 9 + SERIES.indexOf(series) * 3;
  return new Date(NOW - Math.min(offset, friend.friendDays) * DAY).toISOString();
}

function ref(series: CatalogSeries, level: number, friend: MockFriend): Record<string, unknown> {
  const item = series.levels[level - 1];
  return { series: series.key, series_name: series.name, level, name: item.name, tier: item.tier, icon: series.icon, unlocked_at: unlockedAt(series, level, friend) };
}

function displayBadge(friend: MockFriend): Record<string, unknown> | null {
  if (friend.display === 'none') {
    return null;
  }
  const owned = unlocked(friend);
  if (friend.display !== 'auto' && owned.has(friend.display)) {
    const series = SERIES.find((item) => item.key === friend.display) as CatalogSeries;
    return ref(series, owned.get(series.key) as number, friend);
  }
  let best: { series: CatalogSeries; level: number; key: [number, string] } | null = null;
  for (const [key, top] of owned) {
    const series = SERIES.find((item) => item.key === key) as CatalogSeries;
    const sortKey: [number, string] = [series.levels[top - 1].tier, unlockedAt(series, top, friend)];
    if (!best || sortKey[0] > best.key[0] || (sortKey[0] === best.key[0] && sortKey[1] > best.key[1])) {
      best = { series, level: top, key: sortKey };
    }
  }
  return best ? ref(best.series, best.level, friend) : null;
}

function ranked(): MockFriend[] {
  return [...FRIENDS].sort((left, right) => right.intimacy - left.intimacy || right.friendDays - left.friendDays);
}

export function rulesResponse(): unknown {
  return {
    enabled: true,
    daily_cap: 40,
    sources: [
      { key: 'chat', label: '互相聊天', cap: 25, detail: '当天双方都发过消息 +5，之后每一来一回 +1' },
      { key: 'gift', label: '送礼物', cap: 15, detail: '每次 +3，每 10 币再 +1' },
      { key: 'streak', label: '连续互动', cap: 3, detail: '连续 3 天以上互相聊天，每天 +3' },
      { key: 'birthday', label: '生日礼物', cap: null, detail: '在对方生日那天送礼 +30，每人每年一次，不占每日上限' }
    ],
    levels: LEVELS,
    series: SERIES.map((series) => (series.hidden
      ? { key: series.key, hidden: true, name: null, condition: null, icon: 'unknown', levels: series.levels.map((level) => ({ level: level.level, tier: level.tier, name: null, threshold: null })) }
      : { key: series.key, hidden: false, name: series.name, condition: series.condition.replace('{n}', 'N'), icon: series.icon, levels: series.levels })),
    total_badges: SERIES.reduce((sum, series) => sum + series.levels.length, 0)
  };
}

export function friendsResponse(): unknown {
  const items = ranked().map((friend, index) => {
    const owned = unlocked(friend);
    const level = levelOf(friend.intimacy);
    return {
      rank: index + 1,
      friend: friend.user,
      intimacy: friend.intimacy,
      level: level.level,
      level_name: level.name,
      today_gained: friend.todayChat + friend.todayGift + friend.todayStreak + friend.todayBirthday,
      streak_days: friend.stats.streak_days,
      badge: displayBadge(friend),
      badge_count: [...owned.values()].reduce((sum, top) => sum + top, 0),
      new_badges: friend.unseen.size,
      friends_since: new Date(NOW - friend.friendDays * DAY).toISOString()
    };
  });
  return { enabled: true, daily_cap: 40, items, total: items.length };
}

export function detailResponse(friendId: number): unknown {
  const friend = FRIENDS.find((item) => item.user.id === friendId);
  if (!friend) {
    return null;
  }
  const owned = unlocked(friend);
  const level = levelOf(friend.intimacy);
  const next = LEVELS.find((item) => item.level === level.level + 1) ?? null;
  const values: Record<string, number> = { ...friend.stats, intimacy: friend.intimacy, friend_days: friend.friendDays, series_count: SERIES.filter((item) => !item.hidden && owned.has(item.key)).length };
  const order = ranked();
  return {
    friend: friend.user,
    friends_since: new Date(NOW - friend.friendDays * DAY).toISOString(),
    friend_days: friend.friendDays,
    intimacy: friend.intimacy,
    level: { ...level, next_level: next?.level ?? null, next_name: next?.name ?? null, next_threshold: next?.threshold ?? null },
    rank: order.indexOf(friend) + 1,
    friend_count: order.length,
    display: friend.display,
    badge: displayBadge(friend),
    today: {
      date: new Date().toISOString().slice(0, 10),
      gained: friend.todayChat + friend.todayGift + friend.todayStreak + friend.todayBirthday,
      counted: friend.todayChat + friend.todayGift + friend.todayStreak,
      cap: 40, chat: friend.todayChat, gift: friend.todayGift, streak: friend.todayStreak, birthday: friend.todayBirthday,
      messages_mine: friend.messagesMine, messages_theirs: friend.messagesTheirs, chat_cap: 25, gift_cap: 15
    },
    stats: { ...friend.stats, messages_mine: Math.round(friend.stats.messages_total * 0.52), messages_theirs: friend.stats.messages_total - Math.round(friend.stats.messages_total * 0.52) },
    badge_count: [...owned.values()].reduce((sum, top) => sum + top, 0),
    total_badges: SERIES.reduce((sum, series) => sum + series.levels.length, 0),
    series: SERIES.map((series) => {
      const top = owned.get(series.key) ?? 0;
      if (series.hidden && top === 0) {
        return {
          key: series.key, hidden: true, revealed: false, name: null, condition: null, icon: 'unknown', current: null, level: 0, max_level: series.levels.length, next_threshold: null,
          levels: series.levels.map((item) => ({ level: item.level, name: null, tier: item.tier, threshold: null, unlocked_at: null, is_new: false }))
        };
      }
      const upcoming = series.levels.find((item) => item.level > top);
      return {
        key: series.key, hidden: series.hidden, revealed: true, name: series.name, condition: series.condition, icon: series.icon,
        current: values[series.stat] ?? 0, level: top, max_level: series.levels.length, next_threshold: upcoming?.threshold ?? null,
        levels: series.levels.map((item) => ({
          level: item.level, name: item.name, tier: item.tier, threshold: item.threshold,
          unlocked_at: item.level <= top ? unlockedAt(series, item.level, friend) : null,
          is_new: item.level <= top && friend.unseen.has(`${series.key}.${item.level}`)
        }))
      };
    })
  };
}

export function historyResponse(friendId: number, days: number): unknown {
  const friend = FRIENDS.find((item) => item.user.id === friendId);
  const scale = friend ? Math.min(40, Math.max(1, friend.intimacy / 60)) : 0;
  return {
    items: Array.from({ length: days }, (_, index) => {
      const date = new Date(NOW - (days - 1 - index) * DAY).toISOString().slice(0, 10);
      const wave = Math.round(scale * (0.4 + 0.6 * Math.abs(Math.sin(index * 1.7 + friendId))));
      const gained = index % 5 === 3 ? 0 : Math.min(40, wave);
      return { date, gained, chat: Math.min(25, gained), gift: Math.max(0, gained - 25), streak: 0, birthday: 0, mutual: gained > 0 };
    })
  };
}

export function setDisplay(friendId: number, badge: string): unknown {
  const friend = FRIENDS.find((item) => item.user.id === friendId);
  if (friend) {
    friend.display = badge;
  }
  return { friend_id: friendId, display: badge, badge: friend ? displayBadge(friend) : null };
}

export function markSeen(friendId: number): unknown {
  const friend = FRIENDS.find((item) => item.user.id === friendId);
  const cleared = friend?.unseen.size ?? 0;
  friend?.unseen.clear();
  return { cleared };
}

/** 一枚徽章的 BadgeRef（模拟实时事件用） */
export function badgeRefOf(seriesKey: string, level: number): Record<string, unknown> {
  const series = SERIES.find((item) => item.key === seriesKey) as CatalogSeries;
  const item = series.levels[level - 1];
  return { series: series.key, series_name: series.name, level, name: item.name, tier: item.tier, icon: series.icon, unlocked_at: new Date().toISOString() };
}

export const CATALOG_SERIES = SERIES;
