import type { Bot, BotCreateRead, BotDashboard, BotInstallation, BotPayload, BotReview, BotSquarePage, Conversation, ConversationMember, Message, MessageComponentState, MessageElement, MessageMetadata, MessageReactionSummary, MessageType, PostLikeToggleRead, UploadResponse } from '@/types/api';
import { apiRequest, getApiBaseUrl } from './client';
import { asList } from './normalizers';

export interface InstallBotPayload {
  conversation_id: number;
  receive_messages?: boolean;
  receive_member_events?: boolean;
}

export interface UpdateBotInstallationPayload {
  enabled?: boolean;
  receive_messages?: boolean;
  receive_member_events?: boolean;
}

export interface BotSendMessagePayload {
  type?: MessageType;
  content: string;
  message?: string;
  metadata?: MessageMetadata;
  elements?: MessageElement[];
}

export interface BotUpdateComponentPayload extends MessageComponentState {
  scope?: 'global' | 'user';
  user_id?: number;
}

function botHeaders(key: string): Record<string, string> {
  const botKey = key.trim();
  return {
    Authorization: `Bot ${botKey}`,
    'X-Kuke-Bot-Key': botKey,
    'Content-Type': 'application/json',
    'X-Kuke-Client': 'kukechat-bot/scratch'
  };
}

function joinBotApiPath(path: string): string {
  const base = getApiBaseUrl().replace(/\/$/, '');
  const prefix = base.endsWith('/api/v1') ? '' : '/api/v1';
  return `${base}${prefix}${path.startsWith('/') ? path : `/${path}`}`;
}

async function readBotJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  let payload: unknown;
  try {
    payload = text ? JSON.parse(text) as unknown : undefined;
  } catch {
    payload = text;
  }
  if (!response.ok) {
    const detail = typeof payload === 'object' && payload && 'detail' in payload ? (payload as { detail?: unknown }).detail : undefined;
    const message = Array.isArray(detail) ? detail.map((item) => typeof item === 'object' && item && 'msg' in item ? String((item as { msg?: unknown }).msg) : JSON.stringify(item)).join('；') : typeof detail === 'string' ? detail : `请求失败：${response.status}`;
    throw new Error(`${response.status} ${message}`);
  }
  return payload as T;
}

export async function createBot(payload: BotPayload): Promise<BotCreateRead> {
  return apiRequest<BotCreateRead>('/bots', { method: 'POST', body: payload });
}

export async function getMyBots(): Promise<Bot[]> {
  return asList<Bot>(await apiRequest<unknown>('/bots/mine'));
}

export async function getPublicBots(query = '', options: { limit?: number; offset?: number } = {}): Promise<BotSquarePage> {
  const params = new URLSearchParams();
  if (query.trim()) {
    params.set('q', query.trim());
  }
  if (options.limit) {
    params.set('limit', String(options.limit));
  }
  if (options.offset) {
    params.set('offset', String(options.offset));
  }
  const qs = params.toString();
  return apiRequest<BotSquarePage>(`/bots/square${qs ? `?${qs}` : ''}`);
}

export async function updateBot(botId: number, payload: Partial<BotPayload> & { status?: 'active' | 'disabled' }): Promise<Bot> {
  return apiRequest<Bot>(`/bots/${botId}`, { method: 'PATCH', body: payload });
}

export async function getBot(botId: number): Promise<Bot> {
  return apiRequest<Bot>(`/bots/${botId}`);
}

export async function getBotDashboard(botId: number): Promise<BotDashboard> {
  return apiRequest<BotDashboard>(`/bots/${botId}/dashboard`);
}

export async function deleteBot(botId: number): Promise<void> {
  await apiRequest<unknown>(`/bots/${botId}`, { method: 'DELETE' });
}

export async function getBotReviews(botId: number): Promise<BotReview[]> {
  return asList<BotReview>(await apiRequest<unknown>(`/bots/${botId}/reviews`));
}

export async function upsertBotReview(botId: number, payload: { rating: number; content?: string | null }): Promise<BotReview> {
  return apiRequest<BotReview>(`/bots/${botId}/reviews/me`, { method: 'PUT', body: payload });
}

export async function createBotReviewReply(botId: number, reviewId: number, payload: { content: string; parent_id?: number | null }): Promise<BotReview> {
  return apiRequest<BotReview>(`/bots/${botId}/reviews/${reviewId}/replies`, { method: 'POST', body: payload });
}

export async function toggleBotReviewLike(botId: number, reviewId: number): Promise<PostLikeToggleRead> {
  return apiRequest<PostLikeToggleRead>(`/bots/${botId}/reviews/${reviewId}/like`, { method: 'POST' });
}

export async function toggleBotReviewReplyLike(botId: number, reviewId: number, replyId: number): Promise<PostLikeToggleRead> {
  return apiRequest<PostLikeToggleRead>(`/bots/${botId}/reviews/${reviewId}/replies/${replyId}/like`, { method: 'POST' });
}

export async function rotateBotKey(botId: number): Promise<{ bot_id: number; key: string; key_prefix: string }> {
  return apiRequest<{ bot_id: number; key: string; key_prefix: string }>(`/bots/${botId}/rotate-key`, { method: 'POST' });
}

export async function installBot(botId: number, payload: InstallBotPayload): Promise<BotInstallation> {
  return apiRequest<BotInstallation>(`/bots/${botId}/install`, { method: 'POST', body: payload });
}

export async function updateBotInstallation(botId: number, conversationId: number, payload: UpdateBotInstallationPayload): Promise<BotInstallation> {
  return apiRequest<BotInstallation>(`/bots/${botId}/installations/${conversationId}`, { method: 'PATCH', body: payload });
}

export async function removeBotInstallation(botId: number, conversationId: number): Promise<void> {
  await apiRequest<unknown>(`/bots/${botId}/installations/${conversationId}`, { method: 'DELETE' });
}

export async function getConversationBots(conversationId: number): Promise<BotInstallation[]> {
  return asList<BotInstallation>(await apiRequest<unknown>(`/bots/conversations/${conversationId}/bots`));
}

export async function botApiMe(key: string): Promise<{ bot: Bot; conversations: Conversation[] }> {
  const response = await fetch(joinBotApiPath('/bot-api/me'), { headers: botHeaders(key) });
  return readBotJson<{ bot: Bot; conversations: Conversation[] }>(response);
}

export async function botApiGetConversations(key: string): Promise<Conversation[]> {
  const response = await fetch(joinBotApiPath('/bot-api/conversations'), { headers: botHeaders(key) });
  return asList<Conversation>(await readBotJson<unknown>(response));
}

export async function botApiGetMembers(key: string, conversationId: number): Promise<ConversationMember[]> {
  const response = await fetch(joinBotApiPath(`/bot-api/conversations/${conversationId}/members`), { headers: botHeaders(key) });
  const payload = await readBotJson<{ items?: ConversationMember[] } | ConversationMember[]>(response);
  return Array.isArray(payload) ? payload : payload.items ?? [];
}

export async function botApiGetMessages(key: string, conversationId: number, options: { beforeId?: number; afterId?: number; limit?: number } = {}): Promise<Message[]> {
  const params = new URLSearchParams();
  if (options.beforeId) params.set('before_id', String(options.beforeId));
  if (options.afterId) params.set('after_id', String(options.afterId));
  if (options.limit) params.set('limit', String(options.limit));
  const response = await fetch(joinBotApiPath(`/bot-api/conversations/${conversationId}/messages${params.toString() ? `?${params.toString()}` : ''}`), { headers: botHeaders(key) });
  return asList<Message>(await readBotJson<unknown>(response));
}

export async function botApiGetUserInfo(key: string, userId: number): Promise<{ user: Record<string, unknown>; online: boolean }> {
  const response = await fetch(joinBotApiPath(`/bot-api/users/${userId}`), { headers: botHeaders(key) });
  return readBotJson<{ user: Record<string, unknown>; online: boolean }>(response);
}

export async function botApiGetConversationInfo(key: string, conversationId: number): Promise<Record<string, unknown>> {
  const response = await fetch(joinBotApiPath(`/bot-api/conversations/${conversationId}`), { headers: botHeaders(key) });
  return readBotJson<Record<string, unknown>>(response);
}

export async function botApiSendMessage(key: string, conversationId: number, payload: BotSendMessagePayload): Promise<Message> {
  const response = await fetch(joinBotApiPath(`/bot-api/conversations/${conversationId}/messages`), {
    method: 'POST',
    headers: botHeaders(key),
    body: JSON.stringify({ type: payload.type ?? 'text', content: payload.content, message: payload.message, metadata: payload.metadata, elements: payload.elements })
  });
  return readBotJson<Message>(response);
}

export async function botApiSendDirectMessage(key: string, userId: number, payload: BotSendMessagePayload): Promise<Message> {
  const response = await fetch(joinBotApiPath(`/bot-api/users/${userId}/messages`), {
    method: 'POST',
    headers: botHeaders(key),
    body: JSON.stringify({ type: payload.type ?? 'text', content: payload.content, message: payload.message, metadata: payload.metadata, elements: payload.elements })
  });
  return readBotJson<Message>(response);
}

export async function botApiRecallMessage(key: string, conversationId: number, messageId: number): Promise<Message> {
  const response = await fetch(joinBotApiPath(`/bot-api/conversations/${conversationId}/messages/${messageId}/recall`), { method: 'POST', headers: botHeaders(key) });
  return readBotJson<Message>(response);
}

export async function botApiToggleReaction(key: string, conversationId: number, messageId: number, emoji: string): Promise<MessageReactionSummary[]> {
  const response = await fetch(joinBotApiPath(`/bot-api/conversations/${conversationId}/messages/${messageId}/reactions`), {
    method: 'POST',
    headers: botHeaders(key),
    body: JSON.stringify({ emoji })
  });
  return asList<MessageReactionSummary>(await readBotJson<unknown>(response));
}

export async function botApiUpdateMessageComponent(key: string, conversationId: number, messageId: number, componentId: string, payload: BotUpdateComponentPayload): Promise<Record<string, unknown>> {
  const response = await fetch(joinBotApiPath(`/bot-api/conversations/${conversationId}/messages/${messageId}/components/${encodeURIComponent(componentId)}`), {
    method: 'PATCH',
    headers: botHeaders(key),
    body: JSON.stringify(payload)
  });
  return readBotJson<Record<string, unknown>>(response);
}

export async function botApiUploadFile(key: string, path: '/bot-api/uploads/image' | '/bot-api/uploads/voice', file: File): Promise<UploadResponse> {
  const body = new FormData();
  body.append('file', file);
  const botKey = key.trim();
  const response = await fetch(joinBotApiPath(path), { method: 'POST', headers: { Authorization: `Bot ${botKey}`, 'X-Kuke-Bot-Key': botKey, 'X-Kuke-Client': 'kukechat-bot/scratch' }, body });
  return readBotJson<UploadResponse>(response);
}

export function botWebSocketUrl(key: string): string {
  const base = getApiBaseUrl().replace(/^http/, 'ws').replace(/\/api\/v1\/?$/, '').replace(/\/$/, '');
  return `${base}/bot/ws?key=${encodeURIComponent(key)}`;
}
