/**
 * 动态页的本地预览：不连后端，用假数据（posts-harness.mock.ts）驱动真实组件。
 *
 *   http://127.0.0.1:5180/dev/posts-harness.html
 *
 * 地址栏参数可以直接指定初始状态，方便截图：
 *   ?theme=dark            深色
 *   ?preset=sakura         主题预设；再加 &wall=1 是整窗背景
 *   ?data=empty|slow       没有数据 / 一直加载中
 *   ?space=6               直接打开某个人的空间（1 是自己）
 *   ?post=70               跳到某条动态（不在第一页的会被单独取回来；9999 不存在）
 *   ?view=creators         单独渲染「大佬入住」（主页入口的用法；从动态页进去请点顶栏的页签）
 *   ?delay=2500            大佬名单晚这么多毫秒才回来（看片头等数据的那一段）
 *   ?controls=0            隐藏左边的控制栏
 *
 * 只用于开发时看界面，不会进入任何构建产物。
 */
import { useState, type CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@/styles/tailwind.css';
import { CcwCreatorsPage } from '@/components/posts/CcwCreatorsPage';
import { resetCreatorsIntro } from '@/components/posts/desktop/creators/CreatorsView';
import { PostsPanel } from '@/components/posts/PostsPanel';
import { NavRail } from '@/components/shell/NavRail';
import { useKukeStore } from '@/store/kukeStore';
import { ThemeEffects } from '@/theme/ThemeEffects';
import { DEFAULT_THEME_SETTINGS, THEME_PRESETS, themeVariables, wallpaperMode, type ThemeSettings } from '@/theme/themes';
import { createPostsMock, installPostsMock, me, type PostsMock } from './posts-harness.mock';

const params = new URLSearchParams(window.location.search);
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, staleTime: Infinity } } });

function Harness({ mock }: { mock: PostsMock }): JSX.Element {
  const [theme, setTheme] = useState<'light' | 'dark'>(params.get('theme') === 'dark' ? 'dark' : 'light');
  // 主题设置只放在这一页的状态里，不写进 store：store 会存进 localStorage，别的预览页是同一个源
  const [settings, setSettings] = useState<ThemeSettings>(() => {
    const preset = THEME_PRESETS.find((item) => item.id === params.get('preset'));
    return { ...DEFAULT_THEME_SETTINGS, presetId: preset?.id ?? 'classic', wallpaper: params.get('wall') === '1' ? preset?.wallpaper ?? 'aurora' : 'none', wallpaperScope: 'window' };
  });
  const [, rerender] = useState(0);
  // 改这个数会把页面整个重挂一遍：重播片头用
  const [replay, setReplay] = useState(0);
  // dev/ 不在 Tailwind 的扫描范围里，预览页自己的样式一律写内联
  const controlStyle: CSSProperties = { padding: '7px 10px', border: '1px solid var(--kc-border-strong)', borderRadius: 7, background: 'var(--kc-panel)', textAlign: 'left' };
  const setFlags = (patch: Partial<PostsMock['flags']>): void => {
    Object.assign(mock.flags, patch);
    rerender((value) => value + 1);
    void queryClient.resetQueries();
  };
  const nextPreset = (): void => setSettings((current) => {
    const preset = THEME_PRESETS[(THEME_PRESETS.findIndex((item) => item.id === current.presetId) + 1) % THEME_PRESETS.length];
    return { ...current, presetId: preset.id, wallpaper: current.wallpaper === 'none' ? 'none' : preset.wallpaper ?? 'aurora' };
  });
  const data = mock.flags.empty ? 'empty' : mock.flags.slow ? 'slow' : 'normal';

  return (
    // 加上 kc-window-frame：对话框、看图、举报这些浮层会挂到它上面，和正式环境一样能拿到主题变量
    <main
      className="kc-window-frame"
      data-theme={theme}
      data-layout="desktop"
      data-font-scale={1}
      data-kc-wallpaper={wallpaperMode(settings, theme, null)}
      style={{ ...themeVariables(settings, theme, null), position: 'relative', display: 'flex', height: '100%', minHeight: 0, background: 'var(--kc-window)', color: 'var(--kc-text)' }}
    >
      <aside data-harness="controls" style={{ display: params.get('controls') === '0' ? 'none' : 'flex', width: 168, flex: 'none', flexDirection: 'column', gap: 8, padding: 12, fontSize: 13, borderRight: '1px solid var(--kc-border)', background: 'var(--kc-list)' }}>
        <strong>预览控制</strong>
        <button type="button" data-harness="theme" style={controlStyle} onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>切换深浅色</button>
        <button type="button" data-harness="preset" style={controlStyle} onClick={nextPreset}>主题：{THEME_PRESETS.find((item) => item.id === settings.presetId)?.name}</button>
        <button type="button" data-harness="wall" style={controlStyle} onClick={() => setSettings((current) => ({ ...current, wallpaper: current.wallpaper === 'none' ? THEME_PRESETS.find((item) => item.id === current.presetId)?.wallpaper ?? 'aurora' : 'none' }))}>整窗背景：{settings.wallpaper === 'none' ? '关' : '开'}</button>
        <button type="button" data-harness="data" style={controlStyle} onClick={() => setFlags(data === 'normal' ? { empty: true, slow: false } : data === 'empty' ? { empty: false, slow: true } : { empty: false, slow: false })}>数据：{data === 'normal' ? '正常' : data === 'empty' ? '空' : '加载中'}</button>
        <button type="button" data-harness="realtime" style={controlStyle} onClick={() => {
          mock.receivePost();
          // 和 realtime/client.ts 收到 post.created 时做的事一样
          void queryClient.invalidateQueries({ queryKey: ['posts'] });
          void queryClient.invalidateQueries({ queryKey: ['post-topics'] });
        }}>收到一条新动态</button>
        <button type="button" data-harness="space-me" style={controlStyle} onClick={() => useKukeStore.getState().openUserSpace(1)}>打开我的空间</button>
        <button type="button" data-harness="space-other" style={controlStyle} onClick={() => useKukeStore.getState().openUserSpace(6)}>打开别人的空间</button>
        <button type="button" data-harness="space-empty" style={controlStyle} onClick={() => useKukeStore.getState().openUserSpace(4)}>打开没发过动态的人</button>
        <button type="button" data-harness="open-old" style={controlStyle} onClick={() => useKukeStore.getState().openPost(70)}>跳到一条很早的动态</button>
        <button type="button" data-harness="open-missing" style={controlStyle} onClick={() => useKukeStore.getState().openPost(9999)}>跳到已删除的动态</button>
        <button type="button" data-harness="creators-fail" style={controlStyle} onClick={() => setFlags({ creatorsFail: !mock.flags.creatorsFail })}>大佬名单：{mock.flags.creatorsFail ? '加载失败' : '正常'}</button>
        <button type="button" data-harness="replay-intro" style={controlStyle} onClick={() => {
          resetCreatorsIntro();
          queryClient.removeQueries({ queryKey: ['ccw-creators'] });
          setReplay((value) => value + 1);
        }}>重播片头（完整版）</button>
        <button type="button" data-harness="replay-short" style={controlStyle} onClick={() => setReplay((value) => value + 1)}>再进一次（精简版）</button>
        <button type="button" data-harness="creators-delay" style={controlStyle} onClick={() => setFlags({ creatorsDelay: mock.flags.creatorsDelay ? 0 : 2500 })}>名单延迟：{mock.flags.creatorsDelay ? '2.5 秒' : '无'}</button>
        <button type="button" data-harness="friend" style={controlStyle} onClick={() => setFlags({ friendOfAqua: !mock.flags.friendOfAqua })}>阿夸：{mock.flags.friendOfAqua ? '是好友' : '不是好友'}</button>
      </aside>
      <ThemeEffects scheme={theme} settings={settings} />
      <NavRail view="posts" unreadCount={3} hasUnseenAnnouncement={false} onNavigate={() => undefined} onCreateGroup={() => undefined} onOpenAnnouncement={() => undefined} onOpenSettings={() => undefined} />
      {/* 和 ChatDashboard 里的 <main> 一样：画布色铺在这一层，动态页自己不再铺一遍 */}
      <div data-kc-surface="page" style={{ minWidth: 0, flex: 1, overflow: 'hidden', background: 'var(--kc-chat)' }}>
        {params.get('view') === 'creators'
          ? <CcwCreatorsPage key={replay} isMobile={false} onBack={() => undefined} onOpenUserSpace={(_user, id) => window.alert(`打开用户 ${id} 的空间`)} />
          : <PostsPanel key={replay} currentUser={me} isMobile={false} />}
      </div>
    </main>
  );
}

async function start(): Promise<void> {
  const mock = await createPostsMock();
  const data = params.get('data');
  mock.flags.empty = data === 'empty';
  mock.flags.slow = data === 'slow';
  mock.flags.creatorsDelay = Number(params.get('delay') ?? 0);
  installPostsMock(mock);
  useKukeStore.setState({
    token: 'harness',
    currentUser: me,
    layoutMode: 'desktop',
    themeMode: 'light',
    workspaceView: 'posts',
    pendingUserSpaceId: params.get('space') ? Number(params.get('space')) : null,
    pendingPostId: params.get('post') ? Number(params.get('post')) : null
  });
  createRoot(document.getElementById('root') as HTMLElement).render(
    <QueryClientProvider client={queryClient}>
      <Harness mock={mock} />
    </QueryClientProvider>
  );
}

void start();
