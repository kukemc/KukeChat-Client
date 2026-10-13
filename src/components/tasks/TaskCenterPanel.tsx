import { useState, type ReactNode } from 'react';
import type { Task, TaskActivity, User } from '@/types/api';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { QUICK_NAV, SCOPE_NAV, activityText, formatDueLabel, isOverdue } from './taskConstants';
import { useBoardDrag, useTaskCenter } from './taskHooks';
import { COL_LABELS, COL_ORDER, FILTER_LABELS, GROUP_LABELS, NAV_TITLES, SORT_LABELS, colKey, type ColKey, type DisplayGroup, type GroupColumn, type GroupKey, type NavKey, type SortKey, type ViewMode } from './taskModel';
import { PriorityBadge } from './taskWidgets';
import { TaskEditorModal } from './TaskEditorModal';
import { TaskDetailPanel } from './TaskDetailPanel';
import { TaskCenterDesktop } from './desktop/TaskCenterDesktop';

interface TaskCenterPanelProps {
  currentUser: User;
  isMobile?: boolean;
  onMobileBack?: () => void;
}

type MobileTaskPanel = 'options' | null;
type IconName = Parameters<typeof Icon>[0]['name'];

/** 任务中心。桌面布局走 desktop/ 下的界面；这个文件余下的部分都是移动端的。数据层两端共用（taskHooks.ts）。 */
export function TaskCenterPanel({ currentUser, isMobile, onMobileBack }: TaskCenterPanelProps): JSX.Element {
  return isMobile ? <TaskCenterMobile currentUser={currentUser} onMobileBack={onMobileBack} /> : <TaskCenterDesktop currentUser={currentUser} />;
}

function TaskCenterMobile({ currentUser, onMobileBack }: Omit<TaskCenterPanelProps, 'isMobile'>): JSX.Element {
  const center = useTaskCenter();
  const { nav, setNav, view, setView, statusFilter, setStatusFilter, sortBy, setSortBy, groupBy, setGroupBy, visibleCols, toggleCol, collapsed, toggleCollapse, selectedTaskId, setSelectedTaskId, displayGroups, boardColumns, canCreate, openComposer, composer } = center;
  const [mobilePanel, setMobilePanel] = useState<MobileTaskPanel>(null);

  const mobileTasks = displayGroups.flatMap((group) => group.items.map((task) => ({ task, groupName: group.name })));
  return (
    <section className="kc-mobile-task-page flex h-full min-h-0 flex-col overflow-hidden [background:var(--kc-mobile-bg)] [color:var(--kc-text)]">
      <header className="shrink-0 px-4 pb-3 pt-[max(44px,env(safe-area-inset-top))] [background:var(--kc-mobile-bg)]">
        <div className="flex items-center gap-3">
          {onMobileBack ? <button type="button" onClick={onMobileBack} className="kc-mobile-back-button grid h-10 w-10 shrink-0 place-items-center rounded-full [background:var(--kc-panel-muted)] [color:var(--kc-text)]" aria-label="返回空间"><Icon name="chevronLeft" className="h-5 w-5" /></button> : null}
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[22px] font-black tracking-tight">任务系统</h2>
            <p className="mt-0.5 truncate text-[12px] font-semibold [color:var(--kc-muted)]">{NAV_TITLES[nav]} · {view === 'board' ? '看板' : view === 'dashboard' ? '仪表盘' : '列表'} · {mobileTasks.length} 项</p>
          </div>
          {nav !== 'activity' ? <button type="button" data-mobile-task-options-button="true" onClick={() => setMobilePanel('options')} className="kc-mobile-task-options-trigger grid h-10 w-10 shrink-0 place-items-center rounded-full [background:var(--kc-panel-muted)] [color:var(--kc-text)]" aria-label="视图和筛选"><Icon name="settings" className="h-5 w-5" /></button> : null}
          {canCreate ? <button type="button" onClick={() => openComposer(null)} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-white [background:var(--kc-accent)]" aria-label="新建任务"><Icon name="plus" className="h-5 w-5" /></button> : null}
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {[...SCOPE_NAV, ...QUICK_NAV].map((item) => (
            <button key={item.key} type="button" onClick={() => setNav(item.key as NavKey)} className={`kc-mobile-task-filter-chip shrink-0 rounded-full px-3 py-2 text-[12px] font-black transition ${nav === item.key ? 'kc-mobile-task-filter-chip-active text-white [background:var(--kc-accent)]' : '[background:var(--kc-panel)] [color:var(--kc-muted)]'}`}>
              {item.label}
            </button>
          ))}
        </div>
        {nav !== 'activity' ? (
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {(['list', 'board', 'dashboard'] as ViewMode[]).map((mode) => (
              <button key={mode} type="button" onClick={() => setView(mode)} className={`kc-mobile-task-filter-chip shrink-0 rounded-full px-3 py-1.5 text-[12px] font-bold transition ${view === mode ? 'kc-mobile-task-filter-chip-active [background:var(--kc-accent-soft)] [color:var(--kc-accent)]' : '[background:var(--kc-panel-muted)] [color:var(--kc-muted)]'}`}>
                {mode === 'dashboard' ? '概览' : mode === 'board' ? '看板' : '任务列表'}
              </button>
            ))}
            {(['open', 'completed', 'all'] as const).map((key) => (
              <button key={key} type="button" onClick={() => setStatusFilter(key)} className={`kc-mobile-task-filter-chip shrink-0 rounded-full px-3 py-1.5 text-[12px] font-bold transition ${statusFilter === key ? 'kc-mobile-task-filter-chip-active [background:var(--kc-accent-soft)] [color:var(--kc-accent)]' : '[background:var(--kc-panel-muted)] [color:var(--kc-muted)]'}`}>
                {FILTER_LABELS[key]}
              </button>
            ))}
          </div>
        ) : null}
      </header>

      <main className="scroll-soft min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom,0px)+18px)] pt-2">
        {nav === 'activity' ? (
          <MobileActivityFeed activities={center.activities} onOpenTask={setSelectedTaskId} />
        ) : view === 'dashboard' ? (
          <MobileTaskDashboard data={center.dashboard} />
        ) : view === 'board' ? (
          <MobileTaskBoard columns={boardColumns} onOpenTask={setSelectedTaskId} onMove={center.moveTask} onCreateInGroup={canCreate ? openComposer : undefined} onCreateGroup={center.createGroup} onRenameGroup={center.renameGroup} onDeleteGroup={center.deleteGroup} />
        ) : center.tasksLoading ? (
          <p className="py-12 text-center text-sm [color:var(--kc-muted)]">加载中...</p>
        ) : (
          <MobileTaskGroupedList groups={displayGroups} groupBy={groupBy} collapsed={collapsed} onToggleCollapse={toggleCollapse} onOpenTask={setSelectedTaskId} onCreateInGroup={canCreate ? openComposer : undefined} onCreateGroup={center.createGroup} onRenameGroup={center.renameGroup} onDeleteGroup={center.deleteGroup} />
        )}
      </main>

      {mobilePanel === 'options' ? (
        <MobileTaskOptionsPanel view={view} onViewChange={setView} statusFilter={statusFilter} onStatusFilterChange={setStatusFilter} sortBy={sortBy} onSortByChange={setSortBy} groupBy={groupBy} onGroupByChange={setGroupBy} visibleCols={visibleCols} onToggleCol={toggleCol} onClose={() => setMobilePanel(null)} />
      ) : null}

      {selectedTaskId != null ? (
        <div className="fixed inset-0 z-[2147483647] [background:var(--kc-mobile-bg)]" onClick={() => setSelectedTaskId(null)}>
          <div className="h-full w-full [background:var(--kc-panel)]" onClick={(event) => event.stopPropagation()}>
            <TaskDetailPanel taskId={selectedTaskId} currentUser={currentUser} isMobile onClose={() => setSelectedTaskId(null)} onOpenTask={setSelectedTaskId} onCreateSubtask={center.openSubtaskComposer} />
          </div>
        </div>
      ) : null}

      {composer ? (
        <TaskEditorModal conversationId={composer.conversationId} currentUser={currentUser} defaultParentId={composer.parentId} initialGroupId={composer.groupId} onClose={center.closeComposer} onCreated={center.refresh} />
      ) : null}
    </section>
  );
}

function GroupHeaderMenu({ name, onRename, onDelete }: { name: string; onRename: (name: string) => void; onDelete: () => void }): JSX.Element {
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [value, setValue] = useState(name);
  if (renaming) {
    return (
      <input
        autoFocus
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => { if (event.key === 'Enter') { onRename(value); setRenaming(false); } if (event.key === 'Escape') { setRenaming(false); setValue(name); } }}
        onBlur={() => { onRename(value); setRenaming(false); }}
        onClick={(event) => event.stopPropagation()}
        className="w-32 rounded-md border px-1.5 py-0.5 text-xs outline-none [background:var(--kc-panel)] [border-color:var(--kc-border)] [color:var(--kc-text)]"
      />
    );
  }
  return (
    <span className="relative">
      <button type="button" onClick={(event) => { event.stopPropagation(); setOpen((v) => !v); }} className="grid h-5 w-5 place-items-center rounded opacity-0 hover:[background:var(--kc-hover)] group-hover/grp:opacity-100">
        <Icon name="more" className="h-3.5 w-3.5 [color:var(--kc-muted)]" />
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-[60]" onMouseDown={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-[61] mt-1 w-28 rounded-xl border p-1 shadow-lg [background:var(--kc-panel)] [border-color:var(--kc-border)]">
            <button type="button" onClick={(event) => { event.stopPropagation(); setRenaming(true); setValue(name); setOpen(false); }} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:[background:var(--kc-hover)] [color:var(--kc-text)]"><Icon name="edit" className="h-3.5 w-3.5" /> 重命名</button>
            <button type="button" onClick={(event) => { event.stopPropagation(); onDelete(); setOpen(false); }} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-red-500 hover:[background:var(--kc-hover)]"><Icon name="trash" className="h-3.5 w-3.5" /> 删除</button>
          </div>
        </>
      ) : null}
    </span>
  );
}

function NewGroupButton({ onCreate, variant }: { onCreate: (name: string) => void; variant: 'list' | 'board' }): JSX.Element {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  function submit(): void {
    const trimmed = name.trim();
    if (trimmed) {
      onCreate(trimmed);
    }
    setName('');
    setOpen(false);
  }
  if (open) {
    return (
      <div className={`flex items-center gap-1 ${variant === 'board' ? 'w-64 shrink-0' : ''}`}>
        <input
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); submit(); } if (event.key === 'Escape') { setOpen(false); setName(''); } }}
          onBlur={submit}
          placeholder="分组名称"
          className="min-w-0 flex-1 rounded-md border px-2 py-1 text-xs outline-none [background:var(--kc-panel)] [border-color:var(--kc-border)] [color:var(--kc-text)]"
        />
      </div>
    );
  }
  return (
    <button type="button" onClick={() => setOpen(true)} className={`flex items-center gap-1 text-sm [color:var(--kc-muted)] hover:[color:var(--kc-text)] ${variant === 'board' ? 'w-64 shrink-0 justify-start pt-1' : ''}`}>
      <Icon name="plus" className="h-4 w-4" /> 新建分组
    </button>
  );
}

function MobileTaskDashboard({ data }: { data?: { total: number; pending: number; in_progress: number; completed: number; overdue: number; due_today: number; due_soon: number } }): JSX.Element {
  if (!data) {
    return <p className="py-12 text-center text-sm [color:var(--kc-muted)]">加载中...</p>;
  }
  const cards = [
    { label: '全部', value: data.total, icon: 'checkSquare' as IconName },
    { label: '待处理', value: data.pending, icon: 'clock' as IconName },
    { label: '进行中', value: data.in_progress, icon: 'signal' as IconName },
    { label: '已完成', value: data.completed, icon: 'check' as IconName },
    { label: '逾期', value: data.overdue, icon: 'flag' as IconName },
    { label: '今日到期', value: data.due_today, icon: 'bell' as IconName }
  ];
  return (
    <div className="grid grid-cols-2 gap-3">
      {cards.map((card) => (
        <div key={card.label} className="kc-mobile-task-card p-4">
          <span className="grid h-10 w-10 place-items-center rounded-[16px] [background:var(--kc-accent-soft)] [color:var(--kc-accent)]"><Icon name={card.icon} className="h-5 w-5" /></span>
          <p className="mt-3 text-[12px] font-bold [color:var(--kc-muted)]">{card.label}</p>
          <p className="mt-1 text-[26px] font-black [color:var(--kc-text)]">{card.value}</p>
        </div>
      ))}
    </div>
  );
}

function MobileTaskCard({ task, groupName, onOpenTask }: { task: Task; groupName: string; onOpenTask: (id: number) => void }): JSX.Element {
  const completed = task.status === 'completed';
  const overdue = task.due_at ? isOverdue(task.due_at, task.status) : false;
  return (
    <button type="button" onClick={() => onOpenTask(task.id)} className="kc-mobile-task-card w-full p-4 text-left active:scale-[0.99]">
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border ${completed ? 'border-transparent [background:#22c55e]' : '[border-color:var(--kc-border)] [background:var(--kc-panel-muted)]'}`}>
          {completed ? <Icon name="check" className="h-4 w-4 text-white" /> : null}
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block text-[16px] font-black leading-6 ${completed ? 'line-through [color:var(--kc-muted)]' : '[color:var(--kc-text)]'}`}>{task.title}</span>
          <span className="mt-1 flex flex-wrap items-center gap-2 text-[12px] font-semibold [color:var(--kc-muted)]">
            <span>{groupName}</span>
            <span>·</span>
            <span className={overdue ? 'text-red-500' : ''}>{task.due_at ? formatDueLabel(task.due_at) : '无截止时间'}</span>
            {task.subtask_total ? <span>· 子任务 {task.subtask_done}/{task.subtask_total}</span> : null}
          </span>
          <span className="mt-3 flex flex-wrap items-center gap-2">
            {task.priority !== 'normal' ? <PriorityBadge priority={task.priority} /> : null}
            {task.assignees.slice(0, 4).map((user) => <Avatar key={user.id} user={user} size="sm" />)}
          </span>
        </span>
        <Icon name="chevron" className="mt-1 h-4 w-4 shrink-0 [color:var(--kc-muted)]" />
      </div>
    </button>
  );
}

function MobileTaskGroupedList({ groups, groupBy, collapsed, onToggleCollapse, onOpenTask, onCreateInGroup, onCreateGroup, onRenameGroup, onDeleteGroup }: {
  groups: DisplayGroup[];
  groupBy: GroupKey;
  collapsed: Set<string>;
  onToggleCollapse: (key: string) => void;
  onOpenTask: (id: number) => void;
  onCreateInGroup?: (groupId: number | null) => void;
  onCreateGroup: (name: string) => void;
  onRenameGroup: (groupId: number, name: string) => void;
  onDeleteGroup: (groupId: number) => void;
}): JSX.Element {
  const isCustom = groupBy === 'custom';
  const total = groups.reduce((sum, group) => sum + group.items.length, 0);
  if (total === 0) {
    return (
      <div className="kc-mobile-task-card grid place-items-center px-5 py-12 text-center">
        <Icon name="checkSquare" className="h-10 w-10 [color:var(--kc-muted)]" />
        <p className="mt-3 text-sm font-black [color:var(--kc-muted)]">暂无任务</p>
      </div>
    );
  }
  return (
    <div className="grid gap-4">
      {groups.map((group) => {
        const isCollapsed = collapsed.has(group.key);
        const editableGroupId = isCustom && group.groupId != null ? group.groupId : null;
        return (
          <section key={group.key} className="grid gap-2">
            <div className="flex items-center justify-between gap-2 px-1">
              <button type="button" onClick={() => onToggleCollapse(group.key)} className="flex min-w-0 items-center gap-2 text-left">
                <Icon name="chevron" className={`h-4 w-4 shrink-0 [color:var(--kc-muted)] transition ${isCollapsed ? '' : 'rotate-90'}`} />
                <span className="truncate text-[14px] font-black [color:var(--kc-text)]">{group.name}</span>
                <span className="rounded-full px-2 py-0.5 text-[11px] font-bold [background:var(--kc-panel-muted)] [color:var(--kc-muted)]">{group.items.length}</span>
              </button>
              <div className="flex shrink-0 items-center gap-1">
                {editableGroupId != null ? <GroupHeaderMenu name={group.name} onRename={(name) => onRenameGroup(editableGroupId, name)} onDelete={() => onDeleteGroup(editableGroupId)} /> : null}
                {isCustom && onCreateInGroup ? <button type="button" onClick={() => onCreateInGroup(group.groupId ?? null)} className="grid h-8 w-8 place-items-center rounded-full [background:var(--kc-panel-muted)] [color:var(--kc-accent)]" aria-label="在分组中新建任务"><Icon name="plus" className="h-4 w-4" /></button> : null}
              </div>
            </div>
            {!isCollapsed ? (
              <div className="grid gap-3">
                {group.items.map((task) => <MobileTaskCard key={task.id} task={task} groupName={group.name} onOpenTask={onOpenTask} />)}
              </div>
            ) : null}
          </section>
        );
      })}
      {isCustom ? <div className="kc-mobile-task-card p-3"><NewGroupButton onCreate={onCreateGroup} variant="list" /></div> : null}
    </div>
  );
}

function MobileTaskBoard({ columns, onOpenTask, onMove, onCreateInGroup, onCreateGroup, onRenameGroup, onDeleteGroup }: {
  columns: GroupColumn[];
  onOpenTask: (id: number) => void;
  onMove: (task: Task, groupId: number | null) => void;
  onCreateInGroup?: (groupId: number | null) => void;
  onCreateGroup: (name: string) => void;
  onRenameGroup: (groupId: number, name: string) => void;
  onDeleteGroup: (groupId: number) => void;
}): JSX.Element {
  const drag = useBoardDrag(columns, onMove);

  return (
    <div className="flex snap-x gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {columns.map((column) => {
        const key = colKey(column.id);
        const allTasks = drag.tasksOf(column);
        return (
          <section key={key} {...drag.columnProps(column)} className={`kc-mobile-task-board-column w-[82vw] shrink-0 snap-start rounded-[24px] border p-3 transition [background:var(--kc-panel)] [border-color:var(--kc-border)] ${drag.overColumn === key ? 'ring-2 ring-[var(--kc-accent)]' : ''}`}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h3 className="truncate text-[15px] font-black [color:var(--kc-text)]">{column.name}</h3>
                <p className="text-[11px] font-bold [color:var(--kc-muted)]">{allTasks.length} 项任务</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {column.id != null ? <GroupHeaderMenu name={column.name} onRename={(name) => onRenameGroup(column.id as number, name)} onDelete={() => onDeleteGroup(column.id as number)} /> : null}
                {onCreateInGroup ? <button type="button" onClick={() => onCreateInGroup(column.id)} className="grid h-8 w-8 place-items-center rounded-full [background:var(--kc-panel-muted)] [color:var(--kc-accent)]" aria-label="在看板列中新建任务"><Icon name="plus" className="h-4 w-4" /></button> : null}
              </div>
            </div>
            <div className="grid gap-2">
              {allTasks.map((task) => <MobileBoardTaskCard key={task.id} task={task} onOpenTask={onOpenTask} onDragStart={drag.cardProps(task).onDragStart} onDragEnd={drag.cardProps(task).onDragEnd} />)}
              {allTasks.length === 0 ? <div className="rounded-2xl border border-dashed px-4 py-8 text-center text-[12px] font-bold [border-color:var(--kc-border)] [color:var(--kc-muted)]">拖动任务到这里</div> : null}
            </div>
          </section>
        );
      })}
      <section className="w-[72vw] shrink-0 snap-start rounded-[24px] border border-dashed p-4 [border-color:var(--kc-border)] [background:var(--kc-panel-muted)]">
        <NewGroupButton onCreate={onCreateGroup} variant="board" />
      </section>
    </div>
  );
}

function MobileBoardTaskCard({ task, onOpenTask, onDragStart, onDragEnd }: { task: Task; onOpenTask: (id: number) => void; onDragStart: () => void; onDragEnd: () => void }): JSX.Element {
  const completed = task.status === 'completed';
  const overdue = task.due_at ? isOverdue(task.due_at, task.status) : false;
  return (
    <button type="button" draggable onDragStart={onDragStart} onDragEnd={onDragEnd} onClick={() => onOpenTask(task.id)} className="kc-mobile-task-card w-full cursor-grab p-3 text-left active:cursor-grabbing active:scale-[0.99]">
      <span className={`block text-[14px] font-black leading-5 ${completed ? 'line-through [color:var(--kc-muted)]' : '[color:var(--kc-text)]'}`}>{task.title}</span>
      <span className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-semibold [color:var(--kc-muted)]">
        {task.priority !== 'normal' ? <PriorityBadge priority={task.priority} /> : null}
        <span className={overdue ? 'text-red-500' : ''}>{task.due_at ? formatDueLabel(task.due_at) : '无截止'}</span>
        {task.subtask_total ? <span>子任务 {task.subtask_done}/{task.subtask_total}</span> : null}
      </span>
    </button>
  );
}

function MobileTaskOptionsPanel({ view, onViewChange, statusFilter, onStatusFilterChange, sortBy, onSortByChange, groupBy, onGroupByChange, visibleCols, onToggleCol, onClose }: {
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
  statusFilter: 'open' | 'completed' | 'all';
  onStatusFilterChange: (value: 'open' | 'completed' | 'all') => void;
  sortBy: SortKey;
  onSortByChange: (value: SortKey) => void;
  groupBy: GroupKey;
  onGroupByChange: (value: GroupKey) => void;
  visibleCols: Set<ColKey>;
  onToggleCol: (key: ColKey) => void;
  onClose: () => void;
}): JSX.Element {
  return (
    <section className="kc-mobile-task-options fixed inset-0 z-[2147483647] flex min-h-0 w-screen flex-col overflow-hidden [background:var(--kc-mobile-bg)] [color:var(--kc-mobile-text)]">
      <header className="flex min-h-[calc(max(44px,env(safe-area-inset-top))+58px)] shrink-0 items-end justify-between gap-3 px-4 pb-3 pt-[max(44px,env(safe-area-inset-top))] [background:var(--kc-mobile-bg)]">
        <button type="button" onClick={onClose} className="kc-mobile-back-button grid h-10 w-10 shrink-0 place-items-center rounded-full [background:var(--kc-panel-muted)] [color:var(--kc-text)]" aria-label="返回任务系统"><Icon name="chevronLeft" className="h-5 w-5" /></button>
        <div className="min-w-0 flex-1">
          <h2 className="text-[20px] font-black [color:var(--kc-text)]">视图与筛选</h2>
          <p className="text-[12px] font-semibold [color:var(--kc-muted)]">对齐桌面端的视图、排序、分组和字段配置</p>
        </div>
      </header>
      <main className="scroll-soft min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom,0px)+20px)] pt-2">
        <MobileOptionGroup title="显示视图">
          {(['list', 'board', 'dashboard'] as ViewMode[]).map((mode) => <MobileOptionButton key={mode} active={view === mode} label={mode === 'dashboard' ? '仪表盘' : mode === 'board' ? '看板' : '列表'} onClick={() => onViewChange(mode)} />)}
        </MobileOptionGroup>
        <MobileOptionGroup title="任务状态">
          {(['open', 'completed', 'all'] as const).map((key) => <MobileOptionButton key={key} active={statusFilter === key} label={FILTER_LABELS[key]} onClick={() => onStatusFilterChange(key)} />)}
        </MobileOptionGroup>
        <MobileOptionGroup title="列表排序">
          {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => <MobileOptionButton key={key} active={sortBy === key} label={SORT_LABELS[key]} onClick={() => onSortByChange(key)} />)}
        </MobileOptionGroup>
        <MobileOptionGroup title="列表分组">
          {(Object.keys(GROUP_LABELS) as GroupKey[]).map((key) => <MobileOptionButton key={key} active={groupBy === key} label={GROUP_LABELS[key]} onClick={() => onGroupByChange(key)} />)}
        </MobileOptionGroup>
        <MobileOptionGroup title="字段配置">
          {COL_ORDER.map((key) => <MobileOptionButton key={key} active={visibleCols.has(key)} label={COL_LABELS[key]} onClick={() => onToggleCol(key)} />)}
        </MobileOptionGroup>
      </main>
    </section>
  );
}

function MobileOptionGroup({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <section className="mb-4">
      <h3 className="mb-2 px-1 text-[13px] font-black [color:var(--kc-muted)]">{title}</h3>
      <div className="kc-mobile-task-card grid grid-cols-2 gap-2 p-3">{children}</div>
    </section>
  );
}

function MobileOptionButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }): JSX.Element {
  return (
    <button type="button" onClick={onClick} className={`kc-mobile-task-option-button flex items-center justify-between rounded-2xl px-3 py-2.5 text-left text-[13px] font-black transition ${active ? 'kc-mobile-task-option-button-active [background:var(--kc-accent-soft)] [color:var(--kc-accent)]' : '[background:var(--kc-panel-muted)] [color:var(--kc-text)]'}`}>
      <span className="truncate">{label}</span>
      {active ? <Icon name="check" className="h-4 w-4 shrink-0" /> : null}
    </button>
  );
}

function MobileActivityFeed({ activities, onOpenTask }: { activities: TaskActivity[]; onOpenTask: (id: number) => void }): JSX.Element {
  if (!activities.length) {
    return <div className="kc-mobile-task-card px-5 py-12 text-center text-sm font-bold [color:var(--kc-muted)]">暂无动态</div>;
  }
  return (
    <div className="grid gap-3">
      {activities.map((activity) => (
        <button key={activity.id} type="button" onClick={() => onOpenTask(activity.task_id)} className="kc-mobile-task-card flex items-start gap-3 p-4 text-left active:scale-[0.99]">
          <Avatar user={activity.actor ?? undefined} size="sm" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-black [color:var(--kc-text)]">{activity.task_title}</span>
            <span className="mt-1 block text-[12px] leading-5 [color:var(--kc-muted)]"><span className="[color:var(--kc-accent)]">{getDisplayName(activity.actor)}</span> {activityText(activity.type, '', activity.payload)}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
