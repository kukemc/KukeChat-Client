import { Icon } from '@/components/ui/Icon';
import { useBoardDrag, type TaskCenterState } from '../taskHooks';
import { colKey } from '../taskModel';
import { AvatarStack, DueText, PriorityTag, Progress, cx } from './parts';
import { GroupHead, NewGroupButton } from './TaskListView';

/** 任务中心的看板视图：一个自定义分组一列，把卡片拖到另一列就是改分组。 */
export function TaskBoardView({ center }: { center: TaskCenterState }): JSX.Element {
  const drag = useBoardDrag(center.boardColumns, (task, groupId) => void center.moveTask(task, groupId));

  return (
    <div className="ktk-board">
      {center.boardColumns.map((column) => {
        const key = colKey(column.id);
        const tasks = drag.tasksOf(column);
        const groupId = column.id;
        return (
          <section key={key} className={cx('ktk-col', drag.overColumn === key && 'is-over')} {...drag.columnProps(column)}>
            <GroupHead
              name={column.name}
              count={tasks.length}
              onRename={groupId != null ? (name) => void center.renameGroup(groupId, name) : undefined}
              onDelete={groupId != null ? () => void center.deleteGroup(groupId) : undefined}
            />
            <div className="ktk-col-body">
              {tasks.map((task) => {
                const hasSubtasks = (task.subtask_total ?? 0) > 0;
                return (
                  <div
                    key={task.id}
                    role="button"
                    tabIndex={0}
                    className={cx('ktk-bcard', task.status === 'completed' && 'is-done', center.selectedTaskId === task.id && 'is-selected')}
                    {...drag.cardProps(task)}
                    onClick={() => center.setSelectedTaskId(task.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        center.setSelectedTaskId(task.id);
                      }
                    }}
                  >
                    <p className="ktk-bcard-title">{task.title}</p>
                    {task.priority !== 'normal' || hasSubtasks ? (
                      <div className="ktk-bcard-row">
                        {task.priority !== 'normal' ? <PriorityTag priority={task.priority} /> : null}
                        {hasSubtasks ? <Progress done={task.subtask_done ?? 0} total={task.subtask_total ?? 0} /> : null}
                      </div>
                    ) : null}
                    {task.due_at || task.assignees.length > 0 ? (
                      <div className="ktk-bcard-row">
                        <DueText dueAt={task.due_at} status={task.status} icon />
                        <AvatarStack users={task.assignees} />
                      </div>
                    ) : null}
                  </div>
                );
              })}
              {tasks.length === 0 ? <p className="ktk-col-empty">拖动任务到这里</p> : null}
              {center.canCreate ? <button type="button" className="ktk-sheet-add" onClick={() => center.openComposer(column.id)}><Icon name="plus" />新建任务</button> : null}
            </div>
          </section>
        );
      })}
      <div className="ktk-col ktk-col--new"><NewGroupButton onCreate={(name) => void center.createGroup(name)} /></div>
    </div>
  );
}
