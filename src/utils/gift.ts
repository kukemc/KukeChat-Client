import type { Message } from '@/types/api';
import type { GiftItemRef, GiftMeta, GiftRef, GiftTier } from '@/types/gift';

/**
 * 「这条消息是不是礼物」以及它在各种摘要里怎么写。纯函数，不依赖接口层：
 * 会话列表、通知、搜索、引用预览、消息卡片都从这里判断（做法和 utils/redPacket.ts 一样）。
 */

/**
 * 收到礼物涨的那个数值叫什么。全客户端只有这一处写着这个名字：界面上一律用 components/gifts/data.ts 的 useCharmLabel()
 * （优先取 GET /gifts/catalog 返回的 charm_label，取不到才落到这里），以后改名只改服务端配置和这一行。
 */
export const DEFAULT_CHARM_LABEL = '心意值';
/** 按「心意值」排的那个榜叫什么：去掉末尾的「值」再接「榜」（心意值 → 心意榜；改名后跟着变） */
export function charmBoardLabel(charmLabel: string): string {
  return `${charmLabel.replace(/值$/, '') || charmLabel}榜`;
}

/** 契约里的默认上限；目录接口没给的时候用 */
export const GIFT_MESSAGE_MAX = 60;
export const GIFT_COUNT_MAX = 99;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function tierOf(value: unknown): GiftTier {
  return value === 2 || value === 3 ? value : 1;
}

export function normalizeGiftRef(value: unknown): GiftRef | null {
  if (!isRecord(value) || typeof value.key !== 'string' || !value.key) {
    return null;
  }
  const price = typeof value.price === 'number' && Number.isFinite(value.price) ? Math.max(0, Math.round(value.price)) : 0;
  return { key: value.key, name: text(value.name).trim() || '礼物', icon: text(value.icon), price, tier: tierOf(value.tier) };
}

export function normalizeGiftItemRef(value: unknown): GiftItemRef | null {
  if (!isRecord(value) || typeof value.sku !== 'string' || !value.sku) {
    return null;
  }
  const days = value.duration_days;
  return {
    sku: value.sku,
    name: text(value.name).trim() || '装扮',
    category: text(value.category),
    style: value.style,
    duration_days: typeof days === 'number' && Number.isInteger(days) && days > 0 ? days : null
  };
}

/** 消息上的 `metadata.gift`。形状不对返回 null，那条消息按普通文字（content 里的兜底文字）显示。 */
export function normalizeGiftMeta(value: unknown): GiftMeta | null {
  if (!isRecord(value) || typeof value.id !== 'number' || !Number.isInteger(value.id) || !isRecord(value.to_user) || typeof value.to_user.id !== 'number') {
    return null;
  }
  const gift = normalizeGiftRef(value.gift);
  const item = normalizeGiftItemRef(value.item);
  // kind 和带的东西要对得上：送礼物就得有 gift，送商品就得有 item
  const kind = value.kind === 'item' ? 'item' : 'gift';
  if ((kind === 'gift' && !gift) || (kind === 'item' && !item)) {
    return null;
  }
  const count = typeof value.count === 'number' && Number.isFinite(value.count) ? Math.max(1, Math.floor(value.count)) : 1;
  return {
    id: value.id,
    kind,
    gift: kind === 'gift' ? gift : null,
    item: kind === 'item' ? item : null,
    count: kind === 'item' ? 1 : count,
    to_user: { id: value.to_user.id, display_name: text(value.to_user.display_name).trim() || `用户 ${value.to_user.id}`, avatar_url: text(value.to_user.avatar_url) || null },
    message: text(value.message).trim()
  };
}

export function isGiftMessage(message: Pick<Message, 'type'> | null | undefined): boolean {
  return message?.type === 'gift';
}

/** 一条消息带的礼物；不是礼物消息、已撤回、或者数据读不出来都是 null。 */
export function giftOf(message: Message | null | undefined): GiftMeta | null {
  if (!message || message.type !== 'gift' || message.recalled_at) {
    return null;
  }
  return normalizeGiftMeta(message.metadata?.gift);
}

/** 送的是什么：「蛋糕 ×3」「头像框「天使」」。 */
export function giftThingLabel(meta: Pick<GiftMeta, 'kind' | 'gift' | 'item' | 'count'>): string {
  if (meta.kind === 'item' && meta.item) {
    return `${meta.item.category === 'frame' ? '头像框' : meta.item.category === 'bubble' ? '气泡' : '装扮'}「${meta.item.name}」`;
  }
  const name = meta.gift?.name ?? '礼物';
  return meta.count > 1 ? `${name} ×${meta.count}` : name;
}

/** 摘要里的写法：「[礼物] 送给 阿夸 蛋糕 ×3」。不是礼物消息返回 null；数据读不出来只写「[礼物]」，不把给旧客户端的兜底文字露出来。 */
export function giftPreview(message: Message | null | undefined): string | null {
  if (!message || message.type !== 'gift') {
    return null;
  }
  const meta = normalizeGiftMeta(message.metadata?.gift);
  return meta ? `[礼物] 送给 ${meta.to_user.display_name} ${giftThingLabel(meta)}` : '[礼物]';
}

/** 撤回礼物消息只是把消息撤掉，礼物和币都不退。撤回之前说清楚。 */
export function giftRecallConfirmText(): string {
  return '撤回这条礼物消息吗？只是把消息撤掉：礼物已经送到，对方照样收到，花掉的金币不会退回。';
}

/** 礼物的动效规模；送商品没有档位，按最小的算。 */
export function giftTierOf(meta: Pick<GiftMeta, 'gift'>): GiftTier {
  return meta.gift?.tier ?? 1;
}
