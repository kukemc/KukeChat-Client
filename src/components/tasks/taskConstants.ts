import type { TaskPriority, TaskStatus } from '@/types/api';
import type { IconName } from '@/components/ui/Icon';

export const STATUS_META: Record<TaskStatus, { label: string; color: string }> = {
  pending: { label: '待处理', color: 'var(--kc-muted)' },
  in_progress: { label: '进行中', color: '#0a84ff' },
  completed: { label: '已完成', color: '#22c55e' },
  cancelled: { label: '已取消', color: 'var(--kc-muted)' }
};

export const PRIORITY_META: Record<TaskPriority, { code: string; label: string; color: string; bg: string }> = {
  urgent: { code: 'P0', label: '紧急', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  high: { code: 'P1', label: '重要', color: '#f97316', bg: 'rgba(249,115,22,0.12)' },
  normal: { code: 'P2', label: '普通', color: '#0a84ff', bg: 'rgba(10,132,255,0.12)' },
  low: { code: 'P3', label: '较低', color: '#94a3b8', bg: 'rgba(148,163,184,0.16)' }
};

// Display order: highest priority first (P0 → P3)
export const PRIORITY_ORDER: TaskPriority[] = ['urgent', 'high', 'normal', 'low'];

export const BOARD_COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: 'pending', label: '待处理' },
  { status: 'in_progress', label: '进行中' },
  { status: 'completed', label: '已完成' }
];

export interface TaskScopeNavItem {
  key: 'assigned' | 'watching' | 'created' | 'all' | 'completed' | 'activity';
  label: string;
  icon: IconName;
}

export const SCOPE_NAV: TaskScopeNavItem[] = [
  { key: 'assigned', label: '我负责的', icon: 'profile' },
  { key: 'watching', label: '我关注的', icon: 'eye' },
  { key: 'activity', label: '动态', icon: 'clock' }
];

export const QUICK_NAV: TaskScopeNavItem[] = [
  { key: 'all', label: '全部任务', icon: 'list' },
  { key: 'created', label: '我创建的', icon: 'edit' },
  { key: 'completed', label: '已完成', icon: 'check' }
];

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

export function formatTaskDate(value?: string | null, withTime = true): string {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const now = new Date();
  const sameYear = date.getFullYear() === now.getFullYear();
  const datePart = sameYear ? `${date.getMonth() + 1}月${date.getDate()}日` : `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
  if (!withTime) {
    return datePart;
  }
  return `${datePart} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function dueHasTime(value?: string | null): boolean {
  if (!value) {
    return false;
  }
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && !(date.getHours() === 0 && date.getMinutes() === 0);
}

export function formatDueLabel(value?: string | null): string {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const now = new Date();
  const dayOf = (d: Date): number => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((dayOf(date) - dayOf(now)) / 86400000);
  const hasTime = !(date.getHours() === 0 && date.getMinutes() === 0);
  let dayLabel: string;
  if (diff === 0) {
    dayLabel = '今天';
  } else if (diff === 1) {
    dayLabel = '明天';
  } else if (diff === -1) {
    dayLabel = '昨天';
  } else {
    const sameYear = date.getFullYear() === now.getFullYear();
    dayLabel = sameYear ? `${date.getMonth() + 1}月${date.getDate()}日` : `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
  }
  return hasTime ? `${dayLabel} ${pad(date.getHours())}:${pad(date.getMinutes())}` : dayLabel;
}

export function isOverdue(dueAt?: string | null, status?: TaskStatus): boolean {
  if (!dueAt || status === 'completed' || status === 'cancelled') {
    return false;
  }
  const date = new Date(dueAt);
  return !Number.isNaN(date.getTime()) && date.getTime() < Date.now();
}

export function taskIdLabel(id: number): string {
  return `t${String(id).padStart(6, '0')}`;
}

// Activity types shown in the task detail "评论" timeline (milestones only).
// All other detail goes to the global 动态 feed.
export const MILESTONE_ACTIVITY_TYPES = new Set(['created', 'completed', 'reopened', 'subtask_completed', 'subtask_reopened', 'assignee_added', 'assignee_removed']);

export function activityText(type: string, actorName: string, payload: Record<string, unknown> | undefined): string {
  const prefix = actorName ? `${actorName} ` : '';
  const due = payload && typeof payload.due_at === 'string' ? formatDueLabel(payload.due_at) : '空';
  switch (type) {
    case 'created':
      return `${prefix}创建了任务`;
    case 'completed':
      return `${prefix}完成了任务`;
    case 'reopened':
      return `${prefix}重新开启了任务`;
    case 'subtask_completed':
      return `${prefix}完成了子任务`;
    case 'subtask_reopened':
      return `${prefix}重新开启了子任务`;
    case 'status_changed':
      return `${prefix}更新了任务状态`;
    case 'assignee_added':
      return `${prefix}添加了任务负责人`;
    case 'assignee_removed':
      return `${prefix}移除了任务负责人`;
    case 'due_changed':
      return `${prefix}将任务截止时间设置为 ${due}`;
    case 'updated':
      return `${prefix}修改了任务`;
    default:
      return `${prefix}更新了任务`;
  }
}
