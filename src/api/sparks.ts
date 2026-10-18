import type { Spark, SparkDetail, SparkLevelKey, SparkLevelRule, SparkRelightBlock, SparkRules, SparkStatus, SparkUpdatedEvent } from '@/types/spark';
import { apiRequest } from './client';
import { isRecord } from './normalizers';

/**
 * 好友火花接口（KukeChat-Server/docs/sparks.md）。旧后端没有这些接口（404），会话里也没有 spark 字段 —— 调用方当作「没有火花」。
 * 响应在这里整理成 types/spark.ts 的形状：缺字段补默认值，形状不对的丢掉。
 */

const STATUSES: readonly SparkStatus[] = ['none', 'lit', 'pending', 'dying', 'out'];
const KEYS: readonly SparkLevelKey[] = ['ember', 'spark', 'flame', 'blaze', 'inferno', 'eternal'];
const BLOCKS: readonly SparkRelightBlock[] = ['not_out', 'expired', 'cooldown'];

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function countOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : null;
}

function textOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function levelKey(value: unknown): SparkLevelKey | null {
  return KEYS.includes(value as SparkLevelKey) ? value as SparkLevelKey : null;
}

export function normalizeSpark(value: unknown): Spark | null {
  if (!isRecord(value)) {
    return null;
  }
  const status = STATUSES.includes(value.status as SparkStatus) ? value.status as SparkStatus : 'none';
  return {
    status,
    days: count(value.days),
    level: count(value.level),
    level_name: textOrNull(value.level_name),
    level_key: levelKey(value.level_key),
    today_lit: value.today_lit === true,
    i_spoke_today: value.i_spoke_today === true,
    friend_spoke_today: value.friend_spoke_today === true,
    dying: value.dying === true || status === 'dying',
    best_days: count(value.best_days),
    next_level: countOrNull(value.next_level),
    next_level_name: textOrNull(value.next_level_name),
    next_level_days: countOrNull(value.next_level_days),
    days_to_next: countOrNull(value.days_to_next),
    lit_on: textOrNull(value.lit_on),
    extinguished_at: textOrNull(value.extinguished_at),
    lost_days: count(value.lost_days),
    lost_level_key: levelKey(value.lost_level_key),
    can_relight: value.can_relight === true,
    relight_block: BLOCKS.includes(value.relight_block as SparkRelightBlock) ? value.relight_block as SparkRelightBlock : null,
    relight_cost: count(value.relight_cost),
    relight_deadline: textOrNull(value.relight_deadline),
    relight_cooldown_until: textOrNull(value.relight_cooldown_until),
    relit_at: textOrNull(value.relit_at)
  };
}

function normalizeRules(value: unknown): SparkRules {
  const raw = isRecord(value) ? value : {};
  const levels = Array.isArray(raw.levels)
    ? raw.levels.map((item): SparkLevelRule | null => {
      if (!isRecord(item) || typeof item.name !== 'string' || levelKey(item.key) === null) {
        return null;
      }
      return { level: count(item.level), name: item.name, key: levelKey(item.key) as SparkLevelKey, min_days: count(item.min_days) };
    }).filter((item): item is SparkLevelRule => item !== null)
    : [];
  return {
    timezone: typeof raw.timezone === 'string' ? raw.timezone : 'UTC+8',
    levels,
    grace_missed_days: count(raw.grace_missed_days),
    relight_cost: count(raw.relight_cost),
    relight_window_days: count(raw.relight_window_days),
    relight_cooldown_days: count(raw.relight_cooldown_days),
    rules: Array.isArray(raw.rules) ? raw.rules.filter((item): item is string => typeof item === 'string') : []
  };
}

const EMPTY: Spark = normalizeSpark({}) as Spark;

export async function getFriendSpark(friendId: number): Promise<SparkDetail> {
  const data = await apiRequest<unknown>(`/friends/${friendId}/spark`);
  const raw = isRecord(data) ? data : {};
  return {
    friend_id: typeof raw.friend_id === 'number' ? raw.friend_id : friendId,
    conversation_id: typeof raw.conversation_id === 'number' ? raw.conversation_id : null,
    spark: normalizeSpark(raw.spark) ?? EMPTY,
    rules: normalizeRules(raw.rules)
  };
}

/** 我和所有好友之间有得画的火花，按好友 id。 */
export async function getMySparks(): Promise<Record<number, Spark>> {
  const data = await apiRequest<unknown>('/sparks');
  const map: Record<number, Spark> = {};
  if (isRecord(data) && Array.isArray(data.items)) {
    for (const item of data.items) {
      const spark = isRecord(item) ? normalizeSpark(item.spark) : null;
      if (spark && isRecord(item) && typeof item.friend_id === 'number') {
        map[item.friend_id] = spark;
      }
    }
  }
  return map;
}

export async function relightSpark(friendId: number): Promise<{ restored_days: number; spark: Spark }> {
  const data = await apiRequest<unknown>(`/friends/${friendId}/spark/relight`, { method: 'POST' });
  const raw = isRecord(data) ? data : {};
  return { restored_days: count(raw.restored_days), spark: normalizeSpark(raw.spark) ?? EMPTY };
}

export function normalizeSparkUpdated(value: unknown): SparkUpdatedEvent | null {
  if (!isRecord(value) || typeof value.friend_id !== 'number') {
    return null;
  }
  const spark = normalizeSpark(value.spark);
  if (!spark) {
    return null;
  }
  return {
    friend_id: value.friend_id,
    conversation_id: typeof value.conversation_id === 'number' ? value.conversation_id : null,
    reason: typeof value.reason === 'string' ? value.reason : 'spoke',
    actor_id: typeof value.actor_id === 'number' ? value.actor_id : null,
    spark
  };
}

/** 会话列表 / 好友列表里要不要画（和服务端 worth_showing 同一条规则）。 */
export function sparkWorthShowing(spark: Spark | null | undefined): spark is Spark {
  if (!spark) {
    return false;
  }
  return spark.days > 0 || (spark.lost_days > 0 && spark.relight_block !== 'expired' && spark.relight_deadline !== null);
}
