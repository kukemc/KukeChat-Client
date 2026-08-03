import type { InviteAcceptRead, InviteLinkRead, InviteResolveRead } from '@/types/api';
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


export async function acceptInvite(token: string): Promise<InviteAcceptRead> {
  return apiRequest<InviteAcceptRead>(`/invites/${encodeURIComponent(token)}/accept`, { method: 'POST' });
}
