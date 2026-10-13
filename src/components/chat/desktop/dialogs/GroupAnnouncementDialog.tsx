import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { Modal, ModalStatus } from '@/components/ui/desktop/Modal';
import { ANNOUNCEMENT_MAX_LENGTH, formatAnnouncementTime, renderAnnouncementContent, useGroupAnnouncements, type AnnouncementModalProps } from '../../groupAnnouncements';

/** 桌面端的群公告：一个对话框，列表和编辑器是里面的两个页面。 */
export function GroupAnnouncementDialog({ conversation, canPublish, onClose }: AnnouncementModalProps): JSX.Element {
  const { title, announcementsQuery, announcements, editor, openPublish, startEdit, deleteAnnouncement, isUpdating, isDeleting } = useGroupAnnouncements(conversation, canPublish);

  if (editor) {
    const length = editor.value.trim().length;
    return (
      // 正在写的公告不能被 Esc 或点到遮罩一下子丢掉，只认「返回」「取消」和关闭按钮
      <Modal
        title={editor.isEdit ? '编辑群公告' : '发布新公告'}
        className="kmd-modal--md"
        dismissOnBackdrop={false}
        dismissOnEscape={false}
        onBack={editor.close}
        onSubmit={editor.submit}
        onClose={onClose}
        footer={(
          <>
            {editor.error ? <p className="kmd-foot-note is-error" role="alert">公告保存失败。</p> : null}
            <button type="button" className="kui-btn" onClick={editor.close}>取消</button>
            <button type="submit" className="kui-btn kui-btn--primary" disabled={!editor.canSubmit}>{editor.pending ? (editor.isEdit ? '保存中…' : '发布中…') : (editor.isEdit ? '保存' : '发布')}</button>
          </>
        )}
      >
        <textarea className="kui-textarea kui-scroll kmd-notice-input" value={editor.value} rows={11} placeholder={`填写公告，1-${ANNOUNCEMENT_MAX_LENGTH} 字`} aria-label="公告内容" autoFocus onChange={(event) => editor.setValue(event.target.value)} />
        <div className="kmd-notice-options">
          <label>
            <input type="checkbox" role="switch" className="kui-switch" checked={editor.pinned} onChange={(event) => editor.setPinned(event.target.checked)} />
            置顶公告
          </label>
          <span className={length >= ANNOUNCEMENT_MAX_LENGTH ? 'is-full' : undefined}>{length}/{ANNOUNCEMENT_MAX_LENGTH}</span>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title="群公告"
      subtitle={title}
      className="kmd-modal--md kmd-modal--tall"
      bodyClassName="kmd-well"
      actions={canPublish ? <button type="button" className="kui-btn kui-btn--primary kui-btn--sm" onClick={openPublish}><Icon name="plus" className="h-3.5 w-3.5" />发布公告</button> : null}
      onClose={onClose}
    >
      {announcementsQuery.isLoading ? <ModalStatus>正在加载公告…</ModalStatus>
        : announcementsQuery.error ? <ModalStatus tone="error">公告加载失败。</ModalStatus>
        : announcements.length === 0 ? (
          <div className="kui-empty kmd-empty">
            <Icon name="announcement" className="h-7 w-7" />
            <strong>暂无公告</strong>
            <span>群公告发布后会显示在这里。</span>
          </div>
        ) : (
          <div className="kmd-notices">
            {announcements.map((announcement) => {
              const authorName = getDisplayName(announcement.author, announcement.author_id ? `用户 ${announcement.author_id}` : '已注销用户');
              return (
                <article key={announcement.id} className="kmd-notice">
                  <header>
                    <Avatar user={announcement.author} label={authorName} size="sm" />
                    <div className="kmd-notice-meta">
                      <span>{authorName}{announcement.pinned ? <span className="kui-tag kui-tag--accent"><Icon name="pin" className="h-2.5 w-2.5" />置顶</span> : null}</span>
                      <time>{formatAnnouncementTime(announcement.created_at)}</time>
                    </div>
                    {canPublish ? (
                      <div className="kmd-notice-actions">
                        <button type="button" className="kui-icon-btn" title="编辑" aria-label="编辑公告" disabled={isUpdating} onClick={() => startEdit(announcement)}><Icon name="edit" className="h-3.5 w-3.5" /></button>
                        <button type="button" className="kui-icon-btn kmd-danger" title="删除" aria-label="删除公告" disabled={isDeleting} onClick={() => deleteAnnouncement(announcement)}><Icon name="trash" className="h-3.5 w-3.5" /></button>
                      </div>
                    ) : null}
                  </header>
                  <p>{renderAnnouncementContent(announcement.content, 'kui-link')}</p>
                </article>
              );
            })}
          </div>
        )}
    </Modal>
  );
}
