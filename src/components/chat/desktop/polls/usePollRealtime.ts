import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { isRecord } from '@/api/normalizers';
import { subscribeRealtimeEvents } from '@/realtime/events';
import type { PollSummary } from '@/types/polls';
import { applyPollSummary, patchPoll } from './pollCache';

function isPollSummary(value: unknown): value is PollSummary {
  return isRecord(value) && typeof value.conversation_id === 'number' && typeof value.message_id === 'number' && Array.isArray(value.options);
}

/** 把 `poll.updated` 推送修补进消息缓存。按事件里的会话 id 找缓存，没开着的会话也一并更新。 */
export function usePollRealtime(): void {
  const queryClient = useQueryClient();
  useEffect(() => subscribeRealtimeEvents((event) => {
    // 这个事件不在类型表里，只能按原始事件名认
    if (event.rawType === 'poll.updated' && isPollSummary(event.data)) {
      const summary = event.data;
      patchPoll(queryClient, summary.conversation_id, summary.message_id, (poll) => applyPollSummary(poll, summary));
    }
  }), [queryClient]);
}
