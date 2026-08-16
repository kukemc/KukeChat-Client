import { API_BASE_URL, WS_URL } from '@/config';
import type { Message, User } from '@/types/api';
import { apiRequest } from './client';

/** 游戏模式下暴露的最小用户信息。 */
export interface GameParticipant {
  id: number;
  display_name: string;
  avatar_url: string | null;
}

export interface GameSession {
  conversation_id: number;
  creation_oid: string;
  title: string | null;
  member_count: number;
  /** 当前身份是否可发言（即是否已登录）。 */
  can_send: boolean;
  /** 已登录但还不是群成员，发第一条消息时会自动入群。 */
  will_auto_join: boolean;
  viewer: GameParticipant | null;
  messages: Message[];
}

export interface GameModeSettings {
  conversation_id: number;
  enabled: boolean;
  creation_oid: string | null;
  title: string | null;
  member_count: number;
}

/**
 * 拉取作品内聊天所需的一切信息。
 *
 * `token` 可为 null —— 未登录的游玩者同样能拿到会话与历史消息，只是 `can_send`
 * 为 false。这是游戏模式的核心：没账号也能看到聊天。
 */
export async function getGameSession(
  conversationId: number,
  creationOid: string,
  token: string | null
): Promise<GameSession> {
  return apiRequest<GameSession>(
    `/game/session?conversation_id=${conversationId}&creation_oid=${encodeURIComponent(creationOid)}`,
    { token }
  );
}

export async function sendGameMessage(
  conversationId: number,
  creationOid: string,
  content: string,
  token: string
): Promise<Message> {
  return apiRequest<Message>('/game/messages', {
    method: 'POST',
    token,
    body: { conversation_id: conversationId, creation_oid: creationOid, content }
  });
}

export async function getGameModeSettings(conversationId: number): Promise<GameModeSettings> {
  return apiRequest<GameModeSettings>(`/game/conversations/${conversationId}`);
}

export async function updateGameModeSettings(
  conversationId: number,
  enabled: boolean,
  creationOid: string | null
): Promise<GameModeSettings> {
  return apiRequest<GameModeSettings>(`/game/conversations/${conversationId}`, {
    method: 'PATCH',
    body: { enabled, creation_oid: creationOid }
  });
}

/** 游戏模式的匿名订阅通道地址。 */
export function gameWebSocketUrl(conversationId: number, creationOid: string): string {
  const base = WS_URL.replace(/\/ws$/, '');
  const url = new URL(`${base}/game/ws`);
  url.searchParams.set('conversation_id', String(conversationId));
  url.searchParams.set('creation_oid', creationOid);
  return url.toString();
}

export function gameApiOrigin(): string {
  return API_BASE_URL;
}

export type { Message as GameMessage, User as GameUser };
