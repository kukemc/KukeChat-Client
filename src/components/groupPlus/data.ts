import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query';
import { ApiError, NetworkError } from '@/api/client';
import { updateGroupSettings } from '@/api/conversations';
import {
  clearGroupTodo, createGroupFolder, deleteGroupFile, deleteGroupFolder, getFeaturedPage, getGroupFiles, getGroupPlusInfo, getGroupPlusPlans, getGroupPlusRecords, getGroupTodo,
  moveGroupFiles, normalizeQuote, normalizeTier, normalizeTodo, purchaseGroupPlus, quoteGroupPlus, removeFeaturedById, renameGroupFolder, setGroupFilePermanent, setGroupTodo
} from '@/api/groupPlus';
import { isRecord } from '@/api/normalizers';
import { applyShopPatch, isShopUnavailable, shopErrorCode, shopErrorDetail, shopKeys } from '@/components/shop/data';
import { formatCoins } from '@/components/shop/labels';
import { patchConversation } from '@/realtime/cache';
import type { Conversation } from '@/types/api';
import type {
  FeaturedLimitInfo, FeaturedMessagePage, GroupFileFolder, GroupFileMoveResult, GroupFilePage, GroupPlusInfo, GroupPlusPeriod, GroupPlusPlans, GroupPlusPurchasePayload,
  GroupPlusPurchaseResult, GroupPlusQuote, GroupPlusRecordPage, GroupPlusTier, GroupTodo
} from '@/types/groupPlus';
import type { ShopOverview } from '@/types/shop';

/**
 * 群升级 / 群文件 / 群待办 / 永久精华的数据层：缓存 key、查询、写操作之后怎么就地更新缓存、实时事件怎么处理。
 *
 * 价目表（GET /group-plus/plans）的值有三种：GroupPlusPlans（接口在）、null（服务端没有这个功能，404）、undefined（还没拿到）。
 * 一个群当前的档位在两处：会话对象上的 plus_tier / plus_expires_at（会话列表、头像角标用，实时事件直接改它），
 * 和 GET /conversations/{id}/plus 的完整信息（升级面板、文件面板用）。购买成功、group.plus.updated 都会把两处一起跟上。
 * 余额不另存：商店主数据里的 balance 就是它，购买的回包里带着新余额，直接换进去（和礼物、红包一样）。
 */
export const groupPlusKeys = {
  plans: ['group-plus', 'plans'] as const,
  infoRoot: ['group-plus', 'info'] as const,
  info: (conversationId: number) => ['group-plus', 'info', conversationId] as const,
  records: (conversationId: number, limit: number, offset: number) => ['group-plus', 'records', conversationId, limit, offset] as const,
  recordsOf: (conversationId: number) => ['group-plus', 'records', conversationId] as const,
  files: (conversationId: number) => ['group-files', conversationId] as const,
  filesPage: (conversationId: number, q: string, uploaderId: number | null, folderId: number | null = null) => ['group-files', conversationId, 'list', q, uploaderId, folderId] as const,
  todo: (conversationId: number) => ['group-todo', conversationId] as const,
  featured: (conversationId: number) => ['featured-messages', conversationId] as const,
  featuredPage: (conversationId: number) => ['featured-messages', conversationId, 'page'] as const
};

/** 错误的 detail 是 { code, message }，和商店、礼物一个形状。 */
export const groupPlusErrorCode = shopErrorCode;
export const groupPlusErrorDetail = shopErrorDetail;

const UNAVAILABLE_RETRY_MS = 10 * 60_000;

async function fetchPlans(): Promise<GroupPlusPlans | null> {
  try {
    return await getGroupPlusPlans();
  } catch (error) {
    // 旧后端没有这个接口（404）：不是出错，是「没有群升级」
    if (isShopUnavailable(error)) {
      return null;
    }
    throw error;
  }
}

/** 价目表和总开关。data 为 null 表示当前连接的服务端没有群升级。 */
export function useGroupPlusPlans(enabled = true): UseQueryResult<GroupPlusPlans | null> {
  return useQuery({
    queryKey: groupPlusKeys.plans,
    queryFn: fetchPlans,
    enabled,
    retry: false,
    staleTime: 5 * 60_000,
    refetchInterval: (query) => (query.state.data === null ? UNAVAILABLE_RETRY_MS : false)
  });
}

/** 一个群的档位、用量、群文件状态。只有群聊才有；conversationId 为 null 时不请求。 */
export function useGroupPlusInfo(conversationId: number | null, enabled = true): UseQueryResult<GroupPlusInfo | null> {
  return useQuery({
    queryKey: groupPlusKeys.info(conversationId ?? 0),
    queryFn: async () => {
      try {
        return await getGroupPlusInfo(conversationId ?? 0);
      } catch (error) {
        if (isShopUnavailable(error)) {
          return null;
        }
        throw error;
      }
    },
    enabled: enabled && conversationId !== null,
    retry: false,
    staleTime: 30_000
  });
}

export function useGroupPlusRecords(conversationId: number, limit: number, offset: number, enabled: boolean): UseQueryResult<GroupPlusRecordPage> {
  return useQuery({
    queryKey: groupPlusKeys.records(conversationId, limit, offset),
    queryFn: () => getGroupPlusRecords(conversationId, limit, offset),
    enabled,
    retry: false,
    placeholderData: keepPreviousData
  });
}

/** 把档位同时写进会话列表缓存和档位详情缓存。 */
export function applyPlusToCaches(queryClient: QueryClient, conversationId: number, tier: GroupPlusTier, expiresAt: string | null): void {
  queryClient.setQueryData<Conversation[] | undefined>(['conversations'], (current) => patchConversation(current, conversationId, (conversation) => (
    conversation.plus_tier === tier && (conversation.plus_expires_at ?? null) === expiresAt ? conversation : { ...conversation, plus_tier: tier, plus_expires_at: expiresAt }
  )));
  queryClient.setQueryData<GroupPlusInfo | null | undefined>(groupPlusKeys.info(conversationId), (current) => (
    current ? { ...current, tier, expires_at: tier === 'free' ? null : expiresAt } : current
  ));
}

/** 报价：不扣币，选档位 / 周期之后点「继续」时才请求（确认面板里的数字全来自它）。 */
export function useQuoteGroupPlus(conversationId: number): UseMutationResult<GroupPlusQuote, Error, { tier: Exclude<GroupPlusTier, 'free'>; period: GroupPlusPeriod }> {
  return useMutation({ mutationFn: ({ tier, period }) => quoteGroupPlus(conversationId, tier, period) });
}

/**
 * 购买。成功：余额、档位、详情一起换成回包里的，精华 / 文件的上限也跟着变（重拉）；
 * 失败：余额不够时回包里带着服务端刚核实的余额；档位关系变了（plan_changed）、报价过期（price_changed）时重拉详情。
 */
export function usePurchaseGroupPlus(conversationId: number): UseMutationResult<GroupPlusPurchaseResult, Error, GroupPlusPurchasePayload> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: GroupPlusPurchasePayload) => purchaseGroupPlus(conversationId, payload),
    onSuccess: (result) => {
      applyPlusToCaches(queryClient, conversationId, result.conversation.plus_tier, result.conversation.plus_expires_at);
      if (result.plus) {
        queryClient.setQueryData(groupPlusKeys.info(conversationId), result.plus);
      } else {
        void queryClient.invalidateQueries({ queryKey: groupPlusKeys.info(conversationId) });
      }
      if (result.balance) {
        applyShopPatch(queryClient, { balance: result.balance });
      } else {
        void queryClient.invalidateQueries({ queryKey: shopKeys.overview });
      }
      void queryClient.invalidateQueries({ queryKey: groupPlusKeys.recordsOf(conversationId) });
      void queryClient.invalidateQueries({ queryKey: groupPlusKeys.files(conversationId) });
      void queryClient.invalidateQueries({ queryKey: groupPlusKeys.featured(conversationId) });
      // 人数上限变了：成员面板、加人入口的提示靠会话对象，重拉一次最稳
      void queryClient.invalidateQueries({ queryKey: ['conversations'], exact: true });
    },
    onError: (error) => {
      const code = groupPlusErrorCode(error);
      const detail = groupPlusErrorDetail(error);
      const balance = queryClient.getQueryData<ShopOverview | null>(shopKeys.overview)?.balance;
      if (code === 'insufficient_balance') {
        if (balance && typeof detail.balance === 'number' && Number.isFinite(detail.balance)) {
          applyShopPatch(queryClient, { balance: { ...balance, balance: detail.balance } });
        } else {
          void queryClient.invalidateQueries({ queryKey: shopKeys.overview });
        }
      } else if (code === 'ccw_not_bound' && balance) {
        applyShopPatch(queryClient, { balance: { ...balance, bound: false } });
      } else if (code === 'plan_changed' || code === 'price_changed' || code === 'downgrade_not_allowed' || code === 'disabled') {
        void queryClient.invalidateQueries({ queryKey: groupPlusKeys.info(conversationId) });
        void queryClient.invalidateQueries({ queryKey: groupPlusKeys.plans });
      }
    }
  });
}

/* ───────── 错误说明 ───────── */

function networkOrServer(error: unknown, fallback: string): string {
  if (error instanceof NetworkError) {
    return '网络连接不上，检查一下网络再试。';
  }
  if (error instanceof ApiError && error.status >= 500) {
    return '服务器开小差了，稍后再试。这次没有扣币。';
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

export interface GroupPlusFailure {
  code: string | null;
  /** 直接展示服务端给的 detail.message，没有就用兜底文字 */
  message: string;
  /** 409 forfeit_not_confirmed 里带的报价：界面据此弹确认 */
  quote: GroupPlusQuote | null;
  shortfall: number | null;
  donateUrl: string | null;
}

/**
 * 购买 / 报价失败该怎么说。余额不够、没绑定 CCW、需要确认作废这三种在面板里有自己的画面，
 * 这里的文字只是兜底；其余错误直接展示服务端的 detail.message（docs/group-plus.md 开头）。
 */
export function describeGroupPlusError(error: unknown): GroupPlusFailure {
  const code = groupPlusErrorCode(error);
  const detail = groupPlusErrorDetail(error);
  const shortfall = typeof detail.shortfall === 'number' && detail.shortfall > 0 ? detail.shortfall : null;
  const donateUrl = typeof detail.donate_url === 'string' && /^https?:\/\//.test(detail.donate_url) ? detail.donate_url : null;
  const quote = code === 'forfeit_not_confirmed' ? normalizeQuote(detail) : null;
  const serverMessage = typeof detail.message === 'string' && detail.message ? detail.message : null;
  let message: string;
  switch (code) {
    case 'insufficient_balance':
      message = serverMessage ?? (shortfall ? `金币不够，还差 ${formatCoins(shortfall)} 个。` : '金币不够。');
      break;
    case 'verification_unavailable':
      message = serverMessage ?? '现在连不上 CCW，没法核实你的余额，稍后再试。这次没有扣币。';
      break;
    case 'price_changed':
      message = serverMessage ?? '价格刚刚变了，请重新确认。这次没有扣币。';
      break;
    case 'plan_changed':
      message = serverMessage ?? '这个群的档位刚刚发生了变化，请重新确认。这次没有扣币。';
      break;
    default:
      message = serverMessage ?? networkOrServer(error, '操作没有成功，稍后再试。');
  }
  return { code, message, quote, shortfall, donateUrl };
}

/* ───────── 群文件 ───────── */

/**
 * 群文件列表（分页追加）。locked 且没有历史文件时服务端返回空列表，不是错误。
 * folderId：看哪个文件夹（null 是根目录）；带了 q / uploaderId 是跨文件夹搜索，不再按文件夹分开缓存。
 */
export function useGroupFiles(conversationId: number, q: string, uploaderId: number | null, enabled: boolean, folderId: number | null = null) {
  const scoped = q || uploaderId ? null : folderId;
  return useInfiniteQuery({
    queryKey: groupPlusKeys.filesPage(conversationId, q, uploaderId, scoped),
    queryFn: ({ pageParam }) => getGroupFiles(conversationId, { q, uploaderId, folderId: scoped, limit: 30, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last: GroupFilePage, pages) => {
      const loaded = pages.reduce((sum, page) => sum + page.items.length, 0);
      return last.items.length > 0 && loaded < last.total ? loaded : undefined;
    },
    enabled,
    retry: false
  });
}

export function useDeleteGroupFile(conversationId: number): UseMutationResult<void, Error, number> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (fileId: number) => deleteGroupFile(conversationId, fileId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: groupPlusKeys.files(conversationId) });
      void queryClient.invalidateQueries({ queryKey: groupPlusKeys.info(conversationId) });
    }
  });
}

export function useSetFilePermanent(conversationId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ fileId, permanent }: { fileId: number; permanent: boolean }) => setGroupFilePermanent(conversationId, fileId, permanent),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: groupPlusKeys.files(conversationId) });
      void queryClient.invalidateQueries({ queryKey: groupPlusKeys.info(conversationId) });
    }
  });
}

/* ───────── 群文件夹（5.5） ───────── */

/** 文件夹相关的写操作之后：列表（含每个文件夹的 file_count / total_size）都重拉 */
function refreshFiles(queryClient: QueryClient, conversationId: number): void {
  void queryClient.invalidateQueries({ queryKey: groupPlusKeys.files(conversationId) });
}

export function useCreateGroupFolder(conversationId: number): UseMutationResult<GroupFileFolder | null, Error, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => createGroupFolder(conversationId, name),
    onSettled: () => refreshFiles(queryClient, conversationId)
  });
}

export function useRenameGroupFolder(conversationId: number): UseMutationResult<GroupFileFolder | null, Error, { folderId: number; name: string }> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ folderId, name }) => renameGroupFolder(conversationId, folderId, name),
    onSettled: () => refreshFiles(queryClient, conversationId)
  });
}

export function useDeleteGroupFolder(conversationId: number): UseMutationResult<number, Error, number> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (folderId: number) => deleteGroupFolder(conversationId, folderId),
    onSettled: () => refreshFiles(queryClient, conversationId)
  });
}

export function useMoveGroupFiles(conversationId: number): UseMutationResult<GroupFileMoveResult, Error, { fileIds: number[]; folderId: number | null }> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ fileIds, folderId }) => moveGroupFiles(conversationId, fileIds, folderId),
    onSettled: () => refreshFiles(queryClient, conversationId)
  });
}

/** 文件夹名在本地先查一遍（和服务端同一套规则），省一次请求；返回要提示的话，没问题返回 null */
export function folderNameProblem(raw: string): string | null {
  const name = raw.trim();
  if (!name) {
    return '给文件夹起个名字。';
  }
  if ([...name].length > 40) {
    return '名字最多 40 个字。';
  }
  if (/[\\/]/.test(name)) {
    return '名字里不能有 / 或 \\。';
  }
  // 换行、控制字符、零宽等不可见字符
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u2064\ufeff]/.test(name)) {
    return '名字里不能有换行或看不见的字符。';
  }
  return null;
}

/** 文件夹相关错误（docs/group-plus.md 5.5 的错误表）的中文说明。upgrade 为 true 时界面可以给「去升级」 */
export function describeFolderError(error: unknown): { code: string | null; message: string; upgrade: boolean } {
  const code = groupPlusErrorCode(error);
  const detail = groupPlusErrorDetail(error);
  switch (code) {
    case 'folders_require_plus':
      return { code, message: '文件夹是 Pro+ 和 MAX 群的功能，升级档位后就能用。', upgrade: true };
    case 'not_group_staff':
      return { code, message: '只有群主和管理员可以整理文件夹。', upgrade: false };
    case 'folder_not_found':
      return { code, message: '这个文件夹已经不在了，可能刚被删除。', upgrade: false };
    case 'folder_name_taken':
      return { code, message: '已经有同名的文件夹了（不区分大小写），换个名字吧。', upgrade: false };
    case 'folder_limit':
      return { code, message: `文件夹已经有 ${typeof detail.limit === 'number' ? detail.limit : 50} 个了，删掉不用的再建。`, upgrade: false };
    case 'invalid_folder_name':
      return { code, message: '名字要 1–40 个字，不能有换行、/、\\ 或看不见的字符。', upgrade: false };
    case 'file_not_found':
      return { code, message: '有文件已经不在了（可能刚被删除），这次一个都没移动。', upgrade: false };
    case 'file_not_movable': {
      const temps = Array.isArray(detail.temporary_ids) ? detail.temporary_ids.length : 0;
      const expired = Array.isArray(detail.expired_ids) ? detail.expired_ids.length : 0;
      const reason = temps > 0 && expired > 0 ? '临时文件和已过期的文件' : expired > 0 ? '已过期的文件' : '24 小时临时文件';
      return { code, message: `${reason}不能放进文件夹，这次一个都没移动。`, upgrade: false };
    }
    default:
      return { code, message: describeGroupPlusError(error).message, upgrade: false };
  }
}

/** 群主 / 管理员改群文件默认保留时长（只影响之后上传的）。成功后会话对象和档位详情一起跟上。 */
export function useSetFileDefaultTtl(conversationId: number): UseMutationResult<Conversation, Error, number> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (hours: number) => updateGroupSettings(conversationId, { file_default_ttl_hours: hours }),
    onSuccess: (_conversation, hours) => {
      queryClient.setQueryData<Conversation[] | undefined>(['conversations'], (current) => patchConversation(current, conversationId, (item) => ({ ...item, file_default_ttl_hours: hours })));
      queryClient.setQueryData<GroupPlusInfo | null | undefined>(groupPlusKeys.info(conversationId), (current) => (current ? { ...current, files: { ...current.files, default_ttl_hours: hours } } : current));
      void queryClient.invalidateQueries({ queryKey: groupPlusKeys.files(conversationId) });
    }
  });
}

/* ───────── 群待办 ───────── */

/**
 * 群待办。首选会话对象上的 group_todo（会话列表本来就会拉），实时事件 group.todo.updated 直接改它；
 * 会话对象上没有这个字段的旧缓存，才用 GET /todo 补一次。
 */
export function useGroupTodo(conversation: Pick<Conversation, 'id' | 'type' | 'group_todo'> | null | undefined): GroupTodo | null {
  const known = conversation !== null && conversation !== undefined && conversation.group_todo !== undefined;
  const query = useQuery({
    queryKey: groupPlusKeys.todo(conversation?.id ?? 0),
    queryFn: async () => {
      try {
        return await getGroupTodo(conversation?.id ?? 0);
      } catch (error) {
        if (isShopUnavailable(error)) {
          return null;
        }
        throw error;
      }
    },
    enabled: conversation?.type === 'group' && !known,
    retry: false,
    staleTime: 60_000
  });
  if (conversation?.type !== 'group') {
    return null;
  }
  return known ? conversation.group_todo ?? null : query.data ?? null;
}

/** 就地改群待办（会话列表缓存 + 单独的缓存）。 */
export function applyTodoToCaches(queryClient: QueryClient, conversationId: number, todo: GroupTodo | null): void {
  queryClient.setQueryData<Conversation[] | undefined>(['conversations'], (current) => patchConversation(current, conversationId, (conversation) => ({ ...conversation, group_todo: todo })));
  queryClient.setQueryData(groupPlusKeys.todo(conversationId), todo);
}

export function useSetGroupTodo(conversationId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (messageId: number) => setGroupTodo(conversationId, messageId),
    onSuccess: (result) => {
      if (result.todo) {
        applyTodoToCaches(queryClient, conversationId, result.todo);
      } else {
        void queryClient.invalidateQueries({ queryKey: ['conversations'], exact: true });
      }
      // 提醒消息自己会走 message.created；这里不重复写
    }
  });
}

export function useClearGroupTodo(conversationId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => clearGroupTodo(conversationId),
    onSuccess: () => applyTodoToCaches(queryClient, conversationId, null),
    onError: (error) => {
      // 404 todo_not_found：别处已经取消了，本地也清掉
      if (groupPlusErrorCode(error) === 'todo_not_found') {
        applyTodoToCaches(queryClient, conversationId, null);
      }
    }
  });
}

/* ───────── 精华 ───────── */

/** 精华列表（永久精华，分页追加）。 */
export function useFeaturedPages(conversationId: number, enabled = true) {
  return useInfiniteQuery({
    queryKey: groupPlusKeys.featuredPage(conversationId),
    queryFn: ({ pageParam }) => getFeaturedPage(conversationId, 50, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last: FeaturedMessagePage, pages) => (last.has_more ? pages.reduce((sum, page) => sum + page.items.length, 0) : undefined),
    enabled,
    retry: false
  });
}

export function useRemoveFeaturedById(conversationId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (featuredId: number) => removeFeaturedById(conversationId, featuredId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: groupPlusKeys.featured(conversationId) });
      void queryClient.invalidateQueries({ queryKey: groupPlusKeys.info(conversationId) });
    }
  });
}

/** 409 featured_limit 的内容；不是这个错误返回 null。界面据此显示「已达上限」和去升级。 */
export function featuredLimitOf(error: unknown): FeaturedLimitInfo | null {
  if (groupPlusErrorCode(error) !== 'featured_limit') {
    return null;
  }
  const detail = groupPlusErrorDetail(error);
  return {
    limit: typeof detail.limit === 'number' ? detail.limit : 0,
    used: typeof detail.used === 'number' ? detail.used : 0,
    tier: normalizeTier(detail.tier)
  };
}

/* ───────── 实时事件 ───────── */

/**
 * 实时事件（docs/group-plus.md 第 4 节）。src/realtime/client.ts 收到事件后调这里；预览页模拟事件时也调这里。
 *
 *   group.plus.updated   档位变了（购买 / 后台赠送 / 取消）：会话列表上的档位、详情、流水、文件、精华上限一起跟上。
 *                        到期降级没有事件，客户端按 plus_expires_at 自己判断（tier.ts 的 effectiveTier）。
 *   group.todo.updated   待办设置 / 替换 / 取消：data.todo 是完整对象或 null，直接换进缓存。
 *   group.file.updated   有人传了 / 删了 / 转了永久 / 移动了：文件列表（含文件夹的数量、大小）和用量重拉。
 *   group.file.folders.changed  文件夹新建 / 重命名 / 删除：列表重拉。正在看的文件夹被删了，列表会 404 folder_not_found，面板据此回到根目录。
 */
export function handleGroupPlusEvent(queryClient: QueryClient, rawType: string, data: unknown): void {
  if (!isRecord(data) || typeof data.conversation_id !== 'number') {
    return;
  }
  const conversationId = data.conversation_id;
  if (rawType === 'group.plus.updated') {
    const tier = normalizeTier(data.plus_tier);
    const expiresAt = typeof data.plus_expires_at === 'string' ? data.plus_expires_at : null;
    applyPlusToCaches(queryClient, conversationId, tier, tier === 'free' ? null : expiresAt);
    void queryClient.invalidateQueries({ queryKey: groupPlusKeys.info(conversationId) });
    void queryClient.invalidateQueries({ queryKey: groupPlusKeys.recordsOf(conversationId) });
    void queryClient.invalidateQueries({ queryKey: groupPlusKeys.files(conversationId) });
    return;
  }
  if (rawType === 'group.todo.updated') {
    const todo = data.todo === null || data.todo === undefined ? null : normalizeTodo(data.todo);
    // 形状不对（读不出来、又不是 null）：不改，重拉会话
    if (data.todo !== null && data.todo !== undefined && !todo) {
      void queryClient.invalidateQueries({ queryKey: ['conversations'], exact: true });
      return;
    }
    applyTodoToCaches(queryClient, conversationId, todo ? { ...todo, conversation_id: conversationId } : null);
    return;
  }
  if (rawType === 'group.file.updated') {
    void queryClient.invalidateQueries({ queryKey: groupPlusKeys.files(conversationId) });
    void queryClient.invalidateQueries({ queryKey: groupPlusKeys.info(conversationId) });
    return;
  }
  if (rawType === 'group.file.folders.changed') {
    void queryClient.invalidateQueries({ queryKey: groupPlusKeys.files(conversationId) });
  }
}

/** 断线重连之后：期间的事件收不到，档位、待办、文件都可能变过。 */
export function refreshGroupPlusAfterReconnect(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: groupPlusKeys.plans });
  void queryClient.invalidateQueries({ queryKey: groupPlusKeys.infoRoot, refetchType: 'active' });
  void queryClient.invalidateQueries({ queryKey: ['group-files'], refetchType: 'active' });
  void queryClient.invalidateQueries({ queryKey: ['group-todo'], refetchType: 'active' });
}

/** 当前用户在这个群里是不是群主 / 管理员（档位详情里的 can_purchase 没拿到之前，先按会话对象判断）。 */
export function isGroupStaff(conversation: Pick<Conversation, 'my_role'> | null | undefined): boolean {
  return conversation?.my_role === 'owner' || conversation?.my_role === 'admin';
}
