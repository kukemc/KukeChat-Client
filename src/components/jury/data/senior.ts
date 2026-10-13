import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { getMyAppealReviews, getNextAppealReview, getNextPanelCase } from '@/api/jurySenior';
import type { JuryConfig } from '@/types/jury';
import type { AppealMinePage, AppealReviewView, JuryPanelRules, JuryReconsiderRules, PanelCaseView } from '@/types/jurySenior';

/**
 * 资深工作台的查询（docs/jury-v2.md 3.1、3.2）。key 都挂在 ['jury', 'senior'] 下：
 * 实时事件 jury.queue.changed 会让这一棵失效（src/realtime/client.ts）。
 */
export const seniorKeys = {
  root: ['jury', 'senior'] as const,
  panelNext: ['jury', 'senior', 'panel'] as const,
  appealNext: ['jury', 'senior', 'appeal'] as const,
  appealsMine: ['jury', 'senior', 'appeals-mine'] as const,
  appealsMinePage: (params: { limit: number; offset: number }) => ['jury', 'senior', 'appeals-mine', params] as const
};

// 契约里写明的现行值，只在配置里缺这一项时兜底（新后端一律以下发的为准）
const PANEL_DEFAULTS: JuryPanelRules = { seats: 3, consensus_votes: 2, timeout_hours: 48 };
const APPEAL_DEFAULTS: JuryPanelRules = { seats: 3, consensus_votes: 2, timeout_hours: 72 };
const RECONSIDER_DEFAULTS: JuryReconsiderRules = { window_days: 7, text_min: 10 };

/** 合议的规则数字：几个席位、几票一致定案、多久没结果转管理员 */
export function panelRules(config: JuryConfig): JuryPanelRules {
  return { ...PANEL_DEFAULTS, ...config.panel };
}

export function appealRules(config: JuryConfig): JuryPanelRules {
  return { ...APPEAL_DEFAULTS, ...config.appeals };
}

export function reconsiderRules(config: JuryConfig): JuryReconsiderRules {
  return { ...RECONSIDER_DEFAULTS, ...config.reconsider };
}

// 和评审台一样：领到的案件在投票前不重新领（staleTime: Infinity），离开页面就丢掉（gcTime: 0）
export function useNextPanelCase(enabled: boolean): UseQueryResult<PanelCaseView | null> {
  return useQuery({ queryKey: seniorKeys.panelNext, queryFn: getNextPanelCase, enabled, retry: false, staleTime: Infinity, gcTime: 0 });
}

export function useNextAppealReview(enabled: boolean): UseQueryResult<AppealReviewView | null> {
  return useQuery({ queryKey: seniorKeys.appealNext, queryFn: getNextAppealReview, enabled, retry: false, staleTime: Infinity, gcTime: 0 });
}

export function useMyAppealReviews(params: { limit: number; offset: number }, enabled: boolean): UseQueryResult<AppealMinePage> {
  return useQuery({ queryKey: seniorKeys.appealsMinePage(params), queryFn: () => getMyAppealReviews(params), enabled, retry: false, staleTime: 30_000, placeholderData: keepPreviousData });
}
