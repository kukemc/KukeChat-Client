import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/api/client';
import { createGroupJoinRequest, joinGroup, searchGroups } from '@/api/conversations';
import { useKukeStore, type RecommendedGroupJoinRequest } from '@/store/kukeStore';
import type { Conversation } from '@/types/api';

export interface RecommendedGroupJoinModalProps {
  request: RecommendedGroupJoinRequest;
  conversations: Conversation[];
}

function groupTitle(conversation: Conversation): string {
  return conversation.display_title?.trim() || conversation.title?.trim() || `群聊 ${conversation.id}`;
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  return fallback;
}

/** 作品积木推荐加群的弹窗：查出群资料，按群的加入方式决定是直接加入、提交申请，还是只能打开。 */
export function useRecommendedGroupJoin({ request, conversations }: RecommendedGroupJoinModalProps) {
  const [resultText, setResultText] = useState('');
  const [answer, setAnswer] = useState('');
  const close = useKukeStore((state) => state.closeRecommendedGroupJoinRequest);
  const setActiveConversationId = useKukeStore((state) => state.setActiveConversationId);
  const queryClient = useQueryClient();
  const joinedGroup = useMemo(() => conversations.find((conversation) => conversation.type === 'group' && conversation.id === request.groupId) ?? null, [conversations, request.groupId]);
  const groupQuery = useQuery({
    queryKey: ['recommended-group-join', request.id, request.groupId],
    queryFn: async () => {
      const groups = await searchGroups(String(request.groupId));
      return groups.find((group) => group.id === request.groupId) ?? null;
    },
    enabled: !joinedGroup
  });
  const group = joinedGroup ?? groupQuery.data ?? null;
  const isJoined = Boolean(joinedGroup || group?.joined);
  const needsApproval = (group?.join_mode === 'approval' || group?.join_mode === 'question') && !group.auto_approve;
  const needsAnswer = group?.join_mode === 'question' && !group.auto_approve;
  const isInviteOnly = group?.join_mode === 'invite_only';
  const isBusy = groupQuery.isLoading || groupQuery.isFetching;

  const joinMutation = useMutation({
    mutationFn: async () => {
      if (isJoined) {
        return 'joined' as const;
      }
      if (needsApproval) {
        await createGroupJoinRequest(request.groupId, { message: request.extraMessage || undefined, answer: needsAnswer ? answer.trim() : undefined });
        return 'pending' as const;
      }
      await joinGroup(request.groupId);
      return 'joined' as const;
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      void queryClient.invalidateQueries({ queryKey: ['global-search', 'groups'] });
      void queryClient.invalidateQueries({ queryKey: ['group-join-requests'] });
      if (result === 'pending') {
        setResultText('已提交加群申请，请等待管理员审核。');
        return;
      }
      setActiveConversationId(request.groupId);
      close();
    },
    onError: (error) => setResultText(errorMessage(error, needsApproval ? '加群申请发送失败' : '加入群聊失败'))
  });

  return {
    close,
    group,
    title: group ? groupTitle(group) : `群聊 ${request.groupId}`,
    /** 群资料查询失败 */
    lookupFailed: Boolean(groupQuery.error),
    /** 查完了但没有这个公开群 */
    notFound: !group && !groupQuery.isLoading && !groupQuery.error,
    needsAnswer,
    isInviteOnly,
    answer,
    setAnswer,
    resultText,
    canJoin: !isBusy && !isInviteOnly && (Boolean(group) || isJoined) && (!needsAnswer || answer.trim().length > 0),
    primaryLabel: isJoined ? '打开群聊' : needsApproval ? '申请加入' : '同意加入',
    isJoining: joinMutation.isPending,
    join: () => joinMutation.mutate()
  };
}
