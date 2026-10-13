import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { Modal, ModalStatus } from '@/components/ui/desktop/Modal';
import { useInvite, type InviteModalProps } from '../inviteData';

/** 桌面端的邀请确认框。 */
export function InviteDialog(props: InviteModalProps): JSX.Element {
  const { onClose } = props;
  const { isLoading, failed, title, group, user, acceptLabel, acceptDisabled, accept } = useInvite(props);

  return (
    <Modal
      title={isLoading || failed ? '邀请链接' : title}
      className="kmd-modal--sm"
      bodyClassName="kmd-form"
      // 这个框是打开链接后自己弹出来的，点到旁边不该让它消失
      dismissOnBackdrop={false}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="kui-btn" onClick={onClose}>稍后再说</button>
          <button type="button" className="kui-btn kui-btn--primary" disabled={acceptDisabled} onClick={accept}>{acceptLabel}</button>
        </>
      )}
    >
      {isLoading ? <ModalStatus>正在解析邀请链接…</ModalStatus> : null}
      {failed ? <ModalStatus tone="error">邀请链接无效或已不可用。</ModalStatus> : null}
      {group ? (
        <div className="kmd-identity">
          <Avatar avatarUrl={group.avatar_url} label={group.title ?? '群聊'} toneKey={group.id} size="lg" />
          <div>
            <strong>{group.title || '未命名群聊'}</strong>
            <span>群号 {group.id} · {group.member_count ?? 0} 人 · {group.category || '未设置'}</span>
          </div>
          <p>{group.description?.trim() || '这个群还没有简介。'}</p>
        </div>
      ) : null}
      {user ? (
        <div className="kmd-identity">
          <Avatar user={user} size="lg" />
          <div>
            <strong>{getDisplayName(user)}</strong>
            <span>账号 {user.id} · @{user.username}</span>
          </div>
          <p>{user.bio?.trim() || '咕咕咕~'}</p>
        </div>
      ) : null}
    </Modal>
  );
}
