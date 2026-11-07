import type { QueryClient } from '@tanstack/react-query';
import { markConversationRead } from '@/api/messages';
import type { Conversation } from '@/types/api';
import { isKnownSelfConversationId, markSelfSeen } from './selfChatStore';

/**
 * 已读状态「客户端优先」。
 *
 * 打开一个会话的瞬间就应该清掉它的未读数，而不是等「标记已读」请求在服务端落地、
 * 会话列表重新拉回来之后。这里记下每个会话本机已经读到哪条消息：
 * 之后任何一次从服务端拿到的会话数据，只要它的最后一条消息没超过这个位置，未读数一律按 0 处理。
 * 这样即使标记已读的请求还在路上、或者中途有别的刷新先回来了，红点也不会闪回来。
 */
const readUpTo = new Map<number, number>();

function isLocallyRead(conversation: Conversation): boolean {
  const mark = readUpTo.get(conversation.id);
  return mark !== undefined && (conversation.last_message?.id ?? 0) <= mark;
}

/** 给从服务端拿到的会话数据套上本机的已读位置。 */
export function applyLocalReadMarks(conversations: Conversation[]): Conversation[] {
  // 「[有人@我]」是未读消息里的 @，跟着未读数一起清
  return conversations.map((conversation) => ((conversation.unread_count || conversation.mention_pending) && isLocallyRead(conversation) ? { ...conversation, unread_count: 0, mention_pending: null } : conversation));
}

/** 这次运行里本机把这个会话读到了哪条（会话数据里的 my_last_read_message_id 不跟着本机标已读更新，可能是旧的） */
export function localReadMarkOf(conversationId: number): number | null {
  return readUpTo.get(conversationId) ?? null;
}

/**
 * 把一个会话标记为已读：先改本机状态和缓存（界面立刻更新），再通知服务端。
 *
 * @param lastMessageId 已经读到的最后一条消息；还没拿到消息列表时可以不传，会用会话自己的最后一条。
 * @param options.after 通知服务端之前先等它落定（进会话时要先问服务端「已读位置之后有哪些 @我」，见 MessageList）；本机状态照样立刻改。
 */
export function markConversationReadLocally(queryClient: QueryClient, conversationId: number, lastMessageId?: number | null, options: { after?: Promise<unknown> | null } = {}): void {
  const cached = queryClient.getQueryData<Conversation[]>(['conversations'])?.find((conversation) => conversation.id === conversationId);
  const mark = Math.max(lastMessageId ?? 0, cached?.last_message?.id ?? 0, readUpTo.get(conversationId) ?? 0);
  readUpTo.set(conversationId, mark);
  if (cached?.unread_count || cached?.mention_pending) {
    queryClient.setQueryData<Conversation[] | undefined>(['conversations'], (current) => current?.map((conversation) => (
      conversation.id === conversationId ? { ...conversation, unread_count: 0, mention_pending: null } : conversation
    )));
  }
  // 「我的设备」的未读是本机算的（selfChatStore），服务端不按设备记已读，标不标都一样（self-chat.md 3.3）
  if (cached?.type === 'self' || isKnownSelfConversationId(conversationId)) {
    markSelfSeen(mark);
    return;
  }
  // 通知服务端这一步节流、去重，见下面的 queueReadPost
  const readId = lastMessageId ?? cached?.last_message?.id ?? null;
  queueReadPost(queryClient, conversationId, readId, options.after ?? null);
}

/**
 * 「标记已读」请求的节流。
 *
 * 大群里每来一条消息，正开着这个群的每个人都会把已读位置往后挪一次；以前每次都发一个 POST，
 * 一百个人在线就是每条消息一百个请求。现在：
 * - 每个会话记着发出去过的最大已读位置，不超过它的不再发；
 * - 每个会话最多每 READ_POST_INTERVAL_MS 发一次，期间攒着的取最大那条，到点再发（第一次立刻发）；
 * - 页面不可见时不发（本机的未读照样立刻清），切回来再补发；切走的那一刻把之前攒着的先发掉。
 * 服务端失败也不回滚本机状态：已发位置退回去，下次有新的已读位置时会再发。
 */
const READ_POST_INTERVAL_MS = 3000;

interface ReadPostState {
  /** 服务端已经（或正在）收到的最大已读位置 */
  sent: number;
  /** 攒着还没发的最大已读位置 */
  pending: number | null;
  /** 发之前要等的请求（options.after），攒着的几次都要等 */
  gates: Promise<unknown>[];
  queryClient: QueryClient | null;
  timer: ReturnType<typeof setTimeout> | null;
  lastPostAt: number;
  inFlight: boolean;
}

const readPosts = new Map<number, ReadPostState>();
let visibilityListenerInstalled = false;

function pageHidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState !== 'visible';
}

function readPostStateOf(conversationId: number): ReadPostState {
  let state = readPosts.get(conversationId);
  if (!state) {
    state = { sent: 0, pending: null, gates: [], queryClient: null, timer: null, lastPostAt: 0, inFlight: false };
    readPosts.set(conversationId, state);
  }
  return state;
}

function installVisibilityListener(): void {
  if (visibilityListenerInstalled || typeof document === 'undefined') {
    return;
  }
  visibilityListenerInstalled = true;
  document.addEventListener('visibilitychange', () => {
    for (const [conversationId, state] of readPosts) {
      if (state.pending === null) {
        continue;
      }
      if (document.visibilityState === 'visible') {
        scheduleReadPost(conversationId, state);
      } else {
        // 切走前看到的那些先发掉，不等节流
        if (state.timer !== null) {
          clearTimeout(state.timer);
          state.timer = null;
        }
        void flushReadPost(conversationId, state, true);
      }
    }
  });
}

function queueReadPost(queryClient: QueryClient, conversationId: number, readId: number | null, gate: Promise<unknown> | null): void {
  // 还没有真正的消息 id（空会话、乐观发送的临时消息）就不发；有了真 id 时调用方会再来一次
  if (readId === null || !Number.isSafeInteger(readId) || readId <= 0) {
    return;
  }
  installVisibilityListener();
  const state = readPostStateOf(conversationId);
  if (readId <= state.sent || (state.pending !== null && readId <= state.pending && !gate)) {
    return;
  }
  state.queryClient = queryClient;
  state.pending = Math.max(state.pending ?? 0, readId);
  if (gate) {
    state.gates.push(gate);
  }
  scheduleReadPost(conversationId, state);
}

function scheduleReadPost(conversationId: number, state: ReadPostState): void {
  if (state.timer !== null || state.inFlight || state.pending === null || pageHidden()) {
    return;
  }
  const delay = Math.max(0, state.lastPostAt + READ_POST_INTERVAL_MS - Date.now());
  state.timer = setTimeout(() => {
    state.timer = null;
    void flushReadPost(conversationId, state, false);
  }, delay);
}

async function flushReadPost(conversationId: number, state: ReadPostState, force: boolean): Promise<void> {
  if (state.inFlight || state.pending === null || (!force && pageHidden())) {
    return;
  }
  const readId = state.pending;
  const gates = state.gates;
  const queryClient = state.queryClient;
  state.pending = null;
  state.gates = [];
  if (readId <= state.sent || !queryClient) {
    return;
  }
  const previousSent = state.sent;
  state.sent = readId;
  state.inFlight = true;
  state.lastPostAt = Date.now();
  try {
    // 进会话时要先等「已读位置之后有哪些 @我」的那个请求落定，服务端再挪已读位置
    if (gates.length > 0) {
      await Promise.allSettled(gates);
    }
    state.lastPostAt = Date.now();
    const mentionPending = await markConversationRead(conversationId, readId);
    // 返回里带着读完之后的 mention_pending：读到的位置后面又来了 @我 的消息时它不是 null，以服务端说的为准
    if (mentionPending) {
      queryClient.setQueryData<Conversation[] | undefined>(['conversations'], (current) => current?.map((conversation) => (
        conversation.id === conversationId && (conversation.mention_pending ?? null) !== mentionPending && (conversation.unread_count ?? 0) > 0 ? { ...conversation, mention_pending: mentionPending } : conversation
      )));
    }
  } catch {
    if (state.sent === readId) {
      state.sent = previousSent;
    }
  } finally {
    state.inFlight = false;
    scheduleReadPost(conversationId, state);
  }
}
