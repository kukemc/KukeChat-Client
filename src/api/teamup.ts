import type {
  CcwCreationPreview,
  CreateTeamupCommentPayload,
  SaveTeamupProfilePayload,
  TeamupComment,
  TeamupCommentToggleRead,
  TeamupEvent,
  TeamupProfile,
  TeamupProfileScope,
  TeamupProfileStatus,
  TeamupSkill,
  TeamupSkillStat,
  UploadResponse,
  UpsertTeamupEventPayload,
} from '@/types/api';
import { apiRequest, uploadFile } from './client';
import { asList } from './normalizers';

export interface GetTeamupProfilesOptions {
  scope?: TeamupProfileScope;
  skill?: TeamupSkill | null;
  status?: TeamupProfileStatus | null;
  sort?: 'latest' | 'hot';
  beforeId?: number;
  limit?: number;
  search?: string | null;
}

function buildProfileQuery(options: GetTeamupProfilesOptions = {}): string {
  const params = new URLSearchParams();
  if (options.scope) {
    params.set('scope', options.scope);
  }
  if (options.skill) {
    params.set('skill', options.skill);
  }
  if (options.status) {
    params.set('status', options.status);
  }
  if (options.sort) {
    params.set('sort', options.sort);
  }
  if (options.beforeId) {
    params.set('before_id', String(options.beforeId));
  }
  if (options.limit) {
    params.set('limit', String(options.limit));
  }
  if (options.search && options.search.trim()) {
    params.set('search', options.search.trim());
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

export async function getCurrentTeamupEvent(): Promise<TeamupEvent | null> {
  return apiRequest<TeamupEvent | null>('/teamup/event/current');
}

export async function getTeamupSkillStats(): Promise<TeamupSkillStat[]> {
  const response = await apiRequest<unknown>('/teamup/skills');
  return asList<TeamupSkillStat>(response);
}

export async function getTeamupProfiles(options: GetTeamupProfilesOptions = {}): Promise<TeamupProfile[]> {
  const response = await apiRequest<unknown>(`/teamup/profiles${buildProfileQuery(options)}`);
  return asList<TeamupProfile>(response);
}

export async function getMyTeamupProfile(): Promise<TeamupProfile | null> {
  return apiRequest<TeamupProfile | null>('/teamup/profiles/me');
}

export async function getTeamupProfile(profileId: number): Promise<TeamupProfile> {
  return apiRequest<TeamupProfile>(`/teamup/profiles/${profileId}`);
}

export async function saveMyTeamupProfile(payload: SaveTeamupProfilePayload): Promise<TeamupProfile> {
  return apiRequest<TeamupProfile>('/teamup/profiles/me', { method: 'PUT', body: payload });
}

export async function closeMyTeamupProfile(): Promise<TeamupProfile> {
  return apiRequest<TeamupProfile>('/teamup/profiles/me/close', { method: 'POST' });
}

export async function reopenMyTeamupProfile(): Promise<TeamupProfile> {
  return apiRequest<TeamupProfile>('/teamup/profiles/me/reopen', { method: 'POST' });
}

export async function deleteMyTeamupProfile(): Promise<void> {
  await apiRequest<unknown>('/teamup/profiles/me', { method: 'DELETE' });
}

export async function getTeamupComments(profileId: number): Promise<TeamupComment[]> {
  const response = await apiRequest<unknown>(`/teamup/profiles/${profileId}/comments`);
  return asList<TeamupComment>(response);
}

export async function createTeamupComment(profileId: number, payload: CreateTeamupCommentPayload): Promise<TeamupComment> {
  return apiRequest<TeamupComment>(`/teamup/profiles/${profileId}/comments`, { method: 'POST', body: payload });
}

export async function toggleTeamupCommentLike(profileId: number, commentId: number): Promise<TeamupCommentToggleRead> {
  return apiRequest<TeamupCommentToggleRead>(`/teamup/profiles/${profileId}/comments/${commentId}/like`, { method: 'POST' });
}

export async function deleteTeamupComment(profileId: number, commentId: number): Promise<void> {
  await apiRequest<unknown>(`/teamup/profiles/${profileId}/comments/${commentId}`, { method: 'DELETE' });
}

export async function uploadTeamupImage(file: File): Promise<UploadResponse> {
  return uploadFile<UploadResponse>('/uploads/teamup-image', file);
}

export async function getTeamupCreationPreview(oid: string, accessKey?: string): Promise<CcwCreationPreview> {
  const suffix = accessKey ? `?accessKey=${encodeURIComponent(accessKey)}` : '';
  return apiRequest<CcwCreationPreview>(`/ccw/creations/${oid}${suffix}`);
}

export async function getTeamupEvents(): Promise<TeamupEvent[]> {
  const response = await apiRequest<unknown>('/teamup/admin/events');
  return asList<TeamupEvent>(response);
}

export async function createTeamupEvent(payload: UpsertTeamupEventPayload): Promise<TeamupEvent> {
  return apiRequest<TeamupEvent>('/teamup/admin/events', { method: 'POST', body: payload });
}

export async function updateTeamupEvent(eventId: number, payload: UpsertTeamupEventPayload): Promise<TeamupEvent> {
  return apiRequest<TeamupEvent>(`/teamup/admin/events/${eventId}`, { method: 'PUT', body: payload });
}
