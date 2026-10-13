import { cx } from '@/components/chat/desktop/runtime';
import type { JuryCaseKind, JuryCaseStage, JuryOutcome, JuryTally, JuryTier, JuryVote } from '@/types/jury';
import { KIND_LABEL, LEVEL_NAME, OUTCOME_LABEL, STAGE_LABEL, TIER_LABEL, VOTE_ORDER, VOTE_SHORT, voteLabel } from '../labels';
import { SplitBar } from './Charts';

// 状态标签：票、结论、层级、案件类型、阶段。全页面统一用这几个，颜色含义才一致：
// 绿 = 不违规 / 一致，红 = 违规 / 不一致，黄 = 进行中、待处理，灰 = 中性。

const VOTE_TONE: Record<JuryVote, string> = { none: 'kui-tag--ok', l1: 'kui-tag--warn', l2: 'kui-tag--danger', l3: 'kui-tag--danger', abstain: '', need_context: '', recuse: '' };

export function VoteTag({ vote, short = false }: { vote: JuryVote; short?: boolean }): JSX.Element {
  return <span className={cx('kui-tag', VOTE_TONE[vote] ?? '')}>{voteLabel(vote, short)}</span>;
}

/**
 * 结论。未结时显示阶段（委员评审中 / 等待管理员 …）。
 * 改判过的案件，outcome 已经是改判后的新结论，所以写成「改判为 + 结论」：
 * 只挂一个「已改判」在后面，看不出前面那个结论是改判前的还是改判后的。
 */
export function OutcomeTag({ outcome, level, stage, overturned = false }: { outcome: JuryOutcome | null | undefined; level?: number | null; stage?: JuryCaseStage; overturned?: boolean }): JSX.Element {
  if (!outcome) {
    return <span className="kui-tag kui-tag--warn">{stage && stage !== 'closed' ? STAGE_LABEL[stage] : '尚未定案'}</span>;
  }
  return (
    <>
      {overturned ? <span className="kui-tag kui-tag--warn" data-overturned>改判为</span> : null}
      <span className={cx('kui-tag', outcome === 'violation' ? 'kui-tag--danger' : 'kui-tag--ok')}>{OUTCOME_LABEL[outcome]}{outcome === 'violation' && level ? ` · ${LEVEL_NAME[level] ?? `L${level}`}` : ''}</span>
    </>
  );
}

export function AgreeTag({ agreed }: { agreed: boolean | null | undefined }): JSX.Element | null {
  if (agreed === null || agreed === undefined) {
    return null;
  }
  return <span className={cx('kui-tag', agreed ? 'kui-tag--ok' : 'kui-tag--danger')}>{agreed ? '与结论一致' : '与结论不一致'}</span>;
}

/** 层级标识。后端还没有层级（null）时不显示。 */
export function TierTag({ tier }: { tier: JuryTier | null | undefined }): JSX.Element | null {
  return tier ? <span className={cx('kui-tag', tier === 'senior' && 'kui-tag--accent')}>{TIER_LABEL[tier] ?? tier}</span> : null;
}

export function KindTag({ kind }: { kind: JuryCaseKind }): JSX.Element {
  return <span className="kui-tag">{KIND_LABEL[kind] ?? kind}</span>;
}

/** 各选项的票数分布。定案前服务端不给分布（tally 为 null），调用方改为显示「已有 N 票」。 */
export function TallyBar({ tally, compact = false }: { tally: JuryTally; compact?: boolean }): JSX.Element {
  const parts = VOTE_ORDER.map((vote) => ({ key: vote as string, label: VOTE_SHORT[vote], value: tally[vote] ?? 0, tone: vote as string }));
  // 二期：「上下文不足」单列一段，没有这种票时不占图例
  if (tally.need_context) {
    parts.push({ key: 'need_context', label: VOTE_SHORT.need_context, value: tally.need_context, tone: 'context' });
  }
  return <SplitBar label="票数分布" compact={compact} emptyText="没有票" parts={parts} />;
}
