import type { Message, User } from '@/types/api';
import type {
  FeaturedMessageEntry, FeaturedMessagePage, GroupFile, GroupFileMeta, GroupFilePage, GroupFileQuota, GroupFilesState, GroupPlusAction, GroupPlusInfo,
  GroupPlusPeriod, GroupPlusPlans, GroupPlusPurchasePayload, GroupPlusPurchaseResult, GroupPlusQuote, GroupPlusRecord, GroupPlusRecordPage,
  GroupPlusTier, GroupPlusTierPlan, GroupTodo, GroupTodoSnapshot
} from '@/types/groupPlus';
import { normalizeShopBalance } from './shop';
import { ApiError, apiDownloadBlob, apiRequest, apiRequestWithHeaders, NetworkError, putToSignedUrl, uploadFormWithProgress } from './client';
import { isRecord } from './normalizers';

/**
 * 群升级 / 群文件 / 群待办 / 永久精华的接口。契约：KukeChat-Server/docs/group-plus.md。
 * 旧后端没有这些接口：GET /group-plus/plans 会 404，调用方（components/groupPlus/data.ts）把它当成「没有群升级」。
 *
 * 响应在这里整理成类型里写的形状：缺字段补默认值、形状不对的条目丢掉。金额、字节数一律是非负整数。
 */

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function nullableText(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function count(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback;
}

function nullableCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : null;
}

function notNull<T>(value: T | null): value is T {
  return value !== null;
}

function userOf(value: unknown): User | null {
  return isRecord(value) && typeof value.id === 'number' ? value as unknown as User : null;
}

const TIERS: readonly GroupPlusTier[] = ['free', 'pro', 'pro_plus', 'max'];

export function normalizeTier(value: unknown): GroupPlusTier {
  return typeof value === 'string' && (TIERS as readonly string[]).includes(value) ? value as GroupPlusTier : 'free';
}

/** 不认识的档位（以后加了新档）当成 free 画，而不是整份丢掉；这里只用于判断「是不是合法值」 */
function isTier(value: unknown): value is GroupPlusTier {
  return typeof value === 'string' && (TIERS as readonly string[]).includes(value);
}

function normalizePlan(value: unknown): GroupPlusTierPlan | null {
  if (!isRecord(value) || !isTier(value.key)) {
    return null;
  }
  return {
    key: value.key,
    name: text(value.name) || value.key,
    rank: count(value.rank),
    member_limit: count(value.member_limit),
    message_limit: count(value.message_limit),
    file_enabled: value.file_enabled === true,
    file_quota_bytes: nullableCount(value.file_quota_bytes),
    // 旧服务端没有临时文件：保持 undefined，界面据此走旧规则
    ...('file_temp_max_bytes' in value ? { file_temp_max_bytes: nullableCount(value.file_temp_max_bytes) } : {}),
    featured_limit: count(value.featured_limit),
    price_month: count(value.price_month),
    price_year: count(value.price_year)
  };
}

export function normalizePlans(value: unknown): GroupPlusPlans {
  const source = isRecord(value) ? value : {};
  const tiers = Array.isArray(source.tiers) ? source.tiers.map(normalizePlan).filter(notNull).sort((a, b) => a.rank - b.rank) : [];
  const ttl = Array.isArray(source.file_ttl_options_hours) ? source.file_ttl_options_hours.filter((item): item is number => typeof item === 'number' && item > 0) : [];
  return {
    enabled: source.enabled === true,
    year_months_paid: count(source.year_months_paid, 10),
    month_days: count(source.month_days, 30),
    year_days: count(source.year_days, 365),
    file_max_bytes: count(source.file_max_bytes, 100 * 1024 * 1024),
    file_ttl_options_hours: ttl.length > 0 ? ttl : [24, 168, 720],
    file_grace_days: count(source.file_grace_days, 30),
    tiers
  };
}

function normalizeFilesState(value: unknown): GroupFilesState {
  return value === 'active' || value === 'grace' ? value : 'locked';
}

export function normalizeFileQuota(value: unknown): GroupFileQuota | null {
  if (!isRecord(value)) {
    return null;
  }
  return {
    state: normalizeFilesState(value.state),
    tier: isTier(value.tier) ? value.tier : null,
    grace_until: nullableText(value.grace_until),
    quota_bytes: count(value.quota_bytes),
    used_bytes: count(value.used_bytes),
    file_count: count(value.file_count),
    default_ttl_hours: count(value.default_ttl_hours, 24),
    max_file_bytes: count(value.max_file_bytes, 100 * 1024 * 1024),
    // 临时文件规则的三项：旧服务端没有，保持 undefined（fileRules 据此判断走哪套规则）
    // 后端配了私有桶：上传下载直连存储桶，不经过服务器带宽
    direct: value.direct === true,
    ...('temp_max_bytes' in value ? {
      free_bytes: count(value.free_bytes),
      temp_max_bytes: nullableCount(value.temp_max_bytes),
      temp_ttl_hours: count(value.temp_ttl_hours, 24)
    } : {})
  };
}

export function normalizePlusInfo(value: unknown): GroupPlusInfo | null {
  if (!isRecord(value) || typeof value.conversation_id !== 'number') {
    return null;
  }
  const limits = isRecord(value.limits) ? value.limits : {};
  const usage = isRecord(value.usage) ? value.usage : {};
  const tier = normalizeTier(value.tier);
  const files = normalizeFileQuota(value.files) ?? {
    state: 'locked' as const, tier: null, grace_until: null, quota_bytes: 0, used_bytes: 0, file_count: 0, default_ttl_hours: 24, max_file_bytes: 100 * 1024 * 1024
  };
  return {
    conversation_id: value.conversation_id,
    tier,
    tier_name: text(value.tier_name) || tier,
    expires_at: tier === 'free' ? null : nullableText(value.expires_at),
    permanent: tier !== 'free' && value.permanent === true,
    limits: {
      // 不限时服务端给 null + member_limit_unlimited: true；旧服务端恒为数字
      member_limit: limits.member_limit_unlimited === true || limits.member_limit === null ? null : count(limits.member_limit),
      member_limit_unlimited: limits.member_limit_unlimited === true || limits.member_limit === null,
      message_limit: count(limits.message_limit),
      file_enabled: limits.file_enabled === true,
      file_quota_bytes: nullableCount(limits.file_quota_bytes),
      featured_limit: count(limits.featured_limit)
    },
    usage: {
      member_count: count(usage.member_count),
      featured_count: count(usage.featured_count),
      file_bytes_used: count(usage.file_bytes_used),
      file_count: count(usage.file_count)
    },
    files,
    can_purchase: value.can_purchase === true
  };
}

function normalizeAction(value: unknown): GroupPlusAction {
  return value === 'renew' || value === 'upgrade' ? value : 'new';
}

function normalizePeriod(value: unknown): GroupPlusPeriod {
  return value === 'year' ? 'year' : 'month';
}

/** 报价；409 forfeit_not_confirmed 的 detail 也是同一个形状，所以导出给 data.ts 用 */
export function normalizeQuote(value: unknown): GroupPlusQuote | null {
  if (!isRecord(value) || typeof value.price !== 'number') {
    return null;
  }
  return {
    conversation_id: count(value.conversation_id),
    action: normalizeAction(value.action),
    tier: normalizeTier(value.tier),
    period: normalizePeriod(value.period),
    days: count(value.days),
    price: count(value.price),
    current_tier: normalizeTier(value.current_tier),
    current_expires_at: nullableText(value.current_expires_at),
    new_expires_at: nullableText(value.new_expires_at),
    forfeited_seconds: count(value.forfeited_seconds),
    forfeited_days: count(value.forfeited_days),
    forfeit_notice: nullableText(value.forfeit_notice),
    balance: count(value.balance),
    enough: value.enough === true
  };
}

function normalizeRecord(value: unknown): GroupPlusRecord | null {
  if (!isRecord(value) || typeof value.id !== 'number') {
    return null;
  }
  const source = value.source === 'grant' || value.source === 'revoke' ? value.source : 'purchase';
  const action = value.action === 'renew' || value.action === 'upgrade' || value.action === 'grant' || value.action === 'revoke' ? value.action : 'new';
  return {
    id: value.id,
    conversation_id: count(value.conversation_id),
    source,
    action,
    tier: normalizeTier(value.tier),
    period: value.period === 'year' || value.period === 'month' ? value.period : null,
    days: count(value.days),
    amount: count(value.amount),
    prev_tier: normalizeTier(value.prev_tier),
    prev_expires_at: nullableText(value.prev_expires_at),
    new_tier: normalizeTier(value.new_tier),
    new_expires_at: nullableText(value.new_expires_at),
    forfeited_days: count(value.forfeited_days),
    user: userOf(value.user),
    note: nullableText(value.note),
    created_at: text(value.created_at)
  };
}

export async function getGroupPlusPlans(): Promise<GroupPlusPlans> {
  return normalizePlans(await apiRequest<unknown>('/group-plus/plans'));
}

export async function getGroupPlusInfo(conversationId: number): Promise<GroupPlusInfo | null> {
  return normalizePlusInfo(await apiRequest<unknown>(`/conversations/${conversationId}/plus`));
}

export async function quoteGroupPlus(conversationId: number, tier: Exclude<GroupPlusTier, 'free'>, period: GroupPlusPeriod): Promise<GroupPlusQuote> {
  const response = await apiRequest<unknown>(`/conversations/${conversationId}/plus/quote`, { method: 'POST', body: { tier, period } });
  const quote = normalizeQuote(response);
  if (!quote) {
    throw new Error('报价数据读不出来，请稍后再试。');
  }
  return quote;
}

export async function purchaseGroupPlus(conversationId: number, payload: GroupPlusPurchasePayload): Promise<GroupPlusPurchaseResult> {
  const response = await apiRequest<unknown>(`/conversations/${conversationId}/plus/purchase`, { method: 'POST', body: payload });
  const source = isRecord(response) ? response : {};
  const conversation = isRecord(source.conversation) ? source.conversation : {};
  return {
    record: normalizeRecord(source.record),
    conversation: {
      conversation_id: typeof conversation.conversation_id === 'number' ? conversation.conversation_id : conversationId,
      plus_tier: normalizeTier(conversation.plus_tier),
      plus_expires_at: nullableText(conversation.plus_expires_at)
    },
    plus: normalizePlusInfo(source.plus),
    balance: isRecord(source.balance) ? normalizeShopBalance(source.balance) : null
  };
}

export async function getGroupPlusRecords(conversationId: number, limit = 20, offset = 0): Promise<GroupPlusRecordPage> {
  const response = await apiRequest<unknown>(`/conversations/${conversationId}/plus/records?limit=${limit}&offset=${offset}`);
  const source = isRecord(response) ? response : {};
  const items = Array.isArray(source.items) ? source.items.map(normalizeRecord).filter(notNull) : [];
  return { items, total: count(source.total, items.length) };
}

/* ───────── 群文件 ───────── */

export function normalizeGroupFile(value: unknown): GroupFile | null {
  if (!isRecord(value) || typeof value.id !== 'number' || typeof value.name !== 'string') {
    return null;
  }
  const conversationId = count(value.conversation_id);
  return {
    id: value.id,
    conversation_id: conversationId,
    name: value.name,
    size: count(value.size),
    content_type: text(value.content_type),
    uploader: userOf(value.uploader),
    uploader_id: nullableCount(value.uploader_id),
    created_at: text(value.created_at),
    expires_at: nullableText(value.expires_at),
    permanent: value.permanent === true,
    temporary: value.temporary === true,
    expired: value.expired === true,
    message_id: nullableCount(value.message_id),
    download_path: text(value.download_path)
  };
}

export interface GroupFileQuery {
  q?: string;
  uploaderId?: number | null;
  limit?: number;
  offset?: number;
}

export async function getGroupFiles(conversationId: number, query: GroupFileQuery = {}): Promise<GroupFilePage> {
  const params = new URLSearchParams();
  if (query.q?.trim()) {
    params.set('q', query.q.trim());
  }
  if (query.uploaderId) {
    params.set('uploader_id', String(query.uploaderId));
  }
  params.set('limit', String(query.limit ?? 30));
  if (query.offset) {
    params.set('offset', String(query.offset));
  }
  const response = await apiRequest<unknown>(`/conversations/${conversationId}/files?${params.toString()}`);
  const source = isRecord(response) ? response : {};
  const items = Array.isArray(source.items) ? source.items.map(normalizeGroupFile).filter(notNull) : [];
  return { items, total: count(source.total, items.length), quota: normalizeFileQuota(source.quota) };
}

export async function getGroupFileUsage(conversationId: number): Promise<GroupFileQuota | null> {
  return normalizeFileQuota(await apiRequest<unknown>(`/conversations/${conversationId}/files/usage`));
}

export interface UploadGroupFileResult {
  file: GroupFile | null;
  message: Message | null;
}

/** 服务端错误 detail 里的 code（新接口的错误包在响应体的 detail 字段里） */
function errorCode(error: unknown): string | null {
  if (!(error instanceof ApiError) || !isRecord(error.detail)) {
    return null;
  }
  const detail = isRecord(error.detail.detail) ? error.detail.detail : error.detail;
  return typeof detail.code === 'string' ? detail.code : null;
}

/** 接口在这个后端上不存在（旧后端）：404 / 405 且没有 code */
function routeMissing(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 404 || error.status === 405) && errorCode(error) === null;
}

interface UploadTicket {
  uploadId: string;
  url: string;
  headers: Record<string, string>;
}

function normalizeTicket(value: unknown): UploadTicket | null {
  if (!isRecord(value) || typeof value.upload_id !== 'string' || typeof value.url !== 'string') {
    return null;
  }
  const headers: Record<string, string> = {};
  if (isRecord(value.headers)) {
    for (const [name, item] of Object.entries(value.headers)) {
      if (typeof item === 'string') {
        headers[name] = item;
      }
    }
  }
  return { uploadId: value.upload_id, url: value.url, headers };
}

function uploadResult(response: unknown): UploadGroupFileResult {
  const source = isRecord(response) ? response : {};
  const message = isRecord(source.message) && typeof source.message.id === 'number' ? source.message as unknown as Message : null;
  return { file: normalizeGroupFile(source.file), message };
}

/**
 * 直传：先要一个签名上传地址，浏览器把文件直接 PUT 到存储桶，再告诉后端「传完了」，后端核对大小、登记、在群里发文件消息。
 * 返回 null 表示这条路走不通、应该退回经后端上传：后端没开直传（409 direct_upload_unavailable）、旧后端没有这个接口、
 * 或者 PUT 时网络 / 跨域失败（存储桶没配 CORS）。其余错误（空间、禁言、大小）照常抛出。
 */
async function uploadDirect(conversationId: number, file: File, options: { announce?: boolean; permanent?: boolean; onProgress?: (loaded: number, total: number) => void; signal?: AbortSignal }): Promise<UploadGroupFileResult | null> {
  let ticket: UploadTicket | null;
  try {
    ticket = normalizeTicket(await apiRequest<unknown>(`/conversations/${conversationId}/files/uploads`, {
      method: 'POST',
      body: { name: file.name, size: file.size, content_type: file.type || null, permanent: options.permanent === true }
    }));
  } catch (error) {
    if (errorCode(error) === 'direct_upload_unavailable' || routeMissing(error)) {
      return null;
    }
    throw error;
  }
  if (!ticket) {
    return null;
  }
  let sent = 0;
  try {
    await putToSignedUrl(ticket.url, ticket.headers, file, (loaded, total) => {
      sent = loaded;
      options.onProgress?.(loaded, total);
    }, options.signal);
  } catch (error) {
    // 一个字节都没发出去就失败了：多半是存储桶没配跨域，退回经后端上传，别让用户卡住
    if (error instanceof NetworkError && sent === 0) {
      return null;
    }
    throw error;
  }
  return uploadResult(await apiRequest<unknown>(`/conversations/${conversationId}/files/uploads/${encodeURIComponent(ticket.uploadId)}/complete`, {
    method: 'POST',
    body: { announce: options.announce !== false }
  }));
}

/**
 * 上传一个文件。announce 默认 true：在群里落一条文件消息（受发言限频约束，被拒时整个上传回滚）。
 * direct（FileQuota.direct）为 true 时先走直传，走不通再退回经后端的 multipart 上传。
 */
export async function uploadGroupFile(conversationId: number, file: File, options: { announce?: boolean; permanent?: boolean; direct?: boolean; onProgress?: (loaded: number, total: number) => void; signal?: AbortSignal } = {}): Promise<UploadGroupFileResult> {
  if (options.direct) {
    const direct = await uploadDirect(conversationId, file, options);
    if (direct) {
      return direct;
    }
    options.onProgress?.(0, file.size);
  }
  const form = new FormData();
  form.append('file', file);
  form.append('announce', String(options.announce !== false));
  if (options.permanent) {
    form.append('permanent', 'true');
  }
  return uploadResult(await uploadFormWithProgress<unknown>(`/conversations/${conversationId}/files`, form, options.onProgress, options.signal));
}

export async function deleteGroupFile(conversationId: number, fileId: number): Promise<void> {
  await apiRequest<unknown>(`/conversations/${conversationId}/files/${fileId}`, { method: 'DELETE' });
}

/** 转为永久（permanent: true）/ 转回限时（false，从现在起算，用群当前的默认时长） */
export async function setGroupFilePermanent(conversationId: number, fileId: number, permanent: boolean): Promise<GroupFile | null> {
  const response = await apiRequest<unknown>(`/conversations/${conversationId}/files/${fileId}`, { method: 'PATCH', body: { permanent } });
  return normalizeGroupFile(response);
}

/**
 * 下载：带鉴权取回内容再交给浏览器保存。不能用直链：文件放在非公开目录，下载接口要 Authorization 头。
 * 不拼 download_path（它自带 /api/v1 前缀，base 里可能已经有），按 id 自己拼。
 */
/** 这个后端不给直链（没开直传 / 旧后端）：记住，之后的下载直接走经后端的老接口，不再多问一次 */
let linkUnsupported = false;

/**
 * 下载：先要一个几分钟有效的签名直链，直接从存储桶取回（不占服务器带宽）；
 * 后端不给直链、或者直链取不回来（存储桶没配跨域），退回带鉴权的 /download（经后端转发）。
 * 文件过期、不存在、没有权限这类错误照常抛出。
 */
/** 几分钟有效的签名直链；后端不给（没开直传 / 旧后端）时返回 null。过期、不存在、没权限照常抛出 */
export async function getGroupFileLink(conversationId: number, fileId: number): Promise<string | null> {
  if (linkUnsupported) {
    return null;
  }
  try {
    const response = await apiRequest<unknown>(`/conversations/${conversationId}/files/${fileId}/link`);
    return isRecord(response) && typeof response.url === 'string' ? response.url : null;
  } catch (error) {
    if (errorCode(error) === 'direct_download_unavailable' || routeMissing(error)) {
      linkUnsupported = true;
      return null;
    }
    throw error;
  }
}

export async function downloadGroupFile(conversationId: number, fileId: number): Promise<Blob> {
  const proxied = (): Promise<Blob> => apiDownloadBlob(`/conversations/${conversationId}/files/${fileId}/download`);
  const url = await getGroupFileLink(conversationId, fileId);
  if (!url) {
    return proxied();
  }
  const direct = await fetch(url).catch(() => null);
  if (direct && direct.ok) {
    return direct.blob();
  }
  return proxied();
}

/** 从文件消息的 metadata.file 读出文件卡片需要的内容；形状不对返回 null（按普通文字显示 content）。 */
export function groupFileMetaOf(message: { metadata?: unknown }): GroupFileMeta | null {
  const metadata = message.metadata;
  if (!isRecord(metadata) || !isRecord(metadata.file)) {
    return null;
  }
  const file = metadata.file;
  if (typeof file.id !== 'number' || typeof file.name !== 'string') {
    return null;
  }
  return {
    id: file.id,
    name: file.name,
    size: count(file.size),
    content_type: text(file.content_type),
    expires_at: nullableText(file.expires_at),
    permanent: file.permanent === true,
    temporary: file.temporary === true
  };
}

/* ───────── 群待办 ───────── */

function normalizeTodoSnapshot(value: unknown): GroupTodoSnapshot | null {
  if (!isRecord(value)) {
    return null;
  }
  const sender = isRecord(value.sender) && typeof value.sender.id === 'number' ? {
    id: value.sender.id,
    display_name: text(value.sender.display_name),
    avatar_url: nullableText(value.sender.avatar_url),
    title: nullableText(value.sender.title)
  } : null;
  return {
    type: text(value.type, 'text'),
    content: text(value.content),
    metadata: isRecord(value.metadata) ? value.metadata : null,
    sender,
    created_at: text(value.created_at)
  };
}

export function normalizeTodo(value: unknown): GroupTodo | null {
  if (!isRecord(value) || typeof value.message_id !== 'number') {
    return null;
  }
  const setBy = isRecord(value.set_by) && typeof value.set_by.id === 'number' ? {
    id: value.set_by.id,
    display_name: text(value.set_by.display_name),
    avatar_url: nullableText(value.set_by.avatar_url)
  } : null;
  return {
    conversation_id: count(value.conversation_id),
    message_id: value.message_id,
    message_exists: value.message_exists === true,
    recalled: value.recalled === true,
    summary: text(value.summary),
    snapshot: normalizeTodoSnapshot(value.snapshot),
    set_by: setBy,
    set_at: text(value.set_at)
  };
}

export async function getGroupTodo(conversationId: number): Promise<GroupTodo | null> {
  const response = await apiRequest<unknown>(`/conversations/${conversationId}/todo`);
  return isRecord(response) ? normalizeTodo(response.todo) : null;
}

export async function setGroupTodo(conversationId: number, messageId: number): Promise<{ todo: GroupTodo | null; message: Message | null }> {
  const response = await apiRequest<unknown>(`/conversations/${conversationId}/todo`, { method: 'PUT', body: { message_id: messageId } });
  const source = isRecord(response) ? response : {};
  return {
    todo: normalizeTodo(source.todo),
    message: isRecord(source.message) && typeof source.message.id === 'number' ? source.message as unknown as Message : null
  };
}

export async function clearGroupTodo(conversationId: number): Promise<void> {
  await apiRequest<unknown>(`/conversations/${conversationId}/todo`, { method: 'DELETE' });
}

/* ───────── 精华（永久） ───────── */

function normalizeFeatured(value: unknown, conversationId: number): FeaturedMessageEntry | null {
  if (!isRecord(value) || typeof value.id !== 'number' || !isRecord(value.message)) {
    return null;
  }
  const message = value.message as unknown as Message;
  if (typeof message.id !== 'number') {
    return null;
  }
  const recalled = value.recalled === true;
  return {
    id: value.id,
    conversation_id: typeof value.conversation_id === 'number' ? value.conversation_id : conversationId,
    message_id: nullableCount(value.message_id),
    set_by_id: nullableCount(value.set_by_id),
    set_by: userOf(value.set_by),
    created_at: text(value.created_at),
    // 快照里 content 可能是 null（撤回 / 空壳）：补成空串，渲染器不用再判断
    message: { ...message, content: typeof message.content === 'string' ? message.content : '', conversation_id: message.conversation_id ?? conversationId },
    // 旧后端没有 message_exists：按「原消息还在」处理，保持原来的跳转行为
    message_exists: value.message_exists !== false,
    recalled,
    snapshot_missing: value.snapshot_missing === true
  };
}

/** 精华列表：响应体仍是数组，总数和是否还有更多在响应头 X-Total-Count / X-Has-More。 */
export async function getFeaturedPage(conversationId: number, limit = 50, offset = 0): Promise<FeaturedMessagePage> {
  const { data, headers } = await apiRequestWithHeaders<unknown>(`/conversations/${conversationId}/featured-messages?limit=${limit}&offset=${offset}`);
  const list = Array.isArray(data) ? data : isRecord(data) && Array.isArray(data.items) ? data.items : [];
  const items = list.map((item) => normalizeFeatured(item, conversationId)).filter(notNull);
  const totalHeader = Number(headers.get('X-Total-Count'));
  const total = headers.get('X-Total-Count') !== null && Number.isFinite(totalHeader) ? totalHeader : null;
  const hasMoreHeader = headers.get('X-Has-More');
  const hasMore = hasMoreHeader !== null ? hasMoreHeader === 'true' : total !== null ? offset + items.length < total : items.length >= limit;
  return { items, total, has_more: hasMore };
}

/** 按精华 id 取消（原消息已被修剪时用它）。 */
export async function removeFeaturedById(conversationId: number, featuredId: number): Promise<void> {
  await apiRequest<unknown>(`/conversations/${conversationId}/featured-messages/${featuredId}`, { method: 'DELETE' });
}
