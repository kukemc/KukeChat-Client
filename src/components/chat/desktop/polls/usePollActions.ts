import { useMutation, useQueryClient } from '@tanstack/react-query';
import { closePoll, getPollState, votePoll } from '@/api/polls';
import { toast } from '@/components/ui/toast';
import type { Message } from '@/types/api';
import type { Poll } from '@/types/polls';
import { applyPollState, patchPoll, withMyVote } from './pollCache';

/** 投票卡上会改动服务端数据的两个操作：投票（乐观更新）和提前结束。 */
export function usePollActions(message: Message, poll: Poll) {
  const queryClient = useQueryClient();
  const conversationId = message.conversation_id;
  const patch = (updater: (current: Poll) => Poll): void => patchPoll(queryClient, conversationId, message.id, updater);

  const fail = (error: Error): void => {
    toast.error(error.message);
    // 被拒多半是本地状态过期了（已经结束之类），顺手对齐一次；拿不到就维持现状
    getPollState(conversationId, poll.id).then((state) => patch((current) => applyPollState(current, state))).catch(() => undefined);
  };

  const vote = useMutation({
    mutationFn: (optionIds: number[]) => votePoll(conversationId, poll.id, optionIds),
    onMutate: (optionIds) => {
      patch((current) => withMyVote(current, optionIds));
      return poll;
    },
    onSuccess: (state) => patch((current) => applyPollState(current, state)),
    onError: (error, _optionIds, previous) => {
      if (previous) {
        patch(() => previous);
      }
      fail(error);
    }
  });

  const close = useMutation({
    mutationFn: () => closePoll(conversationId, poll.id),
    onSuccess: (state) => patch((current) => applyPollState(current, state)),
    onError: fail
  });

  return { vote, close };
}
