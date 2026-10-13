import { cx } from '@/components/chat/desktop/runtime';
import { Icon } from '@/components/ui/Icon';
import type { JuryConfig, JuryStatus, JuryTier } from '@/types/jury';
import type { JuryTierProgress, JuryTierRequirement } from '@/types/juryGrowth';
import { useJury } from '../context';
import { formatRate, MEMBERSHIP_LABEL } from '../labels';
import { Card } from '../widgets/Frame';
import { TierInsignia } from './Insignia';
import { normalizeWarnings, percent, tierName, TIER_WARNING_CODES } from './labels';
import { WarningNote } from './WarningNote';

const TIER_ORDER: JuryTier[] = ['trainee', 'regular', 'senior'];

function isRate(requirement: JuryTierRequirement): boolean {
  return requirement.key.endsWith('_rate');
}

function unitOf(requirement: JuryTierRequirement): string {
  return requirement.key === 'days_served' ? '天' : requirement.key === 'votes_settled' ? '票' : '';
}

/** 「9 / 15 票」「78% / 70%」；还没开始计算的写成一道横线 */
function valueText(requirement: JuryTierRequirement): string {
  if (isRate(requirement)) {
    return `${requirement.current === null ? '—' : formatRate(requirement.current)} / ${percent(requirement.target)}`;
  }
  return `${requirement.current ?? '—'} / ${requirement.target} ${unitOf(requirement)}`.trim();
}

/** 还差多少：「还差 6 票」「还差 5 个百分点」。已经满足或还没开始计算时为 null */
function gapText(requirement: JuryTierRequirement): string | null {
  if (requirement.ok || requirement.current === null) {
    return null;
  }
  if (isRate(requirement)) {
    return `还差 ${Math.max(1, Math.round((requirement.target - requirement.current) * 100))} 个百分点`;
  }
  return `还差 ${Math.max(1, Math.ceil(requirement.target - requirement.current))} ${unitOf(requirement)}`.trim();
}

/** 一项晋升条件：名称、现在到哪儿了、一条进度。比率类的进度条是 0–100% 的刻度，目标处有一道标线。 */
export function RequirementRow({ requirement }: { requirement: JuryTierRequirement }): JSX.Element {
  const rate = isRate(requirement);
  const fill = requirement.current === null ? 0 : rate ? requirement.current : requirement.target > 0 ? requirement.current / requirement.target : 0;
  const gap = gapText(requirement);
  return (
    <li className={cx('kjr-req', requirement.ok && 'is-ok')} data-requirement={requirement.key} data-ok={requirement.ok}>
      <span className="kjr-req-mark">{requirement.ok ? <Icon name="check" className="h-3 w-3" /> : null}</span>
      <span className="kjr-req-label">{requirement.label}</span>
      <span className="kjr-req-value">{valueText(requirement)}</span>
      <span className="kjr-req-bar" role="progressbar" aria-label={requirement.label} aria-valuemin={0} aria-valuemax={rate ? 100 : requirement.target} aria-valuenow={requirement.current === null ? 0 : rate ? Math.round(requirement.current * 100) : requirement.current}>
        <i style={{ width: `${Math.min(1, Math.max(0, fill)) * 100}%` }} />
        {rate ? <b style={{ left: `${Math.min(1, Math.max(0, requirement.target)) * 100}%` }} /> : null}
      </span>
      <span className="kjr-req-note">{requirement.note ?? gap ?? (requirement.ok ? '已满足' : '')}</span>
    </li>
  );
}

/** 一个层级的门槛，写成两行小字：「已结 15 票 · 一致率 70%」「在任 14 天」 */
function thresholdLines(config: JuryConfig, tier: JuryTier): string[] {
  const rule = config.tiers.find((item) => item.key === tier)?.requirements;
  if (!rule) {
    return tier === 'trainee' ? ['任命后的起点'] : [];
  }
  return [`已结 ${rule.votes_settled} 票 · 一致率 ${percent(rule.agreement_rate)}`, `在任 ${rule.days_served} 天`];
}

/** 三个层级排成一条路：走过的是实线，当前的那一级放大，后面的是虚线。 */
function TierPath({ config, tier }: { config: JuryConfig; tier: JuryTier | null }): JSX.Element {
  const reached = tier ? TIER_ORDER.indexOf(tier) : -1;
  return (
    <ol className="kjr-tierpath" aria-label="层级">
      {TIER_ORDER.map((item, index) => (
        <li key={item} className={cx(index < reached && 'is-past', index === reached && 'is-current')} aria-current={index === reached ? 'step' : undefined}>
          <TierInsignia tier={item} size={index === reached ? 34 : 26} />
          <span className="kjr-tierpath-name">{tierName(config, item)}</span>
          <span className="kjr-tierpath-rule">{thresholdLines(config, item).map((line) => <span key={line}>{line}</span>)}</span>
        </li>
      ))}
    </ol>
  );
}

/** 层级：现在是哪一级、三级的门槛、离下一级还差什么、什么情况下会降级或被暂停。 */
export function TierCard({ status, progress }: { status: JuryStatus; progress: JuryTierProgress | null }): JSX.Element {
  const { config, identity } = useJury();
  const tier = identity.tier;
  const next = progress?.next_tier ?? null;
  const met = progress ? progress.requirements.filter((item) => item.ok).length : 0;
  // 降级 / 暂停的预警由服务端给（它判断时只看最近的若干张票，客户端手里的累计数字对不上），这里只负责摆出来
  const risks = identity.isJuror ? normalizeWarnings(status.warnings).filter((warning) => TIER_WARNING_CODES.includes(warning.code)) : [];
  const demote = tier ? config.config.tiers.find((item) => item.key === tier)?.demote_below : null;
  // 下一层的降级线：近期一致率低于它时，就算晋升条件都满足也先不升
  const nextGuard = next ? config.config.tiers.find((item) => item.key === next)?.demote_below ?? null : null;

  return (
    <Card title="层级" aside={tier ? <span className="kui-tag kui-tag--ok">{tierName(config.config, tier)}</span> : <span className="kui-tag">{MEMBERSHIP_LABEL[status.status]}</span>} className="kjr-tier">
      <TierPath config={config.config} tier={tier} />
      {risks.map((warning) => <WarningNote key={warning.code} warning={warning} />)}
      {!identity.isJuror ? (
        <p className="kjr-quiet">层级只在任期内计算。{identity.canApply ? '重新成为委员后，会从上一次的记录接着算。' : ''}</p>
      ) : !progress ? (
        <p className="kjr-quiet">晋升进度暂时没有拿到。</p>
      ) : next ? (
        <>
          <h3 className="kjr-h" data-tier-next={next}>晋升{tierName(config.config, next)}<span>已满足 {met} / {progress.requirements.length} 项</span></h3>
          <ul className="kjr-reqs2">{progress.requirements.map((item) => <RequirementRow key={item.key} requirement={item} />)}</ul>
          {met === progress.requirements.length && progress.requirements.length > 0 ? (
            // 各项都满足却还没晋升：晋升时还要看近期的一致率是否站得住新层级的降级线，这一项不在上面的列表里
            <p className="kui-note" data-tier-all-met>
              上面几项都满足了。晋升在每次有票出结论时检查，
              {nextGuard
                ? `另外还要求近期的一致率保持在 ${percent(nextGuard.agreement_rate)} 以上（最近 ${nextGuard.window} 张已出结论的票）—— 这是${tierName(config.config, next)}的降级线，免得刚升上去又降下来。如果一直没有晋升，就是这一项还差一点。`
                : '另外还要求近期的一致率保持稳定。如果一直没有晋升，就是近期的一致率还差一点。'}
            </p>
          ) : <p className="kjr-quiet">每次有票出结论时系统自动检查，条件全部满足就晋升，不需要申请。</p>}
        </>
      ) : (
        <>
          <h3 className="kjr-h" data-tier-next="none">已是最高层级</h3>
          {progress.requirements.length > 0 ? <ul className="kjr-reqs2">{progress.requirements.map((item) => <RequirementRow key={item.key} requirement={item} />)}</ul> : null}
          <p className="kjr-quiet">资深委员负责更难的案件：没有共识的案件合议，以及对处罚的申诉复审。</p>
        </>
      )}
      {identity.isJuror && demote ? (
        <p className="kjr-quiet">降级只看一致率，不看数量：最近 {demote.window} 张已出结论的票（不足 {demote.min_votes} 张不判断）一致率低于 {percent(demote.agreement_rate)}，降为{tierName(config.config, demote.to)}。</p>
      ) : null}
    </Card>
  );
}

/** 总览「我的身份」里的一小块：层级徽记、离下一级还差几项、没满足的那几项。 */
export function TierProgressCompact({ progress, tier }: { progress: JuryTierProgress; tier: JuryTier }): JSX.Element {
  const { config, nav } = useJury();
  const met = progress.requirements.filter((item) => item.ok).length;
  const open = progress.requirements.filter((item) => !item.ok);
  return (
    <button type="button" className="kjr-tiermini" data-action="open-growth" onClick={() => nav.goSection('mine', { tab: 'growth' })}>
      <TierInsignia tier={tier} size={30} />
      <span className="kjr-tiermini-main">
        <span className="kjr-tiermini-title">{progress.next_tier ? `距离${tierName(config.config, progress.next_tier)}` : '已是最高层级'}{progress.next_tier ? <b>{met} / {progress.requirements.length} 项</b> : null}</span>
        {progress.next_tier ? (
          <span className="kjr-tiermini-dots" aria-hidden="true">{progress.requirements.map((item) => <i key={item.key} className={item.ok ? 'is-on' : undefined} />)}</span>
        ) : null}
        <span className="kjr-tiermini-text">{!progress.next_tier ? '保持一致率就不会降级' : open.length === 0 ? '条件都满足了，近期一致率站得住就会晋升' : open.map((item) => `${item.label} ${valueText(item)}`).join(' · ')}</span>
      </span>
      <Icon name="chevron" className="h-4 w-4" />
    </button>
  );
}
