/**
 * 风纪 v2 二期的接口类型：入门考试、练习场、风纪值、层级、成就、排行榜、公开展示身份。
 * 契约在 KukeChat-Server 的 docs/jury-v2.md 第 2 节。/jury/me、/jury/config 等一期类型上新增的可选字段
 * 仍然写在 types/jury.ts 里，这里放的是它们引用的形状。
 */
import type { User } from './api';
import type { JuryCaseKind, JuryCaseMessage, JuryCasePost, JuryOutcome, JuryReasonCount, JuryStatus, JuryTier } from './jury';

// ───────────────────────── /jury/me 与 /jury/config 新增的块 ─────────────────────────

/** 在任委员正在受处罚：评审、发观点、点赞、议事厅发言都会被服务端拒绝；回看不受影响 */
export interface JuryRestriction {
  reason: 'muted' | 'banned' | (string & {});
  until: string | null;
  message: string;
}

export interface JuryWarning {
  /** high_abstain 弃权偏多 / demote_risk 一致率接近或低于降级线 / suspend_risk 一致率或质控正确率接近或低于暂停线 */
  code: string;
  message: string;
  /** 服务端实际用来判断的那个数（比如最近 30 张已结票的一致率）。客户端直接展示，不自己估算 */
  current?: number | null;
  threshold?: number | null;
  /** current 的样本数 */
  sample?: number | null;
}

/** /jury/me.exam —— 考试的摘要，完整状态在 GET /jury/exam */
export interface JuryExamSummary {
  /** false 表示题库里已核对的题不够，暂时不能考 */
  available: boolean;
  passed: boolean;
  passed_at: string | null;
  attempts_used: number;
  attempts_max: number;
  next_attempt_at: string | null;
  last_score: number | null;
  pass_score: number;
  total: number;
}

export interface JuryTierRequirement {
  /** votes_settled / agreement_rate / quality_rate / days_served */
  key: string;
  label: string;
  /** 比率类是 0–1；还没开始计算时为 null */
  current: number | null;
  target: number;
  ok: boolean;
  note?: string | null;
}

/** /jury/me.tier_progress —— 离下一层还差什么。已是资深时 next_tier 为 null */
export interface JuryTierProgress {
  next_tier: JuryTier | null;
  requirements: JuryTierRequirement[];
}

/** 投违规票时可选的类别 */
export interface JuryCategory {
  key: string;
  label: string;
  default_level: number;
}

/** 晋升到这一层的条件。quality_rate 在答过 quality_min 道质控题之后才看 */
export interface JuryTierThresholds {
  votes_settled: number;
  agreement_rate: number;
  quality_rate: number;
  quality_min: number;
  days_served: number;
}

/** 这一层的降级线：最近 window 张已结票（不足 min_votes 不判断）一致率低于 agreement_rate 时降到 to */
export interface JuryDemoteRule {
  agreement_rate: number;
  window: number;
  min_votes: number;
  to: JuryTier;
}

export interface JuryExamRules {
  total: number;
  pass_score: number;
  time_limit_minutes: number;
  /** 过了 expires_at 之后交卷还被接受的秒数 */
  grace_seconds: number;
  attempts_max: number;
  window_days: number;
  retry_hours: number;
  /** 通过后多久内有效 */
  valid_days: number;
}

export interface JuryAbstainRules {
  window: number;
  min_votes: number;
  warn_rate: number;
  cooldown_rate: number;
  cooldown_hours: number;
}

export interface JurySuspendRules {
  min_settled: number;
  agreement_rate: number;
  quality_min: number;
  quality_rate: number;
}

// ───────────────────────── 题目与标准结论 ─────────────────────────

/** 考试和练习里能投的票：只有判断，没有弃权 / 回避 */
export type JuryBallot = 'none' | 'l1' | 'l2' | 'l3';

/** 一道题的标准结论。考试只判「违规 / 不违规」，等级和类别是给人对照用的 */
export interface JuryStandardAnswer {
  outcome: JuryOutcome;
  level: number | null;
  category_label: string | null;
  explanation: string | null;
}

/** 题目的内容：和 JuryCaseView 同形的匿名案件快照，但没有案件编号 */
export interface JuryQuestionContent {
  kind: JuryCaseKind;
  reasons: JuryReasonCount[];
  report_count?: number;
  messages: JuryCaseMessage[];
  post: JuryCasePost | null;
}

// ───────────────────────── 入门考试 ─────────────────────────

export interface JuryExamQuestion extends JuryQuestionContent {
  /** 1–N 的序号 */
  question: number;
}

export interface JuryExamAttempt {
  attempt_id: number;
  expires_at: string;
  questions: JuryExamQuestion[];
  /** POST /jury/exam/start 的响应里带；用来校正本机倒计时 */
  server_time?: string | null;
}

/** GET /jury/exam */
export interface JuryExamState {
  available: boolean;
  /** 四项资格是否都满足；不满足不能考 */
  eligible: boolean;
  passed: boolean;
  passed_at: string | null;
  total: number;
  pass_score: number;
  time_limit_minutes: number;
  attempts_used: number;
  attempts_max: number;
  window_days: number;
  /** 现在就能考时为 null */
  next_attempt_at: string | null;
  last_result: { score: number; passed: boolean; submitted_at: string } | null;
  /** 进行中的一场 */
  active: JuryExamAttempt | null;
  server_time?: string | null;
}

export interface JuryExamAnswer {
  question: number;
  vote: JuryBallot;
}

export interface JuryExamQuestionResult {
  question: number;
  correct: boolean;
  /** 没作答的题为 null，按答错算 */
  your_vote: JuryBallot | null;
  answer: JuryStandardAnswer;
}

/**
 * 交卷被拒（409 exam_closed）时 detail.reason 的取值：submitted 这一场已经交过卷（比如在另一个设备上），expired 超时作废。
 * 早期的后端没有这个字段。
 */
export type JuryExamClosedReason = 'submitted' | 'expired';

/** POST /jury/exam/{attempt_id}/submit */
export interface JuryExamResult {
  score: number;
  total: number;
  pass_score: number;
  passed: boolean;
  results: JuryExamQuestionResult[];
  attempts_left: number;
  next_attempt_at: string | null;
  /** 通过且 auto_appoint 开时这里已经是 active */
  status: JuryStatus;
}

// ───────────────────────── 练习场 ─────────────────────────

export interface JuryPracticeQuestion extends JuryQuestionContent {
  question_id: number;
  /** 是否已核对。未核对的题只用于练习 */
  verified: boolean;
  /** 我以前做过这道题 */
  answered_before?: boolean;
}

export interface JuryPracticeStats {
  answered: number;
  correct: number;
}

/** GET /jury/practice/next */
export interface JuryPracticeNext {
  /** 题库为空时为 null */
  question: JuryPracticeQuestion | null;
  left_today: number;
  daily_limit: number;
  /** 练习上限（最近 24 小时滚动）下一个名额释放的时间。一次都没练过时为 null；额度没用满时也可能有值。早期的后端没有 */
  resets_at?: string | null;
  stats?: JuryPracticeStats | null;
  /** total 是题库里我能练的题数，done 是其中做过的（不重复计）。done == total 说明这一轮做完了，之后出的都是重做的题 */
  round?: { total: number; done: number } | null;
}

/** POST /jury/practice/{question_id}/answer */
export interface JuryPracticeAnswer {
  correct: boolean;
  answer: JuryStandardAnswer;
  left_today: number;
  /** 同 JuryPracticeNext.resets_at */
  resets_at?: string | null;
  stats: JuryPracticeStats;
}

// ───────────────────────── 风纪值、成就、排行榜 ─────────────────────────

export interface JuryRewardItem {
  kind: string;
  points: number;
  label: string;
}

/** 投票响应里当场结算的加分。案件定案时的加分走实时事件 jury.points.changed */
export interface JuryReward {
  points: number;
  total: number;
  items: JuryRewardItem[];
}

export interface JuryPointsItem {
  kind: string;
  label: string;
  points: number;
  case_id: number | null;
  created_at: string;
}

/** GET /jury/me/points */
export interface JuryPointsPage {
  total: number;
  items: JuryPointsItem[];
  /** 明细的总条数 */
  count: number;
}

export interface JuryAchievement {
  key: string;
  label: string;
  description: string;
  earned_at: string | null;
  current: number;
  target: number;
}

export type JuryLeaderboardPeriod = 'week' | 'month' | 'all';

export interface JuryLeaderboardItem {
  rank: number;
  points: number;
  tier?: JuryTier | null;
  /** 本期投票数。早期的 me 里没有这个字段 */
  votes?: number | null;
  me?: boolean;
  /** 没公开身份的委员为 null，显示为「匿名委员」 */
  user?: User | null;
}

/** GET /jury/leaderboard */
export interface JuryLeaderboard {
  period: JuryLeaderboardPeriod;
  items: JuryLeaderboardItem[];
  /** 我在这一期的那一行，和榜单行同形；不是委员或本期没有得分时为 null */
  me: JuryLeaderboardItem | null;
  generated_at: string;
}

/** 实时事件 jury.points.changed */
export interface JuryPointsChangedEvent {
  delta: number;
  total: number;
  kind: string;
  /** 可以直接显示的文字，和 /jury/me/points 明细里的 label 同源 */
  label?: string | null;
  case_id: number | null;
}

/** 实时事件 jury.achievement.earned */
export interface JuryAchievementEarnedEvent {
  key: string;
  label: string;
}
