import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { getConversationMembers, getConversationMembersPage, getConversations } from '@/api/conversations';
import { getFriends } from '@/api/friends';
import { getAllBookmarkedMessages } from '@/api/messages';
import { getTasks } from '@/api/tasks';
import { getLatestAnnouncement } from '@/api/announcements';
import { getTrendingPostTopics } from '@/api/posts';
import { AnnouncementModal } from '@/components/announcements/AnnouncementModal';
import { subscribeRealtimeEvents } from '@/realtime/events';
import { logoutCookieSession, setRememberIpLogin } from '@/api/auth';
import { useKukeStore, type WorkspaceView } from '@/store/kukeStore';
import type { Bot, Conversation, ConversationMember, MemberRole, Message, User } from '@/types/api';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { ConversationList } from './ConversationList';
import { FavoritesPanel, ForwardBundleDetailModal, MessagePanel } from './MessagePanel';
import { ContactsPanel } from '@/components/contacts/ContactsPanel';
import { SettingsPanel } from '@/components/settings/SettingsPanel';
import { CcwBindingPromptModal } from '@/components/settings/CcwBindingPromptModal';
import { PostsPanel } from '@/components/posts/PostsPanel';
import { BotCenterPanel } from '@/components/bots/BotCenterPanel';
import { TeamupCenterPanel } from '@/components/teamup/TeamupCenterPanel';
import { TaskCenterPanel } from '@/components/tasks/TaskCenterPanel';
import { HomePanel } from '@/components/home/HomePanel';
import { getMobileBottomFeatureIds, getMobileFeatureDefinition, type MobileFeatureId } from '@/mobile/features';
import { BotDetailPanel } from '@/components/bots/BotDetailPanel';
import { BotEditorPage } from '@/components/bots/BotEditorPage';
import { CreateGroupModal } from '@/components/groups/CreateGroupModal';
import { RecommendedGroupJoinModal } from '@/components/groups/RecommendedGroupJoinModal';
import { RecommendedFriendModal } from '@/components/friends/RecommendedFriendModal';
import { InviteModal } from '@/components/invites/InviteModal';
import { GlobalSearchModal } from '@/components/search/GlobalSearchModal';
import { MobilePostDetailPage } from '@/components/posts/MobilePostDetailPage';
import { MobileUserProfilePage } from '@/components/ui/MobileUserProfilePage';
import { registerNativeBackHandler } from '@/native/back';
import { addNativeOpenConversationListener } from '@/native/notifications';
import { clearNativeSession } from '@/native/session';
import { stopNativeBackgroundRealtime, updateNativeBackgroundRealtimeConversations } from '@/native/backgroundRealtime';
import { runNativeRouteTransition, type NativeRouteDirection } from '@/native/transition';
import { isNativeMobileApp } from '@/utils/appMode';
import { isConversationBlocked, isConversationMuted } from '@/utils/notifications';
import { userPresenceLabel } from '@/utils/presence';

type MobileSharedSecondaryPage = { type: 'post'; postId: number } | { type: 'user'; user: User | null | undefined; fallbackId: number } | { type: 'onlineUsers'; users: User[]; onlineCount: number } | { type: 'bots' } | { type: 'home' } | { type: 'bot'; botId: number } | { type: 'botEditor'; mode: 'create' | 'edit'; bot?: Bot } | { type: 'conversation'; conversationId: number } | { type: 'announcement' } | { type: 'teamup' } | { type: 'tasks' } | { type: 'favorites' };

function getSharedSecondaryKey(page: MobileSharedSecondaryPage): string {
  if (page.type === 'post') {
    return `post-${page.postId}`;
  }
  if (page.type === 'user') {
    return `user-${page.fallbackId}`;
  }
  if (page.type === 'onlineUsers') {
    return 'online-users';
  }
  if (page.type === 'bot') {
    return `bot-${page.botId}`;
  }
  if (page.type === 'botEditor') {
    return `bot-editor-${page.mode}-${page.bot?.id ?? 'new'}`;
  }
  if (page.type === 'conversation') {
    return `conversation-${page.conversationId}`;
  }
  if (page.type === 'announcement' || page.type === 'teamup' || page.type === 'tasks' || page.type === 'favorites' || page.type === 'home') {
    return page.type;
  }
  return 'bots';
}

function getSharedSecondaryTransitionStyle(key: string, isTop: boolean, closingKey: string | null): CSSProperties | undefined {
  if (closingKey) {
    return key === closingKey ? { viewTransitionName: 'kc-mobile-route' } : undefined;
  }
  return isTop ? { viewTransitionName: 'kc-mobile-route' } : undefined;
}

function getKukePortalRoot(): Element {
  const host = document.getElementById('kukechat-shadow-host');
  return host?.shadowRoot?.querySelector('.kc-window-frame:not(.kc-window-minimized)') ?? document.querySelector('.kc-window-frame:not(.kc-window-minimized)') ?? host?.shadowRoot?.getElementById('kukechat-root') ?? document.getElementById('kukechat-root') ?? document.body;
}

interface ChatDashboardProps {
  currentUser: User;
}

interface NavItem {
  view: WorkspaceView;
  label: string;
  icon: IconName;
}

interface RailRipple {
  id: number;
  x: number;
  y: number;
}

const navItems: NavItem[] = [
  { view: 'chat', label: '聊天', icon: 'message' },
  { view: 'teamup', label: '组队中心', icon: 'users' },
  { view: 'posts', label: '动态', icon: 'feed' },
  { view: 'contacts', label: '联系人', icon: 'contacts' },
  { view: 'bots', label: '机器人', icon: 'bot' },
  { view: 'home', label: '主页', icon: 'home' }
];

const mobileFixedChatTab = { key: 'messages', label: '聊天', icon: 'message' as IconName, view: 'chat' as WorkspaceView };

const MEMBER_PAGE_SIZE = 20;
const MOBILE_TAB_SWIPE_THRESHOLD = 56;
const SETTINGS_RAIL_GESTURE_SETTLE_MS = 420;
const SETTINGS_RAIL_PROGRAMMATIC_TRANSITION_MS = 460;
const MOBILE_BOTTOM_NAV_TRANSITION_MS = 360;
const CCW_BINDING_PROMPT_STORAGE_PREFIX = 'kukechat:ccw-binding-prompt:v1:';

const mobileRouteOrder: Record<string, number> = {
  settings: -1,
  'chat:list': 0,
  contacts: 1,
  posts: 2,
  space: 3,
  favorites: 3,
  teamup: 3,
  tasks: 3,
  bots: 3,
  'chat:chat': 3
};

function routeShowsMobileBottomNav(route: string): boolean {
  return route !== 'settings' && route !== 'chat:chat';
}

function ccwBindingPromptKey(userId: number): string {
  return `${CCW_BINDING_PROMPT_STORAGE_PREFIX}${userId}`;
}

function hasSeenCcwBindingPrompt(userId: number): boolean {
  if (typeof window === 'undefined') {
    return true;
  }
  try {
    return window.localStorage.getItem(ccwBindingPromptKey(userId)) === 'seen';
  } catch {
    return true;
  }
}

function markCcwBindingPromptSeen(userId: number): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(ccwBindingPromptKey(userId), 'seen');
  } catch {
    // Ignore storage failures; the prompt should not block chat usage.
  }
}

function routeUsesSettingsRail(route: string): boolean {
  return route === 'chat:list' || route === 'settings';
}

function MobileNavBackdropSnapshot({ snapshotKey }: { snapshotKey: string }): JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    const shell = host?.closest('.kc-mobile-shell') as HTMLElement | null;
    const viewport = shell?.querySelector('.kc-native-route-viewport, .kc-ios-route-viewport') as HTMLElement | null;
    const source = (viewport?.querySelector('.kc-native-route-page, .kc-ios-route-page') ?? viewport) as HTMLElement | null;
    if (!host || !source || source.contains(host)) {
      return undefined;
    }

    const hostElement = host;
    const sourceElement = source;
    const clone = sourceElement.cloneNode(true) as HTMLElement;
    clone.classList.add('kc-mobile-glass-nav-clone-node');
    clone.setAttribute('aria-hidden', 'true');
    hostElement.replaceChildren(clone);

    let frame = 0;
    const sourceScrollers = [sourceElement, ...Array.from(sourceElement.querySelectorAll<HTMLElement>('.scroll-soft, .kc-qq-scroll, .kc-native-list-scroll'))];
    const cloneScrollers = [clone, ...Array.from(clone.querySelectorAll<HTMLElement>('.scroll-soft, .kc-qq-scroll, .kc-native-list-scroll'))];

    function syncSnapshot(): void {
      const sourceRect = sourceElement.getBoundingClientRect();
      const hostRect = hostElement.getBoundingClientRect();
      clone.style.width = `${sourceRect.width}px`;
      clone.style.height = `${sourceRect.height}px`;
      clone.style.transform = `translate3d(${sourceRect.left - hostRect.left}px, ${sourceRect.top - hostRect.top}px, 0)`;
      sourceScrollers.forEach((scroller, index) => {
        const cloneScroller = cloneScrollers[index];
        if (!cloneScroller) {
          return;
        }
        cloneScroller.scrollTop = scroller.scrollTop;
        cloneScroller.scrollLeft = scroller.scrollLeft;
      });
    }

    function scheduleSync(): void {
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        syncSnapshot();
      });
    }

    syncSnapshot();
    window.addEventListener('resize', scheduleSync);
    sourceScrollers.forEach((scroller) => scroller.addEventListener('scroll', scheduleSync, { passive: true }));
    return () => {
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
      window.removeEventListener('resize', scheduleSync);
      sourceScrollers.forEach((scroller) => scroller.removeEventListener('scroll', scheduleSync));
      hostElement.replaceChildren();
    };
  }, [snapshotKey]);

  return <span ref={hostRef} className="kc-mobile-glass-nav-clone" aria-hidden="true" />;
}

function memberUserId(member: ConversationMember): number | null {
  return member.user_id ?? member.user?.id ?? null;
}

export function ChatDashboard({ currentUser }: ChatDashboardProps): JSX.Element {
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [globalSearchKeyword, setGlobalSearchKeyword] = useState<string | null>(null);
  const [forwardDetailMessage, setForwardDetailMessage] = useState<Message | null>(null);
  const [railRipples, setRailRipples] = useState<Record<string, RailRipple | null>>({});
  const [mobilePage, setMobilePage] = useState<'list' | 'chat'>('list');
  const [contactsMobileDetailActive, setContactsMobileDetailActive] = useState(false);
  const [mobileTransitionClass, setMobileTransitionClass] = useState('kc-ios-slide-from-right');
  const [useNativeCssTransition, setUseNativeCssTransition] = useState(false);
  const [mobileSettingsDragProgress, setMobileSettingsDragProgress] = useState(0);
  const [settingsRailDragging, setSettingsRailDragging] = useState(false);
  const [settingsRailAnimating, setSettingsRailAnimating] = useState(false);
  const [settingsRailProgrammaticOpen, setSettingsRailProgrammaticOpen] = useState(false);
  const [mobileBottomNavTransitioning, setMobileBottomNavTransitioning] = useState(false);
  const [mobileBottomNavExitSnapshotVisible, setMobileBottomNavExitSnapshotVisible] = useState(false);
  const [mobileBottomNavExitSnapshotId, setMobileBottomNavExitSnapshotId] = useState(0);
  const [mobileBottomNavExitSnapshotIndex, setMobileBottomNavExitSnapshotIndex] = useState(0);
  const [mobileBottomNavExitSnapshotView, setMobileBottomNavExitSnapshotView] = useState<WorkspaceView>('chat');
  const [mobileTabDragOffset, setMobileTabDragOffset] = useState(0);
  const [mobileSharedSecondaryStack, setMobileSharedSecondaryStack] = useState<MobileSharedSecondaryPage[]>([]);
  const [mobileSharedClosingKey, setMobileSharedClosingKey] = useState<string | null>(null);
  const [optimisticConversation, setOptimisticConversation] = useState<Conversation | null>(null);
  const [memberLoadConversationIds, setMemberLoadConversationIds] = useState<Set<number>>(() => new Set());
  const [memberSearchByConversationId, setMemberSearchByConversationId] = useState<Record<number, string>>({});
  const [showCcwBindingPrompt, setShowCcwBindingPrompt] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<'account' | 'ccw'>('account');
  const [settingsInitialMobilePage, setSettingsInitialMobilePage] = useState<'mobileMenu' | null>(null);
  const [settingsFocusKey, setSettingsFocusKey] = useState(0);
  const mobileRouteHistoryRef = useRef<string[]>([]);
  const mobileSettingsDragProgressRef = useRef(0);
  const mobileTabGestureRef = useRef<{ pointerId: number; startX: number; startY: number; active: boolean; moved: boolean } | null>(null);
  const settingsRailGestureRef = useRef<{ pointerId: number; startX: number; startY: number; startProgress: number; currentProgress: number; active: boolean; moved: boolean } | null>(null);
  const settingsRailElementRef = useRef<HTMLDivElement | null>(null);
  const settingsRailTouchGestureRef = useRef<{ identifier: number; startX: number; startY: number; startProgress: number; currentProgress: number; active: boolean; moved: boolean } | null>(null);
  const settingsRailRouteFrameRef = useRef<number | null>(null);
  const settingsRailRouteTimerRef = useRef<number | null>(null);
  const mobileBottomNavHiddenRef = useRef(false);
  const mobileBottomNavActiveIndexRef = useRef(0);
  const mobileBottomNavActiveViewRef = useRef<WorkspaceView>('chat');
  const mobileBottomNavExitSnapshotTimerRef = useRef<number | null>(null);
  const workspaceView = useKukeStore((state) => state.workspaceView);
  const setWorkspaceView = useKukeStore((state) => state.setWorkspaceView);
  const layoutMode = useKukeStore((state) => state.layoutMode);
  const activeConversationId = useKukeStore((state) => state.activeConversationId);
  const setActiveConversationId = useKukeStore((state) => state.setActiveConversationId);
  const setActiveConversationIdOnly = useKukeStore((state) => state.setActiveConversationIdOnly);
  const visibleConversationId = useKukeStore((state) => state.visibleConversationId);
  const unreadCount = useKukeStore((state) => state.unreadCount);
  const setUnreadCount = useKukeStore((state) => state.setUnreadCount);
  const setSearchableConversationIds = useKukeStore((state) => state.setSearchableConversationIds);
  const recommendedGroupJoinRequest = useKukeStore((state) => state.recommendedGroupJoinRequest);
  const recommendedFriendRequest = useKukeStore((state) => state.recommendedFriendRequest);
  const pendingUserSpaceId = useKukeStore((state) => state.pendingUserSpaceId);
  const pendingPostId = useKukeStore((state) => state.pendingPostId);
  const pendingBotId = useKukeStore((state) => state.pendingBotId);
  const clearPendingUserSpace = useKukeStore((state) => state.clearPendingUserSpace);
  const clearPendingPost = useKukeStore((state) => state.clearPendingPost);
  const clearPendingBot = useKukeStore((state) => state.clearPendingBot);
  const openUserSpace = useKukeStore((state) => state.openUserSpace);
  const closeRecommendedFriendRequest = useKukeStore((state) => state.closeRecommendedFriendRequest);
  const logout = useKukeStore((state) => state.logout);
  const openTeamupProfile = useKukeStore((state) => state.openTeamupProfile);
  const mobileFeatureOrder = useKukeStore((state) => state.mobileFeatureOrder);
  const [inviteToken, setInviteToken] = useState<string | null>(null);

  const conversationsQuery = useQuery({ queryKey: ['conversations'], queryFn: getConversations });
  const friendsQuery = useQuery({ queryKey: ['friends'], queryFn: getFriends });
  const conversations = conversationsQuery.data ?? [];
  const friends = friendsQuery.data ?? [];
  const bookmarksQuery = useQuery({
    queryKey: ['bookmarks-all', conversations.map((conversation) => conversation.id).join(',')],
    queryFn: () => getAllBookmarkedMessages(conversations),
    enabled: (workspaceView === 'favorites' || (layoutMode === 'mobile' && workspaceView === 'posts')) && conversations.length > 0
  });
  const openTasksQuery = useQuery({ queryKey: ['tasks', 'open-assigned'], queryFn: () => getTasks({ scope: 'assigned', limit: 1 }), staleTime: 30_000 });
  const hasOpenTasks = (openTasksQuery.data?.length ?? 0) > 0;

  const queryClient = useQueryClient();
  const lastSeenAnnouncementId = useKukeStore((state) => state.lastSeenAnnouncementId);
  const setLastSeenAnnouncementId = useKukeStore((state) => state.setLastSeenAnnouncementId);
  const [announcementOpen, setAnnouncementOpen] = useState(false);
  const announcedRef = useRef<number | null>(null);
  const latestAnnouncementQuery = useQuery({ queryKey: ['announcement', 'latest'], queryFn: getLatestAnnouncement, staleTime: 60_000 });
  const latestAnnouncement = latestAnnouncementQuery.data ?? null;
  const hasUnseenAnnouncement = Boolean(latestAnnouncement && latestAnnouncement.id > (lastSeenAnnouncementId ?? 0));

  useEffect(() => {
    if (latestAnnouncement && latestAnnouncement.id > (lastSeenAnnouncementId ?? 0) && announcedRef.current !== latestAnnouncement.id) {
      announcedRef.current = latestAnnouncement.id;
      setAnnouncementOpen(true);
    }
  }, [latestAnnouncement, lastSeenAnnouncementId]);

  useEffect(() => {
    const unsubscribe = subscribeRealtimeEvents((event) => {
      if (event.rawType === 'announcement.published') {
        void queryClient.invalidateQueries({ queryKey: ['announcement', 'latest'] });
      }
    });
    return unsubscribe;
  }, [queryClient]);

  function closeAnnouncement(): void {
    setAnnouncementOpen(false);
    if (latestAnnouncement) {
      setLastSeenAnnouncementId(latestAnnouncement.id);
    }
  }

  const postTopicsQuery = useQuery({ queryKey: ['post-topics'], queryFn: () => getTrendingPostTopics(5), enabled: layoutMode === 'mobile' && mobileSharedSecondaryStack.some((page) => page.type === 'post') });

  useEffect(() => {
    if (!activeConversationId && conversationsQuery.data?.[0]) {
      setActiveConversationId(conversationsQuery.data[0].id);
    }
  }, [activeConversationId, conversationsQuery.data, setActiveConversationId]);

  useEffect(() => {
    const totalUnread = conversations.reduce((sum, conversation) => {
      if (conversation.id === visibleConversationId || isConversationMuted(conversation) || isConversationBlocked(conversation)) {
        return sum;
      }
      return sum + Math.max(0, conversation.unread_count ?? 0);
    }, 0);
    setUnreadCount(totalUnread);
  }, [visibleConversationId, conversations, setUnreadCount]);

  useEffect(() => {
    setSearchableConversationIds(conversations.map((conversation) => conversation.id));
  }, [conversations, setSearchableConversationIds]);

  useEffect(() => {
    void updateNativeBackgroundRealtimeConversations(conversations);
  }, [conversations]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('invite')?.trim();
    if (token && /^[A-Za-z0-9_-]{6,80}$/.test(token)) {
      setInviteToken(token);
      const url = new URL(window.location.href);
      url.searchParams.delete('invite');
      window.history.replaceState(window.history.state, '', url.toString());
    }
    const teamupParam = params.get('teamup')?.trim();
    if (teamupParam && /^\d{1,12}$/.test(teamupParam)) {
      openTeamupProfile(Number(teamupParam));
      const url = new URL(window.location.href);
      url.searchParams.delete('teamup');
      window.history.replaceState(window.history.state, '', url.toString());
    }
  }, [openTeamupProfile]);

  useEffect(() => {
    if (currentUser.ccw_student_oid || hasSeenCcwBindingPrompt(currentUser.id)) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      markCcwBindingPromptSeen(currentUser.id);
      setShowCcwBindingPrompt(true);
    }, 760);
    return () => window.clearTimeout(timer);
  }, [currentUser.ccw_student_oid, currentUser.id]);

  const activeConversation = conversations.find((conversation) => conversation.id === activeConversationId) ?? (optimisticConversation?.id === activeConversationId ? optimisticConversation : null) ?? conversations[0];
  const shouldLoadActiveMembers = Boolean(
    activeConversation?.id && (
      activeConversation.type === 'direct' ||
      activeConversation.type === 'group' ||
      memberLoadConversationIds.has(activeConversation.id)
    )
  );
  const activeMemberSearch = activeConversation?.id ? memberSearchByConversationId[activeConversation.id]?.trim() ?? '' : '';
  const directMembersQuery = useQuery({
    queryKey: ['conversation-members', activeConversation?.id],
    queryFn: () => getConversationMembers(activeConversation?.id ?? 0),
    enabled: workspaceView === 'chat' && shouldLoadActiveMembers && activeConversation?.type === 'direct',
    staleTime: 60_000
  });
  const groupMembersQuery = useInfiniteQuery({
    queryKey: ['conversation-members-page', activeConversation?.id, activeMemberSearch],
    queryFn: ({ pageParam }) => getConversationMembersPage(activeConversation?.id ?? 0, { limit: MEMBER_PAGE_SIZE, offset: pageParam, search: activeMemberSearch }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.has_more ? lastPage.offset + lastPage.items.length : undefined,
    enabled: workspaceView === 'chat' && shouldLoadActiveMembers && activeConversation?.type === 'group',
    staleTime: 30_000
  });
  const groupMemberPages = groupMembersQuery.data?.pages ?? [];
  const fetchedMembers = activeConversation?.type === 'group'
    ? groupMemberPages.flatMap((page) => page.items)
    : directMembersQuery.data ?? [];
  const fallbackMembers = activeConversation?.members ?? [];
  const conversationMembers = fetchedMembers.length > 0 ? fetchedMembers : fallbackMembers;
  const normalizedConversationMembers: ConversationMember[] = activeConversation?.type === 'group' && !conversationMembers.some((member) => memberUserId(member) === currentUser.id)
    ? [{ id: -currentUser.id, conversation_id: activeConversation.id, user_id: currentUser.id, role: activeConversation.created_by_id === currentUser.id ? 'owner' : 'member', user: currentUser }, ...conversationMembers]
    : conversationMembers;
  const directMembers: ConversationMember[] = [];
  if (activeConversation?.type === 'direct') {
    directMembers.push({ id: -currentUser.id, conversation_id: activeConversation.id, user_id: currentUser.id, role: 'member', user: currentUser });
    if (activeConversation.direct_user && activeConversation.direct_user.id !== currentUser.id) {
      directMembers.push({ id: -activeConversation.direct_user.id, conversation_id: activeConversation.id, user_id: activeConversation.direct_user.id, role: 'member', user: activeConversation.direct_user });
    }
  }
  const visibleMembers = normalizedConversationMembers.length > 0 ? normalizedConversationMembers : directMembers;
  const currentMember = normalizedConversationMembers.find((member) => memberUserId(member) === currentUser.id);
  const currentRole: MemberRole = activeConversation?.my_role ?? currentMember?.role ?? (activeConversation?.created_by_id === currentUser.id ? 'owner' : 'member');
  const membersLoading = activeConversation?.type === 'group'
    ? groupMembersQuery.isLoading
    : directMembersQuery.isLoading;
  const membersHasMore = activeConversation?.type === 'group' ? Boolean(groupMembersQuery.hasNextPage) : false;
  const membersLoadingMore = activeConversation?.type === 'group' ? groupMembersQuery.isFetchingNextPage : false;
  const showConversationList = workspaceView === 'chat';
  const isMobile = layoutMode === 'mobile';
  const isNativeApp = isNativeMobileApp();
  const mobileRouteKey = workspaceView === 'chat' ? `chat:${mobilePage}` : workspaceView;
  const mobileRoutePageClass = isNativeApp ? `kc-native-route-page ${useNativeCssTransition ? mobileTransitionClass : ''}` : `kc-ios-route-page ${mobileTransitionClass}`;
  const mobileSharedSecondaryActive = mobileSharedSecondaryStack.length > 0;
  const mobileSecondaryPageActive = mobileSharedSecondaryActive || (contactsMobileDetailActive && (workspaceView === 'contacts' || workspaceView === 'posts' || workspaceView === 'space' || workspaceView === 'settings'));
  const mobilePrimaryRouteTransitionStyle = isMobile && (mobileSecondaryPageActive || mobileSharedClosingKey) ? { viewTransitionName: 'none' } : undefined;
  const isSettingsRailRoute = isMobile && (mobileRouteKey === 'chat:list' || mobileRouteKey === 'settings');
  const mobileRoutePageKey = isMobile && isSettingsRailRoute ? 'chat-settings-rail' : mobileRouteKey;
  const isMobileHomeTabRoute = isMobile && !isSettingsRailRoute && routeShowsMobileBottomNav(mobileRouteKey) && !mobileSecondaryPageActive && !forwardDetailMessage;
  const showMobileBottomNav = isMobile && (routeShowsMobileBottomNav(mobileRouteKey) || mobileRouteKey === 'settings') && !mobileSecondaryPageActive && !(isMobile && Boolean(forwardDetailMessage));
  const mobileBottomNavHidden = mobileRouteKey === 'settings' && !isSettingsRailRoute;
  const mobileBottomNavShouldHide = !showMobileBottomNav || mobileBottomNavHidden;
  const mobileFixedSpaceTab = { key: 'space', label: getMobileFeatureDefinition('space').label, icon: getMobileFeatureDefinition('space').icon, view: 'space' as WorkspaceView, featureId: undefined as MobileFeatureId | undefined };
  const mobileBottomTabs = [mobileFixedChatTab, ...getMobileBottomFeatureIds(mobileFeatureOrder).map((id) => {
    const feature = getMobileFeatureDefinition(id);
    const view = id === 'announcement' || id === 'favorites' || id === 'teamup' || id === 'tasks' || id === 'bots' || id === 'home' ? 'space' : id;
    return { key: id, label: feature.label, icon: feature.icon, view: view as WorkspaceView, featureId: id };
  }), mobileFixedSpaceTab];
  const activeMobileTabIndex = Math.max(0, mobileBottomTabs.findIndex((item) => item.key === workspaceView || (item.view === workspaceView && !['announcement', 'favorites', 'teamup', 'tasks', 'bots', 'home'].includes(item.key))));
  mobileBottomNavActiveIndexRef.current = activeMobileTabIndex;
  mobileBottomNavActiveViewRef.current = workspaceView;
  const mobileBottomNavSnapshotKey = `${mobileRouteKey}:${conversations.length}:${friends.length}:${bookmarksQuery.data?.length ?? 0}:${unreadCount}`;
  const mobileChatBackUnreadCount = Math.max(0, unreadCount);

  function renderMobileBottomNavContent(interactive: boolean, activeView: WorkspaceView = workspaceView): JSX.Element {
    return (
      <>
        <span className="kc-mobile-glass-nav-backdrop" aria-hidden="true">
          <MobileNavBackdropSnapshot snapshotKey={mobileBottomNavSnapshotKey} />
        </span>
        <div className="kc-mobile-glass-nav-shell">
          <span className="kc-mobile-glass-nav-indicator" aria-hidden="true" />
          {mobileBottomTabs.map((item) => {
            const active = item.key === activeView || (activeView === item.view && !['announcement', 'favorites', 'teamup', 'tasks', 'bots', 'home'].includes(item.key));
            return (
              <button key={item.key} type="button" data-mobile-nav-key={item.key} onClick={interactive ? () => openMobileTab(item) : undefined} tabIndex={interactive ? undefined : -1} className={`kc-mobile-glass-nav-item ${active ? 'kc-mobile-glass-nav-item-active' : ''}`} aria-current={active ? 'page' : undefined}>
                <span className="kc-mobile-glass-nav-icon-wrap">
                  <Icon name={item.icon} className="kc-mobile-glass-nav-icon" />
                  {item.key === 'messages' && unreadCount > 0 ? <span className="kc-mobile-glass-nav-badge">{unreadCount > 99 ? '99+' : unreadCount}</span> : null}
                </span>
                <span className="kc-mobile-glass-nav-label">{item.label}</span>
              </button>
            );
          })}
        </div>
      </>
    );
  }

  function clearMobileBottomNavExitSnapshotTimer(): void {
    if (mobileBottomNavExitSnapshotTimerRef.current !== null) {
      window.clearTimeout(mobileBottomNavExitSnapshotTimerRef.current);
      mobileBottomNavExitSnapshotTimerRef.current = null;
    }
  }

  function playMobileBottomNavExitSnapshot(): void {
    // Intentionally a no-op. The bottom nav now animates out DURING the
    // transition itself: secondary routes animate it via
    // ::view-transition-old/new(kc-mobile-bottom-nav) (slide down/up), and
    // non-view-transition routes (e.g. settings) animate the always-mounted nav
    // via its own 360ms transform transition + `kc-mobile-glass-nav-hidden`.
    // The previous post-transition snapshot clone fired AFTER the route had
    // already settled, which is why the nav looked like it hid late / snapped
    // away with no animation.
    clearMobileBottomNavExitSnapshotTimer();
    setMobileBottomNavExitSnapshotVisible(false);
  }

  function handleMobileDetailActiveChange(active: boolean): void {
    if (active && !mobileBottomNavShouldHide) {
      playMobileBottomNavExitSnapshot();
      mobileBottomNavHiddenRef.current = true;
    }
    setContactsMobileDetailActive(active);
  }

  function useCssRouteTransition(nextRoute: string): boolean {
    return isNativeApp && isMobile && routeShowsMobileBottomNav(nextRoute) && nextRoute !== 'settings' && mobileRouteKey !== 'settings';
  }

  function getMobileRouteDirection(nextRoute: string): NativeRouteDirection {
    const currentOrder = mobileRouteOrder[mobileRouteKey] ?? 0;
    const nextOrder = mobileRouteOrder[nextRoute] ?? currentOrder;
    return nextOrder < currentOrder ? 'back' : 'forward';
  }

  function applyMobileRoute(route: string): void {
    if (route === 'chat:chat') {
      setWorkspaceView('chat');
      setMobilePage('chat');
      return;
    }
    if (route === 'chat:list') {
      setWorkspaceView('chat');
      setMobilePage('list');
      return;
    }
    setWorkspaceView(route as WorkspaceView);
    setMobilePage('list');
  }

  function navigateMobileRoute(nextRoute: string, direction?: NativeRouteDirection): void {
    if (nextRoute === mobileRouteKey) {
      return;
    }

    mobileRouteHistoryRef.current.push(mobileRouteKey);
    const useCssTransition = useCssRouteTransition(nextRoute);
    setUseNativeCssTransition(useCssTransition);
    setMobileRouteTransition(nextRoute);
    runNativeRouteTransition(direction ?? getMobileRouteDirection(nextRoute), () => applyMobileRoute(nextRoute), isNativeApp && isMobile && !useCssTransition && nextRoute !== 'settings' && mobileRouteKey !== 'settings');
  }

  function replaceMobileRoute(nextRoute: string, direction?: NativeRouteDirection): void {
    if (nextRoute === mobileRouteKey) {
      return;
    }

    const useCssTransition = useCssRouteTransition(nextRoute);
    setUseNativeCssTransition(useCssTransition);
    setMobileRouteTransition(nextRoute);
    runNativeRouteTransition(direction ?? getMobileRouteDirection(nextRoute), () => applyMobileRoute(nextRoute), isNativeApp && isMobile && !useCssTransition && nextRoute !== 'settings' && mobileRouteKey !== 'settings');
  }

  function goBackMobileRoute(): boolean {
    let previousRoute = mobileRouteHistoryRef.current.pop();
    while (previousRoute === mobileRouteKey) {
      previousRoute = mobileRouteHistoryRef.current.pop();
    }
    if (!previousRoute) {
      return false;
    }

    const useCssTransition = useCssRouteTransition(previousRoute);
    setUseNativeCssTransition(useCssTransition);
    setMobileRouteTransition(previousRoute);
    runNativeRouteTransition(getMobileRouteDirection(previousRoute), () => applyMobileRoute(previousRoute), isNativeApp && isMobile && !useCssTransition && previousRoute !== 'settings' && mobileRouteKey !== 'settings');
    return true;
  }

  function openSharedPostDetail(postId: number): void {
    runNativeRouteTransition('secondary-forward', () => {
      setMobileSharedSecondaryStack((current) => [...current, { type: 'post', postId }]);
    }, isMobile);
  }

  function openSharedUserProfile(user: User | null | undefined, fallbackId: number): void {
    runNativeRouteTransition('secondary-forward', () => {
      setMobileSharedSecondaryStack((current) => [...current, { type: 'user', user: user ?? null, fallbackId }]);
    }, isMobile);
  }

  function openSharedOnlineUsers(users: User[], onlineCount: number): void {
    runNativeRouteTransition('secondary-forward', () => {
      setMobileSharedSecondaryStack((current) => [...current, { type: 'onlineUsers', users, onlineCount }]);
    }, isMobile);
  }

  function openSharedBotCenter(): void {
    runNativeRouteTransition('secondary-forward', () => {
      setMobileSharedSecondaryStack((current) => [...current, { type: 'bots' }]);
    }, isMobile);
  }

  function openSharedHome(): void {
    runNativeRouteTransition('secondary-forward', () => {
      setMobileSharedSecondaryStack((current) => [...current, { type: 'home' }]);
    }, isMobile);
  }

  function openSharedBotDetail(botId: number): void {
    runNativeRouteTransition('secondary-forward', () => {
      setMobileSharedSecondaryStack((current) => [...current, { type: 'bot', botId }]);
    }, isMobile);
  }

  function openSharedBotEditor(mode: 'create' | 'edit', bot?: Bot): void {
    runNativeRouteTransition('secondary-forward', () => {
      setMobileSharedSecondaryStack((current) => [...current, { type: 'botEditor', mode, bot }]);
    }, isMobile);
  }

  function rememberMobileConversation(conversationId: number, conversation?: Conversation | null): void {
    const knownConversation = conversation ?? conversations.find((item) => item.id === conversationId) ?? null;
    if (knownConversation) {
      setOptimisticConversation(knownConversation);
      return;
    }
    setOptimisticConversation({ id: conversationId, type: 'direct', title: `会话 ${conversationId}`, display_title: `会话 ${conversationId}`, unread_count: 0 });
  }

  function openSharedConversation(conversationId: number, conversation?: Conversation): void {
    rememberMobileConversation(conversationId, conversation);
    setActiveConversationIdOnly(conversationId);
    runNativeRouteTransition('secondary-forward', () => {
      setMobileSharedSecondaryStack((current) => [...current, { type: 'conversation', conversationId }]);
    }, isMobile);
  }

  function closeSharedSecondaryPage(): void {
    const closingKey = getSharedSecondaryKey(mobileSharedSecondaryStack[mobileSharedSecondaryStack.length - 1]);
    runNativeRouteTransition('secondary-back', () => {
      setMobileSharedClosingKey(closingKey);
      setMobileSharedSecondaryStack((current) => current.slice(0, -1));
      window.setTimeout(() => setMobileSharedClosingKey((current) => current === closingKey ? null : current), 260);
    }, isMobile);
  }

  useEffect(() => {
    if (!isMobile) {
      setMobilePage('list');
    }
  }, [isMobile]);

  useEffect(() => {
    if (pendingUserSpaceId && isMobile) {
      openSharedUserProfile(null, pendingUserSpaceId);
      clearPendingUserSpace(pendingUserSpaceId);
    }
  }, [clearPendingUserSpace, isMobile, pendingUserSpaceId]);

  useEffect(() => {
    if (pendingPostId && isMobile) {
      openSharedPostDetail(pendingPostId);
      clearPendingPost(pendingPostId);
    }
  }, [clearPendingPost, isMobile, pendingPostId]);

  useEffect(() => {
    if (pendingBotId && isMobile) {
      openSharedBotDetail(pendingBotId);
      clearPendingBot(pendingBotId);
    }
  }, [clearPendingBot, isMobile, pendingBotId]);

  useEffect(() => {
    if (!isMobile) {
      setMobileSharedSecondaryStack([]);
    }
  }, [isMobile]);

  useEffect(() => {
    if (!isMobile) {
      clearMobileBottomNavExitSnapshotTimer();
      mobileBottomNavHiddenRef.current = mobileBottomNavShouldHide;
      setMobileBottomNavExitSnapshotVisible(false);
      setMobileBottomNavTransitioning(false);
      return undefined;
    }
    setMobileBottomNavTransitioning(true);
    const timer = window.setTimeout(() => setMobileBottomNavTransitioning(false), MOBILE_BOTTOM_NAV_TRANSITION_MS);
    return () => window.clearTimeout(timer);
  }, [isMobile, mobileBottomNavShouldHide]);

  useEffect(() => {
    if (!isMobile) {
      clearMobileBottomNavExitSnapshotTimer();
      mobileBottomNavHiddenRef.current = mobileBottomNavShouldHide;
      setMobileBottomNavExitSnapshotVisible(false);
      return undefined;
    }

    const wasHidden = mobileBottomNavHiddenRef.current;
    mobileBottomNavHiddenRef.current = mobileBottomNavShouldHide;
    if (!wasHidden && mobileBottomNavShouldHide) {
      mobileBottomNavHiddenRef.current = false;
      playMobileBottomNavExitSnapshot();
      mobileBottomNavHiddenRef.current = true;
    }
    if (wasHidden && !mobileBottomNavShouldHide) {
      clearMobileBottomNavExitSnapshotTimer();
      setMobileBottomNavExitSnapshotVisible(false);
    }
    return undefined;
  }, [isMobile, mobileBottomNavShouldHide]);

  useEffect(() => {
    return () => clearMobileBottomNavExitSnapshotTimer();
  }, []);

  useEffect(() => {
    if (!isMobile) {
      return;
    }

    return registerNativeBackHandler(() => {
      if (mobileSharedSecondaryStack.length > 0) {
        closeSharedSecondaryPage();
        return true;
      }
      return goBackMobileRoute();
    }, 10);
  }, [isMobile, isNativeApp, mobileRouteKey, mobileSharedSecondaryStack.length, setWorkspaceView]);

  useEffect(() => {
    if (!isNativeApp || !isMobile) {
      return undefined;
    }
    return addNativeOpenConversationListener((conversationId) => {
      mobileRouteHistoryRef.current = [];
      openConversationFromMobileSurface(conversationId);
    });
  }, [activeConversationId, conversations, isMobile, isNativeApp, mobileRouteKey]);

  function handleLogout(): void {
    setRememberIpLogin(false);
    void clearNativeSession();
    void stopNativeBackgroundRealtime(true);
    void logoutCookieSession().catch(() => undefined);
    logout();
  }

  function openMobileFeatureSecondary(featureId: MobileFeatureId): void {
    if (featureId === 'bots') {
      openSharedBotCenter();
      return;
    }
    if (featureId === 'home') {
      openSharedHome();
      return;
    }
    runNativeRouteTransition('secondary-forward', () => {
      if (featureId === 'announcement') {
        setMobileSharedSecondaryStack((current) => [...current, { type: 'announcement' }]);
        return;
      }
      if (featureId === 'teamup') {
        setMobileSharedSecondaryStack((current) => [...current, { type: 'teamup' }]);
        return;
      }
      if (featureId === 'tasks') {
        setMobileSharedSecondaryStack((current) => [...current, { type: 'tasks' }]);
        return;
      }
      if (featureId === 'favorites') {
        setMobileSharedSecondaryStack((current) => [...current, { type: 'favorites' }]);
      }
    }, isMobile);
  }

  function openDesktopSettings(): void {
    setSettingsInitialTab('account');
    setSettingsInitialMobilePage(null);
    setSettingsFocusKey((value) => value + 1);
    setWorkspaceView('settings');
  }

  function openCcwSettingsFromPrompt(): void {
    setShowCcwBindingPrompt(false);
    setSettingsInitialTab('ccw');
    setSettingsInitialMobilePage(null);
    setSettingsFocusKey((value) => value + 1);
    if (isMobile) {
      openMobileSettings(false);
      return;
    }
    setWorkspaceView('settings');
  }

  function openMobileMenuSettings(): void {
    setSettingsInitialTab('account');
    setSettingsInitialMobilePage('mobileMenu');
    setSettingsFocusKey((value) => value + 1);
    openMobileSettings(false);
  }

  function triggerRailRipple(key: string, event: React.PointerEvent<HTMLButtonElement>): void {
    const rect = event.currentTarget.getBoundingClientRect();
    const ripple = {
      id: window.performance.now(),
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
    setRailRipples((current) => ({ ...current, [key]: ripple }));
    window.setTimeout(() => {
      setRailRipples((current) => (current[key]?.id === ripple.id ? { ...current, [key]: null } : current));
    }, 520);
  }

  function renderRailRipple(key: string): JSX.Element {
    const ripple = railRipples[key];
    return (
      <span className="kc-pc-rail-ripple" aria-hidden="true">
        {ripple ? <span key={ripple.id} className="kc-pc-rail-ripple-dot" style={{ '--kc-ripple-x': `${ripple.x}px`, '--kc-ripple-y': `${ripple.y}px` } as CSSProperties} /> : null}
      </span>
    );
  }

  function setMobileRouteTransition(nextRoute: string): void {
    if (!isMobile) {
      return;
    }
    const currentOrder = mobileRouteOrder[mobileRouteKey] ?? 0;
    const nextOrder = mobileRouteOrder[nextRoute] ?? currentOrder;
    setMobileTransitionClass(nextOrder < currentOrder ? 'kc-ios-slide-from-left' : 'kc-ios-slide-from-right');
  }

  function clearSettingsRailRouteAnimation(): void {
    if (settingsRailRouteFrameRef.current !== null) {
      window.cancelAnimationFrame(settingsRailRouteFrameRef.current);
      settingsRailRouteFrameRef.current = null;
    }
    if (settingsRailRouteTimerRef.current !== null) {
      window.clearTimeout(settingsRailRouteTimerRef.current);
      settingsRailRouteTimerRef.current = null;
    }
    setSettingsRailAnimating(false);
    setSettingsRailProgrammaticOpen(false);
  }

  function commitMobileSettingsRoute(): void {
    navigateMobileRoute('settings', 'back');
  }

  function setSettingsRailProgress(value: number): void {
    const nextProgress = clampSettingsSwipeProgress(value);
    mobileSettingsDragProgressRef.current = nextProgress;
    setMobileSettingsDragProgress(nextProgress);
  }

  function animateSettingsRailProgress(targetProgress: number, duration: number, onComplete?: () => void): void {
    if (settingsRailRouteFrameRef.current !== null) {
      window.cancelAnimationFrame(settingsRailRouteFrameRef.current);
      settingsRailRouteFrameRef.current = null;
    }
    if (settingsRailRouteTimerRef.current !== null) {
      window.clearTimeout(settingsRailRouteTimerRef.current);
      settingsRailRouteTimerRef.current = null;
    }

    const fromProgress = mobileSettingsDragProgressRef.current;
    const toProgress = clampSettingsSwipeProgress(targetProgress);
    if (Math.abs(toProgress - fromProgress) < 0.001) {
      setSettingsRailProgress(toProgress);
      onComplete?.();
      return;
    }

    const startTime = window.performance.now();
    setSettingsRailAnimating(true);
    const tick = (time: number): void => {
      const elapsed = Math.min(1, (time - startTime) / duration);
      const eased = 1 - Math.pow(1 - elapsed, 3);
      setSettingsRailProgress(fromProgress + (toProgress - fromProgress) * eased);
      if (elapsed < 1) {
        settingsRailRouteFrameRef.current = window.requestAnimationFrame(tick);
        return;
      }
      settingsRailRouteFrameRef.current = null;
      setSettingsRailAnimating(false);
      onComplete?.();
    };
    settingsRailRouteFrameRef.current = window.requestAnimationFrame(tick);
  }

  function openMobileSettings(animateRail = true): void {
    clearSettingsRailRouteAnimation();
    if (animateRail && isMobile && mobileRouteKey === 'chat:list') {
      setSettingsRailDragging(false);
      setSettingsRailProgrammaticOpen(true);
      setSettingsRailProgress(0);
      settingsRailRouteFrameRef.current = window.requestAnimationFrame(() => {
        settingsRailRouteFrameRef.current = window.requestAnimationFrame(() => {
          settingsRailRouteFrameRef.current = null;
          void settingsRailElementRef.current?.getBoundingClientRect();
          animateSettingsRailProgress(1, SETTINGS_RAIL_PROGRAMMATIC_TRANSITION_MS, () => {
            setSettingsRailProgrammaticOpen(false);
            commitMobileSettingsRoute();
          });
        });
      });
      return;
    }
    setSettingsRailProgrammaticOpen(false);
    setSettingsRailProgress(1);
    commitMobileSettingsRoute();
  }

  function backFromMobileSettings(): void {
    clearSettingsRailRouteAnimation();
    setSettingsRailProgress(0);
    if (!goBackMobileRoute()) {
      replaceMobileRoute('chat:list', 'forward');
    }
  }

  function clampSettingsSwipeProgress(value: number): number {
    return Math.min(1, Math.max(0, value));
  }

  function routeSettingsProgress(routeKey = mobileRouteKey): number {
    return routeKey === 'settings' ? 1 : 0;
  }

  function shouldOpenSettingsFromSwipe(finalProgress: number, deltaProgress: number): boolean {
    return finalProgress >= 0.5 || deltaProgress > 0.1;
  }

  function shouldCloseSettingsFromSwipe(finalProgress: number, deltaProgress: number): boolean {
    return finalProgress <= 0.5 || deltaProgress < -0.1;
  }

  useEffect(() => {
    return () => clearSettingsRailRouteAnimation();
  }, []);

  useEffect(() => {
    if (!isMobile || (mobileRouteKey !== 'chat:list' && mobileRouteKey !== 'settings')) {
      return;
    }
    setSettingsRailProgress(routeSettingsProgress(mobileRouteKey));
  }, [isMobile, mobileRouteKey]);

  function isInteractiveSettingsRailTarget(target: EventTarget | null): boolean {
    return target instanceof HTMLElement && Boolean(target.closest('input, textarea, select, a, [contenteditable="true"], [data-kc-swipe-ignore="true"]'));
  }

  function handleSettingsRailPointerDown(event: PointerEvent<HTMLDivElement>): void {
    if (!isMobile || (mobileRouteKey !== 'chat:list' && mobileRouteKey !== 'settings') || isInteractiveSettingsRailTarget(event.target)) {
      return;
    }
    settingsRailGestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startProgress: routeSettingsProgress(mobileRouteKey),
      currentProgress: routeSettingsProgress(mobileRouteKey),
      active: false,
      moved: false
    };
  }

  function handleSettingsRailPointerMove(event: PointerEvent<HTMLDivElement>): void {
    const gesture = settingsRailGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) {
      return;
    }
    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    if (!gesture.active) {
      if (Math.abs(deltaY) > 18 && Math.abs(deltaY) > Math.abs(deltaX) * 1.2) {
        settingsRailGestureRef.current = null;
        setSettingsRailProgress(routeSettingsProgress(mobileRouteKey));
        return;
      }
      if (Math.abs(deltaX) < 6 || Math.abs(deltaX) < Math.abs(deltaY) * 0.82) {
        return;
      }
      gesture.active = true;
      setSettingsRailDragging(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    event.preventDefault();
    gesture.moved = true;
    const width = Math.max(1, event.currentTarget.getBoundingClientRect().width);
    const nextProgress = clampSettingsSwipeProgress(gesture.startProgress + deltaX / width);
    gesture.currentProgress = nextProgress;
    setSettingsRailProgress(nextProgress);
  }

  function finishSettingsRailGesture(commit: boolean): void {
    const gesture = settingsRailGestureRef.current;
    settingsRailGestureRef.current = null;
    setSettingsRailDragging(false);
    if (!gesture?.active || !commit) {
      setSettingsRailProgress(routeSettingsProgress(mobileRouteKey));
      return;
    }
    const finalProgress = gesture.currentProgress;
    const deltaProgress = finalProgress - gesture.startProgress;
    const targetProgress = gesture.startProgress === 0
      ? (shouldOpenSettingsFromSwipe(finalProgress, deltaProgress) ? 1 : 0)
      : (shouldCloseSettingsFromSwipe(finalProgress, deltaProgress) ? 0 : 1);
    if (targetProgress === 1 && mobileRouteKey === 'chat:list') {
      animateSettingsRailProgress(1, SETTINGS_RAIL_GESTURE_SETTLE_MS, () => openMobileSettings(false));
      return;
    }
    if (targetProgress === 0 && mobileRouteKey === 'settings') {
      animateSettingsRailProgress(0, SETTINGS_RAIL_GESTURE_SETTLE_MS, () => replaceMobileRoute('chat:list', 'forward'));
      return;
    }
    animateSettingsRailProgress(targetProgress, SETTINGS_RAIL_GESTURE_SETTLE_MS);
  }

  function handleSettingsRailPointerUp(event: PointerEvent<HTMLDivElement>): void {
    const gesture = settingsRailGestureRef.current;
    if (gesture?.active) {
      event.preventDefault();
    }
    finishSettingsRailGesture(true);
  }

  function handleSettingsRailPointerCancel(): void {
    finishSettingsRailGesture(false);
  }

  useEffect(() => {
    const currentRail = settingsRailElementRef.current;
    if (!currentRail || !isMobile || (mobileRouteKey !== 'chat:list' && mobileRouteKey !== 'settings')) {
      return undefined;
    }
    const rail = currentRail;

    function findTouch(touches: TouchList, identifier: number): Touch | null {
      for (let index = 0; index < touches.length; index += 1) {
        const touch = touches.item(index);
        if (touch?.identifier === identifier) {
          return touch;
        }
      }
      return null;
    }

    function finishTouchGesture(commit: boolean): void {
      const gesture = settingsRailTouchGestureRef.current;
      settingsRailTouchGestureRef.current = null;
      setSettingsRailDragging(false);
      if (!gesture?.active || !commit) {
        setSettingsRailProgress(routeSettingsProgress(mobileRouteKey));
        return;
      }
      const finalProgress = gesture.currentProgress;
      const deltaProgress = finalProgress - gesture.startProgress;
      const targetProgress = gesture.startProgress === 0
        ? (shouldOpenSettingsFromSwipe(finalProgress, deltaProgress) ? 1 : 0)
        : (shouldCloseSettingsFromSwipe(finalProgress, deltaProgress) ? 0 : 1);
      if (targetProgress === 1 && mobileRouteKey === 'chat:list') {
        animateSettingsRailProgress(1, SETTINGS_RAIL_GESTURE_SETTLE_MS, () => openMobileSettings(false));
        return;
      }
      if (targetProgress === 0 && mobileRouteKey === 'settings') {
        animateSettingsRailProgress(0, SETTINGS_RAIL_GESTURE_SETTLE_MS, () => replaceMobileRoute('chat:list', 'forward'));
        return;
      }
      animateSettingsRailProgress(targetProgress, SETTINGS_RAIL_GESTURE_SETTLE_MS);
    }

    function handleTouchStart(event: globalThis.TouchEvent): void {
      if (event.touches.length !== 1 || isInteractiveSettingsRailTarget(event.target)) {
        return;
      }
      const touch = event.touches.item(0);
      if (!touch) {
        return;
      }
      const startProgress = routeSettingsProgress(mobileRouteKey);
      settingsRailTouchGestureRef.current = {
        identifier: touch.identifier,
        startX: touch.clientX,
        startY: touch.clientY,
        startProgress,
        currentProgress: startProgress,
        active: false,
        moved: false
      };
    }

    function handleTouchMove(event: globalThis.TouchEvent): void {
      const gesture = settingsRailTouchGestureRef.current;
      if (!gesture) {
        return;
      }
      const touch = findTouch(event.touches, gesture.identifier);
      if (!touch) {
        return;
      }
      const deltaX = touch.clientX - gesture.startX;
      const deltaY = touch.clientY - gesture.startY;
      if (!gesture.active) {
        if (Math.abs(deltaY) > 18 && Math.abs(deltaY) > Math.abs(deltaX) * 1.2) {
          settingsRailTouchGestureRef.current = null;
          setSettingsRailDragging(false);
          setSettingsRailProgress(routeSettingsProgress(mobileRouteKey));
          return;
        }
        if (Math.abs(deltaX) < 6 || Math.abs(deltaX) < Math.abs(deltaY) * 0.82) {
          return;
        }
        gesture.active = true;
        setSettingsRailDragging(true);
      }
      if (event.cancelable) {
        event.preventDefault();
      }
      event.stopPropagation();
      gesture.moved = true;
      const width = Math.max(1, rail.getBoundingClientRect().width);
      const nextProgress = clampSettingsSwipeProgress(gesture.startProgress + deltaX / width);
      gesture.currentProgress = nextProgress;
      setSettingsRailProgress(nextProgress);
    }

    function handleTouchEnd(event: globalThis.TouchEvent): void {
      const gesture = settingsRailTouchGestureRef.current;
      if (gesture?.active) {
        if (event.cancelable) {
          event.preventDefault();
        }
        event.stopPropagation();
      }
      finishTouchGesture(true);
    }

    function handleTouchCancel(): void {
      setSettingsRailDragging(false);
      finishTouchGesture(false);
    }

    const touchListenerOptions: AddEventListenerOptions = { passive: false, capture: true };
    rail.addEventListener('touchstart', handleTouchStart, touchListenerOptions);
    rail.addEventListener('touchmove', handleTouchMove, touchListenerOptions);
    rail.addEventListener('touchend', handleTouchEnd, touchListenerOptions);
    rail.addEventListener('touchcancel', handleTouchCancel, touchListenerOptions);
    return () => {
      rail.removeEventListener('touchstart', handleTouchStart, true);
      rail.removeEventListener('touchmove', handleTouchMove, true);
      rail.removeEventListener('touchend', handleTouchEnd, true);
      rail.removeEventListener('touchcancel', handleTouchCancel, true);
    };
  }, [isMobile, mobileRouteKey]);

  function openMobileChat(conversation?: Conversation): void {
    runNativeRouteTransition('secondary-forward', () => {
      if (conversation) {
        rememberMobileConversation(conversation.id, conversation);
        setActiveConversationId(conversation.id);
      }
      mobileRouteHistoryRef.current.push(mobileRouteKey);
      applyMobileRoute('chat:chat');
    }, isMobile);
  }

  function openConversationFromMobileSurface(conversationId: number): void {
    const knownConversation = conversations.find((conversation) => conversation.id === conversationId) ?? null;
    rememberMobileConversation(conversationId, knownConversation);
    if (mobileSharedSecondaryStack.length > 0 && mobileRouteKey !== 'chat:chat') {
      openSharedConversation(conversationId, knownConversation ?? undefined);
      return;
    }
    openMobileChat(knownConversation ?? undefined);
  }

  function loadActiveConversationMembers(): void {
    if (!activeConversation?.id) {
      return;
    }
    setMemberLoadConversationIds((current) => {
      if (current.has(activeConversation.id)) {
        return current;
      }
      const next = new Set(current);
      next.add(activeConversation.id);
      return next;
    });
  }

  function loadMoreActiveConversationMembers(): void {
    if (activeConversation?.type !== 'group' || !groupMembersQuery.hasNextPage || groupMembersQuery.isFetchingNextPage) {
      return;
    }
    void groupMembersQuery.fetchNextPage();
  }

  function updateActiveMemberSearch(keyword: string): void {
    if (!activeConversation?.id) {
      return;
    }
    const normalized = keyword.trim();
    setMemberSearchByConversationId((current) => {
      if ((current[activeConversation.id] ?? '') === normalized) {
        return current;
      }
      return { ...current, [activeConversation.id]: normalized };
    });
  }

  function backToMobileList(): void {
    mobileRouteHistoryRef.current = mobileRouteHistoryRef.current.filter((route) => route !== 'chat:chat');
    if (!goBackMobileRoute()) {
      replaceMobileRoute('chat:list', 'back');
    }
  }

  function openMobileTab(item: { view: WorkspaceView; featureId?: MobileFeatureId }): void {
    if (item.featureId === 'announcement' || item.featureId === 'teamup' || item.featureId === 'tasks' || item.featureId === 'favorites' || item.featureId === 'bots' || item.featureId === 'home') {
      openMobileFeatureSecondary(item.featureId);
      return;
    }
    const nextRoute = item.view === 'chat' ? 'chat:list' : item.view;
    const direction = getMobileRouteDirection(nextRoute);
    if (nextRoute === mobileRouteKey) {
      return;
    }

    mobileRouteHistoryRef.current = [];
    const useCssTransition = useCssRouteTransition(nextRoute);
    setUseNativeCssTransition(useCssTransition);
    setMobileRouteTransition(nextRoute);
    runNativeRouteTransition(direction === 'back' ? 'tab-back' : 'tab-forward', () => applyMobileRoute(nextRoute), isNativeApp && isMobile && !useCssTransition);
  }

  function finishMobileTabGesture(commit: boolean): void {
    const gesture = mobileTabGestureRef.current;
    mobileTabGestureRef.current = null;
    const offset = mobileTabDragOffset;
    setMobileTabDragOffset(0);
    if (!gesture?.active || !commit) {
      return;
    }
    const threshold = Math.max(MOBILE_TAB_SWIPE_THRESHOLD, window.innerWidth * 0.14);
    if (Math.abs(offset) < threshold) {
      return;
    }
    const nextIndex = offset < 0 ? activeMobileTabIndex + 1 : activeMobileTabIndex - 1;
    const nextTab = mobileBottomTabs[nextIndex];
    if (nextTab) {
      openMobileTab(nextTab);
    }
  }

  function handleMobileTabPointerDown(event: PointerEvent<HTMLDivElement>): void {
    if (!isMobileHomeTabRoute || event.pointerType === 'mouse' || event.button !== 0 || isInteractiveSettingsRailTarget(event.target)) {
      return;
    }
    setMobileTabDragOffset(0);
    mobileTabGestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
      moved: false
    };
  }

  function handleMobileTabPointerMove(event: PointerEvent<HTMLDivElement>): void {
    const gesture = mobileTabGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) {
      return;
    }
    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    if (!gesture.active) {
      if (Math.abs(deltaY) > 18 && Math.abs(deltaY) > Math.abs(deltaX) * 1.2) {
        mobileTabGestureRef.current = null;
        setMobileTabDragOffset(0);
        return;
      }
      if (Math.abs(deltaX) < 8 || Math.abs(deltaX) < Math.abs(deltaY) * 0.9) {
        return;
      }
      gesture.active = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    event.preventDefault();
    gesture.moved = true;
    const hasPreviousTab = activeMobileTabIndex > 0;
    const hasNextTab = activeMobileTabIndex < mobileBottomTabs.length - 1;
    const resistedDelta = (deltaX > 0 && !hasPreviousTab) || (deltaX < 0 && !hasNextTab) ? deltaX * 0.22 : deltaX;
    setMobileTabDragOffset(Math.max(-window.innerWidth * 0.36, Math.min(window.innerWidth * 0.36, resistedDelta)));
  }

  function handleMobileTabPointerUp(event: PointerEvent<HTMLDivElement>): void {
    if (mobileTabGestureRef.current?.active) {
      event.preventDefault();
    }
    finishMobileTabGesture(true);
  }

  function handleMobileTabPointerCancel(): void {
    finishMobileTabGesture(false);
  }

  function renderMobileOnlineUsersPage(page: Extract<MobileSharedSecondaryPage, { type: 'onlineUsers' }>, isTop: boolean, transitionStyle?: CSSProperties): JSX.Element {
    const users = page.users.filter((user) => user.id !== currentUser.id);
    return (
      <section className={`kc-space-secondary-page kc-mobile-secondary-sheet fixed inset-0 h-screen w-screen overflow-hidden [background:var(--kc-mobile-bg,#f1f3f8)] [color:var(--kc-mobile-text,#111827)] ${isTop ? 'pointer-events-auto' : 'pointer-events-none'}`} style={{ zIndex: isTop ? 2147483647 : 2147483645, ...transitionStyle }}>
        <div className="kc-native-app flex h-full w-full min-w-0 flex-col overflow-hidden">
          <header className="flex min-h-[calc(max(44px,env(safe-area-inset-top))+58px)] shrink-0 items-end justify-between gap-3 px-4 pb-3 pt-[max(44px,env(safe-area-inset-top))] [background:var(--kc-mobile-bg,#f1f3f8)]">
            <button type="button" onClick={isTop ? closeSharedSecondaryPage : undefined} className="grid h-9 w-9 place-items-center rounded-full bg-white text-[#526070]" aria-label="返回聊天">
              <Icon name="chevronLeft" className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1 text-center">
              <h2 className="truncate text-[17px] font-black text-[#151922]">在线用户</h2>
              <p className="mt-0.5 truncate text-[11px] font-semibold text-[#8b95a5]">当前 {page.onlineCount} 人在线</p>
            </div>
            <span className="h-9 w-9 shrink-0" />
          </header>
          <main className="scroll-soft min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(24px+env(safe-area-inset-bottom))]">
            <section className="rounded-[26px] bg-gradient-to-br from-emerald-400 via-sky-500 to-indigo-500 p-4 text-white shadow-[0_18px_40px_rgba(14,165,233,0.22)]">
              <p className="text-[13px] font-black uppercase tracking-[0.16em] text-white/70">Live Users</p>
              <h3 className="mt-1 text-[28px] font-black leading-none">{page.onlineCount}</h3>
              <p className="mt-2 text-[13px] font-semibold text-white/82">点击头像进入用户主页。</p>
            </section>
            <section className="kc-qq-card mt-3 overflow-hidden p-0">
              {users.length === 0 ? <p className="p-5 text-[13px] font-semibold text-[#8b95a5]">暂时没有其他在线用户。</p> : null}
              {users.map((user) => (
                <button key={user.id} type="button" onClick={() => openSharedUserProfile(user, user.id)} className="flex w-full min-w-0 items-center gap-3 border-b px-4 py-3 text-left last:border-b-0 [border-color:var(--kc-border,#eef1f6)] active:[background:var(--kc-hover,#f4f6fa)]">
                  <span className="relative shrink-0 rounded-full">
                    <Avatar user={user} size="md" />
                    <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-500" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-black text-[#151922]">{getDisplayName(user, `用户 ${user.id}`)}</span>
                    <span className="mt-0.5 block truncate text-[12px] font-semibold text-[#8b95a5]">{userPresenceLabel(user)}</span>
                  </span>
                  <Icon name="chevron" className="h-4 w-4 shrink-0 text-[#c0c5ce]" />
                </button>
              ))}
            </section>
          </main>
        </div>
      </section>
    );
  }

  return (
    <div className={`kc-pc-dashboard relative grid h-full overflow-hidden [background:var(--kc-window)] [color:var(--kc-text)] ${isMobile ? 'kc-mobile-shell grid-cols-1' : showConversationList ? 'grid-cols-[56px_252px_minmax(0,1fr)]' : 'grid-cols-[56px_minmax(0,1fr)]'}`}>
      <aside className={`kc-pc-rail flex flex-col items-center justify-between border-r px-2 py-3 [background:var(--kc-rail)] [border-color:var(--kc-border)] ${isMobile ? 'hidden' : ''}`}>
        <div className="grid gap-2">
          {navItems.map((item) => (
            <span key={item.view} className="kc-pc-rail-action-wrap relative grid h-10 w-10 place-items-center overflow-visible">
              <button type="button" onPointerDown={(event) => triggerRailRipple(item.view, event)} onClick={() => setWorkspaceView(item.view)} className={`kc-pc-rail-action grid h-10 w-10 place-items-center rounded-xl transition ${item.view === 'teamup' && workspaceView !== item.view ? 'kc-pc-rail-action-teamup' : ''} ${workspaceView === item.view ? 'kc-pc-rail-action-active [background:var(--kc-accent)] text-white' : '[color:var(--kc-muted)] hover:[background:var(--kc-hover)] hover:[color:var(--kc-text)]'}`} title={item.label}>
                {renderRailRipple(item.view)}
                <Icon name={item.icon} className="h-5 w-5" />
              </button>
              {item.view === 'chat' && unreadCount > 0 ? <span className="kc-pc-rail-badge pointer-events-none absolute -right-1.5 -top-1.5 grid min-h-[18px] min-w-[18px] place-items-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold leading-none text-white shadow-[0_2px_6px_rgba(239,68,68,0.35)]">{unreadCount}</span> : null}
            </span>
          ))}
          <button type="button" onPointerDown={(event) => triggerRailRipple('create-group', event)} onClick={() => setShowCreateGroup(true)} className="kc-pc-rail-action grid h-10 w-10 place-items-center rounded-xl transition [color:var(--kc-muted)] hover:[background:var(--kc-hover)] hover:[color:var(--kc-text)]" title="创建群聊">
            {renderRailRipple('create-group')}
            <Icon name="plus" className="h-5 w-5" />
          </button>
        </div>
        <div className="grid gap-2">
          <span className="relative grid h-10 w-10 place-items-center overflow-visible">
            <button type="button" onPointerDown={(event) => triggerRailRipple('tasks', event)} onClick={() => setWorkspaceView('tasks')} className={`kc-pc-rail-action grid h-10 w-10 place-items-center rounded-xl transition ${workspaceView === 'tasks' ? 'kc-pc-rail-action-active [background:var(--kc-accent)] text-white' : '[color:var(--kc-muted)] hover:[background:var(--kc-hover)] hover:[color:var(--kc-text)]'}`} title="任务">
              {renderRailRipple('tasks')}
              <Icon name="checkSquare" className="h-5 w-5" />
            </button>
            {hasOpenTasks && workspaceView !== 'tasks' ? <span className="pointer-events-none absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-red-500 shadow-[0_2px_6px_rgba(239,68,68,0.4)] ring-2 ring-[var(--kc-rail)]" /> : null}
          </span>
          <button type="button" onPointerDown={(event) => triggerRailRipple('favorites', event)} onClick={() => setWorkspaceView('favorites')} className={`kc-pc-rail-action grid h-10 w-10 place-items-center rounded-xl transition ${workspaceView === 'favorites' ? 'kc-pc-rail-action-active [background:var(--kc-accent)] text-white' : '[color:var(--kc-muted)] hover:[background:var(--kc-hover)] hover:[color:var(--kc-text)]'}`} title="收藏">
            {renderRailRipple('favorites')}
            <Icon name="star" className="h-5 w-5" />
          </button>
          <span className="relative grid h-10 w-10 place-items-center overflow-visible">
            <button type="button" onPointerDown={(event) => triggerRailRipple('announcement', event)} onClick={() => setAnnouncementOpen(true)} className="kc-pc-rail-action grid h-10 w-10 place-items-center rounded-xl transition [color:var(--kc-muted)] hover:[background:var(--kc-hover)] hover:[color:var(--kc-text)]" title="公告">
              {renderRailRipple('announcement')}
              <Icon name="announcement" className="h-5 w-5" />
            </button>
            {hasUnseenAnnouncement ? <span className="pointer-events-none absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-red-500 shadow-[0_2px_6px_rgba(239,68,68,0.4)] ring-2 ring-[var(--kc-rail)]" /> : null}
          </span>
          <button type="button" onPointerDown={(event) => triggerRailRipple('settings', event)} onClick={openDesktopSettings} className={`kc-pc-rail-action grid h-10 w-10 place-items-center rounded-xl transition ${workspaceView === 'settings' ? 'kc-pc-rail-action-active [background:var(--kc-accent)] text-white' : '[color:var(--kc-muted)] hover:[background:var(--kc-hover)] hover:[color:var(--kc-text)]'}`} title="设置">
            {renderRailRipple('settings')}
            <Icon name="settings" className="h-5 w-5" />
          </button>
        </div>
      </aside>

      {showConversationList && !isMobile ? <ConversationList conversations={conversations} isLoading={conversationsQuery.isLoading} currentUser={currentUser} onCreateGroup={() => setShowCreateGroup(true)} onOpenGlobalSearch={(keyword = '') => setGlobalSearchKeyword(keyword)} /> : null}

      <main className={`grid min-h-0 grid-rows-[minmax(0,1fr)] overflow-hidden [background:var(--kc-chat)] ${isNativeApp ? 'kc-native-main' : ''}`}>
        <div
          className={isMobile ? `${isNativeApp ? 'kc-native-route-viewport' : 'kc-ios-route-viewport'} kc-mobile-tab-swipe-viewport ${mobileTabDragOffset ? 'kc-mobile-tab-swipe-active' : ''}` : 'min-h-0 overflow-hidden'}
          style={{ '--kc-mobile-tab-drag-offset': `${mobileTabDragOffset}px`, ...mobilePrimaryRouteTransitionStyle } as CSSProperties}
          onPointerDown={isSettingsRailRoute ? handleSettingsRailPointerDown : handleMobileTabPointerDown}
          onPointerMove={isSettingsRailRoute ? handleSettingsRailPointerMove : handleMobileTabPointerMove}
          onPointerUp={isSettingsRailRoute ? handleSettingsRailPointerUp : handleMobileTabPointerUp}
          onPointerCancel={isSettingsRailRoute ? handleSettingsRailPointerCancel : handleMobileTabPointerCancel}
          onPointerLeave={isSettingsRailRoute ? handleSettingsRailPointerCancel : handleMobileTabPointerCancel}
        >
          <div key={isMobile ? mobileRoutePageKey : workspaceView} className={`${isMobile ? `${mobileRoutePageClass} ${mobileTabDragOffset ? 'kc-mobile-tab-dragging-page' : ''}` : 'kc-pc-view h-full min-h-0 overflow-hidden'}`}>
            {isMobile && mobileTabDragOffset !== 0 ? <div className="kc-mobile-tab-drag-underlay" aria-hidden="true" /> : null}
            {isSettingsRailRoute ? (
              <div
                ref={settingsRailElementRef}
                className={`kc-settings-rail-viewport ${settingsRailDragging ? 'kc-settings-rail-dragging' : ''} ${settingsRailAnimating ? 'kc-settings-rail-animating' : ''} ${settingsRailProgrammaticOpen ? 'kc-settings-rail-programmatic-open' : ''}`}
                style={{ '--kc-settings-swipe-progress': mobileSettingsDragProgress } as CSSProperties}
              >
                <section className="kc-settings-rail-page kc-settings-rail-settings" aria-hidden={mobileRouteKey !== 'settings'}>
                  <SettingsPanel user={currentUser} isMobile={isMobile} initialMobilePage={settingsInitialMobilePage ?? undefined} focusKey={settingsFocusKey} onMobileBack={backFromMobileSettings} onMobileDetailActiveChange={handleMobileDetailActiveChange} />
                </section>
                <section className="kc-settings-rail-page kc-settings-rail-chat" aria-hidden={mobileRouteKey !== 'chat:list'}>
                  <ConversationList variant="mobile" conversations={conversations} isLoading={conversationsQuery.isLoading} currentUser={currentUser} onCreateGroup={() => setShowCreateGroup(true)} onOpenGlobalSearch={(keyword = '') => setGlobalSearchKeyword(keyword)} onSelectConversation={openMobileChat} onOpenSettings={openMobileSettings} onOpenOnlineUsers={openSharedOnlineUsers} />
                </section>
              </div>
            ) : null}
            {workspaceView === 'chat' && (!isMobile || mobilePage === 'chat') && !isSettingsRailRoute ? <MessagePanel conversations={conversations} currentUser={currentUser} currentRole={currentRole} members={visibleMembers} friends={friends} membersLoading={membersLoading} membersHasMore={membersHasMore} membersLoadingMore={membersLoadingMore} isMobile={isMobile} mobileBackUnreadCount={mobileChatBackUnreadCount} onMembersNeeded={loadActiveConversationMembers} onLoadMoreMembers={loadMoreActiveConversationMembers} onMemberSearchChange={updateActiveMemberSearch} onOpenPost={isMobile ? openSharedPostDetail : undefined} onBack={backToMobileList} /> : null}
            {!isSettingsRailRoute && workspaceView === 'contacts' ? <ContactsPanel friends={friends} conversations={conversations} isLoading={friendsQuery.isLoading} currentUser={currentUser} isMobile={isMobile} onOpenSettings={openMobileSettings} onOpenGlobalSearch={(keyword = '') => setGlobalSearchKeyword(keyword)} onOpenConversation={isMobile ? openConversationFromMobileSurface : undefined} onOpenPost={isMobile ? openSharedPostDetail : undefined} onMobileDetailActiveChange={handleMobileDetailActiveChange} /> : null}
            {!isSettingsRailRoute && workspaceView === 'posts' ? <PostsPanel key={isMobile ? 'mobile-feed-root' : 'desktop-posts-root'} currentUser={currentUser} isMobile={isMobile} onOpenMobileUserProfile={openSharedUserProfile} mobileInitialView="posts" conversations={conversations} bookmarks={bookmarksQuery.data ?? []} bookmarksLoading={bookmarksQuery.isLoading} bookmarksError={bookmarksQuery.error} onOpenForwardBundle={(message) => setForwardDetailMessage(message)} onMobileSecondaryActiveChange={handleMobileDetailActiveChange} /> : null}
            {!isSettingsRailRoute && workspaceView === 'space' && isMobile ? <PostsPanel key="mobile-space-root" currentUser={currentUser} isMobile={isMobile} onOpenMobileUserProfile={openSharedUserProfile} mobileInitialView="home" conversations={conversations} bookmarks={bookmarksQuery.data ?? []} bookmarksLoading={bookmarksQuery.isLoading} bookmarksError={bookmarksQuery.error} onOpenForwardBundle={(message) => setForwardDetailMessage(message)} onMobileSecondaryActiveChange={handleMobileDetailActiveChange} onOpenMobileBots={openSharedBotCenter} onOpenMobileFeature={openMobileFeatureSecondary} onOpenMobileMenuSettings={openMobileMenuSettings} /> : null}
            {!isSettingsRailRoute && workspaceView === 'favorites' ? <FavoritesPanel conversations={conversations} currentUser={currentUser} items={bookmarksQuery.data ?? []} isLoading={bookmarksQuery.isLoading} error={bookmarksQuery.error} isMobile={isMobile} onOpenForwardBundle={(message) => setForwardDetailMessage(message)} /> : null}
            {!isSettingsRailRoute && workspaceView === 'teamup' ? <TeamupCenterPanel currentUser={currentUser} friends={friends} isMobile={isMobile} /> : null}
            {!isSettingsRailRoute && workspaceView === 'tasks' ? <TaskCenterPanel currentUser={currentUser} isMobile={isMobile} /> : null}
            {!isSettingsRailRoute && workspaceView === 'bots' ? <BotCenterPanel conversations={conversations} isMobile={isMobile} onMobileBack={isMobile ? () => replaceMobileRoute('space', 'back') : undefined} onOpenMobileConversation={isMobile ? openSharedConversation : openConversationFromMobileSurface} onOpenBotDetail={isMobile ? openSharedBotDetail : undefined} onOpenMobileBotEditor={isMobile ? openSharedBotEditor : undefined} onOpenUserProfile={isMobile ? openSharedUserProfile : undefined} /> : null}
            {!isSettingsRailRoute && workspaceView === 'home' ? <HomePanel currentUser={currentUser} conversations={conversations} isMobile={isMobile} onOpenConversation={isMobile ? openSharedConversation : (conversationId) => setActiveConversationId(conversationId)} onOpenUserProfile={isMobile ? openSharedUserProfile : (_user, userId) => openUserSpace(userId)} /> : null}
            {!isSettingsRailRoute && workspaceView === 'settings' ? <SettingsPanel user={currentUser} isMobile={isMobile} initialTab={settingsInitialTab} initialMobilePage={settingsInitialMobilePage ?? undefined} focusKey={settingsFocusKey} onLogout={handleLogout} onMobileBack={backFromMobileSettings} onMobileDetailActiveChange={handleMobileDetailActiveChange} /> : null}
          </div>
        </div>
      </main>
      {isMobile ? (
        <nav className={`kc-mobile-glass-nav ${mobileBottomNavShouldHide ? 'kc-mobile-glass-nav-hidden' : ''} ${mobileBottomNavTransitioning ? 'kc-mobile-glass-nav-transitioning' : ''}`} aria-label="主页导航" aria-hidden={!showMobileBottomNav} style={{ '--kc-mobile-nav-index': activeMobileTabIndex, '--kc-settings-swipe-progress': isSettingsRailRoute ? mobileSettingsDragProgress : 0 } as CSSProperties}>
          {renderMobileBottomNavContent(true)}
        </nav>
      ) : null}
      {announcementOpen ? <AnnouncementModal initialId={latestAnnouncement?.id ?? null} mobile={isMobile} onClose={closeAnnouncement} /> : null}
      {showCreateGroup ? <CreateGroupModal friends={friends} mobile={isMobile} onClose={() => setShowCreateGroup(false)} /> : null}
      {isMobile ? mobileSharedSecondaryStack.map((page, index) => {
        const isTop = index === mobileSharedSecondaryStack.length - 1;
        const pageKey = getSharedSecondaryKey(page);
        const transitionStyle = getSharedSecondaryTransitionStyle(pageKey, isTop, mobileSharedClosingKey);
        if (page.type === 'post') {
          return <MobilePostDetailPage key={`shared-post-${index}-${page.postId}`} postId={page.postId} currentUser={currentUser} friendUsers={friends.map((friend) => friend.friend ?? friend.user).filter((user): user is User => Boolean(user) && user.id !== currentUser.id)} topicOptions={postTopicsQuery.data ?? []} isMobile transitionStyle={transitionStyle} onClose={isTop ? closeSharedSecondaryPage : () => undefined} onOpenUserSpace={openSharedUserProfile} onOpenPost={openSharedPostDetail} />;
        }
        if (page.type === 'user') {
          return <MobileUserProfilePage key={`shared-user-${index}-${page.fallbackId}`} user={page.user} fallbackUserId={page.fallbackId} currentUserId={currentUser.id} currentUser={currentUser} transitionStyle={transitionStyle} onOpenUserProfile={openSharedUserProfile} onOpenPost={openSharedPostDetail} onClose={isTop ? closeSharedSecondaryPage : () => undefined} />;
        }
        if (page.type === 'onlineUsers') {
          return createPortal(renderMobileOnlineUsersPage(page, isTop, transitionStyle), getKukePortalRoot(), `shared-online-users-${index}`);
        }
        if (page.type === 'bots') {
          const node = <div className={`fixed inset-0 h-screen w-screen overflow-hidden [background:var(--kc-mobile-bg,#f1f3f8)] ${isTop ? 'pointer-events-auto' : 'pointer-events-none'}`} style={{ zIndex: isTop ? 2147483647 : 2147483645, ...transitionStyle }}><div className="kc-native-app h-full w-full"><BotCenterPanel conversations={conversations} isMobile onMobileBack={isTop ? closeSharedSecondaryPage : undefined} onOpenMobileConversation={openSharedConversation} onOpenBotDetail={openSharedBotDetail} onOpenMobileBotEditor={openSharedBotEditor} onOpenUserProfile={openSharedUserProfile} /></div></div>;
          return createPortal(node, getKukePortalRoot(), `shared-bots-${index}`);
        }
        if (page.type === 'home') {
          const node = <div className={`fixed inset-0 h-screen w-screen overflow-hidden [background:var(--kc-mobile-bg,#f1f3f8)] ${isTop ? 'pointer-events-auto' : 'pointer-events-none'}`} style={{ zIndex: isTop ? 2147483647 : 2147483645, ...transitionStyle }}><div className="kc-native-app h-full w-full"><HomePanel currentUser={currentUser} conversations={conversations} isMobile onMobileBack={isTop ? closeSharedSecondaryPage : undefined} onOpenConversation={openSharedConversation} onOpenUserProfile={openSharedUserProfile} /></div></div>;
          return createPortal(node, getKukePortalRoot(), `shared-home-${index}`);
        }
        if (page.type === 'announcement') {
          const node = <AnnouncementModal mobile initialId={latestAnnouncement?.id ?? null} onClose={isTop ? closeSharedSecondaryPage : () => undefined} />;
          return createPortal(node, getKukePortalRoot(), `shared-announcement-${index}`);
        }
        if (page.type === 'teamup') {
          const node = <div className={`fixed inset-0 h-screen w-screen overflow-hidden [background:var(--kc-mobile-bg,#f1f3f8)] ${isTop ? 'pointer-events-auto' : 'pointer-events-none'}`} style={{ zIndex: isTop ? 2147483647 : 2147483645, ...transitionStyle }}><div className="kc-native-app h-full w-full"><TeamupCenterPanel currentUser={currentUser} friends={friends} isMobile onMobileBack={isTop ? closeSharedSecondaryPage : undefined} /></div></div>;
          return createPortal(node, getKukePortalRoot(), `shared-teamup-${index}`);
        }
        if (page.type === 'tasks') {
          const node = <div className={`fixed inset-0 h-screen w-screen overflow-hidden [background:var(--kc-mobile-bg,#f1f3f8)] ${isTop ? 'pointer-events-auto' : 'pointer-events-none'}`} style={{ zIndex: isTop ? 2147483647 : 2147483645, ...transitionStyle }}><div className="kc-native-app h-full w-full"><TaskCenterPanel currentUser={currentUser} isMobile onMobileBack={isTop ? closeSharedSecondaryPage : undefined} /></div></div>;
          return createPortal(node, getKukePortalRoot(), `shared-tasks-${index}`);
        }
        if (page.type === 'favorites') {
          const node = <div className={`fixed inset-0 h-screen w-screen overflow-hidden [background:var(--kc-mobile-bg,#f1f3f8)] ${isTop ? 'pointer-events-auto' : 'pointer-events-none'}`} style={{ zIndex: isTop ? 2147483647 : 2147483645, ...transitionStyle }}><div className="kc-native-app h-full w-full"><FavoritesPanel conversations={conversations} currentUser={currentUser} items={bookmarksQuery.data ?? []} isLoading={bookmarksQuery.isLoading} error={bookmarksQuery.error} isMobile onOpenForwardBundle={(message) => setForwardDetailMessage(message)} onMobileBack={isTop ? closeSharedSecondaryPage : undefined} /></div></div>;
          return createPortal(node, getKukePortalRoot(), `shared-favorites-${index}`);
        }
        if (page.type === 'bot') {
          const node = <div className={`fixed inset-0 h-screen w-screen overflow-hidden [background:var(--kc-mobile-bg,#f1f3f8)] ${isTop ? 'pointer-events-auto' : 'pointer-events-none'}`} style={{ zIndex: isTop ? 2147483647 : 2147483645, ...transitionStyle }}><div className="kc-native-app h-full w-full"><BotDetailPanel botId={page.botId} conversations={conversations} isMobile onBack={isTop ? closeSharedSecondaryPage : undefined} onOpenMobileConversation={openSharedConversation} onOpenUserProfile={openSharedUserProfile} onEdit={(bot) => openSharedBotEditor('edit', bot)} onDeleted={closeSharedSecondaryPage} onKey={() => undefined} /></div></div>;
          return createPortal(node, getKukePortalRoot(), `shared-bot-${index}-${page.botId}`);
        }
        if (page.type === 'botEditor') {
          const node = <div className={`fixed inset-0 h-screen w-screen overflow-hidden [background:var(--kc-mobile-bg,#f1f3f8)] ${isTop ? 'pointer-events-auto' : 'pointer-events-none'}`} style={{ zIndex: isTop ? 2147483647 : 2147483645, ...transitionStyle }}><div className="kc-native-app h-full w-full"><BotEditorPage mode={page.mode} bot={page.bot} onBack={isTop ? closeSharedSecondaryPage : () => undefined} /></div></div>;
          return createPortal(node, getKukePortalRoot(), `shared-bot-editor-${index}-${page.mode}-${page.bot?.id ?? 'new'}`);
        }
        const conversation = conversations.find((item) => item.id === page.conversationId) ?? (optimisticConversation?.id === page.conversationId ? optimisticConversation : null) ?? activeConversation;
        const conversationMembers = conversation?.id === activeConversation?.id ? visibleMembers : conversation?.members ?? [];
        const node = conversation ? <div className={`fixed inset-0 h-screen w-screen overflow-hidden [background:var(--kc-chat)] ${isTop ? 'pointer-events-auto' : 'pointer-events-none'}`} style={{ zIndex: isTop ? 2147483647 : 2147483645, ...transitionStyle }}><div className="kc-native-app h-full w-full"><MessagePanel conversations={[conversation]} currentUser={currentUser} currentRole={currentRole} members={conversationMembers} friends={friends} membersLoading={conversation.id === activeConversation?.id ? membersLoading : false} membersHasMore={conversation.id === activeConversation?.id ? membersHasMore : false} membersLoadingMore={conversation.id === activeConversation?.id ? membersLoadingMore : false} isMobile mobileBackUnreadCount={mobileChatBackUnreadCount} onMembersNeeded={loadActiveConversationMembers} onLoadMoreMembers={loadMoreActiveConversationMembers} onMemberSearchChange={updateActiveMemberSearch} onOpenPost={openSharedPostDetail} onBack={isTop ? closeSharedSecondaryPage : undefined} /></div></div> : null;
        return node ? createPortal(node, getKukePortalRoot(), `shared-conversation-${index}-${page.conversationId}`) : null;
      }) : null}
      {isMobile && mobileBottomNavExitSnapshotVisible ? createPortal(
        <nav key={mobileBottomNavExitSnapshotId} className="kc-mobile-glass-nav kc-mobile-glass-nav-exit-snapshot" aria-hidden="true" style={{ '--kc-mobile-nav-index': mobileBottomNavExitSnapshotIndex, '--kc-settings-swipe-progress': 0 } as CSSProperties}>
          {renderMobileBottomNavContent(false, mobileBottomNavExitSnapshotView)}
        </nav>,
        getKukePortalRoot(),
        'mobile-bottom-nav-exit-snapshot'
      ) : null}
      {recommendedGroupJoinRequest ? <RecommendedGroupJoinModal request={recommendedGroupJoinRequest} conversations={conversations} /> : null}
      {recommendedFriendRequest ? <RecommendedFriendModal request={recommendedFriendRequest} onClose={closeRecommendedFriendRequest} /> : null}
      {inviteToken ? <InviteModal token={inviteToken} onClose={() => setInviteToken(null)} /> : null}
      {globalSearchKeyword !== null ? <GlobalSearchModal currentUser={currentUser} friends={friends} initialKeyword={globalSearchKeyword} mobile={isMobile} onOpenConversation={isMobile ? openConversationFromMobileSurface : undefined} onClose={() => setGlobalSearchKeyword(null)} /> : null}
      {forwardDetailMessage ? <ForwardBundleDetailModal message={forwardDetailMessage} mobile={isMobile} onClose={() => setForwardDetailMessage(null)} /> : null}
      {showCcwBindingPrompt ? <CcwBindingPromptModal mobile={isMobile} onClose={() => setShowCcwBindingPrompt(false)} onOpenBinding={openCcwSettingsFromPrompt} /> : null}
    </div>
  );
}
