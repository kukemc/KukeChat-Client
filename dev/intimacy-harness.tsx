/**
 * 好友亲密度与好友成就的本地预览：不连后端，用假数据（dev/mocks/intimacy.ts）驱动真实组件。
 *
 *   npx vite --port 5190 --strictPort --host 127.0.0.1   →   http://127.0.0.1:5190/dev/intimacy-harness.html
 *
 * 四个画面（view）：
 *   gallery  全部徽章图形：每个系列 × 四档外框（铜 / 银 / 金 / 彩虹），加上没解锁、没揭晓的彩蛋，以及名字旁的小号
 *   friends  联系人风格的好友列表（名字旁挂徽章）和资料卡上的「友谊」一行，点开是「我们的友谊」弹层
 *   board    排行榜里的「亲密榜」页签
 *   toasts   模拟实时事件：解锁徽章、解锁彩蛋、友谊升级的提示
 * 初始状态可以写在地址里：view=gallery|friends|board|toasts   layout=desktop|mobile   theme=dark   open=好友 id（一进来就打开弹层）
 *
 * 成就目录（mocks/intimacy-catalog.json）是从后端导出的，后端改了目录要重新导出：
 *   cd ../KukeChat-Server && python -c "…"（同 KukeChat-Server/app/services/intimacy_catalog.py 的 LEVELS / SERIES）
 *
 * 只用于开发时看界面，不会进入任何构建产物。
 */
import { useState, type CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@/styles/tailwind.css';
import { me } from './posts-harness.mock';
import { badgeRefOf, CATALOG_SERIES, detailResponse, friendsResponse, FRIENDS, historyResponse, markSeen, rulesResponse, setDisplay } from './mocks/intimacy';
import { BadgeGlyph } from '@/components/intimacy/BadgeGlyph';
import { handleIntimacyEvent, openIntimacy } from '@/components/intimacy/data';
import { FriendBadgeMark } from '@/components/intimacy/FriendBadgeMark';
import { FriendIntimacyCard } from '@/components/intimacy/FriendIntimacyCard';
import { IntimacyHost } from '@/components/intimacy/IntimacyDialog';
import { IntimacyLeaderboard } from '@/components/intimacy/IntimacyLeaderboard';
import { IntimacyToasts } from '@/components/intimacy/IntimacyToasts';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { ToastHost } from '@/components/ui/toast';
import { emitRealtimeEvent } from '@/realtime/events';
import { useKukeStore } from '@/store/kukeStore';
import { DEFAULT_THEME_SETTINGS } from '@/theme/themes';
import { useThemeStore } from '@/theme/themeStore';
import { useThemeRootProps } from '@/theme/useTheme';
import type { BadgeTier } from '@/types/intimacy';

const params = new URLSearchParams(window.location.search);
type View = 'gallery' | 'friends' | 'board' | 'toasts';
const VIEWS: Array<{ id: View; label: string }> = [
  { id: 'gallery', label: '徽章图鉴' },
  { id: 'friends', label: '好友列表 + 弹层' },
  { id: 'board', label: '亲密榜' },
  { id: 'toasts', label: '提示' }
];

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });

/* ───────── 假后端：只接 /intimacy/... ───────── */

function installFetch(): void {
  const realFetch = window.fetch.bind(window);
  const respond = (data: unknown, status = 200): Response => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
  window.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, window.location.origin);
    const path = url.pathname.replace(/^.*\/api\/v1/, '');
    if (!path.startsWith('/intimacy/')) {
      return url.pathname.includes('/api/v1/') ? respond({ detail: 'not mocked' }, 404) : realFetch(input, init);
    }
    await new Promise((resolve) => window.setTimeout(resolve, 150));
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : {};
    if (path === '/intimacy/rules') {
      return respond(rulesResponse());
    }
    if (path === '/intimacy/friends') {
      return respond(friendsResponse());
    }
    const match = path.match(/^\/intimacy\/friends\/(\d+)(\/.*)?$/);
    if (match) {
      const id = Number(match[1]);
      const rest = match[2] ?? '';
      if (rest === '' ) {
        const detail = detailResponse(id);
        return detail ? respond(detail) : respond({ detail: { code: 'not_friend', message: '你们还不是好友' } }, 404);
      }
      if (rest === '/history') {
        return respond(historyResponse(id, Number(url.searchParams.get('days') ?? 14)));
      }
      if (rest === '/badge' && method === 'PUT') {
        const result = setDisplay(id, String(body.badge ?? 'auto'));
        void queryClient.invalidateQueries({ queryKey: ['intimacy', 'friends'] });
        return respond(result);
      }
      if (rest === '/seen' && method === 'POST') {
        return respond(markSeen(id));
      }
    }
    return respond({ detail: 'not mocked' }, 404);
  };
}

/* ───────── 画面 ───────── */

const card: CSSProperties = { padding: 16, borderRadius: 14, background: 'var(--kc-panel, #fff)', color: 'var(--kc-text)', border: '1px solid var(--kc-border, #e5e7eb)' };
const caption: CSSProperties = { font: '12px system-ui, sans-serif', color: 'var(--kc-muted, #64748b)' };
const TIERS: BadgeTier[] = [1, 2, 3, 4];
const TIER_NAMES = ['铜', '银', '金', '彩虹'];

function Gallery(): JSX.Element {
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <section style={card}>
        <h3 style={{ marginBottom: 10, fontWeight: 700 }}>外框四档 · 没解锁 · 没揭晓的彩蛋</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'flex-end' }}>
          {TIERS.map((tier) => <figure key={tier} style={{ textAlign: 'center' }}><BadgeGlyph icon="clover" tier={tier} size={72} /><figcaption style={caption}>{TIER_NAMES[tier - 1]}</figcaption></figure>)}
          <figure style={{ textAlign: 'center' }}><BadgeGlyph icon="clover" tier={2} size={72} locked /><figcaption style={caption}>没解锁</figcaption></figure>
          <figure style={{ textAlign: 'center' }}><BadgeGlyph icon="unknown" tier={4} size={72} mystery locked /><figcaption style={caption}>彩蛋（没揭晓）</figcaption></figure>
          <figure style={{ textAlign: 'center' }}><BadgeGlyph icon="nope" tier={1} size={72} /><figcaption style={caption}>认不出的图形</figcaption></figure>
        </div>
      </section>
      <section style={card}>
        <h3 style={{ marginBottom: 10, fontWeight: 700 }}>全部系列（每一级）</h3>
        <div style={{ display: 'grid', gap: 12 }}>
          {CATALOG_SERIES.map((series) => (
            <div key={series.key} style={{ display: 'grid', gridTemplateColumns: '150px 1fr', alignItems: 'center', gap: 12 }}>
              <div>
                <b style={{ fontSize: 13 }}>{series.name}</b>{series.hidden ? <span style={{ ...caption, marginLeft: 6, color: '#ec4899' }}>彩蛋</span> : null}
                <div style={caption}>{series.key} · {series.icon}</div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
                {series.levels.map((level) => (
                  <figure key={level.level} style={{ width: 84, textAlign: 'center' }}>
                    <BadgeGlyph icon={series.icon} tier={level.tier as BadgeTier} size={56} />
                    <figcaption style={{ ...caption, color: 'var(--kc-text)' }}>{level.name}</figcaption>
                    <figcaption style={caption}>{level.threshold}</figcaption>
                  </figure>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
      <section style={card}>
        <h3 style={{ marginBottom: 10, fontWeight: 700 }}>名字旁的小号（14 / 16 / 18 像素）</h3>
        {[14, 16, 18].map((size) => (
          <p key={size} style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', fontSize: size - 1, marginBottom: 6 }}>
            {CATALOG_SERIES.map((series) => <span key={series.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>阿夸<BadgeGlyph icon={series.icon} tier={series.levels[series.levels.length - 1].tier as BadgeTier} size={size} /></span>)}
          </p>
        ))}
      </section>
    </div>
  );
}

function Friends(): JSX.Element {
  return (
    <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', alignItems: 'start' }}>
      <section style={{ ...card, padding: 8 }}>
        <p style={{ ...caption, padding: '4px 8px 8px' }}>联系人列表：名字旁挂的是「我」选的那一枚（薄荷糖那里指定了「月下夜话」，其余自动）</p>
        {FRIENDS.map((friend) => (
          <button key={friend.user.id} type="button" className="kcc-item" style={{ width: '100%' }} onClick={() => openIntimacy(friend.user.id)}>
            <Avatar user={friend.user} size="message" />
            <span className="kcc-item-main">
              <span className="kcc-item-title">{getDisplayName(friend.user)} <FriendBadgeMark userId={friend.user.id} /></span>
              <span className="kcc-item-sub">{friend.user.bio || '这个人很神秘，还没有简介'}</span>
            </span>
          </button>
        ))}
      </section>
      <section style={{ ...card, display: 'grid', gap: 10 }}>
        <p style={caption}>资料卡上的「友谊」一行（点开弹层）；最后一个人亲密度是 0</p>
        {FRIENDS.map((friend) => <FriendIntimacyCard key={friend.user.id} userId={friend.user.id} />)}
        <p style={caption}>聊天标题、群里发言人旁边的样子（可点）：</p>
        <p style={{ display: 'flex', alignItems: 'center', gap: 4, fontWeight: 700 }}>阿夸 <FriendBadgeMark userId={2} size={18} openable /></p>
        <p style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>薄荷糖 <FriendBadgeMark userId={3} size={14} openable /> <span style={caption}>12:30</span></p>
      </section>
    </div>
  );
}

function Toasts(): JSX.Element {
  const emit = (rawType: string, data: unknown): void => {
    handleIntimacyEvent(queryClient, rawType, data);
    emitRealtimeEvent({ type: 'unknown', rawType, data, receivedAt: new Date().toISOString() } as Parameters<typeof emitRealtimeEvent>[0]);
  };
  const aqua = { id: 2, display_name: '阿夸', avatar_url: null };
  const buttons: Array<{ label: string; run: () => void }> = [
    { label: '解锁一枚（友谊幸运草）', run: () => emit('intimacy.badge.unlocked', { friend_id: 2, friend: aqua, badges: [badgeRefOf('clover', 1)] }) },
    { label: '一次解锁三枚', run: () => emit('intimacy.badge.unlocked', { friend_id: 2, friend: aqua, badges: [badgeRefOf('night', 1), badgeRefOf('together', 2), badgeRefOf('streak', 3)] }) },
    { label: '解锁彩蛋（千年之后）', run: () => emit('intimacy.badge.unlocked', { friend_id: 2, friend: aqua, badges: [badgeRefOf('sunmoon', 1)] }) },
    { label: '解锁彩蛋（和谐之元）', run: () => emit('intimacy.badge.unlocked', { friend_id: 2, friend: aqua, badges: [badgeRefOf('harmony', 1)] }) },
    { label: '友谊升级（知己）', run: () => emit('intimacy.level.up', { friend_id: 2, friend: aqua, level: 6, level_name: '知己' }) }
  ];
  return (
    <section style={{ ...card, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {buttons.map((button) => <button key={button.label} type="button" className="kui-btn" onClick={button.run}>{button.label}</button>)}
      <p style={{ ...caption, width: '100%' }}>提示里点「看看」会打开「我们的友谊」。</p>
    </section>
  );
}

function Harness(): JSX.Element {
  const [view, setView] = useState<View>(() => (VIEWS.some((item) => item.id === params.get('view')) ? params.get('view') as View : 'gallery'));
  const [layout, setLayout] = useState<'desktop' | 'mobile'>(() => (params.get('layout') === 'mobile' ? 'mobile' : 'desktop'));
  const [dark, setDark] = useState(() => params.get('theme') === 'dark');
  const theme = dark ? 'dark' : 'light';
  const themeRoot = useThemeRootProps(theme);
  const isMobile = layout === 'mobile';
  if (useKukeStore.getState().layoutMode !== layout) {
    useKukeStore.setState({ layoutMode: layout });
  }
  const frameStyle: CSSProperties = isMobile
    ? { position: 'relative', width: 390, height: 'min(100%, 780px)', overflow: 'hidden', borderRadius: 28, transform: 'translateZ(0)' }
    : { position: 'relative', width: '100%', height: '100%', overflow: 'hidden' };

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0, flexDirection: 'column', background: '#eef1f6' }}>
      <aside style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', padding: '10px 12px', borderBottom: '1px solid #d7dce5', background: '#f8fafc', font: '12px system-ui, sans-serif' }}>
        <strong>好友亲密度 · 预览</strong>
        {VIEWS.map((item) => <button key={item.id} type="button" onClick={() => setView(item.id)} style={{ padding: '3px 9px', borderRadius: 6, border: '1px solid #cbd5e1', background: view === item.id ? '#0f172a' : '#fff', color: view === item.id ? '#fff' : '#0f172a', cursor: 'pointer' }}>{item.label}</button>)}
        <span style={{ width: 12 }} />
        <label>布局 <select value={layout} onChange={(event) => setLayout(event.target.value as 'desktop' | 'mobile')}><option value="desktop">desktop</option><option value="mobile">mobile</option></select></label>
        <label><input type="checkbox" checked={dark} onChange={(event) => setDark(event.target.checked)} /> 深色</label>
      </aside>
      <div style={{ position: 'relative', display: 'grid', minHeight: 0, flex: 1, placeItems: isMobile ? 'center' : 'stretch', background: '#cfd3dd' }}>
        <main data-theme={theme} data-layout={layout} data-font-scale={1} style={{ ...(isMobile ? undefined : themeRoot.style), ...frameStyle }} className={isMobile ? 'kc-window-frame' : 'kc-desktop-app kc-window-frame'}>
          <div className="kui kui-scroll" style={{ height: '100%', overflow: 'auto', padding: isMobile ? 12 : 20, background: isMobile ? 'var(--kc-mobile-bg, #f1f3f8)' : 'var(--kc-window, #f5f6fa)' }}>
            {view === 'gallery' ? <Gallery /> : null}
            {view === 'friends' ? <Friends /> : null}
            {view === 'board' ? <IntimacyLeaderboard layout={layout} /> : null}
            {view === 'toasts' ? <Toasts /> : null}
          </div>
          <IntimacyHost />
        </main>
      </div>
      <IntimacyToasts />
      <ToastHost />
    </div>
  );
}

installFetch();
useKukeStore.persist.setOptions({ name: 'kukechat-intimacy-harness' });
useThemeStore.persist.setOptions({ name: 'kukechat-intimacy-harness-theme' });
useKukeStore.setState({ token: 'harness', currentUser: me, layoutMode: params.get('layout') === 'mobile' ? 'mobile' : 'desktop', themeSettings: DEFAULT_THEME_SETTINGS });
useThemeStore.setState({ performance: false });
if (params.get('open')) {
  openIntimacy(Number(params.get('open')));
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <QueryClientProvider client={queryClient}>
    <Harness />
  </QueryClientProvider>
);
