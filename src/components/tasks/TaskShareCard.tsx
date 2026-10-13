import type { TaskShareCardMetadata } from '@/types/api';
import { useKukeStore } from '@/store/kukeStore';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { STATUS_META, formatDueLabel } from './taskConstants';
import { useIsDesktopLayout } from './taskHooks';
import { useTaskCard } from './taskPanelHooks';
import { PriorityBadge } from './taskWidgets';
import { TaskShareCardDesktop } from './desktop/TaskCards';

interface TaskShareCardProps {
  card: TaskShareCardMetadata;
}

/** 聊天消息里的任务卡片。桌面布局走 desktop/ 下的卡片；下面的旧界面留给移动端。 */
export function TaskShareCard({ card }: TaskShareCardProps): JSX.Element {
  const desktop = useIsDesktopLayout();
  return desktop ? <TaskShareCardDesktop card={card} /> : <TaskShareCardMobile card={card} />;
}

function TaskShareCardMobile({ card }: TaskShareCardProps): JSX.Element {
  const openChatTaskDetail = useKukeStore((state) => state.openChatTaskDetail);
  const openTaskCenter = useKukeStore((state) => state.openTaskCenter);
  const { title, status, priority, dueAt, completed, overdue, assignees, toggle } = useTaskCard(card);

  return (
    <div className="w-[320px] max-w-full rounded-2xl border p-4 [background:var(--kc-panel)] [border-color:var(--kc-border)]">
      <div className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold [color:var(--kc-accent)]">
        <Icon name="checkSquare" className="h-4 w-4" />
        创建任务
      </div>

      <div className="flex items-start gap-2.5">
        <button
          type="button"
          onClick={toggle}
          className={`mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border transition ${completed ? 'border-transparent [background:#22c55e]' : '[border-color:var(--kc-border)] hover:[border-color:var(--kc-accent)]'}`}
        >
          {completed ? <Icon name="check" className="h-3 w-3 text-white" /> : null}
        </button>
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-medium leading-5 ${completed ? 'line-through [color:var(--kc-muted)]' : '[color:var(--kc-text)]'}`}>{title}</p>
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs [color:var(--kc-muted)]">
        <PriorityBadge priority={priority} />
        <span style={{ color: STATUS_META[status].color }}>{STATUS_META[status].label}</span>
        {dueAt ? (
          <span className={`flex items-center gap-1 ${overdue ? 'text-red-500' : ''}`}>
            <Icon name="clock" className="h-3.5 w-3.5" />{formatDueLabel(dueAt)} 截止
          </span>
        ) : null}
      </div>

      {assignees.length ? (
        <div className="mt-2.5 flex items-center gap-1.5">
          <Icon name="profile" className="h-3.5 w-3.5 shrink-0 [color:var(--kc-muted)]" />
          <div className="flex flex-wrap gap-1">
            {assignees.slice(0, 4).map((user) => (
              <span key={user.id} className="flex items-center gap-1 rounded-full py-0.5 pl-0.5 pr-2 text-[11px] [background:var(--kc-panel-muted)] [color:var(--kc-text)]">
                <span className="[&>*]:!h-4 [&>*]:!w-4">
                  <Avatar label={user.name} avatarUrl={user.avatar_url} size="sm" />
                </span>
                <span className="max-w-[72px] truncate">{user.name}</span>
              </span>
            ))}
            {assignees.length > 4 ? <span className="text-[11px] [color:var(--kc-muted)]">+{assignees.length - 4}</span> : null}
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => openChatTaskDetail(card.task_id)}
        className="mt-3.5 w-full rounded-lg border py-2 text-xs font-medium [border-color:var(--kc-border)] [color:var(--kc-text)] hover:[background:var(--kc-hover)]"
      >
        查看详情
      </button>
      <button
        type="button"
        onClick={() => openTaskCenter('assigned')}
        className="mt-2 flex w-full items-center justify-between border-t pt-2.5 text-xs [border-color:var(--kc-border)] [color:var(--kc-muted)]"
      >
        前往任务中心查看更多
        <Icon name="external" className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
