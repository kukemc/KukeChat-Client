import type { JuryConfig } from '@/types/jury';

/**
 * GET /jury/config 拿不到时（旧后端，404）用的配置：能力列表为空，规则数字是 docs/moderation-v2.md 里写明的现行值。
 * 新后端上一律以接口下发的为准，这里只是兜底，不要往里加新的规则数字。
 */
export const LEGACY_JURY_CONFIG: JuryConfig = {
  version: 1,
  capabilities: [],
  switches: { auto_appoint: false, appeals: false, machine_review: false },
  tiers: [
    { key: 'trainee', label: '见习委员' },
    { key: 'regular', label: '正式委员' },
    { key: 'senior', label: '资深委员' }
  ],
  votes: [
    { value: 'none', kind: 'clean', label: '不违规', hint: '没有违反社区规则' },
    { value: 'l1', kind: 'violation', label: '违规 · 轻微', hint: '不太合适，情节轻微', level: 1 },
    { value: 'l2', kind: 'violation', label: '违规 · 一般', hint: '明确违规', level: 2 },
    { value: 'l3', kind: 'violation', label: '违规 · 严重', hint: '性质恶劣', level: 3 },
    { value: 'abstain', kind: 'abstain', label: '拿不准', hint: '看不懂或无法判断，不计入表决' }
  ],
  rules: {
    seats_per_case: 5,
    quick_consensus_votes: 3,
    full_consensus_votes: 4,
    timeout_hours: 72,
    assignment_ttl_hours: 24,
    daily_votes: 30,
    term_days: 30,
    context_near: 3,
    content_retention_days: 30,
    publish_delay_hours: 72,
    min_sample: 5
  },
  opinions: { max_length: 500, per_case: 20, per_minute: 5, per_day: 100, auto_hide_reports: 2, report_reasons: ['人身攻击', '泄露身份或隐私', '照抄违规原文', '与案件无关', '其他'] },
  eligibility: { min_account_age_days: 30, min_recent_messages: 30, recent_activity_days: 30 }
};

/** 机器和风纪委员给出的封禁上限（docs/moderation-v2.md 1.1）。只作兜底：新后端在 config.rules.max_ban_hours 里下发，界面用 data/growth.ts 的 maxBanText */
export const JURY_MAX_BAN_DAYS = 7;
/** 投票备注的长度上限（docs/moderation-v2.md 3.2） */
export const VOTE_NOTE_MAX = 500;
/** 申请陈述的长度上限（docs/moderation-v2.md 3.1） */
export const APPLY_STATEMENT_MAX = 500;
