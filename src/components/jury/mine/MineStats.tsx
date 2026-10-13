import type { JuryMyStats, JuryStats } from '@/types/jury';
import { formatDay, formatRate } from '../labels';
import { DayBars, Ring, Stat } from '../widgets/Charts';
import { Card } from '../widgets/Frame';

/** 个人统计。full 是新接口给的（带弃权率和近 30 天趋势）；没有时退回 /jury/me 里的那几个数字。 */
export function MineStats({ basic, full }: { basic: JuryStats | null; full: JuryMyStats | undefined }): JSX.Element | null {
  const stats = full ?? basic;
  if (!stats) {
    return null;
  }
  // 分母为 0 时接口给的比率是 0 而不是 null：有没有数据要看分母，不能把「0%」当成成绩显示出来
  const agreementRate = stats.votes_settled > 0 ? stats.agreement_rate : null;
  const goldenRate = stats.golden_total > 0 ? full?.golden_rate ?? stats.golden_correct / stats.golden_total : null;
  const abstainRate = full && full.votes_total > 0 ? full.abstain_rate : null;
  const trend = full?.trend ?? [];
  const votes30 = trend.reduce((sum, day) => sum + day.votes, 0);

  return (
    <Card title="我的数据" aside={full ? <span className="kjr-meta">发表观点 {full.opinions_total} 条 · 获得赞同 {full.likes_received} 次</span> : undefined} className="kjr-mystats">
      <div className="kjr-stats">
        <Stat label="累计投票" value={stats.votes_total} unit="票" hint={`其中 ${stats.votes_settled} 票所在的案件已定案`} />
        <div className="kjr-stat kjr-stat--ring">
          <Ring value={agreementRate} />
          <span className="kjr-stat-label">与结论一致</span>
          <span className="kjr-stat-hint">{stats.votes_settled > 0 ? `${stats.votes_agreed} / ${stats.votes_settled} 票` : '还没有已定案的票'}</span>
        </div>
        <Stat label="质控题" value={stats.golden_total > 0 ? `${stats.golden_correct}/${stats.golden_total}` : '—'} hint={stats.golden_total > 0 ? `正确率 ${formatRate(goldenRate)}` : '还没有遇到质控题'} />
        {full ? <Stat label="弃权率" value={formatRate(abstainRate)} hint={full.votes_total > 0 ? `弃权 ${full.abstain_total} 票` : '还没有投过票'} /> : null}
      </div>
      {trend.length > 1 ? (
        <>
          <div className="kjr-card-sep" />
          <p className="kjr-sub kjr-sub--lead">近 {trend.length} 天 · 投了 {votes30} 票</p>
          {votes30 > 0 ? (
            <DayBars
              label="近 30 天每天的投票数"
              // 口径：votes 含质控题，settled / agreed 只算普通案件
              bars={trend.map((day) => ({ value: day.votes, part: Math.min(day.agreed, day.votes), title: `${day.date}：投 ${day.votes} 票（含质控题）；普通案件里已定案 ${day.settled} 票，其中与结论一致 ${day.agreed} 票` }))}
              startLabel={formatDay(trend[0].date)}
              endLabel={formatDay(trend[trend.length - 1].date)}
              legend={[{ tone: 'full', text: '当天投票（含质控题）' }, { tone: 'part', text: '普通案件里已定案且一致' }]}
            />
          ) : <p className="kjr-quiet">这段时间没有投票。</p>}
        </>
      ) : null}
    </Card>
  );
}
