import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_THEME_SETTINGS, sanitizeThemeSettings, type ThemeSettings } from '@/theme/themes';
import { DEFAULT_MOBILE_FEATURE_ORDER, normalizeMobileFeatureOrder, type MobileFeatureId } from '@/mobile/features';
import type { AccountSuspension, User } from '@/types/api';
import type { LevelTab } from '@/types/level';
import { isTauriDesktopApp } from '@/utils/appMode';

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export type WorkspaceView = 'chat' | 'contacts' | 'posts' | 'space' | 'favorites' | 'bots' | 'home' | 'teamup' | 'tasks' | 'jury' | 'shop' | 'level' | 'ranking' | 'settings';
/** 排行榜页（components/ranking）的页签：活跃榜、心意榜、风纪榜 */
export type RankingBoard = 'level' | 'charm' | 'intimacy' | 'jury';
export type TaskCenterScope = 'assigned' | 'watching' | 'created' | 'all' | 'activity';
/** 风纪页里的板块。板块的名称、分组和可见性在 src/components/jury/sections.ts 登记。 */
export type JurySection = 'overview' | 'desk' | 'practice' | 'mine' | 'bulletin' | 'handbook' | 'ranking' | 'forum' | 'senior';
/** 从别处直达风纪页时带的参数：去哪个板块、要不要直接打开某个案件、板块内的页签。 */
export interface JuryRoute {
  section: JurySection;
  caseId?: number | null;
  tab?: string | null;
  /** 板块内打开的另一类条目：议事厅的帖子、规则手册里的判例 */
  itemId?: number | null;
}
/** 桌面设置页里能从外面直达的页签（完整列表见 DesktopSettingsPanel）。 */
export type SettingsEntryTab = 'account' | 'ccw' | 'penalties' | 'reports';
export type ThemeMode = 'system' | 'light' | 'dark';
export type NotificationMode = 'on' | 'off';
export type LayoutMode = 'desktop' | 'mobile';
export type LayoutModeSource = 'auto' | 'manual';
export type UiFontScale = 0 | 1 | 2 | 3 | 4;

export interface RecommendedGroupJoinRequest {
  id: number;
  groupId: number;
  extraMessage: string;
}

export interface RecommendedFriendRequest {
  id: number;
  userId: number;
  extraMessage: string;
}

interface KukeChatState {
  token: string | null;
  currentUser: User | null;
  accountSuspension: AccountSuspension | null;
  unreadCount: number;
  onlineCount: number;
  isOpen: boolean;
  isMinimized: boolean;
  isFullscreen: boolean;
  position: Point;
  minimizedPosition: Point;
  size: Size;
  activeConversationId: number | null;
  visibleConversationId: number | null;
  searchableConversationIds: number[];
  pendingJumpMessage: { conversationId: number; messageId: number } | null;
  workspaceView: WorkspaceView;
  themeMode: ThemeMode;
  themeSettings: ThemeSettings;
  uiFontScale: UiFontScale;
  layoutMode: LayoutMode;
  layoutModeSource: LayoutModeSource;
  browserNotificationMode: NotificationMode;
  soundNotificationMode: NotificationMode;
  mobileFeatureOrder: MobileFeatureId[];
  recommendedGroupJoinRequest: RecommendedGroupJoinRequest | null;
  recommendedFriendRequest: RecommendedFriendRequest | null;
  pendingUserSpaceId: number | null;
  pendingPostId: number | null;
  pendingPostSourceUserSpaceId: number | null;
  pendingBotId: number | null;
  pendingTeamupProfileId: number | null;
  pendingTaskId: number | null;
  pendingTaskCreateConversationId: number | null;
  chatTaskDetailId: number | null;
  taskCenterScope: TaskCenterScope;
  pendingJuryRoute: JuryRoute | null;
  pendingSettingsTab: SettingsEntryTab | null;
  /** 移动布局下有人要求打开商店（那边商店是二级页面，由 ChatDashboard 接住后打开） */
  pendingShop: boolean;
  /** 打开商店后要直接亮出来的那件商品（sku）：从「去装扮」「去续期」之类的入口进来时有值，商店页用过就清掉 */
  shopFocusSku: string | null;
  /** 等级页（docs/account-level.md）现在看的页签：我的等级 / 排行榜 */
  levelTab: LevelTab;
  /** 桌面布局下等级页是一个没有导航栏入口的工作区，这里记着从哪儿进来的，点返回时回去 */
  levelReturnView: WorkspaceView;
  /** 移动布局下有人要求打开等级页（那边它是二级页面，由 ChatDashboard 接住后打开） */
  pendingLevel: LevelTab | null;
  /** 排行榜页现在看的是哪个榜 */
  rankingBoard: RankingBoard;
  /** 移动布局下有人要求打开排行榜（那边它是二级页面，由 ChatDashboard 接住后打开） */
  pendingRanking: RankingBoard | null;
  lastSeenAnnouncementId: number | null;
  openWindow: () => void;
  closeWindow: () => void;
  minimizeWindow: () => void;
  restoreWindow: () => void;
  toggleFullscreen: () => void;
  setWindowPosition: (position: Point) => void;
  setMinimizedPosition: (position: Point) => void;
  setWindowSize: (size: Size) => void;
  setSession: (token: string, user: User) => void;
  setCurrentUser: (user: User | null) => void;
  setAccountSuspension: (notice: AccountSuspension | null) => void;
  logout: () => void;
  setUnreadCount: (count: number) => void;
  incrementUnread: () => void;
  setOnlineCount: (count: number) => void;
  setActiveConversationId: (id: number | null) => void;
  setActiveConversationIdOnly: (id: number | null) => void;
  setVisibleConversationId: (id: number | null) => void;
  setSearchableConversationIds: (ids: number[]) => void;
  requestJumpToMessage: (conversationId: number, messageId: number) => void;
  clearPendingJumpMessage: (messageId?: number) => void;
  setWorkspaceView: (view: WorkspaceView) => void;
  setLayoutMode: (mode: LayoutMode) => void;
  toggleLayoutMode: () => void;
  toggleThemeMode: () => void;
  setThemeMode: (mode: ThemeMode) => void;
  updateThemeSettings: (patch: Partial<ThemeSettings>) => void;
  resetThemeSettings: () => void;
  setUiFontScale: (scale: UiFontScale) => void;
  setBrowserNotificationMode: (mode: NotificationMode) => void;
  setSoundNotificationMode: (mode: NotificationMode) => void;
  setMobileFeatureOrder: (order: MobileFeatureId[]) => void;
  openRecommendedGroupJoinRequest: (groupId: number, extraMessage: string) => void;
  closeRecommendedGroupJoinRequest: () => void;
  openRecommendedFriendRequest: (userId: number, extraMessage: string) => void;
  closeRecommendedFriendRequest: () => void;
  openUserSpace: (userId: number) => void;
  clearPendingUserSpace: (userId?: number) => void;
  openPost: (postId: number, sourceUserSpaceId?: number | null) => void;
  clearPendingPost: (postId?: number) => void;
  openBot: (botId: number) => void;
  clearPendingBot: (botId?: number) => void;
  openTeamupProfile: (profileId: number) => void;
  clearPendingTeamupProfile: (profileId?: number) => void;
  openTaskCenter: (scope?: TaskCenterScope) => void;
  openTask: (taskId: number) => void;
  clearPendingTask: (taskId?: number) => void;
  openTaskComposer: (conversationId: number) => void;
  clearPendingTaskCreate: () => void;
  openChatTaskDetail: (taskId: number) => void;
  closeChatTaskDetail: () => void;
  openJury: (route?: JuryRoute) => void;
  clearPendingJuryRoute: () => void;
  openSettingsTab: (tab: SettingsEntryTab) => void;
  clearPendingSettingsTab: () => void;
  /** 从别处直达商店：桌面布局切到商店页，移动布局打开商店的二级页面 */
  openShop: () => void;
  clearPendingShop: () => void;
  /** 打开商店并直达某一件商品（切到它的类别、打开它的试穿面板） */
  openShopItem: (sku: string) => void;
  clearShopFocus: () => void;
  /** 打开等级页：桌面布局切到等级页，移动布局打开等级的二级页面 */
  openLevel: (tab?: LevelTab) => void;
  /** 桌面布局下离开等级页，回到进来之前的那个工作区 */
  closeLevel: () => void;
  setLevelTab: (tab: LevelTab) => void;
  clearPendingLevel: () => void;
  /** 打开排行榜并停在某个榜上：桌面布局切到排行榜工作区（导航栏里有它），移动布局打开排行榜的二级页面 */
  openRanking: (board?: RankingBoard) => void;
  setRankingBoard: (board: RankingBoard) => void;
  clearPendingRanking: () => void;
  setLastSeenAnnouncementId: (id: number) => void;
}

const PERSISTED_STATE_NAME = 'kukechat-extension-state';
const MIN_SIZE: Size = { width: 360, height: 520 };
const DEFAULT_SIZE: Size = { width: 980, height: 680 };
const DEFAULT_POSITION: Point = { x: 64, y: 64 };
type PersistedKukeChatState = Partial<Pick<KukeChatState, 'token' | 'currentUser' | 'position' | 'minimizedPosition' | 'size' | 'themeMode' | 'themeSettings' | 'uiFontScale' | 'layoutMode' | 'layoutModeSource' | 'browserNotificationMode' | 'soundNotificationMode' | 'mobileFeatureOrder' | 'lastSeenAnnouncementId'>>;

function detectInitialLayoutMode(): LayoutMode {
  if (typeof window === 'undefined') {
    return 'desktop';
  }
  if (isTauriDesktopApp()) {
    return 'desktop';
  }
  const userAgent = window.navigator.userAgent.toLowerCase();
  const mobileUa = /android|iphone|ipad|ipod|mobile|windows phone|harmonyos|miuibrowser/.test(userAgent);
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
  const smallViewport = window.matchMedia('(max-width: 640px), (max-height: 620px)').matches;
  const portraitPhoneLike = window.innerWidth <= 820 && window.innerHeight >= window.innerWidth && coarsePointer;
  return mobileUa || smallViewport || portraitPhoneLike ? 'mobile' : 'desktop';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPoint(value: unknown): value is Point {
  return isRecord(value) && typeof value.x === 'number' && Number.isFinite(value.x) && typeof value.y === 'number' && Number.isFinite(value.y);
}

function isSize(value: unknown): value is Size {
  return isRecord(value) && typeof value.width === 'number' && Number.isFinite(value.width) && typeof value.height === 'number' && Number.isFinite(value.height);
}

function sanitizePersistedState(value: unknown): PersistedKukeChatState {
  const persistedState: PersistedKukeChatState = {};

  if (!isRecord(value)) {
    return persistedState;
  }

  if (isTauriDesktopApp()) {
    if (typeof value.token === 'string' && value.token) {
      persistedState.token = value.token;
    }

    if (isRecord(value.currentUser) && typeof value.currentUser.id === 'number' && typeof value.currentUser.username === 'string') {
      persistedState.currentUser = value.currentUser as unknown as User;
    }
  }

  if (isPoint(value.position)) {
    persistedState.position = { x: value.position.x, y: value.position.y };
  }

  if (isPoint(value.minimizedPosition)) {
    persistedState.minimizedPosition = { x: value.minimizedPosition.x, y: value.minimizedPosition.y };
  }

  if (!persistedState.minimizedPosition && persistedState.position) {
    persistedState.minimizedPosition = { ...persistedState.position };
  }

  if (isSize(value.size)) {
    persistedState.size = { width: value.size.width, height: value.size.height };
  }

  if (value.themeMode === 'system' || value.themeMode === 'light' || value.themeMode === 'dark') {
    persistedState.themeMode = value.themeMode;
  }

  if (isRecord(value.themeSettings)) {
    persistedState.themeSettings = sanitizeThemeSettings(value.themeSettings);
  }

  if (typeof value.uiFontScale === 'number' && Number.isInteger(value.uiFontScale) && value.uiFontScale >= 0 && value.uiFontScale <= 4) {
    persistedState.uiFontScale = value.uiFontScale as UiFontScale;
  }

  if (value.layoutMode === 'desktop' || value.layoutMode === 'mobile') {
    persistedState.layoutMode = value.layoutMode;
  }

  if (value.layoutModeSource === 'auto' || value.layoutModeSource === 'manual') {
    persistedState.layoutModeSource = value.layoutModeSource;
  }

  if (value.browserNotificationMode === 'on' || value.browserNotificationMode === 'off') {
    persistedState.browserNotificationMode = value.browserNotificationMode;
  }

  if (typeof value.lastSeenAnnouncementId === 'number' && Number.isFinite(value.lastSeenAnnouncementId)) {
    persistedState.lastSeenAnnouncementId = value.lastSeenAnnouncementId;
  }

  if (value.soundNotificationMode === 'on' || value.soundNotificationMode === 'off') {
    persistedState.soundNotificationMode = value.soundNotificationMode;
  }

  if (Array.isArray(value.mobileFeatureOrder)) {
    persistedState.mobileFeatureOrder = normalizeMobileFeatureOrder(value.mobileFeatureOrder);
  }

  return persistedState;
}

function scrubPersistedAuthState(): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const rawState = window.localStorage.getItem(PERSISTED_STATE_NAME);
    if (!rawState) {
      return;
    }

    const parsedState = JSON.parse(rawState) as unknown;
    if (!isRecord(parsedState) || !isRecord(parsedState.state)) {
      return;
    }

    const hasPersistedAuth = !isTauriDesktopApp() && ('token' in parsedState.state || 'currentUser' in parsedState.state);
    if (!hasPersistedAuth && parsedState.version === 1) {
      return;
    }

    window.localStorage.setItem(
      PERSISTED_STATE_NAME,
      JSON.stringify({
        ...parsedState,
        state: sanitizePersistedState(parsedState.state),
        version: 1
      })
    );
  } catch {
    // Ignore inaccessible or malformed storage; merge also refuses auth fields.
  }
}

function clampSize(size: Size): Size {
  if (typeof window === 'undefined') {
    return {
      width: Math.max(size.width, MIN_SIZE.width),
      height: Math.max(size.height, MIN_SIZE.height)
    };
  }

  const maxWidth = Math.max(MIN_SIZE.width, window.innerWidth - 24);
  const maxHeight = Math.max(MIN_SIZE.height, window.innerHeight - 24);

  return {
    width: Math.min(Math.max(size.width, MIN_SIZE.width), maxWidth),
    height: Math.min(Math.max(size.height, MIN_SIZE.height), maxHeight)
  };
}

scrubPersistedAuthState();

export const useKukeStore = create<KukeChatState>()(
  persist<KukeChatState, [], [], PersistedKukeChatState>(
    (set) => ({
      token: null,
      currentUser: null,
      accountSuspension: null,
      unreadCount: 0,
      onlineCount: 0,
      isOpen: false,
      isMinimized: false,
      isFullscreen: false,
      position: DEFAULT_POSITION,
      minimizedPosition: DEFAULT_POSITION,
      size: DEFAULT_SIZE,
      activeConversationId: null,
      visibleConversationId: null,
      searchableConversationIds: [],
      pendingJumpMessage: null,
      pendingBotId: null,
      workspaceView: 'chat',
      themeMode: 'system',
      themeSettings: DEFAULT_THEME_SETTINGS,
      uiFontScale: 1,
      layoutMode: detectInitialLayoutMode(),
      layoutModeSource: 'auto',
      browserNotificationMode: 'off',
      soundNotificationMode: 'on',
      mobileFeatureOrder: DEFAULT_MOBILE_FEATURE_ORDER,
      recommendedGroupJoinRequest: null,
      recommendedFriendRequest: null,
      pendingUserSpaceId: null,
      pendingPostId: null,
      pendingTeamupProfileId: null,
      pendingTaskId: null,
      pendingTaskCreateConversationId: null,
      chatTaskDetailId: null,
      taskCenterScope: 'assigned',
      pendingJuryRoute: null,
      pendingSettingsTab: null,
      pendingShop: false,
      shopFocusSku: null,
      levelTab: 'me',
      levelReturnView: 'chat',
      pendingLevel: null,
      rankingBoard: 'level',
      pendingRanking: null,
      lastSeenAnnouncementId: null,
      pendingPostSourceUserSpaceId: null,
      openWindow: () => set({ isOpen: true, isMinimized: false }),
      closeWindow: () => set({ isOpen: false, isMinimized: false, isFullscreen: false }),
      minimizeWindow: () => set({ isOpen: true, isMinimized: true, isFullscreen: false }),
      restoreWindow: () => set({ isOpen: true, isMinimized: false }),
      toggleFullscreen: () => set((state) => ({ isFullscreen: !state.isFullscreen, isMinimized: false, isOpen: true })),
      setWindowPosition: (position) => set({ position }),
      setMinimizedPosition: (position) => set({ minimizedPosition: position }),
      setWindowSize: (size) => set({ size: clampSize(size) }),
      setSession: (token, user) => set({ token, currentUser: user, unreadCount: 0, accountSuspension: null }),
      setCurrentUser: (user) => set({ currentUser: user }),
      setAccountSuspension: (accountSuspension) => set({ accountSuspension }),
      logout: () =>
        set({
          token: null,
          currentUser: null,
          unreadCount: 0,
          activeConversationId: null,
          visibleConversationId: null,
          pendingJumpMessage: null,
          pendingBotId: null,
          pendingJuryRoute: null,
          pendingSettingsTab: null,
          pendingShop: false,
          shopFocusSku: null,
          pendingLevel: null,
          pendingRanking: null,
          workspaceView: 'chat'
        }),
      setUnreadCount: (count) => set({ unreadCount: Math.max(0, count) }),
      incrementUnread: () => set((state) => ({ unreadCount: state.unreadCount + 1 })),
      setOnlineCount: (count) => set({ onlineCount: Math.max(0, Math.floor(count)) }),
      setActiveConversationId: (id) => set({ activeConversationId: id, workspaceView: 'chat' }),
      setActiveConversationIdOnly: (id) => set({ activeConversationId: id }),
      setVisibleConversationId: (id) => set({ visibleConversationId: id }),
      setSearchableConversationIds: (ids) => set({ searchableConversationIds: Array.from(new Set(ids.filter((id) => Number.isFinite(id) && id > 0))) }),
      requestJumpToMessage: (conversationId, messageId) => set({ activeConversationId: conversationId, workspaceView: 'chat', pendingJumpMessage: { conversationId, messageId } }),
      clearPendingJumpMessage: (messageId) => set((state) => {
        if (!state.pendingJumpMessage || (messageId !== undefined && state.pendingJumpMessage.messageId !== messageId)) {
          return {};
        }
        return { pendingJumpMessage: null };
      }),
      setWorkspaceView: (view) => set({ workspaceView: view }),
      // 风纪页只有桌面布局，商店和等级页在移动布局下是二级页面：切到移动布局时如果正停在它们上面，退回聊天
      setLayoutMode: (mode) => set((state) => ({ layoutMode: mode, layoutModeSource: 'manual', isFullscreen: false, ...(mode === 'mobile' && (state.workspaceView === 'jury' || state.workspaceView === 'shop' || state.workspaceView === 'level' || state.workspaceView === 'ranking') ? { workspaceView: 'chat' as const } : {}) })),
      toggleLayoutMode: () => set((state) => ({ layoutMode: state.layoutMode === 'desktop' ? 'mobile' : 'desktop', layoutModeSource: 'manual', isFullscreen: false, ...(state.layoutMode === 'desktop' && (state.workspaceView === 'jury' || state.workspaceView === 'shop' || state.workspaceView === 'level' || state.workspaceView === 'ranking') ? { workspaceView: 'chat' as const } : {}) })),
      toggleThemeMode: () => set((state) => ({ themeMode: state.themeMode === 'dark' ? 'light' : 'dark' })),
      setThemeMode: (mode) => set({ themeMode: mode }),
      updateThemeSettings: (patch) => set((state) => ({ themeSettings: sanitizeThemeSettings({ ...state.themeSettings, ...patch }) })),
      resetThemeSettings: () => set({ themeSettings: DEFAULT_THEME_SETTINGS }),
      setUiFontScale: (scale) => set({ uiFontScale: scale }),
      setBrowserNotificationMode: (mode) => set({ browserNotificationMode: mode }),
      setSoundNotificationMode: (mode) => set({ soundNotificationMode: mode }),
      setMobileFeatureOrder: (order) => set({ mobileFeatureOrder: normalizeMobileFeatureOrder(order) }),
      openRecommendedGroupJoinRequest: (groupId, extraMessage) => set({
        isOpen: true,
        isMinimized: false,
        recommendedGroupJoinRequest: {
          id: Date.now(),
          groupId,
          extraMessage: extraMessage.trim()
        }
      }),
      closeRecommendedGroupJoinRequest: () => set({ recommendedGroupJoinRequest: null })
      ,
      openRecommendedFriendRequest: (userId, extraMessage) => set({
        isOpen: true,
        isMinimized: false,
        recommendedFriendRequest: {
          id: Date.now(),
          userId,
          extraMessage: extraMessage.trim()
        }
      }),
      closeRecommendedFriendRequest: () => set({ recommendedFriendRequest: null }),
      openUserSpace: (userId) => set((state) => ({ isOpen: true, isMinimized: false, workspaceView: state.layoutMode === 'mobile' ? state.workspaceView : 'posts', pendingUserSpaceId: userId })),
      clearPendingUserSpace: (userId) => set((state) => {
        if (userId !== undefined && state.pendingUserSpaceId !== userId) {
          return {};
        }
        return { pendingUserSpaceId: null };
      }),
      openPost: (postId, sourceUserSpaceId = null) => set((state) => ({ isOpen: true, isMinimized: false, workspaceView: state.layoutMode === 'mobile' ? state.workspaceView : 'posts', pendingPostId: postId, pendingPostSourceUserSpaceId: sourceUserSpaceId })),
      clearPendingPost: (postId) => set((state) => {
        if (postId !== undefined && state.pendingPostId !== postId) {
          return {};
        }
        return { pendingPostId: null, pendingPostSourceUserSpaceId: null };
      }),
      openBot: (botId) => set((state) => ({ isOpen: true, isMinimized: false, workspaceView: state.layoutMode === 'mobile' ? state.workspaceView : 'bots', pendingBotId: botId })),
      clearPendingBot: (botId) => set((state) => {
        if (botId !== undefined && state.pendingBotId !== botId) {
          return {};
        }
        return { pendingBotId: null };
      }),
      openTeamupProfile: (profileId) => set({ isOpen: true, isMinimized: false, workspaceView: 'teamup', pendingTeamupProfileId: profileId }),
      clearPendingTeamupProfile: (profileId) => set((state) => {
        if (profileId !== undefined && state.pendingTeamupProfileId !== profileId) {
          return {};
        }
        return { pendingTeamupProfileId: null };
      }),
      openTaskCenter: (scope) => set({ isOpen: true, isMinimized: false, workspaceView: 'tasks', taskCenterScope: scope ?? 'assigned' }),
      openTask: (taskId) => set({ isOpen: true, isMinimized: false, workspaceView: 'tasks', pendingTaskId: taskId }),
      clearPendingTask: (taskId) => set((state) => {
        if (taskId !== undefined && state.pendingTaskId !== taskId) {
          return {};
        }
        return { pendingTaskId: null };
      }),
      openTaskComposer: (conversationId) => set({ pendingTaskCreateConversationId: conversationId }),
      clearPendingTaskCreate: () => set({ pendingTaskCreateConversationId: null }),
      openChatTaskDetail: (taskId) => set({ chatTaskDetailId: taskId }),
      closeChatTaskDetail: () => set({ chatTaskDetailId: null }),
      // 移动端还没有风纪页，那边调用时什么都不做
      openJury: (route) => set((state) => (state.layoutMode === 'mobile' ? {} : { isOpen: true, isMinimized: false, workspaceView: 'jury', pendingJuryRoute: route ?? null })),
      clearPendingJuryRoute: () => set({ pendingJuryRoute: null }),
      openSettingsTab: (tab) => set((state) => (state.layoutMode === 'mobile' ? {} : { isOpen: true, isMinimized: false, workspaceView: 'settings', pendingSettingsTab: tab })),
      clearPendingSettingsTab: () => set({ pendingSettingsTab: null }),
      openShop: () => set((state) => (state.layoutMode === 'mobile' ? { isOpen: true, isMinimized: false, pendingShop: true } : { isOpen: true, isMinimized: false, workspaceView: 'shop' })),
      clearPendingShop: () => set({ pendingShop: false }),
      openShopItem: (sku) => set((state) => (state.layoutMode === 'mobile' ? { isOpen: true, isMinimized: false, pendingShop: true, shopFocusSku: sku } : { isOpen: true, isMinimized: false, workspaceView: 'shop', shopFocusSku: sku })),
      clearShopFocus: () => set({ shopFocusSku: null }),
      // 活跃榜搬进了排行榜页：要看「排行榜」页签的调用方直接去排行榜的活跃榜
      openLevel: (tab = 'me') => set((state) => (tab === 'board'
        ? (state.layoutMode === 'mobile' ? { isOpen: true, isMinimized: false, pendingRanking: 'level' as const } : { isOpen: true, isMinimized: false, workspaceView: 'ranking' as const, rankingBoard: 'level' as const })
        : state.layoutMode === 'mobile'
        ? { isOpen: true, isMinimized: false, pendingLevel: tab }
        : { isOpen: true, isMinimized: false, workspaceView: 'level', levelTab: tab, levelReturnView: state.workspaceView === 'level' ? state.levelReturnView : state.workspaceView })),
      closeLevel: () => set((state) => (state.workspaceView === 'level' ? { workspaceView: state.levelReturnView === 'level' ? 'chat' : state.levelReturnView } : {})),
      setLevelTab: (levelTab) => set({ levelTab }),
      clearPendingLevel: () => set({ pendingLevel: null }),
      openRanking: (board) => set((state) => (state.layoutMode === 'mobile'
        ? { isOpen: true, isMinimized: false, pendingRanking: board ?? state.rankingBoard }
        : { isOpen: true, isMinimized: false, workspaceView: 'ranking', rankingBoard: board ?? state.rankingBoard })),
      setRankingBoard: (rankingBoard) => set({ rankingBoard }),
      clearPendingRanking: () => set({ pendingRanking: null }),
      setLastSeenAnnouncementId: (id) => set((state) => ({ lastSeenAnnouncementId: Math.max(id, state.lastSeenAnnouncementId ?? 0) }))
    }),
    {
      name: PERSISTED_STATE_NAME,
      version: 1,
      migrate: (persistedState) => sanitizePersistedState(persistedState),
      merge: (persistedState, currentState) => {
        const safeState = sanitizePersistedState(persistedState);
        const persistedLayout = safeState.layoutModeSource === 'manual' ? safeState.layoutMode : undefined;
        return {
          ...currentState,
          ...safeState,
          layoutMode: persistedLayout ?? detectInitialLayoutMode(),
          layoutModeSource: persistedLayout ? 'manual' : 'auto',
          token: safeState.token ?? null,
          currentUser: safeState.currentUser ?? null
        };
      },
      partialize: (state) => ({
        ...(isTauriDesktopApp() ? { token: state.token, currentUser: state.currentUser } : {}),
        position: state.position,
        minimizedPosition: state.minimizedPosition,
        size: state.size,
        themeMode: state.themeMode,
        themeSettings: state.themeSettings,
        uiFontScale: state.uiFontScale,
        layoutMode: state.layoutMode,
        layoutModeSource: state.layoutModeSource,
        browserNotificationMode: state.browserNotificationMode,
        soundNotificationMode: state.soundNotificationMode,
        lastSeenAnnouncementId: state.lastSeenAnnouncementId
      })
    }
  )
);
