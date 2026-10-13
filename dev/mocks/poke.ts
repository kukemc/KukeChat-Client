import type { QueryClient } from '@tanstack/react-query';
import { isRecord } from '@/api/normalizers';
import { applyCreatedMessageToConversations, upsertMessageIntoFirstPage, type MessagesInfiniteData } from '@/realtime/cache';
import { emitPoke } from '@/realtime/poke';
import { useKukeStore } from '@/store/kukeStore';
import { useModerationStore } from '@/store/moderationStore';
import type { Conversation, Message, PokeOptions, User } from '@/types/api';
import { json, type MockHandler } from './types';

/*
 * 戳一戳的假实现。
 *
 * 和真服务端一样，戳一戳落成一条 type = 'system' 的消息；这里另外把它们存进 localStorage，
 * 刷新预览页后还在（地址带 ?pokes=reset 清空）。预览页没有 WebSocket，头像抖动由这里直接派发。
 *
 * 想看各种报错：
 *   · 10 秒内戳同一个人两次 / 一分钟内戳满 6 次      → 429 poke_rate_limited
 *   · 在「PICO PARK」（3 号会话，全员禁言）里戳人      → 403 poke_muted
 *   · 先点「切换禁言状态」再戳                        → 403 account_muted
 *   · 设置里后缀带「违规」两个字                      → 422 poke_suffix_rejected
 */

const OPTIONS: PokeOptions = { actions: ['戳', '拍', '摸', '亲', '抱', '捏', '揉', '贴', '蹭', '敲', '挠', '咬'], default_action: '戳', suffix_max_length: 16 };
const SYSTEM_EVENT = 'conversation.member.poked';
const STORAGE_KEY = 'kukechat-harness-pokes';
const STORED_LIMIT = 30;
const MUTED_CONVERSATION_ID = 3;
const PAIR_COOLDOWN_MS = 10_000;
const ACTOR_LIMIT_PER_MINUTE = 6;

/** 预览页里几位群友自己设置的动作和后缀；没列出来的人是默认的「戳」、没有后缀。 */
const PROFILES: Record<number, { poke_action: string; poke_suffix: string }> = {
  2: { poke_action: '拍', poke_suffix: '的小脑袋' },
  3: { poke_action: '摸', poke_suffix: '的呆毛' },
  5: { poke_action: '抱', poke_suffix: '并顺走了一包薯片和半瓶可乐' }
};

type StoredPoke = Pick<Message, 'conversation_id' | 'sender_id' | 'content' | 'metadata' | 'created_at'>;

let users: User[] = [];
let history: Record<number, Message[]> = {};
let allocateId: () => number = () => Date.now();
/** 我发起的戳一戳：时间和对象，用来算频率限制 */
const sent: Array<{ at: number; conversationId: number; userId: number }> = [];
let incomingRound = 0;

function fail(status: number, code: string, message: string, extra: Record<string, unknown> = {}): Response {
  return json({ detail: { code, message, ...extra } }, status);
}

function nameOf(user: User): string {
  return user.nickname?.trim() || user.username;
}

function readStored(): StoredPoke[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]') as unknown;
    return Array.isArray(parsed) ? parsed as StoredPoke[] : [];
  } catch {
    return [];
  }
}

function remember(message: Message): void {
  try {
    const { conversation_id, sender_id, content, metadata, created_at } = message;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...readStored(), { conversation_id, sender_id, content, metadata, created_at }].slice(-STORED_LIMIT)));
  } catch {
    // 存不进去就只在本次打开期间有效
  }
}

/** 把一条戳一戳写进预览页的假历史，返回完整的消息。 */
function append(poke: StoredPoke): Message {
  const message = { ...poke, id: allocateId(), type: 'system', sender: users.find((user) => user.id === poke.sender_id) ?? null } as Message;
  (history[message.conversation_id] ??= []).push(message);
  return message;
}

function compose(conversationId: number, actor: User, target: User, action: string, suffix: string, createdAt = new Date().toISOString()): StoredPoke {
  const text = `${nameOf(actor)} ${action}了${action} ${nameOf(target)}`;
  return {
    conversation_id: conversationId,
    sender_id: actor.id,
    content: suffix ? `${text} ${suffix}` : text,
    metadata: { system_event: SYSTEM_EVENT, actor_id: actor.id, user_id: target.id, action, suffix, actor_name: nameOf(actor), user_name: nameOf(target) },
    created_at: createdAt
  };
}

function shake(message: Message): void {
  const metadata = message.metadata ?? {};
  window.setTimeout(() => emitPoke({
    conversationId: message.conversation_id,
    actorId: Number(metadata.actor_id),
    userId: Number(metadata.user_id),
    actorName: String(metadata.actor_name),
    userName: String(metadata.user_name)
  }), 60);
}

/**
 * 预览页启动时调用一次：给群友补上各自的戳一戳设置，并往假历史里放几条戳一戳记录
 * （自己戳别人、别人戳自己、带 / 不带后缀、metadata 缺失的旧消息、已撤回的），再接上之前存下来的。
 */
export function attachPokeMock(target: Record<number, Message[]>, people: User[], nextId: () => number): void {
  history = target;
  users = people;
  allocateId = nextId;
  people.forEach((user) => Object.assign(user, PROFILES[user.id]));
  if (new URLSearchParams(window.location.search).get('pokes') === 'reset') {
    window.localStorage.removeItem(STORAGE_KEY);
  }

  const [me, aqua, mint, , long] = people;
  const ago = (seconds: number): string => new Date(Date.now() - seconds * 1000).toISOString();
  const seeds: StoredPoke[] = [
    compose(1, me, aqua, '拍', PROFILES[2].poke_suffix, ago(88)),
    compose(1, mint, me, '戳', '', ago(80)),
    compose(1, aqua, mint, '摸', PROFILES[3].poke_suffix, ago(72)),
    compose(1, long, me, '抱', '并顺走了一包薯片', ago(64)),
    // 旧客户端时期的记录：没有 metadata，或者 metadata 不完整，都退回显示 content
    { conversation_id: 1, sender_id: aqua.id, content: '阿夸 戳了戳 薄荷糖', metadata: null, created_at: ago(56) },
    { conversation_id: 1, sender_id: aqua.id, content: '阿夸 戳了戳 酷可mc', metadata: { system_event: SYSTEM_EVENT, actor_id: aqua.id, user_id: me.id }, created_at: ago(48) },
    compose(1, me, long, '抱', PROFILES[5].poke_suffix, ago(40)),
    compose(2, aqua, me, '戳', '', ago(30))
  ];
  seeds.forEach(append);
  Object.assign(append(compose(1, mint, aqua, '拍', PROFILES[2].poke_suffix, ago(20))), { recalled_at: ago(10) });
  readStored().filter((poke) => typeof poke?.conversation_id === 'number' && typeof poke.content === 'string').forEach(append);
}

/** 预览控制里的「被戳一下」：轮流模拟别人戳我、别人互相戳。消息直接写进缓存，相当于收到了 message.created。 */
export function receivePoke(queryClient: QueryClient): void {
  const me = useKukeStore.getState().currentUser;
  const activeId = useKukeStore.getState().activeConversationId;
  const [, aqua, mint, , long] = users;
  if (!me || !aqua) {
    return;
  }
  const conversationId = activeId === 2 ? 2 : 1;
  const rounds: Array<[User, User]> = conversationId === 2 ? [[aqua, me]] : [[aqua, me], [mint, long], [long, me], [aqua, mint]];
  const [actor, target] = rounds[incomingRound % rounds.length];
  incomingRound += 1;
  const message = append(compose(conversationId, actor, target, target.poke_action || OPTIONS.default_action, target.poke_suffix ?? ''));
  remember(message);
  queryClient.setQueryData<MessagesInfiniteData | undefined>(['messages', conversationId], (current) => upsertMessageIntoFirstPage(current, message));
  queryClient.setQueryData<Conversation[] | undefined>(['conversations'], (current) => applyCreatedMessageToConversations(current, message, useKukeStore.getState().visibleConversationId));
  shake(message);
}

function poke(conversationId: number, userId: number, body: unknown): Response {
  const me = useKukeStore.getState().currentUser;
  const target = users.find((user) => user.id === userId);
  if (!me || !target) {
    return json({ detail: 'Member not found' }, 404);
  }
  if (userId === me.id) {
    return json({ detail: 'Cannot poke yourself' }, 400);
  }
  const mutedUntil = useModerationStore.getState().mutedUntil;
  if (mutedUntil && new Date(mutedUntil).getTime() > Date.now()) {
    return fail(403, 'account_muted', '你已被禁言，暂时不能发布内容', { muted_until: mutedUntil, reason: useModerationStore.getState().muteReason });
  }
  if (conversationId === MUTED_CONVERSATION_ID) {
    return fail(403, 'poke_muted', '你在这个群里被禁言了，不能戳一戳');
  }
  const requested = isRecord(body) && typeof body.action === 'string' ? body.action.trim() : '';
  if (requested && !OPTIONS.actions.includes(requested)) {
    return fail(422, 'invalid_poke_action', '不支持这个动作，请从预设里选一个');
  }
  const now = Date.now();
  const recent = sent.filter((item) => item.conversationId === conversationId && now - item.at < 60_000);
  if (recent.some((item) => item.userId === userId && now - item.at < PAIR_COOLDOWN_MS)) {
    return fail(429, 'poke_rate_limited', '戳得太快了，等一会儿再戳 TA');
  }
  if (recent.length >= ACTOR_LIMIT_PER_MINUTE) {
    return fail(429, 'poke_rate_limited', '戳得太频繁了，歇一会儿吧');
  }
  sent.push({ at: now, conversationId, userId });

  // 不带 action 就用对方设置的；后缀始终是对方的
  const message = append(compose(conversationId, me, target, requested || target.poke_action || OPTIONS.default_action, target.poke_suffix ?? ''));
  remember(message);
  shake(message);
  return json(message);
}

function updateSettings(body: Record<string, unknown>): Response {
  const patch: { poke_action?: string; poke_suffix?: string } = {};
  if ('poke_action' in body) {
    const action = typeof body.poke_action === 'string' ? body.poke_action.trim() : '';
    if (action && !OPTIONS.actions.includes(action)) {
      return fail(422, 'invalid_poke_action', '不支持这个动作，请从预设里选一个');
    }
    patch.poke_action = action || OPTIONS.default_action;
  }
  if ('poke_suffix' in body) {
    const suffix = typeof body.poke_suffix === 'string' ? body.poke_suffix.replace(/\s+/g, ' ').trim() : '';
    if (Array.from(suffix).length > OPTIONS.suffix_max_length) {
      return fail(422, 'invalid_poke_suffix', `戳一戳文案最多 ${OPTIONS.suffix_max_length} 个字`);
    }
    if (suffix.includes('违规')) {
      return fail(422, 'poke_suffix_rejected', '戳一戳文案未通过审核，请修改后重试');
    }
    patch.poke_suffix = suffix;
  }
  return json({ ...useKukeStore.getState().currentUser, ...body, ...patch });
}

/** 戳一戳 相关接口的假数据。 */
export const pokeMock: MockHandler = ({ path, method, body }) => {
  if (path === '/users/poke-options' && method === 'GET') {
    return json(OPTIONS);
  }
  // 只接带戳一戳字段的资料修改，其余的 PATCH /users/me 留给后面的处理函数
  if (path === '/users/me' && method === 'PATCH' && isRecord(body) && ('poke_action' in body || 'poke_suffix' in body)) {
    return updateSettings(body);
  }
  const match = path.match(/^\/conversations\/(\d+)\/members\/(\d+)\/poke$/);
  return match && method === 'POST' ? poke(Number(match[1]), Number(match[2]), body) : undefined;
};
