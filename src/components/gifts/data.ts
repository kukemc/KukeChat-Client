import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query';
import { ApiError, NetworkError } from '@/api/client';
import { getCharmLeaderboard, getGiftCatalog, getGiftWall, getGiftWallRecords, getMyGifts, normalizeGiftRecord, sendGift } from '@/api/gifts';
import { isRecord } from '@/api/normalizers';
import { absorbPacketMute, applyRedPacketBalance } from '@/components/redpacket/data';
import { applyShopPatch, isShopUnavailable, shopErrorCode, shopErrorDetail, shopKeys } from '@/components/shop/data';
import { formatCoins } from '@/components/shop/labels';
import { upsertMessageIntoFirstPage, type MessagesInfiniteData } from '@/realtime/cache';
import { patchUserInCaches } from '@/realtime/userPatch';
import { useKukeStore } from '@/store/kukeStore';
import type { Conversation } from '@/types/api';
import type { CharmLeaderboard, CharmPeriod, GiftCatalog, GiftDirection, GiftRecord, GiftRecordPage, GiftWall, SendGiftPayload, SendGiftResult } from '@/types/gift';
import type { ShopOverview } from '@/types/shop';
import { applyLatestMessageToConversations } from '@/utils/conversations';
import { charmBoardLabel, DEFAULT_CHARM_LABEL } from '@/utils/gift';
import { noteGiftArrival } from './ui';

/**
 * 礼物的数据层：缓存 key、查询、送出之后怎么就地更新缓存、实时事件怎么处理。
 *
 * 开关和目录是一份（GET /gifts/catalog）。它的值有三种：GiftCatalog（接口在）、null（当前连接的服务端没有礼物，404）、undefined（还没拿到）。
 * 只有确实拿到了、而且 enabled 为 true，礼物相关的东西才出现 —— 入口、礼物墙、心意值、榜单、记录都看 useGiftsEnabled。
 * 已经在聊天里的礼物消息不看开关：卡片照常画（它用的全是消息自己带的数据）。
 * 余额不另存：商店主数据里的 balance 就是它，送出的回包里带着新余额，直接换进去（和红包一样）。
 * 心意值挂在用户对象上（user.charm）：送成功的回包、gift.received 事件里都带着收礼人的最新值，用 patchUserInCaches 改到所有缓存里。
 */
export const giftKeys = {
  root: ['gifts'] as const,
  catalog: ['gifts', 'catalog'] as const,
  walls: ['gifts', 'wall'] as const,
  wall: (userId: number) => ['gifts', 'wall', userId] as const,
  wallRecords: (userId: number, filter: string, limit: number, offset: number) => ['gifts', 'wall', userId, 'records', filter, limit, offset] as const,
  mine: ['gifts', 'mine'] as const,
  minePage: (direction: GiftDirection, limit: number, offset: number) => ['gifts', 'mine', direction, limit, offset] as const,
  board: ['gifts', 'board'] as const,
  boardPeriod: (period: CharmPeriod) => ['gifts', 'board', period] as const
};

/** 错误的 detail 是 { code, message }，和商店、红包一个形状。 */
export const giftErrorCode = shopErrorCode;

/** 服务端没有礼物接口时，每隔这么久再探一次；部署之后入口自己出现。 */
const UNAVAILABLE_RETRY_MS = 10 * 60_000;

async function fetchCatalog(): Promise<GiftCatalog | null> {
  try {
    return await getGiftCatalog();
  } catch (error) {
    // 旧后端没有这个接口（404）：不是出错，是「没有礼物」
    if (isShopUnavailable(error)) {
      return null;
    }
    throw error;
  }
}

/** 礼物的开关、目录和上限。data 为 null 表示当前连接的服务端没有礼物。 */
export function useGiftCatalog(enabled = true): UseQueryResult<GiftCatalog | null> {
  return useQuery({
    queryKey: giftKeys.catalog,
    queryFn: fetchCatalog,
    enabled,
    retry: false,
    staleTime: 60_000,
    refetchInterval: (query) => (query.state.data === null ? UNAVAILABLE_RETRY_MS : false)
  });
}

/** 礼物相关的东西要不要出现：确实拿到了目录、并且开着才出现；404、还没拿到、请求失败、enabled 为 false 都不出现。 */
export function useGiftsEnabled(enabled = true): boolean {
  return useGiftCatalog(enabled).data?.enabled === true;
}

/** 「心意值」现在叫什么。界面上凡是要写这个名字的地方都从这里取（utils/gift.ts 的 DEFAULT_CHARM_LABEL 只是取不到时的兜底）。 */
export function useCharmLabel(): string {
  return useGiftCatalog().data?.charm_label ?? DEFAULT_CHARM_LABEL;
}

/** 按心意值排的榜叫什么（心意榜）。 */
export function useCharmBoardLabel(): string {
  return charmBoardLabel(useCharmLabel());
}

/** 用户对象上的心意值；没有这个字段（旧后端）是 null。 */
export function charmOf(user: { charm?: number | null } | null | undefined): number | null {
  return typeof user?.charm === 'number' && Number.isFinite(user.charm) ? Math.max(0, Math.round(user.charm)) : null;
}

export interface CharmFact {
  /** 「心意值」（从 useCharmLabel 取，改名后跟着变） */
  label: string;
  value: string;
  title: string;
}

/**
 * 资料卡统计行（连续活跃 · 全站名次 · 注册 · 心意值）里的心意值那一项。
 * 礼物功能关着、是机器人、用户对象上没有这个字段（旧后端）时是 null，那一项就不出现。
 */
export function useCharmFact(user: { charm?: number | null; is_bot?: boolean } | null | undefined): CharmFact | null {
  const enabled = useGiftsEnabled();
  const label = useCharmLabel();
  const charm = charmOf(user);
  if (!enabled || !user || user.is_bot || charm === null) {
    return null;
  }
  return { label, value: formatCoins(charm), title: `${label} ${charm.toLocaleString('zh-CN')}：收到的礼物越多越高` };
}

export function useGiftWall(userId: number | null | undefined, enabled: boolean): UseQueryResult<GiftWall> {
  return useQuery({ queryKey: giftKeys.wall(userId ?? 0), queryFn: () => getGiftWall(userId ?? 0), enabled: enabled && Boolean(userId), retry: false, staleTime: 30_000 });
}

export function useGiftWallRecords(userId: number, filter: { giftKey?: string; itemSku?: string }, limit: number, offset: number, enabled: boolean): UseQueryResult<GiftRecordPage> {
  return useQuery({
    queryKey: giftKeys.wallRecords(userId, filter.giftKey ? `gift:${filter.giftKey}` : `item:${filter.itemSku ?? ''}`, limit, offset),
    queryFn: () => getGiftWallRecords(userId, filter, limit, offset),
    enabled,
    retry: false,
    staleTime: 30_000,
    placeholderData: keepPreviousData
  });
}

export function useMyGifts(direction: GiftDirection, limit: number, offset: number, enabled = true): UseQueryResult<GiftRecordPage> {
  return useQuery({ queryKey: giftKeys.minePage(direction, limit, offset), queryFn: () => getMyGifts(direction, limit, offset), enabled, retry: false, staleTime: 30_000, placeholderData: keepPreviousData });
}

export const CHARM_BOARD_SIZE = 50;

export function useCharmLeaderboard(period: CharmPeriod, enabled: boolean): UseQueryResult<CharmLeaderboard> {
  return useQuery({ queryKey: giftKeys.boardPeriod(period), queryFn: () => getCharmLeaderboard(period, CHARM_BOARD_SIZE), enabled, retry: false, staleTime: 60_000 });
}

/** 一条记录落定之后，跟它有关的列表都过期了：两个人的礼物墙、我的记录、榜单。 */
function invalidateAfterRecord(queryClient: QueryClient, record: GiftRecord | null, fallbackUserId?: number): void {
  const toUserId = record?.to_user?.id ?? fallbackUserId;
  if (toUserId) {
    void queryClient.invalidateQueries({ queryKey: giftKeys.wall(toUserId) });
  }
  void queryClient.invalidateQueries({ queryKey: giftKeys.mine });
  void queryClient.invalidateQueries({ queryKey: giftKeys.board });
}

/** 记录里带着收礼人的最新心意值：改到所有缓存里这个人的副本上（资料卡、个人空间上的数字当场跟着变）。 */
function applyRecipientCharm(queryClient: QueryClient, record: GiftRecord | null): void {
  const user = record?.to_user;
  const charm = charmOf(user);
  if (user && charm !== null) {
    patchUserInCaches(queryClient, user.id, { charm });
  }
}

/**
 * 送礼物 / 送商品。成功：余额换成回包里的；落了消息的话和发普通消息一样直接写进缓存（不等实时事件），并且让动效播起来；
 * 收礼人的心意值、礼物墙、记录跟着更新。
 * 失败：按错误码把手头过期的东西对齐（开关关了、余额不够、没绑定、被禁言、商品状态变了）。
 */
export function useSendGift(): UseMutationResult<SendGiftResult, Error, SendGiftPayload> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SendGiftPayload) => sendGift(payload),
    onSuccess: (result, payload) => {
      applyRedPacketBalance(queryClient, result.balance);
      applyRecipientCharm(queryClient, result.record);
      invalidateAfterRecord(queryClient, result.record, payload.to_user_id);
      const message = result.message;
      if (message) {
        queryClient.setQueryData<MessagesInfiniteData | undefined>(['messages', message.conversation_id], (current) => upsertMessageIntoFirstPage(current, message));
        queryClient.setQueryData<Conversation[] | undefined>(['conversations'], (current) => applyLatestMessageToConversations(current, message, { visibleConversationId: useKukeStore.getState().visibleConversationId }));
        noteGiftArrival(message);
      } else if (payload.conversation_id !== null) {
        // 在会话里送的，但回包里的消息读不出来：重拉这个会话的消息
        void queryClient.invalidateQueries({ queryKey: ['messages', payload.conversation_id] });
      }
    },
    onError: (error) => {
      const code = giftErrorCode(error);
      const detail = shopErrorDetail(error);
      const balance = queryClient.getQueryData<ShopOverview | null>(shopKeys.overview)?.balance;
      if (code === 'disabled' || code === 'invalid_gift') {
        // 开关关了、礼物下架了：手头的目录是旧的
        void queryClient.invalidateQueries({ queryKey: giftKeys.catalog });
      } else if (code === 'not_giftable') {
        void queryClient.invalidateQueries({ queryKey: shopKeys.overview });
      } else if (code === 'insufficient_balance') {
        // detail 里带着服务端刚核实过的余额（balance）和差多少（shortfall）；万一没带就重拉
        if (balance && typeof detail.balance === 'number' && Number.isFinite(detail.balance)) {
          applyShopPatch(queryClient, { balance: { ...balance, balance: detail.balance } });
        } else {
          void queryClient.invalidateQueries({ queryKey: shopKeys.overview });
        }
      } else if (code === 'ccw_not_bound' && balance) {
        applyShopPatch(queryClient, { balance: { ...balance, bound: false } });
      } else if (code === 'muted') {
        absorbPacketMute(error);
      }
    }
  });
}

/**
 * 实时事件 gift.received（只发给收礼人，无论有没有落消息）：{ record }。src/realtime/client.ts 收到后调这里；预览页模拟事件时也调这里。
 * 我的心意值、礼物墙、收到的记录、榜单跟着更新；送的是商店商品的话我多了一件装扮，商店的主数据重拉。
 * 提示由 GiftToasts 自己订阅事件。返回整理好的记录（读不出来是 null）。
 */
export function handleGiftEvent(queryClient: QueryClient, data: unknown): GiftRecord | null {
  const record = normalizeGiftRecord(isRecord(data) ? data.record : null);
  if (!record) {
    return null;
  }
  applyRecipientCharm(queryClient, record);
  invalidateAfterRecord(queryClient, record, useKukeStore.getState().currentUser?.id);
  if (record.kind === 'item') {
    void queryClient.invalidateQueries({ queryKey: shopKeys.overview });
    void queryClient.invalidateQueries({ queryKey: shopKeys.purchases });
  }
  return record;
}

/** 断线重连之后：期间的事件收不到，开关可能变过。 */
export function refreshGiftsAfterReconnect(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: giftKeys.catalog });
  void queryClient.invalidateQueries({ queryKey: giftKeys.walls, refetchType: 'active' });
}

function fallbackText(error: unknown, fallback: string): string {
  if (error instanceof NetworkError) {
    return '网络连接不上，检查一下网络再试。';
  }
  if (error instanceof ApiError && error.status >= 500) {
    return '服务器开小差了，稍后再试。这次没有扣币。';
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

export interface GiftFailure {
  code: string | null;
  message: string;
}

/** 送礼失败该怎么说。余额不够、没绑定两种在面板里有自己的画面，这里的文字是兜底。 */
export function describeSendGiftError(error: unknown, targetName: string): GiftFailure {
  const code = giftErrorCode(error);
  const detail = shopErrorDetail(error);
  switch (code) {
    case 'disabled':
      return { code, message: '礼物功能现在关着，暂时送不了。' };
    case 'not_member':
      return { code, message: '你或者对方已经不在这个会话里了，在这里送不了。' };
    case 'muted':
      return { code, message: '你正在禁言中，不能送礼物。' };
    case 'ccw_not_bound':
      return { code, message: '还没有绑定 CCW 账号，绑定后才能送礼物。' };
    case 'blocked':
      return { code, message: `${targetName} 把你拉黑了，送不了礼物。` };
    case 'invalid_target':
      return { code, message: '不能送给这个人：不能送给自己，或者对方的账号已经不存在。' };
    case 'invalid_gift':
      return { code, message: '这个礼物已经下架了，换一个吧。' };
    case 'invalid_count':
      return { code, message: '数量不对：要是正整数，并且在上限以内。' };
    case 'not_giftable':
      return { code, message: '这件商品现在不能送：已经下架、过了销售期，或者本来就不出售。' };
    case 'message_rejected':
      return { code, message: '留言没有通过审核，改一改再送。' };
    case 'recipient_owns':
      return { code, message: `${targetName} 已经永久拥有这件装扮了，换一件送吧。` };
    case 'insufficient_balance': {
      const shortfall = typeof detail.shortfall === 'number' && detail.shortfall > 0 ? detail.shortfall : null;
      return { code, message: shortfall ? `金币不够，还差 ${formatCoins(shortfall)} 个。` : '金币不够。' };
    }
    case 'daily_limit':
      return { code, message: '今天送礼物的次数用完了，明天再来。' };
    case 'verification_unavailable':
      return { code, message: '现在连不上 CCW，没法核实你的余额，稍后再试。这次没有扣币。' };
    default:
      return { code, message: fallbackText(error, '礼物没有送出去，稍后再试。') };
  }
}
