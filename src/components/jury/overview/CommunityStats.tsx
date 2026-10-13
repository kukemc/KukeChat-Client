import type { JuryOverview } from '@/types/jury';
import { useJury } from '../context';
import { errorText, isUnavailable, useJuryOverview } from '../data/queries';
import { formatDateTime, formatHours, TIER_LABEL } from '../labels';
import { Ring, SplitBar, Stat } from '../widgets/Charts';
import { Card, Loading, LoadError, NotOpenYet } from '../widgets/Frame';
import { DailyTrend } from './DailyTrend';

function tierBreakdown(jurors: JuryOverview['jurors']): string | null {
  const parts = (['trainee', 'regular', 'senior'] as const).filter((tier) => (jurors[tier] ?? 0) > 0).map((tier) => `${TIER_LABEL[tier]} ${jurors[tier]}`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

function Headline({ overview }: { overview: JuryOverview }): JSX.Element {
  return (
    <div className="kjr-stats">
      <Stat label="在任委员" value={overview.jurors.total} unit="人" hint={tierBreakdown(overview.jurors) ?? (overview.jurors.total === 0 ? '还没有人被任命' : undefined)} />
      <Stat label="等待评审" value={overview.backlog.jury} unit="件" hint={overview.backlog.panel > 0 ? `另有 ${overview.backlog.panel} 件在资深合议` : overview.backlog.jury === 0 ? '队列是空的' : undefined} />
      <Stat label="近 7 天定案" value={overview.settled.d7} unit="件" />
      <Stat label="近 30 天定案" value={overview.settled.d30} unit="件" hint={`累计 ${overview.settled.total} 件`} />
    </div>
  );
}

/** 窗口期里案件的去向和结论。样本不够时只列件数，不算比例。 */
function WindowBreakdown({ overview, minSample }: { overview: JuryOverview; minSample: number }): JSX.Element {
  const { counts } = overview;
  if (overview.sample === 0) {
    return (
      <p className="kjr-quiet">
        近 {overview.window_days} 天还没有案件走完评审流程。{overview.jurors.total === 0 ? '风纪委员会刚刚成立，被举报的内容目前仍由管理员处理；有了第一批委员之后，这里会开始出现数字。' : '有案件定案或转出后，这里会开始出现数字。'}
      </p>
    );
  }
  return (
    <>
      <div className="kjr-breakdown">
        <div>
          <p className="kjr-sub">案件去向</p>
          <SplitBar label="案件去向" parts={[{ key: 'consensus', label: '委员定案', value: counts.consensus, tone: 'accent' }, { key: 'escalated', label: '转管理员', value: counts.escalated, tone: 'abstain' }]} />
        </div>
        <div>
          <p className="kjr-sub">定案结论</p>
          <SplitBar label="定案结论" parts={[{ key: 'violation', label: '违规', value: counts.violation, tone: 'l2' }, { key: 'clean', label: '不违规', value: counts.clean, tone: 'none' }]} />
        </div>
      </div>
      {overview.sample_enough ? (
        <div className="kjr-rates">
          <div><Ring value={overview.consensus_rate} /><p><b>共识率</b>委员自己定案、没有转给管理员的比例</p></div>
          <div><Ring value={overview.violation_rate} /><p><b>违规率</b>定案里认定违规的比例</p></div>
          <div><Ring value={overview.overturn_rate} /><p><b>改判率</b>定案后被管理员改判的比例{counts.overturned > 0 ? `（${counts.overturned} 件）` : ''}</p></div>
          <div><strong className="kjr-rates-num">{formatHours(overview.median_hours)}</strong><p><b>中位用时</b>从举报到定案</p></div>
        </div>
      ) : (
        <p className="kui-note">
          样本还少（{overview.sample} 件，满 {minSample} 件才计算比例），先只列件数。
          {overview.median_hours !== null ? `目前定案的中位用时是 ${formatHours(overview.median_hours)}。` : ''}
          {counts.overturned > 0 ? `其中 ${counts.overturned} 件定案后被改判。` : ''}
        </p>
      )}
    </>
  );
}

/** 总览里的社区数字。接口在旧后端上不存在时显示「尚未开放」，不影响旁边的「我的身份」。 */
export function CommunityStats(): JSX.Element {
  const { config } = useJury();
  const enabled = config.has('overview');
  const query = useJuryOverview(enabled);
  const overview = query.data;
  const title = '社区概况';

  if (config.loading || (enabled && query.isLoading)) {
    return <Card title={title}><Loading compact /></Card>;
  }
  if (!enabled || (!overview && isUnavailable(query.error))) {
    return <Card title={title}><NotOpenYet what="社区数据" compact /></Card>;
  }
  if (!overview) {
    return <Card title={title}><LoadError compact message={errorText(query.error, '社区数据加载失败，请稍后再试。')} onRetry={() => void query.refetch()} /></Card>;
  }
  return (
    <Card title={title} aside={<span className="kjr-meta">更新于 {formatDateTime(overview.generated_at)}</span>} className="kjr-community">
      <Headline overview={overview} />
      <div className="kjr-card-sep" />
      <p className="kjr-sub kjr-sub--lead">近 {overview.window_days} 天 · {overview.sample} 件案件离开委员队列</p>
      <WindowBreakdown overview={overview} minSample={config.config.rules.min_sample} />
      {/* 每天的趋势：早期的后端没有 daily 这个字段，那就不显示这一块 */}
      {overview.daily && overview.daily.length > 0 ? <><div className="kjr-card-sep" /><DailyTrend daily={overview.daily} /></> : null}
    </Card>
  );
}
