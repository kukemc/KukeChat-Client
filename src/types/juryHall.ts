/**
 * 风纪 v2 三期 · 议事厅的接口类型。契约在 KukeChat-Server 的 docs/jury-v2.md 3.5。
 * 议事厅是实名的公开讨论区（和案件里的匿名正相反），所以这里的作者是完整的用户对象。
 */
import type { User } from './api';
import type { JuryTier } from './jury';

/** 公告（管理员发）/ 规则提案（在任委员表决）/ 讨论 */
export type HallPostKind = 'announcement' | 'proposal' | 'discussion';

/**
 * open 进行中（提案：表决中）/ passed 通过，待管理员采纳 / rejected 未通过 /
 * adopted 已采纳 / declined 不采纳 / closed 已关闭
 */
export type HallPostStatus = 'open' | 'passed' | 'rejected' | 'adopted' | 'declined' | 'closed';

export type HallBallot = 'yes' | 'no';

export interface HallVoteState {
  yes: number;
  no: number;
  ends_at: string;
  my_vote: HallBallot | null;
  can_vote: boolean;
  /** 至少要多少人参与表决才算数 */
  quorum: number;
  /** 通过线是 pass_num / pass_den。服务端按整数比较 yes × pass_den >= (yes + no) × pass_num，恰好压线算通过 */
  pass_num: number;
  pass_den: number;
}

export interface HallPost {
  id: number;
  kind: HallPostKind;
  title: string;
  /** 列表里是前 200 字，详情里是全文。帖子被折叠（state 为 hidden）时为 null，title 是占位文字 */
  content: string | null;
  /** hidden = 被多位在任委员举报后自动折叠，等管理员处理。公告不会被自动折叠 */
  state?: 'visible' | 'hidden' | (string & {});
  /** 这一份里的 content 是截断过的（列表）。要全文得去拿详情 */
  content_truncated?: boolean;
  author: User | null;
  /** 公告的作者是管理员，没有层级 */
  author_tier: JuryTier | null;
  status: HallPostStatus;
  pinned: boolean;
  /** 非提案为 null */
  vote: HallVoteState | null;
  /** 管理员采纳 / 不采纳时写的说明 */
  admin_note: string | null;
  comment_count: number;
  can_comment: boolean;
  mine: boolean;
  /** 作者本人才可能为 true；提案有人表决后不能再改 */
  can_edit: boolean;
  can_delete: boolean;
  /** 我是否举报过这个帖子 */
  reported?: boolean;
  created_at: string;
  updated_at: string;
}

export interface HallPostsQuery {
  limit: number;
  offset: number;
  kind?: HallPostKind;
  status?: HallPostStatus;
  /** active 按最后活动时间（默认）/ new 按发帖时间；置顶始终在前 */
  sort?: 'active' | 'new';
}

export interface HallPostsPage {
  items: HallPost[];
  total: number;
}

export interface HallPostDraft {
  kind: Exclude<HallPostKind, 'announcement'>;
  title: string;
  content: string;
}

export type HallCommentState = 'visible' | 'deleted' | 'hidden';

export interface HallComment {
  id: number;
  /** 回复挂在哪条根评论下面；根评论为 null。回复只有一层 */
  parent_id: number | null;
  author: User | null;
  author_tier: JuryTier | null;
  /** 已删除 / 被折叠时为 null */
  content: string | null;
  state: HallCommentState;
  mine: boolean;
  /** 我是否举报过这条评论 */
  reported?: boolean;
  created_at: string;
  /** 回复的是谁（回复别人的回复时用） */
  reply_to: User | null;
}

export interface HallCommentsPage {
  items: HallComment[];
  total: number;
}

export interface HallReportBody {
  target_type: 'post' | 'comment';
  target_id: number;
  reason: string;
  details?: string;
}

/** 举报的返回：被举报的目标此刻的状态。举报可能当场让它变成 hidden（够了自动折叠的人数） */
export interface HallReportResult {
  target_type: 'post' | 'comment';
  target_id: number;
  state: HallCommentState | (string & {});
}

/** 删帖、删评论的返回 */
export interface HallDeleteResult {
  id: number;
  state: HallCommentState | (string & {});
}

/** GET /jury/config 的 hall：议事厅的规则数字和守则 */
export interface JuryHallRules {
  title_max: number;
  content_max: number;
  comment_max: number;
  posts_per_day: number;
  comments_per_day: number;
  /** 提案表决几天 */
  vote_days: number;
  /** 参与表决的人数至少占在任委员的多少 */
  quorum_ratio: number;
  quorum_min: number;
  /** 通过线 pass_num / pass_den（整数比较用这两个）；pass_ratio 只是给展示用的近似值 */
  pass_num: number;
  pass_den: number;
  pass_ratio: number;
  /** 同一个帖子 / 评论被几名在任委员举报后自动折叠（其他用户的举报只记录，由管理员处理） */
  auto_hide_reports: number;
  /** 发帖和评论时要展示的守则 */
  guidelines: string;
  report_reasons: string[];
}
