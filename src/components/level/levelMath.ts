import type { LevelIconKey, LevelIconRule } from '@/types/level';

/** 客户端画得出来的四种图标。 */
export const LEVEL_ICON_KEYS: readonly LevelIconKey[] = ['crown', 'sun', 'moon', 'star'];

export function isLevelIconKey(value: string): value is LevelIconKey {
  return (LEVEL_ICON_KEYS as readonly string[]).includes(value);
}

export interface LevelPart {
  key: LevelIconKey;
  label: string;
  /** 这种图标几个 */
  count: number;
  /** 一个顶多少级 */
  levels: number;
}

// 同一份换算表下，每个等级只拆一次：聊天里同一个人的几十条消息、成员列表里的几百个人查的都是这张表
const cache = new WeakMap<object, Map<number, LevelPart[]>>();
const NO_PARTS: LevelPart[] = [];

/**
 * 把等级拆成图标：从大到小，每种图标尽量多拿。23 级 = 1 太阳 1 月亮 3 星星。
 * 换算表来自 GET /levels/rules 的 icons（已经按从大到小排好）。里面有客户端画不出来的图标时跳过那一档，
 * 它该顶的级数落到更小的图标上 —— 多画几个皇冠，也比少算几级强。
 */
export function splitLevel(level: number, rules: readonly LevelIconRule[]): LevelPart[] {
  if (!Number.isFinite(level) || level < 1) {
    return NO_PARTS;
  }
  const whole = Math.floor(level);
  let table = cache.get(rules);
  if (!table) {
    table = new Map();
    cache.set(rules, table);
  }
  const known = table.get(whole);
  if (known) {
    return known;
  }
  const parts: LevelPart[] = [];
  let rest = whole;
  for (const rule of rules) {
    if (!isLevelIconKey(rule.key) || rule.levels < 1) {
      continue;
    }
    const count = Math.floor(rest / rule.levels);
    if (count > 0) {
      parts.push({ key: rule.key, label: rule.label, count, levels: rule.levels });
      rest -= count * rule.levels;
    }
  }
  table.set(whole, parts);
  return parts;
}

/** 「1 太阳 1 月亮 3 星星」 */
export function describeParts(parts: readonly LevelPart[]): string {
  return parts.map((part) => `${part.count} ${part.label}`).join(' ');
}

/**
 * 升到这一级时「换出来」的最大的那种图标：正好凑满一个月亮 / 太阳 / 皇冠时返回它，否则（只是多了一颗星）返回 null。
 * 升级提示据此决定要不要更隆重一点。
 */
export function milestoneOf(level: number, rules: readonly LevelIconRule[]): LevelPart | null {
  for (const rule of rules) {
    if (isLevelIconKey(rule.key) && rule.levels > 1 && level >= rule.levels && level % rule.levels === 0) {
      return { key: rule.key, label: rule.label, count: Math.floor(level / rule.levels), levels: rule.levels };
    }
  }
  return null;
}
