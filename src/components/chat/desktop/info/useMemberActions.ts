import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createDirectConversation, removeConversationMember, updateConversationMemberMute, updateConversationMemberRole, updateConversationMemberTitle } from '@/api/conversations';
import { getOutgoingFriendRequests, sendFriendRequest } from '@/api/friends';
import { getDisplayName } from '@/components/ui/Avatar';
import type { ProfileAction } from '@/components/ui/MobileUserProfilePage';
import { useKukeStore } from '@/store/kukeStore';
import type { Conversation, ConversationMember, Friendship, MemberRole, User } from '@/types/api';
import { hasPendingOutgoingFriendRequest, isFriendUserId } from '@/utils/friendship';
import { memberMuted } from '../../info/shared';
import { memberUserId, resolveKnownUser } from '../../message/messageMeta';
import type { InfoNotice } from './infoContext';
import { cancelMemberQueries, invalidateConversationData, patchMemberCache } from './infoData';

interface MemberActionsOptions {
  conversation: Conversation;
  currentUser: User;
  currentRole: MemberRole;
  friends: Friendship[];
  notify: (text: string, tone?: InfoNotice['tone']) => void;
  /** 收起成员右键菜单和资料卡 */
  dismissOverlays: () => void;
  closeDialog: () => void;
}

export interface MemberActions {
  isFriend: (userId?: number | null) => boolean;
  isPendingFriend: (userId?: number | null) => boolean;
  canRequestFriend: (userId?: number | null) => boolean;
  canChangeRole: (member: ConversationMember) => boolean;
  canMute: (member: ConversationMember) => boolean;
  canSetTitle: (member: ConversationMember) => boolean;
  canRemove: (member: ConversationMember) => boolean;
  requestFriend: (member: ConversationMember) => void;
  toggleAdmin: (member: ConversationMember) => void;
  toggleMute: (member: ConversationMember) => void;
  editTitle: (member: ConversationMember) => void;
  remove: (member: ConversationMember) => void;
  /** 资料卡底部的主按钮：发消息 / 已申请 / 添加好友 */
  profileAction: (user?: User | null) => ProfileAction | undefined;
  busy: { friend: boolean; role: boolean; mute: boolean; title: boolean; remove: boolean };
}

function memberName(member: ConversationMember, userId: number): string {
  return member.nickname?.trim() || getDisplayName(member.user, `用户 ${userId}`);
}

/** 对某个成员能做的事：加好友、发消息、设管理员、禁言、头衔、移出。权限判断只是别让人白点，后端会再校验。 */
export function useMemberActions({ conversation, currentUser, currentRole, friends, notify, dismissOverlays, closeDialog }: MemberActionsOptions): MemberActions {
  const queryClient = useQueryClient();
  const setActiveConversationId = useKukeStore((state) => state.setActiveConversationId);
  const [locallyPendingFriendIds, setLocallyPendingFriendIds] = useState<Set<number>>(() => new Set());
  const conversationId = conversation.id;
  const isGroup = conversation.type === 'group';
  const canManage = isGroup && (currentRole === 'owner' || currentRole === 'admin');

  const outgoingFriendRequestsQuery = useQuery({
    queryKey: ['friend-requests', 'outgoing'],
    queryFn: getOutgoingFriendRequests,
    staleTime: 15_000
  });

  const directMutation = useMutation({
    mutationFn: createDirectConversation,
    onSuccess: (nextConversation) => {
      notify('');
      dismissOverlays();
      setActiveConversationId(nextConversation.id);
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: () => notify('发起私聊失败，请稍后重试。', 'error')
  });

  const friendRequestMutation = useMutation({
    mutationFn: sendFriendRequest,
    onSuccess: (request, receiverId) => {
      notify('好友申请已发送，等待对方通过。');
      dismissOverlays();
      setLocallyPendingFriendIds((current) => new Set(current).add(request.receiver_id ?? receiverId));
      void queryClient.invalidateQueries({ queryKey: ['friend-requests'] });
      void queryClient.invalidateQueries({ queryKey: ['friend-requests', 'outgoing'] });
    },
    onError: () => notify('好友申请发送失败，可能已是好友或已有待处理申请。', 'error')
  });

  const roleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: number; role: MemberRole }) => updateConversationMemberRole(conversationId, userId, role),
    onSuccess: (_member, { role }) => {
      notify(role === 'admin' ? '已设为管理员。' : '已取消管理员。');
      invalidateConversationData(queryClient, conversationId);
    },
    onError: () => notify('成员角色更新失败，请稍后重试。', 'error')
  });

  const invalidateMembers = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['conversation-members', conversationId] });
    void queryClient.invalidateQueries({ queryKey: ['conversation-members-page', conversationId] });
  };

  const muteMutation = useMutation({
    mutationFn: ({ userId, muted }: { userId: number; muted: boolean }) => updateConversationMemberMute(conversationId, userId, muted),
    onMutate: async ({ userId, muted }) => {
      await cancelMemberQueries(queryClient, conversationId);
      patchMemberCache(queryClient, conversationId, userId, { muted, muted_until: null });
    },
    onSuccess: (member, { userId }) => {
      notify(member.muted ? '已设置群禁言。' : '已解除群禁言。');
      patchMemberCache(queryClient, conversationId, userId, { muted: Boolean(member.muted), muted_until: member.muted_until ?? null });
    },
    onError: () => {
      invalidateConversationData(queryClient, conversationId);
      notify('成员禁言更新失败，请稍后重试。', 'error');
    },
    onSettled: invalidateMembers
  });

  const titleMutation = useMutation({
    mutationFn: ({ userId, title }: { userId: number; title: string | null }) => updateConversationMemberTitle(conversationId, userId, title),
    onMutate: async ({ userId, title }) => {
      await cancelMemberQueries(queryClient, conversationId);
      patchMemberCache(queryClient, conversationId, userId, { title });
    },
    onSuccess: () => notify(''),
    onError: () => {
      invalidateConversationData(queryClient, conversationId);
      notify('成员头衔保存失败，请稍后重试。', 'error');
    },
    onSettled: invalidateMembers
  });

  const removeMutation = useMutation({
    mutationFn: (userId: number) => removeConversationMember(conversationId, userId),
    onSuccess: () => {
      closeDialog();
      notify('');
      invalidateConversationData(queryClient, conversationId);
    },
    onError: () => notify('移除成员失败，请稍后重试。', 'error')
  });

  const isFriend = (userId?: number | null): boolean => isFriendUserId(friends, userId, currentUser.id);
  const isPendingFriend = (userId?: number | null): boolean => locallyPendingFriendIds.has(userId ?? -1) || hasPendingOutgoingFriendRequest(outgoingFriendRequestsQuery.data ?? [], userId);
  const canRequestFriend = (userId?: number | null): boolean => Boolean(userId && userId !== currentUser.id && !isFriend(userId) && !isPendingFriend(userId) && !friendRequestMutation.isPending);

  /** 群里除自己以外、对方不是群主时才谈得上管理 */
  const manageable = (member: ConversationMember): boolean => {
    const userId = memberUserId(member);
    return Boolean(isGroup && userId && userId !== currentUser.id && member.role !== 'owner');
  };
  const canChangeRole = (member: ConversationMember): boolean => currentRole === 'owner' && manageable(member);
  const canMute = (member: ConversationMember): boolean => canManage && manageable(member);
  const canSetTitle = (member: ConversationMember): boolean => Boolean(isGroup && currentRole === 'owner' && memberUserId(member));
  const canRemove = (member: ConversationMember): boolean => canManage && manageable(member) && (currentRole === 'owner' || member.role === 'member');

  function requestFriendFromUser(user?: User | null): void {
    if (user?.id && canRequestFriend(user.id)) {
      friendRequestMutation.mutate(user.id);
    }
  }

  return {
    isFriend,
    isPendingFriend,
    canRequestFriend,
    canChangeRole,
    canMute,
    canSetTitle,
    canRemove,
    requestFriend: (member) => requestFriendFromUser(resolveKnownUser(member.user, memberUserId(member), friends)),
    toggleAdmin: (member) => {
      const userId = memberUserId(member);
      if (userId && canChangeRole(member) && !roleMutation.isPending) {
        roleMutation.mutate({ userId, role: member.role === 'admin' ? 'member' : 'admin' });
      }
      dismissOverlays();
    },
    toggleMute: (member) => {
      const userId = memberUserId(member);
      if (userId && canMute(member) && !muteMutation.isPending) {
        muteMutation.mutate({ userId, muted: !memberMuted(member) });
      }
      dismissOverlays();
    },
    editTitle: (member) => {
      const userId = memberUserId(member);
      if (!userId || !canSetTitle(member) || titleMutation.isPending) {
        return;
      }
      const nextTitle = window.prompt(`设置 ${memberName(member, userId)} 的群头衔（留空清除）`, member.title ?? '');
      if (nextTitle !== null) {
        titleMutation.mutate({ userId, title: nextTitle.trim() || null });
        dismissOverlays();
      }
    },
    remove: (member) => {
      const userId = memberUserId(member);
      if (!userId || !canRemove(member) || removeMutation.isPending) {
        return;
      }
      if (window.confirm(`确定将 ${memberName(member, userId)} 移出群聊吗？`)) {
        removeMutation.mutate(userId);
        dismissOverlays();
      }
    },
    profileAction: (user) => {
      const userId = user?.id;
      if (!userId || userId === currentUser.id || user?.is_bot) {
        return undefined;
      }
      if (isFriend(userId)) {
        return {
          label: directMutation.isPending ? '打开中...' : '发消息',
          disabled: directMutation.isPending,
          onClick: (target) => {
            if (!directMutation.isPending) {
              directMutation.mutate({ user_id: target.id, temporary: false });
            }
          }
        };
      }
      if (isPendingFriend(userId)) {
        return { label: '已申请', disabled: true, tone: 'muted', helperText: '好友申请已发送，等待对方通过' };
      }
      return { label: friendRequestMutation.isPending ? '发送中...' : '添加好友', disabled: friendRequestMutation.isPending, onClick: requestFriendFromUser };
    },
    busy: {
      friend: friendRequestMutation.isPending,
      role: roleMutation.isPending,
      mute: muteMutation.isPending,
      title: titleMutation.isPending,
      remove: removeMutation.isPending
    }
  };
}
