import type { LevelIconRule } from '@/types/level';
import { isLevelIconKey } from './levelMath';

/** 等级页里数字和时间的写法。规则里的文字（加成叫什么、公式）都来自服务端，这里只管格式。 */

/** 活跃天数：最多一位小数，整数不带小数点。631.5 → 「631.5」，32 → 「32」 */
export function formatDays(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? rounded.toLocaleString('zh-CN') : rounded.toLocaleString('zh-CN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** 一天之内的活跃天：固定一位小数（0.5、1.0、2.0），几个数排在一起才对得齐 */
export function formatDayPart(value: number): string {
  return (Math.round(value * 10) / 10).toFixed(1);
}

/** 在线时长：「25 分钟」「2 小时」「1 小时 35 分」 */
export function formatMinutes(minutes: number): string {
  const whole = Math.max(0, Math.round(minutes));
  if (whole < 60) {
    return `${whole} 分钟`;
  }
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;
  return rest === 0 ? `${hours} 小时` : `${hours} 小时 ${rest} 分`;
}

/** 名次。没有名次（没有活跃天，或者刚上榜、服务端的缓存还没更新）写成一道横线 */
export function formatRank(rank: number | null | undefined): string {
  return typeof rank === 'number' && rank > 0 ? `第 ${rank.toLocaleString('zh-CN')} 名` : '—';
}

/** 「10-12」→「10/12」；读不出来就原样返回 */
export function formatDayLabel(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  return match ? `${Number(match[2])}/${Number(match[3])}` : date;
}

/** 图标之间怎么换：「4 颗星星换 1 个月亮」。只说客户端画得出来的那几种 */
export function exchangeLines(rules: readonly LevelIconRule[]): Array<{ from: LevelIconRule; to: LevelIconRule; count: number }> {
  const drawable = rules.filter((rule) => isLevelIconKey(rule.key)).slice().sort((left, right) => left.levels - right.levels);
  const lines: Array<{ from: LevelIconRule; to: LevelIconRule; count: number }> = [];
  for (let index = 1; index < drawable.length; index += 1) {
    const count = drawable[index].levels / drawable[index - 1].levels;
    if (Number.isInteger(count) && count > 1) {
      lines.push({ from: drawable[index - 1], to: drawable[index], count });
    }
  }
  return lines;
}
