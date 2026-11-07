import type { InviteAcceptPayload, InviteAcceptRead, InviteLinkRead, InviteResolveRead } from '@/types/api';
import { apiRequest } from './client';


export async function createGroupInvite(conversationId: number): Promise<InviteLinkRead> {
  return apiRequest<InviteLinkRead>(`/invites/group/${conversationId}`, { method: 'POST' });
}


export async function createUserInvite(userId: number): Promise<InviteLinkRead> {
  return apiRequest<InviteLinkRead>(`/invites/user/${userId}`, { method: 'POST' });
}


export async function resolveInvite(token: string): Promise<InviteResolveRead> {
  return apiRequest<InviteResolveRead>(`/invites/${encodeURIComponent(token)}`);
}


/** 接受邀请。群邀请要审核时返回 status: pending（已提交入群申请），要答题时 payload 里带 answer */
export async function acceptInvite(token: string, payload?: InviteAcceptPayload): Promise<InviteAcceptRead> {
  return apiRequest<InviteAcceptRead>(`/invites/${encodeURIComponent(token)}/accept`, payload ? { method: 'POST', body: payload } : { method: 'POST' });
}
