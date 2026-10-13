import { useEffect } from 'react';
import { Icon } from '@/components/ui/Icon';
import type { Task } from '@/types/api';
import { taskIdLabel } from '../taskConstants';
import { useToggleTask } from '../taskHooks';
import { useGroupTasks } from '../taskPanelHooks';
import { GROUP_TASK_FILTERS } from '../taskPanelModel';
import { AvatarStack, CheckMark, DueText, PriorityTag, cx, useEvent } from './parts';

interface GroupTasksDesktopProps {
  conversationId: number;
  groupName: string;
  onClose: () => void;
  onOpenTask: (taskId: number) => void;
  onCreateTask?: () => void;
}

function Row({ task, onOpen, onToggle }: { task: Task; onOpen: (taskId: number) => void; onToggle: (taskId: number, completed: boolean) => void }): JSX.Element {
  const completed = task.status === 'completed';
  return (
    <div
      role="button"
      tabIndex={0}
      className={cx('ktk-gt-row', completed && 'is-done')}
      onClick={() => onOpen(task.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && event.target === event.currentTarget) {
          onOpen(task.id);
        }
      }}
    >
      <CheckMark checked={completed} onToggle={() => onToggle(task.id, !completed)} />
      <span className="ktk-gt-main">
        <span className="ktk-gt-title">
          <span className="ktk-gt-name">{task.title}</span>
          {task.priority !== 'normal' ? <PriorityTag priority={task.priority} compact /> : null}
        </span>
        <span className="ktk-gt-meta">
          <span>{taskIdLabel(task.id)}</span>
          {(task.subtask_total ?? 0) > 0 ? <span>子任务 {task.subtask_done ?? 0}/{task.subtask_total}</span> : null}
          <DueText dueAt={task.due_at} status={task.status} suffix=" 截止" />
        </span>
      </span>
      <AvatarStack users={task.assignees} />
    </div>
  );
}

/** 聊天面板里的群任务侧栏（桌面）：这个群的任务进度，按状态筛选，点一条看详情。 */
export function GroupTasksDesktop({ conversationId, groupName, onClose, onOpenTask, onCreateTask }: GroupTasksDesktopProps): JSX.Element {
  const { filter, setFilter, isLoading, stats, progress, visible } = useGroupTasks(conversationId);
  const toggleTask = useToggleTask();
  const close = useEvent(onClose);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape' && !event.isComposing) {
        close();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [close]);

  return (
    <div className="ktk-layer">
      <div className="kui-drawer-backdrop" onClick={close} />
      <aside className="kui-drawer ktk-gt" role="dialog" aria-label="群任务">
        <header className="ktk-gt-bar">
          <div><h2>群任务</h2><p className="ktk-clip">{groupName}</p></div>
          {onCreateTask ? <button type="button" className="kui-btn kui-btn--primary kui-btn--sm" onClick={onCreateTask}><Icon name="plus" className="h-3.5 w-3.5" />新建</button> : null}
          <button type="button" className="kui-icon-btn" aria-label="关闭群任务" onClick={close}><Icon name="close" className="h-4 w-4" /></button>
        </header>

        <div className="ktk-gt-summary">
          <strong>{stats.done}<small>/ {stats.total}</small></strong>
          <div>
            <span className="ktk-meter" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: `${progress}%` }} /></span>
            <p>已完成 <b>{progress}%</b> · 进行中 <b>{stats.open}</b> · 逾期 <b className={stats.overdue ? 'is-danger' : undefined}>{stats.overdue}</b></p>
          </div>
        </div>

        <div className="ktk-gt-filter">
          <div className="kui-segment" role="radiogroup" aria-label="筛选">
            {GROUP_TASK_FILTERS.map((item) => (
              <button key={item.key} type="button" role="radio" aria-checked={filter === item.key} className={filter === item.key ? 'is-active' : undefined} onClick={() => setFilter(item.key)}>{item.label}</button>
            ))}
          </div>
        </div>

        <div className="ktk-gt-list kui-scroll">
          {isLoading ? <div className="kui-empty">加载中…</div> : visible.length === 0 ? (
            <div className="kui-empty">
              <Icon name="checkSquare" />
              <span>{filter === 'all' ? '本群还没有任务' : '没有符合条件的任务'}</span>
              {onCreateTask && filter === 'all' ? <button type="button" className="kui-btn kui-btn--primary" onClick={onCreateTask}>创建第一个任务</button> : null}
            </div>
          ) : visible.map((task) => <Row key={task.id} task={task} onOpen={onOpenTask} onToggle={toggleTask} />)}
        </div>
      </aside>
    </div>
  );
}
