import type { FriendRequest, Friendship } from '@/types/api';

function normalizeId(value?: number | null): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function friendshipMatchesUser(friendship: Friendship, userId?: number | null, currentUserId?: number | null): boolean {
  const targetId = normalizeId(userId);
  if (!targetId || targetId === currentUserId) {
    return false;
  }

  return [
    normalizeId(friendship.friend_id),
    normalizeId(friendship.user_id),
    normalizeId(friendship.friend?.id),
    normalizeId(friendship.user?.id)
  ].some((candidateId) => candidateId === targetId);
}

export function isFriendUserId(friends: Friendship[], userId?: number | null, currentUserId?: number | null): boolean {
  return friends.some((friendship) => friendshipMatchesUser(friendship, userId, currentUserId));
}

export function isPendingOutgoingFriendRequest(request: FriendRequest, userId?: number | null): boolean {
  const targetId = normalizeId(userId);
  if (!targetId || request.status !== 'pending') {
    return false;
  }

  return normalizeId(request.receiver_id) === targetId || normalizeId(request.receiver?.id) === targetId;
}

export function hasPendingOutgoingFriendRequest(requests: FriendRequest[], userId?: number | null): boolean {
  return requests.some((request) => isPendingOutgoingFriendRequest(request, userId));
}
