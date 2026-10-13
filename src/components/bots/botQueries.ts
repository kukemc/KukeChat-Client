/**
 * 机器人中心的请求和缓存，桌面 / 移动两端共用。
 *
 * 缓存 key 的约定（别处也在按这些 key 失效，改之前全仓搜一下）：
 *   ['bots', 'mine']               我的机器人
 *   ['bots', 'square', 关键词]      广场，分页
 *   ['bots', 'detail', id]         单个机器人
 *   ['bots', id, 'reviews']        评价
 *   ['bots', id, 'dashboard']      仪表盘
 * 改动成功后只在这里做缓存失效；关弹窗、跳页面这类界面上的事由调用方在 mutate 的回调里做。
 */
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createBotReviewReply, deleteBot, getBot, getBotDashboard, getBotReviews, getMyBots, getPublicBots, installBot, rotateBotKey, toggleBotReviewLike, toggleBotReviewReplyLike, upsertBotReview } from '@/api/bots';
import { createDirectConversation } from '@/api/conversations';
import { shareBotToConversation } from '@/api/messages';
import type { Bot } from '@/types/api';
import { botShareMetadata, botShareText } from './botShared';

const SQUARE_PAGE_SIZE = 30;

export function useMyBots() {
  return useQuery({ queryKey: ['bots', 'mine'], queryFn: getMyBots });
}

export function useSquareBots(keyword: string) {
  return useInfiniteQuery({
    queryKey: ['bots', 'square', keyword],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => getPublicBots(keyword, { limit: SQUARE_PAGE_SIZE, offset: pageParam }),
    getNextPageParam: (lastPage) => (lastPage.has_more ? lastPage.offset + lastPage.items.length : undefined)
  });
}

export function useBotDetail(botId: number) {
  return useQuery({ queryKey: ['bots', 'detail', botId], queryFn: () => getBot(botId) });
}

export function useBotReviews(botId: number) {
  return useQuery({ queryKey: ['bots', botId, 'reviews'], queryFn: () => getBotReviews(botId) });
}

export function useBotDashboard(botId: number) {
  return useQuery({ queryKey: ['bots', botId, 'dashboard'], queryFn: () => getBotDashboard(botId) });
}

/** 把机器人加进一个群。消息和成员事件默认都收，之后可以在群资料里关。 */
export function useInstallBot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ botId, conversationId }: { botId: number; conversationId: number }) => installBot(botId, { conversation_id: conversationId, receive_messages: true, receive_member_events: true }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['conversation-bots'] });
      void queryClient.invalidateQueries({ queryKey: ['conversation-members'] });
      void queryClient.invalidateQueries({ queryKey: ['conversation-members-page'] });
    }
  });
}

export function useDeleteBot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (botId: number) => deleteBot(botId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['bots'] });
      void queryClient.invalidateQueries({ queryKey: ['conversation-bots'] });
      void queryClient.invalidateQueries({ queryKey: ['conversation-members'] });
    }
  });
}

/** 重置 Key：旧 Key 立刻失效，新的完整 Key 只在这次返回里出现一次。 */
export function useRotateBotKey() {
  return useMutation({ mutationFn: (botId: number) => rotateBotKey(botId) });
}

export function useSaveBotReview(botId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ rating, content }: { rating: number; content: string }) => upsertBotReview(botId, { rating, content: content.trim() || null }),
    // 评分会改变广场和「我的」里的平均分，['bots'] 整个前缀一起失效
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['bots'] })
  });
}

function useInvalidateReviews(botId: number): () => void {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['bots', botId, 'reviews'] });
    void queryClient.invalidateQueries({ queryKey: ['bots', 'detail', botId] });
  };
}

/** 给一条评价点赞 / 取消；带 replyId 时点的是评价下面的某条回复。 */
export function useToggleBotReviewLike(botId: number) {
  const invalidate = useInvalidateReviews(botId);
  return useMutation({
    mutationFn: ({ reviewId, replyId }: { reviewId: number; replyId?: number }) => (replyId ? toggleBotReviewReplyLike(botId, reviewId, replyId) : toggleBotReviewLike(botId, reviewId)),
    onSuccess: invalidate
  });
}

/** 回复一条评价；parentId 是被回复的那条回复，直接回复评价本身时为 null。 */
export function useReplyBotReview(botId: number) {
  const invalidate = useInvalidateReviews(botId);
  return useMutation({
    mutationFn: ({ reviewId, content, parentId }: { reviewId: number; content: string; parentId: number | null }) => createBotReviewReply(botId, reviewId, { content: content.trim(), parent_id: parentId }),
    onSuccess: invalidate
  });
}

/** 把机器人名片发到一个会话里。 */
export function useShareBot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ bot, conversationId }: { bot: Bot; conversationId: number }) => shareBotToConversation(conversationId, botShareText(bot), botShareMetadata(bot)),
    onSuccess: (_message, { conversationId }) => {
      void queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    }
  });
}

/** 和机器人开一个临时私聊，返回这个会话；打开它由调用方负责。 */
export function useBotDirectChat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (bot: Bot) => createDirectConversation({ user_id: bot.user_id, temporary: true }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['conversations'] })
  });
}
