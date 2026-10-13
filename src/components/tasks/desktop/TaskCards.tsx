/** 聊天消息里的两种任务卡片（桌面）：任务本身的卡片，和任务小助手发来的通知。 */
import type { ReactNode, SyntheticEvent } from 'react';
import { Icon } from '@/components/ui/Icon';
import { useKukeStore } from '@/store/kukeStore';
import type { TaskEventCardMetadata, TaskShareCardMetadata } from '@/types/api';
import { useTaskCard } from '../taskPanelHooks';
import { taskEventBody, taskEventTitle } from '../taskPanelModel';
import { AvatarStack, CheckMark, DueText, PriorityTag, StatusTag, cx } from './parts';

function stop(event: SyntheticEvent): void {
  event.stopPropagation();
}

/** 卡片的外框和底部两个入口：看这条任务的详情、去任务中心。 */
function CardShell({ taskId, kicker, children }: { taskId: number; kicker: ReactNode; children: ReactNode }): JSX.Element {
  const openChatTaskDetail = useKukeStore((state) => state.openChatTaskDetail);
  const openTaskCenter = useKukeStore((state) => state.openTaskCenter);
  return (
    // 行上的双击是「引用」，在卡片里连点勾选圈不该触发它
    <div className="ktk-card" onDoubleClick={stop}>
      <div className="ktk-card-kicker"><Icon name="checkSquare" />{kicker}</div>
      {children}
      <div className="ktk-card-foot">
        <button type="button" className="kui-btn kui-btn--sm" onClick={() => openChatTaskDetail(taskId)}>查看详情</button>
        <button type="button" className="ktk-card-link" onClick={() => openTaskCenter('assigned')}>前往任务中心<Icon name="external" className="h-3 w-3" /></button>
      </div>
    </div>
  );
}

export function TaskShareCardDesktop({ card }: { card: TaskShareCardMetadata }): JSX.Element {
  const state = useTaskCard(card);
  const status = state.completed ? 'completed' : state.status;
  return (
    <CardShell taskId={card.task_id} kicker={<>创建任务<StatusTag status={status} /></>}>
      <div className="ktk-card-main">
        <CheckMark checked={state.completed} onToggle={state.toggle} />
        <p className={cx('ktk-card-title', state.completed && 'is-done')}>{state.title}</p>
      </div>
      <div className="ktk-card-meta">
        <PriorityTag priority={state.priority} />
        <DueText dueAt={state.dueAt} status={status} icon suffix=" 截止" />
      </div>
      {state.assignees.length > 0 ? (
        <div className="ktk-card-people">
          <AvatarStack people={state.assignees} max={4} />
          <span className="ktk-clip">{state.assignees.slice(0, 4).map((user) => user.name).join('、')}</span>
        </div>
      ) : null}
    </CardShell>
  );
}

export function TaskEventCardDesktop({ event }: { event: TaskEventCardMetadata }): JSX.Element {
  return (
    <CardShell taskId={event.task_id} kicker={taskEventTitle(event)}>
      <p className="ktk-card-text">{taskEventBody(event)}</p>
      <p className="ktk-card-ref">{event.title}</p>
    </CardShell>
  );
}
