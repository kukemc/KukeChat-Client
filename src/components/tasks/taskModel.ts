/**
 * 任务中心两端（桌面 / 移动）共用的类型和纯函数：导航与筛选、排序、分组、看板分列、动态按天归组。
 * 只算数据，不碰请求和界面。详情、新建、群任务、聊天卡片用的在 taskPanelModel.ts。
 */
import type { Task, TaskActivity, TaskScope } from '@/types/api';
import { parseApiDate } from '@/utils/dateTime';
import { getDisplayName } from '@/components/ui/Avatar';

export type NavKey = 'assigned' | 'watching' | 'created' | 'all' | 'completed' | 'activity';
export type ViewMode = 'list' | 'board' | 'dashboard';
export type StatusFilter = 'open' | 'completed' | 'all';
export type SortKey = 'custom' | 'start_at' | 'due_at' | 'created_at' | 'updated_at' | 'completed_at';
export type GroupKey = 'custom' | 'none' | 'creator' | 'due' | 'source';
export type ColKey = 'assignees' | 'start_at' | 'due_at' | 'subtasks' | 'creator' | 'created_at' | 'updated_at' | 'task_id';

export const NAV_TITLES: Record<NavKey, string> = {
  assigned: '我负责的',
  watching: '我关注的',
  created: '我创建的',
  all: '全部任务',
  completed: '已完成',
  activity: '动态'
};

export const VIEW_MODES: ViewMode[] = ['list', 'board', 'dashboard'];
export const STATUS_FILTERS: StatusFilter[] = ['open', 'completed', 'all'];

export const FILTER_LABELS: Record<StatusFilter, string> = {
  open: '未完成',
  completed: '已完成',
  all: '全部任务'
};

export const SORT_LABELS: Record<SortKey, string> = {
  custom: '默认排序',
  start_at: '开始时间',
  due_at: '截止时间',
  created_at: '创建时间',
  updated_at: '更新时间',
  completed_at: '完成时间'
};

export const GROUP_LABELS: Record<GroupKey, string> = {
  custom: '自定义分组',
  none: '无分组',
  creator: '创建人',
  due: '截止时间',
  source: '任务来源'
};

export const COL_LABELS: Record<ColKey, string> = {
  assignees: '负责人',
  start_at: '开始时间',
  due_at: '截止时间',
  subtasks: '子任务进度',
  creator: '创建人',
  created_at: '创建时间',
  updated_at: '更新时间',
  task_id: '任务 ID'
};

export const SORT_KEYS = Object.keys(SORT_LABELS) as SortKey[];
export const GROUP_KEYS = Object.keys(GROUP_LABELS) as GroupKey[];
export const COL_ORDER: ColKey[] = ['assignees', 'start_at', 'due_at', 'subtasks', 'creator', 'created_at', 'updated_at', 'task_id'];
export const DEFAULT_VISIBLE_COLS: ColKey[] = ['assignees', 'due_at', 'creator', 'created_at', 'task_id'];

export function navToScope(nav: NavKey): TaskScope {
  if (nav === 'watching') return 'watching';
  if (nav === 'created') return 'created';
  if (nav === 'all' || nav === 'completed') return 'all';
  return 'assigned';
}

/** 切换导航时状态筛选跟着走：「已完成」只看完成的，「全部任务」不筛，其余默认看未完成。 */
export function statusFilterForNav(nav: NavKey): StatusFilter {
  return nav === 'completed' ? 'completed' : nav === 'all' ? 'all' : 'open';
}

export function toggleInSet<T>(current: Set<T>, key: T): Set<T> {
  const next = new Set(current);
  if (next.has(key)) {
    next.delete(key);
  } else {
    next.add(key);
  }
  return next;
}

export function filterByStatus(list: Task[], filter: StatusFilter): Task[] {
  if (filter === 'completed') {
    return list.filter((task) => task.status === 'completed');
  }
  if (filter === 'open') {
    return list.filter((task) => task.status !== 'completed' && task.status !== 'cancelled');
  }
  return list;
}

function timeValue(value?: string | null): number {
  if (!value) {
    return Number.NaN;
  }
  // 服务端的时间不带时区、内容是 UTC（见 utils/dateTime 的 parseApiDate）
  return parseApiDate(value)?.getTime() ?? Number.NaN;
}

export function sortTasks(list: Task[], sortBy: SortKey): Task[] {
  if (sortBy === 'custom') {
    return list;
  }
  const ascending = sortBy === 'start_at' || sortBy === 'due_at';
  const field = sortBy as keyof Task;
  return [...list].sort((a, b) => {
    const av = timeValue(a[field] as string | null | undefined);
    const bv = timeValue(b[field] as string | null | undefined);
    const aNan = Number.isNaN(av);
    const bNan = Number.isNaN(bv);
    if (aNan && bNan) return 0;
    // 没填时间的排在最后
    if (aNan) return 1;
    if (bNan) return -1;
    return ascending ? av - bv : bv - av;
  });
}

function dayOf(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function dueBucket(value?: string | null): { key: string; name: string; order: number } {
  const date = parseApiDate(value);
  if (!date) {
    return { key: 'due-none', name: '无截止时间', order: 5 };
  }
  const now = new Date();
  const diff = Math.round((dayOf(date) - dayOf(now)) / 86400000);
  if (date.getTime() < now.getTime() && diff < 0) return { key: 'due-overdue', name: '已逾期', order: 0 };
  if (diff <= 0) return { key: 'due-today', name: '今天', order: 1 };
  if (diff <= 7) return { key: 'due-week', name: '未来 7 天', order: 2 };
  return { key: 'due-later', name: '更晚', order: 3 };
}

export interface DisplayGroup {
  key: string;
  name: string;
  /** 只有「自定义分组」才有：null 是默认分组。有它才能在分组里新建任务、改名、删除。 */
  groupId?: number | null;
  items: Task[];
}

export function buildDisplayGroups(top: Task[], groupBy: GroupKey, groupDefs: { id: number; name: string }[]): DisplayGroup[] {
  if (groupBy === 'none') {
    return [{ key: 'all', name: '全部任务', items: top }];
  }
  if (groupBy === 'custom') {
    const groups: DisplayGroup[] = [
      { key: 'default', name: '默认分组', groupId: null, items: [] },
      ...groupDefs.map((group) => ({ key: `g${group.id}`, name: group.name, groupId: group.id as number | null, items: [] as Task[] }))
    ];
    const byId = new Map<number | null, Task[]>(groups.map((group) => [group.groupId ?? null, group.items]));
    for (const task of top) {
      // 分组被删掉的任务落回默认分组
      const key = task.group_id != null && byId.has(task.group_id) ? task.group_id : null;
      byId.get(key)!.push(task);
    }
    return groups;
  }
  if (groupBy === 'creator' || groupBy === 'source') {
    const map = new Map<number, DisplayGroup>();
    for (const task of top) {
      const id = groupBy === 'creator' ? task.creator_id : task.conversation_id;
      if (!map.has(id)) {
        map.set(id, groupBy === 'creator'
          ? { key: `c${id}`, name: getDisplayName(task.creator), items: [] }
          : { key: `s${id}`, name: task.conversation_title ?? `会话 ${id}`, items: [] });
      }
      map.get(id)!.items.push(task);
    }
    return Array.from(map.values());
  }
  const map = new Map<string, DisplayGroup & { order: number }>();
  for (const task of top) {
    const bucket = dueBucket(task.due_at);
    if (!map.has(bucket.key)) {
      map.set(bucket.key, { key: bucket.key, name: bucket.name, items: [], order: bucket.order });
    }
    map.get(bucket.key)!.items.push(task);
  }
  return Array.from(map.values()).sort((a, b) => a.order - b.order);
}

/** 看板的一列。看板固定按自定义分组分列。 */
export interface GroupColumn {
  id: number | null;
  name: string;
  items: Task[];
}

export function buildBoardColumns(top: Task[], groupDefs: { id: number; name: string }[]): GroupColumn[] {
  return buildDisplayGroups(top, 'custom', groupDefs).map((group) => ({ id: group.groupId ?? null, name: group.name, items: group.items }));
}

export function colKey(id: number | null): string {
  return id === null ? 'default' : `g${id}`;
}

export function indexSubtasks(pool: Task[]): Map<number, Task[]> {
  const map = new Map<number, Task[]>();
  for (const task of pool) {
    if (task.parent_id) {
      if (!map.has(task.parent_id)) {
        map.set(task.parent_id, []);
      }
      map.get(task.parent_id)!.push(task);
    }
  }
  return map;
}

/* ───────── 动态 ───────── */

const FEED_WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export interface ActivityDay {
  key: string;
  date: string;
  items: TaskActivity[];
}

export function groupActivitiesByDay(activities: TaskActivity[]): ActivityDay[] {
  const map = new Map<string, ActivityDay>();
  for (const activity of activities) {
    const date = parseApiDate(activity.created_at) ?? new Date(activity.created_at);
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    if (!map.has(key)) {
      map.set(key, { key, date: activity.created_at, items: [] });
    }
    map.get(key)!.items.push(activity);
  }
  return Array.from(map.values());
}

export function feedDayHeader(value: string): { weekday: string; day: number } {
  const date = parseApiDate(value) ?? new Date(value);
  const diff = Math.round((dayOf(date) - dayOf(new Date())) / 86400000);
  const weekday = diff === 0 ? '今天' : diff === -1 ? '昨天' : FEED_WEEKDAYS[date.getDay()];
  return { weekday, day: date.getDate() };
}

export function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

export function feedTime(value: string): string {
  const date = parseApiDate(value) ?? new Date(value);
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}
