import type { Announcement, AnnouncementReaction, AnnouncementReactionOptions, AnnouncementReactionState } from '@/types/api';
import { ApiError, apiRequest } from './client';
import { asList, isRecord } from './normalizers';

export async function getAnnouncements(): Promise<Announcement[]> {
  const response = await apiRequest<unknown>('/announcements');
  return asList<Announcement>(response);
}

export async function getLatestAnnouncement(): Promise<Announcement | null> {
  return apiRequest<Announcement | null>('/announcements/latest');
}

/** 服务端没下发 `reaction-options` 时用的值，和接口文档里写的一致。 */
export const DEFAULT_ANNOUNCEMENT_REACTION_OPTIONS: AnnouncementReactionOptions = {
  quick: ['👍', '❤️', '😂', '😮', '😢', '🎉', '👀', '🔥'],
  per_user: 5,
  per_announcement: 30,
  per_minute: 20
};

function readReactions(value: unknown): AnnouncementReaction[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const reactions: AnnouncementReaction[] = [];
  for (const item of value) {
    if (isRecord(item) && typeof item.emoji === 'string' && item.emoji && typeof item.count === 'number') {
      reactions.push({ emoji: item.emoji, count: item.count, reacted_by_me: item.reacted_by_me === true });
    }
  }
  return reactions;
}

function readReactionState(announcementId: number, response: unknown): AnnouncementReactionState {
  const record = isRecord(response) ? response : {};
  return { id: typeof record.id === 'number' ? record.id : announcementId, reactions: readReactions(record.reactions) };
}

function readLimit(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

/** 快捷回应和各项上限。还没上这个功能的服务端没有这个接口，退回默认值。 */
export async function getAnnouncementReactionOptions(): Promise<AnnouncementReactionOptions> {
  const fallback = DEFAULT_ANNOUNCEMENT_REACTION_OPTIONS;
  let response: unknown;
  try {
    response = await apiRequest<unknown>('/announcements/reaction-options');
  } catch (error) {
    // 服务端明确拒绝（没有这个接口是 404；老版本要是把它当成公告 id 来解析，会是 405 / 422）就用默认值，不反复重试；
    // 网络不通照常抛出去，下次再问
    if (error instanceof ApiError) {
      return fallback;
    }
    throw error;
  }
  if (!isRecord(response)) {
    return fallback;
  }
  const quick = Array.isArray(response.quick) ? response.quick.filter((emoji): emoji is string => typeof emoji === 'string' && emoji.length > 0) : [];
  return {
    quick: quick.length > 0 ? Array.from(new Set(quick)) : fallback.quick,
    per_user: readLimit(response.per_user, fallback.per_user),
    per_announcement: readLimit(response.per_announcement, fallback.per_announcement),
    per_minute: readLimit(response.per_minute, fallback.per_minute)
  };
}

/** 回应一条公告。开关语义：同一个 emoji 再发一次就是取消。 */
export async function toggleAnnouncementReaction(announcementId: number, emoji: string): Promise<AnnouncementReactionState> {
  const response = await apiRequest<unknown>(`/announcements/${announcementId}/reactions`, {
    method: 'POST',
    body: { emoji }
  });
  return readReactionState(announcementId, response);
}

/** `removeAnnouncementReaction` 的路径里放不放得下这个 emoji：带 URL 保留字符的（#️⃣ 这一类）不行。 */
export function canRemoveAnnouncementReactionByPath(emoji: string): boolean {
  return !/[#?/\\%\s]/.test(emoji);
}

/**
 * 取消自己的一个回应。和上面那个不同的是它不是开关：没回应过也照常返回，不会反过来变成「回应」。
 *
 * 路径里的 emoji 故意不做 encodeURIComponent：发请求时浏览器自己会转义，
 * 而客户端证明（X-Kuke-Proof）要和服务端看到的、解码之后的路径算出同一个值，这里先转义就对不上，会被 403 挡掉。
 * 所以只能用于 `canRemoveAnnouncementReactionByPath` 认可的 emoji。
 */
export async function removeAnnouncementReaction(announcementId: number, emoji: string): Promise<AnnouncementReactionState> {
  const response = await apiRequest<unknown>(`/announcements/${announcementId}/reactions/${emoji}`, { method: 'DELETE' });
  return readReactionState(announcementId, response);
}
