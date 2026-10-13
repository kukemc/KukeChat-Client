import { useState } from 'react';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { memberMuted } from '../../info/shared';
import { matchesMember, memberUserId, roleBadgeLabel } from '../../message/messageMeta';
import { useInfo } from './infoContext';

/** 完整成员名单：可搜索，点成员看资料，右键管理；群主可以直接在这里设头衔。 */
export function MembersView(): JSX.Element {
  const { members, membersLoading, currentUser, memberActions, openUser, openMemberMenu } = useInfo();
  const [search, setSearch] = useState('');
  const keyword = search.trim().toLowerCase();
  const visibleMembers = keyword ? members.filter((member) => matchesMember(member, keyword)) : members;

  return (
    <>
      <div className="kci-search">
        <label className="kui-field">
          <Icon name="search" className="h-3.5 w-3.5" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索群成员" autoFocus />
        </label>
      </div>
      <div className="kci-body kui-scroll">
        {membersLoading ? <p className="kui-empty">正在加载成员…</p> : null}
        {!membersLoading && visibleMembers.length === 0 ? <p className="kui-empty">没有找到匹配成员</p> : null}
        {!membersLoading ? visibleMembers.map((member) => {
          const user = member.user;
          const userId = memberUserId(member);
          const label = userId ? `用户 ${userId}` : '成员';
          const name = member.nickname?.trim() || getDisplayName(user, label);
          const title = member.title?.trim();
          const role = roleBadgeLabel(member.role);
          return (
            <div key={member.id} className="kci-person" onContextMenu={(event) => openMemberMenu(event, member)}>
              <button type="button" className="kci-person-main" onClick={(event) => openUser(event.currentTarget, user, label)}>
                <Avatar user={user} label={name} size="message" />
                <span className="kci-person-text">
                  <span className="kci-person-name">
                    <span className="kci-clip">{name}{userId === currentUser.id ? '（我）' : ''}</span>
                    {role ? <span className={member.role === 'owner' ? 'kui-tag kui-tag--warn' : 'kui-tag kui-tag--accent'}>{role}</span> : null}
                    {title ? <span className="kui-tag kci-tag-clip">{title}</span> : null}
                    {memberMuted(member) ? <span className="kui-tag kui-tag--danger">禁言</span> : null}
                  </span>
                  <span className="kci-person-sub">{user?.bio?.trim() || user?.email || user?.username || label}</span>
                </span>
              </button>
              {memberActions.canSetTitle(member) ? <button type="button" className="kui-link kci-person-action" disabled={memberActions.busy.title} onClick={() => memberActions.editTitle(member)}>{title ? '改头衔' : '设头衔'}</button> : null}
            </div>
          );
        }) : null}
      </div>
    </>
  );
}
