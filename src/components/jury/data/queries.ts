import { useEffect, useMemo } from 'react';
import { keepPreviousData, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { ApiError } from '@/api/client';
import { getJuryCase, getJuryConfig, getJuryHistory, getJuryMyStats, getJuryOpinions, getJuryOverview, getJuryPublicCase, getJuryPublicCases, getJuryStatus, getJuryVotes } from '@/api/jury';
import { getModerationRules } from '@/api/moderation';
import { isRecord } from '@/api/normalizers';
import type { JuryCapability, JuryCaseDetail, JuryConfig, JuryHistoryItem, JuryMyStats, JuryOpinionList, JuryOverview, JuryPublicCaseDetail, JuryPublicPage, JuryPublicQuery, JuryStatus, JuryVotesPage, JuryVotesQuery } from '@/types/jury';
import type { ModerationRules } from '@/types/moderation';
import { seniorQueueCount } from '../identity';
import { LEGACY_JURY_CONFIG } from './defaults';

/**
 * 风纪页所有查询的缓存 key。全部挂在 ['jury'] 下面：实时事件 jury.status.changed 会整棵失效（src/realtime/client.ts）。
 * 新增查询时在这里加 key，再在下面加一个 useXxx。
 */
export const juryKeys = {
  root: ['jury'] as const,
  me: ['jury', 'me'] as const,
  config: ['jury', 'config'] as const,
  overview: ['jury', 'overview'] as const,
  next: ['jury', 'next'] as const,
  case: (caseId: number) => ['jury', 'case', caseId] as const,
  opinions: (caseId: number) => ['jury', 'opinions', caseId] as const,
  votes: ['jury', 'votes'] as const,
  votesPage: (params: JuryVotesQuery) => ['jury', 'votes', params] as const,
  stats: ['jury', 'stats'] as const,
  history: ['jury', 'history'] as const,
  publicCases: ['jury', 'public'] as const,
  publicPage: (params: JuryPublicQuery) => ['jury', 'public', params] as const,
  publicCase: (caseId: number) => ['jury', 'public-case', caseId] as const
};

export const moderationRulesKey = ['moderation', 'rules'] as const;

/** 服务端错误里的 detail.code（not_voted、jury_daily_limit …），没有就是 null。 */
export function errorCode(error: unknown): string | null {
  if (!(error instanceof ApiError) || !isRecord(error.detail)) {
    return null;
  }
  const detail = isRecord(error.detail.detail) ? error.detail.detail : error.detail;
  return typeof detail.code === 'string' ? detail.code : null;
}

export function errorStatus(error: unknown): number | null {
  return error instanceof ApiError ? error.status : null;
}

/** 接口在这个后端上不存在（旧后端还没有风纪 v2）。和「出错了」分开处理：显示成「尚未开放」，不是报错。 */
export function isUnavailable(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 404 || error.status === 405 || error.status === 501) && errorCode(error) === null;
}

export function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * /jury/me 至少隔这么久才会被「顺手」重拉一次（进入风纪页、窗口重新获得焦点）。
 * 和服务端 jury.queue.changed 的节流窗口一样长：那个事件 30 秒内只发第一次，后面的变化不补发，所以角标不能只靠它。
 */
const STATUS_MIN_INTERVAL = 30_000;

export function useJuryStatus(enabled = true): UseQueryResult<JuryStatus> {
  // refetchOnMount：进入风纪页时如果手里的数据超过最小间隔就重拉（应用的全局默认值可能被改，这里写明）
  return useQuery({ queryKey: juryKeys.me, queryFn: getJuryStatus, enabled, retry: false, staleTime: STATUS_MIN_INTERVAL, refetchOnMount: true });
}

export interface JuryConfigState {
  config: JuryConfig;
  /** 还没拿到结果：此时 config 是兜底值，能力一律按「没有」算，界面应当等一下再判断 */
  loading: boolean;
  has: (capability: JuryCapability) => boolean;
}

/** 规则数字和后端能力。接口不存在时退回现行值 + 空能力列表，其它错误也一样（不让配置拉不到拖垮整个页面）。 */
export function useJuryConfig(): JuryConfigState {
  const query = useQuery({
    queryKey: juryKeys.config,
    queryFn: async () => {
      try {
        return await getJuryConfig();
      } catch (error) {
        if (isUnavailable(error)) {
          return LEGACY_JURY_CONFIG;
        }
        throw error;
      }
    },
    retry: false,
    staleTime: 10 * 60_000
  });
  const config = query.data ?? LEGACY_JURY_CONFIG;
  return useMemo(() => {
    const capabilities = new Set(config.capabilities);
    return { config, loading: query.isLoading, has: (capability: JuryCapability) => capabilities.has(capability) };
  }, [config, query.isLoading]);
}

export function useModerationRules(): UseQueryResult<ModerationRules> {
  return useQuery({ queryKey: moderationRulesKey, queryFn: getModerationRules, retry: false, staleTime: 10 * 60_000 });
}

export function useJuryOverview(enabled: boolean): UseQueryResult<JuryOverview> {
  return useQuery({ queryKey: juryKeys.overview, queryFn: getJuryOverview, enabled, retry: false, staleTime: 60_000 });
}

export function useJuryCase(caseId: number | null, enabled = true): UseQueryResult<JuryCaseDetail> {
  return useQuery({ queryKey: juryKeys.case(caseId ?? 0), queryFn: () => getJuryCase(caseId ?? 0), enabled: enabled && caseId !== null, retry: false, staleTime: 30_000 });
}

export function useJuryOpinions(caseId: number, enabled: boolean): UseQueryResult<JuryOpinionList> {
  return useQuery({ queryKey: juryKeys.opinions(caseId), queryFn: () => getJuryOpinions(caseId), enabled, retry: false, staleTime: 30_000 });
}

export function useJuryVotes(params: JuryVotesQuery, enabled: boolean): UseQueryResult<JuryVotesPage> {
  return useQuery({ queryKey: juryKeys.votesPage(params), queryFn: () => getJuryVotes(params), enabled, retry: false, staleTime: 30_000, placeholderData: keepPreviousData });
}

export function useJuryMyStats(enabled: boolean): UseQueryResult<JuryMyStats> {
  return useQuery({ queryKey: juryKeys.stats, queryFn: getJuryMyStats, enabled, retry: false, staleTime: 60_000 });
}

/** 最近 50 条（旧接口）。完整历史接口不可用时退回它。 */
export function useJuryHistory(enabled: boolean): UseQueryResult<JuryHistoryItem[]> {
  return useQuery({ queryKey: juryKeys.history, queryFn: getJuryHistory, enabled, retry: false, staleTime: 30_000 });
}

export function useJuryPublicCases(params: JuryPublicQuery, enabled: boolean): UseQueryResult<JuryPublicPage> {
  return useQuery({ queryKey: juryKeys.publicPage(params), queryFn: () => getJuryPublicCases(params), enabled, retry: false, staleTime: 60_000, placeholderData: keepPreviousData });
}

export function useJuryPublicCase(caseId: number | null): UseQueryResult<JuryPublicCaseDetail> {
  return useQuery({ queryKey: juryKeys.publicCase(caseId ?? 0), queryFn: () => getJuryPublicCase(caseId ?? 0), enabled: caseId !== null, retry: false, staleTime: 60_000 });
}

/** 导航栏「风纪」入口上的数字：在任委员当前可评审的案件数，资深委员再加上等他合议 / 复审的件数；其他人恒为 0。 */
export function useJuryPendingCount(enabled: boolean): number {
  const queryClient = useQueryClient();
  const status = useJuryStatus(enabled).data;
  const active = enabled && status?.status === 'active';

  // 窗口重新获得焦点时补拉一次。只有在任委员需要（别人没有角标，资格变化另有 jury.status.changed），并且受最小间隔限制
  useEffect(() => {
    if (!active) {
      return undefined;
    }
    function refresh(): void {
      const state = queryClient.getQueryState(juryKeys.me);
      const updatedAt = Math.max(state?.dataUpdatedAt ?? 0, state?.errorUpdatedAt ?? 0);
      if (document.visibilityState === 'visible' && state?.fetchStatus !== 'fetching' && Date.now() - updatedAt >= STATUS_MIN_INTERVAL) {
        void queryClient.invalidateQueries({ queryKey: juryKeys.me });
      }
    }
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [active, queryClient]);

  return status?.status === 'active' ? Math.max(0, status.available_cases ?? 0) + seniorQueueCount(status) : 0;
}
