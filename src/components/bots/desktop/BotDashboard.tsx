import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import type { BotDashboard as BotDashboardData, BotDashboardInstallation, BotDashboardMetrics, BotDashboardRatingBucket, BotDashboardTrendPoint } from '@/types/api';
import { parseBotCommands } from '@/utils/botCommands';
import { parseApiDate } from '@/utils/dateTime';
import { useBotDashboard } from '../botQueries';
import { botUser, errorMessage, formatCount, nonEmptyLines, ratingLabel } from '../botShared';
import { BotTags, Card, PaneState, StatStrip, type BotActions } from './botUi';

interface BotDashboardProps {
  botId: number;
  actions: BotActions;
  onBack: () => void;
}

function shortDate(value?: string): string {
  if (!value) {
    return '未知';
  }
  const date = parseApiDate(value);
  return !date ? '未知' : date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
}

function todayText(today: number, total: number): string {
  return total ? `今日 ${formatCount(today)} 条` : '今日暂无新增';
}

/** 健康度是前端按安装量、消息量和评分折算的参考分，不是服务端给的指标。 */
function getHealth(metrics: BotDashboardMetrics): { score: number; label: string; text: string } {
  const installScore = Math.min(34, metrics.active_installs * 6);
  const activityScore = Math.min(38, Math.floor((metrics.total_sent_messages + metrics.total_received_messages) / 12));
  const ratingScore = metrics.rating_average ? Math.round((metrics.rating_average / 5) * 28) : 0;
  const score = Math.min(100, installScore + activityScore + ratingScore);
  if (score >= 85) return { score, label: '优秀', text: '安装、活跃与口碑表现健康。' };
  if (score >= 60) return { score, label: '稳定', text: '运行稳定，可以继续提升安装转化。' };
  if (score >= 30) return { score, label: '起步', text: '建议完善介绍和指令说明。' };
  return { score, label: '待启动', text: '数据还少，适合先做功能验证。' };
}

/** 纵轴刻度：步长取 1 / 2 / 5 × 10ⁿ，分成三四格，最上面一格不小于最大值。 */
function axisTicks(max: number): number[] {
  const rough = Math.max(1, max) / 3;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = Math.max(1, [1, 2, 5, 10].map((factor) => factor * power).find((value) => value >= rough) ?? 10 * power);
  const top = Math.ceil(Math.max(1, max) / step) * step;
  const ticks: number[] = [];
  for (let value = top; value >= 0; value -= step) {
    ticks.push(value);
  }
  return ticks;
}

/** 近 7 天的收发量：每天两根柱子，共用一条纵轴。悬停或聚焦到某一天时浮出具体数字。 */
function TrendChart({ trend }: { trend: BotDashboardTrendPoint[] }): JSX.Element {
  const ticks = axisTicks(Math.max(0, ...trend.map((point) => Math.max(point.sent, point.received))));
  const top = ticks[0];
  return (
    <Card title="近 7 天消息" aside={<span className="kcb-legend"><i className="is-sent" />发送<i className="is-received" />接收</span>}>
      {trend.length > 0 ? (
        <div className="kcb-chart">
          <div className="kcb-chart-axis" aria-hidden="true">{ticks.map((tick) => <span key={tick}>{formatCount(tick)}</span>)}</div>
          <div className="kcb-chart-plot">
            <div className="kcb-chart-grid" aria-hidden="true">{ticks.map((tick) => <i key={tick} />)}</div>
            {trend.map((point) => (
              <div key={point.date} className="kcb-chart-day" tabIndex={0} aria-label={`${shortDate(point.date)}：发送 ${point.sent} 条，接收 ${point.received} 条`}>
                <div className="kcb-chart-bars">
                  <i className="is-sent" style={{ height: `${(point.sent / top) * 100}%` }} />
                  <i className="is-received" style={{ height: `${(point.received / top) * 100}%` }} />
                </div>
                <span className="kcb-chart-date">{shortDate(point.date)}</span>
                <div className="kcb-chart-tip" role="tooltip">
                  <strong>{shortDate(point.date)}</strong>
                  <span><i className="is-sent" />发送<b>{point.sent.toLocaleString('zh-CN')}</b></span>
                  <span><i className="is-received" />接收<b>{point.received.toLocaleString('zh-CN')}</b></span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : <p className="kcb-card-empty">还没有消息数据</p>}
      <p className="kcb-card-foot">按自然日统计机器人发出的消息和它收到的群消息。</p>
    </Card>
  );
}

function RatingBars({ buckets }: { buckets: BotDashboardRatingBucket[] }): JSX.Element {
  // 还没有任何评价时只列前五档，免得一长串空条
  const rows = buckets.some((bucket) => bucket.count > 0) ? buckets : buckets.slice(0, 5);
  const max = Math.max(1, ...rows.map((bucket) => bucket.count));
  return (
    <Card title="评分分布">
      {rows.length > 0 ? (
        <div className="kcb-bars">
          {rows.map((bucket) => (
            <div key={bucket.rating} className={bucket.count ? undefined : 'is-zero'}>
              <span>{ratingLabel(bucket.rating)} 星</span>
              <span className="kcb-bars-track"><i style={{ width: `${(bucket.count / max) * 100}%` }} /></span>
              <b>{bucket.count}</b>
            </div>
          ))}
        </div>
      ) : <p className="kcb-card-empty">还没有评价</p>}
      <p className="kcb-card-foot">只统计通过审核的评价。</p>
    </Card>
  );
}

function Installations({ installations }: { installations: BotDashboardInstallation[] }): JSX.Element {
  return (
    <Card title="安装的群" aside={<span>{installations.length}</span>}>
      {installations.length > 0 ? (
        <div className="kcb-table-wrap kui-scroll">
          <table className="kcb-table">
            <thead><tr><th>群聊</th><th>状态</th><th>成员</th><th>发送</th><th>接收</th><th>更新</th></tr></thead>
            <tbody>
              {installations.map((item) => (
                <tr key={item.conversation_id}>
                  <td>
                    <span className="kcb-table-group">
                      <Avatar label={item.title} avatarUrl={item.avatar_url} toneKey={item.conversation_id} size="sm" />
                      <span>
                        <span className="kcb-clip">{item.title}</span>
                        <small className="kcb-clip">接收消息{item.receive_messages ? '开' : '关'} · 成员事件{item.receive_member_events ? '开' : '关'}</small>
                      </span>
                    </span>
                  </td>
                  <td><span className={item.enabled ? 'kui-tag kui-tag--ok' : 'kui-tag'}>{item.enabled ? '启用' : '停用'}</span></td>
                  <td>{formatCount(item.member_count)}</td>
                  <td>{formatCount(item.sent_messages)}</td>
                  <td>{formatCount(item.received_messages)}</td>
                  <td>{shortDate(item.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="kcb-card-empty">还没有安装到任何群聊</p>}
    </Card>
  );
}

function Content({ dashboard }: { dashboard: BotDashboardData }): JSX.Element {
  const { metrics } = dashboard;
  const health = getHealth(metrics);
  // 收到的远多于发出的：多半是有消息没被处理到
  const underResponding = metrics.total_received_messages > metrics.total_sent_messages * 3;
  return (
    <div className="kcb-page">
      <Card className="kcb-card--flush">
        <StatStrip items={[
          { label: '发送消息', value: formatCount(metrics.total_sent_messages), detail: todayText(metrics.today_sent_messages, metrics.total_sent_messages) },
          { label: '接收消息', value: formatCount(metrics.total_received_messages), detail: todayText(metrics.today_received_messages, metrics.total_received_messages) },
          { label: '安装群聊', value: formatCount(metrics.installed_groups), detail: `${formatCount(metrics.active_installs)} 启用 · ${formatCount(metrics.disabled_installs)} 停用` },
          { label: '覆盖人数', value: formatCount(metrics.total_members_reached), detail: `来自 ${formatCount(metrics.active_installs)} 个群` },
          { label: '评分', value: metrics.rating_average ? metrics.rating_average.toFixed(1) : '暂无', detail: `${formatCount(metrics.review_count)} 评价 · ${formatCount(metrics.reaction_count)} 表情` },
          { label: '健康度', value: String(health.score), detail: health.label }
        ]} />
      </Card>

      <div className="kcb-page--split">
        <div className="kcb-page-main">
          <TrendChart trend={dashboard.trend} />
          <Installations installations={dashboard.installations} />
        </div>
        <aside className="kcb-page-aside">
          <Card title="运行状态" aside={<span>{health.score}/100</span>}>
            <p className="kcb-health">{health.label}</p>
            <div className="kcb-meter" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={health.score} aria-label="综合健康度"><i style={{ width: `${health.score}%` }} /></div>
            <p className="kcb-card-foot">{health.text}健康度按安装、消息量和评分折算，只作参考。</p>
          </Card>
          <RatingBars buckets={dashboard.rating_distribution} />
          <Card title="运营建议">
            <ul className="kcb-advice">
              <li><b>接入转化</b>把介绍和指令说明写清楚，群主装之前才看得懂它能做什么。</li>
              <li><b>响应效率</b>{underResponding ? '收到的消息明显多于发出的，检查一下关键词和事件处理有没有漏掉的。' : '收发比例比较健康，继续留意活跃群里的响应质量。'}</li>
              <li><b>在线状态</b>保持机器人在线，离线的机器人在广场里更难被选中。</li>
            </ul>
          </Card>
        </aside>
      </div>
    </div>
  );
}

/** 自己机器人的数据面板：收发量、安装的群、评分。只有创建者能打开。 */
export function BotDashboard({ botId, actions, onBack }: BotDashboardProps): JSX.Element {
  const query = useBotDashboard(botId);
  const dashboard = query.data;

  if (!dashboard) {
    return query.error
      ? <PaneState title="打不开仪表盘" text={errorMessage(query.error)} action={<button type="button" className="kui-btn kui-btn--sm" onClick={onBack}>返回详情</button>} />
      : <PaneState title="正在加载…" />;
  }

  const { bot } = dashboard;
  // 旧的自由文本指令解析不出来时退回按行数算
  const commandCount = parseBotCommands(bot.commands).length || nonEmptyLines(bot.commands).length;
  return (
    <>
      <header className="kcb-head">
        <button type="button" className="kui-icon-btn" title="返回详情" aria-label="返回详情" onClick={onBack}><Icon name="chevronLeft" className="h-[18px] w-[18px]" /></button>
        <Avatar user={botUser(bot)} size="lg" />
        <div className="kcb-head-main">
          <div className="kcb-head-title">
            <h2 title={bot.name}>{bot.name}</h2>
            <BotTags bot={bot} showOnline showVisibility />
          </div>
          <p className="kcb-head-meta"><span>仪表盘</span><span>{commandCount} 个指令</span></p>
        </div>
        <div className="kcb-head-actions">
          <button type="button" className="kui-btn" onClick={() => actions.edit(bot)}><Icon name="edit" className="h-4 w-4" />编辑资料</button>
        </div>
      </header>
      <div className="kcb-body kui-scroll">
        {query.error ? <p className="kui-note kui-note--danger kcb-body-note" role="alert">{errorMessage(query.error)}</p> : null}
        <Content dashboard={dashboard} />
      </div>
    </>
  );
}
