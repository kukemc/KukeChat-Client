import type { CcwCreatorPage, OnlineCountRead, OnlineUsersRead, ProfileUpdatePayload, UpdatePresencePayload, UploadResponse, User, UserOnlineStatusRead } from '@/types/api';
import { apiRequest, uploadFile } from './client';
import { asList } from './normalizers';

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
