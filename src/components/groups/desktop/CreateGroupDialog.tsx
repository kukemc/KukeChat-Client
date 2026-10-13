import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/desktop/Modal';
import { useCreateGroup, type CreateGroupModalProps } from '../createGroup';

/** 桌面端的创建群聊对话框。 */
export function CreateGroupDialog({ friends, onClose }: CreateGroupModalProps): JSX.Element {
  const { title, setTitle, selectedIds, toggle, submit, isPending, error } = useCreateGroup(onClose);

  return (
    <Modal
      title="创建群聊"
      className="kmd-modal--sm"
      bodyClassName="kmd-form"
      dismissOnBackdrop={false}
      onSubmit={submit}
      onClose={onClose}
      footer={(
        <>
          {error ? <p className="kmd-foot-note is-error" role="alert">创建失败，请稍后重试。</p> : null}
          <button type="button" className="kui-btn" onClick={onClose}>取消</button>
          <button type="submit" className="kui-btn kui-btn--primary" disabled={!title.trim() || isPending}>{isPending ? '创建中…' : '创建'}</button>
        </>
      )}
    >
      <label className="kmd-field">
        <span className="kmd-label">群聊名称</span>
        <input className="kui-input" value={title} required autoFocus placeholder="例如：项目讨论组" onChange={(event) => setTitle(event.target.value)} />
      </label>
      <div className="kmd-field">
        <span className="kmd-label">邀请好友<span>已选 {selectedIds.length} 人</span></span>
        <div className="kmd-options kmd-options--boxed kui-scroll">
          {friends.length === 0 ? <p className="kui-empty">暂无好友可选。</p> : friends.map((friendship) => {
            const user = friendship.friend ?? friendship.user;
            if (!user?.id) {
              return null;
            }
            const selected = selectedIds.includes(user.id);
            return (
              <button key={friendship.id ?? user.id} type="button" aria-pressed={selected} className={selected ? 'kmd-option is-selected' : 'kmd-option'} onClick={() => toggle(user.id)}>
                <Avatar user={user} size="sm" />
                <span className="kmd-option-text">
                  <span>{getDisplayName(user, `用户 ${user.id}`)}</span>
                  <span>{user.email || '好友'}</span>
                </span>
                <span className="kmd-checkbox">{selected ? <Icon name="check" className="h-3 w-3" /> : null}</span>
              </button>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
