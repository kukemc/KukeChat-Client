import { ApiError } from '@/api/client';
import type { Conversation, GroupJoinRequest, MemberRole } from '@/types/api';
import { parseApiDate } from '@/utils/dateTime';

/**
 * 入群申请、群邀请链接共用的小工具（KukeChat-Server/docs/chat-features.md 第 14 节）。
 * 桌面端、手机布局、联系人页、聊天里的群名片都用这一份，免得各写各的。
 */

/** 拒绝理由最多多少字（服务端 decision_note 的上限） */
export const JOIN_REJECT_NOTE_MAX = 200;

/** 拒绝理由：去掉首尾空白，空的发 null（服务端按「没填」处理） */
export function normalizeDecisionNote(text: string): string | null {
  const clean = text.trim().slice(0, JOIN_REJECT_NOTE_MAX);
  return clean ? clean : null;
}

/** 被拒绝、而且管理员写了理由时返回理由，否则 null */
export function rejectedNote(request: GroupJoinRequest): string | null {
  return request.status === 'rejected' && request.decision_note?.trim() ? request.decision_note.trim() : null;
}

function requestTime(request: GroupJoinRequest): number {
  const parsed = parseApiDate(request.created_at || request.updated_at)?.getTime() ?? Number.NaN;
  return Number.isFinite(parsed) ? parsed : request.id;
}

/** 申请列表的顺序：待审核的排最前，其余按提交时间从新到旧。服务端已经这样排了，这里兜底（老服务端是反的） */
export function sortGroupJoinRequests(requests: GroupJoinRequest[]): GroupJoinRequest[] {
  return [...requests].sort((left, right) => {
    const pendingDiff = Number(right.status === 'pending') - Number(left.status === 'pending');
    return pendingDiff || requestTime(right) - requestTime(left) || right.id - left.id;
  });
}

/** 群主 / 管理员 */
export function isGroupStaff(role: MemberRole | null | undefined): boolean {
  return role === 'owner' || role === 'admin';
}

/**
 * 我能不能生成这个群的邀请链接 / 群名片：仅邀请的群只有群主和管理员能（普通成员服务端返回 403）。
 * 不知道自己身份的时候（老服务端没带 my_role）先放行，被拒了再按 403 提示。
 */
export function canShareGroupInvite(conversation: Pick<Conversation, 'join_mode' | 'my_role'>, role: MemberRole | null | undefined = conversation.my_role): boolean {
  return conversation.join_mode !== 'invite_only' || role === undefined || role === null || isGroupStaff(role);
}

/** 仅邀请的群里普通成员看到的说明 */
export const INVITE_ONLY_SHARE_HINT = '本群仅限群主或管理员邀请';

/** 生成邀请链接失败时给人看的话 */
export function groupInviteCreateErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 403) {
    return '本群仅限群主或管理员邀请，暂时不能分享邀请链接。';
  }
  return error instanceof Error && error.message ? error.message : '生成邀请链接失败，请稍后重试。';
}

/** 接受邀请失败时给人看的话（服务端的 detail 是英文，按状态码翻成中文） */
export function inviteAcceptErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const detail = error.message;
    if (error.status === 404) return '邀请链接无效或已失效。';
    if (error.status === 403) return '这个群需要群主或管理员邀请才能加入。';
    if (error.status === 422) return /answer/i.test(detail) ? '请先回答入群问题。' : '填写的内容不符合要求，请检查后重试。';
    if (error.status === 409) return /pending/i.test(detail) ? '你已经提交过入群申请，请等待管理员审核。' : '你已经在这个群里了。';
  }
  return error instanceof Error && error.message ? error.message : '加入群聊失败，请稍后重试。';
}

/** 群邀请接受后进入审核时的提示 */
export const INVITE_PENDING_TEXT = '已提交申请，等待管理员审核';
