import type { User } from '@/types/api';
import type { ProfileLikedEvent, ProfileLikeOptions, ProfileLikeReceivedItem, ProfileLikesReceived, ProfileLikeState } from '@/types/profileLikes';
import { apiRequest } from './client';
import { isRecord } from './normalizers';

/**
 * 资料点赞（docs/chat-features.md 第 6 节）。旧后端没有这些接口：GET /users/likes/options 会 404，
 * 调用方（components/likes/data.ts）把它当成「还没开放」，所有点赞相关的界面都不出现。
 *
 * 响应在这里整理成类型里写的形状：数字读不出来的按 0，形状完全不对的直接当成没有这个功能。
 */

/** 接口返回了东西，但不是契约里的样子（旧服务端把这个地址落到了别的路由上）。和 404 一样按「没有这个功能」处理。 */
export class ProfileLikesUnsupportedError extends Error {
  constructor() {
    super('服务器暂不支持资料点赞');
    this.name = 'ProfileLikesUnsupportedError';
  }
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/** 用户对象上的 profile_like_count：不是数字就是没有这个字段（旧后端）。 */
export function readProfileLikeCount(user: User | null | undefined): number | null {
  const value = user?.profile_like_count;
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : null;
}

function isUser(value: unknown): value is User {
  return isRecord(value) && typeof value.id === 'number' && Number.isFinite(value.id);
}

export function normalizeProfileLikeState(value: unknown, userId: number): ProfileLikeState {
  if (!isRecord(value) || typeof value.like_count !== 'number') {
    throw new ProfileLikesUnsupportedError();
  }
  return {
    user_id: typeof value.user_id === 'number' ? value.user_id : userId,
    like_count: count(value.like_count),
    today_count: count(value.today_count),
    liked_today: value.liked_today === true,
    can_like: value.can_like === true,
    left_today: typeof value.left_today === 'number' && Number.isFinite(value.left_today) ? Math.max(0, Math.floor(value.left_today)) : null,
    reason: typeof value.reason === 'string' ? value.reason : null
  };
}

/** 实时事件 user.profile.liked 的 data。读不出赞数时返回 null。 */
export function normalizeProfileLikedEvent(value: unknown): ProfileLikedEvent | null {
  if (!isRecord(value) || typeof value.like_count !== 'number' || !Number.isFinite(value.like_count)) {
    return null;
  }
  return { from_user: isUser(value.from_user) ? value.from_user : null, like_count: count(value.like_count), today_count: count(value.today_count) };
}

/** 上限数字。404（或返回的不是这个结构）表示服务端还没有资料点赞。 */
export async function getProfileLikeOptions(): Promise<ProfileLikeOptions> {
  const response = await apiRequest<unknown>('/users/likes/options');
  const perDay = isRecord(response) ? response.targets_per_day : null;
  if (typeof perDay !== 'number' || !Number.isFinite(perDay) || perDay < 0) {
    throw new ProfileLikesUnsupportedError();
  }
  return { targets_per_day: Math.floor(perDay) };
}

/** 我和这个人之间的点赞状态。用户不存在是 404 user_not_found。 */
export async function getProfileLikeState(userId: number): Promise<ProfileLikeState> {
  return normalizeProfileLikeState(await apiRequest<unknown>(`/users/${userId}/likes`), userId);
}

/** 点一个赞，返回点完之后的状态。失败的错误码见契约 6.3。 */
export async function likeProfile(userId: number): Promise<ProfileLikeState> {
  return normalizeProfileLikeState(await apiRequest<unknown>(`/users/${userId}/likes`, { method: 'POST' }), userId);
}

/** 谁赞了我，按时间倒序。limit 1–50。 */
export async function getReceivedProfileLikes(limit: number, offset: number): Promise<ProfileLikesReceived> {
  const response = await apiRequest<unknown>(`/users/me/likes/received?limit=${limit}&offset=${offset}`);
  if (!isRecord(response) || !Array.isArray(response.items)) {
    throw new ProfileLikesUnsupportedError();
  }
  const items: ProfileLikeReceivedItem[] = [];
  for (const item of response.items) {
    if (isRecord(item) && isUser(item.user)) {
      items.push({ user: item.user, created_at: typeof item.created_at === 'string' ? item.created_at : '', today: item.today === true });
    }
  }
  return { items, total: Math.max(items.length, count(response.total)), today_count: count(response.today_count) };
}
