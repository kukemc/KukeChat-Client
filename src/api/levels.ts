import type { User } from '@/types/api';
import type { LevelBonusRule, LevelBonusState, LevelHistoryDay, LevelIconCounts, LevelIconRule, LevelLeaderboard, LevelLeaderboardItem, LevelLeaderboardPeriod, LevelMe, LevelMilestone, LevelOnlineTier, LevelRules, LevelToday, LevelUpEvent, UserLevelCard } from '@/types/level';
import { apiRequest } from './client';
import { isRecord } from './normalizers';

/**
 * 账号等级（docs/account-level.md）。旧后端没有这些接口，GET /levels/rules 会 404 —— 调用方（components/level/data.ts）把它当成「还没开放」。
 *
 * 响应在这里整理成类型里写的形状：缺字段补默认值、形状不对的条目丢掉。规则里的数值全部来自服务端，
 * 这里唯一的兜底是图标的换算（DEFAULT_LEVEL_ICONS，契约里写明的默认值）：昵称旁的图标不能因为规则还没拉到就画不出来。
 */

export const MAX_ACCOUNT_LEVEL = 256;

/** 契约 1.2 的默认换算：1 级 1 颗星，4 星 1 月亮，4 月亮 1 太阳，4 太阳 1 皇冠。 */
export const DEFAULT_LEVEL_ICONS: readonly LevelIconRule[] = [
  { key: 'crown', label: '皇冠', levels: 64 },
  { key: 'sun', label: '太阳', levels: 16 },
  { key: 'moon', label: '月亮', levels: 4 },
  { key: 'star', label: '星星', levels: 1 }
];

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function numOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function notNull<T>(value: T | null): value is T {
  return value !== null;
}

function list<T>(value: unknown, read: (item: unknown) => T | null): T[] {
  return Array.isArray(value) ? value.map(read).filter(notNull) : [];
}

/** 用户对象上的 account_level：不是 0–256 的整数就当没有等级。 */
export function readAccountLevel(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.min(MAX_ACCOUNT_LEVEL, Math.floor(value)) : 0;
}

/** 图标换算表：只留写得对的条目，从大到小排。一条都读不出来就用契约里的默认值。 */
export function normalizeLevelIcons(value: unknown): LevelIconRule[] {
  const rules = list<LevelIconRule>(value, (item) => {
    if (!isRecord(item) || typeof item.key !== 'string' || typeof item.levels !== 'number' || !Number.isFinite(item.levels) || item.levels < 1) {
      return null;
    }
    return { key: item.key, label: text(item.label, item.key), levels: Math.floor(item.levels) };
  }).sort((left, right) => right.levels - left.levels);
  return rules.length > 0 ? rules : DEFAULT_LEVEL_ICONS.map((rule) => ({ ...rule }));
}

function normalizeCounts(value: unknown): LevelIconCounts | null {
  if (!isRecord(value)) {
    return null;
  }
  const counts: LevelIconCounts = {};
  for (const [key, count] of Object.entries(value)) {
    if (typeof count === 'number' && Number.isFinite(count) && count >= 0) {
      counts[key] = Math.floor(count);
    }
  }
  return counts;
}

function normalizeBonusRule(item: unknown): LevelBonusRule | null {
  if (!isRecord(item) || typeof item.key !== 'string') {
    return null;
  }
  const rule: LevelBonusRule = { key: item.key, label: text(item.label, item.key), days: num(item.days) };
  const target = numOrNull(item.target);
  if (target !== null) {
    rule.target = target;
  }
  return rule;
}

export function normalizeLevelRules(value: unknown): LevelRules {
  const source = isRecord(value) ? value : {};
  return {
    max_level: num(source.max_level, MAX_ACCOUNT_LEVEL),
    formula: text(source.formula),
    icons: normalizeLevelIcons(source.icons),
    daily_cap: num(source.daily_cap),
    online: list<LevelOnlineTier>(source.online, (item) => (isRecord(item) && typeof item.minutes === 'number' && typeof item.days === 'number' ? { minutes: item.minutes, days: item.days } : null)).sort((left, right) => right.minutes - left.minutes),
    bonuses: list(source.bonuses, normalizeBonusRule),
    milestones: list<LevelMilestone>(source.milestones, (item) => (isRecord(item) && typeof item.level === 'number' && typeof item.days === 'number' ? { level: item.level, days: item.days } : null)).sort((left, right) => left.level - right.level)
  };
}

function normalizeBonusState(item: unknown): LevelBonusState | null {
  if (!isRecord(item) || typeof item.key !== 'string') {
    return null;
  }
  const state: LevelBonusState = { key: item.key, earned: item.earned === true, days: num(item.days) };
  const current = numOrNull(item.current);
  const target = numOrNull(item.target);
  if (current !== null) {
    state.current = current;
  }
  if (target !== null) {
    state.target = target;
  }
  return state;
}

function normalizeToday(value: unknown): LevelToday | null {
  if (!isRecord(value)) {
    return null;
  }
  return {
    date: text(value.date),
    online_minutes: Math.max(0, num(value.online_minutes)),
    base: num(value.base),
    bonuses: list(value.bonuses, normalizeBonusState),
    earned: num(value.earned),
    cap: num(value.cap)
  };
}

function normalizeCard(source: Record<string, unknown>): UserLevelCard {
  return {
    user_id: numOrNull(source.user_id),
    level: readAccountLevel(source.level),
    active_days: Math.max(0, num(source.active_days)),
    icons: normalizeCounts(source.icons),
    next_level_days: numOrNull(source.next_level_days),
    days_to_next: numOrNull(source.days_to_next),
    streak: Math.max(0, Math.floor(num(source.streak))),
    rank: numOrNull(source.rank),
    registered_days: Math.max(0, Math.floor(num(source.registered_days)))
  };
}

export function normalizeLevelMe(value: unknown): LevelMe {
  const source = isRecord(value) ? value : {};
  return {
    ...normalizeCard(source),
    level_days: Math.max(0, num(source.level_days)),
    next_level: numOrNull(source.next_level),
    today: normalizeToday(source.today)
  };
}

function normalizeBoardItem(value: unknown): LevelLeaderboardItem | null {
  if (!isRecord(value) || typeof value.rank !== 'number' || !Number.isFinite(value.rank)) {
    return null;
  }
  return {
    rank: value.rank,
    user: isRecord(value.user) && typeof value.user.id === 'number' ? value.user as unknown as User : null,
    level: readAccountLevel(value.level),
    active_days: Math.max(0, num(value.active_days)),
    gained: Math.max(0, num(value.gained))
  };
}

/** 实时事件 account.level.up 的 data。读不出等级时返回 null。 */
export function normalizeLevelUpEvent(value: unknown): LevelUpEvent | null {
  if (!isRecord(value) || typeof value.level !== 'number' || !Number.isFinite(value.level) || value.level < 1) {
    return null;
  }
  return { level: readAccountLevel(value.level), icons: normalizeCounts(value.icons), active_days: numOrNull(value.active_days) };
}

export async function getLevelRules(): Promise<LevelRules> {
  return normalizeLevelRules(await apiRequest<unknown>('/levels/rules'));
}

export async function getMyLevel(): Promise<LevelMe> {
  return normalizeLevelMe(await apiRequest<unknown>('/levels/me'));
}

/** 别人的等级卡。用户不存在是 404 user_not_found。 */
export async function getUserLevel(userId: number): Promise<UserLevelCard> {
  const response = await apiRequest<unknown>(`/users/${userId}/level`);
  return normalizeCard(isRecord(response) ? response : {});
}

/** limit 1–100，服务端缓存 60 秒。 */
export async function getLevelLeaderboard(period: LevelLeaderboardPeriod, limit: number, offset: number): Promise<LevelLeaderboard> {
  const response = await apiRequest<unknown>(`/levels/leaderboard?period=${period}&limit=${limit}&offset=${offset}`);
  const source = isRecord(response) ? response : {};
  const items = list(source.items, normalizeBoardItem);
  return {
    period: source.period === 'month' ? 'month' : source.period === 'all' ? 'all' : period,
    items,
    total: Math.max(items.length, num(source.total)),
    me: normalizeBoardItem(source.me),
    generated_at: typeof source.generated_at === 'string' ? source.generated_at : null
  };
}

/** 近 N 天（1–90）每天拿到的活跃天，按日期正序。 */
export async function getLevelHistory(days: number): Promise<LevelHistoryDay[]> {
  const response = await apiRequest<unknown>(`/levels/history?days=${days}`);
  return list<LevelHistoryDay>(isRecord(response) ? response.items : response, (item) => {
    if (!isRecord(item) || typeof item.date !== 'string') {
      return null;
    }
    const base = Math.max(0, num(item.base));
    const bonus = Math.max(0, num(item.bonus));
    return { date: item.date, online_minutes: Math.max(0, num(item.online_minutes)), base, bonus, earned: Math.max(0, num(item.earned, base + bonus)) };
  });
}
