/**
 * 商店（契约：KukeChat-Server 的 docs/shop.md）。
 *
 * 商品的 `style` 在这里是 unknown：它是服务端给的一组受限字段，任何地方要用它画东西都必须先过校验 ——
 * 气泡皮肤过 components/shop/skin/bubbleSkin.ts 的 parseBubbleSkin，头像框过 avatarFrame.ts 的 parseAvatarFrame。
 */

/** 用户对象上的装扮：每个槽一件，没装备的槽不出现。旧后端没有这个字段。 */
export interface UserCosmetic {
  sku: string;
  style: unknown;
}

export interface UserCosmetics {
  bubble?: UserCosmetic | null;
  /** 头像框，style 要过 components/shop/skin/avatarFrame.ts 的 parseAvatarFrame */
  frame?: UserCosmetic | null;
  [slot: string]: UserCosmetic | null | undefined;
}

export interface ShopCategory {
  key: string;
  label: string;
  /** 这个类别占用的装备槽，一个槽同时只能装备一件 */
  slot: string;
}

/**
 * 我现在能怎么得到它：buy 可以买 / level 等级够了可以免费领 / locked 等级不够且不卖 / owned 已拥有 /
 * renew 我已拥有一件限时商品，可以再买来续期（在原到期时间上再加 duration_days 天）
 */
export type ShopObtainable = 'buy' | 'level' | 'locked' | 'owned' | 'renew';
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
  /** 限时销售的下架时间（什么时候起买不到了），和下面的 duration_days（买了能用多久）是两回事 */
  available_until: string | null;
  /** 有效期：null 是永久，N 是买一次拥有 N 天。旧后端没有这个字段，按永久 */
  duration_days: number | null;
  /** 我拥有的这件什么时候到期；永久或未拥有为 null。到期后视同不再拥有，服务端自动卸下 */
  expires_at: string | null;
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
  /**
   * 余额里红包、礼物的那几项（docs/red-packets.md 第 1 节）：发出的红包整包金额之和、抢到的、退回来的、送礼物花掉的。
   * 余额 = donated − spent − red_packet_sent + red_packet_received + red_packet_refunded（− gift_spent），balance 已经按这个算好了。
   * 旧后端没有这几项，没有就不显示。
   */
  red_packet_sent?: number;
  red_packet_received?: number;
  red_packet_refunded?: number;
  gift_spent?: number;
  /** 我买群升级一共花掉的币（已经算在 balance 里，docs/group-plus.md 第 1 节）。旧后端没有 */
  group_plus_spent?: number;
  /** 后台赠送给我的币（赠送 − 扣除，可能是负数；已经算在 balance 里，docs/shop.md 5.2）。旧后端没有 */
  granted?: number;
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

export type ShopPurchaseSource = 'purchase' | 'level' | 'grant' | 'gift';

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
  /** 这一笔买到的是限时商品时：有效期多少天、到哪天为止；永久商品都是 null */
  duration_days: number | null;
  expires_at: string | null;
  /** source 为 gift 时是谁送的；其余来源是 null */
  from_user: import('./api').User | null;
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

/** 实时事件 shop.item.expiring（到期前 3 天，只发一次）的 data；shop.item.expired 的 data 没有 expires_at。都只发给本人 */
export interface ShopExpiryEvent {
  item: { sku: string; name: string; category: string };
  expires_at?: string | null;
}
