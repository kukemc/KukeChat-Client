import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getOutgoingFriendRequests } from '@/api/friends';
import { triggerMessageInteraction } from '@/api/messages';
import { useKukeStore } from '@/store/kukeStore';
import type { Conversation, ConversationMember, Friendship, MemberRole, Message, User } from '@/types/api';
import { getDisplayName } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { ImageViewer, type ImageViewerState } from '@/components/ui/ImageViewer';
import type { ProfileAction } from '@/components/ui/MobileUserProfilePage';
import { UserCard } from '@/components/ui/UserCard';
import { PenaltyCenterModal } from '@/components/moderation/PenaltyCenter';
import { openGiftTo } from '@/components/gifts/GiftEntry';
import { GiftStage } from '@/components/gifts/GiftHosts';
import { RedPacketHost } from '@/components/redpacket/OpenRedPacketDialog';
import { GroupTasksPanel } from '@/components/tasks/GroupTasksPanel';
import { TaskDetailPanel } from '@/components/tasks/TaskDetailPanel';
import { TaskEditorModal } from '@/components/tasks/TaskEditorModal';
import { hasPendingOutgoingFriendRequest, isFriendUserId } from '@/utils/friendship';
import { giftRecallConfirmText, isGiftMessage } from '@/utils/gift';
import { isRedPacketMessage, redPacketRecallConfirmText } from '@/utils/redPacket';
import { toast } from '@/components/ui/toast';
import { AnnouncementModal } from '../AnnouncementModal';
import { ReportModal } from '../ReportModal';
import { conversationPlainTitle } from '../info/shared';
import { useGroupPlusUi } from '@/components/groupPlus/ui';
import { FeaturedMessagesModal } from '../message/FeaturedMessagesModal';
import { ForwardBundleDetailModal } from '../message/ForwardBundleDetailModal';
import { ForwardTargetModal } from '../message/ForwardTargetModal';
import { interactionPayload } from '../message/botMarkdown';
import { copyText, elementAnchorInContainer, pointInContainer } from '../message/chatDom';
import { AVATAR_DOUBLE_TAP_MS } from '../message/constants';
import { conversationDisplayTitle, memberUserId, messageCopyText, messagePreview, messageReadableLine, messageSenderLabel, resolveKnownUser, senderOf, truncateText } from '../message/messageMeta';
import type { CardState, MessageMenuState, OverlayPosition, ReactionPickerState, ReportTargetState, SendMessageVariables } from '../message/types';
import { ChatHeader } from './ChatHeader';
import { ChatSidebar } from './ChatSidebar';
import { Composer, type ComposerHandle } from './Composer';
import { ChatInfoDrawer } from './info/ChatInfoDrawer';
import { MemberMenu, type MemberMenuTarget } from './MemberMenu';
import { MessageList, type MessageListHandle } from './MessageList';
import { MessageMenu, ReactionPicker } from './MessageMenus';
import { prewarmReactionPicker } from './reactions/ReactionPickerPanel';
import { GroupTodoBar } from '@/components/groupPlus/todo/GroupTodoBar';
import { useTodoMenu } from '@/components/groupPlus/todo/useTodoMenu';
import { usePollRealtime } from './polls/usePollRealtime';
import { ChatRowContext, cx, readPreference, useEvent, writePreference, type ChatRowActions, type ChatRowContextValue } from './runtime';
import { useChatMutations } from './useChatMutations';
import { PendingMessageMenu, type PendingMenuState } from './PendingMessage';
import { enqueueSend, isLocalMessage } from '../message/pendingSend';
import { isSelectableMessage, paintRange, toastSelectionLimit } from './selection';

export interface DesktopChatPanelProps {
  conversations: Conversation[];
  currentUser: User;
  currentRole?: MemberRole;
  members?: ConversationMember[];
  friends?: Friendship[];
  membersLoading?: boolean;
  membersHasMore?: boolean;
  membersLoadingMore?: boolean;
  onMembersNeeded?: () => void;
  onLoadMoreMembers?: () => void;
  onMemberSearchChange?: (keyword: string) => void;
  onOpenPost?: (postId: number) => void;
}

const SIDEBAR_PREFERENCE_KEY = 'kukechat.desktop.chatSidebar';
const EMPTY_MEMBERS: ConversationMember[] = [];
const EMPTY_FRIENDS: Friendship[] = [];
const EMPTY_SELECTION: ReadonlySet<number> = new Set<number>();

/** 桌面端聊天面板入口。没有选中会话时显示空状态，否则按会话挂载一个独立的会话视图。 */
export function DesktopChatPanel(props: DesktopChatPanelProps): JSX.Element {
  const activeConversationId = useKukeStore((state) => state.activeConversationId);
  usePollRealtime();
  const conversation = props.conversations.find((item) => item.id === activeConversationId);
  if (!conversation) {
    return (
      <section className="kcd kcd--empty">
        <div className="kcd-empty">
          <span className="kcd-empty-icon"><Icon name="message" className="h-7 w-7" /></span>
          <h3>选择一个会话</h3>
          <p>从左侧会话列表开始，或在好友页创建新的私聊和群聊。</p>
        </div>
      </section>
    );
  }
  // 用会话 id 作 key：切换会话时所有局部状态（菜单、多选、引用、滚动位置）自然重置
  return <ChatSession key={conversation.id} {...props} conversation={conversation} />;
}

function ChatSession({ conversation, conversations, currentUser, currentRole = 'member', members = EMPTY_MEMBERS, friends = EMPTY_FRIENDS, membersLoading = false, membersHasMore = false, membersLoadingMore = false, onMembersNeeded, onLoadMoreMembers, onMemberSearchChange, onOpenPost }: DesktopChatPanelProps & { conversation: Conversation }): JSX.Element {
  const conversationId = conversation.id;
  const isGroup = conversation.type === 'group';
  const isAdmin = currentRole === 'owner' || currentRole === 'admin';
  const isTemporaryDirect = conversation.type === 'direct' && Boolean(conversation.is_temporary);
  const title = conversationDisplayTitle(conversation, currentUser);
  const directUser = conversation.direct_user ?? members.find((member) => memberUserId(member) !== currentUser.id)?.user ?? null;
  const canCreateTask = isGroup && Boolean(conversation.tasks_enabled) && (conversation.task_creation_permission !== 'admins' || isAdmin);
  const isTaskAssistantChat = conversation.type === 'direct' && conversation.direct_user?.username === 'task_assistant';

  const queryClient = useQueryClient();
  const setVisibleConversationId = useKukeStore((state) => state.setVisibleConversationId);
  const pendingTaskCreateConversationId = useKukeStore((state) => state.pendingTaskCreateConversationId);
  const clearPendingTaskCreate = useKukeStore((state) => state.clearPendingTaskCreate);
  const openTaskCenter = useKukeStore((state) => state.openTaskCenter);
  const openPostInSpace = useKukeStore((state) => state.openPost);
  const chatTaskDetailId = useKukeStore((state) => state.chatTaskDetailId);
  const openChatTaskDetail = useKukeStore((state) => state.openChatTaskDetail);
  const closeChatTaskDetail = useKukeStore((state) => state.closeChatTaskDetail);

  const overlayRootRef = useRef<HTMLElement | null>(null);
  const listRef = useRef<MessageListHandle | null>(null);
  const todoMenu = useTodoMenu(conversation);
  const composerRef = useRef<ComposerHandle | null>(null);
  const [error, setError] = useState('');
  const [messageMenu, setMessageMenu] = useState<MessageMenuState | null>(null);
  /** 还没发出去的本地消息的右键菜单（只有重发、删除） */
  const [pendingMenu, setPendingMenu] = useState<PendingMenuState | null>(null);
  const [memberMenu, setMemberMenu] = useState<MemberMenuTarget | null>(null);
  const [reactionPicker, setReactionPicker] = useState<ReactionPickerState | null>(null);
  const [userCard, setUserCard] = useState<CardState | null>(null);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<number> | null>(null);
  const [forwardIds, setForwardIds] = useState<number[] | null>(null);
  const [reportTarget, setReportTarget] = useState<ReportTargetState | null>(null);
  const [reportEvidence, setReportEvidence] = useState<Message[]>([]);
  const [showPenalties, setShowPenalties] = useState(false);
  const [forwardDetail, setForwardDetail] = useState<Message | null>(null);
  const [imageViewer, setImageViewer] = useState<ImageViewerState | null>(null);
  const [panel, setPanel] = useState<'info' | 'announcements' | 'search' | 'featured' | 'tasks' | null>(null);
  const [taskComposerOpen, setTaskComposerOpen] = useState(false);
  const [subtaskParent, setSubtaskParent] = useState<{ conversationId: number; parentId: number } | null>(null);
  const [pendingFriendIds, setPendingFriendIds] = useState<ReadonlySet<number>>(() => new Set());
  const [sidebarOpen, setSidebarOpen] = useState(() => readPreference(SIDEBAR_PREFERENCE_KEY) !== 'closed');
  const [dropActive, setDropActive] = useState(false);
  const dragDepthRef = useRef(0);
  const avatarTapRef = useRef<{ userId: number; at: number; timer: number | null } | null>(null);
  const selectMode = selectedIds !== null;
  /** 范围选择的锚点：最近一次点选（选上或取消）的那条。Shift + 点选、「选到这里」都从它算起。 */
  const selectAnchorRef = useRef<number | null>(null);

  const mutations = useChatMutations({
    conversationId,
    setError,
    onFriendRequested: (userId) => {
      setPendingFriendIds((current) => new Set(current).add(userId));
      setMemberMenu(null);
      setUserCard(null);
    },
    onPoked: () => listRef.current?.scrollToLatest()
  });

  const outgoingFriendRequestsQuery = useQuery({ queryKey: ['friend-requests', 'outgoing'], queryFn: getOutgoingFriendRequests, staleTime: 15_000 });

  // 趁空闲预热表情回应面板要用的彩色表情字体，第一次打开面板就不会卡（整个应用只做一次）
  useEffect(() => prewarmReactionPicker(overlayRootRef.current), []);

  useEffect(() => {
    setVisibleConversationId(conversationId);
    return () => setVisibleConversationId(null);
  }, [conversationId, setVisibleConversationId]);

  useEffect(() => {
    if (pendingTaskCreateConversationId === conversationId) {
      setTaskComposerOpen(true);
      clearPendingTaskCreate();
    }
  }, [clearPendingTaskCreate, conversationId, pendingTaskCreateConversationId]);

  useEffect(() => () => {
    if (avatarTapRef.current?.timer != null) {
      window.clearTimeout(avatarTapRef.current.timer);
    }
  }, []);

  const memberByUserId = useMemo(() => {
    const map = new Map<number, ConversationMember>();
    for (const member of members) {
      const userId = memberUserId(member);
      if (userId) {
        map.set(userId, member);
      }
    }
    return map;
  }, [members]);

  function memberFromMessage(message: Message): ConversationMember | null {
    const sender = senderOf(message);
    const userId = message.sender_id ?? sender?.id;
    if (!userId) {
      return null;
    }
    const known = memberByUserId.get(userId);
    if (known) {
      return known;
    }
    const metadataRole = message.metadata?.sender_role;
    const role: MemberRole = metadataRole === 'owner' || metadataRole === 'admin' || metadataRole === 'member' ? metadataRole : userId === currentUser.id ? currentRole : 'member';
    return { id: -userId, conversation_id: conversationId, user_id: userId, role, user: userId === currentUser.id ? currentUser : sender };
  }

  const isFriend = (userId?: number | null): boolean => isFriendUserId(friends, userId, currentUser.id);
  const isPendingFriend = (userId?: number | null): boolean => pendingFriendIds.has(userId ?? -1) || hasPendingOutgoingFriendRequest(outgoingFriendRequestsQuery.data ?? [], userId);
  const canRequestFriend = (userId?: number | null): boolean => Boolean(userId && userId !== currentUser.id && !isFriend(userId) && !isPendingFriend(userId) && !mutations.friendRequest.isPending);

  function requestFriend(user?: User | null): void {
    if (user?.id && canRequestFriend(user.id)) {
      mutations.friendRequest.mutate(user.id);
    }
  }

  function startDirect(userId: number | null | undefined, temporary: boolean): void {
    if (!userId || userId === currentUser.id || mutations.direct.isPending) {
      return;
    }
    mutations.direct.mutate({ user_id: userId, temporary });
  }

  /** 戳一戳。不带 action（双击头像）就用对方自己设置的动作。 */
  function poke(userId: number | null | undefined, action?: string): void {
    if (!userId || userId === currentUser.id || mutations.poke.isPending) {
      return;
    }
    mutations.poke.mutate({ userId, action });
  }

  function profileActionFor(user?: User | null): ProfileAction | undefined {
    const userId = user?.id;
    if (!userId || userId === currentUser.id || user?.is_bot) {
      return undefined;
    }
    if (isFriend(userId)) {
      return { label: mutations.direct.isPending ? '打开中...' : '发消息', disabled: mutations.direct.isPending, onClick: () => {
        startDirect(userId, false);
        setUserCard(null);
      } };
    }
    if (isPendingFriend(userId)) {
      return { label: '已申请', disabled: true, tone: 'muted', helperText: '好友申请已发送，等待对方通过' };
    }
    return { label: mutations.friendRequest.isPending ? '发送中...' : '添加好友', onClick: requestFriend, disabled: mutations.friendRequest.isPending };
  }

  function closeFloating(): void {
    setMessageMenu(null);
    setPendingMenu(null);
    setMemberMenu(null);
    setReactionPicker(null);
  }

  function openUserCardAt(element: HTMLElement, user: User | null | undefined, label: string): void {
    closeFloating();
    setUserCard({ user, label, anchor: elementAnchorInContainer(element, overlayRootRef.current) });
  }

  function send(variables: SendMessageVariables): void {
    // 自己发消息时总是回到最新并贴底。乐观发送：先在列表末尾显示，再在后台上传、发送（message/pendingSend.ts）
    listRef.current?.scrollToLatest();
    enqueueSend(queryClient, conversationId, currentUser, variables);
  }

  function quoteMessage(message: Message): void {
    if (message.recalled_at || message.type === 'system' || isLocalMessage(message)) {
      return;
    }
    const senderId = message.sender_id ?? message.sender?.id;
    const senderName = messageSenderLabel(message);
    composerRef.current?.insertQuote({
      message_id: message.id,
      sender_id: senderId,
      sender_name: senderName,
      preview: truncateText(messagePreview(message), 120),
      type: message.type,
      content: message.content,
      created_at: message.created_at
    }, isGroup && senderId && senderId !== currentUser.id ? { userId: senderId, name: senderName } : undefined);
  }

  function selectedMessages(): Message[] {
    if (!selectedIds) {
      return [];
    }
    return (listRef.current?.getMessages() ?? []).filter((message) => selectedIds.has(message.id) && !message.recalled_at);
  }

  function canRecall(message: Message): boolean {
    if (message.recalled_at) {
      return false;
    }
    return (message.sender_id ?? message.sender?.id) === currentUser.id || (isGroup && isAdmin);
  }

  function reportMessage(message: Message): void {
    setReportTarget({
      targetType: 'message',
      targetId: message.id,
      targetLabel: `消息：${truncateText(messagePreview(message), 48) || '空消息'}`,
      conversationId,
      messageId: message.id,
      reportedUserId: message.sender_id ?? message.sender?.id
    });
  }

  function reportMember(member: ConversationMember): void {
    const userId = memberUserId(member);
    if (!userId) {
      return;
    }
    const name = member.nickname?.trim() || getDisplayName(member.user, `用户 ${userId}`);
    // 举报用户要附证据：把对方在这个会话里最近发过的消息列出来供勾选
    setReportEvidence((listRef.current?.getMessages() ?? [])
      .filter((message) => (message.sender_id ?? message.sender?.id) === userId && !message.recalled_at && message.type !== 'system')
      .slice(-40)
      .reverse());
    setReportTarget({ targetType: 'user', targetId: userId, targetLabel: `用户：${name}`, conversationId, reportedUserId: userId });
  }

  const openMessageMenu = useEvent<Parameters<ChatRowActions['openMessageMenu']>, void>((event, message, clickedImageUrl) => {
    event.preventDefault();
    event.stopPropagation();
    setUserCard(null);
    setMemberMenu(null);
    setReactionPicker(null);
    if (isLocalMessage(message)) {
      setMessageMenu(null);
      setPendingMenu({ message, ...pointInContainer(event.clientX, event.clientY, overlayRootRef.current) });
      return;
    }
    setPendingMenu(null);
    setMessageMenu({ message, clickedImageUrl: clickedImageUrl ?? null, ...pointInContainer(event.clientX, event.clientY, overlayRootRef.current) });
  });

  const actions = useMemo<ChatRowActions>(() => ({
    openMessageMenu,
    openMessageMenuAt: (element, message) => actionsRef.current.openMessageMenuAt(element, message),
    openMemberMenu: (event, message) => actionsRef.current.openMemberMenu(event, message),
    avatarTap: (element, message) => actionsRef.current.avatarTap(element, message),
    openUser: (element, userId, name) => actionsRef.current.openUser(element, userId, name),
    quote: (message) => actionsRef.current.quote(message),
    forward: (message) => actionsRef.current.forward(message),
    toggleSelected: (message) => actionsRef.current.toggleSelected(message),
    selectRange: (message) => actionsRef.current.selectRange(message),
    toggleReaction: (message, emoji) => actionsRef.current.toggleReaction(message, emoji),
    openReactionPicker: (event, message) => actionsRef.current.openReactionPicker(event, message),
    openImages: (images, index) => actionsRef.current.openImages(images, index),
    openForwardBundle: (message) => actionsRef.current.openForwardBundle(message),
    jumpToQuote: (quote) => actionsRef.current.jumpToQuote(quote),
    botInteract: (message, interaction) => actionsRef.current.botInteract(message, interaction),
    repeat: (content) => actionsRef.current.repeat(content),
    openPost: (postId) => actionsRef.current.openPost?.(postId),
    setError
  }), [openMessageMenu]);

  // 每次渲染刷新实现，actions 对象本身的身份保持不变
  const actionsRef = useRef<ChatRowActions>(actions);
  actionsRef.current = {
    ...actions,
    openMessageMenuAt: (element, message) => {
      setUserCard(null);
      setMemberMenu(null);
      setReactionPicker(null);
      setMessageMenu({ message, clickedImageUrl: null, ...elementAnchorInContainer(element, overlayRootRef.current, 0.5, 6) });
    },
    openMemberMenu: (event, message) => {
      const member = memberFromMessage(message);
      if (!member) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      closeFloating();
      setUserCard(null);
      setMemberMenu({ member, ...pointInContainer(event.clientX, event.clientY, overlayRootRef.current) });
    },
    // 头像上「单击开名片、双击戳一戳」自己数点击：名片弹出来会盖住头像，
    // 浏览器的 dblclick 第二下点不到头像上，根本不会触发。
    avatarTap: (element, message) => {
      const sender = senderOf(message);
      const userId = message.sender_id ?? sender?.id ?? null;
      const mine = userId === currentUser.id;
      const now = Date.now();
      const previous = avatarTapRef.current;
      if (previous?.timer != null) {
        window.clearTimeout(previous.timer);
      }
      if (userId && !mine && previous && previous.userId === userId && now - previous.at < AVATAR_DOUBLE_TAP_MS) {
        avatarTapRef.current = null;
        poke(userId);
        return;
      }
      const openCard = (): void => openUserCardAt(element, mine ? currentUser : sender, mine ? getDisplayName(currentUser, '用户') : '好友');
      if (!userId || mine) {
        avatarTapRef.current = null;
        openCard();
        return;
      }
      avatarTapRef.current = { userId, at: now, timer: window.setTimeout(() => {
        if (avatarTapRef.current) {
          avatarTapRef.current.timer = null;
        }
        openCard();
      }, AVATAR_DOUBLE_TAP_MS) };
    },
    openUser: (element, userId, name) => openUserCardAt(element, userId === currentUser.id ? currentUser : resolveKnownUser(memberByUserId.get(userId)?.user, userId, friends), name),
    quote: quoteMessage,
    forward: (message) => {
      if (!message.recalled_at && !isLocalMessage(message) && !isRedPacketMessage(message) && !isGiftMessage(message)) {
        setForwardIds([message.id]);
      }
    },
    toggleSelected: (message) => {
      // 多选出来是要合并转发的，红包、礼物不能转发，所以选不上
      if (!isSelectableMessage(message)) {
        return;
      }
      selectAnchorRef.current = message.id;
      setSelectedIds((current) => {
        const next = new Set(current ?? []);
        if (!next.delete(message.id)) {
          next.add(message.id);
        }
        return next;
      });
    },
    toggleReaction: (message, emoji) => {
      if (!message.recalled_at && !isLocalMessage(message)) {
        mutations.reaction.mutate({ messageId: message.id, emoji });
      }
      setReactionPicker(null);
    },
    selectRange: (message) => {
      if (!isSelectableMessage(message)) {
        return;
      }
      const current = selectedIds ?? new Set<number>();
      const loaded = listRef.current?.getMessages() ?? [];
      const target = loaded.findIndex((item) => item.id === message.id);
      // 锚点被裁出了已加载范围（或者还没点过），就从离目标最近的一条已选消息算起
      let anchor = loaded.findIndex((item) => item.id === selectAnchorRef.current);
      if (anchor < 0) {
        let best = Number.POSITIVE_INFINITY;
        loaded.forEach((item, index) => {
          if (current.has(item.id) && Math.abs(index - target) < best) {
            best = Math.abs(index - target);
            anchor = index;
          }
        });
      }
      if (target < 0 || anchor < 0) {
        actionsRef.current.toggleSelected(message);
        return;
      }
      const { next, truncated } = paintRange(current, loaded, anchor, target, true);
      if (truncated) {
        toastSelectionLimit();
      }
      selectAnchorRef.current = message.id;
      setSelectedIds(next);
    },
    openReactionPicker: (event, message) => {
      event.preventDefault();
      event.stopPropagation();
      setMessageMenu(null);
      if (isLocalMessage(message)) {
        return;
      }
      setReactionPicker({ message, ...elementAnchorInContainer(event.currentTarget, overlayRootRef.current, 0) });
    },
    openImages: (images, index) => {
      const cleaned = images.filter((image) => image.trim().length > 0);
      if (cleaned.length > 0) {
        setImageViewer({ images: cleaned, index: Math.min(Math.max(index, 0), cleaned.length - 1) });
      }
    },
    openForwardBundle: setForwardDetail,
    jumpToQuote: (quote) => {
      if (quote.message_id) {
        void listRef.current?.jumpToMessage(quote.message_id);
      }
    },
    botInteract: (message, interaction) => {
      if (interaction.action === 'input') {
        composerRef.current?.insertTextAtStart(interaction.value ?? '');
        return;
      }
      if (interaction.action === 'callback') {
        triggerMessageInteraction(message.conversation_id, message.id, interactionPayload(interaction))
          .then(() => setError(''))
          .catch((interactionError: unknown) => setError(interactionError instanceof Error ? interactionError.message : '机器人回调发送失败'));
      }
    },
    repeat: (content) => send({ content, type: 'text' }),
    // 桌面端外层不传 onOpenPost：没有就走全局跳转（切到动态页并打开这条），否则点分享卡片没反应
    openPost: onOpenPost ?? openPostInSpace
  };

  const levelTitles = isGroup && conversation.level_titles_enabled ? conversation.level_titles ?? null : null;
  const rowContext = useMemo<ChatRowContextValue>(() => ({ currentUser, currentRole, isGroup, memberByUserId, levelTitles, actions }), [actions, currentRole, currentUser, isGroup, levelTitles, memberByUserId]);

  const handleMembersNeeded = useEvent(() => onMembersNeeded?.());
  const handleMemberSearchChange = useEvent((keyword: string) => onMemberSearchChange?.(keyword));
  const handleLoadMoreMembers = useEvent(() => onLoadMoreMembers?.());
  const handleSend = useEvent(send);
  const handleOwnMessageSent = useEvent(() => listRef.current?.scrollToLatest());
  const handleCreateTask = useEvent(() => setTaskComposerOpen(true));
  const handleOpenTaskCenter = useEvent(() => openTaskCenter('assigned'));
  const handleOpenPenalties = useEvent(() => setShowPenalties(true));
  const handleBrush = useEvent((next: ReadonlySet<number>, lastId: number) => {
    selectAnchorRef.current = lastId;
    setSelectedIds(next);
  });
  const handleOpenAnnouncements = useEvent(() => setPanel('announcements'));
  const handleSidebarOpenUser = useEvent((element: HTMLElement, user: User | null | undefined, member: ConversationMember | null) => {
    const userId = member ? memberUserId(member) : user?.id;
    openUserCardAt(element, resolveKnownUser(user, userId, friends) ?? user, userId ? `用户 ${userId}` : '成员');
  });
  const handleSidebarMemberMenu = useEvent((event: React.MouseEvent<HTMLElement>, member: ConversationMember) => {
    event.preventDefault();
    event.stopPropagation();
    closeFloating();
    setUserCard(null);
    setMemberMenu({ member, ...pointInContainer(event.clientX, event.clientY, overlayRootRef.current) });
  });

  function openInfo(): void {
    onMembersNeeded?.();
    setPanel('info');
  }

  function toggleSidebar(): void {
    setSidebarOpen((open) => {
      writePreference(SIDEBAR_PREFERENCE_KEY, open ? 'closed' : 'open');
      return !open;
    });
  }

  function hasFiles(event: React.DragEvent<HTMLElement>): boolean {
    return Array.from(event.dataTransfer.types).includes('Files');
  }

  const selection = selectMode ? selectedMessages() : [];

  return (
    <section ref={overlayRootRef} className={cx('kcd', sidebarOpen && 'kcd--with-sidebar')}>
      <div
        className="kcd-column"
        onDragEnter={(event) => {
          if (hasFiles(event)) {
            dragDepthRef.current += 1;
            setDropActive(true);
          }
        }}
        onDragOver={(event) => {
          if (hasFiles(event)) {
            event.preventDefault();
          }
        }}
        onDragLeave={(event) => {
          if (hasFiles(event)) {
            dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
            if (dragDepthRef.current === 0) {
              setDropActive(false);
            }
          }
        }}
        onDrop={(event) => {
          if (!hasFiles(event)) {
            return;
          }
          event.preventDefault();
          dragDepthRef.current = 0;
          setDropActive(false);
          composerRef.current?.stageFiles(Array.from(event.dataTransfer.files));
        }}
      >
        <ChatHeader conversation={conversation} name={conversationPlainTitle(conversation, currentUser)} directUser={directUser} onOpenInfo={openInfo}>
          {/* 按用途分组，组与组之间由样式画一条短分隔线：临时会话的处置 / 查找 / 群内容 / 侧栏与资料 */}
          {isTemporaryDirect ? (
            <div className="kcd-header-group">
              {directUser && !isFriend(directUser.id) && !isPendingFriend(directUser.id) ? (
                <button type="button" className="kcd-chip" disabled={mutations.friendRequest.isPending} onClick={() => requestFriend(directUser)}>{mutations.friendRequest.isPending ? '发送中…' : '加好友'}</button>
              ) : null}
              <button type="button" className="kcd-icon-button" title="关闭临时会话" disabled={mutations.closeTemporary.isPending} onClick={() => mutations.closeTemporary.mutate()}><Icon name="close" className="h-4 w-4" /></button>
              <button type="button" className="kcd-icon-button" title="屏蔽此人的临时会话" disabled={mutations.blockTemporary.isPending} onClick={() => mutations.blockTemporary.mutate()}><Icon name="shield" className="h-4 w-4" /></button>
            </div>
          ) : null}
          <div className="kcd-header-group">
            <button type="button" className="kcd-icon-button" title="聊天记录" aria-label="聊天记录" onClick={() => useGroupPlusUi.getState().openChatSearch({ conversationId, title })}><Icon name="search" className="h-4 w-4" /></button>
          </div>
          {isGroup ? (
            <div className="kcd-header-group">
              {conversation.tasks_enabled ? <button type="button" className={cx('kcd-icon-button', panel === 'tasks' && 'is-active')} title="群任务" aria-label="群任务" onClick={() => setPanel('tasks')}><Icon name="checkSquare" className="h-4 w-4" /></button> : null}
              <button type="button" className={cx('kcd-icon-button', panel === 'featured' && 'is-active')} title="群精华" aria-label="查看群精华消息" onClick={() => setPanel('featured')}><Icon name="sparkles" className="h-4 w-4" /></button>
              <button type="button" className="kcd-icon-button" title="群文件" aria-label="群文件" onClick={() => useGroupPlusUi.getState().openFiles(conversation.id)}><Icon name="folder" className="h-4 w-4" /></button>
            </div>
          ) : null}
          <div className="kcd-header-group">
            <button type="button" className={cx('kcd-icon-button kcd-sidebar-toggle', sidebarOpen && 'is-active')} title={sidebarOpen ? '收起侧栏' : '展开侧栏'} aria-label={sidebarOpen ? '收起侧栏' : '展开侧栏'} aria-pressed={sidebarOpen} onClick={toggleSidebar}><Icon name="users" className="h-4 w-4" /></button>
            <button type="button" className={cx('kcd-icon-button', panel === 'info' && 'is-active')} title="聊天资料" aria-label="打开聊天资料" onClick={openInfo}><Icon name="more" className="h-4 w-4" /></button>
          </div>
        </ChatHeader>

        {/* 群待办条：在消息列表的滚动容器外面，不遮挡首屏消息 */}
        {isGroup ? <GroupTodoBar conversation={conversation} canManage={isAdmin} onJump={(messageId) => void listRef.current?.jumpToMessage(messageId)} /> : null}

        <ChatRowContext.Provider value={rowContext}>
          <MessageList ref={listRef} conversation={conversation} currentUserId={currentUser.id} selectMode={selectMode} selectedIds={selectedIds ?? EMPTY_SELECTION} onBrush={handleBrush} />
        </ChatRowContext.Provider>

        {error ? (
          <div className="kcd-error" role="alert">
            <span>{error}</span>
            <button type="button" aria-label="关闭提示" onClick={() => setError('')}><Icon name="close" className="h-3 w-3" /></button>
          </div>
        ) : null}

        {selectMode ? (
          <div className="kcd-selection-bar">
            <span>已选择 {selection.length} 条消息</span>
            <div className="kcd-selection-actions">
              <button type="button" className="kcd-button" disabled={selection.length === 0} onClick={() => {
                copyText(selection.map(messageReadableLine).join('\n'));
                setSelectedIds(null);
                toast.info('已复制');
              }}>复制</button>
              <button type="button" className="kcd-button kcd-button--primary" disabled={selection.length === 0} onClick={() => setForwardIds(selection.map((message) => message.id))}>合并转发</button>
              <button type="button" className="kcd-button" onClick={() => setSelectedIds(null)}>取消</button>
            </div>
          </div>
        ) : null}
        <div className="kcd-composer-slot" hidden={selectMode}>
          <Composer
            ref={composerRef}
            conversationId={conversationId}
            isGroup={isGroup}
            currentRole={currentRole}
            members={members}
            sending={false}
            canCreateTask={canCreateTask}
            isTaskAssistantChat={isTaskAssistantChat}
            canSendRedPacket={!isTaskAssistantChat && !(conversation.type === 'direct' && directUser?.is_bot)}
            directUser={isGroup ? null : directUser}
            onSend={handleSend}
            onOwnMessageSent={handleOwnMessageSent}
            onMembersNeeded={handleMembersNeeded}
            onCreateTask={handleCreateTask}
            onOpenTaskCenter={handleOpenTaskCenter}
            onOpenPenalties={handleOpenPenalties}
            setError={setError}
          />
        </div>

        {dropActive ? <div className="kcd-drop-overlay"><div><Icon name="image" className="h-7 w-7" /><span>松开即可添加图片</span></div></div> : null}
      </div>

      {sidebarOpen ? (
        <ChatSidebar
          conversation={conversation}
          currentUser={currentUser}
          members={members}
          directUser={directUser}
          membersLoading={membersLoading}
          membersHasMore={membersHasMore}
          membersLoadingMore={membersLoadingMore}
          canPublish={isGroup && isAdmin}
          onLoadMoreMembers={handleLoadMoreMembers}
          onMembersNeeded={handleMembersNeeded}
          onMemberSearchChange={handleMemberSearchChange}
          onOpenAnnouncements={handleOpenAnnouncements}
          onOpenUser={handleSidebarOpenUser}
          onMemberContextMenu={handleSidebarMemberMenu}
        />
      ) : null}

      {pendingMenu ? <PendingMessageMenu menu={pendingMenu} overlayRoot={overlayRootRef.current} onClose={() => setPendingMenu(null)} /> : null}
      {messageMenu ? (
        <MessageMenu
          menu={messageMenu}
          overlayRoot={overlayRootRef.current}
          canManageFeatured={isGroup && isAdmin}
          canRecall={canRecall(messageMenu.message)}
          onClose={() => setMessageMenu(null)}
          onReact={actionsRef.current.toggleReaction}
          onMoreReactions={actionsRef.current.openReactionPicker}
          onCopy={(message) => copyText(messageCopyText(message))}
          onFavoriteImage={(imageUrl) => {
            if (imageUrl.trim()) {
              mutations.favoriteSticker.mutate(imageUrl.trim());
            }
          }}
          onForward={actionsRef.current.forward}
          onBookmark={(message) => mutations.bookmark.mutate(message.id)}
          onMultiSelect={(message) => {
            selectAnchorRef.current = message.id;
            setSelectedIds(new Set([message.id]));
          }}
          onQuote={quoteMessage}
          onFeature={(message) => mutations.feature.mutate(message.id)}
          todoAction={todoMenu(messageMenu.message)}
          onRecall={(message) => {
            // 撤回红包消息就是撤销红包：没领完的退回去，先问一句
            if (isRedPacketMessage(message) && !window.confirm(redPacketRecallConfirmText((message.sender_id ?? message.sender?.id) === currentUser.id))) {
              return;
            }
            // 撤回礼物消息只是把消息撤掉，礼物和币都不退：也先说清楚
            if (isGiftMessage(message) && !window.confirm(giftRecallConfirmText())) {
              return;
            }
            mutations.recall.mutate(message.id);
          }}
          onDelete={(message) => mutations.deleteLocal.mutate(message.id)}
          onReport={reportMessage}
        />
      ) : null}
      <MemberMenu
        target={memberMenu}
        conversationId={conversationId}
        isGroup={isGroup}
        currentUser={currentUser}
        currentRole={currentRole}
        overlayRoot={overlayRootRef.current}
        directPending={mutations.direct.isPending}
        pokePending={mutations.poke.isPending}
        isFriend={isFriend}
        isPendingFriend={isPendingFriend}
        canRequestFriend={canRequestFriend}
        onClose={() => setMemberMenu(null)}
        onGift={(member) => {
          // 从消息头像 / 成员列表的菜单送：就在这个会话里送，会落一条礼物消息
          if (member.user) {
            openGiftTo(member.user, conversationId, handleOwnMessageSent);
          }
        }}
        onSendMessage={(member) => startDirect(memberUserId(member), isGroup)}
        onAddFriend={(member) => requestFriend(resolveKnownUser(member.user, memberUserId(member), friends))}
        onMention={(member) => composerRef.current?.insertMention(member)}
        onPoke={(member, action) => poke(memberUserId(member), action)}
        onViewProfile={(member, anchor: OverlayPosition) => {
          const userId = memberUserId(member);
          setUserCard({ user: resolveKnownUser(member.user, userId, friends), label: userId ? `用户 ${userId}` : '成员', anchor });
        }}
        onReport={reportMember}
        setError={setError}
      />
      {reactionPicker ? <ReactionPicker picker={reactionPicker} overlayRoot={overlayRootRef.current} onPick={actionsRef.current.toggleReaction} onClose={() => setReactionPicker(null)} /> : null}
      {userCard ? <UserCard user={userCard.user} label={userCard.label} anchor={userCard.anchor} containerRef={overlayRootRef} action={profileActionFor(userCard.user)} onClose={() => setUserCard(null)} /> : null}

      {forwardIds ? (
        <ForwardTargetModal
          conversations={conversations}
          currentUser={currentUser}
          activeConversationId={conversationId}
          messageIds={forwardIds}
          isPending={mutations.forward.isPending}
          onConfirm={(targetConversationId, note) => mutations.forward.mutate({ targetConversationId, messageIds: forwardIds, note }, {
            onSuccess: () => {
              setForwardIds(null);
              setSelectedIds(null);
            }
          })}
          onClose={() => setForwardIds(null)}
        />
      ) : null}
      {forwardDetail ? <ForwardBundleDetailModal message={forwardDetail} onClose={() => setForwardDetail(null)} /> : null}
      {imageViewer ? <ImageViewer viewer={imageViewer} onClose={() => setImageViewer(null)} onNavigate={(index) => setImageViewer((current) => current ? { ...current, index } : current)} /> : null}
      {panel === 'featured' && isGroup ? (
        <FeaturedMessagesModal
          conversationId={conversationId}
          canManage={isAdmin}
          isToggling={mutations.feature.isPending}
          onToggleFeature={(message) => mutations.feature.mutate(message.id)}
          onOpenForwardBundle={setForwardDetail}
          onClose={() => setPanel(null)}
        />
      ) : null}
      {panel === 'announcements' && isGroup ? <AnnouncementModal conversation={conversation} canPublish={isAdmin} onClose={() => setPanel(null)} /> : null}
      {panel === 'info' ? (
        <ChatInfoDrawer
          conversation={conversation}
          currentUser={currentUser}
          members={members}
          friends={friends}
          membersLoading={membersLoading}
          currentRole={currentRole}
          conversations={conversations}
          onReportConversation={(target) => setReportTarget({ targetType: 'conversation', targetId: target.id, targetLabel: `群聊：${conversationDisplayTitle(target, currentUser)}`, conversationId: target.id })}
          onClose={() => setPanel(null)}
        />
      ) : null}
      {panel === 'tasks' && isGroup && conversation.tasks_enabled ? (
        <GroupTasksPanel
          conversationId={conversationId}
          groupName={title}
          onClose={() => setPanel(null)}
          onOpenTask={(id) => {
            setPanel(null);
            openChatTaskDetail(id);
          }}
          onCreateTask={canCreateTask ? () => {
            setPanel(null);
            setTaskComposerOpen(true);
          } : undefined}
        />
      ) : null}
      {taskComposerOpen && isGroup ? <TaskEditorModal conversationId={conversationId} currentUser={currentUser} onClose={() => setTaskComposerOpen(false)} onCreated={() => void queryClient.invalidateQueries({ queryKey: ['tasks'] })} /> : null}
      {chatTaskDetailId != null ? (
        <div className="ktk-layer">
          <div className="kui-drawer-backdrop" aria-hidden="true" onClick={closeChatTaskDetail} />
          <div className="kui-drawer" style={{ width: 460 }}>
            <TaskDetailPanel taskId={chatTaskDetailId} currentUser={currentUser} onClose={closeChatTaskDetail} onOpenTask={(id) => openChatTaskDetail(id)} onCreateSubtask={(task) => setSubtaskParent({ conversationId: task.conversation_id, parentId: task.id })} />
          </div>
        </div>
      ) : null}
      {subtaskParent ? (
        <TaskEditorModal
          conversationId={subtaskParent.conversationId}
          currentUser={currentUser}
          defaultParentId={subtaskParent.parentId}
          onClose={() => setSubtaskParent(null)}
          onCreated={() => {
            setSubtaskParent(null);
            void queryClient.invalidateQueries({ queryKey: ['tasks'] });
          }}
        />
      ) : null}
      {reportTarget ? (
        <ReportModal
          targetType={reportTarget.targetType}
          targetId={reportTarget.targetId}
          targetLabel={reportTarget.targetLabel}
          conversationId={reportTarget.conversationId}
          messageId={reportTarget.messageId}
          reportedUserId={reportTarget.reportedUserId}
          evidenceCandidates={reportTarget.targetType === 'user' ? reportEvidence : undefined}
          isPending={mutations.report.isPending}
          error={mutations.report.error}
          onSubmit={(payload) => mutations.report.mutate(payload, { onSuccess: () => setReportTarget(null) })}
          onClose={() => setReportTarget(null)}
        />
      ) : null}
      {showPenalties ? <PenaltyCenterModal onClose={() => setShowPenalties(false)} /> : null}
      <RedPacketHost conversationId={conversationId} isGroup={isGroup} currentUser={currentUser} />
      <GiftStage conversationId={conversationId} />
    </section>
  );
}
