import { describePenaltyCode } from '@/api/moderation';
import type { AppealReviewType, AppealVote, PanelOriginReason } from '@/types/jurySenior';

// 资深工作台里的枚举文字。普通评审共用的在 ../labels.ts。

export const PANEL_REASON_LABEL: Record<string, string> = { no_consensus: '原审没有共识', need_context: '原审认为上下文不足', timeout: '原审超时' };

export function panelReasonLabel(reason: PanelOriginReason): string {
  return PANEL_REASON_LABEL[reason] ?? '转入合议';
}

export const REVIEW_TYPE_LABEL: Record<AppealReviewType, string> = { appeal: '申诉复审', reconsider: '举报复议' };

/** 复审票的名称。申诉和复议里的「维持」说的不是同一件事，所以分开写 */
export function appealVoteLabel(vote: AppealVote | string, type: AppealReviewType = 'appeal'): string {
  if (vote === 'uphold') return type === 'reconsider' ? '维持原结论' : '维持原处罚';
  if (vote === 'reduce') return '减轻处罚';
  if (vote === 'revoke') return '撤销处罚';
  if (vote === 'overturn') return '改判为违规';
  return vote;
}

export const APPEAL_VOTE_TONE: Record<string, string> = { uphold: '', reduce: 'kui-tag--warn', revoke: 'kui-tag--ok', overturn: 'kui-tag--danger' };

/** 原处罚是谁给的 */
export const PENALTY_SOURCE_LABEL: Record<string, string> = { jury: '委员表决', panel: '资深合议', machine: '机器自动处罚' };

/** { kind: 'mute', hours: 24 } → 「禁言 1 天」 */
export function penaltyLabel(penalty: { kind: string; hours?: number | null } | null | undefined): string {
  if (!penalty) return '—';
  if (penalty.kind === 'none') return '仅处理内容';
  return describePenaltyCode(penalty.hours ? `${penalty.kind}:${penalty.hours}` : penalty.kind);
}

/** 这条处罚有没有带来禁言 / 封禁。没有的话「减轻」不会产生实际变化 */
export function hasRestriction(penalty: { kind: string } | null | undefined): boolean {
  return penalty?.kind === 'mute' || penalty?.kind === 'ban';
}
