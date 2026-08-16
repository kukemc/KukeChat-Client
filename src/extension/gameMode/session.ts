/**
 * 游戏模式的会话状态：解析绑定、订阅消息、发送消息。
 *
 * 与主客户端的实时通道不同，这里走 `/game/ws` —— 一条按会话 id 分组、
 * 不需要账号的订阅通道，这样没登录的玩家也能看到聊天。
 */

import { ApiError } from '@/api/client';
import { getGameSession, gameWebSocketUrl, sendGameMessage, type GameSession } from '@/api/game';
import type { Message } from '@/types/api';
import { getGameAuth, isGameAuthorized, refreshGameAuthAfterFailure } from './auth';

/** 聊天框里保留的最大消息条数，防止长时间挂机把内存吃满。 */
const MAX_MESSAGES = 200;
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

export interface GameChatMessage {
  id: number;
  senderId: number | null;
  senderName: string;
  avatarUrl: string | null;
  content: string;
  createdAt: string;
  /** 是否由当前玩家发出。 */
  own: boolean;
}

export type GameConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error';

export interface GameChatState {
  status: GameConnectionStatus;
  conversationId: number | null;
  creationOid: string | null;
  title: string | null;
  memberCount: number;
  canSend: boolean;
  willAutoJoin: boolean;
  messages: GameChatMessage[];
  error: string | null;
}

const INITIAL: GameChatState = {
  status: 'idle',
  conversationId: null,
  creationOid: null,
  title: null,
  memberCount: 0,
  canSend: false,
  willAutoJoin: false,
  messages: [],
  error: null
};

let state: GameChatState = { ...INITIAL, messages: [] };
let socket: WebSocket | null = null;
let reconnectTimer: number | null = null;
let reconnectAttempt = 0;
let disposed = false;

const stateListeners = new Set<(next: GameChatState) => void>();
const messageListeners = new Set<(message: GameChatMessage) => void>();

function setState(patch: Partial<GameChatState>): void {
  state = { ...state, ...patch };
  for (const listener of stateListeners) {
    listener(state);
  }
}

export function subscribeGameChat(listener: (next: GameChatState) => void): () => void {
  stateListeners.add(listener);
  listener(state);
  return () => stateListeners.delete(listener);
}

/** 订阅新消息，用于驱动「当游戏模式收到消息」这块 hat 积木。 */
export function subscribeGameMessages(listener: (message: GameChatMessage) => void): () => void {
  messageListeners.add(listener);
  return () => messageListeners.delete(listener);
}

export function getGameChatState(): GameChatState {
  return state;
}

/**
 * 从当前页面地址推断作品 oid。
 *
 * CCW 作品页形如 `/detail/<24 位十六进制 oid>`。编辑器（`/gandi/<id>`）里
 * 拿不到作品 oid，这时返回 null，由调用方给出可操作的提示。
 */
export function detectCreationOid(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const match = window.location.pathname.match(/\/detail\/([0-9a-fA-F]{24})/);
  return match ? match[1].toLowerCase() : null;
}

function toChatMessage(message: Message): GameChatMessage {
  const auth = getGameAuth();
  const senderId = message.sender?.id ?? message.sender_id ?? null;
  return {
    id: message.id,
    senderId,
    senderName:
      message.sender_display_name ||
      message.sender?.nickname ||
      message.sender?.username ||
      '未知用户',
    avatarUrl: message.sender?.avatar_url ?? null,
    content: message.content ?? '',
    createdAt: message.created_at,
    own: auth.userId !== null && senderId === auth.userId
  };
}

function pushMessage(message: GameChatMessage): void {
  if (state.messages.some((item) => item.id === message.id)) {
    return;
  }
  const messages = [...state.messages, message].slice(-MAX_MESSAGES);
  setState({ messages });
  for (const listener of messageListeners) {
    listener(message);
  }
}

function applySession(session: GameSession): void {
  setState({
    conversationId: session.conversation_id,
    creationOid: session.creation_oid,
    title: session.title,
    memberCount: session.member_count,
    canSend: session.can_send,
    willAutoJoin: session.will_auto_join,
    messages: session.messages.map(toChatMessage),
    error: null
  });
}

function clearReconnect(): void {
  if (reconnectTimer !== null) {
    window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function scheduleReconnect(): void {
  if (disposed || state.conversationId === null || state.creationOid === null) {
    return;
  }
  clearReconnect();
  // 指数退避，避免作品被大量玩家同时打开时把服务端打满
  const delay = Math.min(RECONNECT_BASE_MS * 2 ** reconnectAttempt, RECONNECT_MAX_MS);
  reconnectAttempt += 1;
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null;
    openSocket();
  }, delay);
}

function openSocket(): void {
  if (disposed || state.conversationId === null || state.creationOid === null) {
    return;
  }
  closeSocket();

  const ws = new WebSocket(gameWebSocketUrl(state.conversationId, state.creationOid));
  socket = ws;

  ws.onopen = () => {
    reconnectAttempt = 0;
    setState({ status: 'connected', error: null });
  };

  ws.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data as string) as { type?: string; data?: unknown };
      if (payload.type !== 'message.created' || !payload.data) {
        return;
      }
      pushMessage(toChatMessage(payload.data as Message));
    } catch {
      // 忽略无法解析的帧，不影响后续消息
    }
  };

  ws.onclose = () => {
    if (socket === ws) {
      socket = null;
    }
    if (!disposed) {
      setState({ status: 'connecting' });
      scheduleReconnect();
    }
  };

  ws.onerror = () => {
    // 关闭事件会紧随其后触发重连，这里不重复处理
  };
}

function closeSocket(): void {
  if (socket) {
    socket.onclose = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.close();
    socket = null;
  }
}

/**
 * 接入指定群聊。会校验该群确实绑定了当前作品。
 *
 * @returns 成功返回 null，失败返回可直接展示给开发者的错误信息。
 */
export async function startGameChat(conversationId: number, creationOid?: string): Promise<string | null> {
  const oid = (creationOid || detectCreationOid() || '').trim().toLowerCase();
  if (!oid) {
    const reason = '无法识别当前作品。游戏模式需要在 CCW 作品页运行（编辑器预览中拿不到作品 ID）。';
    setState({ status: 'error', error: reason });
    return reason;
  }
  if (!Number.isFinite(conversationId) || conversationId <= 0) {
    const reason = '群号无效。';
    setState({ status: 'error', error: reason });
    return reason;
  }

  disposed = false;
  reconnectAttempt = 0;
  clearReconnect();
  closeSocket();
  setState({ status: 'connecting', conversationId, creationOid: oid, error: null, messages: [] });

  try {
    applySession(await getGameSession(conversationId, oid, getGameAuth().token));
  } catch (error) {
    const reason =
      error instanceof ApiError
        ? error.message
        : '接入失败，请检查网络以及该群是否已开启游戏模式并绑定本作品。';
    setState({ status: 'error', error: reason });
    return reason;
  }

  openSocket();
  return null;
}

export function stopGameChat(): void {
  disposed = true;
  clearReconnect();
  closeSocket();
  state = { ...INITIAL, messages: [] };
  for (const listener of stateListeners) {
    listener(state);
  }
}

/** 授权状态变化后刷新会话，让 canSend 与「自己发的消息」判定跟上。 */
export async function refreshGameSession(): Promise<void> {
  if (state.conversationId === null || state.creationOid === null) {
    return;
  }
  try {
    applySession(await getGameSession(state.conversationId, state.creationOid, getGameAuth().token));
  } catch {
    // 刷新失败时保留现有状态，socket 仍在推送新消息
  }
}

export type GameSendResult = 'sent' | 'unauthorized' | 'not-connected' | 'failed';

export async function sendGameChatMessage(content: string): Promise<GameSendResult> {
  const text = content.trim();
  if (!text) {
    return 'failed';
  }
  if (state.conversationId === null || state.creationOid === null || state.status === 'error') {
    return 'not-connected';
  }
  if (!isGameAuthorized()) {
    return 'unauthorized';
  }

  const token = getGameAuth().token as string;
  try {
    const message = await sendGameChatWithRetry(state.conversationId, state.creationOid, text, token);
    // 自己发的消息本地立即上屏，不等 WebSocket 回声
    pushMessage(toChatMessage(message));
    return 'sent';
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return 'unauthorized';
    }
    setState({ error: error instanceof Error ? error.message : '发送失败' });
    return 'failed';
  }
}

async function sendGameChatWithRetry(
  conversationId: number,
  creationOid: string,
  content: string,
  token: string
): Promise<Message> {
  try {
    return await sendGameMessage(conversationId, creationOid, content, token);
  } catch (error) {
    // 令牌可能刚过期，静默续期一次再重试
    if (error instanceof ApiError && error.status === 401 && (await refreshGameAuthAfterFailure(error))) {
      return sendGameMessage(conversationId, creationOid, content, getGameAuth().token as string);
    }
    throw error;
  }
}
