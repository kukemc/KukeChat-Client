import { isRecord } from '@/api/normalizers';
import type { Message, User } from '@/types/api';
import { shopScenario } from './shop';
import { json, type MockHandler } from './types';

/*
 * 红包接口（前缀 /red-packets）的假实现，状态只存在内存里，刷新页面就没了。
 * 余额和商店的假后端是同一份：发红包记在 shopScenario.spent 上（发出加、抢到和退回减），GET /shop 的余额跟着变。
 * 场景写在 redPacketScenario 上，预览页（dev/shop-harness.tsx）的控制条和地址参数改的就是它。
 *
 * 和契约对齐的几处：回包里的 balance 是商店那种余额对象；GET /mine 发出的每一项是红包对象（多一个 refunded_amount），
 * 收到的是 { amount, created_at, red_packet }；关着总开关（backend: disabled）只是不能发，已经发出去的照常能领。
 * 会话对象上的 red_packet_pending 由 redPacketState.pending 算，预览页在返回会话列表时带上。
 */

export interface RedPacketScenario {
  /** ok 正常；disabled 接口在但开关关着（enabled: false）；missing 旧后端，没有这些接口（404） */
  backend: 'ok' | 'disabled' | 'missing';
  /** 发红包时强制返回的错误；none 表示按真实规则来 */
  sendError: 'none' | 'disabled' | 'not_member' | 'muted' | 'ccw_not_bound' | 'invalid_amount' | 'invalid_count' | 'invalid_kind' | 'greeting_rejected' | 'insufficient_balance' | 'daily_limit' | 'verification_unavailable' | 'server';
  /** 抢红包时强制返回的错误 */
  claimError: 'none' | 'not_member' | 'muted' | 'own_packet' | 'already_claimed' | 'finished' | 'expired' | 'revoked' | 'server';
  limits: { max_total: number; max_count: number; min_each: number; daily_send_limit: number; expire_hours: number };
  sentToday: number;
  delay: number;
}

export const redPacketScenario: RedPacketScenario = {
  backend: 'ok',
  sendError: 'none',
  claimError: 'none',
  limits: { max_total: 500, max_count: 100, min_each: 1, daily_send_limit: 20, expire_hours: 24 },
  sentToday: 2,
  delay: 260
};

type Status = 'active' | 'finished' | 'expired' | 'revoked';

interface MockClaim {
  userId: number;
  amount: number;
  created_at: string;
}

interface MockPacket {
  id: number;
  kind: 'normal' | 'lucky';
  greeting: string;
  senderId: number;
  conversation_id: number;
  message_id: number;
  total: number;
  count: number;
  /** 还没被领走的那几份，领一个弹出一份 */
  shares: number[];
  claims: MockClaim[];
  status: Status;
  created_at: string;
  expires_at: string;
  finished_at: string | null;
  /** 过期、撤回时退回给发的人的 */
  refunded: number;
}

/** 拼手气的分法（二倍均值）：每一份在 [min, 剩余平均的两倍] 里随机，保证后面的人至少还有 min。 */
export function splitLucky(total: number, count: number, min: number): number[] {
  const shares: number[] = [];
  let left = total;
  for (let remaining = count; remaining > 1; remaining -= 1) {
    const ceiling = Math.max(min, Math.min(left - min * (remaining - 1), Math.floor((left / remaining) * 2)));
    const share = min + Math.floor(Math.random() * (ceiling - min + 1));
    shares.push(share);
    left -= share;
  }
  shares.push(left);
  return shares;
}

const packets = new Map<number, MockPacket>();
const users = new Map<number, User>();
const directConversations = new Set<number>();
let meId = 1;
let nextPacketId = 700;
let nextMessageId = 9000;
/** 新的红包消息交给谁（预览页把它放进会话的历史里） */
let deliver: (message: Message) => void = () => undefined;

/** 发过哪些红包请求，给自动化脚本核对用（一屏很多红包时数请求数） */
export const redPacketRequests: Array<{ method: string; path: string; body: unknown }> = [];

function fail(status: number, code: string, message: string, extra: Record<string, unknown> = {}): Response {
  return json({ detail: { code, message, ...extra } }, status);
}

function currentBalance(): number {
  return shopScenario.bound ? shopScenario.donated - shopScenario.spent : 0;
}

function balancePayload(): unknown {
  return { bound: shopScenario.bound, donated: shopScenario.donated, spent: shopScenario.spent, balance: currentBalance(), verified_at: new Date().toISOString(), stale: false };
}

function userOf(id: number): User {
  return users.get(id) ?? ({ id, username: `user${id}`, nickname: `用户 ${id}` } as User);
}

/** 过了有效期的顺手标成过期，没领完的退回给发的人 */
function settle(packet: MockPacket): void {
  if (packet.status === 'active' && new Date(packet.expires_at).getTime() <= Date.now()) {
    end(packet, 'expired');
  }
}

function end(packet: MockPacket, status: 'expired' | 'revoked'): void {
  if (packet.status !== 'active') {
    return;
  }
  packet.status = status;
  const refund = packet.shares.reduce((sum, share) => sum + share, 0);
  packet.shares = [];
  packet.refunded = refund;
  if (packet.senderId === meId) {
    shopScenario.spent -= refund;
  }
}

function view(packet: MockPacket, viewerId = meId): Record<string, unknown> {
  settle(packet);
  const mine = packet.claims.find((claim) => claim.userId === viewerId);
  const open = Boolean(mine) || packet.senderId === viewerId || packet.status !== 'active';
  const top = packet.kind === 'lucky' && packet.count > 1 && packet.status === 'finished' ? Math.max(...packet.claims.map((claim) => claim.amount)) : null;
  const luckiest = top === null ? undefined : packet.claims.find((claim) => claim.amount === top);
  return {
    id: packet.id,
    kind: packet.kind,
    greeting: packet.greeting,
    sender: userOf(packet.senderId),
    conversation_id: packet.conversation_id,
    message_id: packet.message_id,
    total: open ? packet.total : null,
    count: packet.count,
    claimed_count: packet.claims.length,
    claimed_amount: open ? packet.claims.reduce((sum, claim) => sum + claim.amount, 0) : null,
    status: packet.status,
    my_claim: mine ? { amount: mine.amount, created_at: mine.created_at } : null,
    expires_at: packet.expires_at,
    created_at: packet.created_at,
    finished_at: packet.finished_at,
    claims: open ? packet.claims.map((claim) => ({ user: userOf(claim.userId), amount: claim.amount, created_at: claim.created_at, is_luckiest: claim === luckiest })) : null
  };
}

/** 实时事件 red_packet.updated 的 data（不带金额） */
function updateOf(packet: MockPacket): Record<string, unknown> {
  return { id: packet.id, conversation_id: packet.conversation_id, message_id: packet.message_id, claimed_count: packet.claims.length, count: packet.count, status: packet.status };
}

function messageOf(packet: MockPacket): Message {
  return {
    id: packet.message_id,
    conversation_id: packet.conversation_id,
    sender_id: packet.senderId,
    sender: userOf(packet.senderId),
    type: 'red_packet',
    // 给旧客户端的兜底文字
    content: `[红包] ${packet.greeting}（当前版本不支持，请更新客户端后领取）`,
    metadata: { red_packet: { id: packet.id, kind: packet.kind, greeting: packet.greeting, count: packet.count } },
    created_at: packet.created_at,
    sender_level: ((packet.senderId * 7) % 30) + 1
  } as Message;
}

interface CreateOptions {
  senderId: number;
  conversationId: number;
  kind: 'normal' | 'lucky';
  /** normal 是单个金额，lucky 是总额（和接口一样） */
  amount: number;
  count: number;
  greeting?: string;
  /** 多少分钟之前发的 */
  minutesAgo?: number;
  messageId?: number;
}

function create(options: CreateOptions): MockPacket {
  const total = options.kind === 'normal' ? options.amount * options.count : options.amount;
  const createdAt = Date.now() - (options.minutesAgo ?? 0) * 60_000;
  nextPacketId += 1;
  nextMessageId += 1;
  const packet: MockPacket = {
    id: nextPacketId,
    kind: options.kind,
    greeting: options.greeting?.trim() || '恭喜发财',
    senderId: options.senderId,
    conversation_id: options.conversationId,
    message_id: options.messageId ?? nextMessageId,
    total,
    count: options.count,
    shares: options.kind === 'normal' ? Array.from({ length: options.count }, () => options.amount) : splitLucky(total, options.count, redPacketScenario.limits.min_each),
    claims: [],
    status: 'active',
    created_at: new Date(createdAt).toISOString(),
    expires_at: new Date(createdAt + redPacketScenario.limits.expire_hours * 3600_000).toISOString(),
    finished_at: null,
    refunded: 0
  };
  packets.set(packet.id, packet);
  return packet;
}

function take(packet: MockPacket, userId: number, secondsAfter?: number): MockClaim | null {
  const amount = packet.shares.shift();
  if (amount === undefined) {
    return null;
  }
  const at = secondsAfter === undefined ? Date.now() : new Date(packet.created_at).getTime() + secondsAfter * 1000;
  const claim = { userId, amount, created_at: new Date(at).toISOString() };
  packet.claims.push(claim);
  if (userId === meId) {
    shopScenario.spent -= amount;
  }
  if (packet.shares.length === 0) {
    packet.status = 'finished';
    packet.finished_at = claim.created_at;
  }
  return claim;
}

/** 预览页用：直接摆布红包的状态，返回值是该跟着发的 red_packet.updated 事件 data */
export const redPacketState = {
  setup(options: { me: number; people: User[]; direct: number[]; onMessage: (message: Message) => void }): void {
    meId = options.me;
    options.people.forEach((user) => users.set(user.id, user));
    options.direct.forEach((id) => directConversations.add(id));
    deliver = options.onMessage;
  },
  /** 造一个红包（不扣币，不发消息），返回它的消息对象，放进历史里 */
  seed(options: CreateOptions & { claimedBy?: number[]; status?: 'expired' | 'revoked' }): Message {
    // 摆出来的初始状态不动余额：余额以地址参数 / 控制条给的为准
    const spent = shopScenario.spent;
    const packet = create(options);
    (options.claimedBy ?? []).forEach((userId, index) => take(packet, userId, 4 + index * 7));
    shopScenario.spent = spent;
    if (options.status === 'expired') {
      packet.expires_at = new Date(Date.now() - 60_000).toISOString();
      end(packet, 'expired');
    } else if (options.status === 'revoked') {
      end(packet, 'revoked');
    }
    return messageOf(packet);
  },
  /** 别人发来一个红包：返回消息对象（预览页自己把它推进缓存） */
  receive(options: CreateOptions): Message {
    return messageOf(create(options));
  },
  /** 最新的那个还能领的红包 */
  latestActive(conversationId?: number): number | null {
    packets.forEach(settle);
    const active = [...packets.values()].filter((packet) => packet.status === 'active' && (conversationId === undefined || packet.conversation_id === conversationId));
    return active.length > 0 ? active[active.length - 1].id : null;
  },
  /** 让一个还没领过的别人领一份 */
  claimByOther(packetId: number): Record<string, unknown> | null {
    const packet = packets.get(packetId);
    if (!packet || packet.status !== 'active') {
      return null;
    }
    const candidate = [...users.keys()].find((id) => id !== meId && id !== packet.senderId && !packet.claims.some((claim) => claim.userId === id))
      ?? 1000 + packet.claims.length;
    take(packet, candidate);
    return updateOf(packet);
  },
  expire(packetId: number): Record<string, unknown> | null {
    const packet = packets.get(packetId);
    if (!packet || packet.status !== 'active') {
      return null;
    }
    packet.expires_at = new Date(Date.now() - 1000).toISOString();
    end(packet, 'expired');
    return updateOf(packet);
  },
  revoke(packetId: number): Record<string, unknown> | null {
    const packet = packets.get(packetId);
    if (!packet || packet.status !== 'active') {
      return null;
    }
    end(packet, 'revoked');
    return updateOf(packet);
  },
  /** 几秒之后过期（看卡片自己到点变成「已过期」） */
  expireIn(packetId: number, seconds: number): void {
    const packet = packets.get(packetId);
    if (packet) {
      packet.expires_at = new Date(Date.now() + seconds * 1000).toISOString();
    }
  },
  /** 这个会话里有没有我还能领的红包：会话对象上的 red_packet_pending */
  pending(conversationId: number): boolean {
    packets.forEach(settle);
    return [...packets.values()].some((packet) => packet.conversation_id === conversationId && packet.status === 'active' && !packet.claims.some((claim) => claim.userId === meId) && !(packet.senderId === meId && directConversations.has(conversationId)));
  },
  get(packetId: number): Record<string, unknown> | null {
    const packet = packets.get(packetId);
    return packet ? view(packet) : null;
  }
};

function send(body: unknown): Response {
  const forced = redPacketScenario.sendError;
  const limits = redPacketScenario.limits;
  if (forced === 'server') {
    return json({ detail: 'Internal Server Error' }, 500);
  }
  const source = isRecord(body) ? body : {};
  const conversationId = typeof source.conversation_id === 'number' ? source.conversation_id : 0;
  const kind = source.kind === 'lucky' ? 'lucky' : source.kind === 'normal' ? 'normal' : null;
  const amount = typeof source.amount === 'number' ? source.amount : NaN;
  const count = typeof source.count === 'number' ? source.count : NaN;
  const greeting = typeof source.greeting === 'string' ? source.greeting : '';
  const direct = directConversations.has(conversationId);

  if (forced === 'disabled' || redPacketScenario.backend === 'disabled') {
    return fail(403, 'disabled', '红包功能未开放');
  }
  if (forced === 'not_member') {
    return fail(403, 'not_member', '你不在这个会话里');
  }
  if (forced === 'muted') {
    return fail(403, 'muted', '你已被禁言');
  }
  if (forced === 'ccw_not_bound' || !shopScenario.bound) {
    return fail(403, 'ccw_not_bound', '还没有绑定 CCW 账号');
  }
  if (forced === 'invalid_kind' || kind === null || (direct && kind !== 'normal')) {
    return fail(422, 'invalid_kind', '红包种类不对');
  }
  if (forced === 'invalid_count' || !Number.isInteger(count) || count < 1 || count > limits.max_count || (direct && count !== 1)) {
    return fail(422, 'invalid_count', '红包个数不对');
  }
  const total = kind === 'normal' ? amount * count : amount;
  if (forced === 'invalid_amount' || !Number.isInteger(amount) || amount < 1 || total > limits.max_total || total < count * limits.min_each) {
    return fail(422, 'invalid_amount', '红包金额不对');
  }
  if (forced === 'greeting_rejected' || greeting.length > 30 || /违规/.test(greeting)) {
    return fail(422, 'greeting_rejected', '祝福语没有通过审核');
  }
  if (forced === 'daily_limit' || redPacketScenario.sentToday >= limits.daily_send_limit) {
    return fail(429, 'daily_limit', '今天发红包的次数用完了');
  }
  if (forced === 'verification_unavailable' || shopScenario.noDonateUrl) {
    return fail(503, 'verification_unavailable', 'CCW 接口暂时不通，稍后再试');
  }
  const balance = currentBalance();
  if (forced === 'insufficient_balance' || balance < total) {
    // 强制「余额不够」时模拟的是：服务端重新核实后发现币比客户端以为的少
    const actual = forced === 'insufficient_balance' ? Math.min(balance, Math.max(0, total - 30)) : balance;
    if (forced === 'insufficient_balance') {
      shopScenario.donated -= balance - actual;
    }
    return fail(402, 'insufficient_balance', '金币不够', { balance: actual, shortfall: total - actual });
  }
  const packet = create({ senderId: meId, conversationId, kind, amount, count, greeting });
  shopScenario.spent += total;
  redPacketScenario.sentToday += 1;
  const message = messageOf(packet);
  deliver(message);
  return json({ red_packet: view(packet), message, balance: balancePayload() });
}

function claim(packet: MockPacket | undefined): Response {
  const forced = redPacketScenario.claimError;
  if (forced === 'server') {
    return json({ detail: 'Internal Server Error' }, 500);
  }
  if (!packet) {
    return json({ detail: 'Not Found' }, 404);
  }
  settle(packet);
  // 关着总开关不影响领
  if (forced === 'not_member') {
    return fail(403, 'not_member', '你不在这个会话里');
  }
  if (forced === 'muted') {
    return fail(403, 'muted', '你已被禁言');
  }
  if (forced === 'own_packet' || (packet.senderId === meId && directConversations.has(packet.conversation_id))) {
    return fail(403, 'own_packet', '不能领自己发的红包');
  }
  if (forced === 'already_claimed' || packet.claims.some((item) => item.userId === meId)) {
    // 强制「已经领过」时把它做成真的：我其实在别的设备上领过了
    if (!packet.claims.some((item) => item.userId === meId)) {
      take(packet, meId);
    }
    return fail(409, 'already_claimed', '已经领过这个红包了');
  }
  if (forced === 'finished' || packet.status === 'finished') {
    // 强制「抢完了」：别人把剩下的都领走了
    while (packet.status === 'active' && packet.shares.length > 0) {
      take(packet, 1000 + packet.claims.length);
    }
    return fail(410, 'finished', '红包已经被抢完了');
  }
  if (forced === 'expired' || packet.status === 'expired') {
    packet.expires_at = new Date(Date.now() - 1000).toISOString();
    end(packet, 'expired');
    return fail(410, 'expired', '红包已过期');
  }
  if (forced === 'revoked' || packet.status === 'revoked') {
    end(packet, 'revoked');
    return fail(410, 'revoked', '红包已被撤回');
  }
  const taken = take(packet, meId);
  if (!taken) {
    return fail(410, 'finished', '红包已经被抢完了');
  }
  return json({ amount: taken.amount, red_packet: view(packet), balance: balancePayload() });
}

export const redPacketsMock: MockHandler = async ({ path, url, method, body }) => {
  if (!path.startsWith('/red-packets')) {
    return undefined;
  }
  redPacketRequests.push({ method, path, body });
  await new Promise((resolve) => window.setTimeout(resolve, redPacketScenario.delay));
  if (redPacketScenario.backend === 'missing') {
    return json({ detail: 'Not Found' }, 404);
  }
  if (path === '/red-packets/config' && method === 'GET') {
    return json({ enabled: redPacketScenario.backend === 'ok', limits: redPacketScenario.limits, sent_today: redPacketScenario.sentToday });
  }
  if (path === '/red-packets' && method === 'POST') {
    return send(body);
  }
  if (path === '/red-packets/mine' && method === 'GET') {
    const limit = Number(url.searchParams.get('limit') ?? 20);
    const offset = Number(url.searchParams.get('offset') ?? 0);
    const all = [...packets.values()].reverse();
    if (url.searchParams.get('direction') === 'sent') {
      const sent = all.filter((packet) => packet.senderId === meId);
      return json({ items: sent.slice(offset, offset + limit).map((packet) => ({ ...view(packet), refunded_amount: packet.refunded })), total: sent.length, sum: sent.reduce((sum, packet) => sum + packet.total, 0) });
    }
    const received = all.flatMap((packet) => packet.claims.filter((item) => item.userId === meId).map((item) => ({ amount: item.amount, created_at: item.created_at, red_packet: view(packet) })));
    return json({ items: received.slice(offset, offset + limit), total: received.length, sum: received.reduce((sum, item) => sum + item.amount, 0) });
  }
  const claimMatch = path.match(/^\/red-packets\/(\d+)\/claim$/);
  if (claimMatch && method === 'POST') {
    return claim(packets.get(Number(claimMatch[1])));
  }
  const detailMatch = path.match(/^\/red-packets\/(\d+)$/);
  if (detailMatch && method === 'GET') {
    const packet = packets.get(Number(detailMatch[1]));
    return packet ? json(view(packet)) : json({ detail: 'Not Found' }, 404);
  }
  return json({ detail: 'Not Found' }, 404);
};
