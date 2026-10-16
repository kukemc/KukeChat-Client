import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query';
import { ApiError, NetworkError } from '@/api/client';
import { claimRedPacket, getMyRedPackets, getPendingRedPackets, getRedPacket, getRedPacketConfig, sendRedPacket } from '@/api/redPackets';
import { applyShopPatch, isShopUnavailable, shopErrorCode, shopErrorDetail, shopKeys } from '@/components/shop/data';
import { formatCoins } from '@/components/shop/labels';
import { upsertMessageIntoFirstPage, type MessagesInfiniteData } from '@/realtime/cache';
import { useModerationStore } from '@/store/moderationStore';
import { useKukeStore } from '@/store/kukeStore';
import type { Conversation, Message } from '@/types/api';
import type { ClaimRedPacketResult, PendingRedPacket, RedPacket, RedPacketBalance, RedPacketConfig, RedPacketDirection, RedPacketId, RedPacketRecordPage, SendRedPacketPayload, SendRedPacketResult } from '@/types/redPacket';
import type { ShopOverview } from '@/types/shop';
import { normalizeRedPacketUpdate } from '@/api/redPackets';
import { applyLatestMessageToConversations } from '@/utils/conversations';
import { parseApiDate } from '@/utils/dateTime';

/**
 * 红包的数据层：缓存 key、查询、发和抢之后怎么就地更新缓存、实时事件怎么处理。
 *
 * 一个红包的状态（GET /red-packets/{id}）按 id 缓存一份，聊天里的卡片、拆红包的弹层、领取详情读的都是它：
 *   · 卡片进入视口才取第一次（RedPacketCard），取到之后不再自己重取 —— 一屏很多红包时，请求数就是红包数，滚回来不会再发；
 *   · 之后靠 red_packet.updated 事件把「领了几个、什么状态」补进缓存（事件不带金额，卡片也用不着金额）；
 *   · 金额和谁领了多少只有详情要看：详情打开时重取一次，开着的时候收到事件再取（见 OpenRedPacketDialog）。
 * 余额不另存：商店主数据里的 balance 就是它（components/shop/data.ts），发、抢的回包里带着新余额，直接换进去；
 * 别的原因引起的变化（过期、撤回退回来的）服务端会推 shop.balance.changed，由商店那边重拉。
 *
 * 关掉总开关（config.enabled 为 false）只是不能发新的：已经发出去的红包照常能点开、能领，所以卡片和弹层都不看这个开关。
 */
export const redPacketKeys = {
  root: ['red-packets'] as const,
  config: ['red-packets', 'config'] as const,
  details: ['red-packets', 'detail'] as const,
  detail: (id: RedPacketId) => ['red-packets', 'detail', String(id)] as const,
  mine: ['red-packets', 'mine'] as const,
  pendingAll: ['red-packets', 'pending'] as const,
  pending: (conversationId: number) => ['red-packets', 'pending', conversationId] as const,
  minePage: (direction: RedPacketDirection, limit: number, offset: number) => ['red-packets', 'mine', direction, limit, offset] as const
};

/** 错误的 detail 是 { code, message }，和商店的新接口一个形状。 */
export const redPacketErrorCode = shopErrorCode;

/**
 * 红包、礼物接口的 403 muted：带 muted_until 的是平台禁言，记到禁言状态里（工具栏上的入口跟着置灰，到点自动解开）；
 * 不带的是群内禁言 / 全员禁言（只挡发，不挡领），不动平台的禁言状态。
 */
export function absorbPacketMute(error: unknown): void {
  const detail = shopErrorDetail(error);
  if (detail.code === 'muted' && typeof detail.muted_until === 'string') {
    useModerationStore.getState().setMute(detail.muted_until, typeof detail.reason === 'string' ? detail.reason : null);
  }
}

/** 服务端给的那句话（detail.message 是可以直接展示的中文）；没有就是 null。 */
function serverMessage(error: unknown): string | null {
  const message = shopErrorDetail(error).message;
  return typeof message === 'string' && message.trim() ? message.trim() : null;
}

/** 服务端没有红包接口时，每隔这么久再探一次；部署之后入口自己出现。 */
const UNAVAILABLE_RETRY_MS = 10 * 60_000;

async function fetchConfig(): Promise<RedPacketConfig | null> {
  try {
    return await getRedPacketConfig();
  } catch (error) {
    // 旧后端没有这个接口（404）：不是出错，是「没有红包」
    if (isShopUnavailable(error)) {
      return null;
    }
    throw error;
  }
}

/** 红包的开关和上限。data 为 null 表示当前连接的服务端没有红包。 */
export function useRedPacketConfig(enabled = true): UseQueryResult<RedPacketConfig | null> {
  return useQuery({
    queryKey: redPacketKeys.config,
    queryFn: fetchConfig,
    enabled,
    retry: false,
    staleTime: 60_000,
    refetchInterval: (query) => (query.state.data === null ? UNAVAILABLE_RETRY_MS : false)
  });
}

/** 「发红包」的入口要不要出现：确实拿到了配置、并且开着才出现；404、还没拿到、请求失败、enabled 为 false 都不出现。 */
export function useRedPacketEnabled(enabled = true): boolean {
  return useRedPacketConfig(enabled).data?.enabled === true;
}

/** 红包记录的入口要不要出现：服务端有红包接口就出现，哪怕现在关着（以前发的、抢的还在）。 */
export function useRedPacketAvailable(enabled = true): boolean {
  const data = useRedPacketConfig(enabled).data;
  return data !== null && data !== undefined;
}

/** 一个红包的状态。enabled 由调用方给（卡片是「进过视口」）。取到之后一直算新鲜的，靠事件更新。 */
export function useRedPacket(id: RedPacketId, enabled: boolean): UseQueryResult<RedPacket> {
  return useQuery({
    queryKey: redPacketKeys.detail(id),
    queryFn: () => getRedPacket(id),
    enabled,
    retry: false,
    staleTime: Infinity,
    gcTime: 30 * 60_000
  });
}

export function storeRedPacket(queryClient: QueryClient, packet: RedPacket | null): void {
  if (packet) {
    queryClient.setQueryData<RedPacket>(redPacketKeys.detail(packet.id), packet);
  }
}

/** 红包过了有效期没有。到点服务端不推事件，卡片和弹层靠时钟自己切成「已过期」。 */
export function isRedPacketExpired(packet: Pick<RedPacket, 'status' | 'expires_at'>, now: number): boolean {
  if (packet.status === 'expired') {
    return true;
  }
  const expiresAt = parseApiDate(packet.expires_at)?.getTime();
  return packet.status === 'active' && expiresAt !== undefined && expiresAt <= now;
}

/** 把回包里的余额换进商店主数据。读不出来、或者手头没有商店数据，就把它标成过期，下次用到时重拉。 */
export function applyRedPacketBalance(queryClient: QueryClient, balance: RedPacketBalance): void {
  const current = queryClient.getQueryData<ShopOverview | null>(shopKeys.overview)?.balance;
  if (!current || balance === null) {
    void queryClient.invalidateQueries({ queryKey: shopKeys.overview });
    return;
  }
  applyShopPatch(queryClient, { balance: { ...current, ...balance } });
}

/* ───────── 会话列表上的「[有红包]」 ─────────
 * 会话对象上的 red_packet_pending：这个会话里有我还能领的红包。服务端给初值，这里在两次拉取之间把它维持住：
 *   · 来了新的红包消息（不是私聊里自己发的）→ 置上
 *   · 我领到了、某个红包不再是 active、卡片到点过期 → 手头的缓存里要是还有别的能领的就留着；
 *     没有的话先摘掉，再把会话列表标成过期重拉一次，以服务端说的为准（没见过的红包只有它知道）
 * 断线重连后会话列表本来就会整份重拉。
 */

function conversationOf(queryClient: QueryClient, conversationId: number): Conversation | undefined {
  return queryClient.getQueryData<Conversation[]>(['conversations'])?.find((conversation) => conversation.id === conversationId);
}

function setRedPacketPending(queryClient: QueryClient, conversationId: number, pending: boolean): void {
  queryClient.setQueryData<Conversation[] | undefined>(['conversations'], (current) => {
    if (!current?.some((conversation) => conversation.id === conversationId && Boolean(conversation.red_packet_pending) !== pending)) {
      return current;
    }
    return current.map((conversation) => (conversation.id === conversationId ? { ...conversation, red_packet_pending: pending } : conversation));
  });
}

let pendingRefreshTimer: number | null = null;

/** 让会话列表重新从服务端取一次。短时间里的多次合成一次：热闹的群里红包一个接一个被抢完，不能每个都去拉 */
function refreshRedPacketPending(queryClient: QueryClient): void {
  if (pendingRefreshTimer !== null) {
    return;
  }
  pendingRefreshTimer = window.setTimeout(() => {
    pendingRefreshTimer = null;
    void queryClient.invalidateQueries({ queryKey: ['conversations'] });
  }, 600);
}

/** 收到一条新消息：是红包、而且我能领（私聊里自己发的不能），就把会话标成「有红包」。 */
export function noteRedPacketMessage(queryClient: QueryClient, message: Message): void {
  if (message.type !== 'red_packet' || message.recalled_at) {
    return;
  }
  refreshPendingList(queryClient, message.conversation_id);
  const mine = (message.sender_id ?? message.sender?.id) === useKukeStore.getState().currentUser?.id;
  if (mine && conversationOf(queryClient, message.conversation_id)?.type !== 'group') {
    return;
  }
  setRedPacketPending(queryClient, message.conversation_id, true);
}

/** 某个红包领不了了（我领了、抢完、过期、撤回）：这个会话还算不算「有红包」。 */
export function recheckRedPacketPending(queryClient: QueryClient, conversationId: number): void {
  const conversation = conversationOf(queryClient, conversationId);
  if (!conversation?.red_packet_pending) {
    return;
  }
  const me = useKukeStore.getState().currentUser?.id;
  const now = Date.now();
  const stillClaimable = queryClient.getQueriesData<RedPacket>({ queryKey: redPacketKeys.details }).some(([, packet]) => Boolean(
    packet
    && packet.conversation_id === conversationId
    && packet.status === 'active'
    && !isRedPacketExpired(packet, now)
    && !packet.my_claim
    && !(conversation.type !== 'group' && packet.sender?.id === me)
  ));
  if (stillClaimable) {
    return;
  }
  setRedPacketPending(queryClient, conversationId, false);
  refreshRedPacketPending(queryClient);
}

/* ───────── 聊天区右上角的「N 个红包未领」 ─────────
 * GET /red-packets/pending?conversation_id=…（3.4.1）按会话缓存一份：进会话拉一次（每次进都重拉），之后
 *   · 来了新的红包消息 → 重拉（服务端才知道我能不能领，比如私聊里自己发的不能）；
 *   · red_packet.updated：只管列表里有的那个 —— 不再是 active 就当场去掉；还是 active 但领取数变了，可能是我在别的设备上领了，重拉；
 *     列表里没有的不用管（事件不会让一个红包「变得能领」，新红包走上面的消息）；
 *   · 我领到了、或者领的时候发现它已经领不了（抢完、过期、撤回、领过了）→ 当场去掉；
 *   · 断线重连 → 重拉；到点过期 → 提示自己按 expires_at 滤掉。
 * 旧后端没有这个接口（404 / 422）、我不在这个会话里（403）都是 null：不显示，也不再重试。
 */

async function fetchPending(conversationId: number): Promise<PendingRedPacket[] | null> {
  try {
    return await getPendingRedPackets(conversationId);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 405 || error.status === 422 || error.status === 501 || error.status === 403)) {
      return null;
    }
    throw error;
  }
}

/** 这个会话里我还能领的红包，新的在前。data 为 null 表示服务端没有这个接口（或我不在会话里），不显示。 */
export function usePendingRedPackets(conversationId: number, enabled = true): UseQueryResult<PendingRedPacket[] | null> {
  return useQuery({
    queryKey: redPacketKeys.pending(conversationId),
    queryFn: () => fetchPending(conversationId),
    enabled,
    retry: false,
    staleTime: 0,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    // 接口不在的话，开着的这个会话里也别反复去问
    refetchOnMount: (query) => query.state.data !== null
  });
}

const pendingListTimers = new Map<number, number>();

/** 让某个会话的待领列表重拉一次。短时间里的多次合成一次（热闹的群里红包一个接一个地来、一个接一个地被领）；没开着的会话只是标成过期。 */
function refreshPendingList(queryClient: QueryClient, conversationId: number): void {
  if (pendingListTimers.has(conversationId)) {
    return;
  }
  pendingListTimers.set(conversationId, window.setTimeout(() => {
    pendingListTimers.delete(conversationId);
    // 拿到过 null（接口不在）的不重拉
    if (queryClient.getQueryData<PendingRedPacket[] | null>(redPacketKeys.pending(conversationId)) === null) {
      return;
    }
    void queryClient.invalidateQueries({ queryKey: redPacketKeys.pending(conversationId), exact: true });
  }, 400));
}

/** 某个红包领不了了：从所有会话的待领列表里去掉它。 */
export function dropPendingRedPacket(queryClient: QueryClient, id: RedPacketId): void {
  queryClient.setQueriesData<PendingRedPacket[] | null>({ queryKey: redPacketKeys.pendingAll }, (current) => (current && current.some((item) => item.id === id) ? current.filter((item) => item.id !== id) : current));
}

function notePendingUpdate(queryClient: QueryClient, conversationId: number, id: RedPacketId, status: RedPacket['status'], claimedCount: number): void {
  const list = queryClient.getQueryData<PendingRedPacket[] | null>(redPacketKeys.pending(conversationId));
  const item = list?.find((entry) => entry.id === id);
  if (!item) {
    return;
  }
  if (status !== 'active') {
    dropPendingRedPacket(queryClient, id);
    return;
  }
  if (claimedCount !== item.claimed_count) {
    queryClient.setQueryData<PendingRedPacket[] | null>(redPacketKeys.pending(conversationId), (current) => current?.map((entry) => (entry.id === id ? { ...entry, claimed_count: claimedCount } : entry)) ?? current);
    refreshPendingList(queryClient, conversationId);
  }
}

/**
 * 实时事件 red_packet.updated：{ id, conversation_id, message_id, claimed_count, count, status }，不带金额。有人领了、抢完、过期、撤回都会推。
 * 只改已经在缓存里的红包（没见过的那些等卡片进视口时再取）；事件比缓存旧（领取数更少、缓存已经不是 active）就不动。
 */
export function handleRedPacketEvent(queryClient: QueryClient, data: unknown): void {
  const update = normalizeRedPacketUpdate(data);
  if (!update) {
    return;
  }
  notePendingUpdate(queryClient, update.conversation_id, update.id, update.status, update.claimed_count);
  const key = redPacketKeys.detail(update.id);
  const before = queryClient.getQueryData<RedPacket>(key);
  if (!before) {
    // 没见过的红包也可能就是让这个会话「有红包」的那一个
    if (update.status !== 'active') {
      recheckRedPacketPending(queryClient, update.conversation_id);
    }
    return;
  }
  queryClient.setQueryData<RedPacket>(key, (current) => {
    if (!current || (current.status !== 'active' && update.status === 'active') || update.claimed_count < current.claimed_count) {
      return current;
    }
    if (current.claimed_count === update.claimed_count && current.status === update.status && current.count === update.count) {
      return current;
    }
    return { ...current, claimed_count: update.claimed_count, count: update.count, status: update.status };
  });
  if (update.status !== 'active') {
    recheckRedPacketPending(queryClient, update.conversation_id);
  }
  // 我发的红包过期或被撤回：记录里的状态和退回金额变了（余额另有 shop.balance.changed）
  const mine = before.sender?.id !== undefined && before.sender.id === useKukeStore.getState().currentUser?.id;
  if (mine && before.status === 'active' && (update.status === 'expired' || update.status === 'revoked')) {
    void queryClient.invalidateQueries({ queryKey: redPacketKeys.mine });
  }
}

/** 断线重连之后：期间的事件收不到，把正显示着的红包重取一遍（没显示的等它进视口）。 */
export function refreshRedPacketsAfterReconnect(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: redPacketKeys.details, refetchType: 'active' });
  void queryClient.invalidateQueries({ queryKey: redPacketKeys.config });
  void queryClient.invalidateQueries({ queryKey: redPacketKeys.pendingAll });
}

/**
 * 发红包。成功：消息和发普通消息一样直接写进缓存（不等实时事件），余额换成回包里的，今天发了几个加一。
 * 失败：按错误码把手头过期的东西对齐（开关关了、余额不够、没绑定、被禁言）。
 */
export function useSendRedPacket(): UseMutationResult<SendRedPacketResult, Error, SendRedPacketPayload> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SendRedPacketPayload) => sendRedPacket(payload),
    onSuccess: (result, payload) => {
      storeRedPacket(queryClient, result.red_packet);
      applyRedPacketBalance(queryClient, result.balance);
      queryClient.setQueryData<RedPacketConfig | null | undefined>(redPacketKeys.config, (current) => (current ? { ...current, sent_today: current.sent_today + 1 } : current));
      void queryClient.invalidateQueries({ queryKey: redPacketKeys.mine });
      const message = result.message;
      if (message) {
        queryClient.setQueryData<MessagesInfiniteData | undefined>(['messages', message.conversation_id], (current) => upsertMessageIntoFirstPage(current, message));
        queryClient.setQueryData<Conversation[] | undefined>(['conversations'], (current) => applyLatestMessageToConversations(current, message, { visibleConversationId: payload.conversation_id }));
        // 群里自己发的自己也能抢
        noteRedPacketMessage(queryClient, message);
      } else {
        // 回包里的消息读不出来：重拉这个会话的消息
        void queryClient.invalidateQueries({ queryKey: ['messages', payload.conversation_id] });
      }
    },
    onError: (error) => {
      const code = redPacketErrorCode(error);
      const detail = shopErrorDetail(error);
      const balance = queryClient.getQueryData<ShopOverview | null>(shopKeys.overview)?.balance;
      if (code === 'disabled' || code === 'daily_limit') {
        void queryClient.invalidateQueries({ queryKey: redPacketKeys.config });
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

/** 抢红包。成功：红包状态和余额都换成回包里的。失败的那几种（抢完、过期、领过了）由弹层重取状态后各自给结果页。 */
export function useClaimRedPacket(): UseMutationResult<ClaimRedPacketResult, Error, RedPacketId> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: RedPacketId) => claimRedPacket(id),
    onSuccess: (result, id) => {
      if (result.red_packet) {
        storeRedPacket(queryClient, result.red_packet);
      } else {
        void queryClient.invalidateQueries({ queryKey: redPacketKeys.detail(id) });
      }
      applyRedPacketBalance(queryClient, result.balance);
      void queryClient.invalidateQueries({ queryKey: redPacketKeys.mine });
      const conversationId = result.red_packet?.conversation_id ?? queryClient.getQueryData<RedPacket>(redPacketKeys.detail(id))?.conversation_id;
      if (conversationId) {
        recheckRedPacketPending(queryClient, conversationId);
      }
      dropPendingRedPacket(queryClient, id);
    },
    onError: (error, id) => {
      const code = redPacketErrorCode(error);
      // 领红包只看平台禁言（群内禁言不影响领），所以这里的 muted 一定带 muted_until
      if (code === 'muted') {
        absorbPacketMute(error);
      }
      // 手头的状态过期了（已经抢完、过期、被撤回、其实领过）：重取，弹层和卡片跟着变；会话上的「有红包」也可能该摘了
      if (code === 'already_claimed' || code === 'finished' || code === 'expired' || code === 'revoked') {
        const conversationId = queryClient.getQueryData<RedPacket>(redPacketKeys.detail(id))?.conversation_id;
        void queryClient.invalidateQueries({ queryKey: redPacketKeys.detail(id) });
        dropPendingRedPacket(queryClient, id);
        if (conversationId && conversationOf(queryClient, conversationId)?.red_packet_pending) {
          refreshRedPacketPending(queryClient);
        }
      }
    }
  });
}

export function useMyRedPackets(direction: RedPacketDirection, limit: number, offset: number, enabled = true): UseQueryResult<RedPacketRecordPage> {
  return useQuery({ queryKey: redPacketKeys.minePage(direction, limit, offset), queryFn: () => getMyRedPackets(direction, limit, offset), enabled, retry: false, staleTime: 30_000, placeholderData: keepPreviousData });
}

function fallbackText(error: unknown, fallback: string): string {
  if (error instanceof NetworkError) {
    return '网络连接不上，检查一下网络再试。';
  }
  if (error instanceof ApiError && error.status >= 500) {
    return '服务器开小差了，稍后再试。';
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * 合并转发失败该怎么说。选中的消息里有红包（422 red_packet_not_forwardable）时说清楚原因 ——
 * 界面上红包、礼物本来就选不进去，这里是兜底（比如别的设备上发起的、消息类型在手头的缓存里是旧的）。
 */
export function forwardErrorText(error: unknown): string {
  const code = redPacketErrorCode(error);
  if (code === 'red_packet_not_forwardable') {
    return '选中的消息里有红包，红包不能转发。去掉它再试。';
  }
  return '转发失败，请稍后重试。';
}

export interface RedPacketFailure {
  code: string | null;
  message: string;
}

/** 发红包失败该怎么说。余额不够、没绑定两种在弹窗里有自己的画面，这里的文字是兜底。 */
export function describeSendError(error: unknown): RedPacketFailure {
  const code = redPacketErrorCode(error);
  const detail = shopErrorDetail(error);
  switch (code) {
    case 'disabled':
      return { code, message: '红包功能现在关着，暂时发不了。' };
    case 'not_member':
      return { code, message: '你已经不在这个会话里了，发不了红包。' };
    case 'muted':
      // 平台禁言带 muted_until；不带的是这个群里被禁言，或者群开了全员禁言
      return { code, message: typeof detail.muted_until === 'string' ? '你正在禁言中，不能发红包。' : '你在这个群里被禁言了（或者群开了全员禁言），不能在这里发红包。' };
    case 'ccw_not_bound':
      return { code, message: '还没有绑定 CCW 账号，绑定后才能发红包。' };
    case 'invalid_amount':
      return { code, message: '金额不对：要是正整数，并且在上限以内。' };
    case 'invalid_count':
      return { code, message: '个数不对：要是正整数，并且在上限以内（私聊只能发 1 个）。' };
    case 'invalid_kind':
      return { code, message: '这里不能发这种红包（私聊只能发普通红包）。' };
    case 'greeting_rejected':
      // 超过 30 字、或者没通过文本审核，都是这个码；是哪一种服务端的 message 里写了，直接用它
      return { code, message: serverMessage(error) ?? '祝福语没有通过审核，换一句试试。' };
    case 'rate_limited':
      return { code, message: '发得太快了，撞上了发言的限频。这次没有扣币，稍等一会儿再发。' };
    case 'insufficient_balance': {
      const shortfall = typeof detail.shortfall === 'number' && detail.shortfall > 0 ? detail.shortfall : null;
      return { code, message: shortfall ? `金币不够，还差 ${formatCoins(shortfall)} 个。` : '金币不够。' };
    }
    case 'daily_limit':
      return { code, message: '今天发红包的次数用完了，明天再来。' };
    case 'verification_unavailable':
      return { code, message: '现在连不上 CCW，没法核实你的余额，稍后再试。这次没有扣币。' };
    default:
      return { code, message: fallbackText(error, '红包没有发出去，稍后再试。') };
  }
}

/** 抢红包失败该怎么说。抢完、过期、被撤回、领过了这几种有自己的结果页，这里只管剩下的。关着总开关不影响领，所以没有 disabled。 */
export function describeClaimError(error: unknown): RedPacketFailure {
  const code = redPacketErrorCode(error);
  switch (code) {
    case 'own_packet':
      return { code, message: '私聊里不能领自己发的红包。' };
    case 'not_member':
      return { code, message: '你不在这个会话里，领不了这个红包。' };
    case 'not_found':
      return { code, message: '这个红包不存在了。' };
    case 'muted':
      // 领红包只看平台禁言，群内禁言不影响领
      return { code, message: '你的账号正在禁言中，不能领红包。' };
    default:
      return { code, message: fallbackText(error, '没有领到，稍后再试。') };
  }
}
