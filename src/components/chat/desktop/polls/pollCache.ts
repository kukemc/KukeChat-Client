import type { QueryClient } from '@tanstack/react-query';
import { patchMessageInPages, type MessagesInfiniteData } from '@/realtime/cache';
import type { Message } from '@/types/api';
import type { Poll, PollState, PollSummary } from '@/types/polls';

export function pollOf(message: Message): Poll | null {
  return message.type === 'poll' ? message.metadata?.poll ?? null : null;
}

/** 改写消息缓存里某条消息的投票对象；那条消息不在已加载的页里时什么都不做。 */
export function patchPoll(queryClient: QueryClient, conversationId: number, messageId: number, updater: (poll: Poll) => Poll): void {
  queryClient.setQueryData<MessagesInfiniteData | undefined>(['messages', conversationId], (current) => patchMessageInPages(current, messageId, (message) => {
    const poll = pollOf(message);
    return poll ? { ...message, metadata: { ...message.metadata, poll: updater(poll) } } : message;
  }));
}

/** 套用服务端的汇总。汇总里没有「我投了哪些」，本地的选择原样保留。 */
export function applyPollSummary(poll: Poll, summary: PollSummary): Poll {
  const votes = new Map(summary.options.map((option) => [option.id, option.votes]));
  return {
    ...poll,
    options: poll.options.map((option) => ({ ...option, votes: votes.get(option.id) ?? option.votes })),
    total_voters: summary.total_voters,
    closed: summary.closed,
    closed_at: summary.closed_at
  };
}

export function applyPollState(poll: Poll, state: PollState): Poll {
  return { ...applyPollSummary(poll, state), my_option_ids: state.my_option_ids };
}

/** 乐观更新：把我的选择换成 optionIds 之后，票数和参与人数应该是什么样。 */
export function withMyVote(poll: Poll, optionIds: number[]): Poll {
  const before = new Set(poll.my_option_ids);
  const after = new Set(optionIds);
  return {
    ...poll,
    options: poll.options.map((option) => ({ ...option, votes: option.votes + Number(after.has(option.id)) - Number(before.has(option.id)) })),
    total_voters: poll.total_voters + Number(after.size > 0) - Number(before.size > 0),
    my_option_ids: optionIds
  };
}
