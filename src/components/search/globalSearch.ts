import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/api/client';
import { createGroupJoinRequest, getOutgoingGroupJoinRequests, getRecommendedGroups, joinGroup, searchGroups } from '@/api/conversations';
import { getOutgoingFriendRequests, sendFriendRequest } from '@/api/friends';
import { searchChatSummary } from '@/api/messageSearch';
import { useGroupPlusUi } from '@/components/groupPlus/ui';
import { chatSearchTitle } from './chat/util';
import { useDebounced } from './chat/useChatSearch';
import { getRecommendedUsers, searchUsers } from '@/api/users';
import { friendshipUser } from '@/components/chat/message/messageMeta';
import { useKukeStore } from '@/store/kukeStore';
import type { Conversation, Friendship, GroupJoinRequest, Message, User } from '@/types/api';
import { giftPreview } from '@/utils/gift';
import { redPacketPreview } from '@/utils/redPacket';
import { SELF_CHAT_TITLE } from '@/utils/selfChat';

// 全局搜索的数据和操作。手机端的整页和桌面端的搜索面板共用，各自只管怎么画。

export type SearchTab = 'all' | 'messages' | 'users' | 'groups';

export const SEARCH_TABS: ReadonlyArray<readonly [SearchTab, string]> = [
  ['all', '全部'],
  ['messages', '聊天记录'],
  ['users', '用户'],
  ['groups', '群聊']
];

export interface GlobalSearchModalProps {
  currentUser: User;
  friends: Friendship[];
  initialKeyword?: string;
  onOpenConversation?: (conversationId: number) => void;
  mobile?: boolean;
  onClose: () => void;
}

/** 全局搜索里「聊天记录」分区：全部页签只列前几个会话，聊天记录页签才列满 */
export const CHAT_SUMMARY_PREVIEW = 5;
const FRIEND_REQUEST_SENT = '好友申请已发送';
const GROUP_JOINED = '已加入群聊';
const GROUP_REQUEST_SENT = '已提交加群申请';

export function groupTitle(conversation: Conversation): string {
  return conversation.display_title?.trim() || conversation.title?.trim() || `群聊 ${conversation.id}`;
}

export function conversationTitle(conversation?: Conversation | null): string {
  if (!conversation) {
    return '聊天记录';
  }
  if (conversation.type === 'self') {
    return SELF_CHAT_TITLE;
  }
  return conversation.display_title?.trim() || conversation.title?.trim() || conversation.direct_user?.nickname?.trim() || conversation.direct_user?.username?.trim() || `会话 ${conversation.id}`;
}

export function messageConversation(message: Message): Conversation | null {
  const value = message.conversation;
  return value && typeof value === 'object' && 'id' in value ? value as Conversation : null;
}

export function messagePreview(message: Message): string {
  if (message.recalled_at) {
    return '消息已撤回';
  }
  if (message.type === 'image') {
    return message.content ? `${message.content} [图片]` : '[图片]';
  }
  if (message.type === 'voice') {
    return '[语音]';
  }
  if (message.type === 'forward_bundle') {
    return '[聊天记录]';
  }
  if (message.type === 'system') {
    return message.content || '系统消息';
  }
  const redPacket = redPacketPreview(message);
  if (redPacket) {
    return redPacket;
  }
  const gift = giftPreview(message);
  if (gift) {
    return gift;
  }
  const images = Array.isArray(message.metadata?.images) ? message.metadata.images.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
  const suffix = images.length > 0 ? ` ${images.length > 1 ? `[图片] ${images.length}张图片` : '[图片]'}` : '';
  return `${message.content || '[空消息]'}${suffix}`;
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  return fallback;
}

/** 一行用户结果该显示成什么样。 */
export interface UserRowState {
  isSelf: boolean;
  /** 加好友按钮上的字 */
  actionLabel: string;
  actionDisabled: boolean;
  /** 已经是好友或已经申请过：按钮上的字是状态，不再是能点的操作 */
  settled: boolean;
  /** 上一次操作的结果；ok 为 false 时是报错 */
  result: { text: string; ok: boolean } | null;
}

/** 一行群聊结果该显示成什么样。 */
export interface GroupRowState {
  actionLabel: string;
  actionDisabled: boolean;
  /** 已经加入或已经提交申请 */
  settled: boolean;
  /** 我已经在这个群里：接口给的 joined，或者它就在我的会话列表里（桌面端据此显示「进入群聊」） */
  joined: boolean;
  /** 我的入群申请还在等审核 */
  pending: boolean;
  result: { text: string; ok: boolean } | null;
}

export type GlobalSearch = ReturnType<typeof useGlobalSearch>;

export function useGlobalSearch({ currentUser, friends, initialKeyword = '', onOpenConversation, onClose }: Omit<GlobalSearchModalProps, 'mobile'>) {
  const [tab, setTab] = useState<SearchTab>('all');
  const [inputValue, setInputValue] = useState(initialKeyword);
  const [submittedKeyword, setSubmittedKeyword] = useState(initialKeyword.trim());
  const [friendResultText, setFriendResultText] = useState<Record<number, string>>({});
  const [groupResultText, setGroupResultText] = useState<Record<number, string>>({});
  const queryClient = useQueryClient();
  const conversationIds = useKukeStore((state) => state.searchableConversationIds);
  const cleanKeyword = submittedKeyword.trim();
  const showingRecommendations = cleanKeyword.length === 0;

  useEffect(() => {
    setInputValue(initialKeyword);
    setSubmittedKeyword(initialKeyword.trim());
  }, [initialKeyword]);

  const outgoingQuery = useQuery({ queryKey: ['friend-requests', 'outgoing'], queryFn: getOutgoingFriendRequests });
  const outgoingGroupRequestsQuery = useQuery({ queryKey: ['group-join-requests', 'outgoing'], queryFn: getOutgoingGroupJoinRequests });
  const usersQuery = useQuery({
    queryKey: ['global-search', 'users', cleanKeyword],
    queryFn: () => (showingRecommendations ? getRecommendedUsers() : searchUsers(cleanKeyword)),
    enabled: tab === 'all' || tab === 'users'
  });
  const groupsQuery = useQuery({
    queryKey: ['global-search', 'groups', cleanKeyword],
    queryFn: () => (showingRecommendations ? getRecommendedGroups() : searchGroups(cleanKeyword)),
    enabled: tab === 'all' || tab === 'groups'
  });
  // 聊天记录：边打边查（防抖 250ms），先按会话聚合命中数；点进某个会话才看明细（ChatSearchHost）。
  // 用输入框里的值而不是「回车提交」的值：这一分区要像 QQ 一样即时出结果，旧请求由 react-query 的 signal 取消
  const chatKeyword = useDebounced(inputValue.trim());
  const messagesQuery = useQuery({
    queryKey: ['global-search', 'chat-summary', chatKeyword],
    queryFn: ({ signal }) => searchChatSummary({ q: chatKeyword, limit: 50 }, signal),
    enabled: chatKeyword.length > 0 && (tab === 'all' || tab === 'messages'),
    retry: false,
    staleTime: 15_000,
    gcTime: 60_000
  });

  const friendIds = new Set(friends.map((friendship) => friendshipUser(friendship)?.id).filter((id): id is number => typeof id === 'number'));
  const pendingOutgoingIds = new Set((outgoingQuery.data ?? []).filter((request) => request.status === 'pending').map((request) => request.receiver_id));
  const pendingOutgoingGroupIds = new Set((outgoingGroupRequestsQuery.data ?? []).filter((request: GroupJoinRequest) => request.status === 'pending').map((request) => request.conversation_id));
  const users = usersQuery.data ?? [];
  const groups = (groupsQuery.data ?? []).filter((group) => group.join_mode !== 'invite_only');
  const chatConversations = messagesQuery.data?.items ?? [];
  const chatTotal = messagesQuery.data?.total ?? 0;

  const friendMutation = useMutation({
    mutationFn: sendFriendRequest,
    onSuccess: (_request, userId) => {
      setFriendResultText((current) => ({ ...current, [userId]: FRIEND_REQUEST_SENT }));
      void queryClient.invalidateQueries({ queryKey: ['friends'] });
      void queryClient.invalidateQueries({ queryKey: ['friend-requests'] });
    },
    onError: (error, userId) => setFriendResultText((current) => ({ ...current, [userId]: errorMessage(error, '好友申请发送失败') }))
  });

  const joinMutation = useMutation({
    mutationFn: joinGroup,
    onSuccess: (_conversation, conversationId) => {
      setGroupResultText((current) => ({ ...current, [conversationId]: GROUP_JOINED }));
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      void queryClient.invalidateQueries({ queryKey: ['global-search', 'groups'] });
    },
    onError: (error, conversationId) => setGroupResultText((current) => ({ ...current, [conversationId]: errorMessage(error, '加群失败，请稍后重试') }))
  });

  const joinRequestMutation = useMutation({
    mutationFn: ({ conversationId, message, answer }: { conversationId: number; message?: string; answer?: string }) => createGroupJoinRequest(conversationId, { message, answer }),
    onSuccess: (_request, variables) => {
      setGroupResultText((current) => ({ ...current, [variables.conversationId]: GROUP_REQUEST_SENT }));
      void queryClient.invalidateQueries({ queryKey: ['group-join-requests'] });
      void queryClient.invalidateQueries({ queryKey: ['global-search', 'groups'] });
    },
    onError: (error, variables) => setGroupResultText((current) => ({ ...current, [variables.conversationId]: errorMessage(error, '加群申请发送失败') }))
  });

  function submitSearch(event?: React.FormEvent<HTMLFormElement>): void {
    event?.preventDefault();
    setSubmittedKeyword(inputValue.trim());
    setFriendResultText({});
    setGroupResultText({});
  }

  /** 点聚合列表里的一个会话（conversationId）或「查看全部」（null）：交给聊天记录搜索面板，关掉全局搜索。 */
  function openChatHistory(conversationId: number | null): void {
    const item = chatConversations.find((entry) => entry.conversation.id === conversationId);
    useGroupPlusUi.getState().openChatSearch({ conversationId, keyword: chatKeyword, title: item ? chatSearchTitle(item.conversation) : undefined });
    onClose();
  }

  function userRowState(user: User): UserRowState {
    const text = friendResultText[user.id];
    const isSelf = user.id === currentUser.id;
    const isFriend = friendIds.has(user.id);
    const isPending = pendingOutgoingIds.has(user.id) || text === FRIEND_REQUEST_SENT;
    return {
      isSelf,
      actionLabel: isFriend ? '已是好友' : isPending ? '已申请' : '加好友',
      actionDisabled: isSelf || isFriend || isPending || friendMutation.isPending,
      settled: isFriend || isPending,
      result: text ? { text, ok: text === FRIEND_REQUEST_SENT } : null
    };
  }

  function needsApproval(group: Conversation): boolean {
    return (group.join_mode === 'approval' || group.join_mode === 'question') && !group.auto_approve;
  }

  function groupRowState(group: Conversation): GroupRowState {
    const text = groupResultText[group.id];
    const joined = group.joined === true || text === GROUP_JOINED;
    const pending = text === GROUP_REQUEST_SENT || pendingOutgoingGroupIds.has(group.id) || group.join_request_status === 'pending';
    return {
      actionLabel: pending ? '待审核' : text === GROUP_JOINED ? '已加入' : needsApproval(group) ? '申请加入' : '加入',
      actionDisabled: joined || pending || joinMutation.isPending || joinRequestMutation.isPending,
      settled: joined || pending,
      // 旧后端的群搜索结果里没有 joined：退回看它在不在我的会话列表里
      joined: joined || conversationIds.includes(group.id),
      pending,
      result: text ? { text, ok: joined || pending } : null
    };
  }

  /** 已经加入的群：直接打开会话，关掉搜索。 */
  function openGroup(group: Conversation): void {
    // 桌面端没有传 onOpenConversation（搜到的消息是靠 requestJumpToMessage 切过去的），这里直接切当前会话
    if (onOpenConversation) {
      onOpenConversation(group.id);
    } else {
      useKukeStore.getState().setActiveConversationId(group.id);
    }
    onClose();
  }

  /** 加入群聊；需要审核的群改为提交申请，设了入群问题的先问答案（取消就不提交）。 */
  function requestJoinGroup(group: Conversation): void {
    if (!needsApproval(group)) {
      joinMutation.mutate(group.id);
      return;
    }
    const answer = group.join_mode === 'question' ? window.prompt(group.join_question?.trim() || '请输入加群问题答案') : undefined;
    if (group.join_mode === 'question' && answer === null) {
      return;
    }
    joinRequestMutation.mutate({ conversationId: group.id, message: undefined, answer: answer?.trim() || undefined });
  }

  return {
    tab,
    setTab,
    inputValue,
    setInputValue,
    cleanKeyword,
    showingRecommendations,
    usersQuery,
    groupsQuery,
    messagesQuery,
    chatKeyword,
    chatConversations,
    chatTotal,
    users,
    groups,
    submitSearch,
    openChatHistory,
    userRowState,
    groupRowState,
    sendFriendRequest: (userId: number) => friendMutation.mutate(userId),
    requestJoinGroup,
    openGroup
  };
}
