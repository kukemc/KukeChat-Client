import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { FriendBadgeMark } from '@/components/intimacy/FriendBadgeMark';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { blockTemporaryConversation, closeTemporaryConversation, createDirectConversation, getConversationMember, pokeMember, removeConversationMember, searchConversationMembers, updateConversationMemberMute, updateConversationMemberRole, updateConversationMemberTitle } from '@/api/conversations';
import { addFavoriteSticker, deleteMessageLocal, forwardMessageBundle, getFavoriteStickers, getMessageContext, getMessages, recallMessage, removeFavoriteSticker, sendMessage, toggleMessageBookmark, toggleMessageFeature, toggleMessageReaction, triggerMessageInteraction, uploadMessageImage, uploadMessageVoice, type FavoriteStickerItem } from '@/api/messages';
import { createReport } from '@/api/reports';
import { sendFriendRequest } from '@/api/friends';
import { useKukeStore } from '@/store/kukeStore';
import { markConversationReadLocally } from '@/store/readMarks';
import type { Conversation, ConversationMember, CreateReportPayload, MemberRole, Message, MessageMentionMetadata, MessageMetadata, MessageQuoteMetadata, MessageType, User } from '@/types/api';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { PlusTierTag } from '@/components/groupPlus/PlusBadge';
import { conversationTier } from '@/components/groupPlus/tier';
import { Icon } from '@/components/ui/Icon';
import { ContextMenuItem, ContextMenuSurface } from '@/components/ui/ContextMenu';
import { UserCard } from '@/components/ui/UserCard';
import { openBotForUser } from '@/components/bots/openBotForUser';
import { toast } from '@/components/ui/toast';
import { ImageViewer, type ImageViewerState } from '@/components/ui/ImageViewer';
import { MobileUserProfilePage, type ProfileAction } from '@/components/ui/MobileUserProfilePage';
import { TaskShareCard } from '@/components/tasks/TaskShareCard';
import { GiftCard } from '@/components/gifts/GiftCard';
import { useGroupPlusUi } from '@/components/groupPlus/ui';
import { GroupFileCard } from '@/components/groupPlus/files/GroupFileCard';
import { groupFileMetaOf } from '@/api/groupPlus';
import { GiftComposerButton, openGiftTo, useCanGift } from '@/components/gifts/GiftEntry';
import { GiftStage } from '@/components/gifts/GiftHosts';
import { giftOf, giftRecallConfirmText, isGiftMessage } from '@/utils/gift';
import { forwardErrorText } from '@/components/redpacket/data';
import { RedPacketCard } from '@/components/redpacket/RedPacketCard';
import { RedPacketComposerButton } from '@/components/redpacket/RedPacketEntry';
import { RedPacketHost } from '@/components/redpacket/OpenRedPacketDialog';
import { isRedPacketMessage, redPacketOf, redPacketRecallConfirmText } from '@/utils/redPacket';
import { TaskEventCard } from '@/components/tasks/TaskEventCard';
import { TaskEditorModal } from '@/components/tasks/TaskEditorModal';
import { TaskDetailPanel } from '@/components/tasks/TaskDetailPanel';
import { GroupTasksPanel } from '@/components/tasks/GroupTasksPanel';
import { getOutgoingFriendRequests } from '@/api/friends';
import { resolveAssetUrl } from '@/utils/assetUrl';
import { applyLatestMessageToConversations } from '@/utils/conversations';
import { hasPendingOutgoingFriendRequest, isFriendUserId } from '@/utils/friendship';
import { parseApiDate } from '@/utils/dateTime';
import { ChatInfoDrawer } from './ChatInfoDrawer';
import { AnnouncementModal } from './AnnouncementModal';
import { AnnouncementCard, announcementCardOf } from '@/components/groupAnnouncement/AnnouncementCard';
import { ReportModal } from './ReportModal';
import { MobileStatusBar } from '@/components/mobile/MobileChrome';
import { isNativeMobileApp } from '@/utils/appMode';
import { subscribePoke } from '@/realtime/poke';
import { registerNativeBackHandler } from '@/native/back';
import { runNativeRouteTransition } from '@/native/transition';
import { useVirtualMessageRows } from './useVirtualMessageRows';
import { setInstantMessageScrollTop } from './instantMessageScroll';
import type { MessagePanelProps, MessageMenuState, MemberMenuState, MemberMuteStatus, BotInteraction, CardState, UserProfilePageState, ForwardTargetState, ReportTargetState, ReactionPickerState, MentionPickerState, StagedImage, StagedVoice, EmojiPickerTab, SendMessageVariables, MessagesInfiniteData, ConversationMembersPageData, MuteMenuOption, CustomMuteState } from './message/types';
import { MAX_IMAGE_UPLOAD_BYTES, MAX_COMPRESSIBLE_IMAGE_ORIGINAL_BYTES, MAX_VOICE_UPLOAD_BYTES, MAX_VOICE_RECORDING_MS, MOBILE_VOICE_CANCEL_DISTANCE, MAX_MESSAGE_CONTENT_LENGTH, EMOJIS, QUICK_REACTION_EMOJIS, FULL_REACTION_EMOJIS, AVATAR_DOUBLE_TAP_MS, MESSAGE_MENU_WIDTH, MESSAGE_MENU_HEIGHT, MEMBER_MENU_WIDTH, MEMBER_MENU_HEIGHT, REACTION_PICKER_WIDTH, REACTION_PICKER_HEIGHT, MENTION_ALL_REMAINING, WRAP_ANYWHERE_CLASS, MESSAGE_PAGE_SIZE, MOBILE_ENTER_LONG_PRESS_MS, MUTE_MENU_OPTIONS } from './message/constants';
import { formatBytes, senderOf, memberUserId, resolveKnownUser, roleBadgeLabel, formatVoiceDuration, messageImageUrls, resolveMessageImagePreviewUrl, isStickerMessage, quoteMetadataOf, mentionMetadataOf, memberMentionName, groupShareCardOf, postShareCardOf, botShareCardOf, userShareCardOf, teamupShareCardOf, taskShareCardOf, taskEventCardOf, reactionUserNames, shouldShowTimeDivider, truncateText, isBotMarkdownMessage, botMarkdownContent, hasBotRenderableElements, messagePreview, messageSenderLabel, messageCopyText, messageReadableLine, repeatableContentOf, conversationDisplayTitle, conversationMobileTitleParts, ccwCreationPreviewsFromMetadata, defaultVoiceWaveform, matchesMember } from './message/messageMeta';
import { patchMessageInPages, upsertMessageIntoFirstPage, replaceMessagesWithContextPage, appendNewerMessagesIntoFirstPage } from './message/messageCache';
import { editablePlainText, pointInContainer, elementAnchorInContainer, clampOverlayPosition, copyText, isNearBottom, scrollMessagesToBottom, forceScrollMessagesToBottom } from './message/chatDom';
import { MessageTimeDivider, renderQuoteBlock, renderMentionedText, CcwCreationCards, UnavailableImageLabel, renderLinkedPreview } from './message/messageText';
import { renderBotElementContent, interactionPayload, renderSafeBotMarkdown } from './message/botMarkdown';
import { VoiceMessageBubble, StagedVoicePreview } from './message/VoiceMessage';
import { bubbleSkinClass } from '@/components/shop/skin/bubbleSkin';
import { SkinDecor, messageSkin, useSkinSettings } from '@/components/shop/skin/SkinDecor';
import { ForwardBundleCard, PostShareCard, BotShareCard, UserShareCard, TeamupShareCard, GroupShareCard } from './message/shareCards';
import { GroupTodoBar } from '@/components/groupPlus/todo/GroupTodoBar';
import { useTodoMenu } from '@/components/groupPlus/todo/useTodoMenu';
import { ForwardBundleDetailModal } from './message/ForwardBundleDetailModal';
import { reportFeaturedLimit } from './message/featuredLimit';
import { ForwardTargetModal } from './message/ForwardTargetModal';
import { FeaturedMessagesModal } from './message/FeaturedMessagesModal';

export function MessagePanel({ conversations, currentUser, currentRole = 'member', members = [], friends = [], membersLoading = false, membersHasMore = false, membersLoadingMore = false, isMobile = false, mobileBackUnreadCount = 0, onMembersNeeded, onLoadMoreMembers, onMemberSearchChange, onOpenPost, onBack }: MessagePanelProps): JSX.Element {
  const isNativeApp = isNativeMobileApp();
  const skinSettings = useSkinSettings();
  const [draft, setDraft] = useState('');
  const [stagedImages, setStagedImages] = useState<StagedImage[]>([]);
  const [stagedVoice, setStagedVoice] = useState<StagedVoice | null>(null);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [mobileVoiceMode, setMobileVoiceMode] = useState(false);
  const [mobileVoicePreparing, setMobileVoicePreparing] = useState(false);
  const [mobileVoiceCanceling, setMobileVoiceCanceling] = useState(false);
  const [voiceRecordingMs, setVoiceRecordingMs] = useState(0);
  const [quote, setQuote] = useState<MessageQuoteMetadata | null>(null);
  const [mentions, setMentions] = useState<MessageMentionMetadata[]>([]);
  const [mentionAll, setMentionAll] = useState(false);
  const [mentionPicker, setMentionPicker] = useState<MentionPickerState | null>(null);
  const [messageMenu, setMessageMenu] = useState<MessageMenuState | null>(null);
  const [memberMenu, setMemberMenu] = useState<MemberMenuState | null>(null);
  // 成员菜单里的「送礼物」：礼物功能开着、对方不是自己和机器人才有
  const canGiftMenuMember = useCanGift(memberMenu?.member.user);
  const [memberMuteStatusByKey, setMemberMuteStatusByKey] = useState<Record<string, MemberMuteStatus>>({});
  const [userCard, setUserCard] = useState<CardState | null>(null);
  const [mobileUserProfile, setMobileUserProfile] = useState<UserProfilePageState | null>(null);
  const [reactionPicker, setReactionPicker] = useState<ReactionPickerState | null>(null);
  const [showInfoDrawer, setShowInfoDrawer] = useState(false);
  const [showAnnouncements, setShowAnnouncements] = useState(false);
  const [showMemberSearch, setShowMemberSearch] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [emojiPickerTab, setEmojiPickerTab] = useState<EmojiPickerTab>('emoji');
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<number[]>([]);
  const [forwardTarget, setForwardTarget] = useState<ForwardTargetState | null>(null);
  const [reportTarget, setReportTarget] = useState<ReportTargetState | null>(null);
  const [forwardDetailMessage, setForwardDetailMessage] = useState<Message | null>(null);
  const [imageViewer, setImageViewer] = useState<ImageViewerState | null>(null);
  const [showFeaturedMessages, setShowFeaturedMessages] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [actionError, setActionError] = useState('');
  const [locallyPendingFriendIds, setLocallyPendingFriendIds] = useState<Set<number>>(() => new Set());
  const [customMute, setCustomMute] = useState<CustomMuteState | null>(null);
  const [showMuteSubmenu, setShowMuteSubmenu] = useState(false);
  const [jumpHighlightMessageId, setJumpHighlightMessageId] = useState<number | null>(null);
  const [jumpContextMessageId, setJumpContextMessageId] = useState<number | null>(null);
  const [isFetchingNewerContext, setIsFetchingNewerContext] = useState(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  // 正在抖动的头像。用数组而不是 Set，是为了让 React 的浅比较能察觉变化
  const [pokedUserIds, setPokedUserIds] = useState<number[]>([]);
  const [pokeTips, setPokeTips] = useState<{ id: number; text: string }[]>([]);
  const pokeTipIdRef = useRef(0);
  const pokeTimersRef = useRef<number[]>([]);
  const avatarTapTimerRef = useRef<number | null>(null);
  const lastAvatarTapRef = useRef<{ userId: number; at: number } | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const overlayRootRef = useRef<HTMLElement | null>(null);
  const lastMessageIdRef = useRef<number | null>(null);
  const lastConversationIdRef = useRef<number | null>(null);
  const stickToBottomRef = useRef(true);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const memberSearchInputRef = useRef<HTMLInputElement | null>(null);
  const composerRef = useRef<HTMLDivElement | null>(null);
  const jumpHighlightTimeoutRef = useRef<number | null>(null);
  const muteSubmenuCloseTimeoutRef = useRef<number | null>(null);
  const emojiPickerRef = useRef<HTMLDivElement | null>(null);
  const preserveScrollSnapshotRef = useRef<{ conversationId: number; pageCount: number; messageId: number | null; offsetTop: number; height: number; top: number } | null>(null);
  const newerContextFetchRef = useRef(false);
  const reachedLatestInContextRef = useRef(false);
  const contextBottomArmedRef = useRef(false);
  const pendingScrollToLatestRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceStreamRef = useRef<MediaStream | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);
  const voiceRecordStartedAtRef = useRef(0);
  const voiceRecordTimerRef = useRef<number | null>(null);
  const voiceRecordCancelledRef = useRef(false);
  const voiceRecordAutoSendRef = useRef(false);
  const mobileVoicePointerIdRef = useRef<number | null>(null);
  const mobileVoiceStartYRef = useRef(0);
  const mobileVoiceCancelAfterStartRef = useRef(false);
  const mobileEnterKeyDownAtRef = useRef<number | null>(null);
  const mobileEnterSkipNextBeforeInputRef = useRef(false);
  const activeConversationId = useKukeStore((state) => state.activeConversationId);
  const setActiveConversationId = useKukeStore((state) => state.setActiveConversationId);
  const openPost = useKukeStore((state) => state.openPost);
  const visibleConversationId = useKukeStore((state) => state.visibleConversationId);
  const setVisibleConversationId = useKukeStore((state) => state.setVisibleConversationId);
  const pendingJumpMessage = useKukeStore((state) => state.pendingJumpMessage);
  const clearPendingJumpMessage = useKukeStore((state) => state.clearPendingJumpMessage);
  const pendingTaskCreateConversationId = useKukeStore((state) => state.pendingTaskCreateConversationId);
  const clearPendingTaskCreate = useKukeStore((state) => state.clearPendingTaskCreate);
  const openTaskCenter = useKukeStore((state) => state.openTaskCenter);
  const chatTaskDetailId = useKukeStore((state) => state.chatTaskDetailId);
  const openChatTaskDetail = useKukeStore((state) => state.openChatTaskDetail);
  const closeChatTaskDetail = useKukeStore((state) => state.closeChatTaskDetail);
  const queryClient = useQueryClient();
  const activeConversation = conversations.find((conversation) => conversation.id === activeConversationId);
  const todoMenu = useTodoMenu(activeConversation);
  const [taskComposerOpen, setTaskComposerOpen] = useState(false);
  const [showGroupTasks, setShowGroupTasks] = useState(false);
  const [subtaskParent, setSubtaskParent] = useState<{ conversationId: number; parentId: number } | null>(null);
  const canCreateTask = activeConversation?.type === 'group'
    && Boolean(activeConversation?.tasks_enabled)
    && (activeConversation?.task_creation_permission !== 'admins' || currentRole === 'owner' || currentRole === 'admin');
  const isTaskAssistantChat = activeConversation?.type === 'direct' && activeConversation?.direct_user?.username === 'task_assistant';

  useEffect(() => {
    if (pendingTaskCreateConversationId != null && pendingTaskCreateConversationId === activeConversationId) {
      setTaskComposerOpen(true);
      clearPendingTaskCreate();
    }
  }, [pendingTaskCreateConversationId, activeConversationId, clearPendingTaskCreate]);

  const messagesQuery = useInfiniteQuery({
    queryKey: ['messages', activeConversationId],
    queryFn: ({ pageParam }) => getMessages(activeConversationId ?? 0, { beforeId: pageParam, limit: MESSAGE_PAGE_SIZE }),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) => lastPage.length < MESSAGE_PAGE_SIZE ? undefined : lastPage[0]?.id,
    enabled: Boolean(activeConversationId)
  });
  const messagePages = messagesQuery.data?.pages;
  const latestMessageId = messagePages?.[0]?.[messagePages[0].length - 1]?.id ?? null;
  const messages = useMemo(() => messagePages ? [...messagePages].reverse().flat() : [], [messagePages]);
  const messageIds = useMemo(() => messages.map((message) => message.id), [messages]);
  const messageIndexById = useMemo(() => new Map(messageIds.map((id, index) => [id, index])), [messageIds]);
  const messageIndexByIdRef = useRef(messageIndexById);
  messageIndexByIdRef.current = messageIndexById;
  const selectedMessageIdSet = useMemo(() => new Set(selectedMessageIds), [selectedMessageIds]);
  const virtualMessages = useVirtualMessageRows(messageIds, scrollRef, messageListRef, activeConversationId, isMobile ? 12 : 28, stickToBottomRef);

  function openInfoDrawer(): void {
    onMembersNeeded?.();
    runNativeRouteTransition('forward', () => setShowInfoDrawer(true), isMobile && isNativeApp);
  }

  function closeInfoDrawer(): void {
    runNativeRouteTransition('back', () => setShowInfoDrawer(false), isMobile && isNativeApp);
  }

  useEffect(() => {
    setVisibleConversationId(activeConversationId ?? null);
    return () => {
      setVisibleConversationId(null);
    };
  }, [activeConversationId, setVisibleConversationId]);

  const favoriteStickersQuery = useQuery({
    queryKey: ['favorite-stickers'],
    queryFn: getFavoriteStickers,
    enabled: showEmojiPicker && emojiPickerTab === 'stickers',
    staleTime: 30_000
  });

  const activeMentionQuery = mentionPicker?.query.trim() ?? '';
  const mentionMembersQuery = useQuery({
    queryKey: ['conversation-members', activeConversationId, 'mention-search', activeMentionQuery],
    queryFn: () => searchConversationMembers(activeConversationId ?? 0, activeMentionQuery, 8),
    enabled: Boolean(activeConversationId && activeConversation?.type === 'group' && mentionPicker),
    staleTime: 15_000
  });

  const outgoingFriendRequestsQuery = useQuery({
    queryKey: ['friend-requests', 'outgoing'],
    queryFn: getOutgoingFriendRequests,
    staleTime: 15_000
  });

  const invalidateMessages = (conversationId = activeConversationId): void => {
    if (conversationId) {
      void queryClient.resetQueries({ queryKey: ['messages', conversationId], exact: true });
      void queryClient.invalidateQueries({ queryKey: ['featured-messages', conversationId] });
    }
    void queryClient.invalidateQueries({ queryKey: ['bookmarks-all'] });
    void queryClient.invalidateQueries({ queryKey: ['conversations'] });
  };

  const patchCachedMessage = (conversationId: number, messageId: number, updater: (message: Message) => Message): void => {
    queryClient.setQueryData<MessagesInfiniteData | undefined>(['messages', conversationId], (current) => patchMessageInPages(current, messageId, updater));
  };

  const upsertCachedMessage = (conversationId: number, message: Message): void => {
    queryClient.setQueryData<MessagesInfiniteData | undefined>(['messages', conversationId], (current) => upsertMessageIntoFirstPage(current, message));
    queryClient.setQueryData<Conversation[] | undefined>(['conversations'], (current) => applyLatestMessageToConversations(current, message, { visibleConversationId: conversationId }));
  };

  const patchMemberTitleCaches = (conversationId: number, userId: number, title: string | null): void => {
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
    queryClient.setQueryData<MessagesInfiniteData | undefined>(['messages', conversationId], (current) => current ? {
      ...current,
      pages: current.pages.map((page) => page.map((message) => (
        message.sender_id === userId ? { ...message, sender_title: title } : message
      )))
    } : current);
  };

  const patchMemberMuteCaches = (conversationId: number, userId: number, muted: boolean, mutedUntil: string | null = null): void => {
    const key = `${conversationId}:${userId}`;
    setMemberMuteStatusByKey((current) => ({ ...current, [key]: { muted, muted_until: mutedUntil } }));
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
  };

  const cachedMemberFromQueries = (conversationId: number, userId: number): ConversationMember | null => {
    const listMember = queryClient.getQueryData<ConversationMember[] | undefined>(['conversation-members', conversationId])?.find((member) => memberUserId(member) === userId);
    if (listMember) {
      return listMember;
    }
    const pageQueries = queryClient.getQueriesData<ConversationMembersPageData>({ queryKey: ['conversation-members-page', conversationId] });
    for (const [, data] of pageQueries) {
      const pageMember = data?.pages.flatMap((page) => page.items).find((member) => memberUserId(member) === userId);
      if (pageMember) {
        return pageMember;
      }
    }
    return null;
  };

  const patchFullMemberCaches = (conversationId: number, updatedMember: ConversationMember): void => {
    const userId = memberUserId(updatedMember);
    if (!userId) {
      return;
    }
    setMemberMuteStatusByKey((current) => ({
      ...current,
      [`${conversationId}:${userId}`]: { muted: Boolean(updatedMember.muted), muted_until: updatedMember.muted_until ?? null }
    }));
    queryClient.setQueryData<ConversationMember[] | undefined>(['conversation-members', conversationId], (current) => current?.map((member) => (
      memberUserId(member) === userId ? { ...member, ...updatedMember } : member
    )));
    queryClient.setQueriesData<ConversationMembersPageData | undefined>({ queryKey: ['conversation-members-page', conversationId] }, (current) => current ? {
      ...current,
      pages: current.pages.map((page) => ({
        ...page,
        items: page.items.map((member) => (memberUserId(member) === userId ? { ...member, ...updatedMember } : member))
      }))
    } : current);
  };

  const openImageViewer = (images: string[], index: number): void => {
    const cleanedImages = images.filter((image) => image.trim().length > 0);
    if (cleanedImages.length === 0) {
      return;
    }
    setImageViewer({ images: cleanedImages, index: Math.min(Math.max(index, 0), cleanedImages.length - 1) });
  };

  useEffect(() => {
    if (!isMobile || !imageViewer) {
      return;
    }
    return registerNativeBackHandler(() => {
      setImageViewer(null);
      return true;
    }, 200);
  }, [imageViewer, isMobile]);

  useEffect(() => {
    if (!isMobile || !isNativeApp) {
      return;
    }
    const root = document.getElementById('kukechat-root');
    if (!root) {
      return;
    }
    let frame = 0;
    let followUntil = 0;
    const keepBottomVisible = (duration = 360): void => {
      if (!stickToBottomRef.current) {
        return;
      }
      followUntil = Math.max(followUntil, performance.now() + duration);
      if (frame) {
        return;
      }
      const followKeyboardFrame = (): void => {
        scrollMessagesToBottom(scrollRef.current);
        if (performance.now() < followUntil && stickToBottomRef.current) {
          frame = requestAnimationFrame(followKeyboardFrame);
          return;
        }
        frame = 0;
      };
      frame = requestAnimationFrame(followKeyboardFrame);
    };
    const observer = new MutationObserver((records) => {
      if (records.some((record) => record.attributeName === 'data-keyboard' || record.attributeName === 'style')) {
        keepBottomVisible(root.dataset.keyboard === 'hiding' ? 180 : 380);
      }
    });
    const handleViewportResize = (): void => keepBottomVisible();
    observer.observe(root, { attributes: true, attributeFilter: ['data-keyboard', 'style'] });
    window.visualViewport?.addEventListener('resize', handleViewportResize);
    window.addEventListener('resize', handleViewportResize);
    keepBottomVisible();
    return () => {
      observer.disconnect();
      window.visualViewport?.removeEventListener('resize', handleViewportResize);
      window.removeEventListener('resize', handleViewportResize);
      if (frame) {
        cancelAnimationFrame(frame);
      }
    };
  }, [isMobile, isNativeApp]);

  const invalidateConversationMembers = (conversationId = activeConversationId): void => {
    if (conversationId) {
      void queryClient.invalidateQueries({ queryKey: ['conversation-members', conversationId] });
      void queryClient.invalidateQueries({ queryKey: ['conversation-members-page', conversationId] });
    }
    void queryClient.invalidateQueries({ queryKey: ['conversations'] });
  };

  const clearComposer = (): void => {
    if (composerRef.current) {
      composerRef.current.innerHTML = '';
    }
    setDraft('');
    setQuote(null);
    setMentions([]);
    setMentionAll(false);
    setMentionPicker(null);
  };

  const clearStagedImages = (): void => {
    setStagedImages((current) => {
      current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      return [];
    });
  };

  const clearStagedVoice = (): void => {
    setStagedVoice((current) => {
      if (current) {
        URL.revokeObjectURL(current.previewUrl);
      }
      return null;
    });
  };

  const clearVoiceRecordingTimer = (): void => {
    if (voiceRecordTimerRef.current !== null) {
      window.clearInterval(voiceRecordTimerRef.current);
      voiceRecordTimerRef.current = null;
    }
  };

  const stopVoiceStream = (): void => {
    voiceStreamRef.current?.getTracks().forEach((track) => track.stop());
    voiceStreamRef.current = null;
  };

  const preferredVoiceMimeType = (): string => {
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg', 'audio/mp4'];
    return candidates.find((candidate) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(candidate)) ?? '';
  };

  const voiceFileExtension = (mimeType: string): string => {
    const cleanType = mimeType.split(';', 1)[0];
    if (cleanType === 'audio/ogg') {
      return 'ogg';
    }
    if (cleanType === 'audio/mp4') {
      return 'm4a';
    }
    return 'webm';
  };

  const analyzeVoiceBlob = async (blob: Blob, barCount = 28): Promise<{ waveform: number[]; rms: number | null; peak: number | null }> => {
    try {
      const audioContextCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!audioContextCtor) {
        return { waveform: defaultVoiceWaveform(barCount), rms: null, peak: null };
      }
      const audioContext = new audioContextCtor();
      const buffer = await audioContext.decodeAudioData(await blob.arrayBuffer());
      await audioContext.close();
      const channelData = buffer.getChannelData(0);
      let squareSum = 0;
      let peak = 0;
      for (let sampleIndex = 0; sampleIndex < channelData.length; sampleIndex += 1) {
        const level = Math.abs(channelData[sampleIndex] ?? 0);
        squareSum += level * level;
        if (level > peak) {
          peak = level;
        }
      }
      const rms = channelData.length > 0 ? Math.sqrt(squareSum / channelData.length) : 0;
      const samplesPerBar = Math.max(1, Math.floor(channelData.length / barCount));
      const peaks = Array.from({ length: barCount }, (_, index) => {
        const start = index * samplesPerBar;
        const end = Math.min(channelData.length, start + samplesPerBar);
        let sum = 0;
        for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
          sum += Math.abs(channelData[sampleIndex] ?? 0);
        }
        return end > start ? sum / (end - start) : 0;
      });
      const max = Math.max(...peaks, 0.01);
      return { waveform: peaks.map((item) => Math.min(1, Math.max(0.08, item / max))), rms, peak };
    } catch {
      return { waveform: defaultVoiceWaveform(barCount), rms: null, peak: null };
    }
  };

  const startVoiceRecording = async (options: { autoSend?: boolean } = {}): Promise<boolean> => {
    if (sendMutation.isPending || isRecordingVoice) {
      return false;
    }
    if (!activeConversationId) {
      setActionError('请先选择会话。');
      return false;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setActionError('当前环境不支持录音。');
      return false;
    }
    if (stagedImages.length > 0) {
      setActionError('语音消息不能和图片一起发送。');
      return false;
    }
    try {
      clearStagedVoice();
      voiceRecordAutoSendRef.current = Boolean(options.autoSend);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: true } });
      const mimeType = preferredVoiceMimeType();
      const recorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 48000 });
      voiceStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      voiceChunksRef.current = [];
      voiceRecordCancelledRef.current = false;
      voiceRecordStartedAtRef.current = Date.now();
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          voiceChunksRef.current.push(event.data);
        }
      };
      recorder.onstop = () => {
        void (async () => {
          const shouldAutoSend = voiceRecordAutoSendRef.current;
          voiceRecordAutoSendRef.current = false;
          clearVoiceRecordingTimer();
          stopVoiceStream();
          setIsRecordingVoice(false);
          setMobileVoicePreparing(false);
          setVoiceRecordingMs(0);
          if (voiceRecordCancelledRef.current) {
            voiceChunksRef.current = [];
            return;
          }
          const durationMs = Date.now() - voiceRecordStartedAtRef.current;
          const type = recorder.mimeType || mimeType || 'audio/webm';
          const blob = new Blob(voiceChunksRef.current, { type });
          voiceChunksRef.current = [];
          if (durationMs < 700 || blob.size === 0) {
            setActionError('录音太短，请重新录制。');
            return;
          }
          if (blob.size > MAX_VOICE_UPLOAD_BYTES) {
            setActionError('语音太长了，请控制在 3 分钟以内。');
            return;
          }
          const analysis = await analyzeVoiceBlob(blob);
          if (analysis.rms !== null && analysis.peak !== null && analysis.rms < 0.003 && analysis.peak < 0.015) {
            setActionError('没有检测到声音，请确认浏览器麦克风权限和系统输入设备后重新录制。');
            return;
          }
          const file = new File([blob], `voice-${Date.now()}.${voiceFileExtension(type)}`, { type });
          if (shouldAutoSend) {
            const metadata: MessageMetadata | undefined = quote ? { quote } : undefined;
            if (quote) {
              setQuote(null);
            }
            setActionError('');
            stickToBottomRef.current = true;
            sendMutation.mutate({ content: '', type: 'voice', metadata, voiceFile: file, voiceDurationMs: durationMs, voiceWaveform: analysis.waveform });
            return;
          }
          setStagedVoice({ file, previewUrl: URL.createObjectURL(blob), durationMs, contentType: type, size: blob.size, waveform: analysis.waveform });
        })();
      };
      recorder.start(1000);
      setActionError('');
      setIsRecordingVoice(true);
      setVoiceRecordingMs(0);
      voiceRecordTimerRef.current = window.setInterval(() => {
        const elapsed = Date.now() - voiceRecordStartedAtRef.current;
        setVoiceRecordingMs(elapsed);
        if (elapsed >= MAX_VOICE_RECORDING_MS) {
          mediaRecorderRef.current?.stop();
        }
      }, 200);
      return true;
    } catch {
      voiceRecordAutoSendRef.current = false;
      clearVoiceRecordingTimer();
      stopVoiceStream();
      setIsRecordingVoice(false);
      setMobileVoicePreparing(false);
      setActionError('无法访问麦克风，请检查浏览器权限。');
      return false;
    }
  };

  const stopVoiceRecording = (): void => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  };

  const cancelVoiceRecording = (): void => {
    voiceRecordAutoSendRef.current = false;
    voiceRecordCancelledRef.current = true;
    setMobileVoicePreparing(false);
    setMobileVoiceCanceling(false);
    mobileVoicePointerIdRef.current = null;
    mobileVoiceStartYRef.current = 0;
    mobileVoiceCancelAfterStartRef.current = false;
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
      return;
    }
    clearVoiceRecordingTimer();
    stopVoiceStream();
    setIsRecordingVoice(false);
    setVoiceRecordingMs(0);
  };

  function releaseMobileVoicePointer(target: EventTarget & Element, pointerId: number): void {
    if ('releasePointerCapture' in target) {
      try {
        target.releasePointerCapture(pointerId);
      } catch {
        // The pointer may already be released by the browser.
      }
    }
  }

  function handleMobileVoicePointerDown(event: React.PointerEvent<HTMLButtonElement>): void {
    if (sendMutation.isPending || isRecordingVoice || mobileVoicePreparing) {
      return;
    }
    event.preventDefault();
    setShowEmojiPicker(false);
    mobileVoicePointerIdRef.current = event.pointerId;
    mobileVoiceStartYRef.current = event.clientY;
    mobileVoiceCancelAfterStartRef.current = false;
    setMobileVoiceCanceling(false);
    if ('setPointerCapture' in event.currentTarget) {
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture is best-effort on older Android WebViews.
      }
    }
    setMobileVoicePreparing(true);
    void startVoiceRecording({ autoSend: true }).then((started) => {
      setMobileVoicePreparing(false);
      if (!started) {
        mobileVoicePointerIdRef.current = null;
        mobileVoiceStartYRef.current = 0;
        mobileVoiceCancelAfterStartRef.current = false;
        setMobileVoiceCanceling(false);
        return;
      }
      if (mobileVoiceCancelAfterStartRef.current) {
        cancelVoiceRecording();
      }
    });
  }

  function handleMobileVoicePointerMove(event: React.PointerEvent<HTMLButtonElement>): void {
    if (mobileVoicePointerIdRef.current !== event.pointerId) {
      return;
    }
    event.preventDefault();
    const shouldCancel = mobileVoiceStartYRef.current - event.clientY >= MOBILE_VOICE_CANCEL_DISTANCE;
    mobileVoiceCancelAfterStartRef.current = shouldCancel;
    setMobileVoiceCanceling(shouldCancel);
  }

  function handleMobileVoicePointerUp(event: React.PointerEvent<HTMLButtonElement>): void {
    if (mobileVoicePointerIdRef.current !== event.pointerId) {
      return;
    }
    event.preventDefault();
    const shouldCancel = mobileVoiceCancelAfterStartRef.current || mobileVoiceStartYRef.current - event.clientY >= MOBILE_VOICE_CANCEL_DISTANCE;
    mobileVoicePointerIdRef.current = null;
    mobileVoiceStartYRef.current = 0;
    releaseMobileVoicePointer(event.currentTarget, event.pointerId);
    if (shouldCancel) {
      cancelVoiceRecording();
      return;
    }
    setMobileVoiceCanceling(false);
    if (mediaRecorderRef.current?.state === 'recording') {
      stopVoiceRecording();
      return;
    }
    mobileVoiceCancelAfterStartRef.current = true;
    setMobileVoicePreparing(false);
  }

  function handleMobileVoicePointerCancel(event: React.PointerEvent<HTMLButtonElement>): void {
    if (mobileVoicePointerIdRef.current !== event.pointerId) {
      return;
    }
    event.preventDefault();
    mobileVoicePointerIdRef.current = null;
    mobileVoiceStartYRef.current = 0;
    releaseMobileVoicePointer(event.currentTarget, event.pointerId);
    if (mediaRecorderRef.current?.state === 'recording') {
      cancelVoiceRecording();
      return;
    }
    mobileVoiceCancelAfterStartRef.current = true;
    setMobileVoicePreparing(false);
    setMobileVoiceCanceling(false);
  }

  function toggleMobileVoiceMode(): void {
    setShowEmojiPicker(false);
    setMobileVoiceMode((value) => !value);
    setActionError('');
  }

  function exitMobileVoiceMode(): void {
    if (isRecordingVoice || mobileVoicePreparing) {
      cancelVoiceRecording();
    }
    setMobileVoiceMode(false);
  }

  const sendMutation = useMutation({
    mutationFn: async ({ content, type, metadata, files, voiceFile, voiceDurationMs, voiceWaveform }: SendMessageVariables) => {
      if (!activeConversationId) {
        throw new Error('No active conversation');
      }
      if (type === 'voice' && voiceFile) {
        const uploaded = await uploadMessageVoice(voiceFile);
        return sendMessage(activeConversationId, uploaded.url, 'voice', {
          ...(metadata ?? {}),
          voice: {
            duration_ms: voiceDurationMs,
            content_type: uploaded.content_type ?? voiceFile.type,
            size: voiceFile.size,
            waveform: voiceWaveform
          }
        });
      }
      const uploadFiles = files ?? [];
      const uploadedImages = uploadFiles.length > 0
        ? await Promise.all(uploadFiles.map(async (file) => {
          const uploaded = await uploadMessageImage(file);
          return uploaded.url;
        }))
        : [];
      if (uploadedImages.length === 1 && !content.trim() && type === 'image') {
        return sendMessage(activeConversationId, uploadedImages[0], 'image', metadata);
      }
      const nextMetadata: MessageMetadata | undefined = uploadedImages.length > 0
        ? { ...(metadata ?? {}), images: uploadedImages }
        : metadata;
      return sendMessage(activeConversationId, content, type, nextMetadata);
    },
    onSuccess: (message) => {
      stickToBottomRef.current = true;
      upsertCachedMessage(message.conversation_id, message);
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : '发送失败，请稍后重试。';
      if (/20 messages|per minute|429/i.test(message)) {
        setActionError('发送太频繁了，每分钟最多发送 20 条消息。');
        return;
      }
      if (/500/.test(message)) {
        setActionError('消息内容不能超过 500 字。');
        return;
      }
      if (/3MB|413|too large/i.test(message)) {
        setActionError(/voice|语音/i.test(message) ? '语音不能超过 2MB。' : '图片压缩后不能超过 3MB（GIF 保留原图，原图不能超过 3MB）。');
        return;
      }
      setActionError(message || '发送失败，请稍后重试。');
    }
  });

  const recallMutation = useMutation({
    mutationFn: ({ conversationId, messageId }: { conversationId: number; messageId: number }) => recallMessage(conversationId, messageId),
    onSuccess: (message, variables) => {
      patchCachedMessage(variables.conversationId, message.id, (current) => ({ ...current, ...message }));
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    }
  });

  const deleteLocalMutation = useMutation({
    mutationFn: ({ conversationId, messageId }: { conversationId: number; messageId: number }) => deleteMessageLocal(conversationId, messageId),
    onSuccess: (_result, variables) => {
      setActionError('');
      void queryClient.resetQueries({ queryKey: ['messages', variables.conversationId], exact: true });
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: () => setActionError('删除本地消息失败，请稍后重试。')
  });

  const bookmarkMutation = useMutation({
    mutationFn: ({ conversationId, messageId }: { conversationId: number; messageId: number }) => toggleMessageBookmark(conversationId, messageId),
    onSuccess: (result, variables) => {
      setActionError('');
      patchCachedMessage(variables.conversationId, variables.messageId, (message) => ({ ...message, bookmarked_by_me: result.bookmarked }));
      void queryClient.invalidateQueries({ queryKey: ['bookmarks-all'] });
    },
    onError: () => setActionError('收藏状态更新失败，请稍后重试。')
  });

  const featureMutation = useMutation({
    mutationFn: ({ conversationId, messageId }: { conversationId: number; messageId: number }) => toggleMessageFeature(conversationId, messageId),
    onSuccess: (result, variables) => {
      setActionError('');
      patchCachedMessage(variables.conversationId, variables.messageId, (message) => ({ ...message, featured: result.featured }));
      void queryClient.invalidateQueries({ queryKey: ['featured-messages', variables.conversationId] });
    },
    onError: (error, variables) => {
      if (!reportFeaturedLimit(error, variables.conversationId, true)) {
        setActionError(error instanceof Error && error.message ? error.message : '精华状态更新失败，请稍后重试。');
      }
    }
  });

  const forwardMutation = useMutation({
    mutationFn: ({ targetConversationId, sourceConversationId, messageIds, note }: { targetConversationId: number; sourceConversationId: number; messageIds: number[]; note?: string }) => forwardMessageBundle(targetConversationId, sourceConversationId, messageIds, note),
    onSuccess: (message, variables) => {
      setActionError('');
      setForwardTarget(null);
      setSelectedMessageIds([]);
      setMultiSelectMode(false);
      upsertCachedMessage(variables.targetConversationId, message);
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: (error) => setActionError(forwardErrorText(error))
  });

  const reactionMutation = useMutation({
    mutationFn: ({ conversationId, messageId, emoji }: { conversationId: number; messageId: number; emoji: string }) => toggleMessageReaction(conversationId, messageId, emoji),
    onSuccess: (summary, variables) => {
      setActionError('');
      patchCachedMessage(variables.conversationId, variables.messageId, (message) => ({ ...message, reactions: summary }));
    },
    onError: () => setActionError('表情回应失败，请稍后重试。')
  });

  const favoriteStickerMutation = useMutation({
    mutationFn: (sourceUrl: string) => addFavoriteSticker(sourceUrl),
    onSuccess: () => {
      setActionError('');
      setMessageMenu(null);
      void queryClient.invalidateQueries({ queryKey: ['favorite-stickers'] });
      toast.success('已添加到收藏表情');
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : '添加收藏表情失败，请稍后重试。';
      setActionError(message || '添加收藏表情失败，请稍后重试。');
    }
  });

  const removeFavoriteStickerMutation = useMutation({
    mutationFn: (assetId: number) => removeFavoriteSticker(assetId),
    onSuccess: () => {
      setActionError('');
      void queryClient.invalidateQueries({ queryKey: ['favorite-stickers'] });
      toast.success('已删除收藏表情');
    },
    onError: () => setActionError('删除收藏表情失败，请稍后重试。')
  });

  const directMutation = useMutation({
    mutationFn: createDirectConversation,
    onSuccess: (conversation) => {
      setActionError('');
      setActiveConversationId(conversation.id);
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: () => setActionError('发起私聊失败，请稍后重试。')
  });

  const closeTemporaryMutation = useMutation({
    mutationFn: closeTemporaryConversation,
    onSuccess: (_result, conversationId) => {
      setActionError('');
      if (activeConversationId === conversationId) {
        setActiveConversationId(null);
      }
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast.info('临时会话已关闭');
    },
    onError: () => setActionError('关闭临时会话失败，请稍后重试。')
  });

  const blockTemporaryMutation = useMutation({
    mutationFn: blockTemporaryConversation,
    onSuccess: (_result, conversationId) => {
      setActionError('');
      if (activeConversationId === conversationId) {
        setActiveConversationId(null);
      }
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast.info('已屏蔽此人的临时会话');
    },
    onError: () => setActionError('屏蔽临时会话失败，请稍后重试。')
  });

  const friendRequestMutation = useMutation({
    mutationFn: sendFriendRequest,
    onSuccess: (request, receiverId) => {
      setActionError('');
      setMemberMenu(null);
      setUserCard(null);
      setLocallyPendingFriendIds((current) => {
        const next = new Set(current);
        next.add(request.receiver_id ?? receiverId);
        return next;
      });
      toast.success('好友申请已发送', { subtitle: '等待对方通过' });
      void queryClient.invalidateQueries({ queryKey: ['friend-requests'] });
      void queryClient.invalidateQueries({ queryKey: ['friend-requests', 'outgoing'] });
    },
    onError: () => toast.error('好友申请发送失败，可能已是好友或已有待处理申请。')
  });

  const roleMutation = useMutation({
    mutationFn: ({ conversationId, userId, role }: { conversationId: number; userId: number; role: MemberRole }) => updateConversationMemberRole(conversationId, userId, role),
    onSuccess: (_member, variables) => {
      setActionError('');
      invalidateConversationMembers(variables.conversationId);
    },
    onError: () => setActionError('成员角色更新失败，请稍后重试。')
  });

  const muteMutation = useMutation({
    mutationFn: ({ conversationId, userId, muted, mutedUntil }: { conversationId: number; userId: number; muted: boolean; mutedUntil?: string | null }) => updateConversationMemberMute(conversationId, userId, muted, mutedUntil),
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: ['conversation-members', variables.conversationId] });
      await queryClient.cancelQueries({ queryKey: ['conversation-members-page', variables.conversationId] });
      patchMemberMuteCaches(variables.conversationId, variables.userId, variables.muted, variables.mutedUntil ?? null);
      setMemberMenu(null);
    },
    onSuccess: (member, variables) => {
      setActionError('');
      patchMemberMuteCaches(variables.conversationId, variables.userId, Boolean(member.muted), member.muted_until ?? null);
    },
    onError: (_error, variables) => {
      invalidateConversationMembers(variables.conversationId);
      setActionError('成员禁言更新失败，请稍后重试。');
    },
    onSettled: (_data, _error, variables) => {
      if (variables) {
        void queryClient.invalidateQueries({ queryKey: ['conversation-members', variables.conversationId] });
        void queryClient.invalidateQueries({ queryKey: ['conversation-members-page', variables.conversationId] });
      }
    }
  });

  const removeMutation = useMutation({
    mutationFn: ({ conversationId, userId }: { conversationId: number; userId: number }) => removeConversationMember(conversationId, userId),
    onSuccess: (_result, variables) => {
      setActionError('');
      invalidateConversationMembers(variables.conversationId);
    },
    onError: () => setActionError('移除成员失败，请稍后重试。')
  });

  const titleMutation = useMutation({
    mutationFn: ({ conversationId, userId, title }: { conversationId: number; userId: number; title: string | null }) => updateConversationMemberTitle(conversationId, userId, title),
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: ['conversation-members', variables.conversationId] });
      await queryClient.cancelQueries({ queryKey: ['conversation-members-page', variables.conversationId] });
      await queryClient.cancelQueries({ queryKey: ['messages', variables.conversationId] });
      patchMemberTitleCaches(variables.conversationId, variables.userId, variables.title);
      setMemberMenu(null);
    },
    onSuccess: (_member, variables) => {
      setActionError('');
      toast.success(variables.title ? '群头衔已更新' : '群头衔已清除');
    },
    onError: (_error, variables) => {
      invalidateConversationMembers(variables.conversationId);
      setActionError('群头衔更新失败，请稍后重试。');
    },
    onSettled: (_data, _error, variables) => {
      if (variables) {
        void queryClient.invalidateQueries({ queryKey: ['conversation-members', variables.conversationId] });
        void queryClient.invalidateQueries({ queryKey: ['conversation-members-page', variables.conversationId] });
      }
    }
  });

  const reportMutation = useMutation({
    mutationFn: (payload: CreateReportPayload) => createReport(payload),
    onSuccess: () => {
      setActionError('');
      setReportTarget(null);
      toast.success('举报已提交，感谢反馈');
    }
  });

  useEffect(() => {
    if (!composerRef.current) {
      return;
    }
    composerRef.current.innerHTML = '';
    setDraft('');
    setStagedImages((current) => {
      current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      return [];
    });
    setStagedVoice((current) => {
      if (current) {
        URL.revokeObjectURL(current.previewUrl);
      }
      return null;
    });
  }, [activeConversationId]);

  useEffect(() => {
    if (draft || !composerRef.current) {
      return;
    }
    composerRef.current.innerHTML = '';
  }, [draft]);

  useLayoutEffect(() => {
    const conversationChanged = lastConversationIdRef.current !== activeConversationId;
    const initialLoad = conversationChanged || lastMessageIdRef.current === null;
    const hasNewMessage = latestMessageId !== null && latestMessageId !== lastMessageIdRef.current;
    const pendingLatest = pendingScrollToLatestRef.current && latestMessageId !== null;
    const shouldScroll = jumpContextMessageId === null && (initialLoad || pendingLatest || (hasNewMessage && stickToBottomRef.current));
    lastConversationIdRef.current = activeConversationId ?? null;
    lastMessageIdRef.current = latestMessageId;
    if (shouldScroll) {
      if (initialLoad || pendingLatest) {
        forceScrollMessagesToBottom(scrollRef.current);
      } else {
        scrollMessagesToBottom(scrollRef.current, 'smooth');
      }
      pendingScrollToLatestRef.current = false;
      stickToBottomRef.current = true;
      setShowScrollToBottom(false);
    }
  }, [activeConversationId, jumpContextMessageId, latestMessageId]);

  useLayoutEffect(() => {
    const snapshot = preserveScrollSnapshotRef.current;
    const element = scrollRef.current;
    if (!snapshot || !element || snapshot.conversationId !== activeConversationId) {
      if (snapshot && snapshot.conversationId !== activeConversationId) preserveScrollSnapshotRef.current = null;
      return;
    }
    // Media resizes and realtime updates also rerun this effect while the older page is in flight;
    // keep the snapshot until that page actually arrives.
    if ((messagePages?.length ?? 0) <= snapshot.pageCount) return;

    const previousBehavior = element.style.scrollBehavior;
    element.style.scrollBehavior = 'auto';
    // A prepended page can move the previous anchor outside the mounted window.
    // Set the estimated new position first; the measured row can then correct it.
    if (snapshot.messageId !== null && messageIndexById.has(snapshot.messageId)) {
      const index = messageIndexById.get(snapshot.messageId)!;
      element.scrollTop = (messageListRef.current?.offsetTop ?? 0) + virtualMessages.offsets[index] - snapshot.offsetTop;
      virtualMessages.syncScroll();
    }
    const anchor = snapshot.messageId === null ? null : element.querySelector<HTMLElement>(`[data-virtual-message-id="${snapshot.messageId}"]`);
    if (anchor) {
      const rootTop = element.getBoundingClientRect().top;
      element.scrollTop += anchor.getBoundingClientRect().top - rootTop - snapshot.offsetTop;
    } else if (snapshot.messageId === null || !messageIndexById.has(snapshot.messageId)) {
      element.scrollTop = snapshot.top + element.scrollHeight - snapshot.height;
    }
    element.style.scrollBehavior = previousBehavior;
    preserveScrollSnapshotRef.current = null;
  }, [activeConversationId, messagePages, messageIndexById, virtualMessages.offsets]);

  useEffect(() => {
    if (!isMobile || !isNativeApp || import.meta.env.PROD) {
      return;
    }

    const element = scrollRef.current;
    if (!element) {
      return;
    }

    requestAnimationFrame(() => {
      if (element.scrollWidth <= element.clientWidth + 1) {
        return;
      }

      const candidates = Array.from(element.querySelectorAll<HTMLElement>('*'))
        .map((node) => ({
          className: typeof node.className === 'string' ? node.className : String(node.className),
          messageId: node.closest<HTMLElement>('[data-message-id]')?.dataset.messageId,
          scrollWidth: node.scrollWidth,
          clientWidth: node.clientWidth,
          rectWidth: Math.round(node.getBoundingClientRect().width),
          text: node.textContent?.trim().slice(0, 80)
        }))
        .sort((left, right) => Math.max(right.scrollWidth, right.rectWidth) - Math.max(left.scrollWidth, left.rectWidth))
        .slice(0, 8);

      console.warn('[KukeChat] native chat horizontal overflow', {
        conversationId: activeConversationId,
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        candidates
      });
    });
  }, [activeConversationId, isMobile, isNativeApp, messagePages]);

  useEffect(() => {
    setMessageMenu(null);
    setMemberMenu(null);
    setUserCard(null);
    setMobileUserProfile(null);
    setShowInfoDrawer(false);
    setShowAnnouncements(false);
    setShowMemberSearch(false);
    setShowEmojiPicker(false);
    setReactionPicker(null);
    setMultiSelectMode(false);
    setSelectedMessageIds([]);
    setForwardTarget(null);
    setReportTarget(null);
    setForwardDetailMessage(null);
    setShowFeaturedMessages(false);
    setQuote(null);
    setMentions([]);
    setMentionAll(false);
    setMentionPicker(null);
    setMobileVoiceMode(false);
    setMemberSearch('');
    setActionError('');
    setShowScrollToBottom(false);
    stickToBottomRef.current = true;
    pendingScrollToLatestRef.current = false;
    forceScrollMessagesToBottom(scrollRef.current);
  }, [activeConversationId]);

  useEffect(() => {
    if (showMemberSearch) {
      onMembersNeeded?.();
      memberSearchInputRef.current?.focus();
    }
  }, [onMembersNeeded, showMemberSearch]);

  useEffect(() => {
    if (!showMemberSearch) {
      onMemberSearchChange?.('');
      return;
    }
    const timeout = window.setTimeout(() => {
      onMemberSearchChange?.(memberSearch);
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [memberSearch, onMemberSearchChange, showMemberSearch]);

  useEffect(() => {
    if (!showEmojiPicker) {
      return;
    }

    function handlePointerDown(event: MouseEvent): void {
      const picker = emojiPickerRef.current;
      if (picker && !event.composedPath().includes(picker)) {
        setShowEmojiPicker(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [showEmojiPicker]);

  useEffect(() => {
    return () => {
      if (jumpHighlightTimeoutRef.current !== null) {
        window.clearTimeout(jumpHighlightTimeoutRef.current);
      }
      if (muteSubmenuCloseTimeoutRef.current !== null) {
        window.clearTimeout(muteSubmenuCloseTimeoutRef.current);
      }
      clearVoiceRecordingTimer();
      stopVoiceStream();
    };
  }, []);

  useEffect(() => {
    return () => {
      stagedImages.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    };
  }, [stagedImages]);

  useEffect(() => {
    return () => {
      if (stagedVoice) {
        URL.revokeObjectURL(stagedVoice.previewUrl);
      }
    };
  }, [stagedVoice]);

  function openMuteSubmenu(): void {
    if (muteSubmenuCloseTimeoutRef.current !== null) {
      window.clearTimeout(muteSubmenuCloseTimeoutRef.current);
      muteSubmenuCloseTimeoutRef.current = null;
    }
    setShowMuteSubmenu(true);
  }

  function closeMuteSubmenuSoon(): void {
    if (muteSubmenuCloseTimeoutRef.current !== null) {
      window.clearTimeout(muteSubmenuCloseTimeoutRef.current);
    }
    muteSubmenuCloseTimeoutRef.current = window.setTimeout(() => {
      setShowMuteSubmenu(false);
      muteSubmenuCloseTimeoutRef.current = null;
    }, 220);
  }

  function closeMuteSubmenuNow(): void {
    if (muteSubmenuCloseTimeoutRef.current !== null) {
      window.clearTimeout(muteSubmenuCloseTimeoutRef.current);
      muteSubmenuCloseTimeoutRef.current = null;
    }
    setShowMuteSubmenu(false);
  }

  useEffect(() => {
    return subscribePoke((event) => {
      if (event.conversationId !== activeConversationId) {
        return;
      }
      setPokedUserIds((current) => (current.includes(event.userId) ? current : [...current, event.userId]));
      const shakeTimer = window.setTimeout(() => {
        setPokedUserIds((current) => current.filter((id) => id !== event.userId));
      }, 700);

      const tipId = pokeTipIdRef.current + 1;
      pokeTipIdRef.current = tipId;
      const actor = event.actorId === currentUser.id ? '你' : event.actorName;
      const target = event.userId === currentUser.id ? '你' : event.userName;
      // 只留最近几条，刷屏时不至于把消息挤走
      setPokeTips((current) => [...current, { id: tipId, text: `${actor} 戳了戳 ${target}` }].slice(-4));
      const tipTimer = window.setTimeout(() => {
        setPokeTips((current) => current.filter((tip) => tip.id !== tipId));
      }, 6000);

      pokeTimersRef.current.push(shakeTimer, tipTimer);
    });
  }, [activeConversationId, currentUser.id]);

  useEffect(() => {
    // 切走会话时清干净，别让上一个会话的提示飘到下一个里
    setPokeTips([]);
    setPokedUserIds([]);
  }, [activeConversationId]);

  useEffect(() => {
    return () => {
      pokeTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      pokeTimersRef.current = [];
      if (avatarTapTimerRef.current !== null) {
        window.clearTimeout(avatarTapTimerRef.current);
      }
    };
  }, []);


  useEffect(() => {
    if (!activeConversationId || visibleConversationId !== activeConversationId) {
      return;
    }

    markConversationReadLocally(queryClient, activeConversationId, latestMessageId);
  }, [activeConversationId, latestMessageId, queryClient, visibleConversationId]);

  function composerText(): string {
    const editor = composerRef.current;
    if (!editor) {
      return draft;
    }

    return editablePlainText(editor);
  }

  function composerQuoteFromDom(): MessageQuoteMetadata | null {
    return quote;
  }

  function readMentionMetadataFromComposer(): { mentions: MessageMentionMetadata[]; mentionAll: boolean } {
    const editor = composerRef.current;
    if (!editor) {
      return { mentions, mentionAll };
    }

    const seen = new Set<number>();
    const nextMentions: MessageMentionMetadata[] = [];
    let nextMentionAll = false;
    editor.querySelectorAll<HTMLElement>('[data-mention-token]').forEach((node) => {
      if (node.dataset.mentionAll === 'true') {
        nextMentionAll = true;
        return;
      }
      const userId = Number(node.dataset.mentionId);
      const name = node.dataset.mentionName?.trim() || node.textContent?.replace(/^@/, '').trim();
      if (Number.isFinite(userId) && userId > 0 && name && !seen.has(userId)) {
        seen.add(userId);
        nextMentions.push({ user_id: userId, name });
      }
    });
    return { mentions: nextMentions, mentionAll: nextMentionAll };
  }

  function syncComposerState(updatePicker = true): void {
    const text = composerText();
    if (!text.trim() && composerRef.current?.innerHTML === '<br>') {
      composerRef.current.innerHTML = '';
    }
    const nextMentionData = readMentionMetadataFromComposer();
    setDraft(text);
    setMentions(nextMentionData.mentions);
    setMentionAll(nextMentionData.mentionAll);
    if (updatePicker) {
      updateMentionPickerFromComposer();
    }
  }

  function submit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    syncComposerState(false);
    const text = composerText();
    const content = text.trim();
    const files = stagedImages.map((item) => item.file);
    if ((!content && files.length === 0 && !stagedVoice) || !activeConversationId || sendMutation.isPending) {
      refocusMobileComposerAfterSubmit();
      return;
    }
    if (stagedVoice && (content || files.length > 0)) {
      setActionError('语音消息不能和文字或图片一起发送。');
      refocusMobileComposerAfterSubmit();
      return;
    }
    if (content.length > MAX_MESSAGE_CONTENT_LENGTH) {
      setActionError('消息内容不能超过 500 字。');
      refocusMobileComposerAfterSubmit();
      return;
    }
    const mentionData = readMentionMetadataFromComposer();
    const metadata: MessageMetadata = {};
    const quoteData = composerQuoteFromDom() ?? quote;
    if (quoteData) {
      metadata.quote = quoteData;
    }
    if (mentionData.mentions.length > 0) {
      metadata.mentions = mentionData.mentions;
    }
    if (mentionData.mentionAll) {
      metadata.mention_all = true;
    }
    const hasMetadata = Object.keys(metadata).length > 0;
    const type: MessageType = stagedVoice ? 'voice' : files.length === 1 && !content ? 'image' : 'text';
    const variables: SendMessageVariables = stagedVoice
      ? { content: '', type: 'voice', metadata: hasMetadata ? metadata : undefined, voiceFile: stagedVoice.file, voiceDurationMs: stagedVoice.durationMs, voiceWaveform: stagedVoice.waveform }
      : { content: text.trim() ? text.trimEnd() : '', type, metadata: hasMetadata ? metadata : undefined, files };
    clearComposer();
    clearStagedImages();
    clearStagedVoice();
    setActionError('');
    refocusMobileComposerAfterSubmit();
    sendMutation.mutate(variables);
  }

  function composerEndRange(editor: HTMLElement): Range {
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    return range;
  }

  function getComposerSelectionRange(): Range | null {
    const editor = composerRef.current;
    const selection = window.getSelection();
    if (!editor || !selection || selection.rangeCount === 0) {
      return null;
    }
    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;
    return container === editor || editor.contains(container) ? range : null;
  }

  function setComposerSelection(range: Range): void {
    const selection = window.getSelection();
    if (!selection) {
      return;
    }
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function refocusComposerAtEnd(): void {
    const editor = composerRef.current;
    if (!editor) {
      return;
    }

    editor.focus({ preventScroll: true });
    setComposerSelection(composerEndRange(editor));
  }

  function refocusMobileComposerAfterSubmit(): void {
    if (!isMobile || mobileVoiceMode) {
      return;
    }

    refocusComposerAtEnd();
    requestAnimationFrame(refocusComposerAtEnd);
  }

  function preventMobileSendFocusTransfer(event: React.SyntheticEvent<HTMLButtonElement>): void {
    if (mobileVoiceMode || event.currentTarget.disabled) {
      return;
    }

    event.preventDefault();
  }

  function handleMobileSendPointerDown(event: React.PointerEvent<HTMLButtonElement>): void {
    preventMobileSendFocusTransfer(event);
  }

  function handleMobileSendMouseDown(event: React.MouseEvent<HTMLButtonElement>): void {
    preventMobileSendFocusTransfer(event);
  }

  function handleMobileSendTouchStart(event: React.TouchEvent<HTMLButtonElement>): void {
    if ('PointerEvent' in window) {
      return;
    }

    preventMobileSendFocusTransfer(event);
  }

  function handleMobileSendTouchEnd(event: React.TouchEvent<HTMLButtonElement>): void {
    if ('PointerEvent' in window || mobileVoiceMode || event.currentTarget.disabled) {
      return;
    }

    event.preventDefault();
    event.currentTarget.form?.requestSubmit(event.currentTarget);
  }

  function rangeIntersectsReadonlyToken(range: Range): boolean {
    const editor = composerRef.current;
    if (!editor) {
      return false;
    }
    return Array.from(editor.querySelectorAll<HTMLElement>('[data-quote-token], [data-mention-token]')).some((node) => range.intersectsNode(node));
  }

  function lastTextRangeInComposer(): Range | null {
    const editor = composerRef.current;
    if (!editor) {
      return null;
    }
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        const parent = node.parentElement;
        return parent?.closest('[data-quote-token], [data-mention-token]') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      }
    });
    let last: Text | null = null;
    let node = walker.nextNode() as Text | null;
    while (node) {
      last = node;
      node = walker.nextNode() as Text | null;
    }
    if (!last) {
      return null;
    }
    const range = document.createRange();
    range.setStart(last, last.data.length);
    range.collapse(true);
    return range;
  }

  function composerTextSegments(): Array<{ node: Text; start: number; end: number }> {
    const editor = composerRef.current;
    if (!editor) {
      return [];
    }

    const segments: Array<{ node: Text; start: number; end: number }> = [];
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    let offset = 0;
    let current = walker.nextNode() as Text | null;
    while (current) {
      const length = current.data.replace(/\u00a0/g, ' ').length;
      segments.push({ node: current, start: offset, end: offset + length });
      offset += length;
      current = walker.nextNode() as Text | null;
    }
    return segments;
  }

  function textPositionAtOffset(segments: Array<{ node: Text; start: number; end: number }>, offset: number): { node: Text; offset: number } | null {
    if (offset < 0) {
      return null;
    }

    for (const segment of segments) {
      if (offset >= segment.start && offset <= segment.end) {
        return { node: segment.node, offset: Math.min(segment.node.data.length, Math.max(0, offset - segment.start)) };
      }
    }

    const last = segments[segments.length - 1];
    if (!last || offset !== last.end) {
      return null;
    }

    return { node: last.node, offset: last.node.data.length };
  }

  function mentionQueryFromRange(range: Range): string | null {
    const editor = composerRef.current;
    if (!editor) {
      return null;
    }

    const beforeCaretRange = document.createRange();
    beforeCaretRange.selectNodeContents(editor);
    beforeCaretRange.setEnd(range.endContainer, range.endOffset);
    const beforeCaret = beforeCaretRange.toString().replace(/\u00a0/g, ' ');
    const match = beforeCaret.match(/(^|\s)@([^\s@]*)$/);
    return match ? match[2] : null;
  }

  function mentionQueryRange(range: Range): { query: string; range: Range } | null {
    const editor = composerRef.current;
    const query = mentionQueryFromRange(range);
    if (!editor || query === null) {
      return null;
    }

    const beforeCaretRange = document.createRange();
    beforeCaretRange.selectNodeContents(editor);
    beforeCaretRange.setEnd(range.endContainer, range.endOffset);
    const beforeCaret = beforeCaretRange.toString().replace(/\u00a0/g, ' ');

    const caretOffset = beforeCaret.length;
    const replaceLength = query.length + 1;
    const segments = composerTextSegments();
    const start = textPositionAtOffset(segments, caretOffset - replaceLength);
    const end = textPositionAtOffset(segments, caretOffset);
    if (!start || !end) {
      return null;
    }

    const replaceRange = document.createRange();
    replaceRange.setStart(start.node, start.offset);
    replaceRange.setEnd(end.node, end.offset);
    return { query, range: replaceRange };
  }

  function mentionQueryAtComposerEnd(): { query: string; range: Range } | null {
    const editor = composerRef.current;
    if (!editor) {
      return null;
    }

    const text = composerText();
    const match = text.match(/(^|\s)@([^\s@]*)$/);
    if (!match) {
      return null;
    }

    const caretOffset = text.length;
    const replaceLength = match[2].length + 1;
    const segments = composerTextSegments();
    const start = textPositionAtOffset(segments, caretOffset - replaceLength);
    const end = textPositionAtOffset(segments, caretOffset);
    if (!start || !end) {
      return { query: match[2], range: composerEndRange(editor) };
    }

    const replaceRange = document.createRange();
    replaceRange.setStart(start.node, start.offset);
    replaceRange.setEnd(end.node, end.offset);
    return { query: match[2], range: replaceRange };
  }

  function activeMentionFromComposer(): MentionPickerState | null {
    const editor = composerRef.current;
    const fallbackRange = editor && document.activeElement === editor ? composerEndRange(editor) : null;
    const range = getComposerSelectionRange() ?? fallbackRange;
    if (!isGroup || !editor) {
      return null;
    }

    if (range?.collapsed && !rangeIntersectsReadonlyToken(range)) {
      const query = mentionQueryFromRange(range);
      if (query !== null) {
        const nextMention = mentionQueryRange(range);
        return { query, range: nextMention?.range ?? range.cloneRange(), open: true };
      }
    }

    const trailingMention = mentionQueryAtComposerEnd();
    return trailingMention ? { query: trailingMention.query, range: trailingMention.range, open: true } : null;
  }

  function updateMentionPickerFromComposer(): void {
    const nextMention = activeMentionFromComposer();
    if (nextMention) {
      onMembersNeeded?.();
    }
    setMentionPicker(nextMention);
  }

  function insertTextAtCaret(text: string): void {
    const editor = composerRef.current;
    if (!editor) {
      setDraft((current) => `${current}${text}`);
      return;
    }

    const range = getComposerSelectionRange() ?? composerEndRange(editor);
    editor.focus();
    range.deleteContents();
    const textNode = document.createTextNode(text);
    range.insertNode(textNode);
    const nextRange = document.createRange();
    nextRange.setStart(textNode, textNode.data.length);
    nextRange.collapse(true);
    setComposerSelection(nextRange);
    syncComposerState();
  }

  function insertTextAtComposerStart(text: string): void {
    const editor = composerRef.current;
    if (!editor) {
      setDraft((current) => `${text}${current}`);
      return;
    }
    editor.focus({ preventScroll: true });
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(true);
    const textNode = document.createTextNode(text);
    range.insertNode(textNode);
    const nextRange = document.createRange();
    nextRange.setStart(textNode, textNode.data.length);
    nextRange.collapse(true);
    setComposerSelection(nextRange);
    syncComposerState();
  }

  function handleBotInteraction(message: Message, interaction: BotInteraction): void {
    if (interaction.action === 'input') {
      insertTextAtComposerStart(interaction.value ?? '');
      return;
    }
    if (interaction.action === 'callback') {
      triggerMessageInteraction(message.conversation_id, message.id, interactionPayload(interaction))
        .then(() => setActionError(''))
        .catch((error) => setActionError(error instanceof Error ? error.message : '机器人回调发送失败'));
    }
  }

  function insertQuoteToken(quoteData: MessageQuoteMetadata, mentionTarget?: { userId: number; name: string }): void {
    const editor = composerRef.current;
    setQuote(quoteData);
    if (!editor) {
      return;
    }

    if (mentionTarget) {
      insertMentionToken(mentionTarget.name, { userId: mentionTarget.userId, range: composerEndRange(editor), closePicker: true });
    } else if (isGroup && quoteData.sender_name) {
      insertTextAtCaret(`@${quoteData.sender_name} `);
    } else {
      const range = composerEndRange(editor);
      setComposerSelection(range);
      syncComposerState(false);
    }
    requestAnimationFrame(() => editor.focus());
  }

  function insertMentionToken(name: string, options: { userId?: number; mentionAll?: boolean; range?: Range | null; closePicker?: boolean } = {}): void {
    const editor = composerRef.current;
    if (!editor) {
      return;
    }

    let range = options.range ?? activeMentionFromComposer()?.range ?? mentionPicker?.range ?? getComposerSelectionRange() ?? lastTextRangeInComposer() ?? composerEndRange(editor);
    if (rangeIntersectsReadonlyToken(range)) {
      range = lastTextRangeInComposer() ?? composerEndRange(editor);
    }
    editor.focus();
    range.deleteContents();
    const token = document.createElement('span');
    token.contentEditable = 'false';
    token.dataset.mentionToken = 'true';
    token.dataset.mentionName = name;
    if (options.userId) {
      token.dataset.mentionId = String(options.userId);
    }
    if (options.mentionAll) {
      token.dataset.mentionAll = 'true';
    }
    token.className = 'mx-0.5 inline-flex max-w-[160px] select-none items-center rounded-full px-1.5 py-0.5 text-xs font-semibold align-baseline [background:var(--kc-accent-soft)] [color:var(--kc-accent)]';
    token.textContent = `@${name}`;
    const space = document.createTextNode(' ');
    const fragment = document.createDocumentFragment();
    fragment.append(token, space);
    range.insertNode(fragment);
    const nextRange = document.createRange();
    nextRange.setStart(space, space.data.length);
    nextRange.collapse(true);
    setComposerSelection(nextRange);
    syncComposerState(false);
    if (options.closePicker !== false) {
      setMentionPicker(null);
    }
  }

  function handleComposerInput(): void {
    syncComposerState();
  }

  function requestComposerSubmit(editor: HTMLElement): void {
    editor.closest('form')?.requestSubmit();
  }

  function isPlainEnter(event: React.KeyboardEvent<HTMLDivElement>): boolean {
    return event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey;
  }

  function handleMobileComposerBeforeInput(event: React.FormEvent<HTMLDivElement>): void {
    const inputEvent = event.nativeEvent as InputEvent;
    if (inputEvent.isComposing) {
      return;
    }

    if (inputEvent.inputType === 'insertLineBreak') {
      mobileEnterKeyDownAtRef.current = null;
      mobileEnterSkipNextBeforeInputRef.current = false;
      return;
    }

    if (inputEvent.inputType !== 'insertParagraph') {
      return;
    }

    event.preventDefault();
    if (mobileEnterSkipNextBeforeInputRef.current) {
      mobileEnterSkipNextBeforeInputRef.current = false;
      return;
    }
    requestComposerSubmit(event.currentTarget);
  }

  function handleComposerKeyDown(event: React.KeyboardEvent<HTMLDivElement>, mobile: boolean): void {
    if (event.key === 'Escape' && mentionPicker) {
      event.preventDefault();
      setMentionPicker(null);
      return;
    }
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      insertTextAtCaret('\n');
      return;
    }
    if (mobile && isPlainEnter(event)) {
      event.preventDefault();
      if (!event.repeat) {
        mobileEnterKeyDownAtRef.current = event.timeStamp;
      }
      mobileEnterSkipNextBeforeInputRef.current = true;
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey && !mobile) {
      event.preventDefault();
      requestComposerSubmit(event.currentTarget);
      return;
    }
    if (event.key === '@' && isGroup) {
      const editor = composerRef.current;
      const fallbackRange = getComposerSelectionRange() ?? (editor ? composerEndRange(editor) : null);
      if (fallbackRange) {
        setMentionPicker({ query: '', range: fallbackRange.cloneRange(), open: true });
      }
      requestAnimationFrame(() => {
        const nextPicker = activeMentionFromComposer();
        if (nextPicker) {
          setMentionPicker(nextPicker);
        }
      });
      return;
    }
    if (event.key === 'Backspace') {
      const range = getComposerSelectionRange();
      const editor = composerRef.current;
      if (editor && range?.collapsed && range.startContainer === editor) {
        const previous = editor.childNodes.item(range.startOffset - 1);
        if (previous instanceof HTMLElement && previous.dataset.mentionToken === 'true') {
          event.preventDefault();
          previous.remove();
          syncComposerState();
        }
      }
    }
  }

  function handleComposerKeyUp(event: React.KeyboardEvent<HTMLDivElement>, mobile: boolean): void {
    if (mobile && isPlainEnter(event)) {
      event.preventDefault();
      const keyDownAt = mobileEnterKeyDownAtRef.current;
      mobileEnterKeyDownAtRef.current = null;
      mobileEnterSkipNextBeforeInputRef.current = false;
      if (keyDownAt === null) {
        updateMentionPickerFromComposer();
        return;
      }
      if (event.timeStamp - keyDownAt >= MOBILE_ENTER_LONG_PRESS_MS) {
        insertTextAtCaret('\n');
      } else {
        requestComposerSubmit(event.currentTarget);
      }
      return;
    }
    updateMentionPickerFromComposer();
  }

  function insertMention(member: ConversationMember): void {
    const userId = memberUserId(member);
    if (!userId) {
      return;
    }
    const name = member.nickname?.trim() || getDisplayName(member.user, `用户 ${userId}`);
    insertMentionToken(name, { userId });
  }

  function mentionMemberFromMenu(member: ConversationMember): void {
    if (!isGroup) {
      return;
    }
    setMemberMenu(null);
    insertMention(member);
    requestAnimationFrame(() => composerRef.current?.focus());
  }

  function insertMentionAll(): void {
    if (!(currentRole === 'owner' || currentRole === 'admin')) {
      return;
    }
    insertMentionToken('全体成员', { mentionAll: true });
  }

  function showUnavailableAction(): void {
    setActionError('');
    toast.info('该功能尚未完成~');
  }

  function stageImageFiles(files: FileList | File[]): void {
    if (stagedVoice || isRecordingVoice) {
      setActionError('语音消息不能和图片一起发送。');
      return;
    }
    const nextFiles = Array.from(files).filter((file) => file.type.startsWith('image/'));
    if (nextFiles.length === 0) {
      return;
    }
    const oversizedFiles = nextFiles.filter((file) => file.size > (
      /^(image\/jpeg|image\/png|image\/webp)$/i.test(file.type)
        ? MAX_COMPRESSIBLE_IMAGE_ORIGINAL_BYTES
        : MAX_IMAGE_UPLOAD_BYTES
    ));
    const validFiles = nextFiles.filter((file) => !oversizedFiles.includes(file));
    setActionError(oversizedFiles.length > 0
      ? `JPEG/PNG/WEBP 原图不能超过 12MB，GIF 及其他图片原图不能超过 3MB；压缩后不能超过 3MB。已忽略：${oversizedFiles.map((file) => `${file.name} (${formatBytes(file.size)})`).join('、')}`
      : '');
    if (validFiles.length === 0) {
      return;
    }
    setStagedImages((current) => [
      ...current,
      ...validFiles.map((file, index) => ({
        id: `${Date.now()}-${current.length + index}-${file.name}`,
        file,
        previewUrl: URL.createObjectURL(file)
      }))
    ]);
  }

  function removeStagedImage(id: string): void {
    setStagedImages((current) => {
      const target = current.find((item) => item.id === id);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return current.filter((item) => item.id !== id);
    });
  }

  function chooseImage(event: React.ChangeEvent<HTMLInputElement>): void {
    const files = event.target.files;
    if (files && files.length > 0) {
      stageImageFiles(files);
    }
    event.target.value = '';
  }

  function handlePaste(event: React.ClipboardEvent<HTMLFormElement>): void {
    const imageFiles = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith('image/'));
    if (imageFiles.length === 0) {
      const text = event.clipboardData.getData('text/plain');
      if (text) {
        event.preventDefault();
        insertTextAtCaret(text);
      }
      return;
    }
    event.preventDefault();
    stageImageFiles(imageFiles);
  }

  function visibleMessagesByIds(ids: number[]): Message[] {
    const selectedIds = new Set(ids);
    return messages.filter((message) => selectedIds.has(message.id) && !message.recalled_at);
  }

  async function fetchNewerContextMessages(): Promise<void> {
    if (!activeConversationId || jumpContextMessageId === null || latestMessageId === null || newerContextFetchRef.current || reachedLatestInContextRef.current) {
      return;
    }

    const requestedAfterId = latestMessageId;
    newerContextFetchRef.current = true;
    setIsFetchingNewerContext(true);
    try {
      const contextMessages = await getMessageContext(activeConversationId, requestedAfterId, { before: 0, after: MESSAGE_PAGE_SIZE });
      const newerMessages = contextMessages.filter((message) => message.id > requestedAfterId);
      if (newerMessages.length === 0) {
        reachedLatestInContextRef.current = true;
        setJumpContextMessageId(null);
        return;
      }

      stickToBottomRef.current = false;
      contextBottomArmedRef.current = false;
      queryClient.setQueryData<MessagesInfiniteData | undefined>(['messages', activeConversationId], (current) => appendNewerMessagesIntoFirstPage(current, newerMessages));
      if (newerMessages.length < MESSAGE_PAGE_SIZE) {
        reachedLatestInContextRef.current = true;
        setJumpContextMessageId(null);
      }
      setShowScrollToBottom(true);
    } catch {
      toast.error('加载更新消息失败，请稍后重试。');
    } finally {
      newerContextFetchRef.current = false;
      setIsFetchingNewerContext(false);
    }
  }

  function handleMessagesScroll(): void {
    virtualMessages.syncScroll();
    const element = scrollRef.current;
    const nearBottom = isNearBottom(element);
    stickToBottomRef.current = nearBottom;
    setShowScrollToBottom(!nearBottom);
    if (element && jumpContextMessageId !== null) {
      if (!nearBottom && !newerContextFetchRef.current) {
        contextBottomArmedRef.current = true;
      } else if (contextBottomArmedRef.current) {
        contextBottomArmedRef.current = false;
        void fetchNewerContextMessages();
      }
    }
    if (!element || activeConversationId === null || element.scrollTop >= 120 || !messagesQuery.hasNextPage || messagesQuery.isFetchingNextPage) {
      return;
    }

    const rootTop = element.getBoundingClientRect().top;
    const anchor = Array.from(element.querySelectorAll<HTMLElement>('[data-virtual-message-id]')).find((node) => node.getBoundingClientRect().bottom > rootTop + 1) ?? null;
    preserveScrollSnapshotRef.current = {
      conversationId: activeConversationId,
      pageCount: messagePages?.length ?? 0,
      messageId: anchor ? Number(anchor.dataset.virtualMessageId) : null,
      offsetTop: anchor ? anchor.getBoundingClientRect().top - rootTop : 0,
      height: element.scrollHeight,
      top: element.scrollTop
    };
    stickToBottomRef.current = false;
    setShowScrollToBottom(true);
    void messagesQuery.fetchNextPage();
  }

  function scrollToLatestMessage(): void {
    setJumpContextMessageId(null);
    pendingScrollToLatestRef.current = true;
    void queryClient.resetQueries({ queryKey: ['messages', activeConversationId], exact: true });
    stickToBottomRef.current = true;
    setShowScrollToBottom(false);
    forceScrollMessagesToBottom(scrollRef.current);
  }

  function copyMessages(messagesToCopy: Message[]): void {
    if (messagesToCopy.length === 0) {
      return;
    }

    copyText(messagesToCopy.map(messageReadableLine).join('\n'));
  }

  function startMultiSelect(message?: Message): void {
    // 多选出来是要转发的，红包、礼物、群文件消息不能转发
    if (message?.recalled_at || isRedPacketMessage(message) || isGiftMessage(message) || (message && groupFileMetaOf(message))) {
      return;
    }
    setMultiSelectMode(true);
    setSelectedMessageIds(message ? [message.id] : []);
    setMessageMenu(null);
  }

  function cancelMultiSelect(): void {
    setMultiSelectMode(false);
    setSelectedMessageIds([]);
  }

  function toggleMessageSelected(message: Message): void {
    if (message.recalled_at || isRedPacketMessage(message) || isGiftMessage(message) || groupFileMetaOf(message)) {
      return;
    }
    setSelectedMessageIds((current) => (current.includes(message.id) ? current.filter((id) => id !== message.id) : [...current, message.id]));
  }

  function openForwardModal(messageIds: number[]): void {
    const cleanMessageIds = Array.from(new Set(messageIds)).filter((messageId) => visibleMessagesByIds([messageId]).some((message) => !isRedPacketMessage(message) && !isGiftMessage(message) && !groupFileMetaOf(message)));
    if (cleanMessageIds.length === 0) {
      return;
    }
    setForwardTarget({ messageIds: cleanMessageIds });
    setMessageMenu(null);
  }

  function openMessageReport(message: Message): void {
    if (message.recalled_at) {
      return;
    }
    const conversationId = activeConversationId ?? message.conversation_id;
    const senderId = message.sender_id ?? message.sender?.id;
    setReportTarget({
      targetType: 'message',
      targetId: message.id,
      targetLabel: `消息：${truncateText(messagePreview(message), 48) || '空消息'}`,
      conversationId,
      messageId: message.id,
      reportedUserId: senderId
    });
    setMessageMenu(null);
  }

  function openMemberReport(member: ConversationMember): void {
    const userId = memberUserId(member);
    if (!userId) {
      return;
    }
    const name = member.nickname?.trim() || getDisplayName(member.user, `用户 ${userId}`);
    setReportTarget({
      targetType: 'user',
      targetId: userId,
      targetLabel: `用户：${name}`,
      conversationId: activeConversationId ?? activeConversation?.id,
      reportedUserId: userId
    });
    setMemberMenu(null);
    closeMuteSubmenuNow();
  }

  function openConversationReport(targetConversation: Conversation): void {
    setReportTarget({
      targetType: 'conversation',
      targetId: targetConversation.id,
      targetLabel: `群聊：${conversationDisplayTitle(targetConversation, currentUser)}`,
      conversationId: targetConversation.id
    });
  }

  function copySelectedMessages(): void {
    copyMessages(visibleMessagesByIds(selectedMessageIds));
    cancelMultiSelect();
  }

  function quoteMessage(message: Message): void {
    if (message.recalled_at) {
      return;
    }
    const senderId = message.sender_id ?? message.sender?.id;
    const senderName = messageSenderLabel(message);
    const quoteText = truncateText(messagePreview(message), 120);
    const quoteData = {
      message_id: message.id,
      sender_id: senderId,
      sender_name: senderName,
      preview: quoteText,
      type: message.type,
      content: message.content,
      created_at: message.created_at
    };
    setMessageMenu(null);
    const mentionTarget = isGroup && senderId
      ? { userId: senderId as number, name: senderName }
      : undefined;
    insertQuoteToken(quoteData, mentionTarget);
  }

  function insertEmoji(emoji: string): void {
    insertTextAtCaret(emoji);
  }

  function sendFavoriteSticker(sticker: FavoriteStickerItem): void {
    if (!activeConversationId || sendMutation.isPending) {
      return;
    }
    setActionError('');
    setShowEmojiPicker(false);
    stickToBottomRef.current = true;
    sendMutation.mutate({ content: sticker.url, type: 'image', metadata: { sticker: true, sticker_asset_id: sticker.asset_id } });
  }

  function deleteFavoriteSticker(event: React.MouseEvent<HTMLButtonElement>, sticker: FavoriteStickerItem): void {
    event.stopPropagation();
    if (removeFavoriteStickerMutation.isPending) {
      return;
    }
    if (window.confirm('确定要删除这个收藏表情吗？')) {
      removeFavoriteStickerMutation.mutate(sticker.asset_id);
    }
  }

  function favoriteClickedImage(): void {
    const imageUrl = messageMenu?.clickedImageUrl?.trim();
    if (!imageUrl || favoriteStickerMutation.isPending) {
      return;
    }
    favoriteStickerMutation.mutate(imageUrl);
  }

  /**
   * 按元素定位打开名片。
   *
   * 头像上「单击开名片、双击戳一戳」要靠延时区分，而延时之后 React 合成事件的
   * currentTarget 已经是 null 了，所以这里接元素而不是事件。
   */
  function openUserCardAtElement(element: HTMLElement, user?: User | null, label?: string, member?: ConversationMember | null): void {
    setMessageMenu(null);
    setMemberMenu(null);
    // 机器人不进用户资料，直接打开机器人详情（消息头像 / 名字、成员列表都走这里）
    const botUserId = (user ?? member?.user)?.is_bot ? user?.id ?? member?.user_id ?? member?.user?.id : null;
    if (botUserId && botUserId !== currentUser.id) {
      setUserCard(null);
      openBotForUser(botUserId);
      return;
    }
    const resolvedMember = member ?? (isGroup ? memberFromUser(user) : null);
    if (isMobile) {
      setUserCard(null);
      setMobileUserProfile({ user, label, fallbackUserId: user?.id ?? resolvedMember?.user_id ?? resolvedMember?.user?.id, member: resolvedMember });
      return;
    }
    setUserCard({ user, label, anchor: elementAnchorInContainer(element, overlayRootRef.current) });
  }

  function openUserCard(event: React.MouseEvent<HTMLElement>, user?: User | null, label?: string, member?: ConversationMember | null): void {
    openUserCardAtElement(event.currentTarget, user, label, member);
  }

  /** 「+1」复读：原样把同一句再发一次。 */
  function repeatMessage(content: string): void {
    if (!activeConversationId || sendMutation.isPending) {
      return;
    }
    sendMutation.mutate({ content, type: 'text' });
  }

  function cancelAvatarTap(): void {
    if (avatarTapTimerRef.current !== null) {
      window.clearTimeout(avatarTapTimerRef.current);
      avatarTapTimerRef.current = null;
    }
  }

  /**
   * 头像上的「单击开名片、双击戳一戳」。
   *
   * 不用浏览器的 dblclick：名片一旦弹出来就盖在头像上，第二下会点到弹窗上，
   * dblclick 根本不会触发；触屏上它更是压根不可靠。所以自己数点击 ——
   * 窗口期内的第二下算双击，并把还没执行的「开名片」撤掉。
   */
  function handleAvatarTap(userId: number | null | undefined, openCard: () => void): void {
    const now = Date.now();
    const previous = lastAvatarTapRef.current;
    if (userId && previous && previous.userId === userId && now - previous.at < AVATAR_DOUBLE_TAP_MS) {
      cancelAvatarTap();
      lastAvatarTapRef.current = null;
      void pokeUser(userId);
      return;
    }
    lastAvatarTapRef.current = userId ? { userId, at: now } : null;
    cancelAvatarTap();
    avatarTapTimerRef.current = window.setTimeout(() => {
      avatarTapTimerRef.current = null;
      openCard();
    }, AVATAR_DOUBLE_TAP_MS);
  }

  async function pokeUser(userId: number | null | undefined): Promise<void> {
    const conversationId = activeConversationId;
    if (!conversationId || !userId || userId === currentUser.id) {
      return;
    }
    try {
      await pokeMember(conversationId, userId);
    } catch (error) {
      const detail = error instanceof Error ? error.message : '';
      toast.error(/429|too fast/i.test(detail) ? '戳得太快啦，缓一缓' : '戳一戳失败');
    }
  }

  function openMessageMenu(event: React.MouseEvent<HTMLElement>, message: Message, clickedImageUrl?: string): void {
    event.preventDefault();
    if (clickedImageUrl) {
      event.stopPropagation();
    }
    setUserCard(null);
    setMemberMenu(null);
    setMessageMenu({ message, clickedImageUrl: clickedImageUrl ?? null, ...pointInContainer(event.clientX, event.clientY, overlayRootRef.current) });
  }

  function findMemberByUserId(userId?: number | null): ConversationMember | null {
    if (!userId) {
      return null;
    }
    const conversationId = activeConversationId ?? activeConversation?.id;
    return (conversationId ? cachedMemberFromQueries(conversationId, userId) : null) ?? members.find((member) => memberUserId(member) === userId) ?? null;
  }

  function memberFromUser(user?: User | null, fallbackRole: MemberRole = 'member'): ConversationMember | null {
    const userId = user?.id;
    if (!userId) {
      return null;
    }
    return findMemberByUserId(userId) ?? { id: -userId, conversation_id: activeConversationId ?? activeConversation?.id ?? 0, user_id: userId, role: fallbackRole, user };
  }

  function memberFromMessage(message: Message, user?: User | null): ConversationMember | null {
    const userId = message.sender_id ?? user?.id;
    if (!userId) {
      return null;
    }
    const cachedMember = findMemberByUserId(userId);
    if (cachedMember) {
      return cachedMember;
    }
    const metadataRoleValue = message.metadata?.sender_role;
    const metadataRole = metadataRoleValue === 'owner' || metadataRoleValue === 'admin' || metadataRoleValue === 'member' ? metadataRoleValue : null;
    return { id: -userId, conversation_id: message.conversation_id, user_id: userId, role: metadataRole ?? (userId === currentUser.id ? currentRole : 'member'), user };
  }

  function openMemberMenu(event: React.MouseEvent<HTMLElement>, member: ConversationMember | null): void {
    if (!member) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const userId = memberUserId(member);
    const conversationId = activeConversationId ?? activeConversation?.id ?? member.conversation_id;
    const cachedMember = userId && conversationId ? cachedMemberFromQueries(conversationId, userId) : null;
    const nextMember = cachedMember ?? member;
    setMessageMenu(null);
    setUserCard(null);
    const position = pointInContainer(event.clientX, event.clientY, overlayRootRef.current);
    setMemberMenu({ member: nextMember, ...position, loading: Boolean(userId && conversationId) });
    if (userId && conversationId) {
      void getConversationMember(conversationId, userId).then((freshMember) => {
        patchFullMemberCaches(conversationId, freshMember);
        setMemberMenu((current) => {
          if (!current || memberUserId(current.member) !== userId) {
            return current;
          }
          return { ...current, member: freshMember, loading: false };
        });
      }).catch(() => {
        setMemberMenu((current) => current && memberUserId(current.member) === userId ? { ...current, loading: false } : current);
      });
    }
  }

  function canChangeMemberRole(member: ConversationMember): boolean {
    const userId = memberUserId(member);
    return Boolean(isGroup && currentRole === 'owner' && member.role !== 'owner' && userId && userId !== currentUser.id);
  }

  function canSetMemberTitle(member: ConversationMember): boolean {
    const userId = memberUserId(member);
    return Boolean(isGroup && currentRole === 'owner' && member.role !== 'owner' && userId && userId !== currentUser.id);
  }

  function canToggleMute(member: ConversationMember): boolean {
    const userId = memberUserId(member);
    if (!isGroup || !userId || userId === currentUser.id || currentRole === 'member') {
      return false;
    }
    return currentRole === 'owner' ? member.role !== 'owner' : member.role === 'member';
  }

  function canRemoveMember(member: ConversationMember): boolean {
    const userId = memberUserId(member);
    if (!isGroup || !userId || userId === currentUser.id || member.role === 'owner' || currentRole === 'member') {
      return false;
    }
    return currentRole === 'owner' || member.role === 'member';
  }

  function openMemberProfile(member: ConversationMember): void {
    const userId = memberUserId(member);
    const label = userId ? `用户 ${userId}` : '成员';
    const user = resolveKnownUser(member.user, userId, friends);
    if (isMobile) {
      setMobileUserProfile({ user, label, fallbackUserId: user?.id ?? member.user_id ?? member.user?.id, member });
      setUserCard(null);
    } else {
      setUserCard({ user, label, anchor: { left: memberMenu?.left ?? 0, top: memberMenu?.top ?? 0 } });
    }
    setMemberMenu(null);
  }

  function startDirectMessage(member: ConversationMember): void {
    const userId = memberUserId(member);
    if (!userId || userId === currentUser.id || directMutation.isPending) {
      return;
    }
    directMutation.mutate({ user_id: userId, temporary: Boolean(isGroup) });
    setMemberMenu(null);
  }

  function startDirectMessageForUser(user?: User | null): void {
    const userId = user?.id;
    if (!userId || userId === currentUser.id || directMutation.isPending) {
      return;
    }
    directMutation.mutate({ user_id: userId, temporary: false });
    setUserCard(null);
    setMobileUserProfile(null);
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
    requestFriend(resolveKnownUser(member.user, userId, friends));
  }

  function closeTemporaryCurrent(): void {
    if (!activeConversationId || closeTemporaryMutation.isPending) {
      return;
    }
    closeTemporaryMutation.mutate(activeConversationId);
  }

  function blockTemporaryCurrent(): void {
    if (!activeConversationId || blockTemporaryMutation.isPending) {
      return;
    }
    blockTemporaryMutation.mutate(activeConversationId);
  }

  function changeMemberRole(member: ConversationMember): void {
    const userId = memberUserId(member);
    if (!activeConversationId || !userId || !canChangeMemberRole(member) || roleMutation.isPending) {
      return;
    }
    roleMutation.mutate({ conversationId: activeConversationId, userId, role: member.role === 'admin' ? 'member' : 'admin' });
    setMemberMenu(null);
  }

  function setMemberCustomTitle(member: ConversationMember): void {
    const userId = memberUserId(member);
    if (!activeConversationId || !userId || !canSetMemberTitle(member) || titleMutation.isPending) {
      return;
    }
    const name = getDisplayName(member.user, `用户 ${userId}`);
    const nextTitle = window.prompt(`设置 ${name} 的群头衔（留空清除）`, member.title ?? '');
    if (nextTitle === null) {
      return;
    }
    titleMutation.mutate({ conversationId: activeConversationId, userId, title: nextTitle.trim() || null });
  }

  function memberMuted(member: ConversationMember): boolean {
    const userId = memberUserId(member);
    const conversationId = activeConversationId ?? activeConversation?.id ?? member.conversation_id;
    const status = userId && conversationId ? memberMuteStatusByKey[`${conversationId}:${userId}`] : undefined;
    const muted = status?.muted ?? Boolean(member.muted);
    const mutedUntil = status?.muted_until ?? member.muted_until ?? null;
    if (!muted) {
      return false;
    }
    const until = parseApiDate(mutedUntil);
    return !mutedUntil || !until || until.getTime() > Date.now();
  }

  function toggleMemberMute(member: ConversationMember, minutes?: number): void {
    const userId = memberUserId(member);
    const conversationId = activeConversationId ?? activeConversation?.id ?? member.conversation_id;
    if (!conversationId || !userId || !canToggleMute(member) || muteMutation.isPending) {
      return;
    }
    const isMuted = memberMuted(member);
    const mutedUntil = minutes ? new Date(Date.now() + minutes * 60 * 1000).toISOString() : null;
    muteMutation.mutate({ conversationId, userId, muted: !isMuted, mutedUntil: !isMuted ? mutedUntil : null });
    setMemberMenu(null);
  }

  function setMemberMuteDuration(member: ConversationMember, option: MuteMenuOption): void {
    if (option.custom) {
      setCustomMute({ member, value: '', unit: 'minutes' });
      setMemberMenu(null);
      setShowMuteSubmenu(false);
      return;
    }
    if (!option.minutes) {
      setMemberMenu(null);
      setShowMuteSubmenu(false);
      return;
    }
    toggleMemberMute(member, option.minutes);
  }

  function customMuteMinutes(state: CustomMuteState): number | null {
    const value = Number(state.value);
    if (!Number.isFinite(value) || value <= 0) {
      return null;
    }
    if (state.unit === 'days') {
      return Math.round(value * 24 * 60);
    }
    if (state.unit === 'hours') {
      return Math.round(value * 60);
    }
    return Math.round(value);
  }

  function confirmCustomMute(): void {
    if (!customMute) {
      return;
    }
    const minutes = customMuteMinutes(customMute);
    if (!minutes) {
      toast.error('请输入有效的禁言时长');
      return;
    }
    if (minutes > 365 * 24 * 60) {
      toast.error('禁言时长不能超过365天');
      return;
    }
    toggleMemberMute(customMute.member, minutes);
    setCustomMute(null);
  }

  function removeMember(member: ConversationMember): void {
    const userId = memberUserId(member);
    if (!activeConversationId || !userId || !canRemoveMember(member) || removeMutation.isPending) {
      return;
    }
    const name = member.nickname?.trim() || getDisplayName(member.user, `用户 ${userId}`);
    if (!window.confirm(`确定将 ${name} 移出群聊吗？`)) {
      return;
    }
    removeMutation.mutate({ conversationId: activeConversationId, userId });
    setMemberMenu(null);
  }

  function toggleReaction(message: Message, emoji: string): void {
    const conversationId = activeConversationId ?? message.conversation_id;
    if (!conversationId || message.recalled_at || reactionMutation.isPending) {
      return;
    }
    reactionMutation.mutate({ conversationId, messageId: message.id, emoji });
    setMessageMenu(null);
    setReactionPicker(null);
  }

  function openReactionPicker(event: React.MouseEvent<HTMLElement>, message: Message): void {
    event.preventDefault();
    event.stopPropagation();
    setMessageMenu(null);
    setReactionPicker({ message, ...elementAnchorInContainer(event.currentTarget, overlayRootRef.current, 0) });
  }

  function canRecall(message: Message): boolean {
    if (message.recalled_at) {
      return false;
    }
    const senderId = message.sender_id ?? message.sender?.id;
    if (senderId === currentUser.id) {
      return true;
    }
    return Boolean(activeConversation?.type === 'group' && (currentRole === 'owner' || currentRole === 'admin'));
  }

  function canFeatureMessage(message: Message): boolean {
    return Boolean(!message.recalled_at && activeConversation?.type === 'group' && (currentRole === 'owner' || currentRole === 'admin'));
  }

  function recallSelectedMessage(message: Message): void {
    if (!activeConversationId || recallMutation.isPending) {
      return;
    }
    // 撤回红包消息就是撤销红包：没领完的退回去，先问一句
    if (isRedPacketMessage(message) && !window.confirm(redPacketRecallConfirmText((message.sender_id ?? message.sender?.id) === currentUser.id))) {
      setMessageMenu(null);
      return;
    }
    // 撤回礼物消息只是把消息撤掉，礼物和币都不退：也先说清楚
    if (isGiftMessage(message) && !window.confirm(giftRecallConfirmText())) {
      setMessageMenu(null);
      return;
    }
    recallMutation.mutate({ conversationId: activeConversationId, messageId: message.id });
    setMessageMenu(null);
  }

  function deleteSelectedMessageLocal(message: Message): void {
    const conversationId = activeConversationId ?? message.conversation_id;
    if (!conversationId || deleteLocalMutation.isPending) {
      return;
    }
    deleteLocalMutation.mutate({ conversationId, messageId: message.id });
    setMessageMenu(null);
  }

  function toggleSelectedMessageBookmark(message: Message): void {
    const conversationId = activeConversationId ?? message.conversation_id;
    if (!conversationId || message.recalled_at || bookmarkMutation.isPending) {
      return;
    }
    bookmarkMutation.mutate({ conversationId, messageId: message.id });
    setMessageMenu(null);
  }

  function toggleSelectedMessageFeature(message: Message): void {
    const conversationId = activeConversationId ?? message.conversation_id;
    if (!conversationId || !canFeatureMessage(message) || featureMutation.isPending) {
      return;
    }
    featureMutation.mutate({ conversationId, messageId: message.id });
    setMessageMenu(null);
  }

  function scrollImageIntoView(): void {
    if (stickToBottomRef.current) {
      requestAnimationFrame(() => scrollMessagesToBottom(scrollRef.current, 'smooth'));
    }
  }

  function highlightMessage(messageId: number): void {
    if (jumpHighlightTimeoutRef.current !== null) {
      window.clearTimeout(jumpHighlightTimeoutRef.current);
    }
    setJumpHighlightMessageId(messageId);
    jumpHighlightTimeoutRef.current = window.setTimeout(() => {
      setJumpHighlightMessageId((current) => (current === messageId ? null : current));
      jumpHighlightTimeoutRef.current = null;
    }, 1000);
  }

  async function ensureMessageContextLoaded(messageId: number): Promise<boolean> {
    if (messageIndexById.has(messageId)) {
      return true;
    }
    if (!activeConversationId) {
      return false;
    }

    const contextMessages = await getMessageContext(activeConversationId, messageId, { before: 25, after: 25 });
    if (!contextMessages.some((message) => message.id === messageId)) {
      return false;
    }
    newerContextFetchRef.current = false;
    reachedLatestInContextRef.current = false;
    contextBottomArmedRef.current = false;
    setIsFetchingNewerContext(false);
    setJumpContextMessageId(messageId);
    queryClient.setQueryData<MessagesInfiniteData>(['messages', activeConversationId], replaceMessagesWithContextPage(contextMessages));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    return true; // The new context page includes it; jumpToMessageId positions its virtual row.
  }

  async function jumpToMessageId(messageId: number): Promise<void> {
    let loaded = false;
    try {
      loaded = await ensureMessageContextLoaded(messageId);
    } catch {
      toast.error('已找到该消息，但无法加载它所在的上下文窗口。');
      return;
    }
    if (!loaded) {
      toast.error('已找到该消息，但该消息对当前账号不可见或已被清除。');
      return;
    }
    // The context query may commit on the following frame after setQueryData.
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    stickToBottomRef.current = false;
    // A loaded-but-offscreen row is located by ID, not by a DOM query.
    const resolvedIndex = messageIndexByIdRef.current.get(messageId) ?? -1;
    if (resolvedIndex < 0) return;
    virtualMessages.scrollToIndex(resolvedIndex);
    requestAnimationFrame(() => {
      const target = scrollRef.current?.querySelector<HTMLElement>(`[data-message-id="${messageId}"]`);
      if (target) {
        // scrollIntoView's ancestor traversal can scroll the host page in an extension.
        const scroll = scrollRef.current;
        if (scroll) setInstantMessageScrollTop(scroll, scroll.scrollTop + target.getBoundingClientRect().top - scroll.getBoundingClientRect().top - (scroll.clientHeight - target.clientHeight) / 2);
      }
      highlightMessage(messageId);
    });
  }

  function jumpToQuotedMessage(quoteData: MessageQuoteMetadata): void {
    if (!quoteData.message_id) {
      return;
    }
    void jumpToMessageId(quoteData.message_id);
  }

  useEffect(() => {
    if (!pendingJumpMessage || pendingJumpMessage.conversationId !== activeConversationId || messagesQuery.isLoading) {
      return;
    }
    let cancelled = false;
    const messageId = pendingJumpMessage.messageId;
    window.setTimeout(() => {
      if (cancelled) {
        return;
      }
      void jumpToMessageId(messageId).finally(() => {
        if (!cancelled) {
          clearPendingJumpMessage(messageId);
        }
      });
    }, 80);
    return () => {
      cancelled = true;
    };
  }, [activeConversationId, clearPendingJumpMessage, messages.length, messagesQuery.isLoading, pendingJumpMessage]);

  if (!activeConversationId || !activeConversation) {
    return (
      <section className="grid h-full place-items-center p-8 text-center [background:var(--kc-chat)]">
        <div className="max-w-sm rounded-2xl p-8 [background:var(--kc-panel)]">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full [background:var(--kc-panel-muted)] [color:var(--kc-muted)]">
            <Icon name="message" className="h-7 w-7" />
          </div>
          <h3 className="text-lg font-semibold">选择一个会话</h3>
          <p className="mt-2 text-sm leading-6 [color:var(--kc-muted)]">{isMobile ? '返回会话列表开始聊天。' : '从左侧会话列表开始，或在好友页创建新的私聊和群聊。'}</p>
          {isMobile ? <button type="button" onClick={onBack} className="liquid-button mt-5 rounded-xl px-4 py-2 text-sm font-semibold">返回会话</button> : null}
        </div>
      </section>
    );
  }

  const conversation = activeConversation;
  const title = conversationDisplayTitle(conversation, currentUser);
  const mobileTitleParts = conversationMobileTitleParts(conversation, currentUser);
  const outgoingFriendRequests = outgoingFriendRequestsQuery.data ?? [];
  const isGroup = conversation.type === 'group';
  const todoMenuAction = messageMenu ? todoMenu(messageMenu.message) : null;
  const canPublishAnnouncement = isGroup && (currentRole === 'owner' || currentRole === 'admin');
  const isTemporaryDirect = conversation.type === 'direct' && Boolean(conversation.is_temporary);
  const directUser = conversation.direct_user ?? members.find((member) => memberUserId(member) !== currentUser.id)?.user ?? null;
  const mobileVisibleHeaderActionCount = (isTemporaryDirect ? 2 : 0) + (isGroup && isMobile ? 1 : 0) + 1 + (isGroup ? 1 : 0) + 1;
  const mobileFriendActionWidth = isTemporaryDirect && directUser && !isFriendUser(directUser.id) && !isPendingFriendRequest(directUser.id) ? 62 : 0;
  const mobileHeaderActionsWidth = `${mobileVisibleHeaderActionCount * 32 + Math.max(0, mobileVisibleHeaderActionCount - 1) * 2 + mobileFriendActionWidth}px`;
  const memberCount = conversation.member_count ?? members.length;
  const announcementPreview = conversation.announcement?.trim();
  const memberKeyword = memberSearch.trim().toLowerCase();
  const sortedMembers = [...members].sort((left, right) => {
    const rank = (role: MemberRole): number => (role === 'owner' ? 0 : role === 'admin' ? 1 : 2);
    const roleDelta = rank(left.role) - rank(right.role);
    if (roleDelta !== 0) return roleDelta;
    return (left.joined_at ?? '').localeCompare(right.joined_at ?? '');
  });
  const compactMembers = memberKeyword && !isGroup ? sortedMembers.filter((member) => matchesMember(member, memberKeyword)) : sortedMembers;
  const overlayRoot = overlayRootRef.current;
  const messageMenuPosition = messageMenu ? clampOverlayPosition(messageMenu, MESSAGE_MENU_WIDTH, MESSAGE_MENU_HEIGHT, overlayRoot) : null;
  const memberMenuPosition = memberMenu ? clampOverlayPosition(memberMenu, MEMBER_MENU_WIDTH, MEMBER_MENU_HEIGHT, overlayRoot) : null;
  const reactionPickerPosition = reactionPicker ? clampOverlayPosition(reactionPicker, REACTION_PICKER_WIDTH, REACTION_PICKER_HEIGHT, overlayRoot) : null;
  const selectedMessages = visibleMessagesByIds(selectedMessageIds);
  const mentionQuery = mentionPicker?.query.trim().toLowerCase() ?? '';
  const fallbackMentionMembers = members
    .filter((member) => !mentionQuery || matchesMember(member, mentionQuery))
    .slice(0, 8);
  const mentionMembers = mentionMembersQuery.data ?? fallbackMentionMembers;
  const mentionMembersLoading = Boolean(mentionPicker && mentionMembersQuery.isFetching && !mentionMembersQuery.data);
  const activeMemberMenuMember = memberMenu?.member;
  const activeMemberMenuMuted = activeMemberMenuMember ? memberMuted(activeMemberMenuMember) : false;
  const canShowMuteSubmenu = Boolean(showMuteSubmenu && activeMemberMenuMember && canToggleMute(activeMemberMenuMember) && !activeMemberMenuMuted && !memberMenu?.loading);
  const muteSubmenuPosition = memberMenuPosition
    ? clampOverlayPosition({ left: memberMenuPosition.left + MEMBER_MENU_WIDTH + 8, top: memberMenuPosition.top + 168 }, 112, 196, overlayRoot)
    : null;
  const muteSubmenuBridgePosition = memberMenuPosition && muteSubmenuPosition ? (() => {
    const menuLeft = memberMenuPosition.left;
    const menuRight = memberMenuPosition.left + MEMBER_MENU_WIDTH;
    const submenuLeft = muteSubmenuPosition.left;
    const submenuRight = muteSubmenuPosition.left + 112;
    const gapLeft = Math.min(menuRight, submenuRight);
    const gapRight = Math.max(menuLeft, submenuLeft);
    if (gapRight <= gapLeft) {
      return null;
    }
    return {
      left: gapLeft,
      top: Math.min(memberMenuPosition.top, muteSubmenuPosition.top),
      width: gapRight - gapLeft,
      height: Math.max(memberMenuPosition.top + MEMBER_MENU_HEIGHT, muteSubmenuPosition.top + 196) - Math.min(memberMenuPosition.top, muteSubmenuPosition.top)
    };
  })() : null;

  function messageRoleBadge(message: Message, sender?: User | null): { label: string; className: string } | null {
    if (!isGroup) {
      return null;
    }

    const senderId = message.sender_id ?? sender?.id ?? null;
    const role = members.find((member) => memberUserId(member) === senderId)?.role ?? (senderId === currentUser.id ? currentRole : undefined);
    if (role === 'owner') {
      return { label: '群主', className: '[background:#ffe9d6] [color:#ff7a1a]' };
    }
    if (role === 'admin') {
      return { label: '管理员', className: '[background:#dff1ff] [color:#168bff]' };
    }
    return null;
  }

  function messageTitleBadge(message: Message, roleBadge: { label: string; className: string } | null): { label: string; className: string } | null {
    const title = message.sender_title?.trim();
    if (title) {
      return { label: title, className: '[background:rgba(139,92,246,0.16)] [color:#8b5cf6]' };
    }
    return roleBadge;
  }

  function renderMessageReactions(message: Message, mine: boolean): JSX.Element | null {
    const reactions = (message.reactions ?? []).filter((reaction) => reaction.count > 0);
    if (reactions.length === 0) {
      return null;
    }

    return (
      <div className={`flex flex-wrap gap-1 px-1 pt-0.5 ${mine ? 'justify-end' : 'justify-start'}`}>
        {reactions.map((reaction) => (
          <button key={reaction.emoji} type="button" disabled={reactionMutation.isPending} onClick={() => toggleReaction(message, reaction.emoji)} className={`group relative flex h-6 items-center gap-1 rounded-full border px-2 text-xs shadow-sm transition disabled:cursor-not-allowed disabled:opacity-55 ${reaction.reacted_by_me ? '[background:var(--kc-accent-soft)] [border-color:var(--kc-accent)] [color:var(--kc-accent)]' : '[background:var(--kc-panel)] [border-color:var(--kc-border)] [color:var(--kc-muted)] hover:[background:var(--kc-hover)] hover:[color:var(--kc-text)]'}`} aria-label={`回应 ${reaction.emoji}`}>
            <span className="text-sm leading-none">{reaction.emoji}</span>
            <span className="font-semibold leading-none">{reaction.count}</span>
            <span className={`pointer-events-none absolute bottom-full z-30 mb-2 hidden min-w-28 max-w-56 rounded-xl border px-2.5 py-1.5 text-left text-[11px] leading-5 shadow-float group-hover:block ${mine ? 'right-0' : 'left-0'} [background:var(--kc-panel)] [border-color:var(--kc-border)] [color:var(--kc-text)]`}>
              {reactionUserNames(reaction).length > 0 ? reactionUserNames(reaction).join('、') : `${reaction.count} 人回应`}
            </span>
          </button>
        ))}
        <button type="button" disabled={reactionMutation.isPending} onClick={(event) => openReactionPicker(event, message)} className="grid h-6 w-6 place-items-center rounded-full border text-xs shadow-sm transition [background:var(--kc-panel)] [border-color:var(--kc-border)] [color:var(--kc-muted)] hover:[background:var(--kc-hover)] hover:[color:var(--kc-text)] disabled:cursor-not-allowed disabled:opacity-55" aria-label="添加回应">
          <Icon name="plus" className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  function renderCompactMember(member: ConversationMember): JSX.Element {
    const user = member.user;
    const userId = memberUserId(member);
    const label = userId ? `用户 ${userId}` : '成员';
    const name = member.nickname?.trim() || getDisplayName(user, label);
    const badge = isGroup ? roleBadgeLabel(member.role) : null;
    const isSelf = userId === currentUser.id;

    return (
      <button key={member.id} type="button" onClick={(event) => openUserCard(event, user, label)} onContextMenu={(event) => openMemberMenu(event, member)} className="flex w-full min-w-0 max-w-full items-center gap-2 overflow-hidden rounded-md px-2 py-1.5 text-left transition hover:[background:var(--kc-hover)]">
        <span className="shrink-0 [&>*]:h-6 [&>*]:w-6 [&>*]:text-[10px]">
          <Avatar user={user} label={name} size="sm" />
        </span>
        <span className="min-w-0 flex-1 basis-0 overflow-hidden truncate text-xs [color:var(--kc-muted)]">{isSelf ? getDisplayName(currentUser, name) : name}</span>
        {badge ? <span className="max-w-[42px] shrink-0 truncate rounded px-1 py-0.5 text-[10px] leading-none [background:var(--kc-accent-soft)] [color:var(--kc-accent)]">{badge}</span> : null}
      </button>
    );
  }

  function renderCompactSidebar(): JSX.Element {
    const directName = getDisplayName(directUser, conversation.title || '好友');

    return (
      <aside className="hidden h-full min-h-0 w-full flex-col border-l [background:var(--kc-chat)] [border-color:var(--kc-border)] md:flex">
        {isGroup ? (
          <div role="button" tabIndex={0} onClick={() => setShowAnnouncements(true)} onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              setShowAnnouncements(true);
            }
          }} className="h-[168px] shrink-0 cursor-pointer border-b px-3.5 py-3 text-left transition hover:[background:var(--kc-hover)] [background:var(--kc-chat)] [border-color:var(--kc-border)]" aria-label="查看群公告">
            <div className="flex items-center justify-between gap-2">
              <h4 className="truncate text-sm font-semibold [color:var(--kc-text)]">群公告</h4>
              <Icon name="chevron" className="h-3.5 w-3.5 shrink-0 [color:var(--kc-muted)]" />
            </div>
            <p className={`mt-3 max-h-[112px] overflow-hidden whitespace-pre-wrap break-words text-xs leading-5 ${announcementPreview ? '[color:var(--kc-text)]' : '[color:var(--kc-muted)]'}`}>{announcementPreview ? renderLinkedPreview(announcementPreview) : '暂无群公告'}</p>
          </div>
        ) : (
          <div className="border-b px-3 py-3 [background:var(--kc-chat)] [border-color:var(--kc-border)]">
            <button type="button" onClick={(event) => openUserCard(event, directUser, '好友')} onContextMenu={(event) => openMemberMenu(event, memberFromUser(directUser))} className="flex w-full items-center gap-2 rounded-md p-1.5 text-left transition hover:[background:var(--kc-hover)]">
              <span className="shrink-0 [&>*]:h-7 [&>*]:w-7 [&>*]:text-xs">
                <Avatar user={directUser} label={directName} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{directName}</span>
                <span className="mt-0.5 block truncate text-xs [color:var(--kc-muted)]">{directUser?.bio?.trim() || '咕咕咕~'}</span>
              </span>
              <Icon name="chevron" className="h-3.5 w-3.5 shrink-0 [color:var(--kc-muted)]" />
            </button>
          </div>
        )}

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="px-3 pb-1.5 pt-3">
            <div className="flex items-center justify-between gap-2">
              <h4 className="truncate text-sm font-semibold [color:var(--kc-text)]">{isGroup ? `群聊成员 ${memberCount}` : '联系人'}</h4>
              <button type="button" className="kc-icon-button h-6 w-6" aria-label={isGroup ? '搜索群成员' : '搜索联系人'} aria-expanded={showMemberSearch} onClick={() => {
                const nextShowMemberSearch = !showMemberSearch;
                setShowMemberSearch(nextShowMemberSearch);
                if (!nextShowMemberSearch) {
                  setMemberSearch('');
                }
              }}>
                <Icon name="search" className="h-3.5 w-3.5" />
              </button>
            </div>
            {showMemberSearch ? (
              <label className="mt-2 flex h-8 items-center gap-2 rounded-md border px-2 [background:var(--kc-chat)] [border-color:var(--kc-border)] focus-within:[border-color:var(--kc-accent)]">
                <Icon name="search" className="h-3.5 w-3.5 shrink-0 [color:var(--kc-muted)]" />
                <input ref={memberSearchInputRef} value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} placeholder={isGroup ? '搜索群成员' : '搜索联系人'} className="min-w-0 flex-1 border-0 bg-transparent text-xs outline-none [color:var(--kc-text)] placeholder:[color:var(--kc-muted)]" />
              </label>
            ) : null}
          </div>

          <div className="scroll-soft min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-2 pb-3 [background:var(--kc-chat)]" onMouseDown={() => setMemberMenu(null)}>
            {membersLoading ? <p className="px-2 py-2 text-xs [color:var(--kc-muted)]">正在加载成员...</p> : null}
            {!membersLoading && compactMembers.length === 0 ? <p className="px-2 py-2 text-xs [color:var(--kc-muted)]">{memberKeyword ? '没有找到匹配成员。' : '暂无可显示成员。'}</p> : null}
            <div className="grid min-w-0 max-w-full gap-0.5 overflow-hidden">
              {!membersLoading && compactMembers.map((member) => renderCompactMember(member))}
            </div>
            {!membersLoading && isGroup && membersHasMore ? (
              <button type="button" disabled={membersLoadingMore} onClick={onLoadMoreMembers} className="mt-2 w-full rounded-lg border px-2 py-1.5 text-xs font-medium transition [background:var(--kc-panel)] [border-color:var(--kc-border)] [color:var(--kc-muted)] hover:[background:var(--kc-hover)] hover:[color:var(--kc-text)] disabled:cursor-not-allowed disabled:opacity-55">
                {membersLoadingMore ? '正在加载...' : '加载更多成员'}
              </button>
            ) : null}
          </div>
        </div>
      </aside>
    );
  }

  function renderComposerEditor(mobile: boolean): JSX.Element {
    return (
      <div className={`relative ${mobile ? 'kc-mobile-composer-input min-w-0 flex-1' : 'min-h-[68px]'}`}>
        {!draft.trim() && !quote ? <span className={`pointer-events-none absolute text-sm [color:var(--kc-muted)] ${mobile ? 'left-4 top-[7px] text-[14px] leading-6' : 'left-0 top-1'}`}>{isGroup ? '输入消息，@ 提醒群成员' : '输入消息'}</span> : null}
        <div
          ref={composerRef}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-label="输入消息"
          aria-multiline="true"
          enterKeyHint={mobile ? 'send' : undefined}
          spellCheck={false}
          onBeforeInput={mobile ? handleMobileComposerBeforeInput : undefined}
          onInput={handleComposerInput}
          onClick={() => {
            updateMentionPickerFromComposer();
          }}
          onKeyUp={(event) => handleComposerKeyUp(event, mobile)}
          onFocus={updateMentionPickerFromComposer}
          onTouchMove={mobile ? (event) => {
            event.preventDefault();
          } : undefined}
          onKeyDown={(event) => handleComposerKeyDown(event, mobile)}
          className={`scroll-soft box-border min-w-0 max-w-full max-h-40 overflow-y-auto whitespace-pre-wrap break-words border-0 bg-transparent text-sm leading-6 outline-none [color:var(--kc-text)] empty:before:content-[''] ${mobile ? 'min-h-[38px] px-4 py-[7px] text-[14px] leading-6' : 'min-h-[68px] py-1 pr-1'} ${WRAP_ANYWHERE_CLASS}`}
          style={mobile ? { overflowWrap: 'anywhere' } : undefined}
        />
      </div>
    );
  }

  function renderComposerPreviews(mobile: boolean): JSX.Element {
    return (
      <>
        {quote ? (
          <div className="mb-2">
            <div className={`${mobile ? 'kc-mobile-composer-quote' : 'flex w-fit max-w-full'} items-start gap-2 rounded-2xl px-3 py-2 [background:var(--kc-panel-muted)] [color:var(--kc-text)]`}>
              <div className="min-w-0 max-w-full flex-1 overflow-hidden">
                <p className="truncate text-sm font-semibold">{quote.sender_name}:</p>
                <p className="mt-0.5 min-w-0 max-w-full whitespace-pre-wrap break-words text-sm leading-5 [overflow-wrap:anywhere] [color:var(--kc-muted)]">{quote.preview}</p>
              </div>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setQuote(null)}
                className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full [color:var(--kc-muted)] transition hover:[background:var(--kc-hover)] hover:[color:var(--kc-text)]"
                aria-label="取消引用"
              >
                <Icon name="close" className="h-3 w-3" />
              </button>
            </div>
          </div>
        ) : null}
        {stagedImages.length > 0 ? (
          <div className="mb-2 flex max-w-full flex-wrap gap-2">
            {stagedImages.map((image) => (
              <div key={image.id} className={`${mobile ? 'h-14 w-14' : 'h-16 w-16'} group relative overflow-hidden rounded-xl border [border-color:var(--kc-border)] [background:var(--kc-panel-muted)]`}>
                <img src={image.previewUrl} alt={image.file.name || '待发送图片'} className="h-full w-full object-cover" />
                <button type="button" onClick={() => removeStagedImage(image.id)} className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-black/55 text-white opacity-100 transition md:opacity-0 md:group-hover:opacity-100" aria-label="移除图片">
                  <Icon name="close" className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        ) : null}
        {stagedVoice ? <StagedVoicePreview voice={stagedVoice} onRemove={clearStagedVoice} /> : null}
      </>
    );
  }

  function renderComposerStatus(mobile: boolean): JSX.Element | null {
    const showImageUploading = sendMutation.isPending && stagedImages.length > 0;
    const showVoiceUploading = sendMutation.isPending && Boolean(stagedVoice);
    if ((mobile || !isRecordingVoice) && !showImageUploading && !showVoiceUploading) {
      return null;
    }

    return (
      <div className={`${mobile ? 'kc-mobile-composer-status mb-2' : 'flex items-center gap-2'}`}>
        {!mobile && isRecordingVoice ? (
          <span className="flex items-center gap-2 rounded-full border border-red-500/20 bg-red-500/10 px-2.5 py-1 text-xs font-semibold text-red-500">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
            录音中 {formatVoiceDuration(voiceRecordingMs)}
            <button type="button" onClick={cancelVoiceRecording} className="rounded-full px-1.5 py-0.5 hover:bg-red-500/10">取消</button>
          </span>
        ) : null}
        {showImageUploading ? <span className="text-xs [color:var(--kc-muted)]">图片上传中...</span> : null}
        {showVoiceUploading ? <span className="text-xs [color:var(--kc-muted)]">语音上传中...</span> : null}
      </div>
    );
  }

  function renderMobileComposer(): JSX.Element {
    const sendDisabled = (!draft.trim() && stagedImages.length === 0 && !stagedVoice) || isRecordingVoice || draft.length > MAX_MESSAGE_CONTENT_LENGTH || sendMutation.isPending;
    const voiceHoldDisabled = sendMutation.isPending || stagedImages.length > 0;
    return (
      <div className="kc-mobile-composer-body">
        {renderComposerPreviews(true)}
        {renderComposerStatus(true)}
        <div className="kc-mobile-composer-input-row">
          {mobileVoiceMode ? (
            <div className={`kc-mobile-voice-panel ${isRecordingVoice ? 'kc-mobile-voice-panel-recording' : ''} ${mobileVoiceCanceling ? 'kc-mobile-voice-panel-canceling' : ''}`}>
              {(isRecordingVoice || mobileVoicePreparing) ? (
                <div className={`kc-mobile-voice-cancel-hint ${mobileVoiceCanceling ? 'kc-mobile-voice-cancel-hint-active' : ''}`}>
                  {mobileVoiceCanceling ? '松手取消' : '上滑取消'}
                </div>
              ) : null}
              <button
                type="button"
                className="kc-mobile-voice-hold"
                disabled={voiceHoldDisabled}
                onPointerDown={handleMobileVoicePointerDown}
                onPointerMove={handleMobileVoicePointerMove}
                onPointerUp={handleMobileVoicePointerUp}
                onPointerCancel={handleMobileVoicePointerCancel}
                onLostPointerCapture={handleMobileVoicePointerCancel}
                aria-label="按住说话，上滑取消，松开发送"
              >
                <span className="kc-mobile-voice-hold-main">{mobileVoiceCanceling ? '松手取消' : isRecordingVoice ? `松手发送 ${formatVoiceDuration(voiceRecordingMs)}` : mobileVoicePreparing ? '正在准备麦克风...' : '按住 说话'}</span>
              </button>
            </div>
          ) : renderComposerEditor(true)}
          {mobileVoiceMode ? (
            <button type="button" className="kc-mobile-composer-send kc-mobile-voice-exit" onClick={exitMobileVoiceMode}>
              键盘
            </button>
          ) : (
            <button
              disabled={sendDisabled}
              type="submit"
              className="kc-mobile-composer-send"
              data-keep-composer-focus="true"
              onPointerDown={handleMobileSendPointerDown}
              onMouseDown={handleMobileSendMouseDown}
              onTouchStart={handleMobileSendTouchStart}
              onTouchEnd={handleMobileSendTouchEnd}
              onClick={refocusMobileComposerAfterSubmit}
            >
              发送
            </button>
          )}
        </div>
        <div className="kc-mobile-composer-toolbar" aria-label="消息工具">
          <button className={`kc-mobile-composer-tool disabled:cursor-not-allowed disabled:opacity-45 ${mobileVoiceMode ? 'kc-mobile-composer-tool-active' : ''} ${isRecordingVoice ? 'kc-mobile-composer-tool-recording text-red-500' : ''}`} type="button" onClick={toggleMobileVoiceMode} disabled={sendMutation.isPending} aria-label={mobileVoiceMode ? '关闭语音输入' : '打开语音输入'} aria-expanded={mobileVoiceMode}>
            <Icon name="mic" className="h-6 w-6" />
          </button>
          <button className="kc-mobile-composer-tool disabled:cursor-not-allowed disabled:opacity-45" type="button" onClick={() => imageInputRef.current?.click()} disabled={sendMutation.isPending} aria-label="发送图片">
            <Icon name="image" className="h-6 w-6" />
          </button>
          <button className="kc-mobile-composer-tool disabled:cursor-not-allowed disabled:opacity-45" type="button" onClick={() => cameraInputRef.current?.click()} disabled={sendMutation.isPending} aria-label="拍摄照片">
            <Icon name="camera" className="h-6 w-6" />
          </button>
          <button className="kc-mobile-composer-tool" type="button" onClick={() => { setEmojiPickerTab('emoji'); setShowEmojiPicker((value) => emojiPickerTab !== 'emoji' || !value); }} aria-label="选择表情" aria-expanded={showEmojiPicker && emojiPickerTab === 'emoji'}>
            <Icon name="emoji" className="h-6 w-6" />
          </button>
          {!isTaskAssistantChat && !(conversation.type === 'direct' && directUser?.is_bot) ? <RedPacketComposerButton conversationId={conversation.id} isGroup={isGroup} variant="mobile" onCreated={scrollToLatestMessage} /> : null}
          {!isTaskAssistantChat && !(conversation.type === 'direct' && directUser?.is_bot) ? <GiftComposerButton conversationId={conversation.id} isGroup={isGroup} members={members} directUser={isGroup ? null : directUser} variant="mobile" onCreated={scrollToLatestMessage} onMembersNeeded={onMembersNeeded} /> : null}
          <button className="kc-mobile-composer-tool" type="button" onClick={showUnavailableAction} aria-label="更多功能">
            <Icon name="plus" className="h-6 w-6" />
          </button>
        </div>
      </div>
    );
  }

  function renderDesktopComposer(): JSX.Element {
    const sendDisabled = (!draft.trim() && stagedImages.length === 0 && !stagedVoice) || isRecordingVoice || draft.length > MAX_MESSAGE_CONTENT_LENGTH || sendMutation.isPending;
    return (
      <>
        {isTaskAssistantChat ? (
          <div className="mb-2 flex items-center gap-2 border-b pb-2 [border-color:var(--kc-border)]">
            <button type="button" onClick={() => openTaskCenter('assigned')} className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm [border-color:var(--kc-border)] hover:[background:var(--kc-hover)]">
              <Icon name="checkSquare" className="h-4 w-4 [color:var(--kc-accent)]" /> 创建任务
            </button>
            <button type="button" onClick={() => openTaskCenter('assigned')} className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm [border-color:var(--kc-border)] hover:[background:var(--kc-hover)]">
              <Icon name="list" className="h-4 w-4 [color:var(--kc-muted)]" /> 我的任务
            </button>
          </div>
        ) : null}
        <div className="mb-1 flex items-center gap-4 [color:var(--kc-text)]">
          <button className="kc-icon-button h-7 w-7" type="button" onClick={() => setShowEmojiPicker((value) => !value)} aria-label="选择表情" aria-expanded={showEmojiPicker}><Icon name="emoji" className="h-4 w-4" /></button>
          <button className="kc-icon-button h-7 w-7 disabled:cursor-not-allowed disabled:opacity-45" type="button" onClick={() => imageInputRef.current?.click()} disabled={sendMutation.isPending} title="发送图片">
            <Icon name="image" className="h-4 w-4" />
          </button>
          <button className={`kc-icon-button h-7 w-7 disabled:cursor-not-allowed disabled:opacity-45 ${isRecordingVoice ? 'text-red-500' : ''}`} type="button" onClick={() => isRecordingVoice ? stopVoiceRecording() : void startVoiceRecording()} disabled={sendMutation.isPending} title={isRecordingVoice ? '停止录音' : '录制语音'}>
            <Icon name="mic" className="h-4 w-4" />
          </button>
          <button className="kc-icon-button h-7 w-7" type="button" onClick={showUnavailableAction} title="发送文件"><Icon name="folder" className="h-4 w-4" /></button>
          {canCreateTask ? (
            <button className="kc-icon-button h-7 w-7" type="button" onClick={() => setTaskComposerOpen(true)} title="创建任务"><Icon name="checkSquare" className="h-4 w-4" /></button>
          ) : null}
          {renderComposerStatus(false)}
        </div>
        <div className="flex min-h-[92px] items-end gap-3">
          <div className="min-w-0 flex-1 min-h-[92px]">
            {renderComposerPreviews(false)}
            {renderComposerEditor(false)}
          </div>
          <span className={`shrink-0 text-[11px] ${draft.length > MAX_MESSAGE_CONTENT_LENGTH ? 'text-red-500' : '[color:var(--kc-muted)]'}`}>{draft.length}/{MAX_MESSAGE_CONTENT_LENGTH}</span>
          <button disabled={sendDisabled} type="submit" className="liquid-button h-9 shrink-0 rounded-xl px-5 text-sm transition disabled:cursor-not-allowed disabled:opacity-45">
            发送
          </button>
        </div>
      </>
    );
  }

  return (
    <section ref={overlayRootRef} className={`relative grid h-full min-h-0 grid-cols-1 overflow-hidden [background:var(--kc-chat)] [color:var(--kc-text)] ${isMobile ? 'kc-mobile-panel' : 'kc-pc-chat-panel md:grid-cols-[minmax(0,1fr)_180px]'}`}>
      <RedPacketHost conversationId={conversation.id} isGroup={isGroup} currentUser={currentUser} />
      <GiftStage conversationId={conversation.id} />
      {taskComposerOpen && activeConversationId && activeConversation?.type === 'group' ? (
        <TaskEditorModal
          conversationId={activeConversationId}
          currentUser={currentUser}
          onClose={() => setTaskComposerOpen(false)}
          onCreated={() => void queryClient.invalidateQueries({ queryKey: ['tasks'] })}
        />
      ) : null}
      {showGroupTasks && activeConversationId && activeConversation?.type === 'group' && activeConversation.tasks_enabled ? (
        <GroupTasksPanel
          conversationId={activeConversationId}
          groupName={title}
          onClose={() => setShowGroupTasks(false)}
          onOpenTask={(id) => { setShowGroupTasks(false); openChatTaskDetail(id); }}
          onCreateTask={canCreateTask ? () => { setShowGroupTasks(false); setTaskComposerOpen(true); } : undefined}
        />
      ) : null}
      {chatTaskDetailId != null ? (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={closeChatTaskDetail}>
          <div className="h-full w-full max-w-[460px] [background:var(--kc-panel)]" onClick={(event) => event.stopPropagation()}>
            <TaskDetailPanel
              taskId={chatTaskDetailId}
              currentUser={currentUser}
              onClose={closeChatTaskDetail}
              onOpenTask={(id) => openChatTaskDetail(id)}
              onCreateSubtask={(task) => setSubtaskParent({ conversationId: task.conversation_id, parentId: task.id })}
            />
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
        <div className={`relative grid min-h-0 overflow-hidden ${isMobile ? isNativeApp ? 'kc-qq-chat-page kc-native-chat-page grid-rows-[auto_minmax(0,1fr)_auto]' : 'kc-qq-chat-page grid-rows-[30px_56px_minmax(0,1fr)_auto]' : 'grid-rows-[52px_minmax(0,1fr)_auto]'}`}>
        {isMobile && !isNativeApp ? <MobileStatusBar /> : null}
        <div className={`border-b [background:var(--kc-chat)] [border-color:var(--kc-border)] ${isMobile ? 'kc-qq-chat-header flex min-w-0 items-center justify-between gap-2 overflow-hidden border-b-0 px-2' : 'flex items-center justify-between px-5'}`}>
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden" style={isMobile ? { maxWidth: `calc(100vw - ${mobileHeaderActionsWidth} - 64px)` } : undefined}>
            {isMobile ? (
              <button type="button" onClick={onBack} className="kc-mobile-chat-back-button relative grid h-10 w-10 shrink-0 place-items-center rounded-full [color:var(--kc-text)]" aria-label="返回会话列表">
                <Icon name="chevronLeft" className="h-6 w-6" />
                {mobileBackUnreadCount > 0 ? <span className="kc-mobile-chat-back-unread absolute -right-1 top-0 grid h-5 min-w-5 place-items-center rounded-full bg-[#168bff] px-1 text-[10px] font-bold text-white">{mobileBackUnreadCount > 99 ? '99+' : mobileBackUnreadCount}</span> : null}
              </button>
            ) : null}
            <div className="min-w-0 flex-1 overflow-hidden">
              <h3 className={`kgp-name-row flex min-w-0 max-w-full items-center gap-1 truncate font-semibold ${isMobile ? 'text-[16px] leading-tight [color:var(--kc-text)]' : 'text-base'}`}>
                {isMobile ? (
                  <>
                    <span className="min-w-0 flex-1 truncate">{mobileTitleParts.name}</span>
                    {mobileTitleParts.suffix ? <span className="shrink-0">{mobileTitleParts.suffix}</span> : null}
                    {isGroup ? null : <FriendBadgeMark userId={directUser?.id} size={17} openable className="shrink-0" />}
                  </>
                ) : <><span className="truncate">{title}</span>{isGroup ? null : <FriendBadgeMark userId={directUser?.id} size={17} openable className="shrink-0" />}</>}
                {isGroup ? <PlusTierTag tier={conversationTier(conversation)} className="shrink-0" /> : null}
                {isTemporaryDirect ? <span className="shrink-0 text-xs font-medium [color:var(--kc-muted)]">临时会话</span> : null}
              </h3>
              {isMobile ? <p className="mt-0.5 max-w-full truncate text-[12px] font-medium [color:var(--kc-muted)]">{isGroup ? `${memberCount}人 · 群聊` : directUser?.bio?.trim() || '在线'}</p> : null}
            </div>
          </div>
          <div className="ml-auto flex max-w-[calc(100vw-64px)] shrink-0 items-center justify-end gap-0.5 overflow-hidden">
            {isTemporaryDirect && directUser && !isFriendUser(directUser.id) && !isPendingFriendRequest(directUser.id) ? <button className="rounded-full border px-3 py-1.5 text-xs font-semibold transition hover:[background:var(--kc-hover)] [border-color:var(--kc-border)] [color:var(--kc-text)]" type="button" disabled={friendRequestMutation.isPending} onClick={() => requestFriend(directUser)}>{friendRequestMutation.isPending ? '发送中' : '加好友'}</button> : null}
            {isTemporaryDirect ? <button className="kc-icon-button h-8 w-8" type="button" disabled={closeTemporaryMutation.isPending} onClick={closeTemporaryCurrent} title="关闭临时会话"><Icon name="close" className="h-4 w-4" /></button> : null}
            {isTemporaryDirect ? <button className="kc-icon-button h-8 w-8" type="button" disabled={blockTemporaryMutation.isPending} onClick={blockTemporaryCurrent} title="屏蔽此人的临时会话"><Icon name="shield" className="h-4 w-4" /></button> : null}
            {isGroup && isMobile ? <button className="kc-icon-button h-8 w-8" type="button" onClick={() => setShowAnnouncements(true)} aria-label="查看群公告" aria-expanded={showAnnouncements}><Icon name="announcement" className="h-4 w-4" /></button> : null}
            <button className="kc-icon-button h-8 w-8" type="button" onClick={() => { if (activeConversationId !== null) useGroupPlusUi.getState().openChatSearch({ conversationId: activeConversationId, title }); }} aria-label="聊天记录"><Icon name="search" className="h-4 w-4" /></button>
            {isGroup && Boolean(activeConversation?.tasks_enabled) ? <button className="kc-icon-button h-8 w-8" type="button" onClick={() => setShowGroupTasks(true)} aria-label="群任务" aria-expanded={showGroupTasks} title="群任务"><Icon name="checkSquare" className="h-4 w-4" /></button> : null}
            {isGroup ? <button className="kc-icon-button h-8 w-8" type="button" onClick={() => setShowFeaturedMessages(true)} aria-label="查看群精华消息" aria-expanded={showFeaturedMessages}><Icon name="sparkles" className="h-4 w-4" /></button> : null}
            {isGroup && activeConversationId !== null ? <button className="kc-icon-button h-8 w-8" type="button" onClick={() => useGroupPlusUi.getState().openFiles(activeConversationId)} aria-label="群文件" title="群文件"><Icon name="folder" className="h-4 w-4" /></button> : null}
            {!isTemporaryDirect && !isMobile ? <button className="kc-icon-button h-8 w-8" type="button" onClick={showUnavailableAction} title="语音通话"><Icon name="phone" className="h-4 w-4" /></button> : null}
            {!isTemporaryDirect && !isMobile ? <button className="kc-icon-button h-8 w-8" type="button" onClick={showUnavailableAction} title="视频通话"><Icon name="video" className="h-4 w-4" /></button> : null}
            <button className="kc-icon-button h-8 w-8" type="button" onClick={openInfoDrawer} aria-label="打开聊天资料" aria-expanded={showInfoDrawer}><Icon name="more" className="h-4 w-4" /></button>
          </div>
        </div>

        <div className="relative flex min-h-0 flex-col overflow-hidden">
            {/* 群待办条在滚动容器外面（占位、不遮挡首屏消息）；滚动容器改成 flex-1 吃剩下的高度 */}
            {isGroup ? <GroupTodoBar conversation={conversation} canManage={currentRole === 'owner' || currentRole === 'admin'} onJump={(messageId) => void jumpToMessageId(messageId)} variant={isMobile ? 'mobile' : 'desktop'} /> : null}
            <div ref={scrollRef} className={`scroll-soft min-h-0 flex-1 select-text overflow-y-auto ${isMobile ? 'kc-qq-chat-scroll kc-mobile-page-transition px-2.5 py-3' : 'px-5 py-8'}`} onScroll={handleMessagesScroll} onMouseDown={() => {
            setMessageMenu(null);
            setMemberMenu(null);
          }}>
            {actionError ? <p className="mb-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-500">{actionError}</p> : null}
            {messagesQuery.isLoading ? <p className="rounded-xl p-4 text-sm [background:var(--kc-panel-muted)] [color:var(--kc-muted)]">正在加载消息...</p> : null}
            {messagesQuery.isFetchingNextPage ? <p className="mb-3 text-center text-xs [color:var(--kc-muted)]">正在加载更早消息...</p> : null}
            {!messagesQuery.hasNextPage && messages.length > 0 ? <p className="mb-3 text-center text-xs [color:var(--kc-muted)]">没有更早消息了</p> : null}
            <div ref={messageListRef} className={`relative min-w-0 max-w-full ${isMobile ? 'kc-mobile-message-list overflow-x-hidden' : ''}`} style={{ height: virtualMessages.totalHeight }}>
            {messages.slice(virtualMessages.start, virtualMessages.end).map((message, windowIndex) => {
              const index = virtualMessages.start + windowIndex;
              const showTimeDivider = shouldShowTimeDivider(message, messages[index - 1]);
              const sender = senderOf(message);
              const mine = (message.sender_id ?? sender?.id) === currentUser.id;
              const recalled = Boolean(message.recalled_at);
              const senderRoleBadge = messageRoleBadge(message, sender);
              const senderTitleBadge = messageTitleBadge(message, senderRoleBadge);
              const senderMember = memberFromMessage(message, mine ? currentUser : sender);
              const selected = selectedMessageIdSet.has(message.id);
              const messageQuote = quoteMetadataOf(message);
              const rawMentionData = mentionMetadataOf(message);
              const messageMentionData = {
                mentionAll: rawMentionData.mentionAll,
                mentions: rawMentionData.mentions.map((mention) => {
                  const fallback = /^用户\s*\d+$/.test(mention.name.trim()) ? memberMentionName(findMemberByUserId(mention.user_id), mention.name) : mention.name;
                  return fallback === mention.name ? mention : { ...mention, name: fallback };
                })
              };
              const messageImages = messageImageUrls(message);
              const groupShareCard = groupShareCardOf(message);
              const postShareCard = postShareCardOf(message);
              const botShareCard = botShareCardOf(message);
              const userShareCard = userShareCardOf(message);
              const teamupShareCard = teamupShareCardOf(message);
              const taskShareCard = taskShareCardOf(message);
              const taskEventCard = taskEventCardOf(message);
              // 红包数据读不出来（形状不对）时是 null，落到最下面按普通文字显示 content 里的兜底文字
              const redPacket = redPacketOf(message);
              const gift = giftOf(message);
              const fileMeta = groupFileMetaOf(message);
              const stickerMessage = isStickerMessage(message);
              // 气泡皮肤（docs/shop.md 2.2）：自己的消息用自己装备的，别人的用发送者对象上带的。机器人的 Markdown / 组件消息不穿皮肤
              const bubbleSkin = isBotMarkdownMessage(message) || hasBotRenderableElements(message) ? null : messageSkin(sender, mine, currentUser, skinSettings.showOthers);
              const bubbleSkinClassName = bubbleSkin ? ` kcsk-m ${bubbleSkinClass(bubbleSkin, mine)}` : '';
              // 连续相同的文本才算「复读」，而且只挂在整个列表的最后一条上：
              // 复读是「跟一句当下的话」，一旦有新消息把这串顶下去就没意义了，
              // 图标也就跟着消失。
              const repeatText = repeatableContentOf(message);
              const showRepeatPlusOne = repeatText !== null
                && index === messages.length - 1
                && repeatableContentOf(messages[index - 1]) === repeatText;
              // 按钮永远贴着气泡的外侧：别人的消息在右手边，自己的在左手边
              const plusOneButton = showRepeatPlusOne && repeatText ? (
                <button
                  type="button"
                  title="跟着复读一句"
                  onClick={(event) => {
                    event.stopPropagation();
                    repeatMessage(repeatText);
                  }}
                  onDoubleClick={(event) => event.stopPropagation()}
                  disabled={sendMutation.isPending}
                  className="kc-plus-one grid h-7 w-7 shrink-0 select-none place-items-center self-center rounded-full border text-[11px] font-semibold leading-none transition [border-color:var(--kc-accent)] [color:var(--kc-accent)] hover:[background:var(--kc-accent-soft)] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  +1
                </button>
              ) : null;
              // 群公告卡片（docs/group-announcements.md 第 5 节）：系统消息，但画成卡片；不挂消息菜单（系统消息不能转发、多选）
              const announcementCard = recalled ? null : announcementCardOf(message);
              if (announcementCard) {
                return (
                  <div key={message.id} data-virtual-message-id={message.id} ref={virtualMessages.measureRow} className="absolute left-0 right-0" style={{ top: virtualMessages.offsets[index] }}>
                    {showTimeDivider ? <MessageTimeDivider value={message.created_at} /> : null}
                    <div data-message-id={message.id} className="kc-message-enter kga-card-row">
                      <AnnouncementCard message={message} card={announcementCard} />
                    </div>
                  </div>
                );
              }
              if (message.type === 'system') {
                return (
                  <div key={message.id} data-virtual-message-id={message.id} ref={virtualMessages.measureRow} className="absolute left-0 right-0" style={{ top: virtualMessages.offsets[index] }}>
                    {showTimeDivider ? <MessageTimeDivider value={message.created_at} /> : null}
                    <div data-message-id={message.id} className="kc-message-enter kc-pc-message-row flex justify-center" onContextMenu={(event) => openMessageMenu(event, message)}>
                      <div className={`min-w-0 max-w-[76%] select-text rounded-full px-3 py-1.5 text-center text-xs leading-5 [background:var(--kc-panel-muted)] [color:var(--kc-muted)] ${WRAP_ANYWHERE_CLASS}`}>
                        <span className="whitespace-pre-wrap">{message.content || '系统消息'}</span>
                      </div>
                    </div>
                  </div>
                );
              }
              if (recalled) {
                return (
                  <div key={message.id} data-virtual-message-id={message.id} ref={virtualMessages.measureRow} className="absolute left-0 right-0" style={{ top: virtualMessages.offsets[index] }}>
                    {showTimeDivider ? <MessageTimeDivider value={message.created_at} /> : null}
                    <div data-message-id={message.id} className="kc-message-enter kc-pc-message-row flex justify-center" onContextMenu={(event) => openMessageMenu(event, message)}>
                      <div className="select-none rounded-full px-3 py-1.5 text-xs leading-none [background:var(--kc-panel-muted)] [color:var(--kc-muted)]">消息已撤回</div>
                    </div>
                  </div>
                );
              }

              return (
                <div key={message.id} data-virtual-message-id={message.id} ref={virtualMessages.measureRow} className={`absolute left-0 right-0 ${isMobile ? 'min-w-0 max-w-full overflow-hidden' : ''}`} style={{ top: virtualMessages.offsets[index] }}>
                  {showTimeDivider ? <MessageTimeDivider value={message.created_at} /> : null}
                  <div data-message-id={message.id} className={`kc-message-enter ${isMobile ? 'kc-mobile-message-row w-full min-w-0 max-w-full overflow-hidden' : 'kc-pc-message-row'} flex items-start rounded-2xl transition ${isMobile ? 'gap-2 px-1 py-0.5' : 'gap-3 px-2 py-1'} ${jumpHighlightMessageId === message.id ? '[background:rgba(22,139,255,0.12)]' : ''} ${mine ? 'justify-end' : 'justify-start'}`} onContextMenu={(event) => openMessageMenu(event, message)} onDoubleClick={() => quoteMessage(message)}>
                  {multiSelectMode && !mine ? (
                    <label className="mt-8 grid h-5 w-5 shrink-0 place-items-center rounded-full border [background:var(--kc-panel)] [border-color:var(--kc-border)]">
                      <input type="checkbox" checked={selected} onChange={() => toggleMessageSelected(message)} className="h-3.5 w-3.5 accent-[var(--kc-accent)]" aria-label="选择消息" />
                    </label>
                  ) : null}
                  {!mine ? (
                    <button
                      type="button"
                      title="双击戳一戳"
                      onClick={(event) => {
                        const element = event.currentTarget;
                        handleAvatarTap(sender?.id ?? senderMember?.user_id, () => openUserCardAtElement(element, sender, '好友', senderMember));
                      }}
                      onDoubleClick={(event) => {
                        // 消息行自身的双击是「引用」，这里只负责拦住冒泡；
                        // 戳一戳由 handleAvatarTap 自己数点击触发
                        event.stopPropagation();
                      }}
                      onContextMenu={(event) => openMemberMenu(event, senderMember)}
                      className={`${isMobile ? 'h-9 w-9' : 'h-9 w-9'} shrink-0 rounded-full text-left [&>*]:h-full [&>*]:w-full`}
                    >
                      <span className={`block h-full w-full ${sender?.id && pokedUserIds.includes(sender.id) ? 'kc-poke-shake' : ''}`}>
                        <Avatar user={sender} size="message" frame />
                      </span>
                    </button>
                  ) : null}
                  {mine ? plusOneButton : null}
                  <div className={`min-w-0 ${isMobile ? 'kc-mobile-message-stack' : 'max-w-[75%]'} ${mine ? 'items-end' : 'items-start'} flex flex-col gap-0.5`} style={isMobile ? { flex: '0 1 auto', width: 'auto', maxWidth: isNativeApp ? '72vw' : '78%' } : undefined}>
                    <div className={`kc-mobile-message-meta flex flex-nowrap items-center gap-1 px-1 text-[11px] [color:var(--kc-muted)] ${mine ? 'justify-end' : 'justify-start'}`}>
                      <span className={`kc-mobile-message-identity inline-flex min-w-0 max-w-full items-center gap-1 ${mine ? 'justify-end' : 'justify-start'}`}>
                        {message.sender?.is_bot && !mine ? (
                          <button type="button" onClick={(event) => { event.stopPropagation(); openBotForUser(message.sender?.id); }} onDoubleClick={(event) => event.stopPropagation()} className="kc-mobile-message-name min-w-0 truncate text-left">{messageSenderLabel(message)}</button>
                        ) : <span className="kc-mobile-message-name min-w-0 truncate">{messageSenderLabel(message)}</span>}
                        {message.sender?.is_bot ? (
                          <span className="kc-mobile-message-title inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-semibold leading-none [background:#dbeafe] [color:#2563eb]"><Icon name="bot" className="h-3 w-3" />机器人</span>
                        ) : isGroup && senderTitleBadge ? (
                          <span className={`kc-mobile-message-title inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-semibold leading-none ${senderTitleBadge.className}`}>
                            {message.sender_level ? <span>Lv.{message.sender_level}</span> : null}
                            <span>{senderTitleBadge.label}</span>
                          </span>
                        ) : isGroup && message.sender_level ? <span className="kc-mobile-message-level rounded px-1 py-0.5 text-[10px] font-semibold leading-none [background:rgba(148,163,184,0.16)] [color:#64748b]">Lv.{message.sender_level}</span> : null}
                      </span>
                      {isGroup && senderRoleBadge && senderTitleBadge?.label !== senderRoleBadge.label ? <span className={`kc-mobile-message-badge rounded px-1 py-0.5 text-[10px] leading-none ${senderRoleBadge.className}`}>{senderRoleBadge.label}</span> : null}
                      {message.bookmarked_by_me ? <span className="kc-mobile-message-badge inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] leading-none [background:var(--kc-accent-soft)] [color:var(--kc-accent)]"><Icon name="star" className="h-3 w-3" />收藏</span> : null}
                      {message.featured ? <span className="kc-mobile-message-badge inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] leading-none [background:#fff5cc] [color:#b77900]"><Icon name="sparkles" className="h-3 w-3" />精华</span> : null}
                    </div>
                    {message.type === 'image' ? (
                      <div className={`kc-mobile-message-content flex max-w-full flex-col gap-2 ${mine ? 'items-end' : 'items-start'}`}>
                        {messageQuote ? renderQuoteBlock(messageQuote, false, jumpToQuotedMessage) : null}
                        {resolveAssetUrl(message.content) ? <button type="button" onClick={() => openImageViewer([message.content], 0)} onContextMenu={(event) => openMessageMenu(event, message, message.content)} className={`${stickerMessage ? 'kc-mobile-sticker-frame border-transparent bg-transparent' : 'kc-mobile-image-message [border-color:var(--kc-border)]'} kc-mobile-media-frame block select-text overflow-hidden rounded-xl border text-left`}><img src={resolveMessageImagePreviewUrl(message.content)} alt={stickerMessage ? '表情包' : '聊天图片'} loading="lazy" decoding="async" onLoad={scrollImageIntoView} className={stickerMessage ? 'max-h-32 max-w-32 object-contain' : 'max-h-72 max-w-full object-contain'} /></button> : <UnavailableImageLabel />}
                      </div>
                    ) : message.type === 'voice' ? (
                      <div className={`kc-mobile-message-content flex max-w-full flex-col gap-2 ${mine ? 'items-end' : 'items-start'}`}>
                        {messageQuote ? renderQuoteBlock(messageQuote, false, jumpToQuotedMessage) : null}
                        <VoiceMessageBubble message={message} mine={mine} skin={bubbleSkin} skinMotion={skinSettings.motion} onContextMenu={openMessageMenu} />
                      </div>
                    ) : message.type === 'forward_bundle' ? (
                      <div className={`kc-mobile-message-content flex max-w-full flex-col gap-2 ${mine ? 'items-end' : 'items-start'}`}>
                        {messageQuote ? renderQuoteBlock(messageQuote, false, jumpToQuotedMessage) : null}
                        <ForwardBundleCard message={message} onOpen={() => setForwardDetailMessage(message)} />
                      </div>
                    ) : redPacket ? (
                      <div className={`kc-mobile-message-content flex max-w-full flex-col gap-2 ${mine ? 'items-end' : 'items-start'}`}>
                        {messageQuote ? renderQuoteBlock(messageQuote, false, jumpToQuotedMessage) : null}
                        <RedPacketCard message={message} meta={redPacket} mine={mine} isGroup={isGroup} />
                      </div>
                    ) : gift ? (
                      <div className={`kc-mobile-message-content flex max-w-full flex-col gap-2 ${mine ? 'items-end' : 'items-start'}`}>
                        {messageQuote ? renderQuoteBlock(messageQuote, false, jumpToQuotedMessage) : null}
                        <GiftCard message={message} meta={gift} mine={mine} />
                      </div>
                    ) : fileMeta ? (
                      <div className={`kc-mobile-message-content flex max-w-full flex-col gap-2 ${mine ? 'items-end' : 'items-start'}`}>
                        {messageQuote ? renderQuoteBlock(messageQuote, false, jumpToQuotedMessage) : null}
                        <GroupFileCard meta={fileMeta} conversationId={message.conversation_id} />
                      </div>
                    ) : groupShareCard ? (
                      <div className={`kc-mobile-message-content flex max-w-full flex-col gap-2 ${mine ? 'items-end' : 'items-start'}`}>
                        {messageQuote ? renderQuoteBlock(messageQuote, false, jumpToQuotedMessage) : null}
                        <GroupShareCard card={groupShareCard} conversations={conversations} onError={setActionError} />
                      </div>
                    ) : postShareCard ? (
                      <div className={`kc-mobile-message-content flex max-w-full flex-col gap-2 ${mine ? 'items-end' : 'items-start'}`}>
                        {messageQuote ? renderQuoteBlock(messageQuote, false, jumpToQuotedMessage) : null}
                        <PostShareCard card={postShareCard} onOpenPost={onOpenPost} />
                      </div>
                    ) : botShareCard ? (
                      <div className={`kc-mobile-message-content flex max-w-full flex-col gap-2 ${mine ? 'items-end' : 'items-start'}`}>
                        {messageQuote ? renderQuoteBlock(messageQuote, false, jumpToQuotedMessage) : null}
                        <BotShareCard card={botShareCard} />
                      </div>
                    ) : userShareCard ? (
                      <div className={`kc-mobile-message-content flex max-w-full flex-col gap-2 ${mine ? 'items-end' : 'items-start'}`}>
                        {messageQuote ? renderQuoteBlock(messageQuote, false, jumpToQuotedMessage) : null}
                        <UserShareCard card={userShareCard} />
                      </div>
                    ) : teamupShareCard ? (
                      <div className={`kc-mobile-message-content flex max-w-full flex-col gap-2 ${mine ? 'items-end' : 'items-start'}`}>
                        {messageQuote ? renderQuoteBlock(messageQuote, false, jumpToQuotedMessage) : null}
                        <TeamupShareCard card={teamupShareCard} />
                      </div>
                    ) : taskShareCard ? (
                      <div className={`kc-mobile-message-content flex max-w-full flex-col gap-2 ${mine ? 'items-end' : 'items-start'}`}>
                        {messageQuote ? renderQuoteBlock(messageQuote, false, jumpToQuotedMessage) : null}
                        <TaskShareCard card={taskShareCard} />
                      </div>
                    ) : taskEventCard ? (
                      <div className={`kc-mobile-message-content flex max-w-full flex-col gap-2 ${mine ? 'items-end' : 'items-start'}`}>
                        {messageQuote ? renderQuoteBlock(messageQuote, false, jumpToQuotedMessage) : null}
                        <TaskEventCard event={taskEventCard} />
                      </div>
                    ) : messageImages.length > 0 ? (
                      <div style={bubbleSkin?.vars} className={`min-w-0 max-w-full select-text rounded-xl shadow-none ${isMobile ? 'kc-mobile-message-bubble rounded-[16px] px-3 py-2 text-[13px] leading-5' : 'px-3.5 py-2.5 text-sm leading-6'} ${mine ? 'rounded-tr-sm [background:var(--kc-bubble-out)] [color:var(--kc-text)]' : 'rounded-tl-sm [background:var(--kc-bubble-in)] [color:var(--kc-text)]'} ${WRAP_ANYWHERE_CLASS}${bubbleSkinClassName}`}>
                        {bubbleSkin ? <SkinDecor skin={bubbleSkin} motion={skinSettings.motion} seed={message.id} /> : null}
                        {messageQuote ? renderQuoteBlock(messageQuote, false, jumpToQuotedMessage) : null}
                        {message.content || hasBotRenderableElements(message) ? <><div className={`break-words ${!isBotMarkdownMessage(message) && !hasBotRenderableElements(message) ? 'whitespace-pre-wrap' : ''} ${WRAP_ANYWHERE_CLASS}`}>{hasBotRenderableElements(message) ? renderBotElementContent(message, messageMentionData, (interaction) => handleBotInteraction(message, interaction)) : isBotMarkdownMessage(message) ? renderSafeBotMarkdown(botMarkdownContent(message), (interaction) => handleBotInteraction(message, interaction), message) : renderMentionedText(message.content, messageMentionData)}</div><CcwCreationCards previews={ccwCreationPreviewsFromMetadata(message.metadata)} compact={isMobile} /></> : null}
                        <div className={`mt-2 grid gap-2 ${messageImages.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                          {messageImages.map((imageUrl, index) => {
                            const originalSrc = resolveAssetUrl(imageUrl);
                            const src = resolveMessageImagePreviewUrl(imageUrl);
                            return originalSrc && src ? <button key={`${imageUrl}-${index}`} type="button" onClick={() => openImageViewer(messageImages, index)} onContextMenu={(event) => openMessageMenu(event, message, imageUrl)} className="kc-mobile-media-frame kc-mobile-image-message block overflow-hidden rounded-xl border text-left [border-color:var(--kc-border)]" style={isMobile ? { width: '100%', maxWidth: '100%' } : undefined}><img src={src} alt="聊天图片" loading="lazy" decoding="async" onLoad={scrollImageIntoView} className={isMobile ? 'max-h-64 w-full object-cover' : 'max-h-60 w-full object-cover'} /></button> : <UnavailableImageLabel key={`${imageUrl}-${index}`} />;
                          })}
                        </div>
                      </div>
                    ) : (
                      <div style={bubbleSkin?.vars} className={`min-w-0 max-w-full select-text whitespace-pre-wrap rounded-xl shadow-none ${isMobile ? 'kc-mobile-message-bubble rounded-[16px] px-3 py-2 text-[13px] leading-5' : 'px-3.5 py-2.5 text-sm leading-6'} ${mine ? 'rounded-tr-sm [background:var(--kc-bubble-out)] [color:var(--kc-text)]' : 'rounded-tl-sm [background:var(--kc-bubble-in)] [color:var(--kc-text)]'} ${WRAP_ANYWHERE_CLASS}${bubbleSkinClassName}`}>
                        {bubbleSkin ? <SkinDecor skin={bubbleSkin} motion={skinSettings.motion} seed={message.id} /> : null}
                        {messageQuote ? renderQuoteBlock(messageQuote, false, jumpToQuotedMessage) : null}
                        {hasBotRenderableElements(message) ? renderBotElementContent(message, messageMentionData, (interaction) => handleBotInteraction(message, interaction)) : isBotMarkdownMessage(message) ? renderSafeBotMarkdown(botMarkdownContent(message), (interaction) => handleBotInteraction(message, interaction), message) : renderMentionedText(message.content, messageMentionData)}
                        {message.content ? <CcwCreationCards previews={ccwCreationPreviewsFromMetadata(message.metadata)} compact={isMobile} /> : null}
                      </div>
                    )}
                    {renderMessageReactions(message, mine)}
                  </div>
                  {!mine ? plusOneButton : null}
                  {mine ? (
                    <button type="button" onClick={(event) => openUserCard(event, currentUser, getDisplayName(currentUser, '用户'), senderMember)} onContextMenu={(event) => openMemberMenu(event, senderMember)} className={`${isMobile ? 'h-9 w-9' : 'h-9 w-9'} shrink-0 rounded-full text-left [&>*]:h-full [&>*]:w-full`}>
                      <span className={`block h-full w-full ${pokedUserIds.includes(currentUser.id) ? 'kc-poke-shake' : ''}`}>
                        <Avatar user={currentUser} size="message" frame />
                      </span>
                    </button>
                  ) : null}
                  {multiSelectMode && mine ? (
                    <label className="mt-8 grid h-5 w-5 shrink-0 place-items-center rounded-full border [background:var(--kc-panel)] [border-color:var(--kc-border)]">
                      <input type="checkbox" checked={selected} onChange={() => toggleMessageSelected(message)} className="h-3.5 w-3.5 accent-[var(--kc-accent)]" aria-label="选择消息" />
                    </label>
                  ) : null}
                  </div>
                </div>
              );
            })}
            </div>
            {pokeTips.length > 0 ? (
              <div className="mt-2 flex flex-col items-center gap-1">
                {pokeTips.map((tip) => (
                  <div key={tip.id} className="select-none rounded-full px-3 py-1 text-xs leading-none [animation:kc-poke-tip-enter_220ms_cubic-bezier(0.16,1,0.3,1)_both] [background:var(--kc-panel-muted)] [color:var(--kc-muted)]">
                    {tip.text}
                  </div>
                ))}
              </div>
            ) : null}
            {isFetchingNewerContext ? <p className="mt-3 text-center text-xs [color:var(--kc-muted)]">正在加载更新消息...</p> : null}
            {isMobile && multiSelectMode ? <div className="h-24 shrink-0" aria-hidden="true" /> : null}
            <div ref={bottomRef} />
          </div>

          {showScrollToBottom ? (
            <button
              type="button"
              onClick={scrollToLatestMessage}
              className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-semibold shadow-float transition hover:-translate-x-1/2 hover:-translate-y-0.5 hover:[background:var(--kc-hover)] [background:var(--kc-panel)] [border-color:var(--kc-border)] [color:var(--kc-text)]"
            >
              回到底部
            </button>
          ) : null}
        </div>

        <form onSubmit={submit} onPaste={handlePaste} className={`relative border-t [background:var(--kc-chat)] [border-color:var(--kc-border)] ${isMobile ? `kc-mobile-composer border-t-0 ${isNativeApp ? 'kc-native-composer' : ''}` : 'kc-pc-composer px-5 py-3'}`}>
          {multiSelectMode ? (
            <div className={`absolute left-5 right-5 flex items-center justify-between gap-3 rounded-2xl border px-4 py-2.5 shadow-float [background:var(--kc-panel)] [border-color:var(--kc-border)] ${isMobile ? '-top-16 z-30' : '-top-14'}`}>
              <span className="text-sm font-semibold">已选择 {selectedMessages.length} 条消息</span>
              <div className="flex items-center gap-2">
                <button type="button" disabled={selectedMessages.length === 0} onClick={copySelectedMessages} className="rounded-xl px-3 py-1.5 text-sm font-semibold transition hover:[background:var(--kc-hover)] disabled:cursor-not-allowed disabled:opacity-45">复制</button>
                <button type="button" disabled={selectedMessages.length === 0} onClick={() => openForwardModal(selectedMessageIds)} className="liquid-button rounded-xl px-3 py-1.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-45">转发</button>
                <button type="button" onClick={cancelMultiSelect} className="rounded-xl px-3 py-1.5 text-sm font-semibold transition hover:[background:var(--kc-hover)]">取消</button>
              </div>
            </div>
          ) : null}
          {sendMutation.error && !actionError ? <p className="mb-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-500">发送失败，请稍后重试。</p> : null}
          <input ref={imageInputRef} type="file" accept="image/*" onChange={chooseImage} className="hidden" />
          <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={chooseImage} className="hidden" />
          {showEmojiPicker ? (
            <div ref={emojiPickerRef} onMouseDown={(event) => event.stopPropagation()} className="absolute bottom-[154px] left-5 z-20 flex h-[248px] w-[292px] max-w-[calc(100vw-40px)] flex-col overflow-hidden rounded-[20px] border shadow-float [background:var(--kc-panel)] [border-color:var(--kc-border)]">
              <div className="flex min-h-0 flex-1 flex-col px-3 pb-2 pt-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[13px] font-semibold">{emojiPickerTab === 'emoji' ? 'Emoji 表情' : '收藏表情包'}</p>
                    <p className="text-[11px] [color:var(--kc-muted)]">{emojiPickerTab === 'emoji' ? '点击插入到输入框' : `共 ${favoriteStickersQuery.data?.length ?? 0} 个收藏表情`}</p>
                  </div>
                </div>
                <div className="scroll-soft min-h-0 flex-1 overflow-y-auto pr-1">
                  {emojiPickerTab === 'emoji' ? (
                    <div className="grid grid-cols-7 gap-1.5">
                      {EMOJIS.map((emoji) => (
                        <button key={emoji} type="button" onClick={() => insertEmoji(emoji)} className="grid h-8 w-8 place-items-center rounded-lg text-lg transition hover:[background:var(--kc-hover)]" aria-label={`插入表情 ${emoji}`}>
                          {emoji}
                        </button>
                      ))}
                    </div>
                  ) : favoriteStickersQuery.isLoading ? (
                    <div className="grid h-full place-items-center rounded-xl [background:var(--kc-panel-muted)]">
                      <p className="text-xs [color:var(--kc-muted)]">正在加载收藏表情...</p>
                    </div>
                  ) : favoriteStickersQuery.error ? (
                    <div className="grid h-full place-items-center rounded-xl [background:var(--kc-panel-muted)] px-4 text-center">
                      <p className="text-xs [color:var(--kc-muted)]">收藏表情加载失败，请稍后再试</p>
                    </div>
                  ) : (favoriteStickersQuery.data ?? []).length === 0 ? (
                    <div className="grid h-full place-items-center rounded-xl [background:var(--kc-panel-muted)] px-4 text-center">
                      <div>
                        <p className="text-[13px] font-semibold">还没有收藏表情</p>
                        <p className="mt-1 text-[11px] leading-4 [color:var(--kc-muted)]">在聊天图片上右键，选择“添加表情”即可收藏</p>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-4 gap-1.5">
                      {(favoriteStickersQuery.data ?? []).map((sticker) => {
                        const src = resolveMessageImagePreviewUrl(sticker.url);
                        return (
                          <div key={sticker.asset_id} className="group relative aspect-square">
                            <button
                              type="button"
                              onClick={() => sendFavoriteSticker(sticker)}
                              className="h-full w-full overflow-hidden rounded-xl border transition hover:-translate-y-0.5 hover:[border-color:var(--kc-accent)] [background:var(--kc-panel-muted)] [border-color:var(--kc-border)]"
                              title="发送收藏表情"
                            >
                              {src ? <img src={src} alt="收藏表情" className="h-full w-full object-cover" /> : <span className="grid h-full w-full place-items-center text-[11px] [color:var(--kc-muted)]">不可用</span>}
                            </button>
                            <button
                              type="button"
                              onClick={(event) => deleteFavoriteSticker(event, sticker)}
                              disabled={removeFavoriteStickerMutation.isPending}
                              className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full border border-red-500/25 bg-white/90 text-red-500 opacity-0 shadow-sm transition hover:bg-red-500 hover:text-white group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-45"
                              title="删除收藏表情"
                              aria-label="删除收藏表情"
                            >
                              <Icon name="trash" className="h-3 w-3" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5 border-t px-2.5 py-2 [background:var(--kc-panel-muted)] [border-color:var(--kc-border)]">
                <button type="button" onClick={() => setEmojiPickerTab('emoji')} className={`grid h-8 w-8 place-items-center rounded-xl transition ${emojiPickerTab === 'emoji' ? '[background:var(--kc-panel)] [color:var(--kc-accent)] shadow-sm' : '[color:var(--kc-muted)] hover:[background:var(--kc-hover)] hover:[color:var(--kc-text)]'}`} aria-label="普通 Emoji">
                  <Icon name="emoji" className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => setEmojiPickerTab('stickers')} className={`grid h-8 w-8 place-items-center rounded-xl transition ${emojiPickerTab === 'stickers' ? '[background:var(--kc-panel)] [color:var(--kc-accent)] shadow-sm' : '[color:var(--kc-muted)] hover:[background:var(--kc-hover)] hover:[color:var(--kc-text)]'}`} aria-label="收藏表情包">
                  <Icon name="heart" className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : null}
          {mentionPicker ? (
            <div className="absolute bottom-[106px] left-5 z-30 w-72 overflow-hidden rounded-2xl border shadow-float [background:var(--kc-panel)] [border-color:var(--kc-border)]">
              {(currentRole === 'owner' || currentRole === 'admin') ? (
                <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={insertMentionAll} className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:[background:var(--kc-hover)]">
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full [background:var(--kc-accent-soft)] [color:var(--kc-accent)]"><Icon name="users" className="h-4 w-4" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">全体成员</p>
                    <p className="text-xs [color:var(--kc-muted)]">剩余 {MENTION_ALL_REMAINING} 次</p>
                  </div>
                </button>
              ) : null}
              {mentionMembersLoading ? <p className="px-3 py-3 text-sm [color:var(--kc-muted)]">正在搜索成员...</p> : null}
              {!mentionMembersLoading && mentionMembers.length === 0 ? <p className="px-3 py-3 text-sm [color:var(--kc-muted)]">没有匹配成员</p> : null}
              {mentionMembers.map((member) => {
                const userId = memberUserId(member);
                const name = member.nickname?.trim() || getDisplayName(member.user, userId ? `用户 ${userId}` : '成员');
                return (
                  <button key={member.id} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => insertMention(member)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:[background:var(--kc-hover)]">
                    <Avatar user={member.user} label={name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{name}</p>
                      <p className="text-xs [color:var(--kc-muted)]">@{name}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : null}
          {isMobile ? renderMobileComposer() : renderDesktopComposer()}
        </form>
      </div>

      {!isMobile ? renderCompactSidebar() : null}
      {messageMenu && messageMenuPosition ? (
        <div className="absolute inset-0 z-40" onMouseDown={() => setMessageMenu(null)}>
          <ContextMenuSurface onMouseDown={(event) => event.stopPropagation()} style={messageMenuPosition} className="scroll-soft absolute max-h-[min(416px,calc(100%-16px))] w-[252px] overflow-y-auto">
            {!messageMenu.message.recalled_at ? (
              <div className="flex items-center gap-1 border-b px-2 py-2 [border-color:var(--kc-border)]">
                {QUICK_REACTION_EMOJIS.map((emoji) => (
                  <button key={emoji} type="button" disabled={reactionMutation.isPending} onClick={() => toggleReaction(messageMenu.message, emoji)} className="grid h-8 w-8 place-items-center rounded-full text-lg transition hover:[background:var(--kc-hover)] disabled:cursor-not-allowed disabled:opacity-45" aria-label={`回应 ${emoji}`}>
                    {emoji}
                  </button>
                ))}
                <button type="button" disabled={reactionMutation.isPending} onClick={(event) => openReactionPicker(event, messageMenu.message)} className="grid h-8 w-8 place-items-center rounded-full text-base transition [color:var(--kc-muted)] hover:[background:var(--kc-hover)] hover:[color:var(--kc-text)] disabled:cursor-not-allowed disabled:opacity-40" aria-label="更多回应">
                  <Icon name="plus" className="h-4 w-4" />
                </button>
              </div>
            ) : null}
            <div className="py-1">
              {messageMenu.message.type !== 'image' ? (
                <ContextMenuItem label="复制" icon="copy" disabled={Boolean(messageMenu.message.recalled_at)} onClick={() => {
                  copyText(messageCopyText(messageMenu.message));
                  setMessageMenu(null);
                }} />
              ) : null}
              {messageMenu.clickedImageUrl ? <ContextMenuItem label="添加表情" icon="heart" disabled={Boolean(messageMenu.message.recalled_at) || favoriteStickerMutation.isPending} onClick={favoriteClickedImage} /> : null}
              {/* 红包、礼物不能转发，也不进多选 */}
              {isRedPacketMessage(messageMenu.message) || isGiftMessage(messageMenu.message) || groupFileMetaOf(messageMenu.message) ? null : <ContextMenuItem label="转发" icon="send" disabled={Boolean(messageMenu.message.recalled_at)} onClick={() => openForwardModal([messageMenu.message.id])} />}
              <ContextMenuItem label={messageMenu.message.bookmarked_by_me ? '取消收藏' : '收藏'} icon="star" disabled={Boolean(messageMenu.message.recalled_at) || bookmarkMutation.isPending} onClick={() => toggleSelectedMessageBookmark(messageMenu.message)} />
              {isRedPacketMessage(messageMenu.message) || isGiftMessage(messageMenu.message) || groupFileMetaOf(messageMenu.message) ? null : <ContextMenuItem label="多选" icon="checkSquare" disabled={Boolean(messageMenu.message.recalled_at)} onClick={() => startMultiSelect(messageMenu.message)} />}
              <ContextMenuItem label="引用" icon="quote" disabled={Boolean(messageMenu.message.recalled_at)} onClick={() => quoteMessage(messageMenu.message)} />
              {todoMenuAction ? <ContextMenuItem label={todoMenuAction.label} icon="checkSquare" onClick={() => { todoMenuAction.run(); setMessageMenu(null); }} /> : null}
              {isGroup && (currentRole === 'owner' || currentRole === 'admin') ? <ContextMenuItem label={messageMenu.message.featured ? '取消精华' : '设为精华'} icon="sparkles" disabled={!canFeatureMessage(messageMenu.message) || featureMutation.isPending} onClick={() => toggleSelectedMessageFeature(messageMenu.message)} /> : null}
              <ContextMenuItem label="撤回" icon="recall" disabled={!canRecall(messageMenu.message) || recallMutation.isPending} onClick={() => recallSelectedMessage(messageMenu.message)} />
              <ContextMenuItem label="删除" icon="trash" danger disabled={deleteLocalMutation.isPending} onClick={() => deleteSelectedMessageLocal(messageMenu.message)} />
              <div className="my-1 border-t [border-color:var(--kc-border)]" />
              <ContextMenuItem label="举报" icon="flag" disabled={Boolean(messageMenu.message.recalled_at)} onClick={() => openMessageReport(messageMenu.message)} />
            </div>
          </ContextMenuSurface>
        </div>
      ) : null}
      {memberMenu && memberMenuPosition ? (
        <div className="absolute inset-0 z-40" onMouseDown={() => setMemberMenu(null)}>
          <ContextMenuSurface onMouseLeave={closeMuteSubmenuSoon} onMouseDown={(event) => event.stopPropagation()} style={memberMenuPosition} className="scroll-soft absolute z-10 max-h-[min(356px,calc(100%-16px))] w-[220px] overflow-y-auto py-1">
            <ContextMenuItem label="发送消息" icon="message" disabled={memberUserId(memberMenu.member) === currentUser.id || directMutation.isPending} onMouseEnter={closeMuteSubmenuNow} onClick={() => startDirectMessage(memberMenu.member)} />
            {!isFriendUser(memberUserId(memberMenu.member)) && !isPendingFriendRequest(memberUserId(memberMenu.member)) ? <ContextMenuItem label="添加好友" icon="plus" disabled={!canSendFriendRequest(memberUserId(memberMenu.member))} onMouseEnter={closeMuteSubmenuNow} onClick={() => requestFriendFromMember(memberMenu.member)} /> : null}
            <ContextMenuItem label="@TA" icon="atSign" disabled={!isGroup || memberUserId(memberMenu.member) === currentUser.id} onMouseEnter={closeMuteSubmenuNow} onClick={() => mentionMemberFromMenu(memberMenu.member)} />
            {canGiftMenuMember ? <ContextMenuItem label="送礼物" icon="gift" onMouseEnter={closeMuteSubmenuNow} onClick={() => {
              const user = memberMenu.member.user;
              setMemberMenu(null);
              // 从消息头像的菜单送：就在这个会话里送，会落一条礼物消息
              if (user) {
                openGiftTo(user, conversation.id, scrollToLatestMessage);
              }
            }} /> : null}
            <ContextMenuItem label="查看资料" icon="profile" onMouseEnter={closeMuteSubmenuNow} onClick={() => openMemberProfile(memberMenu.member)} />
            {(canChangeMemberRole(memberMenu.member) || canSetMemberTitle(memberMenu.member) || canToggleMute(memberMenu.member) || canRemoveMember(memberMenu.member)) ? <div className="my-1 border-t [border-color:var(--kc-border)]" /> : null}
            {canChangeMemberRole(memberMenu.member) ? <ContextMenuItem label={memberMenu.member.role === 'admin' ? '取消管理员' : '设为管理员'} icon={memberMenu.member.role === 'admin' ? 'shield' : 'shieldCheck'} disabled={roleMutation.isPending} onMouseEnter={closeMuteSubmenuNow} onClick={() => changeMemberRole(memberMenu.member)} /> : null}
            {canSetMemberTitle(memberMenu.member) ? <ContextMenuItem label={memberMenu.member.title?.trim() ? '修改群头衔' : '设置群头衔'} icon="profile" disabled={titleMutation.isPending} onMouseEnter={closeMuteSubmenuNow} onClick={() => setMemberCustomTitle(memberMenu.member)} /> : null}
            {memberMenu.loading ? <ContextMenuItem label="正在同步成员状态..." icon="clock" disabled onMouseEnter={closeMuteSubmenuNow} onClick={() => undefined} /> : null}
            {canToggleMute(memberMenu.member) && !memberMenu.loading ? <ContextMenuItem label={activeMemberMenuMuted ? '解除禁言' : '设置群内禁言'} icon={activeMemberMenuMuted ? 'volume' : 'clock'} suffix={activeMemberMenuMuted ? undefined : '›'} disabled={muteMutation.isPending} onMouseEnter={() => activeMemberMenuMuted ? closeMuteSubmenuNow() : openMuteSubmenu()} onClick={() => activeMemberMenuMuted ? toggleMemberMute(memberMenu.member) : undefined} /> : null}
            {canRemoveMember(memberMenu.member) ? <ContextMenuItem label="移出本群" icon="trash" danger disabled={removeMutation.isPending} onMouseEnter={closeMuteSubmenuNow} onClick={() => removeMember(memberMenu.member)} /> : null}
            <div className="my-1 border-t [border-color:var(--kc-border)]" />
            <ContextMenuItem label="举报" icon="flag" disabled={memberUserId(memberMenu.member) === currentUser.id} onMouseEnter={closeMuteSubmenuNow} onClick={() => openMemberReport(memberMenu.member)} />
          </ContextMenuSurface>
          {canShowMuteSubmenu && muteSubmenuBridgePosition ? (
            <div onMouseDown={(event) => event.stopPropagation()} onMouseEnter={openMuteSubmenu} onMouseLeave={closeMuteSubmenuSoon} className="absolute z-0" style={muteSubmenuBridgePosition} />
          ) : null}
          {canShowMuteSubmenu && activeMemberMenuMember && muteSubmenuPosition ? (
              <ContextMenuSurface onMouseDown={(event) => event.stopPropagation()} onMouseEnter={openMuteSubmenu} onMouseLeave={closeMuteSubmenuSoon} style={muteSubmenuPosition} className="absolute z-20 w-28 rounded-xl py-1">
                {MUTE_MENU_OPTIONS.map((option) => (
                  <button key={option.label} type="button" disabled={muteMutation.isPending} onClick={() => setMemberMuteDuration(activeMemberMenuMember, option)} className="flex w-full items-center px-3 py-2 text-left transition hover:[background:var(--kc-hover)] disabled:cursor-not-allowed disabled:opacity-45">
                    {option.label}
                  </button>
                ))}
              </ContextMenuSurface>
          ) : null}
        </div>
      ) : null}
      {customMute ? (
        <div className="fixed inset-0 z-[60] grid place-items-center p-4 [background:rgba(15,23,42,0.24)]" onMouseDown={() => setCustomMute(null)}>
          <div onMouseDown={(event) => event.stopPropagation()} className="w-full max-w-[320px] overflow-hidden rounded-[24px] border shadow-float [background:var(--kc-panel)] [border-color:var(--kc-border)] [color:var(--kc-text)]">
            <div className="border-b px-5 py-4 [border-color:var(--kc-border)]">
              <h3 className="text-base font-semibold">自定义禁言时长</h3>
              <p className="mt-1 text-xs [color:var(--kc-muted)]">设置后到期会自动解除禁言。</p>
            </div>
            <div className="space-y-3 px-5 py-4">
              <label className="block text-xs font-medium [color:var(--kc-muted)]" htmlFor="custom-mute-value">时长</label>
              <div className="flex gap-2">
                <input
                  id="custom-mute-value"
                  value={customMute.value}
                  onChange={(event) => setCustomMute((state) => state ? { ...state, value: event.target.value.replace(/[^0-9.]/g, '') } : state)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      confirmCustomMute();
                    }
                  }}
                  autoFocus
                  inputMode="decimal"
                  placeholder="输入数字"
                  className="min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm outline-none transition focus:border-[var(--kc-accent)] [background:var(--kc-panel-muted)] [border-color:var(--kc-border)]"
                />
                <select
                  value={customMute.unit}
                  onChange={(event) => setCustomMute((state) => state ? { ...state, unit: event.target.value as CustomMuteState['unit'] } : state)}
                  className="rounded-xl border px-2 py-2 text-sm outline-none transition focus:border-[var(--kc-accent)] [background:var(--kc-panel-muted)] [border-color:var(--kc-border)]"
                >
                  <option value="minutes">分钟</option>
                  <option value="hours">小时</option>
                  <option value="days">天</option>
                </select>
              </div>
              <p className="text-xs [color:var(--kc-muted)]">最长 365 天，支持小数小时/天。</p>
            </div>
            <div className="flex justify-end gap-2 border-t px-5 py-3 [border-color:var(--kc-border)]">
              <button type="button" onClick={() => setCustomMute(null)} className="rounded-xl px-4 py-2 text-sm transition hover:[background:var(--kc-hover)]">取消</button>
              <button type="button" disabled={muteMutation.isPending} onClick={confirmCustomMute} className="liquid-button rounded-xl px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-45">确定</button>
            </div>
          </div>
        </div>
      ) : null}
      {reactionPicker && reactionPickerPosition ? (
        <div className="absolute inset-0 z-50" onMouseDown={() => setReactionPicker(null)}>
          <div onMouseDown={(event) => event.stopPropagation()} style={reactionPickerPosition} className="scroll-soft absolute max-h-[min(320px,calc(100%-16px))] w-[320px] overflow-y-auto rounded-[24px] border p-3 shadow-float [background:var(--kc-panel)] [border-color:var(--kc-border)] [color:var(--kc-text)]">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">选择回应</p>
                <p className="text-xs [color:var(--kc-muted)]">常用表情</p>
              </div>
              <button type="button" onClick={() => setReactionPicker(null)} className="kc-icon-button h-7 w-7" aria-label="关闭表情回应"><Icon name="close" className="h-3.5 w-3.5" /></button>
            </div>
            <div className="mb-3 flex gap-1.5 rounded-2xl p-2 [background:var(--kc-panel-muted)]">
              {QUICK_REACTION_EMOJIS.map((emoji) => (
                <button key={emoji} type="button" disabled={reactionMutation.isPending} onClick={() => toggleReaction(reactionPicker.message, emoji)} className="grid h-9 w-9 place-items-center rounded-xl text-xl transition hover:[background:var(--kc-hover)] disabled:cursor-not-allowed disabled:opacity-45" aria-label={`回应 ${emoji}`}>{emoji}</button>
              ))}
            </div>
            <div className="scroll-soft max-h-56 overflow-y-auto pr-1">
              <div className="grid grid-cols-8 gap-1.5">
                {FULL_REACTION_EMOJIS.map((emoji) => (
                  <button key={emoji} type="button" disabled={reactionMutation.isPending} onClick={() => toggleReaction(reactionPicker.message, emoji)} className="grid h-8 w-8 place-items-center rounded-lg text-lg transition hover:[background:var(--kc-hover)] disabled:cursor-not-allowed disabled:opacity-45" aria-label={`回应 ${emoji}`}>{emoji}</button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {forwardTarget ? (
        <ForwardTargetModal
          conversations={conversations}
          currentUser={currentUser}
          activeConversationId={activeConversationId}
          messageIds={forwardTarget.messageIds}
          isPending={forwardMutation.isPending}
          onConfirm={(targetConversationId, note) => forwardMutation.mutate({ targetConversationId, sourceConversationId: activeConversationId, messageIds: forwardTarget.messageIds, note })}
          onClose={() => setForwardTarget(null)}
        />
      ) : null}
      {forwardDetailMessage ? <ForwardBundleDetailModal message={forwardDetailMessage} mobile={isMobile} onClose={() => setForwardDetailMessage(null)} /> : null}
      {imageViewer ? <ImageViewer viewer={imageViewer} mobile={isMobile} onClose={() => setImageViewer(null)} onNavigate={(index) => setImageViewer((current) => current ? { ...current, index } : current)} /> : null}
      {reportTarget ? (
        <ReportModal
          targetType={reportTarget.targetType}
          targetId={reportTarget.targetId}
          targetLabel={reportTarget.targetLabel}
          conversationId={reportTarget.conversationId}
          messageId={reportTarget.messageId}
          reportedUserId={reportTarget.reportedUserId}
          isPending={reportMutation.isPending}
          error={reportMutation.error}
          onSubmit={(payload) => reportMutation.mutate(payload)}
          onClose={() => setReportTarget(null)}
        />
      ) : null}
      {showFeaturedMessages && isGroup ? (
        <FeaturedMessagesModal
          conversationId={activeConversationId}
          canManage={currentRole === 'owner' || currentRole === 'admin'}
          isToggling={featureMutation.isPending}
          onToggleFeature={(message) => toggleSelectedMessageFeature(message)}
          onOpenForwardBundle={(message) => setForwardDetailMessage(message)}
          onClose={() => setShowFeaturedMessages(false)}
          mobile={isMobile}
        />
      ) : null}
      {userCard ? <UserCard user={userCard.user} label={userCard.label} anchor={userCard.anchor} containerRef={overlayRootRef} action={profileActionForUser(userCard.user)} onClose={() => setUserCard(null)} /> : null}
      {mobileUserProfile ? <MobileUserProfilePage user={mobileUserProfile.user} label={mobileUserProfile.label} fallbackUserId={mobileUserProfile.fallbackUserId} currentUserId={currentUser.id} currentUser={currentUser} action={profileActionForUser(mobileUserProfile.user)} groupContext={mobileUserProfile.member && activeConversation ? { conversationId: activeConversation.id, member: mobileUserProfile.member, currentRole, onMemberUpdated: (member) => setMobileUserProfile((current) => current ? { ...current, member } : current) } : undefined} onClose={() => setMobileUserProfile(null)} /> : null}
      {showAnnouncements && isGroup ? <AnnouncementModal conversation={conversation} canPublish={canPublishAnnouncement} mobile={isMobile} onClose={() => setShowAnnouncements(false)} /> : null}
      {showInfoDrawer ? <ChatInfoDrawer conversation={conversation} currentUser={currentUser} members={members} friends={friends} membersLoading={membersLoading} currentRole={currentRole} conversations={conversations} isMobile={isMobile} onReportConversation={openConversationReport} onClose={closeInfoDrawer} /> : null}
    </section>
  );
}
