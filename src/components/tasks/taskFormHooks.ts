/** 任务详情和新建任务两端共用的数据层（查询、修改、表单状态）。列表类的在 taskHooks.ts。 */
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getConversationMembers, getConversations } from '@/api/conversations';
import { getFriends } from '@/api/friends';
import { completeTask, createTask, createTaskComment, deleteTask, getTask, getTaskActivities, getTaskComments, getTasks, moveTaskToGroup, updateTask } from '@/api/tasks';
import type { CreateTaskPayload, Task, TaskGroup, TaskPriority, UpdateTaskPayload, User } from '@/types/api';
import { useCreateTaskGroup, useRefreshTasks, useTaskGroupDefs } from './taskHooks';
import { buildMemberCandidates, buildTimeline, membersToUsers, type TimelineEntry } from './taskPanelModel';

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/* ───────── 详情 ───────── */

export interface TaskDetailState {
  task: Task | null;
  isLoading: boolean;
  error: string | null;
  setError: (error: string | null) => void;
  /** 任务所在群的成员，负责人 / 关注人从这里选 */
  members: User[];
  groups: TaskGroup[];
  subtasks: Task[];
  timeline: TimelineEntry[];
  titleDraft: string;
  setTitleDraft: (value: string) => void;
  saveTitle: () => void;
  descDraft: string;
  setDescDraft: (value: string) => void;
  saveDesc: () => void;
  commentDraft: string;
  setCommentDraft: (value: string) => void;
  canComment: boolean;
  submitComment: () => void;
  update: (payload: UpdateTaskPayload) => void;
  setDue: (dueAt: Date | null, remindOffset: number | null) => void;
  toggleComplete: () => void;
  toggleSubtask: (subtask: Task) => void;
  remove: () => void;
  moveToGroup: (groupId: number | null) => Promise<void>;
  createGroupAndMove: (name: string) => Promise<void>;
}

export function useTaskDetail(taskId: number, onClose: () => void): TaskDetailState {
  const queryClient = useQueryClient();
  const refresh = useRefreshTasks();
  const createGroup = useCreateTaskGroup();
  const [error, setError] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState('');
  const [descDraft, setDescDraft] = useState('');
  const [commentDraft, setCommentDraft] = useState('');

  const taskQuery = useQuery({ queryKey: ['tasks', 'detail', taskId], queryFn: () => getTask(taskId) });
  const task = taskQuery.data ?? null;
  const membersQuery = useQuery({
    queryKey: ['conversation', task?.conversation_id, 'members'],
    queryFn: () => getConversationMembers(task!.conversation_id),
    enabled: Boolean(task?.conversation_id)
  });
  const groups = useTaskGroupDefs();
  const activitiesQuery = useQuery({ queryKey: ['tasks', 'detail', taskId, 'activities'], queryFn: () => getTaskActivities(taskId) });
  const commentsQuery = useQuery({ queryKey: ['tasks', 'detail', taskId, 'comments'], queryFn: () => getTaskComments(taskId) });
  const subtasksQuery = useQuery({
    queryKey: ['tasks', 'detail', taskId, 'subtasks'],
    queryFn: () => getTasks({ scope: 'all', limit: 100, includeCompleted: true })
  });

  useEffect(() => {
    if (task) {
      setTitleDraft(task.title);
      setDescDraft(task.description ?? '');
    }
  }, [task?.id, task?.title, task?.description]);

  const members = useMemo(() => membersToUsers(membersQuery.data ?? []), [membersQuery.data]);
  const subtasks = useMemo(() => (subtasksQuery.data ?? []).filter((item) => item.parent_id === taskId), [subtasksQuery.data, taskId]);
  const timeline = useMemo(() => buildTimeline(activitiesQuery.data ?? [], commentsQuery.data ?? []), [activitiesQuery.data, commentsQuery.data]);

  const onError = (err: unknown): void => setError(messageOf(err, '操作失败'));
  const updateMutation = useMutation({ mutationFn: (payload: UpdateTaskPayload) => updateTask(taskId, payload), onSuccess: refresh, onError });
  const toggleMutation = useMutation({ mutationFn: (completed: boolean) => completeTask(taskId, completed), onSuccess: refresh, onError });
  const toggleSubtaskMutation = useMutation({
    mutationFn: ({ id, completed }: { id: number; completed: boolean }) => completeTask(id, completed),
    onSuccess: refresh
  });
  const deleteMutation = useMutation({
    mutationFn: () => deleteTask(taskId),
    onSuccess: () => {
      refresh();
      onClose();
    },
    onError
  });
  const commentMutation = useMutation({
    mutationFn: (content: string) => createTaskComment(taskId, content),
    onSuccess: () => {
      setCommentDraft('');
      void queryClient.invalidateQueries({ queryKey: ['tasks', 'detail', taskId, 'comments'] });
      refresh();
    },
    onError
  });

  const comment = commentDraft.trim();

  return {
    task,
    isLoading: taskQuery.isLoading,
    error,
    setError,
    members,
    groups,
    subtasks,
    timeline,
    titleDraft,
    setTitleDraft,
    saveTitle: () => {
      const next = titleDraft.trim();
      if (!task) {
        return;
      }
      if (next && next !== task.title) {
        updateMutation.mutate({ title: next });
      } else {
        setTitleDraft(task.title);
      }
    },
    descDraft,
    setDescDraft,
    saveDesc: () => {
      const next = descDraft.trim();
      if (task && next !== (task.description ?? '').trim()) {
        updateMutation.mutate({ description: next });
      }
    },
    commentDraft,
    setCommentDraft,
    canComment: Boolean(comment) && !commentMutation.isPending,
    submitComment: () => {
      if (comment) {
        commentMutation.mutate(comment);
      }
    },
    update: (payload) => updateMutation.mutate(payload),
    setDue: (dueAt, remindOffset) => {
      if (!dueAt) {
        updateMutation.mutate({ clear_due_at: true, clear_remind_at: true });
        return;
      }
      const remindAt = remindOffset !== null ? new Date(dueAt.getTime() - remindOffset * 60000) : null;
      updateMutation.mutate({ due_at: dueAt.toISOString(), remind_at: remindAt ? remindAt.toISOString() : null, clear_remind_at: remindAt === null });
    },
    toggleComplete: () => toggleMutation.mutate(task?.status !== 'completed'),
    toggleSubtask: (subtask) => toggleSubtaskMutation.mutate({ id: subtask.id, completed: subtask.status !== 'completed' }),
    remove: () => deleteMutation.mutate(),
    moveToGroup: async (groupId) => {
      await moveTaskToGroup(taskId, groupId);
      refresh();
    },
    createGroupAndMove: async (name) => {
      const created = await createGroup(name);
      await moveTaskToGroup(taskId, created.id);
      refresh();
    }
  };
}

/* ───────── 新建任务 ───────── */

export interface TaskEditorOptions {
  conversationId: number;
  currentUser: User;
  defaultParentId?: number | null;
  initialGroupId?: number | null;
  onClose: () => void;
  onCreated?: (taskId: number) => void;
}

export interface SubtaskDraft {
  title: string;
  done: boolean;
}

export interface TaskEditorState {
  isSubtask: boolean;
  /** 任务会建在哪个群里。会话列表还没拉到时是空 */
  conversationTitle: string | null;
  title: string;
  setTitle: (value: string) => void;
  description: string;
  setDescription: (value: string) => void;
  dueAt: Date | null;
  remindOffset: number | null;
  setDue: (dueAt: Date | null, remindOffset: number | null) => void;
  assigneeIds: number[];
  setAssigneeIds: (ids: number[]) => void;
  watcherIds: number[];
  setWatcherIds: (ids: number[]) => void;
  priority: TaskPriority;
  setPriority: (priority: TaskPriority) => void;
  groupId: number | null;
  setGroupId: (groupId: number | null) => void;
  createGroup: (name: string) => Promise<void>;
  sendToConversation: boolean;
  setSendToConversation: (value: boolean) => void;
  subtasks: SubtaskDraft[];
  addSubtask: () => void;
  patchSubtask: (index: number, patch: Partial<SubtaskDraft>) => void;
  removeSubtask: (index: number) => void;
  memberUsers: User[];
  groups: TaskGroup[];
  error: string | null;
  canSubmit: boolean;
  submit: () => void;
}

export function useTaskEditor({ conversationId, currentUser, defaultParentId, initialGroupId, onClose, onCreated }: TaskEditorOptions): TaskEditorState {
  const refresh = useRefreshTasks();
  const createGroup = useCreateTaskGroup();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueAt, setDueAt] = useState<Date | null>(null);
  const [remindOffset, setRemindOffset] = useState<number | null>(null);
  const [assigneeIds, setAssigneeIds] = useState<number[]>([currentUser.id]);
  const [watcherIds, setWatcherIds] = useState<number[]>([]);
  const [priority, setPriority] = useState<TaskPriority>('normal');
  const [groupId, setGroupId] = useState<number | null>(initialGroupId ?? null);
  // 子任务默认不往群里发卡片
  const [sendToConversation, setSendToConversation] = useState(!defaultParentId);
  const [subtasks, setSubtasks] = useState<SubtaskDraft[]>([]);
  const [error, setError] = useState<string | null>(null);

  const friendsQuery = useQuery({ queryKey: ['friends'], queryFn: getFriends });
  const conversationsQuery = useQuery({ queryKey: ['conversations'], queryFn: getConversations });
  const groups = useTaskGroupDefs();
  const memberUsers = useMemo(
    () => buildMemberCandidates(friendsQuery.data ?? [], conversationsQuery.data ?? [], currentUser),
    [friendsQuery.data, conversationsQuery.data, currentUser]
  );

  const createMutation = useMutation({
    mutationFn: async (payload: CreateTaskPayload) => {
      const task = await createTask(payload);
      // 子任务逐个建在刚建好的任务下面；已勾选的建完再标成完成
      for (const subtask of subtasks) {
        const subtaskTitle = subtask.title.trim();
        if (!subtaskTitle) {
          continue;
        }
        const child = await createTask({ conversation_id: conversationId, title: subtaskTitle, parent_id: task.id });
        if (subtask.done) {
          await completeTask(child.id, true);
        }
      }
      return task;
    },
    onSuccess: (task) => {
      refresh();
      onCreated?.(task.id);
      onClose();
    },
    onError: (err) => setError(messageOf(err, '创建失败，请稍后再试'))
  });

  return {
    isSubtask: Boolean(defaultParentId),
    conversationTitle: conversationsQuery.data?.find((conversation) => conversation.id === conversationId)?.title ?? null,
    title,
    setTitle,
    description,
    setDescription,
    dueAt,
    remindOffset,
    setDue: (nextDue, nextRemind) => {
      setDueAt(nextDue);
      setRemindOffset(nextRemind);
    },
    assigneeIds,
    setAssigneeIds,
    watcherIds,
    setWatcherIds,
    priority,
    setPriority,
    groupId,
    setGroupId,
    createGroup: async (name) => {
      const created = await createGroup(name);
      setGroupId(created.id);
    },
    sendToConversation,
    setSendToConversation,
    subtasks,
    addSubtask: () => setSubtasks((current) => [...current, { title: '', done: false }]),
    patchSubtask: (index, patch) => setSubtasks((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item))),
    removeSubtask: (index) => setSubtasks((current) => current.filter((_, i) => i !== index)),
    memberUsers,
    groups,
    error,
    canSubmit: Boolean(title.trim()) && !createMutation.isPending,
    submit: () => {
      const trimmed = title.trim();
      if (!trimmed) {
        setError('请输入任务标题');
        return;
      }
      setError(null);
      const remindAt = dueAt && remindOffset !== null ? new Date(dueAt.getTime() - remindOffset * 60000) : null;
      createMutation.mutate({
        conversation_id: conversationId,
        title: trimmed,
        description: description.trim() || undefined,
        group_id: defaultParentId ? undefined : groupId,
        parent_id: defaultParentId ?? undefined,
        priority,
        due_at: dueAt ? dueAt.toISOString() : null,
        remind_at: remindAt ? remindAt.toISOString() : null,
        assignee_ids: assigneeIds,
        watcher_ids: watcherIds,
        send_to_conversation: sendToConversation
      });
    }
  };
}
