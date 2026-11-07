import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/api/client';
import { acceptInvite, resolveInvite } from '@/api/invites';
import { INVITE_PENDING_TEXT, inviteAcceptErrorMessage } from '@/components/groups/groupJoin';
import { useKukeStore } from '@/store/kukeStore';
import type { InviteJoinAction } from '@/types/api';

export interface InviteModalProps {
  token: string;
  onClose: () => void;
}

/** 入群问题的回答最多多少字（和自己申请入群时一样） */
export const INVITE_ANSWER_MAX = 500;

/**
 * 解析一条邀请链接（加群或加好友），以及接受它。
 * 群邀请按 join_action 走：直接进群的切到群里并关掉弹窗；要审核 / 要答题的提交成入群申请，
 * 弹窗留着显示「已提交申请」；仅邀请的群按钮不可点。
 */
export function useInvite({ token, onClose }: InviteModalProps) {
  const queryClient = useQueryClient();
  const setActiveConversationId = useKukeStore((state) => state.setActiveConversationId);
  const [answer, setAnswer] = useState('');
  const [submitted, setSubmitted] = useState(false);
  // 服务端没带 join_action（老版本）却说要先答题（422）：照样把答题框亮出来
  const [answerRequired, setAnswerRequired] = useState(false);
  const inviteQuery = useQuery({ queryKey: ['invite', token], queryFn: () => resolveInvite(token) });
  const invite = inviteQuery.data;
  const isGroup = invite?.target_type === 'group';
  const joinAction: InviteJoinAction = (isGroup && invite?.join_action) || 'join';
  const needsAnswer = isGroup && (joinAction === 'answer' || answerRequired);
  const forbidden = isGroup && joinAction === 'forbidden';

  const acceptMutation = useMutation({
    mutationFn: () => acceptInvite(token, needsAnswer ? { answer: answer.trim() } : undefined),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      void queryClient.invalidateQueries({ queryKey: ['friends'] });
      if (result.target_type === 'group' && result.status === 'pending') {
        // 提交成了入群申请：还没进群，不切过去，弹窗里告诉他等审核
        void queryClient.invalidateQueries({ queryKey: ['group-join-requests'] });
        setSubmitted(true);
        return;
      }
      if (result.conversation_id) {
        setActiveConversationId(result.conversation_id);
      }
      onClose();
    },
    onError: (error) => {
      if (isGroup && error instanceof ApiError && error.status === 422 && /answer/i.test(error.message)) {
        setAnswerRequired(true);
      }
    }
  });

  const alreadyDone = Boolean(invite?.already_joined) || Boolean(invite?.already_friends);
  const answerMissing = needsAnswer && !answer.trim();
  const groupLabel = joinAction === 'request' || needsAnswer ? '申请加入' : forbidden ? '需要群主或管理员邀请' : '加入群聊';
  const acceptLabel = invite?.already_joined
    ? '已加入'
    : invite?.already_friends
      ? '已是好友'
      : submitted
        ? '已提交申请'
        : acceptMutation.isPending
          ? '处理中...'
          : isGroup ? groupLabel : '添加好友';

  return {
    isLoading: inviteQuery.isLoading,
    failed: Boolean(inviteQuery.error),
    title: isGroup ? '邀请你加入群聊' : '邀请你添加好友',
    group: invite?.group ?? null,
    user: invite?.user ?? null,
    /** 要回答入群问题（join_action 为 answer）且还没提交 */
    needsAnswer: needsAnswer && !submitted && !alreadyDone,
    joinQuestion: invite?.group?.join_question?.trim() || '请回答管理员设置的入群问题',
    answer,
    setAnswer: (value: string) => setAnswer(value.slice(0, INVITE_ANSWER_MAX)),
    /** 给人看的说明：要审核、仅邀请、已提交申请 */
    hint: submitted
      ? INVITE_PENDING_TEXT
      : alreadyDone || !isGroup ? null
        : forbidden ? '这个群仅限群主或管理员邀请加入，这条链接不能直接进群。'
          : joinAction === 'request' || needsAnswer ? '加入这个群需要管理员审核，提交后请耐心等待。' : null,
    hintTone: (submitted ? 'success' : forbidden ? 'warn' : 'muted') as 'success' | 'warn' | 'muted',
    errorText: acceptMutation.isError ? inviteAcceptErrorMessage(acceptMutation.error) : null,
    submitted,
    acceptLabel,
    acceptDisabled: !invite || acceptMutation.isPending || alreadyDone || submitted || forbidden || answerMissing,
    accept: () => acceptMutation.mutate()
  };
}
