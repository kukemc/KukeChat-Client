import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query';
import { create } from 'zustand';
import { ApiError } from '@/api/client';
import {
  getFriendIntimacy,
  getIntimacyFriends,
  getIntimacyHistory,
  getIntimacyRules,
  markFriendBadgesSeen,
  normalizeIntimacyBadges,
  normalizeIntimacyUpdated,
  setFriendBadge
} from '@/api/intimacy';
import { isShopUnavailable, shopErrorCode } from '@/components/shop/data';
import { useKukeStore } from '@/store/kukeStore';
import type { BadgeDisplay, BadgeRef, FriendIntimacy, FriendIntimacyDetail, FriendIntimacyList, IntimacyHistoryDay, IntimacyRules } from '@/types/intimacy';

/**
 * 好友亲密度的数据层：缓存 key、查询、实时事件怎么改缓存、详情弹层开着谁。
 *
 * 规则（GET /intimacy/rules）是开关：值有三种 —— IntimacyRules（接口在）、null（当前连接的服务端没有这个功能，404）、undefined（还没拿到）。
 * 只有确实拿到了、而且 enabled 为 true，入口才出现（useIntimacyEnabled）。enabled 为 false 时已经有的数据照样能看，只是不再涨 ——
 * 这时名字旁的徽章、资料卡上的亲密度也照样画（useIntimacyAvailable），只是排行榜入口、提示收起来。
 *
 * 好友名字旁的徽章不另外请求：整份好友亲密榜（GET /intimacy/friends）就是数据源，按好友 id 查表（useFriendBond）。
 * 实时事件 intimacy.updated 直接把那一行改掉，再把详情标成过期。
 */
export const intimacyKeys = {
  root: ['intimacy'] as const,
  rules: ['intimacy', 'rules'] as const,
  friends: ['intimacy', 'friends'] as const,
  details: ['intimacy', 'friend'] as const,
  detail: (friendId: number) => ['intimacy', 'friend', friendId] as const,
  history: (friendId: number, days: number) => ['intimacy', 'friend', friendId, 'history', days] as const
};

const UNAVAILABLE_RETRY_MS = 10 * 60_000;

async function fetchRules(): Promise<IntimacyRules | null> {
  try {
    return await getIntimacyRules();
  } catch (error) {
    if (isShopUnavailable(error)) {
      return null;
    }
    throw error;
  }
}

export function useIntimacyRules(enabled = true): UseQueryResult<IntimacyRules | null> {
  return useQuery({
    queryKey: intimacyKeys.rules,
    queryFn: fetchRules,
    enabled,
    retry: false,
    staleTime: 5 * 60_000,
    refetchInterval: (query) => (query.state.data === null ? UNAVAILABLE_RETRY_MS : false)
  });
}

/** 服务端有这个功能（不管开没开）：已有的亲密度、徽章照样画。 */
export function useIntimacyAvailable(): boolean {
  const token = useKukeStore((state) => state.token);
  const rules = useIntimacyRules(Boolean(token)).data;
  return rules !== null && rules !== undefined;
}

/** 功能开着：排行榜页签、提示这些入口才出现。 */
export function useIntimacyEnabled(): boolean {
  const token = useKukeStore((state) => state.token);
  return useIntimacyRules(Boolean(token)).data?.enabled === true;
}

/** 我的全部好友的亲密度（好友亲密榜）。功能不存在时不请求。 */
export function useIntimacyFriends(enabled = true): UseQueryResult<FriendIntimacyList> {
  const available = useIntimacyAvailable();
  return useQuery({ queryKey: intimacyKeys.friends, queryFn: getIntimacyFriends, enabled: enabled && available, retry: false, staleTime: 60_000 });
}

/** 我和某个好友那一行；不是好友、功能不在、还没拉到时是 null。名字旁的徽章、资料卡上的一行都用它。 */
export function useFriendBond(userId: number | null | undefined): FriendIntimacy | null {
  const currentUserId = useKukeStore((state) => state.currentUser?.id);
  const query = useIntimacyFriends(Boolean(userId) && userId !== currentUserId);
  if (!userId || !query.data) {
    return null;
  }
  return query.data.items.find((item) => item.friend.id === userId) ?? null;
}

export function useFriendIntimacy(friendId: number | null, enabled = true): UseQueryResult<FriendIntimacyDetail> {
  return useQuery({
    queryKey: intimacyKeys.detail(friendId ?? 0),
    queryFn: () => getFriendIntimacy(friendId ?? 0),
    enabled: enabled && Boolean(friendId),
    retry: false,
    staleTime: 15_000
  });
}

export function useIntimacyHistory(friendId: number, days: number, enabled = true): UseQueryResult<IntimacyHistoryDay[]> {
  return useQuery({ queryKey: intimacyKeys.history(friendId, days), queryFn: () => getIntimacyHistory(friendId, days), enabled, retry: false, staleTime: 60_000, placeholderData: keepPreviousData });
}

function patchFriend(queryClient: QueryClient, friendId: number, patch: (row: FriendIntimacy) => FriendIntimacy): void {
  queryClient.setQueryData<FriendIntimacyList | undefined>(intimacyKeys.friends, (current) => {
    if (!current) {
      return current;
    }
    const items = current.items.map((row) => (row.friend.id === friendId ? patch(row) : row));
    // 亲密度变了名次可能变：按服务端同样的规则重排（亲密度高的在前，一样多先成为好友的在前）
    items.sort((left, right) => right.intimacy - left.intimacy || (left.friends_since ?? '').localeCompare(right.friends_since ?? '') || left.friend.id - right.friend.id);
    return { ...current, items: items.map((row, index) => ({ ...row, rank: index + 1 })) };
  });
}

export function useSetFriendBadge(friendId: number): UseMutationResult<{ display: BadgeDisplay; badge: BadgeRef | null }, Error, BadgeDisplay> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (badge: BadgeDisplay) => setFriendBadge(friendId, badge),
    onSuccess: (result) => {
      patchFriend(queryClient, friendId, (row) => ({ ...row, badge: result.badge }));
      queryClient.setQueryData<FriendIntimacyDetail | undefined>(intimacyKeys.detail(friendId), (current) => (current ? { ...current, display: result.display, badge: result.badge } : current));
    }
  });
}

/** 打开徽章墙时调：「新」标记消掉。只在确实有新徽章时发请求。 */
export function useMarkBadgesSeen(friendId: number): UseMutationResult<number, Error, void> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => markFriendBadgesSeen(friendId),
    onSuccess: () => {
      patchFriend(queryClient, friendId, (row) => ({ ...row, new_badges: 0 }));
    }
  });
}

export function intimacyErrorText(error: unknown): string {
  if (error instanceof ApiError) {
    const code = shopErrorCode(error);
    if (code === 'not_friend') {
      return '你们已经不是好友了';
    }
    if (code === 'badge_locked') {
      return '这个徽章还没有解锁';
    }
  }
  return error instanceof Error && error.message ? error.message : '出了点问题，稍后再试';
}

/**
 * 实时事件（docs/intimacy.md 第 4 节，双方各收一份，按收的人的视角）。src/realtime/client.ts 收到后调这里。
 * intimacy.updated 带着新的亲密度、等级和我挂的那枚徽章：直接改到好友亲密榜那一行里（名字旁的徽章立刻变），详情标成过期。
 * 提示（解锁徽章、升级）由 IntimacyToasts 自己订阅事件。
 */
export function handleIntimacyEvent(queryClient: QueryClient, rawType: string, data: unknown): void {
  if (rawType === 'intimacy.updated') {
    const event = normalizeIntimacyUpdated(data);
    if (!event) {
      return;
    }
    const known = queryClient.getQueryData<FriendIntimacyList>(intimacyKeys.friends)?.items.some((row) => row.friend.id === event.friend_id);
    if (known) {
      patchFriend(queryClient, event.friend_id, (row) => ({ ...row, intimacy: event.intimacy, level: event.level, level_name: event.level_name || row.level_name, today_gained: event.today_gained, badge: event.badge }));
    } else {
      void queryClient.invalidateQueries({ queryKey: intimacyKeys.friends });
    }
    void queryClient.invalidateQueries({ queryKey: intimacyKeys.detail(event.friend_id) });
    return;
  }
  if (rawType === 'intimacy.badge.unlocked') {
    const event = normalizeIntimacyBadges(data);
    if (event) {
      patchFriend(queryClient, event.friend_id, (row) => ({ ...row, badge_count: row.badge_count + event.badges.length, new_badges: row.new_badges + event.badges.length }));
      void queryClient.invalidateQueries({ queryKey: intimacyKeys.detail(event.friend_id) });
    }
    return;
  }
  if (rawType === 'intimacy.level.up' || rawType === 'friendship.deleted' || rawType === 'friend_request.accepted') {
    void queryClient.invalidateQueries({ queryKey: intimacyKeys.friends });
  }
}

/** 断线重连之后：断开期间的变化没收到事件，重拉一遍。 */
export function refreshIntimacyAfterReconnect(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: intimacyKeys.root });
}

// ---------------------------------------------------------------- 详情弹层

interface IntimacyUiState {
  /** 正开着的「我们的友谊」弹层是和谁的 */
  friendId: number | null;
  open: (friendId: number) => void;
  close: () => void;
}

/** 详情弹层只有一个，由主界面上的 IntimacyHost 画；入口（名字旁的徽章、资料卡、亲密榜、提示）只管 open。 */
export const useIntimacyUi = create<IntimacyUiState>((set) => ({
  friendId: null,
  open: (friendId) => set({ friendId }),
  close: () => set({ friendId: null })
}));

export function openIntimacy(friendId: number): void {
  useIntimacyUi.getState().open(friendId);
}
