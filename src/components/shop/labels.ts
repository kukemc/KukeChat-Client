import { ApiError, NetworkError } from '@/api/client';
import { getDisplayName } from '@/components/ui/Avatar';
import type { ShopItem, ShopPurchaseRecord, ShopTag } from '@/types/shop';
import { parseApiDate } from '@/utils/dateTime';
import { durationLabel, expiryLabel, formatExpiryDate, isExpiringSoon, renewedUntil } from '@/utils/shopExpiry';
import { shopErrorCode, shopErrorDetail } from './data';

/** 商店里的文字：枚举值的叫法、数字和时间的写法、每个错误码对应的话。界面组件不自己拼这些。 */

export const DEFAULT_PREVIEW_TEXT = '今天也要开心呀';

/** 和类别有关的几句话。商店里凡是提到「换上之后是什么样」的地方都从这里取，免得头像框的商品上写着「气泡」。 */
export interface CategoryText {
  /** 「我的装扮」里装备着的时候 */
  slotEquipped: string;
  /** 「我的装扮」里没装备的时候 */
  slotEmpty: string;
  /** 卸下之后的提示 */
  unequipped: string;
  /** 「xx 正在使用中，……」的后半句 */
  inUse: string;
  /** 试穿面板下面那句说明 */
  tryOnNote: string;
}

const BUBBLE_TEXT: CategoryText = {
  slotEquipped: '你发出的消息会用这个气泡，别人也看得到。',
  slotEmpty: '用的是主题自带的气泡。在下面挑一件换上。',
  unequipped: '已卸下，气泡恢复成主题的样子',
  inUse: '你发出的消息已经是这个气泡了。',
  tryOnNote: '左边是别人看到的你，右边是你自己看到的。只是预览，没有真的换上。'
};

const CATEGORY_TEXT: Record<string, CategoryText> = {
  bubble: BUBBLE_TEXT,
  frame: {
    slotEquipped: '你的头像会带着这个框，聊天里、资料卡上别人都看得到。',
    slotEmpty: '头像现在没有框。在下面挑一件换上。',
    unequipped: '已卸下，头像恢复成原来的样子',
    inUse: '你的头像已经带上这个框了。',
    tryOnNote: '套在你自己头像上的样子，别人在聊天和资料卡里看到的也是这样。只是预览，没有真的换上。'
  }
};

export function categoryText(category: string | null | undefined): CategoryText {
  return (category && CATEGORY_TEXT[category]) || BUBBLE_TEXT;
}

export const TAG_LABEL: Record<ShopTag, string> = { new: '新品', hot: '热门', limited: '限时' };
export const TAG_TONE: Record<ShopTag, string> = { new: 'kui-tag--accent', hot: 'kui-tag--warn', limited: 'kui-tag--danger' };

// gift 是别的用户送的（docs/gifts.md）；grant 是后台赠送
const SOURCE_LABEL: Record<string, string> = { purchase: '购买', level: '等级解锁', grant: '赠送', gift: '礼物' };

export function sourceLabel(source: string): string {
  return SOURCE_LABEL[source] ?? '其他';
}

/** 购买记录里这一条是怎么来的；别人送的写出是谁送的（「阿夸 送的」）。 */
export function purchaseSourceLabel(record: Pick<ShopPurchaseRecord, 'source' | 'from_user'>): string {
  if (record.source === 'gift' && record.from_user) {
    return `${getDisplayName(record.from_user, '有人')} 送的`;
  }
  return sourceLabel(record.source);
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

/**
 * 余额明细里红包、礼物的那几项：服务端给了、而且不是 0 才显示（没发过红包的人不用看到一排 0）。
 * 正负号跟着余额公式走：发出的、送礼花掉的是减，抢到的、退回的是加。
 */
export function balanceExtras(balance: { red_packet_sent?: number; red_packet_received?: number; red_packet_refunded?: number; gift_spent?: number; group_plus_spent?: number; granted?: number }): Array<{ key: string; label: string; text: string }> {
  const rows: Array<{ key: string; label: string; value: number | undefined; sign: '+' | '−' }> = [
    { key: 'red_packet_sent', label: '发出红包', value: balance.red_packet_sent, sign: '−' },
    { key: 'red_packet_received', label: '抢到红包', value: balance.red_packet_received, sign: '+' },
    { key: 'red_packet_refunded', label: '红包退回', value: balance.red_packet_refunded, sign: '+' },
    { key: 'gift_spent', label: '送出礼物', value: balance.gift_spent, sign: '−' },
    { key: 'group_plus_spent', label: '群升级', value: balance.group_plus_spent, sign: '−' }
  ];
  const extras = rows.filter((row): row is typeof row & { value: number } => typeof row.value === 'number' && row.value > 0).map((row) => ({ key: row.key, label: row.label, text: `${row.sign}${formatCoins(row.value)}` }));
  // 后台赠送（可能是负数：扣除比赠送多）
  if (typeof balance.granted === 'number' && balance.granted !== 0) {
    extras.push({ key: 'granted', label: '后台赠送', text: `${balance.granted > 0 ? '+' : '−'}${formatCoins(Math.abs(balance.granted))}` });
  }
  return extras;
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
  // renew：已经拥有一件限时的，还可以再买来续期 —— 首先它是「已拥有」，续期是多出来的一个动作（canRenew）
  if (item.owned || item.obtainable === 'owned' || item.obtainable === 'renew') {
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

/** 已经拥有的限时商品现在能不能续期（再买一次，在原到期时间上加 duration_days 天）。 */
export function canRenew(item: ShopItem): boolean {
  return item.obtainable === 'renew' && !item.delisted && item.duration_days !== null;
}

/** 「限时 30 天」/「永久」：送礼面板、确认框里说明买到的是多久。 */
export function termLabel(item: Pick<ShopItem, 'duration_days'>): string {
  const duration = durationLabel(item.duration_days);
  return duration ? `限时 ${duration}` : '永久';
}

/** 我拥有的这件限时商品还剩多久：{ text: '还剩 5 天', soon: 是否快到期 }；永久的、没拥有的返回 null。 */
export function ownedExpiry(item: Pick<ShopItem, 'expires_at'>, now: number): { text: string; soon: boolean } | null {
  // 到期时间是服务端的钟算的，本机的钟慢几秒时刚买的 30 天会被往上取整成 31 天；让出一分钟的误差
  const at = now + 60_000;
  const text = expiryLabel(item.expires_at, at);
  return text ? { text, soon: isExpiringSoon(item.expires_at, at) } : null;
}

/** 现在买 / 续期一次之后到哪天：「11 月 13 日」；永久商品返回 null。 */
export function renewalDateLabel(item: Pick<ShopItem, 'expires_at' | 'duration_days'>, now: number): string | null {
  const until = renewedUntil(item.expires_at, item.duration_days, now);
  return until ? formatExpiryDate(until, now) : null;
}

/** 到期时间写成日期：「11 月 13 日」。 */
export function expiryDateLabel(expiresAt: string | null | undefined, now: number): string | null {
  const date = parseApiDate(expiresAt);
  return date ? formatExpiryDate(date, now) : null;
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
    // 限时商品在价格后面标明能用多久：「120 / 30 天」
    const duration = durationLabel(item.duration_days);
    return { kind: 'coins', text: formatCoins(item.price), hint: [duration ? `/ ${duration}` : null, unlock ? `或 ${unlock}` : null].filter(Boolean).join(' ') || undefined };
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
