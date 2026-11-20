import type { BookmarkedMessageRead, Conversation, FeaturedMessageRead, Message, MessageBookmarkToggleRead, MessageFeatureToggleRead, MessageMetadata, MessageReactionSummary, MessageSearchResponse, MessageType, Task, UploadResponse } from '@/types/api';
import { parseApiDate } from '@/utils/dateTime';
import { DIRECT_PROFILE, RELAY_PROFILE, prepareDirectImageUpload, type DirectImageUpload } from '@/utils/imageUpload';
import { ApiError, apiRequest, uploadFile, uploadForm } from './client';
import { asList, isRecord } from './normalizers';

export interface FavoriteStickerItem {
  asset_id: number;
  url: string;
  content_type: string;
  created_at: string;
}

export interface GetMessagesOptions {
  beforeId?: number;
  limit?: number;
}

export interface GetMessageContextOptions {
  before?: number;
  after?: number;
}

export interface SearchMessagesOptions {
  query?: string;
  category?: 'all' | 'text' | 'image' | 'sticker' | 'voice' | 'link' | 'forward_bundle' | 'system';
  senderId?: number;
  startAt?: string;
  endAt?: string;
  beforeId?: number;
  includeRecalled?: boolean;
  limit?: number;
}

export interface MessageInteractionPayload {
  kind: 'button' | 'link';
  action: 'callback' | 'input' | 'open';
  component_id?: string | null;
  action_id?: string | null;
  value?: string | null;
  href?: string | null;
  label?: string | null;
  element_index?: number | null;
}

function appendSearchParams(params: URLSearchParams, options: SearchMessagesOptions): void {
  if (options.query?.trim()) {
    params.set('q', options.query.trim());
  }
  if (options.category) {
    params.set('category', options.category);
  }
  if (options.senderId) {
    params.set('sender_id', String(options.senderId));
  }
  if (options.startAt) {
    params.set('start_at', options.startAt);
  }
  if (options.endAt) {
    params.set('end_at', options.endAt);
  }
  if (options.includeRecalled !== undefined) {
    params.set('include_recalled', String(options.includeRecalled));
  }
  appendPagingParams(params, options);
}

function normalizeMessageSearchResponse(response: unknown, fallbackLimit: number): MessageSearchResponse {
  if (isRecord(response) && Array.isArray(response.items)) {
    return {
      items: response.items.filter((item): item is MessageSearchResponse['items'][number] => isRecord(item) && isMessage(item.message)),
      total: typeof response.total === 'number' ? response.total : response.items.length,
      limit: typeof response.limit === 'number' ? response.limit : fallbackLimit,
      has_more: Boolean(response.has_more),
      next_before_id: typeof response.next_before_id === 'number' ? response.next_before_id : null
    };
  }

  const messages = asList<Message>(response);
  return {
    // 投票、红包、礼物没有单独的搜索分类：它们的正文就是文本摘要，按文本命中算
    items: messages.map((message) => ({ message, match_type: message.type === 'image' && message.metadata?.sticker ? 'sticker' : message.type === 'poll' || message.type === 'red_packet' || message.type === 'gift' ? 'text' : message.type, snippet: message.content || null })),
    total: messages.length,
    limit: fallbackLimit,
    has_more: messages.length >= fallbackLimit,
    next_before_id: messages[messages.length - 1]?.id ?? null
  };
}

function appendPagingParams(params: URLSearchParams, options: GetMessagesOptions): void {
  if (options.beforeId) {
    params.set('before_id', String(options.beforeId));
  }
  if (options.limit) {
    params.set('limit', String(options.limit));
  }
}

export async function getMessages(conversationId: number, options: GetMessagesOptions = {}): Promise<Message[]> {
  const params = new URLSearchParams();
  appendPagingParams(params, options);
  const query = params.toString();
  const response = await apiRequest<unknown>(`/conversations/${conversationId}/messages${query ? `?${query}` : ''}`);
  return asList<Message>(response);
}

export async function getMessageContext(conversationId: number, messageId: number, options: GetMessageContextOptions = {}): Promise<Message[]> {
  const params = new URLSearchParams();
  if (options.before !== undefined) {
    params.set('before', String(options.before));
  }
  if (options.after !== undefined) {
    params.set('after', String(options.after));
  }
  const query = params.toString();
  const response = await apiRequest<unknown>(`/conversations/${conversationId}/messages/${messageId}/context${query ? `?${query}` : ''}`);
  return asList<Message>(response);
}

export async function searchConversationMessages(conversationId: number, options: SearchMessagesOptions): Promise<MessageSearchResponse> {
  const params = new URLSearchParams();
  appendSearchParams(params, options);
  const query = params.toString();
  const response = await apiRequest<unknown>(`/conversations/${conversationId}/messages/search${query ? `?${query}` : ''}`);
  return normalizeMessageSearchResponse(response, options.limit ?? 20);
}

export async function searchConversationsMessages(conversationIds: number[], options: SearchMessagesOptions): Promise<MessageSearchResponse> {
  const limit = options.limit ?? 20;
  const uniqueConversationIds = Array.from(new Set(conversationIds.filter((id) => Number.isFinite(id) && id > 0)));
  if (uniqueConversationIds.length === 0 || !options.query?.trim()) {
    return { items: [], total: 0, limit, has_more: false, next_before_id: null };
  }

  const pages = await Promise.all(uniqueConversationIds.map((conversationId) => searchConversationMessages(conversationId, { ...options, category: options.category ?? 'all', limit })));
  const mergedItems = pages
    .flatMap((page) => page.items)
    .sort((left, right) => right.message.id - left.message.id);
  const items = mergedItems.slice(0, limit);

  return {
    items,
    total: pages.reduce((sum, page) => sum + page.total, 0),
    limit,
    has_more: mergedItems.length > limit || pages.some((page) => page.has_more),
    next_before_id: items[items.length - 1]?.message.id ?? null
  };
}

export function __buildMessageSearchQueryForTest(options: SearchMessagesOptions): string {
  const params = new URLSearchParams();
  appendSearchParams(params, options);
  return params.toString();
}

export type FeaturedMessageItem = FeaturedMessageRead | Message;

function isMessage(value: unknown): value is Message {
  return isRecord(value) && typeof value.id === 'number' && typeof value.conversation_id === 'number' && typeof value.content === 'string';
}

function normalizeFavoriteSticker(value: unknown): FavoriteStickerItem | null {
  if (!isRecord(value) || typeof value.asset_id !== 'number' || typeof value.url !== 'string') {
    return null;
  }

  return {
    asset_id: value.asset_id,
    url: value.url,
    content_type: typeof value.content_type === 'string' ? value.content_type : 'image/webp',
    created_at: typeof value.created_at === 'string' ? value.created_at : ''
  };
}

function normalizeBookmarkedMessages(value: unknown, conversations: Conversation[]): BookmarkedMessageRead[] {
  const conversationById = new Map(conversations.map((conversation) => [conversation.id, conversation]));
  const items: BookmarkedMessageRead[] = [];

  for (const item of asList<unknown>(value)) {
    if (isRecord(item) && isMessage(item.message)) {
      const conversationId = typeof item.conversation_id === 'number' ? item.conversation_id : item.message.conversation_id;
      items.push({
        conversation_id: conversationId,
        conversation: isRecord(item.conversation) ? item.conversation as unknown as Conversation : conversationById.get(conversationId) ?? null,
        message: item.message,
        created_at: typeof item.created_at === 'string' ? item.created_at : undefined
      });
      continue;
    }

    if (isMessage(item)) {
      items.push({
        conversation_id: item.conversation_id,
        conversation: conversationById.get(item.conversation_id) ?? null,
        message: item
      });
    }
  }

  return items;
}

/** clientNonce：乐观发送的本地标记，服务器在返回和 message.created 里原样带回（docs/chat-features.md 第 11 节） */
export async function sendMessage(conversationId: number, content: string, type: MessageType = 'text', metadata?: MessageMetadata, clientNonce?: string): Promise<Message> {
  return apiRequest<Message>(`/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: clientNonce ? { content, type, metadata, client_nonce: clientNonce } : { content, type, metadata }
  });
}

export async function triggerMessageInteraction(conversationId: number, messageId: number, payload: MessageInteractionPayload): Promise<void> {
  await apiRequest<unknown>(`/conversations/${conversationId}/messages/${messageId}/interactions`, {
    method: 'POST',
    body: payload
  });
}

export async function recallMessage(conversationId: number, messageId: number): Promise<Message> {
  return apiRequest<Message>(`/conversations/${conversationId}/messages/${messageId}/recall`, {
    method: 'POST'
  });
}

export async function deleteMessageLocal(conversationId: number, messageId: number): Promise<void> {
  await apiRequest<unknown>(`/conversations/${conversationId}/messages/${messageId}`, {
    method: 'DELETE'
  });
}

export async function toggleMessageBookmark(conversationId: number, messageId: number): Promise<MessageBookmarkToggleRead> {
  return apiRequest<MessageBookmarkToggleRead>(`/conversations/${conversationId}/messages/${messageId}/bookmark`, {
    method: 'POST'
  });
}

export async function toggleMessageFeature(conversationId: number, messageId: number): Promise<MessageFeatureToggleRead> {
  return apiRequest<MessageFeatureToggleRead>(`/conversations/${conversationId}/messages/${messageId}/feature`, {
    method: 'POST'
  });
}

export async function getFeaturedMessages(conversationId: number): Promise<FeaturedMessageItem[]> {
  const response = await apiRequest<unknown>(`/conversations/${conversationId}/featured-messages`);
  return asList<FeaturedMessageItem>(response);
}

export async function getConversationBookmarks(conversationId: number): Promise<Message[]> {
  const response = await apiRequest<unknown>(`/conversations/${conversationId}/bookmarks`);
  return asList<Message>(response);
}

export async function getAllBookmarkedMessages(conversations: Conversation[]): Promise<BookmarkedMessageRead[]> {
  try {
    const response = await apiRequest<unknown>('/conversations/bookmarks/all');
    const normalized = normalizeBookmarkedMessages(response, conversations);
    if (normalized.length > 0 || asList<unknown>(response).length === 0) {
      return normalized;
    }
  } catch {
    // Current backend exposes per-conversation bookmarks; keep the all-bookmarks UI usable.
  }

  const bookmarkLists = await Promise.all(conversations.map(async (conversation) => {
    try {
      const messages = await getConversationBookmarks(conversation.id);
      return messages.map((message) => ({ conversation_id: conversation.id, conversation, message }));
    } catch {
      return [] as BookmarkedMessageRead[];
    }
  }));
  return bookmarkLists.flat().sort((a, b) => (parseApiDate(b.message.created_at)?.getTime() ?? 0) - (parseApiDate(a.message.created_at)?.getTime() ?? 0));
}

export async function forwardMessageBundle(targetConversationId: number, sourceConversationId: number, messageIds: number[], note?: string): Promise<Message> {
  return apiRequest<Message>(`/conversations/${targetConversationId}/forward-bundle`, {
    method: 'POST',
    body: {
      source_conversation_id: sourceConversationId,
      message_ids: messageIds,
      note: note?.trim() || undefined
    }
  });
}

export async function sharePostToConversation(targetConversationId: number, content: string, metadata: MessageMetadata): Promise<Message> {
  return sendMessage(targetConversationId, content, 'text', metadata);
}

export async function shareBotToConversation(targetConversationId: number, content: string, metadata: MessageMetadata): Promise<Message> {
  return sendMessage(targetConversationId, content, 'text', metadata);
}

export async function shareUserToConversation(targetConversationId: number, content: string, metadata: MessageMetadata): Promise<Message> {
  return sendMessage(targetConversationId, content, 'text', metadata);
}

export async function shareTeamupProfileToConversation(targetConversationId: number, content: string, metadata: MessageMetadata): Promise<Message> {
  return sendMessage(targetConversationId, content, 'text', metadata);
}

export async function shareTaskToConversation(targetConversationId: number, task: Task): Promise<Message> {
  const metadata: MessageMetadata = {
    share_card: {
      type: 'task',
      task_id: task.id,
      conversation_id: task.conversation_id,
      title: task.title,
      description: task.description?.trim() ? task.description.trim().slice(0, 200) : null,
      status: task.status,
      priority: task.priority,
      due_at: task.due_at ?? null,
      assignee_count: task.assignees?.length ?? 0,
      assignees: (task.assignees ?? []).map((user) => ({ id: user.id, name: user.nickname ?? user.username ?? '', avatar_url: user.avatar_url ?? null })),
      creator_name: task.creator?.nickname ?? task.creator?.username ?? null
    }
  };
  return sendMessage(targetConversationId, `[任务] ${task.title}`, 'text', metadata);
}

export async function toggleMessageReaction(conversationId: number, messageId: number, emoji: string): Promise<MessageReactionSummary[]> {
  const response = await apiRequest<unknown>(`/conversations/${conversationId}/messages/${messageId}/reactions`, {
    method: 'POST',
    body: { emoji }
  });
  return asList<MessageReactionSummary>(response);
}

export async function getFavoriteStickers(): Promise<FavoriteStickerItem[]> {
  const response = await apiRequest<unknown>('/stickers/favorites');
  return asList<unknown>(response).map(normalizeFavoriteSticker).filter((item): item is FavoriteStickerItem => item !== null);
}

export async function addFavoriteSticker(sourceUrl: string): Promise<FavoriteStickerItem> {
  const response = await apiRequest<unknown>('/stickers/favorites', {
    method: 'POST',
    body: { source_url: sourceUrl }
  });
  const sticker = normalizeFavoriteSticker(response);
  if (!sticker) {
    throw new Error('收藏表情返回数据无效');
  }
  return sticker;
}

export async function removeFavoriteSticker(assetId: number): Promise<void> {
  await apiRequest<unknown>(`/stickers/favorites/${assetId}`, {
    method: 'DELETE'
  });
}

interface DirectUploadTarget {
  method: string;
  url: string;
  headers: Record<string, string>;
}

interface DirectImageTicket {
  upload_id: string;
  image: DirectUploadTarget;
  thumbnail: DirectUploadTarget;
}

// 后端没开直传（或者是不认这个接口的老后端）：这次运行里不再开单
let directImageUnavailable = false;
// 中转接口不存在（老后端）：这次运行里不再试，一律走普通上传
let relayUnavailable = false;
/**
 * 走中转（压缩好的主图和缩略图交给我们的服务器写进对象存储），不直连对象存储。
 * 嵌在用 CSP 限制了连接域名的网页里时（共创世界只放行我们自己的域名），直连对象存储的 PUT 会被浏览器直接拦下。
 * 已知的这类网站一开始就走中转；其他地方直连失败一次也改走中转，这次运行里不再直连。
 */
let preferRelay = typeof location !== 'undefined' && /(^|\.)ccw\.site$/i.test(location.hostname);

async function relayImage(prepared: DirectImageUpload): Promise<UploadResponse | null> {
  if (relayUnavailable) return null;
  try {
    return await uploadForm<UploadResponse>('/uploads/message-image/relay', {
      image: { blob: prepared.image, filename: prepared.image.type === 'image/gif' ? 'image.gif' : 'image.jpg' },
      thumbnail: { blob: prepared.thumbnail, filename: 'thumbnail.jpg' }
    });
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 405)) {
      relayUnavailable = true;
      return null;
    }
    // 400（不是能用的图片）、413 这类结论普通上传也一样，直接报给用户
    if (error instanceof ApiError && error.status >= 400 && error.status < 500) throw error;
    console.warn('[KukeChat] 图片中转上传失败，改用普通上传', error);
    return null;
  }
}

async function putDirect(target: DirectUploadTarget, body: Blob): Promise<void> {
  const response = await fetch(target.url, { method: target.method || 'PUT', headers: target.headers, body });
  if (!response.ok) throw new Error(`direct upload failed: ${response.status}`);
}

async function completeDirectImage(uploadId: string): Promise<UploadResponse> {
  const path = `/uploads/message-image/direct/${encodeURIComponent(uploadId)}/complete`;
  try {
    return await apiRequest<UploadResponse>(path, { method: 'POST' });
  } catch (error) {
    // 桶刚收完、head 还没看到对象（少数服务商会有一点延迟）：等一下再试一次
    if (error instanceof ApiError && error.status === 409) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return apiRequest<UploadResponse>(path, { method: 'POST' });
    }
    throw error;
  }
}

/**
 * 聊天图片直传（后端 docs/chat-features.md「图片直传」）：本地压缩好主图和缩略图，用预签名 URL 直接传进对象存储，
 * 后端只校验。服务器到对象存储的带宽很小，经后端转一道时大图常超时。返回 null = 这次没能直传，调用方走普通上传。
 */
async function tryDirectImageUpload(file: File): Promise<UploadResponse | null> {
  const relay = preferRelay || directImageUnavailable;
  if (relay && relayUnavailable) return null;
  const prepared = await prepareDirectImageUpload(file, relay ? RELAY_PROFILE : DIRECT_PROFILE);
  if (!prepared) return null;
  if (relay) return relayImage(prepared);
  let ticket: DirectImageTicket;
  try {
    ticket = await apiRequest<DirectImageTicket>('/uploads/message-image/direct', {
      method: 'POST',
      body: { content_type: prepared.image.type, size: prepared.image.size, thumbnail_size: prepared.thumbnail.size }
    });
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 405 ||
        (error.status === 409 && isRecord(error.detail) && isRecord(error.detail.detail) &&
          error.detail.detail.code === 'direct_upload_unavailable'))) {
      directImageUnavailable = true;
      // 服务器没开直传（比如用本地存储）：中转同样不用后端重新压缩，比普通上传省
      return relayImage(prepared);
    }
    return null;
  }
  try {
    await Promise.all([putDirect(ticket.image, prepared.image), putDirect(ticket.thumbnail, prepared.thumbnail)]);
  } catch (error) {
    // 多半是网页的 CSP 拦下了对象存储的地址（被拦是瞬间失败，没白传）：这张和以后的都走中转
    preferRelay = true;
    console.warn('[KukeChat] 图片直传被拦，改走中转', error);
    return relayImage(prepared);
  }
  try {
    return await completeDirectImage(ticket.upload_id);
  } catch (error) {
    // 400（不是能用的图片）这类结论普通上传也一样，直接报给用户
    if (error instanceof ApiError && error.status === 400) throw error;
    console.warn('[KukeChat] 图片直传完成失败，改用普通上传', error);
    return null;
  }
}

export async function uploadMessageImage(file: File): Promise<UploadResponse> {
  return (await tryDirectImageUpload(file)) ?? uploadFile<UploadResponse>('/uploads/message-image', file);
}

export async function uploadMessageVoice(file: File): Promise<UploadResponse> {
  return uploadFile<UploadResponse>('/uploads/message-voice', file);
}

/** 我还没读的消息里 @我（kind: 'me'）或 @全体成员（kind: 'all'）的那几条，最早的在前 */
export interface UnreadMentionItem {
  message_id: number;
  kind: 'me' | 'all';
  created_at: string | null;
}

/**
 * GET /conversations/{cid}/mentions/unread：已读位置之后 @我 / @全体 的消息。
 * afterId 是进会话那一刻的已读位置：进会话会马上标已读，带上它服务端就不用管两个请求谁先到（旧后端忽略这个参数）。
 */
export async function getUnreadMentions(conversationId: number, afterId?: number | null): Promise<UnreadMentionItem[]> {
  const query = afterId ? `?after_id=${afterId}` : '';
  const response = await apiRequest<unknown>(`/conversations/${conversationId}/mentions/unread${query}`);
  const items = isRecord(response) && Array.isArray(response.items) ? response.items : asList<unknown>(response);
  return items.flatMap((item): UnreadMentionItem[] => {
    if (!isRecord(item) || typeof item.message_id !== 'number' || !Number.isFinite(item.message_id)) {
      return [];
    }
    return [{ message_id: item.message_id, kind: item.kind === 'all' ? 'all' : 'me', created_at: typeof item.created_at === 'string' ? item.created_at : null }];
  }).sort((left, right) => left.message_id - right.message_id);
}

export interface VoiceTranscriptRead {
  text: string;
  cached: boolean;
}

/** 语音转文字。错误：422 not_voice / voice_too_long，503 transcribe_unavailable，429 transcribe_rate_limited */
export async function transcribeVoiceMessage(conversationId: number, messageId: number): Promise<VoiceTranscriptRead> {
  const response = await apiRequest<unknown>(`/conversations/${conversationId}/messages/${messageId}/transcribe`, {
    method: 'POST'
  });
  const record = isRecord(response) ? response : {};
  return { text: typeof record.text === 'string' ? record.text : '', cached: record.cached === true };
}

/**
 * 标记已读。返回里带着读完之后这个会话的 mention_pending（我还没读的消息里有没有 @我）：
 * 有这个字段就返回它（'me' / 'all' / null），旧后端没有这个字段时返回 undefined。
 */
export async function markConversationRead(conversationId: number, lastReadMessageId?: number | null): Promise<'me' | 'all' | null | undefined> {
  const response = await apiRequest<unknown>(`/conversations/${conversationId}/read`, {
    method: 'POST',
    body: { last_read_message_id: lastReadMessageId ?? null }
  });
  if (typeof response !== 'object' || response === null || !('mention_pending' in response)) {
    return undefined;
  }
  const pending = (response as { mention_pending?: unknown }).mention_pending;
  return pending === 'me' || pending === 'all' ? pending : null;
}
