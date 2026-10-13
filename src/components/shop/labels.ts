import { ApiError, NetworkError } from '@/api/client';
import type { ShopItem, ShopTag } from '@/types/shop';
import { parseApiDate } from '@/utils/dateTime';
import { shopErrorCode, shopErrorDetail } from './data';

/** 商店里的文字：枚举值的叫法、数字和时间的写法、每个错误码对应的话。界面组件不自己拼这些。 */

export const DEFAULT_PREVIEW_TEXT = '今天也要开心呀';

export const TAG_LABEL: Record<ShopTag, string> = { new: '新品', hot: '热门', limited: '限时' };
export const TAG_TONE: Record<ShopTag, string> = { new: 'kui-tag--accent', hot: 'kui-tag--warn', limited: 'kui-tag--danger' };

const SOURCE_LABEL: Record<string, string> = { purchase: '购买', level: '等级解锁', grant: '赠送' };

export function sourceLabel(source: string): string {
  return SOURCE_LABEL[source] ?? '其他';
}

export function formatCoins(value: number): string {
  return Math.round(value).toLocaleString('zh-CN');
}

export function formatShopTime(value: string | null | undefined): string {
  const date = parseApiDate(value);
  if (!date) {
    return '';
  }
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
}

/** 上次核实是多久以前：「刚刚」「5 分钟前」「3 小时前」，再久就写日期。 */
export function formatVerifiedAt(value: string | null, now: number): string {
  const date = parseApiDate(value);
  if (!date) {
    return '还没有核实过';
  }
  const seconds = Math.max(0, Math.round((now - date.getTime()) / 1000));
  if (seconds < 60) {
    return '刚刚核实';
  }
  if (seconds < 3600) {
    return `${Math.floor(seconds / 60)} 分钟前核实`;
  }
  if (seconds < 86400) {
    return `${Math.floor(seconds / 3600)} 小时前核实`;
  }
  return `${formatShopTime(value)} 核实`;
}

/** 限时商品还剩多久。已经过了返回 null。 */
export function formatRemaining(until: string | null, now: number): string | null {
  const date = parseApiDate(until);
  if (!date) {
    return null;
  }
  const seconds = Math.floor((date.getTime() - now) / 1000);
  if (seconds <= 0) {
    return null;
  }
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) {
    return `还剩 ${days} 天${hours > 0 ? ` ${hours} 小时` : ''}`;
  }
  if (hours > 0) {
    return `还剩 ${hours} 小时${minutes > 0 ? ` ${minutes} 分` : ''}`;
  }
  if (minutes > 0) {
    return `还剩 ${minutes} 分 ${String(seconds % 60).padStart(2, '0')} 秒`;
  }
  return `还剩 ${seconds} 秒`;
}

/** 一件商品现在能做什么。按钮、价格那一行、确认框都从这里出，免得各处判断不一致。 */
export type ShopItemAction =
  /** 使用中，可以卸下 */
  | 'equipped'
  /** 已拥有，可以装备 */
  | 'owned'
  /** 可以买 */
  | 'buy'
  /** 等级够了，可以免费领 */
  | 'claim'
  /** 等级不够，而且不卖 */
  | 'level-locked'
  /** 不卖也不能靠等级解锁（只能等赠送） */
  | 'not-for-sale'
  /** 已下架 / 已过期，而且我没有 */
  | 'delisted';

export function itemAction(item: ShopItem): ShopItemAction {
  if (item.owned || item.obtainable === 'owned') {
    return item.equipped ? 'equipped' : 'owned';
  }
  if (item.delisted) {
    return 'delisted';
  }
  if (item.obtainable === 'level') {
    return 'claim';
  }
  if (item.obtainable === 'buy') {
    return 'buy';
  }
  return item.unlock_level !== null ? 'level-locked' : 'not-for-sale';
}

/** 卡片上价格那一行写什么。 */
export function priceLabel(item: ShopItem, action: ShopItemAction): { kind: 'coins' | 'text'; text: string; hint?: string } {
  const unlock = item.unlock_level !== null ? `Lv.${item.unlock_level} 解锁` : null;
  if (action === 'claim' || action === 'level-locked') {
    return { kind: 'text', text: unlock ?? '等级解锁' };
  }
  if (action === 'not-for-sale') {
    return { kind: 'text', text: '活动获得' };
  }
  if (item.price > 0) {
    return { kind: 'coins', text: formatCoins(item.price), hint: unlock ? `或 ${unlock}` : undefined };
  }
  return { kind: 'text', text: unlock ?? (action === 'buy' ? '免费' : '非卖品') };
}

/** 一次失败的购买该怎么告诉用户，以及能接着做什么。 */
export interface PurchaseFailure {
  code: string | null;
  message: string;
  /** 余额不够时还差多少（402 的 detail.shortfall） */
  shortfall?: number;
  /** 402 的 detail.donate_url，没有就用商店主数据里的 */
  donateUrl?: string;
}

function networkText(error: unknown): string | null {
  return error instanceof NetworkError ? '网络连接不上，检查一下网络再试。' : null;
}

export function describePurchaseError(error: unknown, item: ShopItem): PurchaseFailure {
  const code = shopErrorCode(error);
  const detail = shopErrorDetail(error);
  switch (code) {
    case 'item_not_found':
      return { code, message: '这件商品不存在了，可能已经被移除。' };
    case 'item_unavailable':
      return { code, message: '这件商品已经下架或过期，现在买不了了。' };
    case 'already_owned':
      return { code, message: '你已经拥有这件商品了，不用再买。' };
    case 'ccw_not_bound':
      return { code, message: '还没有绑定 CCW 账号。金币是按你绑定的 CCW 账号核实的，绑定后才能购买。' };
    case 'item_locked':
      return { code, message: item.unlock_level !== null ? `这件商品不出售，账号等级达到 Lv.${item.unlock_level} 后可以免费解锁。` : '这件商品不出售，现在还拿不到。' };
    case 'insufficient_coins': {
      const shortfall = typeof detail.shortfall === 'number' && Number.isFinite(detail.shortfall) ? Math.max(1, Math.ceil(detail.shortfall)) : undefined;
      const donateUrl = typeof detail.donate_url === 'string' && /^https?:\/\//i.test(detail.donate_url) ? detail.donate_url : undefined;
      return { code, message: shortfall ? `金币不够，还差 ${formatCoins(shortfall)} 个。` : '金币不够。', shortfall, donateUrl };
    }
    case 'verification_unavailable':
      return { code, message: '现在连不上 CCW，没法核实你的余额，稍后再试。这次没有扣币。' };
    default:
      break;
  }
  const network = networkText(error);
  if (network) {
    return { code, message: network };
  }
  if (error instanceof ApiError && error.status >= 500) {
    return { code, message: '服务器开小差了，稍后再试。这次没有扣币。' };
  }
  return { code, message: error instanceof Error && error.message ? error.message : '购买没有成功，稍后再试。' };
}

export function describeEquipError(error: unknown): string {
  const code = shopErrorCode(error);
  if (code === 'not_owned') {
    return '你还没有这件装扮，不能装备。';
  }
  if (code === 'invalid_slot') {
    return '这个装扮位置现在不能用了，商店的内容可能刚更新过，已经重新加载。';
  }
  return networkText(error) ?? (error instanceof Error && error.message ? error.message : '没有换成功，稍后再试。');
}

/** 刷新余额失败。retryAfter 是 429 里服务端给的等待秒数。 */
export function describeRefreshError(error: unknown): { message: string; retryAfter: number | null } {
  const code = shopErrorCode(error);
  if (code === 'refresh_too_fast') {
    const value = shopErrorDetail(error).retry_after;
    const retryAfter = typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.min(600, Math.ceil(value)) : 20;
    return { message: '刷新得太勤了，等一会儿再试。', retryAfter };
  }
  if (code === 'ccw_not_bound') {
    return { message: '还没有绑定 CCW 账号，绑定后才能核实余额。', retryAfter: null };
  }
  return { message: networkText(error) ?? (error instanceof Error && error.message ? error.message : '没有刷新成功，稍后再试。'), retryAfter: null };
}
