/**
 * 性能预览页：把整个主界面（ChatDashboard）放进一个「大群 + 满屏皮肤 / 头像框 / 动图」的场景里，给测量脚本用。
 *
 *   vite 起着的时候打开  http://127.0.0.1:5195/dev/perf-harness.html
 *
 * 地址参数：
 *   msgs=300            大群里的历史消息条数（每页 50，进去后往上翻会继续加载）
 *   members=3145        大群人数（成员接口按 limit / offset 分页返回）
 *   people=60           群里说话的人数，其中大约四分之三带气泡皮肤和头像框
 *   gif=1               消息里带动图（GIF）；gif=0 关掉
 *   perf=1              外观里的「性能优先」
 *   theme=dark          深色
 *   convs=40            会话列表的会话数
 *
 * 脚本用 window.__perf：receive(n) 模拟收到新消息（走和 WebSocket 一样的缓存更新），presence(n) 模拟上下线，
 * typing(userId) 模拟正在输入，queryClient / store。
 * 只用于开发时测量，不会进入任何构建产物。
 */
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@/styles/tailwind.css';
import { featureMocks } from './mocks';
import { FRAMES, SKINS } from './mocks/shop';
import { ChatDashboard } from '@/components/chat/ChatDashboard';
import { applyCreatedMessageToConversations, upsertMessageIntoFirstPage, type MessagesInfiniteData } from '@/realtime/cache';
import { emitRealtimeEvent } from '@/realtime/events';
import { useKukeStore } from '@/store/kukeStore';
import { useShopPrefs } from '@/store/shopPrefs';
import { ThemeEffects } from '@/theme/ThemeEffects';
import { DEFAULT_THEME_SETTINGS } from '@/theme/themes';
import { useThemeStore } from '@/theme/themeStore';
import { useThemeRootProps } from '@/theme/useTheme';
import type { Conversation, ConversationMember, Message, User } from '@/types/api';
import { useWindowMotionPause } from '@/utils/windowMotion';

const params = new URLSearchParams(window.location.search);
const num = (key: string, fallback: number): number => (params.get(key) !== null ? Number(params.get(key)) || 0 : fallback);
const MESSAGE_COUNT = num('msgs', 300);
const MEMBER_COUNT = num('members', 3145);
const PEOPLE = Math.max(4, num('people', 60));
const CONVERSATIONS = Math.max(2, num('convs', 40));
const WITH_GIF = params.get('gif') !== '0';
const theme = params.get('theme') === 'dark' ? 'dark' : 'light';

/* ───────── 假图片 ───────── */

function canvasBlob(width: number, height: number, draw: (context: CanvasRenderingContext2D) => void, type = 'image/png'): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (context) {
    draw(context);
  }
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob ? URL.createObjectURL(blob) : ''), type, 0.9));
}

function gradientPicture(width: number, height: number, hue: number): Promise<string> {
  return canvasBlob(width, height, (context) => {
    const gradient = context.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, `hsl(${hue} 80% 68%)`);
    gradient.addColorStop(1, `hsl(${(hue + 70) % 360} 78% 52%)`);
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
    context.fillStyle = 'rgba(255,255,255,.85)';
    context.font = `600 ${Math.round(width / 16)}px sans-serif`;
    context.fillText(`${width}×${height}`, 20, width / 10);
  }, 'image/jpeg');
}

/**
 * 一个会动的 GIF：frames 帧色块，每帧 delay 厘秒。LZW 用「每 100 个像素发一次清表码」的写法，码长恒为 8 位，不用真的压缩。
 * 只为了让浏览器像对待真动图一样不停地解码、重绘。
 */
function animatedGif(size: number, frames: number, hue: number, delay = 8): string {
  const bytes: number[] = [];
  const push = (...values: number[]): void => { bytes.push(...values); };
  const word = (value: number): void => push(value & 0xff, (value >> 8) & 0xff);
  push(...Array.from('GIF89a', (char) => char.charCodeAt(0)));
  word(size);
  word(size);
  push(0xf6, 0, 0); // 全局色表 128 色
  for (let index = 0; index < 128; index += 1) {
    const light = index < frames ? 40 + Math.round((index / frames) * 40) : 90;
    const angle = ((hue + index * 25) % 360) / 60;
    const chroma = 0.6 * (1 - Math.abs((2 * light) / 100 - 1));
    const x = chroma * (1 - Math.abs((angle % 2) - 1));
    const [r, g, b] = angle < 1 ? [chroma, x, 0] : angle < 2 ? [x, chroma, 0] : angle < 3 ? [0, chroma, x] : angle < 4 ? [0, x, chroma] : angle < 5 ? [x, 0, chroma] : [chroma, 0, x];
    const m = light / 100 - chroma / 2;
    push(Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255));
  }
  push(0x21, 0xff, 0x0b, ...Array.from('NETSCAPE2.0', (char) => char.charCodeAt(0)), 0x03, 0x01, 0, 0, 0);
  for (let frame = 0; frame < frames; frame += 1) {
    push(0x21, 0xf9, 0x04, 0x04);
    word(delay);
    push(0, 0);
    push(0x2c);
    word(0);
    word(0);
    word(size);
    word(size);
    push(0);
    push(7); // LZW 最小码长
    const codes: number[] = [];
    const total = size * size;
    for (let pixel = 0; pixel < total; pixel += 1) {
      if (pixel % 100 === 0) {
        codes.push(128);
      }
      const row = Math.floor(pixel / size);
      const column = pixel % size;
      const ring = Math.floor(Math.hypot(row - size / 2, column - size / 2) / (size / 10));
      codes.push((ring + frame) % frames);
    }
    codes.push(129);
    for (let offset = 0; offset < codes.length; offset += 255) {
      const chunk = codes.slice(offset, offset + 255);
      push(chunk.length, ...chunk);
    }
    push(0);
  }
  push(0x3b);
  return `${URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'image/gif' }))}#.gif`;
}

/* ───────── 人、会话、消息 ───────── */

const SKIN_KEYS = ['starry', 'sakura', 'pixel', 'aurora', 'sunny', 'mint', 'candy', 'kitty', 'royal', 'snow', 'thunder'] as const;
const FRAME_KEYS = ['mint', 'sakura', 'seasalt', 'cat', 'starring', 'aurora', 'halo', 'crowned', 'angel', 'imp', 'ribbon'] as const;
const me = { id: 1, username: 'kuke', nickname: '酷可mc', ccw_student_oid: '6650a1b2c3d4e5f6a7b8c9d0', ccw_name: '酷可mc' } as User;

function buildPeople(avatars: string[]): User[] {
  const list: User[] = [me];
  for (let index = 2; index <= PEOPLE + 1; index += 1) {
    const dressed = index % 4 !== 0;
    const skin = SKIN_KEYS[index % SKIN_KEYS.length];
    const frame = FRAME_KEYS[(index * 3) % FRAME_KEYS.length];
    list.push({
      id: index,
      username: `user${index}`,
      nickname: `群友${index}号`,
      avatar_url: avatars[index % avatars.length],
      cosmetics: dressed ? { bubble: { sku: `bubble.${skin}`, style: SKINS[skin] }, frame: { sku: `frame.${frame}`, style: FRAMES[frame] } } : {}
    } as User);
  }
  return list;
}

const LINES = [
  '早', '有人在吗', '我刚把克隆体的碰撞检测改好了，原来是广播顺序的问题', '哈哈哈哈哈', '+1', '这个可以，等会发个链接',
  '说一下思路：先把所有角色的坐标存进列表，每帧只更新移动过的那几个，然后用「碰到颜色」做粗筛，命中了再做精确判断。',
  '好耶', '？', '已经修了', '周五晚上的接龙谁来开头', '我来吧', '收到', '多行消息\n第二行\n第三行，稍微长一点点用来看换行的表现'
];

async function start(): Promise<void> {
  const avatars = await Promise.all(Array.from({ length: 12 }, (_, index) => gradientPicture(160, 160, index * 30)));
  const pictures = await Promise.all([gradientPicture(2400, 1600, 200), gradientPicture(1080, 1920, 320), gradientPicture(800, 800, 40)]);
  const gifs = WITH_GIF ? [animatedGif(160, 8, 0), animatedGif(120, 6, 120), animatedGif(200, 10, 240)] : [];
  const people = buildPeople(avatars);
  const now = Date.now();

  const conversations: Conversation[] = Array.from({ length: CONVERSATIONS }, (_, index) => {
    const id = index + 1;
    const group = index % 3 !== 1;
    const peer = people[1 + (index % (people.length - 1))];
    return {
      id,
      type: group ? 'group' : 'direct',
      title: id === 1 ? 'KukeChat 官方群聊' : group ? `测试群 ${id}` : peer.nickname,
      display_title: id === 1 ? 'KukeChat 官方群聊' : group ? `测试群 ${id}` : peer.nickname,
      member_count: id === 1 ? MEMBER_COUNT : group ? 30 + id : 2,
      unread_count: id === 1 ? 0 : index % 4,
      direct_user: group ? undefined : peer,
      my_role: id === 1 ? 'member' : 'owner',
      plus_tier: id === 1 ? 'max' : undefined,
      plus_expires_at: id === 1 ? new Date(now + 300 * 86400_000).toISOString() : undefined,
      announcement: id === 1 ? '欢迎来到 KukeChat 官方群聊！反馈问题请带上版本号和截图。' : undefined,
      updated_at: new Date(now - index * 600_000).toISOString(),
      last_message: { id: 90_000 + id, conversation_id: id, sender_id: peer.id, sender: peer, type: 'text', content: LINES[index % LINES.length], created_at: new Date(now - index * 600_000).toISOString() } as Message
    } as Conversation;
  });

  const history: Message[] = [];
  let nextId = 10_000;
  for (let index = 0; index < MESSAGE_COUNT; index += 1) {
    nextId += 1;
    const sender = people[1 + ((index * 7 + (index >> 2)) % (people.length - 1))];
    const base = { id: nextId, conversation_id: 1, sender_id: sender.id, sender, created_at: new Date(now - (MESSAGE_COUNT - index) * 40_000).toISOString(), sender_level: (sender.id % 30) + 1 };
    if (WITH_GIF && (index % 9 === 4 || (index === MESSAGE_COUNT - 3 && params.get('gifbottom') !== '0'))) {
      history.push({ ...base, type: 'image', content: gifs[index % gifs.length], metadata: index % 18 === 4 ? { sticker: true } : undefined } as Message);
    } else if (index % 17 === 8) {
      history.push({ ...base, type: 'image', content: pictures[index % pictures.length] } as Message);
    } else {
      history.push({ ...base, type: 'text', content: LINES[(index * 5) % LINES.length], reactions: index % 13 === 2 ? [{ emoji: '😂', count: 3, reacted_by_me: false }] : undefined } as Message);
    }
  }

  const members: ConversationMember[] = Array.from({ length: MEMBER_COUNT }, (_, index) => {
    const user = index < people.length ? people[index] : { id: 1000 + index, username: `m${index}`, nickname: `成员${index}`, avatar_url: avatars[index % avatars.length] } as User;
    return { id: index + 1, conversation_id: 1, user_id: user.id, user, role: index === 1 ? 'owner' : index < 6 ? 'admin' : 'member', joined_at: new Date(now - (MEMBER_COUNT - index) * 3600_000).toISOString() } as ConversationMember;
  });

  const realFetch = window.fetch.bind(window);
  const json = (body: unknown): Response => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  window.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, window.location.origin);
    if (!url.pathname.includes('/api/v1/')) {
      return realFetch(input, init);
    }
    const path = url.pathname.replace(/^.*\/api\/v1/, '');
    const method = (init?.method ?? 'GET').toUpperCase();
    await new Promise((resolve) => window.setTimeout(resolve, 40));
    for (const mock of featureMocks) {
      const mocked = await mock({ path, url, method, body: undefined });
      if (mocked) {
        return mocked;
      }
    }
    const listMatch = path.match(/^\/conversations\/(\d+)\/messages$/);
    if (listMatch && method === 'GET') {
      const conversationId = Number(listMatch[1]);
      const all = conversationId === 1 ? history : [];
      const beforeId = Number(url.searchParams.get('before_id') ?? 0);
      const pool = beforeId ? all.filter((message) => message.id < beforeId) : all;
      return json(pool.slice(-Number(url.searchParams.get('limit') ?? 50)));
    }
    const memberMatch = path.match(/^\/conversations\/(\d+)\/members$/);
    if (memberMatch && method === 'GET') {
      const pool = Number(memberMatch[1]) === 1 ? members : members.slice(0, 2);
      const limit = Number(url.searchParams.get('limit') ?? 20);
      const offset = Number(url.searchParams.get('offset') ?? 0);
      return json({ items: pool.slice(offset, offset + limit), total: pool.length, limit, offset, has_more: offset + limit < pool.length });
    }
    if (path === '/conversations') {
      return json(conversations);
    }
    if (path === '/users/online') {
      return json({ online_count: 38, users: people.slice(1, 39) });
    }
    if (path === '/users/online-count') {
      return json({ online_count: 38 });
    }
    return json([]);
  };

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, staleTime: 10_000 } } });
  useKukeStore.persist.setOptions({ name: 'kukechat-perf-harness' });
  useShopPrefs.persist.setOptions({ name: 'kukechat-perf-harness-prefs' });
  useThemeStore.persist.setOptions({ name: 'kukechat-perf-harness-theme' });
  useKukeStore.setState({ token: 'harness', currentUser: me, activeConversationId: 1, layoutMode: 'desktop', themeMode: theme, isOpen: true, workspaceView: 'chat', themeSettings: { ...DEFAULT_THEME_SETTINGS } });
  useShopPrefs.setState({ showOthersSkins: true });
  useThemeStore.setState({ performance: params.get('perf') === '1' });

  function receive(count: number): void {
    for (let index = 0; index < count; index += 1) {
      nextId += 1;
      const sender = people[1 + (nextId % (people.length - 1))];
      const message = { id: nextId, conversation_id: 1, sender_id: sender.id, sender, type: 'text', content: LINES[nextId % LINES.length], created_at: new Date().toISOString() } as Message;
      history.push(message);
      const visible = useKukeStore.getState().visibleConversationId;
      queryClient.setQueryData<Conversation[] | undefined>(['conversations'], (current) => applyCreatedMessageToConversations(current, message, visible, false, null));
      queryClient.setQueryData<MessagesInfiniteData | undefined>(['messages', 1], (current) => upsertMessageIntoFirstPage(current, message));
      emitRealtimeEvent({ type: 'message.created', rawType: 'message.created', data: message, receivedAt: new Date().toISOString() } as Parameters<typeof emitRealtimeEvent>[0]);
    }
  }

  function presence(count: number): void {
    for (let index = 0; index < count; index += 1) {
      const user = people[1 + Math.floor(Math.random() * (people.length - 1))];
      const data = { user_id: user.id, online: Math.random() > 0.5, online_count: 30 + Math.floor(Math.random() * 15) };
      useKukeStore.setState({ onlineCount: data.online_count });
      emitRealtimeEvent({ type: 'presence.updated', rawType: 'presence.updated', data, receivedAt: new Date().toISOString() } as Parameters<typeof emitRealtimeEvent>[0]);
    }
  }

  function typing(userId: number): void {
    emitRealtimeEvent({ type: 'unknown', rawType: 'typing', data: { conversation_id: 1, user_id: userId, user: people.find((person) => person.id === userId) }, receivedAt: new Date().toISOString() } as Parameters<typeof emitRealtimeEvent>[0]);
  }

  Object.assign(window, { __perf: { receive, presence, typing, queryClient, store: useKukeStore, themeStore: useThemeStore } });

  function App(): JSX.Element {
    const themeRoot = useThemeRootProps(theme);
    useWindowMotionPause(() => document.getElementById('kukechat-root'));
    return (
      <main data-theme={theme} data-layout="desktop" data-font-scale={1} data-kc-wallpaper={themeRoot['data-kc-wallpaper']} style={themeRoot.style} className="kc-desktop-app relative flex h-full min-h-0 flex-col overflow-hidden [color:var(--kc-text)]">
        <ThemeEffects scheme={theme} />
        <div className="kc-desktop-content relative z-0 min-h-0 flex-1 overflow-hidden [background:var(--kc-window)]">
          <ChatDashboard currentUser={me} />
        </div>
      </main>
    );
  }

  createRoot(document.getElementById('root') as HTMLElement).render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  );
}

void start();
