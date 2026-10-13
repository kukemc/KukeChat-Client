/**
 * 任务界面两端共用的数据层：请求、缓存 key、实时刷新、乐观更新都只写一份，
 * 桌面版（desktop/）和移动版（本目录下的旧组件）各自只管怎么画。
 * 这个文件是基础的几个 hook 和任务中心；详情、新建在 taskFormHooks.ts，群任务、聊天卡片、截止时间在 taskPanelHooks.ts。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { getConversations } from '@/api/conversations';
import { completeTask, createTaskGroup, deleteTaskGroup, getActivities, getTaskDashboard, getTaskGroups, getTasks, moveTaskToGroup, updateTaskGroup } from '@/api/tasks';
import { subscribeRealtimeEvents } from '@/realtime/events';
import { useKukeStore } from '@/store/kukeStore';
import type { Task, TaskActivity, TaskDashboard, TaskGroup } from '@/types/api';
import {
  DEFAULT_VISIBLE_COLS,
  buildBoardColumns,
  buildDisplayGroups,
  colKey,
  filterByStatus,
  indexSubtasks,
  navToScope,
  sortTasks,
  statusFilterForNav,
  toggleInSet,
  type ColKey,
  type DisplayGroup,
  type GroupColumn,
  type GroupKey,
  type NavKey,
  type SortKey,
  type StatusFilter,
  type ViewMode
} from './taskModel';

const TASKS_KEY: QueryKey = ['tasks'];
const GROUPS_KEY: QueryKey = ['tasks', 'groups'];

/** 当前是不是桌面布局。聊天面板打开任务组件时不传 isMobile，只能自己看。 */
export function useIsDesktopLayout(): boolean {
  return useKukeStore((state) => state.layoutMode) === 'desktop';
}

/** 让所有任务相关的查询重新拉取。 */
export function useRefreshTasks(): () => void {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: TASKS_KEY });
}

/** 服务端推来 task.changed 时让指定的查询失效。 */
export function useTaskRealtime(queryKey: QueryKey): void {
  const queryClient = useQueryClient();
  const keyRef = useRef(queryKey);
  keyRef.current = queryKey;
  useEffect(() => subscribeRealtimeEvents((event) => {
    if (event.rawType === 'task.changed') {
      void queryClient.invalidateQueries({ queryKey: keyRef.current });
    }
  }), [queryClient]);
}

/** 勾选 / 取消勾选一条任务。 */
export function useToggleTask(): (taskId: number, completed: boolean) => void {
  const refresh = useRefreshTasks();
  const mutation = useMutation({
    mutationFn: ({ taskId, completed }: { taskId: number; completed: boolean }) => completeTask(taskId, completed),
    onSuccess: refresh
  });
  return (taskId, completed) => mutation.mutate({ taskId, completed });
}

export function useTaskGroupDefs(): TaskGroup[] {
  return useQuery({ queryKey: GROUPS_KEY, queryFn: getTaskGroups }).data ?? [];
}

/** 新建分组并刷新分组列表，返回新分组（调用方可能要立刻把任务放进去）。 */
export function useCreateTaskGroup(): (name: string) => Promise<TaskGroup> {
  const queryClient = useQueryClient();
  return async (name) => {
    const created = await createTaskGroup(name);
    await queryClient.invalidateQueries({ queryKey: GROUPS_KEY });
    return created;
  };
}

/* ───────── 任务中心 ───────── */

export interface TaskComposerTarget {
  conversationId: number;
  parentId: number | null;
  groupId: number | null;
}

export interface TaskCenterState {
  nav: NavKey;
  setNav: (nav: NavKey) => void;
  view: ViewMode;
  setView: (view: ViewMode) => void;
  statusFilter: StatusFilter;
  setStatusFilter: (filter: StatusFilter) => void;
  sortBy: SortKey;
  setSortBy: (sort: SortKey) => void;
  groupBy: GroupKey;
  setGroupBy: (group: GroupKey) => void;
  visibleCols: Set<ColKey>;
  toggleCol: (col: ColKey) => void;
  /** 被收起的分组 */
  collapsed: Set<string>;
  toggleCollapse: (key: string) => void;
  /** 被收起子任务的父任务。子任务默认展开，所以记的是「收起」 */
  collapsedSubtasks: Set<number>;
  toggleExpand: (taskId: number) => void;
  selectedTaskId: number | null;
  setSelectedTaskId: (taskId: number | null) => void;
  tasksLoading: boolean;
  displayGroups: DisplayGroup[];
  boardColumns: GroupColumn[];
  subtasksByParent: Map<number, Task[]>;
  activities: TaskActivity[];
  activitiesLoading: boolean;
  dashboard: TaskDashboard | undefined;
  /** 至少加入了一个开启任务功能的群才能新建 */
  canCreate: boolean;
  composer: TaskComposerTarget | null;
  openComposer: (groupId?: number | null) => void;
  openSubtaskComposer: (parent: Task) => void;
  closeComposer: () => void;
  moveTask: (task: Task, groupId: number | null) => Promise<void>;
  createGroup: (name: string) => Promise<void>;
  renameGroup: (groupId: number, name: string) => Promise<void>;
  deleteGroup: (groupId: number) => Promise<void>;
  refresh: () => void;
}

export function useTaskCenter(): TaskCenterState {
  const queryClient = useQueryClient();
  const refresh = useRefreshTasks();
  const taskCenterScope = useKukeStore((state) => state.taskCenterScope);
  const pendingTaskId = useKukeStore((state) => state.pendingTaskId);
  const clearPendingTask = useKukeStore((state) => state.clearPendingTask);

  const [nav, setNav] = useState<NavKey>(taskCenterScope ?? 'assigned');
  const [view, setView] = useState<ViewMode>('list');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open');
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [composer, setComposer] = useState<TaskComposerTarget | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [collapsedSubtasks, setCollapsedSubtasks] = useState<Set<number>>(new Set());
  const [sortBy, setSortBy] = useState<SortKey>('custom');
  const [groupBy, setGroupBy] = useState<GroupKey>('custom');
  const [visibleCols, setVisibleCols] = useState<Set<ColKey>>(new Set(DEFAULT_VISIBLE_COLS));

  // 别处（聊天里的卡片、导航栏）点「前往任务中心」时带着要看的范围
  useEffect(() => {
    if (taskCenterScope) {
      setNav(taskCenterScope);
    }
  }, [taskCenterScope]);

  useEffect(() => {
    setStatusFilter(statusFilterForNav(nav));
  }, [nav]);

  useEffect(() => {
    if (pendingTaskId != null) {
      setSelectedTaskId(pendingTaskId);
      clearPendingTask(pendingTaskId);
    }
  }, [pendingTaskId, clearPendingTask]);

  const scope = navToScope(nav);
  const includeCompleted = statusFilter !== 'open';
  const listing = nav !== 'activity';

  const tasksQuery = useQuery({
    queryKey: ['tasks', 'list', scope, includeCompleted],
    queryFn: () => getTasks({ scope, includeCompleted, limit: 200 }),
    enabled: listing
  });
  const activitiesQuery = useQuery({ queryKey: ['tasks', 'activities'], queryFn: () => getActivities(undefined, 80), enabled: !listing });
  const dashboardQuery = useQuery({ queryKey: ['tasks', 'dashboard'], queryFn: getTaskDashboard, enabled: view === 'dashboard' });
  const conversationsQuery = useQuery({ queryKey: ['conversations'], queryFn: getConversations });
  const groupDefs = useTaskGroupDefs();
  // 子任务不一定落在当前范围里（比如别人负责的子任务），展开父任务要另拉一份全量的
  const subtaskPoolQuery = useQuery({
    queryKey: ['tasks', 'subtask-pool'],
    queryFn: () => getTasks({ scope: 'all', includeCompleted: true, limit: 200 }),
    enabled: listing
  });

  useTaskRealtime(TASKS_KEY);

  const topTasks = useMemo(
    () => sortTasks(filterByStatus(tasksQuery.data ?? [], statusFilter).filter((task) => !task.parent_id), sortBy),
    [tasksQuery.data, statusFilter, sortBy]
  );
  const boardColumns = useMemo(() => buildBoardColumns(topTasks, groupDefs), [topTasks, groupDefs]);
  const displayGroups = useMemo(() => buildDisplayGroups(topTasks, groupBy, groupDefs), [topTasks, groupBy, groupDefs]);
  const subtasksByParent = useMemo(() => indexSubtasks(subtaskPoolQuery.data ?? []), [subtaskPoolQuery.data]);

  // 任务都挂在群里。任务中心新建时没有「当前群」，落在第一个开启了任务功能的群
  const firstTaskGroup = conversationsQuery.data?.find((conversation) => conversation.type === 'group' && conversation.tasks_enabled);

  return {
    nav,
    setNav,
    view,
    setView,
    statusFilter,
    setStatusFilter,
    sortBy,
    setSortBy,
    groupBy,
    setGroupBy,
    visibleCols,
    toggleCol: (col) => setVisibleCols((current) => toggleInSet(current, col)),
    collapsed,
    toggleCollapse: (key) => setCollapsed((current) => toggleInSet(current, key)),
    collapsedSubtasks,
    toggleExpand: (taskId) => setCollapsedSubtasks((current) => toggleInSet(current, taskId)),
    selectedTaskId,
    setSelectedTaskId,
    tasksLoading: tasksQuery.isLoading,
    displayGroups,
    boardColumns,
    subtasksByParent,
    activities: activitiesQuery.data ?? [],
    activitiesLoading: activitiesQuery.isLoading,
    dashboard: dashboardQuery.data,
    canCreate: Boolean(firstTaskGroup),
    composer,
    openComposer: (groupId = null) => {
      if (firstTaskGroup) {
        setComposer({ conversationId: firstTaskGroup.id, parentId: null, groupId });
      }
    },
    openSubtaskComposer: (parent) => setComposer({ conversationId: parent.conversation_id, parentId: parent.id, groupId: null }),
    closeComposer: () => setComposer(null),
    moveTask: async (task, groupId) => {
      if ((task.group_id ?? null) === groupId) {
        return;
      }
      try {
        await moveTaskToGroup(task.id, groupId);
      } finally {
        refresh();
      }
    },
    createGroup: async (name) => {
      const trimmed = name.trim();
      if (trimmed) {
        await createTaskGroup(trimmed);
        void queryClient.invalidateQueries({ queryKey: GROUPS_KEY });
      }
    },
    renameGroup: async (groupId, name) => {
      const trimmed = name.trim();
      if (trimmed) {
        await updateTaskGroup(groupId, trimmed);
        void queryClient.invalidateQueries({ queryKey: GROUPS_KEY });
      }
    },
    deleteGroup: async (groupId) => {
      await deleteTaskGroup(groupId);
      refresh();
    },
    refresh
  };
}

/* ───────── 看板拖拽 ───────── */

export interface BoardDrag {
  overColumn: string | null;
  /** 这一列现在该显示的任务：服务端的分组，叠上刚拖过来、请求还没回来的 */
  tasksOf: (column: GroupColumn) => Task[];
  cardProps: (task: Task) => { draggable: true; onDragStart: () => void; onDragEnd: () => void };
  columnProps: (column: GroupColumn) => { onDragOver: (event: React.DragEvent) => void; onDragLeave: () => void; onDrop: (event: React.DragEvent) => void };
}

/** 看板上把任务拖到另一列：先在本地挪过去，再发请求；列数据刷新回来后本地的挪动作废。 */
export function useBoardDrag(columns: GroupColumn[], onMove: (task: Task, groupId: number | null) => void): BoardDrag {
  const [localGroup, setLocalGroup] = useState<Record<number, number | null>>({});
  const [overColumn, setOverColumn] = useState<string | null>(null);
  const dragged = useRef<Task | null>(null);

  useEffect(() => {
    setLocalGroup({});
  }, [columns]);

  const groupOf = (task: Task): number | null => (task.id in localGroup ? localGroup[task.id] : task.group_id ?? null);

  function drop(groupId: number | null): void {
    const task = dragged.current;
    dragged.current = null;
    setOverColumn(null);
    if (!task || groupOf(task) === groupId) {
      return;
    }
    setLocalGroup((current) => ({ ...current, [task.id]: groupId }));
    onMove(task, groupId);
  }

  return {
    overColumn,
    tasksOf: (column) => [
      ...column.items.filter((task) => groupOf(task) === column.id),
      ...columns.flatMap((other) => other.items).filter((task) => groupOf(task) === column.id && !column.items.includes(task))
    ],
    cardProps: (task) => ({
      draggable: true,
      onDragStart: () => {
        dragged.current = task;
      },
      onDragEnd: () => {
        dragged.current = null;
        setOverColumn(null);
      }
    }),
    columnProps: (column) => {
      const key = colKey(column.id);
      return {
        onDragOver: (event) => {
          event.preventDefault();
          setOverColumn(key);
        },
        onDragLeave: () => setOverColumn((current) => (current === key ? null : current)),
        onDrop: (event) => {
          event.preventDefault();
          drop(column.id);
        }
      };
    }
  };
}
