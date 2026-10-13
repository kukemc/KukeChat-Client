import type { JuryConfig, JuryTier, JuryVoteOption } from '@/types/jury';
import type { JuryBallot, JuryRestriction, JuryStandardAnswer, JuryWarning } from '@/types/juryGrowth';
import { parseApiDate } from '@/utils/dateTime';
import { formatDateTime, LEVEL_NAME, OUTCOME_LABEL, TIER_LABEL } from '../labels';

// 二期板块（考试、练习场、成长、排行榜）共用的文字和写法。

/** 风纪值事件的名称。明细和投票响应里服务端会给 label，这里只在实时事件（只有 kind）时用。 */
export const POINT_KIND_LABEL: Record<string, string> = {
  vote_agreed: '判断与结论一致',
  vote_disagreed: '参与了已定案的评审',
  quality_correct: '质控题答对',
  quality_wrong: '质控题答错',
  daily_first: '今日首票',
  streak_7: '连续参与 7 天',
  opinion_liked: '观点获得认可',
  exam_passed: '通过入门考试',
  overturn_adjust: '案件改判后调整',
  // 三期（docs/jury-v2.md 第 3 节）：资深合议和申诉复审 / 举报复议
  panel_agreed: '合议与结论一致',
  panel_disagreed: '参与了已定案的合议',
  review_vote: '参与复审'
};

export function pointKindLabel(kind: string, fallback?: string | null): string {
  return fallback || POINT_KIND_LABEL[kind] || '风纪值变动';
}

/** +10 / −5 / 0。负号用真正的减号，和加号等宽 */
export function signed(points: number): string {
  return points > 0 ? `+${points}` : points < 0 ? `−${Math.abs(points)}` : '0';
}

/** 倒计时：59:07；超过一小时写成 1:02:07；到点之后是 0:00 */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const tail = `${String(minutes).padStart(hours > 0 ? 2 : 1, '0')}:${String(seconds).padStart(2, '0')}`;
  return hours > 0 ? `${hours}:${tail}` : tail;
}

/** 层级的全称：优先用配置里的（「见习委员」），没有就自己拼 */
export function tierName(config: JuryConfig, tier: JuryTier): string {
  return config.tiers.find((item) => item.key === tier)?.label ?? `${TIER_LABEL[tier] ?? tier}委员`;
}

/** 考试和练习里能选的四个判断：配置里种类是「不违规 / 违规」的那几项 */
export function ballotOptions(config: JuryConfig): JuryVoteOption[] {
  return config.votes.filter((option) => option.kind === 'clean' || option.kind === 'violation');
}

/** 这个判断在「违规 / 不违规」上是哪一边。考试和练习只按这个算对错 */
export function ballotOutcome(vote: JuryBallot): 'clean' | 'violation' {
  return vote === 'none' ? 'clean' : 'violation';
}

/** 标准结论对应的那个选项值：不违规 → none，违规 L2 → l2 */
export function answerBallot(answer: JuryStandardAnswer): string {
  return answer.outcome === 'clean' ? 'none' : `l${answer.level ?? ''}`;
}

/** 标准结论写成一句：「违规 · 一般 · 辱骂骚扰」 */
export function answerText(answer: JuryStandardAnswer): string {
  if (answer.outcome === 'clean') {
    return OUTCOME_LABEL.clean;
  }
  return [OUTCOME_LABEL.violation, answer.level ? LEVEL_NAME[answer.level] ?? `L${answer.level}` : null, answer.category_label].filter(Boolean).join(' · ');
}

/** 受限的原因写成人话 */
export function restrictionReason(restriction: JuryRestriction): string {
  return restriction.reason === 'banned' ? '账号正在被封禁' : restriction.reason === 'muted' ? '账号正在被禁言' : '账号有生效中的处罚';
}

export function restrictionUntil(restriction: JuryRestriction): string {
  return restriction.until ? `到 ${formatDateTime(restriction.until)} 结束` : '没有固定的结束时间';
}

/**
 * 评审、练习、回避这三个上限按「最近 24 小时滚动」计算，不是自然日：不会在零点整恢复，
 * 而是最早的那一次满 24 小时后腾出一个名额。界面上不写「今天 / 明天」，接口没给恢复时间也不承诺具体时刻。
 * （每日首票、连续天数、排行榜才是按 UTC+8 的自然日。）
 */
export const ROLLING_HINT = '按最近 24 小时滚动计算，不在零点清零：最早的一次满 24 小时后恢复一个名额';

/**
 * 下一个名额什么时候释放：「今天 14:32 恢复一个名额」「明天 09:05 恢复一个名额」。
 * 值来自 /jury/me 的 daily_resets_at / recuse_resets_at、练习场的 resets_at、以及 429 的 detail.resets_at。
 * 后端没给、解析不了、或者时间已经过了（名额其实已经回来了）时返回 null，调用方退回「满 24 小时后恢复」的写法。
 */
export function slotResetText(value: string | null | undefined, now: number = Date.now()): string | null {
  const date = parseApiDate(value);
  if (!date || date.getTime() <= now) {
    return null;
  }
  const dayStart = (time: Date): number => new Date(time.getFullYear(), time.getMonth(), time.getDate()).getTime();
  const days = Math.round((dayStart(date) - dayStart(new Date(now))) / 86_400_000);
  const day = days === 0 ? '今天' : days === 1 ? '明天' : `${date.getMonth() + 1} 月 ${date.getDate()} 日`;
  const clock = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  return `${day} ${clock} 恢复一个名额`;
}

/** 和层级有关的预警：放在层级卡片里，挨着晋升进度 */
export const TIER_WARNING_CODES = ['demote_risk', 'suspend_risk'];

/**
 * /jury/me.warnings。每项是 { code, message, current, threshold, sample }；
 * 早期的形状是一串字符串，这里一并认，免得旧数据把界面弄坏。
 */
export function normalizeWarnings(raw: unknown): JuryWarning[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const warnings: JuryWarning[] = [];
  for (const item of raw as unknown[]) {
    if (typeof item === 'string' && item) {
      warnings.push({ code: item, message: item });
    } else if (typeof item === 'object' && item !== null) {
      const warning = item as Partial<JuryWarning>;
      if (typeof warning.message === 'string' && warning.message) {
        warnings.push({ ...warning, code: typeof warning.code === 'string' ? warning.code : warning.message, message: warning.message });
      }
    }
  }
  return warnings;
}

/** 预警里的数：服务端判断时用的值、对照的线、样本数。0–1 之间的按比率写，其余原样。没有数时为 null */
export function warningFacts(warning: JuryWarning): string | null {
  // 保留一位小数：服务端那句话里的百分数是它自己取整的（62.5% 写成 62%），这里再四舍五入一次会变成 63%，两个数对不上
  const number = (value: number): string => {
    if (value < 0 || value > 1) return String(value);
    const pct = Math.round(value * 1000) / 10;
    return `${Number.isInteger(pct) ? pct : pct.toFixed(1)}%`;
  };
  const parts = [
    typeof warning.current === 'number' ? `当前 ${number(warning.current)}` : null,
    typeof warning.threshold === 'number' ? `界线 ${number(warning.threshold)}` : null,
    typeof warning.sample === 'number' ? `按最近 ${warning.sample} 张票` : null
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** 比率目标：0.7 → 70% */
export function percent(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}
