import { keepPreviousData, useInfiniteQuery, useQuery, useQueryClient, type InfiniteData, type QueryClient, type UseInfiniteQueryResult, type UseQueryResult } from '@tanstack/react-query';
import { ApiError } from '@/api/client';
import { getLevelHistory, getLevelLeaderboard, getLevelRules, getMyLevel, getUserLevel, normalizeLevelUpEvent } from '@/api/levels';
import { isRecord } from '@/api/normalizers';
import { patchUserInCaches } from '@/realtime/userPatch';
import { useKukeStore } from '@/store/kukeStore';
import { useLevelStore } from '@/store/levelStore';
import type { LevelHistoryDay, LevelLeaderboard, LevelLeaderboardPeriod, LevelMe, LevelRules, UserLevelCard } from '@/types/level';

/**
 * 账号等级的数据层：缓存 key、查询、实时事件怎么处理。契约：KukeChat-Server 的 docs/account-level.md。
 *
 * 「服务端有没有账号等级」靠 GET /levels/rules 探测，做法和商店一样：值有三种 —— LevelRules（有）、null（接口 404，还没部署）、
 * undefined（还没拿到 / 请求失败）。探测结果和图标的换算表同时写进 store/levelStore：昵称旁的图标读的是那里，
 * 不用每个图标都挂一个查询的观察者。
 *
 * 等级数字本身不在这里：它是用户对象上的 account_level，跟着消息、成员列表一起来。本人升级时由 handleLevelEvent
 * 把所有缓存里自己的那份改掉（realtime/userPatch.ts）。
 */
export const levelKeys = {
  root: ['levels'] as const,
  rules: ['levels', 'rules'] as const,
  me: ['levels', 'me'] as const,
  history: (days: number) => ['levels', 'history', days] as const,
  board: ['levels', 'leaderboard'] as const,
  boardPeriod: (period: LevelLeaderboardPeriod) => ['levels', 'leaderboard', period] as const,
  users: ['levels', 'user'] as const,
  user: (userId: number) => ['levels', 'user', userId] as const
};

function errorCode(error: unknown): string | null {
  if (!(error instanceof ApiError) || !isRecord(error.detail)) {
    return null;
  }
  const detail = isRecord(error.detail.detail) ? error.detail.detail : error.detail;
  return typeof detail.code === 'string' ? detail.code : null;
}

/** 接口在这个后端上不存在（还没部署账号等级）。带错误码的 404（比如 user_not_found）不算。 */
export function isLevelUnavailable(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 404 || error.status === 405 || error.status === 501) && errorCode(error) === null;
}

/** 查的这个人不存在（404 user_not_found）。 */
export function isLevelUserMissing(error: unknown): boolean {
  return errorCode(error) === 'user_not_found';
}

async function fetchRules(): Promise<LevelRules | null> {
  try {
    const rules = await getLevelRules();
    useLevelStore.setState({ available: true, icons: rules.icons });
    return rules;
  } catch (error) {
    if (isLevelUnavailable(error)) {
      useLevelStore.setState({ available: false });
      return null;
    }
    throw error;
  }
}

/** 服务端还没有账号等级时，每隔这么久再探一次；部署之后图标和入口自己出现，不用重启客户端。 */
const UNAVAILABLE_RETRY_MS = 10 * 60_000;

/** 等级规则。data 为 null 表示当前连接的服务端没有账号等级。规则很少变，拿到之后半小时内不重拉。 */
export function useLevelRules(enabled = true): UseQueryResult<LevelRules | null> {
  return useQuery({
    queryKey: levelKeys.rules,
    queryFn: fetchRules,
    enabled,
    retry: false,
    staleTime: 30 * 60_000,
    refetchInterval: (query) => (query.state.data === null ? UNAVAILABLE_RETRY_MS : false)
  });
}

/** 等级页的入口要不要出现：只有确实拿到过规则才出现；404、还没拿到、请求失败都不出现。 */
export function useLevelAvailable(): boolean {
  return useLevelStore((state) => state.available === true);
}

/** 我的等级。等级页开着的时候每分钟重拉一次：今天的在线时长和加成是实时累计的。 */
export function useMyLevel(enabled: boolean, live = false): UseQueryResult<LevelMe> {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: levelKeys.me,
    queryFn: async () => {
      const me = await getMyLevel();
      // 这里拿到的等级比用户对象上的新（那一份是登录、拉消息时带回来的）：对不上就把各处的图标一起改掉
      const userId = useKukeStore.getState().currentUser?.id;
      if (typeof userId === 'number') {
        patchUserInCaches(queryClient, userId, { account_level: me.level });
      }
      return me;
    },
    enabled,
    retry: false,
    staleTime: 30_000,
    refetchInterval: live ? 60_000 : false
  });
}

/** 别人的等级卡（资料卡、个人主页、悬停的小卡片）。 */
export function useUserLevel(userId: number | null | undefined, enabled = true): UseQueryResult<UserLevelCard> {
  return useQuery({
    queryKey: levelKeys.user(userId ?? 0),
    queryFn: () => getUserLevel(userId ?? 0),
    enabled: enabled && typeof userId === 'number' && userId > 0,
    retry: false,
    staleTime: 60_000
  });
}

export function useLevelHistory(days: number, enabled: boolean): UseQueryResult<LevelHistoryDay[]> {
  return useQuery({ queryKey: levelKeys.history(days), queryFn: () => getLevelHistory(days), enabled, retry: false, staleTime: 60_000, placeholderData: keepPreviousData });
}

export const LEADERBOARD_PAGE_SIZE = 50;

/** 排行榜，往下加载。服务端自己缓存 60 秒，这里也不更勤。 */
export function useLevelLeaderboard(period: LevelLeaderboardPeriod, enabled: boolean): UseInfiniteQueryResult<InfiniteData<LevelLeaderboard, number>> {
  return useInfiniteQuery({
    queryKey: levelKeys.boardPeriod(period),
    queryFn: ({ pageParam }) => getLevelLeaderboard(period, LEADERBOARD_PAGE_SIZE, pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) => {
      const loaded = pages.reduce((sum, page) => sum + page.items.length, 0);
      return lastPage.items.length >= LEADERBOARD_PAGE_SIZE && loaded < lastPage.total ? loaded : undefined;
    },
    enabled,
    retry: false,
    staleTime: 60_000
  });
}

/**
 * 实时事件 account.level.up（只发给本人）。src/realtime/client.ts 收到后调这里；预览页模拟事件时也调这里。
 * 新等级事件里就有：先把所有缓存里自己的等级改上去（各处的图标立刻跟着变），等级页的明细、名次再重拉。
 * 庆祝的提示由 LevelUpToasts 自己订阅事件。
 */
export function handleLevelEvent(queryClient: QueryClient, rawType: string, data: unknown): void {
  if (rawType !== 'account.level.up') {
    return;
  }
  const event = normalizeLevelUpEvent(data);
  const userId = useKukeStore.getState().currentUser?.id;
  if (event && typeof userId === 'number') {
    patchUserInCaches(queryClient, userId, { account_level: event.level });
    queryClient.setQueryData<LevelMe | undefined>(levelKeys.me, (current) => (current ? { ...current, level: event.level, icons: event.icons ?? current.icons, active_days: event.active_days ?? current.active_days } : current));
    queryClient.setQueryData<UserLevelCard | undefined>(levelKeys.user(userId), (current) => (current ? { ...current, level: event.level, icons: event.icons ?? current.icons, active_days: event.active_days ?? current.active_days } : current));
  }
  void queryClient.invalidateQueries({ queryKey: levelKeys.me });
  void queryClient.invalidateQueries({ queryKey: levelKeys.board });
  void queryClient.invalidateQueries({ queryKey: levelKeys.users });
  // 升级可能解锁了商店里的东西（「等级够了可以免费领」）：把目录标成过期，下次打开商店、或等级页的奖励那一块时重拉
  void queryClient.invalidateQueries({ queryKey: ['shop', 'overview'] });
  void queryClient.invalidateQueries({ queryKey: ['notifications'] });
}
