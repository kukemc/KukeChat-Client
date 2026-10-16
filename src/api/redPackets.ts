import type { Message, User } from '@/types/api';
import type { ClaimRedPacketResult, PendingRedPacket, RedPacket, RedPacketBalance, RedPacketClaim, RedPacketConfig, RedPacketDirection, RedPacketFeature, RedPacketId, RedPacketKind, RedPacketRecord, RedPacketRecordPage, RedPacketStatus, RedPacketUpdate, SendRedPacketPayload, SendRedPacketResult } from '@/types/redPacket';
import { apiRequest } from './client';
import { isRecord } from './normalizers';
import { DEFAULT_RED_PACKET_GREETING, isRedPacketId as isId } from '@/utils/redPacket';

/**
 * 红包接口。旧后端没有这些接口，GET /red-packets/config 会 404 —— 调用方（components/redpacket/data.ts）把它当成「没有红包」。
 *
 * 响应在这里整理成类型里写的形状：缺字段补默认值、形状不对的丢掉。红包的金额一律是正整数的金币。
 */

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function count(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function nullableCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function nullableText(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function kindOf(value: unknown): RedPacketKind {
  return value === 'lucky' ? 'lucky' : 'normal';
}

const STATUSES: readonly RedPacketStatus[] = ['active', 'finished', 'expired', 'revoked'];

function statusOf(value: unknown): RedPacketStatus | null {
  return STATUSES.find((status) => status === value) ?? null;
}

function userOf(value: unknown): User | null {
  return isRecord(value) && typeof value.id === 'number' ? value as unknown as User : null;
}

/** 专属红包的目标 id：正整数才算 */
function targetIdOf(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

function chainTextOf(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function messageOf(value: unknown): Message | null {
  return isRecord(value) && typeof value.id === 'number' && typeof value.conversation_id === 'number' ? value as unknown as Message : null;
}

function normalizeClaim(value: unknown): RedPacketClaim | null {
  const user = isRecord(value) ? userOf(value.user) : null;
  if (!isRecord(value) || !user) {
    return null;
  }
  return { user, amount: count(value.amount), created_at: text(value.created_at), is_luckiest: value.is_luckiest === true };
}

function notNull<T>(value: T | null): value is T {
  return value !== null;
}

export function normalizeRedPacket(value: unknown): RedPacket | null {
  if (!isRecord(value) || !isId(value.id)) {
    return null;
  }
  const myClaim = isRecord(value.my_claim) ? { amount: count(value.my_claim.amount), created_at: text(value.my_claim.created_at) } : null;
  return {
    id: value.id,
    kind: kindOf(value.kind),
    greeting: text(value.greeting).trim() || DEFAULT_RED_PACKET_GREETING,
    sender: userOf(value.sender),
    chain_text: chainTextOf(value.chain_text),
    target_user_id: targetIdOf(value.target_user_id),
    target: userOf(value.target),
    conversation_id: count(value.conversation_id),
    message_id: count(value.message_id),
    total: nullableCount(value.total),
    count: Math.max(1, count(value.count, 1)),
    claimed_count: Math.max(0, count(value.claimed_count)),
    claimed_amount: nullableCount(value.claimed_amount),
    refunded_amount: nullableCount(value.refunded_amount),
    status: statusOf(value.status) ?? 'active',
    my_claim: myClaim,
    expires_at: nullableText(value.expires_at),
    created_at: text(value.created_at),
    finished_at: nullableText(value.finished_at),
    claims: Array.isArray(value.claims) ? value.claims.map(normalizeClaim).filter(notNull) : null
  };
}

/** 实时事件 red_packet.updated 的 data。 */
export function normalizeRedPacketUpdate(value: unknown): RedPacketUpdate | null {
  const status = isRecord(value) ? statusOf(value.status) : null;
  if (!isRecord(value) || !isId(value.id) || !status) {
    return null;
  }
  return { id: value.id, conversation_id: count(value.conversation_id), message_id: count(value.message_id), claimed_count: Math.max(0, count(value.claimed_count)), count: Math.max(1, count(value.count, 1)), status };
}

function normalizeBalance(value: unknown): RedPacketBalance {
  if (!isRecord(value) || nullableCount(value.balance) === null) {
    return null;
  }
  const patch: NonNullable<RedPacketBalance> = { balance: count(value.balance) };
  if (typeof value.bound === 'boolean') patch.bound = value.bound;
  if (nullableCount(value.donated) !== null) patch.donated = count(value.donated);
  if (nullableCount(value.spent) !== null) patch.spent = count(value.spent);
  if (typeof value.verified_at === 'string') patch.verified_at = value.verified_at;
  if (typeof value.stale === 'boolean') patch.stale = value.stale;
  // 余额里红包、礼物的那几项也跟着换：实时事件没到（断线）的时候，商店页上的明细不会和余额对不上
  for (const key of ['red_packet_sent', 'red_packet_received', 'red_packet_refunded', 'gift_spent'] as const) {
    const part = value[key];
    if (typeof part === 'number' && Number.isFinite(part)) patch[key] = part;
  }
  return patch;
}

/** 契约里的默认上限，回包里缺哪一项就用哪一项的默认值。 */
const DEFAULT_LIMITS = { max_total: 500, max_count: 100, min_each: 1, daily_send_limit: 20, expire_hours: 24 };

const FEATURES: readonly RedPacketFeature[] = ['chain', 'exclusive'];

export async function getRedPacketConfig(): Promise<RedPacketConfig> {
  const response = await apiRequest<unknown>('/red-packets/config');
  const source = isRecord(response) ? response : {};
  const limits = isRecord(source.limits) ? source.limits : {};
  const positive = (value: unknown, fallback: number): number => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback);
  return {
    enabled: source.enabled === true,
    limits: {
      max_total: positive(limits.max_total, DEFAULT_LIMITS.max_total),
      max_count: positive(limits.max_count, DEFAULT_LIMITS.max_count),
      min_each: positive(limits.min_each, DEFAULT_LIMITS.min_each),
      daily_send_limit: positive(limits.daily_send_limit, DEFAULT_LIMITS.daily_send_limit),
      expire_hours: positive(limits.expire_hours, DEFAULT_LIMITS.expire_hours)
    },
    sent_today: Math.max(0, count(source.sent_today)),
    // 旧服务端没有这个字段：当成空列表，不认识的玩法丢掉
    features: Array.isArray(source.features) ? FEATURES.filter((feature) => (source.features as unknown[]).includes(feature)) : []
  };
}

export async function sendRedPacket(payload: SendRedPacketPayload): Promise<SendRedPacketResult> {
  const response = await apiRequest<unknown>('/red-packets', { method: 'POST', body: payload });
  const source = isRecord(response) ? response : {};
  const message = messageOf(source.message);
  return { red_packet: normalizeRedPacket(source.red_packet), message, balance: normalizeBalance(source.balance) };
}

export async function getRedPacket(id: RedPacketId): Promise<RedPacket> {
  const packet = normalizeRedPacket(await apiRequest<unknown>(`/red-packets/${encodeURIComponent(String(id))}`));
  if (!packet) {
    throw new Error('红包信息读不出来，稍后再试。');
  }
  return packet;
}

export async function claimRedPacket(id: RedPacketId): Promise<ClaimRedPacketResult> {
  const response = await apiRequest<unknown>(`/red-packets/${encodeURIComponent(String(id))}/claim`, { method: 'POST' });
  const source = isRecord(response) ? response : {};
  return { amount: count(source.amount), red_packet: normalizeRedPacket(source.red_packet), balance: normalizeBalance(source.balance), message: messageOf(source.message) };
}

/**
 * 记录里的一行。发出的每一项直接是红包对象（多一个 refunded_amount）；收到的每一项是 { amount, created_at, red_packet }。
 */
function normalizeRecord(value: unknown, direction: RedPacketDirection, index: number): RedPacketRecord | null {
  if (!isRecord(value)) {
    return null;
  }
  const packet = direction === 'received' ? value.red_packet : value;
  if (!isRecord(packet) || !isId(packet.id)) {
    return null;
  }
  const amount = direction === 'received' ? count(value.amount) : count(packet.total);
  const createdAt = direction === 'received' ? text(value.created_at) : text(packet.created_at);
  return {
    key: `${direction}-${String(packet.id)}-${index}`,
    id: packet.id,
    conversation_id: count(packet.conversation_id),
    kind: kindOf(packet.kind),
    greeting: text(packet.greeting).trim() || DEFAULT_RED_PACKET_GREETING,
    amount,
    created_at: createdAt,
    sender: userOf(packet.sender),
    count: Math.max(1, count(packet.count, 1)),
    claimed_count: Math.max(0, count(packet.claimed_count)),
    status: statusOf(packet.status),
    refunded_amount: direction === 'sent' ? Math.max(0, count(packet.refunded_amount)) : 0
  };
}

export async function getMyRedPackets(direction: RedPacketDirection, limit: number, offset: number): Promise<RedPacketRecordPage> {
  const response = await apiRequest<unknown>(`/red-packets/mine?direction=${direction}&limit=${limit}&offset=${offset}`);
  const source = isRecord(response) ? response : {};
  const items = Array.isArray(source.items) ? source.items.map((item, index) => normalizeRecord(item, direction, index)).filter(notNull) : [];
  return { items, total: count(source.total, items.length), sum: count(source.sum) };
}

function normalizePending(value: unknown): PendingRedPacket | null {
  if (!isRecord(value) || !isId(value.id) || typeof value.message_id !== 'number' || !Number.isFinite(value.message_id)) {
    return null;
  }
  return {
    id: value.id,
    message_id: value.message_id,
    sender_id: nullableCount(value.sender_id),
    kind: kindOf(value.kind),
    greeting: text(value.greeting).trim() || DEFAULT_RED_PACKET_GREETING,
    count: Math.max(1, count(value.count, 1)),
    claimed_count: Math.max(0, count(value.claimed_count)),
    expires_at: nullableText(value.expires_at),
    created_at: text(value.created_at),
    chain_text: chainTextOf(value.chain_text),
    target_user_id: targetIdOf(value.target_user_id)
  };
}

/** 这个会话里我还能领的红包（3.4.1），新的在前，最多 20 个。旧后端没有这个接口：404 / 422，由调用方当成「不显示」。 */
export async function getPendingRedPackets(conversationId: number): Promise<PendingRedPacket[]> {
  const response = await apiRequest<unknown>(`/red-packets/pending?conversation_id=${encodeURIComponent(String(conversationId))}`);
  const source = isRecord(response) ? response : {};
  return Array.isArray(source.items) ? source.items.map(normalizePending).filter(notNull) : [];
}
