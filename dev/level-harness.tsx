/**
 * 账号等级的本地预览：不连后端，用假数据（dev/mocks/level.ts）驱动真实组件。
 *
 *   npx vite --port 5186 --strictPort --host 127.0.0.1   →   http://127.0.0.1:5186/dev/level-harness.html
 *
 * 初始状态可以写在地址里，方便截图：
 *   view=icons|chat|level|board|cards|settings|app   layout=desktop|mobile   theme=dark
 *     icons   等级图标图鉴：四种图形放大了看、边界等级的完整 / 紧凑两种形态、0–256 级全排出来
 *     chat    聊天：群友各有各的等级（消息行、成员列表、点头像出来的资料卡）
 *     level / board   等级页的两个页签
 *     cards   别人的等级卡、通知中心里的升级通知、联系人和搜索结果里的图标
 *     app     整个主界面 ChatDashboard：看各个入口的接线、移动端从商店去绑定 CCW 的一步到位
 *   backend=ok|missing|error      level=23     extra=10.5（超出当前等级门槛的天数）
 *   streak=12   rank=37|none      online=95    messages=12   checkin=0   bound=0   jury=1
 *   meFails=1   board=132（榜上的人数）  emptyHistory=1
 *   inchat=0（关掉「在聊天里显示等级图标」）   perf=1（性能优先）   font=0..4   w=980 h=680
 *
 * 脚本测试用 window.__level：scenario / requests / store / levelStore / queryClient / emit(type, data) / levelUp(level)。
 * 只用于开发时看界面，不会进入任何构建产物。
 */
import { useState, type CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@/styles/tailwind.css';
import { featureMocks } from './mocks';
import { BOUNDARY_LEVELS, MAX_LEVEL, daysForLevel, iconsOf, levelRequests, levelScenario, levelState, type LevelScenario } from './mocks/level';
import { SKINS, shopScenario } from './mocks/shop';
import { ChatDashboard } from '@/components/chat/ChatDashboard';
import { DesktopChatPanel } from '@/components/chat/desktop/DesktopChatPanel';
import { MessagePanel } from '@/components/chat/MessagePanel';
import { NotificationsPane } from '@/components/contacts/desktop/NotificationsPane';
import type { ContactsData } from '@/components/contacts/useContactsData';
import { handleLevelEvent, useLevelRules } from '@/components/level/data';
import { LevelPage } from '@/components/level/desktop/LevelPage';
import { LevelGlyph } from '@/components/level/LevelGlyph';
import { LevelHoverCard } from '@/components/level/LevelHoverCard';
import { LevelIcons, UserLevelIcons } from '@/components/level/LevelIcons';
import { LEVEL_ICON_KEYS } from '@/components/level/levelMath';
import { LevelNotificationIcon } from '@/components/level/LevelNotificationIcon';
import { LevelUpToasts } from '@/components/level/LevelUpToasts';
import { MobileLevelPage } from '@/components/level/mobile/MobileLevelPage';
import { UserLevelCard } from '@/components/level/UserLevelCard';
import { AppearanceSection } from '@/components/settings/desktop/PreferenceSections';
import { NavRail } from '@/components/shell/NavRail';
import { handleShopEvent, useShopAvailable } from '@/components/shop/data';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { UserCard } from '@/components/ui/UserCard';
import { emitRealtimeEvent } from '@/realtime/events';
import { useKukeStore, type UiFontScale } from '@/store/kukeStore';
import { useLevelStore } from '@/store/levelStore';
import { ThemeEffects } from '@/theme/ThemeEffects';
import { DEFAULT_THEME_SETTINGS } from '@/theme/themes';
import { useThemeStore } from '@/theme/themeStore';
import { useThemeRootProps } from '@/theme/useTheme';
import type { Conversation, ConversationMember, Message, UnifiedNotification, User } from '@/types/api';

const params = new URLSearchParams(window.location.search);
type View = 'icons' | 'chat' | 'level' | 'board' | 'cards' | 'settings' | 'app';
const VIEWS: View[] = ['icons', 'chat', 'level', 'board', 'cards', 'settings', 'app'];

/* ───────── 假数据：群友各有各的等级 ───────── */

const meBase = { id: 1, username: 'kuke', nickname: '酷可mc', ccw_student_oid: '6650a1b2c3d4e5f6a7b8c9d0', ccw_name: '酷可mc', bio: '在写 KukeChat' } as User;
const wearing = (style: unknown, sku: string): User['cosmetics'] => ({ bubble: { sku, style } });
const others: User[] = [
  { id: 2, username: 'aqua', nickname: '阿夸', account_level: 64, jury_badge: 'senior', cosmetics: wearing(SKINS.starry, 'bubble.starry'), bio: '三百个克隆体也不掉帧' } as User,
  { id: 3, username: 'mint', nickname: '薄荷糖', account_level: 4, cosmetics: wearing(SKINS.sakura, 'bubble.sakura') } as User,
  { id: 4, username: 'robot', nickname: '任务小助手', is_bot: true, account_level: 9 } as User,
  { id: 5, username: 'long', nickname: '一个名字特别特别长的群友用来测试截断', account_level: 255, jury_badge: 'regular' } as User,
  { id: 6, username: 'newbie', nickname: '刚来的新人', account_level: 0 } as User,
  { id: 7, username: 'old', nickname: '旧后端的用户（没有等级字段）' } as User,
  { id: 8, username: 'star3', nickname: '三颗星', account_level: 3 } as User,
  { id: 9, username: 'sun', nickname: '小太阳', account_level: 16 } as User,
  { id: 10, username: 'mix', nickname: '十五级', account_level: 15, jury_badge: 'trainee' } as User,
  { id: 11, username: 'almost', nickname: '六十三级', account_level: 63 } as User,
  { id: 12, username: 'max', nickname: '满级大佬', account_level: 256 } as User,
  { id: 13, username: 'one', nickname: '一级', account_level: 1 } as User,
  { id: 14, username: 'bad', nickname: '等级字段是坏的', account_level: 'abc' as unknown as number } as User
];

function currentMe(): User {
  return useKukeStore.getState().currentUser ?? meBase;
}

function buildMembers(me: User): ConversationMember[] {
  return [me, ...others].map((user, index) => ({ id: index + 1, conversation_id: 1, user_id: user.id, role: index === 0 ? 'owner' : index === 1 ? 'admin' : 'member', user, joined_at: '2026-01-01T00:00:00Z' }) as ConversationMember);
}

const conversations = [
  { id: 1, type: 'group', title: 'Scratch 创作交流群', display_title: 'Scratch 创作交流群', member_count: 128, unread_count: 0, updated_at: new Date().toISOString(), my_role: 'owner' }
] as Conversation[];

function buildHistory(me: User): Message[] {
  const start = Date.now() - 40 * 60_000;
  let id = 1000;
  let minute = 0;
  const messages: Message[] = [];
  const say = (sender: User, content: string, extra: Partial<Message> = {}): void => {
    id += 1;
    minute += 2;
    messages.push({ id, conversation_id: 1, sender_id: sender.id, sender, type: 'text', content, created_at: new Date(start + minute * 45_000).toISOString(), sender_level: ((sender.id * 7) % 30) + 1, ...extra } as Message);
  };
  const [aqua, mint, bot, long, newbie, old, star3, sun, mix, almost, max, one, bad] = others;
  say(aqua, '早。我是 64 级，一个皇冠');
  say(mint, '我 4 级，一个月亮', { sender_title: '群宠' } as Partial<Message>);
  say(me, '我自己的消息，等级读的是当前用户对象');
  say(long, '255 级：三个皇冠，紧凑形态下只画皇冠加数字，昵称再长也不该把它挤没');
  say(newbie, '0 级，不显示图标');
  say(old, '旧后端的用户对象上没有 account_level，也不显示');
  say(star3, '3 级，三颗星');
  say(sun, '16 级，一个太阳');
  say(mix, '15 级：三个月亮');
  say(almost, '63 级：三个太阳');
  say(max, '256 级：四个皇冠');
  say(one, '1 级，一颗星');
  say(bot, '机器人没有等级', { metadata: { format: 'markdown' } } as Partial<Message>);
  say(bad, '我的等级字段不是数字，应该按没有等级处理');
  say(me, '再来一条自己的');
  say(aqua, '晚安');
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
      const draft = (body ?? {}) as { content?: string; type?: Message['type'] };
      const message = { id: nextId, conversation_id: 1, sender_id: meBase.id, sender: currentMe(), type: draft.type ?? 'text', content: draft.content ?? '', created_at: new Date().toISOString() } as Message;
      history.push(message);
      return respond(message);
    }
    if (path === '/conversations') {
      return respond(conversations);
    }
    if (/^\/conversations\/\d+\/members/.test(path)) {
      return respond(buildMembers(currentMe()));
    }
    if (/^\/users\/\d+\/online$/.test(path)) {
      return respond({ online: true, presence_status: 'online' });
    }
    const profile = path.match(/^\/users\/(\d+)$/);
    if (profile) {
      return respond([currentMe(), ...others].find((user) => user.id === Number(profile[1])) ?? {});
    }
    if (path === '/friends') {
      return respond([others[0], others[1], others[3], others[4], others[10]].map((user, index) => ({ id: index + 1, user_id: meBase.id, friend_id: user.id, user: currentMe(), friend: user, created_at: '2026-03-01T00:00:00Z' })));
    }
    if (path === '/users/search') {
      const keyword = (url.searchParams.get('q') ?? '').toLowerCase();
      return respond([currentMe(), ...others].filter((user) => `${user.username}${user.nickname}`.toLowerCase().includes(keyword)));
    }
    if (path === '/notifications') {
      return respond({ items: notifications(), unread_count: 2, pending_count: 0, counts: { system: 3 } });
    }
    // 预览页绝不把请求放到真实后端去：不认识的接口一律返回空
    return respond([]);
  };
}

function notifications(): UnifiedNotification[] {
  const item = (level: number, minutesAgo: number, unread: boolean): UnifiedNotification => ({
    id: `account_level:${level}`, category: 'system', type: 'account_level', title: `升到 Lv.${level} 了`, body: `累计活跃 ${daysForLevel(level)} 天，继续保持。`,
    time: new Date(Date.now() - minutesAgo * 60_000).toISOString(), unread, pending: false, action: 'none' as UnifiedNotification['action'], payload: { level, icons: iconsOf(level) }
  });
  return [item(64, 3, true), item(16, 600, true), item(4, 5000, false), { id: 'sys:1', category: 'system', type: 'system', title: '一条普通的系统通知', body: '用来对比：它没有落点，也不换图标。', time: new Date(Date.now() - 9000 * 60_000).toISOString(), unread: false, pending: false, action: 'none' as UnifiedNotification['action'] }];
}

/* ───────── 等级图标图鉴 ───────── */

const heading: CSSProperties = { margin: '22px 0 10px', fontSize: 15, fontWeight: 700 };
const note: CSSProperties = { margin: '0 0 10px', color: 'var(--kc-muted)', fontSize: 12.5 };

function Swatch({ background, children, label }: { background: string; children: React.ReactNode; label: string }): JSX.Element {
  return (
    <div data-swatch={label} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 18, padding: '14px 16px', borderRadius: 10, background }}>
      <span style={{ width: 86, color: 'var(--kc-muted)', fontSize: 12 }}>{label}</span>
      {children}
    </div>
  );
}

function Gallery({ layout }: { layout: 'desktop' | 'mobile' }): JSX.Element {
  const all = Array.from({ length: MAX_LEVEL + 1 }, (_, level) => level);
  const surfaces: Array<[string, string]> = [['画布', 'var(--kc-chat)'], ['面板', 'var(--kc-panel)'], ['列表栏', 'var(--kc-list, var(--kc-panel-muted))'], ['强调色的淡底', 'var(--kc-accent-soft)']];
  return (
    <div className="kui kui-scroll" data-harness="gallery" style={{ height: '100%', padding: '4px 24px 32px', background: 'var(--kc-chat)', color: 'var(--kc-text)', fontSize: 13.5, overflowY: 'auto' }}>
      <h2 style={heading}>四种图形 · 放大了看（56 / 28 像素）</h2>
      <div style={{ display: 'grid', gap: 8 }}>
        {surfaces.map(([label, background]) => (
          <Swatch key={label} label={label} background={background}>
            {LEVEL_ICON_KEYS.slice().reverse().map((kind) => <LevelGlyph key={kind} kind={kind} size={56} />)}
            {LEVEL_ICON_KEYS.slice().reverse().map((kind) => <LevelGlyph key={`${kind}-28`} kind={kind} size={28} />)}
          </Swatch>
        ))}
      </div>
      <h2 style={heading}>实际大小（12 / 13 / 14 / 16 像素）</h2>
      <div style={{ display: 'grid', gap: 8 }}>
        {surfaces.slice(0, 2).map(([label, background]) => (
          <Swatch key={label} label={label} background={background}>
            {[12, 13, 14, 16].map((size) => (
              <span key={size} data-size={size} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                <span style={{ marginRight: 4, color: 'var(--kc-subtle)', fontSize: 11 }}>{size}</span>
                {LEVEL_ICON_KEYS.slice().reverse().map((kind) => <LevelGlyph key={kind} kind={kind} size={size} />)}
              </span>
            ))}
          </Swatch>
        ))}
      </div>
      <h2 style={heading}>边界等级 · 完整的图标串 / 紧凑形态</h2>
      <p style={note}>紧凑形态只画最大的那一种图标，后面跟等级数字；0 级什么都不画。悬停（或点一下）紧凑形态会弹出完整的图标串。</p>
      <div data-gallery="boundaries" style={{ display: 'grid', gridTemplateColumns: layout === 'mobile' ? '44px 76px minmax(0, 1fr)' : '56px 110px minmax(0, 1fr) minmax(0, 1.3fr)', alignItems: 'center', gap: '8px 14px', padding: 14, borderRadius: 10, background: 'var(--kc-panel)' }}>
        {BOUNDARY_LEVELS.flatMap((level) => [
          <b key={`n${level}`} style={{ fontVariantNumeric: 'tabular-nums' }}>Lv.{level}</b>,
          <span key={`c${level}`} data-boundary-compact={level}><LevelIcons level={level} userId={level === 23 ? 1 : 12} />{level === 0 ? <span style={{ color: 'var(--kc-subtle)', fontSize: 12 }}>（不显示）</span> : null}</span>,
          <span key={`f${level}`} data-boundary-full={level}><LevelIcons level={level} variant="full" plain /></span>,
          layout === 'mobile' ? null : <span key={`l${level}`} style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, color: 'var(--kc-muted)', fontSize: 12 }}>
            <span className="kcd-tag">LV8 萌新</span><LevelIcons level={level} plain /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>昵称在这里</span><span style={{ color: 'var(--kc-subtle)' }}>12:30</span>
          </span>
        ])}
      </div>
      <h2 style={heading}>0–256 级 · 紧凑形态</h2>
      <div data-gallery="all-compact" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(74px, 1fr))', gap: '6px 10px', padding: 14, borderRadius: 10, background: 'var(--kc-panel)' }}>
        {all.map((level) => <span key={level} data-level-cell={level} style={{ display: 'flex', minHeight: 18, alignItems: 'center' }}>{level === 0 ? <span style={{ color: 'var(--kc-subtle)', fontSize: 11 }}>0 · 无</span> : <LevelIcons level={level} plain />}</span>)}
      </div>
      <h2 style={heading}>0–256 级 · 完整的图标串</h2>
      <div data-gallery="all-full" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(212px, 1fr))', gap: '6px 12px', padding: 14, borderRadius: 10, background: 'var(--kc-panel)' }}>
        {all.map((level) => (
          <span key={level} style={{ display: 'flex', minHeight: 18, alignItems: 'center', gap: 8 }}>
            <span style={{ width: 28, color: 'var(--kc-subtle)', fontSize: 11, fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>{level}</span>
            <LevelIcons level={level} variant="full" plain />
          </span>
        ))}
      </div>
    </div>
  );
}

/* ───────── 等级卡、通知、联系人里的图标 ───────── */

function notificationData(): ContactsData {
  const items = notifications();
  return {
    notificationsQuery: { isLoading: false, data: { items, unread_count: 2, pending_count: 0, counts: { system: items.length } } },
    notifications: items,
    notificationCount: items.length,
    pendingCount: 0,
    requestBusy: false,
    openPost: () => undefined,
    openConversation: () => undefined,
    acceptMutation: { mutate: () => undefined },
    rejectMutation: { mutate: () => undefined },
    acceptGroupRequestMutation: { mutate: () => undefined },
    rejectGroupRequestMutation: { mutate: () => undefined }
  } as unknown as ContactsData;
}

function Cards({ layout }: { layout: 'desktop' | 'mobile' }): JSX.Element {
  const me = useKukeStore((state) => state.currentUser) ?? meBase;
  const [card, setCard] = useState<User | null>(null);
  const samples = [me, others[0], others[3], others[4], others[5], others[2], { id: 404, username: 'ghost', nickname: '不存在的用户（404）', account_level: 9 } as User];
  const box: CSSProperties = { padding: 14, borderRadius: 10, background: 'var(--kc-panel)' };
  return (
    <div className="kui kui-scroll" data-harness="cards" style={{ position: 'relative', height: '100%', padding: '4px 24px 32px', background: 'var(--kc-chat)', color: 'var(--kc-text)', fontSize: 13.5, overflowY: 'auto' }}>
      <h2 style={heading}>等级卡 · 资料卡里的一行（variant="row"）</h2>
      <p style={note}>自己的整块可点（进等级页）；机器人、不存在的用户不出现；0 级和旧后端的用户仍然有卡（Lv.0）。点名字可以打开真正的资料卡。</p>
      <div style={{ display: 'grid', gap: 8 }}>
        {samples.map((user) => (
          <div key={user.id} data-card-sample={user.id} style={{ ...box, display: 'grid', gridTemplateColumns: layout === 'mobile' ? 'minmax(0, 1fr)' : '200px minmax(0, 1fr)', alignItems: 'center', gap: 10 }}>
            <button type="button" data-open-card={user.id} style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, textAlign: 'left' }} onClick={() => setCard(user)}>
              <Avatar user={user} size="sm" /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{getDisplayName(user)}</span>
            </button>
            <UserLevelCard user={user} />
          </div>
        ))}
      </div>
      <h2 style={heading}>等级卡 · 个人主页上的一块（variant="block"）</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
        {[me, others[0], others[3], others[10]].map((user) => <div key={user.id} style={box} data-block-sample={user.id}><p style={{ ...note, marginBottom: 8 }}>{getDisplayName(user)}</p><UserLevelCard user={user} variant="block" /></div>)}
      </div>
      <h2 style={heading}>列表里的图标（联系人、搜索结果、成员名单）</h2>
      <div style={{ ...box, display: 'grid', gap: 6 }} data-harness="list-icons">
        {[me, ...others].map((user) => (
          <div key={user.id} style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <Avatar user={user} size="sm" />
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{getDisplayName(user)} <UserLevelIcons user={user} self={user.id === me.id} /></span>
          </div>
        ))}
      </div>
      <h2 style={heading}>通知中心里的升级通知</h2>
      <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
        {[4, 16, 64, 23].map((level) => <LevelNotificationIcon key={level} notification={{ payload: { level } }} />)}
        <LevelNotificationIcon notification={{ payload: { level: 64 } }} className="is-large" />
      </div>
      {layout === 'desktop' ? <div style={{ height: 420, borderRadius: 10, overflow: 'hidden', background: 'var(--kc-chat)' }} data-harness="notifications"><NotificationsPane data={notificationData()} /></div> : <p style={note}>通知中心的列表在 view=app 的「联系人 → 通知」里看。</p>}
      {card ? <UserCard user={card} anchor={{ left: 260, top: 120 }} onClose={() => setCard(null)} /> : null}
    </div>
  );
}

/* ───────── 外框 ───────── */

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });

function emit(rawType: string, data: unknown): void {
  // 和 src/realtime/client.ts 收到事件时做的事一样：先让缓存跟上，再分发给订阅者
  handleShopEvent(queryClient, rawType, data);
  handleLevelEvent(queryClient, rawType, data);
  emitRealtimeEvent({ type: 'unknown', rawType, data, receivedAt: new Date().toISOString() });
}

/** 模拟升到某一级：假后端里的等级先改掉，再发事件 */
function levelUp(level: number): void {
  levelScenario.level = Math.min(MAX_LEVEL, Math.max(1, level));
  levelScenario.extraDays = 0;
  emit('account.level.up', { level: levelScenario.level, icons: iconsOf(levelScenario.level), active_days: daysForLevel(levelScenario.level) });
}

function Probe(): null {
  // 真实应用里这一句在 ChatDashboard；单独预览某个界面时由预览页自己探测
  useLevelRules();
  return null;
}

function DesktopDashboard({ view }: { view: View }): JSX.Element {
  const workspaceView = useKukeStore((state) => state.workspaceView);
  const setWorkspaceView = useKukeStore((state) => state.setWorkspaceView);
  const currentUser = useKukeStore((state) => state.currentUser) ?? meBase;
  const shopAvailable = useShopAvailable();
  if (view === 'app') {
    return <ChatDashboard currentUser={currentUser} />;
  }
  const showing = view === 'icons' || view === 'cards' ? view : workspaceView;
  return (
    <div className="kc-pc-dashboard" style={{ position: 'relative', display: 'grid', height: '100%', minHeight: 0, gridTemplateColumns: '56px minmax(0, 1fr)', overflow: 'hidden', background: 'var(--kc-window)', color: 'var(--kc-text)' }}>
      <Probe />
      <NavRail view={workspaceView} unreadCount={3} hasUnseenAnnouncement={false} shopAvailable={shopAvailable} onNavigate={setWorkspaceView} onCreateGroup={() => undefined} onOpenAnnouncement={() => undefined} onOpenSettings={() => setWorkspaceView('settings')} />
      <main data-kc-surface="page" style={{ position: 'relative', minWidth: 0, minHeight: 0, overflow: 'hidden', background: 'var(--kc-chat)' }}>
        {showing === 'icons' ? <Gallery layout="desktop" />
          : showing === 'cards' ? <Cards layout="desktop" />
          : showing === 'level' ? <LevelPage />
          : showing === 'chat' ? <DesktopChatPanel conversations={conversations} currentUser={currentUser} currentRole="owner" members={buildMembers(currentUser)} />
          : showing === 'settings' ? <div className="scroll-soft" style={{ height: '100%', overflowY: 'auto', padding: '24px 20px' }}><AppearanceSection /></div>
          : <p data-harness="other-view" style={{ padding: 32, color: 'var(--kc-muted)' }}>这里是「{workspaceView}」工作区的占位。</p>}
        <LevelUpToasts />
      </main>
      <LevelHoverCard />
    </div>
  );
}

function MobileScreen({ view }: { view: View }): JSX.Element {
  const currentUser = useKukeStore((state) => state.currentUser) ?? meBase;
  const pendingLevel = useKukeStore((state) => state.pendingLevel);
  const [noteText, setNoteText] = useState('');
  return (
    <div className="kc-native-app" style={{ position: 'relative', height: '100%', width: '100%', overflow: 'hidden', background: 'var(--kc-mobile-bg)' }}>
      {view === 'app' ? <ChatDashboard currentUser={currentUser} /> : (
        <>
          <Probe />
          {view === 'icons' ? <Gallery layout="mobile" />
            : view === 'cards' ? <Cards layout="mobile" />
            : view === 'chat' ? <MessagePanel conversations={conversations} currentUser={currentUser} currentRole="owner" members={buildMembers(currentUser)} friends={[]} isMobile onBack={() => setNoteText('点了返回')} />
            : <MobileLevelPage key={view} initialTab={view === 'board' ? 'board' : 'me'} onMobileBack={() => setNoteText('点了返回')} />}
          <LevelUpToasts />
          <LevelHoverCard />
          {pendingLevel ? <p data-harness="pending-level" style={{ position: 'absolute', zIndex: 99, right: 8, bottom: 40, left: 8, padding: '6px 10px', borderRadius: 8, background: '#111827', color: '#fff', font: '12px sans-serif' }} onClick={() => useKukeStore.getState().clearPendingLevel()}>要打开等级页（{pendingLevel}）——真实应用里由 ChatDashboard 接住</p> : null}
        </>
      )}
      {noteText ? <p data-harness="mobile-note" style={{ position: 'absolute', zIndex: 99, right: 8, bottom: 8, left: 8, padding: '6px 10px', borderRadius: 8, background: '#111827', color: '#fff', font: '12px sans-serif' }} onClick={() => setNoteText('')}>{noteText}</p> : null}
    </div>
  );
}

function Harness(): JSX.Element {
  const [, rerender] = useState(0);
  const [theme, setTheme] = useState<'light' | 'dark'>(params.get('theme') === 'dark' ? 'dark' : 'light');
  const [view, setView] = useState<View>(VIEWS.includes(params.get('view') as View) ? params.get('view') as View : 'icons');
  const layout = useKukeStore((state) => state.layoutMode);
  const fontScale = useKukeStore((state) => state.uiFontScale);
  const showInChat = useLevelStore((state) => state.showInChat);
  const performance = useThemeStore((state) => state.performance);
  const themeRoot = useThemeRootProps(theme);
  const button: CSSProperties = { padding: '2px 8px', border: '1px solid #9aa1b1', borderRadius: 6, background: '#fff', color: '#12141a', font: '12px sans-serif', cursor: 'pointer' };
  const label: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, font: '12px sans-serif', color: '#12141a' };
  const reload = (): void => {
    void queryClient.resetQueries({ queryKey: ['levels'] });
    rerender((value) => value + 1);
  };
  /** 假后端里「我」的等级变了：像刚从 /auth/me 拿回来一样，把当前用户对象上的等级也改掉 */
  const setMyLevel = (level: number): void => {
    levelScenario.level = Math.min(MAX_LEVEL, Math.max(0, level));
    const user = useKukeStore.getState().currentUser;
    if (user) {
      useKukeStore.getState().setCurrentUser({ ...user, account_level: levelScenario.level });
    }
    reload();
  };
  const go = (next: View): void => {
    setView(next);
    if (next === 'level' || next === 'board') {
      useKukeStore.setState({ workspaceView: 'level', levelTab: next === 'board' ? 'board' : 'me' });
    } else if (next === 'chat' || next === 'settings') {
      useKukeStore.getState().setWorkspaceView(next);
    }
  };
  const number = (key: 'streak' | 'onlineMinutes' | 'messages' | 'boardSize', text: string, width = 48): JSX.Element => (
    <label style={label}>{text}<input type="number" data-harness={key} value={levelScenario[key]} style={{ width, font: '12px sans-serif' }} onChange={(event) => {
      levelScenario[key] = Math.max(0, Number(event.target.value) || 0);
      reload();
    }} /></label>
  );
  const check = (key: 'checkin' | 'ccwBound' | 'jury' | 'meFails' | 'emptyHistory', text: string): JSX.Element => (
    <label style={label}><input type="checkbox" data-harness={key} checked={levelScenario[key]} onChange={(event) => {
      levelScenario[key] = event.target.checked;
      reload();
    }} />{text}</label>
  );
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
        <label style={label}>后端
          <select data-harness="backend" value={levelScenario.backend} style={{ font: '12px sans-serif' }} onChange={(event) => {
            levelScenario.backend = event.target.value as LevelScenario['backend'];
            // 换了后端：探测结果也要从头来
            useLevelStore.setState({ available: null });
            reload();
          }}>
            {['ok', 'missing', 'error'].map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <label style={label}>我的等级<input type="number" data-harness="level" value={levelScenario.level} style={{ width: 52, font: '12px sans-serif' }} onChange={(event) => setMyLevel(Number(event.target.value) || 0)} /></label>
        {BOUNDARY_LEVELS.map((level) => <button key={level} type="button" style={{ ...button, padding: '2px 5px' }} data-harness={`level-${level}`} onClick={() => setMyLevel(level)}>{level}</button>)}
        <label style={label}>名次<input type="text" data-harness="rank" value={levelScenario.rank ?? ''} placeholder="无" style={{ width: 44, font: '12px sans-serif' }} onChange={(event) => {
          levelScenario.rank = event.target.value.trim() ? Math.max(1, Number(event.target.value) || 1) : null;
          reload();
        }} /></label>
        {number('streak', '连续')}
        {number('onlineMinutes', '在线分钟')}
        {number('messages', '发言')}
        {check('checkin', '签到')}
        {check('ccwBound', '绑了 CCW')}
        {check('jury', '评审')}
        {check('meFails', '/me 出错')}
        {check('emptyHistory', '近 30 天为空')}
        {number('boardSize', '榜上人数', 56)}
        <button type="button" style={button} data-harness="event-up" onClick={() => levelUp(levelScenario.level + 1)}>模拟升一级</button>
        {[4, 16, 64].map((level) => <button key={level} type="button" style={button} data-harness={`event-up-${level}`} onClick={() => levelUp(level)}>升到 {level}</button>)}
        <button type="button" style={button} data-harness="event-cosmetics" onClick={() => emit('user.cosmetics.updated', { user_id: 2, cosmetics: { bubble: { sku: 'bubble.aurora', style: SKINS.aurora } } })}>模拟阿夸换成「极光」</button>
        <button type="button" style={button} data-harness="event-cosmetics-off" onClick={() => emit('user.cosmetics.updated', { user_id: 2, cosmetics: {} })}>模拟阿夸卸下皮肤</button>
        <button type="button" style={button} data-harness="event-cosmetics-me" onClick={() => emit('user.cosmetics.updated', { user_id: 1, cosmetics: { bubble: { sku: 'bubble.candy', style: SKINS.candy } } })}>模拟我在别处换成「糖果」</button>
        <label style={label}><input type="checkbox" data-harness="inchat" checked={showInChat} onChange={(event) => useLevelStore.getState().setShowInChat(event.target.checked)} />聊天里显示等级</label>
        <label style={label}><input type="checkbox" data-harness="perf" checked={performance} onChange={(event) => useThemeStore.getState().setPerformance(event.target.checked)} />性能优先</label>
        <label style={label}><input type="checkbox" data-harness="shop-bound" checked={shopScenario.bound} onChange={(event) => {
          shopScenario.bound = event.target.checked;
          void queryClient.resetQueries({ queryKey: ['shop'] });
          rerender((value) => value + 1);
        }} />商店：已绑定</label>
        <label style={label}>商店后端
          <select data-harness="shop-backend" value={shopScenario.backend} style={{ font: '12px sans-serif' }} onChange={(event) => {
            shopScenario.backend = event.target.value as typeof shopScenario.backend;
            void queryClient.resetQueries({ queryKey: ['shop'] });
            rerender((value) => value + 1);
          }}>
            {['ok', 'missing', 'error'].map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
      </div>
      <div style={{ position: 'relative', display: 'grid', minHeight: 0, flex: 1, placeItems: layout === 'mobile' || width ? 'center' : 'stretch', background: '#cfd3dd' }}>
        {layout === 'mobile' ? (
          <main data-theme={theme} data-layout="mobile" data-font-scale={fontScale} data-harness="phone" className="kc-window-frame" style={{ position: 'relative', width: 390, height: 'min(100%, 800px)', overflow: 'hidden', transform: 'translateZ(0)', color: 'var(--kc-mobile-text)', animation: 'none' }}>
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

function start(): void {
  const flag = (name: string): boolean => params.get(name) === '1';
  const backend = params.get('backend');
  if (backend === 'missing' || backend === 'error') levelScenario.backend = backend;
  const numeric: Array<[string, 'level' | 'streak' | 'onlineMinutes' | 'messages' | 'boardSize' | 'extraDays']> = [['level', 'level'], ['streak', 'streak'], ['online', 'onlineMinutes'], ['messages', 'messages'], ['board', 'boardSize'], ['extra', 'extraDays']];
  for (const [name, key] of numeric) {
    if (params.get(name) !== null) levelScenario[key] = Math.max(0, Number(params.get(name)) || 0);
  }
  if (params.get('rank') !== null) levelScenario.rank = params.get('rank') === 'none' ? null : Math.max(1, Number(params.get('rank')) || 1);
  if (params.get('checkin') === '0') levelScenario.checkin = false;
  if (params.get('bound') === '0') levelScenario.ccwBound = false;
  levelScenario.jury = flag('jury');
  levelScenario.meFails = flag('meFails');
  levelScenario.emptyHistory = flag('emptyHistory');
  if (params.get('shop') === 'missing') shopScenario.backend = 'missing';
  if (params.get('shopBound') === '0') shopScenario.bound = false;

  const me = { ...meBase, account_level: levelScenario.level, cosmetics: {} } as User;
  levelState.register(others);
  levelState.setMe(me);
  installFetch(buildHistory(me));
  // 和真实应用同源：换存储键，免得把开发时真实的登录状态、主题、偏好冲掉
  useKukeStore.persist.setOptions({ name: 'kukechat-level-harness' });
  useLevelStore.persist.setOptions({ name: 'kukechat-level-harness-prefs' });
  useThemeStore.persist.setOptions({ name: 'kukechat-level-harness-theme' });
  const font = Number(params.get('font') ?? 1);
  const view = VIEWS.includes(params.get('view') as View) ? params.get('view') as View : 'icons';
  useKukeStore.setState({
    token: 'harness',
    currentUser: me,
    activeConversationId: 1,
    layoutMode: params.get('layout') === 'mobile' ? 'mobile' : 'desktop',
    themeMode: params.get('theme') === 'dark' ? 'dark' : 'light',
    uiFontScale: (font >= 0 && font <= 4 ? font : 1) as UiFontScale,
    isOpen: true,
    workspaceView: view === 'level' || view === 'board' ? 'level' : view === 'chat' || view === 'settings' ? view : 'chat',
    levelTab: view === 'board' ? 'board' : 'me',
    levelReturnView: 'chat',
    pendingLevel: null,
    pendingShop: false,
    themeSettings: DEFAULT_THEME_SETTINGS
  });
  useLevelStore.setState({ showInChat: params.get('inchat') !== '0', available: null });
  useThemeStore.setState({ performance: flag('perf') });
  queryClient.setQueryData(['conversations'], conversations);
  Object.assign(window, { __level: { scenario: levelScenario, shopScenario, requests: levelRequests, store: useKukeStore, levelStore: useLevelStore, queryClient, emit, levelUp } });
  createRoot(document.getElementById('root') as HTMLElement).render(
    <QueryClientProvider client={queryClient}>
      <Harness />
    </QueryClientProvider>
  );
}

start();
