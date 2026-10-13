import type { TaskEventCardMetadata } from '@/types/api';
import { useKukeStore } from '@/store/kukeStore';
import { Icon } from '@/components/ui/Icon';
import { useIsDesktopLayout } from './taskHooks';
import { taskEventBody, taskEventTitle } from './taskPanelModel';
import { TaskEventCardDesktop } from './desktop/TaskCards';

interface TaskEventCardProps {
  event: TaskEventCardMetadata;
}

/** 任务小助手发来的通知卡片。桌面布局走 desktop/ 下的卡片；下面的旧界面留给移动端。 */
export function TaskEventCard({ event }: TaskEventCardProps): JSX.Element {
  const desktop = useIsDesktopLayout();
  return desktop ? <TaskEventCardDesktop event={event} /> : <TaskEventCardMobile event={event} />;
}

function TaskEventCardMobile({ event }: TaskEventCardProps): JSX.Element {
  const openChatTaskDetail = useKukeStore((state) => state.openChatTaskDetail);
  const openTaskCenter = useKukeStore((state) => state.openTaskCenter);

  return (
    <div className="w-[320px] max-w-full rounded-2xl border p-3.5 [background:var(--kc-panel)] [border-color:var(--kc-border)]">
      <div className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold [color:var(--kc-text)]">
        <Icon name="checkSquare" className="h-4 w-4 [color:var(--kc-accent)]" />
        {taskEventTitle(event)}
      </div>
      <p className="text-sm [color:var(--kc-muted)]">{taskEventBody(event)}</p>
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
