import type { Message, User } from '@/types/api';
import type { CharmLeaderboard, CharmLeaderboardItem, CharmPeriod, Gift, GiftCatalog, GiftDirection, GiftRecord, GiftRecordPage, GiftWall, GiftWallEntry, SendGiftPayload, SendGiftResult } from '@/types/gift';
import { DEFAULT_CHARM_LABEL, GIFT_COUNT_MAX, GIFT_MESSAGE_MAX, normalizeGiftItemRef, normalizeGiftRef } from '@/utils/gift';
import { apiRequest } from './client';
import { isRecord } from './normalizers';

/**
 * 礼物接口。旧后端没有这些接口，GET /gifts/catalog 会 404 —— 调用方（components/gifts/data.ts）把它当成「没有礼物功能」。
 *
 * 响应在这里整理成类型里写的形状：缺字段补默认值、形状不对的条目丢掉。金额、心意值一律是非负整数。
 */

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function count(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function positive(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function userOf(value: unknown): User | null {
  return isRecord(value) && typeof value.id === 'number' ? value as unknown as User : null;
}

function notNull<T>(value: T | null): value is T {
  return value !== null;
}

function normalizeGift(value: unknown): Gift | null {
  const ref = normalizeGiftRef(value);
  if (!ref || !isRecord(value)) {
    return null;
  }
  return { ...ref, is_active: value.is_active !== false, sort: count(value.sort) };
}

export async function getGiftCatalog(): Promise<GiftCatalog> {
  const response = await apiRequest<unknown>('/gifts/catalog');
  const source = isRecord(response) ? response : {};
  const limits = isRecord(source.limits) ? source.limits : {};
  const gifts = Array.isArray(source.gifts) ? source.gifts.map(normalizeGift).filter(notNull) : [];
  return {
    enabled: source.enabled === true,
    charm_label: text(source.charm_label).trim() || DEFAULT_CHARM_LABEL,
    // 下架的不显示；顺序按 sort，同 sort 的保持服务端给的先后
    gifts: gifts.filter((gift) => gift.is_active && gift.price > 0).sort((left, right) => left.sort - right.sort),
    limits: {
      message_max: positive(limits.message_max, GIFT_MESSAGE_MAX),
      count_max: positive(limits.count_max, GIFT_COUNT_MAX),
      daily_send_limit: positive(limits.daily_send_limit, 200)
    }
  };
}

export function normalizeGiftRecord(value: unknown): GiftRecord | null {
  if (!isRecord(value) || typeof value.id !== 'number') {
    return null;
  }
  const gift = normalizeGiftRef(value.gift);
  const item = normalizeGiftItemRef(value.item);
  const kind = value.kind === 'item' ? 'item' : 'gift';
  if ((kind === 'gift' && !gift) || (kind === 'item' && !item)) {
    return null;
  }
  return {
    id: value.id,
    kind,
    gift: kind === 'gift' ? gift : null,
    item: kind === 'item' ? item : null,
    count: kind === 'item' ? 1 : Math.max(1, Math.floor(count(value.count, 1))),
    amount: Math.max(0, count(value.amount)),
    from_user: userOf(value.from_user),
    to_user: userOf(value.to_user),
    conversation_id: typeof value.conversation_id === 'number' ? value.conversation_id : null,
    message_id: typeof value.message_id === 'number' ? value.message_id : null,
    message: typeof value.message === 'string' && value.message.trim() ? value.message.trim() : null,
    on_birthday: value.on_birthday === true,
    created_at: text(value.created_at)
  };
}

function normalizeBalance(value: unknown): SendGiftResult['balance'] {
  if (!isRecord(value) || typeof value.balance !== 'number' || !Number.isFinite(value.balance)) {
    return null;
  }
  const patch: NonNullable<SendGiftResult['balance']> = { balance: value.balance };
  if (typeof value.bound === 'boolean') patch.bound = value.bound;
  if (typeof value.donated === 'number' && Number.isFinite(value.donated)) patch.donated = value.donated;
  if (typeof value.spent === 'number' && Number.isFinite(value.spent)) patch.spent = value.spent;
  if (typeof value.verified_at === 'string') patch.verified_at = value.verified_at;
  if (typeof value.stale === 'boolean') patch.stale = value.stale;
  // 余额里红包、礼物的那几项也跟着换：实时事件没到（断线）的时候，商店页上的明细不会和余额对不上
  for (const key of ['red_packet_sent', 'red_packet_received', 'red_packet_refunded', 'gift_spent'] as const) {
    const part = value[key];
    if (typeof part === 'number' && Number.isFinite(part)) patch[key] = part;
  }
  return patch;
}

/** 送礼物 / 送商品。服务端扣币之前会重新核实余额。 */
export async function sendGift(payload: SendGiftPayload): Promise<SendGiftResult> {
  const response = await apiRequest<unknown>('/gifts', { method: 'POST', body: payload });
  const source = isRecord(response) ? response : {};
  const message = isRecord(source.message) && typeof source.message.id === 'number' && typeof source.message.conversation_id === 'number' ? source.message as unknown as Message : null;
  return { record: normalizeGiftRecord(source.record), message, balance: normalizeBalance(source.balance) };
}

function normalizeWallEntry(value: unknown): GiftWallEntry | null {
  if (!isRecord(value)) {
    return null;
  }
  const gift = normalizeGiftRef(value.gift);
  const item = normalizeGiftItemRef(value.item);
  const kind = value.kind === 'item' ? 'item' : 'gift';
  if ((kind === 'gift' && !gift) || (kind === 'item' && !item)) {
    return null;
  }
  return { kind, gift: kind === 'gift' ? gift : null, item: kind === 'item' ? item : null, count: Math.max(1, Math.floor(count(value.count, 1))), last_at: text(value.last_at) };
}

/** 某个人的礼物墙：按种类聚合，公开。 */
export async function getGiftWall(userId: number): Promise<GiftWall> {
  const response = await apiRequest<unknown>(`/users/${userId}/gifts`);
  const source = isRecord(response) ? response : {};
  const summary = Array.isArray(source.summary) ? source.summary.map(normalizeWallEntry).filter(notNull) : [];
  return { charm: Math.max(0, count(source.charm)), total_count: Math.max(0, count(source.total_count, summary.reduce((sum, entry) => sum + entry.count, 0))), summary };
}

function normalizeRecordPage(response: unknown): GiftRecordPage {
  const source = isRecord(response) ? response : {};
  const items = Array.isArray(source.items) ? source.items.map(normalizeGiftRecord).filter(notNull) : [];
  return { items, total: count(source.total, items.length), sum: Math.max(0, count(source.sum)) };
}

/** 礼物墙上某一种的送礼记录（谁送的、什么时候）。留言只有送的人和收的人看得到，别人拿到的是 null。 */
export async function getGiftWallRecords(userId: number, filter: { giftKey?: string; itemSku?: string }, limit: number, offset: number): Promise<GiftRecordPage> {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (filter.giftKey) params.set('gift_key', filter.giftKey);
  if (filter.itemSku) params.set('item_sku', filter.itemSku);
  return normalizeRecordPage(await apiRequest<unknown>(`/users/${userId}/gifts/records?${params.toString()}`));
}

export async function getMyGifts(direction: GiftDirection, limit: number, offset: number): Promise<GiftRecordPage> {
  return normalizeRecordPage(await apiRequest<unknown>(`/gifts/mine?direction=${direction}&limit=${limit}&offset=${offset}`));
}

function normalizeBoardItem(value: unknown): CharmLeaderboardItem | null {
  if (!isRecord(value) || typeof value.rank !== 'number') {
    return null;
  }
  return { rank: value.rank, user: userOf(value.user), charm: Math.max(0, count(value.charm)) };
}

export async function getCharmLeaderboard(period: CharmPeriod, limit: number): Promise<CharmLeaderboard> {
  const response = await apiRequest<unknown>(`/gifts/leaderboard?period=${period}&limit=${limit}`);
  const source = isRecord(response) ? response : {};
  const me = isRecord(source.me) ? source.me : {};
  return {
    items: Array.isArray(source.items) ? source.items.map(normalizeBoardItem).filter(notNull) : [],
    me: { rank: typeof me.rank === 'number' && me.rank > 0 ? me.rank : null, charm: Math.max(0, count(me.charm)) }
  };
}
