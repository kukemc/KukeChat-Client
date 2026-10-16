import type { Message, User } from '@/types/api';
import type { ChatSearchConversation, ChatSearchHit, ChatSearchPage, ChatSearchParams, ChatSearchSummary } from '@/types/groupPlus';
import { normalizeTier } from './groupPlus';
import { apiRequest } from './client';
import { isRecord } from './normalizers';

/**
 * 聊天记录搜索（QQ 式）。契约：KukeChat-Server/docs/group-plus.md 第 8 节。
 *
 * 搜的永远是「当前用户自己」的会话和自己可见的消息；后台没有任何搜索消息的接口。
 * 这和旧的 GET /conversations/{id}/messages/search（api/messages.ts）是两套，旧的继续给只搜一个会话的旧入口用。
 */

function notNull<T>(value: T | null): value is T {
  return value !== null;
}

function isMessage(value: unknown): value is Message {
  return isRecord(value) && typeof value.id === 'number' && typeof value.conversation_id === 'number' && typeof value.content === 'string';
}

function normalizeConversation(value: unknown): ChatSearchConversation | null {
  if (!isRecord(value) || typeof value.id !== 'number') {
    return null;
  }
  const directUser = isRecord(value.direct_user) && typeof value.direct_user.id === 'number' ? value.direct_user as unknown as User : null;
  return {
    id: value.id,
    type: value.type === 'direct' ? 'direct' : 'group',
    title: typeof value.title === 'string' ? value.title : null,
    display_title: typeof value.display_title === 'string' ? value.display_title : null,
    avatar_url: typeof value.avatar_url === 'string' ? value.avatar_url : null,
    plus_tier: normalizeTier(value.plus_tier),
    plus_expires_at: typeof value.plus_expires_at === 'string' ? value.plus_expires_at : null,
    direct_user: directUser
  };
}

/** 命中区间：只收 [start, end) 且 0 <= start < end 的整数对；越界的在渲染时再按文字长度裁。 */
function normalizeRanges(value: unknown): Array<[number, number]> {
  if (!Array.isArray(value)) {
    return [];
  }
  const ranges: Array<[number, number]> = [];
  for (const item of value) {
    if (Array.isArray(item) && typeof item[0] === 'number' && typeof item[1] === 'number' && item[0] >= 0 && item[1] > item[0]) {
      ranges.push([Math.floor(item[0]), Math.floor(item[1])]);
    }
  }
  return ranges;
}

const CATEGORIES = ['text', 'media', 'sticker', 'file', 'link'] as const;

function normalizeHit(value: unknown): ChatSearchHit | null {
  if (!isRecord(value) || !isMessage(value.message)) {
    return null;
  }
  const conversation = normalizeConversation(value.conversation) ?? {
    id: value.message.conversation_id, type: 'group' as const, title: null, display_title: null, avatar_url: null, plus_tier: 'free' as const, plus_expires_at: null, direct_user: null
  };
  const category = (CATEGORIES as readonly unknown[]).includes(value.category) ? value.category as ChatSearchHit['category'] : 'text';
  return {
    message: value.message,
    conversation,
    category,
    snippet: typeof value.snippet === 'string' ? value.snippet : value.message.content,
    snippet_highlights: normalizeRanges(value.snippet_highlights),
    highlights: normalizeRanges(value.highlights)
  };
}

function buildParams(params: ChatSearchParams): URLSearchParams {
  const query = new URLSearchParams();
  if (params.q?.trim()) {
    query.set('q', params.q.trim().slice(0, 100));
  }
  if (params.conversationId) {
    query.set('conversation_id', String(params.conversationId));
  }
  if (params.senderId) {
    query.set('sender_id', String(params.senderId));
  }
  if (params.category && params.category !== 'all') {
    query.set('category', params.category);
  }
  if (params.dateFrom) {
    query.set('date_from', params.dateFrom);
  }
  if (params.dateTo) {
    query.set('date_to', params.dateTo);
  }
  if (params.limit) {
    query.set('limit', String(Math.min(50, Math.max(1, params.limit))));
  }
  if (params.beforeId) {
    query.set('before_id', String(params.beforeId));
  }
  return query;
}

/** 「至少要有一项条件」：服务端对什么条件都没有的请求返回 422 query_required，客户端提前判断，不发请求。 */
export function hasSearchCondition(params: ChatSearchParams): boolean {
  return Boolean(params.q?.trim() || params.conversationId || params.senderId || (params.category && params.category !== 'all') || params.dateFrom || params.dateTo);
}

export async function searchChatMessages(params: ChatSearchParams, signal?: AbortSignal): Promise<ChatSearchPage> {
  const query = buildParams(params);
  const response = await apiRequest<unknown>(`/search/messages?${query.toString()}`, { signal });
  const source = isRecord(response) ? response : {};
  const items = Array.isArray(source.items) ? source.items.map(normalizeHit).filter(notNull) : [];
  return {
    items,
    total: typeof source.total === 'number' ? source.total : items.length,
    total_capped: source.total_capped === true,
    limit: typeof source.limit === 'number' ? source.limit : params.limit ?? 20,
    offset: typeof source.offset === 'number' ? source.offset : 0,
    has_more: source.has_more === true,
    next_before_id: typeof source.next_before_id === 'number' ? source.next_before_id : null
  };
}

/** 全局搜索时先按会话聚合命中数，再点进某个会话看详情。 */
export async function searchChatSummary(params: Omit<ChatSearchParams, 'conversationId' | 'beforeId'>, signal?: AbortSignal): Promise<ChatSearchSummary> {
  const query = buildParams({ ...params, limit: undefined });
  query.set('limit', String(Math.min(100, params.limit ?? 50)));
  const response = await apiRequest<unknown>(`/search/messages/summary?${query.toString()}`, { signal });
  const source = isRecord(response) ? response : {};
  const items = Array.isArray(source.items) ? source.items.map((item) => {
    if (!isRecord(item)) {
      return null;
    }
    const conversation = normalizeConversation(item.conversation);
    if (!conversation || typeof item.count !== 'number') {
      return null;
    }
    return {
      conversation,
      count: item.count,
      latest_message_id: typeof item.latest_message_id === 'number' ? item.latest_message_id : 0,
      latest_at: typeof item.latest_at === 'string' ? item.latest_at : ''
    };
  }).filter(notNull) : [];
  return { total: typeof source.total === 'number' ? source.total : items.reduce((sum, item) => sum + item.count, 0), items };
}
