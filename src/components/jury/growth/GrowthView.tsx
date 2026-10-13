import type { JuryStatus } from '@/types/jury';
import { useJury } from '../context';
import { formatDateTime, formatRemaining } from '../labels';
import { Achievements } from './Achievements';
import { BadgeSetting } from './BadgeSetting';
import { normalizeWarnings, restrictionReason, restrictionUntil, TIER_WARNING_CODES } from './labels';
import { WarningNote } from './WarningNote';
import { PointsLedger, PointsSummary } from './PointsCards';
import { TierCard } from './TierCard';

/**
 * 需要委员马上知道的事：受限、被暂停发案、服务端给的预警。总览、成长页共用这一组，写法一致。
 * scope 为 'standing' 时不含和层级有关的预警（降级 / 暂停风险）—— 成长页里它们放在层级卡片上。
 */
export function StandingNotices({ status, scope = 'all' }: { status: JuryStatus; scope?: 'all' | 'standing' }): JSX.Element | null {
  const { identity } = useJury();
  const warnings = normalizeWarnings(status.warnings).filter((warning) => scope === 'all' || !TIER_WARNING_CODES.includes(warning.code));
  if (!identity.restriction && !identity.cooldownUntil && warnings.length === 0) {
    return null;
  }
  const wait = formatRemaining(identity.cooldownUntil);
  return (
    <div className="kjr-notices">
      {identity.restriction ? <p className="kui-note kui-note--danger" role="status" data-notice="restriction">{restrictionReason(identity.restriction)}，{restrictionUntil(identity.restriction)}。这期间不能评审、发表观点和点赞；投过的案件仍然可以回看。</p> : null}
      {identity.cooldownUntil ? <p className="kui-note kui-note--warn" role="status" data-notice="cooldown">最近的票里弃权太多，暂时不给你发新案件，{formatDateTime(identity.cooldownUntil)} 恢复{wait ? `（还有 ${wait}）` : ''}。</p> : null}
      {warnings.map((warning) => <WarningNote key={warning.code} warning={warning} />)}
    </div>
  );
}

/**
 * 「我的评审」里的成长视图：层级与晋升进度、风纪值、成就、明细、公开身份的设置。
 * 每一块各看各的能力（tiers / points / achievements / badge）：后端只上了其中几项时，没有的那几块不出现、也不发请求。
 */
export function GrowthView({ status }: { status: JuryStatus }): JSX.Element {
  const { config } = useJury();
  const hasTiers = config.has('tiers');
  const hasPoints = config.has('points');
  return (
    <>
      {/* 有层级卡片时，降级 / 暂停的预警放在卡片上，这里只留其余的 */}
      <StandingNotices status={status} scope={hasTiers ? 'standing' : 'all'} />
      {hasTiers || hasPoints ? (
        <div className={hasTiers && hasPoints ? 'kjr-growth-top' : undefined}>
          {hasTiers ? <TierCard status={status} progress={status.tier_progress ?? null} /> : null}
          {hasPoints ? <PointsSummary status={status} /> : null}
        </div>
      ) : null}
      {config.has('achievements') ? <Achievements enabled /> : null}
      {hasPoints ? <PointsLedger enabled /> : null}
      {config.has('badge') ? <BadgeSetting status={status} /> : null}
    </>
  );
}
