import type { ReportRead } from '@/types/api';
import type {
  AppealMinePage, AppealReviewView, AppealVoteBody, AppealVoteResult, PanelCaseView, PanelVoteBody, PanelVoteResult, Precedent, PrecedentDetail, PrecedentPage, PrecedentQuery
} from '@/types/jurySenior';
import { apiRequest } from './client';
import { query } from './jury';

/**
 * 风纪 v2 三期：资深合议、申诉复审、判例、举报复议（docs/jury-v2.md 3.1–3.4、3.7）。
 * 这些接口只在后端下发了对应能力（config.capabilities 里的 panel / appeal_review / precedents / reconsider）时才调。
 */

// ───────────────────────── 资深合议 ─────────────────────────

/** 只有资深委员能调，否则 403 not_senior */
export async function getNextPanelCase(): Promise<PanelCaseView | null> {
  const response = await apiRequest<{ case: PanelCaseView | null }>('/jury/panel/next');
  return response.case ?? null;
}

export async function votePanelCase(caseId: number, body: PanelVoteBody): Promise<PanelVoteResult> {
  return apiRequest<PanelVoteResult>(`/jury/panel/${caseId}/vote`, { method: 'POST', body });
}

// ───────────────────────── 申诉复审 ─────────────────────────

export async function getNextAppealReview(): Promise<AppealReviewView | null> {
  const response = await apiRequest<{ review: AppealReviewView | null }>('/jury/appeals/next');
  return response.review ?? null;
}

/** 申诉复审投 uphold / reduce / revoke；举报人复议投 uphold / overturn（overturn 可以带 level 和 category） */
export async function voteAppealReview(reviewId: number, body: AppealVoteBody): Promise<AppealVoteResult> {
  return apiRequest<AppealVoteResult>(`/jury/appeals/${reviewId}/vote`, { method: 'POST', body });
}

export async function getMyAppealReviews(params: { limit: number; offset: number }): Promise<AppealMinePage> {
  return apiRequest<AppealMinePage>(`/jury/appeals/mine${query(params)}`);
}

// ───────────────────────── 判例 ─────────────────────────

export async function getPrecedents(params: PrecedentQuery): Promise<PrecedentPage> {
  return apiRequest<PrecedentPage>(`/jury/precedents${query({ limit: params.limit, offset: params.offset, category: params.category })}`);
}

export async function getPrecedent(precedentId: number): Promise<PrecedentDetail> {
  return apiRequest<PrecedentDetail>(`/jury/precedents/${precedentId}`);
}

/**
 * 资深委员把自己投过票的已定案件标为判例。
 * 传进去的是委员侧的「评审编号」（案件详情里的 case_id）；返回的判例里 case_id 是案件的公开编号，两者不能互相代入。
 */
export async function createPrecedent(reviewCaseId: number, title: string, summary: string): Promise<Precedent> {
  return apiRequest<Precedent>('/jury/precedents', { method: 'POST', body: { case_id: reviewCaseId, title, summary } });
}

export async function updatePrecedent(precedentId: number, title: string, summary: string): Promise<Precedent> {
  return apiRequest<Precedent>(`/jury/precedents/${precedentId}`, { method: 'PUT', body: { title, summary } });
}

/** 撤下判例（作者本人）。同一个案件以后重新标注时会复用这个 id */
export async function deletePrecedent(precedentId: number): Promise<{ id: number; status: string }> {
  return apiRequest<{ id: number; status: string }>(`/jury/precedents/${precedentId}`, { method: 'DELETE' });
}

// ───────────────────────── 举报复议 ─────────────────────────

/** 举报人对「不违规」的结论申请复议，每条举报一次机会 */
export async function reconsiderReport(reportId: number, text: string): Promise<ReportRead> {
  return apiRequest<ReportRead>(`/reports/${reportId}/reconsider`, { method: 'POST', body: { text } });
}
