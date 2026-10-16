import type { Message, User } from './api';

/**
 * 礼物（前缀 /api/v1/gifts）。用金币余额送：礼物目录里的礼物（可以选数量），或者商店里的一件商品。
 * 送出去的币是真消耗，对方不得币；对方涨的是「心意值」（字段名 charm，界面上的叫法见 utils/gift.ts 的 DEFAULT_CHARM_LABEL
 * 和 GET /gifts/catalog 的 charm_label）。总开关 gifts.enabled 线上默认关着。
 */

/** 动效规模：1 消息卡片内的小动画；2 聊天区里的一段；3 全屏 */
export type GiftTier = 1 | 2 | 3;
export type GiftKind = 'gift' | 'item';
export type GiftId = number;

/** 目录里的一个礼物。icon 是客户端内置矢量图形的名字（components/gifts/GiftGlyph.tsx），不认识的画成通用礼盒 */
export interface Gift {
  key: string;
  name: string;
  price: number;
  icon: string;
  tier: GiftTier;
  is_active: boolean;
  sort: number;
}

export interface GiftLimits {
  /** 留言最多多少字 */
  message_max: number;
  /** 一次最多送多少个 */
  count_max: number;
  /** 每人每天最多送多少次 */
  daily_send_limit: number;
}

/** GET /gifts/catalog */
export interface GiftCatalog {
  enabled: boolean;
  /** 「心意值」现在叫什么 */
  charm_label: string;
  gifts: Gift[];
  limits: GiftLimits;
}

/** 记录、消息里带的礼物摘要 */
export interface GiftRef {
  key: string;
  name: string;
  icon: string;
  price: number;
  tier: GiftTier;
}

/** 记录、消息里带的商品摘要。style 和商店里一样是不可信的，画之前要过对应类别的校验 */
export interface GiftItemRef {
  sku: string;
  name: string;
  category: string;
  style: unknown;
  /** null 是永久 */
  duration_days: number | null;
}

/** 礼物消息里的收礼人：只有画卡片用得着的三项 */
export interface GiftRecipient {
  id: number;
  display_name: string;
  avatar_url: string | null;
}

/** 消息上带的礼物信息：`message.metadata.gift`（type 为 gift 的消息）。gift 和 item 恰有一个不是 null */
export interface GiftMeta {
  id: GiftId;
  kind: GiftKind;
  gift: GiftRef | null;
  item: GiftItemRef | null;
  count: number;
  to_user: GiftRecipient;
  /** 留言；没写是空串 */
  message: string;
}

/** 一条送礼记录。留言只有送的人和收的人能看到，别人看到的是 null */
export interface GiftRecord {
  id: GiftId;
  kind: GiftKind;
  gift: GiftRef | null;
  item: GiftItemRef | null;
  count: number;
  /** 花掉的币 = 对方涨的心意值 */
  amount: number;
  from_user: User | null;
  to_user: User | null;
  /** 在哪个会话里送的；从个人空间 / 资料卡送的是 null */
  conversation_id: number | null;
  message_id: number | null;
  message: string | null;
  /** 是不是在对方生日当天送的 */
  on_birthday: boolean;
  created_at: string;
}

/** POST /gifts 的请求体 */
export interface SendGiftPayload {
  to_user_id: number;
  /** null 表示从对方个人空间 / 资料卡送（不落聊天消息） */
  conversation_id: number | null;
  kind: GiftKind;
  gift_key?: string;
  /** kind = gift 时 1–99；kind = item 固定 1 */
  count: number;
  item_sku?: string;
  message: string;
}

/** POST /gifts 的回包。balance 是商店那种余额对象，读不出来是 null */
export interface SendGiftResult {
  record: GiftRecord | null;
  message: Message | null;
  balance: Partial<import('./shop').ShopBalance> | null;
}

/** 礼物墙上的一格：同一种礼物（或同一件商品）聚合起来 */
export interface GiftWallEntry {
  kind: GiftKind;
  gift: GiftRef | null;
  item: GiftItemRef | null;
  count: number;
  last_at: string;
}

/** GET /users/{id}/gifts */
export interface GiftWall {
  charm: number;
  total_count: number;
  summary: GiftWallEntry[];
}

/** GET /users/{id}/gifts/records、GET /gifts/mine */
export interface GiftRecordPage {
  items: GiftRecord[];
  total: number;
  /** 只有 /gifts/mine 有：这个方向上的合计金币 */
  sum: number;
}

export type GiftDirection = 'sent' | 'received';
export type CharmPeriod = 'all' | 'month';

export interface CharmLeaderboardItem {
  rank: number;
  user: User | null;
  charm: number;
}

/** GET /gifts/leaderboard */
export interface CharmLeaderboard {
  items: CharmLeaderboardItem[];
  me: { rank: number | null; charm: number };
}
