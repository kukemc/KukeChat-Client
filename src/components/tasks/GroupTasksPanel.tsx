import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { completeTask, getTasks } from '@/api/tasks';
import { subscribeRealtimeEvents } from '@/realtime/events';
import type { Task } from '@/types/api';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { PRIORITY_META, formatDueLabel, isOverdue, taskIdLabel } from './taskConstants';

type FilterKey = 'all' | 'open' | 'completed' | 'overdue';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'open', label: '进行中' },
  { key: 'completed', label: '已完成' },
  { key: 'overdue', label: '逾期' }
];

interface GroupTasksPanelProps {
  conversationId: number;
  groupName: string;
  onClose: () => void;
  onOpenTask: (taskId: number) => void;
  onCreateTask?: () => void;
}

function TaskRow({ task, onOpenTask }: { task: Task; onOpenTask: (id: number) => void }): JSX.Element {
  const queryClient = useQueryClient();
  const completed = task.status === 'completed';
  const overdue = isOverdue(task.due_at, task.status);
  const priority = PRIORITY_META[task.priority];
  const toggle = useMutation({
    mutationFn: () => completeTask(task.id, !completed),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['tasks'] })
  });
  return (
    <button
      type="button"
      onClick={() => onOpenTask(task.id)}
      className="flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition [border-color:var(--kc-border)] hover:[background:var(--kc-hover)]"
    >
      <span
        role="button"
        tabIndex={0}
        onClick={(event) => { event.stopPropagation(); toggle.mutate(); }}
        className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border ${completed ? 'border-transparent [background:#22c55e]' : '[border-color:var(--kc-border)] hover:[border-color:var(--kc-accent)]'}`}
      >
        {completed ? <Icon name="check" className="h-3 w-3 text-white" /> : null}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-center gap-1.5">
          <span className={`truncate text-sm ${completed ? 'line-through [color:var(--kc-muted)]' : '[color:var(--kc-text)]'}`}>{task.title}</span>
          {task.priority !== 'normal' ? (
            <span className="shrink-0 rounded px-1 py-0.5 text-[10px] font-bold" style={{ color: priority.color, background: priority.bg }}>{priority.code}</span>
          ) : null}
        </span>
        <span className="flex items-center gap-2 text-[11px] [color:var(--kc-muted)]">
          <span className="[color:var(--kc-muted)]">{taskIdLabel(task.id)}</span>
          {(task.subtask_total ?? 0) > 0 ? <span className="inline-flex items-center gap-0.5"><Icon name="checkSquare" className="h-3 w-3" />{task.subtask_done ?? 0}/{task.subtask_total}</span> : null}
          {task.due_at ? <span className={overdue ? 'text-red-500' : ''}>{formatDueLabel(task.due_at)}</span> : null}
        </span>
      </span>
      {task.assignees.length ? (
        <span className="flex shrink-0 -space-x-1.5">
          {task.assignees.slice(0, 3).map((user) => <Avatar key={user.id} user={user} size="sm" />)}
        </span>
      ) : null}
    </button>
  );
}

export function GroupTasksPanel({ conversationId, groupName, onClose, onOpenTask, onCreateTask }: GroupTasksPanelProps): JSX.Element {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<FilterKey>('all');

  const tasksQuery = useQuery({
    queryKey: ['tasks', 'group-panel', conversationId],
    queryFn: () => getTasks({ scope: 'all', conversationId, includeCompleted: true, limit: 200 })
  });

  useEffect(() => {
    const unsubscribe = subscribeRealtimeEvents((event) => {
      if (event.rawType === 'task.changed') {
        void queryClient.invalidateQueries({ queryKey: ['tasks', 'group-panel', conversationId] });
      }
    });
    return unsubscribe;
  }, [queryClient, conversationId]);

  const topTasks = useMemo(() => (tasksQuery.data ?? []).filter((task) => !task.parent_id), [tasksQuery.data]);

  const stats = useMemo(() => {
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
  }, [topTasks]);

  const visible = useMemo(() => {
    switch (filter) {
      case 'open':
        return topTasks.filter((task) => task.status !== 'completed' && task.status !== 'cancelled');
      case 'completed':
        return topTasks.filter((task) => task.status === 'completed');
      case 'overdue':
        return topTasks.filter((task) => isOverdue(task.due_at, task.status));
      default:
        return topTasks;
    }
  }, [topTasks, filter]);

  const progress = stats.total ? Math.round((stats.done / stats.total) * 100) : 0;

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onClose}>
      <div className="flex h-full w-full max-w-[440px] flex-col [background:var(--kc-panel)]" onClick={(event) => event.stopPropagation()}>
        {/* header */}
        <div className="flex items-center justify-between border-b px-5 py-4 [border-color:var(--kc-border)]">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-base font-semibold [color:var(--kc-text)]"><Icon name="checkSquare" className="h-4 w-4 [color:var(--kc-accent)]" /> 群任务</h2>
            <p className="mt-0.5 truncate text-xs [color:var(--kc-muted)]">{groupName}</p>
          </div>
          <div className="flex items-center gap-1">
            {onCreateTask ? (
              <button type="button" onClick={onCreateTask} className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-white [background:var(--kc-accent)]"><Icon name="plus" className="h-3.5 w-3.5" /> 新建</button>
            ) : null}
            <button type="button" onClick={onClose} className="kc-icon-button h-8 w-8" aria-label="关闭群任务"><Icon name="close" className="h-4 w-4" /></button>
          </div>
        </div>

        {/* progress + stats */}
        <div className="border-b px-5 py-4 [border-color:var(--kc-border)]">
          <div className="flex items-center justify-between text-xs [color:var(--kc-muted)]">
            <span>完成进度</span>
            <span className="font-semibold [color:var(--kc-text)]">{stats.done}/{stats.total} · {progress}%</span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full [background:var(--kc-hover)]">
            <span className="block h-full rounded-full [background:#22c55e] transition-all" style={{ width: `${progress}%` }} />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg py-2 [background:var(--kc-hover)]"><div className="text-base font-bold [color:var(--kc-text)]">{stats.open}</div><div className="text-[11px] [color:var(--kc-muted)]">进行中</div></div>
            <div className="rounded-lg py-2 [background:var(--kc-hover)]"><div className="text-base font-bold [color:var(--kc-text)]">{stats.done}</div><div className="text-[11px] [color:var(--kc-muted)]">已完成</div></div>
            <div className="rounded-lg py-2 [background:var(--kc-hover)]"><div className={`text-base font-bold ${stats.overdue ? 'text-red-500' : '[color:var(--kc-text)]'}`}>{stats.overdue}</div><div className="text-[11px] [color:var(--kc-muted)]">逾期</div></div>
          </div>
        </div>

        {/* filter tabs */}
        <div className="flex gap-1 border-b px-5 py-2 [border-color:var(--kc-border)]">
          {FILTERS.map((item) => (
            <button key={item.key} type="button" onClick={() => setFilter(item.key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${filter === item.key ? '[background:var(--kc-accent)] text-white' : '[color:var(--kc-muted)] hover:[background:var(--kc-hover)]'}`}>
              {item.label}
            </button>
          ))}
        </div>

        {/* list */}
        <div className="scroll-soft min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {tasksQuery.isLoading ? (
            <p className="py-10 text-center text-sm [color:var(--kc-muted)]">加载中…</p>
          ) : visible.length === 0 ? (
            <div className="py-14 text-center">
              <Icon name="checkSquare" className="mx-auto h-8 w-8 [color:var(--kc-muted)]" />
              <p className="mt-2 text-sm [color:var(--kc-muted)]">{filter === 'all' ? '本群还没有任务' : '没有符合条件的任务'}</p>
              {onCreateTask && filter === 'all' ? <button type="button" onClick={onCreateTask} className="mt-3 rounded-lg px-3 py-1.5 text-sm font-medium text-white [background:var(--kc-accent)]">创建第一个任务</button> : null}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {visible.map((task) => <TaskRow key={task.id} task={task} onOpenTask={onOpenTask} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
