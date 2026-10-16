/**
 * 群升级 / 群文件 / 群待办 / 精华 / 聊天记录搜索的本地预览：不连后端，用假数据（dev/mocks/groupPlus.ts）驱动真实组件。
 *
 *   npx vite --port 5195 --strictPort --host 127.0.0.1   →   http://127.0.0.1:5195/dev/group-plus-harness.html
 *
 * 桌面布局是真的聊天界面（导航栏 + 会话列表 + DesktopChatPanel），移动布局是手机框里的 MessagePanel：
 * 头部档位标签、待办条、精华 / 搜索入口、消息里的文件卡片都在真实界面里看得到；面板（升级、群文件、搜索、待办全文）
 * 由 GroupPlusHosts 画，和主界面一样。上方控制条切场景、触发入口、模拟实时事件。
 *
 * 初始状态可以写在地址里，方便截图：
 *   view=chat|upgrade|files|todo|search|searchall|featured   一进来要看什么（upgrade / files / search / searchall 会自动打开面板；featured 点开精华）
 *   layout=desktop|mobile   theme=dark   font=0..4   perf=1（性能优先，不放动画）
 *   tier=free|pro|pro_plus|max|expired|grace   看哪一个群（expired 是记录里 Pro 已过期的群，grace 是文件宽限期的群）
 *   staff=0（我是普通成员，不是群主）   balance=ok|short|unbound   backend=ok|disabled|missing
 *   purchase=insufficient_balance|ccw_not_bound|verification_unavailable|plan_changed|price_changed|server（购买时强制返回的错误）
 *   upload=quota_exceeded|file_too_large|muted|rate_limited|server（上传时强制返回的错误）   full=1（设精华时返回已达上限）
 *   delay=毫秒（接口延迟）   w= h=（桌面窗口大小）
 *
 * 上传文件时 XMLHttpRequest 被换成假的（分块触发 upload.onprogress），进度条是真的在走；下载返回一个小文本。
 * 脚本测试用 window.__groupPlus：scenario / state / queryClient / store / events。
 * 只用于开发时看界面，不会进入任何构建产物。
 */
import { useState, type CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import '@/styles/tailwind.css';
import { featureMocks } from './mocks';
import {
  addRemoteFile, groupTierOf, initGroupPlusMock, handleGroupFileUpload, plusConversations, plusMe, plusPeople, plusScenario, plusState, PLUS_GROUP_IDS,
  setGroupTier, setGroupTodoState, todoOf, type PlusScenario
} from './mocks/groupPlus';
import { shopScenario } from './mocks/shop';
import { getConversations } from '@/api/conversations';
import { DesktopChatPanel } from '@/components/chat/desktop/DesktopChatPanel';
import { MessagePanel } from '@/components/chat/MessagePanel';
import { applyPlusToCaches, groupPlusKeys, handleGroupPlusEvent } from '@/components/groupPlus/data';
import { GroupPlusHosts } from '@/components/groupPlus/GroupPlusHosts';
import { useGroupFileUploads } from '@/components/groupPlus/uploads';
import { useGroupPlusUi } from '@/components/groupPlus/ui';
import { shopKeys } from '@/components/shop/data';
import { ConversationPane } from '@/components/shell/ConversationPane';
import { NavRail } from '@/components/shell/NavRail';
import { emitRealtimeEvent } from '@/realtime/events';
import { useKukeStore, type UiFontScale } from '@/store/kukeStore';
import { useModerationStore } from '@/store/moderationStore';
import { ThemeEffects } from '@/theme/ThemeEffects';
import { DEFAULT_THEME_SETTINGS } from '@/theme/themes';
import { useThemeStore } from '@/theme/themeStore';
import { useThemeRootProps } from '@/theme/useTheme';
import type { ConversationMember } from '@/types/api';

const params = new URLSearchParams(window.location.search);
const layout: 'desktop' | 'mobile' = params.get('layout') === 'mobile' ? 'mobile' : 'desktop';
const view = params.get('view') ?? 'chat';
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, staleTime: Infinity } } });

type TierChoice = 'free' | 'pro' | 'pro_plus' | 'max' | 'expired';

/** tier 参数 → 默认看哪个群。没写时按 view 选一个能看到东西的：升级看 Pro 群（有「作废」提示），其余看 Pro+ 群（文件、待办都有） */
function initialGroupId(): number {
  switch (params.get('tier')) {
    case 'free': return PLUS_GROUP_IDS.free;
    case 'pro': return PLUS_GROUP_IDS.pro;
    case 'pro_plus': return PLUS_GROUP_IDS.pro_plus;
    case 'max': return PLUS_GROUP_IDS.max;
    case 'expired': return PLUS_GROUP_IDS.expiredPro;
    case 'grace': return PLUS_GROUP_IDS.grace;
    default: return view === 'upgrade' ? PLUS_GROUP_IDS.pro : PLUS_GROUP_IDS.pro_plus;
  }
}

const GROUP_OPTIONS: Array<{ id: number; label: string }> = [
  { id: PLUS_GROUP_IDS.free, label: '免费群' },
  { id: PLUS_GROUP_IDS.pro, label: 'Pro 群' },
  { id: PLUS_GROUP_IDS.pro_plus, label: 'Pro+ 群' },
  { id: PLUS_GROUP_IDS.max, label: 'MAX 群' },
  { id: PLUS_GROUP_IDS.expiredPro, label: '过期的 Pro 群' },
  { id: PLUS_GROUP_IDS.grace, label: '文件宽限期的群' },
  { id: PLUS_GROUP_IDS.direct, label: '私聊' }
];

/* ───────── 假 XMLHttpRequest：只接管 /api/v1/ 的上传 ───────── */

interface FakeProgressEvent {
  lengthComputable: boolean;
  loaded: number;
  total: number;
}

/**
 * 真实代码用 XMLHttpRequest 上传（拿得到上传进度），fetch 的假实现覆盖不到它。
 * 这里按块「发送」：每 150ms 推进一格，把进度交给 upload.onprogress，走完调 handleGroupFileUpload 决定成功还是报错。
 * 大文件（≥ 20MB）多走几格，进度条停留得久一点，方便看取消。
 */
class FakeXhr {
  upload: { onprogress: ((event: FakeProgressEvent) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  status = 0;
  responseText = '';
  private path = '';
  private timer: number | null = null;

  open(_method: string, url: string): void {
    this.path = url.replace(/^.*\/api\/v1/, '').split('?')[0];
  }

  setRequestHeader(): void {
    // 假实现不看请求头
  }

  send(form: FormData): void {
    const file = form.get('file');
    const total = file instanceof File ? file.size : 0;
    const steps = total >= 20 * 1024 * 1024 ? 24 : 12;
    let step = 0;
    this.timer = window.setInterval(() => {
      step += 1;
      this.upload.onprogress?.({ lengthComputable: true, loaded: Math.round((total * step) / steps), total });
      if (step < steps) {
        return;
      }
      if (this.timer !== null) {
        window.clearInterval(this.timer);
        this.timer = null;
      }
      const result = handleGroupFileUpload(this.path, form);
      if (!result) {
        this.status = 404;
        this.responseText = JSON.stringify({ detail: 'Not Found' });
      } else {
        this.status = result.status;
        this.responseText = JSON.stringify(result.body);
      }
      this.onload?.();
    }, 150);
  }

  abort(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
      this.onabort?.();
    }
  }
}

/* ───────── 假后端：fetch ───────── */

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
    for (const handler of featureMocks) {
      const mocked = await handler({ path, url, method, body });
      if (mocked) {
        return mocked;
      }
    }
    // 其余接口一律返回空，不会漏到真实后端去
    if (path === '/moderation/me') {
      return new Response(JSON.stringify({ muted_until: null, mute_reason: null }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (/\/members\/\d+$/.test(path)) {
      return new Response(JSON.stringify(buildMembers()[0]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
}

function buildMembers(): ConversationMember[] {
  return plusPeople.map((user, index) => ({
    id: index + 1, conversation_id: 1, user_id: user.id, role: index === 0 ? (plusScenario.staff ? 'owner' : 'member') : index === 1 ? 'admin' : 'member',
    user, joined_at: `2026-01-0${index + 1}T00:00:00Z`, activity_score: 1280 - index * 173
  }) as ConversationMember);
}

/* ───────── 场景切换：和真实应用里「事件到了」做的事一样 ───────── */

function syncConversations(): void {
  queryClient.setQueryData(['conversations'], plusConversations());
}

/** 先让缓存跟上，再把事件分发出去（订阅事件的界面听的是它）：和 src/realtime/client.ts 收到事件时做的一样 */
function dispatch(rawType: 'group.plus.updated' | 'group.todo.updated' | 'group.file.updated', data: Record<string, unknown>): void {
  handleGroupPlusEvent(queryClient, rawType, data);
  emitRealtimeEvent({ type: rawType, rawType, data, receivedAt: new Date().toISOString() });
}

function effectiveOf(id: number): { tier: 'free' | 'pro' | 'pro_plus' | 'max'; expires: string | null } {
  const conversation = plusConversations().find((item) => item.id === id);
  const tier = groupTierOf(id);
  const raw = conversation?.plus_tier ?? 'free';
  if (tier === 'expired') {
    return { tier: 'free', expires: null };
  }
  return { tier: raw, expires: conversation?.plus_expires_at ?? null };
}

function changeTier(id: number, tier: TierChoice, reason: 'grant' | 'revoke' | 'purchase'): void {
  setGroupTier(id, tier);
  const next = effectiveOf(id);
  syncConversations();
  dispatch('group.plus.updated', { conversation_id: id, plus_tier: next.tier, plus_expires_at: next.expires, reason });
}

/* ───────── 控制条 ───────── */

function Controls({ activeId }: { activeId: number }): JSX.Element {
  const [, rerender] = useState(0);
  const refresh = (): void => rerender((value) => value + 1);
  const theme = useKukeStore((state) => state.themeMode);
  const fontScale = useKukeStore((state) => state.uiFontScale);
  const performance = useThemeStore((state) => state.performance);
  const openUpgrade = useGroupPlusUi((state) => state.openUpgrade);
  const openFiles = useGroupPlusUi((state) => state.openFiles);
  const openChatSearch = useGroupPlusUi((state) => state.openChatSearch);
  const uploads = useGroupFileUploads((state) => state.tasks);
  const todo = todoOf(activeId);
  const button: CSSProperties = { padding: '2px 8px', border: '1px solid #9aa1b1', borderRadius: 6, background: '#fff', color: '#12141a', font: '12px sans-serif', cursor: 'pointer' };
  const label: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, font: '12px sans-serif', color: '#12141a' };
  const select: CSSProperties = { font: '12px sans-serif' };
  const link = (next: Record<string, string>): string => {
    const query = new URLSearchParams(window.location.search);
    Object.entries(next).forEach(([key, value]) => query.set(key, value));
    return `?${query.toString()}`;
  };
  const balance = shopScenario.bound ? shopScenario.donated - shopScenario.spent : null;
  const scenarioSelect = <K extends 'backend' | 'purchaseError' | 'uploadError'>(key: K, options: Array<PlusScenario[K]>, name: string, text: string, after?: () => void): JSX.Element => (
    <label style={label}>{text}
      <select data-harness={name} value={plusScenario[key]} style={select} onChange={(event) => {
        plusScenario[key] = event.target.value as PlusScenario[K];
        after?.();
        refresh();
      }}>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
  const resetPlusQueries = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['group-plus'] });
    void queryClient.invalidateQueries({ queryKey: ['group-files'] });
    void queryClient.invalidateQueries({ queryKey: ['featured-messages'] });
    syncConversations();
  };
  return (
    <div data-harness="controls" style={{ position: 'relative', zIndex: 1, display: 'flex', flex: 'none', flexWrap: 'wrap', alignItems: 'center', gap: 6, padding: 6, background: '#e3e6ee' }}>
      <strong style={{ font: '700 12px sans-serif', color: '#12141a' }}>群升级</strong>
      <a href={link({ layout: layout === 'desktop' ? 'mobile' : 'desktop' })} style={{ ...button, textDecoration: 'none' }}>布局：{layout === 'desktop' ? '桌面' : '移动'}</a>
      <button type="button" style={button} data-harness="theme" onClick={() => useKukeStore.setState({ themeMode: theme === 'dark' ? 'light' : 'dark' })}>深浅色</button>
      <button type="button" style={button} data-harness="font" onClick={() => useKukeStore.setState({ uiFontScale: ((fontScale + 1) % 5) as UiFontScale })}>字号 {fontScale}</button>
      <button type="button" style={button} data-harness="perf" onClick={() => useThemeStore.setState({ performance: !performance })}>性能优先：{performance ? '开' : '关'}</button>
      <label style={label}>会话
        <select data-harness="group" value={activeId} style={select} onChange={(event) => useKukeStore.getState().setActiveConversationId(Number(event.target.value))}>
          {GROUP_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select>
      </label>
      <label style={label}>档位
        <select data-harness="tier" value={groupTierOf(activeId)} style={select} onChange={(event) => {
          changeTier(activeId, event.target.value as TierChoice, event.target.value === 'free' ? 'revoke' : 'grant');
          refresh();
        }}>
          {(['free', 'pro', 'pro_plus', 'max', 'expired'] as const).map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </label>
      <button type="button" style={button} data-harness="staff" onClick={() => {
        plusScenario.staff = !plusScenario.staff;
        resetPlusQueries();
        refresh();
      }}>身份：{plusScenario.staff ? '群主' : '普通成员'}</button>
      <label style={label}>余额{balance === null ? '（未绑定）' : `（${balance}）`}
        <select data-harness="balance" value={!shopScenario.bound ? 'unbound' : (balance ?? 0) >= 5000 ? 'ok' : 'short'} style={select} onChange={(event) => {
          const value = event.target.value;
          shopScenario.bound = value !== 'unbound';
          shopScenario.donated = shopScenario.spent + (value === 'short' ? 50 : 20000);
          void queryClient.invalidateQueries({ queryKey: shopKeys.overview });
          refresh();
        }}>
          <option value="ok">足够</option>
          <option value="short">不足</option>
          <option value="unbound">未绑定</option>
        </select>
      </label>
      {scenarioSelect('backend', ['ok', 'disabled', 'missing'], 'backend', '服务端', () => {
        void queryClient.invalidateQueries({ queryKey: groupPlusKeys.plans });
        resetPlusQueries();
      })}
      {scenarioSelect('purchaseError', ['none', 'insufficient_balance', 'ccw_not_bound', 'verification_unavailable', 'plan_changed', 'price_changed', 'server'], 'purchase-error', '购买错误')}
      {scenarioSelect('uploadError', ['none', 'quota_exceeded', 'file_too_large', 'muted', 'rate_limited', 'server'], 'upload-error', '上传错误')}
      <button type="button" style={button} data-harness="full" onClick={() => {
        plusScenario.featuredFull = !plusScenario.featuredFull;
        refresh();
      }}>设精华已满：{plusScenario.featuredFull ? '是' : '否'}</button>
      <span style={{ flexBasis: '100%', height: 0 }} />
      <button type="button" style={button} data-harness="open-upgrade" onClick={() => openUpgrade({ conversationId: activeId, reason: 'manual' })}>升级面板</button>
      <button type="button" style={button} data-harness="open-upgrade-members" onClick={() => openUpgrade({ conversationId: activeId, reason: 'members' })}>升级面板（人数满了）</button>
      <button type="button" style={button} data-harness="open-files" onClick={() => openFiles(activeId)}>群文件</button>
      <button type="button" style={button} data-harness="open-search" onClick={() => openChatSearch({ conversationId: activeId, title: GROUP_OPTIONS.find((option) => option.id === activeId)?.label })}>聊天记录搜索</button>
      <button type="button" style={button} data-harness="open-search-all" onClick={() => openChatSearch({ conversationId: null, keyword: '开会' })}>全局聊天记录搜索</button>
      <button type="button" style={button} data-harness="open-featured" onClick={() => document.querySelector<HTMLButtonElement>('button[aria-label="查看群精华消息"]')?.click()}>群精华</button>
      <button type="button" style={button} data-harness="todo-set" onClick={() => {
        setGroupTodoState(activeId, activeId * 1000 + 20);
        dispatch('group.todo.updated', { conversation_id: activeId, todo: todoOf(activeId) });
        refresh();
      }}>模拟：设置待办</button>
      <button type="button" style={button} data-harness="todo-clear" onClick={() => {
        setGroupTodoState(activeId, null);
        dispatch('group.todo.updated', { conversation_id: activeId, todo: null });
        refresh();
      }}>模拟：取消待办{todo ? '' : '（当前没有）'}</button>
      <button type="button" style={button} data-harness="todo-recalled" onClick={() => {
        // 原消息被撤回：待办保留但内容隐藏
        const target = plusState.history.get(activeId)?.find((message) => message.id === activeId * 1000 + 6);
        if (target) {
          target.recalled_at = new Date().toISOString();
        }
        dispatch('group.todo.updated', { conversation_id: activeId, todo: todoOf(activeId) });
        void queryClient.invalidateQueries({ queryKey: ['messages', activeId] });
      }}>模拟：待办原消息被撤回</button>
      <button type="button" style={button} data-harness="file-event" onClick={() => {
        addRemoteFile(activeId);
        dispatch('group.file.updated', { conversation_id: activeId, action: 'uploaded', file_id: null });
      }}>模拟：有人传了文件</button>
      <button type="button" style={button} data-harness="plus-event" onClick={() => {
        changeTier(activeId, 'max', 'grant');
        refresh();
      }}>模拟：后台赠送 MAX</button>
      <button type="button" style={button} data-harness="revoke-event" onClick={() => {
        changeTier(activeId, 'free', 'revoke');
        refresh();
      }}>模拟：后台取消档位</button>
      <button type="button" style={button} data-harness="apply-cache" onClick={() => {
        // 只改缓存、不走事件：看会话列表角标和聊天头部标签是不是都跟着变
        applyPlusToCaches(queryClient, activeId, 'pro_plus', new Date(Date.now() + 30 * 86_400_000).toISOString());
      }}>只改缓存为 Pro+</button>
      {uploads.length > 0 ? <span style={label}>上传任务 {uploads.length}</span> : null}
    </div>
  );
}

/* ───────── 画面 ───────── */

function DesktopApp({ activeId }: { activeId: number }): JSX.Element {
  const theme = useKukeStore((state) => (state.themeMode === 'dark' ? 'dark' : 'light'));
  const fontScale = useKukeStore((state) => state.uiFontScale);
  const themeRoot = useThemeRootProps(theme);
  const conversations = useQuery({ queryKey: ['conversations'], queryFn: getConversations, enabled: false }).data ?? plusConversations();
  return (
    <main
      data-theme={theme}
      data-layout="desktop"
      data-font-scale={fontScale}
      data-kc-wallpaper={themeRoot['data-kc-wallpaper']}
      style={{ ...themeRoot.style, width: Number(params.get('w')) || '100%', height: Number(params.get('h')) || '100%', '--kc-font-multiplier': [0.88, 1, 1.08, 1.16, 1.26][fontScale] } as CSSProperties}
      className="kc-desktop-app flex min-h-0 [background:var(--kc-window)] [color:var(--kc-text)]"
    >
      <ThemeEffects scheme={theme} />
      <NavRail view="chat" unreadCount={0} hasUnseenAnnouncement={false} onNavigate={() => undefined} onCreateGroup={() => undefined} onOpenAnnouncement={() => undefined} onOpenSettings={() => undefined} />
      <div style={{ display: 'grid', width: 268, flex: 'none' }}>
        <ConversationPane conversations={conversations} isLoading={false} currentUser={plusMe} onCreateGroup={() => undefined} onOpenGlobalSearch={() => undefined} />
      </div>
      <div className="min-w-0 flex-1" data-kc-surface="page">
        <DesktopChatPanel key={activeId} conversations={conversations} currentUser={plusMe} currentRole={plusScenario.staff ? 'owner' : 'member'} members={buildMembers()} />
      </div>
      <GroupPlusHosts />
    </main>
  );
}

function MobileApp({ activeId }: { activeId: number }): JSX.Element {
  const theme = useKukeStore((state) => (state.themeMode === 'dark' ? 'dark' : 'light'));
  const fontScale = useKukeStore((state) => state.uiFontScale);
  const [note, setNote] = useState('');
  const conversations = useQuery({ queryKey: ['conversations'], queryFn: getConversations, enabled: false }).data ?? plusConversations();
  return (
    <main data-theme={theme} data-layout="mobile" data-font-scale={fontScale} data-harness="phone" className="kc-window-frame" style={{ position: 'relative', width: 390, height: 'min(100%, 800px)', overflow: 'hidden', transform: 'translateZ(0)', color: 'var(--kc-mobile-text)', animation: 'none' }}>
      <div className="kc-native-app" style={{ position: 'relative', height: '100%', width: '100%', overflow: 'hidden', background: 'var(--kc-mobile-bg)' }}>
        <MessagePanel key={activeId} conversations={conversations} currentUser={plusMe} currentRole={plusScenario.staff ? 'owner' : 'member'} members={buildMembers()} friends={[]} isMobile onBack={() => setNote('点了返回')} />
        <GroupPlusHosts />
        {note ? <p data-harness="mobile-note" style={{ position: 'absolute', zIndex: 99, right: 8, bottom: 8, left: 8, padding: '6px 10px', borderRadius: 8, background: '#111827', color: '#fff', font: '12px sans-serif' }} onClick={() => setNote('')}>{note}</p> : null}
      </div>
    </main>
  );
}

function Harness(): JSX.Element {
  const activeId = useKukeStore((state) => state.activeConversationId) ?? initialGroupId();
  return (
    <div style={{ display: 'flex', height: '100%', flexDirection: 'column' }}>
      {params.get('controls') === '0' ? null : <Controls activeId={activeId} />}
      <div style={{ position: 'relative', display: 'grid', minHeight: 0, flex: 1, placeItems: layout === 'mobile' || params.get('w') ? 'center' : 'stretch', background: '#cfd3dd' }}>
        {layout === 'mobile' ? <MobileApp activeId={activeId} /> : <DesktopApp activeId={activeId} />}
      </div>
    </div>
  );
}

/** 画几张纯色渐变图当聊天里的图片（用 canvas，不依赖外部资源） */
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
    context.fillStyle = 'rgba(255,255,255,.85)';
    context.font = '600 28px sans-serif';
    context.fillText(`${width}×${height}`, 20, 44);
  }
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob ? URL.createObjectURL(blob) : ''), 'image/png'));
}

async function start(): Promise<void> {
  const pictures = await Promise.all([picture(640, 360, 200), picture(360, 640, 320), picture(256, 256, 40), picture(480, 270, 130)]);
  initGroupPlusMock(pictures);

  const backend = params.get('backend');
  if (backend === 'disabled' || backend === 'missing') {
    plusScenario.backend = backend;
  }
  plusScenario.staff = params.get('staff') !== '0';
  const purchase = params.get('purchase') as PlusScenario['purchaseError'] | null;
  if (purchase) {
    plusScenario.purchaseError = purchase;
  }
  const upload = params.get('upload') as PlusScenario['uploadError'] | null;
  if (upload) {
    plusScenario.uploadError = upload;
  }
  plusScenario.featuredFull = params.get('full') === '1';
  if (params.get('delay') !== null) {
    plusScenario.delay = Math.max(0, Number(params.get('delay')) || 0);
  }
  // 余额：和商店的假后端是同一份（购买记在 shopScenario.spent 上）
  const balanceParam = params.get('balance');
  shopScenario.bound = balanceParam !== 'unbound';
  shopScenario.donated = shopScenario.spent + (balanceParam === 'short' ? 50 : 20000);

  installFetch();
  window.XMLHttpRequest = FakeXhr as unknown as typeof XMLHttpRequest;

  // 换存储键，免得把开发时真实的登录状态、主题、偏好冲掉
  useKukeStore.persist.setOptions({ name: 'kukechat-group-plus-harness' });
  useThemeStore.persist.setOptions({ name: 'kukechat-group-plus-harness-theme' });
  const font = Number(params.get('font') ?? 1);
  const groupId = initialGroupId();
  useKukeStore.setState({
    token: 'harness',
    currentUser: plusMe,
    activeConversationId: groupId,
    layoutMode: layout,
    layoutModeSource: 'manual',
    themeMode: params.get('theme') === 'dark' ? 'dark' : 'light',
    uiFontScale: (font >= 0 && font <= 4 ? font : 1) as UiFontScale,
    isOpen: true,
    isMinimized: false,
    isFullscreen: false,
    workspaceView: 'chat',
    themeSettings: DEFAULT_THEME_SETTINGS
  });
  useThemeStore.setState({ performance: params.get('perf') === '1' });
  useModerationStore.getState().setMute(null, null);
  queryClient.setQueryData(['conversations'], plusConversations());
  Object.assign(window, { __groupPlus: { scenario: plusScenario, state: plusState, queryClient, store: useKukeStore, dispatch, changeTier } });

  createRoot(document.getElementById('root') as HTMLElement).render(
    <QueryClientProvider client={queryClient}>
      <Harness />
    </QueryClientProvider>
  );

  // 一进来要看什么：等界面挂好再打开
  window.setTimeout(() => {
    const ui = useGroupPlusUi.getState();
    if (view === 'upgrade') {
      ui.openUpgrade({ conversationId: groupId, reason: 'manual' });
    } else if (view === 'files') {
      ui.openFiles(groupId);
    } else if (view === 'search') {
      ui.openChatSearch({ conversationId: groupId });
    } else if (view === 'searchall') {
      ui.openChatSearch({ conversationId: null, keyword: '开会' });
    } else if (view === 'featured') {
      document.querySelector<HTMLButtonElement>('button[aria-label="查看群精华消息"]')?.click();
    }
  }, 700);
}

void start();
