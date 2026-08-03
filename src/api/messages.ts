import type { BookmarkedMessageRead, Conversation, FeaturedMessageRead, Message, MessageBookmarkToggleRead, MessageFeatureToggleRead, MessageMetadata, MessageReactionSummary, MessageSearchResponse, MessageType, Task, UploadResponse } from '@/types/api';
import { apiRequest, uploadFile } from './client';
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
    items: messages.map((message) => ({ message, match_type: message.type === 'image' && message.metadata?.sticker ? 'sticker' : message.type, snippet: message.content || null })),
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

export async function sendMessage(conversationId: number, content: string, type: MessageType = 'text', metadata?: MessageMetadata): Promise<Message> {
  return apiRequest<Message>(`/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: { content, type, metadata }
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
  return bookmarkLists.flat().sort((a, b) => new Date(b.message.created_at).getTime() - new Date(a.message.created_at).getTime());
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

export async function uploadMessageImage(file: File): Promise<UploadResponse> {
  return uploadFile<UploadResponse>('/uploads/message-image', file);
}

export async function uploadMessageVoice(file: File): Promise<UploadResponse> {
  return uploadFile<UploadResponse>('/uploads/message-voice', file);
}

export async function markConversationRead(conversationId: number, lastReadMessageId?: number | null): Promise<void> {
  await apiRequest<unknown>(`/conversations/${conversationId}/read`, {
    method: 'POST',
    body: { last_read_message_id: lastReadMessageId ?? null }
  });
}
