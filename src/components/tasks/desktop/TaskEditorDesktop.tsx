import { useEffect } from 'react';
import { Icon } from '@/components/ui/Icon';
import { useTaskEditor, type TaskEditorOptions } from '../taskFormHooks';
import { CheckMark, cx, useEvent } from './parts';
import { DuePicker, GroupPicker, MemberPicker, PriorityPicker } from './pickers';
import { Prop } from './TaskDetailDesktop';

/** 新建任务 / 子任务的对话框（桌面）。标题里回车直接创建。 */
export function TaskEditorDesktop(props: TaskEditorOptions): JSX.Element {
  const editor = useTaskEditor(props);
  const close = useEvent(props.onClose);
  const heading = editor.isSubtask ? '新建子任务' : '新建任务';

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      // 输入法组词时的 Esc 是取消候选；里面的浮层开着时它会先把这次按键截走
      if (event.key === 'Escape' && !event.isComposing) {
        close();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [close]);

  return (
    <div className="kui-backdrop" onMouseDown={close}>
      <div role="dialog" aria-modal="true" aria-label={heading} className="kui-dialog ktk-editor" onMouseDown={(event) => event.stopPropagation()}>
        <header className="kui-dialog-header">
          <span>{heading}{editor.conversationTitle ? <small>{editor.conversationTitle}</small> : null}</span>
          <button type="button" className="kui-icon-btn" aria-label="关闭" onClick={close}><Icon name="close" className="h-4 w-4" /></button>
        </header>

        <div className="kui-dialog-body kui-scroll">
          <input
            autoFocus
            className="ktk-title"
            value={editor.title}
            placeholder="任务标题"
            aria-label="任务标题"
            onChange={(event) => editor.setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                editor.submit();
              }
            }}
          />

          <div className="ktk-props">
            <Prop icon="profile" label="负责人">
              <MemberPicker members={editor.memberUsers} selectedIds={editor.assigneeIds} placeholder="负责人" onChange={editor.setAssigneeIds} />
            </Prop>
            {editor.isSubtask ? null : (
              <Prop icon="list" label="分组">
                <GroupPicker groups={editor.groups} value={editor.groupId} onChange={editor.setGroupId} onCreate={(name) => void editor.createGroup(name).catch(() => undefined)} />
              </Prop>
            )}
            <Prop icon="clock" label="截止时间">
              <DuePicker dueAt={editor.dueAt} remindOffset={editor.remindOffset} onChange={editor.setDue} />
            </Prop>
            <Prop icon="flag" label="优先级">
              <PriorityPicker value={editor.priority} onChange={editor.setPriority} />
            </Prop>
            <Prop icon="eye" label="关注人">
              <MemberPicker members={editor.memberUsers} selectedIds={editor.watcherIds} placeholder="关注人" onChange={editor.setWatcherIds} />
            </Prop>
            <Prop icon="menu" label="描述" block>
              <textarea className="kui-textarea ktk-desc" rows={2} value={editor.description} placeholder="添加描述（可选）" onChange={(event) => editor.setDescription(event.target.value)} />
            </Prop>
            {editor.isSubtask ? null : (
              <Prop icon="checkSquare" label="子任务" block>
                {editor.subtasks.map((subtask, index) => (
                  // 草稿行没有 id，位置就是它的身份
                  <div key={index} className={cx('ktk-subtask-edit', subtask.done && 'is-done')}>
                    <CheckMark checked={subtask.done} onToggle={() => editor.patchSubtask(index, { done: !subtask.done })} />
                    <input
                      autoFocus
                      className="kui-input"
                      value={subtask.title}
                      placeholder="子任务标题，回车再加一条"
                      onChange={(event) => editor.patchSubtask(index, { title: event.target.value })}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                          event.preventDefault();
                          editor.addSubtask();
                        }
                      }}
                    />
                    <button type="button" className="kui-icon-btn ktk-icon-btn" aria-label="移除这条子任务" onClick={() => editor.removeSubtask(index)}><Icon name="close" className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
                <button type="button" className="ktk-add" onClick={editor.addSubtask}><Icon name="plus" className="h-3 w-3" />添加子任务</button>
              </Prop>
            )}
          </div>
        </div>

        <footer className="kui-dialog-footer ktk-editor-foot">
          <label>
            <input type="checkbox" role="switch" className="kui-switch" checked={editor.sendToConversation} onChange={(event) => editor.setSendToConversation(event.target.checked)} />
            发送到会话
          </label>
          <span className="ktk-form-error" role="alert">{editor.error}</span>
          <button type="button" className="kui-btn" onClick={close}>取消</button>
          <button type="button" className="kui-btn kui-btn--primary" disabled={!editor.canSubmit} onClick={editor.submit}>创建</button>
        </footer>
      </div>
    </div>
  );
}
