import type { Message, User } from './api';
import type { ShopBalance } from './shop';

/**
 * 群升级 / 群文件 / 群待办 / 聊天记录搜索的类型。契约：KukeChat-Server/docs/group-plus.md。
 * 响应在 src/api/groupPlus.ts、src/api/messageSearch.ts 里整理成这里写的形状：缺字段补默认值、形状不对的条目丢掉。
 */

/** 群档位。排序（rank）：free 0 < pro 1 < pro_plus 2 < max 3 */
export type GroupPlusTier = 'free' | 'pro' | 'pro_plus' | 'max';
export type GroupPlusPeriod = 'month' | 'year';
/** quote.action：new 新开通（或已过期重新开）；renew 同档续期；upgrade 升到更高的档 */
export type GroupPlusAction = 'new' | 'renew' | 'upgrade';

export interface GroupPlusTierPlan {
  key: GroupPlusTier;
  name: string;
  rank: number;
  member_limit: number;
  message_limit: number;
  file_enabled: boolean;
  /** 群文件空间（字节）；未解锁为 null，Pro 是 0（只能传临时文件） */
  file_quota_bytes: number | null;
  /** 空间不够（或没有空间）时，24 小时临时文件的单个上限；未解锁为 null。旧服务端没有这个字段 */
  file_temp_max_bytes?: number | null;
  featured_limit: number;
  price_month: number;
  price_year: number;
}

/** GET /group-plus/plans */
export interface GroupPlusPlans {
  enabled: boolean;
  year_months_paid: number;
  month_days: number;
  year_days: number;
  file_max_bytes: number;
  file_ttl_options_hours: number[];
  file_grace_days: number;
  tiers: GroupPlusTierPlan[];
}

/** 群文件空间的状态：locked 未解锁 / active 可用 / grace 宽限期（可读、可下载、可删，不能传） */
export type GroupFilesState = 'locked' | 'active' | 'grace';

/** FileQuota，也是 GroupPlusInfo.files */
export interface GroupFileQuota {
  state: GroupFilesState;
  tier: GroupPlusTier | null;
  grace_until: string | null;
  quota_bytes: number;
  used_bytes: number;
  file_count: number;
  default_ttl_hours: number;
  /** 现在能传的最大文件 = max(剩余空间, 临时文件上限) */
  max_file_bytes: number;
  /** 以下三项是「临时文件」规则加进来的，旧服务端没有：剩余空间、临时文件单个上限、临时文件保留小时数 */
  free_bytes?: number;
  temp_max_bytes?: number | null;
  /** 后端配了私有存储桶：上传、下载直连存储桶，不经过服务器 */
  direct?: boolean;
  temp_ttl_hours?: number;
  /** 档位能不能用文件夹（有效档位 Pro+ / MAX）。旧服务端没有，保持 undefined */
  folders_enabled?: boolean;
}

/** GET /conversations/{cid}/plus */
export interface GroupPlusInfo {
  conversation_id: number;
  tier: GroupPlusTier;
  tier_name: string;
  expires_at: string | null;
  /** 永久档位（后台给的）：不能再购买。旧服务端没有这个字段 */
  permanent?: boolean;
  limits: {
    /** 这个群现在的人数上限；null = 不限（后台给这个群单独设的） */
    member_limit: number | null;
    /** 人数不限。旧服务端没有这个字段 */
    member_limit_unlimited?: boolean;
    message_limit: number;
    file_enabled: boolean;
    file_quota_bytes: number | null;
    featured_limit: number;
  };
  usage: {
    member_count: number;
    featured_count: number;
    file_bytes_used: number;
    file_count: number;
  };
  files: GroupFileQuota;
  /** 我是群主 / 管理员 */
  can_purchase: boolean;
}

/** POST /conversations/{cid}/plus/quote，以及 409 forfeit_not_confirmed 里带的内容 */
export interface GroupPlusQuote {
  conversation_id: number;
  action: GroupPlusAction;
  tier: GroupPlusTier;
  period: GroupPlusPeriod;
  days: number;
  price: number;
  current_tier: GroupPlusTier;
  current_expires_at: string | null;
  new_expires_at: string | null;
  forfeited_seconds: number;
  forfeited_days: number;
  forfeit_notice: string | null;
  balance: number;
  enough: boolean;
}

export interface GroupPlusRecord {
  id: number;
  conversation_id: number;
  source: 'purchase' | 'grant' | 'revoke';
  action: 'new' | 'renew' | 'upgrade' | 'grant' | 'revoke';
  tier: GroupPlusTier;
  period: GroupPlusPeriod | null;
  days: number;
  amount: number;
  prev_tier: GroupPlusTier;
  prev_expires_at: string | null;
  new_tier: GroupPlusTier;
  new_expires_at: string | null;
  forfeited_days: number;
  user: User | null;
  note: string | null;
  created_at: string;
}

export interface GroupPlusRecordPage {
  items: GroupPlusRecord[];
  total: number;
}

/** POST .../plus/purchase 成功 */
export interface GroupPlusPurchaseResult {
  record: GroupPlusRecord | null;
  conversation: { conversation_id: number; plus_tier: GroupPlusTier; plus_expires_at: string | null };
  plus: GroupPlusInfo | null;
  balance: ShopBalance | null;
}

export interface GroupPlusPurchasePayload {
  tier: Exclude<GroupPlusTier, 'free'>;
  period: GroupPlusPeriod;
  confirm_forfeit?: boolean;
  /** 展示给用户的价格；和服务端现价不一致时 409 price_changed */
  expected_price?: number;
}

/* ───────── 群文件 ───────── */

export interface GroupFile {
  id: number;
  conversation_id: number;
  name: string;
  size: number;
  content_type: string;
  uploader: User | null;
  uploader_id: number | null;
  created_at: string;
  /** 永久文件为 null */
  expires_at: string | null;
  permanent: boolean;
  /** 空间不够时传上来的 24 小时临时文件，不占群空间 */
  temporary?: boolean;
  expired: boolean;
  message_id: number | null;
  download_path: string;
  /** 所在的文件夹，根目录为 null；旧服务端没有这两项 */
  folder_id?: number | null;
  folder_name?: string | null;
}

/** GroupFileFolderRead：一层文件夹（Pro+ / MAX，docs/group-plus.md 5.5） */
export interface GroupFileFolder {
  id: number;
  conversation_id: number;
  name: string;
  /** 里面没过期的文件数、总字节数 */
  file_count: number;
  total_size: number;
  created_by: User | null;
  created_by_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface GroupFilePage {
  items: GroupFile[];
  total: number;
  quota: GroupFileQuota | null;
  /**
   * 以下是文件夹功能加进来的，旧服务端没有：folders 为 undefined 时界面和以前一样。
   * folders 是这个群的全部文件夹（按创建先后），folder 是现在看的那个（根目录 / 搜索为 null）。
   */
  folders?: GroupFileFolder[];
  folder?: GroupFileFolder | null;
  folder_limit?: number;
  search?: boolean;
  /** 能新建、重命名文件夹，把文件移进去（群管 + 档位够） */
  can_manage_folders?: boolean;
  /** 能删文件夹、把文件移回根目录（群管，降档后也是 true） */
  can_tidy_folders?: boolean;
}

/** POST /files/move 的回包 */
export interface GroupFileMoveResult {
  folder_id: number | null;
  moved: number;
  items: GroupFile[];
}

/** 文件消息 metadata.file（type 仍是 text，旧客户端显示 content 里的「[文件] 名（大小）」） */
export interface GroupFileMeta {
  id: number;
  name: string;
  size: number;
  content_type: string;
  expires_at: string | null;
  permanent: boolean;
  temporary?: boolean;
}

/* ───────── 群待办 ───────── */

export interface GroupTodoSnapshot {
  type: string;
  content: string;
  metadata: Record<string, unknown> | null;
  sender: { id: number; display_name: string; avatar_url: string | null; title: string | null } | null;
  created_at: string;
}

export interface GroupTodo {
  conversation_id: number;
  message_id: number;
  /** true 才能跳转；false 打开「查看全文」 */
  message_exists: boolean;
  recalled: boolean;
  summary: string;
  snapshot: GroupTodoSnapshot | null;
  set_by: { id: number; display_name: string; avatar_url: string | null } | null;
  set_at: string;
}

/* ───────── 精华（永久） ───────── */

export interface FeaturedMessageEntry {
  id: number;
  conversation_id: number;
  message_id: number | null;
  set_by_id: number | null;
  set_by: User | null;
  created_at: string;
  /** 由快照构造的消息；撤回的 content 为空 */
  message: Message;
  /** 原消息现在还在库里：true 才能跳转 */
  message_exists: boolean;
  recalled: boolean;
  snapshot_missing: boolean;
}

export interface FeaturedMessagePage {
  items: FeaturedMessageEntry[];
  /** X-Total-Count；没带时为 null */
  total: number | null;
  has_more: boolean;
}

/** 409 featured_limit 的 detail */
export interface FeaturedLimitInfo {
  limit: number;
  used: number;
  tier: GroupPlusTier;
}

/* ───────── 聊天记录搜索 ───────── */

export type ChatSearchCategory = 'all' | 'media' | 'sticker' | 'file' | 'link';

export interface ChatSearchConversation {
  id: number;
  type: 'group' | 'direct';
  title: string | null;
  display_title: string | null;
  avatar_url: string | null;
  plus_tier: GroupPlusTier;
  plus_expires_at: string | null;
  direct_user: User | null;
}

export interface ChatSearchHit {
  message: Message;
  conversation: ChatSearchConversation;
  category: 'text' | 'media' | 'sticker' | 'file' | 'link';
  snippet: string;
  /** snippet 里的命中区间 [start, end)，UTF-16 码元 */
  snippet_highlights: Array<[number, number]>;
  /** message.content 里的命中区间 */
  highlights: Array<[number, number]>;
}

export interface ChatSearchPage {
  items: ChatSearchHit[];
  total: number;
  total_capped: boolean;
  limit: number;
  offset: number;
  has_more: boolean;
  next_before_id: number | null;
}

export interface ChatSearchParams {
  q?: string;
  conversationId?: number | null;
  senderId?: number | null;
  category?: ChatSearchCategory;
  /** YYYY-MM-DD，按 UTC+8 的整天 */
  dateFrom?: string | null;
  dateTo?: string | null;
  limit?: number;
  beforeId?: number | null;
}

export interface ChatSearchSummaryItem {
  conversation: ChatSearchConversation;
  count: number;
  latest_message_id: number;
  latest_at: string;
}

export interface ChatSearchSummary {
  total: number;
  items: ChatSearchSummaryItem[];
}

/* ───────── 实时事件 ───────── */

export interface GroupPlusUpdatedEvent {
  conversation_id: number;
  plus_tier: GroupPlusTier;
  plus_expires_at: string | null;
  reason: 'purchase' | 'grant' | 'revoke' | string;
}

export interface GroupFileUpdatedEvent {
  conversation_id: number;
  action: 'uploaded' | 'deleted' | 'updated' | 'moved' | string;
  file_id: number | null;
  /** uploaded：放进的文件夹；moved：目标文件夹（null = 根目录） */
  folder_id?: number | null;
  /** moved：这次移动的全部文件 */
  file_ids?: number[];
}

export interface GroupFileFoldersChangedEvent {
  conversation_id: number;
  action: 'created' | 'renamed' | 'deleted' | string;
  folder_id: number;
  /** deleted：移回根目录的文件数 */
  moved_to_root?: number;
}

export interface GroupTodoUpdatedEvent {
  conversation_id: number;
  todo: GroupTodo | null;
}
