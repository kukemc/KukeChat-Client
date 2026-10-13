import { useState, type ReactNode } from 'react';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { Icon, type IconName } from '@/components/ui/Icon';
import type { Task } from '@/types/api';
import { parseApiDate } from '@/utils/dateTime';
import { activityText, formatTaskDate, isOverdue, taskIdLabel } from '../taskConstants';
import { useTaskDetail, type TaskDetailState } from '../taskFormHooks';
import { remindOffsetOf } from '../taskPanelModel';
import { CheckMark, DueText, PriorityTag, Progress, cx } from './parts';
import { DuePicker, GroupPicker, MemberPicker, PriorityPicker } from './pickers';

interface TaskDetailDesktopProps {
  taskId: number;
  onClose: () => void;
  onOpenTask: (taskId: number) => void;
  onCreateSubtask?: (task: Task) => void;
}

/** 属性表里的一行：图标 + 标签在左，值在右。block 用于输入框这类多行的值。 */
export function Prop({ icon, label, block = false, children }: { icon: IconName; label: string; block?: boolean; children: ReactNode }): JSX.Element {
  return (
    <>
      <div className="ktk-prop-label"><Icon name={icon} />{label}</div>
      <div className={cx('ktk-prop-value', block && 'is-block')}>{children}</div>
    </>
  );
}

function Subtasks({ detail, task, onOpenTask, onCreateSubtask }: { detail: TaskDetailState; task: Task; onOpenTask: (taskId: number) => void; onCreateSubtask?: (task: Task) => void }): JSX.Element {
  const { subtasks } = detail;
  const done = subtasks.filter((item) => item.status === 'completed').length;
  return (
    <section className="ktk-section">
      <h3 className="ktk-section-title">
        <span>子任务</span>
        {subtasks.length > 0 ? <Progress done={done} total={subtasks.length} wide /> : null}
        {onCreateSubtask && task.can_edit ? <button type="button" className="kui-link" onClick={() => onCreateSubtask(task)}><Icon name="plus" className="h-3.5 w-3.5" />新建子任务</button> : null}
      </h3>
      {subtasks.map((item) => (
        <div key={item.id} className={cx('ktk-subtask', item.status === 'completed' && 'is-done')}>
          <CheckMark checked={item.status === 'completed'} onToggle={() => detail.toggleSubtask(item)} />
          <button type="button" className="ktk-subtask-title" onClick={() => onOpenTask(item.id)}>{item.title}</button>
        </div>
      ))}
      {subtasks.length === 0 ? <p className="ktk-none">暂无子任务</p> : null}
    </section>
  );
}

/** 评论和里程碑动态（创建、完成、负责人变更）混排成一条时间线。 */
function Timeline({ detail }: { detail: TaskDetailState }): JSX.Element {
  return (
    <section className="ktk-section">
      <h3 className="ktk-section-title"><span>评论</span></h3>
      <div className="ktk-timeline">
        {detail.timeline.map((entry) => (entry.kind === 'activity' ? (
          <p key={entry.id} className="ktk-event">
            <b>{getDisplayName(entry.item.actor)}</b> {activityText(entry.item.type, '', entry.item.payload).trimStart()}
            <time>{formatTaskDate(entry.time)}</time>
          </p>
        ) : (
          <div key={entry.id} className="ktk-comment">
            <Avatar user={entry.item.author ?? undefined} size="sm" />
            <div className="ktk-comment-main">
              <div className="ktk-comment-head"><b>{getDisplayName(entry.item.author)}</b><time>{formatTaskDate(entry.time)}</time></div>
              <p>{entry.item.content}</p>
            </div>
          </div>
        )))}
      </div>
      {detail.timeline.length === 0 ? <p className="ktk-none">暂无评论</p> : null}
    </section>
  );
}

/**
 * 任务详情（桌面）。任务中心里嵌在右侧，聊天面板里放在它自己的侧滑层里，两处都撑满容器。
 * 标题、描述失焦即存，其余属性改了立即生效。
 */
export function TaskDetailDesktop({ taskId, onClose, onOpenTask, onCreateSubtask }: TaskDetailDesktopProps): JSX.Element {
  const detail = useTaskDetail(taskId, onClose);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const { task } = detail;
  const closeButton = <button type="button" className="kui-icon-btn" aria-label="关闭" title="关闭" onClick={onClose}><Icon name="close" className="h-4 w-4" /></button>;

  if (!task) {
    return (
      <div className="ktk-detail">
        <header className="ktk-detail-bar"><span className="ktk-spacer" />{closeButton}</header>
        <div className="kui-empty">{detail.isLoading ? '加载中…' : '任务不存在或已删除'}</div>
      </div>
    );
  }

  const completed = task.status === 'completed';
  const canEdit = Boolean(task.can_edit);
  // 分组的两个操作不走 mutation，失败要自己接住，否则只会在控制台里留一条未处理的拒绝
  const guard = (action: Promise<void>): void => void action.catch((error: unknown) => detail.setError(error instanceof Error ? error.message : '操作失败'));

  return (
    <div className="ktk-detail">
      <header className="ktk-detail-bar">
        <button type="button" className={cx('kui-btn kui-btn--sm', completed && 'ktk-done')} title={completed ? '重新打开任务' : undefined} onClick={detail.toggleComplete}>
          <Icon name="check" className="h-3.5 w-3.5" />{completed ? '已完成' : '完成任务'}
        </button>
        <span className="ktk-detail-id">{taskIdLabel(task.id)}</span>
        <span className="ktk-spacer" />
        {canEdit && confirmingDelete ? (
          <>
            <span className="ktk-confirm">删除后无法恢复</span>
            <button type="button" className="kui-btn kui-btn--sm" onClick={() => setConfirmingDelete(false)}>取消</button>
            <button type="button" className="kui-btn kui-btn--sm kui-btn--danger" onClick={detail.remove}>删除</button>
          </>
        ) : canEdit ? (
          <button type="button" className="kui-icon-btn" aria-label="删除任务" title="删除任务" onClick={() => setConfirmingDelete(true)}><Icon name="trash" className="h-4 w-4" /></button>
        ) : null}
        {closeButton}
      </header>
      {detail.error ? (
        <p className="ktk-detail-error" role="alert">
          <span>{detail.error}</span>
          <button type="button" aria-label="关闭提示" onClick={() => detail.setError(null)}><Icon name="close" className="h-3.5 w-3.5" /></button>
        </p>
      ) : null}

      <div className="ktk-detail-body kui-scroll">
        {canEdit ? (
          <textarea
            className={cx('ktk-title', completed && 'is-done')}
            rows={1}
            value={detail.titleDraft}
            aria-label="任务标题"
            onChange={(event) => detail.setTitleDraft(event.target.value)}
            onBlur={detail.saveTitle}
            onKeyDown={(event) => {
              // 标题不换行：回车就是「改完了」
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                event.preventDefault();
                event.currentTarget.blur();
              }
            }}
          />
        ) : <h2 className={cx('ktk-title', completed && 'is-done')}>{task.title}</h2>}
        {task.conversation_title ? <p className="ktk-detail-source">创建于会话 <b>{task.conversation_title}</b></p> : null}

        <div className="ktk-props">
          <Prop icon="profile" label="负责人">
            <MemberPicker members={detail.members} selectedIds={task.assignees.map((user) => user.id)} placeholder="负责人" disabled={!canEdit} onChange={(ids) => detail.update({ assignee_ids: ids })} />
          </Prop>
          <Prop icon="clock" label="截止时间">
            {canEdit
              ? <DuePicker dueAt={parseApiDate(task.due_at)} remindOffset={remindOffsetOf(task)} overdue={isOverdue(task.due_at, task.status)} onChange={detail.setDue} />
              : task.due_at ? <DueText dueAt={task.due_at} status={task.status} /> : <span className="ktk-none">无</span>}
          </Prop>
          <Prop icon="flag" label="优先级">
            {canEdit ? <PriorityPicker value={task.priority} onChange={(priority) => detail.update({ priority })} /> : <PriorityTag priority={task.priority} />}
          </Prop>
          <Prop icon="list" label="分组">
            <GroupPicker groups={detail.groups} value={task.group_id ?? null} onChange={(groupId) => guard(detail.moveToGroup(groupId))} onCreate={(name) => guard(detail.createGroupAndMove(name))} />
          </Prop>
          <Prop icon="eye" label="关注人">
            <MemberPicker members={detail.members} selectedIds={task.watchers.map((user) => user.id)} placeholder="关注人" disabled={!canEdit} onChange={(ids) => detail.update({ watcher_ids: ids })} />
          </Prop>
        </div>

        <section className="ktk-section">
          <h3 className="ktk-section-title"><span>描述</span></h3>
          {canEdit
            ? <textarea className="kui-textarea ktk-desc" rows={3} value={detail.descDraft} placeholder="添加描述…" onChange={(event) => detail.setDescDraft(event.target.value)} onBlur={detail.saveDesc} />
            : task.description ? <p className="ktk-desc-text">{task.description}</p> : <p className="ktk-none">无</p>}
        </section>

        <Subtasks detail={detail} task={task} onOpenTask={onOpenTask} onCreateSubtask={onCreateSubtask} />
        <Timeline detail={detail} />
      </div>

      <footer className="ktk-comment-box">
        <textarea
          className="kui-textarea"
          rows={1}
          value={detail.commentDraft}
          placeholder="写评论，Ctrl+Enter 发送"
          aria-label="评论"
          onChange={(event) => detail.setCommentDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              detail.submitComment();
            }
          }}
        />
        <button type="button" className="kui-btn kui-btn--primary" disabled={!detail.canComment} onClick={detail.submitComment}>发送</button>
      </footer>
    </div>
  );
}
