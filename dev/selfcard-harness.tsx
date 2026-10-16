/**
 * 「我的资料卡」（点标题栏上自己的头像弹出的那张）的本地预览：不连后端，用假数据驱动真实组件。
 *
 *   npx vite --port 5187 --strictPort --host 127.0.0.1   →   http://127.0.0.1:5187/dev/selfcard-harness.html
 *
 * 两种形态（form）：
 *   tauri   桌面端：标题栏是照 src/desktop-app.tsx 的 DesktopTitleBar 抄的一份（那个文件一加载就会挂载整个应用、还要 Tauri 的窗口 API，
 *           没法直接引用），头像按钮和卡片是真的。拖动窗口换成了计数：控制条上的「拖动」数字只应该在按住标题栏空白处时增加。
 *   ext     扩展浮窗：真的 WindowFrame，和 src/app/windowManager.tsx 一样挂在 Shadow DOM 里（样式也是注入进去的那一份），
 *           只是没接实时连接。拖标题栏空白处窗口会动，控制条上能看到位置。
 * 内容区都是真的主界面 ChatDashboard，所以卡片里的「编辑资料」「我的主页」、等级、商店点了会真的跳过去。
 *
 * 初始状态可以写在地址里，方便截图：
 *   form=tauri|ext   theme=dark   open=1（一进来就点开卡片）   font=0..4   w=980 h=680（窗口大小）   x= y=（扩展浮窗的位置）
 *   level=23|none（none：服务端没有账号等级）   jury=trainee|regular|senior   admin=1   ccw=0（没绑定 CCW）
 *   skin=starry|sakura|…|none   frame=cat|crowned|…（头像框，默认不带）   shop=missing（服务端没有商店）   bio=0（没写签名）   long=1（很长的昵称和签名）
 *   posts=images|few|text|none|error|slow    online=0
 *
 * 脚本测试用 window.__selfcard：scenario / requests / store / queryClient / drags。
 * 只用于开发时看界面，不会进入任何构建产物。
 */
import { useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@/styles/tailwind.css';
import { shadowStyles } from '@/styles/shadowStyles';
import { featureMocks } from './mocks';
import { MAX_LEVEL, daysForLevel, iconsOf, levelScenario, levelState } from './mocks/level';
import { FRAMES, SKINS, shopScenario, shopState } from './mocks/shop';
import { createPostsMock, me as postsMe, type PostsMock } from './posts-harness.mock';
import { ChatDashboard } from '@/components/chat/ChatDashboard';
import { handleLevelEvent } from '@/components/level/data';
import { handleShopEvent } from '@/components/shop/data';
import { getDisplayName } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { SelfCardTrigger } from '@/components/window/SelfCardTrigger';
import { WindowFrame } from '@/components/window/WindowFrame';
import { useKukeStore, type UiFontScale } from '@/store/kukeStore';
import { useLevelStore } from '@/store/levelStore';
import { ThemeEffects } from '@/theme/ThemeEffects';
import { DEFAULT_THEME_SETTINGS } from '@/theme/themes';
import { useThemeStore } from '@/theme/themeStore';
import { useThemeRootProps } from '@/theme/useTheme';
import type { Post, User } from '@/types/api';

const params = new URLSearchParams(window.location.search);
const form: 'tauri' | 'ext' = params.get('form') === 'ext' ? 'ext' : 'tauri';

type PostsScenario = 'images' | 'few' | 'text' | 'none' | 'error' | 'slow';
const POSTS_SCENARIOS: PostsScenario[] = ['images', 'few', 'text', 'none', 'error', 'slow'];

const scenario = {
  posts: (POSTS_SCENARIOS.includes(params.get('posts') as PostsScenario) ? params.get('posts') : 'images') as PostsScenario,
  online: params.get('online') !== '0',
  /** 标题栏的「拖动窗口」被触发了几次（tauri 形态） */
  drags: 0
};
const requests: Array<{ method: string; path: string }> = [];
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });

const SKIN_NAMES = ['starry', 'sakura', 'aurora', 'candy', 'pixel'] as const;
type SkinName = (typeof SKIN_NAMES)[number];

/** 地址里 frame= 指定的头像框：标题栏上的头像、资料卡里的头像都会带上 */
const frameParam = new URLSearchParams(window.location.search).get('frame') ?? '';
const frameCosmetic: User['cosmetics'] = frameParam in FRAMES ? { frame: { sku: `frame.${frameParam}`, style: FRAMES[frameParam as keyof typeof FRAMES] } } : {};

function wearing(name: SkinName | null): User['cosmetics'] {
  return name ? { bubble: { sku: `bubble.${name}`, style: SKINS[name] }, ...frameCosmetic } : { ...frameCosmetic };
}

/** 画一张渐变的小图当头像 */
function avatarPicture(): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 160;
  const context = canvas.getContext('2d');
  if (context) {
    const gradient = context.createLinearGradient(0, 0, 160, 160);
    gradient.addColorStop(0, '#ffb36b');
    gradient.addColorStop(1, '#e0457b');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 160, 160);
    context.fillStyle = 'rgba(255,255,255,.92)';
    context.font = '700 84px sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('酷', 80, 88);
  }
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob ? URL.createObjectURL(blob) : ''), 'image/png'));
}

/* ───────── 假后端 ───────── */

function myPosts(mock: PostsMock): Post[] {
  const mine = mock.posts.filter((post) => post.author_id === 1);
  if (scenario.posts === 'none') {
    return [];
  }
  if (scenario.posts === 'text') {
    return mine.map((post) => ({ ...post, image_urls: [] }));
  }
  if (scenario.posts === 'few') {
    // 只有一条动态带图，而且只有两张
    let kept = false;
    return mine.map((post) => {
      if (kept || post.image_urls.length === 0 || post.moderation_status === 'rejected') {
        return { ...post, image_urls: [] };
      }
      kept = true;
      return { ...post, image_urls: post.image_urls.slice(0, 2) };
    });
  }
  return mine;
}

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
    requests.push({ method, path });
    let body: unknown;
    try {
      body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    } catch {
      body = undefined;
    }
    for (const handler of featureMocks) {
      const mocked = await handler({ path, url, method, body });
      if (mocked) {
        return mocked;
      }
    }
    await new Promise((resolve) => window.setTimeout(resolve, 150));
    if (/^\/users\/\d+\/online$/.test(path)) {
      return respond({ user_id: 1, online: scenario.online, presence_status: scenario.online ? 'online' : 'offline' });
    }
    if (path === '/users/1') {
      return respond(useKukeStore.getState().currentUser ?? postsMe);
    }
    if (path === '/posts/users/1' || path === '/posts/users/1/stats') {
      if (scenario.posts === 'slow') {
        await new Promise((resolve) => window.setTimeout(resolve, 4000));
      }
      if (scenario.posts === 'error') {
        return respond({ detail: 'Internal Server Error' }, 500);
      }
      const mine = myPosts(mock);
      if (path.endsWith('/stats')) {
        return respond({ post_count: mine.length, like_count: mine.reduce((sum, post) => sum + post.like_count, 0), comment_count: mine.reduce((sum, post) => sum + post.comment_count, 0) });
      }
      const limit = Number(url.searchParams.get('limit') ?? 20);
      const beforeId = Number(url.searchParams.get('before_id') ?? 0);
      const start = beforeId ? mine.findIndex((post) => post.id === beforeId) + 1 : 0;
      return respond(mine.slice(start, start + limit));
    }
    // 其余的交给动态页的假后端；它不认识的接口一律返回空，不会漏到真实后端去
    const result = mock.handle({ path, url, method, body });
    return result instanceof Response ? result : respond(result ?? null);
  };
}

/** 和 src/realtime/client.ts 收到事件时做的事一样：让缓存和当前用户对象跟上 */
function emit(rawType: string, data: unknown): void {
  handleShopEvent(queryClient, rawType, data);
  handleLevelEvent(queryClient, rawType, data);
}

/* ───────── 桌面端的标题栏（照 DesktopTitleBar 抄的） ───────── */

function ReplicaTitleBar({ onDrag }: { onDrag: () => void }): JSX.Element {
  const currentUser = useKukeStore((state) => state.currentUser);
  const title = currentUser ? getDisplayName(currentUser) : 'KukeChat';
  const bio = currentUser?.bio?.trim() || '咕咕咕~';

  function startWindowDrag(event: ReactPointerEvent<HTMLElement>): void {
    if (event.button !== 0 || (event.target as HTMLElement | null)?.closest('button, [data-window-action]')) {
      return;
    }
    onDrag();
  }

  return (
    <header onPointerDown={startWindowDrag} className="kwf-titlebar" data-harness="titlebar">
      <div className="kwf-identity">
        {currentUser ? <SelfCardTrigger user={currentUser} label={title} /> : <h1 className="kwf-title">{title}</h1>}
        {currentUser ? <span className="kwf-bio">{bio}</span> : null}
        {currentUser ? <div data-window-action className="kwf-online"><span className="kwf-online-count">在线 128</span></div> : null}
      </div>
      <div className="kwf-controls">
        <button type="button" className="kwf-control" aria-label="最小化窗口"><Icon name="minus" className="h-4 w-4" /></button>
        <button type="button" className="kwf-control" aria-label="最大化或还原窗口"><Icon name="maximize" className="h-4 w-4" /></button>
        <button type="button" className="kwf-control kwf-control--close" aria-label="隐藏到托盘"><Icon name="close" className="h-4 w-4" /></button>
      </div>
    </header>
  );
}

function TauriApp({ onDrag }: { onDrag: () => void }): JSX.Element | null {
  const currentUser = useKukeStore((state) => state.currentUser);
  const theme = useKukeStore((state) => (state.themeMode === 'dark' ? 'dark' : 'light'));
  const fontScale = useKukeStore((state) => state.uiFontScale);
  const themeRoot = useThemeRootProps(theme);
  const width = Number(params.get('w')) || 0;
  const height = Number(params.get('h')) || 0;
  if (!currentUser) {
    return null;
  }
  return (
    <main
      data-theme={theme}
      data-layout="desktop"
      data-font-scale={fontScale}
      data-kc-wallpaper={themeRoot['data-kc-wallpaper']}
      style={{ ...themeRoot.style, width: width || '100%', height: height || '100%', '--kc-font-multiplier': [0.88, 1, 1.08, 1.16, 1.26][fontScale] } as CSSProperties}
      className="kc-desktop-app flex h-full min-h-0 flex-col overflow-hidden [color:var(--kc-text)]"
    >
      <ThemeEffects scheme={theme} />
      <ReplicaTitleBar onDrag={onDrag} />
      <div className="kc-desktop-content relative z-0 min-h-0 flex-1 overflow-hidden [background:var(--kc-window)]">
        <ChatDashboard currentUser={currentUser} />
      </div>
    </main>
  );
}

/* ───────── 扩展浮窗（挂在 Shadow DOM 里） ───────── */

function ExtensionApp(): JSX.Element | null {
  const currentUser = useKukeStore((state) => state.currentUser);
  return currentUser ? <WindowFrame><ChatDashboard currentUser={currentUser} /></WindowFrame> : null;
}

/** 和 windowManager.tsx 的 mountReactApp 一样的结构：宿主节点 → Shadow DOM → 样式 + #kukechat-root */
function mountExtension(): void {
  const host = document.createElement('div');
  host.id = 'kukechat-shadow-host';
  host.style.position = 'fixed';
  host.style.inset = '0';
  host.style.zIndex = '2147483647';
  host.style.pointerEvents = 'none';
  document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = shadowStyles;
  const rootElement = document.createElement('div');
  rootElement.id = 'kukechat-root';
  shadow.append(style, rootElement);
  createRoot(rootElement).render(<QueryClientProvider client={queryClient}><ExtensionApp /></QueryClientProvider>);
}

/* ───────── 控制条 ───────── */

function Controls({ mock, drags }: { mock: PostsMock; drags: number }): JSX.Element {
  const [, rerender] = useState(0);
  const user = useKukeStore((state) => state.currentUser);
  const theme = useKukeStore((state) => state.themeMode);
  const position = useKukeStore((state) => state.position);
  const view = useKukeStore((state) => state.workspaceView);
  const button: CSSProperties = { padding: '2px 8px', border: '1px solid #9aa1b1', borderRadius: 6, background: '#fff', color: '#12141a', font: '12px sans-serif', cursor: 'pointer' };
  const label: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, font: '12px sans-serif', color: '#12141a' };
  const patchMe = (patch: Partial<User>): void => {
    const current = useKukeStore.getState().currentUser;
    if (current) {
      useKukeStore.getState().setCurrentUser({ ...current, ...patch });
    }
  };
  const skinIndex = SKIN_NAMES.findIndex((name) => user?.cosmetics?.bubble?.sku === `bubble.${name}`);
  return (
    <div data-harness="controls" style={{ position: 'relative', zIndex: 1, display: 'flex', flex: 'none', flexWrap: 'wrap', alignItems: 'center', gap: 6, padding: 6, background: '#e3e6ee', pointerEvents: 'auto' }}>
      <strong style={{ font: '700 12px sans-serif', color: '#12141a' }}>{form === 'ext' ? '扩展浮窗' : '桌面端'}</strong>
      <button type="button" style={button} data-harness="theme" onClick={() => useKukeStore.setState({ themeMode: theme === 'dark' ? 'light' : 'dark' })}>深浅色</button>
      <button type="button" style={button} data-harness="nickname" onClick={() => patchMe({ nickname: user?.nickname === '酷可mc' ? '换了个新昵称' : '酷可mc' })}>改昵称</button>
      <button type="button" style={button} data-harness="bio" onClick={() => patchMe({ bio: user?.bio ? '' : '咕咕咕~ 今天也在修 bug' })}>签名：{user?.bio ? '有' : '空'}</button>
      <button type="button" style={button} data-harness="ccw" onClick={() => patchMe(user?.ccw_student_oid ? { ccw_student_oid: null } : { ccw_student_oid: 'abc123' })}>CCW：{user?.ccw_student_oid ? '已绑定' : '未绑定'}</button>
      <button type="button" style={button} data-harness="jury" onClick={() => patchMe({ jury_badge: user?.jury_badge === 'senior' ? null : user?.jury_badge === 'regular' ? 'senior' : user?.jury_badge === 'trainee' ? 'regular' : 'trainee' })}>风纪：{user?.jury_badge ?? '无'}</button>
      <button type="button" style={button} data-harness="admin" onClick={() => patchMe({ platform_role: user?.platform_role === 'admin' ? 'user' : 'admin' })}>管理员：{user?.platform_role === 'admin' ? '是' : '否'}</button>
      <button type="button" style={button} data-harness="skin" onClick={() => {
        const next = skinIndex + 1 >= SKIN_NAMES.length ? null : SKIN_NAMES[skinIndex + 1];
        shopState.setEquipped(next ? `bubble.${next}` : null);
        emit('user.cosmetics.updated', { user_id: 1, cosmetics: wearing(next) });
      }}>皮肤事件：{skinIndex >= 0 ? SKIN_NAMES[skinIndex] : '无'}</button>
      <button type="button" style={button} data-harness="level-up" onClick={() => {
        levelScenario.level = Math.min(MAX_LEVEL, levelScenario.level + 1);
        levelScenario.extraDays = 0;
        emit('account.level.up', { level: levelScenario.level, icons: iconsOf(levelScenario.level), active_days: daysForLevel(levelScenario.level) });
      }}>升一级（Lv.{user?.account_level ?? 0}）</button>
      <label style={label}>动态
        <select data-harness="posts" value={scenario.posts} style={{ font: '12px sans-serif' }} onChange={(event) => {
          scenario.posts = event.target.value as PostsScenario;
          void queryClient.resetQueries({ queryKey: ['posts'] });
          rerender((value) => value + 1);
        }}>
          {POSTS_SCENARIOS.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </label>
      <button type="button" style={button} data-harness="new-post" onClick={() => {
        const withImage = mock.posts.find((post) => post.image_urls.length > 0);
        const id = Math.max(...mock.posts.map((post) => post.id)) + 1;
        mock.posts.unshift({ ...(mock.posts[0] as Post), id, author_id: 1, author: useKukeStore.getState().currentUser, content: '刚发的一条带图动态', image_urls: withImage ? [withImage.image_urls[withImage.image_urls.length - 1]] : [], moderation_status: 'approved', created_at: new Date().toISOString() });
        // 和发动态成功之后做的事一样（invalidatePosts）
        void queryClient.invalidateQueries({ queryKey: ['posts'] });
      }}>发一条带图动态</button>
      <span style={label} data-harness="state">{form === 'ext' ? `窗口位置 ${Math.round(position.x)},${Math.round(position.y)}` : `拖动 ${drags} 次`} · 工作区 {view}</span>
    </div>
  );
}

/** 扩展形态下浮窗后面的宿主页面：放一个按钮，看「点卡片外面」那一下有没有照常落到它上面 */
function HostPage(): JSX.Element {
  const [clicks, setClicks] = useState(0);
  return (
    <div style={{ padding: 24, font: '13px sans-serif', color: '#4a5060' }}>
      <p style={{ margin: '0 0 12px' }}>这里是宿主页面（假装是 CCW / Scratch 的编辑器）。浮窗挂在 Shadow DOM 里，按住标题栏的空白处可以拖动。</p>
      <button type="button" data-harness="host-button" style={{ position: 'absolute', right: 24, bottom: 24, padding: '6px 12px' }} onClick={() => setClicks((value) => value + 1)}>宿主页面上的按钮（点了 {clicks} 次）</button>
    </div>
  );
}

function Harness({ mock }: { mock: PostsMock }): JSX.Element {
  const [drags, setDrags] = useState(0);
  const onDrag = (): void => {
    scenario.drags += 1;
    setDrags(scenario.drags);
  };
  return (
    <div style={{ display: 'flex', height: '100%', flexDirection: 'column' }}>
      <Controls mock={mock} drags={drags} />
      <div style={{ position: 'relative', display: 'grid', minHeight: 0, flex: 1, placeItems: params.get('w') ? 'center' : 'stretch', background: '#cfd3dd' }}>
        {form === 'tauri' ? <TauriApp onDrag={onDrag} /> : <HostPage />}
      </div>
    </div>
  );
}

async function start(): Promise<void> {
  const flag = (name: string): boolean => params.get(name) === '1';
  const mock = await createPostsMock();
  const avatar = await avatarPicture();

  if (params.get('level') === 'none') {
    levelScenario.backend = 'missing';
  } else if (params.get('level') !== null) {
    levelScenario.level = Math.min(MAX_LEVEL, Math.max(0, Number(params.get('level')) || 0));
  }
  if (params.get('shop') === 'missing') {
    shopScenario.backend = 'missing';
  }
  const skinParam = params.get('skin');
  const skin: SkinName | null = skinParam === 'none' ? null : SKIN_NAMES.includes(skinParam as SkinName) ? skinParam as SkinName : 'starry';
  shopState.setEquipped(skin ? `bubble.${skin}` : null);
  // 假后端里也要装备上：商店的主数据一拉回来，就会按它把用户对象上的装扮对齐
  shopState.setEquipped(frameParam in FRAMES ? `frame.${frameParam}` : null, 'frame');
  const juryParam = params.get('jury');
  const bound = params.get('ccw') !== '0';
  const long = flag('long');

  // 动态页的假后端里「我」是同一个对象：个人主页、发动态时看到的也是这份资料
  const me = Object.assign(postsMe, {
    avatar_url: avatar,
    nickname: long ? '一个名字特别特别长的用户用来测试标题栏和资料卡的截断' : '酷可mc',
    bio: params.get('bio') === '0' ? '' : long ? '咕咕咕~ 这是一句特别特别长的签名，用来看资料卡里签名那一行最多两行、超出部分截断成省略号的样子，后面还有很多很多字。' : '咕咕咕~',
    account_level: levelScenario.backend === 'missing' ? undefined : levelScenario.level,
    cosmetics: wearing(skin),
    jury_badge: juryParam === 'trainee' || juryParam === 'regular' || juryParam === 'senior' ? juryParam : null,
    platform_role: flag('admin') ? 'admin' : 'user',
    ccw_student_oid: bound ? 'abc123' : null
  } as Partial<User>) as User;
  levelState.setMe(me);
  installFetch(mock);

  // 换存储键，免得把开发时真实的登录状态、主题、偏好冲掉
  useKukeStore.persist.setOptions({ name: 'kukechat-selfcard-harness' });
  useLevelStore.persist.setOptions({ name: 'kukechat-selfcard-harness-prefs' });
  useThemeStore.persist.setOptions({ name: 'kukechat-selfcard-harness-theme' });
  const font = Number(params.get('font') ?? 1);
  useKukeStore.setState({
    token: 'harness',
    currentUser: me,
    activeConversationId: null,
    layoutMode: 'desktop',
    layoutModeSource: 'manual',
    themeMode: params.get('theme') === 'dark' ? 'dark' : 'light',
    uiFontScale: (font >= 0 && font <= 4 ? font : 1) as UiFontScale,
    isOpen: true,
    isMinimized: false,
    isFullscreen: false,
    position: { x: Number(params.get('x') ?? 64) || 0, y: Number(params.get('y') ?? 64) || 0 },
    size: { width: Number(params.get('w')) || 980, height: Number(params.get('h')) || 640 },
    workspaceView: 'chat',
    pendingSettingsTab: null,
    pendingUserSpaceId: null,
    pendingLevel: null,
    pendingShop: false,
    themeSettings: DEFAULT_THEME_SETTINGS
  });
  useLevelStore.setState({ available: null });
  Object.assign(window, { __selfcard: { scenario, requests, store: useKukeStore, queryClient, mock } });

  createRoot(document.getElementById('root') as HTMLElement).render(
    <QueryClientProvider client={queryClient}>
      <Harness mock={mock} />
    </QueryClientProvider>
  );
  if (form === 'ext') {
    mountExtension();
  }
  if (flag('open')) {
    // 等主界面挂好再点开
    window.setTimeout(() => {
      const scope: ParentNode = document.getElementById('kukechat-shadow-host')?.shadowRoot ?? document;
      scope.querySelector<HTMLButtonElement>('.kwf-self')?.click();
    }, 600);
  }
}

void start();
