import type { ChatSearchConversation } from '@/types/groupPlus';

/**
 * 聊天记录搜索用到的纯函数：会话标题、命中高亮切片、按日期分组、UTC+8 的日期字符串。
 * 放在一起、不依赖 React，桌面和移动两套界面共用。
 */

export function chatSearchTitle(conversation: ChatSearchConversation): string {
  if (conversation.type === 'group') {
    return conversation.display_title?.trim() || conversation.title?.trim() || `群聊 ${conversation.id}`;
  }
  const peer = conversation.direct_user;
  return conversation.display_title?.trim() || peer?.nickname?.trim() || peer?.username?.trim() || `会话 ${conversation.id}`;
}

export interface TextSegment {
  text: string;
  hit: boolean;
}

/**
 * 按命中区间把文字切成片段。区间是服务端按 UTF-16 码元（JS 字符串下标）给的，所以直接用 slice；
 * 区间可能越界或互相重叠（多个关键词挨在一起），先裁到文字长度、再合并，保证渲染出来的字一个不多一个不少。
 * 渲染成 <mark> 节点由调用方做，这里不产生任何 HTML 字符串。
 */
export function splitByRanges(text: string, ranges: ReadonlyArray<readonly [number, number]>): TextSegment[] {
  const clipped = ranges
    .map(([start, end]) => [Math.max(0, start), Math.min(text.length, end)] as const)
    .filter(([start, end]) => end > start)
    .sort((left, right) => left[0] - right[0]);
  const merged: Array<[number, number]> = [];
  for (const [start, end] of clipped) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) {
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }
  const segments: TextSegment[] = [];
  let cursor = 0;
  for (const [start, end] of merged) {
    if (start > cursor) {
      segments.push({ text: text.slice(cursor, start), hit: false });
    }
    segments.push({ text: text.slice(start, end), hit: true });
    cursor = end;
  }
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), hit: false });
  }
  return segments.length > 0 ? segments : [{ text, hit: false }];
}

const CHINA_OFFSET_MS = 8 * 3_600_000;

/** 某个时刻在 UTC+8 的日期 YYYY-MM-DD（接口的日期筛选和「今天」都按它算）。 */
export function chinaDate(value: number | string | Date): string {
  const time = value instanceof Date ? value.getTime() : typeof value === 'number' ? value : new Date(value).getTime();
  if (!Number.isFinite(time)) {
    return '';
  }
  return new Date(time + CHINA_OFFSET_MS).toISOString().slice(0, 10);
}

/** 今天往前 days 天的日期（UTC+8）。 */
export function chinaDateAgo(days: number): string {
  return chinaDate(Date.now() - days * 86_400_000);
}

/** 分组标题：今天 / 昨天 / 日期。 */
export function dayLabel(day: string): string {
  if (day === chinaDate(Date.now())) {
    return '今天';
  }
  if (day === chinaDateAgo(1)) {
    return '昨天';
  }
  const [year, month, date] = day.split('-');
  return year === chinaDate(Date.now()).slice(0, 4) ? `${Number(month)} 月 ${Number(date)} 日` : `${year} 年 ${Number(month)} 月 ${Number(date)} 日`;
}

export interface DayGroup<T> {
  day: string;
  items: T[];
}

/** 结果已经是按消息 id 从新到旧排的，所以同一天的挨在一起，顺序扫一遍就够。 */
export function groupByDay<T>(items: readonly T[], timeOf: (item: T) => string): Array<DayGroup<T>> {
  const groups: Array<DayGroup<T>> = [];
  for (const item of items) {
    const day = chinaDate(timeOf(item));
    const last = groups[groups.length - 1];
    if (last && last.day === day) {
      last.items.push(item);
    } else {
      groups.push({ day, items: [item] });
    }
  }
  return groups;
}
