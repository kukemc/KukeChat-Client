import type { Conversation, ConversationMember, CreateDirectPayload, CreateGroupAnnouncementPayload, CreateGroupJoinRequestPayload, CreateGroupPayload, GroupAnnouncement, GroupCheckin, GroupCheckinStatus, GroupJoinRequest, GroupJoinRequestDecisionPayload, GroupLeaderboard, GroupLeaderboardPeriod, GroupLeaderboardType, MemberRole, UpdateConversationProfilePayload, UpdateGroupAnnouncementPayload, UpdateGroupSettingsPayload, UpdateMyConversationSettingsPayload, UploadResponse } from '@/types/api';
import { apiRequest, uploadFile } from './client';
import { asList, isRecord, pickNumber } from './normalizers';

export interface ConversationMembersPage {
  items: ConversationMember[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

export async function getConversations(): Promise<Conversation[]> {
  const response = await apiRequest<unknown>('/conversations');
  return asList<Conversation>(response);
}

export async function createDirectConversation(payload: CreateDirectPayload): Promise<Conversation> {
  return apiRequest<Conversation>('/conversations/direct', {
    method: 'POST',
    body: payload
  });
}

export async function closeTemporaryConversation(conversationId: number): Promise<void> {
  await apiRequest<unknown>(`/conversations/${conversationId}/temporary/close`, { method: 'POST' });
}

export async function blockTemporaryConversation(conversationId: number): Promise<void> {
  await apiRequest<unknown>(`/conversations/${conversationId}/temporary/block`, { method: 'POST' });
}

export async function createGroupConversation(payload: CreateGroupPayload): Promise<Conversation> {
  return apiRequest<Conversation>('/conversations/groups', {
    method: 'POST',
    body: payload
  });
}

export async function searchGroups(query: string): Promise<Conversation[]> {
  const response = await apiRequest<unknown>(`/conversations/groups/search?q=${encodeURIComponent(query)}`);
  return asList<Conversation>(response);
}

export async function getRecommendedGroups(): Promise<Conversation[]> {
  const response = await apiRequest<unknown>('/conversations/groups/recommended');
  return asList<Conversation>(response);
}

export async function joinGroup(conversationId: number): Promise<Conversation> {
  return apiRequest<Conversation>(`/conversations/${conversationId}/join`, { method: 'POST' });
}

export async function createGroupJoinRequest(conversationId: number, payload: CreateGroupJoinRequestPayload): Promise<GroupJoinRequest> {
  return apiRequest<GroupJoinRequest>(`/conversations/${conversationId}/join-requests`, {
    method: 'POST',
    body: payload
  });
}

export async function getIncomingGroupJoinRequests(): Promise<GroupJoinRequest[]> {
  const response = await apiRequest<unknown>('/conversations/join-requests/incoming');
  return asList<GroupJoinRequest>(response);
}

export async function getOutgoingGroupJoinRequests(): Promise<GroupJoinRequest[]> {
  const response = await apiRequest<unknown>('/conversations/join-requests/outgoing');
  return asList<GroupJoinRequest>(response);
}

export async function acceptGroupJoinRequest(requestId: number, payload: GroupJoinRequestDecisionPayload = {}): Promise<GroupJoinRequest> {
  return apiRequest<GroupJoinRequest>(`/conversations/join-requests/${requestId}/accept`, {
    method: 'POST',
    body: payload
  });
}

export async function rejectGroupJoinRequest(requestId: number, payload: GroupJoinRequestDecisionPayload = {}): Promise<GroupJoinRequest> {
  return apiRequest<GroupJoinRequest>(`/conversations/join-requests/${requestId}/reject`, {
    method: 'POST',
    body: payload
  });
}

export async function updateConversationProfile(conversationId: number, payload: UpdateConversationProfilePayload): Promise<Conversation> {
  return apiRequest<Conversation>(`/conversations/${conversationId}/profile`, {
    method: 'PATCH',
    body: payload
  });
}

export async function uploadConversationAvatar(file: File): Promise<UploadResponse> {
  return uploadFile<UploadResponse>('/uploads/avatar', file);
}

export async function updateGroupSettings(conversationId: number, payload: UpdateGroupSettingsPayload): Promise<Conversation> {
  return apiRequest<Conversation>(`/conversations/${conversationId}/settings`, {
    method: 'PATCH',
    body: payload
  });
}

export async function getConversationMembers(conversationId: number): Promise<ConversationMember[]> {
  const response = await apiRequest<unknown>(`/conversations/${conversationId}/members`, { cache: 'no-store' });
  return asList<ConversationMember>(response);
}

export async function getConversationMembersPage(conversationId: number, params: { limit?: number; offset?: number; search?: string } = {}): Promise<ConversationMembersPage> {
  const searchParams = new URLSearchParams();
  searchParams.set('limit', String(params.limit ?? 20));
  searchParams.set('offset', String(params.offset ?? 0));
  if (params.search?.trim()) {
    searchParams.set('search', params.search.trim());
  }
  const response = await apiRequest<unknown>(`/conversations/${conversationId}/members?${searchParams.toString()}`, { cache: 'no-store' });
  const items = asList<ConversationMember>(response);
  const total = pickNumber(response, 'total') ?? items.length;
  const limit = pickNumber(response, 'limit') ?? params.limit ?? 20;
  const offset = pickNumber(response, 'offset') ?? params.offset ?? 0;
  const hasMore = isRecord(response) && typeof response.has_more === 'boolean' ? response.has_more : offset + items.length < total;
  return { items, total, limit, offset, has_more: hasMore };
}

export async function searchConversationMembers(conversationId: number, query: string, limit = 12): Promise<ConversationMember[]> {
  const searchParams = new URLSearchParams();
  searchParams.set('q', query.trim());
  searchParams.set('limit', String(limit));
  const response = await apiRequest<unknown>(`/conversations/${conversationId}/members/search?${searchParams.toString()}`, { cache: 'no-store' });
  return asList<ConversationMember>(response);
}

export async function getGroupCheckinStatus(conversationId: number): Promise<GroupCheckinStatus> {
  return apiRequest<GroupCheckinStatus>(`/conversations/${conversationId}/checkin/me`);
}

export async function checkinGroup(conversationId: number, message?: string): Promise<GroupCheckin> {
  return apiRequest<GroupCheckin>(`/conversations/${conversationId}/checkin`, {
    method: 'POST',
    body: { message: message?.trim() || null }
  });
}

export async function getGroupLeaderboard(conversationId: number, type: GroupLeaderboardType = 'activity', period: GroupLeaderboardPeriod = 'all'): Promise<GroupLeaderboard> {
  return apiRequest<GroupLeaderboard>(`/conversations/${conversationId}/leaderboard?type=${encodeURIComponent(type)}&period=${encodeURIComponent(period)}`);
}

export async function updateConversationAnnouncement(conversationId: number, announcement: string): Promise<Conversation> {
  return apiRequest<Conversation>(`/conversations/${conversationId}/announcement`, {
    method: 'PATCH',
    body: { announcement }
  });
}

export async function getGroupAnnouncements(conversationId: number): Promise<GroupAnnouncement[]> {
  const response = await apiRequest<unknown>(`/conversations/${conversationId}/announcements`);
  return asList<GroupAnnouncement>(response);
}

export async function createGroupAnnouncement(conversationId: number, payload: CreateGroupAnnouncementPayload): Promise<GroupAnnouncement> {
  return apiRequest<GroupAnnouncement>(`/conversations/${conversationId}/announcements`, {
    method: 'POST',
    body: payload
  });
}

export async function deleteGroupAnnouncement(conversationId: number, announcementId: number): Promise<void> {
  await apiRequest<unknown>(`/conversations/${conversationId}/announcements/${announcementId}`, { method: 'DELETE' });
}

export async function updateGroupAnnouncement(conversationId: number, announcementId: number, payload: UpdateGroupAnnouncementPayload): Promise<GroupAnnouncement> {
  return apiRequest<GroupAnnouncement>(`/conversations/${conversationId}/announcements/${announcementId}`, {
    method: 'PATCH',
    body: payload
  });
}

export async function updateConversationMemberRole(conversationId: number, userId: number, role: MemberRole): Promise<ConversationMember> {
  return apiRequest<ConversationMember>(`/conversations/${conversationId}/members/${userId}/role`, {
    method: 'PATCH',
    body: { role }
  });
}

export async function getConversationMember(conversationId: number, userId: number): Promise<ConversationMember> {
  return apiRequest<ConversationMember>(`/conversations/${conversationId}/members/${userId}`, { cache: 'no-store' });
}

export async function updateConversationMemberMute(conversationId: number, userId: number, muted: boolean, mutedUntil?: string | null): Promise<ConversationMember> {
  return apiRequest<ConversationMember>(`/conversations/${conversationId}/members/${userId}/mute`, {
    method: 'PATCH',
    body: { muted, muted_until: mutedUntil ?? null }
  });
}

export async function updateConversationMemberTitle(conversationId: number, userId: number, title: string | null): Promise<ConversationMember> {
  return apiRequest<ConversationMember>(`/conversations/${conversationId}/members/${userId}/title`, {
    method: 'PATCH',
    body: { title }
  });
}

export async function updateMyConversationSettings(conversationId: number, payload: UpdateMyConversationSettingsPayload): Promise<ConversationMember> {
  return apiRequest<ConversationMember>(`/conversations/${conversationId}/members/me/settings`, {
    method: 'PATCH',
    body: payload
  });
}

export async function addConversationMembers(conversationId: number, memberIds: number[]): Promise<ConversationMember[]> {
  const response = await apiRequest<unknown>(`/conversations/${conversationId}/members`, {
    method: 'POST',
    body: { user_ids: memberIds }
  });
  return asList<ConversationMember>(response);
}

export async function removeConversationMember(conversationId: number, userId: number): Promise<void> {
  await apiRequest<unknown>(`/conversations/${conversationId}/members/${userId}`, { method: 'DELETE' });
}

export async function clearConversationHistory(conversationId: number): Promise<void> {
  await apiRequest<unknown>(`/conversations/${conversationId}/clear`, { method: 'POST' });
}

export async function leaveConversation(conversationId: number): Promise<void> {
  await apiRequest<unknown>(`/conversations/${conversationId}/members/me`, { method: 'DELETE' });
}

export async function dissolveConversation(conversationId: number): Promise<void> {
  await apiRequest<unknown>(`/conversations/${conversationId}`, { method: 'DELETE' });
}
