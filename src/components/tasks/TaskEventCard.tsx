import type { TaskEventCardMetadata } from '@/types/api';
import { useKukeStore } from '@/store/kukeStore';
import { Icon } from '@/components/ui/Icon';
import { formatTaskDate } from './taskConstants';

interface TaskEventCardProps {
  event: TaskEventCardMetadata;
}

const EVENT_TITLE: Record<string, string> = {
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

function eventBody(event: TaskEventCardMetadata): string {
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

export function TaskEventCard({ event }: TaskEventCardProps): JSX.Element {
  const openChatTaskDetail = useKukeStore((state) => state.openChatTaskDetail);
  const openTaskCenter = useKukeStore((state) => state.openTaskCenter);

  return (
    <div className="w-[320px] max-w-full rounded-2xl border p-3.5 [background:var(--kc-panel)] [border-color:var(--kc-border)]">
      <div className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold [color:var(--kc-text)]">
        <Icon name="checkSquare" className="h-4 w-4 [color:var(--kc-accent)]" />
        {EVENT_TITLE[event.type] ?? '任务通知'}
      </div>
      <p className="text-sm [color:var(--kc-muted)]">{eventBody(event)}</p>
      <p className="mt-1.5 truncate text-sm font-medium [color:var(--kc-accent)]">{event.title}</p>

      <button
        type="button"
        onClick={() => openChatTaskDetail(event.task_id)}
        className="mt-3 w-full rounded-lg border py-1.5 text-xs [border-color:var(--kc-border)] hover:[background:var(--kc-hover)]"
      >
        查看详情
      </button>
      <button
        type="button"
        onClick={() => openTaskCenter('assigned')}
        className="mt-2 flex w-full items-center justify-between border-t pt-2 text-xs [border-color:var(--kc-border)] [color:var(--kc-muted)]"
      >
        前往任务中心查看更多
        <Icon name="external" className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
