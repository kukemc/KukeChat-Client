import type { HallBallot, HallComment, HallCommentsPage, HallDeleteResult, HallPost, HallPostDraft, HallPostsPage, HallPostsQuery, HallReportBody, HallReportResult } from '@/types/juryHall';
import { apiRequest } from './client';
import { query } from './jury';

/** 风纪 v2 三期 · 议事厅（docs/jury-v2.md 3.5）。只在后端下发了 hall 能力时才调。 */

export async function getHallPosts(params: HallPostsQuery): Promise<HallPostsPage> {
  return apiRequest<HallPostsPage>(`/jury/hall/posts${query({ limit: params.limit, offset: params.offset, kind: params.kind, status: params.status, sort: params.sort })}`);
}

export async function getHallPost(postId: number): Promise<HallPost> {
  return apiRequest<HallPost>(`/jury/hall/posts/${postId}`);
}

export async function createHallPost(draft: HallPostDraft): Promise<HallPost> {
  return apiRequest<HallPost>('/jury/hall/posts', { method: 'POST', body: draft });
}

/** 作者本人；提案有人表决后不能再改 */
export async function updateHallPost(postId: number, draft: Pick<HallPostDraft, 'title' | 'content'>): Promise<HallPost> {
  return apiRequest<HallPost>(`/jury/hall/posts/${postId}`, { method: 'PUT', body: draft });
}

/** 作者本人。提案还在表决时可以撤回，出结果后不能删（409 post_locked） */
export async function deleteHallPost(postId: number): Promise<HallDeleteResult> {
  return apiRequest<HallDeleteResult>(`/jury/hall/posts/${postId}`, { method: 'DELETE' });
}

/** 提案表决。结束前可以改票 */
export async function voteHallPost(postId: number, vote: HallBallot): Promise<HallPost> {
  return apiRequest<HallPost>(`/jury/hall/posts/${postId}/vote`, { method: 'POST', body: { vote } });
}

export async function getHallComments(postId: number, params: { limit: number; offset: number }): Promise<HallCommentsPage> {
  return apiRequest<HallCommentsPage>(`/jury/hall/posts/${postId}/comments${query(params)}`);
}

export async function createHallComment(postId: number, content: string, parentId?: number | null): Promise<HallComment> {
  return apiRequest<HallComment>(`/jury/hall/posts/${postId}/comments`, { method: 'POST', body: parentId ? { content, parent_id: parentId } : { content } });
}

export async function deleteHallComment(commentId: number): Promise<HallDeleteResult> {
  return apiRequest<HallDeleteResult>(`/jury/hall/comments/${commentId}`, { method: 'DELETE' });
}

/** 返回被举报的目标此刻的状态：举报可能当场让它被折叠 */
export async function reportHallContent(body: HallReportBody): Promise<HallReportResult> {
  return apiRequest<HallReportResult>('/jury/hall/reports', { method: 'POST', body });
}
