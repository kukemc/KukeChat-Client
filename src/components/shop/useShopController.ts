import { useCallback, useEffect, useMemo, useState } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { useEvent } from '@/components/chat/desktop/runtime';
import { toast } from '@/components/ui/toast';
import { subscribeRealtimeEvents } from '@/realtime/events';
import { useKukeStore } from '@/store/kukeStore';
import type { ShopBalance, ShopCategory, ShopItem, ShopOverview } from '@/types/shop';
import { parseApiDate } from '@/utils/dateTime';
import { openExternalUrl } from '@/utils/openExternalUrl';
import { KNOWN_CATEGORIES, slotOfCategory, useEquipItem, useRefreshBalance, useShop } from './data';
import { categoryText, describeEquipError, describeRefreshError } from './labels';

/** 两次刷新余额之间至少隔多久（docs/shop.md 3.2）。服务端 429 时以它给的 retry_after 为准。 */
const REFRESH_INTERVAL_SECONDS = 20;

// 刷新的冷却记在模块里：从商店页切走再回来、桌面和移动布局互换，倒计时都接着走
let refreshReadyAt = 0;
// 「绑定了但从没核实过」时自动核实一次（docs/shop.md 3.6）。试过就不再试，不管成没成；余额核实过、或者解绑了之后才重新算
let autoVerifyTried = false;

export interface WardrobeSlot {
  category: ShopCategory;
  /** 这个槽现在装备的 sku；没装备是 null */
  sku: string | null;
  /** 装备的那件商品；没装备，或者那件不在手头的目录里，是 null */
  item: ShopItem | null;
}

export interface ShopController {
  query: UseQueryResult<ShopOverview | null>;
  /** undefined 还在加载；null 服务端没有商店 */
  shop: ShopOverview | null | undefined;
  /** 客户端认识的类别 */
  categories: ShopCategory[];
  activeCategory: string | null;
  setActiveCategory: (key: string) => void;
  /** 当前类别下的商品，顺序就是服务端给的顺序 */
  items: ShopItem[];
  wardrobe: WardrobeSlot[];
  /** 每秒 / 每半分钟走一次的时钟，倒计时用 */
  now: number;

  balance: ShopBalance | null;
  refresh: () => void;
  refreshing: boolean;
  /** 还要等几秒才能再刷新；0 表示现在就可以 */
  refreshWait: number;
  refreshError: string | null;
  /** 打开投币的作品页。url 不传就用商店主数据里的 */
  donate: (url?: string) => void;
  /** 现在能不能充值：服务端没配置官方作品（donate_url 为空）时不能 */
  canDonate: boolean;
  /** 这次打开商店之后点过「去投币」：余额区把「回来点刷新」那句话提到显眼的位置 */
  donated: boolean;

  equip: (item: ShopItem) => void;
  unequip: (slot: string) => void;
  /** 卸下某件商品所在的槽 */
  unequipItem: (item: ShopItem) => void;
  /** 正在装备 / 卸下的那一件的 sku（卸下时是槽名） */
  equipPending: string | null;

  purchaseTarget: ShopItem | null;
  openPurchase: (item: ShopItem) => void;
  closePurchase: () => void;
  tryOnTarget: ShopItem | null;
  openTryOn: (item: ShopItem) => void;
  closeTryOn: () => void;
  historyOpen: boolean;
  setHistoryOpen: (open: boolean) => void;
}

function useClock(fast: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), fast ? 1000 : 30_000);
    return () => window.clearInterval(timer);
  }, [fast]);
  return now;
}

/**
 * 商店页的全部状态和动作，桌面和移动两套界面共用同一个。界面组件只管画。
 */
export function useShopController(): ShopController {
  const query = useShop();
  const shop = query.data;
  const refreshMutation = useRefreshBalance();
  const equipMutation = useEquipItem();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [readyAt, setReadyAt] = useState(refreshReadyAt);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [donated, setDonated] = useState(false);
  const [purchaseSnapshot, setPurchaseSnapshot] = useState<ShopItem | null>(null);
  const [tryOnSnapshot, setTryOnSnapshot] = useState<ShopItem | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [equipPending, setEquipPending] = useState<string | null>(null);

  const categories = useMemo(() => (shop?.categories ?? []).filter((category) => KNOWN_CATEGORIES.has(category.key)), [shop?.categories]);
  const activeCategory = categories.some((category) => category.key === selectedCategory) ? selectedCategory : categories[0]?.key ?? null;
  const allItems = shop?.items;
  const items = useMemo(() => (allItems ?? []).filter((item) => item.category === activeCategory), [activeCategory, allItems]);
  const wardrobe = useMemo<WardrobeSlot[]>(() => categories.map((category) => {
    const sku = shop?.equipped[category.slot] ?? null;
    return { category, sku, item: sku ? (allItems ?? []).find((item) => item.sku === sku) ?? null : null };
  }), [allItems, categories, shop?.equipped]);

  // 有倒计时在走（刷新冷却、一小时内到期的限时商品）就每秒走一次，否则半分钟一次
  const coolingDown = readyAt > Date.now();
  const endingSoon = useMemo(() => (allItems ?? []).some((item) => {
    if (!item.available_until) {
      return false;
    }
    const left = (parseApiDate(item.available_until)?.getTime() ?? 0) - Date.now();
    return left > 0 && left < 3600_000;
  }), [allItems]);
  // 钟半分钟才走一格；刚买完 / 刚续期时数据比钟新，拿旧的钟去算会把「30 天」算成「还剩 31 天」，所以不早于数据更新的时刻
  const clock = useClock(coolingDown || endingSoon);
  const now = Math.max(clock, query.dataUpdatedAt);

  // 我拥有的限时商品里最早到期的那一件：到点重拉一次（服务端读取时现场判断到期），商店页开着的时候它会当场变回「可以买」。
  // 到期事件 shop.item.expired 也会触发重拉（data.ts），这里是事件没收到时的兜底
  const nextExpiry = useMemo(() => {
    const times = (allItems ?? []).map((item) => parseApiDate(item.expires_at)?.getTime() ?? null).filter((time): time is number => time !== null);
    return times.length > 0 ? Math.min(...times) : null;
  }, [allItems]);
  const refreshWait = Math.max(0, Math.ceil((readyAt - now) / 1000));

  const startCooldown = (seconds: number): void => {
    refreshReadyAt = Date.now() + seconds * 1000;
    setReadyAt(refreshReadyAt);
  };

  const refresh = useEvent((): void => {
    if (refreshMutation.isPending || refreshReadyAt > Date.now()) {
      return;
    }
    setRefreshError(null);
    refreshMutation.mutate(undefined, {
      onSuccess: (balance) => {
        startCooldown(REFRESH_INTERVAL_SECONDS);
        // 核实失败时服务端不报错，返回上次的数并带 stale —— 余额区会显示提示，这里不重复
        if (!balance.stale) {
          toast.success('余额已更新');
        }
      },
      onError: (error) => {
        const failure = describeRefreshError(error);
        if (failure.retryAfter !== null) {
          startCooldown(failure.retryAfter);
        }
        setRefreshError(failure.message);
      }
    });
  });

  const refetch = query.refetch;
  useEffect(() => {
    if (nextExpiry === null) {
      return undefined;
    }
    // setTimeout 的延时上限约 24.8 天：更远的先不管，下次目录变化时会重新算
    const wait = nextExpiry - Date.now() + 800;
    if (wait > 2_000_000_000) {
      return undefined;
    }
    const timer = window.setTimeout(() => void refetch(), Math.max(0, wait));
    return () => window.clearTimeout(timer);
  }, [nextExpiry, refetch]);

  // 从别处直达某一件商品（礼物卡片上的「去装扮」、到期提示上的「去续期」）：切到它的类别，打开它的试穿面板
  const focusSku = useKukeStore((state) => state.shopFocusSku);
  const clearShopFocus = useKukeStore((state) => state.clearShopFocus);
  useEffect(() => {
    if (!focusSku || !allItems) {
      return;
    }
    const target = allItems.find((item) => item.sku === focusSku && KNOWN_CATEGORIES.has(item.category));
    if (target) {
      setSelectedCategory(target.category);
      setPurchaseSnapshot(null);
      setTryOnSnapshot(target);
    }
    clearShopFocus();
  }, [allItems, clearShopFocus, focusSku]);
  // 目录有变化（上架、下架、改价）：商店页开着时重拉。事件本身只把缓存标成过期，见 data.ts 的 handleShopEvent
  useEffect(() => subscribeRealtimeEvents((event) => {
    if (event.rawType === 'shop.changed') {
      void refetch();
    }
  }), [refetch]);

  // GET /shop 不会向 CCW 发请求：绑定后从没核实过的人 verified_at 是 null、余额是 0。打开商店时替他核实一次，
  // 只自动这一次 —— 失败、429 都按手动刷新的方式提示，不循环重试
  const bound = shop?.balance.bound ?? false;
  const neverVerified = Boolean(shop) && bound && shop?.balance.verified_at === null;
  useEffect(() => {
    if (!shop) {
      return;
    }
    if (!neverVerified) {
      autoVerifyTried = false;
      return;
    }
    if (!autoVerifyTried) {
      autoVerifyTried = true;
      refresh();
    }
  }, [neverVerified, refresh, shop]);

  const donateUrl = shop?.donate_url ?? '';
  const donate = useEvent((url?: string): void => {
    const target = url || donateUrl;
    if (!target) {
      toast.error('暂时不能充值：服务端还没有配置投币的作品。');
      return;
    }
    setDonated(true);
    void openExternalUrl(target);
  });

  const runEquip = (slot: string, sku: string | null, pendingKey: string, done: string): void => {
    if (equipMutation.isPending) {
      return;
    }
    setEquipPending(pendingKey);
    equipMutation.mutate({ slot, sku }, {
      onSuccess: () => toast.success(done),
      onError: (error) => toast.error(describeEquipError(error)),
      onSettled: () => setEquipPending(null)
    });
  };
  const equip = useEvent((item: ShopItem): void => runEquip(slotOfCategory(shop?.categories ?? [], item.category), item.sku, item.sku, `已换上「${item.name}」`));
  const unequip = useEvent((slot: string): void => runEquip(slot, null, slot, categoryText((shop?.categories ?? []).find((category) => category.slot === slot)?.key).unequipped));
  const unequipItem = useEvent((item: ShopItem): void => runEquip(slotOfCategory(shop?.categories ?? [], item.category), null, item.sku, categoryText(item.category).unequipped));

  // 弹窗里展示的商品从缓存里现取：买完之后它的状态（已拥有、已装备）是新的。
  // 开着弹窗时这件从目录里消失了（刚被下架、而我没有它）：弹窗不跟着消失，按「已下架」显示
  const live = (snapshot: ShopItem | null): ShopItem | null => {
    if (!snapshot) {
      return null;
    }
    return (allItems ?? []).find((item) => item.id === snapshot.id) ?? { ...snapshot, delisted: true };
  };
  const purchaseTarget = live(purchaseSnapshot);
  const tryOnTarget = live(tryOnSnapshot);

  return {
    query,
    shop,
    categories,
    activeCategory,
    setActiveCategory: setSelectedCategory,
    items,
    wardrobe,
    now,
    balance: shop?.balance ?? null,
    refresh,
    refreshing: refreshMutation.isPending,
    refreshWait,
    refreshError,
    donate,
    canDonate: Boolean(donateUrl),
    donated,
    equip,
    unequip,
    unequipItem,
    equipPending,
    purchaseTarget,
    openPurchase: useCallback((item: ShopItem) => setPurchaseSnapshot(item), []),
    closePurchase: useCallback(() => setPurchaseSnapshot(null), []),
    tryOnTarget,
    openTryOn: useCallback((item: ShopItem) => setTryOnSnapshot(item), []),
    closeTryOn: useCallback(() => setTryOnSnapshot(null), []),
    historyOpen,
    setHistoryOpen
  };
}
