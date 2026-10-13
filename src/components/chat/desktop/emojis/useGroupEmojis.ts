import { useEffect } from 'react';
import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { getGroupEmojis, type GroupEmoji } from '@/api/groupEmojis';
import { isRecord } from '@/api/normalizers';
import { subscribeRealtimeEvents } from '@/realtime/events';

export function groupEmojisKey(conversationId: number): readonly [string, number] {
  return ['group-emojis', conversationId];
}

/** 本群的表情列表。挂着的时候听实时事件，别人增删改名后立刻重拉。 */
export function useGroupEmojis(conversationId: number): UseQueryResult<GroupEmoji[]> {
  const queryClient = useQueryClient();

  useEffect(() => subscribeRealtimeEvents((event) => {
    // 这个事件不在类型表里，要按原始事件名认
    if (event.rawType === 'conversation.emojis.updated' && isRecord(event.data) && event.data.conversation_id === conversationId) {
      void queryClient.invalidateQueries({ queryKey: groupEmojisKey(conversationId) });
    }
  }), [queryClient, conversationId]);

  return useQuery({
    queryKey: groupEmojisKey(conversationId),
    queryFn: () => getGroupEmojis(conversationId),
    // 没挂着的时候收不到更新事件，所以每次打开都重拉一遍，期间先显示缓存
    staleTime: 0
  });
}
