import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { useInfo } from './infoContext';

/** 侧栏顶部的资料头：群聊是群头像 + 群名 + 群号，私聊是对方的头像和签名。 */
export function InfoHeader(): JSX.Element {
  const { conversation, directUser, isGroup, memberCount, notify, openDialog, openUser } = useInfo();

  if (isGroup) {
    const title = conversation.title || '未命名群聊';
    const category = conversation.category?.trim();
    const description = conversation.description?.trim();
    return (
      <section className="kui-group">
        <div className="kci-head">
          <Avatar avatarUrl={conversation.avatar_url} label={title} size="lg" toneKey={conversation.id} />
          <div className="kci-head-text">
            <h3 className="kci-head-name">{title}</h3>
            <p className="kci-head-meta">群号 {conversation.id} · {memberCount} 名成员{category ? ` · ${category}` : ''}</p>
          </div>
          <button type="button" className="kui-btn kui-btn--sm" onClick={() => {
            notify('');
            openDialog({ kind: 'share' });
          }}>分享</button>
        </div>
        {description ? <p className="kci-head-desc">{description}</p> : null}
      </section>
    );
  }

  const name = getDisplayName(directUser, '好友');
  const relation = conversation.is_temporary ? ' · 临时会话' : conversation.is_friend ? '' : ' · 非好友会话';
  return (
    <section className="kui-group">
      <div className="kci-head">
        <button type="button" className="kci-head-user" title="查看资料" onClick={(event) => openUser(event.currentTarget, directUser, '好友')}>
          <Avatar user={directUser} label={name} size="lg" />
          <span className="kci-head-text">
            <span className="kci-head-name">{name}</span>
            <span className="kci-head-meta">账号 {directUser?.id ?? conversation.id}{relation}</span>
          </span>
        </button>
        <button type="button" className="kui-btn kui-btn--sm" onClick={() => {
          if (!directUser?.id) {
            notify('未找到要分享的用户', 'error');
            return;
          }
          notify('');
          openDialog({ kind: 'forward', card: 'user' });
        }}>发送名片</button>
      </div>
      <p className="kci-head-desc">{directUser?.bio?.trim() || '咕咕咕~'}</p>
    </section>
  );
}
