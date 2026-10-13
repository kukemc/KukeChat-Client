/** 群任务面板、聊天里的任务卡片、截止时间选择器两端共用的数据层。基础的 hook 在 taskHooks.ts。 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { completeTask, getTask, getTasks } from '@/api/tasks';
import type { Task, TaskCardAssignee, TaskPriority, TaskShareCardMetadata, TaskStatus } from '@/types/api';
import { isOverdue } from './taskConstants';
import { useRefreshTasks, useTaskRealtime } from './taskHooks';
import { pad2 } from './taskModel';
import { composeDue, filterGroupTasks, groupTaskStats, monthCells, type GroupTaskFilter, type GroupTaskStats } from './taskPanelModel';

/* ───────── 群任务 ───────── */

export interface GroupTasksState {
  filter: GroupTaskFilter;
  setFilter: (filter: GroupTaskFilter) => void;
  isLoading: boolean;
  stats: GroupTaskStats;
  /** 完成百分比，0–100 的整数 */
  progress: number;
  visible: Task[];
}

export function useGroupTasks(conversationId: number): GroupTasksState {
  const [filter, setFilter] = useState<GroupTaskFilter>('all');
  const queryKey = ['tasks', 'group-panel', conversationId];
  const tasksQuery = useQuery({
    queryKey,
    queryFn: () => getTasks({ scope: 'all', conversationId, includeCompleted: true, limit: 200 })
  });
  useTaskRealtime(queryKey);

  const topTasks = useMemo(() => (tasksQuery.data ?? []).filter((task) => !task.parent_id), [tasksQuery.data]);
  const stats = useMemo(() => groupTaskStats(topTasks), [topTasks]);
  const visible = useMemo(() => filterGroupTasks(topTasks, filter), [topTasks, filter]);

  return { filter, setFilter, isLoading: tasksQuery.isLoading, stats, progress: stats.total ? Math.round((stats.done / stats.total) * 100) : 0, visible };
}

/* ───────── 聊天里的任务卡片 ───────── */

export interface TaskCardState {
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt: string | null;
  completed: boolean;
  overdue: boolean;
  assignees: TaskCardAssignee[];
  toggle: () => void;
}

/** 卡片先用消息里固化的那份数据画出来，任务详情拉到后换成最新的；勾选是乐观更新。 */
export function useTaskCard(card: TaskShareCardMetadata): TaskCardState {
  const refresh = useRefreshTasks();
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const task = useQuery({
    queryKey: ['tasks', 'detail', card.task_id],
    queryFn: () => getTask(card.task_id),
    retry: false,
    staleTime: 15_000
  }).data ?? null;

  const status = task?.status ?? card.status ?? 'pending';
  const completed = optimistic ?? status === 'completed';
  const dueAt = task?.due_at ?? card.due_at ?? null;

  // 目标状态要当参数传进去，不能在 mutationFn 里现读 completed：onMutate 一改乐观状态组件就重渲染，
  // 还没发出去的这次请求会换成新的闭包，读到的已经是翻过来的值，发出去的就成了「保持原样」
  const toggleMutation = useMutation({
    mutationFn: (next: boolean) => completeTask(card.task_id, next),
    onMutate: (next) => setOptimistic(next),
    onSuccess: () => {
      setOptimistic(null);
      refresh();
    },
    onError: () => setOptimistic(null)
  });

  return {
    title: task?.title ?? card.title,
    status,
    priority: task?.priority ?? card.priority ?? 'normal',
    dueAt,
    completed,
    overdue: isOverdue(dueAt, completed ? 'completed' : status),
    assignees: task
      ? task.assignees.map((user) => ({ id: user.id, name: user.nickname ?? user.username ?? '', avatar_url: user.avatar_url }))
      : card.assignees ?? [],
    toggle: () => toggleMutation.mutate(!completed)
  };
}

/* ───────── 截止时间选择 ───────── */

export interface DuePickerState {
  viewMonth: Date;
  shiftMonth: (delta: number) => void;
  cells: Date[];
  hasTime: boolean;
  setHasTime: (hasTime: boolean) => void;
  time: string;
  setTime: (time: string) => void;
  pickDate: (date: Date) => void;
  pickQuick: (kind: 'today' | 'tomorrow') => void;
  setRemind: (offset: number | null) => void;
}

/** 截止时间选择器的状态。每改一处就把完整的（截止时间，提前提醒分钟数）报给调用方。 */
export function useDuePicker(dueAt: Date | null, remindOffset: number | null, onChange: (dueAt: Date | null, remindOffset: number | null) => void): DuePickerState {
  const [viewMonth, setViewMonth] = useState(() => {
    const base = dueAt ?? new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });
  // 0 点整当作「只有日期」
  const [hasTime, setHasTimeState] = useState(() => (dueAt ? !(dueAt.getHours() === 0 && dueAt.getMinutes() === 0) : true));
  const [time, setTimeState] = useState(() => (dueAt ? `${pad2(dueAt.getHours())}:${pad2(dueAt.getMinutes())}` : '18:00'));
  const cells = useMemo(() => monthCells(viewMonth), [viewMonth]);

  function emit(date: Date | null, nextHasTime: boolean, nextTime: string, nextRemind: number | null): void {
    if (date) {
      onChange(composeDue(date, nextHasTime, nextTime), nextRemind);
    } else {
      onChange(null, null);
    }
  }

  return {
    viewMonth,
    shiftMonth: (delta) => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + delta, 1)),
    cells,
    hasTime,
    setHasTime: (next) => {
      setHasTimeState(next);
      if (dueAt) {
        emit(dueAt, next, time, remindOffset);
      }
    },
    time,
    setTime: (next) => {
      setTimeState(next);
      if (dueAt) {
        emit(dueAt, true, next, remindOffset);
      }
    },
    pickDate: (date) => emit(date, hasTime, time, remindOffset),
    pickQuick: (kind) => {
      const date = new Date();
      if (kind === 'tomorrow') {
        date.setDate(date.getDate() + 1);
      }
      setViewMonth(new Date(date.getFullYear(), date.getMonth(), 1));
      emit(date, hasTime, time, remindOffset);
    },
    setRemind: (offset) => emit(dueAt, hasTime, time, offset)
  };
}
