import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { acceptGroupJoinRequest, createDirectConversation, getIncomingGroupJoinRequests, getOutgoingGroupJoinRequests, rejectGroupJoinRequest } from '@/api/conversations';
import { acceptFriendRequest, deleteFriend, deleteTemporaryConversationBlock, getIncomingFriendRequests, getOutgoingFriendRequests, getTemporaryConversationBlocks, ignoreAllFriendRequests, ignoreFriendRequest, rejectFriendRequest, sendFriendRequest } from '@/api/friends';
import { applyNotificationsSeen, getNotifications, hasUnseenNotifications, markNotificationsSeen, notificationNewCount } from '@/api/notifications';
import { searchUsers } from '@/api/users';
import { getDisplayName } from '@/components/ui/Avatar';
import { useKukeStore } from '@/store/kukeStore';
import type { Conversation, Friendship, UnifiedNotificationList, User } from '@/types/api';
import { conversationTitle, friendUser, matchesContactUser, matchesGroupConversation, sortGroupJoinRequestsNewestFirst } from './contactsShared';

interface ContactsDataOptions {
  friends: Friendship[];
  conversations: Conversation[];
  currentUser: User;
  /** 搜索框里的原始文字：本地筛好友和群，满 2 个字符再去搜全站用户 */
  query: string;
  /** 不传时直接切到桌面端的聊天视图 */
  onOpenConversation?: (conversationId: number) => void;
  onOpenPost?: (postId: number) => void;
}

/** 联系人页的全部数据：各类申请、通知、屏蔽名单、找人，以及对它们的操作。桌面端和移动端共用。 */
export function useContactsData({ friends, conversations, currentUser, query, onOpenConversation, onOpenPost }: ContactsDataOptions) {
  const queryClient = useQueryClient();
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

  const openConversation = (conversationId: number): void => {
    if (onOpenConversation) {
      onOpenConversation(conversationId);
      return;
    }
    const store = useKukeStore.getState();
    store.setActiveConversationId(conversationId);
    store.setWorkspaceView('chat');
  };

  const openPost = (postId: number): void => {
    if (onOpenPost) {
      onOpenPost(postId);
      return;
    }
    useKukeStore.getState().openPost(postId);
  };

  const invalidateContacts = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['friends'] });
    void queryClient.invalidateQueries({ queryKey: ['friend-requests'] });
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  const invalidateGroupRequests = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['group-join-requests'] });
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    void queryClient.invalidateQueries({ queryKey: ['conversations'] });
  };

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
      openConversation(conversation.id);
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    }
  });
  const acceptMutation = useMutation({
    mutationFn: acceptFriendRequest,
    onSuccess: (request) => {
      invalidateContacts();
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      // 通过之后直接进到和对方的私聊
      const peerId = request.requester_id === currentUser.id ? request.receiver_id : request.requester_id;
      directMutation.mutate({ user_id: peerId });
    }
  });
  const rejectMutation = useMutation({ mutationFn: rejectFriendRequest, onSuccess: invalidateContacts });
  const ignoreMutation = useMutation({ mutationFn: ignoreFriendRequest, onSuccess: invalidateContacts });
  const ignoreAllMutation = useMutation({ mutationFn: ignoreAllFriendRequests, onSuccess: invalidateContacts });
  const seenMutation = useMutation({
    mutationFn: markNotificationsSeen,
    onSuccess: ({ seen_at: seenAt }) => {
      queryClient.setQueryData<UnifiedNotificationList | undefined>(['notifications'], (current) => applyNotificationsSeen(current, seenAt));
    }
  });
  const acceptGroupRequestMutation = useMutation({ mutationFn: (requestId: number) => acceptGroupJoinRequest(requestId), onSuccess: invalidateGroupRequests });
  const rejectGroupRequestMutation = useMutation({ mutationFn: (requestId: number) => rejectGroupJoinRequest(requestId), onSuccess: invalidateGroupRequests });
  const sendRequestMutation = useMutation({ mutationFn: sendFriendRequest, onSuccess: invalidateContacts });
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
  const notifications = notificationsQuery.data?.items ?? [];
  const newCount = notificationNewCount(notificationsQuery.data);
  // 「新朋友」角标：只算还没看过的好友申请通知，看过但没处理的不再一直挂着
  const newFriendCount = notifications.filter((item) => item.category === 'friend' && item.pending && item.unread).length;
  const pendingIncomingFriendCount = incoming.filter((request) => request.status === 'pending').length;
  // 通知接口还没回来时，待处理数先按申请列表算
  const pendingIncoming = incoming.filter((request) => request.status === 'pending').length + incomingGroupRequests.filter((request) => request.status === 'pending').length;

  const sortedFriends = [...friends].sort((left, right) => getDisplayName(friendUser(left), '').localeCompare(getDisplayName(friendUser(right), ''), 'zh-CN'));
  const filteredFriends = cleanQuery ? sortedFriends.filter((friendship) => matchesContactUser(friendUser(friendship), cleanQueryLower)) : sortedFriends;
  const groupConversations = conversations
    .filter((conversation) => conversation.type === 'group')
    .filter((conversation) => !cleanQuery || matchesGroupConversation(conversation, cleanQueryLower))
    .sort((left, right) => conversationTitle(left).localeCompare(conversationTitle(right), 'zh-CN'));

  return {
    cleanQuery,
    incomingQuery,
    outgoingQuery,
    incomingGroupRequestsQuery,
    outgoingGroupRequestsQuery,
    notificationsQuery,
    temporaryBlocksQuery,
    usersQuery,
    acceptMutation,
    rejectMutation,
    ignoreMutation,
    ignoreAllMutation,
    acceptGroupRequestMutation,
    rejectGroupRequestMutation,
    sendRequestMutation,
    directMutation,
    deleteMutation,
    unblockMutation,
    incoming,
    outgoing,
    incomingGroupRequests,
    outgoingGroupRequests,
    notifications,
    notificationCount: notificationsQuery.data?.counts?.all ?? notifications.length,
    pendingCount: notificationsQuery.data?.pending_count ?? pendingIncoming,
    /** 角标用：上次打开通知中心之后来的（只提醒一次），不是待处理总数 */
    newCount,
    newFriendCount,
    pendingIncomingFriendCount,
    /** 打开通知中心 / 新朋友页时调：有没看过的才发请求 */
    markSeen: (): void => {
      if (!seenMutation.isPending && hasUnseenNotifications(notificationsQuery.data)) {
        seenMutation.mutate();
      }
    },
    /** 「全部忽略」：先确认，申请方不会知道 */
    ignoreAll: (): void => {
      if (pendingIncomingFriendCount > 0 && window.confirm(`忽略全部 ${pendingIncomingFriendCount} 条好友申请？对方不会收到通知，仍会看到「等待验证」。`)) {
        ignoreAllMutation.mutate();
      }
    },
    /** 任何一个申请正在处理时，所有「接受 / 拒绝 / 忽略」都先锁住 */
    requestBusy: acceptMutation.isPending || rejectMutation.isPending || ignoreMutation.isPending || ignoreAllMutation.isPending || acceptGroupRequestMutation.isPending || rejectGroupRequestMutation.isPending,
    temporaryBlocks: temporaryBlocksQuery.data ?? [],
    searchResults: usersQuery.data ?? [],
    friendIds: new Set(friends.map((friendship) => friendUser(friendship)?.id).filter((id): id is number => typeof id === 'number')),
    pendingOutgoingIds: new Set(outgoing.filter((request) => request.status === 'pending').map((request) => request.receiver_id)),
    filteredFriends,
    groupConversations,
    openConversation,
    openPost
  };
}

export type ContactsData = ReturnType<typeof useContactsData>;
