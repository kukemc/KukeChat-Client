/**
 * 登录页、窗口外框 / 标题栏、封号提示、更新对话框和设置页的本地预览：不连后端，用假数据驱动真实组件。
 *
 *   http://127.0.0.1:5180/dev/settings-harness.html
 *
 * 初始状态可以写在地址里，方便截图：
 *   ?view=login|restore|settings   shell=tauri|float   theme=light|dark   user=0|1   native=1
 *   preset=sakura   wallpaper=window|chat   tab=appearance   bubble=1   suspended=1|token   update=available|downloading|ready|error
 *   layout=mobile   移动端的设置面板（390 宽），page=appearance|about|… 直接打开某个二级页
 *
 * 桌面端的标题栏写在入口文件 src/desktop-app.tsx 里（依赖 Tauri 接口），这里引不进来，
 * 下面的 TauriTitleBar 是照着它的结构抄的一份，只用来看样式。
 * 只用于开发时看界面，不会进入任何构建产物。
 */
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@/styles/tailwind.css';
import { AuthPanel } from '@/components/auth/AuthPanel';
import { AccountSuspensionModal } from '@/components/auth/AccountSuspensionModal';
import { AuthRestoringScreen } from '@/components/auth/login/AuthScreen';
import { DesktopJustUpdatedNotice, DesktopUpdateDialog, DesktopUpdatePill } from '@/components/desktop/DesktopUpdateDialog';
import { DesktopSettingsPanel, type DesktopSettingsTab } from '@/components/settings/desktop/DesktopSettingsPanel';
import { MobileSettingsPanel, type MobileSettingsPage } from '@/components/settings/MobileSettingsPanel';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { OnlineUsersCard } from '@/components/window/OnlineUsersCard';
import { WindowFrame } from '@/components/window/WindowFrame';
import { useDesktopUpdate, type UpdatePhase } from '@/native/desktopUpdate';
import { useKukeStore } from '@/store/kukeStore';
import { DEFAULT_THEME_SETTINGS, getThemePreset } from '@/theme/themes';
import { ThemeEffects } from '@/theme/ThemeEffects';
import { useThemeRootProps } from '@/theme/useTheme';
import type { AccountSuspension, User } from '@/types/api';

const params = new URLSearchParams(window.location.search);
if (params.get('native') === '1') {
  // 桌面端没有「安全登录」，登录后自动保存状态
  window.__KukeChatAppMode = 'tauri-desktop';
}

const me = { id: 1, username: 'kuke', nickname: '酷可mc', bio: '正在重写界面，这是一条特别特别长的个性签名用来测试标题栏里的截断效果到底对不对', presence_status: 'online', ccw_student_oid: null } as User;
const onlineUsers: User[] = [
  me,
  { id: 2, username: 'aqua', nickname: '阿夸' } as User,
  { id: 3, username: 'mint', nickname: '薄荷糖' } as User,
  { id: 4, username: 'a_very_long_username_for_truncation_test', nickname: '一个名字特别特别长的群友用来测试截断' } as User,
  ...Array.from({ length: 14 }, (_, index) => ({ id: 10 + index, username: `scratcher${index}`, nickname: `Scratcher ${index + 1}` }) as User)
];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const suspensionDetail = (token: boolean): AccountSuspension => ({
  code: 'account_suspended',
  reason: '多次发布辱骂内容，90 天内累计记 12 分。\n这是第二行，用来看长原因的换行：aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  banned_until: new Date(Date.now() + 7 * 86400_000).toISOString(),
  permanent: false,
  appeal_token: token ? 'harness-appeal-token' : null
});

/**
 * 假接口。登录：用户名 kuke 成功、banned 被封禁、其他一律密码错误。
 * 找回密码：no 开头的账号不存在；带 ccw 的账号已绑定 CCW；验证码前两次确认返回 404（触发自动重试）。
 */
function installMocks(): void {
  let confirmAttempts = 0;
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, window.location.origin);
    if (!url.pathname.includes('/api/v1/')) {
      return realFetch(input, init);
    }
    const path = url.pathname.replace(/^.*\/api\/v1/, '');
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = (typeof init?.body === 'string' ? JSON.parse(init.body) : {}) as Record<string, string>;
    await new Promise((resolve) => window.setTimeout(resolve, 600));

    if (path === '/auth/login') {
      if (body.username_or_email === 'kuke') return json({ access_token: 'harness', user: me });
      if (body.username_or_email === 'banned') return json({ detail: suspensionDetail(true) }, 403);
      return json({ detail: '用户名或密码错误' }, 401);
    }
    if (path === '/auth/register') {
      return body.username === 'kuke' ? json({ detail: '用户名已被占用，换一个试试' }, 409) : json({ access_token: 'harness', user: { ...me, username: body.username, nickname: body.nickname || body.username } });
    }
    if (path === '/auth/session') return json({ detail: '未登录' }, 401);
    if (path === '/auth/me') return json(me);
    if (path === '/auth/account-lookup') {
      const username = url.searchParams.get('username') ?? '';
      return json({ exists: !username.startsWith('no'), ccw_bound: username.includes('ccw') });
    }
    if (path === '/auth/password-reset/ccw/challenge') {
      confirmAttempts = 0;
      return json({ code: 'KC-482913', comment_url: 'https://www.ccw.site/detail/harness', expires_in: 600 });
    }
    if (path === '/auth/password-reset/ccw/confirm') {
      confirmAttempts += 1;
      return confirmAttempts < 3 ? json({ detail: '还没有检测到验证码评论' }, 404) : json({ ok: true });
    }
    if (path === '/auth/password-reset-requests') {
      return body.reason?.includes('失败') ? json({ detail: '今天提交的申请太多了，请明天再试' }, 429) : json({ id: 1 });
    }
    if (path === '/users/online') return json({ online_count: onlineUsers.length, users: onlineUsers });
    if (path === '/users/online-count') return json({ online_count: onlineUsers.length });
    if (path === '/moderation/me') return json({ points: 0, point_window_days: 90, muted_until: null, mute_reason: null, next_threshold: 6, next_penalty: 'mute:24', ban: null, violations: [] });
    if (path === '/jury/me') return json({ status: 'none', eligible: false, requirements: [], term_ends_at: null, review_note: null, stats: null, daily_limit: 30, voted_today: 0 });
    if (path === '/ccw/binding/me') return json(null);
    if (method !== 'GET' && path.startsWith('/users/me')) return json({ ...me, ...body });
    return json([]);
  };
}

/** src/desktop-app.tsx 里 DesktopTitleBar 的样式替身。结构、类名和它保持一致；在线名单这里用点击开关代替悬停定位。 */
function TauriTitleBar(): JSX.Element {
  const currentUser = useKukeStore((state) => state.currentUser);
  const unreadCount = useKukeStore((state) => state.unreadCount);
  const [open, setOpen] = useState(params.get('online') === '1');
  const title = currentUser ? getDisplayName(currentUser) : 'KukeChat';
  return (
    <>
      <header className={currentUser ? 'kwf-titlebar' : 'kwf-titlebar kwf-titlebar--bare'}>
        <div className="kwf-identity">
          {currentUser ? <Avatar user={currentUser} label={title} size="sm" /> : null}
          {currentUser ? <h1 className="kwf-title">{title}</h1> : null}
          {currentUser ? <span className="kwf-bio">{currentUser.bio?.trim() || '咕咕咕~'}</span> : null}
          {currentUser ? (
            <div data-window-action data-harness="online" className="kwf-online" onClick={() => setOpen((value) => !value)}>
              <span className="kwf-online-count">在线 {onlineUsers.length}</span>
            </div>
          ) : null}
          {unreadCount > 0 ? <span className="kui-badge">{unreadCount > 99 ? '99+' : unreadCount}</span> : null}
        </div>
        <div className="kwf-controls">
          <DesktopUpdatePill />
          <button type="button" className="kwf-control" aria-label="最小化窗口"><Icon name="minus" className="h-4 w-4" /></button>
          <button type="button" className="kwf-control" aria-label="最大化或还原窗口"><Icon name="maximize" className="h-4 w-4" /></button>
          <button type="button" className="kwf-control kwf-control--close" aria-label="隐藏到托盘"><Icon name="close" className="h-4 w-4" /></button>
        </div>
      </header>
      {open && currentUser ? <div className="kwf-popover-fixed" style={{ position: 'fixed', left: 260, top: 48, width: 288, zIndex: 2147483647 }}><OnlineUsersCard count={onlineUsers.length} users={onlineUsers} loading={false} /></div> : null}
    </>
  );
}

type View = 'login' | 'restore' | 'settings';

/** 把更新状态摆到某一步并打开对话框（更新功能只在打包后的桌面端可用，预览页里直接改它的状态）。 */
function showUpdate(phase: UpdatePhase): void {
  useDesktopUpdate.setState({ phase, dialogOpen: true, latestVersion: '1.4.0', downloaded: 18_400_000, total: 46_000_000, lastCheckedAt: Date.now(), error: phase === 'error' ? '下载更新包失败：连接超时（os error 10060）' : null, installerUrl: 'https://example.com/KukeChat-1.4.0-setup.exe', message: phase === 'upToDate' ? '已是最新版本' : null });
}

function Harness(): JSX.Element {
  const [theme, setTheme] = useState<'light' | 'dark'>(params.get('theme') === 'dark' ? 'dark' : 'light');
  const [shell, setShell] = useState<'tauri' | 'float'>(params.get('shell') === 'float' ? 'float' : 'tauri');
  const [view, setView] = useState<View>((params.get('view') as View | null) ?? 'login');
  const [suspension, setSuspension] = useState<AccountSuspension | null>(params.get('suspended') ? suspensionDetail(params.get('suspended') === 'token') : null);
  const themeRoot = useThemeRootProps(theme);
  const currentUser = useKukeStore((state) => state.currentUser);
  const isMinimized = useKukeStore((state) => state.isMinimized);

  // 登录成功后真实应用会进聊天主界面；这里没有那部分，直接落到设置页
  const content = view === 'restore' ? <AuthRestoringScreen />
    : currentUser ? <DesktopSettingsPanel user={currentUser} initialTab={(params.get('tab') as DesktopSettingsTab | null) ?? 'appearance'} onLogout={() => useKukeStore.getState().logout()} />
    : <AuthPanel />;
  const body = <>{content}{suspension ? <AccountSuspensionModal notice={suspension} onClose={() => setSuspension(null)} /> : null}</>;

  const button: React.CSSProperties = { padding: '3px 9px', border: '1px solid #9aa1b1', borderRadius: 6, background: '#fff', color: '#12141a', font: '12px sans-serif', cursor: 'pointer' };

  // 移动端的设置面板是另一份代码（MobileSettingsPanel），单独摆在一个手机宽度的框里
  if (mobileLayout) {
    return (
      <div style={{ display: 'flex', height: '100%', flexDirection: 'column' }}>
        <div data-harness="controls" style={{ display: 'flex', flex: 'none', gap: 6, padding: 6, background: '#e3e6ee' }}>
          <button type="button" style={button} data-harness="theme" onClick={() => {
            const next = theme === 'light' ? 'dark' : 'light';
            setTheme(next);
            useKukeStore.setState({ themeMode: next });
          }}>切换深浅色</button>
        </div>
        <main data-theme={theme} data-layout="mobile" data-font-scale={1} style={{ position: 'relative', width: 390, minHeight: 0, flex: 1, margin: '0 auto', overflow: 'hidden', background: 'var(--kc-mobile-bg)', color: 'var(--kc-mobile-text)', transform: 'translateZ(0)' }}>
          <MobileSettingsPanel user={me} isMobile initialMobilePage={(params.get('page') as Exclude<MobileSettingsPage, null> | null) ?? undefined} />
        </main>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100%', flexDirection: 'column' }}>
      <div data-harness="controls" style={{ display: 'flex', flex: 'none', flexWrap: 'wrap', gap: 6, padding: 6, background: '#e3e6ee' }}>
        <button type="button" style={button} data-harness="theme" onClick={() => {
          const next = theme === 'light' ? 'dark' : 'light';
          setTheme(next);
          useKukeStore.setState({ themeMode: next });
        }}>切换深浅色</button>
        <button type="button" style={button} data-harness="shell" onClick={() => setShell(shell === 'tauri' ? 'float' : 'tauri')}>外框：{shell === 'tauri' ? '桌面端' : '扩展浮窗'}</button>
        <button type="button" style={button} data-harness="login" onClick={() => { useKukeStore.getState().logout(); setView('login'); }}>登录页</button>
        <button type="button" style={button} data-harness="restore" onClick={() => setView('restore')}>恢复登录中</button>
        <button type="button" style={button} data-harness="settings" onClick={() => { useKukeStore.setState({ token: 'harness', currentUser: me }); setView('settings'); }}>设置（已登录）</button>
        <button type="button" style={button} data-harness="suspend" onClick={() => setSuspension(suspension ? null : suspensionDetail(true))}>封号提示</button>
        <button type="button" style={button} data-harness="unread" onClick={() => useKukeStore.setState((state) => ({ unreadCount: state.unreadCount ? 0 : 128 }))}>未读 128</button>
        <button type="button" style={button} data-harness="bubble" onClick={() => (isMinimized ? useKukeStore.getState().restoreWindow() : useKukeStore.getState().minimizeWindow())}>悬浮球</button>
        <button type="button" style={button} data-harness="preset" onClick={() => useKukeStore.getState().updateThemeSettings({ presetId: 'sakura', accent: null, bubbleStyle: null, wallpaper: getThemePreset('sakura').wallpaper ?? 'none', wallpaperScope: 'window', wallpaperDim: 55 })}>樱花 + 整窗背景</button>
        <button type="button" style={button} data-harness="preset-reset" onClick={() => useKukeStore.getState().resetThemeSettings()}>恢复默认主题</button>
        {(['available', 'downloading', 'ready', 'upToDate', 'error'] as UpdatePhase[]).map((phase) => <button key={phase} type="button" style={button} data-harness={`update-${phase}`} onClick={() => showUpdate(phase)}>更新:{phase}</button>)}
        <button type="button" style={button} data-harness="updated" onClick={() => useDesktopUpdate.setState({ justUpdatedTo: '1.4.0' })}>已更新提示</button>
      </div>
      <div style={{ position: 'relative', minHeight: 0, flex: 1 }}>
        {shell === 'float' ? <WindowFrame>{body}</WindowFrame> : (
          <main data-theme={theme} data-layout="desktop" data-font-scale={1} data-kc-wallpaper={themeRoot['data-kc-wallpaper']} style={themeRoot.style} className="kc-desktop-app relative flex h-full min-h-0 flex-col overflow-hidden [color:var(--kc-text)]">
            <ThemeEffects scheme={theme} />
            <TauriTitleBar />
            <div className="kc-desktop-content relative z-0 min-h-0 flex-1 overflow-hidden [background:var(--kc-window)]">{body}</div>
            <DesktopUpdateDialog />
            <DesktopJustUpdatedNotice />
          </main>
        )}
      </div>
    </div>
  );
}

installMocks();
// 和真实应用同源：换一个存储键，免得把开发时真实的登录状态和主题设置冲掉
useKukeStore.persist.setOptions({ name: 'kukechat-settings-harness' });
// 登录成功还会改「记住用户名 / IP 登录」这两个键，同样拦掉
for (const method of ['setItem', 'removeItem'] as const) {
  const original = Storage.prototype[method] as (this: Storage, ...args: string[]) => void;
  Storage.prototype[method] = function (this: Storage, ...args: string[]): void {
    if (!args[0].startsWith('kukechat-remember')) {
      original.apply(this, args);
    }
  };
}
const mobileLayout = params.get('layout') === 'mobile';
const loggedIn = mobileLayout || params.get('user') === '1' || params.get('view') === 'settings';
const preset = params.get('preset');
const wallpaper = params.get('wallpaper');
useKukeStore.setState({
  token: loggedIn ? 'harness' : null,
  currentUser: loggedIn ? me : null,
  layoutMode: mobileLayout ? 'mobile' : 'desktop',
  themeMode: params.get('theme') === 'dark' ? 'dark' : 'light',
  isOpen: true,
  isMinimized: params.get('bubble') === '1',
  isFullscreen: false,
  position: { x: 48, y: 64 },
  minimizedPosition: { x: 80, y: 120 },
  size: { width: Number(params.get('w')) || 980, height: Number(params.get('h')) || 640 },
  unreadCount: Number(params.get('unread')) || 0,
  onlineCount: onlineUsers.length,
  accountSuspension: null,
  themeSettings: { ...DEFAULT_THEME_SETTINGS, ...(preset ? { presetId: preset, wallpaper: getThemePreset(preset).wallpaper ?? 'none' } : {}), ...(wallpaper === 'window' || wallpaper === 'chat' ? { wallpaperScope: wallpaper, wallpaperDim: 55 } : {}) }
});

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, staleTime: Infinity } } });
createRoot(document.getElementById('root') as HTMLElement).render(
  <QueryClientProvider client={queryClient}>
    <Harness />
  </QueryClientProvider>
);

const update = params.get('update') as UpdatePhase | null;
if (update) {
  // 对话框挂在 .kc-desktop-app 上，要等它先渲染出来
  window.setTimeout(() => showUpdate(update), 300);
}
