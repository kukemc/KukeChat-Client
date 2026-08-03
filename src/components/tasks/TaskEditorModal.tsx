import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getConversations } from '@/api/conversations';
import { getFriends } from '@/api/friends';
import { completeTask, createTask, createTaskGroup, getTaskGroups } from '@/api/tasks';
import type { CreateTaskPayload, Friendship, TaskPriority, User } from '@/types/api';
import { Icon } from '@/components/ui/Icon';
import { GroupSelect, DueDatePicker, MemberSelect, PrioritySelect } from './taskWidgets';

interface TaskEditorModalProps {
  conversationId: number;
  currentUser: User;
  defaultParentId?: number | null;
  initialGroupId?: number | null;
  onClose: () => void;
  onCreated?: (taskId: number) => void;
}

function pickFriendUser(friendship: Friendship, selfId: number): User | null {
  const candidates = [friendship.friend, friendship.user].filter(Boolean) as User[];
  return candidates.find((user) => user.id !== selfId) ?? null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '创建失败，请稍后再试';
}

function FieldRow({ icon, children, align = 'center' }: { icon: Parameters<typeof Icon>[0]['name']; children: React.ReactNode; align?: 'center' | 'start' }): JSX.Element {
  return (
    <div className={`flex gap-3 ${align === 'start' ? 'items-start' : 'items-center'}`}>
      <Icon name={icon} className={`h-4 w-4 shrink-0 [color:var(--kc-muted)] ${align === 'start' ? 'mt-2' : ''}`} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function TaskEditorModal({ conversationId, currentUser, defaultParentId, initialGroupId, onClose, onCreated }: TaskEditorModalProps): JSX.Element {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [showDescription, setShowDescription] = useState(false);
  const [dueAt, setDueAt] = useState<Date | null>(null);
  const [remindOffset, setRemindOffset] = useState<number | null>(null);
  const [assigneeIds, setAssigneeIds] = useState<number[]>([currentUser.id]);
  const [watcherIds, setWatcherIds] = useState<number[]>([]);
  const [priority, setPriority] = useState<TaskPriority>('normal');
  const [groupId, setGroupId] = useState<number | null>(initialGroupId ?? null);
  const [sendToConversation, setSendToConversation] = useState(!defaultParentId);
  const [showWatchers, setShowWatchers] = useState(false);
  const [subtasks, setSubtasks] = useState<{ title: string; done: boolean }[]>([]);
  const [error, setError] = useState<string | null>(null);

  const friendsQuery = useQuery({ queryKey: ['friends'], queryFn: getFriends });
  const conversationsQuery = useQuery({ queryKey: ['conversations'], queryFn: getConversations });
  const groupsQuery = useQuery({ queryKey: ['tasks', 'groups'], queryFn: getTaskGroups });
  const groups = groupsQuery.data ?? [];

  // Candidate 负责人/关注人 = the user's friends, ordered by most recent direct chat, with self first.
  const memberUsers = useMemo<User[]>(() => {
    const recency = new Map<number, number>();
    for (const conversation of conversationsQuery.data ?? []) {
      if (conversation.type === 'direct' && conversation.direct_user) {
        recency.set(conversation.direct_user.id, new Date(conversation.updated_at ?? 0).getTime());
      }
    }
    const friendUsers = (friendsQuery.data ?? [])
      .map((friendship) => pickFriendUser(friendship, currentUser.id))
      .filter((user): user is User => Boolean(user) && user!.id !== currentUser.id);
    friendUsers.sort((a, b) => (recency.get(b.id) ?? 0) - (recency.get(a.id) ?? 0));
    const seen = new Map<number, User>();
    seen.set(currentUser.id, currentUser);
    for (const user of friendUsers) {
      if (!seen.has(user.id)) {
        seen.set(user.id, user);
      }
    }
    return Array.from(seen.values());
  }, [friendsQuery.data, conversationsQuery.data, currentUser]);

  const createMutation = useMutation({
    mutationFn: async (payload: CreateTaskPayload) => {
      const task = await createTask(payload);
      for (const subtask of subtasks) {
        const title = subtask.title.trim();
        if (!title) {
          continue;
        }
        const child = await createTask({ conversation_id: conversationId, title, parent_id: task.id });
        if (subtask.done) {
          await completeTask(child.id, true);
        }
      }
      return task;
    },
    onSuccess: (task) => {
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
      onCreated?.(task.id);
      onClose();
    },
    onError: (err) => setError(errorMessage(err))
  });

  function submit(): void {
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

  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        onClose();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-[500px] rounded-2xl border p-6 shadow-2xl [background:var(--kc-panel)] [border-color:var(--kc-border)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <span className="text-base font-semibold [color:var(--kc-text)]">{defaultParentId ? '新建子任务' : '新建任务'}</span>
          <button type="button" onClick={onClose} className="grid h-7 w-7 place-items-center rounded-lg hover:[background:var(--kc-hover)]">
            <Icon name="close" className="h-4 w-4 [color:var(--kc-muted)]" />
          </button>
        </div>

        <input
          autoFocus
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder="输入标题，回车确认"
          className="mb-5 w-full bg-transparent text-lg font-medium outline-none [color:var(--kc-text)] placeholder:[color:var(--kc-muted)]"
        />

        <div className="space-y-3.5">
          <FieldRow icon="profile" align="start">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <MemberSelect members={memberUsers} selectedIds={assigneeIds} onChange={setAssigneeIds} placeholder="负责人" />
              {!defaultParentId ? (
                <>
                  <span className="[color:var(--kc-border)]">|</span>
                  <GroupSelect groups={groups} value={groupId} onChange={setGroupId} onCreate={async (name) => {
                    const created = await createTaskGroup(name);
                    await queryClient.invalidateQueries({ queryKey: ['tasks', 'groups'] });
                    setGroupId(created.id);
                  }} />
                </>
              ) : null}
            </div>
          </FieldRow>

          <FieldRow icon="clock">
            <DueDatePicker dueAt={dueAt} remindOffset={remindOffset} onChange={(due, remind) => { setDueAt(due); setRemindOffset(remind); }} />
          </FieldRow>

          <FieldRow icon="flag">
            <PrioritySelect value={priority} onChange={setPriority} />
          </FieldRow>

          {showDescription ? (
            <FieldRow icon="menu" align="start">
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="添加描述"
                rows={3}
                autoFocus
                className="w-full rounded-lg border p-2.5 text-sm outline-none [background:var(--kc-panel)] [border-color:var(--kc-border)] [color:var(--kc-text)] placeholder:[color:var(--kc-muted)]"
              />
            </FieldRow>
          ) : (
            <button type="button" onClick={() => setShowDescription(true)} className="flex items-center gap-3 text-sm [color:var(--kc-muted)] hover:[color:var(--kc-text)]">
              <Icon name="menu" className="h-4 w-4" /> 添加描述
            </button>
          )}

          {!defaultParentId ? (
            subtasks.length ? (
              <FieldRow icon="checkSquare" align="start">
                <div className="space-y-1.5">
                  {subtasks.map((subtask, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSubtasks((prev) => prev.map((item, i) => (i === index ? { ...item, done: !item.done } : item)))}
                        className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border ${subtask.done ? 'border-transparent [background:#22c55e]' : '[border-color:var(--kc-border)]'}`}
                      >
                        {subtask.done ? <Icon name="check" className="h-3 w-3 text-white" /> : null}
                      </button>
                      <input
                        value={subtask.title}
                        onChange={(event) => setSubtasks((prev) => prev.map((item, i) => (i === index ? { ...item, title: event.target.value } : item)))}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            setSubtasks((prev) => [...prev, { title: '', done: false }]);
                          }
                        }}
                        placeholder="子任务标题"
                        className={`min-w-0 flex-1 bg-transparent text-sm outline-none ${subtask.done ? 'line-through [color:var(--kc-muted)]' : '[color:var(--kc-text)]'}`}
                      />
                      <button type="button" onClick={() => setSubtasks((prev) => prev.filter((_, i) => i !== index))} className="opacity-60 hover:opacity-100">
                        <Icon name="close" className="h-3.5 w-3.5 [color:var(--kc-muted)]" />
                      </button>
                    </div>
                  ))}
                  <button type="button" onClick={() => setSubtasks((prev) => [...prev, { title: '', done: false }])} className="flex items-center gap-1 text-xs [color:var(--kc-accent)]">
                    <Icon name="plus" className="h-3.5 w-3.5" /> 添加子任务
                  </button>
                </div>
              </FieldRow>
            ) : (
              <button type="button" onClick={() => setSubtasks([{ title: '', done: false }])} className="flex items-center gap-3 text-sm [color:var(--kc-muted)] hover:[color:var(--kc-text)]">
                <Icon name="checkSquare" className="h-4 w-4" /> 添加子任务
              </button>
            )
          ) : null}

          {showWatchers ? (
            <FieldRow icon="eye" align="start">
              <MemberSelect members={memberUsers} selectedIds={watcherIds} onChange={setWatcherIds} placeholder="关注人" />
            </FieldRow>
          ) : (
            <button type="button" onClick={() => setShowWatchers(true)} className="flex items-center gap-3 text-sm [color:var(--kc-muted)] hover:[color:var(--kc-text)]">
              <Icon name="userPlus" className="h-4 w-4" /> 添加关注人
            </button>
          )}
        </div>

        {error ? <p className="mt-3 text-xs text-red-500">{error}</p> : null}

        <div className="mt-5 flex items-center justify-between border-t pt-4 [border-color:var(--kc-border)]">
          <label className="flex cursor-pointer items-center gap-2 text-sm [color:var(--kc-text)]">
            <input type="checkbox" checked={sendToConversation} onChange={(event) => setSendToConversation(event.target.checked)} />
            发送到会话
          </label>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border px-4 py-1.5 text-sm [border-color:var(--kc-border)] hover:[background:var(--kc-hover)]">取消</button>
            <button
              type="button"
              onClick={submit}
              disabled={createMutation.isPending || !title.trim()}
              className="rounded-lg px-5 py-1.5 text-sm font-medium text-white disabled:opacity-50 [background:var(--kc-accent)]"
            >
              创建
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
