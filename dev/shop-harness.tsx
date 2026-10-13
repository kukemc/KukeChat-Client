/**
 * 商店和气泡皮肤的本地预览：不连后端，用假数据（dev/mocks/shop.ts）驱动真实组件。
 *
 *   npx vite --port 5185 --strictPort --host 127.0.0.1   →   http://127.0.0.1:5185/dev/shop-harness.html
 *
 * 初始状态可以写在地址里，方便截图：
 *   view=shop|chat|gallery|settings|app  layout=desktop|mobile       theme=dark
 *     （app 是整个主界面 ChatDashboard：看导航栏里的入口、移动端「空间」页里的入口、从设置直达商店这些接线）
 *   backend=ok|missing|error             bound=0                      donated=520  spent=240  level=23
 *   neverVerified=1（绑定后从没核实过）   noDonateUrl=1（服务端没配置官方作品）
 *   stale=1                              purchaseError=item_not_found|item_unavailable|already_owned|ccw_not_bound|item_locked|insufficient_coins|verification_unavailable|server
 *   refreshError=refresh_too_fast|ccw_not_bound|server                equipFails=1
 *   equipped=bubble.starry|none          owned=bubble.snow,bubble.sunny                        records=45
 *   others=0（不显示别人的皮肤）           perf=1（性能优先）            preset=sakura  wallpaper=chat|window  font=0..4
 *   w=980 h=680（桌面预览的尺寸）
 *
 * view=gallery 是「皮肤图鉴」：每个纹样、每个角饰、每种动效单独一格，再加几件组合起来的示例皮肤，
 * 每格旁边有文字和底色的对比度读数（低于 4.5 标红）。
 *
 * 脚本测试用 window.__shop：scenario / state（直接改拥有、装备）/ requests / store / queryClient / emit(type, data)。
 * 只用于开发时看界面，不会进入任何构建产物。
 */
import { useState, type CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@/styles/tailwind.css';
import { featureMocks } from './mocks';
import { SKINS, shopRequests, shopScenario, shopState, type ShopScenario } from './mocks/shop';
import { ChatDashboard } from '@/components/chat/ChatDashboard';
import { DesktopChatPanel } from '@/components/chat/desktop/DesktopChatPanel';
import { MessagePanel } from '@/components/chat/MessagePanel';
import { AppearanceSection } from '@/components/settings/desktop/PreferenceSections';
import { NavRail } from '@/components/shell/NavRail';
import { BubbleStage, tryOnSamples, type SampleMessage } from '@/components/shop/BubbleSample';
import { handleShopEvent, useShopAvailable } from '@/components/shop/data';
import { ShopPage } from '@/components/shop/desktop/ShopPage';
import { MobileShopPage } from '@/components/shop/mobile/MobileShopPage';
import { ShopGrantToasts } from '@/components/shop/ShopGrantToasts';
import { parseBubbleSkin } from '@/components/shop/skin/bubbleSkin';
import { Ornament, ORNAMENT_KEYS } from '@/components/shop/skin/ornaments';
import { PATTERN_KEYS } from '@/components/shop/skin/patterns';
import { emitRealtimeEvent } from '@/realtime/events';
import { useKukeStore, type UiFontScale } from '@/store/kukeStore';
import { useShopPrefs } from '@/store/shopPrefs';
import { ThemeEffects } from '@/theme/ThemeEffects';
import { DEFAULT_THEME_SETTINGS, getThemePreset } from '@/theme/themes';
import { useThemeStore } from '@/theme/themeStore';
import { useThemeRootProps } from '@/theme/useTheme';
import type { Conversation, ConversationMember, Message, User } from '@/types/api';

const params = new URLSearchParams(window.location.search);
type View = 'shop' | 'chat' | 'gallery' | 'settings' | 'app';
const VIEWS: View[] = ['shop', 'chat', 'gallery', 'settings', 'app'];

/* ───────── 聊天预览的假数据：群友各穿各的皮肤 ───────── */

const me = { id: 1, username: 'kuke', nickname: '酷可mc', ccw_student_oid: '6650a1b2c3d4e5f6a7b8c9d0', ccw_name: '酷可mc' } as User;
const wearing = (style: unknown, sku: string): User['cosmetics'] => ({ bubble: { sku, style } });
const people: User[] = [
  me,
  { id: 2, username: 'aqua', nickname: '阿夸', cosmetics: wearing(SKINS.starry, 'bubble.starry') } as User,
  { id: 3, username: 'mint', nickname: '薄荷糖', cosmetics: wearing(SKINS.sakura, 'bubble.sakura') } as User,
  { id: 4, username: 'robot', nickname: '任务小助手', is_bot: true } as User,
  { id: 5, username: 'long', nickname: '一个名字特别特别长的群友用来测试截断', cosmetics: wearing(SKINS.pixel, 'bubble.pixel') } as User,
  { id: 6, username: 'plain', nickname: '没装扮的路人', cosmetics: {} } as User,
  { id: 7, username: 'old', nickname: '旧后端的用户' } as User,
  { id: 8, username: 'bad', nickname: '皮肤数据坏了的人', cosmetics: wearing({ version: 1, background: 'url(https://evil.example/x.png)', text: '#fff' }, 'bubble.bad') } as User,
  { id: 9, username: 'aurora', nickname: '极光君', cosmetics: wearing(SKINS.aurora, 'bubble.aurora') } as User,
  { id: 10, username: 'candy', nickname: '糖糖', cosmetics: wearing(SKINS.candy, 'bubble.candy') } as User
];
const members = people.map((user, index) => ({ id: index + 1, conversation_id: 1, user_id: user.id, role: index === 0 ? 'owner' : index === 1 ? 'admin' : 'member', user, joined_at: '2026-01-01T00:00:00Z' }) as ConversationMember);
const conversations = [
  { id: 1, type: 'group', title: 'Scratch 创作交流群', display_title: 'Scratch 创作交流群', member_count: 128, unread_count: 0, updated_at: new Date().toISOString(), my_role: 'owner' }
] as Conversation[];

function picture(width: number, height: number, hue: number): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (context) {
    const gradient = context.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, `hsl(${hue} 80% 68%)`);
    gradient.addColorStop(1, `hsl(${(hue + 70) % 360} 78% 52%)`);
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
  }
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob ? URL.createObjectURL(blob) : ''), 'image/png'));
}

/** 一秒钟的静音 WAV，给语音消息当音频 */
function silence(): string {
  const samples = 8000;
  const buffer = new ArrayBuffer(44 + samples);
  const view = new DataView(buffer);
  const text = (offset: number, value: string): void => Array.from(value).forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples, true);
  text(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true);
  view.setUint32(28, 8000, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  text(36, 'data');
  view.setUint32(40, samples, true);
  new Uint8Array(buffer, 44).fill(128);
  return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
}

async function buildHistory(): Promise<Message[]> {
  const [wide, square] = await Promise.all([picture(640, 360, 200), picture(480, 480, 320)]);
  const voice = silence();
  const start = Date.now() - 40 * 60_000;
  let id = 1000;
  let minute = 0;
  const messages: Message[] = [];
  const say = (sender: User, content: string, extra: Partial<Message> = {}): Message => {
    id += 1;
    minute += 1;
    const message = { id, conversation_id: 1, sender_id: sender.id, sender, type: 'text', content, created_at: new Date(start + minute * 45_000).toISOString(), sender_level: ((sender.id * 7) % 30) + 1, ...extra } as Message;
    messages.push(message);
    return message;
  };
  const [, aqua, mint, bot, long, plain, old, bad, aurora, candy] = people;

  say(aqua, '早');
  say(aqua, '有人在吗，我刚把克隆体的碰撞检测改好了');
  const idea = say(aqua, '说一下思路：先把所有角色的坐标存进列表，每帧只更新移动过的那几个，然后用「碰到颜色」做粗筛，命中了再做精确判断。这样三百个克隆体也不会掉帧。');
  say(me, '好耶');
  say(me, '这个可以，等会发个链接 https://www.ccw.site/detail/6650a1b2c3d4e5f6a7b8c9d0 大家看看');
  say(mint, '哈哈哈哈哈 😂😂😂', { reactions: [{ emoji: '😂', count: 3, reacted_by_me: true }, { emoji: '👍', count: 1, reacted_by_me: false }] } as Partial<Message>);
  say(mint, '@酷可mc 周五晚上的接龙谁来开头', { metadata: { mentions: [{ user_id: 1, name: '酷可mc' }] } } as Partial<Message>);
  say(me, '我来吧', { metadata: { quote: { message_id: idea.id, sender_name: '阿夸', preview: idea.content.slice(0, 60), type: 'text' } } } as Partial<Message>);
  say(long, 'PRESS START');
  say(long, '多行消息\n第二行\n第三行，稍微长一点点用来看换行的表现', { featured: true } as Partial<Message>);
  say(long, '带两张图的消息', { metadata: { images: [wide, square] } } as Partial<Message>);
  say(plain, '我没有装扮，气泡应该是主题默认的');
  say(old, '我的用户对象上没有 cosmetics 字段（旧后端）');
  say(bad, '我的皮肤数据不合法（背景里带了 url），应该按没装备处理');
  say(aurora, '极光会缓缓流动', { bookmarked_by_me: true } as Partial<Message>);
  say(aurora, '回复一下', { metadata: { quote: { message_id: idea.id, sender_name: '阿夸', preview: '说一下思路：先把所有角色的坐标存进列表', type: 'text' } } } as Partial<Message>);
  say(candy, '给你一颗糖 🍬');
  say(candy, '👍');
  say(bot, '**机器人的 Markdown 消息** 不穿皮肤\n\n| 列 | 值 |\n| --- | --- |\n| a | 1 |', { metadata: { format: 'markdown' } } as Partial<Message>);
  say(aqua, '', { type: 'image', content: wide });
  say(aqua, '', { type: 'voice', content: voice, metadata: { voice: { duration_ms: 4200 } } } as Partial<Message>);
  say(me, '', { type: 'voice', content: voice, metadata: { voice: { duration_ms: 2600 } } } as Partial<Message>);
  say(mint, '[投票] 周五玩什么', { type: 'poll', metadata: { poll: { id: 1, title: '周五玩什么', options: [{ id: 1, text: '接龙', votes: 5 }, { id: 2, text: '速通', votes: 2 }], multiple: false, anonymous: false, closes_at: null, closed: false, closed_at: null, total_voters: 7, my_option_ids: [1] } } } as Partial<Message>);
  say(mint, '薄荷糖 加入了群聊', { type: 'system' });
  say(aqua, '这条被撤回了', { recalled_at: new Date().toISOString() } as Partial<Message>);
  say(me, '学到了。周五晚上的接龙我来开头，大家记得带上自己的角色，规则还是老样子：每人接一段，不许删别人的积木。', { bookmarked_by_me: true, featured: true } as Partial<Message>);
  say(me, '嗯');
  say(aqua, '晚安，好梦', { bookmarked_by_me: true } as Partial<Message>);
  say(mint, '一起去看樱花吧');
  return messages;
}

function installFetch(history: Message[]): void {
  const realFetch = window.fetch.bind(window);
  let nextId = 5000;
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
    for (const mock of featureMocks) {
      const mocked = await mock({ path, url, method, body });
      if (mocked) {
        return mocked;
      }
    }
    const respond = (data: unknown): Response => new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (/^\/conversations\/\d+\/messages$/.test(path)) {
      if (method === 'GET') {
        const beforeId = Number(url.searchParams.get('before_id') ?? 0);
        const pool = beforeId ? history.filter((message) => message.id < beforeId) : history;
        return respond(pool.slice(-Number(url.searchParams.get('limit') ?? 50)));
      }
      nextId += 1;
      const draft = (body ?? {}) as { content?: string; type?: Message['type']; metadata?: Message['metadata'] };
      const message = { id: nextId, conversation_id: 1, sender_id: me.id, sender: useKukeStore.getState().currentUser ?? me, type: draft.type ?? 'text', content: draft.content ?? '', metadata: draft.metadata, created_at: new Date().toISOString() } as Message;
      history.push(message);
      return respond(message);
    }
    if (path === '/conversations') {
      return respond(conversations);
    }
    // 预览页绝不把请求放到真实后端去：不认识的接口一律返回空
    return respond([]);
  };
}

/* ───────── 皮肤图鉴 ───────── */

function luminance(hex: string): number {
  const value = hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex;
  const channel = (offset: number): number => {
    const part = parseInt(value.slice(offset, offset + 2), 16) / 255;
    return part <= 0.03928 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** 文字和底色（渐变里的每个色标）之间最差的对比度。WCAG 正文要 4.5。 */
function worstContrast(text: string, background: string): number {
  const stops = background.match(/#[0-9a-f]{3,8}/gi) ?? [];
  const textLuminance = luminance(text);
  return Math.min(...stops.map((stop) => {
    const other = luminance(stop);
    return (Math.max(textLuminance, other) + 0.05) / (Math.min(textLuminance, other) + 0.05);
  }));
}

const SHORT: SampleMessage[] = [{ mine: false, text: '今天也要开心呀' }, { mine: true, text: '好' }];
const LONG: SampleMessage[] = [{ mine: false, text: '说一下思路：先把所有角色的坐标存进列表，每帧只更新移动过的那几个，命中了再做精确判断。' }, { mine: true, text: '学到了。\n周五晚上的接龙我来开头，大家记得带上自己的角色。' }];

const LIGHT_BASE = { version: 1, background: '#ffffff', text: '#1f2430', border: { color: '#1f243014', width: 1 }, dark: { background: '#262a33', text: '#eef0f4', border: { color: '#ffffff1f', width: 1 } } };
const DEEP_BASE = { version: 1, background: 'linear-gradient(135deg, #3b4bd8 0%, #6a3fd0 100%)', text: '#ffffff' };

function Cell({ title, style, layout, messages = SHORT, wide = false }: { title: string; style: unknown; layout: 'desktop' | 'mobile'; messages?: SampleMessage[]; wide?: boolean }): JSX.Element {
  const skin = parseBubbleSkin(style);
  const light = skin ? worstContrast(skin.light.text, skin.light.background) : 0;
  const dark = skin ? worstContrast(skin.dark.text, skin.dark.background) : 0;
  const ratio = (value: number): JSX.Element => <b style={{ color: value < 4.5 ? '#e0383e' : 'inherit' }}>{value.toFixed(1)}</b>;
  return (
    <div data-gallery={title} style={{ gridColumn: wide ? 'span 2' : undefined, minWidth: 0, borderRadius: 10, background: 'var(--kc-chat)', boxShadow: 'inset 0 0 0 1px var(--kc-border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '8px 12px 0', color: 'var(--kc-muted)', fontSize: 12 }}>
        <span style={{ fontWeight: 700, color: 'var(--kc-text)' }}>{title}</span>
        {skin ? <span title="文字与底色最差的对比度：浅色 / 深色">对比度 {ratio(light)} / {ratio(dark)}</span> : <span style={{ color: '#e0383e' }}>不是合法的皮肤</span>}
      </div>
      <BubbleStage style={style} messages={messages} layout={layout} avatars={wide} />
    </div>
  );
}

function Gallery({ layout }: { layout: 'desktop' | 'mobile' }): JSX.Element {
  const heading: CSSProperties = { margin: '22px 0 10px', fontSize: 15, fontWeight: 700 };
  const grid: CSSProperties = { display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${layout === 'mobile' ? 200 : 250}px, 1fr))`, gap: 12 };
  return (
    <div className="kui-scroll" data-harness="gallery" style={{ height: '100%', padding: '4px 24px 32px', background: 'var(--kc-chat)', color: 'var(--kc-text)' }}>
      <h2 style={heading}>组合示例</h2>
      <div style={grid}>
        {(['starry', 'sakura', 'pixel', 'aurora', 'sunny', 'candy', 'mint', 'kitty', 'royal', 'snow', 'thunder', 'ink'] as const).map((key) => <Cell key={key} title={key} style={SKINS[key]} layout={layout} messages={tryOnSamples('今天也要开心呀').slice(0, 5)} wide />)}
      </div>
      <h2 style={heading}>纹样（pattern）· 浅底 / 深底</h2>
      <div style={grid}>
        {PATTERN_KEYS.flatMap((key) => [
          <Cell key={`${key}-light`} title={`${key} · 浅底`} style={{ ...LIGHT_BASE, pattern: { key, color: '#3b6fe0', opacity: 0.22, scale: 1 }, dark: { ...LIGHT_BASE.dark, pattern: { key, color: '#9db8ff', opacity: 0.2, scale: 1 } } }} layout={layout} messages={[SHORT[0], LONG[1]]} />,
          <Cell key={`${key}-deep`} title={`${key} · 深底`} style={{ ...DEEP_BASE, pattern: { key, color: '#ffffff', opacity: 0.2, scale: 1 } }} layout={layout} messages={[LONG[0], SHORT[1]]} />
        ])}
      </div>
      <h2 style={heading}>纹样的不透明度和缩放（stars）</h2>
      <div style={grid}>
        {[[0.1, 0.5], [0.3, 1], [0.6, 1], [0.3, 2]].map(([opacity, scale]) => <Cell key={`${opacity}-${scale}`} title={`opacity ${opacity} · scale ${scale}`} style={{ ...DEEP_BASE, pattern: { key: 'stars', color: '#ffffff', opacity, scale } }} layout={layout} messages={LONG} />)}
      </div>
      <h2 style={heading}>角饰一览（放大到 56 像素看画得怎么样）</h2>
      <div style={{ display: 'grid', gap: 8 }}>
        {[['#ffffff', '#f59f00'], ['#2c2a72', '#ffe9a8'], ['#ffd2e0', '#ff5c8a'], ['#1d2333', '#a6f7b7']].map(([background, color]) => (
          <div key={background} data-gallery-strip={background} style={{ display: 'flex', flexWrap: 'wrap', gap: 14, padding: '14px 16px', borderRadius: 10, background }}>
            {ORNAMENT_KEYS.map((key) => (
              <span key={key} title={key} style={{ position: 'relative', width: 56, height: 56, margin: '48px 0 0 22px', isolation: 'isolate' }}>
                <Ornament spec={{ key, corner: 'tl', color, size: 56, animated: false }} motion={false} delay={0} />
              </span>
            ))}
          </div>
        ))}
      </div>
      <h2 style={heading}>角饰（ornaments）· 四个角、三种大小</h2>
      <div style={grid}>
        {ORNAMENT_KEYS.map((key) => (
          <Cell key={key} title={key} style={{ ...LIGHT_BASE, ornaments: [{ key, corner: 'tr', color: '#f59f00', size: 20, animated: true }, { key, corner: 'bl', color: '#f06595', size: 14, animated: true }] }} layout={layout} messages={[SHORT[0], LONG[1]]} />
        ))}
        {ORNAMENT_KEYS.map((key) => (
          <Cell key={`${key}-big`} title={`${key} · 28 / 10 · 深底`} style={{ ...DEEP_BASE, ornaments: [{ key, corner: 'tl', color: '#ffe9a8', size: 28 }, { key, corner: 'br', color: '#ffffff', size: 10 }] }} layout={layout} messages={[LONG[0], SHORT[1]]} />
        ))}
      </div>
      <h2 style={heading}>动效（animation）</h2>
      <div style={grid}>
        {(['none', 'flow', 'shimmer', 'breathe'] as const).map((animation) => <Cell key={animation} title={animation} style={{ ...DEEP_BASE, animation, shadow: '0 2px 10px #5a45d466' }} layout={layout} messages={LONG} />)}
        {(['shimmer', 'breathe'] as const).map((animation) => <Cell key={`${animation}-light`} title={`${animation} · 浅底`} style={{ ...LIGHT_BASE, animation, shadow: '0 2px 10px #3b6fe055' }} layout={layout} messages={LONG} />)}
      </div>
      <h2 style={heading}>不合法的皮肤（都应该按没装备处理，或者只丢掉坏的那一项）</h2>
      <div style={grid}>
        <Cell title="背景带 url()" style={{ version: 1, background: 'url(https://evil.example/x.png)', text: '#fff' }} layout={layout} />
        <Cell title="version 2" style={SKINS.future} layout={layout} />
        <Cell title="多了不认识的字段" style={{ ...DEEP_BASE, glitter: true }} layout={layout} />
        <Cell title="纹样 key 不认识（跳过纹样）" style={{ ...DEEP_BASE, pattern: { key: 'zebra', color: '#ffffff', opacity: 0.3, scale: 1 } }} layout={layout} />
        <Cell title="角饰一个不认识、一个正常" style={{ ...DEEP_BASE, ornaments: [{ key: 'dragon', corner: 'tr', color: '#ffffff', size: 18 }, { key: 'star', corner: 'bl', color: '#ffe9a8', size: 18 }] }} layout={layout} />
        <Cell title="阴影写了 inset / 超大（丢掉阴影）" style={{ ...DEEP_BASE, shadow: 'inset 0 0 999px #000000' }} layout={layout} />
      </div>
    </div>
  );
}

/* ───────── 外框 ───────── */

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });

function emit(rawType: string, data: unknown): void {
  // 和 src/realtime/client.ts 收到事件时做的事一样：先让缓存跟上，再分发给订阅者
  handleShopEvent(queryClient, rawType, data);
  emitRealtimeEvent({ type: 'unknown', rawType, data, receivedAt: new Date().toISOString() });
}

function DesktopDashboard({ view }: { view: View }): JSX.Element {
  const workspaceView = useKukeStore((state) => state.workspaceView);
  const setWorkspaceView = useKukeStore((state) => state.setWorkspaceView);
  const currentUser = useKukeStore((state) => state.currentUser) ?? me;
  const shopAvailable = useShopAvailable();
  const showing = view === 'gallery' ? 'gallery' : workspaceView;
  if (view === 'app') {
    return <ChatDashboard currentUser={currentUser} />;
  }
  return (
    <div className="kc-pc-dashboard" style={{ position: 'relative', display: 'grid', height: '100%', minHeight: 0, gridTemplateColumns: '56px minmax(0, 1fr)', overflow: 'hidden', background: 'var(--kc-window)', color: 'var(--kc-text)' }}>
      <NavRail view={workspaceView} unreadCount={3} hasUnseenAnnouncement={false} shopAvailable={shopAvailable} onNavigate={setWorkspaceView} onCreateGroup={() => undefined} onOpenAnnouncement={() => undefined} onOpenSettings={() => setWorkspaceView('settings')} />
      <main data-kc-surface="page" style={{ minWidth: 0, minHeight: 0, overflow: 'hidden', background: 'var(--kc-chat)' }}>
        {showing === 'gallery' ? <Gallery layout="desktop" />
          : showing === 'shop' ? <ShopPage />
          : showing === 'chat' ? <DesktopChatPanel conversations={conversations} currentUser={currentUser} currentRole="owner" members={members} />
          : showing === 'settings' ? <div className="scroll-soft" style={{ height: '100%', overflowY: 'auto', padding: '24px 20px' }}><AppearanceSection /></div>
          : <p data-harness="other-view" style={{ padding: 32, color: 'var(--kc-muted)' }}>这里是「{workspaceView}」工作区的占位。</p>}
      </main>
      <ShopGrantToasts />
    </div>
  );
}

function MobileScreen({ view }: { view: View }): JSX.Element {
  const currentUser = useKukeStore((state) => state.currentUser) ?? me;
  const [note, setNote] = useState('');
  return (
    <div className="kc-native-app" style={{ position: 'relative', height: '100%', width: '100%', overflow: 'hidden', background: 'var(--kc-mobile-bg)' }}>
      {view === 'app' ? <ChatDashboard currentUser={currentUser} />
        : view === 'gallery' ? <Gallery layout="mobile" />
        : view === 'chat' ? <MessagePanel conversations={conversations} currentUser={currentUser} currentRole="owner" members={members} friends={[]} isMobile onBack={() => setNote('点了返回')} />
        : <MobileShopPage onMobileBack={() => setNote('点了返回')} onOpenCcwBinding={() => setNote('要去设置里的「CCW 账号」')} />}
      {note ? <p data-harness="mobile-note" style={{ position: 'absolute', zIndex: 99, right: 8, bottom: 8, left: 8, padding: '6px 10px', borderRadius: 8, background: '#111827', color: '#fff', font: '12px sans-serif' }} onClick={() => setNote('')}>{note}</p> : null}
      <ShopGrantToasts />
    </div>
  );
}

const SELECTS: Array<{ key: keyof ShopScenario; label: string; options: string[] }> = [
  { key: 'backend', label: '后端', options: ['ok', 'missing', 'error'] },
  { key: 'purchaseError', label: '购买', options: ['none', 'item_not_found', 'item_unavailable', 'already_owned', 'ccw_not_bound', 'item_locked', 'insufficient_coins', 'verification_unavailable', 'server'] },
  { key: 'refreshError', label: '刷新', options: ['none', 'refresh_too_fast', 'ccw_not_bound', 'server'] }
];

function Harness(): JSX.Element {
  const [, rerender] = useState(0);
  const [theme, setTheme] = useState<'light' | 'dark'>(params.get('theme') === 'dark' ? 'dark' : 'light');
  const [view, setView] = useState<View>(VIEWS.includes(params.get('view') as View) ? params.get('view') as View : 'shop');
  const layout = useKukeStore((state) => state.layoutMode);
  const fontScale = useKukeStore((state) => state.uiFontScale);
  const showOthers = useShopPrefs((state) => state.showOthersSkins);
  const performance = useThemeStore((state) => state.performance);
  const themeRoot = useThemeRootProps(theme);
  const button: CSSProperties = { padding: '2px 8px', border: '1px solid #9aa1b1', borderRadius: 6, background: '#fff', color: '#12141a', font: '12px sans-serif', cursor: 'pointer' };
  const label: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, font: '12px sans-serif', color: '#12141a' };
  const reload = (): void => {
    void queryClient.resetQueries({ queryKey: ['shop'] });
    rerender((value) => value + 1);
  };
  const go = (next: View): void => {
    setView(next);
    if (next !== 'gallery' && next !== 'app') {
      useKukeStore.getState().setWorkspaceView(next);
    }
  };
  const width = Number(params.get('w')) || 0;
  const height = Number(params.get('h')) || 0;

  return (
    <div style={{ display: 'flex', height: '100%', flexDirection: 'column' }}>
      <div data-harness="controls" style={{ display: 'flex', flex: 'none', flexWrap: 'wrap', alignItems: 'center', gap: 6, padding: 6, background: '#e3e6ee' }}>
        {VIEWS.map((item) => <button key={item} type="button" style={{ ...button, fontWeight: view === item ? 700 : 400 }} data-harness={`view-${item}`} onClick={() => go(item)}>{item}</button>)}
        <button type="button" style={button} data-harness="layout" onClick={() => useKukeStore.setState({ layoutMode: layout === 'desktop' ? 'mobile' : 'desktop' })}>布局：{layout === 'desktop' ? '桌面' : '移动'}</button>
        <button type="button" style={button} data-harness="theme" onClick={() => {
          const next = theme === 'light' ? 'dark' : 'light';
          setTheme(next);
          useKukeStore.setState({ themeMode: next });
        }}>深浅色</button>
        {SELECTS.map(({ key, label: text, options }) => (
          <label key={key} style={label}>{text}
            <select data-harness={key} value={String(shopScenario[key])} style={{ font: '12px sans-serif' }} onChange={(event) => {
              Object.assign(shopScenario, { [key]: event.target.value });
              if (key === 'backend') {
                reload();
              } else {
                rerender((value) => value + 1);
              }
            }}>
              {options.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
        ))}
        <label style={label}><input type="checkbox" data-harness="bound" checked={shopScenario.bound} onChange={(event) => {
          shopScenario.bound = event.target.checked;
          reload();
        }} />已绑定</label>
        <label style={label}><input type="checkbox" data-harness="stale" checked={shopScenario.stale} onChange={(event) => {
          shopScenario.stale = event.target.checked;
          reload();
        }} />核实失败</label>
        <label style={label}><input type="checkbox" data-harness="equip-fails" checked={shopScenario.equipFails} onChange={(event) => {
          shopScenario.equipFails = event.target.checked;
          rerender((value) => value + 1);
        }} />装备失败</label>
        <label style={label}>等级<input type="number" data-harness="level" value={shopScenario.level} style={{ width: 48, font: '12px sans-serif' }} onChange={(event) => {
          shopScenario.level = Number(event.target.value) || 0;
          reload();
        }} /></label>
        <label style={label}>余额<input type="number" data-harness="balance" value={shopScenario.donated - shopScenario.spent} style={{ width: 60, font: '12px sans-serif' }} onChange={(event) => {
          shopScenario.donated = shopScenario.spent + (Number(event.target.value) || 0);
          reload();
        }} /></label>
        <button type="button" style={button} data-harness="donate" onClick={() => {
          shopScenario.pendingDonation += 200;
          rerender((value) => value + 1);
        }}>模拟在 CCW 投了 200 币{shopScenario.pendingDonation ? `（待刷新 ${shopScenario.pendingDonation}）` : ''}</button>
        <button type="button" style={button} data-harness="event-changed" onClick={() => {
          shopState.delist('bubble.ink');
          emit('shop.changed', {});
        }}>模拟 shop.changed（下架「墨」）</button>
        <button type="button" style={button} data-harness="event-granted" onClick={() => {
          const item = shopState.grant('bubble.thunder', 'grant');
          if (item) emit('shop.item.granted', { item, source: 'grant' });
        }}>模拟被赠送「雷霆」</button>
        <button type="button" style={button} data-harness="event-level" onClick={() => {
          const item = shopState.grant('bubble.kitty', 'level');
          if (item) emit('shop.item.granted', { item, source: 'level' });
        }}>模拟升级解锁「猫爪」</button>
        <label style={label}><input type="checkbox" data-harness="others" checked={showOthers} onChange={(event) => useShopPrefs.getState().setShowOthersSkins(event.target.checked)} />显示别人的皮肤</label>
        <label style={label}><input type="checkbox" data-harness="perf" checked={performance} onChange={(event) => useThemeStore.getState().setPerformance(event.target.checked)} />性能优先</label>
        <button type="button" style={button} data-harness="wallpaper" onClick={() => useKukeStore.getState().updateThemeSettings({ presetId: 'sakura', accent: null, bubbleStyle: null, wallpaper: getThemePreset('sakura').wallpaper ?? 'none', wallpaperScope: 'chat', wallpaperDim: 20 })}>樱花主题 + 聊天背景图</button>
        <button type="button" style={button} data-harness="preset-reset" onClick={() => useKukeStore.getState().resetThemeSettings()}>默认主题</button>
      </div>
      <div style={{ position: 'relative', display: 'grid', minHeight: 0, flex: 1, placeItems: layout === 'mobile' || width ? 'center' : 'stretch', background: '#cfd3dd' }}>
        {layout === 'mobile' ? (
          <main data-theme={theme} data-layout="mobile" data-font-scale={fontScale} data-harness="phone" style={{ position: 'relative', width: 390, height: 'min(100%, 800px)', overflow: 'hidden', transform: 'translateZ(0)', color: 'var(--kc-mobile-text)' }}>
            <MobileScreen view={view} />
          </main>
        ) : (
          <main data-theme={theme} data-layout="desktop" data-font-scale={fontScale} data-kc-wallpaper={themeRoot['data-kc-wallpaper']} style={{ ...themeRoot.style, position: 'relative', display: 'flex', width: width || '100%', height: height || '100%', minHeight: 0, flexDirection: 'column', overflow: 'hidden' }} className="kc-desktop-app">
            <ThemeEffects scheme={theme} />
            <div className="kc-desktop-content" style={{ position: 'relative', zIndex: 0, minHeight: 0, flex: 1, overflow: 'hidden' }}><DesktopDashboard view={view} /></div>
          </main>
        )}
      </div>
    </div>
  );
}

async function start(): Promise<void> {
  const flag = (name: string): boolean => params.get(name) === '1';
  const pick = <Key extends keyof ShopScenario>(key: Key, options: string[]): void => {
    const value = params.get(key);
    if (value && options.includes(value)) {
      Object.assign(shopScenario, { [key]: value });
    }
  };
  SELECTS.forEach(({ key, options }) => pick(key, options));
  if (params.get('bound') === '0') shopScenario.bound = false;
  shopScenario.stale = flag('stale');
  shopScenario.equipFails = flag('equipFails');
  shopScenario.neverVerified = flag('neverVerified');
  shopScenario.noDonateUrl = flag('noDonateUrl');
  for (const key of ['donated', 'spent', 'level'] as const) {
    if (params.get(key) !== null) shopScenario[key] = Number(params.get(key)) || 0;
  }
  if (params.get('owned') !== null) shopState.setOwned((params.get('owned') ?? '').split(',').filter(Boolean));
  if (params.get('equipped') !== null) shopState.setEquipped(params.get('equipped') === 'none' ? null : params.get('equipped'));
  if (params.get('records')) shopState.fillRecords(Number(params.get('records')) || 0);

  installFetch(await buildHistory());
  // 和真实应用同源：换存储键，免得把开发时真实的登录状态、主题、偏好冲掉
  useKukeStore.persist.setOptions({ name: 'kukechat-shop-harness' });
  useShopPrefs.persist.setOptions({ name: 'kukechat-shop-harness-prefs' });
  useThemeStore.persist.setOptions({ name: 'kukechat-shop-harness-theme' });
  const preset = params.get('preset');
  const wallpaper = params.get('wallpaper');
  const font = Number(params.get('font') ?? 1);
  const view = VIEWS.includes(params.get('view') as View) ? params.get('view') as View : 'shop';
  const equippedStyle = shopState.equippedStyle();
  useKukeStore.setState({
    token: 'harness',
    // 当前用户对象上的装扮和假后端里「装备着的」保持一致，就像刚从 /auth/me 拿回来
    currentUser: { ...me, cosmetics: equippedStyle ? { bubble: { sku: shopState.equippedSku() ?? '', style: equippedStyle } } : {} },
    activeConversationId: 1,
    layoutMode: params.get('layout') === 'mobile' ? 'mobile' : 'desktop',
    themeMode: params.get('theme') === 'dark' ? 'dark' : 'light',
    uiFontScale: (font >= 0 && font <= 4 ? font : 1) as UiFontScale,
    isOpen: true,
    workspaceView: view === 'gallery' ? 'shop' : view === 'app' ? 'chat' : view,
    pendingShop: false,
    themeSettings: { ...DEFAULT_THEME_SETTINGS, ...(preset ? { presetId: preset, wallpaper: getThemePreset(preset).wallpaper ?? 'none' } : {}), ...(wallpaper === 'window' || wallpaper === 'chat' ? { wallpaperScope: wallpaper, wallpaperDim: 20 } : {}) }
  });
  useShopPrefs.setState({ showOthersSkins: params.get('others') !== '0' });
  useThemeStore.setState({ performance: flag('perf') });
  queryClient.setQueryData(['conversations'], conversations);
  Object.assign(window, { __shop: { scenario: shopScenario, state: shopState, requests: shopRequests, store: useKukeStore, prefs: useShopPrefs, queryClient, emit } });
  createRoot(document.getElementById('root') as HTMLElement).render(
    <QueryClientProvider client={queryClient}>
      <Harness />
    </QueryClientProvider>
  );
}

void start();
