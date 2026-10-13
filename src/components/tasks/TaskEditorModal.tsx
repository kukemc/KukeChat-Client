import { useEffect, useState } from 'react';
import type { User } from '@/types/api';
import { Icon } from '@/components/ui/Icon';
import { useTaskEditor } from './taskFormHooks';
import { useIsDesktopLayout } from './taskHooks';
import { GroupSelect, DueDatePicker, MemberSelect, PrioritySelect } from './taskWidgets';
import { TaskEditorDesktop } from './desktop/TaskEditorDesktop';

interface TaskEditorModalProps {
  conversationId: number;
  currentUser: User;
  defaultParentId?: number | null;
  initialGroupId?: number | null;
  onClose: () => void;
  onCreated?: (taskId: number) => void;
}

/** 新建任务 / 子任务。桌面布局走 desktop/ 下的对话框；下面的旧界面留给移动端。 */
export function TaskEditorModal(props: TaskEditorModalProps): JSX.Element {
  const desktop = useIsDesktopLayout();
  return desktop ? <TaskEditorDesktop {...props} /> : <TaskEditorMobile {...props} />;
}

function FieldRow({ icon, children, align = 'center' }: { icon: Parameters<typeof Icon>[0]['name']; children: React.ReactNode; align?: 'center' | 'start' }): JSX.Element {
  return (
    <div className={`flex gap-3 ${align === 'start' ? 'items-start' : 'items-center'}`}>
      <Icon name={icon} className={`h-4 w-4 shrink-0 [color:var(--kc-muted)] ${align === 'start' ? 'mt-2' : ''}`} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function TaskEditorMobile(props: TaskEditorModalProps): JSX.Element {
  const { defaultParentId, onClose } = props;
  const editor = useTaskEditor(props);
  const { title, setTitle, description, setDescription, dueAt, remindOffset, assigneeIds, setAssigneeIds, watcherIds, setWatcherIds, priority, setPriority, groupId, setGroupId, sendToConversation, setSendToConversation, subtasks, memberUsers, groups, error, submit } = editor;
  const [showDescription, setShowDescription] = useState(false);
  const [showWatchers, setShowWatchers] = useState(false);

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
                  <GroupSelect groups={groups} value={groupId} onChange={setGroupId} onCreate={editor.createGroup} />
                </>
              ) : null}
            </div>
          </FieldRow>

          <FieldRow icon="clock">
            <DueDatePicker dueAt={dueAt} remindOffset={remindOffset} onChange={editor.setDue} />
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
                        onClick={() => editor.patchSubtask(index, { done: !subtask.done })}
                        className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border ${subtask.done ? 'border-transparent [background:#22c55e]' : '[border-color:var(--kc-border)]'}`}
                      >
                        {subtask.done ? <Icon name="check" className="h-3 w-3 text-white" /> : null}
                      </button>
                      <input
                        value={subtask.title}
                        onChange={(event) => editor.patchSubtask(index, { title: event.target.value })}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            editor.addSubtask();
                          }
                        }}
                        placeholder="子任务标题"
                        className={`min-w-0 flex-1 bg-transparent text-sm outline-none ${subtask.done ? 'line-through [color:var(--kc-muted)]' : '[color:var(--kc-text)]'}`}
                      />
                      <button type="button" onClick={() => editor.removeSubtask(index)} className="opacity-60 hover:opacity-100">
                        <Icon name="close" className="h-3.5 w-3.5 [color:var(--kc-muted)]" />
                      </button>
                    </div>
                  ))}
                  <button type="button" onClick={editor.addSubtask} className="flex items-center gap-1 text-xs [color:var(--kc-accent)]">
                    <Icon name="plus" className="h-3.5 w-3.5" /> 添加子任务
                  </button>
                </div>
              </FieldRow>
            ) : (
              <button type="button" onClick={editor.addSubtask} className="flex items-center gap-3 text-sm [color:var(--kc-muted)] hover:[color:var(--kc-text)]">
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
              disabled={!editor.canSubmit}
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
