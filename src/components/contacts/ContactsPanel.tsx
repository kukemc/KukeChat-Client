import { useEffect, useState, type CSSProperties } from 'react';
import { FriendBadgeMark } from '@/components/intimacy/FriendBadgeMark';
import { parseApiDate } from '@/utils/dateTime';
import { PenaltyCenterModal } from '@/components/moderation/PenaltyCenter';
import { registerNativeBackHandler } from '@/native/back';
import { runNativeRouteTransition } from '@/native/transition';
import type { Conversation, FriendRequest, Friendship, GroupJoinRequest, TemporaryConversationBlock, UnifiedNotification, UnifiedNotificationCategory, User } from '@/types/api';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { BirthdayMark, FriendBirthdayBanner } from '@/components/birthday/BirthdayBits';
import { UserLevelIcons } from '@/components/level/LevelIcons';
import { useKukeStore } from '@/store/kukeStore';
import { LevelNotificationIcon, isLevelNotification } from '@/components/level/LevelNotificationIcon';
import { Icon } from '@/components/ui/Icon';
import { MobileStatusBar } from '@/components/mobile/MobileChrome';
import { resolveThumbnailUrl } from '@/utils/assetUrl';
import { contactInitial, conversationTitle, formatFriendRequestStatus, formatGroupRequestStatus, formatNotificationTime, friendUser, groupRequestTitle, notificationAvatarSource, notificationTarget, type NotificationFilter } from './contactsShared';
import { ContactsDesktop } from './desktop/ContactsDesktop';
import { useContactsData } from './useContactsData';

interface ContactsPanelProps {
  friends: Friendship[];
  conversations?: Conversation[];
  isLoading: boolean;
  currentUser: User;
  isMobile?: boolean;
  onOpenSettings?: () => void;
  onOpenGlobalSearch?: (keyword?: string) => void;
  onOpenConversation?: (conversationId: number) => void;
  onOpenPost?: (postId: number) => void;
  onMobileDetailActiveChange?: (active: boolean) => void;
}

type MobileContactsCategory = 'all' | 'friends' | 'groupChats';
type MobileContactsPage = 'notificationCenter' | 'friendRequests' | 'groupRequests' | 'temporaryBlocks' | null;

function animateMobilePageChange(direction: 'forward' | 'back', update: () => void): void {
  runNativeRouteTransition(direction === 'forward' ? 'secondary-forward' : 'secondary-back', update, true);
}

function RequestRow({ request, user, children }: { request: FriendRequest; user?: User | null; children?: React.ReactNode }): JSX.Element {
  return (
    <div className="kc-mobile-row-wrap flex items-center gap-3 rounded-2xl px-3 py-3 transition hover:[background:var(--kc-hover)]">
      <Avatar user={user} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{getDisplayName(user, `用户 ${request.requester_id}`)}</p>
        <p className="truncate text-xs [color:var(--kc-muted)]">{formatFriendRequestStatus(request.status)}{request.created_at ? ` · ${(parseApiDate(request.created_at) ?? new Date(request.created_at)).toLocaleDateString('zh-CN')}` : ''}</p>
      </div>
      {children ? <div className="kc-mobile-row-actions shrink-0">{children}</div> : null}
    </div>
  );
}

function notificationAccent(category: UnifiedNotificationCategory): { icon: 'bell' | 'users' | 'message' | 'feed' | 'sparkles'; className: string; label: string } {
  if (category === 'friend') return { icon: 'users', label: '好友', className: 'bg-sky-100 text-sky-600' };
  if (category === 'group') return { icon: 'message', label: '群聊', className: 'bg-amber-100 text-amber-600' };
  if (category === 'post') return { icon: 'feed', label: '动态', className: 'bg-pink-100 text-pink-600' };
  if (category === 'interact') return { icon: 'sparkles', label: '互动', className: 'bg-emerald-100 text-emerald-600' };
  return { icon: 'bell', label: '系统', className: 'bg-violet-100 text-violet-600' };
}

function NotificationAvatar({ notification, accent }: { notification: UnifiedNotification; accent: ReturnType<typeof notificationAccent> }): JSX.Element {
  const source = notificationAvatarSource(notification);
  return (
    <span className="kc-notification-avatar relative grid h-14 w-14 shrink-0 place-items-center">
      {isLevelNotification(notification) ? <LevelNotificationIcon notification={notification} className="is-large" /> : <Avatar user={source.user} label={source.label} avatarUrl={source.avatarUrl} size="lg" />}
      <span className={`kc-notification-avatar-badge absolute bottom-0 right-0 grid h-5 w-5 place-items-center rounded-full border-2 shadow-sm ${accent.className}`}>
        <Icon name={accent.icon} className="h-3 w-3" />
      </span>
    </span>
  );
}

function GroupRequestRow({ request, children }: { request: GroupJoinRequest; children?: React.ReactNode }): JSX.Element {
  const title = groupRequestTitle(request);
  const avatarUrl = resolveThumbnailUrl(request.conversation_avatar_url);
  return (
    <div className="kc-mobile-row-wrap flex items-center gap-3 rounded-2xl px-3 py-3 transition hover:[background:var(--kc-hover)]">
      {avatarUrl ? (
        <img src={avatarUrl} alt={title} className="h-10 w-10 rounded-2xl border object-cover [border-color:var(--kc-border)]" />
      ) : (
        <div className="grid h-10 w-10 place-items-center rounded-2xl border text-sm font-semibold [background:var(--kc-panel-muted)] [border-color:var(--kc-border)] [color:var(--kc-text)]">{title.slice(0, 1) || '群'}</div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{title}</p>
        <p className="truncate text-xs [color:var(--kc-muted)]">{request.requester ? `${getDisplayName(request.requester, `用户 ${request.requester_id}`)} 申请加入` : `申请人 ${request.requester_id}`} · {formatGroupRequestStatus(request.status)}</p>
        {request.message?.trim() ? <p className="mt-1 truncate text-xs [color:var(--kc-muted)]">附言：{request.message}</p> : null}
        {request.answer?.trim() ? <p className="mt-1 line-clamp-2 text-xs leading-5 [color:var(--kc-muted)]">回答：{request.answer}</p> : null}
      </div>
      {children ? <div className="kc-mobile-row-actions shrink-0">{children}</div> : null}
    </div>
  );
}

function NotificationRow({ notification, onOpenConversation, onOpenPost, onAcceptFriend, onRejectFriend, onIgnoreFriend, onAcceptGroup, onRejectGroup, busy }: { notification: UnifiedNotification; onOpenConversation: (conversationId: number) => void; onOpenPost: (postId: number) => void; onAcceptFriend: (id: number) => void; onRejectFriend: (id: number) => void; onIgnoreFriend: (id: number) => void; onAcceptGroup: (id: number) => void; onRejectGroup: (id: number) => void; busy: boolean }): JSX.Element {
  const accent = notificationAccent(notification.category);
  const [showPenalties, setShowPenalties] = useState(false);
  const target = notificationTarget(notification);
  const friendActions = notification.action === 'friend_request' && notification.friend_request_id ? (
    <>
      <button type="button" onClick={(event) => { event.stopPropagation(); onAcceptFriend(notification.friend_request_id ?? 0); }} disabled={busy} className="liquid-button rounded-xl px-3 py-2 text-xs font-bold disabled:opacity-50">接受</button>
      <button type="button" onClick={(event) => { event.stopPropagation(); onRejectFriend(notification.friend_request_id ?? 0); }} disabled={busy} className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-500 transition hover:bg-red-500 hover:text-white disabled:opacity-50">拒绝</button>
      <button type="button" onClick={(event) => { event.stopPropagation(); onIgnoreFriend(notification.friend_request_id ?? 0); }} disabled={busy} className="rounded-xl border px-3 py-2 text-xs font-bold transition [border-color:var(--kc-border)] [color:var(--kc-muted)] disabled:opacity-50">忽略</button>
    </>
  ) : null;
  const groupActions = notification.action === 'group_join_request' && notification.group_join_request_id ? (
    <>
      <button type="button" onClick={(event) => { event.stopPropagation(); onAcceptGroup(notification.group_join_request_id ?? 0); }} disabled={busy} className="liquid-button rounded-xl px-3 py-2 text-xs font-bold disabled:opacity-50">通过</button>
      <button type="button" onClick={(event) => { event.stopPropagation(); onRejectGroup(notification.group_join_request_id ?? 0); }} disabled={busy} className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-500 transition hover:bg-red-500 hover:text-white disabled:opacity-50">拒绝</button>
    </>
  ) : null;
  const actions = friendActions ?? groupActions;
  const content = (
    <>
      <span className="col-start-1 row-start-1"><NotificationAvatar notification={notification} accent={accent} /></span>
      <span className="col-start-2 row-start-1 min-w-0 max-w-full overflow-hidden">
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="min-w-0 max-w-full truncate text-sm font-black [color:var(--kc-text)]">{notification.title}</span>
          {notification.pending ? <span className="shrink-0 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-black text-white">待处理</span> : null}
          {notification.unread && !notification.pending ? <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" /> : null}
        </span>
        {notification.body ? <span className="mt-1 block min-w-0 max-w-full break-words text-xs leading-5 [color:var(--kc-muted)]">{notification.body}</span> : null}
        <span className="mt-1 flex min-w-0 max-w-full flex-wrap items-center gap-x-2 gap-y-1 text-[11px] [color:var(--kc-muted)]"><span className="shrink-0">{accent.label}</span>{notification.conversation_title ? <span className="min-w-0 max-w-full truncate">· {notification.conversation_title}</span> : null}<span className="shrink-0">· {formatNotificationTime(notification.time)}</span></span>
      </span>
      {target ? <Icon name="chevron" className="col-start-3 row-start-1 mt-3 h-4 w-4 shrink-0 [color:var(--kc-muted)]" /> : null}
      {actions ? <span className="col-start-2 col-span-2 flex min-w-0 max-w-full justify-end gap-2 pt-1">{actions}</span> : null}
    </>
  );
  const className = `grid w-full min-w-0 max-w-full grid-cols-[56px_minmax(0,1fr)_18px] items-start gap-x-3 gap-y-2 overflow-hidden rounded-[22px] border px-4 py-3 text-left transition [border-color:var(--kc-border)] ${notification.pending ? '[background:var(--kc-accent-soft)]' : '[background:var(--kc-panel)]'} ${target ? 'hover:-translate-y-0.5 hover:shadow-sm' : ''}`;
  if (!target) {
    return <div className={className}>{content}</div>;
  }
  return (
    <>
      <button type="button" onClick={() => {
        // 组队和机器人的通知在移动端没有对应的落点，点了不跳
        if (target.kind === 'penalty') { setShowPenalties(true); }
        else if (target.kind === 'level') { useKukeStore.getState().openLevel('me'); }
        else if (target.kind === 'post') { onOpenPost(target.id); }
        else if (target.kind === 'conversation') { onOpenConversation(target.id); }
      }} className={className}>{content}</button>
      {showPenalties ? <PenaltyCenterModal onClose={() => setShowPenalties(false)} /> : null}
    </>
  );
}

function TemporaryBlockRow({ block, children }: { block: TemporaryConversationBlock; children?: React.ReactNode }): JSX.Element {
  return (
    <div className="kc-mobile-row-wrap flex items-center gap-3 rounded-2xl px-3 py-3 transition hover:[background:var(--kc-hover)]">
      <Avatar user={block.blocked_user} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{getDisplayName(block.blocked_user, `用户 ${block.blocked_user_id}`)}</p>
        <p className="truncate text-xs [color:var(--kc-muted)]">已屏蔽临时会话 · {parseApiDate(block.created_at)?.toLocaleDateString('zh-CN') ?? ''}</p>
      </div>
      {children ? <div className="kc-mobile-row-actions shrink-0">{children}</div> : null}
    </div>
  );
}

/** 联系人页的入口：桌面布局走 desktop/，下面这一份只服务移动端。 */
export function ContactsPanel(props: ContactsPanelProps): JSX.Element {
  if (!props.isMobile) {
    return <ContactsDesktop friends={props.friends} conversations={props.conversations ?? []} isLoading={props.isLoading} currentUser={props.currentUser} onOpenGlobalSearch={props.onOpenGlobalSearch} onOpenConversation={props.onOpenConversation} onOpenPost={props.onOpenPost} />;
  }
  return <MobileContactsPanel {...props} />;
}

function MobileContactsPanel({ friends, conversations = [], isLoading, currentUser, onOpenSettings, onOpenGlobalSearch, onOpenConversation, onOpenPost, onMobileDetailActiveChange }: ContactsPanelProps): JSX.Element {
  const [mobileCategory, setMobileCategory] = useState<MobileContactsCategory>('all');
  const [mobilePage, setMobilePage] = useState<MobileContactsPage>(null);
  const [notificationFilter, setNotificationFilter] = useState<NotificationFilter>('all');
  const [query, setQuery] = useState('');
  const {
    cleanQuery, incomingQuery, outgoingQuery, incomingGroupRequestsQuery, outgoingGroupRequestsQuery, notificationsQuery, temporaryBlocksQuery, usersQuery,
    acceptMutation, rejectMutation, ignoreMutation, acceptGroupRequestMutation, rejectGroupRequestMutation, sendRequestMutation, directMutation, unblockMutation,
    incoming, outgoing, incomingGroupRequests, outgoingGroupRequests, notifications, notificationCount, pendingCount, requestBusy, temporaryBlocks,
    newCount, newFriendCount, pendingIncomingFriendCount, markSeen, ignoreAll,
    searchResults, friendIds, pendingOutgoingIds, filteredFriends, groupConversations, openConversation, openPost
  } = useContactsData({ friends, conversations, currentUser, query, onOpenConversation, onOpenPost });

  const friendRequestCount = incoming.length + outgoing.length;
  const groupRequestCount = incomingGroupRequests.length + outgoingGroupRequests.length;
  const filteredNotifications = notificationFilter === 'all' ? notifications : notifications.filter((item) => item.category === notificationFilter);
  const friendGroups = filteredFriends.reduce<Array<{ letter: string; items: Friendship[] }>>((groups, friendship) => {
    const letter = contactInitial(friendUser(friendship));
    const current = groups.find((group) => group.letter === letter);
    if (current) {
      current.items.push(friendship);
    } else {
      groups.push({ letter, items: [friendship] });
    }
    return groups;
  }, []);
  const alphabetRail = friendGroups.map((group) => group.letter);

  function openMobileContactsPage(page: Exclude<MobileContactsPage, null>): void {
    animateMobilePageChange('forward', () => {
      onMobileDetailActiveChange?.(true);
      setMobilePage(page);
    });
  }

  function closeMobileContactsPage(): void {
    animateMobilePageChange('back', () => {
      setMobilePage(null);
      onMobileDetailActiveChange?.(false);
    });
  }

  useEffect(() => registerNativeBackHandler(() => {
    if (mobilePage) {
      closeMobileContactsPage();
      return true;
    }
    return false;
  }, 50), [mobilePage]);

  // 打开着通知中心 / 新朋友页就算看过了：角标清零，之后来的才是新的（只提醒一次）
  useEffect(() => {
    if (mobilePage === 'notificationCenter' || mobilePage === 'friendRequests') {
      markSeen();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mobilePage, notificationsQuery.data]);

  useEffect(() => {
    if (!onMobileDetailActiveChange) {
      return undefined;
    }
    onMobileDetailActiveChange(Boolean(mobilePage));
    return () => onMobileDetailActiveChange(false);
  }, [mobilePage, onMobileDetailActiveChange]);

  const mobileCategories: Array<{ key: MobileContactsCategory; label: string; icon: 'users' | 'contacts' | 'message' }> = [
    { key: 'all', label: '全部', icon: 'users' },
    { key: 'friends', label: '好友', icon: 'contacts' },
    { key: 'groupChats', label: '群聊', icon: 'message' }
  ];
  const showSearchResults = cleanQuery.length > 0;
  const showRemoteUserSearch = cleanQuery.length >= 2 && mobileCategory !== 'groupChats';
  const pendingGroupRequests = incomingGroupRequests.filter((request) => request.status === 'pending').length;
  const mobilePageTransitionStyle: CSSProperties | undefined = mobilePage ? { viewTransitionName: 'kc-mobile-route' } : undefined;

  const renderMobileFriendGroups = (): JSX.Element => (
    <div>
      <div className="flex items-center justify-between px-4 py-3">
        <p className="text-[13px] font-bold text-[#8b95a5]">我的好友 {friends.length}</p>
        <span className="text-[12px] font-semibold text-[#8b95a5]">在线优先</span>
      </div>
      {/* 今天过生日的好友：顶上提一句，列表本身不重排，名字后面有个小蛋糕 */}
      <FriendBirthdayBanner users={filteredFriends.map(friendUser)} variant="mobile" />
      {isLoading ? <p className="px-4 pb-4 text-[13px] text-[#8b95a5]">正在加载好友...</p> : null}
      {!isLoading && filteredFriends.length === 0 ? <p className="px-4 pb-4 text-[13px] text-[#8b95a5]">暂无好友，点右上角添加。</p> : null}
      {friendGroups.map((group) => (
        <div key={group.letter} id={`kc-contact-${group.letter}`}>
          <div className="bg-[#f7f8fb] px-4 py-1 text-[12px] font-bold text-[#8b95a5]">{group.letter}</div>
          {group.items.map((friendship) => {
            const user = friendUser(friendship);
            const friendId = user?.id;
            if (!friendId) {
              return null;
            }
            return (
              <button key={friendship.id ?? friendId} type="button" onClick={() => directMutation.mutate({ user_id: friendId })} className="kc-qq-contact-entry">
                <Avatar user={user} />
                <span className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-[16px] font-semibold text-[#151922]">{getDisplayName(user, `用户 ${friendId}`)} <FriendBadgeMark userId={user.id} /><UserLevelIcons user={user} passive /><BirthdayMark user={user} /></span>
                  <span className="block truncate text-[12px] text-[#8b95a5]">{user?.bio || user?.email || '这个人很神秘，还没有简介'}</span>
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );

  const renderMobileGroupChats = (): JSX.Element => (
    <div>
      <div className="flex items-center justify-between px-4 py-3">
        <p className="text-[13px] font-bold text-[#8b95a5]">群聊 {groupConversations.length}</p>
        <span className="text-[12px] font-semibold text-[#8b95a5]">已加入</span>
      </div>
      {groupConversations.length === 0 ? <p className="px-4 pb-4 text-[13px] text-[#8b95a5]">暂无群聊。</p> : null}
      {groupConversations.map((conversation) => {
        const title = conversationTitle(conversation);
        const avatarUrl = resolveThumbnailUrl(conversation.avatar_url);
        return (
          <button key={conversation.id} type="button" onClick={() => openConversation(conversation.id)} className="kc-qq-contact-entry">
            {avatarUrl ? (
              <img src={avatarUrl} alt={title} className="h-10 w-10 rounded-2xl border object-cover [border-color:var(--kc-border)]" />
            ) : (
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[#edf6ff] text-[15px] font-bold text-[#168bff]">{title.slice(0, 1) || '群'}</span>
            )}
            <span className="min-w-0 flex-1 text-left">
              <span className="block truncate text-[16px] font-semibold text-[#151922]">{title}</span>
              <span className="block truncate text-[12px] text-[#8b95a5]">{conversation.member_count ?? conversation.members?.length ?? 0} 名成员{conversation.announcement?.trim() ? ` · ${conversation.announcement}` : ''}</span>
            </span>
          </button>
        );
      })}
    </div>
  );

  if (mobilePage === 'friendRequests') {
    return (
      <section className="kc-qq-page h-full min-h-0 overflow-hidden text-[#111827]" style={mobilePageTransitionStyle}>
        <MobileStatusBar />
        <div className="kc-qq-scroll scroll-soft h-[calc(100%-30px)] overflow-y-auto px-4 pb-6">
          <header className="kc-qq-nav-header">
            <button type="button" onClick={closeMobileContactsPage} className="grid h-9 w-9 place-items-center rounded-full text-[#111827]" aria-label="返回联系人"><Icon name="chevronLeft" className="h-6 w-6" /></button>
            <h1 className="text-[18px] font-bold text-[#111827]">新朋友</h1>
            <span className="h-9 w-9" />
          </header>
          <section className="kc-qq-card mt-3 p-3">
            <div className="flex items-center justify-between">
              <p className="kc-qq-section-title">收到的好友申请</p>
              {pendingIncomingFriendCount > 0 ? <button type="button" onClick={ignoreAll} disabled={requestBusy} className="rounded-full px-3 py-1 text-xs font-bold text-[#7b8798] disabled:opacity-50">全部忽略</button> : null}
            </div>
            {incomingQuery.isLoading ? <p className="rounded-[18px] bg-[#f4f6fa] p-4 text-[13px] text-[#8b95a5]">正在加载...</p> : null}
            {!incomingQuery.isLoading && incoming.length === 0 ? <p className="rounded-[18px] bg-[#f4f6fa] p-4 text-[13px] text-[#8b95a5]">暂无收到的好友申请。</p> : null}
            <div className="grid gap-1">
              {incoming.map((request) => (
                <RequestRow key={request.id} request={request} user={request.requester}>
                  {request.status === 'pending' ? (
                    <div className="flex gap-2">
                      <button type="button" onClick={() => acceptMutation.mutate(request.id)} className="rounded-full bg-[#168bff] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50" disabled={acceptMutation.isPending}>接受</button>
                      <button type="button" onClick={() => rejectMutation.mutate(request.id)} className="rounded-full bg-red-50 px-3 py-1.5 text-xs font-bold text-red-500 disabled:opacity-50" disabled={rejectMutation.isPending}>拒绝</button>
                      <button type="button" onClick={() => ignoreMutation.mutate(request.id)} className="rounded-full bg-[#f4f6fa] px-3 py-1.5 text-xs font-bold text-[#7b8798] disabled:opacity-50" disabled={requestBusy}>忽略</button>
                    </div>
                  ) : null}
                </RequestRow>
              ))}
            </div>
          </section>
          <section className="kc-qq-card mt-3 p-3">
            <p className="kc-qq-section-title">发出的好友申请</p>
            {outgoingQuery.isLoading ? <p className="rounded-[18px] bg-[#f4f6fa] p-4 text-[13px] text-[#8b95a5]">正在加载...</p> : null}
            {!outgoingQuery.isLoading && outgoing.length === 0 ? <p className="rounded-[18px] bg-[#f4f6fa] p-4 text-[13px] text-[#8b95a5]">暂无发出的好友申请。</p> : null}
            <div className="grid gap-1">
              {outgoing.map((request) => <RequestRow key={request.id} request={request} user={request.receiver} />)}
            </div>
          </section>
        </div>
      </section>
    );
  }

  if (mobilePage === 'groupRequests') {
    return (
      <section className="kc-qq-page h-full min-h-0 overflow-hidden text-[#111827]" style={mobilePageTransitionStyle}>
        <MobileStatusBar />
        <div className="kc-qq-scroll scroll-soft h-[calc(100%-30px)] overflow-y-auto px-4 pb-6">
          <header className="kc-qq-nav-header">
            <button type="button" onClick={closeMobileContactsPage} className="grid h-9 w-9 place-items-center rounded-full text-[#111827]" aria-label="返回联系人"><Icon name="chevronLeft" className="h-6 w-6" /></button>
            <h1 className="text-[18px] font-bold text-[#111827]">群通知</h1>
            <span className="h-9 w-9" />
          </header>
          <section className="kc-qq-card mt-3 p-3">
            <p className="kc-qq-section-title">收到的入群申请</p>
            {incomingGroupRequestsQuery.isLoading ? <p className="rounded-[18px] bg-[#f4f6fa] p-4 text-[13px] text-[#8b95a5]">正在加载...</p> : null}
            {!incomingGroupRequestsQuery.isLoading && incomingGroupRequests.length === 0 ? <p className="rounded-[18px] bg-[#f4f6fa] p-4 text-[13px] text-[#8b95a5]">暂无收到的入群申请。</p> : null}
            <div className="grid gap-1">
              {incomingGroupRequests.map((request) => (
                <GroupRequestRow key={`group-${request.id}`} request={request}>
                  {request.status === 'pending' ? (
                    <div className="flex gap-2">
                      <button type="button" onClick={() => acceptGroupRequestMutation.mutate(request.id)} className="rounded-full bg-[#168bff] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50" disabled={acceptGroupRequestMutation.isPending}>通过</button>
                      <button type="button" onClick={() => rejectGroupRequestMutation.mutate(request.id)} className="rounded-full bg-red-50 px-3 py-1.5 text-xs font-bold text-red-500 disabled:opacity-50" disabled={rejectGroupRequestMutation.isPending}>拒绝</button>
                    </div>
                  ) : null}
                </GroupRequestRow>
              ))}
            </div>
          </section>
          <section className="kc-qq-card mt-3 p-3">
            <p className="kc-qq-section-title">发出的入群申请</p>
            {outgoingGroupRequestsQuery.isLoading ? <p className="rounded-[18px] bg-[#f4f6fa] p-4 text-[13px] text-[#8b95a5]">正在加载...</p> : null}
            {!outgoingGroupRequestsQuery.isLoading && outgoingGroupRequests.length === 0 ? <p className="rounded-[18px] bg-[#f4f6fa] p-4 text-[13px] text-[#8b95a5]">暂无发出的入群申请。</p> : null}
            <div className="grid gap-1">
              {outgoingGroupRequests.map((request) => <GroupRequestRow key={`outgoing-group-${request.id}`} request={request} />)}
            </div>
          </section>
        </div>
      </section>
    );
  }

  if (mobilePage === 'notificationCenter') {
    const mobileFilters: Array<{ key: NotificationFilter; label: string }> = [
      { key: 'all', label: '全部' },
      { key: 'friend', label: '好友' },
      { key: 'group', label: '群聊' },
      { key: 'post', label: '动态' },
      { key: 'system', label: '系统' }
    ];
    return (
      <section className="kc-qq-page h-full min-h-0 overflow-hidden text-[#111827]" style={mobilePageTransitionStyle}>
        <MobileStatusBar />
        <div className="kc-qq-scroll scroll-soft h-[calc(100%-30px)] overflow-y-auto px-4 pb-6">
          <header className="kc-qq-nav-header">
            <button type="button" onClick={closeMobileContactsPage} className="grid h-9 w-9 place-items-center rounded-full text-[#111827]" aria-label="返回联系人"><Icon name="chevronLeft" className="h-6 w-6" /></button>
            <h1 className="text-[18px] font-bold text-[#111827]">通知中心</h1>
            <span className="h-9 w-9" />
          </header>
          <section className="kc-mobile-notice-hero mt-3 rounded-[26px] bg-gradient-to-br from-[#eaf4ff] via-white to-[#f7ecff] p-4">
            <p className="text-[13px] font-black uppercase tracking-[0.16em] text-[#168bff]">Notifications</p>
            <h2 className="mt-1 text-[24px] font-black text-[#111827]">{notificationCount} 条通知</h2>
            <p className="mt-1 text-[13px] font-semibold text-[#7b8798]">{pendingCount} 条待处理，好友、群聊和动态消息统一收纳。</p>
            {pendingIncomingFriendCount > 0 ? <button type="button" onClick={ignoreAll} disabled={requestBusy} className="mt-2 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-[#7b8798] disabled:opacity-50">全部忽略好友申请</button> : null}
          </section>
          <div className="scroll-soft mt-3 flex gap-2 overflow-x-auto pb-1">
            {mobileFilters.map((filter) => {
              const count = notificationsQuery.data?.counts?.[filter.key] ?? 0;
              return <button key={filter.key} type="button" onClick={() => setNotificationFilter(filter.key)} className={`shrink-0 rounded-full px-4 py-2 text-[13px] font-black transition ${notificationFilter === filter.key ? 'bg-[#168bff] text-white' : 'bg-white text-[#7b8798]'}`}>{filter.label}{count ? ` ${count}` : ''}</button>;
            })}
          </div>
          <section className="kc-qq-card mt-3 p-3">
            {notificationsQuery.isLoading ? <p className="rounded-[18px] bg-[#f4f6fa] p-4 text-[13px] text-[#8b95a5]">正在加载通知...</p> : null}
            {!notificationsQuery.isLoading && filteredNotifications.length === 0 ? <p className="rounded-[18px] bg-[#f4f6fa] p-4 text-[13px] text-[#8b95a5]">这里暂时没有通知。</p> : null}
            <div className="grid gap-2">
              {filteredNotifications.map((notification) => (
                <NotificationRow
                  key={notification.id}
                  notification={notification}
                  onOpenConversation={openConversation}
                  onOpenPost={openPost}
                  onAcceptFriend={(id) => acceptMutation.mutate(id)}
                  onRejectFriend={(id) => rejectMutation.mutate(id)}
                  onIgnoreFriend={(id) => ignoreMutation.mutate(id)}
                  onAcceptGroup={(id) => acceptGroupRequestMutation.mutate(id)}
                  onRejectGroup={(id) => rejectGroupRequestMutation.mutate(id)}
                  busy={requestBusy}
                />
              ))}
            </div>
          </section>
        </div>
      </section>
    );
  }

  if (mobilePage === 'temporaryBlocks') {
    return (
      <section className="kc-qq-page h-full min-h-0 overflow-hidden text-[#111827]" style={mobilePageTransitionStyle}>
        <MobileStatusBar />
        <div className="kc-qq-scroll scroll-soft h-[calc(100%-30px)] overflow-y-auto px-4 pb-6">
          <header className="kc-qq-nav-header">
            <button type="button" onClick={closeMobileContactsPage} className="grid h-9 w-9 place-items-center rounded-full text-[#111827]" aria-label="返回联系人"><Icon name="chevronLeft" className="h-6 w-6" /></button>
            <h1 className="text-[18px] font-bold text-[#111827]">临时会话屏蔽</h1>
            <span className="h-9 w-9" />
          </header>
          <section className="kc-mobile-notice-hero mt-3 rounded-[26px] bg-gradient-to-br from-[#fff1f1] via-white to-[#eef3ff] p-4">
            <p className="text-[13px] font-black uppercase tracking-[0.16em] text-red-500">Temporary Blocks</p>
            <h2 className="mt-1 text-[24px] font-black text-[#111827]">{temporaryBlocks.length} 位已屏蔽</h2>
            <p className="mt-1 text-[13px] font-semibold leading-5 text-[#7b8798]">解除后，对方可再次从群聊向你发起临时会话。</p>
          </section>
          <section className="kc-qq-card mt-3 p-3">
            {temporaryBlocksQuery.isLoading ? <p className="rounded-[18px] bg-[#f4f6fa] p-4 text-[13px] text-[#8b95a5]">正在加载屏蔽列表...</p> : null}
            {!temporaryBlocksQuery.isLoading && temporaryBlocks.length === 0 ? <p className="rounded-[18px] bg-[#f4f6fa] p-4 text-[13px] text-[#8b95a5]">还没有屏蔽任何临时会话。</p> : null}
            <div className="grid gap-1">
              {temporaryBlocks.map((block) => (
                <TemporaryBlockRow key={block.id} block={block}>
                  <button type="button" onClick={() => unblockMutation.mutate(block.id)} className="rounded-full bg-[#168bff] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50" disabled={unblockMutation.isPending}>解除</button>
                </TemporaryBlockRow>
              ))}
            </div>
          </section>
        </div>
      </section>
    );
  }

  return (
    <section className="kc-qq-page h-full min-h-0 overflow-hidden text-[#111827]">
      <MobileStatusBar />
      <div className="kc-qq-scroll scroll-soft relative h-[calc(100%-30px)] overflow-y-auto px-4 pb-5">
        <header className="kc-qq-home-header kc-qq-sticky-home-header">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={onOpenSettings} className="shrink-0 rounded-full" aria-label="打开设置">
              <Avatar user={currentUser} label={getDisplayName(currentUser)} size="lg" />
            </button>
            <h1 className="text-[25px] font-bold leading-tight text-[#111827]">联系人</h1>
          </div>
          <button type="button" onClick={() => onOpenGlobalSearch?.('')} className="kc-qq-round-action" aria-label="添加联系人">
            <Icon name="plus" className="h-6 w-6" />
          </button>
        </header>

        <label className="kc-qq-search-pill h-[50px]">
          <Icon name="search" className="h-5 w-5 shrink-0 text-[#a4adba]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && cleanQuery.length > 0) {
                onOpenGlobalSearch?.(cleanQuery);
              }
            }}
            className="min-w-0 flex-1 border-0 bg-transparent text-[15px] font-medium outline-none text-[#111827] placeholder:text-[#a4adba]"
            placeholder="搜索"
          />
        </label>

        <section className="kc-qq-card kc-pc-stagger mt-3 overflow-hidden p-0">
          <button type="button" onClick={() => openMobileContactsPage('notificationCenter')} className="kc-qq-contact-entry">
            <span className="grid h-11 w-11 place-items-center rounded-[16px] bg-[#eef3ff] text-[#5c6bff]"><Icon name="bell" className="h-5 w-5" /></span>
            <span className="min-w-0 flex-1 text-left">
              <span className="block text-[16px] font-semibold text-[#151922]">通知中心</span>
              <span className="mt-0.5 block truncate text-[12px] text-[#8b95a5]">{notificationCount} 条通知 · {pendingCount} 待处理</span>
            </span>
            {newCount ? <span className="rounded-full bg-[#ff3b30] px-2 py-0.5 text-[11px] font-bold text-white">{newCount > 99 ? '99+' : newCount}</span> : null}
            <Icon name="chevron" className="h-4 w-4 text-[#c0c5ce]" />
          </button>
          <button type="button" onClick={() => openMobileContactsPage('friendRequests')} className="kc-qq-contact-entry">
            <span className="grid h-11 w-11 place-items-center rounded-[16px] bg-[#eaf4ff] text-[#168bff]"><Icon name="userPlus" className="h-5 w-5" /></span>
            <span className="min-w-0 flex-1 text-left">
              <span className="block text-[16px] font-semibold text-[#151922]">新朋友</span>
              <span className="mt-0.5 block truncate text-[12px] text-[#8b95a5]">{friendRequestCount ? `${friendRequestCount} 条好友验证消息` : '好友申请与验证消息'}</span>
            </span>
            {newFriendCount ? <span className="rounded-full bg-[#ff3b30] px-2 py-0.5 text-[11px] font-bold text-white">{newFriendCount}</span> : null}
            <Icon name="chevron" className="h-4 w-4 text-[#c0c5ce]" />
          </button>
          <button type="button" onClick={() => openMobileContactsPage('groupRequests')} className="kc-qq-contact-entry">
            <span className="grid h-11 w-11 place-items-center rounded-[16px] bg-[#fff1dd] text-[#ff9500]"><Icon name="bell" className="h-5 w-5" /></span>
            <span className="min-w-0 flex-1 text-left">
              <span className="block text-[16px] font-semibold text-[#151922]">群通知</span>
              <span className="mt-0.5 block truncate text-[12px] text-[#8b95a5]">{groupRequestCount ? `${groupRequestCount} 条入群申请` : '群聊邀请与入群审核'}</span>
            </span>
            {pendingGroupRequests ? <span className="rounded-full bg-[#ff3b30] px-2 py-0.5 text-[11px] font-bold text-white">{pendingGroupRequests}</span> : null}
            <Icon name="chevron" className="h-4 w-4 text-[#c0c5ce]" />
          </button>
          <button type="button" onClick={() => openMobileContactsPage('temporaryBlocks')} className="kc-qq-contact-entry">
            <span className="grid h-11 w-11 place-items-center rounded-[16px] bg-[#fff0f0] text-red-500"><Icon name="shield" className="h-5 w-5" /></span>
            <span className="min-w-0 flex-1 text-left">
              <span className="block text-[16px] font-semibold text-[#151922]">临时会话屏蔽</span>
              <span className="mt-0.5 block truncate text-[12px] text-[#8b95a5]">{temporaryBlocks.length ? `${temporaryBlocks.length} 位已屏蔽` : '管理陌生人临时会话'}</span>
            </span>
            <Icon name="chevron" className="h-4 w-4 text-[#c0c5ce]" />
          </button>
        </section>

        <div className="kc-qq-contact-tabs">
          {mobileCategories.map((category) => (
            <button key={category.key} type="button" onClick={() => setMobileCategory(category.key)} className={`kc-qq-contact-tab ${mobileCategory === category.key ? 'kc-qq-contact-tab-active' : ''}`}>
              <Icon name={category.icon} className="h-4 w-4" />
              {category.label}
            </button>
          ))}
        </div>

        <section key={`${mobileCategory}-${showSearchResults ? 'search' : 'list'}`} className="kc-qq-card kc-pc-tab-content kc-pc-stagger mt-3 overflow-hidden p-0">
          {showSearchResults ? (
            <div className="p-3">
              {(mobileCategory === 'all' || mobileCategory === 'friends') ? renderMobileFriendGroups() : null}
              {(mobileCategory === 'all' || mobileCategory === 'groupChats') ? <div className={mobileCategory === 'all' ? 'mt-2 border-t pt-2 [border-color:var(--kc-border)]' : ''}>{renderMobileGroupChats()}</div> : null}
              {showRemoteUserSearch ? (
                <div className="mt-2 border-t pt-2 [border-color:var(--kc-border)]">
                  <p className="px-1 py-2 text-[13px] font-bold text-[#8b95a5]">全站用户</p>
                  {usersQuery.isLoading ? <p className="rounded-[18px] bg-[#f4f6fa] p-4 text-[13px] text-[#8b95a5]">正在搜索...</p> : null}
                  <div className="grid gap-1">
                    {searchResults.map((user) => {
                      const isSelf = user.id === currentUser.id;
                      const isFriend = friendIds.has(user.id);
                      const isPending = pendingOutgoingIds.has(user.id);
                      return (
                        <div key={user.id} className="kc-qq-contact-entry rounded-[18px]">
                          <Avatar user={user} />
                          <span className="min-w-0 flex-1 text-left">
                            <span className="block truncate text-[15px] font-semibold text-[#151922]">{getDisplayName(user)}{isSelf ? '（我）' : ''} <UserLevelIcons user={user} self={isSelf} /></span>
                            <span className="block truncate text-[12px] text-[#8b95a5]">{user.bio || user.email || `@${user.username}`}</span>
                          </span>
                          <button type="button" onClick={() => sendRequestMutation.mutate(user.id)} disabled={isSelf || isFriend || isPending || sendRequestMutation.isPending} className="rounded-full bg-[#168bff] px-3 py-1.5 text-xs font-bold text-white disabled:bg-[#d8dde7]">
                            {isSelf ? '我' : isFriend ? '好友' : isPending ? '已申请' : '申请'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : <p className="rounded-[18px] bg-[#f4f6fa] p-4 text-[13px] text-[#8b95a5]">继续输入可搜索全站用户。</p>}
            </div>
          ) : mobileCategory === 'all' ? (
            <div>
              {renderMobileFriendGroups()}
              <div className="h-2 bg-[#f7f8fb]" />
              {renderMobileGroupChats()}
            </div>
          ) : mobileCategory === 'friends' ? (
            renderMobileFriendGroups()
          ) : mobileCategory === 'groupChats' ? (
            renderMobileGroupChats()
          ) : (
            null
          )}
        </section>

        {alphabetRail.length > 0 && !showSearchResults && (mobileCategory === 'all' || mobileCategory === 'friends') ? (
          <div className="kc-qq-alpha-rail" aria-hidden="true">
            {alphabetRail.map((letter) => <a key={letter} href={`#kc-contact-${letter}`}>{letter}</a>)}
          </div>
        ) : null}
      </div>
    </section>
  );
}
