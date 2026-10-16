import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query';
import { ApiError } from '@/api/client';
import { isRecord } from '@/api/normalizers';
import { getShop, getShopPurchases, normalizeShopBalance, purchaseShopItem, refreshShopBalance, setShopEquipped } from '@/api/shop';
import type { MobileSortableFeatureId } from '@/mobile/features';
import { handleCosmeticsEvent } from '@/realtime/userPatch';
import { useKukeStore } from '@/store/kukeStore';
import type { User } from '@/types/api';
import type { ShopBalance, ShopCategory, ShopItem, ShopOverview, ShopPurchasePage, ShopPurchaseResult, UserCosmetics } from '@/types/shop';

/**
 * 商店的数据层：缓存 key、查询、写操作之后怎么就地更新缓存、实时事件怎么处理。
 *
 * 整个商店只有一份主数据 —— GET /shop 的结果（目录、余额、装备）。购买、装备、刷新余额都直接改这份缓存，不整份重拉。
 * 它的值有三种：ShopOverview（正常）、null（当前连接的服务端没有商店，接口 404）、undefined（还没拿到）。
 * 「自己装备了什么」另有一份在当前用户对象上（kukeStore.currentUser.cosmetics），聊天里自己的气泡读的是它，
 * 所以装备变化后要同步过去，见 syncMyCosmetics。
 */
export const shopKeys = {
  root: ['shop'] as const,
  overview: ['shop', 'overview'] as const,
  purchases: ['shop', 'purchases'] as const,
  purchasesPage: (limit: number, offset: number) => ['shop', 'purchases', limit, offset] as const
};

/** 客户端认识的商品类别。不认识的类别连同它的商品一起不显示（docs/shop.md 2.1）。 */
export const KNOWN_CATEGORIES: ReadonlySet<string> = new Set(['bubble', 'frame']);

/** 服务端错误的 detail：新接口是 { code, message, … }，包在响应体的 detail 字段里。 */
export function shopErrorDetail(error: unknown): Record<string, unknown> {
  if (!(error instanceof ApiError) || !isRecord(error.detail)) {
    return {};
  }
  return isRecord(error.detail.detail) ? error.detail.detail : error.detail;
}

export function shopErrorCode(error: unknown): string | null {
  const code = shopErrorDetail(error).code;
  return typeof code === 'string' ? code : null;
}

/** 接口在这个后端上不存在（还没部署商店）。和「出错了」分开：不是报错，是「还没开放」。 */
export function isShopUnavailable(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 404 || error.status === 405 || error.status === 501) && shopErrorCode(error) === null;
}

/** 某个类别的商品装备在哪个槽。 */
export function slotOfCategory(categories: readonly ShopCategory[], categoryKey: string): string {
  return categories.find((category) => category.key === categoryKey)?.slot ?? categoryKey;
}

function sameStyle(left: unknown, right: unknown): boolean {
  if (left === right) {
    return true;
  }
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

/**
 * 把「每个槽装备的 sku」换成用户对象上的 cosmetics（{ 槽: { sku, style } }），写到当前用户上。
 * 聊天里自己的气泡读的是 kukeStore.currentUser，改了它，正开着的聊天里自己的气泡立刻跟着变。
 * 目录里找不到的 sku（刚被赠送、目录还没重拉）先不动，等下一次拉到再同步。
 */
export function syncMyCosmetics(queryClient: QueryClient, overview: ShopOverview): void {
  const state = useKukeStore.getState();
  const user = state.currentUser;
  if (!user) {
    return;
  }
  const next: UserCosmetics = { ...(isRecord(user.cosmetics) ? user.cosmetics as UserCosmetics : {}) };
  const slots = new Set([...overview.categories.map((category) => category.slot), ...Object.keys(overview.equipped)]);
  let changed = false;
  for (const slot of slots) {
    const sku = overview.equipped[slot] ?? null;
    if (!sku) {
      if (next[slot]) {
        delete next[slot];
        changed = true;
      }
      continue;
    }
    const item = overview.items.find((candidate) => candidate.sku === sku);
    if (item && (next[slot]?.sku !== sku || !sameStyle(next[slot]?.style, item.style))) {
      next[slot] = { sku, style: item.style };
      changed = true;
    }
  }
  if (!changed) {
    return;
  }
  state.setCurrentUser({ ...user, cosmetics: next });
  // /auth/me 的缓存也改掉：ChatShell 会把它再写回 store，两边不一致的话皮肤会被旧数据盖回去
  queryClient.setQueriesData<User | undefined>({ queryKey: ['me'] }, (current) => (current && current.id === user.id ? { ...current, cosmetics: next } : current));
}

async function fetchShop(queryClient: QueryClient): Promise<ShopOverview | null> {
  try {
    const overview = await getShop();
    syncMyCosmetics(queryClient, overview);
    return overview;
  } catch (error) {
    if (isShopUnavailable(error)) {
      return null;
    }
    throw error;
  }
}

/** 服务端还没有商店时，每隔这么久再探一次（只在页面可见时）；部署之后入口自己出现，不用重启客户端。 */
const UNAVAILABLE_RETRY_MS = 10 * 60_000;

/** 商店的主数据。data 为 null 表示当前连接的服务端没有商店。 */
export function useShop(enabled = true): UseQueryResult<ShopOverview | null> {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: shopKeys.overview,
    queryFn: () => fetchShop(queryClient),
    enabled,
    retry: false,
    staleTime: 30_000,
    refetchOnMount: true,
    refetchInterval: (query) => (query.state.data === null ? UNAVAILABLE_RETRY_MS : false)
  });
}

/** 商店入口要不要出现：只有确实拿到过商店数据才出现；404、还没拿到、请求失败都不出现。 */
export function useShopAvailable(enabled = true): boolean {
  const data = useShop(enabled).data;
  return data !== null && data !== undefined;
}

const NO_HIDDEN_FEATURES: ReadonlySet<MobileSortableFeatureId> = new Set();
const SHOP_HIDDEN: ReadonlySet<MobileSortableFeatureId> = new Set<MobileSortableFeatureId>(['shop']);

/** 移动端的功能入口里现在要藏起来的那些：服务端没有商店时，「商店」不进底栏、不进空间页、也不进排序列表。 */
export function useHiddenMobileFeatures(): ReadonlySet<MobileSortableFeatureId> {
  return useShopAvailable() ? NO_HIDDEN_FEATURES : SHOP_HIDDEN;
}

/** 就地改商店的主数据。给了 equipped 时，商品上的 equipped 标记一起对齐。 */
export function applyShopPatch(queryClient: QueryClient, patch: { item?: ShopItem; balance?: ShopBalance; equipped?: Record<string, string | null> }): void {
  queryClient.setQueryData<ShopOverview | null | undefined>(shopKeys.overview, (current) => {
    if (!current) {
      return current;
    }
    let items = current.items;
    if (patch.item) {
      const incoming = patch.item;
      items = items.some((item) => item.id === incoming.id) ? items.map((item) => (item.id === incoming.id ? incoming : item)) : [...items, incoming];
    }
    const equipped = patch.equipped ?? current.equipped;
    if (patch.equipped) {
      items = items.map((item) => {
        const isEquipped = equipped[slotOfCategory(current.categories, item.category)] === item.sku;
        return item.equipped === isEquipped ? item : { ...item, equipped: isEquipped };
      });
    }
    return { ...current, items, balance: patch.balance ?? current.balance, equipped };
  });
}

function refetchShop(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: shopKeys.overview });
}

/**
 * 购买，或者领取等级已经够了的免费商品。
 * 成功：用回包里的商品、余额、装备换掉缓存里对应的部分。
 * 失败：服务端在扣币之前重新核实过余额，错误里可能带着新的余额；商品状态变了（下架、已拥有）的就重拉目录。
 */
export function usePurchaseItem(): UseMutationResult<ShopPurchaseResult | null, Error, ShopItem> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (item: ShopItem) => purchaseShopItem(item.id),
    onSuccess: (result) => {
      if (result) {
        applyShopPatch(queryClient, result);
      } else {
        refetchShop(queryClient);
      }
      void queryClient.invalidateQueries({ queryKey: shopKeys.purchases });
    },
    onError: (error) => {
      const code = shopErrorCode(error);
      const detail = shopErrorDetail(error);
      if (code === 'insufficient_coins') {
        const current = queryClient.getQueryData<ShopOverview | null>(shopKeys.overview)?.balance;
        // detail.balance 是数字：服务端刚核实到的当前余额（docs/shop.md 3.3）
        if (current && typeof detail.balance === 'number' && Number.isFinite(detail.balance)) {
          applyShopPatch(queryClient, { balance: { ...current, balance: detail.balance } });
        }
      } else if (code === 'ccw_not_bound') {
        const current = queryClient.getQueryData<ShopOverview | null>(shopKeys.overview)?.balance;
        if (current) {
          applyShopPatch(queryClient, { balance: { ...current, bound: false } });
        }
      } else if (code === 'already_owned' || code === 'item_unavailable' || code === 'item_not_found' || code === 'item_locked') {
        refetchShop(queryClient);
      }
    }
  });
}

/** 装备 / 卸下。成功后缓存和当前用户对象一起改，聊天里自己的气泡马上跟着变。 */
export function useEquipItem(): UseMutationResult<Record<string, string | null>, Error, { slot: string; sku: string | null }> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ slot, sku }) => setShopEquipped(slot, sku),
    onSuccess: (equipped, { sku }) => {
      applyShopPatch(queryClient, { equipped });
      const overview = queryClient.getQueryData<ShopOverview | null>(shopKeys.overview);
      if (overview) {
        syncMyCosmetics(queryClient, overview);
      }
      // 刚装备的这件不在手头的目录里（刚被赠送、目录是旧的）：重拉一次，拉到之后会再同步
      if (!overview || (sku && !overview.items.some((item) => item.sku === sku))) {
        refetchShop(queryClient);
      }
    },
    onError: (error) => {
      // 没有这件（被后台收回了）、槽不存在（422 invalid_slot，目录变过了）：手头的目录是旧的，重拉
      const code = shopErrorCode(error);
      if (code === 'not_owned' || code === 'invalid_slot') {
        refetchShop(queryClient);
      }
    }
  });
}

/** 向 CCW 重新核实余额。20 秒的限制和倒计时由界面管（useShopController）。 */
export function useRefreshBalance(): UseMutationResult<ShopBalance, Error, void> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => refreshShopBalance(),
    onSuccess: (balance) => applyShopPatch(queryClient, { balance }),
    onError: (error) => {
      if (shopErrorCode(error) === 'ccw_not_bound') {
        const current = queryClient.getQueryData<ShopOverview | null>(shopKeys.overview)?.balance;
        if (current) {
          applyShopPatch(queryClient, { balance: { ...current, bound: false } });
        }
      }
    }
  });
}

export function useShopPurchases(limit: number, offset: number, enabled: boolean): UseQueryResult<ShopPurchasePage> {
  return useQuery({ queryKey: shopKeys.purchasesPage(limit, offset), queryFn: () => getShopPurchases(limit, offset), enabled, retry: false, staleTime: 30_000, placeholderData: keepPreviousData });
}

/**
 * 商店的实时事件（docs/shop.md 第 4 节）。src/realtime/client.ts 收到事件后调这里；预览页模拟事件时也调这里。
 *
 *   · shop.changed 是发给所有在线用户的。这里只把目录标成过期、不重拉 —— 不然每改一次价，全站在线的人都会来拉一遍；
 *     商店页开着的时候由页面自己订阅事件去重拉（useShopController），没开着的下次打开时会重拉。
 *     例外：手头是「服务端没有商店」时重拉一次，商店刚上线的话入口就出来了。
 *   · shop.balance.changed 只发给本人：余额变了（发红包、领红包、没领完的退了回来、送礼物）。事件里带着完整的余额对象，直接用；没带才重拉。
 *   · shop.item.granted 只发给本人：目录里这件变成已拥有，购买记录多一条，直接重拉。提示由 ShopGrantToasts 自己订阅事件。
 *   · shop.item.expiring / shop.item.expired 只发给本人：一件限时商品快到期了（提前 3 天，一次）/ 已经到期。到期的那件不再拥有、
 *     装备着的话也被卸下了，重拉目录（重拉之后 syncMyCosmetics 会把当前用户对象上的装扮对齐）；提示同样由 ShopGrantToasts 出。
 *     到期时服务端另外照常发一条 user.cosmetics.updated，聊天里已经显示出来的气泡、头像框靠它当场摘掉。
 *   · user.cosmetics.updated（{ user_id, cosmetics }）也是发给所有在线用户的：有人换了装扮。把本地所有缓存里这个人的 cosmetics 换掉
 *     （realtime/userPatch.ts），已经显示出来的气泡跟着变，不发任何请求。是我自己的装扮、而且和手头的商店数据对不上
 *     （在别的设备上换的、限时商品到期被卸下），就把商店的主数据重拉一次。
 */
export function handleShopEvent(queryClient: QueryClient, rawType: string, data?: unknown): void {
  if (rawType === 'user.cosmetics.updated') {
    handleCosmeticsEvent(queryClient, data);
    const overview = queryClient.getQueryData<ShopOverview | null>(shopKeys.overview);
    if (overview && isRecord(data) && data.user_id === useKukeStore.getState().currentUser?.id) {
      const worn = isRecord(data.cosmetics) ? data.cosmetics : {};
      const differs = overview.categories.some((category) => {
        const slot = worn[category.slot];
        return (isRecord(slot) && typeof slot.sku === 'string' ? slot.sku : null) !== (overview.equipped[category.slot] ?? null);
      });
      if (differs) {
        // 我的装扮和手头的商店数据对不上了：在别的设备上换的，或者装备着的限时商品到期被服务端卸下了。
        // 这种事件只有本人的才会走到这里（很少），直接重拉：商店页开着的话「使用中」当场消失，重拉后 syncMyCosmetics 再对齐一次
        refetchShop(queryClient);
      }
    }
    return;
  }
  if (rawType === 'shop.changed') {
    if (queryClient.getQueryData<ShopOverview | null>(shopKeys.overview) === null) {
      refetchShop(queryClient);
    } else {
      void queryClient.invalidateQueries({ queryKey: shopKeys.overview, refetchType: 'none' });
    }
  }
  // 余额因为别的原因变了（发了红包、领到了、过期 / 撤回退回来的、送了礼物……），只发给本人。
  // data 是 { reason, change, balance, red_packet_id }（docs/red-packets.md 第 4 节），balance 是完整的余额对象：直接换进缓存，不用重拉；
  // 没带 balance（或者形状不对）、手头还没有商店数据时才重拉（GET /shop 不会去问 CCW，很轻）
  if (rawType === 'shop.balance.changed') {
    const pushed = isRecord(data) && isRecord(data.balance) && typeof data.balance.balance === 'number' ? normalizeShopBalance(data.balance) : null;
    if (pushed && queryClient.getQueryData<ShopOverview | null>(shopKeys.overview)) {
      applyShopPatch(queryClient, { balance: pushed });
    } else {
      refetchShop(queryClient);
    }
  }
  if (rawType === 'shop.item.granted') {
    refetchShop(queryClient);
    void queryClient.invalidateQueries({ queryKey: shopKeys.purchases });
  }
  if (rawType === 'shop.item.expired' || rawType === 'shop.item.expiring') {
    refetchShop(queryClient);
  }
}
