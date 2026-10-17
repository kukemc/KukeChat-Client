import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getMyReports } from '@/api/reports';
import { ShareTypingRow } from '@/components/chat/desktop/typing/ShareTypingRow';
import { useLevelAvailable } from '@/components/level/data';
import { useShopAvailable } from '@/components/shop/data';
import { Icon, type IconName } from '@/components/ui/Icon';
import { getDesktopAutostartEnabled, setDesktopAutostartEnabled } from '@/native/desktopAutostart';
import { requestDesktopNotificationPermission } from '@/native/desktopNotifications';
import { useKukeStore, type ThemeMode, type UiFontScale } from '@/store/kukeStore';
import { useShopPrefs } from '@/store/shopPrefs';
import { useComposerPrefs, type PasteImageMode } from '@/store/composerPrefs';
import { resolveAssetUrl } from '@/utils/assetUrl';
import { isTauriDesktopApp } from '@/utils/appMode';
import { ReportReconsider } from './ReportReconsider';
import { SoundCard } from './SoundCard';
import { Card, Choice, Notice, Row, SettingsPage, Toggle, btn, formatChinaDateTime } from './settingsUi';
import { ThemeCustomizer } from './ThemeSection';

// 缩略图里的面是各自配色方案的示意色，写死；强调色那一条跟着当前主题走
const THEMES: Array<{ mode: ThemeMode; label: string; icon: IconName; preview: [string, string] }> = [
  { mode: 'system', label: '跟随系统', icon: 'device', preview: ['#ffffff', '#1f2430'] },
  { mode: 'light', label: '浅色', icon: 'sun', preview: ['#ffffff', '#eef2f7'] },
  { mode: 'dark', label: '深色', icon: 'moon', preview: ['#1f2430', '#151923'] }
];

const FONT_SCALES: Array<{ value: UiFontScale; label: string }> = [
  { value: 0, label: '小' }, { value: 1, label: '标准' }, { value: 2, label: '稍大' }, { value: 3, label: '大' }, { value: 4, label: '特大' }
];

export function AppearanceSection(): JSX.Element {
  const themeMode = useKukeStore((state) => state.themeMode);
  const setThemeMode = useKukeStore((state) => state.setThemeMode);
  const uiFontScale = useKukeStore((state) => state.uiFontScale);
  const setUiFontScale = useKukeStore((state) => state.setUiFontScale);
  return (
    <SettingsPage title="外观" description="修改后立即生效，设置保存在这台设备上。">
      <Card title="明暗模式" padded>
        <div className="grid grid-cols-3 gap-3">
          {THEMES.map((theme) => {
            const active = themeMode === theme.mode;
            const [panel, bg] = theme.preview;
            return (
              <button key={theme.mode} type="button" onClick={() => setThemeMode(theme.mode)} aria-pressed={active}
                className={`rounded-xl border p-2 text-left transition ${active ? '[border-color:var(--kc-accent)] [box-shadow:0_0_0_3px_var(--kc-accent-soft)]' : '[border-color:var(--kc-border)] hover:[border-color:var(--kc-muted)]'}`}>
                <span className="relative block h-16 overflow-hidden rounded-lg" style={{ background: theme.mode === 'system' ? `linear-gradient(115deg, ${bg} 50%, #eef2f7 50%)` : bg }}>
                  <span className="absolute left-2 top-2 h-12 w-8 rounded-md" style={{ background: panel, opacity: 0.9 }} />
                  <span className="absolute left-12 right-2 top-3 h-2 rounded-full [background:var(--kc-accent-fill,var(--kc-accent))]" />
                  <span className="absolute left-12 right-6 top-7 h-2 rounded-full bg-slate-400/40" />
                </span>
                <span className="mt-2 flex items-center gap-1.5 px-1 text-[13px] font-semibold [color:var(--kc-text)]"><Icon name={theme.icon} className="h-4 w-4" />{theme.label}{active ? <Icon name="check" className="ml-auto h-4 w-4 [color:var(--kc-accent)]" /> : null}</span>
              </button>
            );
          })}
        </div>
      </Card>
      <ThemeCustomizer />
      <BubbleSkinCard />
      <LevelIconCard />
      <Card title="字体大小" description="调整聊天、列表和设置的整体文字大小。" padded>
        <Choice value={uiFontScale} options={FONT_SCALES} onChange={setUiFontScale} />
        <p className="mt-3 rounded-xl px-3 py-2.5 [background:var(--kc-panel-muted)] [color:var(--kc-text)]" style={{ fontSize: `${[12.5, 14, 15, 16.5, 18][uiFontScale]}px` }}>预览：今天有人一起做项目吗？</p>
      </Card>
    </SettingsPage>
  );
}

/** 气泡皮肤：到商店的入口，和「显示别人的气泡皮肤」这个本机开关。服务端没有商店时整块不出现。 */
function BubbleSkinCard(): JSX.Element | null {
  const available = useShopAvailable();
  const openShop = useKukeStore((state) => state.openShop);
  const showOthers = useShopPrefs((state) => state.showOthersSkins);
  const setShowOthers = useShopPrefs((state) => state.setShowOthersSkins);
  if (!available) {
    return null;
  }
  return (
    <Card title="气泡皮肤" description="在商店里换的气泡皮肤盖在上面的主题气泡之上；没穿皮肤的消息仍然按主题显示。">
      <Row icon="store" title="商店与我的装扮" description="用 CCW 金币换气泡和头像框，查看、更换或卸下现在用的那一件。" onClick={openShop}>
        <Icon name="chevron" className="h-4 w-4 shrink-0 [color:var(--kc-muted)]" />
      </Row>
      <Row icon="eye" title="显示别人的气泡皮肤" description="关掉后，别人的气泡按你的主题显示；你自己的皮肤不受影响。">
        <Toggle label="显示别人的气泡皮肤" checked={showOthers} onChange={setShowOthers} />
      </Row>
    </Card>
  );
}

/** 账号等级：到等级页的入口。服务端没有账号等级时整块不出现。 */
function LevelIconCard(): JSX.Element | null {
  const available = useLevelAvailable();
  const openLevel = useKukeStore((state) => state.openLevel);
  if (!available) {
    return null;
  }
  return (
    <Card title="账号等级" description="等级看累计活跃天数，图标是星星、月亮、太阳和皇冠。">
      <Row icon="star" title="我的等级" description="当前等级、今天拿到的活跃天和规则说明。" onClick={() => openLevel('me')}>
        <Icon name="chevron" className="h-4 w-4 shrink-0 [color:var(--kc-muted)]" />
      </Row>
    </Card>
  );
}

function notificationDetail(permission: NotificationPermission | 'unsupported', desktop: boolean): string {
  if (permission === 'unsupported') return desktop ? '当前客户端不支持系统通知，请更新到最新版本。' : '当前浏览器不支持系统通知。';
  if (permission === 'denied') return desktop ? '通知权限被 Windows 关闭了，请在系统设置 → 通知中允许 KukeChat。' : '通知权限被浏览器拒绝了，请在网站设置中允许。';
  return '收到新消息时在屏幕角落弹出提醒。每个聊天自己的免打扰设置仍然生效。';
}

export function GeneralSection(): JSX.Element {
  const desktop = isTauriDesktopApp();
  const queryClient = useQueryClient();
  const notifyMode = useKukeStore((state) => state.browserNotificationMode);
  const setNotifyMode = useKukeStore((state) => state.setBrowserNotificationMode);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() => (typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'));
  const autostart = useQuery({ queryKey: ['desktop-autostart'], queryFn: getDesktopAutostartEnabled, enabled: desktop, retry: false });
  const setAutostart = useMutation({ mutationFn: setDesktopAutostartEnabled, onSuccess: (enabled) => queryClient.setQueryData(['desktop-autostart'], enabled) });

  async function toggleNotifications(on: boolean): Promise<void> {
    if (!on) { setNotifyMode('off'); return; }
    let result: NotificationPermission | 'unsupported';
    if (desktop) result = await requestDesktopNotificationPermission();
    else if (typeof Notification === 'undefined') result = 'unsupported';
    else result = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    setPermission(result);
    setNotifyMode(result === 'granted' ? 'on' : 'off');
  }

  return (
    <SettingsPage title="通用" description="消息提醒、聊天输入和启动方式。">
      <Card title="消息提醒">
        <Row icon="bell" title={desktop ? 'Windows 系统通知' : '系统通知'} description={notificationDetail(permission, desktop)}>
          <Toggle label="系统通知" checked={notifyMode === 'on'} onChange={(on) => void toggleNotifications(on)} />
        </Row>
      </Card>
      <SoundCard />
      <ComposerCard />
      <Card title="隐私">
        <ShareTypingRow />
      </Card>
      {desktop ? (
        <Card title="启动">
          <Row icon="monitor" title="开机自动启动" description={setAutostart.isError ? '保存失败，请重试。' : '登录 Windows 后自动打开 KukeChat。'}>
            <Toggle label="开机自动启动" checked={Boolean(autostart.data)} disabled={autostart.isLoading || setAutostart.isPending} onChange={(on) => setAutostart.mutate(on)} />
          </Row>
          <Row icon="close" title="关闭窗口时" description="点击右上角关闭按钮会隐藏到系统托盘，右键托盘图标可以退出。" />
        </Card>
      ) : null}
    </SettingsPage>
  );
}

const PASTE_IMAGE_MODES: Array<{ value: PasteImageMode; label: string }> = [
  { value: 'inline', label: '放进输入框' },
  { value: 'confirm', label: '弹出确认框' }
];

/** 聊天输入：粘贴 / 拖进来 / 选的图片怎么处理。输入框里有待发图片时，缩略图那一行末尾也能直接切换。 */
function ComposerCard(): JSX.Element {
  const mode = useComposerPrefs((state) => state.pasteImageMode);
  const setMode = useComposerPrefs((state) => state.setPasteImageMode);
  return (
    <Card title="聊天输入">
      <Row icon="image" title="粘贴图片时" wrap description={mode === 'inline'
        ? '图片显示在输入框里，可以接着打字，按发送时图文合成一条发出。拖进来和从工具栏选的图片也一样。'
        : '先弹出「发送图片」确认框，可以加一句说明，确认后单独发出。拖进来和从工具栏选的图片也一样。'}>
        <Choice value={mode} options={PASTE_IMAGE_MODES} onChange={setMode} />
      </Row>
    </Card>
  );
}

const REPORT_STATUS: Record<string, { text: string; className: string }> = {
  pending: { text: '处理中', className: 'bg-amber-500/15 text-amber-600' },
  reviewed: { text: '已处理', className: 'bg-emerald-500/15 text-emerald-600' },
  rejected: { text: '未采纳', className: '[background:var(--kc-panel-muted)] [color:var(--kc-muted)]' }
};
const TARGET: Record<string, string> = { message: '消息', user: '用户', conversation: '会话', post: '动态' };

export function ReportsSection(): JSX.Element {
  const query = useQuery({ queryKey: ['my-reports'], queryFn: getMyReports });
  const reports = query.data ?? [];
  return (
    <SettingsPage title="举报记录" description="你提交过的举报和管理员的处理结果。">
      <div className="flex justify-end -mt-2"><button type="button" className={btn.ghost} disabled={query.isFetching} onClick={() => void query.refetch()}><Icon name="refresh" className={`h-4 w-4 ${query.isFetching ? 'animate-spin' : ''}`} />刷新</button></div>
      {query.error ? <Notice tone="error">举报记录加载失败，请稍后再试。</Notice> : null}
      {query.isLoading ? <Card padded><p className="text-sm [color:var(--kc-muted)]">加载中…</p></Card>
        : reports.length === 0 ? (
          <Card padded>
            <div className="grid place-items-center gap-2 py-8 text-center">
              <Icon name="flag" className="h-7 w-7 [color:var(--kc-muted)]" />
              <p className="text-sm font-semibold [color:var(--kc-text)]">还没有举报记录</p>
              <p className="text-xs [color:var(--kc-muted)]">在消息或用户上右键即可举报，处理进度会显示在这里。</p>
            </div>
          </Card>
        ) : reports.map((report) => {
          const status = REPORT_STATUS[report.status ?? ''] ?? { text: report.status ?? '未知', className: '' };
          return (
            <Card key={report.id} padded>
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${status.className}`}>{status.text}</span>
                    <span className="text-xs [color:var(--kc-muted)]">#{report.id} · 举报{TARGET[report.target_type] ?? report.target_type} · {formatChinaDateTime(report.created_at)}</span>
                  </div>
                  <p className="mt-2 text-sm font-semibold [color:var(--kc-text)]">{report.reason}</p>
                  {report.description || report.details ? <p className="mt-1 text-[13px] leading-5 [color:var(--kc-muted)]">{report.description || report.details}</p> : null}
                </div>
              </div>
              {report.attachments?.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {report.attachments.map((url, index) => { const src = resolveAssetUrl(url); return src ? <a key={`${url}-${index}`} href={src} target="_blank" rel="noreferrer"><img src={src} alt="" className="h-16 w-20 rounded-lg border object-cover [border-color:var(--kc-border)]" /></a> : null; })}
                </div>
              ) : null}
              <div className="mt-3 rounded-xl px-3 py-2 text-[13px] leading-5 [background:var(--kc-panel-muted)]">
                <span className="font-semibold [color:var(--kc-text)]">处理结果：</span>
                <span className="[color:var(--kc-muted)]">{report.result_title ? `${report.result_title}${report.result_text ? `。${report.result_text}` : ''}` : report.review_note || (report.status === 'pending' ? '还在处理中，有结果会通知你。' : '没有更多说明。')}</span>
                {report.reviewed_at ? <span className="ml-1 text-xs [color:var(--kc-muted)]">（{formatChinaDateTime(report.reviewed_at)}）</span> : null}
              </div>
              {/* 风纪 v2 三期：对「不违规」的结论申请复议。后端没有这项能力时不出现 */}
              <ReportReconsider report={report} />
            </Card>
          );
        })}
    </SettingsPage>
  );
}
