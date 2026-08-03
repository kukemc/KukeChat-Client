import { useEffect, useState, type CSSProperties } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { acceptGroupJoinRequest, createDirectConversation, getIncomingGroupJoinRequests, getOutgoingGroupJoinRequests, rejectGroupJoinRequest } from '@/api/conversations';
import { acceptFriendRequest, deleteFriend, deleteTemporaryConversationBlock, getIncomingFriendRequests, getOutgoingFriendRequests, getTemporaryConversationBlocks, rejectFriendRequest, sendFriendRequest } from '@/api/friends';
import { getNotifications } from '@/api/notifications';
import { searchUsers } from '@/api/users';
import { useKukeStore } from '@/store/kukeStore';
import { registerNativeBackHandler } from '@/native/back';
import { runNativeRouteTransition } from '@/native/transition';
import type { Conversation, FriendRequest, Friendship, GroupJoinRequest, TemporaryConversationBlock, UnifiedNotification, UnifiedNotificationCategory, User } from '@/types/api';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { MobileStatusBar } from '@/components/mobile/MobileChrome';
import { resolveThumbnailUrl } from '@/utils/assetUrl';

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

type ContactsTab = 'requests' | 'friends' | 'blocks' | 'search';
type MobileContactsCategory = 'all' | 'friends' | 'groupChats';
type MobileContactsPage = 'notificationCenter' | 'friendRequests' | 'groupRequests' | 'temporaryBlocks' | null;
type NotificationFilter = UnifiedNotificationCategory;

function friendUser(friendship: Friendship): User | null | undefined {
  return friendship.friend ?? friendship.user;
}

function conversationTitle(conversation: Conversation): string {
  return conversation.display_title?.trim() || conversation.my_remark?.trim() || conversation.title?.trim() || `群聊 ${conversation.id}`;
}

function animateMobilePageChange(isMobile: boolean, direction: 'forward' | 'back', update: () => void): void {
  runNativeRouteTransition(direction === 'forward' ? 'secondary-forward' : 'secondary-back', update, isMobile);
}

function contactInitial(user?: User | null): string {
  const name = getDisplayName(user, user?.username || '#').trim();
  const first = name.charAt(0).toUpperCase();
  return /^[A-Z]$/.test(first) ? first : '#';
}

function matchesContactUser(user: User | null | undefined, keyword: string): boolean {
  if (!keyword) {
    return true;
  }
  const text = [getDisplayName(user), user?.username, user?.nickname, user?.email, user?.bio, user?.id].join(' ').toLowerCase();
  return text.includes(keyword);
}

function matchesGroupConversation(conversation: Conversation, keyword: string): boolean {
  if (!keyword) {
    return true;
  }
  const text = [conversationTitle(conversation), conversation.title, conversation.display_title, conversation.description, conversation.announcement, conversation.category, conversation.id].join(' ').toLowerCase();
  return text.includes(keyword);
}

function formatStatus(status: FriendRequest['status']): string {
  if (status === 'pending') {
    return '等待验证';
  }
  if (status === 'accepted') {
    return '已通过';
  }
  return '已拒绝';
}

function RequestRow({ request, user, children }: { request: FriendRequest; user?: User | null; children?: React.ReactNode }): JSX.Element {
  return (
    <div className="kc-mobile-row-wrap flex items-center gap-3 rounded-2xl px-3 py-3 transition hover:[background:var(--kc-hover)]">
      <Avatar user={user} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{getDisplayName(user, `用户 ${request.requester_id}`)}</p>
        <p className="truncate text-xs [color:var(--kc-muted)]">{formatStatus(request.status)}{request.created_at ? ` · ${new Date(request.created_at).toLocaleDateString('zh-CN')}` : ''}</p>
      </div>
      {children ? <div className="kc-mobile-row-actions shrink-0">{children}</div> : null}
    </div>
  );
}

function formatGroupRequestStatus(status: GroupJoinRequest['status']): string {
  if (status === 'pending') {
    return '等待审核';
  }
  if (status === 'accepted') {
    return '已通过';
  }
  return '已拒绝';
}

function groupJoinRequestTime(request: GroupJoinRequest): number {
  const parsed = Date.parse(request.created_at || request.updated_at || '');
  return Number.isFinite(parsed) ? parsed : request.id;
}

function sortGroupJoinRequestsNewestFirst(requests: GroupJoinRequest[]): GroupJoinRequest[] {
  return [...requests].sort((left, right) => groupJoinRequestTime(right) - groupJoinRequestTime(left) || right.id - left.id);
}

function formatNotificationTime(value: string): string {
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) {
    return '';
  }
  const now = Date.now();
  const diff = Math.max(0, now - time.getTime());
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  return time.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
}

function notificationAccent(category: UnifiedNotificationCategory): { icon: 'bell' | 'users' | 'message' | 'feed' | 'sparkles'; className: string; label: string } {
  if (category === 'friend') return { icon: 'users', label: '好友', className: 'bg-sky-100 text-sky-600' };
  if (category === 'group') return { icon: 'message', label: '群聊', className: 'bg-amber-100 text-amber-600' };
  if (category === 'post') return { icon: 'feed', label: '动态', className: 'bg-pink-100 text-pink-600' };
  if (category === 'interact') return { icon: 'sparkles', label: '互动', className: 'bg-emerald-100 text-emerald-600' };
  return { icon: 'bell', label: '系统', className: 'bg-violet-100 text-violet-600' };
}

function notificationAvatarSource(notification: UnifiedNotification): { user?: User | null; label?: string | null; avatarUrl?: string | null } {
  const useConversationAvatar = notification.category === 'system' || notification.category === 'group' || (!notification.actor && !!notification.conversation_avatar_url);
  if (useConversationAvatar) {
    return {
      label: notification.conversation_title || '群聊',
      avatarUrl: notification.conversation_avatar_url
    };
  }
  if (notification.actor) {
    return { user: notification.actor };
  }
  return {
    label: notification.conversation_title || notification.title || '通知',
    avatarUrl: notification.conversation_avatar_url
  };
}

function NotificationAvatar({ notification, accent }: { notification: UnifiedNotification; accent: ReturnType<typeof notificationAccent> }): JSX.Element {
  const source = notificationAvatarSource(notification);
  return (
    <span className="kc-notification-avatar relative grid h-14 w-14 shrink-0 place-items-center">
      <Avatar user={source.user} label={source.label} avatarUrl={source.avatarUrl} size="lg" />
      <span className={`kc-notification-avatar-badge absolute bottom-0 right-0 grid h-5 w-5 place-items-center rounded-full border-2 shadow-sm ${accent.className}`}>
        <Icon name={accent.icon} className="h-3 w-3" />
      </span>
    </span>
  );
}

function GroupRequestRow({ request, children }: { request: GroupJoinRequest; children?: React.ReactNode }): JSX.Element {
  const title = request.conversation_display_title?.trim() || request.conversation_title?.trim() || `群聊 ${request.conversation_id}`;
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


function NotificationRow({ notification, onOpenConversation, onOpenPost, onOpenTeamup, onOpenBot, onAcceptFriend, onRejectFriend, onAcceptGroup, onRejectGroup, busy, compact = false }: { notification: UnifiedNotification; onOpenConversation: (conversationId: number) => void; onOpenPost: (postId: number) => void; onOpenTeamup?: (profileId: number) => void; onOpenBot?: (botId: number) => void; onAcceptFriend: (id: number) => void; onRejectFriend: (id: number) => void; onAcceptGroup: (id: number) => void; onRejectGroup: (id: number) => void; busy: boolean; compact?: boolean }): JSX.Element {
  const accent = notificationAccent(notification.category);
  const teamupProfileId = typeof notification.payload?.profile_id === 'number' ? notification.payload.profile_id : null;
  const botId = typeof notification.payload?.bot_id === 'number' ? notification.payload.bot_id : null;
  const clickable = Boolean((notification.action === 'open_conversation' && notification.conversation_id) || (notification.action === 'open_post' && notification.post_id) || (notification.action === 'open_teamup' && teamupProfileId) || (notification.action === 'open_bot' && botId));
  const friendActions = notification.action === 'friend_request' && notification.friend_request_id ? (
    <>
      <button type="button" onClick={(event) => { event.stopPropagation(); onAcceptFriend(notification.friend_request_id ?? 0); }} disabled={busy} className="liquid-button rounded-xl px-3 py-2 text-xs font-bold disabled:opacity-50">接受</button>
      <button type="button" onClick={(event) => { event.stopPropagation(); onRejectFriend(notification.friend_request_id ?? 0); }} disabled={busy} className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-500 transition hover:bg-red-500 hover:text-white disabled:opacity-50">拒绝</button>
    </>
  ) : null;
  const groupActions = notification.action === 'group_join_request' && notification.group_join_request_id ? (
    <>
      <button type="button" onClick={(event) => { event.stopPropagation(); onAcceptGroup(notification.group_join_request_id ?? 0); }} disabled={busy} className="liquid-button rounded-xl px-3 py-2 text-xs font-bold disabled:opacity-50">通过</button>
      <button type="button" onClick={(event) => { event.stopPropagation(); onRejectGroup(notification.group_join_request_id ?? 0); }} disabled={busy} className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-500 transition hover:bg-red-500 hover:text-white disabled:opacity-50">拒绝</button>
    </>
  ) : null;
  const actions = friendActions ?? groupActions;
  if (compact) {
    const compactContent = (
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
        {clickable ? <Icon name="chevron" className="col-start-3 row-start-1 mt-3 h-4 w-4 shrink-0 [color:var(--kc-muted)]" /> : null}
        {actions ? <span className="col-start-2 col-span-2 flex min-w-0 max-w-full justify-end gap-2 pt-1">{actions}</span> : null}
      </>
    );
    const compactClass = `grid w-full min-w-0 max-w-full grid-cols-[56px_minmax(0,1fr)_18px] items-start gap-x-3 gap-y-2 overflow-hidden rounded-[22px] border px-4 py-3 text-left transition [border-color:var(--kc-border)] ${notification.pending ? '[background:var(--kc-accent-soft)]' : '[background:var(--kc-panel)]'} ${clickable ? 'hover:-translate-y-0.5 hover:shadow-sm' : ''}`;
    if (clickable) {
      return <button type="button" onClick={() => {
        if (notification.action === 'open_post' && notification.post_id) { onOpenPost(notification.post_id); }
        else if (notification.action === 'open_teamup' && teamupProfileId) { onOpenTeamup?.(teamupProfileId); }
        else if (notification.action === 'open_bot' && botId) { onOpenBot?.(botId); }
        else if (notification.conversation_id) { onOpenConversation(notification.conversation_id); }
      }} className={compactClass}>{compactContent}</button>;
    }
    return <div className={compactClass}>{compactContent}</div>;
  }
  const content = (
    <>
      <span className="kc-notification-row-avatar"><NotificationAvatar notification={notification} accent={accent} /></span>
      <span className="kc-notification-row-copy min-w-0 max-w-full overflow-hidden">
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="min-w-0 max-w-full truncate text-sm font-black [color:var(--kc-text)]">{notification.title}</span>
          {notification.pending ? <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-black text-white">待处理</span> : null}
          {notification.unread && !notification.pending ? <span className="h-2 w-2 rounded-full bg-red-500" /> : null}
        </span>
        {notification.body ? <span className="mt-1 block min-w-0 max-w-full break-words text-xs leading-5 [color:var(--kc-muted)]">{notification.body}</span> : null}
        <span className="mt-1 flex min-w-0 max-w-full flex-wrap items-center gap-x-2 gap-y-1 text-[11px] [color:var(--kc-muted)]"><span className="shrink-0">{accent.label}</span>{notification.conversation_title ? <span className="min-w-0 max-w-full truncate">· {notification.conversation_title}</span> : null}<span className="shrink-0">· {formatNotificationTime(notification.time)}</span></span>
      </span>
      {actions ? <span className="kc-notification-row-actions flex shrink-0 items-center justify-end gap-2">{actions}</span> : null}
      {clickable ? <Icon name="chevron" className="kc-notification-row-chevron h-4 w-4 shrink-0 [color:var(--kc-muted)]" /> : <span className="kc-notification-row-chevron" />}
    </>
  );
  const className = `kc-notification-row grid w-full min-w-0 max-w-full grid-cols-[56px_minmax(0,1fr)_auto_18px] items-center gap-3 overflow-hidden rounded-[22px] border px-4 py-3 text-left transition [border-color:var(--kc-border)] ${notification.pending ? '[background:var(--kc-accent-soft)]' : '[background:var(--kc-panel)]'} ${clickable ? 'hover:-translate-y-0.5 hover:shadow-sm' : ''}`;
  if (clickable) {
    return <button type="button" onClick={() => {
      if (notification.action === 'open_post' && notification.post_id) { onOpenPost(notification.post_id); }
      else if (notification.action === 'open_teamup' && teamupProfileId) { onOpenTeamup?.(teamupProfileId); }
      else if (notification.action === 'open_bot' && botId) { onOpenBot?.(botId); }
      else if (notification.conversation_id) { onOpenConversation(notification.conversation_id); }
    }} className={className}>{content}</button>;
  }
  return <div className={className}>{content}</div>;
}

function TemporaryBlockRow({ block, children }: { block: TemporaryConversationBlock; children?: React.ReactNode }): JSX.Element {
  return (
    <div className="kc-mobile-row-wrap flex items-center gap-3 rounded-2xl px-3 py-3 transition hover:[background:var(--kc-hover)]">
      <Avatar user={block.blocked_user} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{getDisplayName(block.blocked_user, `用户 ${block.blocked_user_id}`)}</p>
        <p className="truncate text-xs [color:var(--kc-muted)]">已屏蔽临时会话 · {block.created_at ? new Date(block.created_at).toLocaleDateString('zh-CN') : ''}</p>
      </div>
      {children ? <div className="kc-mobile-row-actions shrink-0">{children}</div> : null}
    </div>
  );
}

export function ContactsPanel({ friends, conversations = [], isLoading, currentUser, isMobile = false, onOpenSettings, onOpenGlobalSearch, onOpenConversation, onOpenPost, onMobileDetailActiveChange }: ContactsPanelProps): JSX.Element {
  const [activeTab, setActiveTab] = useState<ContactsTab>('requests');
  const [mobileCategory, setMobileCategory] = useState<MobileContactsCategory>('all');
  const [mobilePage, setMobilePage] = useState<MobileContactsPage>(null);
  const [notificationFilter, setNotificationFilter] = useState<NotificationFilter>('all');
  const [query, setQuery] = useState('');
  const queryClient = useQueryClient();
  const setActiveConversationId = useKukeStore((state) => state.setActiveConversationId);
  const setWorkspaceView = useKukeStore((state) => state.setWorkspaceView);
  const cleanQuery = query.trim();
  const cleanQueryLower = cleanQuery.toLowerCase();

  const incomingQuery = useQuery({ queryKey: ['friend-requests', 'incoming'], queryFn: getIncomingFriendRequests });
  const outgoingQuery = useQuery({ queryKey: ['friend-requests', 'outgoing'], queryFn: getOutgoingFriendRequests });
  const incomingGroupRequestsQuery = useQuery({ queryKey: ['group-join-requests', 'incoming'], queryFn: getIncomingGroupJoinRequests });
  const outgoingGroupRequestsQuery = useQuery({ queryKey: ['group-join-requests', 'outgoing'], queryFn: getOutgoingGroupJoinRequests });
  const notificationsQuery = useQuery({ queryKey: ['notifications'], queryFn: () => getNotifications(120) });
  const temporaryBlocksQuery = useQuery({ queryKey: ['temporary-conversation-blocks'], queryFn: getTemporaryConversationBlocks });
  const usersQuery = useQuery({
    queryKey: ['users-search', cleanQuery],
    queryFn: () => searchUsers(cleanQuery),
    enabled: cleanQuery.length >= 2
  });

  const invalidateContacts = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['friends'] });
    void queryClient.invalidateQueries({ queryKey: ['friend-requests'] });
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  const acceptMutation = useMutation({
    mutationFn: acceptFriendRequest,
    onSuccess: (request) => {
      invalidateContacts();
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      const peerId = request.requester_id === currentUser.id ? request.receiver_id : request.requester_id;
      directMutation.mutate({ user_id: peerId });
    }
  });
  const rejectMutation = useMutation({ mutationFn: rejectFriendRequest, onSuccess: invalidateContacts });
  const acceptGroupRequestMutation = useMutation({
    mutationFn: (requestId: number) => acceptGroupJoinRequest(requestId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['group-join-requests'] });
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    }
  });
  const rejectGroupRequestMutation = useMutation({
    mutationFn: (requestId: number) => rejectGroupJoinRequest(requestId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['group-join-requests'] });
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    }
  });
  const sendRequestMutation = useMutation({ mutationFn: sendFriendRequest, onSuccess: invalidateContacts });
  const directMutation = useMutation({
    mutationFn: createDirectConversation,
    onSuccess: (conversation) => {
      queryClient.setQueryData<Conversation[] | undefined>(['conversations'], (current) => {
        if (!current) {
          return [conversation];
        }
        if (current.some((item) => item.id === conversation.id)) {
          return current.map((item) => (item.id === conversation.id ? { ...item, ...conversation } : item));
        }
        return [conversation, ...current];
      });
      if (onOpenConversation) {
        onOpenConversation(conversation.id);
      } else {
        setActiveConversationId(conversation.id);
        setWorkspaceView('chat');
      }
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    }
  });
  const deleteMutation = useMutation({ mutationFn: deleteFriend, onSuccess: invalidateContacts });
  const unblockMutation = useMutation({
    mutationFn: deleteTemporaryConversationBlock,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['temporary-conversation-blocks'] });
    }
  });

  const incoming = incomingQuery.data ?? [];
  const outgoing = outgoingQuery.data ?? [];
  const incomingGroupRequests = sortGroupJoinRequestsNewestFirst(incomingGroupRequestsQuery.data ?? []);
  const outgoingGroupRequests = sortGroupJoinRequestsNewestFirst(outgoingGroupRequestsQuery.data ?? []);
  const temporaryBlocks = temporaryBlocksQuery.data ?? [];
  const friendRequestCount = incoming.length + outgoing.length;
  const groupRequestCount = incomingGroupRequests.length + outgoingGroupRequests.length;
  const pendingIncoming = incoming.filter((request) => request.status === 'pending').length + incomingGroupRequests.filter((request) => request.status === 'pending').length;
  const unifiedNotifications = notificationsQuery.data?.items ?? [];
  const filteredNotifications = notificationFilter === 'all' ? unifiedNotifications : unifiedNotifications.filter((item) => item.category === notificationFilter);
  const friendIds = new Set(friends.map((friendship) => friendUser(friendship)?.id).filter((id): id is number => typeof id === 'number'));
  const pendingOutgoingIds = new Set(outgoing.filter((request) => request.status === 'pending').map((request) => request.receiver_id));
  const searchResults = usersQuery.data ?? [];
  const sortedFriends = [...friends].sort((left, right) => getDisplayName(friendUser(left), '').localeCompare(getDisplayName(friendUser(right), ''), 'zh-CN'));
  const filteredFriends = cleanQuery ? sortedFriends.filter((friendship) => matchesContactUser(friendUser(friendship), cleanQueryLower)) : sortedFriends;
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
  const groupConversations = conversations
    .filter((conversation) => conversation.type === 'group')
    .filter((conversation) => !cleanQuery || matchesGroupConversation(conversation, cleanQueryLower))
    .sort((left, right) => conversationTitle(left).localeCompare(conversationTitle(right), 'zh-CN'));

  const openConversation = (conversationId: number): void => {
    if (onOpenConversation) {
      onOpenConversation(conversationId);
      return;
    }
    setActiveConversationId(conversationId);
    setWorkspaceView('chat');
  };

  const openPostFromNotification = (postId: number): void => {
    if (onOpenPost) {
      onOpenPost(postId);
      return;
    }
    useKukeStore.getState().openPost(postId);
  };

  const openTeamupFromNotification = (profileId: number): void => {
    useKukeStore.getState().openTeamupProfile(profileId);
  };

  const openBotFromNotification = (botId: number): void => {
    useKukeStore.getState().openBot(botId);
  };

  function openMobileContactsPage(page: Exclude<MobileContactsPage, null>): void {
    animateMobilePageChange(isMobile, 'forward', () => {
      onMobileDetailActiveChange?.(true);
      setMobilePage(page);
    });
  }

  function closeMobileContactsPage(): void {
    animateMobilePageChange(isMobile, 'back', () => {
      setMobilePage(null);
      onMobileDetailActiveChange?.(false);
    });
  }

  useEffect(() => {
    if (!isMobile) {
      return;
    }

    return registerNativeBackHandler(() => {
      if (mobilePage) {
        closeMobileContactsPage();
        return true;
      }
      return false;
    }, 50);
  }, [isMobile, mobilePage]);

  useEffect(() => {
    if (!isMobile || !onMobileDetailActiveChange) {
      return undefined;
    }
    onMobileDetailActiveChange(Boolean(mobilePage));
    return () => onMobileDetailActiveChange(false);
  }, [isMobile, mobilePage, onMobileDetailActiveChange]);

  const navItems: Array<{ tab: ContactsTab; label: string; detail: string; icon: 'bell' | 'users' | 'search' | 'shield'; badge?: number }> = [
    { tab: 'requests', label: '通知中心', detail: `${notificationsQuery.data?.counts?.all ?? unifiedNotifications.length} 条通知 · ${notificationsQuery.data?.pending_count ?? pendingIncoming} 待处理`, icon: 'bell', badge: notificationsQuery.data?.pending_count ?? pendingIncoming },
    { tab: 'friends', label: '我的好友', detail: `${friends.length} 位联系人`, icon: 'users' },
    { tab: 'blocks', label: '临时会话屏蔽', detail: `${temporaryBlocks.length} 位已屏蔽`, icon: 'shield' },
    { tab: 'search', label: '找人', detail: '用户名或邮箱', icon: 'search' }
  ];

  if (isMobile) {
    const mobileCategories: Array<{ key: MobileContactsCategory; label: string; icon: 'users' | 'contacts' | 'message' }> = [
      { key: 'all', label: '全部', icon: 'users' },
      { key: 'friends', label: '好友', icon: 'contacts' },
      { key: 'groupChats', label: '群聊', icon: 'message' }
    ];
    const showSearchResults = cleanQuery.length > 0;
    const showRemoteUserSearch = cleanQuery.length >= 2 && mobileCategory !== 'groupChats';
    const pendingFriendRequests = incoming.filter((request) => request.status === 'pending').length;
    const pendingGroupRequests = incomingGroupRequests.filter((request) => request.status === 'pending').length;
    const mobilePageTransitionStyle: CSSProperties | undefined = mobilePage ? { viewTransitionName: 'kc-mobile-route' } : undefined;

    const renderMobileFriendGroups = (): JSX.Element => (
      <div>
        <div className="flex items-center justify-between px-4 py-3">
          <p className="text-[13px] font-bold text-[#8b95a5]">我的好友 {friends.length}</p>
          <span className="text-[12px] font-semibold text-[#8b95a5]">在线优先</span>
        </div>
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
                    <span className="block truncate text-[16px] font-semibold text-[#151922]">{getDisplayName(user, `用户 ${friendId}`)}</span>
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
              <p className="kc-qq-section-title">收到的好友申请</p>
              {incomingQuery.isLoading ? <p className="rounded-[18px] bg-[#f4f6fa] p-4 text-[13px] text-[#8b95a5]">正在加载...</p> : null}
              {!incomingQuery.isLoading && incoming.length === 0 ? <p className="rounded-[18px] bg-[#f4f6fa] p-4 text-[13px] text-[#8b95a5]">暂无收到的好友申请。</p> : null}
              <div className="grid gap-1">
                {incoming.map((request) => (
                  <RequestRow key={request.id} request={request} user={request.requester}>
                    {request.status === 'pending' ? (
                      <div className="flex gap-2">
                        <button type="button" onClick={() => acceptMutation.mutate(request.id)} className="rounded-full bg-[#168bff] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50" disabled={acceptMutation.isPending}>接受</button>
                        <button type="button" onClick={() => rejectMutation.mutate(request.id)} className="rounded-full bg-red-50 px-3 py-1.5 text-xs font-bold text-red-500 disabled:opacity-50" disabled={rejectMutation.isPending}>拒绝</button>
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
              <h2 className="mt-1 text-[24px] font-black text-[#111827]">{notificationsQuery.data?.counts?.all ?? unifiedNotifications.length} 条通知</h2>
              <p className="mt-1 text-[13px] font-semibold text-[#7b8798]">{notificationsQuery.data?.pending_count ?? pendingIncoming} 条待处理，好友、群聊和动态消息统一收纳。</p>
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
                    onOpenPost={openPostFromNotification}
                    onAcceptFriend={(id) => acceptMutation.mutate(id)}
                    onRejectFriend={(id) => rejectMutation.mutate(id)}
                    onAcceptGroup={(id) => acceptGroupRequestMutation.mutate(id)}
                    onRejectGroup={(id) => rejectGroupRequestMutation.mutate(id)}
                    busy={acceptMutation.isPending || rejectMutation.isPending || acceptGroupRequestMutation.isPending || rejectGroupRequestMutation.isPending}
                    compact
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
                <span className="mt-0.5 block truncate text-[12px] text-[#8b95a5]">{notificationsQuery.data?.counts?.all ?? unifiedNotifications.length} 条通知 · {notificationsQuery.data?.pending_count ?? pendingIncoming} 待处理</span>
              </span>
              {(notificationsQuery.data?.pending_count ?? pendingIncoming) ? <span className="rounded-full bg-[#ff3b30] px-2 py-0.5 text-[11px] font-bold text-white">{notificationsQuery.data?.pending_count ?? pendingIncoming}</span> : null}
              <Icon name="chevron" className="h-4 w-4 text-[#c0c5ce]" />
            </button>
            <button type="button" onClick={() => openMobileContactsPage('friendRequests')} className="kc-qq-contact-entry">
              <span className="grid h-11 w-11 place-items-center rounded-[16px] bg-[#eaf4ff] text-[#168bff]"><Icon name="userPlus" className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1 text-left">
                <span className="block text-[16px] font-semibold text-[#151922]">新朋友</span>
                <span className="mt-0.5 block truncate text-[12px] text-[#8b95a5]">{friendRequestCount ? `${friendRequestCount} 条好友验证消息` : '好友申请与验证消息'}</span>
              </span>
              {pendingFriendRequests ? <span className="rounded-full bg-[#ff3b30] px-2 py-0.5 text-[11px] font-bold text-white">{pendingFriendRequests}</span> : null}
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
                              <span className="block truncate text-[15px] font-semibold text-[#151922]">{getDisplayName(user)}{isSelf ? '（我）' : ''}</span>
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

  return (
    <section className="kc-mobile-split kc-pc-page-shell grid h-full min-h-0 grid-cols-[254px_minmax(0,1fr)] overflow-hidden [background:var(--kc-chat)] [color:var(--kc-text)] max-md:grid-cols-1 max-md:overflow-y-auto">
      <aside className="kc-mobile-sidebar kc-pc-page-sidebar min-h-0 border-r px-3 py-4 [background:var(--kc-list)] [border-color:var(--kc-border)] max-md:border-b max-md:border-r-0">
        <div className="mb-4 flex items-center justify-between px-1">
          <div>
            <h3 className="text-lg font-semibold">联系人</h3>
            <p className="mt-0.5 text-xs [color:var(--kc-muted)]">好友与验证消息</p>
          </div>
          <Icon name="filter" className="h-4 w-4 [color:var(--kc-muted)]" />
        </div>
        <label className="mb-4 flex h-9 items-center gap-2 rounded-xl px-3 [background:var(--kc-panel-muted)]">
          <Icon name="search" className="h-4 w-4 [color:var(--kc-muted)]" />
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveTab('search');
            }}
            onFocus={() => setActiveTab('search')}
            className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none [color:var(--kc-text)] placeholder:[color:var(--kc-muted)]"
            placeholder="搜索用户"
          />
        </label>
        <nav className="grid gap-1">
          {navItems.map((item) => (
            <button key={item.tab} type="button" onClick={() => setActiveTab(item.tab)} className={`kc-pc-nav-row flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition ${activeTab === item.tab ? 'kc-pc-nav-row-active [background:var(--kc-active)] [color:var(--kc-text)]' : '[color:var(--kc-muted)] hover:[background:var(--kc-hover)] hover:[color:var(--kc-text)]'}`}>
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl [background:var(--kc-panel-muted)]">
                <Icon name={item.icon} className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  {item.label}
                  {item.badge ? <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{item.badge}</span> : null}
                </span>
                <span className="mt-0.5 block truncate text-xs [color:var(--kc-muted)]">{item.detail}</span>
              </span>
              <Icon name="chevron" className="h-4 w-4" />
            </button>
          ))}
        </nav>
      </aside>

      <main className="kc-mobile-content kc-pc-page-main scroll-soft min-h-0 overflow-y-auto p-4 sm:p-6">
        {activeTab === 'requests' ? (
          <div key="contacts-requests" className="kc-pc-tab-content mx-auto max-w-4xl">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="text-2xl font-semibold">通知中心</h3>
                <p className="mt-1 text-sm [color:var(--kc-muted)]">统一查看好友、群聊、动态和管理群系统通知。</p>
              </div>
              <span className="rounded-full px-3 py-1.5 text-xs font-black [background:var(--kc-accent-soft)] [color:var(--kc-accent)]">{notificationsQuery.data?.pending_count ?? 0} 条待处理</span>
            </div>
            <div className="kc-pc-stagger grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
              <aside className="glass-panel rounded-[28px] p-3">
                {(['all', 'friend', 'group', 'post', 'interact', 'system'] as NotificationFilter[]).map((category) => {
                  const labels: Record<NotificationFilter, string> = { all: '全部', friend: '好友', group: '群聊', post: '动态', interact: '互动', system: '系统' };
                  const count = notificationsQuery.data?.counts?.[category] ?? 0;
                  return <button key={category} type="button" onClick={() => setNotificationFilter(category)} className={`mb-1 flex w-full items-center justify-between rounded-2xl px-3 py-2.5 text-sm font-bold transition ${notificationFilter === category ? '[background:var(--kc-accent-soft)] [color:var(--kc-accent)]' : 'hover:[background:var(--kc-hover)] [color:var(--kc-muted)]'}`}><span>{labels[category]}</span><span className="text-xs">{count}</span></button>;
                })}
              </aside>
              <section className="glass-panel overflow-hidden rounded-[28px] p-3">
                {notificationsQuery.isLoading ? <p className="rounded-2xl p-4 text-sm [background:var(--kc-panel-muted)] [color:var(--kc-muted)]">正在加载通知...</p> : null}
                {!notificationsQuery.isLoading && filteredNotifications.length === 0 ? <p className="rounded-2xl p-8 text-center text-sm [background:var(--kc-panel-muted)] [color:var(--kc-muted)]">这里暂时没有通知。</p> : null}
                <div className="grid gap-2">
                  {filteredNotifications.map((notification) => (
                    <NotificationRow
                      key={notification.id}
                      notification={notification}
                      onOpenConversation={openConversation}
                      onOpenPost={openPostFromNotification}
                      onOpenTeamup={openTeamupFromNotification}
                      onOpenBot={openBotFromNotification}
                      onAcceptFriend={(id) => acceptMutation.mutate(id)}
                      onRejectFriend={(id) => rejectMutation.mutate(id)}
                      onAcceptGroup={(id) => acceptGroupRequestMutation.mutate(id)}
                      onRejectGroup={(id) => rejectGroupRequestMutation.mutate(id)}
                      busy={acceptMutation.isPending || rejectMutation.isPending || acceptGroupRequestMutation.isPending || rejectGroupRequestMutation.isPending}
                    />
                  ))}
                </div>
              </section>
            </div>
          </div>
        ) : null}

        {activeTab === 'friends' ? (
          <div key="contacts-friends" className="kc-pc-tab-content mx-auto max-w-4xl">
            <div className="mb-5">
              <h3 className="text-2xl font-semibold">我的好友</h3>
              <p className="mt-1 text-sm [color:var(--kc-muted)]">像联系人列表一样管理好友，快速发起聊天。</p>
            </div>
            <section className="glass-panel overflow-hidden rounded-[28px]">
              <div className="flex items-center gap-2 border-b px-4 py-3 [border-color:var(--kc-border)] [background:var(--kc-panel-muted)]">
                <Icon name="chevron" className="h-4 w-4 rotate-90 [color:var(--kc-muted)]" />
                <h4 className="text-sm font-semibold">我的好友 {friends.length}</h4>
              </div>
              {isLoading ? <p className="p-4 text-sm [color:var(--kc-muted)]">正在加载好友...</p> : null}
              {!isLoading && friends.length === 0 ? <p className="p-4 text-sm [color:var(--kc-muted)]">还没有好友，去“找人”发送申请。</p> : null}
              {!isLoading && friends.length > 0 && filteredFriends.length === 0 ? <p className="p-4 text-sm [color:var(--kc-muted)]">没有找到匹配好友。</p> : null}
              <div className="kc-pc-stagger divide-y [divide-color:var(--kc-border)]">
                {filteredFriends.map((friendship) => {
                  const user = friendUser(friendship);
                  const friendId = user?.id;
                  if (!friendId) {
                    return null;
                  }
                  return (
                    <div key={friendship.id ?? friendId} className="flex items-center gap-3 px-4 py-3 transition hover:[background:var(--kc-hover)]">
                      <Avatar user={user} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{getDisplayName(user, `用户 ${friendId}`)}</p>
                        <p className="truncate text-xs [color:var(--kc-muted)]">{user?.bio || user?.email || '这个人很神秘，还没有简介'}</p>
                      </div>
                      <button type="button" onClick={() => directMutation.mutate({ user_id: friendId })} className="liquid-button rounded-xl px-3 py-2 text-xs font-bold transition disabled:opacity-50" disabled={directMutation.isPending}>聊天</button>
                      <button type="button" onClick={() => deleteMutation.mutate(friendId)} className="grid h-9 w-9 place-items-center rounded-xl border border-red-500/30 bg-red-500/10 text-red-500 transition hover:bg-red-500 hover:text-white disabled:opacity-50" disabled={deleteMutation.isPending} title="删除好友">
                        <Icon name="trash" className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        ) : null}

        {activeTab === 'blocks' ? (
          <div key="contacts-blocks" className="kc-pc-tab-content mx-auto max-w-4xl">
            <div className="mb-5">
              <h3 className="text-2xl font-semibold">临时会话屏蔽</h3>
              <p className="mt-1 text-sm [color:var(--kc-muted)]">管理被你屏蔽的临时会话发起人。解除后，对方可以再次从群聊向你发起临时会话。</p>
            </div>
            <section className="glass-panel overflow-hidden rounded-[28px]">
              <div className="flex items-center gap-2 border-b px-4 py-3 [border-color:var(--kc-border)] [background:var(--kc-panel-muted)]">
                <Icon name="shield" className="h-4 w-4 [color:var(--kc-muted)]" />
                <h4 className="text-sm font-semibold">已屏蔽 {temporaryBlocks.length}</h4>
              </div>
              {temporaryBlocksQuery.isLoading ? <p className="p-4 text-sm [color:var(--kc-muted)]">正在加载屏蔽列表...</p> : null}
              {!temporaryBlocksQuery.isLoading && temporaryBlocks.length === 0 ? <p className="p-4 text-sm [color:var(--kc-muted)]">还没有屏蔽任何临时会话。</p> : null}
              <div className="kc-pc-stagger divide-y [divide-color:var(--kc-border)]">
                {temporaryBlocks.map((block) => (
                  <TemporaryBlockRow key={block.id} block={block}>
                    <button type="button" onClick={() => unblockMutation.mutate(block.id)} className="rounded-xl border px-3 py-2 text-xs font-bold transition [border-color:var(--kc-border)] hover:[background:var(--kc-hover)] disabled:opacity-50" disabled={unblockMutation.isPending}>解除屏蔽</button>
                  </TemporaryBlockRow>
                ))}
              </div>
            </section>
          </div>
        ) : null}

        {activeTab === 'search' ? (
          <div key="contacts-search" className="kc-pc-tab-content mx-auto max-w-4xl">
            <div className="mb-5">
              <h3 className="text-2xl font-semibold">找人</h3>
              <p className="mt-1 text-sm [color:var(--kc-muted)]">输入至少 2 个字符，搜索用户并发送好友申请。</p>
            </div>
            <section className="glass-panel rounded-[28px] p-3">
              {cleanQuery.length > 0 && cleanQuery.length < 2 ? <p className="glass-card-quiet rounded-2xl p-4 text-sm [color:var(--kc-muted)]">至少输入 2 个字符。</p> : null}
              {usersQuery.isLoading ? <p className="glass-card-quiet rounded-2xl p-4 text-sm [color:var(--kc-muted)]">正在搜索...</p> : null}
              {usersQuery.error ? <p className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-500">搜索失败，请稍后重试。</p> : null}
              {cleanQuery.length >= 2 && !usersQuery.isLoading && searchResults.length === 0 ? <p className="glass-card-quiet rounded-2xl p-4 text-sm [color:var(--kc-muted)]">没有找到匹配用户。</p> : null}
              <div className="kc-pc-stagger grid gap-1">
                {searchResults.map((user) => {
                  const isSelf = user.id === currentUser.id;
                  const isFriend = friendIds.has(user.id);
                  const isPending = pendingOutgoingIds.has(user.id);
                  const disabled = isSelf || isFriend || isPending || sendRequestMutation.isPending;
                  return (
                    <div key={user.id} className="flex items-center gap-3 rounded-2xl px-3 py-3 transition hover:[background:var(--kc-hover)]">
                      <Avatar user={user} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{getDisplayName(user)}{isSelf ? '（我）' : ''}</p>
                        <p className="truncate text-xs [color:var(--kc-muted)]">{user.bio || user.email || `@${user.username}`}</p>
                      </div>
                      <button type="button" onClick={() => sendRequestMutation.mutate(user.id)} disabled={disabled} className="liquid-button rounded-xl px-3 py-2 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-45">
                        {isSelf ? '我' : isFriend ? '已是好友' : isPending ? '已申请' : '申请'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        ) : null}
      </main>
    </section>
  );
}
