/**
 * 资料点赞的本地预览：不连后端，用假数据（dev/mocks/profileLikes.ts）驱动真实组件。
 *
 *   npx vite --port 5188 --strictPort --host 127.0.0.1   →   http://127.0.0.1:5188/dev/likes-harness.html
 *
 * 四个画面（view）：
 *   gallery  点赞按钮的每一种状态排成一列，下面是「我收到的赞」和「谁赞了我」的名单
 *   card     别人的资料卡（桌面 UserCardDesktop / 移动 UserCard）
 *   space    个人空间（桌面是真的动态页 PostsPanel，移动是 MobileUserProfilePage）
 *   self     桌面：点标题栏上自己的头像弹出「我的资料卡」（标题栏是照 DesktopTitleBar 抄的）
 * 桌面布局下标题栏一直在，所以任何画面里都能点开自己的资料卡；在名单里点人会真的跳到他的空间。
 *
 * 初始状态可以写在地址里，方便截图：
 *   view=gallery|card|space|self   layout=desktop|mobile   theme=dark   font=0..4   perf=1（性能优先，不放动画）
 *   user=2..7（card / space 看谁；1 是自己，7 是机器人）   open=1（self：一进来就点开资料卡）   likes=1（再点开「谁赞了我」）
 *   backend=missing|error（服务端没有资料点赞 / 探测出错）   field=0（用户对象上没有 profile_like_count）
 *   fail=already|limit|muted|notfound|server|network|gone（点赞时强行返回的错误）
 *   muted=1（我被禁言）   limit=1（今天的名额用完了）   state=fail（点赞状态取不到）
 *   received=fail|empty（名单取不到 / 没有人赞过我）   today=0（今天还没人赞我）   delay=毫秒
 *
 * 脚本测试用 window.__likes：scenario / requests / state / store / queryClient / receive(times)。
 * 只用于开发时看界面，不会进入任何构建产物。
 */
import { useRef, useState, type CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@/styles/tailwind.css';
import { featureMocks } from './mocks';
import { levelState } from './mocks/level';
import { likeFan, likeRequests, likeScenario, likeState, type LikeFailure } from './mocks/profileLikes';
import { createPostsMock, me, people, type PostsMock } from './posts-harness.mock';
import { useLevelRules } from '@/components/level/data';
import { handleProfileLikeEvent, likeKeys } from '@/components/likes/data';
import { LikedByList } from '@/components/likes/LikedByList';
import { MyLikesButton, ProfileLikeButton } from '@/components/likes/ProfileLikeButton';
import { ProfileLikeToasts } from '@/components/likes/ProfileLikeToasts';
import { PostsPanel } from '@/components/posts/PostsPanel';
import { NavRail } from '@/components/shell/NavRail';
import { getDisplayName } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { MobileUserProfilePage } from '@/components/ui/MobileUserProfilePage';
import { UserCard } from '@/components/ui/UserCard';
import { SelfCardTrigger } from '@/components/window/SelfCardTrigger';
import { emitRealtimeEvent } from '@/realtime/events';
import { useKukeStore, type UiFontScale } from '@/store/kukeStore';
import { useLevelStore } from '@/store/levelStore';
import { useModerationStore } from '@/store/moderationStore';
import { ThemeEffects } from '@/theme/ThemeEffects';
import { DEFAULT_THEME_SETTINGS } from '@/theme/themes';
import { useThemeStore } from '@/theme/themeStore';
import { useThemeRootProps } from '@/theme/useTheme';
import type { User } from '@/types/api';

const params = new URLSearchParams(window.location.search);
type View = 'gallery' | 'card' | 'space' | 'self';
const VIEWS: View[] = ['gallery', 'card', 'space', 'self'];
const view = (VIEWS.includes(params.get('view') as View) ? params.get('view') : 'gallery') as View;
const layout: 'desktop' | 'mobile' = params.get('layout') === 'mobile' ? 'mobile' : 'desktop';
const FAILURES: LikeFailure[] = ['none', 'already', 'limit', 'muted', 'notfound', 'server', 'network', 'gone'];

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });

const bot = { id: 7, username: 'task_helper', nickname: '任务小助手', bio: '我是一个机器人，负责提醒大家交作业。', is_bot: true } as User;
const everyone: User[] = [...people, bot];
const targetId = Number(params.get('user') ?? 2) || 2;
const findUser = (id: number): User => everyone.find((user) => user.id === id) ?? everyone[1];

/** 每个人各是一种情形：按钮的每一种状态在 gallery 里都看得到 */
const SAMPLES: Array<{ id: number; note: string; count: number; liked?: boolean }> = [
  { id: 2, note: '可以点 · 6024 缩写成 6.0k', count: 6024 },
  { id: 3, note: '今天已经赞过', count: 128, liked: true },
  { id: 4, note: '还没有人赞过', count: 0 },
  { id: 5, note: '上万 · 15800', count: 15800 },
  { id: 6, note: '差一个到一千 · 999', count: 999 },
  { id: 7, note: '机器人', count: 42 }
];

/* ───────── 假后端 ───────── */

function installFetch(mock: PostsMock): void {
  const realFetch = window.fetch.bind(window);
  const respond = (data: unknown, status = 200): Response => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
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
    for (const handler of featureMocks) {
      // 假接口抛错就是「请求发不出去」：让它原样变成 fetch 的失败
      const mocked = await handler({ path, url, method, body });
      if (mocked) {
        return mocked;
      }
    }
    await new Promise((resolve) => window.setTimeout(resolve, 120));
    const online = path.match(/^\/users\/(\d+)\/online$/);
    if (online) {
      const id = Number(online[1]);
      const isOnline = id === 1 ? params.get('online') !== '0' : id % 2 === 0;
      return respond({ user_id: id, online: isOnline, presence_status: isOnline ? 'online' : 'offline' });
    }
    const profile = path.match(/^\/users\/(\d+)$/);
    if (profile) {
      const id = Number(profile[1]);
      const user = id === 1 ? useKukeStore.getState().currentUser ?? me : everyone.find((item) => item.id === id) ?? likeFan(id);
      return user ? respond(user) : respond({ detail: { code: 'user_not_found', message: '用户不存在' } }, 404);
    }
    if (path === '/moderation/me') {
      return respond({ muted_until: null, mute_reason: null });
    }
    // 其余的交给动态页的假后端；它不认识的接口一律返回空，不会漏到真实后端去
    const result = mock.handle({ path, url, method, body });
    return result instanceof Response ? result : respond(result ?? null);
  };
}

/** 和 src/realtime/client.ts 收到 user.profile.liked 时做的事一样：先让缓存跟上，再把事件分发出去（提示订阅的是它） */
function receive(times = 1): void {
  const data = likeState.receive(times);
  if (!data) {
    return;
  }
  handleProfileLikeEvent(queryClient, data);
  emitRealtimeEvent({ type: 'unknown', rawType: 'user.profile.liked', data, receivedAt: new Date().toISOString() });
}

function resetLikes(): void {
  void queryClient.resetQueries({ queryKey: likeKeys.root });
}

/* ───────── 画面 ───────── */

function Probe(): null {
  // 真实应用里这一句在 ChatDashboard；单独预览某个界面时由预览页自己探测
  useLevelRules();
  return null;
}

function Gallery(): JSX.Element {
  const currentUser = useKukeStore((state) => state.currentUser) ?? me;
  const [listOpen, setListOpen] = useState(params.get('likes') === '1');
  const [note, setNote] = useState('');
  const row: CSSProperties = { display: 'grid', gridTemplateColumns: layout === 'mobile' ? 'minmax(0, 1fr) auto' : '220px 150px minmax(0, 1fr)', alignItems: 'center', gap: 12, minHeight: 40 };
  const box: CSSProperties = { padding: '10px 14px', borderRadius: 10, background: 'var(--kc-panel)' };
  const title: CSSProperties = { margin: '0 0 6px', color: 'var(--kc-muted)', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em' };
  return (
    <div data-harness="gallery" style={{ display: 'grid', gap: 12, alignContent: 'start', height: '100%', overflowY: 'auto', padding: layout === 'mobile' ? '56px 12px 24px' : 20 }}>
      <section style={box}>
        <h3 style={title}>点赞按钮</h3>
        {SAMPLES.map((sample) => {
          const user = findUser(sample.id);
          return (
            <div key={sample.id} data-sample={sample.id} style={row}>
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 }}>{getDisplayName(user)}</span>
              {layout === 'mobile' ? null : <span style={{ color: 'var(--kc-muted)', fontSize: 12 }}>{sample.note}</span>}
              <span style={{ justifySelf: layout === 'mobile' ? 'end' : 'start' }}><ProfileLikeButton user={user} align={layout === 'mobile' ? 'end' : 'start'} /></span>
            </div>
          );
        })}
        <div data-sample="1" style={row}>
          <span style={{ fontSize: 13 }}>{getDisplayName(currentUser)}（自己）</span>
          {layout === 'mobile' ? null : <span style={{ color: 'var(--kc-muted)', fontSize: 12 }}>别人的资料卡组件里看到自己</span>}
          <span style={{ justifySelf: layout === 'mobile' ? 'end' : 'start' }}><ProfileLikeButton user={currentUser} align={layout === 'mobile' ? 'end' : 'start'} /></span>
        </div>
      </section>
      <section style={box}>
        <h3 style={title}>我收到的赞</h3>
        <div data-sample="mine" style={{ display: 'flex', alignItems: 'center', gap: 16, minHeight: 44, paddingTop: 6 }}>
          <MyLikesButton user={currentUser} open={listOpen} popup="inline" onPress={() => setListOpen((value) => !value)} />
          <span style={{ color: 'var(--kc-muted)', fontSize: 12 }}>点它展开 / 收起下面的名单{note ? ` · ${note}` : ''}</span>
        </div>
      </section>
      {listOpen ? (
        <section data-sample="list" style={{ ...box, maxWidth: 360 }}>
          <h3 style={title}>谁赞了我</h3>
          <LikedByList user={currentUser} onOpenUser={(user) => setNote(`点了 ${getDisplayName(user)}`)} />
        </section>
      ) : null}
    </div>
  );
}

function CardStage(): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(true);
  const [note, setNote] = useState('');
  const user = targetId === 1 ? useKukeStore.getState().currentUser ?? me : findUser(targetId);
  return (
    <div ref={containerRef} data-harness="card-stage" style={{ position: 'relative', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: 24, color: 'var(--kc-muted)', fontSize: 13 }}>
        <button type="button" data-harness="reopen" style={{ padding: '4px 10px', border: '1px solid var(--kc-border-strong)', borderRadius: 7 }} onClick={() => setOpen(true)}>再点开资料卡</button>
        {note ? <span style={{ marginLeft: 12 }}>{note}</span> : null}
      </div>
      {open ? <UserCard user={user} anchor={{ left: 190, top: 90 }} containerRef={containerRef} action={user.is_bot ? undefined : { label: '发消息', onClick: () => setNote('点了发消息') }} onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

function MobileSpace(): JSX.Element {
  const currentUser = useKukeStore((state) => state.currentUser) ?? me;
  const [note, setNote] = useState('');
  const user = targetId === 1 ? currentUser : findUser(targetId);
  return (
    <>
      <MobileUserProfilePage user={user} fallbackUserId={user.id} currentUserId={currentUser.id} currentUser={currentUser} onClose={() => setNote('点了返回')} />
      {note ? <p data-harness="mobile-note" style={{ position: 'fixed', zIndex: 2147483647, right: 8, bottom: 8, left: 8, padding: '6px 10px', borderRadius: 8, background: '#111827', color: '#fff', font: '12px sans-serif' }} onClick={() => setNote('')}>{note}</p> : null}
    </>
  );
}

/* ───────── 桌面端的外壳：照 DesktopTitleBar 抄的标题栏 + 导航栏 + 内容 ───────── */

function ReplicaTitleBar(): JSX.Element {
  const currentUser = useKukeStore((state) => state.currentUser);
  const name = currentUser ? getDisplayName(currentUser) : 'KukeChat';
  return (
    <header className="kwf-titlebar" data-harness="titlebar">
      <div className="kwf-identity">
        {currentUser ? <SelfCardTrigger user={currentUser} label={name} /> : <h1 className="kwf-title">{name}</h1>}
        {currentUser ? <span className="kwf-bio">{currentUser.bio?.trim() || '咕咕咕~'}</span> : null}
      </div>
      <div className="kwf-controls">
        <button type="button" className="kwf-control" aria-label="最小化窗口"><Icon name="minus" className="h-4 w-4" /></button>
        <button type="button" className="kwf-control kwf-control--close" aria-label="隐藏到托盘"><Icon name="close" className="h-4 w-4" /></button>
      </div>
    </header>
  );
}

function DesktopApp(): JSX.Element | null {
  const currentUser = useKukeStore((state) => state.currentUser);
  const theme = useKukeStore((state) => (state.themeMode === 'dark' ? 'dark' : 'light'));
  const fontScale = useKukeStore((state) => state.uiFontScale);
  const workspaceView = useKukeStore((state) => state.workspaceView);
  const themeRoot = useThemeRootProps(theme);
  if (!currentUser) {
    return null;
  }
  // 点了「我的主页」、或者在名单里点了某个人：store 把工作区切到动态页，这里就换成真的动态页
  const showPosts = view === 'space' || workspaceView === 'posts';
  return (
    <main
      data-theme={theme}
      data-layout="desktop"
      data-font-scale={fontScale}
      data-kc-wallpaper={themeRoot['data-kc-wallpaper']}
      style={{ ...themeRoot.style, position: 'relative', width: Number(params.get('w')) || '100%', height: Number(params.get('h')) || '100%', '--kc-font-multiplier': [0.88, 1, 1.08, 1.16, 1.26][fontScale] } as CSSProperties}
      className="kc-desktop-app flex h-full min-h-0 flex-col overflow-hidden [color:var(--kc-text)]"
    >
      <ThemeEffects scheme={theme} />
      <ReplicaTitleBar />
      <div className="kc-desktop-content" style={{ position: 'relative', zIndex: 0, display: 'flex', minHeight: 0, flex: 1, overflow: 'hidden', background: 'var(--kc-window)' }}>
        <NavRail view={showPosts ? 'posts' : 'chat'} unreadCount={3} hasUnseenAnnouncement={false} onNavigate={(next) => useKukeStore.getState().setWorkspaceView(next)} onCreateGroup={() => undefined} onOpenAnnouncement={() => undefined} onOpenSettings={() => undefined} />
        <div data-kc-surface="page" style={{ position: 'relative', minWidth: 0, flex: 1, overflow: 'hidden', background: 'var(--kc-chat)' }}>
          {showPosts ? <PostsPanel currentUser={currentUser} isMobile={false} />
            : view === 'card' ? <CardStage />
            : workspaceView === 'chat' ? <Gallery />
            : <p data-harness="other-view" style={{ padding: 32, color: 'var(--kc-muted)' }}>这里是「{workspaceView}」工作区的占位。</p>}
          <ProfileLikeToasts />
        </div>
      </div>
    </main>
  );
}

function MobileApp(): JSX.Element | null {
  const currentUser = useKukeStore((state) => state.currentUser);
  const theme = useKukeStore((state) => (state.themeMode === 'dark' ? 'dark' : 'light'));
  const fontScale = useKukeStore((state) => state.uiFontScale);
  const pendingUserSpaceId = useKukeStore((state) => state.pendingUserSpaceId);
  if (!currentUser) {
    return null;
  }
  return (
    <main data-theme={theme} data-layout="mobile" data-font-scale={fontScale} data-harness="phone" className="kc-window-frame" style={{ position: 'relative', width: 390, height: 'min(100%, 800px)', overflow: 'hidden', transform: 'translateZ(0)', color: 'var(--kc-mobile-text)', animation: 'none' }}>
      <div className="kc-native-app" style={{ position: 'relative', height: '100%', width: '100%', overflow: 'hidden', background: 'var(--kc-mobile-bg)' }}>
        {view === 'space' ? <MobileSpace /> : view === 'card' ? <CardStage /> : <Gallery />}
        <ProfileLikeToasts />
        {pendingUserSpaceId ? <p data-harness="pending-space" style={{ position: 'absolute', zIndex: 99, right: 8, bottom: 8, left: 8, padding: '6px 10px', borderRadius: 8, background: '#111827', color: '#fff', font: '12px sans-serif' }} onClick={() => useKukeStore.getState().clearPendingUserSpace()}>要打开用户 {pendingUserSpaceId} 的主页 —— 真实应用里由 ChatDashboard 接住</p> : null}
      </div>
    </main>
  );
}

/* ───────── 控制条 ───────── */

function Controls(): JSX.Element {
  const [, rerender] = useState(0);
  const theme = useKukeStore((state) => state.themeMode);
  const fontScale = useKukeStore((state) => state.uiFontScale);
  const performance = useThemeStore((state) => state.performance);
  const mutedUntil = useModerationStore((state) => state.mutedUntil);
  const refresh = (): void => rerender((value) => value + 1);
  const button: CSSProperties = { padding: '2px 8px', border: '1px solid #9aa1b1', borderRadius: 6, background: '#fff', color: '#12141a', font: '12px sans-serif', cursor: 'pointer' };
  const label: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, font: '12px sans-serif', color: '#12141a' };
  const link = (next: Record<string, string>): string => {
    const query = new URLSearchParams(window.location.search);
    Object.entries(next).forEach(([key, value]) => query.set(key, value));
    return `?${query.toString()}`;
  };
  return (
    <div data-harness="controls" style={{ position: 'relative', zIndex: 1, display: 'flex', flex: 'none', flexWrap: 'wrap', alignItems: 'center', gap: 6, padding: 6, background: '#e3e6ee' }}>
      <strong style={{ font: '700 12px sans-serif', color: '#12141a' }}>资料点赞</strong>
      {VIEWS.map((item) => (layout === 'mobile' && item === 'self' ? null : <a key={item} href={link({ view: item })} style={{ ...button, textDecoration: 'none', fontWeight: item === view ? 700 : 400 }}>{item}</a>))}
      <a href={link({ layout: layout === 'desktop' ? 'mobile' : 'desktop' })} style={{ ...button, textDecoration: 'none' }}>布局：{layout === 'desktop' ? '桌面' : '移动'}</a>
      <button type="button" style={button} data-harness="theme" onClick={() => useKukeStore.setState({ themeMode: theme === 'dark' ? 'light' : 'dark' })}>深浅色</button>
      <button type="button" style={button} data-harness="font" onClick={() => useKukeStore.setState({ uiFontScale: ((fontScale + 1) % 5) as UiFontScale })}>字号 {fontScale}</button>
      <button type="button" style={button} data-harness="perf" onClick={() => useThemeStore.setState({ performance: !performance })}>性能优先：{performance ? '开' : '关'}</button>
      <label style={label}>服务端
        <select data-harness="backend" value={likeScenario.backend} style={{ font: '12px sans-serif' }} onChange={(event) => {
          likeScenario.backend = event.target.value as typeof likeScenario.backend;
          resetLikes();
          refresh();
        }}>
          {['ok', 'missing', 'error'].map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </label>
      <label style={label}>点赞结果
        <select data-harness="fail" value={likeScenario.fail} style={{ font: '12px sans-serif' }} onChange={(event) => {
          likeScenario.fail = event.target.value as LikeFailure;
          refresh();
        }}>
          {FAILURES.map((option) => <option key={option} value={option}>{option === 'none' ? '照实际状态' : option}</option>)}
        </select>
      </label>
      <button type="button" style={button} data-harness="muted" onClick={() => {
        likeScenario.muted = !likeScenario.muted;
        // 真实应用里禁言状态是登录后拉的 / 实时事件推的
        useModerationStore.getState().setMute(likeScenario.muted ? new Date(Date.now() + 2 * 3600_000).toISOString() : null, likeScenario.muted ? '预览页模拟的禁言' : null);
        resetLikes();
        refresh();
      }}>禁言：{mutedUntil ? '是' : '否'}</button>
      <button type="button" style={button} data-harness="limit" onClick={() => {
        likeScenario.usedToday = likeScenario.usedToday >= likeScenario.targetsPerDay ? 13 : likeScenario.targetsPerDay;
        resetLikes();
        refresh();
      }}>今天已赞 {likeScenario.usedToday}/{likeScenario.targetsPerDay} 人</button>
      <button type="button" style={button} data-harness="almost" onClick={() => {
        likeScenario.usedToday = likeScenario.targetsPerDay - 1;
        resetLikes();
        refresh();
      }}>只剩 1 个名额</button>
      <button type="button" style={button} data-harness="receive" onClick={() => receive(1)}>有人赞了我</button>
      <button type="button" style={button} data-harness="receive-3" onClick={() => receive(3)}>3 个人连着赞（合并成一条）</button>
      <button type="button" style={button} data-harness="clear" onClick={() => {
        likeState.clearReceived();
        resetLikes();
        const current = useKukeStore.getState().currentUser;
        if (current && likeScenario.field) {
          useKukeStore.getState().setCurrentUser({ ...current, profile_like_count: 0 });
        }
      }}>清空我的赞</button>
    </div>
  );
}

function Harness(): JSX.Element {
  return (
    <div style={{ display: 'flex', height: '100%', flexDirection: 'column' }}>
      {params.get('controls') === '0' ? null : <Controls />}
      <Probe />
      <div style={{ position: 'relative', display: 'grid', minHeight: 0, flex: 1, placeItems: layout === 'mobile' || params.get('w') ? 'center' : 'stretch', background: '#cfd3dd' }}>
        {layout === 'mobile' ? <MobileApp /> : <DesktopApp />}
      </div>
    </div>
  );
}

async function start(): Promise<void> {
  const flag = (name: string): boolean => params.get(name) === '1';
  const mock = await createPostsMock();

  const backend = params.get('backend');
  if (backend === 'missing' || backend === 'error') {
    likeScenario.backend = backend;
  }
  likeScenario.field = params.get('field') !== '0';
  if (FAILURES.includes(params.get('fail') as LikeFailure)) {
    likeScenario.fail = params.get('fail') as LikeFailure;
  }
  likeScenario.muted = flag('muted');
  likeScenario.stateFails = params.get('state') === 'fail';
  likeScenario.receivedFails = params.get('received') === 'fail';
  if (flag('limit')) {
    likeScenario.usedToday = likeScenario.targetsPerDay;
  }
  if (params.get('delay') !== null) {
    likeScenario.delay = Math.max(0, Number(params.get('delay')) || 0);
  }

  // 等级：让资料卡、个人空间上的等级那一块也在，版面和真实的一样
  everyone.forEach((user, index) => {
    user.account_level = user.is_bot ? 0 : [23, 41, 7, 0, 16, 64][index] ?? 3;
  });
  levelState.register(everyone);
  levelState.setMe(me);

  SAMPLES.forEach((sample) => likeState.register(findUser(sample.id), sample.count, { liked: sample.liked }));
  likeState.register(me, 6024, { today: params.get('today') === '0' ? 0 : 12, me: true });
  if (params.get('received') === 'empty') {
    likeState.clearReceived();
  }
  installFetch(mock);

  // 换存储键，免得把开发时真实的登录状态、主题、偏好冲掉
  useKukeStore.persist.setOptions({ name: 'kukechat-likes-harness' });
  useLevelStore.persist.setOptions({ name: 'kukechat-likes-harness-prefs' });
  useThemeStore.persist.setOptions({ name: 'kukechat-likes-harness-theme' });
  const font = Number(params.get('font') ?? 1);
  useKukeStore.setState({
    token: 'harness',
    currentUser: me,
    activeConversationId: null,
    layoutMode: layout,
    layoutModeSource: 'manual',
    themeMode: params.get('theme') === 'dark' ? 'dark' : 'light',
    uiFontScale: (font >= 0 && font <= 4 ? font : 1) as UiFontScale,
    isOpen: true,
    isMinimized: false,
    isFullscreen: false,
    workspaceView: view === 'space' && layout === 'desktop' ? 'posts' : 'chat',
    pendingSettingsTab: null,
    pendingUserSpaceId: view === 'space' && layout === 'desktop' ? targetId : null,
    pendingPostId: null,
    pendingLevel: null,
    pendingShop: false,
    themeSettings: DEFAULT_THEME_SETTINGS
  });
  useLevelStore.setState({ available: null });
  useThemeStore.setState({ performance: flag('perf') });
  useModerationStore.getState().setMute(likeScenario.muted ? new Date(Date.now() + 2 * 3600_000).toISOString() : null, likeScenario.muted ? '预览页模拟的禁言' : null);
  Object.assign(window, { __likes: { scenario: likeScenario, requests: likeRequests, state: likeState, store: useKukeStore, queryClient, receive } });

  createRoot(document.getElementById('root') as HTMLElement).render(
    <QueryClientProvider client={queryClient}>
      <Harness />
    </QueryClientProvider>
  );
  if (flag('open') && layout === 'desktop') {
    // 等界面挂好再点开；likes=1 再接着点开「谁赞了我」
    window.setTimeout(() => {
      document.querySelector<HTMLButtonElement>('.kwf-self')?.click();
      if (flag('likes')) {
        window.setTimeout(() => document.querySelector<HTMLButtonElement>('.ksc-likes')?.click(), 700);
      }
    }, 600);
  }
}

void start();
