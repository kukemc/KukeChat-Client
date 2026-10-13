import type { JuryOverview } from '@/types/jury';
import { formatDay } from '../labels';

type Daily = NonNullable<JuryOverview['daily']>;

/** 窗口里至少有这么多天有数，才值得画成趋势图 */
const MIN_ACTIVE_DAYS = 4;

/** 一条序列画成折线：横向铺满 0–100，纵向留一点顶边，线不会被裁掉 */
function linePath(daily: Daily, key: 'queued' | 'settled', max: number): string {
  const last = Math.max(1, daily.length - 1);
  return daily.map((day, index) => `${index === 0 ? 'M' : 'L'}${((index / last) * 100).toFixed(2)} ${(96 - (day[key] / max) * 90).toFixed(2)}`).join(' ');
}

/**
 * 近 30 天每天「新进委员队列」和「定案」的案件数，两条折线叠在一张小图上。
 * 数字很小（一天几件），所以只标峰值，不画刻度；悬停某一天能看到具体数字。
 * 全是 0 的时候不画一条贴底的平线装样子，只给一句说明。
 */
export function DailyTrend({ daily }: { daily: Daily }): JSX.Element | null {
  if (daily.length === 0) {
    return null;
  }
  const queued = daily.reduce((sum, day) => sum + day.queued, 0);
  const settled = daily.reduce((sum, day) => sum + day.settled, 0);
  if (queued === 0 && settled === 0) {
    return <p className="kjr-quiet" data-trend="zero">近 {daily.length} 天没有案件进入委员队列，也没有定案，所以暂时没有趋势可看。</p>;
  }
  // 只有零星几天有数：画出来是一条平线上冒一个尖，说明不了趋势，直接把数字说出来
  const activeDays = daily.filter((day) => day.queued + day.settled > 0).length;
  if (activeDays < MIN_ACTIVE_DAYS) {
    return <p className="kjr-quiet" data-trend="sparse">近 {daily.length} 天有 {queued} 件案件进入委员队列{settled > 0 ? `，定案 ${settled} 件` : '，还没有定案'}。数量还太少，等案件多起来这里会画出每天的趋势。</p>;
  }
  const max = Math.max(...daily.map((day) => Math.max(day.queued, day.settled)), 1);
  const settledLine = linePath(daily, 'settled', max);
  return (
    <figure className="kjr-trend" data-trend="chart" aria-label={`近 ${daily.length} 天每天新进队列和定案的案件数：共新进 ${queued} 件，定案 ${settled} 件`}>
      <p className="kjr-sub kjr-sub--lead">近 {daily.length} 天 · 每天进入队列和定案的案件<span className="kjr-trend-peak">单日最多 {max} 件</span></p>
      <div className="kjr-trend-plot">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {/* 整段都是 0 的那条序列不画：一条贴底的平线没有信息，图例里的 0 已经说明了 */}
          {settled > 0 ? <path className="kjr-trend-area" d={`${settledLine} L100 100 L0 100 Z`} /> : null}
          {queued > 0 ? <path className="kjr-trend-line is-queued" d={linePath(daily, 'queued', max)} /> : null}
          {settled > 0 ? <path className="kjr-trend-line is-settled" d={settledLine} /> : null}
        </svg>
        <div className="kjr-trend-cols">
          {daily.map((day) => <span key={day.date} title={`${day.date}：新进队列 ${day.queued} 件，定案 ${day.settled} 件`} />)}
        </div>
      </div>
      <figcaption className="kjr-bars-axis">
        <span>{formatDay(daily[0].date)}</span>
        <span className="kjr-trend-legend">
          <span><i className="is-queued" />新进队列 <b>{queued}</b></span>
          <span><i className="is-settled" />定案 <b>{settled}</b></span>
        </span>
        <span>{formatDay(daily[daily.length - 1].date)}</span>
      </figcaption>
    </figure>
  );
}
