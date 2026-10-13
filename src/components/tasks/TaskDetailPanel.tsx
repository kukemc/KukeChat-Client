import type { Task, User } from '@/types/api';
import { parseApiDate } from '@/utils/dateTime';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { activityText, formatTaskDate, isOverdue, taskIdLabel } from './taskConstants';
import { useTaskDetail } from './taskFormHooks';
import { useIsDesktopLayout } from './taskHooks';
import { remindOffsetOf } from './taskPanelModel';
import { DueDatePicker, GroupSelect, MemberSelect, PriorityBadge, PrioritySelect } from './taskWidgets';
import { TaskDetailDesktop } from './desktop/TaskDetailDesktop';

interface TaskDetailPanelProps {
  taskId: number;
  currentUser: User;
  isMobile?: boolean;
  onClose: () => void;
  onOpenTask: (taskId: number) => void;
  onCreateSubtask?: (task: Task) => void;
}

/**
 * 任务详情。桌面布局走 desktop/ 下的界面；下面的旧界面留给移动端：
 * 任务中心里是整页（isMobile），聊天里是侧滑层（不带 isMobile），两种外观都还在用。
 */
export function TaskDetailPanel(props: TaskDetailPanelProps): JSX.Element {
  const desktop = useIsDesktopLayout();
  return desktop && !props.isMobile
    ? <TaskDetailDesktop taskId={props.taskId} onClose={props.onClose} onOpenTask={props.onOpenTask} onCreateSubtask={props.onCreateSubtask} />
    : <TaskDetailMobile {...props} />;
}

function TaskDetailMobile({ taskId, isMobile = false, onClose, onOpenTask, onCreateSubtask }: TaskDetailPanelProps): JSX.Element {
  const detail = useTaskDetail(taskId, onClose);
  const { task, members, groups, subtasks, timeline, error, titleDraft, setTitleDraft, saveTitle, descDraft, setDescDraft, saveDesc, commentDraft, setCommentDraft } = detail;

  if (!task) {
    return (
      <div className="grid h-full place-items-center [color:var(--kc-muted)]">
        {detail.isLoading ? '加载中…' : '任务不存在或已删除'}
      </div>
    );
  }

  const completed = task.status === 'completed';
  const canEdit = Boolean(task.can_edit);
  const remindOffset = remindOffsetOf(task);

  return (
    <div className={`flex h-full flex-col ${isMobile ? '[background:var(--kc-mobile-bg)]' : ''}`}>
      <div className={`flex items-center justify-between border-b px-5 py-3 [border-color:var(--kc-border)] ${isMobile ? 'pt-[calc(env(safe-area-inset-top,0px)+14px)] [background:var(--kc-mobile-bg)]' : ''}`}>
        <div className="flex items-center gap-2">
          {isMobile ? <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full [background:var(--kc-panel-muted)] [color:var(--kc-text)]" aria-label="返回任务列表"><Icon name="chevronLeft" className="h-5 w-5" /></button> : null}
          <button
            type="button"
            onClick={detail.toggleComplete}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition ${completed ? '[background:#22c55e] text-white' : 'border [border-color:var(--kc-border)] [color:var(--kc-text)] hover:[background:var(--kc-hover)]'}`}
          >
            <Icon name="check" className="h-3.5 w-3.5" /> {completed ? '已完成' : '完成任务'}
          </button>
          <span className="text-xs [color:var(--kc-muted)]">{taskIdLabel(task.id)}</span>
        </div>
        <div className="flex items-center gap-2">
          {canEdit ? (
            <button type="button" onClick={detail.remove} className="grid h-7 w-7 place-items-center rounded-lg hover:[background:var(--kc-hover)]" title="删除">
              <Icon name="trash" className="h-4 w-4 [color:var(--kc-muted)]" />
            </button>
          ) : null}
          {!isMobile ? <button type="button" onClick={onClose} className="grid h-7 w-7 place-items-center rounded-lg hover:[background:var(--kc-hover)]">
            <Icon name="close" className="h-4 w-4 [color:var(--kc-muted)]" />
          </button> : null}
        </div>
      </div>

      <div className={`min-h-0 flex-1 overflow-y-auto px-5 py-4 ${isMobile ? 'pb-[calc(env(safe-area-inset-bottom,0px)+18px)]' : ''}`}>
        {/* title */}
        {canEdit ? (
          <input
            value={titleDraft}
            onChange={(event) => setTitleDraft(event.target.value)}
            onBlur={saveTitle}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.currentTarget.blur();
              }
            }}
            className={`mb-3 w-full rounded-lg bg-transparent px-1 py-0.5 text-lg font-semibold outline-none hover:[background:var(--kc-hover)] focus:[background:var(--kc-hover)] ${completed ? 'line-through [color:var(--kc-muted)]' : '[color:var(--kc-text)]'}`}
          />
        ) : (
          <h2 className={`mb-3 px-1 text-lg font-semibold ${completed ? 'line-through [color:var(--kc-muted)]' : '[color:var(--kc-text)]'}`}>{task.title}</h2>
        )}

        {task.conversation_title ? (
          <p className="mb-4 px-1 text-xs [color:var(--kc-muted)]">创建于会话：<span className="[color:var(--kc-accent)]">{task.conversation_title}</span></p>
        ) : null}

        <div className="space-y-3.5">
          <Field icon="profile" label="负责人">
            <MemberSelect members={members} selectedIds={task.assignees.map((u) => u.id)} onChange={(ids) => detail.update({ assignee_ids: ids })} placeholder="负责人" disabled={!canEdit} />
          </Field>

          <Field icon="clock" label="截止时间">
            {canEdit ? (
              <DueDatePicker
                dueAt={parseApiDate(task.due_at)}
                remindOffset={remindOffset}
                onChange={detail.setDue}
              />
            ) : task.due_at ? (
              <span className={`text-sm ${isOverdue(task.due_at, task.status) ? 'text-red-500' : '[color:var(--kc-text)]'}`}>{formatTaskDate(task.due_at)}</span>
            ) : <span className="text-sm [color:var(--kc-muted)]">无</span>}
          </Field>

          <Field icon="flag" label="优先级">
            {canEdit ? <PrioritySelect value={task.priority} onChange={(value) => detail.update({ priority: value })} /> : <PriorityBadge priority={task.priority} size="md" />}
          </Field>

          <Field icon="list" label="分组">
            <GroupSelect
              groups={groups}
              value={task.group_id ?? null}
              onChange={detail.moveToGroup}
              onCreate={detail.createGroupAndMove}
            />
          </Field>

          <Field icon="eye" label="关注人">
            <MemberSelect members={members} selectedIds={task.watchers.map((u) => u.id)} onChange={(ids) => detail.update({ watcher_ids: ids })} placeholder="关注人" disabled={!canEdit} />
          </Field>

          <Field icon="menu" label="描述" align="start">
            {canEdit ? (
              <textarea
                value={descDraft}
                onChange={(event) => setDescDraft(event.target.value)}
                onBlur={saveDesc}
                placeholder="添加描述…"
                rows={3}
                className="w-full rounded-lg border p-2.5 text-sm outline-none [background:var(--kc-panel)] [border-color:var(--kc-border)] [color:var(--kc-text)] placeholder:[color:var(--kc-muted)]"
              />
            ) : task.description ? (
              <p className="whitespace-pre-wrap text-sm [color:var(--kc-text)]">{task.description}</p>
            ) : <span className="text-sm [color:var(--kc-muted)]">无</span>}
          </Field>
        </div>

        {/* subtasks */}
        <div className="mt-5">
          <div className="mb-1.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <p className="text-xs font-medium [color:var(--kc-muted)]">子任务</p>
              {subtasks.length ? (
                <span className="flex items-center gap-1.5 text-xs [color:var(--kc-muted)]">
                  <span className="h-1.5 w-16 overflow-hidden rounded-full [background:var(--kc-panel-muted)]">
                    <span className="block h-full rounded-full [background:var(--kc-accent)]" style={{ width: `${Math.round((subtasks.filter((item) => item.status === 'completed').length / subtasks.length) * 100)}%` }} />
                  </span>
                  {subtasks.filter((item) => item.status === 'completed').length}/{subtasks.length}
                </span>
              ) : null}
            </div>
            {onCreateSubtask && canEdit ? (
              <button type="button" onClick={() => onCreateSubtask(task)} className="flex items-center gap-1 text-xs [color:var(--kc-accent)]">
                <Icon name="plus" className="h-3.5 w-3.5" /> 新建子任务
              </button>
            ) : null}
          </div>
          <div className="space-y-1">
            {subtasks.map((item) => (
              <div key={item.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:[background:var(--kc-hover)]">
                <button
                  type="button"
                  onClick={() => detail.toggleSubtask(item)}
                  className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border ${item.status === 'completed' ? 'border-transparent [background:#22c55e]' : '[border-color:var(--kc-border)]'}`}
                >
                  {item.status === 'completed' ? <Icon name="check" className="h-3 w-3 text-white" /> : null}
                </button>
                <button type="button" onClick={() => onOpenTask(item.id)} className={`flex-1 truncate text-left text-sm ${item.status === 'completed' ? 'line-through [color:var(--kc-muted)]' : '[color:var(--kc-text)]'}`}>
                  {item.title}
                </button>
              </div>
            ))}
            {!subtasks.length ? <p className="px-2 text-xs [color:var(--kc-muted)]">暂无子任务</p> : null}
          </div>
        </div>

        {/* comments + activity timeline */}
        <div className="mt-5 border-t pt-4 [border-color:var(--kc-border)]">
          <p className="mb-2 text-xs font-medium [color:var(--kc-muted)]">评论</p>
          <div className="space-y-3">
            {timeline.map((entry) => entry.kind === 'activity' ? (
              <div key={entry.id} className="flex items-center gap-2 text-xs [color:var(--kc-muted)]">
                <span className="grid h-5 w-5 place-items-center rounded-full [background:var(--kc-panel-muted)]"><Icon name="clock" className="h-3 w-3" /></span>
                <span className="[color:var(--kc-accent)]">{getDisplayName(entry.item.actor)}</span>
                <span>{activityText(entry.item.type, '', entry.item.payload).replace(/^\s+/, '')}</span>
                <span className="opacity-70">{formatTaskDate(entry.time)}</span>
              </div>
            ) : (
              <div key={entry.id} className="flex items-start gap-2">
                <Avatar user={entry.item.author ?? undefined} size="sm" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium [color:var(--kc-text)]">{getDisplayName(entry.item.author)}</span>
                    <span className="text-xs [color:var(--kc-muted)]">{formatTaskDate(entry.time)}</span>
                  </div>
                  <p className="whitespace-pre-wrap break-words text-sm [color:var(--kc-text)]">{entry.item.content}</p>
                </div>
              </div>
            ))}
            {!timeline.length ? <p className="text-xs [color:var(--kc-muted)]">暂无评论</p> : null}
          </div>
        </div>

        {error ? <p className="mt-3 text-xs text-red-500">{error}</p> : null}
      </div>

      {/* comment input */}
      <div className="border-t p-3 [border-color:var(--kc-border)]">
        <div className="flex items-end gap-2">
          <textarea
            value={commentDraft}
            onChange={(event) => setCommentDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                detail.submitComment();
              }
            }}
            placeholder="输入评论…"
            rows={1}
            className="min-h-[38px] flex-1 resize-none rounded-lg border px-3 py-2 text-sm outline-none [background:var(--kc-panel)] [border-color:var(--kc-border)] [color:var(--kc-text)] placeholder:[color:var(--kc-muted)]"
          />
          <button
            type="button"
            onClick={detail.submitComment}
            disabled={!detail.canComment}
            className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-lg text-white disabled:opacity-40 [background:var(--kc-accent)]"
          >
            <Icon name="send" className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ icon, label, children, align = 'center' }: { icon: 'profile' | 'clock' | 'eye' | 'flag' | 'list' | 'menu'; label: string; children: React.ReactNode; align?: 'center' | 'start' }): JSX.Element {
  return (
    <div className={`flex gap-3 ${align === 'start' ? 'items-start' : 'items-center'}`}>
      <Icon name={icon} className={`h-4 w-4 shrink-0 [color:var(--kc-muted)] ${align === 'start' ? 'mt-1.5' : ''}`} />
      <span className="w-16 shrink-0 text-xs [color:var(--kc-muted)]">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
