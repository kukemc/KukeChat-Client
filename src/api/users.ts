import type { CcwCreatorPage, OnlineCountRead, OnlineUsersRead, PokeOptions, ProfileUpdatePayload, UpdatePresencePayload, UploadResponse, User, UserOnlineStatusRead } from '@/types/api';
import { apiRequest, uploadFile } from './client';
import { asList, isRecord } from './normalizers';

export async function searchUsers(query: string): Promise<User[]> {
  const response = await apiRequest<unknown>(`/users/search?q=${encodeURIComponent(query)}`);
  return asList<User>(response);
}

export async function getRecommendedUsers(): Promise<User[]> {
  const response = await apiRequest<unknown>('/users/recommended');
  return asList<User>(response);
}

export async function getCcwCreators(limit = 30, offset = 0): Promise<CcwCreatorPage> {
  return apiRequest<CcwCreatorPage>(`/users/ccw-creators?limit=${limit}&offset=${offset}`);
}

export async function getUserProfile(userId: number): Promise<User> {
  return apiRequest<User>(`/users/${userId}`);
}

export async function updateMyProfile(payload: ProfileUpdatePayload): Promise<User> {
  return apiRequest<User>('/users/me', {
    method: 'PATCH',
    body: payload
  });
}

export async function getPokeOptions(): Promise<PokeOptions> {
  const response = await apiRequest<unknown>('/users/poke-options');
  const actions = isRecord(response) && Array.isArray(response.actions) ? response.actions.filter((action): action is string => typeof action === 'string' && action.trim().length > 0) : [];
  if (!isRecord(response) || actions.length === 0) {
    // 还没有这个接口的旧服务端会落到别的路由上，返回的不是这个结构
    throw new Error('戳一戳的动作列表暂时不可用');
  }
  const fallback = typeof response.default_action === 'string' && actions.includes(response.default_action) ? response.default_action : actions[0];
  const maxLength = Number(response.suffix_max_length);
  return { actions, default_action: fallback, suffix_max_length: Number.isFinite(maxLength) && maxLength > 0 ? maxLength : 16 };
}

/** 预设很少变，整个会话期间只拉一次。戳一戳的设置本身走 updateMyProfile（poke_action / poke_suffix）。 */
export const pokeOptionsQuery = { queryKey: ['poke-options'], queryFn: getPokeOptions, staleTime: Infinity, gcTime: Infinity, retry: false } as const;

export async function updateMyPresence(payload: UpdatePresencePayload): Promise<User> {
  return apiRequest<User>('/users/me/presence', {
    method: 'PATCH',
    body: payload
  });
}

export async function getOnlineCount(): Promise<number> {
  const response = await apiRequest<OnlineCountRead>('/users/online-count');
  return response.online_count;
}

export async function getOnlineUsers(): Promise<OnlineUsersRead> {
  return apiRequest<OnlineUsersRead>('/users/online');
}

export async function getUserOnlineStatus(userId: number): Promise<UserOnlineStatusRead> {
  return apiRequest<UserOnlineStatusRead>(`/users/${userId}/online`);
}

export async function uploadAvatar(file: File): Promise<UploadResponse> {
  return uploadFile<UploadResponse>('/uploads/avatar', file);
}

export async function uploadProfileCover(file: File): Promise<UploadResponse> {
  return uploadFile<UploadResponse>('/uploads/profile-cover', file);
}
