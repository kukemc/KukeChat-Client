import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getGameModeSettings, updateGameModeSettings } from '@/api/game';
import { getConversationBots, removeBotInstallation, updateBotInstallation } from '@/api/bots';
import { acceptGroupJoinRequest, addConversationMembers, checkinGroup, clearConversationHistory, createDirectConversation, dissolveConversation, getGroupCheckinStatus, getGroupLeaderboard, getIncomingGroupJoinRequests, leaveConversation, rejectGroupJoinRequest, removeConversationMember, updateConversationMemberMute, updateConversationMemberRole, updateConversationMemberTitle, updateConversationProfile, updateGroupSettings, updateMyConversationSettings, uploadConversationAvatar } from '@/api/conversations';
import { deleteFriend, getOutgoingFriendRequests, sendFriendRequest } from '@/api/friends';
import { createGroupInvite } from '@/api/invites';
import { sendMessage, shareUserToConversation } from '@/api/messages';
import { createReport } from '@/api/reports';
import { useKukeStore } from '@/store/kukeStore';
import type { Conversation, ConversationMember, Friendship, GroupJoinRequest, GroupLeaderboardPeriod, GroupLeaderboardType, JoinMode, MemberRole, Message, MessageMetadata, UpdateConversationProfilePayload, UpdateGroupSettingsPayload, UpdateMyConversationSettingsPayload, User } from '@/types/api';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { UserCard } from '@/components/ui/UserCard';
import { MobileUserProfilePage, type ProfileAction } from '@/components/ui/MobileUserProfilePage';
import { MobileStatusBar } from '@/components/mobile/MobileChrome';
import { registerNativeBackHandler } from '@/native/back';
import { updateNativeBackgroundRealtimeConversations } from '@/native/backgroundRealtime';
import { runNativeRouteTransition } from '@/native/transition';
import { resolveAssetUrl, resolveThumbnailUrl } from '@/utils/assetUrl';
import { parseApiDate } from '@/utils/dateTime';
import { hasPendingOutgoingFriendRequest, isFriendUserId } from '@/utils/friendship';
import { AnnouncementModal } from './AnnouncementModal';

interface ChatInfoDrawerProps {
  conversation: Conversation;
  currentUser: User;
  members: ConversationMember[];
  friends?: Friendship[];
  membersLoading?: boolean;
  currentRole?: MemberRole;
  conversations?: Conversation[];
  isMobile?: boolean;
  onReportConversation?: (conversation: Conversation) => void;
  onClose: () => void;
}

interface CardState {
  user?: User | null;
  label?: string;
  anchor: OverlayPosition;
}

interface UserProfilePageState {
  user?: User | null;
  label?: string;
  fallbackUserId?: number;
  member?: ConversationMember | null;
}

interface MemberMenuState {
  member: ConversationMember;
  left: number;
  top: number;
}

interface OverlayPosition {
  left: number;
  top: number;
}

interface MessagesInfiniteData {
  pages: Message[][];
  pageParams: unknown[];
}

interface ConversationMembersPageData {
  pages: Array<{ items: ConversationMember[] }>;
  pageParams: unknown[];
}

type DrawerModal = 'profile' | 'invite' | 'remove' | 'joinRequests' | 'shareActions' | 'shareForward' | 'leaderboard' | null;
type ShareForwardKind = 'group' | 'user';

interface SelectOption<T extends string = string> {
  value: T;
  label: string;
}

const slowModeOptions: SelectOption[] = [
  { value: '0', label: '未开启' },
  { value: '10', label: '每分钟10条' },
  { value: '5', label: '每分钟5条' }
];

const joinModeOptions: Array<SelectOption<JoinMode>> = [
  { value: 'approval', label: '需要审核' },
  { value: 'question', label: '回答问题' },
  { value: 'invite_only', label: '仅邀请' },
  { value: 'open', label: '自由加入' }
];

const groupCategoryOptions: SelectOption[] = [
  { value: '', label: '未设置' },
  { value: '同学', label: '同学' },
  { value: '同事', label: '同事' },
  { value: '亲友', label: '亲友' },
  { value: '家校', label: '家校' },
  { value: '游戏', label: '游戏' },
  { value: '二次元', label: '二次元' },
  { value: '更多兴趣', label: '更多兴趣' }
];

const leaderboardTypeOptions: Array<SelectOption<GroupLeaderboardType>> = [
  { value: 'activity', label: '活跃榜' },
  { value: 'level', label: '等级榜' },
  { value: 'checkin_streak', label: '连签榜' },
  { value: 'checkin_total', label: '累签榜' },
  { value: 'message', label: '发言榜' }
];

const leaderboardPeriodOptions: Array<SelectOption<GroupLeaderboardPeriod>> = [
  { value: 'today', label: '今日' },
  { value: 'week', label: '近7天' },
  { value: 'month', label: '近30天' },
  { value: 'all', label: '全部' }
];

const MEMBER_MENU_WIDTH = 160;
const MEMBER_MENU_HEIGHT = 132;

function pointInContainer(x: number, y: number, container: HTMLElement | null): OverlayPosition {
  const rect = container?.getBoundingClientRect();
  return rect ? { left: x - rect.left, top: y - rect.top } : { left: x, top: y };
}

function elementAnchorInContainer(element: HTMLElement, container: HTMLElement | null): OverlayPosition {
  const rect = element.getBoundingClientRect();
  return pointInContainer(rect.left + rect.width / 2, rect.bottom + 8, container);
}

function clampOverlayPosition(position: OverlayPosition, width: number, height: number, container: HTMLElement | null): OverlayPosition {
  const margin = 8;
  const rect = container?.getBoundingClientRect();
  const boundsWidth = rect?.width ?? window.innerWidth;
  const boundsHeight = rect?.height ?? window.innerHeight;
  const maxLeft = Math.max(margin, boundsWidth - width - margin);
  const maxTop = Math.max(margin, boundsHeight - height - margin);
  return {
    left: Math.min(Math.max(position.left, margin), maxLeft),
    top: Math.min(Math.max(position.top, margin), maxTop)
  };
}

function memberUserId(member: ConversationMember): number | null {
  return member.user_id ?? member.user?.id ?? null;
}

function roleLabel(role: MemberRole): string {
  if (role === 'owner') {
    return '群主';
  }
  if (role === 'admin') {
    return '管理员';
  }
  return '成员';
}

function fieldText(value?: string | null): string {
  return value?.trim().toLowerCase() ?? '';
}

function matchesMember(member: ConversationMember, keyword: string): boolean {
  const user = member.user;
  const label = memberUserId(member) ? `用户 ${memberUserId(member)}` : '成员';
  const text = [
    member.nickname,
    member.remark,
    getDisplayName(user, label),
    user?.username,
    user?.nickname,
    user?.bio,
    user?.email
  ].map(fieldText).join(' ');
  return text.includes(keyword);
}

function friendUser(friendship: Friendship): User | null | undefined {
  return friendship.friend ?? friendship.user;
}

function fallbackCopyText(value: string): boolean {
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.append(textarea);
  textarea.select();
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } finally {
    textarea.remove();
  }
  return copied;
}

async function copyText(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    return fallbackCopyText(value);
  }

  return fallbackCopyText(value);
}

function ToggleRow({ label, checked, disabled = false, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange: (value: boolean) => void }): JSX.Element {
  return (
    <button type="button" disabled={disabled} onClick={() => onChange(!checked)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm transition hover:[background:var(--kc-hover)] disabled:cursor-not-allowed disabled:opacity-45">
      <span>{label}</span>
      <span className={`relative h-6 w-11 rounded-full transition ${checked ? '[background:var(--kc-accent)]' : '[background:var(--kc-panel-muted)]'}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${checked ? 'left-[22px]' : 'left-0.5'}`} />
      </span>
    </button>
  );
}

function DrawerRow({ label, value, icon, danger, disabled = false, onClick }: { label: string; value?: string; icon?: React.ReactNode; danger?: boolean; disabled?: boolean; onClick?: () => void }): JSX.Element {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className={`flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition hover:[background:var(--kc-hover)] disabled:cursor-not-allowed disabled:opacity-45 ${danger ? 'text-red-500' : ''}`}>
      {icon ? <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl [background:var(--kc-panel-muted)] [color:var(--kc-muted)]">{icon}</span> : null}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {value ? <span className="max-w-[140px] truncate text-xs [color:var(--kc-muted)]">{value}</span> : null}
      <Icon name="chevron" className="h-4 w-4 shrink-0 [color:var(--kc-muted)]" />
    </button>
  );
}

function DrawerSelectRow<T extends string>({ label, value, options, icon, disabled = false, onChange }: { label: string; value: T; options: Array<SelectOption<T>>; icon?: React.ReactNode; disabled?: boolean; onChange: (value: T) => void }): JSX.Element {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const selected = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    function handlePointerDown(event: MouseEvent): void {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open]);

  return (
    <div ref={containerRef} className={`kc-drawer-select-row relative flex w-full items-center gap-3 px-4 py-3 text-sm transition hover:[background:var(--kc-hover)] ${open ? 'z-40' : ''}`}>
      {icon ? <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl [background:var(--kc-panel-muted)] [color:var(--kc-muted)]">{icon}</span> : null}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <button type="button" disabled={disabled} onClick={() => setOpen((current) => !current)} className="kc-drawer-select-control flex min-w-[124px] items-center justify-end gap-2 rounded-2xl border px-3 py-2 text-xs transition [background:var(--kc-panel-muted)] [border-color:var(--kc-border)] [color:var(--kc-text)] hover:[border-color:var(--kc-accent)] disabled:cursor-not-allowed disabled:opacity-45">
        <span className="truncate">{selected?.label ?? value}</span>
        <Icon name="chevron" className={`h-3.5 w-3.5 shrink-0 transition [color:var(--kc-muted)] ${open ? 'rotate-90' : ''}`} />
      </button>
      {open ? (
        <div className="absolute bottom-[calc(100%-1px)] right-4 z-30 max-h-56 min-w-[124px] overflow-y-auto rounded-[18px] border py-1 shadow-float [background:var(--kc-panel)] [border-color:var(--kc-border)]">
          {options.map((option) => {
            const active = option.value === value;
            return (
              <button key={option.value} type="button" onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onChange(option.value);
                setOpen(false);
              }} className={`grid w-full grid-cols-[14px_minmax(0,1fr)] items-center gap-2 px-3 py-2.5 text-left text-xs transition ${active ? '[background:var(--kc-accent-soft)] [color:var(--kc-accent)]' : 'hover:[background:var(--kc-hover)] [color:var(--kc-text)]'}`}>
                {active ? <Icon name="check" className="h-3.5 w-3.5 shrink-0" /> : <span />}
                <span className="truncate">{option.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function DrawerCard({ children, className = '', allowOverflow = false }: { children: React.ReactNode; className?: string; allowOverflow?: boolean }): JSX.Element {
  return <section className={`${allowOverflow ? '' : 'overflow-hidden'} rounded-[22px] border [background:var(--kc-panel)] [border-color:var(--kc-border)] ${className}`}>{children}</section>;
}

function conversationDisplayTitle(conversation: Conversation, currentUser: User): string {
  const displayTitle = conversation.display_title?.trim();
  if (conversation.type === 'group') {
    return displayTitle || conversation.title || '未命名群聊';
  }
  if (displayTitle) {
    return displayTitle;
  }
  const directMember = conversation.members?.find((member) => member.user_id !== currentUser.id)?.user;
  return getDisplayName(conversation.direct_user ?? directMember, conversation.title || '私聊');
}

function ConversationTargetAvatar({ conversation, currentUser }: { conversation: Conversation; currentUser: User }): JSX.Element {
  const title = conversationDisplayTitle(conversation, currentUser);
  if (conversation.type === 'group') {
    const avatarUrl = resolveThumbnailUrl(conversation.avatar_url);
    if (avatarUrl) {
      return <img src={avatarUrl} alt={title} className="h-10 w-10 shrink-0 rounded-full border object-cover [border-color:var(--kc-border)]" />;
    }
    return <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border text-sm font-semibold [background:var(--kc-panel-muted)] [border-color:var(--kc-border)] [color:var(--kc-text)]">{title.trim().slice(0, 1) || '群'}</span>;
  }
  return <Avatar user={conversation.direct_user} label={title} />;
}

function userShareMetadata(user: User): MessageMetadata {
  const name = getDisplayName(user, `用户 ${user.id}`);
  return {
    share_card: {
      type: 'user',
      user_id: user.id,
      name,
      username: user.username,
      avatar_url: user.avatar_url,
      bio: user.bio,
      profile_title: user.profile_title,
      profile_tagline: user.profile_tagline,
      profile_status: user.profile_status,
      ccw_name: user.ccw_name,
      ccw_avatar_url: user.ccw_avatar_url,
      ccw_student_oid: user.ccw_student_oid
    }
  };
}

function roleBadgeClass(role: MemberRole): string {
  return role === 'owner' || role === 'admin'
    ? '[background:var(--kc-accent-soft)] [color:var(--kc-accent)]'
    : '[background:var(--kc-panel-muted)] [color:var(--kc-muted)]';
}

function memberRoleRank(role: MemberRole): number {
  if (role === 'owner') return 0;
  if (role === 'admin') return 1;
  return 2;
}

export function ChatInfoDrawer({ conversation, currentUser, members, friends = [], membersLoading = false, currentRole = 'member', conversations = [], isMobile = false, onReportConversation, onClose }: ChatInfoDrawerProps): JSX.Element {
  const [view, setView] = useState<'main' | 'members'>('main');
  const [modal, setModal] = useState<DrawerModal>(null);
  const [search, setSearch] = useState('');
  const [groupNickname, setGroupNickname] = useState('');
  const [groupRemark, setGroupRemark] = useState('');
  const [profileTitle, setProfileTitle] = useState('');
  const [profileAvatarUrl, setProfileAvatarUrl] = useState('');
  const [profileDescription, setProfileDescription] = useState('');
  const [profileCategory, setProfileCategory] = useState('');
  const [allMuted, setAllMuted] = useState(false);
  const [messageRateLimitPerMinute, setMessageRateLimitPerMinute] = useState(0);
  const [joinMode, setJoinMode] = useState<JoinMode>('approval');
  const [autoApprove, setAutoApprove] = useState(false);
  const [joinQuestion, setJoinQuestion] = useState('');
  const [tasksEnabled, setTasksEnabled] = useState(false);
  const [taskCreationPermission, setTaskCreationPermission] = useState<'members' | 'admins'>('members');
  const [pinned, setPinned] = useState(false);
  const [doNotDisturb, setDoNotDisturb] = useState(false);
  const [selectedInviteIds, setSelectedInviteIds] = useState<number[]>([]);
  const [shareTargetQuery, setShareTargetQuery] = useState('');
  const [selectedShareTargetId, setSelectedShareTargetId] = useState<number | null>(null);
  const [shareNote, setShareNote] = useState('');
  const [shareForwardKind, setShareForwardKind] = useState<ShareForwardKind>('group');
  const [copied, setCopied] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [locallyPendingFriendIds, setLocallyPendingFriendIds] = useState<Set<number>>(() => new Set());
  const [showAnnouncements, setShowAnnouncements] = useState(false);
  const [leaderboardType, setLeaderboardType] = useState<GroupLeaderboardType>('activity');
  const [leaderboardPeriod, setLeaderboardPeriod] = useState<GroupLeaderboardPeriod>('all');
  const [userCard, setUserCard] = useState<CardState | null>(null);
  const [mobileUserProfile, setMobileUserProfile] = useState<UserProfilePageState | null>(null);
  const [mobileProfileMenuOpen, setMobileProfileMenuOpen] = useState(false);
  const [memberMenu, setMemberMenu] = useState<MemberMenuState | null>(null);
  const overlayRootRef = useRef<HTMLDivElement | null>(null);
  const groupAvatarInputRef = useRef<HTMLInputElement | null>(null);
  const queryClient = useQueryClient();
  const setActiveConversationId = useKukeStore((state) => state.setActiveConversationId);
  const openPost = useKukeStore((state) => state.openPost);
  const isGroup = conversation.type === 'group';
  const canManageGroup = isGroup && (currentRole === 'owner' || currentRole === 'admin');
  const memberCount = conversation.member_count ?? members.length;
  const sortedMembers = useMemo(() => [...members].sort((left, right) => {
    const roleDelta = memberRoleRank(left.role) - memberRoleRank(right.role);
    if (roleDelta !== 0) return roleDelta;
    return (left.joined_at ?? '').localeCompare(right.joined_at ?? '');
  }), [members]);
  const directUser = conversation.direct_user ?? members.find((member) => memberUserId(member) !== currentUser.id)?.user ?? null;
  const isDirectFriend = conversation.type === 'direct' && Boolean(conversation.is_friend);
  const isTemporaryDirect = conversation.type === 'direct' && Boolean(conversation.is_temporary);
  const currentMember = members.find((member) => memberUserId(member) === currentUser.id) ?? null;
  const incomingJoinRequestsQuery = useQuery({
    queryKey: ['group-join-requests', 'incoming'],
    queryFn: getIncomingGroupJoinRequests,
    enabled: canManageGroup
  });
  const outgoingFriendRequestsQuery = useQuery({
    queryKey: ['friend-requests', 'outgoing'],
    queryFn: getOutgoingFriendRequests,
    staleTime: 15_000
  });
  const directMutation = useMutation({
    mutationFn: createDirectConversation,
    onSuccess: (nextConversation) => {
      setErrorText('');
      setUserCard(null);
      setMobileUserProfile(null);
      setActiveConversationId(nextConversation.id);
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: () => setErrorText('发起私聊失败，请稍后重试。')
  });
  const checkinStatusQuery = useQuery({
    queryKey: ['group-checkin-status', conversation.id],
    queryFn: () => getGroupCheckinStatus(conversation.id),
    enabled: isGroup,
    staleTime: 15_000
  });
  const leaderboardQuery = useQuery({
    queryKey: ['group-leaderboard', conversation.id, leaderboardType, leaderboardPeriod],
    queryFn: () => getGroupLeaderboard(conversation.id, leaderboardType, leaderboardPeriod),
    enabled: isGroup && modal === 'leaderboard',
    staleTime: 15_000
  });
  const botsQuery = useQuery({
    queryKey: ['conversation-bots', conversation.id],
    queryFn: () => getConversationBots(conversation.id),
    enabled: isGroup,
    staleTime: 10_000
  });
  const removeBotMutation = useMutation({
    mutationFn: (botId: number) => removeBotInstallation(botId, conversation.id),
    onSuccess: (_data, botId) => {
      queryClient.setQueryData<typeof botsQuery.data>(['conversation-bots', conversation.id], (current) => current?.filter((installation) => installation.bot_id !== botId));
      void queryClient.invalidateQueries({ queryKey: ['conversation-bots', conversation.id] });
      void queryClient.invalidateQueries({ queryKey: ['conversation-members'] });
      void queryClient.invalidateQueries({ queryKey: ['conversation-members-page'] });
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    }
  });
  const updateBotMutation = useMutation({
    mutationFn: ({ botId, enabled }: { botId: number; enabled: boolean }) => updateBotInstallation(botId, conversation.id, { enabled }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['conversation-bots', conversation.id] })
  });
  const outgoingFriendRequests = outgoingFriendRequestsQuery.data ?? [];
  const conversationJoinRequests = (incomingJoinRequestsQuery.data ?? []).filter((request) => request.conversation_id === conversation.id);
  const pendingConversationJoinRequests = conversationJoinRequests.filter((request) => request.status === 'pending');
  const searchKeyword = search.trim().toLowerCase();
  const filteredMembers = searchKeyword ? sortedMembers.filter((member) => matchesMember(member, searchKeyword)) : sortedMembers;
  const memberIds = new Set(sortedMembers.map(memberUserId).filter((id): id is number => typeof id === 'number'));
  const availableInviteFriends: User[] = [];
  const seenInviteFriendIds = new Set<number>();
  for (const friendship of friends) {
    const user = friendUser(friendship);
    const friendId = user?.id;
    if (!friendId || friendId === currentUser.id || memberIds.has(friendId) || seenInviteFriendIds.has(friendId)) {
      continue;
    }
    seenInviteFriendIds.add(friendId);
    availableInviteFriends.push(user);
  }
  const cleanShareTargetQuery = shareTargetQuery.trim().toLowerCase();
  const shareTargetConversations = conversations.filter((item) => {
    if (item.id === conversation.id) {
      return false;
    }
    const title = conversationDisplayTitle(item, currentUser);
    return !cleanShareTargetQuery || title.toLowerCase().includes(cleanShareTargetQuery) || String(item.id).includes(cleanShareTargetQuery);
  });
  const selectedShareTarget = conversations.find((item) => item.id === selectedShareTargetId) ?? null;

  useEffect(() => {
    setView('main');
    setModal(null);
    setSearch('');
    setSelectedInviteIds([]);
    setShareTargetQuery('');
    setSelectedShareTargetId(null);
    setShareNote('');
    setCopied(false);
    setErrorText('');
    setMemberMenu(null);
    setUserCard(null);
    setMobileUserProfile(null);
    setShowAnnouncements(false);
  }, [conversation.id]);

  useEffect(() => {
    setGroupNickname(currentMember?.nickname ?? '');
    setGroupRemark(currentMember?.remark ?? '');
    setPinned(Boolean(currentMember?.pinned));
    setDoNotDisturb(Boolean(currentMember?.do_not_disturb));
    setProfileTitle(conversation.title ?? '');
    setProfileAvatarUrl(conversation.avatar_url ?? '');
    setProfileDescription(conversation.description ?? '');
    setProfileCategory(conversation.category ?? '');
    setAllMuted(Boolean(conversation.all_muted));
    setMessageRateLimitPerMinute(conversation.message_rate_limit_per_minute ?? 0);
    setJoinMode(conversation.join_mode ?? 'approval');
    setAutoApprove(Boolean(conversation.auto_approve));
    setJoinQuestion(conversation.join_question ?? '');
    setTasksEnabled(Boolean(conversation.tasks_enabled));
    setTaskCreationPermission(conversation.task_creation_permission ?? 'members');
  }, [
    conversation.id,
    conversation.title,
    conversation.avatar_url,
    conversation.description,
    conversation.category,
    conversation.all_muted,
    conversation.message_rate_limit_per_minute,
    conversation.join_mode,
    conversation.auto_approve,
    conversation.join_question,
    conversation.tasks_enabled,
    conversation.task_creation_permission,
    currentMember?.id,
    currentMember?.nickname,
    currentMember?.remark,
    currentMember?.pinned,
    currentMember?.do_not_disturb,
    currentMember?.message_setting
  ]);

  useEffect(() => {
    if (!isMobile) {
      return;
    }

    return registerNativeBackHandler(() => {
      if (modal) {
        setModal(null);
        return true;
      }
      if (mobileUserProfile) {
        runNativeRouteTransition('back', () => {
          setMobileProfileMenuOpen(false);
          setMobileUserProfile(null);
        }, isMobile);
        return true;
      }
      if (userCard) {
        runNativeRouteTransition('back', () => setUserCard(null), isMobile);
        return true;
      }
      if (showAnnouncements) {
        runNativeRouteTransition('back', () => setShowAnnouncements(false), isMobile);
        return true;
      }
      if (view === 'members') {
        runNativeRouteTransition('back', () => setView('main'), isMobile);
        return true;
      }
      onClose();
      return true;
    }, 80);
  }, [isMobile, mobileUserProfile, modal, onClose, showAnnouncements, userCard, view]);

  function invalidateConversationData(conversationId: number): void {
    void queryClient.invalidateQueries({ queryKey: ['conversation-members', conversationId] });
    void queryClient.invalidateQueries({ queryKey: ['conversation-members-page', conversationId] });
    void queryClient.invalidateQueries({ queryKey: ['conversations'] });
  }

  function patchMemberTitleCache(conversationId: number, userId: number, title: string | null): void {
    queryClient.setQueryData<ConversationMember[] | undefined>(['conversation-members', conversationId], (current) => current?.map((member) => (
      memberUserId(member) === userId ? { ...member, title } : member
    )));
    queryClient.setQueriesData<ConversationMembersPageData | undefined>({ queryKey: ['conversation-members-page', conversationId] }, (current) => current ? {
      ...current,
      pages: current.pages.map((page) => ({
        ...page,
        items: page.items.map((member) => (memberUserId(member) === userId ? { ...member, title } : member))
      }))
    } : current);
  }

  function patchMemberNicknameCache(conversationId: number, userId: number, nickname: string | null): void {
    queryClient.setQueryData<ConversationMember[] | undefined>(['conversation-members', conversationId], (current) => current?.map((member) => (
      memberUserId(member) === userId ? { ...member, nickname } : member
    )));
    queryClient.setQueriesData<ConversationMembersPageData | undefined>({ queryKey: ['conversation-members-page', conversationId] }, (current) => current ? {
      ...current,
      pages: current.pages.map((page) => ({
        ...page,
        items: page.items.map((member) => (memberUserId(member) === userId ? { ...member, nickname } : member))
      }))
    } : current);
    queryClient.setQueryData<MessagesInfiniteData | undefined>(['messages', conversationId], (current) => current ? {
      ...current,
      pages: current.pages.map((page) => page.map((message) => (
        message.sender_id === userId ? { ...message, sender_display_name: nickname } : message
      )))
    } : current);
  }

  function patchMemberMuteCache(conversationId: number, userId: number, muted: boolean, mutedUntil: string | null = null): void {
    queryClient.setQueryData<ConversationMember[] | undefined>(['conversation-members', conversationId], (current) => current?.map((member) => (
      memberUserId(member) === userId ? { ...member, muted, muted_until: mutedUntil } : member
    )));
    queryClient.setQueriesData<ConversationMembersPageData | undefined>({ queryKey: ['conversation-members-page', conversationId] }, (current) => current ? {
      ...current,
      pages: current.pages.map((page) => ({
        ...page,
        items: page.items.map((member) => (memberUserId(member) === userId ? { ...member, muted, muted_until: mutedUntil } : member))
      }))
    } : current);
  }

  const profileMutation = useMutation({
    mutationFn: ({ conversationId, payload }: { conversationId: number; payload: UpdateConversationProfilePayload }) => updateConversationProfile(conversationId, payload),
    onSuccess: (updatedConversation, variables) => {
      queryClient.setQueryData<Conversation[]>(['conversations'], (current) => current?.map((item) => (item.id === updatedConversation.id ? { ...item, ...updatedConversation } : item)) ?? current);
      setModal(null);
      setErrorText('');
      invalidateConversationData(variables.conversationId);
    },
    onError: () => setErrorText('群资料保存失败，请稍后重试。')
  });

  const groupAvatarMutation = useMutation({
    mutationFn: uploadConversationAvatar,
    onSuccess: (response) => setProfileAvatarUrl(response.url)
  });

  // 游戏模式仅群主可配置，后端也只放行群主，这里的判断只是别让别人白点
  const isGroupOwner = isGroup && currentRole === 'owner';
  const [gameCreationOid, setGameCreationOid] = useState('');
  const [gameModeError, setGameModeError] = useState('');

  const gameModeQuery = useQuery({
    queryKey: ['game-mode', conversation.id],
    queryFn: () => getGameModeSettings(conversation.id),
    enabled: isGroupOwner
  });

  useEffect(() => {
    setGameCreationOid(gameModeQuery.data?.creation_oid ?? '');
    setGameModeError('');
  }, [gameModeQuery.data?.creation_oid, conversation.id]);

  const gameModeMutation = useMutation({
    mutationFn: ({ enabled, creationOid }: { enabled: boolean; creationOid: string | null }) =>
      updateGameModeSettings(conversation.id, enabled, creationOid),
    onSuccess: (result) => {
      setGameModeError('');
      setGameCreationOid(result.creation_oid ?? '');
      void queryClient.invalidateQueries({ queryKey: ['game-mode', conversation.id] });
    },
    // 后端会明确说明拒绝原因（非公开群、缺作品 ID 等），直接透传给群主
    onError: (error: unknown) => {
      setGameModeError(error instanceof Error ? error.message : '保存失败，请稍后重试。');
    }
  });

  const gameModeEnabled = Boolean(gameModeQuery.data?.enabled);

  function normalizeCreationOid(value: string): string {
    const trimmed = value.trim();
    // 支持直接粘贴作品链接，自动抽出其中的 24 位十六进制 ID
    const fromUrl = trimmed.match(/[0-9a-fA-F]{24}/);
    return (fromUrl ? fromUrl[0] : trimmed).toLowerCase();
  }

  function toggleGameMode(next: boolean): void {
    if (!next) {
      gameModeMutation.mutate({ enabled: false, creationOid: null });
      return;
    }
    const oid = normalizeCreationOid(gameCreationOid);
    if (!/^[0-9a-f]{24}$/.test(oid)) {
      setGameModeError('请先填写要绑定的作品 ID（24 位，可直接粘贴作品链接）。');
      return;
    }
    gameModeMutation.mutate({ enabled: true, creationOid: oid });
  }

  function saveGameCreationOid(): void {
    if (!gameModeEnabled) {
      return;
    }
    const oid = normalizeCreationOid(gameCreationOid);
    if (!/^[0-9a-f]{24}$/.test(oid)) {
      setGameModeError('作品 ID 应为 24 位十六进制，可直接粘贴作品链接。');
      return;
    }
    if (oid === (gameModeQuery.data?.creation_oid ?? '')) {
      return;
    }
    gameModeMutation.mutate({ enabled: true, creationOid: oid });
  }

  const groupSettingsMutation = useMutation({
    mutationFn: ({ conversationId, payload }: { conversationId: number; payload: UpdateGroupSettingsPayload }) => updateGroupSettings(conversationId, payload),
    onSuccess: (_conversation, variables) => {
      setErrorText('');
      invalidateConversationData(variables.conversationId);
    },
    onError: () => setErrorText('群设置保存失败，请稍后重试。')
  });

  const mySettingsMutation = useMutation({
    mutationFn: ({ conversationId, payload }: { conversationId: number; payload: UpdateMyConversationSettingsPayload }) => updateMyConversationSettings(conversationId, payload),
    onMutate: async (variables) => {
      if (Object.prototype.hasOwnProperty.call(variables.payload, 'nickname')) {
        await queryClient.cancelQueries({ queryKey: ['conversation-members', variables.conversationId] });
        await queryClient.cancelQueries({ queryKey: ['conversation-members-page', variables.conversationId] });
        await queryClient.cancelQueries({ queryKey: ['messages', variables.conversationId] });
        patchMemberNicknameCache(variables.conversationId, currentUser.id, variables.payload.nickname?.trim() || null);
      }
    },
    onSuccess: (member, variables) => {
      setErrorText('');
      if (Object.prototype.hasOwnProperty.call(variables.payload, 'nickname')) {
        patchMemberNicknameCache(variables.conversationId, currentUser.id, member.nickname ?? null);
      }
      queryClient.setQueryData<Conversation[]>(['conversations'], (current) => current?.map((item) => (item.id === variables.conversationId ? {
        ...item,
        my_nickname: member.nickname,
        my_do_not_disturb: member.do_not_disturb,
        my_message_setting: member.message_setting
      } : item)) ?? current);
      const conversations = queryClient.getQueryData<Conversation[]>(['conversations']);
      if (conversations) {
        void updateNativeBackgroundRealtimeConversations(conversations);
      }
      invalidateConversationData(variables.conversationId);
    },
    onError: (_error, variables) => {
      invalidateConversationData(variables.conversationId);
      void queryClient.invalidateQueries({ queryKey: ['messages', variables.conversationId] });
      setErrorText('个人设置保存失败，请稍后重试。');
    }
  });

  const roleMutation = useMutation({
    mutationFn: ({ conversationId, userId, role }: { conversationId: number; userId: number; role: MemberRole }) => updateConversationMemberRole(conversationId, userId, role),
    onSuccess: (_member, variables) => {
      setErrorText(variables.role === 'admin' ? '已设为管理员。' : '已取消管理员。');
      invalidateConversationData(variables.conversationId);
    },
    onError: () => setErrorText('成员角色更新失败，请稍后重试。')
  });

  const muteMutation = useMutation({
    mutationFn: ({ conversationId, userId, muted }: { conversationId: number; userId: number; muted: boolean }) => updateConversationMemberMute(conversationId, userId, muted),
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: ['conversation-members', variables.conversationId] });
      await queryClient.cancelQueries({ queryKey: ['conversation-members-page', variables.conversationId] });
      patchMemberMuteCache(variables.conversationId, variables.userId, variables.muted);
      setMemberMenu(null);
    },
    onSuccess: (member, variables) => {
      setErrorText(Boolean(member.muted) ? '已设置群禁言。' : '已解除群禁言。');
      patchMemberMuteCache(variables.conversationId, variables.userId, Boolean(member.muted), member.muted_until ?? null);
    },
    onError: (_error, variables) => {
      invalidateConversationData(variables.conversationId);
      setErrorText('成员禁言更新失败，请稍后重试。');
    },
    onSettled: (_data, _error, variables) => {
      if (variables) {
        void queryClient.invalidateQueries({ queryKey: ['conversation-members', variables.conversationId] });
        void queryClient.invalidateQueries({ queryKey: ['conversation-members-page', variables.conversationId] });
      }
    }
  });

  const titleMutation = useMutation({
    mutationFn: ({ conversationId, userId, title }: { conversationId: number; userId: number; title: string | null }) => updateConversationMemberTitle(conversationId, userId, title),
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: ['conversation-members', variables.conversationId] });
      await queryClient.cancelQueries({ queryKey: ['conversation-members-page', variables.conversationId] });
      patchMemberTitleCache(variables.conversationId, variables.userId, variables.title);
      setMemberMenu(null);
    },
    onSuccess: () => setErrorText(''),
    onError: (_error, variables) => {
      invalidateConversationData(variables.conversationId);
      setErrorText('成员头衔保存失败，请稍后重试。');
    },
    onSettled: (_data, _error, variables) => {
      if (variables) {
        void queryClient.invalidateQueries({ queryKey: ['conversation-members', variables.conversationId] });
        void queryClient.invalidateQueries({ queryKey: ['conversation-members-page', variables.conversationId] });
      }
    }
  });

  const inviteMutation = useMutation({
    mutationFn: ({ conversationId, memberIds: invitedIds }: { conversationId: number; memberIds: number[] }) => addConversationMembers(conversationId, invitedIds),
    onSuccess: (_members, variables) => {
      setModal(null);
      setSelectedInviteIds([]);
      setErrorText('');
      invalidateConversationData(variables.conversationId);
    },
    onError: () => setErrorText('邀请失败，请稍后重试。')
  });

  const removeMutation = useMutation({
    mutationFn: ({ conversationId, userId }: { conversationId: number; userId: number }) => removeConversationMember(conversationId, userId),
    onSuccess: (_result, variables) => {
      setModal(null);
      setErrorText('');
      invalidateConversationData(variables.conversationId);
    },
    onError: () => setErrorText('移除成员失败，请稍后重试。')
  });

  const clearMutation = useMutation({
    mutationFn: (conversationId: number) => clearConversationHistory(conversationId),
    onSuccess: (_result, conversationId) => {
      setErrorText('');
      invalidateConversationData(conversationId);
      void queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
    },
    onError: () => setErrorText('删除聊天记录失败，请稍后重试。')
  });

  const conversationReportMutation = useMutation({
    mutationFn: (conversationId: number) => createReport({
      target_type: 'conversation',
      target_id: conversationId,
      conversation_id: conversationId,
      reason: '群聊违规',
      description: '从群聊资料页提交。'
    }),
    onSuccess: () => setErrorText('举报已提交，管理员会保留当前群聊证据进行审核。'),
    onError: () => setErrorText('举报提交失败，请稍后重试。')
  });

  const leaveMutation = useMutation({
    mutationFn: (conversationId: number) => leaveConversation(conversationId),
    onSuccess: (_result, conversationId) => {
      setErrorText('');
      setActiveConversationId(null);
      invalidateConversationData(conversationId);
      onClose();
    },
    onError: () => setErrorText('退出群聊失败，请稍后重试。')
  });

  const dissolveMutation = useMutation({
    mutationFn: (conversationId: number) => dissolveConversation(conversationId),
    onSuccess: (_result, conversationId) => {
      setErrorText('');
      setActiveConversationId(null);
      invalidateConversationData(conversationId);
      onClose();
    },
    onError: () => setErrorText('解散群聊失败，请稍后重试。')
  });

  const acceptJoinRequestMutation = useMutation({
    mutationFn: (requestId: number) => acceptGroupJoinRequest(requestId),
    onSuccess: () => {
      setErrorText('');
      void queryClient.invalidateQueries({ queryKey: ['group-join-requests'] });
      invalidateConversationData(conversation.id);
    },
    onError: () => setErrorText('通过入群申请失败，请稍后重试。')
  });

  const rejectJoinRequestMutation = useMutation({
    mutationFn: (requestId: number) => rejectGroupJoinRequest(requestId),
    onSuccess: () => {
      setErrorText('');
      void queryClient.invalidateQueries({ queryKey: ['group-join-requests'] });
      invalidateConversationData(conversation.id);
    },
    onError: () => setErrorText('拒绝入群申请失败，请稍后重试。')
  });

  const friendRequestMutation = useMutation({
    mutationFn: sendFriendRequest,
    onSuccess: (request, receiverId) => {
      setErrorText('好友申请已发送，等待对方通过。');
      setMemberMenu(null);
      setUserCard(null);
      setLocallyPendingFriendIds((current) => {
        const next = new Set(current);
        next.add(request.receiver_id ?? receiverId);
        return next;
      });
      void queryClient.invalidateQueries({ queryKey: ['friend-requests'] });
      void queryClient.invalidateQueries({ queryKey: ['friend-requests', 'outgoing'] });
    },
    onError: () => setErrorText('好友申请发送失败，可能已是好友或已有待处理申请。')
  });

  const deleteFriendMutation = useMutation({
    mutationFn: deleteFriend,
    onSuccess: () => {
      setErrorText('已删除好友。');
      void queryClient.invalidateQueries({ queryKey: ['friends'] });
      invalidateConversationData(conversation.id);
      onClose();
    },
    onError: () => setErrorText('删除好友失败，请稍后重试。')
  });

  const checkinMutation = useMutation({
    mutationFn: (conversationId: number) => checkinGroup(conversationId),
    onSuccess: (checkin) => {
      setErrorText(`签到成功，获得 ${checkin.exp_awarded} 群经验。`);
      void queryClient.invalidateQueries({ queryKey: ['group-checkin-status', conversation.id] });
      void queryClient.invalidateQueries({ queryKey: ['group-leaderboard', conversation.id] });
      void queryClient.invalidateQueries({ queryKey: ['conversation-members', conversation.id] });
    },
    onError: () => {
      setErrorText('签到失败，可能今天已经签过了。');
      void queryClient.invalidateQueries({ queryKey: ['group-checkin-status', conversation.id] });
    }
  });

  const shareForwardMutation = useMutation({
    mutationFn: async ({ targetConversationId, note }: { targetConversationId: number; note?: string }) => {
      if (shareForwardKind === 'user') {
        const user = directUser;
        if (!user?.id) {
          throw new Error('未找到要分享的用户');
        }
        const content = [note?.trim(), `[个人名片] ${getDisplayName(user, `用户 ${user.id}`)}`].filter(Boolean).join('\n');
        return shareUserToConversation(targetConversationId, content, userShareMetadata(user));
      }
      if (!isGroup) {
        throw new Error('只有群聊支持转发群名片');
      }
      const link = await createGroupInvite(conversation.id);
      const title = conversation.title?.trim() || '未命名群聊';
      const metadata: MessageMetadata = {
        share_card: {
          type: 'group',
          conversation_id: conversation.id,
          title,
          avatar_url: conversation.avatar_url,
          description: conversation.description,
          category: conversation.category,
          member_count: conversation.member_count ?? members.length,
          join_mode: conversation.join_mode,
          auto_approve: conversation.auto_approve,
          invite_token: link.token,
          invite_url: link.url
        }
      };
      const content = [note?.trim(), link.url].filter(Boolean).join('\n') || link.url;
      return sendMessage(targetConversationId, content, 'text', metadata);
    },
    onSuccess: (_message, variables) => {
      setModal(null);
      setErrorText(shareForwardKind === 'user' ? '个人名片已发送。' : '群聊名片已发送。');
      setSelectedShareTargetId(null);
      setShareTargetQuery('');
      setShareNote('');
      void queryClient.invalidateQueries({ queryKey: ['messages', variables.targetConversationId] });
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: (error) => setErrorText(error instanceof Error ? error.message : '发送名片失败，请稍后重试。')
  });

  function openUserCard(event: React.MouseEvent<HTMLElement>, user?: User | null, label?: string, member?: ConversationMember | null): void {
    setMemberMenu(null);
    setMobileProfileMenuOpen(false);
    if (isMobile) {
      setUserCard(null);
      runNativeRouteTransition('forward', () => setMobileUserProfile({ user, label, fallbackUserId: user?.id ?? member?.user_id ?? member?.user?.id, member: member ?? null }), true);
      return;
    }
    setUserCard({ user, label, anchor: elementAnchorInContainer(event.currentTarget, overlayRootRef.current) });
  }

  function isFriendUser(userId?: number | null): boolean {
    return isFriendUserId(friends, userId, currentUser.id);
  }

  function isPendingFriendRequest(userId?: number | null): boolean {
    return locallyPendingFriendIds.has(userId ?? -1) || hasPendingOutgoingFriendRequest(outgoingFriendRequests, userId);
  }

  function profileActionForUser(user?: User | null): ProfileAction | undefined {
    const userId = user?.id;
    if (!userId || userId === currentUser.id || user?.is_bot) {
      return undefined;
    }
    if (isFriendUser(userId)) {
      return { label: directMutation.isPending ? '打开中...' : '发消息', onClick: startDirectMessageForUser, disabled: directMutation.isPending };
    }
    if (isPendingFriendRequest(userId)) {
      return { label: '已申请', disabled: true, tone: 'muted', helperText: '好友申请已发送，等待对方通过' };
    }
    return { label: friendRequestMutation.isPending ? '发送中...' : '添加好友', onClick: requestFriend, disabled: friendRequestMutation.isPending };
  }

  function startDirectMessageForUser(user?: User | null): void {
    const userId = user?.id;
    if (!userId || userId === currentUser.id || directMutation.isPending) {
      return;
    }
    directMutation.mutate({ user_id: userId, temporary: false });
  }

  function canSendFriendRequest(userId?: number | null): boolean {
    return Boolean(userId && userId !== currentUser.id && !isFriendUser(userId) && !isPendingFriendRequest(userId) && !friendRequestMutation.isPending);
  }

  function requestFriend(user?: User | null): void {
    const userId = user?.id;
    if (!canSendFriendRequest(userId)) {
      return;
    }
    friendRequestMutation.mutate(userId as number);
  }

  function requestFriendFromMember(member: ConversationMember): void {
    const userId = memberUserId(member);
    const knownFriend = friends.map(friendUser).find((item) => item?.id === userId) ?? null;
    requestFriend(member.user ?? knownFriend ?? (userId ? { id: userId, username: `user-${userId}` } : null));
  }

  function toggleMemberAdmin(member: ConversationMember): void {
    const userId = memberUserId(member);
    if (!userId || !canChangeMemberRole(member) || roleMutation.isPending) {
      return;
    }
    const nextRole: MemberRole = member.role === 'admin' ? 'member' : 'admin';
    roleMutation.mutate({ conversationId: conversation.id, userId, role: nextRole });
    setMobileUserProfile((current) => current?.member && memberUserId(current.member) === userId ? { ...current, member: { ...current.member, role: nextRole } } : current);
    setMobileProfileMenuOpen(false);
    setMemberMenu(null);
  }

  function toggleMemberMute(member: ConversationMember): void {
    const userId = memberUserId(member);
    if (!userId || !canToggleMute(member) || muteMutation.isPending) {
      return;
    }
    const nextMuted = !memberMuted(member);
    muteMutation.mutate({ conversationId: conversation.id, userId, muted: nextMuted });
    setMobileUserProfile((current) => current?.member && memberUserId(current.member) === userId ? { ...current, member: { ...current.member, muted: nextMuted, muted_until: null } } : current);
    setMobileProfileMenuOpen(false);
    setMemberMenu(null);
  }

  function memberProfileAction(member?: ConversationMember | null): ProfileAction | undefined {
    if (!member || !isGroup) {
      return undefined;
    }
    const actions: ProfileAction[] = [];
    if (canChangeMemberRole(member)) {
      actions.push({
        label: member.role === 'admin' ? '取消管理员' : '设为管理员',
        icon: member.role === 'admin' ? 'shield' : 'shieldCheck',
        onClick: () => toggleMemberAdmin(member),
        disabled: roleMutation.isPending
      });
    }
    if (canToggleMute(member)) {
      actions.push({
        label: memberMuted(member) ? '解除群禁言' : '设置群禁言',
        icon: memberMuted(member) ? 'volume' : 'muted',
        onClick: () => toggleMemberMute(member),
        disabled: muteMutation.isPending,
        tone: memberMuted(member) ? 'primary' : 'danger'
      });
    }
    if (actions.length === 0) {
      return undefined;
    }
    return { label: '群成员管理', tone: 'menu', actions };
  }

  function deleteDirectFriend(): void {
    const friendId = directUser?.id;
    if (!friendId || deleteFriendMutation.isPending) {
      return;
    }
    if (window.confirm(`确定要删除好友「${getDisplayName(directUser, '好友')}」吗？`)) {
      deleteFriendMutation.mutate(friendId);
    }
  }

  function canChangeMemberRole(member: ConversationMember): boolean {
    const userId = memberUserId(member);
    return Boolean(isGroup && currentRole === 'owner' && member.role !== 'owner' && userId && userId !== currentUser.id);
  }

  function canToggleMute(member: ConversationMember): boolean {
    const userId = memberUserId(member);
    return Boolean(canManageGroup && member.role !== 'owner' && userId && userId !== currentUser.id);
  }

  function canSetMemberTitle(member: ConversationMember): boolean {
    const userId = memberUserId(member);
    return Boolean(isGroup && currentRole === 'owner' && userId);
  }

  function memberMuted(member: ConversationMember): boolean {
    if (!member.muted) {
      return false;
    }
    const until = parseApiDate(member.muted_until);
    return !member.muted_until || !until || until.getTime() > Date.now();
  }

  function canRemoveMember(member: ConversationMember): boolean {
    const userId = memberUserId(member);
    if (!canManageGroup || !userId || userId === currentUser.id || member.role === 'owner') {
      return false;
    }
    return currentRole === 'owner' || member.role === 'member';
  }

  function openMemberMenu(event: React.MouseEvent<HTMLElement>, member: ConversationMember): void {
    const userId = memberUserId(member);
    if (!userId || userId === currentUser.id) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setUserCard(null);
    setMemberMenu({ member, ...pointInContainer(event.clientX, event.clientY, overlayRootRef.current) });
  }

  function openMembersView(): void {
    runNativeRouteTransition('forward', () => {
      setSearch('');
      setView('members');
    }, isMobile);
  }

  function openInviteModal(): void {
    if (!canManageGroup) {
      return;
    }
    runNativeRouteTransition('forward', () => {
      setSelectedInviteIds([]);
      setModal('invite');
    }, isMobile);
  }

  function openDrawerModal(nextModal: Exclude<DrawerModal, null>): void {
    setModal(nextModal);
  }

  function closeDrawerModal(): void {
    setModal(null);
  }

  function openAnnouncements(): void {
    runNativeRouteTransition('forward', () => setShowAnnouncements(true), isMobile);
  }

  function shareConversation(): void {
    setErrorText('');
    setCopied(false);
    if (isGroup) {
      openDrawerModal('shareActions');
      return;
    }
    if (!directUser?.id) {
      setErrorText('未找到要分享的用户');
      return;
    }
    openShareForwardModal('user');
  }

  function copyGroupInviteLink(): void {
    void createGroupInvite(conversation.id).then((link) => copyText(link.url)).then((success) => {
      if (!success) {
        setErrorText('复制失败，请手动复制。');
        return;
      }
      setErrorText('群聊链接已复制。');
      setCopied(true);
      setModal(null);
      window.setTimeout(() => setCopied(false), 1500);
    }).catch((error) => setErrorText(error instanceof Error ? error.message : '生成邀请链接失败'));
  }

  function openShareForwardModal(kind: ShareForwardKind = 'group'): void {
    runNativeRouteTransition('forward', () => {
      setShareTargetQuery('');
      setSelectedShareTargetId(null);
      setShareNote('');
      setShareForwardKind(kind);
      setModal('shareForward');
    }, isMobile);
  }

  function openLeaderboardModal(type: GroupLeaderboardType = 'activity'): void {
    setLeaderboardType(type);
    openDrawerModal('leaderboard');
  }

  function doCheckin(): void {
    if (!isGroup || checkinMutation.isPending || checkinStatusQuery.data?.checked_in_today) {
      return;
    }
    checkinMutation.mutate(conversation.id);
  }

  function submitShareForward(): void {
    if (!selectedShareTargetId || shareForwardMutation.isPending) {
      return;
    }
    shareForwardMutation.mutate({ targetConversationId: selectedShareTargetId, note: shareNote });
  }

  function saveMySettings(payload: UpdateMyConversationSettingsPayload): void {
    mySettingsMutation.mutate({ conversationId: conversation.id, payload });
  }

  function saveNickname(): void {
    const nickname = groupNickname.trim();
    setGroupNickname(nickname);
    if (nickname !== (currentMember?.nickname ?? '')) {
      saveMySettings({ nickname });
    }
  }

  function saveRemark(): void {
    const remark = groupRemark.trim();
    setGroupRemark(remark);
    if (remark !== (currentMember?.remark ?? '')) {
      saveMySettings({ remark });
    }
  }

  function updatePinnedValue(nextPinned: boolean): void {
    setPinned(nextPinned);
    saveMySettings({ pinned: nextPinned });
  }

  function updateDoNotDisturbValue(nextDoNotDisturb: boolean): void {
    setDoNotDisturb(nextDoNotDisturb);
    saveMySettings({ do_not_disturb: nextDoNotDisturb, message_setting: nextDoNotDisturb ? 'silent' : 'notify' });
  }

  function updateGroupSetting(payload: UpdateGroupSettingsPayload): void {
    groupSettingsMutation.mutate({ conversationId: conversation.id, payload });
  }

  function updateAllMutedValue(nextAllMuted: boolean): void {
    setAllMuted(nextAllMuted);
    updateGroupSetting({ all_muted: nextAllMuted });
  }

  function updateSlowModeValue(value: string): void {
    const nextSlowMode = Number(value);
    setMessageRateLimitPerMinute(nextSlowMode);
    updateGroupSetting({ message_rate_limit_per_minute: nextSlowMode });
  }

  function updateJoinModeValue(value: JoinMode): void {
    setJoinMode(value);
    const question = joinQuestion.trim();
    if (value === 'question' && !question) {
      setErrorText('请先填写加群问题。');
      return;
    }
    if (value === 'question') {
      setAutoApprove(false);
    }
    updateGroupSetting({ join_mode: value, join_question: value === 'question' ? question : null, auto_approve: value === 'question' ? false : autoApprove });
  }

  function saveJoinQuestion(): void {
    const question = joinQuestion.trim();
    setJoinQuestion(question);
    if (joinMode === 'question') {
      updateGroupSetting({ join_question: question });
    }
  }

  function updateTasksEnabledValue(nextEnabled: boolean): void {
    setTasksEnabled(nextEnabled);
    updateGroupSetting({ tasks_enabled: nextEnabled });
  }

  function updateTaskPermissionValue(value: 'members' | 'admins'): void {
    setTaskCreationPermission(value);
    updateGroupSetting({ task_creation_permission: value });
  }

  function setMemberCustomTitle(member: ConversationMember): void {
    const userId = memberUserId(member);
    if (!userId || !canSetMemberTitle(member) || titleMutation.isPending) {
      return;
    }
    const name = member.nickname?.trim() || getDisplayName(member.user, `用户 ${userId}`);
    const nextTitle = window.prompt(`设置 ${name} 的群头衔（留空清除）`, member.title ?? '');
    if (nextTitle === null) {
      return;
    }
    titleMutation.mutate({ conversationId: conversation.id, userId, title: nextTitle.trim() || null });
  }

  function updateAutoApproveValue(nextAutoApprove: boolean): void {
    setAutoApprove(nextAutoApprove);
    updateGroupSetting({ auto_approve: nextAutoApprove });
  }

  function submitProfile(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const title = profileTitle.trim();
    if (!title) {
      return;
    }
    profileMutation.mutate({ conversationId: conversation.id, payload: { title, avatar_url: profileAvatarUrl.trim(), description: profileDescription.trim(), category: profileCategory || null } });
  }

  function chooseGroupAvatar(event: React.ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    if (file) {
      groupAvatarMutation.mutate(file);
    }
    event.target.value = '';
  }

  function toggleInvite(friendId: number): void {
    setSelectedInviteIds((current) => (current.includes(friendId) ? current.filter((id) => id !== friendId) : [...current, friendId]));
  }

  function submitInvite(): void {
    if (selectedInviteIds.length === 0 || inviteMutation.isPending) {
      return;
    }
    inviteMutation.mutate({ conversationId: conversation.id, memberIds: selectedInviteIds });
  }

  function removeMember(member: ConversationMember): void {
    const userId = memberUserId(member);
    if (!userId || !canRemoveMember(member) || removeMutation.isPending) {
      return;
    }
    const name = member.nickname?.trim() || getDisplayName(member.user, `用户 ${userId}`);
    if (!window.confirm(`确定将 ${name} 移出群聊吗？`)) {
      return;
    }
    removeMutation.mutate({ conversationId: conversation.id, userId });
    setMemberMenu(null);
  }

  function clearHistory(): void {
    if (!window.confirm('确定删除本会话的聊天记录吗？此操作不会影响其他成员。')) {
      return;
    }
    clearMutation.mutate(conversation.id);
  }

  function leaveGroup(): void {
    if (!window.confirm('确定退出该群聊吗？')) {
      return;
    }
    leaveMutation.mutate(conversation.id);
  }

  function dissolveGroup(): void {
    if (!window.confirm('确定解散该群聊吗？解散后群成员、聊天记录、公告、加群申请等数据都会被彻底删除，且无法恢复。')) {
      return;
    }
    dissolveMutation.mutate(conversation.id);
  }

  function reportConversation(): void {
    if (!isGroup || conversationReportMutation.isPending) {
      return;
    }
    if (onReportConversation) {
      onReportConversation(conversation);
      return;
    }
    conversationReportMutation.mutate(conversation.id);
  }

  function handleJoinRequestReview(request: GroupJoinRequest, approved: boolean): void {
    if (approved) {
      acceptJoinRequestMutation.mutate(request.id);
      return;
    }
    rejectJoinRequestMutation.mutate(request.id);
  }

  function renderConversationAvatar(): JSX.Element {
    if (!isGroup) {
      return <Avatar user={directUser} label={getDisplayName(directUser, '好友')} size="lg" />;
    }
    const title = conversation.title || '群聊';
    const avatarUrl = resolveThumbnailUrl(conversation.avatar_url);
    if (avatarUrl) {
      return <img src={avatarUrl} alt={title} className="h-14 w-14 rounded-2xl border object-cover [border-color:var(--kc-border)]" />;
    }
    return <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border text-lg font-semibold [background:var(--kc-accent-soft)] [border-color:var(--kc-border)] [color:var(--kc-accent)]">{title.trim().slice(0, 1) || '群'}</div>;
  }

  function renderMemberButton(member: ConversationMember, compact = false): JSX.Element {
    const user = member.user;
    const userId = memberUserId(member);
    const label = userId ? `用户 ${userId}` : '成员';
    const name = member.nickname?.trim() || getDisplayName(user, label);
    const customTitle = member.title?.trim();
    const isSelf = userId === currentUser.id;
    if (compact) {
      return (
        <button key={member.id} type="button" onClick={(event) => openUserCard(event, user, label, member)} onContextMenu={(event) => openMemberMenu(event, member)} className="grid min-w-0 justify-items-center gap-1 rounded-2xl p-1.5 text-center text-[11px] transition hover:[background:var(--kc-hover)]">
          <Avatar user={user} label={name} size="sm" />
          <span className="w-full truncate [color:var(--kc-muted)]">{isSelf ? '我' : name}</span>
        </button>
      );
    }
    const subtitle = customTitle ? `头衔：${customTitle}` : user?.bio?.trim() || user?.email || user?.username || label;
    if (isMobile) {
      return (
        <div key={member.id} onContextMenu={(event) => openMemberMenu(event, member)} className="kc-qq-member-list-row grid w-full max-w-full min-w-0 grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 overflow-hidden rounded-[20px] border px-3 py-3 text-left text-sm [background:var(--kc-panel)] [border-color:var(--kc-border)]" style={{ width: '100%', maxWidth: '100%', minWidth: 0, overflow: 'hidden' }}>
          <span className="shrink-0 [&>*]:h-11 [&>*]:w-11">
            <Avatar user={user} label={name} size="md" />
          </span>
          <button type="button" onClick={(event) => openUserCard(event, user, label, member)} className="block min-w-0 max-w-full overflow-hidden text-left" style={{ minWidth: 0, maxWidth: '100%', overflow: 'hidden' }}>
            <span className="hidden">
              <Avatar user={user} label={name} size="md" />
            </span>
            <span className="block min-w-0 max-w-full overflow-hidden" style={{ minWidth: 0, maxWidth: '100%', overflow: 'hidden' }}>
              <span className="block max-w-full truncate text-[15px] font-semibold [color:var(--kc-text)]" style={{ display: 'block', minWidth: 0, width: '100%', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}{isSelf ? '（我）' : ''}</span>
              <span className="mt-1 block truncate text-[12px] leading-4 [color:var(--kc-muted)]" style={{ display: 'block', minWidth: 0, width: '100%', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subtitle}</span>
              <span className="mt-2 flex min-w-0 max-w-full flex-wrap items-center gap-1.5 overflow-hidden">
                {memberMuted(member) ? <span className="min-w-0 max-w-full shrink rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold text-red-500">禁言</span> : null}
                {customTitle ? <span className="min-w-0 max-w-[96px] shrink truncate rounded-full bg-violet-500/12 px-2 py-0.5 text-[10px] font-semibold text-violet-500">{customTitle}</span> : null}
                <span className={`min-w-0 max-w-[72px] shrink truncate rounded-full px-2 py-0.5 text-[10px] font-semibold ${roleBadgeClass(member.role)}`}>{roleLabel(member.role)}</span>
              </span>
            </span>
          </button>
          {(() => {
            const action = profileActionForUser(user);
            if (!action || user?.is_bot || isSelf) {
              return <span className="h-8 w-8 shrink-0" aria-hidden="true" />;
            }
            const isAddFriend = action.label === '添加好友' || action.label === '发送中...';
            return (
              <button type="button" onClick={(event) => { event.stopPropagation(); action.onClick?.(user as User); }} disabled={action.disabled || !action.onClick || !isAddFriend} className={`grid h-8 min-w-8 shrink-0 place-items-center rounded-full px-2 text-[11px] font-black transition disabled:opacity-60 ${isAddFriend ? 'text-white [background:var(--kc-accent)] active:scale-95' : '[background:var(--kc-panel-muted)] [color:var(--kc-muted)]'}`} aria-label={action.label}>
                {isAddFriend ? <Icon name="userPlus" className="h-4 w-4" /> : action.label}
              </button>
            );
          })()}
        </div>
      );
    }
    return (
      <div key={member.id} onContextMenu={(event) => openMemberMenu(event, member)} className="kc-drawer-member-row grid w-full min-w-0 max-w-full grid-cols-[minmax(0,1fr)_96px] items-center gap-2 overflow-hidden rounded-2xl px-3 py-2.5 text-left text-sm transition hover:[background:var(--kc-hover)]" style={{ width: '100%', maxWidth: '100%', minWidth: 0, overflow: 'hidden' }}>
        <button type="button" onClick={(event) => openUserCard(event, user, label, member)} className="grid min-w-0 max-w-full grid-cols-[40px_minmax(0,1fr)] items-center gap-3 overflow-hidden text-left" style={{ minWidth: 0, maxWidth: '100%', overflow: 'hidden' }}>
          <span className="shrink-0"><Avatar user={user} label={name} size="md" /></span>
          <span className="min-w-0 max-w-full overflow-hidden" style={{ minWidth: 0, maxWidth: '100%', overflow: 'hidden' }}>
            <span className="block truncate font-medium" style={{ display: 'block', minWidth: 0, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}{isSelf ? '（我）' : ''}</span>
            <span className="mt-0.5 block truncate text-xs [color:var(--kc-muted)]" style={{ display: 'block', minWidth: 0, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subtitle}</span>
          </span>
        </button>
        <div className="kc-drawer-member-badges flex min-w-0 max-w-[96px] items-center justify-end gap-1.5 overflow-hidden">
          {memberMuted(member) ? <span className="rounded-full bg-red-500/10 px-2 py-1 text-[11px] font-semibold text-red-500">禁言</span> : null}
          {customTitle ? <span className="max-w-[72px] truncate rounded-full bg-violet-500/12 px-2 py-1 text-[11px] font-semibold text-violet-500">{customTitle}</span> : null}
          <span className={`max-w-[72px] truncate rounded-full px-2 py-1 text-[11px] font-semibold ${roleBadgeClass(member.role)}`}>{roleLabel(member.role)}</span>
          {canSetMemberTitle(member) ? (
            <button type="button" onClick={() => setMemberCustomTitle(member)} disabled={titleMutation.isPending} className="shrink-0 rounded-full border px-2 py-1 text-[11px] font-semibold transition [border-color:var(--kc-border)] [color:var(--kc-accent)] hover:[background:var(--kc-accent-soft)] disabled:cursor-not-allowed disabled:opacity-45">
              {customTitle ? '改头衔' : '设头衔'}
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  function renderCheckinCard(): JSX.Element | null {
    if (!isGroup) {
      return null;
    }
    const status = checkinStatusQuery.data;
    const level = status?.level ?? currentMember?.level ?? 1;
    const levelExp = status?.level_exp ?? currentMember?.level_exp ?? 0;
    const nextLevelExp = status?.next_level_exp ?? currentMember?.next_level_exp ?? 50;
    const checked = Boolean(status?.checked_in_today);
    const streak = status?.current_streak ?? currentMember?.current_checkin_streak ?? 0;
    const total = status?.total_checkins ?? currentMember?.total_checkins ?? 0;
    return (
      <DrawerCard className="mt-3 overflow-hidden">
        <div className="p-4 [background:linear-gradient(135deg,var(--kc-accent-soft),transparent)]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.18em] [color:var(--kc-accent)]">Group Growth</p>
              <h4 className="mt-1 text-lg font-bold">Lv.{level} · 今日签到</h4>
              <p className="mt-1 text-xs [color:var(--kc-muted)]">经验 {levelExp} · 距离下一级还差 {nextLevelExp}</p>
            </div>
            <button type="button" onClick={doCheckin} disabled={checked || checkinMutation.isPending || checkinStatusQuery.isLoading} className={`shrink-0 rounded-2xl px-4 py-2 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${checked ? '[background:var(--kc-panel-muted)] [color:var(--kc-muted)]' : 'text-white [background:var(--kc-accent)] hover:opacity-90'}`}>
              {checkinMutation.isPending ? '签到中...' : checked ? '已签到' : '今日签到'}
            </button>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
            <button type="button" onClick={() => openLeaderboardModal('checkin_streak')} className="rounded-2xl border px-2 py-3 transition hover:[background:var(--kc-hover)] [border-color:var(--kc-border)]">
              <span className="block text-base font-black [color:var(--kc-text)]">{streak}</span>
              <span className="mt-1 block [color:var(--kc-muted)]">连续签到</span>
            </button>
            <button type="button" onClick={() => openLeaderboardModal('checkin_total')} className="rounded-2xl border px-2 py-3 transition hover:[background:var(--kc-hover)] [border-color:var(--kc-border)]">
              <span className="block text-base font-black [color:var(--kc-text)]">{total}</span>
              <span className="mt-1 block [color:var(--kc-muted)]">累计签到</span>
            </button>
            <button type="button" onClick={() => openLeaderboardModal('activity')} className="rounded-2xl border px-2 py-3 transition hover:[background:var(--kc-hover)] [border-color:var(--kc-border)]">
              <span className="block text-base font-black [color:var(--kc-text)]">{currentMember?.activity_score ?? 0}</span>
              <span className="mt-1 block [color:var(--kc-muted)]">活跃值</span>
            </button>
          </div>
        </div>
      </DrawerCard>
    );
  }

  function renderMobileCheckinCard(): JSX.Element | null {
    if (!isGroup) {
      return null;
    }
    const status = checkinStatusQuery.data;
    const level = status?.level ?? currentMember?.level ?? 1;
    const levelExp = status?.level_exp ?? currentMember?.level_exp ?? 0;
    const nextLevelExp = status?.next_level_exp ?? currentMember?.next_level_exp ?? 50;
    const progress = Math.min(100, Math.round((levelExp / Math.max(1, levelExp + nextLevelExp)) * 100));
    const checked = Boolean(status?.checked_in_today);
    const streak = status?.current_streak ?? currentMember?.current_checkin_streak ?? 0;
    const total = status?.total_checkins ?? currentMember?.total_checkins ?? 0;
    return (
      <section className="mt-4 overflow-hidden rounded-[24px] border p-4 [background:linear-gradient(135deg,color-mix(in_srgb,var(--kc-accent-soft,#eaf4ff)_84%,var(--kc-panel,#fff)),var(--kc-panel,#fff)_48%,color-mix(in_srgb,#ffb020_14%,var(--kc-panel,#fff)))] [border-color:var(--kc-border)]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#168bff]">群成长</p>
            <h4 className="mt-1 text-[20px] font-black [color:var(--kc-text,#111827)]">Lv.{level} 今日签到</h4>
            <p className="mt-1 text-[12px] font-semibold [color:var(--kc-muted,#7b8798)]">经验 {levelExp} · 距离升级还差 {nextLevelExp}</p>
          </div>
          <button type="button" onClick={doCheckin} disabled={checked || checkinMutation.isPending || checkinStatusQuery.isLoading} className={`shrink-0 rounded-[16px] px-4 py-2 text-[13px] font-black transition disabled:opacity-60 ${checked ? '[background:var(--kc-panel-muted)] [color:var(--kc-muted)]' : '[background:var(--kc-accent)] text-white shadow-[0_10px_24px_rgba(22,139,255,0.22)] active:scale-95'}`}>
            {checkinMutation.isPending ? '签到中' : checked ? '已签到' : '签到'}
          </button>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full [background:var(--kc-panel-muted)]">
          <span className="block h-full rounded-full bg-[#168bff]" style={{ width: `${progress}%` }} />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <button type="button" onClick={() => openLeaderboardModal('checkin_streak')} className="rounded-[18px] px-2 py-3 [background:var(--kc-panel)] active:scale-[0.98]">
            <span className="block text-[18px] font-black [color:var(--kc-text,#111827)]">{streak}</span>
            <span className="mt-0.5 block text-[11px] font-bold [color:var(--kc-muted,#8b95a5)]">连续签到</span>
          </button>
          <button type="button" onClick={() => openLeaderboardModal('checkin_total')} className="rounded-[18px] px-2 py-3 [background:var(--kc-panel)] active:scale-[0.98]">
            <span className="block text-[18px] font-black [color:var(--kc-text,#111827)]">{total}</span>
            <span className="mt-0.5 block text-[11px] font-bold [color:var(--kc-muted,#8b95a5)]">累计签到</span>
          </button>
          <button type="button" onClick={() => openLeaderboardModal('activity')} className="rounded-[18px] px-2 py-3 [background:var(--kc-panel)] active:scale-[0.98]">
            <span className="block text-[18px] font-black [color:var(--kc-text,#111827)]">{currentMember?.activity_score ?? 0}</span>
            <span className="mt-0.5 block text-[11px] font-bold [color:var(--kc-muted,#8b95a5)]">活跃值</span>
          </button>
        </div>
      </section>
    );
  }

  function renderMobileBotsCard(): JSX.Element | null {
    if (!isGroup) {
      return null;
    }
    const bots = botsQuery.data ?? [];
    const enabledCount = bots.filter((installation) => installation.enabled).length;
    return (
      <section className="mt-4 overflow-hidden rounded-[24px] p-0 shadow-[0_10px_32px_rgba(15,23,42,0.04)] [background:var(--kc-panel)]">
        <div className="flex items-center justify-between px-4 py-3">
          <span className="inline-flex items-center gap-2 text-[15px] font-black [color:var(--kc-text,#111827)]"><span className="grid h-9 w-9 place-items-center rounded-[14px] [background:var(--kc-accent-soft,#eef3ff)] [color:var(--kc-accent,#3b6cff)]"><Icon name="bot" className="h-4 w-4" /></span>群机器人</span>
          <span className="rounded-full px-2.5 py-1 text-[11px] font-black [background:var(--kc-panel-muted)] [color:var(--kc-muted,#8b95a5)]">{enabledCount}/{bots.length} 启用</span>
        </div>
        <div className="grid gap-2 px-3 pb-3">
          {botsQuery.isLoading ? <p className="rounded-[18px] p-3 text-[13px] font-semibold [background:var(--kc-panel-muted)] [color:var(--kc-muted,#8b95a5)]">正在加载机器人...</p> : null}
          {!botsQuery.isLoading && bots.length === 0 ? <p className="rounded-[18px] p-3 text-[13px] font-semibold leading-5 [background:var(--kc-panel-muted)] [color:var(--kc-muted,#8b95a5)]">暂无机器人。管理员可在机器人中心添加公开机器人到本群。</p> : null}
          {bots.map((installation) => {
            const bot = installation.bot;
            const botUser = bot?.user ?? { id: bot?.user_id ?? installation.bot_id, username: bot?.name ?? 'bot', nickname: bot?.name ?? '机器人', avatar_url: bot?.avatar_url, is_bot: true };
            return (
              <div key={installation.id} className={`flex min-w-0 max-w-full items-start gap-3 overflow-hidden rounded-[20px] border px-3 py-3 [border-color:var(--kc-border)] ${installation.enabled ? '[background:var(--kc-panel)]' : '[background:var(--kc-panel-muted)] opacity-70'}`}>
                <Avatar user={botUser} />
                <span className="min-w-0 flex-1 overflow-hidden text-left">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-[15px] font-black [color:var(--kc-text,#151922)]">{bot?.name ?? `机器人 ${installation.bot_id}`}</span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${bot?.online ? 'bg-emerald-100 text-emerald-700' : '[background:var(--kc-panel-muted)] [color:var(--kc-muted,#8b95a5)]'}`}>{bot?.online ? '在线' : '离线'}</span>
                  </span>
                  <span className="mt-0.5 block line-clamp-2 break-words text-[12px] font-semibold leading-5 [color:var(--kc-muted,#8b95a5)]">{installation.enabled ? bot?.description || bot?.commands || 'KukeChat Bot API' : '已停用，不会接收或发送消息'}</span>
                </span>
                {canManageGroup ? (
                  <span className="flex max-w-[94px] shrink-0 flex-wrap justify-end gap-1.5">
                    <button type="button" disabled={updateBotMutation.isPending} onClick={() => updateBotMutation.mutate({ botId: installation.bot_id, enabled: !installation.enabled })} className="whitespace-nowrap rounded-full px-2.5 py-1.5 text-[11px] font-black [background:var(--kc-accent-soft,#eef3ff)] [color:var(--kc-accent,#168bff)] disabled:opacity-50">{installation.enabled ? '停用' : '启用'}</button>
                    <button type="button" disabled={removeBotMutation.isPending} onClick={() => removeBotMutation.mutate(installation.bot_id)} className="rounded-full bg-red-50 px-2.5 py-1.5 text-[11px] font-black text-red-500 disabled:opacity-50">移出</button>
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  function renderGroupMain(): JSX.Element {
    return (
      <div className="scroll-soft min-h-0 flex-1 overflow-y-auto p-4">
        <DrawerCard className="p-4">
          <div className="flex items-center gap-3">
            {renderConversationAvatar()}
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-base font-semibold">{conversation.title || '未命名群聊'} ({memberCount})</h3>
              <p className="mt-1 truncate text-xs [color:var(--kc-muted)]">群号 {conversation.id} · {memberCount}名成员 · {conversation.category?.trim() || '未设置'}</p>
              {conversation.description?.trim() ? <p className="mt-1 line-clamp-2 text-xs leading-5 [color:var(--kc-muted)]">{conversation.description}</p> : null}
            </div>
            <button type="button" onClick={shareConversation} className="rounded-full border px-3 py-1.5 text-xs font-semibold transition [border-color:var(--kc-border)] [color:var(--kc-accent)] hover:[background:var(--kc-hover)]">{copied ? '已复制' : '分享'}</button>
          </div>
        </DrawerCard>

        {renderCheckinCard()}

        <DrawerCard className="mt-3">
          <div className="flex items-center justify-between px-4 py-3 text-sm font-semibold">
            <span className="inline-flex items-center gap-2"><Icon name="bot" className="h-4 w-4 [color:#2563eb]" />群机器人</span>
            <span className="text-xs font-medium [color:var(--kc-muted)]">{botsQuery.data?.length ?? 0}个</span>
          </div>
          <div className="space-y-2 px-3 pb-4">
            {botsQuery.isLoading ? <p className="rounded-xl p-3 text-xs [background:var(--kc-panel-muted)] [color:var(--kc-muted)]">正在加载机器人...</p> : null}
            {!botsQuery.isLoading && (botsQuery.data ?? []).length === 0 ? <p className="rounded-xl p-3 text-xs [background:var(--kc-panel-muted)] [color:var(--kc-muted)]">暂无机器人，可到机器人中心添加公开机器人。</p> : null}
            {(botsQuery.data ?? []).map((installation) => {
              const bot = installation.bot;
              const botUser = bot?.user ?? { id: bot?.user_id ?? installation.bot_id, username: bot?.name ?? '机器人', nickname: bot?.name ?? '机器人', avatar_url: bot?.avatar_url, is_bot: true };
              return (
                <div key={installation.id} className={`flex items-center gap-3 rounded-2xl border px-3 py-2 [background:var(--kc-panel)] [border-color:var(--kc-border)] ${installation.enabled ? '' : 'opacity-60'}`}>
                  <span className="h-9 w-9 shrink-0 overflow-hidden rounded-full"><Avatar user={botUser} size="sm" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{bot?.name ?? `机器人 ${installation.bot_id}`}</p>
                    <p className="truncate text-xs [color:var(--kc-muted)]">{installation.enabled ? bot?.description || 'KukeChat Bot API' : '已停用，机器人不会接收消息或发送消息'}</p>
                  </div>
                  {canManageGroup ? <button type="button" disabled={updateBotMutation.isPending} onClick={() => updateBotMutation.mutate({ botId: installation.bot_id, enabled: !installation.enabled })} className="rounded-xl border px-2 py-1 text-[11px] font-semibold [border-color:var(--kc-border)]">{installation.enabled ? '停用' : '启用'}</button> : null}
                  {canManageGroup ? <button type="button" disabled={removeBotMutation.isPending} onClick={() => removeBotMutation.mutate(installation.bot_id)} className="rounded-xl bg-red-500/10 px-2 py-1 text-[11px] font-semibold text-red-500">移出</button> : null}
                </div>
              );
            })}
          </div>
        </DrawerCard>

        <DrawerCard className="mt-3">
          <button type="button" onClick={openMembersView} className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold transition hover:[background:var(--kc-hover)]">
            <span>群聊成员</span>
            <span className="flex items-center gap-1 text-xs font-medium [color:var(--kc-muted)]">查看{memberCount}名群成员 <Icon name="chevron" className="h-3.5 w-3.5" /></span>
          </button>
          <div className="grid grid-cols-5 gap-2 px-3 pb-4">
            {membersLoading ? <p className="col-span-5 rounded-xl p-3 text-xs [background:var(--kc-panel-muted)] [color:var(--kc-muted)]">正在加载成员...</p> : null}
            {!membersLoading && sortedMembers.slice(0, 13).map((member) => renderMemberButton(member, true))}
            {canManageGroup ? (
              <button type="button" onClick={openInviteModal} className="grid justify-items-center gap-1 rounded-2xl p-1.5 text-[11px] transition hover:[background:var(--kc-hover)]">
                <span className="grid h-8 w-8 place-items-center rounded-full border [background:var(--kc-panel-muted)] [border-color:var(--kc-border)] [color:var(--kc-muted)]"><Icon name="plus" className="h-4 w-4" /></span>
                <span className="[color:var(--kc-muted)]">邀请</span>
              </button>
            ) : null}
            {canManageGroup ? (
              <button type="button" onClick={() => openDrawerModal('remove')} className="grid justify-items-center gap-1 rounded-2xl p-1.5 text-[11px] transition hover:[background:var(--kc-hover)]">
                <span className="grid h-8 w-8 place-items-center rounded-full border [background:var(--kc-panel-muted)] [border-color:var(--kc-border)] [color:var(--kc-muted)]"><Icon name="minus" className="h-4 w-4" /></span>
                <span className="[color:var(--kc-muted)]">移除</span>
              </button>
            ) : null}
          </div>
        </DrawerCard>

        {canManageGroup ? (
          <>
            <p className="mb-2 mt-5 px-1 text-xs font-semibold [color:var(--kc-muted)]">资料管理</p>
            <DrawerCard>
              <DrawerRow label="群资料设置" icon={<Icon name="settings" className="h-4 w-4" />} onClick={() => openDrawerModal('profile')} />
              <DrawerRow label="群公告" value={conversation.announcement?.trim() ? '有新公告' : '暂无'} icon={<Icon name="announcement" className="h-4 w-4" />} onClick={openAnnouncements} />
              <DrawerRow label="入群申请" value={pendingConversationJoinRequests.length > 0 ? `${pendingConversationJoinRequests.length}条待处理` : '暂无待处理'} icon={<Icon name="bell" className="h-4 w-4" />} onClick={() => openDrawerModal('joinRequests')} />
              <label className="kc-drawer-input-row flex items-center gap-3 px-4 py-3 text-sm">
                <span className="min-w-0 flex-1">我的本群昵称</span>
                <input value={groupNickname} onChange={(event) => setGroupNickname(event.target.value)} onBlur={saveNickname} placeholder="未设置" className="w-36 rounded-xl border px-3 py-1.5 text-right text-xs outline-none [background:var(--kc-panel-muted)] [border-color:var(--kc-border)] [color:var(--kc-text)] placeholder:[color:var(--kc-muted)] focus:[border-color:var(--kc-accent)]" />
              </label>
              <label className="kc-drawer-input-row flex items-center gap-3 px-4 py-3 text-sm">
                <span className="min-w-0 flex-1">群聊备注</span>
                <input value={groupRemark} onChange={(event) => setGroupRemark(event.target.value)} onBlur={saveRemark} placeholder="未设置" className="w-36 rounded-xl border px-3 py-1.5 text-right text-xs outline-none [background:var(--kc-panel-muted)] [border-color:var(--kc-border)] [color:var(--kc-text)] placeholder:[color:var(--kc-muted)] focus:[border-color:var(--kc-accent)]" />
              </label>
            </DrawerCard>

            <p className="mb-2 mt-5 px-1 text-xs font-semibold [color:var(--kc-muted)]">发言权限</p>
            <DrawerCard allowOverflow>
              <ToggleRow label="全员禁言" checked={allMuted} disabled={groupSettingsMutation.isPending} onChange={updateAllMutedValue} />
              <DrawerSelectRow label="发言限频" value={String(messageRateLimitPerMinute)} options={slowModeOptions} disabled={groupSettingsMutation.isPending} icon={<Icon name="clock" className="h-4 w-4" />} onChange={updateSlowModeValue} />
            </DrawerCard>

            <p className="mb-2 mt-5 px-1 text-xs font-semibold [color:var(--kc-muted)]">开放设置</p>
            <DrawerCard allowOverflow>
              <DrawerSelectRow label="加群方式" value={joinMode} options={joinModeOptions} disabled={groupSettingsMutation.isPending} icon={<Icon name="users" className="h-4 w-4" />} onChange={updateJoinModeValue} />
              <label className="kc-drawer-input-row flex items-center gap-3 px-4 py-3 text-sm">
                <span className="min-w-0 flex-1">加群问题</span>
                <input value={joinQuestion} onChange={(event) => setJoinQuestion(event.target.value)} onBlur={saveJoinQuestion} disabled={groupSettingsMutation.isPending} placeholder="例如：你的班级/暗号？" className="w-44 rounded-xl border px-3 py-1.5 text-right text-xs outline-none [background:var(--kc-panel-muted)] [border-color:var(--kc-border)] [color:var(--kc-text)] placeholder:[color:var(--kc-muted)] focus:[border-color:var(--kc-accent)] disabled:cursor-not-allowed disabled:opacity-50" />
              </label>
              <ToggleRow label="加群自动审批" checked={joinMode === 'question' ? false : autoApprove} disabled={groupSettingsMutation.isPending || joinMode === 'question'} onChange={updateAutoApproveValue} />
            </DrawerCard>


            {isGroupOwner ? (
            <>
            <p className="mb-2 mt-5 px-1 text-xs font-semibold [color:var(--kc-muted)]">游戏模式</p>
            <DrawerCard allowOverflow>
              <label className="kc-drawer-input-row flex items-center gap-3 px-4 py-3 text-sm">
                <span className="min-w-0 flex-1">绑定作品 ID</span>
                <input
                  value={gameCreationOid}
                  onChange={(event) => setGameCreationOid(event.target.value)}
                  onBlur={saveGameCreationOid}
                  disabled={gameModeMutation.isPending}
                  placeholder="粘贴作品链接或 ID"
                  className="w-44 rounded-xl border px-3 py-1.5 text-right text-xs outline-none [background:var(--kc-panel-muted)] [border-color:var(--kc-border)] [color:var(--kc-text)] placeholder:[color:var(--kc-muted)] focus:[border-color:var(--kc-accent)] disabled:cursor-not-allowed disabled:opacity-50"
                />
              </label>
              <ToggleRow label="开启游戏模式" checked={gameModeEnabled} disabled={gameModeMutation.isPending || gameModeQuery.isLoading} onChange={toggleGameMode} />
            </DrawerCard>
            <p className="mt-2 px-1 text-[11px] leading-5 [color:var(--kc-muted)]">
              开启后，绑定作品里的玩家可以直接收发本群消息。<strong className="[color:var(--kc-text)]">本群近期聊天记录会对所有游玩该作品的人可见，包括未登录访客</strong>，因此仅公开群可以开启。玩家发言时会自动入群，你原有的禁言与成员管理照常生效。
            </p>
            {gameModeError ? <p className="mt-1 px-1 text-[11px] leading-5 text-red-500">{gameModeError}</p> : null}
            </>
            ) : null}

            <p className="mb-2 mt-5 px-1 text-xs font-semibold [color:var(--kc-muted)]">任务</p>
            <DrawerCard allowOverflow>
              <ToggleRow label="开启任务功能" checked={tasksEnabled} disabled={groupSettingsMutation.isPending} onChange={updateTasksEnabledValue} />
              {tasksEnabled ? (
                <DrawerSelectRow label="谁可以创建任务" value={taskCreationPermission} options={[{ value: 'members', label: '全部成员' }, { value: 'admins', label: '仅管理员' }]} disabled={groupSettingsMutation.isPending} icon={<Icon name="checkSquare" className="h-4 w-4" />} onChange={updateTaskPermissionValue} />
              ) : null}
            </DrawerCard>

            <p className="mb-2 mt-5 px-1 text-xs font-semibold [color:var(--kc-muted)]">我的设置</p>
            <DrawerCard allowOverflow>
              <ToggleRow label="设为置顶" checked={pinned} disabled={mySettingsMutation.isPending} onChange={updatePinnedValue} />
              <ToggleRow label="消息免打扰" checked={doNotDisturb} disabled={mySettingsMutation.isPending} onChange={updateDoNotDisturbValue} />
              <DrawerRow label="删除聊天记录" icon={<Icon name="trash" className="h-4 w-4" />} disabled={clearMutation.isPending} onClick={clearHistory} />
              <DrawerRow label="举报群聊" icon={<Icon name="flag" className="h-4 w-4" />} danger disabled={conversationReportMutation.isPending} onClick={reportConversation} />
            </DrawerCard>

            {currentRole === 'owner' ? (
              <button type="button" disabled={dissolveMutation.isPending} onClick={dissolveGroup} className="mt-5 w-full rounded-[18px] border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm font-semibold text-red-500 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-45">解散群聊</button>
            ) : (
              <button type="button" disabled={leaveMutation.isPending} onClick={leaveGroup} className="mt-5 w-full rounded-[18px] border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm font-semibold text-red-500 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-45">退出群聊</button>
            )}
          </>
        ) : (
          <>
            <DrawerCard className="mt-3">
                <DrawerRow label="群公告" value={conversation.announcement?.trim() ? '有新公告' : '暂无'} icon={<Icon name="announcement" className="h-4 w-4" />} onClick={openAnnouncements} />
                <label className="kc-drawer-input-row flex items-center gap-3 px-4 py-3 text-sm">
                  <span className="min-w-0 flex-1">我的本群昵称</span>
                  <input value={groupNickname} onChange={(event) => setGroupNickname(event.target.value)} onBlur={saveNickname} placeholder="未设置" className="w-36 rounded-xl border px-3 py-1.5 text-right text-xs outline-none [background:var(--kc-panel-muted)] [border-color:var(--kc-border)] [color:var(--kc-text)] placeholder:[color:var(--kc-muted)] focus:[border-color:var(--kc-accent)]" />
                </label>
                <label className="kc-drawer-input-row flex items-center gap-3 px-4 py-3 text-sm">
                  <span className="min-w-0 flex-1">群聊备注</span>
                  <input value={groupRemark} onChange={(event) => setGroupRemark(event.target.value)} onBlur={saveRemark} placeholder="未设置" className="w-36 rounded-xl border px-3 py-1.5 text-right text-xs outline-none [background:var(--kc-panel-muted)] [border-color:var(--kc-border)] [color:var(--kc-text)] placeholder:[color:var(--kc-muted)] focus:[border-color:var(--kc-accent)]" />
                </label>
              </DrawerCard>

              <DrawerCard className="mt-3" allowOverflow>
                <ToggleRow label="设为置顶" checked={pinned} disabled={mySettingsMutation.isPending} onChange={updatePinnedValue} />
                <ToggleRow label="消息免打扰" checked={doNotDisturb} disabled={mySettingsMutation.isPending} onChange={updateDoNotDisturbValue} />
                <DrawerRow label="删除聊天记录" icon={<Icon name="trash" className="h-4 w-4" />} disabled={clearMutation.isPending} onClick={clearHistory} />
                <DrawerRow label="举报群聊" icon={<Icon name="flag" className="h-4 w-4" />} danger disabled={conversationReportMutation.isPending} onClick={reportConversation} />
              </DrawerCard>

              <button type="button" disabled={leaveMutation.isPending} onClick={leaveGroup} className="mt-5 w-full rounded-[18px] border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm font-semibold text-red-500 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-45">退出群聊</button>
            </>
          )}
      </div>
    );
  }

  function renderDirectMain(): JSX.Element {
    const name = getDisplayName(directUser, '好友');
    return (
      <div className="scroll-soft min-h-0 flex-1 overflow-y-auto p-4">
        <DrawerCard className="p-5 text-center">
          <button type="button" onClick={(event) => openUserCard(event, directUser, '好友')} className="mx-auto grid justify-items-center gap-3 rounded-2xl p-2 transition hover:[background:var(--kc-hover)]">
            {renderConversationAvatar()}
            <span className="max-w-full truncate text-base font-semibold">{name}</span>
          </button>
          <p className="mt-1 text-xs [color:var(--kc-muted)]">账号 {directUser?.id ?? conversation.id}{isTemporaryDirect ? ' · 临时会话' : !isDirectFriend ? ' · 非好友会话' : ''}</p>
          <p className="mx-auto mt-3 max-w-[240px] text-xs leading-5 [color:var(--kc-muted)]">{directUser?.bio?.trim() || '咕咕咕~'}</p>
          <button type="button" onClick={shareConversation} className="mt-4 rounded-full border px-3 py-1.5 text-xs font-semibold transition [border-color:var(--kc-border)] [color:var(--kc-accent)] hover:[background:var(--kc-hover)]">发送名片</button>
        </DrawerCard>

        <DrawerCard className="mt-3" allowOverflow>
          {isDirectFriend ? (
            <label className="kc-drawer-input-row flex items-center gap-3 px-4 py-3 text-sm">
              <span className="min-w-0 flex-1">好友备注</span>
              <input value={groupRemark} onChange={(event) => setGroupRemark(event.target.value)} onBlur={saveRemark} placeholder="未设置" className="w-36 rounded-xl border px-3 py-1.5 text-right text-xs outline-none [background:var(--kc-panel-muted)] [border-color:var(--kc-border)] [color:var(--kc-text)] placeholder:[color:var(--kc-muted)] focus:[border-color:var(--kc-accent)]" />
            </label>
          ) : (
            <div className="px-4 py-3 text-sm leading-6 [color:var(--kc-muted)]">你们还不是好友。可以在临时会话顶部或资料卡里发送好友申请。</div>
          )}
          <ToggleRow label="设为置顶" checked={pinned} disabled={mySettingsMutation.isPending} onChange={updatePinnedValue} />
          <ToggleRow label="消息免打扰" checked={doNotDisturb} disabled={mySettingsMutation.isPending} onChange={updateDoNotDisturbValue} />
          <DrawerRow label="删除聊天记录" icon={<Icon name="trash" className="h-4 w-4" />} disabled={clearMutation.isPending} onClick={clearHistory} />
        </DrawerCard>
        {isDirectFriend ? <button type="button" disabled={deleteFriendMutation.isPending} onClick={deleteDirectFriend} className="mt-5 w-full rounded-[18px] border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm font-semibold text-red-500 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-45">删除好友</button> : null}
      </div>
    );
  }

  function renderMemberList(): JSX.Element {
    const shellClass = isMobile
      ? 'kc-qq-member-list-page flex h-full min-h-0 w-full min-w-0 max-w-full flex-col overflow-hidden [background:var(--kc-mobile-bg,var(--kc-list))] [color:var(--kc-text)]'
      : 'kc-pc-member-list-page grid h-full min-h-0 min-w-0 flex-1 overflow-hidden grid-rows-[auto_auto_minmax(0,1fr)] [background:var(--kc-list)] [color:var(--kc-text)]';
    const headerClass = isMobile
      ? 'kc-qq-nav-header h-[52px] shrink-0 px-4'
      : 'flex h-12 items-center gap-2 border-b px-3 [background:var(--kc-panel)] [border-color:var(--kc-border)]';
    const searchWrapClass = isMobile ? 'w-full min-w-0 max-w-full shrink-0 overflow-hidden px-4 pb-3 pt-2' : 'min-w-0 overflow-hidden p-3';
    const listWrapClass = isMobile
      ? 'kc-qq-member-list-scroll scroll-soft min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 pb-5 overscroll-contain [-webkit-overflow-scrolling:touch]'
      : 'scroll-soft min-h-0 min-w-0 overflow-y-auto overflow-x-hidden px-3 pb-4';
    return (
      <div className={shellClass} style={{ overflowX: 'hidden', maxWidth: '100%', width: '100%' }}>
        <div className={headerClass}>
          <button type="button" onClick={() => runNativeRouteTransition('back', () => setView('main'), isMobile)} className="kc-icon-button h-9 w-9 shrink-0" aria-label="返回群设置">
            <Icon name={isMobile ? 'chevronLeft' : 'chevron'} className={`h-5 w-5 ${isMobile ? '' : 'rotate-180'}`} />
          </button>
          <div className="min-w-0 flex-1 text-center">
            <h3 className="truncate text-[17px] font-bold">群成员</h3>
            <p className="truncate text-[11px] font-medium [color:var(--kc-muted)]">共 {memberCount} 名成员</p>
          </div>
          {isMobile ? <span aria-hidden="true" className="h-9 w-9 shrink-0" /> : null}
        </div>
        <div className={searchWrapClass}>
          <label className="flex h-10 w-full max-w-full min-w-0 items-center gap-2 overflow-hidden rounded-[18px] border px-3 [background:var(--kc-panel)] [border-color:var(--kc-border)] focus-within:[border-color:var(--kc-accent)]">
            <Icon name="search" className="h-4 w-4 shrink-0 [color:var(--kc-muted)]" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索群成员" className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none [color:var(--kc-text)] placeholder:[color:var(--kc-muted)]" />
          </label>
        </div>
        <div className={listWrapClass} style={{ overflowX: 'hidden', maxWidth: isMobile ? 'calc(100vw - 32px)' : '100%', width: isMobile ? 'calc(100vw - 32px)' : '100%', boxSizing: 'border-box' }}>
          {membersLoading ? <p className="rounded-[18px] p-3 text-xs [background:var(--kc-panel)] [color:var(--kc-muted)]">正在加载成员...</p> : null}
          {!membersLoading && filteredMembers.length === 0 ? <p className="rounded-[18px] p-3 text-xs [background:var(--kc-panel)] [color:var(--kc-muted)]">没有找到匹配成员。</p> : null}
          <div className={isMobile ? 'grid min-w-0 gap-2 overflow-hidden' : 'grid min-w-0 gap-1 overflow-hidden'} style={{ overflowX: 'hidden', width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
            {!membersLoading && filteredMembers.map((member) => renderMemberButton(member))}
          </div>
        </div>
      </div>
    );
  }

  function renderDrawerModal(): JSX.Element | null {
    if (!modal) {
      return null;
    }

    return (
      <div className="kc-mobile-overlay absolute inset-0 z-50 grid place-items-center p-4 [background:rgba(15,23,42,0.18)]" onMouseDown={closeDrawerModal}>
        <div onMouseDown={(event) => event.stopPropagation()} className="kc-mobile-dialog kc-mobile-scrollable-dialog w-full max-w-[420px] rounded-[26px] border shadow-float [background:var(--kc-panel)] [border-color:var(--kc-border)] [color:var(--kc-text)]">
          {modal === 'profile' ? (
            <form onSubmit={submitProfile} className="p-5">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold">群资料设置</h3>
                  <p className="mt-1 text-xs [color:var(--kc-muted)]">修改群名称、头像、简介和分类。</p>
                </div>
                <button type="button" onClick={() => setModal(null)} className="kc-icon-button h-8 w-8" aria-label="关闭群资料设置">
                  <Icon name="close" className="h-4 w-4" />
                </button>
              </div>
              <label className="mb-3 block text-sm">
                <span className="mb-1.5 block font-semibold">群名称</span>
                <input value={profileTitle} onChange={(event) => setProfileTitle(event.target.value)} required className="w-full rounded-2xl border px-4 py-3 text-sm outline-none [background:var(--kc-panel-muted)] [border-color:var(--kc-border)] focus:[border-color:var(--kc-accent)]" placeholder="输入群名称" />
              </label>
              <label className="mb-3 block text-sm">
                <span className="mb-1.5 block font-semibold">群简介</span>
                <textarea value={profileDescription} onChange={(event) => setProfileDescription(event.target.value)} rows={3} className="scroll-soft w-full resize-none rounded-2xl border px-4 py-3 text-sm leading-5 outline-none [background:var(--kc-panel-muted)] [border-color:var(--kc-border)] [color:var(--kc-text)] placeholder:[color:var(--kc-muted)] focus:[border-color:var(--kc-accent)]" placeholder="介绍这个群聊" />
              </label>
              <label className="mb-3 block text-sm">
                <span className="mb-1.5 block font-semibold">群分类</span>
                <div className="rounded-2xl border [background:var(--kc-panel-muted)] [border-color:var(--kc-border)]">
                  <DrawerSelectRow label="分类" value={profileCategory} options={groupCategoryOptions} onChange={setProfileCategory} />
                </div>
              </label>
              <div className="rounded-2xl border p-3 [background:var(--kc-panel-muted)] [border-color:var(--kc-border)]">
                <div className="flex items-center gap-3">
                  {resolveAssetUrl(profileAvatarUrl) ? <img src={resolveThumbnailUrl(profileAvatarUrl)} alt={profileTitle || '群头像'} className="h-12 w-12 rounded-2xl border object-cover [border-color:var(--kc-border)]" /> : <div className="grid h-12 w-12 place-items-center rounded-2xl border text-base font-semibold [background:var(--kc-accent-soft)] [border-color:var(--kc-border)] [color:var(--kc-accent)]">{profileTitle.trim().slice(0, 1) || '群'}</div>}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">群头像</p>
                  </div>
                  <input ref={groupAvatarInputRef} type="file" accept="image/*" onChange={chooseGroupAvatar} className="hidden" />
                  <button type="button" disabled={groupAvatarMutation.isPending} onClick={() => groupAvatarInputRef.current?.click()} className="rounded-xl border px-3 py-2 text-xs font-semibold transition [border-color:var(--kc-border)] hover:[background:var(--kc-hover)] disabled:cursor-not-allowed disabled:opacity-45">
                    {groupAvatarMutation.isPending ? '上传中...' : '上传'}
                  </button>
                </div>
                {groupAvatarMutation.error ? <p className="mt-3 text-xs text-red-500">群头像上传失败。</p> : null}
              </div>
              <div className="kc-mobile-actions mt-5 flex justify-end gap-2">
                <button type="button" onClick={() => setModal(null)} className="rounded-2xl px-4 py-2.5 text-sm font-semibold transition hover:[background:var(--kc-hover)]">取消</button>
                <button type="submit" disabled={!profileTitle.trim() || profileMutation.isPending} className="liquid-button rounded-2xl px-5 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-45">保存</button>
              </div>
            </form>
          ) : null}

          {modal === 'invite' ? (
            <div className="p-5">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold">邀请好友</h3>
                  <p className="mt-1 text-xs [color:var(--kc-muted)]">选择尚未在群里的好友。</p>
                </div>
                <button type="button" onClick={() => setModal(null)} className="kc-icon-button h-8 w-8" aria-label="关闭邀请好友">
                  <Icon name="close" className="h-4 w-4" />
                </button>
              </div>
              <div className="scroll-soft max-h-72 overflow-y-auto rounded-2xl border p-2 [background:var(--kc-panel-muted)] [border-color:var(--kc-border)]">
                {availableInviteFriends.length === 0 ? <p className="p-3 text-sm [color:var(--kc-muted)]">暂无可邀请的好友。</p> : null}
                {availableInviteFriends.map((friend) => {
                  const selected = selectedInviteIds.includes(friend.id);
                  return (
                    <button key={friend.id} type="button" onClick={() => toggleInvite(friend.id)} className={`mb-1 flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${selected ? '[background:var(--kc-accent-soft)] [border-color:var(--kc-accent)]' : 'border-transparent hover:[background:var(--kc-hover)]'}`}>
                      <Avatar user={friend} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{getDisplayName(friend, `用户 ${friend.id}`)}</span>
                        <span className="block truncate text-xs [color:var(--kc-muted)]">{friend.email || friend.username}</span>
                      </span>
                      <span className={`grid h-5 w-5 place-items-center rounded-full border text-xs ${selected ? '[background:var(--kc-accent)] [border-color:var(--kc-accent)] text-white' : '[border-color:var(--kc-border)] [color:var(--kc-muted)]'}`}>{selected ? '✓' : ''}</span>
                    </button>
                  );
                })}
              </div>
              <div className="kc-mobile-actions mt-5 flex justify-end gap-2">
                <button type="button" onClick={() => setModal(null)} className="rounded-2xl px-4 py-2.5 text-sm font-semibold transition hover:[background:var(--kc-hover)]">取消</button>
                <button type="button" onClick={submitInvite} disabled={selectedInviteIds.length === 0 || inviteMutation.isPending} className="liquid-button rounded-2xl px-5 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-45">邀请 {selectedInviteIds.length || ''}</button>
              </div>
            </div>
          ) : null}

          {modal === 'remove' ? (
            <div className="p-5">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold">移除成员</h3>
                  <p className="mt-1 text-xs [color:var(--kc-muted)]">选择一名成员移出群聊。</p>
                </div>
                <button type="button" onClick={() => setModal(null)} className="kc-icon-button h-8 w-8" aria-label="关闭移除成员">
                  <Icon name="close" className="h-4 w-4" />
                </button>
              </div>
              <div className="scroll-soft max-h-72 overflow-y-auto rounded-2xl border p-2 [background:var(--kc-panel-muted)] [border-color:var(--kc-border)]">
                {members.filter(canRemoveMember).length === 0 ? <p className="p-3 text-sm [color:var(--kc-muted)]">暂无可移除的成员。</p> : null}
                {members.filter(canRemoveMember).map((member) => {
                  const userId = memberUserId(member);
                  const name = member.nickname?.trim() || getDisplayName(member.user, userId ? `用户 ${userId}` : '成员');
                  return (
                    <div key={member.id} className="kc-mobile-row-wrap mb-1 flex items-center gap-3 rounded-2xl p-3 transition hover:[background:var(--kc-hover)]">
                      <Avatar user={member.user} label={name} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{name}</span>
                        <span className="block truncate text-xs [color:var(--kc-muted)]">{roleLabel(member.role)}</span>
                      </span>
                      <div className="kc-mobile-row-actions shrink-0">
                        <button type="button" onClick={() => removeMember(member)} disabled={removeMutation.isPending} className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-500 transition hover:bg-red-500 hover:text-white disabled:opacity-45">移除</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {modal === 'joinRequests' ? (
            <div className="p-5">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold">入群申请</h3>
                  <p className="mt-1 text-xs [color:var(--kc-muted)]">处理想加入本群的成员申请。</p>
                </div>
                <button type="button" onClick={() => setModal(null)} className="kc-icon-button h-8 w-8" aria-label="关闭入群申请">
                  <Icon name="close" className="h-4 w-4" />
                </button>
              </div>
              <div className="scroll-soft max-h-80 overflow-y-auto rounded-2xl border p-2 [background:var(--kc-panel-muted)] [border-color:var(--kc-border)]">
                {incomingJoinRequestsQuery.isLoading ? <p className="p-3 text-sm [color:var(--kc-muted)]">正在加载入群申请...</p> : null}
                {!incomingJoinRequestsQuery.isLoading && conversationJoinRequests.length === 0 ? <p className="p-3 text-sm [color:var(--kc-muted)]">暂无入群申请。</p> : null}
                {conversationJoinRequests.map((request) => {
                  const name = getDisplayName(request.requester, `用户 ${request.requester_id}`);
                  const pending = request.status === 'pending';
                  return (
                    <div key={request.id} className="mb-1 rounded-2xl border p-3 [background:var(--kc-panel)] [border-color:var(--kc-border)]">
                      <div className="flex items-center gap-3">
                        <Avatar user={request.requester} label={name} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{name}</p>
                          <p className="truncate text-xs [color:var(--kc-muted)]">{pending ? '等待审核' : request.status === 'accepted' ? '已通过' : '已拒绝'}{request.created_at ? ` · ${new Date(request.created_at).toLocaleString('zh-CN')}` : ''}</p>
                          {request.message?.trim() ? <p className="mt-1 text-xs leading-5 [color:var(--kc-muted)]">附言：{request.message}</p> : null}
                          {request.answer?.trim() ? <p className="mt-1 rounded-xl border px-3 py-2 text-xs leading-5 [background:var(--kc-panel-muted)] [border-color:var(--kc-border)]"><span className="font-semibold [color:var(--kc-accent)]">回答：</span>{request.answer}</p> : null}
                        </div>
                      </div>
                      {pending ? (
                         <div className="kc-mobile-actions mt-3 flex justify-end gap-2">
                          <button type="button" onClick={() => handleJoinRequestReview(request, false)} disabled={rejectJoinRequestMutation.isPending || acceptJoinRequestMutation.isPending} className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-500 transition hover:bg-red-500 hover:text-white disabled:opacity-45">拒绝</button>
                          <button type="button" onClick={() => handleJoinRequestReview(request, true)} disabled={acceptJoinRequestMutation.isPending || rejectJoinRequestMutation.isPending} className="liquid-button rounded-xl px-3 py-2 text-xs font-semibold disabled:opacity-45">通过</button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {modal === 'leaderboard' ? (
            <div className="p-5">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold">群活跃榜</h3>
                  <p className="mt-1 text-xs [color:var(--kc-muted)]">签到、发言和等级都会计入群成长。</p>
                </div>
                <button type="button" onClick={() => setModal(null)} className="kc-icon-button h-8 w-8" aria-label="关闭群活跃榜">
                  <Icon name="close" className="h-4 w-4" />
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border [background:var(--kc-panel-muted)] [border-color:var(--kc-border)]">
                  <DrawerSelectRow label="榜单" value={leaderboardType} options={leaderboardTypeOptions} onChange={setLeaderboardType} />
                </div>
                <div className="rounded-2xl border [background:var(--kc-panel-muted)] [border-color:var(--kc-border)]">
                  <DrawerSelectRow label="周期" value={leaderboardPeriod} options={leaderboardPeriodOptions} onChange={setLeaderboardPeriod} />
                </div>
              </div>
              <div className="scroll-soft mt-4 max-h-80 overflow-y-auto rounded-2xl border p-2 [background:var(--kc-panel-muted)] [border-color:var(--kc-border)]">
                {leaderboardQuery.isLoading ? <p className="p-3 text-sm [color:var(--kc-muted)]">正在加载榜单...</p> : null}
                {leaderboardQuery.error ? <p className="p-3 text-sm text-red-500">榜单加载失败，请稍后重试。</p> : null}
                {!leaderboardQuery.isLoading && !leaderboardQuery.error && (leaderboardQuery.data?.items.length ?? 0) === 0 ? <p className="p-3 text-sm [color:var(--kc-muted)]">暂无榜单数据。</p> : null}
                {(leaderboardQuery.data?.items ?? []).map((item) => {
                  const name = item.member.nickname?.trim() || getDisplayName(item.user, `用户 ${item.user_id}`);
                  return (
                    <div key={`${item.rank}-${item.user_id}`} className="mb-1 flex items-center gap-3 rounded-2xl border p-3 [background:var(--kc-panel)] [border-color:var(--kc-border)]">
                      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-black ${item.rank <= 3 ? '[background:var(--kc-accent-soft)] [color:var(--kc-accent)]' : '[background:var(--kc-panel-muted)] [color:var(--kc-muted)]'}`}>{item.rank}</span>
                      <Avatar user={item.user} label={name} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{name}</span>
                        <span className="mt-1 block truncate text-xs [color:var(--kc-muted)]">Lv.{item.level} · 活跃 {item.activity_score} · 连签 {item.current_checkin_streak} 天</span>
                      </span>
                      <span className="shrink-0 rounded-full px-2.5 py-1 text-xs font-bold [background:var(--kc-accent-soft)] [color:var(--kc-accent)]">{leaderboardType === 'message' ? `${item.message_count}条` : leaderboardType === 'checkin_total' ? `${item.total_checkins}天` : leaderboardType === 'checkin_streak' ? `${item.current_checkin_streak}天` : leaderboardType === 'level' ? `${item.level_exp}经验` : item.activity_score}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {modal === 'shareActions' ? (
            <div className="p-5">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold">分享群聊</h3>
                  <p className="mt-1 text-xs [color:var(--kc-muted)]">转发群名片到联系人或群聊，也可以复制邀请链接。</p>
                </div>
                <button type="button" onClick={() => setModal(null)} className="kc-icon-button h-8 w-8" aria-label="关闭分享">
                  <Icon name="close" className="h-4 w-4" />
                </button>
              </div>
              <div className="grid gap-2">
                <button type="button" onClick={() => openShareForwardModal('group')} className="flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition hover:[background:var(--kc-hover)] [border-color:var(--kc-border)]">
                  <span className="grid h-10 w-10 place-items-center rounded-2xl [background:var(--kc-accent-soft)] [color:var(--kc-accent)]"><Icon name="send" className="h-5 w-5" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">转发群聊名片</span>
                    <span className="mt-0.5 block text-xs [color:var(--kc-muted)]">选择一个群或联系人发送可加入卡片。</span>
                  </span>
                </button>
                <button type="button" onClick={copyGroupInviteLink} className="flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition hover:[background:var(--kc-hover)] [border-color:var(--kc-border)]">
                  <span className="grid h-10 w-10 place-items-center rounded-2xl [background:var(--kc-panel-muted)] [color:var(--kc-muted)]"><Icon name="copy" className="h-5 w-5" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">复制链接</span>
                    <span className="mt-0.5 block text-xs [color:var(--kc-muted)]">复制群邀请链接，发到任意地方。</span>
                  </span>
                </button>
              </div>
            </div>
          ) : null}

          {modal === 'shareForward' ? (
            <div className="p-5">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold">{shareForwardKind === 'user' ? '发送个人名片' : '转发群聊名片'}</h3>
                  <p className="mt-1 text-xs [color:var(--kc-muted)]">选择一个联系人或群聊发送。</p>
                </div>
                <button type="button" onClick={() => setModal(null)} className="kc-icon-button h-8 w-8" aria-label="关闭转发群名片">
                  <Icon name="close" className="h-4 w-4" />
                </button>
              </div>
              <label className="mb-3 flex h-10 items-center gap-2 rounded-2xl border px-3 [background:var(--kc-panel-muted)] [border-color:var(--kc-border)] focus-within:[border-color:var(--kc-accent)]">
                <Icon name="search" className="h-4 w-4 shrink-0 [color:var(--kc-muted)]" />
                <input value={shareTargetQuery} onChange={(event) => setShareTargetQuery(event.target.value)} placeholder="搜索会话" className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none [color:var(--kc-text)] placeholder:[color:var(--kc-muted)]" autoFocus />
              </label>
              <div className="scroll-soft max-h-64 overflow-y-auto rounded-2xl border p-2 [background:var(--kc-panel-muted)] [border-color:var(--kc-border)]">
                {shareTargetConversations.length === 0 ? <p className="p-3 text-sm [color:var(--kc-muted)]">没有找到可发送的会话。</p> : null}
                {shareTargetConversations.map((targetConversation) => {
                  const title = conversationDisplayTitle(targetConversation, currentUser);
                  const selected = targetConversation.id === selectedShareTargetId;
                  return (
                    <button key={targetConversation.id} type="button" onClick={() => setSelectedShareTargetId(targetConversation.id)} className={`mb-1 flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${selected ? '[background:var(--kc-accent-soft)] [border-color:var(--kc-accent)]' : 'border-transparent hover:[background:var(--kc-hover)]'}`}>
                      <ConversationTargetAvatar conversation={targetConversation} currentUser={currentUser} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{title}</span>
                        <span className="block truncate text-xs [color:var(--kc-muted)]">{targetConversation.type === 'group' ? `群聊 · ${targetConversation.member_count ?? 0} 人` : '联系人'}</span>
                      </span>
                      {selected ? <Icon name="check" className="h-4 w-4 shrink-0 [color:var(--kc-accent)]" /> : null}
                    </button>
                  );
                })}
              </div>
              <textarea value={shareNote} onChange={(event) => setShareNote(event.target.value)} maxLength={120} rows={3} placeholder="可选，添加一句附言" className="scroll-soft mt-3 w-full resize-none rounded-2xl border bg-transparent p-3 text-sm outline-none [border-color:var(--kc-border)] [color:var(--kc-text)] placeholder:[color:var(--kc-muted)] focus:[border-color:var(--kc-accent)]" />
              <div className="mt-4 rounded-2xl border p-3 [background:var(--kc-panel-muted)] [border-color:var(--kc-border)]">
                <p className="text-xs font-semibold [color:var(--kc-muted)]">发送给</p>
                <p className="mt-1 truncate text-sm font-semibold">{selectedShareTarget ? conversationDisplayTitle(selectedShareTarget, currentUser) : '请选择会话'}</p>
              </div>
              <div className="kc-mobile-actions mt-5 flex justify-end gap-2">
                <button type="button" onClick={() => shareForwardKind === 'group' ? setModal('shareActions') : setModal(null)} className="rounded-2xl px-4 py-2.5 text-sm font-semibold transition hover:[background:var(--kc-hover)]">{shareForwardKind === 'group' ? '返回' : '取消'}</button>
                <button type="button" onClick={submitShareForward} disabled={!selectedShareTargetId || shareForwardMutation.isPending} className="liquid-button rounded-2xl px-5 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-45">{shareForwardMutation.isPending ? '发送中...' : '发送'}</button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  const memberMenuPosition = memberMenu ? clampOverlayPosition(memberMenu, MEMBER_MENU_WIDTH, MEMBER_MENU_HEIGHT, overlayRootRef.current) : null;

  if (isMobile) {
    return (
      <div ref={overlayRootRef} className="absolute inset-0 z-30 overflow-hidden kc-qq-page kc-qq-details-page [color:var(--kc-text)]">
        <MobileStatusBar />
        <div className="relative grid h-[calc(100%-30px)] min-w-0 grid-rows-[52px_minmax(0,1fr)_auto] overflow-hidden">
          <header className="kc-qq-nav-header px-4">
            <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full [color:var(--kc-text)]" aria-label="返回聊天">
              <Icon name="chevronLeft" className="h-6 w-6" />
            </button>
            <h2 className="text-[18px] font-bold">{isGroup ? '群聊资料' : '聊天资料'}</h2>
            <button type="button" onClick={shareConversation} className="grid h-9 w-9 place-items-center rounded-full text-[#168bff]" aria-label="分享聊天">
              <Icon name="send" className="h-5 w-5" />
            </button>
          </header>

          <div className="kc-qq-scroll scroll-soft min-h-0 min-w-0 overflow-y-auto overflow-x-hidden px-4 pb-5">
            <section className="kc-qq-details-hero">
              <div className="w-fit shrink-0 [&>*]:h-[68px] [&>*]:w-[68px] [&>*]:rounded-[22px] [&>*]:text-2xl">
                {renderConversationAvatar()}
              </div>
              <div className="min-w-0 flex-1 text-left">
                <h3 className="truncate text-[22px] font-bold [color:var(--kc-text)]">{conversationDisplayTitle(conversation, currentUser)}</h3>
                <p className="mt-1 text-[13px] font-medium [color:var(--kc-muted)]">{isGroup ? `群号 ${conversation.id} · ${memberCount} 名成员` : `账号 ${directUser?.id ?? conversation.id}`}</p>
                {isGroup && conversation.description?.trim() ? <p className="mt-2 line-clamp-2 text-[13px] leading-5 [color:var(--kc-muted)]">{conversation.description}</p> : null}
                {!isGroup ? <p className="mt-2 line-clamp-2 text-[13px] leading-5 [color:var(--kc-muted)]">{directUser?.bio?.trim() || '咕咕咕~'}</p> : null}
              </div>
            </section>

            {isGroup ? renderMobileCheckinCard() : null}

            {isGroup ? renderMobileBotsCard() : null}

            {isGroup ? (
              <section className="mt-4">
                <button type="button" onClick={openMembersView} className="kc-qq-mobile-member-card kc-qq-card flex w-full items-center gap-3 p-3 text-left transition active:scale-[0.99]">
                  <div className="flex -space-x-2">
                    {membersLoading ? (
                      <span className="grid h-9 w-9 place-items-center rounded-full border [background:var(--kc-panel-muted)] [border-color:var(--kc-border)] [color:var(--kc-muted)]"><Icon name="users" className="h-4 w-4" /></span>
                    ) : sortedMembers.slice(0, 4).map((member) => {
                      const userId = memberUserId(member);
                      const name = member.nickname?.trim() || getDisplayName(member.user, userId ? `用户 ${userId}` : '成员');
                      return <span key={member.id} className="rounded-full border-2 [border-color:var(--kc-panel)] [&>*]:h-9 [&>*]:w-9"><Avatar user={member.user} label={name} size="sm" /></span>;
                    })}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-bold [color:var(--kc-text)]">群成员</p>
                    <p className="mt-0.5 truncate text-[12px] font-medium [color:var(--kc-muted)]">查看 {memberCount} 名群成员详情，支持搜索</p>
                  </div>
                  <Icon name="chevron" className="h-4 w-4 shrink-0 [color:var(--kc-muted)]" />
                </button>
              </section>
            ) : null}

            <section className="mt-5">
              <p className="kc-qq-section-title">资料</p>
              <div className="kc-qq-card overflow-hidden p-0">
                {isGroup && canManageGroup ? <DrawerRow label="群资料设置" value={conversation.category?.trim() || '未设置'} icon={<Icon name="settings" className="h-4 w-4" />} onClick={() => openDrawerModal('profile')} /> : null}
                {isGroup ? null : <DrawerRow label="聊天资料" value={directUser?.bio?.trim() || '暂无'} icon={<Icon name="profile" className="h-4 w-4" />} onClick={undefined} />}
                {canManageGroup ? <DrawerRow label="入群申请" value={pendingConversationJoinRequests.length > 0 ? `${pendingConversationJoinRequests.length}条待处理` : '暂无'} icon={<Icon name="bell" className="h-4 w-4" />} onClick={() => openDrawerModal('joinRequests')} /> : null}
                <DrawerRow label={isGroup ? '分享群聊' : '发送名片'} value={isGroup && copied ? '已复制' : undefined} icon={<Icon name="send" className="h-4 w-4" />} onClick={shareConversation} />
              </div>
            </section>

            {isGroup ? (
              <section className="mt-5">
                <p className="kc-qq-section-title">我的群聊设置</p>
                <DrawerCard allowOverflow>
                  <label className="kc-drawer-input-row flex items-center gap-3 px-4 py-3 text-sm">
                    <span className="min-w-0 flex-1">我的本群昵称</span>
                    <input value={groupNickname} onChange={(event) => setGroupNickname(event.target.value)} onBlur={saveNickname} placeholder="未设置" className="w-36 rounded-xl border px-3 py-1.5 text-right text-xs outline-none [background:var(--kc-panel-muted)] [border-color:var(--kc-border)] [color:var(--kc-text)] placeholder:[color:var(--kc-muted)] focus:[border-color:var(--kc-accent)]" />
                  </label>
                  <label className="kc-drawer-input-row flex items-center gap-3 px-4 py-3 text-sm">
                    <span className="min-w-0 flex-1">群聊备注</span>
                    <input value={groupRemark} onChange={(event) => setGroupRemark(event.target.value)} onBlur={saveRemark} placeholder="未设置" className="w-36 rounded-xl border px-3 py-1.5 text-right text-xs outline-none [background:var(--kc-panel-muted)] [border-color:var(--kc-border)] [color:var(--kc-text)] placeholder:[color:var(--kc-muted)] focus:[border-color:var(--kc-accent)]" />
                  </label>
                  <ToggleRow label="设为置顶" checked={pinned} disabled={mySettingsMutation.isPending} onChange={updatePinnedValue} />
                  <ToggleRow label="消息免打扰" checked={doNotDisturb} disabled={mySettingsMutation.isPending} onChange={updateDoNotDisturbValue} />
                </DrawerCard>
              </section>
            ) : (
              <section className="mt-5">
                <p className="kc-qq-section-title">聊天设置</p>
                <DrawerCard allowOverflow>
                  <ToggleRow label="设为置顶" checked={pinned} disabled={mySettingsMutation.isPending} onChange={updatePinnedValue} />
                  <ToggleRow label="消息免打扰" checked={doNotDisturb} disabled={mySettingsMutation.isPending} onChange={updateDoNotDisturbValue} />
                </DrawerCard>
              </section>
            )}

            {canManageGroup ? (
              <section className="mt-5">
                <p className="kc-qq-section-title">管理</p>
                <DrawerCard allowOverflow>
                  <ToggleRow label="全员禁言" checked={allMuted} disabled={groupSettingsMutation.isPending} onChange={updateAllMutedValue} />
                  <DrawerSelectRow label="发言限频" value={String(messageRateLimitPerMinute)} options={slowModeOptions} disabled={groupSettingsMutation.isPending} icon={<Icon name="clock" className="h-4 w-4" />} onChange={updateSlowModeValue} />
                  <DrawerSelectRow label="加群方式" value={joinMode} options={joinModeOptions} disabled={groupSettingsMutation.isPending} icon={<Icon name="users" className="h-4 w-4" />} onChange={updateJoinModeValue} />
                  <ToggleRow label="开启任务功能" checked={tasksEnabled} disabled={groupSettingsMutation.isPending} onChange={updateTasksEnabledValue} />
                  {tasksEnabled ? (
                    <DrawerSelectRow label="谁可以创建任务" value={taskCreationPermission} options={[{ value: 'members', label: '全部成员' }, { value: 'admins', label: '仅管理员' }]} disabled={groupSettingsMutation.isPending} icon={<Icon name="checkSquare" className="h-4 w-4" />} onChange={updateTaskPermissionValue} />
                  ) : null}
                </DrawerCard>
                {isGroupOwner ? (
                  <>
                    <p className="kc-qq-section-title mt-5">游戏模式</p>
                    <DrawerCard allowOverflow>
                      <label className="kc-drawer-input-row flex items-center gap-3 px-4 py-3 text-sm">
                        <span className="min-w-0 flex-1">绑定作品 ID</span>
                        <input
                          value={gameCreationOid}
                          onChange={(event) => setGameCreationOid(event.target.value)}
                          onBlur={saveGameCreationOid}
                          disabled={gameModeMutation.isPending}
                          placeholder="粘贴作品链接或 ID"
                          className="w-40 rounded-xl border px-3 py-1.5 text-right text-xs outline-none [background:var(--kc-panel-muted)] [border-color:var(--kc-border)] [color:var(--kc-text)] placeholder:[color:var(--kc-muted)] focus:[border-color:var(--kc-accent)] disabled:cursor-not-allowed disabled:opacity-50"
                        />
                      </label>
                      <ToggleRow label="开启游戏模式" checked={gameModeEnabled} disabled={gameModeMutation.isPending || gameModeQuery.isLoading} onChange={toggleGameMode} />
                    </DrawerCard>
                    <p className="mt-2 px-1 text-[11px] leading-5 [color:var(--kc-muted)]">
                      开启后，绑定作品里的玩家可以直接收发本群消息。<strong className="[color:var(--kc-text)]">本群近期聊天记录会对所有游玩该作品的人可见，包括未登录访客</strong>，因此仅公开群可以开启。
                    </p>
                    {gameModeError ? <p className="mt-1 px-1 text-[11px] leading-5 text-red-500">{gameModeError}</p> : null}
                  </>
                ) : null}
              </section>
            ) : null}

            <div className="mt-5 grid gap-3">
              <button type="button" disabled={clearMutation.isPending} onClick={clearHistory} className="w-full rounded-[18px] px-4 py-3 text-[15px] font-semibold [background:var(--kc-panel)] [color:var(--kc-text)]">删除聊天记录</button>
              {isGroup ? (
                <>
                  <button type="button" disabled={conversationReportMutation.isPending} onClick={reportConversation} className="w-full rounded-[18px] px-4 py-3 text-[15px] font-semibold text-red-500 [background:var(--kc-panel)]">举报群聊</button>
                  {currentRole === 'owner' ? <button type="button" disabled={dissolveMutation.isPending} onClick={dissolveGroup} className="w-full rounded-[18px] px-4 py-3 text-[15px] font-semibold text-red-500 [background:var(--kc-panel)]">解散群聊</button> : <button type="button" disabled={leaveMutation.isPending} onClick={leaveGroup} className="w-full rounded-[18px] px-4 py-3 text-[15px] font-semibold text-red-500 [background:var(--kc-panel)]">退出群聊</button>}
                </>
              ) : isDirectFriend ? <button type="button" disabled={deleteFriendMutation.isPending} onClick={deleteDirectFriend} className="w-full rounded-[18px] px-4 py-3 text-[15px] font-semibold text-red-500 [background:var(--kc-panel)]">删除好友</button> : null}
            </div>
            {errorText ? <p className="mt-4 rounded-[18px] bg-red-50 px-4 py-3 text-[13px] text-red-500">{errorText}</p> : null}
          </div>

          {view === 'members' ? (
            <div className="kc-qq-member-list-overlay absolute inset-0 z-40 h-full w-full min-w-0 max-w-full overflow-hidden [background:var(--kc-mobile-bg,var(--kc-list))]">
              {renderMemberList()}
            </div>
          ) : null}
        </div>

        {renderDrawerModal()}
        {userCard ? <UserCard user={userCard.user} label={userCard.label} anchor={userCard.anchor} containerRef={overlayRootRef} action={profileActionForUser(userCard.user)} onClose={() => setUserCard(null)} /> : null}
        {mobileUserProfile ? <MobileUserProfilePage user={mobileUserProfile.user} label={mobileUserProfile.label} fallbackUserId={mobileUserProfile.fallbackUserId} currentUserId={currentUser.id} currentUser={currentUser} action={profileActionForUser(mobileUserProfile.user)} groupContext={mobileUserProfile.member ? { conversationId: conversation.id, member: mobileUserProfile.member, currentRole, onMemberUpdated: (member) => setMobileUserProfile((current) => current ? { ...current, member } : current) } : undefined} onClose={() => { setMobileProfileMenuOpen(false); setMobileUserProfile(null); }} /> : null}
        {showAnnouncements && isGroup ? <AnnouncementModal conversation={conversation} canPublish={canManageGroup} onClose={() => setShowAnnouncements(false)} /> : null}
      </div>
    );
  }

  return (
    <div ref={overlayRootRef} className="absolute inset-0 z-30 flex justify-end overflow-hidden">
      <button type="button" aria-label="关闭聊天资料抽屉" onClick={onClose} className="kc-pc-drawer-backdrop absolute inset-0 cursor-default [background:rgba(15,23,42,0.10)]" />
      <aside className="kc-mobile-drawer relative z-10 flex h-full w-[350px] max-w-full min-w-0 flex-col overflow-x-hidden border-l shadow-float [background:var(--kc-list)] [border-color:var(--kc-border)] [color:var(--kc-text)] max-sm:w-full" style={{ overflowX: 'hidden', maxWidth: '100%' }}>
        {view === 'main' ? (
          <header className="flex h-12 shrink-0 items-center justify-between border-b px-4 [background:var(--kc-panel)] [border-color:var(--kc-border)]">
            <h2 className="text-sm font-semibold">{isGroup ? '群聊资料' : '聊天资料'}</h2>
            <button type="button" onClick={onClose} className="kc-icon-button h-8 w-8" aria-label="关闭聊天资料">
              <Icon name="close" className="h-4 w-4" />
            </button>
          </header>
        ) : null}

        {errorText ? <p className="mx-4 mt-3 rounded-2xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-500">{errorText}</p> : null}
        {view === 'members' ? renderMemberList() : isGroup ? renderGroupMain() : renderDirectMain()}
      </aside>

      {renderDrawerModal()}

      {memberMenu && memberMenuPosition ? (
        <div className="absolute inset-0 z-50" onMouseDown={() => setMemberMenu(null)}>
          <div onMouseDown={(event) => event.stopPropagation()} style={memberMenuPosition} className="absolute w-40 overflow-hidden rounded-2xl border py-1 text-xs shadow-float [background:var(--kc-panel)] [border-color:var(--kc-border)] [color:var(--kc-text)]">
            {!isFriendUser(memberUserId(memberMenu.member)) && !isPendingFriendRequest(memberUserId(memberMenu.member)) ? (
              <button type="button" onClick={() => requestFriendFromMember(memberMenu.member)} disabled={!canSendFriendRequest(memberUserId(memberMenu.member))} className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:[background:var(--kc-hover)] disabled:opacity-45">
                <Icon name="plus" className="h-4 w-4" />
                添加好友
              </button>
            ) : null}
            {canChangeMemberRole(memberMenu.member) ? (
              <button type="button" onClick={() => {
                const userId = memberUserId(memberMenu.member);
                if (userId) {
                  toggleMemberAdmin(memberMenu.member);
                }
                setMemberMenu(null);
              }} disabled={roleMutation.isPending} className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:[background:var(--kc-hover)] disabled:opacity-45">
                <Icon name={memberMenu.member.role === 'admin' ? 'shield' : 'shieldCheck'} className="h-4 w-4" />
                {memberMenu.member.role === 'admin' ? '取消管理员' : '设为管理员'}
              </button>
            ) : null}
            {canToggleMute(memberMenu.member) ? (
              <button type="button" onClick={() => {
                const userId = memberUserId(memberMenu.member);
                if (userId) {
                  toggleMemberMute(memberMenu.member);
                }
                setMemberMenu(null);
              }} disabled={muteMutation.isPending} className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:[background:var(--kc-hover)] disabled:opacity-45">
                <Icon name={memberMuted(memberMenu.member) ? 'volume' : 'muted'} className="h-4 w-4" />
                {memberMuted(memberMenu.member) ? '解除禁言' : '禁言成员'}
              </button>
            ) : null}
            {canSetMemberTitle(memberMenu.member) ? (
              <button type="button" onClick={() => setMemberCustomTitle(memberMenu.member)} disabled={titleMutation.isPending} className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:[background:var(--kc-hover)] disabled:opacity-45">
                <Icon name="star" className="h-4 w-4" />
                设置头衔
              </button>
            ) : null}
            {canRemoveMember(memberMenu.member) ? (
              <button type="button" onClick={() => removeMember(memberMenu.member)} disabled={removeMutation.isPending} className="flex w-full items-center gap-2 px-3 py-2 text-left text-red-500 transition hover:bg-red-500/10 disabled:opacity-45">
                <Icon name="trash" className="h-4 w-4" />
                移出群聊
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {userCard ? <UserCard user={userCard.user} label={userCard.label} anchor={userCard.anchor} containerRef={overlayRootRef} action={profileActionForUser(userCard.user)} onClose={() => setUserCard(null)} /> : null}
      {showAnnouncements && isGroup ? <AnnouncementModal conversation={conversation} canPublish={canManageGroup} onClose={() => setShowAnnouncements(false)} /> : null}
    </div>
  );
}
