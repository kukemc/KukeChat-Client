import type { User } from '@/types/api';
import type { ShopBalance, ShopCategory, ShopItem, ShopOverview, ShopPurchasePage, ShopPurchaseRecord, ShopPurchaseResult, ShopTag } from '@/types/shop';
import { parseApiDate } from '@/utils/dateTime';
import { durationDaysOf, isExpired } from '@/utils/shopExpiry';
import { apiRequest } from './client';
import { isRecord } from './normalizers';

/**
 * 商店（docs/shop.md）。旧后端没有这些接口，GET /shop 会 404 —— 调用方（components/shop/data.ts）把它当成「还没开放」。
 *
 * 响应在这里整理成类型里写的形状：缺字段补默认值、形状不对的条目丢掉，界面拿到的数据不用再到处判空。
 * 商品的 style 原样留着（unknown），画气泡之前由 components/shop/skin/bubbleSkin.ts 校验。
 */

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function count(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

const TAGS: readonly ShopTag[] = ['new', 'hot', 'limited'];

function isPast(value: string | null): boolean {
  const date = parseApiDate(value);
  return date !== null && date.getTime() <= Date.now();
}

export function normalizeShopItem(value: unknown): ShopItem | null {
  if (!isRecord(value) || typeof value.id !== 'number' || typeof value.sku !== 'string' || typeof value.category !== 'string') {
    return null;
  }
  const owned = value.owned === true;
  const obtainable = value.obtainable === 'buy' || value.obtainable === 'level' || value.obtainable === 'locked' || value.obtainable === 'owned' || value.obtainable === 'renew' ? value.obtainable : owned ? 'owned' : 'locked';
  const availableUntil = typeof value.available_until === 'string' ? value.available_until : null;
  // 到期时间只在「我拥有、而且还没到期」时有意义；已经过了的（服务端现场判断之前的那一瞬间）当成没有
  const expiresAt = owned && typeof value.expires_at === 'string' && value.expires_at && !isExpired(value.expires_at, Date.now()) ? value.expires_at : null;
  return {
    id: value.id,
    sku: value.sku,
    category: value.category,
    name: text(value.name, value.sku),
    description: text(value.description),
    price: Math.max(0, Math.round(count(value.price))),
    unlock_level: typeof value.unlock_level === 'number' && Number.isFinite(value.unlock_level) ? value.unlock_level : null,
    style: value.style,
    preview_text: text(value.preview_text),
    tag: TAGS.find((tag) => tag === value.tag) ?? null,
    available_until: availableUntil,
    duration_days: durationDaysOf(value.duration_days),
    expires_at: expiresAt,
    owned,
    equipped: value.equipped === true,
    obtainable,
    // 「已下架」以 is_active 为准（docs/shop.md 第 2 节）。早期的后端没有这个字段，那时退回去看限时商品是不是已经过了下架时间
    delisted: typeof value.is_active === 'boolean' ? !value.is_active : isPast(availableUntil)
  };
}

const BALANCE_EXTRAS = ['red_packet_sent', 'red_packet_received', 'red_packet_refunded', 'gift_spent', 'group_plus_spent', 'granted'] as const;

export function normalizeShopBalance(value: unknown): ShopBalance {
  const source = isRecord(value) ? value : {};
  const balance: ShopBalance = {
    bound: source.bound === true,
    donated: count(source.donated),
    spent: count(source.spent),
    balance: count(source.balance),
    verified_at: typeof source.verified_at === 'string' ? source.verified_at : null,
    stale: source.stale === true
  };
  // 红包、礼物的几项明细：服务端给了才有（旧后端没有）
  for (const key of BALANCE_EXTRAS) {
    const extra = source[key];
    if (typeof extra === 'number' && Number.isFinite(extra)) {
      balance[key] = extra;
    }
  }
  return balance;
}

export function normalizeEquipped(value: unknown): Record<string, string | null> {
  const result: Record<string, string | null> = {};
  if (isRecord(value)) {
    for (const [slot, sku] of Object.entries(value)) {
      result[slot] = typeof sku === 'string' && sku ? sku : null;
    }
  }
  return result;
}

function normalizeCategory(value: unknown): ShopCategory | null {
  if (!isRecord(value) || typeof value.key !== 'string') {
    return null;
  }
  return { key: value.key, label: text(value.label, value.key), slot: text(value.slot, value.key) };
}

/** 只接受 http(s) 地址：这个链接会被拿去打开外部浏览器。 */
function httpUrl(value: unknown): string {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim()) ? value.trim() : '';
}

function notNull<T>(value: T | null): value is T {
  return value !== null;
}

export async function getShop(): Promise<ShopOverview> {
  const response = await apiRequest<unknown>('/shop');
  const source = isRecord(response) ? response : {};
  return {
    categories: Array.isArray(source.categories) ? source.categories.map(normalizeCategory).filter(notNull) : [],
    items: Array.isArray(source.items) ? source.items.map(normalizeShopItem).filter(notNull) : [],
    balance: normalizeShopBalance(source.balance),
    equipped: normalizeEquipped(source.equipped),
    donate_url: httpUrl(source.donate_url),
    level: count(source.level)
  };
}

/** 向 CCW 重新核实一次累计投币。每人 20 秒内最多一次（429 refresh_too_fast，detail.retry_after 秒）。 */
export async function refreshShopBalance(): Promise<ShopBalance> {
  return normalizeShopBalance(await apiRequest<unknown>('/shop/balance/refresh', { method: 'POST' }));
}

/** 购买，或者领取等级已经够了的免费商品。没有请求体，服务端会先重新核实余额再扣。 */
export async function purchaseShopItem(itemId: number): Promise<ShopPurchaseResult | null> {
  const response = await apiRequest<unknown>(`/shop/items/${itemId}/purchase`, { method: 'POST' });
  const source = isRecord(response) ? response : {};
  const item = normalizeShopItem(source.item);
  // 成功了但回包读不出来：返回 null，调用方整份重拉
  return item ? { item, balance: normalizeShopBalance(source.balance), equipped: normalizeEquipped(source.equipped) } : null;
}

/** 装备 / 卸下（sku 传 null）。只能装备自己拥有的（403 not_owned）。 */
export async function setShopEquipped(slot: string, sku: string | null): Promise<Record<string, string | null>> {
  const response = await apiRequest<unknown>('/shop/equipped', { method: 'PUT', body: { slot, sku } });
  return normalizeEquipped(isRecord(response) ? response.equipped : null);
}

function normalizeRecord(value: unknown): ShopPurchaseRecord | null {
  if (!isRecord(value) || typeof value.id !== 'number') {
    return null;
  }
  const item = isRecord(value.item) ? value.item : {};
  return {
    id: value.id,
    item: { sku: text(item.sku), name: text(item.name, text(item.sku, '商品')), category: text(item.category) },
    price: count(value.price),
    source: text(value.source, 'purchase'),
    created_at: text(value.created_at),
    revoked_at: typeof value.revoked_at === 'string' && value.revoked_at ? value.revoked_at : null,
    refunded: value.refunded === true,
    duration_days: durationDaysOf(value.duration_days),
    expires_at: typeof value.expires_at === 'string' && value.expires_at ? value.expires_at : null,
    from_user: isRecord(value.from_user) && typeof value.from_user.id === 'number' ? value.from_user as unknown as User : null
  };
}

export async function getShopPurchases(limit: number, offset: number): Promise<ShopPurchasePage> {
  const response = await apiRequest<unknown>(`/shop/purchases?limit=${limit}&offset=${offset}`);
  const source = isRecord(response) ? response : {};
  const items = Array.isArray(source.items) ? source.items.map(normalizeRecord).filter(notNull) : [];
  return { items, total: count(source.total, items.length) };
}
