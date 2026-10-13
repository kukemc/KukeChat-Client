/**
 * 商店（契约：KukeChat-Server 的 docs/shop.md）。
 *
 * 气泡皮肤的 `style` 在这里是 unknown：它是服务端给的一组受限字段，
 * 任何地方要用它画东西，都必须先过 components/shop/skin/bubbleSkin.ts 的 parseBubbleSkin。
 */

/** 用户对象上的装扮：每个槽一件，没装备的槽不出现。旧后端没有这个字段。 */
export interface UserCosmetic {
  sku: string;
  style: unknown;
}

export interface UserCosmetics {
  bubble?: UserCosmetic | null;
  [slot: string]: UserCosmetic | null | undefined;
}

export interface ShopCategory {
  key: string;
  label: string;
  /** 这个类别占用的装备槽，一个槽同时只能装备一件 */
  slot: string;
}

/** 我现在能怎么得到它：buy 可以买 / level 等级够了可以免费领 / locked 等级不够且不卖 / owned 已拥有 */
export type ShopObtainable = 'buy' | 'level' | 'locked' | 'owned';
export type ShopTag = 'new' | 'hot' | 'limited';

export interface ShopItem {
  id: number;
  sku: string;
  category: string;
  name: string;
  description: string;
  /** 金币；0 表示不卖，只能靠解锁或赠送获得 */
  price: number;
  /** 账号等级达到多少免费解锁；null 表示不能靠等级解锁 */
  unlock_level: number | null;
  style: unknown;
  preview_text: string;
  tag: ShopTag | null;
  /** 限时商品的下架时间 */
  available_until: string | null;
  owned: boolean;
  equipped: boolean;
  obtainable: ShopObtainable;
  /**
   * 已经下架（列表里只会出现在「我已拥有」的商品上）：商品对象上 is_active 为 false。
   * 早期的后端没有 is_active，那时靠 available_until 是否已过来判断。
   */
  delisted: boolean;
}

export interface ShopBalance {
  /** 是否已绑定 CCW 账号 */
  bound: boolean;
  /** 服务端核实到的累计投币 */
  donated: number;
  spent: number;
  balance: number;
  /** 上次向 CCW 核实的时间；从没核实过为 null */
  verified_at: string | null;
  /** true 表示上次核实失败，余额可能不是最新的 */
  stale: boolean;
}

/** GET /shop */
export interface ShopOverview {
  categories: ShopCategory[];
  items: ShopItem[];
  balance: ShopBalance;
  /** 每个槽装备的 sku */
  equipped: Record<string, string | null>;
  /** 投币的作品页。服务端没配置官方作品时是空串：这时不能充值，余额恒为 stale，购买返回 503 */
  donate_url: string;
  /** 我的账号等级 */
  level: number;
}

/** POST /shop/items/{id}/purchase */
export interface ShopPurchaseResult {
  item: ShopItem;
  balance: ShopBalance;
  equipped: Record<string, string | null>;
}

export type ShopPurchaseSource = 'purchase' | 'level' | 'grant';

export interface ShopPurchaseRecord {
  id: number;
  item: { sku: string; name: string; category: string };
  price: number;
  source: ShopPurchaseSource | (string & {});
  created_at: string;
  /** 被后台收回的时间；没被收回是 null。被收回的商品可以再次获得（docs/shop.md 3.6） */
  revoked_at: string | null;
  /** 收回时有没有把币退回来 */
  refunded: boolean;
}

/** GET /shop/purchases */
export interface ShopPurchasePage {
  items: ShopPurchaseRecord[];
  total: number;
}

/** 实时事件 shop.item.granted 的 data */
export interface ShopGrantEvent {
  item: { sku: string; name: string; category: string };
  source: ShopPurchaseSource | (string & {});
}
