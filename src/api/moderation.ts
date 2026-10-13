import type { ModerationRules, ModerationStanding, ReportOptions, ReportQuota, ViolationRead } from '@/types/moderation';
import { apiRequest } from './client';

/**
 * @param token 被封禁的账号拿不到正常令牌，登录被拒时服务端会给一个只能查处罚、提申诉的临时令牌，从这里传入。
 */
export async function getModerationStanding(token?: string): Promise<ModerationStanding> {
  return apiRequest<ModerationStanding>('/moderation/me', token ? { token } : {});
}

export async function appealViolation(violationId: number, text: string, token?: string): Promise<ViolationRead> {
  return apiRequest<ViolationRead>(`/moderation/violations/${violationId}/appeal`, { method: 'POST', body: { text }, ...(token ? { token } : {}) });
}

export async function getModerationRules(): Promise<ModerationRules> {
  return apiRequest<ModerationRules>('/moderation/rules');
}

export async function getReportOptions(): Promise<ReportOptions> {
  return apiRequest<ReportOptions>('/reports/options');
}

export async function getReportQuota(): Promise<ReportQuota> {
  return apiRequest<ReportQuota>('/reports/quota');
}

/** 把处置编码（`mute:24`、`ban:permanent` 之类）翻成能直接给用户看的话。 */
export function describePenaltyCode(code: string | null | undefined): string {
  if (!code || code === 'none') return '无';
  if (code === 'notice') return '提醒';
  if (code === 'warning') return '警告';
  const [kind, amount] = code.split(':');
  const label = kind === 'mute' ? '禁言' : kind === 'ban' ? '封禁' : code;
  if (amount === 'permanent') return `永久${label}`;
  const hours = Number(amount);
  if (!Number.isFinite(hours) || hours <= 0) return label;
  return hours % 24 === 0 ? `${label} ${hours / 24} 天` : `${label} ${hours} 小时`;
}
