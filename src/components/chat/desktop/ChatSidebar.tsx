import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { PaneResizeHandle } from '@/components/shell/paneSizes';
import { FriendBadgeMark } from '@/components/intimacy/FriendBadgeMark';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { JuryBadge } from '@/components/jury/growth/JuryBadge';
import type { Conversation, ConversationMember, MemberRole, User } from '@/types/api';
import { matchesMember, memberUserId, roleBadgeLabel } from '../message/messageMeta';
import { renderLinkedPreview } from '../message/messageText';

interface ChatSidebarProps {
  conversation: Conversation;
  currentUser: User;
  members: ConversationMember[];
  directUser: User | null;
  membersLoading: boolean;
  membersHasMore: boolean;
  membersLoadingMore: boolean;
  /** 当前用户能不能发公告：只影响没有公告时的那句提示。 */
  canPublish: boolean;
  onLoadMoreMembers?: () => void;
  onMembersNeeded?: () => void;
  onMemberSearchChange?: (keyword: string) => void;
  onOpenAnnouncements: () => void;
  onOpenUser: (element: HTMLElement, user: User | null | undefined, member: ConversationMember | null) => void;
  onMemberContextMenu: (event: React.MouseEvent<HTMLElement>, member: ConversationMember) => void;
}

function roleRank(role: MemberRole): number {
  return role === 'owner' ? 0 : role === 'admin' ? 1 : 2;
}

/** 聊天右侧栏：群聊是公告 + 成员列表，私聊是对方的资料入口。整栏是贴着聊天区右边的一个面，两段之间只隔一条线。 */
function ChatSidebarInner({ conversation, currentUser, members, directUser, membersLoading, membersHasMore, membersLoadingMore, canPublish, onLoadMoreMembers, onMembersNeeded, onMemberSearchChange, onOpenAnnouncements, onOpenUser, onMemberContextMenu }: ChatSidebarProps): JSX.Element {
  const isGroup = conversation.type === 'group';
  const [searching, setSearching] = useState(false);
  const [keyword, setKeyword] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const announcement = conversation.announcement?.trim();
  const memberCount = conversation.member_count ?? members.length;

  useEffect(() => {
    if (searching) {
      onMembersNeeded?.();
      inputRef.current?.focus();
    }
  }, [onMembersNeeded, searching]);

  useEffect(() => {
    if (!searching) {
      onMemberSearchChange?.('');
      return;
    }
    const timer = window.setTimeout(() => onMemberSearchChange?.(keyword), 250);
    return () => window.clearTimeout(timer);
  }, [keyword, onMemberSearchChange, searching]);

  const visibleMembers = useMemo(() => {
    const sorted = [...members].sort((left, right) => roleRank(left.role) - roleRank(right.role) || (left.joined_at ?? '').localeCompare(right.joined_at ?? ''));
    const needle = keyword.trim().toLowerCase();
    // 群成员的搜索由服务端分页完成，私聊只有两个人，本地过滤即可
    return needle && !isGroup ? sorted.filter((member) => matchesMember(member, needle)) : sorted;
  }, [isGroup, keyword, members]);

  const directName = getDisplayName(directUser, conversation.title || '好友');

  return (
    <aside className="kcd-sidebar">
      <PaneResizeHandle pane="side" edge="left" label="调整右侧栏宽度" />
      {isGroup ? (
        <button type="button" className="kcd-sidebar-notice" onClick={onOpenAnnouncements} aria-label="查看群公告">
          <span className="kcd-sidebar-title"><Icon name="announcement" className="h-3.5 w-3.5" /><span>群公告</span><Icon name="chevron" className="kcd-sidebar-arrow h-3.5 w-3.5" /></span>
          {/* 底块和限行数的正文分成两层：行数截断只对没有内边距的元素才准，不然下一行会从内边距里露出半截 */}
          <span className="kcd-sidebar-quote">
            {announcement
              ? <span className="kcd-sidebar-announcement">{renderLinkedPreview(announcement)}</span>
              : <span className="kcd-sidebar-blank">还没有群公告<small>{canPublish ? '点这里发布第一条' : '管理员发布后会显示在这里'}</small></span>}
          </span>
        </button>
      ) : (
        <div className="kcd-sidebar-peer">
          <button type="button" className="kcd-sidebar-profile" onClick={(event) => onOpenUser(event.currentTarget, directUser, null)}>
            <Avatar user={directUser} label={directName} />
            <span className="kcd-sidebar-profile-text">
              <span className="kcd-sidebar-profile-name">{directName}</span>
              <span className="kcd-sidebar-profile-bio">{directUser?.bio?.trim() || '咕咕咕~'}</span>
            </span>
            <Icon name="chevron" className="kcd-sidebar-arrow h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="kcd-sidebar-members">
        <div className="kcd-sidebar-title">
          <Icon name="users" className="h-3.5 w-3.5" />
          <span>{isGroup ? '群成员' : '聊天成员'}</span>
          {isGroup ? <span className="kcd-sidebar-count">{memberCount}</span> : null}
          <button type="button" className={searching ? 'kcd-icon-button is-active' : 'kcd-icon-button'} title="搜索成员" aria-label="搜索成员" aria-expanded={searching} onClick={() => {
            setSearching((value) => !value);
            setKeyword('');
          }}>
            <Icon name="search" className="h-3.5 w-3.5" />
          </button>
        </div>
        {searching ? (
          <label className="kcd-sidebar-search">
            <Icon name="search" className="h-3.5 w-3.5" />
            <input ref={inputRef} value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索成员" />
          </label>
        ) : null}
        <div className="kcd-sidebar-list kui-scroll">
          {membersLoading ? <p className="kcd-sidebar-empty">正在加载成员…</p> : null}
          {!membersLoading && visibleMembers.length === 0 ? <p className="kcd-sidebar-empty">{keyword.trim() ? '没有找到匹配成员' : '暂无成员'}</p> : null}
          {!membersLoading ? visibleMembers.map((member) => {
            const userId = memberUserId(member);
            const name = userId === currentUser.id
              ? member.nickname?.trim() || getDisplayName(currentUser, '我')
              : member.nickname?.trim() || getDisplayName(member.user, userId ? `用户 ${userId}` : '成员');
            const badge = isGroup ? roleBadgeLabel(member.role) : null;
            return (
              <button key={member.id} type="button" className="kcd-member" onClick={(event) => onOpenUser(event.currentTarget, member.user, member)} onContextMenu={(event) => onMemberContextMenu(event, member)}>
                <Avatar user={member.user} label={name} size="sm" />
                <span className="kcd-member-name">{name}</span>
                <FriendBadgeMark userId={userId} size={14} />
                {/* 成员栏很窄，公开身份的风纪委员只放一个小标记，悬停看全称 */}
                <JuryBadge tier={member.user?.jury_badge} variant="icon" />
                {badge ?<span className={`kcd-tag kcd-tag--${member.role}`}>{badge}</span> : null}
              </button>
            );
          }) : null}
          {!membersLoading && isGroup && membersHasMore ? (
            <button type="button" className="kcd-link-button kcd-sidebar-more" disabled={membersLoadingMore} onClick={onLoadMoreMembers}>
              {membersLoadingMore ? '正在加载…' : '加载更多成员'}
            </button>
          ) : null}
        </div>
      </div>
    </aside>
  );
}

export const ChatSidebar = memo(ChatSidebarInner);
