import { useState, type CSSProperties } from 'react';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { ContextMenuItem } from '@/components/ui/ContextMenu';
import { Icon } from '@/components/ui/Icon';
import type { Task } from '@/types/api';
import { formatDueLabel, formatTaskDate, taskIdLabel } from '../taskConstants';
import { useToggleTask, type TaskCenterState } from '../taskHooks';
import { COL_LABELS, COL_ORDER, type ColKey, type DisplayGroup } from '../taskModel';
import { AvatarStack, CheckMark, DueText, InlineInput, MenuButton, PriorityTag, Progress, cx } from './parts';

/** 表格右侧的列（「子任务进度」不占一列，跟在标题后面）。 */
const RIGHT_COLS = COL_ORDER.filter((col) => col !== 'subtasks');

/**
 * 分组的标题：名字 + 数量。自定义分组（有 onRename）悬停时多一个菜单，可以改名、删除。
 * 列表里点标题是收起 / 展开，看板的列头不用收起，就不传 onToggle。
 */
export function GroupHead({ name, count, collapsed, onToggle, onRename, onDelete }: { name: string; count: number; collapsed?: boolean; onToggle?: () => void; onRename?: (name: string) => void; onDelete?: () => void }): JSX.Element {
  const [renaming, setRenaming] = useState(false);
  const label = <><span className="ktk-clip">{name}</span><span className="ktk-count">{count}</span></>;

  if (renaming && onRename) {
    return (
      <div className="ktk-group-head">
        <InlineInput
          initial={name}
          placeholder="分组名称"
          onCancel={() => setRenaming(false)}
          onSubmit={(next) => {
            setRenaming(false);
            onRename(next);
          }}
        />
      </div>
    );
  }

  return (
    <div className="ktk-group-head">
      {onToggle
        ? <button type="button" className="ktk-group-toggle" aria-expanded={!collapsed} onClick={onToggle}><Icon name="chevron" className={cx('ktk-caret', !collapsed && 'is-open')} />{label}</button>
        : <span className="ktk-group-toggle">{label}</span>}
      {onRename && onDelete ? (
        <MenuButton icon="more" title="分组操作">
          {(close) => (
            <>
              <ContextMenuItem icon="edit" label="重命名" onClick={() => {
                close();
                setRenaming(true);
              }} />
              <ContextMenuItem icon="trash" label="删除分组" danger onClick={() => {
                close();
                onDelete();
              }} />
            </>
          )}
        </MenuButton>
      ) : null}
    </div>
  );
}

/** 列表和看板末尾的「新建分组」：点了变成输入框。 */
export function NewGroupButton({ onCreate }: { onCreate: (name: string) => void }): JSX.Element {
  const [open, setOpen] = useState(false);
  if (open) {
    return (
      <InlineInput
        className="ktk-new-group"
        placeholder="分组名称"
        onCancel={() => setOpen(false)}
        onSubmit={(name) => {
          setOpen(false);
          onCreate(name);
        }}
      />
    );
  }
  return <button type="button" className="kui-btn kui-btn--ghost kui-btn--sm ktk-new-group" onClick={() => setOpen(true)}><Icon name="plus" className="h-3.5 w-3.5" />新建分组</button>;
}

function cell(col: ColKey, task: Task): JSX.Element | string {
  switch (col) {
    case 'assignees':
      return task.assignees.length > 0 ? <AvatarStack users={task.assignees} /> : '-';
    case 'creator':
      return <><Avatar user={task.creator ?? undefined} size="sm" /><span className="ktk-clip">{getDisplayName(task.creator)}</span></>;
    case 'start_at':
      return task.start_at ? formatDueLabel(task.start_at) : '-';
    case 'due_at':
      return task.due_at ? <DueText dueAt={task.due_at} status={task.status} /> : '-';
    case 'created_at':
      return formatTaskDate(task.created_at);
    case 'updated_at':
      return formatTaskDate(task.updated_at);
    default:
      return taskIdLabel(task.id);
  }
}

interface RowProps {
  task: Task;
  depth: number;
  center: TaskCenterState;
  cols: ColKey[];
  onToggle: (taskId: number, completed: boolean) => void;
}

/** 一行任务。有子任务的可以展开，子任务缩进一档接着排在下面。 */
function Row({ task, depth, center, cols, onToggle }: RowProps): JSX.Element {
  const completed = task.status === 'completed';
  const hasSubtasks = (task.subtask_total ?? 0) > 0;
  const expanded = !center.collapsedSubtasks.has(task.id);
  const open = (): void => center.setSelectedTaskId(task.id);

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        className={cx('ktk-row', completed && 'is-done', center.selectedTaskId === task.id && 'is-selected')}
        style={{ '--ktk-depth': depth } as CSSProperties}
        onClick={open}
        onKeyDown={(event) => {
          // 只认行本身上的回车；里面的勾选圈、展开箭头各有各的回车
          if (event.key === 'Enter' && event.target === event.currentTarget) {
            open();
          }
        }}
      >
        <span className="ktk-cell-title">
          {hasSubtasks ? (
            <button type="button" className="ktk-expander" aria-label={expanded ? '收起子任务' : '展开子任务'} aria-expanded={expanded} onClick={(event) => {
              event.stopPropagation();
              center.toggleExpand(task.id);
            }}><Icon name="chevron" className={cx('ktk-caret', expanded && 'is-open')} /></button>
          ) : <span className="ktk-expander" />}
          <CheckMark checked={completed} onToggle={() => onToggle(task.id, !completed)} />
          <span className="ktk-row-title">{task.title}</span>
          {task.priority !== 'normal' ? <PriorityTag priority={task.priority} /> : null}
          {hasSubtasks && center.visibleCols.has('subtasks') ? <Progress done={task.subtask_done ?? 0} total={task.subtask_total ?? 0} /> : null}
        </span>
        {cols.map((col) => <span key={col} className={`ktk-cell ktk-cell--${col}`}>{cell(col, task)}</span>)}
      </div>
      {expanded ? (center.subtasksByParent.get(task.id) ?? []).map((subtask) => <Row key={subtask.id} task={subtask} depth={depth + 1} center={center} cols={cols} onToggle={onToggle} />) : null}
    </>
  );
}

function Group({ group, center, cols, onToggle }: { group: DisplayGroup; center: TaskCenterState; cols: ColKey[]; onToggle: RowProps['onToggle'] }): JSX.Element {
  const custom = center.groupBy === 'custom';
  const collapsed = center.collapsed.has(group.key);
  // 自定义分组里只有用户自己建的能改名、删除；「默认分组」是固定的
  const editableId = custom && group.groupId != null ? group.groupId : null;
  return (
    <section className="ktk-group">
      <GroupHead
        name={group.name}
        count={group.items.length}
        collapsed={collapsed}
        onToggle={() => center.toggleCollapse(group.key)}
        onRename={editableId != null ? (name) => void center.renameGroup(editableId, name) : undefined}
        onDelete={editableId != null ? () => void center.deleteGroup(editableId) : undefined}
      />
      {collapsed ? null : (
        <div className="ktk-sheet">
          {group.items.map((task) => <Row key={task.id} task={task} depth={0} center={center} cols={cols} onToggle={onToggle} />)}
          {group.items.length === 0 ? <p className="ktk-sheet-empty">暂无任务</p> : null}
          {custom && center.canCreate ? <button type="button" className="ktk-sheet-add" onClick={() => center.openComposer(group.groupId ?? null)}><Icon name="plus" />新建任务</button> : null}
        </div>
      )}
    </section>
  );
}

/** 任务中心的列表视图：按当前的分组方式分成几段，每段是一张表。 */
export function TaskListView({ center }: { center: TaskCenterState }): JSX.Element {
  const toggleTask = useToggleTask();
  const cols = RIGHT_COLS.filter((col) => center.visibleCols.has(col));

  if (center.tasksLoading) {
    return <div className="kui-empty">加载中…</div>;
  }
  return (
    <>
      <div className="ktk-row ktk-row--head" aria-hidden="true">
        <span className="ktk-cell-title">任务标题</span>
        {cols.map((col) => <span key={col} className={`ktk-cell ktk-cell--${col}`}>{COL_LABELS[col]}</span>)}
      </div>
      {center.displayGroups.map((group) => <Group key={group.key} group={group} center={center} cols={cols} onToggle={toggleTask} />)}
      {center.displayGroups.length === 0 ? <div className="kui-empty">暂无任务</div> : null}
      {center.groupBy === 'custom' ? <NewGroupButton onCreate={(name) => void center.createGroup(name)} /> : null}
    </>
  );
}
