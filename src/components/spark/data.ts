import { useMutation, useQuery, useQueryClient, type QueryClient, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query';
import { create } from 'zustand';
import { ApiError } from '@/api/client';
import { getFriendSpark, getMySparks, normalizeSpark, normalizeSparkUpdated, relightSpark, sparkWorthShowing } from '@/api/sparks';
import { isShopUnavailable, shopErrorCode } from '@/components/shop/data';
import { useKukeStore } from '@/store/kukeStore';
import type { Conversation } from '@/types/api';
import type { Spark, SparkDetail } from '@/types/spark';

/**
 * 好友火花的数据层（KukeChat-Server/docs/sparks.md）：缓存 key、查询、实时事件怎么改缓存、说明面板开着谁。
 *
 * 会话列表的私聊行、聊天标题旁用的是会话对象上的 spark（GET /conversations 带着），不另外请求；
 * 资料卡这种只有用户 id 的地方用 GET /sparks 那一份（按好友 id 查表）。
 * 实时事件 spark.updated 带着新的 spark：直接改到会话列表、那一份表、详情里。
 */
export const sparkKeys = {
  root: ['sparks'] as const,
  mine: ['sparks', 'mine'] as const,
  detail: (friendId: number) => ['sparks', 'friend', friendId] as const
};

const UNAVAILABLE_RETRY_MS = 10 * 60_000;

async function fetchMine(): Promise<Record<number, Spark> | null> {
  try {
    return await getMySparks();
  } catch (error) {
    // 旧后端没有这个功能
    if (isShopUnavailable(error)) {
      return null;
    }
    throw error;
  }
}

export function useMySparks(enabled = true): UseQueryResult<Record<number, Spark> | null> {
  const token = useKukeStore((state) => state.token);
  return useQuery({
    queryKey: sparkKeys.mine,
    queryFn: fetchMine,
    enabled: enabled && Boolean(token),
    retry: false,
    staleTime: 60_000,
    refetchInterval: (query) => (query.state.data === null ? UNAVAILABLE_RETRY_MS : false)
  });
}

/** 我和某个好友的火花；没有可画的、不是好友、还没拉到都是 null。 */
export function useFriendSpark(userId: number | null | undefined): Spark | null {
  const currentUserId = useKukeStore((state) => state.currentUser?.id);
  const query = useMySparks(Boolean(userId) && userId !== currentUserId);
  if (!userId || !query.data) {
    return null;
  }
  return query.data[userId] ?? null;
}

export function useSparkDetail(friendId: number | null): UseQueryResult<SparkDetail> {
  return useQuery({
    queryKey: sparkKeys.detail(friendId ?? 0),
    queryFn: () => getFriendSpark(friendId ?? 0),
    enabled: Boolean(friendId),
    retry: false,
    staleTime: 15_000
  });
}

export function sparkErrorText(error: unknown): string {
  if (error instanceof ApiError) {
    const code = shopErrorCode(error);
    if (code === 'not_friend') {
      return '你们已经不是好友了';
    }
    if (code === 'insufficient_balance') {
      return '金币不够，先去充一点再来重燃吧';
    }
    if (code === 'ccw_not_bound') {
      return '先绑定 CCW 账号才能用金币重燃火花';
    }
  }
  return error instanceof Error && error.message ? error.message : '出了点问题，稍后再试';
}

/** 新的 spark 写进所有缓存：会话列表里那一个私聊、GET /sparks 那一份、详情。 */
function applySpark(queryClient: QueryClient, friendId: number, conversationId: number | null, spark: Spark): void {
  const shown = sparkWorthShowing(spark) ? spark : null;
  queryClient.setQueryData<Conversation[] | undefined>(['conversations'], (current) => {
    if (!current) {
      return current;
    }
    let changed = false;
    const next = current.map((item) => {
      const matches = conversationId !== null ? item.id === conversationId : item.type === 'direct' && item.direct_user?.id === friendId;
      if (!matches) {
        return item;
      }
      changed = true;
      return { ...item, spark: shown };
    });
    return changed ? next : current;
  });
  queryClient.setQueryData<Record<number, Spark> | null | undefined>(sparkKeys.mine, (current) => {
    if (!current) {
      return current;
    }
    const next = { ...current };
    if (shown) {
      next[friendId] = shown;
    } else {
      delete next[friendId];
    }
    return next;
  });
  queryClient.setQueryData<SparkDetail | undefined>(sparkKeys.detail(friendId), (current) => (current ? { ...current, spark } : current));
  // 亲密度详情里也挂着火花
  void queryClient.invalidateQueries({ queryKey: ['intimacy', 'friend', friendId], exact: true });
}

/** 实时事件 spark.updated（第 4 节，双方各收一份，按收的人的视角）。src/realtime/client.ts 收到后调这里。 */
export function handleSparkEvent(queryClient: QueryClient, data: unknown): void {
  const event = normalizeSparkUpdated(data);
  if (!event) {
    return;
  }
  applySpark(queryClient, event.friend_id, event.conversation_id, event.spark);
}

/** 断线重连之后：断开期间的变化没收到事件，重拉一遍（会话列表另有自己的重拉）。 */
export function refreshSparksAfterReconnect(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: sparkKeys.root });
}

export function useRelightSpark(friendId: number, conversationId: number | null): UseMutationResult<{ restored_days: number; spark: Spark }, Error, void> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => relightSpark(friendId),
    onSuccess: (result) => {
      applySpark(queryClient, friendId, conversationId, result.spark);
      void queryClient.invalidateQueries({ queryKey: sparkKeys.detail(friendId) });
      // 余额变了（shop.balance.changed 也会来，这里先让商店的缓存过期）
      void queryClient.invalidateQueries({ queryKey: ['shop'] });
    }
  });
}

/** 会话对象上的 spark（服务端给的是原样 JSON，这里整理一下；没有可画的为 null）。 */
export function conversationSpark(conversation: Pick<Conversation, 'spark'> | null | undefined): Spark | null {
  const spark = normalizeSpark(conversation?.spark);
  return sparkWorthShowing(spark) ? spark : null;
}

// ---------------------------------------------------------------- 说明面板

interface SparkUiState {
  friendId: number | null;
  open: (friendId: number) => void;
  close: () => void;
}

/** 说明面板只有一个，由主界面上的 SparkHost 画；入口（会话标题旁的火花、资料卡）只管 open。 */
export const useSparkUi = create<SparkUiState>((set) => ({
  friendId: null,
  open: (friendId) => set({ friendId }),
  close: () => set({ friendId: null })
}));

export function openSpark(friendId: number): void {
  useSparkUi.getState().open(friendId);
}
