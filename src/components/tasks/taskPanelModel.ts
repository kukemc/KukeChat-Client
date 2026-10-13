/**
 * 任务中心以外的任务界面（详情、新建、群任务、聊天卡片）两端共用的类型和纯函数：
 * 详情时间线、候选成员、月历格子、群任务统计、小助手通知的文案。只算数据，不碰请求和界面。
 */
import type { Conversation, ConversationMember, Friendship, Task, TaskActivity, TaskComment, TaskEventCardMetadata, User } from '@/types/api';
import { parseApiDate } from '@/utils/dateTime';
import { getDisplayName } from '@/components/ui/Avatar';
import { MILESTONE_ACTIVITY_TYPES, formatTaskDate, isOverdue } from './taskConstants';
import { filterByStatus } from './taskModel';

/* ───────── 详情 ───────── */

export function membersToUsers(members: ConversationMember[]): User[] {
  const seen = new Map<number, User>();
  for (const member of members) {
    const user = (member as ConversationMember & { user?: User }).user;
    if (user) {
      seen.set(user.id, user);
    }
  }
  return Array.from(seen.values());
}

/** 提醒时间相对截止时间提前了多少分钟；没设截止或提醒时是 null。 */
export function remindOffsetOf(task: Pick<Task, 'due_at' | 'remind_at'>): number | null {
  return task.due_at && task.remind_at
    ? Math.round(((parseApiDate(task.due_at)?.getTime() ?? 0) - (parseApiDate(task.remind_at)?.getTime() ?? 0)) / 60000)
    : null;
}

export type TimelineEntry =
  | { kind: 'activity'; id: string; time: string; item: TaskActivity }
  | { kind: 'comment'; id: string; time: string; item: TaskComment };

/** 详情里的时间线：评论 + 里程碑动态（创建、完成、负责人变更……），按时间先后排。 */
export function buildTimeline(activities: TaskActivity[], comments: TaskComment[]): TimelineEntry[] {
  const milestones: TimelineEntry[] = activities
    .filter((item) => MILESTONE_ACTIVITY_TYPES.has(item.type))
    .map((item) => ({ kind: 'activity', id: `a${item.id}`, time: item.created_at, item }));
  const notes: TimelineEntry[] = comments.map((item) => ({ kind: 'comment', id: `c${item.id}`, time: item.created_at, item }));
  return [...milestones, ...notes].sort((a, b) => (parseApiDate(a.time)?.getTime() ?? 0) - (parseApiDate(b.time)?.getTime() ?? 0));
}

/* ───────── 新建任务 ───────── */

function pickFriendUser(friendship: Friendship, selfId: number): User | null {
  const candidates = [friendship.friend, friendship.user].filter(Boolean) as User[];
  return candidates.find((user) => user.id !== selfId) ?? null;
}

/** 新建任务时能选的负责人 / 关注人：自己排第一，后面是好友，最近私聊过的靠前。 */
export function buildMemberCandidates(friends: Friendship[], conversations: Conversation[], currentUser: User): User[] {
  const recency = new Map<number, number>();
  for (const conversation of conversations) {
    if (conversation.type === 'direct' && conversation.direct_user) {
      recency.set(conversation.direct_user.id, parseApiDate(conversation.updated_at)?.getTime() ?? 0);
    }
  }
  const friendUsers = friends
    .map((friendship) => pickFriendUser(friendship, currentUser.id))
    .filter((user): user is User => Boolean(user) && user!.id !== currentUser.id);
  friendUsers.sort((a, b) => (recency.get(b.id) ?? 0) - (recency.get(a.id) ?? 0));
  const seen = new Map<number, User>([[currentUser.id, currentUser]]);
  for (const user of friendUsers) {
    if (!seen.has(user.id)) {
      seen.set(user.id, user);
    }
  }
  return Array.from(seen.values());
}

export function filterMembers(members: User[], query: string): User[] {
  const keyword = query.trim().toLowerCase();
  if (!keyword) {
    return members;
  }
  return members.filter((user) => getDisplayName(user).toLowerCase().includes(keyword) || (user.username ?? '').toLowerCase().includes(keyword));
}

/* ───────── 截止时间 ───────── */

export const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

export const REMIND_OPTIONS: { label: string; value: number | null }[] = [
  { label: '不提醒', value: null },
  { label: '截止时', value: 0 },
  { label: '提前 30 分钟', value: 30 },
  { label: '提前 1 小时', value: 60 },
  { label: '提前 1 天', value: 1440 }
];

/** 月历的 42 个格子（6 行 × 7 列，周日开头），含上下月补位。 */
export function monthCells(viewMonth: Date): Date[] {
  const first = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
  return Array.from({ length: 42 }, (_, index) => new Date(first.getFullYear(), first.getMonth(), 1 - first.getDay() + index));
}

export function isSameDay(a: Date, b: Date | null): boolean {
  return Boolean(b) && a.getFullYear() === b!.getFullYear() && a.getMonth() === b!.getMonth() && a.getDate() === b!.getDate();
}

/** 把选中的日期和「HH:mm」拼成截止时间；不带具体时间的记成当天 0 点。 */
export function composeDue(date: Date, hasTime: boolean, time: string): Date {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (hasTime) {
    const [hours, minutes] = time.split(':').map((value) => Number(value));
    result.setHours(Number.isFinite(hours) ? hours : 18, Number.isFinite(minutes) ? minutes : 0, 0, 0);
  }
  return result;
}

/* ───────── 群任务 ───────── */

export type GroupTaskFilter = 'all' | 'open' | 'completed' | 'overdue';

export const GROUP_TASK_FILTERS: { key: GroupTaskFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'open', label: '进行中' },
  { key: 'completed', label: '已完成' },
  { key: 'overdue', label: '逾期' }
];

export interface GroupTaskStats {
  total: number;
  done: number;
  open: number;
  overdue: number;
}

export function groupTaskStats(topTasks: Task[]): GroupTaskStats {
  let done = 0;
  let open = 0;
  let overdue = 0;
  for (const task of topTasks) {
    if (task.status === 'completed') {
      done += 1;
    } else if (task.status !== 'cancelled') {
      open += 1;
      if (isOverdue(task.due_at, task.status)) {
        overdue += 1;
      }
    }
  }
  return { total: topTasks.length, done, open, overdue };
}

export function filterGroupTasks(topTasks: Task[], filter: GroupTaskFilter): Task[] {
  switch (filter) {
    case 'open':
      return filterByStatus(topTasks, 'open');
    case 'completed':
      return filterByStatus(topTasks, 'completed');
    case 'overdue':
      return topTasks.filter((task) => isOverdue(task.due_at, task.status));
    default:
      return topTasks;
  }
}

/* ───────── 任务小助手的通知 ───────── */

const TASK_EVENT_TITLES: Record<string, string> = {
  assigned: '任务指派',
  assignee_added: '负责人变更',
  assignee_removed: '负责人变更',
  completed: '任务完成',
  reopened: '任务重启',
  updated: '任务更新',
  due_changed: '任务时间变更',
  due_reminder: '任务到期提醒',
  due_soon: '任务临期提醒',
  remind: '任务提醒'
};

export function taskEventTitle(event: TaskEventCardMetadata): string {
  return TASK_EVENT_TITLES[event.type] ?? '任务通知';
}

export function taskEventBody(event: TaskEventCardMetadata): string {
  const actor = event.actor_name ?? '某成员';
  switch (event.type) {
    case 'assigned':
      return `${actor} 给你指派了任务`;
    case 'assignee_added':
      return `${actor} 将你添加为任务负责人`;
    case 'assignee_removed':
      return `${actor} 移除了你的任务负责人`;
    case 'completed':
      return `${actor} 完成了任务`;
    case 'reopened':
      return `${actor} 重新开启了任务`;
    case 'due_changed':
      return `${actor} 将任务截止时间设置为 ${event.due_at ? formatTaskDate(event.due_at) : '空'}`;
    case 'due_reminder':
      return '任务已到期，请尽快处理';
    case 'due_soon':
      return `任务即将到期${event.due_at ? `（截止 ${formatTaskDate(event.due_at)}）` : ''}`;
    case 'remind':
      return '任务提醒';
    default:
      return `${actor} 更新了任务`;
  }
}
