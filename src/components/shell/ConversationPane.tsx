import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PaneResizeHandle } from './paneSizes';
import { FriendBadgeMark } from '@/components/intimacy/FriendBadgeMark';
import { conversationSpark } from '@/components/spark/data';
import { SparkMark } from '@/components/spark/SparkMark';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateMyConversationSettings } from '@/api/conversations';
import { createGroupInvite } from '@/api/invites';
import { conversationTitle, currentMessageSetting, isConversationPinned, lastMessagePreview, matchesConversation, messageSettingPayload } from '@/components/chat/conversationMeta';
import { TypingPreview } from '@/components/chat/desktop/typing/TypingIndicator';
import { copyText } from '@/components/chat/message/chatDom';
import { VirtualConversationList } from '@/components/chat/VirtualConversationList';
import { ConversationPrefixes } from '@/components/chat/ConversationPrefixes';
import { Avatar } from '@/components/ui/Avatar';
import { PlusTierTag } from '@/components/groupPlus/PlusBadge';
import { conversationTier } from '@/components/groupPlus/tier';
import { ContextMenuItem, ContextMenuSeparator, ContextMenuSurface, MenuLayer } from '@/components/ui/ContextMenu';
import { Icon } from '@/components/ui/Icon';
import { useKukeStore } from '@/store/kukeStore';
import { useConversationRowHeight } from '@/theme/useTheme';
import type { Conversation, MessageSetting, User } from '@/types/api';
import { sortConversationsByActivity } from '@/utils/conversations';
import { formatClockTime } from '@/utils/dateTime';
import { isConversationBlocked, isConversationMuted } from '@/utils/notifications';

interface ConversationPaneProps {
  conversations: Conversation[];
  isLoading: boolean;
  currentUser: User;
  onCreateGroup: () => void;
  onOpenGlobalSearch: (keyword?: string) => void;
}

interface MenuState {
  conversation: Conversation;
  left: number;
  top: number;
}

const MENU_WIDTH = 176;
const MENU_HEIGHT = 196;
const MESSAGE_SETTINGS: Array<{ value: MessageSetting; label: string }> = [
  { value: 'notify', label: '接收并提醒' },
  { value: 'silent', label: '接收不提醒' },
  { value: 'ignore', label: '屏蔽消息' }
];

interface RowProps {
  conversation: Conversation;
  currentUser: User;
  active: boolean;
  /** 正开着的会话不显示未读数：消息就在眼前 */
  visible: boolean;
  pinned: boolean;
  onSelect: (conversation: Conversation) => void;
  onContextMenu: (event: React.MouseEvent<HTMLElement>, conversation: Conversation) => void;
}

const ConversationRow = memo(function ConversationRow({ conversation, currentUser, active, visible, pinned, onSelect, onContextMenu }: RowProps): JSX.Element {
  const title = conversationTitle(conversation, currentUser);
  const quiet = isConversationMuted(conversation) || isConversationBlocked(conversation);
  const unread = visible ? 0 : Math.max(0, conversation.unread_count ?? 0);
  const peer = conversation.direct_user ?? conversation.members?.find((member) => member.user_id !== currentUser.id)?.user;
  return (
    <button type="button" className={`ksh-conv${active ? ' is-active' : ''}${pinned ? ' is-pinned' : ''}${unread && !quiet ? ' has-unread' : ''}`} onClick={() => onSelect(conversation)} onContextMenu={(event) => onContextMenu(event, conversation)}>
      {conversation.type === 'group' ? <Avatar avatarUrl={conversation.avatar_url} label={title} toneKey={conversation.id} plusTier={conversationTier(conversation)} /> : <Avatar user={peer} label={title} />}
      <span className="ksh-conv-main">
        <span className="ksh-conv-line">
          <span className="ksh-conv-title"><span className="ksh-conv-name">{title}</span><PlusTierTag tier={conversationTier(conversation)} />{conversation.type === 'direct' ? <><FriendBadgeMark userId={peer?.id} size={15} /><SparkMark spark={conversationSpark(conversation)} friendId={peer?.id} size={14} /></> : null}</span>
          <time className="ksh-conv-time">{formatClockTime(conversation.updated_at)}</time>
        </span>
        <span className="ksh-conv-line">
          <ConversationPrefixes conversation={conversation} />
          <span className="ksh-conv-preview"><TypingPreview conversationId={conversation.id} direct={conversation.type === 'direct'}>{lastMessagePreview(conversation)}</TypingPreview></span>
          {conversation.pending_join_request_count ? <span className="kui-tag kui-tag--accent">待审 {conversation.pending_join_request_count}</span> : null}
          {quiet ? <Icon name={isConversationBlocked(conversation) ? 'close' : 'bellOff'} className="ksh-conv-quiet" /> : null}
          {unread ? <span className={quiet ? 'kui-badge kui-badge--quiet' : 'kui-badge'}>{unread > 99 ? '99+' : unread}</span> : null}
        </span>
      </span>
    </button>
  );
});

/** 桌面端的会话列表栏：搜索、新建、会话列表和会话的右键菜单。 */
function ConversationPaneInner({ conversations, isLoading, currentUser, onCreateGroup, onOpenGlobalSearch }: ConversationPaneProps): JSX.Element {
  const queryClient = useQueryClient();
  const activeConversationId = useKukeStore((state) => state.activeConversationId);
  const visibleConversationId = useKukeStore((state) => state.visibleConversationId);
  const setActiveConversationId = useKukeStore((state) => state.setActiveConversationId);
  const [keyword, setKeyword] = useState('');
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [menu, setMenu] = useState<MenuState | null>(null);
  // 置顶改了要立刻反映到排序上，不等服务端
  const [pinnedOverrides, setPinnedOverrides] = useState<Record<number, boolean>>({});
  const rootRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // 行高跟着外观设置里的界面密度走
  const rowHeight = useConversationRowHeight();
  const addMenuRef = useRef<HTMLDivElement>(null);

  const needle = keyword.trim().toLowerCase();
  const visibleConversations = useMemo(
    () => sortConversationsByActivity(needle ? conversations.filter((conversation) => matchesConversation(conversation, currentUser, needle)) : conversations),
    [conversations, currentUser, needle]
  );

  const settings = useMutation({
    mutationFn: ({ conversationId, payload }: { conversationId: number; payload: { pinned?: boolean; do_not_disturb?: boolean; message_setting?: MessageSetting } }) => updateMyConversationSettings(conversationId, payload),
    onMutate: ({ conversationId, payload }) => {
      if (typeof payload.pinned === 'boolean') {
        setPinnedOverrides((current) => ({ ...current, [conversationId]: payload.pinned as boolean }));
      }
      queryClient.setQueryData<Conversation[] | undefined>(['conversations'], (current) => current && sortConversationsByActivity(current.map((conversation) => (conversation.id === conversationId ? {
        ...conversation,
        ...('pinned' in payload ? { my_pinned: payload.pinned } : {}),
        ...('do_not_disturb' in payload ? { my_do_not_disturb: payload.do_not_disturb } : {}),
        ...('message_setting' in payload ? { my_message_setting: payload.message_setting } : {})
      } : conversation))));
    },
    onSettled: (_data, _error, { conversationId }) => {
      setPinnedOverrides((current) => {
        const { [conversationId]: _removed, ...rest } = current;
        return rest;
      });
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    }
  });
  const shareGroup = useMutation({ mutationFn: createGroupInvite, onSuccess: (link) => copyText(link.url) });

  useEffect(() => {
    if (!addMenuOpen && !menu) {
      return;
    }
    const close = (event: MouseEvent | KeyboardEvent): void => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !(addMenuRef.current && event.composedPath().includes(addMenuRef.current))) {
        setAddMenuOpen(false);
      }
      if (event instanceof KeyboardEvent && event.key === 'Escape') {
        setMenu(null);
      }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [addMenuOpen, menu]);

  const selectConversation = useCallback((conversation: Conversation) => setActiveConversationId(conversation.id), [setActiveConversationId]);
  const openMenu = useCallback((event: React.MouseEvent<HTMLElement>, conversation: Conversation) => {
    event.preventDefault();
    const bounds = rootRef.current?.getBoundingClientRect();
    if (!bounds) {
      return;
    }
    // 菜单相对会话栏定位；纵向别超出栏底
    setMenu({ conversation, left: Math.max(4, Math.min(event.clientX - bounds.left, bounds.width - 12)), top: Math.max(4, Math.min(event.clientY - bounds.top, bounds.height - MENU_HEIGHT - 4)) });
  }, []);

  const renderRow = useCallback((conversation: Conversation) => (
    <ConversationRow
      conversation={conversation}
      currentUser={currentUser}
      active={activeConversationId === conversation.id}
      visible={visibleConversationId === conversation.id}
      pinned={isConversationPinned(conversation, currentUser, pinnedOverrides)}
      onSelect={selectConversation}
      onContextMenu={openMenu}
    />
  ), [activeConversationId, currentUser, openMenu, pinnedOverrides, selectConversation, visibleConversationId]);

  function search(): void {
    onOpenGlobalSearch(keyword.trim());
    setAddMenuOpen(false);
  }

  const menuConversation = menu?.conversation;
  const menuSetting = menuConversation ? currentMessageSetting(menuConversation) : 'notify';
  const menuPinned = menuConversation ? isConversationPinned(menuConversation, currentUser, pinnedOverrides) : false;

  return (
    <aside ref={rootRef} className="ksh-pane">
      <PaneResizeHandle pane="list" edge="right" label="调整会话列表宽度" />
      <div className="ksh-pane-header">
        <label className="kui-field ksh-pane-search">
          <Icon name="search" className="h-4 w-4 shrink-0" />
          <input value={keyword} placeholder="搜索" onChange={(event) => setKeyword(event.target.value)} onKeyDown={(event) => {
            if (event.key === 'Enter') {
              search();
            }
          }} />
        </label>
        <div ref={addMenuRef} className="relative">
          <button type="button" className={addMenuOpen ? 'kui-icon-btn is-active' : 'kui-icon-btn'} title="新建" aria-expanded={addMenuOpen} onClick={() => setAddMenuOpen((open) => !open)}><Icon name="plus" className="h-4 w-4" /></button>
          {addMenuOpen ? (
            <ContextMenuSurface className="absolute right-0 top-[34px] z-20 w-[148px]">
              <ContextMenuItem icon="users" label="创建群聊" onClick={() => {
                setAddMenuOpen(false);
                onCreateGroup();
              }} />
              <ContextMenuItem icon="userPlus" label="加好友 / 加群" onClick={() => {
                setAddMenuOpen(false);
                onOpenGlobalSearch('');
              }} />
            </ContextMenuSurface>
          ) : null}
        </div>
      </div>

      <div ref={scrollRef} className="kui-scroll ksh-pane-list">
        {isLoading ? <p className="kui-empty">正在加载会话…</p> : null}
        {!isLoading && conversations.length === 0 ? <p className="kui-empty">还没有会话<br />先去联系人里加好友，或者创建一个群聊</p> : null}
        {!isLoading && conversations.length > 0 && visibleConversations.length === 0 ? <p className="kui-empty">没有匹配的会话<br />按 Enter 搜索用户或群聊</p> : null}
        {/* 虚拟列表量过一次行高之后只增不减，密度变了就整个重建，让它重新量 */}
        <VirtualConversationList key={rowHeight} items={visibleConversations} scrollRef={scrollRef} activeId={activeConversationId} searchKey={needle} estimatedRowHeight={rowHeight} renderRow={renderRow} />
      </div>

      {menu && menuConversation ? (
        <MenuLayer onClose={() => setMenu(null)} className="absolute inset-0 z-30">
          <ContextMenuSurface className="absolute" style={{ left: Math.min(menu.left, (rootRef.current?.clientWidth ?? MENU_WIDTH) - 8), top: menu.top, width: MENU_WIDTH }} onMouseDown={(event) => event.stopPropagation()}>
            <ContextMenuItem icon="pin" label={menuPinned ? '取消置顶' : '置顶'} onClick={() => {
              settings.mutate({ conversationId: menuConversation.id, payload: { pinned: !menuPinned } });
              setMenu(null);
            }} />
            {menuConversation.type === 'group' ? <ContextMenuItem icon="share" label="复制邀请链接" onClick={() => {
              shareGroup.mutate(menuConversation.id);
              setMenu(null);
            }} /> : null}
            <ContextMenuSeparator />
            {MESSAGE_SETTINGS.map((option) => (
              <ContextMenuItem key={option.value} label={option.label} selected={menuSetting === option.value} onClick={() => {
                settings.mutate({ conversationId: menuConversation.id, payload: messageSettingPayload(option.value) });
                setMenu(null);
              }} />
            ))}
          </ContextMenuSurface>
        </MenuLayer>
      ) : null}
    </aside>
  );
}

export const ConversationPane = memo(ConversationPaneInner);
