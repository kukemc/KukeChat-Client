import type { FriendRequest, Friendship, TemporaryConversationBlock } from '@/types/api';
import { apiRequest } from './client';
import { asList } from './normalizers';

export async function getFriends(): Promise<Friendship[]> {
  const response = await apiRequest<unknown>('/friends');
  return asList<Friendship>(response);
}

export async function sendFriendRequest(receiverId: number): Promise<FriendRequest> {
  return apiRequest<FriendRequest>('/friends/requests', {
    method: 'POST',
    body: { receiver_id: receiverId }
  });
}

export async function getIncomingFriendRequests(): Promise<FriendRequest[]> {
  const response = await apiRequest<unknown>('/friends/requests/incoming');
  return asList<FriendRequest>(response);
}

export async function getOutgoingFriendRequests(): Promise<FriendRequest[]> {
  const response = await apiRequest<unknown>('/friends/requests/outgoing');
  return asList<FriendRequest>(response);
}

export async function acceptFriendRequest(requestId: number): Promise<FriendRequest> {
  return apiRequest<FriendRequest>(`/friends/requests/${requestId}/accept`, { method: 'POST' });
}

export async function rejectFriendRequest(requestId: number): Promise<FriendRequest> {
  return apiRequest<FriendRequest>(`/friends/requests/${requestId}/reject`, { method: 'POST' });
}

export async function deleteFriend(friendId: number): Promise<void> {
  await apiRequest<unknown>(`/friends/${friendId}`, { method: 'DELETE' });
}

export async function getTemporaryConversationBlocks(): Promise<TemporaryConversationBlock[]> {
  const response = await apiRequest<unknown>('/friends/temporary-blocks');
  return asList<TemporaryConversationBlock>(response);
}

export async function deleteTemporaryConversationBlock(blockId: number): Promise<void> {
  await apiRequest<unknown>(`/friends/temporary-blocks/${blockId}`, { method: 'DELETE' });
}
