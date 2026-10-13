import { UserLevelCard } from '@/components/level/UserLevelCard';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import type { Conversation, Friendship, User } from '@/types/api';
import { parseApiDate } from '@/utils/dateTime';
import { conversationTitle, friendUser } from '../contactsShared';

function Fact({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="kui-row">
      <span className="kui-row-label">{label}</span>
      <span className="kui-row-value" title={value}><span className="kcc-clip">{value}</span></span>
    </div>
  );
}

function formatDate(value?: string | null): string {
  return parseApiDate(value)?.toLocaleDateString('zh-CN') ?? '';
}

interface FriendProfileProps {
  friendship: Friendship;
  chatPending: boolean;
  deletePending: boolean;
  onStartChat: (userId: number) => void;
  onRemove: (user: User) => void;
}

/** 选中一位好友时右边的资料：头像、名字、签名，以及发消息和删除好友。 */
export function FriendProfile({ friendship, chatPending, deletePending, onStartChat, onRemove }: FriendProfileProps): JSX.Element | null {
  const user = friendUser(friendship);
  if (!user) {
    return null;
  }
  const bio = user.bio?.trim();
  const since = formatDate(friendship.created_at);
  return (
    <div className="kui-scroll kcc-pane-body">
      <div className="kcc-pane-inner">
        <article className="kcc-card kcc-profile">
          <div className="kcc-profile-head">
            <Avatar user={user} size="xl" />
            <h2 className="kcc-profile-name">{getDisplayName(user, `用户 ${user.id}`)}</h2>
            <p className="kcc-profile-meta">@{user.username} · 账号 {user.id}</p>
            <UserLevelCard user={user} className="klv-user--profile" />
            <p className={bio ? 'kcc-profile-bio' : 'kcc-profile-bio is-empty'}>{bio || '这个人很神秘，还没有简介'}</p>
            <div className="kcc-profile-actions">
              <button type="button" className="kui-btn kui-btn--primary" disabled={chatPending} onClick={() => onStartChat(user.id)}>发消息</button>
              <button type="button" className="kui-btn kui-btn--danger" disabled={deletePending} onClick={() => onRemove(user)}>删除好友</button>
            </div>
          </div>
          {user.email || since ? (
            <section className="kui-group">
              <div className="kui-group-title"><span>资料</span></div>
              {user.email ? <Fact label="邮箱" value={user.email} /> : null}
              {since ? <Fact label="成为好友" value={since} /> : null}
            </section>
          ) : null}
        </article>
      </div>
    </div>
  );
}

/** 选中一个群时右边的资料：群头像、群号、人数、介绍和公告，点「发消息」进群聊。 */
export function GroupProfile({ conversation, onOpen }: { conversation: Conversation; onOpen: (conversationId: number) => void }): JSX.Element {
  const title = conversationTitle(conversation);
  const category = conversation.category?.trim();
  const description = conversation.description?.trim();
  const announcement = conversation.announcement?.trim();
  return (
    <div className="kui-scroll kcc-pane-body">
      <div className="kcc-pane-inner">
        <article className="kcc-card kcc-profile">
          <div className="kcc-profile-head">
            <Avatar avatarUrl={conversation.avatar_url} label={title} size="xl" toneKey={conversation.id} />
            <h2 className="kcc-profile-name">{title}</h2>
            <p className="kcc-profile-meta">群号 {conversation.id} · {conversation.member_count ?? conversation.members?.length ?? 0} 名成员{category ? ` · ${category}` : ''}</p>
            {description ? <p className="kcc-profile-bio">{description}</p> : null}
            <div className="kcc-profile-actions">
              <button type="button" className="kui-btn kui-btn--primary" onClick={() => onOpen(conversation.id)}>发消息</button>
            </div>
          </div>
          {announcement ? (
            <section className="kui-group">
              <div className="kui-group-title"><span>群公告</span></div>
              <p className="kui-note kcc-profile-quote">{announcement}</p>
            </section>
          ) : null}
        </article>
      </div>
    </div>
  );
}
