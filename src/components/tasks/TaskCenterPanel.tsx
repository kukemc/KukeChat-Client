import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getActivities, getTaskDashboard, getTaskGroups, getTasks, completeTask, createTaskGroup, deleteTaskGroup, moveTaskToGroup, updateTaskGroup } from '@/api/tasks';
import { getConversations } from '@/api/conversations';
import type { Task, TaskActivity, TaskScope, User } from '@/types/api';
import { useKukeStore } from '@/store/kukeStore';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { subscribeRealtimeEvents } from '@/realtime/events';
import {
  QUICK_NAV,
  SCOPE_NAV,
  STATUS_META,
  activityText,
  formatDueLabel,
  formatTaskDate,
  isOverdue,
  taskIdLabel
} from './taskConstants';
import { PriorityBadge } from './taskWidgets';
import { TaskEditorModal } from './TaskEditorModal';
import { TaskDetailPanel } from './TaskDetailPanel';

interface TaskCenterPanelProps {
  currentUser: User;
  isMobile?: boolean;
  onMobileBack?: () => void;
}

type NavKey = 'assigned' | 'watching' | 'created' | 'all' | 'completed' | 'activity';
type ViewMode = 'list' | 'board' | 'dashboard';
type SortKey = 'custom' | 'start_at' | 'due_at' | 'created_at' | 'updated_at' | 'completed_at';
type GroupKey = 'custom' | 'none' | 'creator' | 'due' | 'source';
type ColKey = 'assignees' | 'start_at' | 'due_at' | 'subtasks' | 'creator' | 'created_at' | 'updated_at' | 'task_id';
type MobileTaskPanel = 'options' | null;

const SORT_LABELS: Record<SortKey, string> = {
  custom: '默认排序',
  start_at: '开始时间',
  due_at: '截止时间',
  created_at: '创建时间',
  updated_at: '更新时间',
  completed_at: '完成时间'
};

const GROUP_LABELS: Record<GroupKey, string> = {
  custom: '自定义分组',
  none: '无分组',
  creator: '创建人',
  due: '截止时间',
  source: '任务来源'
};

const COL_LABELS: Record<ColKey, string> = {
  assignees: '负责人',
  start_at: '开始时间',
  due_at: '截止时间',
  subtasks: '子任务进度',
  creator: '创建人',
  created_at: '创建时间',
  updated_at: '更新时间',
  task_id: '任务 ID'
};

const COL_ORDER: ColKey[] = ['assignees', 'start_at', 'due_at', 'subtasks', 'creator', 'created_at', 'updated_at', 'task_id'];

type IconName = Parameters<typeof Icon>[0]['name'];
// Right-side table columns (子任务进度 is rendered inline next to the title, not here).
const RIGHT_COLS: ColKey[] = ['assignees', 'start_at', 'due_at', 'creator', 'created_at', 'updated_at', 'task_id'];
const COL_META: Record<ColKey, { width: string; bp: 'sm' | 'md' | 'lg' | 'xl'; icon: IconName }> = {
  assignees: { width: 'w-24', bp: 'sm', icon: 'profile' },
  start_at: { width: 'w-24', bp: 'lg', icon: 'clock' },
  due_at: { width: 'w-24', bp: 'lg', icon: 'clock' },
  subtasks: { width: 'w-24', bp: 'lg', icon: 'checkSquare' },
  creator: { width: 'w-28', bp: 'md', icon: 'profile' },
  created_at: { width: 'w-28', bp: 'xl', icon: 'clock' },
  updated_at: { width: 'w-28', bp: 'xl', icon: 'clock' },
  task_id: { width: 'w-16', bp: 'md', icon: 'link' }
};
function colShow(bp: 'sm' | 'md' | 'lg' | 'xl'): string {
  return bp === 'sm' ? 'hidden sm:flex' : bp === 'md' ? 'hidden md:flex' : bp === 'lg' ? 'hidden lg:flex' : 'hidden xl:flex';
}

function timeValue(value?: string | null): number {
  if (!value) {
    return Number.NaN;
  }
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? Number.NaN : t;
}

function sortTasks(list: Task[], sortBy: SortKey): Task[] {
  if (sortBy === 'custom') {
    return list;
  }
  const ascending = sortBy === 'start_at' || sortBy === 'due_at';
  const field = sortBy as keyof Task;
  return [...list].sort((a, b) => {
    const av = timeValue(a[field] as string | null | undefined);
    const bv = timeValue(b[field] as string | null | undefined);
    const aNan = Number.isNaN(av);
    const bNan = Number.isNaN(bv);
    if (aNan && bNan) return 0;
    if (aNan) return 1; // empty values last
    if (bNan) return -1;
    return ascending ? av - bv : bv - av;
  });
}

function dueBucket(value?: string | null): { key: string; name: string; order: number } {
  if (!value) {
    return { key: 'due-none', name: '无截止时间', order: 5 };
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { key: 'due-none', name: '无截止时间', order: 5 };
  }
  const now = new Date();
  const dayOf = (d: Date): number => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((dayOf(date) - dayOf(now)) / 86400000);
  if (date.getTime() < now.getTime() && diff < 0) return { key: 'due-overdue', name: '已逾期', order: 0 };
  if (diff <= 0) return { key: 'due-today', name: '今天', order: 1 };
  if (diff <= 7) return { key: 'due-week', name: '未来 7 天', order: 2 };
  return { key: 'due-later', name: '更晚', order: 3 };
}

interface DisplayGroup {
  key: string;
  name: string;
  groupId?: number | null; // set only for 自定义分组 (enables per-group create)
  items: Task[];
}

function buildDisplayGroups(top: Task[], groupBy: GroupKey, groupDefs: { id: number; name: string }[]): DisplayGroup[] {
  if (groupBy === 'none') {
    return [{ key: 'all', name: '全部任务', items: top }];
  }
  if (groupBy === 'custom') {
    const cols: DisplayGroup[] = [
      { key: 'default', name: '默认分组', groupId: null, items: [] },
      ...groupDefs.map((group) => ({ key: `g${group.id}`, name: group.name, groupId: group.id as number | null, items: [] as Task[] }))
    ];
    const byId = new Map<number | null, Task[]>(cols.map((col) => [col.groupId ?? null, col.items]));
    for (const task of top) {
      const key = task.group_id != null && byId.has(task.group_id) ? task.group_id : null;
      byId.get(key)!.push(task);
    }
    return cols;
  }
  if (groupBy === 'creator') {
    const map = new Map<number, DisplayGroup>();
    for (const task of top) {
      if (!map.has(task.creator_id)) {
        map.set(task.creator_id, { key: `c${task.creator_id}`, name: getDisplayName(task.creator), items: [] });
      }
      map.get(task.creator_id)!.items.push(task);
    }
    return Array.from(map.values());
  }
  if (groupBy === 'source') {
    const map = new Map<number, DisplayGroup>();
    for (const task of top) {
      if (!map.has(task.conversation_id)) {
        map.set(task.conversation_id, { key: `s${task.conversation_id}`, name: task.conversation_title ?? `会话 ${task.conversation_id}`, items: [] });
      }
      map.get(task.conversation_id)!.items.push(task);
    }
    return Array.from(map.values());
  }
  const map = new Map<string, DisplayGroup & { order: number }>();
  for (const task of top) {
    const bucket = dueBucket(task.due_at);
    if (!map.has(bucket.key)) {
      map.set(bucket.key, { key: bucket.key, name: bucket.name, items: [], order: bucket.order });
    }
    map.get(bucket.key)!.items.push(task);
  }
  return Array.from(map.values()).sort((a, b) => a.order - b.order);
}

const NAV_TITLES: Record<NavKey, string> = {
  assigned: '我负责的',
  watching: '我关注的',
  created: '我创建的',
  all: '全部任务',
  completed: '已完成',
  activity: '动态'
};

function navToScope(nav: NavKey): TaskScope {
  if (nav === 'watching') return 'watching';
  if (nav === 'created') return 'created';
  if (nav === 'all' || nav === 'completed') return 'all';
  return 'assigned';
}

export function TaskCenterPanel({ currentUser, isMobile, onMobileBack }: TaskCenterPanelProps): JSX.Element {
  const queryClient = useQueryClient();
  const taskCenterScope = useKukeStore((state) => state.taskCenterScope);
  const pendingTaskId = useKukeStore((state) => state.pendingTaskId);
  const clearPendingTask = useKukeStore((state) => state.clearPendingTask);

  const [nav, setNav] = useState<NavKey>(taskCenterScope === 'activity' ? 'activity' : (taskCenterScope as NavKey) ?? 'assigned');
  const [view, setView] = useState<ViewMode>('list');
  const [statusFilter, setStatusFilter] = useState<'open' | 'completed' | 'all'>('open');
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [composerConversationId, setComposerConversationId] = useState<number | null>(null);
  const [composerParentId, setComposerParentId] = useState<number | null>(null);
  const [composerGroupId, setComposerGroupId] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<SortKey>('custom');
  const [groupBy, setGroupBy] = useState<GroupKey>('custom');
  const [visibleCols, setVisibleCols] = useState<Set<ColKey>>(new Set(['assignees', 'due_at', 'creator', 'created_at', 'task_id']));
  const [mobilePanel, setMobilePanel] = useState<MobileTaskPanel>(null);
  // Set of parent task ids the user has explicitly collapsed. Subtasks are
  // expanded by default, so membership here means "collapsed".
  const [collapsedSubtasks, setCollapsedSubtasks] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (taskCenterScope === 'activity') {
      setNav('activity');
    } else if (taskCenterScope) {
      setNav(taskCenterScope as NavKey);
    }
  }, [taskCenterScope]);

  useEffect(() => {
    setStatusFilter(nav === 'completed' ? 'completed' : nav === 'all' ? 'all' : 'open');
  }, [nav]);

  useEffect(() => {
    if (pendingTaskId != null) {
      setSelectedTaskId(pendingTaskId);
      clearPendingTask(pendingTaskId);
    }
  }, [pendingTaskId, clearPendingTask]);

  const scope = navToScope(nav);
  const includeCompleted = statusFilter !== 'open';

  const tasksQuery = useQuery({
    queryKey: ['tasks', 'list', scope, includeCompleted],
    queryFn: () => getTasks({ scope, includeCompleted, limit: 200 }),
    enabled: nav !== 'activity'
  });
  const activitiesQuery = useQuery({
    queryKey: ['tasks', 'activities'],
    queryFn: () => getActivities(undefined, 80),
    enabled: nav === 'activity'
  });
  const dashboardQuery = useQuery({
    queryKey: ['tasks', 'dashboard'],
    queryFn: getTaskDashboard,
    enabled: view === 'dashboard'
  });
  const conversationsQuery = useQuery({ queryKey: ['conversations'], queryFn: getConversations });
  const groupsQuery = useQuery({ queryKey: ['tasks', 'groups'], queryFn: getTaskGroups });
  const taskGroupDefs = groupsQuery.data ?? [];
  // Separate fetch covering subtasks (which may not be in the active scope), used to expand parents.
  const subtaskPoolQuery = useQuery({
    queryKey: ['tasks', 'subtask-pool'],
    queryFn: () => getTasks({ scope: 'all', includeCompleted: true, limit: 200 }),
    enabled: nav !== 'activity'
  });

  useEffect(() => {
    const unsubscribe = subscribeRealtimeEvents((event) => {
      if (event.rawType === 'task.changed') {
        void queryClient.invalidateQueries({ queryKey: ['tasks'] });
      }
    });
    return unsubscribe;
  }, [queryClient]);

  const tasks = useMemo(() => {
    const list = tasksQuery.data ?? [];
    if (statusFilter === 'completed') {
      return list.filter((task) => task.status === 'completed');
    }
    if (statusFilter === 'open') {
      return list.filter((task) => task.status !== 'completed' && task.status !== 'cancelled');
    }
    return list;
  }, [tasksQuery.data, statusFilter]);

  const topTasks = useMemo(() => sortTasks(tasks.filter((task) => !task.parent_id), sortBy), [tasks, sortBy]);

  // Board is always grouped by 自定义分组 columns.
  const boardColumns = useMemo<GroupColumn[]>(() => {
    const cols: GroupColumn[] = [
      { id: null, name: '默认分组', items: [] },
      ...taskGroupDefs.map((group) => ({ id: group.id as number | null, name: group.name, items: [] as Task[] }))
    ];
    const byId = new Map<number | null, Task[]>(cols.map((col) => [col.id, col.items]));
    for (const task of topTasks) {
      const key = task.group_id != null && byId.has(task.group_id) ? task.group_id : null;
      byId.get(key)!.push(task);
    }
    return cols;
  }, [topTasks, taskGroupDefs]);

  // List grouping respects the 分组 selector.
  const displayGroups = useMemo<DisplayGroup[]>(() => buildDisplayGroups(topTasks, groupBy, taskGroupDefs), [topTasks, groupBy, taskGroupDefs]);

  const subtasksByParent = useMemo(() => {
    const map = new Map<number, Task[]>();
    for (const task of subtaskPoolQuery.data ?? []) {
      if (task.parent_id) {
        if (!map.has(task.parent_id)) {
          map.set(task.parent_id, []);
        }
        map.get(task.parent_id)!.push(task);
      }
    }
    return map;
  }, [subtaskPoolQuery.data]);

  const taskGroups = conversationsQuery.data?.filter((conversation) => conversation.type === 'group' && conversation.tasks_enabled) ?? [];
  const canCreate = taskGroups.length > 0;

  async function handleMove(task: Task, groupId: number | null): Promise<void> {
    if ((task.group_id ?? null) === groupId) {
      return;
    }
    try {
      await moveTaskToGroup(task.id, groupId);
    } finally {
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
    }
  }

  function openComposer(groupId: number | null = null): void {
    const first = taskGroups[0];
    if (first) {
      setComposerParentId(null);
      setComposerGroupId(groupId);
      setComposerConversationId(first.id);
    }
  }

  function toggleCollapse(key: string): void {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function toggleExpand(taskId: number): void {
    setCollapsedSubtasks((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  }

  async function handleCreateGroup(name: string): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    await createTaskGroup(trimmed);
    void queryClient.invalidateQueries({ queryKey: ['tasks', 'groups'] });
  }

  async function handleRenameGroup(groupId: number, name: string): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    await updateTaskGroup(groupId, trimmed);
    void queryClient.invalidateQueries({ queryKey: ['tasks', 'groups'] });
  }

  async function handleDeleteGroup(groupId: number): Promise<void> {
    await deleteTaskGroup(groupId);
    void queryClient.invalidateQueries({ queryKey: ['tasks'] });
  }

  if (isMobile) {
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
            <MobileActivityFeed activities={activitiesQuery.data ?? []} onOpenTask={setSelectedTaskId} />
          ) : view === 'dashboard' ? (
            <MobileTaskDashboard data={dashboardQuery.data} />
          ) : view === 'board' ? (
            <MobileTaskBoard columns={boardColumns} onOpenTask={setSelectedTaskId} onMove={handleMove} onCreateInGroup={canCreate ? openComposer : undefined} onCreateGroup={handleCreateGroup} onRenameGroup={handleRenameGroup} onDeleteGroup={handleDeleteGroup} />
          ) : tasksQuery.isLoading ? (
            <p className="py-12 text-center text-sm [color:var(--kc-muted)]">加载中...</p>
          ) : (
            <MobileTaskGroupedList groups={displayGroups} groupBy={groupBy} collapsed={collapsed} onToggleCollapse={toggleCollapse} onOpenTask={setSelectedTaskId} onCreateInGroup={canCreate ? openComposer : undefined} onCreateGroup={handleCreateGroup} onRenameGroup={handleRenameGroup} onDeleteGroup={handleDeleteGroup} />
          )}
        </main>

        {mobilePanel === 'options' ? (
          <MobileTaskOptionsPanel view={view} onViewChange={setView} statusFilter={statusFilter} onStatusFilterChange={setStatusFilter} sortBy={sortBy} onSortByChange={setSortBy} groupBy={groupBy} onGroupByChange={setGroupBy} visibleCols={visibleCols} onToggleCol={(key) => setVisibleCols((prev) => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; })} onClose={() => setMobilePanel(null)} />
        ) : null}

        {selectedTaskId != null ? (
          <div className="fixed inset-0 z-[2147483647] [background:var(--kc-mobile-bg)]" onClick={() => setSelectedTaskId(null)}>
            <div className="h-full w-full [background:var(--kc-panel)]" onClick={(event) => event.stopPropagation()}>
              <TaskDetailPanel taskId={selectedTaskId} currentUser={currentUser} isMobile onClose={() => setSelectedTaskId(null)} onOpenTask={setSelectedTaskId} onCreateSubtask={(task) => { setComposerParentId(task.id); setComposerConversationId(task.conversation_id); }} />
            </div>
          </div>
        ) : null}

        {composerConversationId != null ? (
          <TaskEditorModal conversationId={composerConversationId} currentUser={currentUser} defaultParentId={composerParentId} initialGroupId={composerGroupId} onClose={() => { setComposerConversationId(null); setComposerParentId(null); setComposerGroupId(null); }} onCreated={() => void queryClient.invalidateQueries({ queryKey: ['tasks'] })} />
        ) : null}
      </section>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      {/* sidebar */}
      {!isMobile ? (
        <aside className="flex w-52 shrink-0 flex-col border-r px-3 py-4 [border-color:var(--kc-border)]">
          <h1 className="mb-3 px-2 text-base font-semibold [color:var(--kc-text)]">任务</h1>
          <nav className="space-y-0.5">
            {SCOPE_NAV.map((item) => (
              <NavButton key={item.key} icon={item.icon} label={item.label} active={nav === item.key} onClick={() => setNav(item.key as NavKey)} />
            ))}
          </nav>
          <div className="mt-4 mb-1 px-2 text-xs [color:var(--kc-muted)]">快速访问</div>
          <nav className="space-y-0.5">
            {QUICK_NAV.map((item) => (
              <NavButton key={item.key} icon={item.icon} label={item.label} active={nav === item.key} onClick={() => setNav(item.key as NavKey)} />
            ))}
          </nav>
        </aside>
      ) : null}

      {/* main */}
      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b px-5 py-3 [border-color:var(--kc-border)]">
          <div className="flex items-center gap-4">
            {isMobile && onMobileBack ? <button type="button" onClick={onMobileBack} className="kc-mobile-back-button grid h-10 w-10 shrink-0 place-items-center rounded-full [background:var(--kc-panel-muted)] [color:var(--kc-text)]" aria-label="返回空间"><Icon name="chevronLeft" className="h-5 w-5" /></button> : null}
            <h2 className="text-base font-semibold [color:var(--kc-text)]">{NAV_TITLES[nav]}</h2>
            {nav !== 'activity' ? (
              <div className="flex items-center gap-1 text-sm">
                <ViewTab icon="list" label="列表" active={view === 'list'} onClick={() => setView('list')} />
                <ViewTab icon="blocks" label="看板" active={view === 'board'} onClick={() => setView('board')} />
                <ViewTab icon="signal" label="仪表盘" active={view === 'dashboard'} onClick={() => setView('dashboard')} />
              </div>
            ) : null}
            {nav !== 'activity' && view !== 'dashboard' ? (
              <FilterControl value={statusFilter} onChange={setStatusFilter} />
            ) : null}
            {nav !== 'activity' && view === 'list' ? (
              <>
                <ToolbarDropdown icon="filter" label={`排序: ${SORT_LABELS[sortBy]}`}>
                  {(close) => (Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                    <DropdownItem key={key} active={sortBy === key} label={SORT_LABELS[key]} onClick={() => { setSortBy(key); close(); }} />
                  ))}
                </ToolbarDropdown>
                <ToolbarDropdown icon="list" label={`分组: ${GROUP_LABELS[groupBy]}`}>
                  {(close) => (Object.keys(GROUP_LABELS) as GroupKey[]).map((key) => (
                    <DropdownItem key={key} active={groupBy === key} label={GROUP_LABELS[key]} onClick={() => { setGroupBy(key); close(); }} />
                  ))}
                </ToolbarDropdown>
                <ToolbarDropdown icon="settings" label="字段配置">
                  {() => COL_ORDER.map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setVisibleCols((prev) => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; })}
                      className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs hover:[background:var(--kc-hover)] [color:var(--kc-text)]"
                    >
                      {COL_LABELS[key]}
                      <Icon name={visibleCols.has(key) ? 'eye' : 'eyeOff'} className={`h-3.5 w-3.5 ${visibleCols.has(key) ? '[color:var(--kc-accent)]' : '[color:var(--kc-muted)]'}`} />
                    </button>
                  ))}
                </ToolbarDropdown>
              </>
            ) : null}
          </div>
          {canCreate ? (
            <button type="button" onClick={() => openComposer(null)} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-white [background:var(--kc-accent)]">
              <Icon name="plus" className="h-4 w-4" /> 新建任务
            </button>
          ) : null}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {nav === 'activity' ? (
            <ActivityFeed activities={activitiesQuery.data ?? []} onOpenTask={setSelectedTaskId} />
          ) : view === 'dashboard' ? (
            <DashboardView data={dashboardQuery.data} />
          ) : view === 'board' ? (
            <BoardView
              columns={boardColumns}
              onOpenTask={setSelectedTaskId}
              onMove={handleMove}
              onCreateInGroup={canCreate ? openComposer : undefined}
              onCreateGroup={handleCreateGroup}
              onRenameGroup={handleRenameGroup}
              onDeleteGroup={handleDeleteGroup}
            />
          ) : (
            <ListView
              groups={displayGroups}
              groupBy={groupBy}
              visibleCols={visibleCols}
              subtasksByParent={subtasksByParent}
              collapsedSubtasks={collapsedSubtasks}
              onToggleExpand={toggleExpand}
              collapsed={collapsed}
              onToggleCollapse={toggleCollapse}
              onOpenTask={setSelectedTaskId}
              onCreateInGroup={canCreate ? openComposer : undefined}
              onCreateGroup={handleCreateGroup}
              onRenameGroup={handleRenameGroup}
              onDeleteGroup={handleDeleteGroup}
              isLoading={tasksQuery.isLoading}
            />
          )}
        </div>
      </section>

      {/* detail drawer */}
      {selectedTaskId != null ? (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={() => setSelectedTaskId(null)}>
          <div className="h-full w-full max-w-[460px] [background:var(--kc-panel)]" onClick={(event) => event.stopPropagation()}>
            <TaskDetailPanel
              taskId={selectedTaskId}
              currentUser={currentUser}
              onClose={() => setSelectedTaskId(null)}
              onOpenTask={setSelectedTaskId}
              onCreateSubtask={(task) => {
                setComposerParentId(task.id);
                setComposerConversationId(task.conversation_id);
              }}
            />
          </div>
        </div>
      ) : null}

      {composerConversationId != null ? (
        <TaskEditorModal
          conversationId={composerConversationId}
          currentUser={currentUser}
          defaultParentId={composerParentId}
          initialGroupId={composerGroupId}
          onClose={() => {
            setComposerConversationId(null);
            setComposerParentId(null);
            setComposerGroupId(null);
          }}
          onCreated={() => void queryClient.invalidateQueries({ queryKey: ['tasks'] })}
        />
      ) : null}
    </div>
  );
}

const FILTER_LABELS: Record<'open' | 'completed' | 'all', string> = {
  open: '未完成',
  completed: '已完成',
  all: '全部任务'
};

function FilterControl({ value, onChange }: { value: 'open' | 'completed' | 'all'; onChange: (value: 'open' | 'completed' | 'all') => void }): JSX.Element {
  return (
    <div className="flex items-center gap-0.5 rounded-lg border p-0.5 [border-color:var(--kc-border)]">
      {(['open', 'completed', 'all'] as const).map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={`rounded-md px-2.5 py-1 text-xs transition ${value === key ? 'text-white [background:var(--kc-accent)]' : '[color:var(--kc-muted)] hover:[background:var(--kc-hover)]'}`}
        >
          {FILTER_LABELS[key]}
        </button>
      ))}
    </div>
  );
}

function ToolbarDropdown({ icon, label, children }: { icon: Parameters<typeof Icon>[0]['name']; label: string; children: (close: () => void) => ReactNode }): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-center gap-1 rounded-md px-2 py-1 text-xs [color:var(--kc-muted)] hover:[background:var(--kc-hover)]">
        <Icon name={icon} className="h-3.5 w-3.5" />
        {label}
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-[60]" onMouseDown={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-[61] mt-1 w-44 rounded-xl border p-1 shadow-lg [background:var(--kc-panel)] [border-color:var(--kc-border)]">
            {children(() => setOpen(false))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function DropdownItem({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }): JSX.Element {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs hover:[background:var(--kc-hover)] [color:var(--kc-text)]">
      {label}
      {active ? <Icon name="check" className="h-3.5 w-3.5 [color:var(--kc-accent)]" /> : null}
    </button>
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

function NavButton({ icon, label, active, onClick }: { icon: Parameters<typeof Icon>[0]['name']; label: string; active: boolean; onClick: () => void }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition ${active ? '[background:var(--kc-accent-soft)] [color:var(--kc-accent)]' : '[color:var(--kc-text)] hover:[background:var(--kc-hover)]'}`}
    >
      <Icon name={icon} className="h-4 w-4" />
      {label}
    </button>
  );
}

function ViewTab({ icon, label, active, onClick }: { icon: Parameters<typeof Icon>[0]['name']; label: string; active: boolean; onClick: () => void }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs transition ${active ? '[background:var(--kc-accent-soft)] [color:var(--kc-accent)]' : '[color:var(--kc-muted)] hover:[background:var(--kc-hover)]'}`}
    >
      <Icon name={icon} className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function SubtaskProgress({ done, total }: { done: number; total: number }): JSX.Element {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <span className="flex shrink-0 items-center gap-1.5 text-xs [color:var(--kc-muted)]">
      <Icon name="checkSquare" className="h-3 w-3" />
      <span className="h-1.5 w-12 overflow-hidden rounded-full [background:var(--kc-panel-muted)]">
        <span className="block h-full rounded-full [background:var(--kc-accent)]" style={{ width: `${pct}%` }} />
      </span>
      {done}/{total}
    </span>
  );
}

function TaskListRow({ task, depth, subtasksByParent, collapsedSubtasks, onToggleExpand, onOpenTask, visibleCols }: {
  task: Task;
  depth: number;
  subtasksByParent: Map<number, Task[]>;
  collapsedSubtasks: Set<number>;
  onToggleExpand: (id: number) => void;
  onOpenTask: (id: number) => void;
  visibleCols: Set<ColKey>;
}): JSX.Element {
  const queryClient = useQueryClient();
  const completed = task.status === 'completed';
  const toggleMutation = useMutation({
    mutationFn: () => completeTask(task.id, !completed),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['tasks'] })
  });
  const overdue = isOverdue(task.due_at, task.status);
  const hasSubtasks = (task.subtask_total ?? 0) > 0;
  const isExpanded = !collapsedSubtasks.has(task.id);
  const children = subtasksByParent.get(task.id) ?? [];

  return (
    <>
      <div
        className="group flex items-center gap-2 border-b px-2 py-2.5 [border-color:var(--kc-border)] hover:[background:var(--kc-hover)]"
        style={{ paddingLeft: `${8 + depth * 22}px` }}
      >
        <button
          type="button"
          onClick={() => hasSubtasks && onToggleExpand(task.id)}
          className={`grid h-4 w-3 shrink-0 place-items-center ${hasSubtasks ? '[color:var(--kc-muted)]' : 'opacity-0'}`}
        >
          {hasSubtasks ? <Icon name="chevron" className={`h-3 w-3 transition ${isExpanded ? 'rotate-90' : ''}`} /> : null}
        </button>
        <button
          type="button"
          onClick={() => toggleMutation.mutate()}
          className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border ${completed ? 'border-transparent [background:#22c55e]' : '[border-color:var(--kc-border)]'}`}
        >
          {completed ? <Icon name="check" className="h-3 w-3 text-white" /> : null}
        </button>
        <button type="button" onClick={() => onOpenTask(task.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <span className={`truncate text-sm ${completed ? 'line-through [color:var(--kc-muted)]' : '[color:var(--kc-text)]'}`}>{task.title}</span>
          {task.priority !== 'normal' ? <PriorityBadge priority={task.priority} /> : null}
          {hasSubtasks && visibleCols.has('subtasks') ? <SubtaskProgress done={task.subtask_done ?? 0} total={task.subtask_total ?? 0} /> : null}
        </button>

        {RIGHT_COLS.map((col) => {
          if (!visibleCols.has(col)) {
            return null;
          }
          const meta = COL_META[col];
          const cls = `${colShow(meta.bp)} ${meta.width} shrink-0 items-center gap-1 overflow-hidden text-xs [color:var(--kc-muted)]`;
          if (col === 'assignees') {
            return (
              <div key={col} className={cls}>
                {task.assignees.length ? task.assignees.slice(0, 3).map((user) => <Avatar key={user.id} user={user} size="sm" />) : <span>-</span>}
              </div>
            );
          }
          if (col === 'creator') {
            return (
              <div key={col} className={cls}>
                <Avatar user={task.creator ?? undefined} size="sm" />
                <span className="truncate">{getDisplayName(task.creator)}</span>
              </div>
            );
          }
          let text = '-';
          if (col === 'start_at') text = task.start_at ? formatDueLabel(task.start_at) : '-';
          else if (col === 'due_at') text = task.due_at ? formatDueLabel(task.due_at) : '-';
          else if (col === 'created_at') text = formatTaskDate(task.created_at);
          else if (col === 'updated_at') text = formatTaskDate(task.updated_at);
          else if (col === 'task_id') text = taskIdLabel(task.id);
          return <div key={col} className={`${cls} ${col === 'due_at' && overdue ? '!text-red-500' : ''}`}><span className="truncate">{text}</span></div>;
        })}
      </div>
      {isExpanded ? children.map((sub) => (
        <TaskListRow key={sub.id} task={sub} depth={depth + 1} subtasksByParent={subtasksByParent} collapsedSubtasks={collapsedSubtasks} onToggleExpand={onToggleExpand} onOpenTask={onOpenTask} visibleCols={visibleCols} />
      )) : null}
    </>
  );
}

interface GroupColumn {
  id: number | null;
  name: string;
  items: Task[];
}

function colKey(id: number | null): string {
  return id === null ? 'default' : `g${id}`;
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

function ListHeader({ visibleCols }: { visibleCols: Set<ColKey> }): JSX.Element {
  return (
    <div className="flex items-center gap-2 border-b px-2 py-2 text-xs font-medium [color:var(--kc-muted)] [border-color:var(--kc-border)]">
      <span className="w-3 shrink-0" />
      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        <span className="grid h-4 w-4 place-items-center rounded-[4px] text-[9px] font-bold [background:var(--kc-panel-muted)] [color:var(--kc-muted)]">A</span>
        任务标题
      </span>
      {RIGHT_COLS.map((col) => {
        if (!visibleCols.has(col)) {
          return null;
        }
        const meta = COL_META[col];
        return (
          <div key={col} className={`${colShow(meta.bp)} ${meta.width} shrink-0 items-center gap-1`}>
            <Icon name={meta.icon} className="h-3 w-3" />
            <span className="truncate">{COL_LABELS[col]}</span>
          </div>
        );
      })}
    </div>
  );
}

function ListView({
  groups,
  groupBy,
  visibleCols,
  subtasksByParent,
  collapsedSubtasks,
  onToggleExpand,
  collapsed,
  onToggleCollapse,
  onOpenTask,
  onCreateInGroup,
  onCreateGroup,
  onRenameGroup,
  onDeleteGroup,
  isLoading
}: {
  groups: DisplayGroup[];
  groupBy: GroupKey;
  visibleCols: Set<ColKey>;
  subtasksByParent: Map<number, Task[]>;
  collapsedSubtasks: Set<number>;
  onToggleExpand: (id: number) => void;
  collapsed: Set<string>;
  onToggleCollapse: (key: string) => void;
  onOpenTask: (id: number) => void;
  onCreateInGroup?: (groupId: number | null) => void;
  onCreateGroup: (name: string) => void;
  onRenameGroup: (groupId: number, name: string) => void;
  onDeleteGroup: (groupId: number) => void;
  isLoading: boolean;
}): JSX.Element {
  const isCustom = groupBy === 'custom';
  if (isLoading) {
    return <p className="py-10 text-center text-sm [color:var(--kc-muted)]">加载中…</p>;
  }
  return (
    <div className="space-y-5">
      <ListHeader visibleCols={visibleCols} />
      {groups.map((group) => {
        const isCollapsed = collapsed.has(group.key);
        const editableGroupId = isCustom && group.groupId != null ? group.groupId : null;
        return (
          <div key={group.key} className="group/grp">
            <div className="mb-1 flex items-center gap-2">
              <button type="button" onClick={() => onToggleCollapse(group.key)} className="flex items-center gap-2 text-left text-sm font-medium [color:var(--kc-text)]">
                <Icon name="chevron" className={`h-3.5 w-3.5 [color:var(--kc-muted)] transition ${isCollapsed ? '' : 'rotate-90'}`} />
                {group.name}
                <span className="text-xs [color:var(--kc-muted)]">{group.items.length}</span>
              </button>
              {editableGroupId != null ? (
                <GroupHeaderMenu name={group.name} onRename={(name) => onRenameGroup(editableGroupId, name)} onDelete={() => onDeleteGroup(editableGroupId)} />
              ) : null}
            </div>
            {!isCollapsed ? (
              <div>
                {group.items.map((task) => (
                  <TaskListRow key={task.id} task={task} depth={0} subtasksByParent={subtasksByParent} collapsedSubtasks={collapsedSubtasks} onToggleExpand={onToggleExpand} onOpenTask={onOpenTask} visibleCols={visibleCols} />
                ))}
                {isCustom && onCreateInGroup ? (
                  <button type="button" onClick={() => onCreateInGroup(group.groupId ?? null)} className="flex items-center gap-2 px-2 py-2 text-sm [color:var(--kc-muted)] hover:[color:var(--kc-accent)]">
                    <Icon name="plus" className="h-3.5 w-3.5" /> 新建任务
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
      {isCustom ? <NewGroupButton onCreate={onCreateGroup} variant="list" /> : null}
    </div>
  );
}

function BoardView({
  columns,
  onOpenTask,
  onMove,
  onCreateInGroup,
  onCreateGroup,
  onRenameGroup,
  onDeleteGroup
}: {
  columns: GroupColumn[];
  onOpenTask: (id: number) => void;
  onMove: (task: Task, groupId: number | null) => void;
  onCreateInGroup?: (groupId: number | null) => void;
  onCreateGroup: (name: string) => void;
  onRenameGroup: (groupId: number, name: string) => void;
  onDeleteGroup: (groupId: number) => void;
}): JSX.Element {
  const [localGroup, setLocalGroup] = useState<Record<number, number | null>>({});
  const [overColumn, setOverColumn] = useState<string | null>(null);
  const dragged = useRef<Task | null>(null);

  useEffect(() => {
    setLocalGroup({});
  }, [columns]);

  const groupOf = (task: Task): number | null => (task.id in localGroup ? localGroup[task.id] : task.group_id ?? null);

  function applyDrop(groupId: number | null): void {
    const task = dragged.current;
    dragged.current = null;
    setOverColumn(null);
    if (!task || groupOf(task) === groupId) {
      return;
    }
    setLocalGroup((prev) => ({ ...prev, [task.id]: groupId }));
    onMove(task, groupId);
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {columns.map((column) => {
        const key = colKey(column.id);
        const columnTasks = column.items.filter((task) => groupOf(task) === column.id);
        // include tasks dragged into this column locally
        const draggedIn = columns.flatMap((c) => c.items).filter((task) => groupOf(task) === column.id && !column.items.includes(task));
        const allTasks = [...columnTasks, ...draggedIn];
        return (
          <div
            key={key}
            onDragOver={(event) => { event.preventDefault(); setOverColumn(key); }}
            onDragLeave={() => setOverColumn((current) => (current === key ? null : current))}
            onDrop={(event) => { event.preventDefault(); applyDrop(column.id); }}
            className={`group/grp w-64 shrink-0 rounded-xl p-1 transition ${overColumn === key ? '[background:var(--kc-hover)]' : ''}`}
          >
            <div className="mb-2 flex items-center gap-2 px-1 text-sm font-medium [color:var(--kc-text)]">
              {column.name}
              <span className="text-xs [color:var(--kc-muted)]">{allTasks.length}</span>
              {column.id != null ? (
                <GroupHeaderMenu name={column.name} onRename={(name) => onRenameGroup(column.id as number, name)} onDelete={() => onDeleteGroup(column.id as number)} />
              ) : null}
            </div>
            <div className="space-y-2">
              {allTasks.map((task) => {
                const completed = task.status === 'completed';
                return (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={() => { dragged.current = task; }}
                    onDragEnd={() => { dragged.current = null; setOverColumn(null); }}
                    onClick={() => onOpenTask(task.id)}
                    className="cursor-grab rounded-xl border p-3 active:cursor-grabbing [background:var(--kc-panel)] [border-color:var(--kc-border)] hover:[border-color:var(--kc-accent)]"
                  >
                    <p className={`mb-2 text-sm ${completed ? 'line-through [color:var(--kc-muted)]' : '[color:var(--kc-text)]'}`}>{task.title}</p>
                    <div className="mb-2 flex items-center gap-1.5">
                      {task.priority !== 'normal' ? <PriorityBadge priority={task.priority} /> : null}
                      {task.subtask_total ? <span className="text-xs [color:var(--kc-muted)]">⌄ {task.subtask_done}/{task.subtask_total}</span> : null}
                    </div>
                    <div className="flex items-center justify-between text-xs [color:var(--kc-muted)]">
                      <span className={task.due_at && isOverdue(task.due_at, task.status) ? 'text-red-500' : ''}>{task.due_at ? formatDueLabel(task.due_at) : ''}</span>
                      <div className="flex -space-x-1.5">
                        {task.assignees.slice(0, 3).map((user) => <Avatar key={user.id} user={user} size="sm" />)}
                      </div>
                    </div>
                  </div>
                );
              })}
              {onCreateInGroup ? (
                <button type="button" onClick={() => onCreateInGroup(column.id)} className="flex w-full items-center gap-1 px-1 py-2 text-sm [color:var(--kc-muted)] hover:[color:var(--kc-accent)]">
                  <Icon name="plus" className="h-3.5 w-3.5" /> 新建任务
                </button>
              ) : null}
            </div>
          </div>
        );
      })}
      <NewGroupButton onCreate={onCreateGroup} variant="board" />
    </div>
  );
}

function DashboardView({ data }: { data?: { total: number; pending: number; in_progress: number; completed: number; overdue: number; due_today: number; due_soon: number } }): JSX.Element {
  if (!data) {
    return <p className="py-10 text-center text-sm [color:var(--kc-muted)]">加载中…</p>;
  }
  const cards = [
    { label: '全部任务', value: data.total, color: 'var(--kc-text)' },
    { label: '待处理', value: data.pending, color: STATUS_META.pending.color },
    { label: '进行中', value: data.in_progress, color: STATUS_META.in_progress.color },
    { label: '已完成', value: data.completed, color: STATUS_META.completed.color },
    { label: '已逾期', value: data.overdue, color: '#ef4444' },
    { label: '今日到期', value: data.due_today, color: '#f59e0b' },
    { label: '即将到期', value: data.due_soon, color: '#f59e0b' }
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {cards.map((card) => (
        <div key={card.label} className="rounded-xl border p-4 [background:var(--kc-panel)] [border-color:var(--kc-border)]">
          <p className="text-xs [color:var(--kc-muted)]">{card.label}</p>
          <p className="mt-1 text-2xl font-semibold" style={{ color: card.color }}>{card.value}</p>
        </div>
      ))}
    </div>
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
  const [localGroup, setLocalGroup] = useState<Record<number, number | null>>({});
  const [overColumn, setOverColumn] = useState<string | null>(null);
  const dragged = useRef<Task | null>(null);

  useEffect(() => {
    setLocalGroup({});
  }, [columns]);

  const groupOf = (task: Task): number | null => (task.id in localGroup ? localGroup[task.id] : task.group_id ?? null);
  function applyDrop(groupId: number | null): void {
    const task = dragged.current;
    dragged.current = null;
    setOverColumn(null);
    if (!task || groupOf(task) === groupId) {
      return;
    }
    setLocalGroup((prev) => ({ ...prev, [task.id]: groupId }));
    onMove(task, groupId);
  }

  return (
    <div className="flex snap-x gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {columns.map((column) => {
        const key = colKey(column.id);
        const columnTasks = column.items.filter((task) => groupOf(task) === column.id);
        const draggedIn = columns.flatMap((c) => c.items).filter((task) => groupOf(task) === column.id && !column.items.includes(task));
        const allTasks = [...columnTasks, ...draggedIn];
        return (
          <section key={key} onDragOver={(event) => { event.preventDefault(); setOverColumn(key); }} onDragLeave={() => setOverColumn((current) => (current === key ? null : current))} onDrop={(event) => { event.preventDefault(); applyDrop(column.id); }} className={`kc-mobile-task-board-column w-[82vw] shrink-0 snap-start rounded-[24px] border p-3 transition [background:var(--kc-panel)] [border-color:var(--kc-border)] ${overColumn === key ? 'ring-2 ring-[var(--kc-accent)]' : ''}`}>
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
              {allTasks.map((task) => <MobileBoardTaskCard key={task.id} task={task} onOpenTask={onOpenTask} onDragStart={() => { dragged.current = task; }} onDragEnd={() => { dragged.current = null; setOverColumn(null); }} />)}
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

const FEED_WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function feedDayHeader(value: string): { weekday: string; day: number } {
  const date = new Date(value);
  const now = new Date();
  const dayOf = (d: Date): number => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((dayOf(date) - dayOf(now)) / 86400000);
  const weekday = diff === 0 ? '今天' : diff === -1 ? '昨天' : FEED_WEEKDAYS[date.getDay()];
  return { weekday, day: date.getDate() };
}

function feedTime(value: string): string {
  const date = new Date(value);
  const p = (n: number): string => (n < 10 ? `0${n}` : String(n));
  return `${p(date.getHours())}:${p(date.getMinutes())}`;
}

function ActivityFeed({ activities, onOpenTask }: { activities: TaskActivity[]; onOpenTask: (id: number) => void }): JSX.Element {
  const groups = useMemo(() => {
    const map = new Map<string, { key: string; date: string; items: TaskActivity[] }>();
    for (const activity of activities) {
      const date = new Date(activity.created_at);
      const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      if (!map.has(key)) {
        map.set(key, { key, date: activity.created_at, items: [] });
      }
      map.get(key)!.items.push(activity);
    }
    return Array.from(map.values());
  }, [activities]);

  if (!activities.length) {
    return <p className="py-10 text-center text-sm [color:var(--kc-muted)]">暂无动态</p>;
  }

  return (
    <div className="space-y-8">
      {groups.map((group) => {
        const { weekday, day } = feedDayHeader(group.date);
        return (
          <div key={group.key} className="flex gap-5">
            <div className="w-12 shrink-0 pt-1 text-center">
              <div className="text-xs [color:var(--kc-muted)]">{weekday}</div>
              <div className="text-3xl font-semibold leading-tight [color:var(--kc-text)]">{day}</div>
            </div>
            <div className="min-w-0 flex-1 space-y-5 border-l pl-5 [border-color:var(--kc-border)]">
              {group.items.map((activity) => (
                <div key={activity.id} className="flex items-start gap-3">
                  <span className="w-9 shrink-0 pt-1 text-right text-[11px] [color:var(--kc-muted)]">{feedTime(activity.created_at)}</span>
                  <Avatar user={activity.actor ?? undefined} size="sm" />
                  <div className="min-w-0 flex-1">
                    <button type="button" onClick={() => onOpenTask(activity.task_id)} className="flex max-w-full items-center gap-1 text-left">
                      <Icon name="checkSquare" className="h-3.5 w-3.5 shrink-0 [color:var(--kc-accent)]" />
                      <span className="truncate text-sm font-medium [color:var(--kc-text)] hover:[color:var(--kc-accent)]">{activity.task_title}</span>
                    </button>
                    <p className="mt-0.5 text-sm [color:var(--kc-muted)]">
                      <span className="[color:var(--kc-accent)]">{getDisplayName(activity.actor)}</span> {activityText(activity.type, '', activity.payload)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
