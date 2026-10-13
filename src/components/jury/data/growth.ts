import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query';
import { ApiError } from '@/api/client';
import { getJuryAchievements, getJuryExam, getJuryLeaderboard, getJuryPoints, getJuryPracticeNext, updateJurySettings } from '@/api/juryGrowth';
import { isRecord } from '@/api/normalizers';
import type { JuryConfig, JuryStatus } from '@/types/jury';
import type { JuryAchievement, JuryExamState, JuryLeaderboard, JuryLeaderboardPeriod, JuryPointsPage, JuryPracticeNext } from '@/types/juryGrowth';
import { syncExamClock } from '../exam/clock';
import { JURY_MAX_BAN_DAYS } from './defaults';
import { juryKeys } from './queries';

/**
 * 二期的查询：考试、练习场、风纪值、成就、排行榜。key 同样挂在 ['jury'] 下面，
 * jury.status.changed 会让它们一起失效；二期自己的实时事件在下面的 handleJuryGrowthEvent 里处理。
 * 每个 useXxx 的 enabled 由调用方按 config.has('…') 给：后端没有这项能力时一个请求都不发。
 */
export const growthKeys = {
  exam: ['jury', 'exam'] as const,
  practice: ['jury', 'practice'] as const,
  points: ['jury', 'points'] as const,
  pointsPage: (limit: number, offset: number) => ['jury', 'points', limit, offset] as const,
  achievements: ['jury', 'achievements'] as const,
  leaderboard: ['jury', 'leaderboard'] as const,
  leaderboardPeriod: (period: JuryLeaderboardPeriod) => ['jury', 'leaderboard', period] as const
};

export function useJuryExam(enabled: boolean): UseQueryResult<JuryExamState> {
  return useQuery({
    queryKey: growthKeys.exam,
    // 考试时钟只在「响应刚到」的这一刻校正：server_time 是那一刻的服务器时间，拿缓存里的旧值去和现在的本机时间比，
    // 会把时钟往回拨（缓存放了多久就拨多久），倒计时显示得比实际多，自动交卷就晚了、整场作废
    queryFn: async () => {
      const exam = await getJuryExam();
      syncExamClock(exam.server_time);
      return exam;
    },
    enabled,
    retry: false,
    staleTime: 30_000
  });
}

/** 练习场的下一题。题目拿到后由页面自己攥着（答完才换），所以这里不自动重拉。 */
export function useJuryPracticeNext(enabled: boolean): UseQueryResult<JuryPracticeNext> {
  return useQuery({ queryKey: growthKeys.practice, queryFn: getJuryPracticeNext, enabled, retry: false, staleTime: Infinity, gcTime: 0 });
}

export function useJuryPoints(limit: number, offset: number, enabled: boolean): UseQueryResult<JuryPointsPage> {
  return useQuery({ queryKey: growthKeys.pointsPage(limit, offset), queryFn: () => getJuryPoints(limit, offset), enabled, retry: false, staleTime: 30_000, placeholderData: keepPreviousData });
}

export function useJuryAchievements(enabled: boolean): UseQueryResult<{ items: JuryAchievement[] }> {
  return useQuery({ queryKey: growthKeys.achievements, queryFn: getJuryAchievements, enabled, retry: false, staleTime: 60_000 });
}

export function useJuryLeaderboard(period: JuryLeaderboardPeriod, enabled: boolean): UseQueryResult<JuryLeaderboard> {
  return useQuery({ queryKey: growthKeys.leaderboardPeriod(period), queryFn: () => getJuryLeaderboard(period), enabled, retry: false, staleTime: 60_000, placeholderData: keepPreviousData });
}

/** 公开 / 不公开委员身份。成功后直接用返回的 JuryStatus 换掉缓存；排行榜上自己那一行也会变。 */
export function useBadgeVisibility(): UseMutationResult<JuryStatus, Error, boolean> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (visible: boolean) => updateJurySettings({ badge_visible: visible }),
    onSuccess: (status) => {
      queryClient.setQueryData(juryKeys.me, status);
      void queryClient.invalidateQueries({ queryKey: growthKeys.leaderboard });
    }
  });
}

/**
 * 二期的实时事件（docs/jury-v2.md 2.10）。src/realtime/client.ts 收到事件后调这里；预览页模拟事件时也调这里。
 * 只负责让缓存跟上；界面上的轻量提示由 growth/GrowthToasts 自己订阅事件。
 */
export function handleJuryGrowthEvent(queryClient: QueryClient, rawType: string, data: unknown): void {
  if (rawType === 'jury.points.changed') {
    const total = isRecord(data) && typeof data.total === 'number' ? data.total : null;
    if (total !== null) {
      // 总数事件里就有，先改上去，明细和排行再重拉
      queryClient.setQueryData<JuryStatus | undefined>(juryKeys.me, (status) => (status ? { ...status, points: total } : status));
    }
    const caseId = isRecord(data) && typeof data.case_id === 'number' ? data.case_id : null;
    if (caseId !== null) {
      void queryClient.invalidateQueries({ queryKey: juryKeys.case(caseId) });
    }
    for (const key of [growthKeys.points, growthKeys.leaderboard, growthKeys.achievements]) {
      void queryClient.invalidateQueries({ queryKey: key });
    }
  }
  if (rawType === 'jury.achievement.earned') {
    void queryClient.invalidateQueries({ queryKey: growthKeys.achievements });
  }
}

/** 服务端错误的 detail 里除了 code / message 之外带的字段（jury_cooldown 的 until、exam_cooldown 的 next_attempt_at）。 */
export function errorField(error: unknown, field: string): string | null {
  if (!(error instanceof ApiError) || !isRecord(error.detail)) {
    return null;
  }
  const detail = isRecord(error.detail.detail) ? error.detail.detail : error.detail;
  const value = detail[field];
  return typeof value === 'string' ? value : null;
}

/** 委员和机器给出的封禁最长多久：「7 天」。读配置里的 max_ban_hours，早期的后端没有这个字段时退回现行值。 */
export function maxBanText(config: JuryConfig): string {
  const hours = config.rules.max_ban_hours;
  if (typeof hours !== 'number' || hours <= 0) {
    return `${JURY_MAX_BAN_DAYS} 天`;
  }
  return hours % 24 === 0 ? `${hours / 24} 天` : `${hours} 小时`;
}
