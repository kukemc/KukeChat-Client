import type {
  JuryCaseDetail, JuryCaseView, JuryConfig, JuryHistoryItem, JuryMyStats, JuryOpinion, JuryOpinionList, JuryOpinionState, JuryOverview,
  JuryPublicCaseDetail, JuryPublicPage, JuryPublicQuery, JuryStatus, JuryVote, JuryVoteResult, JuryVotesPage, JuryVotesQuery
} from '@/types/jury';
import { apiRequest } from './client';

/**
 * 风纪委员的接口。
 *
 * 上半段是一直就有的接口（docs/moderation-v2.md 第 3 节）；下半段是风纪 v2 一期（docs/jury-v2.md 第 1 节），
 * 旧后端上没有，会返回 404 —— 调用方用 GET /jury/config 的 capabilities 判断能不能用，见 components/jury/data。
 * 二期、三期的接口定稿后接着往下加。
 */

/** 拼查询串：空值不带。jurySenior.ts / juryHall.ts 也用它 */
export function query(params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value));
    }
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

// ───────────────────────── 一直就有 ─────────────────────────

export async function getJuryStatus(): Promise<JuryStatus> {
  return apiRequest<JuryStatus>('/jury/me');
}

export async function applyForJury(statement?: string): Promise<JuryStatus> {
  return apiRequest<JuryStatus>('/jury/apply', { method: 'POST', body: statement ? { statement } : {} });
}

export async function getNextJuryCase(): Promise<JuryCaseView | null> {
  const response = await apiRequest<{ case: JuryCaseView | null }>('/jury/cases/next');
  return response.case ?? null;
}

/** category 只在投违规票时带（二期，可选的类别在 config.categories）；旧后端会忽略它 */
export async function voteJuryCase(caseId: number, vote: JuryVote, note?: string, category?: string | null): Promise<JuryVoteResult> {
  return apiRequest<JuryVoteResult>(`/jury/cases/${caseId}/vote`, { method: 'POST', body: { vote, ...(note ? { note } : {}), ...(category ? { category } : {}) } });
}

/** 最近 50 条自己的投票 */
export async function getJuryHistory(): Promise<JuryHistoryItem[]> {
  return apiRequest<JuryHistoryItem[]>('/jury/history');
}

// ───────────────────────── 风纪 v2 · 一期 ─────────────────────────

export async function getJuryConfig(): Promise<JuryConfig> {
  return apiRequest<JuryConfig>('/jury/config');
}

export async function getJuryOverview(): Promise<JuryOverview> {
  return apiRequest<JuryOverview>('/jury/overview');
}

/** 只有对这个案件投过票的人能读，否则 403 not_voted */
export async function getJuryCase(caseId: number): Promise<JuryCaseDetail> {
  return apiRequest<JuryCaseDetail>(`/jury/cases/${caseId}`);
}

export async function getJuryOpinions(caseId: number): Promise<JuryOpinionList> {
  return apiRequest<JuryOpinionList>(`/jury/cases/${caseId}/opinions`);
}

export async function postJuryOpinion(caseId: number, content: string, parentId?: number | null): Promise<JuryOpinion> {
  return apiRequest<JuryOpinion>(`/jury/cases/${caseId}/opinions`, { method: 'POST', body: parentId ? { content, parent_id: parentId } : { content } });
}

export async function deleteJuryOpinion(opinionId: number): Promise<{ id: number; state: JuryOpinionState }> {
  return apiRequest<{ id: number; state: JuryOpinionState }>(`/jury/opinions/${opinionId}`, { method: 'DELETE' });
}

export async function setJuryOpinionLike(opinionId: number, liked: boolean): Promise<{ id: number; like_count: number; liked: boolean }> {
  return apiRequest<{ id: number; like_count: number; liked: boolean }>(`/jury/opinions/${opinionId}/like`, { method: liked ? 'POST' : 'DELETE' });
}

export async function reportJuryOpinion(opinionId: number, reason: string, details?: string): Promise<{ id: number; state: JuryOpinionState }> {
  return apiRequest<{ id: number; state: JuryOpinionState }>(`/jury/opinions/${opinionId}/report`, { method: 'POST', body: details ? { reason, details } : { reason } });
}

export async function getJuryVotes(params: JuryVotesQuery): Promise<JuryVotesPage> {
  return apiRequest<JuryVotesPage>(`/jury/votes${query({ limit: params.limit, offset: params.offset, state: params.state, outcome: params.outcome, agreed: params.agreed, vote: params.vote?.join(',') })}`);
}

export async function getJuryMyStats(): Promise<JuryMyStats> {
  return apiRequest<JuryMyStats>('/jury/me/stats');
}

export async function getJuryPublicCases(params: JuryPublicQuery): Promise<JuryPublicPage> {
  return apiRequest<JuryPublicPage>(`/jury/public/cases${query({ limit: params.limit, offset: params.offset, kind: params.kind, outcome: params.outcome, category: params.category })}`);
}

/** 没有公示的案件返回 404 */
export async function getJuryPublicCase(caseId: number): Promise<JuryPublicCaseDetail> {
  return apiRequest<JuryPublicCaseDetail>(`/jury/public/cases/${caseId}`);
}
