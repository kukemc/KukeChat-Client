import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { getBotDashboard } from '@/api/bots';
import { Avatar } from '@/components/ui/Avatar';
import { Icon, type IconName } from '@/components/ui/Icon';
import type { BotDashboard, BotDashboardInstallation, BotDashboardMetrics } from '@/types/api';

interface BotDashboardPanelProps {
  botId: number;
  onBack: () => void;
}

type Tone = 'blue' | 'green' | 'amber' | 'violet';

const toneClass: Record<Tone, { icon: string; bar: string; text: string }> = {
  blue: { icon: 'bg-sky-50 text-sky-700 ring-sky-100', bar: 'bg-sky-500', text: 'text-sky-700' },
  green: { icon: 'bg-emerald-50 text-emerald-700 ring-emerald-100', bar: 'bg-emerald-500', text: 'text-emerald-700' },
  amber: { icon: 'bg-amber-50 text-amber-700 ring-amber-100', bar: 'bg-amber-400', text: 'text-amber-700' },
  violet: { icon: 'bg-violet-50 text-violet-700 ring-violet-100', bar: 'bg-violet-500', text: 'text-violet-700' }
};

function formatCount(value?: number | null): string {
  const count = value ?? 0;
  if (count >= 10000) return `${(count / 10000).toFixed(count >= 100000 ? 0 : 1)}万`;
  return count.toLocaleString('zh-CN');
}

function formatDate(value?: string): string {
  if (!value) return '未知';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '未知' : date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '请求失败，请稍后再试';
}

function commandCount(value?: string | null): number {
  return (value ?? '').split('\n').map((item) => item.trim()).filter(Boolean).length;
}

function todayText(today: number, total: number): string {
  if (!total) return '今日暂无新增';
  return `今日 ${formatCount(today)} 条`;
}

function getHealth(metrics: BotDashboardMetrics): { score: number; label: string; desc: string } {
  const installScore = Math.min(34, metrics.active_installs * 6);
  const activityScore = Math.min(38, Math.floor((metrics.total_sent_messages + metrics.total_received_messages) / 12));
  const ratingScore = metrics.rating_average ? Math.round((metrics.rating_average / 5) * 28) : 0;
  const score = Math.min(100, installScore + activityScore + ratingScore);
  if (score >= 85) return { score, label: '优秀', desc: '安装、活跃与口碑表现健康。' };
  if (score >= 60) return { score, label: '稳定', desc: '运行稳定，可继续提升安装转化。' };
  if (score >= 30) return { score, label: '起步', desc: '建议完善介绍和指令说明。' };
  return { score, label: '待启动', desc: '数据较少，适合先做功能验证。' };
}

function Panel({ children, className = '' }: { children: ReactNode; className?: string }): JSX.Element {
  return <section className={`kc-bot-dashboard-card rounded-[20px] border shadow-[0_12px_34px_rgba(15,23,42,0.045)] [background:var(--kc-panel)] [border-color:var(--kc-border)] ${className}`}>{children}</section>;
}

function PanelTitle({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }): JSX.Element {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="text-base font-black tracking-tight">{title}</h3>
        {subtitle ? <p className="mt-1 text-xs leading-5 [color:var(--kc-muted)]">{subtitle}</p> : null}
      </div>
      {right}
    </div>
  );
}

function HeroHeader({ dashboard }: { dashboard: BotDashboard }): JSX.Element {
  const { bot, metrics } = dashboard;
  const health = getHealth(metrics);
  return (
    <Panel className="p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar user={bot.user ?? { id: bot.user_id, username: bot.name, nickname: bot.name, avatar_url: bot.avatar_url, is_bot: true }} size="lg" />
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2 text-xs font-bold [color:var(--kc-muted)]">
              <button type="button" className="transition hover:[color:var(--kc-accent)]">机器人中心</button>
              <Icon name="chevron" className="h-3.5 w-3.5" />
              <span>仪表盘</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-2xl font-black tracking-tight">{bot.name}</h2>
              <StatusBadge active={Boolean(bot.online)} activeText="在线" inactiveText="离线" />
              <span className="rounded-full px-2.5 py-1 text-xs font-bold ring-1 [background:var(--kc-panel-muted)] [color:var(--kc-muted)] [--tw-ring-color:var(--kc-border)]">{bot.is_public ? '公开机器人' : '私有机器人'}</span>
            </div>
            <p className="mt-1 max-w-3xl text-sm leading-6 [color:var(--kc-muted)]">{bot.description || '暂无介绍'} · {commandCount(bot.commands)} 个指令</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:min-w-[430px]">
          <HeroStat label="启用群" value={formatCount(metrics.active_installs)} />
          <HeroStat label="覆盖人数" value={formatCount(metrics.total_members_reached)} />
          <HeroStat label="评分" value={metrics.rating_average?.toFixed(1) ?? '暂无'} />
          <HeroStat label="健康度" value={`${health.score}`} />
        </div>
      </div>
    </Panel>
  );
}

function HeroStat({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="kc-bot-dashboard-stat flex min-h-[82px] flex-col items-center justify-center rounded-2xl border px-3 py-3 text-center shadow-[0_8px_24px_rgba(15,23,42,0.035)] [background:var(--kc-panel)] [border-color:var(--kc-border)]">
      <b className="text-2xl leading-none tracking-tight">{value}</b>
      <span className="mt-2 text-xs font-black [color:var(--kc-muted)]">{label}</span>
    </div>
  );
}

function StatusBadge({ active, activeText, inactiveText }: { active: boolean; activeText: string; inactiveText: string }): JSX.Element {
  return <span className={`rounded-full px-2.5 py-1 text-xs font-black ring-1 ${active ? 'bg-emerald-50 text-emerald-700 ring-emerald-100' : 'bg-slate-100 text-slate-600 ring-slate-200'}`}>{active ? activeText : inactiveText}</span>;
}

function MetricCard({ icon, title, value, detail, tone }: { icon: IconName; title: string; value: string; detail: string; tone: Tone }): JSX.Element {
  return (
    <Panel className="relative overflow-hidden px-4 py-4">
      <span className={`absolute inset-x-0 top-0 h-0.5 ${toneClass[tone].bar}`} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.16em] [color:var(--kc-muted)]">{title}</p>
          <p className="mt-2 truncate text-2xl font-black tracking-tight">{value}</p>
        </div>
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ring-1 ${toneClass[tone].icon}`}><Icon name={icon} className="h-[18px] w-[18px]" /></span>
      </div>
      <p className="mt-3 border-t pt-3 text-xs font-semibold [border-color:var(--kc-border)] [color:var(--kc-muted)]">{detail}</p>
    </Panel>
  );
}

function TrendChart({ dashboard }: { dashboard: BotDashboard }): JSX.Element {
  const maxRaw = Math.max(1, ...dashboard.trend.map((item) => Math.max(item.sent, item.received)));
  const maxValue = Math.ceil(maxRaw / 100) * 100 || 1;
  const ticks = [maxValue, Math.round(maxValue * 0.66), Math.round(maxValue * 0.33), 0];
  return (
    <Panel className="p-5">
      <PanelTitle title="近 7 天消息趋势" subtitle="按自然日统计机器人发送与群消息接收" right={<Legend />} />
      <div className="mt-5 grid h-[310px] grid-cols-[48px_1fr] gap-3 rounded-2xl border p-4 [background:var(--kc-panel)] [border-color:var(--kc-border)]">
        <div className="grid h-full grid-rows-[1fr_auto]">
          <div className="flex flex-col justify-between py-1 text-right text-[11px] font-bold [color:var(--kc-muted)]">
            {ticks.map((tick) => <span key={tick}>{formatCount(tick)}</span>)}
          </div>
          <span />
        </div>
        <div className="grid h-full grid-rows-[1fr_auto] gap-2">
          <div className="relative grid h-full grid-cols-7 items-end gap-3">
            <div className="pointer-events-none absolute inset-0 grid grid-rows-3">
              <span className="border-t [border-color:var(--kc-border)]" />
              <span className="border-t [border-color:var(--kc-border)]" />
              <span className="border-t [border-color:var(--kc-border)]" />
            </div>
            {dashboard.trend.map((item) => (
              <div key={item.date} className="relative z-10 flex h-full min-w-0 items-end justify-center gap-1.5">
                <span className="kc-bot-dashboard-bar w-3 rounded-t-md bg-sky-500 shadow-sm" style={{ height: `${Math.max(2, (item.sent / maxValue) * 100)}%`, animationDelay: `${160 + dashboard.trend.indexOf(item) * 34}ms` }} title={`发送 ${item.sent}`} />
                <span className="kc-bot-dashboard-bar w-3 rounded-t-md bg-emerald-500 shadow-sm" style={{ height: `${Math.max(2, (item.received / maxValue) * 100)}%`, animationDelay: `${210 + dashboard.trend.indexOf(item) * 34}ms` }} title={`接收 ${item.received}`} />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-3 text-center text-[11px] font-bold [color:var(--kc-muted)]">
            {dashboard.trend.map((item) => <span key={item.date} className="truncate">{formatDate(item.date)}</span>)}
          </div>
        </div>
      </div>
    </Panel>
  );
}

function Legend(): JSX.Element {
  return <div className="flex gap-3 text-xs font-bold [color:var(--kc-muted)]"><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-sky-500" />发送</span><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-500" />接收</span></div>;
}

function HealthScore({ metrics }: { metrics: BotDashboardMetrics }): JSX.Element {
  const health = getHealth(metrics);
  return (
    <Panel className="p-5">
      <PanelTitle title="运行状态" subtitle="健康度作为参考，不作为绝对评分" right={<span className="text-2xl font-black">{health.label}</span>} />
      <div className="mt-5">
        <div className="flex items-center justify-between text-xs font-bold [color:var(--kc-muted)]"><span>综合健康度</span><span>{health.score}/100</span></div>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full [background:var(--kc-panel-muted)]"><span className="block h-full rounded-full [background:var(--kc-accent)]" style={{ width: `${health.score}%` }} /></div>
        <p className="mt-4 text-sm leading-6 [color:var(--kc-muted)]">{health.desc}</p>
      </div>
    </Panel>
  );
}

function RatingDistribution({ dashboard }: { dashboard: BotDashboard }): JSX.Element {
  const nonZero = dashboard.rating_distribution.filter((item) => item.count > 0);
  const rows = nonZero.length ? dashboard.rating_distribution : dashboard.rating_distribution.slice(0, 5);
  const maxCount = Math.max(1, ...rows.map((item) => item.count));
  return (
    <Panel className="p-5">
      <PanelTitle title="评分分布" subtitle="仅统计已通过审核的评价" />
      <div className="mt-4 space-y-3">
        {rows.map((item) => (
          <div key={item.rating} className={`grid grid-cols-[44px_1fr_32px] items-center gap-3 text-xs font-bold ${item.count === 0 ? 'opacity-45' : ''}`}>
            <span className="[color:var(--kc-muted)]">{item.rating.toFixed(item.rating % 1 ? 1 : 0)} 星</span>
            <span className="h-2 overflow-hidden rounded-full [background:var(--kc-panel-muted)]"><span className="block h-full rounded-full bg-amber-400" style={{ width: item.count ? `${Math.max(3, (item.count / maxCount) * 100)}%` : '0%' }} /></span>
            <span className="text-right [color:var(--kc-muted)]">{item.count}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function InstallationTable({ installations }: { installations: BotDashboardInstallation[] }): JSX.Element {
  return (
    <Panel className="p-5">
      <PanelTitle title="安装群表现" subtitle="展示各群消息贡献与接收事件配置" right={<span className="text-xs font-bold [color:var(--kc-muted)]">按最近更新排序</span>} />
      {installations.length ? (
        <div className="mt-4 overflow-hidden rounded-2xl border [border-color:var(--kc-border)]">
          <div className="grid grid-cols-[minmax(220px,1.4fr)_76px_82px_82px_82px_88px] gap-3 border-b px-4 py-3 text-xs font-black [background:var(--kc-panel)] [border-color:var(--kc-border)] [color:var(--kc-muted)] max-lg:hidden">
            <span>群聊</span><span className="text-center">状态</span><span className="text-center">成员</span><span className="text-center">发送</span><span className="text-center">接收</span><span className="text-center">更新时间</span>
          </div>
          {installations.map((installation) => <InstallationRow key={installation.conversation_id} installation={installation} />)}
        </div>
      ) : <p className="mt-4 rounded-2xl px-4 py-8 text-center text-sm [background:var(--kc-panel-muted)] [color:var(--kc-muted)]">还没有安装到任何群聊。</p>}
    </Panel>
  );
}

function InstallationRow({ installation }: { installation: BotDashboardInstallation }): JSX.Element {
  return (
    <div className="kc-bot-dashboard-row grid grid-cols-[minmax(220px,1.4fr)_76px_82px_82px_82px_88px] items-center gap-3 border-b px-4 py-3 last:border-b-0 [background:var(--kc-panel)] [border-color:var(--kc-border)] max-lg:grid-cols-1 max-lg:gap-2">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar label={installation.title} avatarUrl={installation.avatar_url} size="md" />
        <div className="min-w-0">
          <p className="truncate text-sm font-black">{installation.title}</p>
          <p className="mt-1 text-xs [color:var(--kc-muted)]">成员事件 {installation.receive_member_events ? '开启' : '关闭'} · 消息接收 {installation.receive_messages ? '开启' : '关闭'}</p>
        </div>
      </div>
      <span className={`mx-auto inline-flex w-fit items-center justify-center rounded-full px-2 py-0.5 text-xs font-black max-lg:mx-0 ${installation.enabled ? 'bg-emerald-50 text-emerald-700' : '[background:var(--kc-panel-muted)] [color:var(--kc-muted)]'}`}>{installation.enabled ? '启用' : '停用'}</span>
      <TableNumber icon="users" label="成员" value={formatCount(installation.member_count)} />
      <TableNumber icon="send" label="发送" value={formatCount(installation.sent_messages)} tone="blue" />
      <TableNumber icon="message" label="接收" value={formatCount(installation.received_messages)} tone="green" />
      <TableNumber icon="clock" label="更新时间" value={formatDate(installation.updated_at)} />
    </div>
  );
}

function TableNumber({ icon, label, value, tone = 'violet' }: { icon: IconName; label: string; value: string; tone?: Tone }): JSX.Element {
  return (
    <span className="flex flex-col items-center justify-center rounded-xl border px-2 py-1.5 text-center transition [background:var(--kc-panel)] [border-color:var(--kc-border)] max-lg:items-start max-lg:text-left">
      <span className="flex items-center gap-1.5 text-sm font-black"><Icon name={icon} className={`h-3.5 w-3.5 ${toneClass[tone].text}`} />{value}</span>
      <small className="mt-0.5 text-[11px] font-bold [color:var(--kc-muted)] lg:hidden">{label}</small>
    </span>
  );
}

function AdviceCard({ metrics }: { metrics: BotDashboardMetrics }): JSX.Element {
  const lowSend = metrics.total_received_messages > metrics.total_sent_messages * 3;
  return (
    <Panel className="p-5">
      <PanelTitle title="运营建议" subtitle="基于当前数据的轻量诊断" />
      <div className="mt-4 space-y-3 text-sm leading-6 [color:var(--kc-muted)]">
        <p><b className="[color:var(--kc-text)]">接入转化：</b>完善介绍和指令说明，降低管理员安装前的理解成本。</p>
        <p><b className="[color:var(--kc-text)]">响应效率：</b>{lowSend ? '接收消息明显高于发送消息，建议检查关键词和事件处理覆盖率。' : '收发比例相对健康，继续关注高活跃群的响应质量。'}</p>
        <p><b className="[color:var(--kc-text)]">在线状态：</b>保持 Bot 网关在线，广场排序和用户信任都会更好。</p>
      </div>
    </Panel>
  );
}

export function BotDashboardPanel({ botId, onBack }: BotDashboardPanelProps): JSX.Element {
  const dashboardQuery = useQuery({ queryKey: ['bots', botId, 'dashboard'], queryFn: () => getBotDashboard(botId) });
  const dashboard = dashboardQuery.data;

  if (dashboardQuery.isLoading || !dashboard) {
    return <div className="grid h-full place-items-center [background:var(--kc-chat)]"><div className="h-56 w-[min(720px,80vw)] animate-pulse rounded-[24px] [background:var(--kc-panel-muted)]" /></div>;
  }

  const metrics = dashboard.metrics;
  return (
    <section className="kc-bot-dashboard-page scroll-soft h-full overflow-y-auto [background:var(--kc-chat)] [color:var(--kc-text)]">
      <div className="kc-bot-dashboard-stagger mx-auto max-w-6xl px-4 pb-24 pt-5 sm:px-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={onBack} className="ghost-button inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold"><Icon name="chevronLeft" className="h-4 w-4" />返回机器人中心</button>
        </div>
        {dashboardQuery.error ? <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{errorMessage(dashboardQuery.error)}</div> : null}

        <HeroHeader dashboard={dashboard} />

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon="send" title="发送消息" value={formatCount(metrics.total_sent_messages)} detail={todayText(metrics.today_sent_messages, metrics.total_sent_messages)} tone="blue" />
          <MetricCard icon="message" title="接收消息" value={formatCount(metrics.total_received_messages)} detail={todayText(metrics.today_received_messages, metrics.total_received_messages)} tone="green" />
          <MetricCard icon="users" title="安装群聊" value={formatCount(metrics.installed_groups)} detail={`${formatCount(metrics.active_installs)} 个启用 · ${formatCount(metrics.disabled_installs)} 个停用`} tone="violet" />
          <MetricCard icon="star" title="评价反馈" value={formatCount(metrics.review_count)} detail={metrics.rating_average ? `平均 ${metrics.rating_average.toFixed(1)} 分 · ${formatCount(metrics.reaction_count)} 次表情` : `${formatCount(metrics.reaction_count)} 次表情互动`} tone="amber" />
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <main className="space-y-4">
            <TrendChart dashboard={dashboard} />
            <InstallationTable installations={dashboard.installations} />
          </main>
          <aside className="space-y-4">
            <HealthScore metrics={metrics} />
            <RatingDistribution dashboard={dashboard} />
            <AdviceCard metrics={metrics} />
          </aside>
        </div>
      </div>
    </section>
  );
}
