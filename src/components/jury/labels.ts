import type { JuryCaseKind, JuryCaseStage, JuryContentHiddenReason, JuryMembership, JuryOutcome, JuryRuleNumbers, JuryTier, JuryVerdictSource, JuryVote } from '@/types/jury';
import { formatChinaDateTime, parseApiDate } from '@/utils/dateTime';

// 风纪页里所有枚举值对应的文字，以及数字、时间的写法。组件里不要各写各的。

/** 票数分布里固定出现的五项。二期的「上下文不足」只在有票时才追加，主动回避不进分布 */
export const VOTE_ORDER = ['none', 'l1', 'l2', 'l3', 'abstain'] as const satisfies readonly JuryVote[];

export const VOTE_LABEL: Record<JuryVote, string> = { none: '不违规', l1: '轻微违规', l2: '一般违规', l3: '严重违规', abstain: '弃权', need_context: '上下文不足', recuse: '主动回避' };
export const VOTE_SHORT: Record<JuryVote, string> = { none: '不违规', l1: '轻微', l2: '一般', l3: '严重', abstain: '弃权', need_context: '上下文不足', recuse: '回避' };

/** 票的名称。认不出的取值（后端先于客户端加了新选项）原样显示，不让界面出现 undefined。 */
export function voteLabel(vote: string, short = false): string {
  return (short ? VOTE_SHORT : VOTE_LABEL)[vote as JuryVote] ?? vote;
}

export const OUTCOME_LABEL: Record<JuryOutcome, string> = { violation: '违规', clean: '不违规' };

export const LEVEL_NAME: Record<number, string> = { 1: '轻微', 2: '一般', 3: '严重', 4: '特别严重' };

export const TIER_LABEL: Record<JuryTier, string> = { trainee: '见习', regular: '正式', senior: '资深' };

export const KIND_LABEL: Record<JuryCaseKind, string> = { message: '群聊消息', post: '公开动态' };

export const SOURCE_LABEL: Record<JuryVerdictSource, string> = { jury: '委员表决', panel: '资深合议', admin: '管理员裁定', auto: '系统判定' };

export const STAGE_LABEL: Record<JuryCaseStage, string> = { jury: '委员评审中', panel: '资深合议中', admin: '等待管理员', closed: '已定案' };

export const MEMBERSHIP_LABEL: Record<JuryMembership, string> = { none: '未加入', applied: '申请审核中', active: '在任', expired: '任期已满', rejected: '申请未通过', suspended: '资格已暂停', retired: '已卸任' };

export const MEMBERSHIP_TONE: Record<JuryMembership, string> = { none: '', applied: 'kui-tag--warn', active: 'kui-tag--ok', expired: '', rejected: 'kui-tag--danger', suspended: 'kui-tag--danger', retired: '' };

export const HIDDEN_REASON_TEXT: Record<JuryContentHiddenReason, { title: string; text: string }> = {
  group_message: { title: '群聊消息不公示内容', text: '群聊里的话是说给群成员听的。为了保护群聊隐私，这类案件只公示举报理由、结论、等级、票数和用时，不展示消息原文。' },
  clean: { title: '认定不违规，不公示内容', text: '委员认定这条内容没有违规。把原文挂出来等于公开「此人被举报过」，所以这里只公示结论和票数。' },
  sensitive: { title: '涉及隐私，不公示内容', text: '这类案件的内容本身可能包含他人的个人信息，公示会造成二次伤害。' },
  overturned: { title: '结论已被改判，内容已撤下', text: '这个案件定案后经申诉或复核被改判，原先公示的内容已撤下。' }
};

/**
 * 两套编号，两个叫法，不要混用：
 * 委员侧（评审台、案件详情、观点区、我的评审）的 case_id 是「评审编号」，每个委员、每个案件各不相同；
 * 公示栏和判例里的 case_id 是案件的公开编号。两者不能互相代入。
 */
export function reviewNo(caseId: number): string {
  return `评审 #${caseId}`;
}

export function publicCaseNo(caseId: number): string {
  return `案件 #${caseId}`;
}

/**
 * 表决规则的统一说法，所有讲「几票定案」的地方都用它，不要各写各的：
 * 有效票全部一致且已有 quick_consensus_votes 张或更多，即定案；一旦出现分歧，就要收满 seats_per_case 张，
 * 其中至少 full_consensus_votes 张一致才定案，否则转出。所以 3 比 1 不会定案，要等第 5 张。
 * 看的是「违规 / 不违规」是否一致。转出后去哪：后端有资深合议（capabilities 里有 panel）时先合议，否则直接到管理员。
 */
export function consensusRuleText(rules: Pick<JuryRuleNumbers, 'seats_per_case' | 'quick_consensus_votes' | 'full_consensus_votes'>, hasPanel: boolean): string {
  return `全票一致（至少 ${rules.quick_consensus_votes} 票）即定案；出现分歧时收满 ${rules.seats_per_case} 票，其中 ${rules.full_consensus_votes} 票一致才定案，否则转交${hasPanel ? '资深合议或管理员' : '管理员'}。`;
}

export function levelText(level: number | null | undefined): string {
  return level ? `L${level} ${LEVEL_NAME[level] ?? ''}`.trim() : '';
}

/** 比率 → 「87%」。null 显示成一道横线。 */
export function formatRate(rate: number | null | undefined, digits = 0): string {
  return rate === null || rate === undefined || !Number.isFinite(rate) ? '—' : `${(rate * 100).toFixed(digits)}%`;
}

/** 用时：不到 1 小时 / 5.2 小时 / 3 天 4 小时 */
export function formatHours(hours: number | null | undefined): string {
  if (hours === null || hours === undefined || !Number.isFinite(hours)) return '—';
  if (hours < 1) return '不到 1 小时';
  if (hours < 48) return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} 小时`;
  const days = Math.floor(hours / 24);
  const rest = Math.round(hours - days * 24);
  return rest ? `${days} 天 ${rest} 小时` : `${days} 天`;
}

export function formatDateTime(value?: string | null): string {
  return value ? formatChinaDateTime(value) : '—';
}

/** 只要月日：10-11 */
export function formatDay(value?: string | null): string {
  const date = parseApiDate(value);
  if (!date) return value ?? '';
  return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit' }).format(date).replace('/', '-');
}

/** 还剩多久：3 天 / 5 小时 / 不到 1 小时；已过期返回 null */
export function formatRemaining(value?: string | null): string | null {
  const date = parseApiDate(value);
  if (!date) return null;
  const hours = (date.getTime() - Date.now()) / 3600_000;
  if (hours <= 0) return null;
  if (hours < 1) return '不到 1 小时';
  if (hours < 48) return `${Math.floor(hours)} 小时`;
  return `${Math.floor(hours / 24)} 天`;
}

/** 举报理由合成一句：「辱骂骚扰 ×2、垃圾广告」 */
export function reasonsText(reasons: Array<{ reason: string; count: number }>): string {
  return reasons.map((item) => (item.count > 1 ? `${item.reason} ×${item.count}` : item.reason)).join('、') || '—';
}

/** 代号里的那个字母或数字：「委员 B」→「B」，认不出就取最后一个字。只用来画代号标记，不代表任何身份。 */
export function aliasMark(alias: string): string {
  const match = alias.match(/([A-Za-z0-9]+)\s*$/);
  return (match ? match[1] : alias.trim().slice(-1)).slice(0, 2).toUpperCase();
}
