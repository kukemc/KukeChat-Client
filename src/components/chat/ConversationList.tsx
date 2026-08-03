import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type TouchEvent as ReactTouchEvent } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useKukeStore } from '@/store/kukeStore';
import { updateMyConversationSettings } from '@/api/conversations';
import { createGroupInvite } from '@/api/invites';
import { getOnlineUsers } from '@/api/users';
import type { Conversation, MessageSetting, User } from '@/types/api';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { ContextMenuItem, ContextMenuSurface } from '@/components/ui/ContextMenu';
import { MobileStatusBar } from '@/components/mobile/MobileChrome';
import { updateNativeBackgroundRealtimeConversations } from '@/native/backgroundRealtime';
import { resolveThumbnailUrl } from '@/utils/assetUrl';
import { formatClockTime } from '@/utils/dateTime';
import { isConversationPinnedForMe, sortConversationsByActivity } from '@/utils/conversations';
import { isConversationBlocked, isConversationMuted } from '@/utils/notifications';
import { useResolvedThemeMode } from '@/utils/theme';

function imageCount(conversation: Conversation): number {
  const images = conversation.last_message?.metadata?.images;
  return Array.isArray(images) ? images.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).length : 0;
}

interface ConversationListProps {
  conversations: Conversation[];
  isLoading: boolean;
  currentUser: User;
  onCreateGroup: () => void;
  onOpenGlobalSearch: (keyword?: string) => void;
  variant?: 'desktop' | 'mobile';
  onSelectConversation?: (conversation: Conversation) => void;
  onOpenSettings?: () => void;
  onOpenOnlineUsers?: (users: User[], onlineCount: number) => void;
}

interface ConversationMenuState {
  conversation: Conversation;
  left: number;
  top: number;
}

interface LongPressState {
  x: number;
  y: number;
  conversation: Conversation;
  startedAt: number;
  pointerId?: number;
}

const CONVERSATION_MENU_WIDTH = 220;
const CONVERSATION_MENU_HEIGHT = 108;
const MESSAGE_SUBMENU_WIDTH = 144;
const MESSAGE_SUBMENU_HEIGHT = 104;
const LONG_PRESS_DELAY = 420;

function myMembership(conversation: Conversation, currentUser: User) {
  return conversation.members?.find((member) => member.user_id === currentUser.id || member.user?.id === currentUser.id);
}

function isConversationPinned(conversation: Conversation, currentUser: User, pinnedOverrides: Record<number, boolean>): boolean {
  return pinnedOverrides[conversation.id] ?? (isConversationPinnedForMe(conversation) || Boolean(myMembership(conversation, currentUser)?.pinned));
}

function conversationTitle(conversation: Conversation, currentUser: User): string {
  if (conversation.type === 'group') {
    const title = conversation.display_title?.trim() || conversation.title || '未命名群聊';
    return `${title} (${conversation.member_count ?? 0})`;
  }

  const directMember = conversation.members?.find((member) => member.user_id !== currentUser.id)?.user;
  return conversation.display_title?.trim() || getDisplayName(conversation.direct_user ?? directMember, conversation.title || '私聊');
}

function lastMessage(conversation: Conversation): string {
  const message = conversation.last_message;
  if (!message) {
    return conversation.type === 'group' ? '群聊已创建' : '开始聊天吧';
  }
  if (message.recalled_at) {
    return '消息已撤回';
  }
  const senderPrefix = conversation.type === 'group'
    ? `${message.sender_display_name || message.sender?.nickname || message.sender?.username || '有人'}: `
    : '';
  if (message.type === 'image') {
    return `${senderPrefix}[图片]`;
  }
  if (message.type === 'voice') {
    return `${senderPrefix}[语音]`;
  }
  if (message.type === 'system') {
    return message.content || '系统消息';
  }
  if (message.type === 'forward_bundle') {
    return `${senderPrefix}[聊天记录]`;
  }

  const images = imageCount(conversation);
  if (images > 0) {
    const label = images > 1 ? `[图片] ${images}张图片` : '[图片]';
    return message.content ? `${senderPrefix}${message.content} ${label}` : `${senderPrefix}${label}`;
  }

  return `${senderPrefix}${message.content || '新消息'}`;
}

function fieldText(value?: string | number | null): string {
  return String(value ?? '').trim().toLowerCase();
}

function matchesConversation(conversation: Conversation, currentUser: User, keyword: string): boolean {
  const peer = conversation.direct_user ?? conversation.members?.find((member) => member.user_id !== currentUser.id)?.user;
  const text = [
    conversation.id,
    conversationTitle(conversation, currentUser),
    conversation.title,
    conversation.description,
    conversation.category,
    peer?.id,
    peer?.username,
    peer?.nickname,
    peer?.email,
    peer?.bio
  ].map(fieldText).join(' ');
  return text.includes(keyword);
}

function renderConversationAvatar(conversation: Conversation, title: string, peer?: User | null): JSX.Element {
  if (conversation.type !== 'group') {
    return <Avatar user={peer} />;
  }

  const avatarUrl = resolveThumbnailUrl(conversation.avatar_url);
  if (avatarUrl) {
    return <img src={avatarUrl} alt={title} className="h-10 w-10 rounded-full border object-cover shadow-none [border-color:var(--kc-border)]" />;
  }

  return <Avatar label={title} />;
}

function renderMobileConversationAvatar(conversation: Conversation, title: string, peer?: User | null): JSX.Element {
  if (conversation.type !== 'group') {
    return <Avatar user={peer} />;
  }

  const avatarUrl = resolveThumbnailUrl(conversation.avatar_url);
  if (avatarUrl) {
    return <img src={avatarUrl} alt={title} className="h-11 w-11 rounded-[16px] object-cover" />;
  }

  return <div className="grid h-11 w-11 shrink-0 place-items-center rounded-[16px] bg-[#dcecff] text-base font-semibold text-[#1a73e8]">{title.trim().slice(0, 1) || '群'}</div>;
}

function fallbackCopyText(value: string): void {
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}

function copyText(value: string): void {
  if (navigator.clipboard?.writeText) {
    void navigator.clipboard.writeText(value).catch(() => fallbackCopyText(value));
    return;
  }
  fallbackCopyText(value);
}

function clampOverlayPosition(position: { left: number; top: number }, width: number, height: number): { left: number; top: number } {
  const margin = 8;
  const minLeft = margin;
  const minTop = margin;
  const maxLeft = Math.max(minLeft, window.innerWidth - width - margin);
  const maxTop = Math.max(minTop, window.innerHeight - height - margin);
  return {
    left: Math.min(Math.max(position.left, minLeft), maxLeft),
    top: Math.min(Math.max(position.top, minTop), maxTop)
  };
}

function getKukePortalRoot(): Element | DocumentFragment {
  const host = document.getElementById('kukechat-shadow-host');
  return host?.shadowRoot?.getElementById('kukechat-root') ?? document.body;
}

function currentMessageSetting(conversation: Conversation): MessageSetting {
  if (conversation.my_message_setting === 'ignore') {
    return 'ignore';
  }
  if (conversation.my_do_not_disturb || conversation.my_message_setting === 'silent') {
    return 'silent';
  }
  return conversation.my_message_setting ?? 'notify';
}

function messageSettingLabel(setting: MessageSetting): string {
  if (setting === 'ignore') {
    return '屏蔽消息';
  }
  if (setting === 'silent') {
    return '接收不提醒';
  }
  return '接收并提醒';
}

function messageSettingPayload(setting: MessageSetting): { message_setting: MessageSetting; do_not_disturb: boolean } {
  if (setting === 'ignore') {
    return { message_setting: 'ignore', do_not_disturb: true };
  }
  if (setting === 'silent') {
    return { message_setting: 'silent', do_not_disturb: true };
  }
  return { message_setting: 'notify', do_not_disturb: false };
}

function ConversationStatusIcon({ conversation }: { conversation: Conversation }): JSX.Element | null {
  if (isConversationBlocked(conversation)) {
    return <Icon name="close" className="h-4 w-4 shrink-0 text-[#a8aeb8]" />;
  }
  if (isConversationMuted(conversation)) {
    return <Icon name="bellOff" className="h-4 w-4 shrink-0 text-[#a8aeb8]" />;
  }
  return null;
}

function presenceText(user: User): string {
  if (user.presence_text?.trim()) {
    return user.presence_text.trim();
  }
  if (user.presence_status === 'busy') return '忙碌中';
  if (user.presence_status === 'away') return '离开';
  if (user.presence_status === 'dnd') return '请勿打扰';
  if (user.presence_status === 'creating') return '创作中';
  if (user.presence_status === 'gaming') return '游戏中';
  return '在线';
}

export function ConversationList({ conversations, isLoading, currentUser, onCreateGroup, onOpenGlobalSearch, variant = 'desktop', onSelectConversation, onOpenSettings, onOpenOnlineUsers }: ConversationListProps): JSX.Element {
  const activeConversationId = useKukeStore((state) => state.activeConversationId);
  const visibleConversationId = useKukeStore((state) => state.visibleConversationId);
  const setActiveConversationId = useKukeStore((state) => state.setActiveConversationId);
  const themeMode = useKukeStore((state) => state.themeMode);
  const resolvedThemeMode = useResolvedThemeMode(themeMode);
  const layoutMode = useKukeStore((state) => state.layoutMode);
  const uiFontScale = useKukeStore((state) => state.uiFontScale);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [conversationMenu, setConversationMenu] = useState<ConversationMenuState | null>(null);
  const [showMessageSubmenu, setShowMessageSubmenu] = useState(false);
  const [pinnedOverrides, setPinnedOverrides] = useState<Record<number, boolean>>({});
  const queryClient = useQueryClient();
  const onlineUsersQuery = useQuery({
    queryKey: ['online-users'],
    queryFn: getOnlineUsers,
    enabled: variant === 'mobile',
    staleTime: 20_000,
    refetchInterval: variant === 'mobile' ? 30_000 : false
  });
  const addMenuRef = useRef<HTMLDivElement | null>(null);
  const submenuCloseTimerRef = useRef<number | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressStartRef = useRef<LongPressState | null>(null);
  const suppressNextClickRef = useRef(false);
  const cleanSearchQuery = searchQuery.trim().toLowerCase();
  const filteredConversations = sortConversationsByActivity(cleanSearchQuery ? conversations.filter((conversation) => matchesConversation(conversation, currentUser, cleanSearchQuery)) : conversations);
  const groupSettingsMutation = useMutation({
    mutationFn: ({ conversationId, payload }: { conversationId: number; payload: { pinned?: boolean; do_not_disturb?: boolean; message_setting?: MessageSetting } }) => updateMyConversationSettings(conversationId, payload),
    onSuccess: (_member, variables) => {
      let conversations: Conversation[] | undefined;
      queryClient.setQueryData<Conversation[]>(['conversations'], (current) => {
        if (!current) return current;
        conversations = sortConversationsByActivity(current.map((conversation) => (conversation.id === variables.conversationId ? {
          ...conversation,
          ...('pinned' in variables.payload ? { my_pinned: variables.payload.pinned } : {}),
          ...('do_not_disturb' in variables.payload ? { my_do_not_disturb: variables.payload.do_not_disturb } : {}),
          ...('message_setting' in variables.payload ? { my_message_setting: variables.payload.message_setting } : {})
        } : conversation)));
        return conversations ?? current;
      });
      if (conversations) {
        void updateNativeBackgroundRealtimeConversations(conversations);
      }
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: (_error, variables) => {
      if (typeof variables.payload.pinned === 'boolean') {
        setPinnedOverrides((current) => {
          const next = { ...current };
          delete next[variables.conversationId];
          return next;
        });
      }
    }
  });
  const groupShareMutation = useMutation({
    mutationFn: createGroupInvite,
    onSuccess: (link) => copyText(link.url)
  });

  useEffect(() => {
    if (!showAddMenu) {
      return;
    }

    function handlePointerDown(event: globalThis.MouseEvent): void {
      if (addMenuRef.current && event.target instanceof Node && !addMenuRef.current.contains(event.target)) {
        setShowAddMenu(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [showAddMenu]);

  useEffect(() => {
    if (!conversationMenu) {
      return;
    }

    function closeOnEscape(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setConversationMenu(null);
        setShowMessageSubmenu(false);
      }
    }

    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [conversationMenu]);

  function openGlobalSearch(keyword = searchQuery): void {
    onOpenGlobalSearch(keyword.trim());
    setShowAddMenu(false);
  }

  function openConversationContextMenu(event: ReactMouseEvent<HTMLElement>, conversation: Conversation): void {
    event.preventDefault();
    setShowMessageSubmenu(false);
    setConversationMenu({ conversation, left: event.clientX, top: event.clientY });
  }

  function clearConversationLongPress(): void {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressStartRef.current = null;
  }

  function triggerConversationLongPress(): void {
    const start = longPressStartRef.current;
    if (!start) {
      return;
    }
    suppressNextClickRef.current = true;
    setShowAddMenu(false);
    setShowMessageSubmenu(false);
    setConversationMenu({ conversation: start.conversation, left: start.x, top: start.y });
    navigator.vibrate?.(8);
    clearConversationLongPress();
  }

  function startConversationLongPress(event: ReactPointerEvent<HTMLElement>, conversation: Conversation): void {
    if (variant !== 'mobile' || event.pointerType === 'mouse') {
      return;
    }
    clearConversationLongPress();
    longPressStartRef.current = { x: event.clientX, y: event.clientY, conversation, startedAt: Date.now(), pointerId: event.pointerId };
    longPressTimerRef.current = window.setTimeout(triggerConversationLongPress, LONG_PRESS_DELAY);
  }

  function startConversationTouchLongPress(event: ReactTouchEvent<HTMLElement>, conversation: Conversation): void {
    if (variant !== 'mobile' || event.touches.length !== 1) {
      return;
    }
    const touch = event.touches[0];
    clearConversationLongPress();
    longPressStartRef.current = { x: touch.clientX, y: touch.clientY, conversation, startedAt: Date.now(), pointerId: touch.identifier };
    longPressTimerRef.current = window.setTimeout(triggerConversationLongPress, LONG_PRESS_DELAY);
  }

  function moveConversationLongPress(event: ReactPointerEvent<HTMLElement>): void {
    const start = longPressStartRef.current;
    if (!start) {
      return;
    }
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) {
      clearConversationLongPress();
    }
  }

  function finishConversationLongPress(event?: ReactPointerEvent<HTMLElement> | ReactTouchEvent<HTMLElement>): void {
    const start = longPressStartRef.current;
    if (start && Date.now() - start.startedAt >= LONG_PRESS_DELAY - 30) {
      event?.preventDefault();
      event?.stopPropagation();
      triggerConversationLongPress();
      return;
    }
    clearConversationLongPress();
  }

  function moveConversationTouchLongPress(event: ReactTouchEvent<HTMLElement>): void {
    const start = longPressStartRef.current;
    const touch = event.touches[0];
    if (!start || !touch) {
      return;
    }
    if (Math.hypot(touch.clientX - start.x, touch.clientY - start.y) > 10) {
      clearConversationLongPress();
    }
  }

  function updateMenuConversation(conversationId: number, payload: { pinned?: boolean; do_not_disturb?: boolean; message_setting?: MessageSetting }): void {
    if (typeof payload.pinned === 'boolean') {
      setPinnedOverrides((current) => ({ ...current, [conversationId]: payload.pinned as boolean }));
    }
    groupSettingsMutation.mutate({ conversationId, payload });
    setConversationMenu(null);
    setShowMessageSubmenu(false);
  }

  function shareGroup(conversationId: number): void {
    groupShareMutation.mutate(conversationId);
    setConversationMenu(null);
    setShowMessageSubmenu(false);
  }

  function openMessageSubmenu(): void {
    if (submenuCloseTimerRef.current !== null) {
      window.clearTimeout(submenuCloseTimerRef.current);
      submenuCloseTimerRef.current = null;
    }
    setShowMessageSubmenu(true);
  }

  function closeMessageSubmenuSoon(): void {
    if (submenuCloseTimerRef.current !== null) {
      window.clearTimeout(submenuCloseTimerRef.current);
    }
    submenuCloseTimerRef.current = window.setTimeout(() => setShowMessageSubmenu(false), 120);
  }

  function closeMessageSubmenuNow(): void {
    if (submenuCloseTimerRef.current !== null) {
      window.clearTimeout(submenuCloseTimerRef.current);
      submenuCloseTimerRef.current = null;
    }
    setShowMessageSubmenu(false);
  }

  const conversationMenuHeight = conversationMenu?.conversation.type === 'group' ? CONVERSATION_MENU_HEIGHT : CONVERSATION_MENU_HEIGHT - 36;
  const conversationMenuPosition = conversationMenu ? clampOverlayPosition(conversationMenu, CONVERSATION_MENU_WIDTH, conversationMenuHeight) : null;
  const messageSubmenuPosition = conversationMenuPosition
    ? clampOverlayPosition({ left: conversationMenuPosition.left + CONVERSATION_MENU_WIDTH + 8, top: conversationMenuPosition.top + (conversationMenu?.conversation.type === 'group' ? 72 : 40) }, MESSAGE_SUBMENU_WIDTH, MESSAGE_SUBMENU_HEIGHT)
    : null;
  const messageSubmenuBridgePosition = conversationMenuPosition && messageSubmenuPosition ? (() => {
    const menuLeft = conversationMenuPosition.left;
    const menuRight = conversationMenuPosition.left + CONVERSATION_MENU_WIDTH;
    const submenuLeft = messageSubmenuPosition.left;
    const submenuRight = messageSubmenuPosition.left + MESSAGE_SUBMENU_WIDTH;
    const gapLeft = Math.min(menuRight, submenuRight);
    const gapRight = Math.max(menuLeft, submenuLeft);
    if (gapRight <= gapLeft) {
      return null;
    }
    return {
      left: gapLeft,
      top: Math.min(conversationMenuPosition.top, messageSubmenuPosition.top),
      width: gapRight - gapLeft,
      height: Math.max(conversationMenuPosition.top + conversationMenuHeight, messageSubmenuPosition.top + MESSAGE_SUBMENU_HEIGHT) - Math.min(conversationMenuPosition.top, messageSubmenuPosition.top)
    };
  })() : null;
  const onlineUsers = onlineUsersQuery.data?.users ?? [];
  const onlineCount = onlineUsersQuery.data?.online_count ?? onlineUsers.length;
  const conversationContextMenu = conversationMenu && conversationMenuPosition ? createPortal(
    <div data-theme={resolvedThemeMode} data-layout={layoutMode} data-font-scale={uiFontScale} className="pointer-events-auto fixed inset-0 z-[2147483646]" onContextMenu={(event) => event.preventDefault()} onMouseDown={() => {
      setConversationMenu(null);
      setShowMessageSubmenu(false);
    }}>
      <ContextMenuSurface onMouseLeave={closeMessageSubmenuSoon} onMouseDown={(event) => event.stopPropagation()} className="fixed w-[220px] py-1" style={conversationMenuPosition}>
        <ContextMenuItem icon="pin" label={isConversationPinned(conversationMenu.conversation, currentUser, pinnedOverrides) ? '取消置顶' : '设为置顶'} onMouseEnter={closeMessageSubmenuNow} onClick={() => updateMenuConversation(conversationMenu.conversation.id, { pinned: !isConversationPinned(conversationMenu.conversation, currentUser, pinnedOverrides) })} />
        {conversationMenu.conversation.type === 'group' ? <ContextMenuItem icon="share" label="分享群聊" onMouseEnter={closeMessageSubmenuNow} onClick={() => shareGroup(conversationMenu.conversation.id)} /> : null}
        <ContextMenuItem icon="bell" label="消息设置" suffix={messageSettingLabel(currentMessageSetting(conversationMenu.conversation))} pillSuffix onMouseEnter={openMessageSubmenu} onClick={openMessageSubmenu} />
      </ContextMenuSurface>
      {showMessageSubmenu && messageSubmenuBridgePosition ? <div onMouseDown={(event) => event.stopPropagation()} onMouseEnter={openMessageSubmenu} onMouseLeave={closeMessageSubmenuSoon} className="fixed z-0" style={messageSubmenuBridgePosition} /> : null}
      {showMessageSubmenu && messageSubmenuPosition ? (
        <ContextMenuSurface onMouseDown={(event) => event.stopPropagation()} onMouseEnter={openMessageSubmenu} onMouseLeave={closeMessageSubmenuSoon} className="fixed z-20 w-[144px] rounded-xl py-1" style={messageSubmenuPosition}>
          <ContextMenuItem label="接收并提醒" selected={currentMessageSetting(conversationMenu.conversation) === 'notify'} onClick={() => updateMenuConversation(conversationMenu.conversation.id, messageSettingPayload('notify'))} />
          <ContextMenuItem label="接收不提醒" selected={currentMessageSetting(conversationMenu.conversation) === 'silent'} onClick={() => updateMenuConversation(conversationMenu.conversation.id, messageSettingPayload('silent'))} />
          <ContextMenuItem label="屏蔽消息" selected={currentMessageSetting(conversationMenu.conversation) === 'ignore'} onClick={() => updateMenuConversation(conversationMenu.conversation.id, messageSettingPayload('ignore'))} />
        </ContextMenuSurface>
      ) : null}
    </div>,
    getKukePortalRoot()
  ) : null;

  if (variant === 'mobile') {
    return (
      <aside className="kc-qq-page relative h-full min-h-0 overflow-hidden">
        <MobileStatusBar />
        <div className="kc-qq-scroll kc-native-list-scroll scroll-soft h-[calc(100%-30px)] overflow-y-auto px-3.5 pb-4">
          <header className="kc-qq-home-header kc-qq-sticky-home-header">
            <div className="flex min-w-0 items-center gap-2.5">
              <button type="button" onClick={onOpenSettings} className="shrink-0 rounded-full" aria-label="打开设置">
                <Avatar user={currentUser} label={getDisplayName(currentUser)} />
              </button>
              <div className="min-w-0">
                <h1 className="truncate text-[21px] font-bold leading-tight text-[#111827]">{getDisplayName(currentUser)}</h1>
                <p className="mt-0.5 flex items-center gap-1.5 text-[12px] font-medium text-[#8b95a5]"><span className="h-1.5 w-1.5 rounded-full bg-[#39d070]" />在线 · {currentUser.bio?.trim() || '咕咕咕~'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => onOpenOnlineUsers?.(onlineUsers, onlineCount)} className="kc-qq-round-action relative" aria-label="在线用户" title="在线用户">
                <Icon name="users" className="h-5 w-5" />
                <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-black leading-none text-white">{onlineCount > 99 ? '99+' : onlineCount}</span>
              </button>
              <div ref={addMenuRef} className="relative" onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setShowAddMenu(false);
                }
              }}>
                <button type="button" onClick={() => setShowAddMenu((value) => !value)} className="kc-qq-round-action" aria-label="新建" aria-expanded={showAddMenu}>
                  <Icon name="plus" className="h-5 w-5" />
                </button>
              {showAddMenu ? (
                <div className="absolute right-0 top-12 z-20 w-40 overflow-hidden rounded-[20px] bg-white py-1 text-sm font-semibold text-[#111827] shadow-[0_18px_44px_rgba(15,23,42,0.14)]">
                  <button type="button" onMouseDown={(event) => {
                    event.preventDefault();
                    setShowAddMenu(false);
                    onCreateGroup();
                  }} className="flex w-full items-center gap-2 px-4 py-3 text-left transition hover:bg-[#f1f3f8]">
                    <Icon name="users" className="h-4 w-4 text-[#8b95a5]" />
                    创建群聊
                  </button>
                  <button type="button" onMouseDown={(event) => {
                    event.preventDefault();
                    openGlobalSearch('');
                  }} className="flex w-full items-center gap-2 px-4 py-3 text-left transition hover:bg-[#f1f3f8]">
                    <Icon name="search" className="h-4 w-4 text-[#8b95a5]" />
                    加好友/群
                  </button>
                </div>
              ) : null}
              </div>
            </div>
          </header>

          <label className="kc-qq-search-pill">
            <Icon name="search" className="h-4 w-4 shrink-0 text-[#a4adba]" />
            <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} onKeyDown={(event) => {
              if (event.key === 'Enter') {
                openGlobalSearch();
              }
            }} className="min-w-0 flex-1 border-0 bg-transparent text-[14px] font-medium outline-none text-[#111827] placeholder:text-[#a4adba]" placeholder="搜索" />
            <button type="button" onClick={() => openGlobalSearch()} className="rounded-full px-2 py-1 text-xs font-bold text-[#168bff]">全局</button>
          </label>

          <div className="kc-qq-card mt-2.5 overflow-hidden p-0">
            {isLoading ? <p className="p-5 text-sm text-[#8b95a5]">正在加载会话...</p> : null}
            {!isLoading && conversations.length === 0 ? <p className="p-5 text-sm leading-6 text-[#8b95a5]">暂无会话。先在好友页添加好友，再创建私聊或群聊。</p> : null}
            {!isLoading && conversations.length > 0 && filteredConversations.length === 0 ? <p className="p-5 text-sm leading-6 text-[#8b95a5]">没有匹配会话，按 Enter 搜索用户或群聊。</p> : null}
            {filteredConversations.map((conversation) => {
              const active = activeConversationId === conversation.id;
              const title = conversationTitle(conversation, currentUser);
              const peer = conversation.direct_user ?? conversation.members?.find((member) => member.user_id !== currentUser.id)?.user;
              const muted = isConversationMuted(conversation);
              const blocked = isConversationBlocked(conversation);
              const unread = conversation.id !== visibleConversationId ? Math.max(0, conversation.unread_count ?? 0) : 0;

              return (
                <button key={conversation.id} type="button" onContextMenu={(event) => openConversationContextMenu(event, conversation)} onPointerDownCapture={(event) => startConversationLongPress(event, conversation)} onPointerMoveCapture={moveConversationLongPress} onPointerUpCapture={finishConversationLongPress} onPointerCancelCapture={finishConversationLongPress} onTouchStartCapture={(event) => startConversationTouchLongPress(event, conversation)} onTouchMoveCapture={moveConversationTouchLongPress} onTouchEndCapture={finishConversationLongPress} onTouchCancelCapture={finishConversationLongPress} onClickCapture={(event) => {
                  if (suppressNextClickRef.current) {
                    suppressNextClickRef.current = false;
                    event.preventDefault();
                    event.stopPropagation();
                    return;
                  }
                }} onClick={() => {
                  if (suppressNextClickRef.current) {
                    suppressNextClickRef.current = false;
                    return;
                  }
                  if (onSelectConversation) {
                    onSelectConversation(conversation);
                    return;
                  }
                  setActiveConversationId(conversation.id);
                }} className="kc-qq-conversation-item">
                  <span className="relative shrink-0">
                    {renderMobileConversationAvatar(conversation, title, peer)}
                    {unread && !muted && !blocked ? <span className="kc-qq-unread-badge">{unread > 99 ? '99+' : unread}</span> : null}
                  </span>
                  <span className="min-w-0 flex-1 overflow-hidden">
                    <span className="flex min-w-0 items-start justify-between gap-3">
                      <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-[#151922]">{title}</span>
                      <span className="shrink-0 pt-0.5 text-[11px] font-medium text-[#b0b6c0]">{formatClockTime(conversation.updated_at)}</span>
                    </span>
                    <span className="mt-0.5 flex min-w-0 items-center gap-2 overflow-hidden">
                      <span className="min-w-0 flex-1 truncate text-[12px] leading-4 text-[#8b95a5]">{lastMessage(conversation)}</span>
                      <ConversationStatusIcon conversation={conversation} />
                      {conversation.pending_join_request_count ? <span className="rounded-full bg-[#168bff] px-2 py-0.5 text-[10px] font-bold text-white">审 {conversation.pending_join_request_count}</span> : null}
                      {unread && (muted || blocked) ? <span className="kc-qq-unread-badge kc-qq-unread-muted">{unread > 99 ? '99+' : unread}</span> : null}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        {conversationContextMenu}
      </aside>
    );
  }

  return (
    <aside className="kc-pc-conversation-panel relative min-h-0 border-r [background:var(--kc-list)] [border-color:var(--kc-border)]">
      <div className="flex h-[52px] items-center gap-2 px-3">
        <div className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg px-3 [background:var(--kc-panel-muted)]">
          <button type="button" onClick={() => openGlobalSearch()} className="grid h-5 w-5 place-items-center [color:var(--kc-muted)] transition hover:[color:var(--kc-text)]" aria-label="全局搜索">
            <Icon name="search" className="h-4 w-4" />
          </button>
          <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} onKeyDown={(event) => {
            if (event.key === 'Enter') {
              openGlobalSearch();
            }
          }} className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none [color:var(--kc-text)] placeholder:[color:var(--kc-muted)]" placeholder="搜索" />
        </div>
        <div ref={addMenuRef} className="relative" onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setShowAddMenu(false);
          }
        }}>
          <button className={`grid h-8 w-8 place-items-center rounded-lg [background:var(--kc-panel-muted)] transition hover:[color:var(--kc-text)] ${showAddMenu ? '[color:var(--kc-text)]' : '[color:var(--kc-muted)]'}`} type="button" title="新建" aria-expanded={showAddMenu} onClick={() => setShowAddMenu((value) => !value)}>
            <Icon name="plus" className="h-4 w-4" />
          </button>
          {showAddMenu ? (
            <div className="absolute right-0 top-10 z-20 w-40 overflow-hidden rounded-2xl border py-1 text-sm shadow-float [background:var(--kc-panel)] [border-color:var(--kc-border)] [color:var(--kc-text)]">
              <button type="button" onMouseDown={(event) => {
                event.preventDefault();
                setShowAddMenu(false);
                onCreateGroup();
              }} className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition hover:[background:var(--kc-hover)]">
                <Icon name="users" className="h-4 w-4 [color:var(--kc-muted)]" />
                创建群聊
              </button>
              <button type="button" onMouseDown={(event) => {
                event.preventDefault();
                openGlobalSearch('');
              }} className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition hover:[background:var(--kc-hover)]">
                <Icon name="search" className="h-4 w-4 [color:var(--kc-muted)]" />
                加好友/群
              </button>
            </div>
          ) : null}
        </div>
      </div>
      <div className="scroll-soft h-[calc(100%-52px)] overflow-y-auto px-2 pb-2">
        {isLoading ? <p className="rounded-lg p-4 text-sm [color:var(--kc-muted)]">正在加载会话...</p> : null}
        {!isLoading && conversations.length === 0 ? (
          <div className="rounded-xl p-5 text-sm [background:var(--kc-panel-muted)] [color:var(--kc-muted)]">
            暂无会话。先在好友页添加好友，再创建私聊或群聊。
          </div>
        ) : null}
        {!isLoading && conversations.length > 0 && filteredConversations.length === 0 ? (
          <div className="rounded-xl p-4 text-sm [background:var(--kc-panel-muted)] [color:var(--kc-muted)]">
            没有匹配会话，按 Enter 搜索用户或群聊。
          </div>
        ) : null}
        <div className="grid gap-1">
          {filteredConversations.map((conversation) => {
            const active = activeConversationId === conversation.id;
            const title = conversationTitle(conversation, currentUser);
            const peer = conversation.direct_user ?? conversation.members?.find((member) => member.user_id !== currentUser.id)?.user;
            const muted = isConversationMuted(conversation);
            const blocked = isConversationBlocked(conversation);
            const unread = conversation.id !== visibleConversationId ? Math.max(0, conversation.unread_count ?? 0) : 0;

            return (
              <button key={conversation.id} type="button" onContextMenu={(event) => openConversationContextMenu(event, conversation)} onClick={() => {
                setActiveConversationId(conversation.id);
                onSelectConversation?.(conversation);
              }} className={`kc-pc-conversation-item flex w-full min-w-0 items-center gap-3 overflow-hidden rounded-xl px-2 py-2.5 text-left transition ${active ? '[background:var(--kc-active)] [color:var(--kc-text)]' : '[color:var(--kc-text)] hover:[background:var(--kc-hover)]'}`}>
                {renderConversationAvatar(conversation, title, peer)}
                <span className="min-w-0 flex-1 overflow-hidden">
                  <span className="flex min-w-0 items-center justify-between gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</span>
                    <span className="shrink-0 text-[10px] [color:var(--kc-subtle)]">{formatClockTime(conversation.updated_at)}</span>
                  </span>
                  <span className="mt-1 flex min-w-0 items-center gap-2 overflow-hidden">
                    <span className="min-w-0 flex-1 truncate text-xs [color:var(--kc-muted)]">{lastMessage(conversation)}</span>
                    <ConversationStatusIcon conversation={conversation} />
                    {conversation.pending_join_request_count ? <span className="rounded-full bg-[var(--kc-accent)] px-1.5 py-0.5 text-[10px] font-bold text-white">审 {conversation.pending_join_request_count}</span> : null}
                    {unread && !muted && !blocked ? <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{unread > 99 ? '99+' : unread}</span> : null}
                    {unread && (muted || blocked) ? <span className="rounded-full bg-slate-300 px-1.5 py-0.5 text-[10px] font-bold text-white dark:bg-slate-600">{unread > 99 ? '99+' : unread}</span> : null}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
      {conversationContextMenu}
    </aside>
  );
}
