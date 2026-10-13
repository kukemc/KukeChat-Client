/**
 * 风纪委员相关的接口类型。
 *
 * 契约在 KukeChat-Server 的 docs/moderation-v2.md 第 3 节（一直就有的部分）和 docs/jury-v2.md 第 1 节（风纪 v2 一期）。
 * 二期（考试、练习场、风纪值、层级、成就、排行榜）的类型在 types/juryGrowth.ts；
 * 二期在一期类型上新增的字段都是可选的，写在这个文件里对应的接口上。
 */
import type { JuryHallRules } from './juryHall';
import type { JuryPanelRules, JuryReconsiderRules, JurySeniorQueue, PrecedentRef } from './jurySenior';
import type { JuryAbstainRules, JuryCategory, JuryDemoteRule, JuryExamRules, JuryExamSummary, JuryRestriction, JuryReward, JurySuspendRules, JuryTierProgress, JuryTierThresholds, JuryWarning } from './juryGrowth';

// ───────────────────────── 身份与配置 ─────────────────────────

export type JuryMembership = 'none' | 'applied' | 'active' | 'expired' | 'rejected' | 'suspended' | 'retired';

/** 委员层级：见习 → 正式 → 资深 */
export type JuryTier = 'trainee' | 'regular' | 'senior';

export interface JuryStats {
  votes_total: number;
  votes_settled: number;
  votes_agreed: number;
  agreement_rate: number | null;
  golden_total: number;
  golden_correct: number;
}

export interface JuryRequirement {
  key: string;
  ok: boolean;
  text: string;
  detail?: string | null;
}

export interface JuryStatus {
  status: JuryMembership;
  eligible: boolean;
  requirements: JuryRequirement[];
  term_ends_at: string | null;
  /** 被拒绝 / 被暂停时管理员写的说明 */
  review_note: string | null;
  stats: JuryStats | null;
  daily_limit: number;
  voted_today: number;
  /**
   * 评审上限（最近 24 小时滚动）下一个名额释放的时间。一次都没用过时为 null；额度没用满时也可能有值。
   * 早期的后端没有这个字段
   */
  daily_resets_at?: string | null;
  /** 主动回避上限下一个名额释放的时间，含义同上（二期） */
  recuse_resets_at?: string | null;
  /** 不是在任委员时为 null；旧后端没有这个字段 */
  tier?: JuryTier | null;
  /** 现在能分给我的未结案件数（导航角标用）。不是在任委员时为 null；旧后端没有这个字段 */
  available_cases?: number | null;
  /** 在任委员正在受处罚时有值：评审、发观点、点赞都会被拒绝 */
  restriction?: JuryRestriction | null;
  /** 三期：现在能分给我的合议 / 复审件数。不是资深委员时为 null */
  senior?: JurySeniorQueue | null;
  // —— 以下是二期新增（docs/jury-v2.md 2.2），一期的后端没有 ——
  exam?: JuryExamSummary | null;
  /** 申请是否必须先通过考试 */
  exam_required?: boolean;
  /** 风纪值；没当过委员为 0 */
  points?: number;
  /** 不是在任委员为 null */
  tier_progress?: JuryTierProgress | null;
  /** 是否公开展示委员身份 */
  badge_visible?: boolean;
  warnings?: JuryWarning[];
  /** 弃权过多被暂停发案到什么时候 */
  cooldown_until?: string | null;
  recuse_left_today?: number | null;
}

/** 后端已经实现的能力。客户端据此决定哪些板块能用，其余显示「即将开放」。 */
export type JuryCapability = 'overview' | 'case_detail' | 'opinions' | 'votes' | 'public_cases' | (string & {});

/** 二期追加 recuse；「上下文不足」的 kind 仍是 abstain，靠 value === 'need_context' 区分 */
export type JuryVoteKind = 'clean' | 'violation' | 'abstain' | 'recuse' | (string & {});

export interface JuryVoteOption {
  value: string;
  kind: JuryVoteKind;
  label: string;
  hint?: string | null;
  /** kind 为 violation 时对应的违规等级 */
  level?: number | null;
}

export interface JuryRuleNumbers {
  seats_per_case: number;
  quick_consensus_votes: number;
  full_consensus_votes: number;
  timeout_hours: number;
  assignment_ttl_hours: number;
  daily_votes: number;
  term_days: number;
  /** 默认展示目标消息前后各几条，其余折叠 */
  context_near: number;
  content_retention_days: number;
  publish_delay_hours: number;
  min_sample: number;
  /** 委员和机器给出的封禁最长多久；更重的要管理员确认。早期的后端没有这个字段 */
  max_ban_hours?: number;
  /** 二期：定为严重违规至少要几张有效票 */
  severe_min_votes?: number;
  /** 二期：同一案件累计几张「上下文不足」后转出 */
  need_context_votes?: number;
}

export interface JuryOpinionRules {
  max_length: number;
  per_case: number;
  per_minute: number;
  per_day: number;
  auto_hide_reports: number;
  report_reasons: string[];
  /** 二期：一条观点的赞数达到多少给作者加分 */
  like_reward_threshold?: number;
}

/** GET /jury/config */
export interface JuryConfig {
  version: number;
  capabilities: JuryCapability[];
  switches: { auto_appoint: boolean; appeals: boolean; machine_review: boolean };
  /** requirements / demote_below 是二期新增：见习为 null，一期的后端没有这两个键 */
  tiers: Array<{ key: JuryTier; label: string; requirements?: JuryTierThresholds | null; demote_below?: JuryDemoteRule | null }>;
  votes: JuryVoteOption[];
  rules: JuryRuleNumbers;
  opinions: JuryOpinionRules;
  eligibility: { min_account_age_days: number; min_recent_messages: number; recent_activity_days: number };
  // —— 三期新增（docs/jury-v2.md 第 3 节）：议事厅、资深合议、申诉复审的规则数字 ——
  hall?: Partial<JuryHallRules> | null;
  panel?: Partial<JuryPanelRules> | null;
  appeals?: Partial<JuryPanelRules> | null;
  /** 只有 capabilities 里有 reconsider 时才有 */
  reconsider?: Partial<JuryReconsiderRules> | null;
  // —— 以下是二期新增（docs/jury-v2.md 2.0.1），一期的后端没有 ——
  /** 投违规票时可选的类别（不含色情类） */
  categories?: JuryCategory[];
  /** 风纪值：事件 kind → 分值 */
  points?: Record<string, number>;
  /** 系统自动暂停资格的条件 */
  suspend?: JurySuspendRules;
  exam?: JuryExamRules;
  practice?: { daily_limit: number };
  recuse?: { daily_limit: number };
  abstain?: JuryAbstainRules;
}

// ───────────────────────── 总览 ─────────────────────────

/** GET /jury/overview —— 社区层面的数字，所有登录用户可读 */
export interface JuryOverview {
  jurors: { total: number } & Partial<Record<JuryTier, number>>;
  /** 等委员评审 / 等资深合议 */
  backlog: { jury: number; panel: number };
  settled: { d7: number; d30: number; total: number };
  window_days: number;
  /** 窗口内离开委员队列（定案或转出）的案件数 */
  sample: number;
  /** 为 false 时三个比率都是 null，只显示件数 */
  sample_enough: boolean;
  median_hours: number | null;
  consensus_rate: number | null;
  violation_rate: number | null;
  overturn_rate: number | null;
  counts: { consensus: number; escalated: number; violation: number; clean: number; overturned: number };
  me?: { status: JuryMembership; tier: JuryTier | null; available_cases: number | null; voted_today: number; daily_limit: number } | null;
  /** 近 30 天每天一项，按日期正序（UTC+8 自然日），没有数据的日子是 0。早期的后端没有这个字段 */
  daily?: Array<{ date: string; queued: number; settled: number }>;
  generated_at: string;
}

// ───────────────────────── 案件 ─────────────────────────

/** 案件里的一条消息。内容已经由服务端匿名化，speaker 只会是「被举报人」「成员A」这类代称。 */
export interface JuryCaseMessage {
  speaker: string;
  is_target: boolean;
  type: string;
  /** 为 null 表示这条上下文消息已被撤回 */
  content: string | null;
  images?: string[];
  created_at: string;
  /** 相对被举报消息的位置：目标是 0，之前为负，之后为正。旧后端没有这个字段 */
  offset?: number;
}

export interface JuryCasePost {
  content: string | null;
  image_urls?: string[];
  created_at: string;
}

export type JuryCaseKind = 'message' | 'post';

export interface JuryReasonCount {
  reason: string;
  count: number;
}

export interface JuryCaseView {
  /**
   * 委员侧的「评审编号」：评审台、投票、案件详情、观点区、我的评审里的 case_id 都是它。
   * 它是对每个委员、每个案件各不相同的不透明数字，只能原样拿回去请求委员侧的接口；
   * 公示栏 / 判例里的 case_id 是案件的公开编号，两者不能互相代入。要指到公示栏用 JuryCaseDetail.public_case_id。
   */
  case_id: number;
  kind: JuryCaseKind;
  reasons: JuryReasonCount[];
  report_count: number;
  messages: JuryCaseMessage[];
  post: JuryCasePost | null;
  /** 分到手的时间和让出的时间 */
  assigned_at?: string | null;
  expires_at?: string | null;
  /** 二期：按举报理由映射的默认违规类别（config.categories 里的 key） */
  suggested_category?: string | null;
  /** 三期：案件是谁送来的。machine = 机器审核拿不准的内容，没有举报人 */
  case_origin?: 'report' | 'machine' | (string & {}) | null;
}

/** recuse（主动回避）和 need_context（上下文不足）是二期新增的取值 */
export type JuryVote = 'none' | 'l1' | 'l2' | 'l3' | 'abstain' | 'need_context' | 'recuse';
export type JuryOutcome = 'violation' | 'clean';
/** 票数分布。need_context 是二期新增的键；回避不进分布 */
export type JuryTally = Record<'none' | 'l1' | 'l2' | 'l3' | 'abstain', number> & {
  need_context?: number;
  /** 三期：经过资深合议的案件，合议的票数另列 */
  panel?: Partial<Record<'none' | 'l1' | 'l2' | 'l3', number>> | null;
};
/** jury 委员评审中 / panel 资深合议中 / admin 等管理员 / closed 已定案 */
export type JuryCaseStage = 'jury' | 'panel' | 'admin' | 'closed';
/** jury 委员共识 / panel 资深合议 / admin 管理员 / auto 机器 */
export type JuryVerdictSource = 'jury' | 'panel' | 'admin' | 'auto';

export interface JuryVerdict {
  outcome: JuryOutcome;
  source: JuryVerdictSource;
  /** 不违规时为 null */
  category: string | null;
  category_label: string | null;
  level: number | null;
  closed_at: string;
  /** 举报到定案用了多久 */
  hours: number | null;
  /**
   * 定案后被改判。此时 outcome / category / level 是改判后的新结论，
   * 但 source 和案件的 tally 仍是原审的样子 —— 界面不能拿票数分布去解释现在的结论。
   */
  overturned: boolean;
  overturn_note: string | null;
  /** 题库里这道题的讲解；只有质控题且管理员写了才有 */
  explanation?: string | null;
}

export interface JuryMyVote {
  /** 这一票是哪一轮投的。后端目前只在 /jury/votes 的列表项里给 vote_stage，详情里还没有；给了就用 */
  stage?: 'jury' | 'panel';
  vote: JuryVote;
  note: string | null;
  voted_at: string;
  /** 我在这个案件里的代号；质控题不分配代号，为 null */
  alias: string | null;
  /** 是否与结论一致；未定案或我弃权时为 null */
  agreed: boolean | null;
  /** 二期：这个案件累计给了我多少风纪值 */
  points?: number | null;
  /** 二期：我投违规票时选的类别（config.categories 里的 key）；没选或不是违规票时为 null */
  category?: string | null;
}

/** GET /jury/cases/{id} —— 我投过票的案件（投后视图 / 回看） */
export interface JuryCaseDetail extends JuryCaseView {
  /** 定案满保留期后为 false，此时 messages 为空、post 为 null */
  content_available: boolean;
  my_vote: JuryMyVote;
  stage: JuryCaseStage;
  /** 已有几张有效票（不含弃权） */
  votes_cast: number;
  /** 定案后才给 */
  tally: JuryTally | null;
  verdict: JuryVerdict | null;
  /** 质控题：投完立刻给标准结论，没有观点区 */
  is_quality_check: boolean;
  opinions_enabled: boolean;
  opinion_count: number;
  /** 案件的公开编号：已经进公示栏时有值，否则为 null；质控题恒为 null。早期的后端没有这个字段 */
  public_case_id?: number | null;
  /** 三期：这个案件已经是判例时指向它 */
  precedent?: PrecedentRef | null;
  /** 三期：我（资深委员）能不能把它标为判例 */
  can_mark_precedent?: boolean;
}

export interface JuryVoteResult {
  case_id: number;
  /** 这一票让案件有了结论 */
  settled: boolean;
  /** 投后视图。旧后端没有；主动回避后为 null（回避的人不能再看这个案件） */
  case?: JuryCaseDetail | null;
  /** 二期：这一票当场结算的风纪值 */
  reward?: JuryReward | null;
}

// ───────────────────────── 观点区 ─────────────────────────

/** visible / deleted（本人或管理员删除）/ hidden（多人举报后折叠，待处理） */
export type JuryOpinionState = 'visible' | 'deleted' | 'hidden';

export interface JuryOpinion {
  id: number;
  parent_id: number | null;
  /** 案件内匿名代号，如「委员 A」。同一案件内稳定，不同案件不关联 */
  alias: string;
  tier: JuryTier | null;
  /** 这位委员投的票；定案后才给 */
  vote: JuryVote | null;
  /** 已删除 / 被折叠时为 null */
  content: string | null;
  state: JuryOpinionState;
  /** 投票时写的备注 */
  is_note: boolean;
  mine: boolean;
  like_count: number;
  liked: boolean;
  /** 我是否举报过 */
  reported: boolean;
  created_at: string;
  /** 回复的是哪位（回复别人的回复时用） */
  reply_to_alias: string | null;
  /** 只有一层：回复的 replies 恒为空 */
  replies: JuryOpinion[];
}

export interface JuryOpinionList {
  items: JuryOpinion[];
  total: number;
}

// ───────────────────────── 我的评审 ─────────────────────────

/** GET /jury/history —— 最近 50 条（一直就有的接口，新接口不可用时退回它） */
export interface JuryHistoryItem {
  /** 评审编号（见 JuryCaseView.case_id），不是公示栏里的案件编号 */
  case_id: number;
  kind: JuryCaseKind;
  vote: JuryVote;
  voted_at: string;
  /** 为 null 表示案件未结，或自己投的是弃权 */
  agreed: boolean | null;
  outcome: JuryOutcome | null;
}

/** GET /jury/votes 的一行 */
export interface JuryVoteItem extends JuryHistoryItem {
  primary_reason?: string | null;
  alias?: string | null;
  stage?: JuryCaseStage;
  verdict_source?: JuryVerdictSource | null;
  verdict_level?: number | null;
  closed_at?: string | null;
  overturned?: boolean;
  is_quality_check?: boolean;
  opinion_count?: number;
  /** 案件的公开编号：已经进公示栏时有值，否则为 null；质控题恒为 null。早期的后端没有这个字段 */
  public_case_id?: number | null;
  /** 三期：这一票是在哪一轮投的（普通评审 / 资深合议） */
  vote_stage?: 'jury' | 'panel';
  /** 二期：能不能进详情。主动回避的记录为 false */
  can_view?: boolean;
}

export interface JuryVotesQuery {
  limit: number;
  offset: number;
  state?: 'open' | 'closed';
  outcome?: JuryOutcome;
  agreed?: boolean;
  vote?: JuryVote[];
}

export interface JuryVotesPage {
  items: JuryVoteItem[];
  total: number;
}

/** GET /jury/me/stats */
export interface JuryMyStats extends JuryStats {
  golden_rate: number | null;
  abstain_total: number;
  abstain_rate: number | null;
  opinions_total: number;
  likes_received: number;
  /** 近 30 天，每天一项，按日期正序；日期是 UTC+8 的自然日 */
  trend: Array<{ date: string; votes: number; settled: number; agreed: number }>;
}

// ───────────────────────── 公示栏 ─────────────────────────

export interface JuryPublicCase {
  /** 案件的公开编号。和委员侧的评审编号（JuryCaseView.case_id）不是一回事，不能拿去请求委员侧的接口 */
  case_id: number;
  kind: JuryCaseKind;
  reasons: JuryReasonCount[];
  report_count: number;
  outcome: JuryOutcome;
  /** 不违规时为 null */
  category: string | null;
  category_label: string | null;
  level: number | null;
  source: JuryVerdictSource;
  tally: JuryTally | null;
  /** 有效票数（不含弃权） */
  votes: number;
  closed_at: string;
  hours: number | null;
  overturned: boolean;
  /** 详情里是否带内容 */
  has_content: boolean;
  /** 三期：这个案件是判例时指向它 */
  precedent_id?: number | null;
  /** 三期：案件是谁送来的（同 JuryCaseView.case_origin）。machine 没有举报人 */
  case_origin?: 'report' | 'machine' | (string & {}) | null;
}

/** group_message 群聊消息不公示内容 / clean 认定不违规 / sensitive 涉及隐私等类别 / overturned 已改判 */
export type JuryContentHiddenReason = 'group_message' | 'clean' | 'sensitive' | 'overturned';

export interface JuryPublicCaseDetail extends JuryPublicCase {
  /** 只有被举报的那一篇的文字；图片只给数量 */
  content: { text: string | null; image_count: number; created_at: string } | null;
  content_hidden_reason: JuryContentHiddenReason | null;
  overturn_note: string | null;
}

export interface JuryPublicQuery {
  limit: number;
  offset: number;
  kind?: JuryCaseKind;
  outcome?: JuryOutcome;
  category?: string;
}

export interface JuryPublicPage {
  items: JuryPublicCase[];
  total: number;
}
