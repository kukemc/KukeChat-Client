import { ApiError, apiRequest } from './client';
import { asList, isRecord } from './normalizers';
import type { Message, User } from '@/types/api';
import type {
  AnnouncementCardInfo,
  AnnouncementConfirmations,
  AnnouncementConfirmStatus,
  GroupAnnouncement,
  GroupAnnouncementImage,
  GroupAnnouncementPayload
} from '@/types/groupAnnouncement';

// 群公告 v2 的接口封装，契约见 KukeChat-Server/docs/group-announcements.md

export const ANNOUNCEMENT_MAX_LENGTH = 600;
export const ANNOUNCEMENT_MAX_IMAGES = 9;
export const ANNOUNCEMENT_CARD_EVENT = 'group.announcement.card';

function base(conversationId: number): string {
  return `/conversations/${conversationId}/announcements`;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeImages(value: unknown): GroupAnnouncementImage[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const images: GroupAnnouncementImage[] = [];
  for (const item of value) {
    if (typeof item === 'string' && item) {
      images.push({ url: item, thumbnail_url: null });
    } else if (isRecord(item) && typeof item.url === 'string' && item.url) {
      images.push({ url: item.url, thumbnail_url: str(item.thumbnail_url) });
    }
  }
  return images;
}

/** 把接口返回的公告补齐成完整对象：旧后端没有的字段按「没开」处理，不让界面到处判空。 */
export function normalizeAnnouncement(raw: unknown): GroupAnnouncement | null {
  if (!isRecord(raw) || typeof raw.id !== 'number') {
    return null;
  }
  const author = isRecord(raw.author) && typeof raw.author.id === 'number' ? raw.author as unknown as User : null;
  return {
    id: raw.id,
    conversation_id: num(raw.conversation_id),
    author_id: typeof raw.author_id === 'number' ? raw.author_id : null,
    author,
    author_display_name: str(raw.author_display_name),
    content: typeof raw.content === 'string' ? raw.content : '',
    images: normalizeImages(raw.images),
    pinned: raw.pinned === true,
    pinned_at: str(raw.pinned_at),
    popup: raw.popup === true,
    require_confirm: raw.require_confirm === true,
    send_to_new_members: raw.send_to_new_members === true,
    guide_nickname: raw.guide_nickname === true,
    created_at: typeof raw.created_at === 'string' ? raw.created_at : '',
    updated_at: typeof raw.updated_at === 'string' ? raw.updated_at : '',
    edited_at: str(raw.edited_at),
    confirmed_count: num(raw.confirmed_count),
    member_count: num(raw.member_count),
    // 旧后端没有这两个字段：当作看过，免得每条都挂着「未读」
    my_seen: raw.my_seen === undefined ? true : raw.my_seen === true,
    my_confirmed: raw.my_confirmed === true
  };
}

function normalizeList(raw: unknown): GroupAnnouncement[] {
  return asList<unknown>(raw).map(normalizeAnnouncement).filter((item): item is GroupAnnouncement => item !== null);
}

function requireAnnouncement(raw: unknown): GroupAnnouncement {
  const announcement = normalizeAnnouncement(raw);
  if (!announcement) {
    throw new Error('公告数据格式不对');
  }
  return announcement;
}

export async function listGroupAnnouncements(conversationId: number): Promise<GroupAnnouncement[]> {
  return normalizeList(await apiRequest<unknown>(base(conversationId)));
}

export async function listAnnouncementPopups(conversationId: number): Promise<GroupAnnouncement[]> {
  return normalizeList(await apiRequest<unknown>(`${base(conversationId)}/popups`));
}

export async function getGroupAnnouncement(conversationId: number, announcementId: number): Promise<GroupAnnouncement> {
  return requireAnnouncement(await apiRequest<unknown>(`${base(conversationId)}/${announcementId}`));
}

export async function createGroupAnnouncement(conversationId: number, payload: GroupAnnouncementPayload): Promise<GroupAnnouncement> {
  return requireAnnouncement(await apiRequest<unknown>(base(conversationId), { method: 'POST', body: payload }));
}

export async function updateGroupAnnouncement(conversationId: number, announcementId: number, payload: GroupAnnouncementPayload): Promise<GroupAnnouncement> {
  return requireAnnouncement(await apiRequest<unknown>(`${base(conversationId)}/${announcementId}`, { method: 'PATCH', body: payload }));
}

export async function deleteGroupAnnouncement(conversationId: number, announcementId: number): Promise<void> {
  await apiRequest<unknown>(`${base(conversationId)}/${announcementId}`, { method: 'DELETE' });
}

export async function markAnnouncementSeen(conversationId: number, announcementId: number): Promise<void> {
  await apiRequest<unknown>(`${base(conversationId)}/${announcementId}/seen`, { method: 'POST' });
}

export async function confirmAnnouncement(conversationId: number, announcementId: number): Promise<GroupAnnouncement> {
  return requireAnnouncement(await apiRequest<unknown>(`${base(conversationId)}/${announcementId}/confirm`, { method: 'POST' }));
}

export async function getAnnouncementConfirmations(conversationId: number, announcementId: number, status: AnnouncementConfirmStatus, offset: number, limit = 50): Promise<AnnouncementConfirmations> {
  const params = new URLSearchParams({ status, limit: String(limit), offset: String(offset) });
  const raw = await apiRequest<unknown>(`${base(conversationId)}/${announcementId}/confirmations?${params.toString()}`);
  const record = isRecord(raw) ? raw : {};
  return {
    announcement_id: num(record.announcement_id, announcementId),
    status,
    member_count: num(record.member_count),
    confirmed_count: num(record.confirmed_count),
    unconfirmed_count: num(record.unconfirmed_count),
    items: asList<AnnouncementConfirmations['items'][number]>(record.items),
    limit: num(record.limit, limit),
    offset: num(record.offset, offset),
    has_more: record.has_more === true
  };
}

/** 错误的 code（detail 是 { code, message } 时）。 */
export function announcementErrorCode(error: unknown): string | null {
  if (!(error instanceof ApiError) || !isRecord(error.detail)) {
    return null;
  }
  const detail = isRecord(error.detail.detail) ? error.detail.detail : error.detail;
  return typeof detail.code === 'string' ? detail.code : null;
}

/** 给用户看的失败原因：带 code 的 message 是服务端写好的中文，直接用。 */
export function describeAnnouncementError(error: unknown, fallback: string): string {
  if (announcementErrorCode(error) && error instanceof Error && error.message) {
    return error.message;
  }
  if (error instanceof ApiError && error.status === 404) {
    return '该公告已删除';
  }
  return fallback;
}

export function isAnnouncementGone(error: unknown): boolean {
  return announcementErrorCode(error) === 'announcement_not_found' || (error instanceof ApiError && error.status === 404);
}

/** 聊天里的公告卡片消息；不是卡片或字段不全（当普通系统消息显示）时返回 null。 */
export function announcementCardOf(message: Pick<Message, 'type' | 'metadata'>): AnnouncementCardInfo | null {
  const metadata = message.metadata;
  if (message.type !== 'system' || !isRecord(metadata) || metadata.system_event !== ANNOUNCEMENT_CARD_EVENT || typeof metadata.announcement_id !== 'number') {
    return null;
  }
  return {
    announcementId: metadata.announcement_id,
    action: metadata.action === 'updated' ? 'updated' : 'created',
    summary: typeof metadata.summary === 'string' ? metadata.summary : '',
    imageUrl: str(metadata.image_url),
    imageThumbnailUrl: str(metadata.image_thumbnail_url),
    imageCount: num(metadata.image_count),
    authorId: typeof metadata.author_id === 'number' ? metadata.author_id : null,
    authorName: str(metadata.author_name) ?? '群管理员',
    requireConfirm: metadata.require_confirm === true,
    deleted: metadata.deleted === true
  };
}
