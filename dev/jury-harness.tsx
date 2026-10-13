/**
 * 风纪页的本地预览：不连后端，用假数据（jury-mock.ts）驱动真实组件。
 *
 *   http://127.0.0.1:5180/dev/jury-harness.html
 *
 * 初始状态可以写在地址里，方便截图（取值见 jury-mock.ts 的 JuryScenario）：
 *   ?identity=ineligible|eligible|applied|active|expired|rejected|suspended   tier=none|trainee|regular|senior
 *   case=message|post|images|recalled|long|quality   queue=cases|empty|limit|restricted|not_juror
 *   after=open|closed   opinions=empty|few|many   bulletin=many|empty   backend=v2|legacy|low|cold   fail=1
 *   section=overview|desk|mine|bulletin|handbook|…   caseId=1287   tab=guide
 *   theme=dark   preset=sakura   wallpaper=window   material=solid|translucent|frost|crystal   font=0..4   shell=float   w=980 h=640
 *
 * 脚本测试用 window.__jury：set(patch) 改场景、state 读场景、requests 看发过哪些请求、store / queryClient。
 * 只用于开发时看界面，不会进入任何构建产物。
 */
import { useState, type CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@/styles/tailwind.css';
import { juryMock, preparePictures, requestLog, scenario, type JuryScenario } from './jury-mock';
// 三期（资深工作台、判例、议事厅 …）的场景、控制条和假接口，说明见这两个文件的文件头
import { Phase3Controls, readPhase3Params } from './jury-harness-senior';
import { withPhase3 } from './jury-mock-senior';
// 二期（考试、练习场、风纪值、层级、成就、排行榜 …）的场景、控制条和假接口，说明见这两个文件的文件头
import { GrowthControls, readGrowthParams } from './jury-harness-growth';
import { withGrowth } from './jury-mock-growth';
import { JuryPage } from '@/components/jury/JuryPage';
import { useJuryPendingCount } from '@/components/jury/data/queries';
import { DesktopSettingsPanel } from '@/components/settings/desktop/DesktopSettingsPanel';
import { NavRail } from '@/components/shell/NavRail';
import { WindowFrame } from '@/components/window/WindowFrame';
import { useKukeStore, type JurySection, type UiFontScale } from '@/store/kukeStore';
import { ThemeEffects } from '@/theme/ThemeEffects';
import { DEFAULT_THEME_SETTINGS, getThemePreset, MATERIAL_PRESETS } from '@/theme/themes';
import { useThemeRootProps } from '@/theme/useTheme';
import type { User } from '@/types/api';

const params = new URLSearchParams(window.location.search);
const me = { id: 1, username: 'kuke', nickname: '酷可mc' } as User;

const OPTIONS: { [Key in keyof JuryScenario]?: Array<JuryScenario[Key]> } = {
  identity: ['ineligible', 'eligible', 'applied', 'active', 'expired', 'rejected', 'suspended'],
  tier: ['none', 'trainee', 'regular', 'senior'],
  caseKind: ['message', 'post', 'images', 'recalled', 'long', 'quality'],
  queue: ['cases', 'empty', 'limit', 'restricted', 'not_juror'],
  after: ['open', 'closed'],
  opinions: ['empty', 'few', 'many'],
  bulletin: ['many', 'empty'],
  backend: ['v2', 'legacy', 'low', 'cold']
};
const LABELS: Record<string, string> = { identity: '身份', tier: '层级', caseKind: '案件', queue: '队列', after: '投后', opinions: '观点区', bulletin: '公示栏', backend: '后端' };
const PARAM_NAMES: Record<string, string> = { caseKind: 'case' };

function readScenarioFromUrl(): void {
  for (const key of Object.keys(OPTIONS) as Array<keyof JuryScenario>) {
    const value = params.get(PARAM_NAMES[key] ?? key);
    if (value && (OPTIONS[key] as string[]).includes(value)) {
      (scenario as unknown as Record<string, unknown>)[key] = value;
    }
  }
  scenario.voteFails = params.get('fail') === '1';
}

function installFetch(): void {
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, window.location.origin);
    if (!url.pathname.includes('/api/v1/')) {
      return realFetch(input, init);
    }
    const path = url.pathname.replace(/^.*\/api\/v1/, '');
    const method = (init?.method ?? 'GET').toUpperCase();
    let body: unknown;
    try {
      body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    } catch {
      body = undefined;
    }
    await new Promise((resolve) => window.setTimeout(resolve, scenario.delay));
    // 预览页绝不把请求放到真实后端去：不认识的接口一律返回空
    return (await withPhase3(withGrowth(juryMock))({ path, url, method, body })) ?? new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
}

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });

function applyScenario(patch: Partial<JuryScenario>): void {
  Object.assign(scenario, patch);
  void queryClient.resetQueries({ queryKey: ['jury'] });
}

function Dashboard(): JSX.Element {
  const view = useKukeStore((state) => state.workspaceView);
  const setWorkspaceView = useKukeStore((state) => state.setWorkspaceView);
  const pending = useJuryPendingCount(true);
  return (
    <div style={{ display: 'grid', height: '100%', minHeight: 0, gridTemplateColumns: '56px minmax(0, 1fr)', overflow: 'hidden', background: 'var(--kc-window)', color: 'var(--kc-text)' }}>
      <NavRail view={view} unreadCount={5} hasUnseenAnnouncement={false} juryPendingCount={pending} onNavigate={setWorkspaceView} onCreateGroup={() => undefined} onOpenAnnouncement={() => undefined} onOpenSettings={() => setWorkspaceView('settings')} />
      {/* data-kc-surface="page" 相当于主界面里包着每个页面的 .kc-pc-view：整窗背景 + 玻璃材质下，页面整块垫模糊的背景 */}
      <main data-kc-surface="page" style={{ minWidth: 0, minHeight: 0, overflow: 'hidden', background: 'var(--kc-chat)' }}>
        {view === 'jury' ? <JuryPage />
          : view === 'settings' ? <DesktopSettingsPanel user={me} />
          : <p data-harness="other-view" style={{ padding: 32, color: 'var(--kc-muted)' }}>这里是「{view}」工作区的占位。用上面的按钮从这里直达风纪页的某个板块。</p>}
      </main>
    </div>
  );
}

function Harness(): JSX.Element {
  const [, rerender] = useState(0);
  const [theme, setTheme] = useState<'light' | 'dark'>(params.get('theme') === 'dark' ? 'dark' : 'light');
  const [shell, setShell] = useState<'tauri' | 'float'>(params.get('shell') === 'float' ? 'float' : 'tauri');
  const fontScale = useKukeStore((state) => state.uiFontScale);
  const themeRoot = useThemeRootProps(theme);
  const button: CSSProperties = { padding: '2px 8px', border: '1px solid #9aa1b1', borderRadius: 6, background: '#fff', color: '#12141a', font: '12px sans-serif', cursor: 'pointer' };
  const label: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, font: '12px sans-serif', color: '#12141a' };
  const open = (section: JurySection, extra?: { caseId?: number; tab?: string }): void => useKukeStore.getState().openJury({ section, ...extra });

  return (
    <div style={{ display: 'flex', height: '100%', flexDirection: 'column' }}>
      <div data-harness="controls" style={{ display: 'flex', flex: 'none', flexWrap: 'wrap', alignItems: 'center', gap: 6, padding: 6, background: '#e3e6ee' }}>
        {(Object.keys(OPTIONS) as Array<keyof JuryScenario>).map((key) => (
          <label key={key} style={label}>{LABELS[key]}
            <select data-harness={key} value={String(scenario[key])} style={{ font: '12px sans-serif' }} onChange={(event) => {
              applyScenario({ [key]: event.target.value } as Partial<JuryScenario>);
              rerender((value) => value + 1);
            }}>
              {(OPTIONS[key] as string[]).map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
        ))}
        <label style={label}><input type="checkbox" data-harness="fail" checked={scenario.voteFails} onChange={(event) => {
          scenario.voteFails = event.target.checked;
          rerender((value) => value + 1);
        }} />投票失败</label>
        <Phase3Controls initialReportDialog={params.get('reportDialog') === '1'} onChange={() => {
          void queryClient.resetQueries();
          rerender((value) => value + 1);
        }} />
        <GrowthControls initialCard={params.get('card') === '1'} onChange={() => {
          void queryClient.resetQueries();
          rerender((value) => value + 1);
        }} />
        <button type="button" style={button} data-harness="theme" onClick={() => {
          const next = theme === 'light' ? 'dark' : 'light';
          setTheme(next);
          useKukeStore.setState({ themeMode: next });
        }}>深浅色</button>
        <button type="button" style={button} data-harness="preset" onClick={() => useKukeStore.getState().updateThemeSettings({ presetId: 'sakura', accent: null, bubbleStyle: null, wallpaper: getThemePreset('sakura').wallpaper ?? 'none', wallpaperScope: 'window', wallpaperDim: 55 })}>樱花 + 整窗背景</button>
        <button type="button" style={button} data-harness="preset-reset" onClick={() => useKukeStore.getState().resetThemeSettings()}>默认主题</button>
        <label style={label}>字号
          <select data-harness="font" value={fontScale} style={{ font: '12px sans-serif' }} onChange={(event) => useKukeStore.setState({ uiFontScale: Number(event.target.value) as UiFontScale })}>
            {[0, 1, 2, 3, 4].map((scale) => <option key={scale} value={scale}>{scale}</option>)}
          </select>
        </label>
        <button type="button" style={button} data-harness="shell" onClick={() => setShell(shell === 'tauri' ? 'float' : 'tauri')}>外框：{shell === 'tauri' ? '桌面端' : '扩展浮窗'}</button>
        <button type="button" style={button} data-harness="realtime" onClick={() => void queryClient.invalidateQueries({ queryKey: ['jury'] })}>模拟 jury.status.changed</button>
        <button type="button" style={button} data-harness="go-chat" onClick={() => useKukeStore.getState().setWorkspaceView('chat')}>去聊天页</button>
        <button type="button" style={button} data-harness="open-desk" onClick={() => open('desk')}>直达评审台</button>
        <button type="button" style={button} data-harness="open-mine-case" onClick={() => open('mine', { caseId: 1287 })}>直达我的评审 #1287</button>
        <button type="button" style={button} data-harness="open-guide" onClick={() => open('handbook', { tab: 'guide' })}>直达委员须知</button>
      </div>
      <div style={{ position: 'relative', minHeight: 0, flex: 1 }}>
        {shell === 'float' ? <WindowFrame><Dashboard /></WindowFrame> : (
          <main data-theme={theme} data-layout="desktop" data-font-scale={fontScale} data-kc-wallpaper={themeRoot['data-kc-wallpaper']} style={{ ...themeRoot.style, display: 'flex', height: '100%', minHeight: 0, flexDirection: 'column', overflow: 'hidden' }} className="kc-desktop-app">
            <ThemeEffects scheme={theme} />
            <div className="kc-desktop-content" style={{ position: 'relative', zIndex: 0, minHeight: 0, flex: 1, overflow: 'hidden' }}><Dashboard /></div>
          </main>
        )}
      </div>
    </div>
  );
}

async function start(): Promise<void> {
  readScenarioFromUrl();
  readPhase3Params(params);
  readGrowthParams(params, queryClient);
  await preparePictures();
  installFetch();
  // 和真实应用同源：换一个存储键，免得把开发时真实的登录状态和主题设置冲掉
  useKukeStore.persist.setOptions({ name: 'kukechat-jury-harness' });
  const preset = params.get('preset');
  const wallpaper = params.get('wallpaper');
  // ?material=solid|translucent|frost|crystal：外观里的材质（crystal 是「通透」）
  const materialParam = params.get('material');
  const material = materialParam === 'solid' || materialParam === 'translucent' || materialParam === 'frost' || materialParam === 'crystal' ? materialParam : null;
  const section = params.get('section') as JurySection | null;
  const font = Number(params.get('font') ?? 1);
  useKukeStore.setState({
    token: 'harness',
    currentUser: me,
    layoutMode: 'desktop',
    themeMode: params.get('theme') === 'dark' ? 'dark' : 'light',
    uiFontScale: (font >= 0 && font <= 4 ? font : 1) as UiFontScale,
    isOpen: true,
    isMinimized: false,
    isFullscreen: false,
    position: { x: 24, y: 24 },
    size: { width: Number(params.get('w')) || 980, height: Number(params.get('h')) || 640 },
    workspaceView: 'jury',
    pendingJuryRoute: section ? { section, caseId: params.get('caseId') ? Number(params.get('caseId')) : null, tab: params.get('tab'), itemId: params.get('itemId') ? Number(params.get('itemId')) : null } : null,
    themeSettings: { ...DEFAULT_THEME_SETTINGS, ...(preset ? { presetId: preset, wallpaper: getThemePreset(preset).wallpaper ?? 'none' } : {}), ...(wallpaper === 'window' || wallpaper === 'chat' ? { wallpaperScope: wallpaper, wallpaperDim: 55 } : {}), ...(material ? { material, materials: MATERIAL_PRESETS[material] } : {}) }
  });
  // 预览页不记「上次所在的板块」，每次都从地址指定的（或总览）开始
  try {
    if (!section) window.localStorage.removeItem('kukechat:jury-section');
  } catch {
    // 存储不可用时无所谓
  }
  (window as unknown as { __jury: unknown }).__jury = { set: applyScenario, state: scenario, requests: requestLog, store: useKukeStore, queryClient };
  createRoot(document.getElementById('root') as HTMLElement).render(
    <QueryClientProvider client={queryClient}>
      <Harness />
    </QueryClientProvider>
  );
}

void start();
