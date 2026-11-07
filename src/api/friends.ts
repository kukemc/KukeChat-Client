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

/**
 * 「我发出的好友申请」的查询配置，各处共用同一份（staleTime 不一致的话，最短的那个说了算）。
 * 一直算新鲜的：friend.request.* 事件、我自己发申请之后都会让 ['friend-requests'] 失效，断线重连也会重拉。
 * 以前每个会话面板挂着它、15 秒就过期，切一次会话拉一次。
 */
export const outgoingFriendRequestsOptions = {
  queryKey: ['friend-requests', 'outgoing'] as const,
  queryFn: getOutgoingFriendRequests,
  staleTime: Infinity
};

export async function acceptFriendRequest(requestId: number): Promise<FriendRequest> {
  return apiRequest<FriendRequest>(`/friends/requests/${requestId}/accept`, { method: 'POST' });
}

export async function rejectFriendRequest(requestId: number): Promise<FriendRequest> {
  return apiRequest<FriendRequest>(`/friends/requests/${requestId}/reject`, { method: 'POST' });
}

/** 忽略：只对自己生效，申请方仍看到「等待验证」，不会收到任何通知 */
export async function ignoreFriendRequest(requestId: number): Promise<void> {
  await apiRequest<unknown>(`/friends/requests/${requestId}/ignore`, { method: 'POST' });
}

export async function ignoreAllFriendRequests(): Promise<{ ignored: number }> {
  return apiRequest<{ ignored: number }>('/friends/requests/ignore-all', { method: 'POST' });
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
