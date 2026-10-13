/**
 * 风纪 v2 三期里「资深委员」和「判例」的接口类型：资深合议、申诉复审、判例库、举报复议。
 * 契约在 KukeChat-Server 的 docs/jury-v2.md 第 3 节（3.1–3.4、3.7）。议事厅的类型在 ./juryHall.ts。
 */
import type { JuryCaseDetail, JuryCaseKind, JuryCaseMessage, JuryCasePost, JuryCaseView, JuryOpinion, JuryOutcome, JuryPublicCaseDetail, JuryTally } from './jury';
import type { JuryReward } from './juryGrowth';

// ───────────────────────── 配置与队列 ─────────────────────────

/** /jury/me 的 senior：现在能分给我的合议 / 复审件数。不是资深委员时为 null */
export interface JurySeniorQueue {
  panel: number;
  appeals: number;
}

/** GET /jury/config 的 panel 和 appeals（两者同形）：席位、几票一致出结果、多久没结果转管理员 */
export interface JuryPanelRules {
  seats: number;
  consensus_votes: number;
  timeout_hours: number;
}

/** GET /jury/config 的 reconsider：举报人复议的时限和理由的最短字数 */
export interface JuryReconsiderRules {
  window_days: number;
  text_min: number;
}

// ───────────────────────── 资深合议（3.1） ─────────────────────────

/** 案件为什么来到合议：原审没有共识 / 原审多位委员认为上下文不足 / 原审超时没凑够票 */
export type PanelOriginReason = 'no_consensus' | 'need_context' | 'timeout' | (string & {});

/** 原审留下的东西：分布和观点。合议 / 复审委员只读 */
export interface ReviewOrigin {
  tally: JuryTally | null;
  /** 每条都带 vote（原审已经结束） */
  opinions: JuryOpinion[];
}

export interface PanelOrigin extends ReviewOrigin {
  reason: PanelOriginReason;
}

/** GET /jury/panel/next 的案件：普通评审的视图 + 原审信息 + 合议席位 */
export interface PanelCaseView extends JuryCaseView {
  origin: PanelOrigin;
  panel: { seats: number; votes_cast: number; expires_at: string | null };
}

/** 合议不能弃权：只有四个判断，或者主动回避 */
export type PanelVote = 'none' | 'l1' | 'l2' | 'l3' | 'recuse';

export interface PanelVoteBody {
  vote: PanelVote;
  /** 违规票可以带违规类别 */
  category?: string;
  note?: string;
}

/** POST /jury/appeals/{id}/vote 的请求体。复议投 overturn 时可以带等级和类别 */
export interface AppealVoteBody {
  vote: AppealVote;
  note?: string;
  level?: number;
  category?: string;
}

export interface PanelVoteResult {
  case_id: number;
  settled: boolean;
  /** 回避之后为 null */
  case?: JuryCaseDetail | null;
  reward?: JuryReward | null;
}

// ───────────────────────── 申诉复审（3.2） ─────────────────────────

/** 维持 / 减轻 / 撤销；举报人复议（3.7）时是 维持 / 改判 */
export type AppealVote = 'uphold' | 'reduce' | 'revoke' | 'overturn';

/** appeal = 被处罚人申诉；reconsider = 举报人对「不违规」的结论申请复议 */
export type AppealReviewType = 'appeal' | 'reconsider';

export interface AppealReviewView {
  review_id: number;
  /** 没有这个字段时按 appeal 处理 */
  type?: AppealReviewType;
  kind: JuryCaseKind;
  /** 原处罚是谁给的；复议时看 verdict.source */
  source: 'jury' | 'panel' | 'machine' | (string & {}) | null;
  category: string | null;
  category_label: string | null;
  level: number | null;
  penalty: { kind: string; hours?: number | null } | null;
  /** 来自案件的：匿名上下文 */
  messages: JuryCaseMessage[];
  post: JuryCasePost | null;
  /** 机器处罚没有案件快照，只有被处罚的那条内容 */
  content: { text: string | null; image_count: number } | null;
  /** 机器处罚时为 null */
  origin: ReviewOrigin | null;
  /** 复议时这两个为 null，改看 reconsider_text / requested_at */
  appeal_text: string | null;
  appealed_at: string | null;
  reconsider_text?: string | null;
  requested_at?: string | null;
  /** 复议时：被质疑的原结论 */
  verdict?: { outcome: JuryOutcome; source: 'jury' | 'panel' | (string & {}); closed_at: string } | null;
  expires_at: string | null;
  seats: number;
  votes_cast: number;
}

export type AppealOutcome = 'uphold' | 'reduce' | 'revoke' | 'overturn';

export interface AppealVoteResult {
  review_id: number;
  settled: boolean;
  /** 还没出结果时为 null */
  outcome: AppealOutcome | null;
  reward?: JuryReward | null;
}

/** GET /jury/appeals/mine 的一行 */
export interface AppealMineItem {
  review_id: number;
  type?: AppealReviewType;
  kind: JuryCaseKind;
  source?: string | null;
  my_vote: AppealVote;
  voted_at: string;
  /** 还没出结果时为 null */
  outcome: AppealOutcome | null;
  settled_at: string | null;
  category_label?: string | null;
  level?: number | null;
  penalty?: { kind: string; hours?: number | null } | null;
}

export interface AppealMinePage {
  items: AppealMineItem[];
  total: number;
}

// ───────────────────────── 判例（3.4） ─────────────────────────

export interface Precedent {
  id: number;
  /** 案件的公开编号（和公示栏里的 case_id 是同一个），不是委员侧的评审编号 */
  case_id: number;
  title: string;
  /** 裁判要旨 */
  summary: string;
  kind: JuryCaseKind;
  outcome: JuryOutcome;
  category: string | null;
  category_label: string | null;
  level: number | null;
  /** 谁标的：资深委员 / 管理员 */
  by: 'senior' | 'admin';
  created_at: string;
  /** 是我标的（可以编辑、撤销） */
  mine?: boolean;
}

export interface PrecedentDetail extends Precedent {
  /** 和公示栏同一套规则 */
  content: JuryPublicCaseDetail['content'];
  /** 比公示栏多一个 unpublished：案件此刻不在公示栏里（定案不足公示等待期、有待处理的申诉）。要旨照常可读 */
  content_hidden_reason: JuryPublicCaseDetail['content_hidden_reason'] | 'unpublished';
  /** 在任委员能看到完整的匿名案件视图，其他人为 null */
  case: { messages: JuryCaseMessage[]; post: JuryCasePost | null } | null;
}

export interface PrecedentQuery {
  limit: number;
  offset: number;
  category?: string;
}

export interface PrecedentPage {
  items: Precedent[];
  total: number;
}

/** 案件详情 / 公示栏条目上指向判例的那一小块 */
export interface PrecedentRef {
  id: number;
  title: string;
  mine?: boolean;
}
