/**
 * 任务界面的本地预览页：不连后端，用假数据（tasks-mock.ts）驱动真实组件。
 *
 *   http://127.0.0.1:5180/dev/tasks-harness.html
 *
 * 地址栏参数可以直接指定初始状态，方便截图：
 *   ?view=chat        聊天面板（任务卡片、群任务侧栏、聊天里的任务详情）；默认是任务中心
 *   ?theme=dark       深色
 *   ?preset=sakura    主题预设；再加 &wall=1 是整窗背景
 *   ?data=empty|slow  没有任务 / 一直加载中
 *   ?create=0         没有开启任务功能的群（不能新建）
 *   ?task=12          打开某条任务的详情
 *   ?scope=activity   任务中心初始范围
 *
 * 只用于开发时看界面，不会进入任何构建产物。
 */
import { useState, type CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@/styles/tailwind.css';
import { featureMocks } from './mocks';
import { chatMessages, conversations, me, members, scenario, tasksMock } from './tasks-mock';
import { DesktopChatPanel } from '@/components/chat/desktop/DesktopChatPanel';
import { NavRail } from '@/components/shell/NavRail';
import { TaskCenterPanel } from '@/components/tasks/TaskCenterPanel';
import { emitRealtimeEvent } from '@/realtime/events';
import { useKukeStore, type TaskCenterScope } from '@/store/kukeStore';
import { ThemeEffects } from '@/theme/ThemeEffects';
import { DEFAULT_THEME_SETTINGS, THEME_PRESETS, themeVariables, wallpaperMode, type ThemeSettings } from '@/theme/themes';
import type { Message } from '@/types/api';

const params = new URLSearchParams(window.location.search);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function installFetch(): void {
  const messages = chatMessages();
  let nextMessageId = 9500;
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
    await new Promise((resolve) => window.setTimeout(resolve, 160));
    const mocked = await tasksMock({ path, url, method, body });
    if (mocked) {
      return mocked;
    }
    for (const mock of featureMocks) {
      const result = await mock({ path, url, method, body });
      if (result) {
        return result;
      }
    }
    if (/^\/conversations\/\d+\/messages$/.test(path)) {
      if (method === 'GET') {
        return json(path.startsWith('/conversations/1/') && !url.searchParams.get('before_id') ? messages : []);
      }
      nextMessageId += 1;
      const sent = { id: nextMessageId, conversation_id: 1, sender_id: me.id, sender: me, type: 'text', content: String((body as { content?: string } | undefined)?.content ?? ''), created_at: new Date().toISOString() } as Message;
      messages.push(sent);
      return json(sent);
    }
    if (/\/members\/\d+$/.test(path)) {
      return json(members.find((member) => path.endsWith(`/${member.user_id}`)) ?? members[0]);
    }
    if (path === '/moderation/me') {
      return json({ points: 0, point_window_days: 90, muted_until: null, mute_reason: null, next_threshold: 12, next_penalty: 'ban:168', ban: null, violations: [] });
    }
    if (/\/checkin\/(status|me)$|\/checkin-status$/.test(path)) {
      return json({ conversation_id: 1, checked_in_today: false, total_checkins: 3, current_streak: 1, best_streak: 2, level: 3, level_exp: 120, next_level_exp: 64 });
    }
    return json([]);
  };
}

function Harness(): JSX.Element {
  const [theme, setTheme] = useState<'light' | 'dark'>(params.get('theme') === 'dark' ? 'dark' : 'light');
  // 主题设置只放在这一页的状态里，不写进 store：store 会存进 localStorage，别的预览页是同一个源
  const [settings, setSettings] = useState<ThemeSettings>(() => {
    const preset = THEME_PRESETS.find((item) => item.id === params.get('preset'));
    return { ...DEFAULT_THEME_SETTINGS, presetId: preset?.id ?? 'classic', wallpaper: params.get('wall') === '1' ? preset?.wallpaper ?? 'aurora' : 'none', wallpaperScope: 'window' };
  });
  const [, rerender] = useState(0);
  const workspaceView = useKukeStore((state) => state.workspaceView);
  // dev/ 不在 Tailwind 的扫描范围里，预览页自己的样式一律写内联
  const controlStyle: CSSProperties = { padding: '7px 10px', border: '1px solid var(--kc-border-strong)', borderRadius: 7, background: 'var(--kc-panel)', textAlign: 'left' };
  const applyScenario = (patch: Partial<typeof scenario>): void => {
    Object.assign(scenario, patch);
    rerender((value) => value + 1);
    void queryClient.resetQueries();
  };
  const nextPreset = (): void => setSettings((current) => {
    const preset = THEME_PRESETS[(THEME_PRESETS.findIndex((item) => item.id === current.presetId) + 1) % THEME_PRESETS.length];
    return { ...current, presetId: preset.id, wallpaper: current.wallpaper === 'none' ? 'none' : preset.wallpaper ?? 'aurora' };
  });

  return (
    <main
      data-theme={theme}
      data-layout="desktop"
      data-font-scale={1}
      data-kc-wallpaper={wallpaperMode(settings, theme, null)}
      style={{ ...themeVariables(settings, theme, null), display: 'flex', height: '100%', minHeight: 0, background: 'var(--kc-window)', color: 'var(--kc-text)' }}
    >
      <aside data-harness="controls" style={{ display: params.get('controls') === '0' ? 'none' : 'flex', width: 168, flex: 'none', flexDirection: 'column', gap: 8, padding: 12, fontSize: 13, borderRight: '1px solid var(--kc-border)', background: 'var(--kc-list)', overflowY: 'auto' }}>
        <strong>预览控制</strong>
        <button type="button" data-harness="view" style={controlStyle} onClick={() => useKukeStore.setState({ workspaceView: workspaceView === 'tasks' ? 'chat' : 'tasks' })}>{workspaceView === 'tasks' ? '去聊天面板' : '去任务中心'}</button>
        <button type="button" data-harness="theme" style={controlStyle} onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>切换深浅色</button>
        <button type="button" data-harness="preset" style={controlStyle} onClick={nextPreset}>主题：{THEME_PRESETS.find((item) => item.id === settings.presetId)?.name}</button>
        <button type="button" data-harness="wall" style={controlStyle} onClick={() => setSettings((current) => ({ ...current, wallpaper: current.wallpaper === 'none' ? THEME_PRESETS.find((item) => item.id === current.presetId)?.wallpaper ?? 'aurora' : 'none' }))}>整窗背景：{settings.wallpaper === 'none' ? '关' : '开'}</button>
        <button type="button" data-harness="data" style={controlStyle} onClick={() => applyScenario({ data: scenario.data === 'normal' ? 'empty' : scenario.data === 'empty' ? 'slow' : 'normal' })}>数据：{scenario.data === 'normal' ? '正常' : scenario.data === 'empty' ? '空' : '一直加载'}</button>
        <button type="button" data-harness="create" style={controlStyle} onClick={() => applyScenario({ canCreate: !scenario.canCreate })}>可新建：{scenario.canCreate ? '是' : '否'}</button>
        <button type="button" data-harness="realtime" style={controlStyle} onClick={() => emitRealtimeEvent({ type: 'unknown', rawType: 'task.changed', data: {}, receivedAt: new Date().toISOString() })}>推一条 task.changed</button>
        <button type="button" data-harness="open-missing" style={controlStyle} onClick={() => useKukeStore.getState().openTask(9999)}>打开不存在的任务</button>
      </aside>
      <ThemeEffects scheme={theme} settings={settings} />
      <NavRail view={workspaceView} unreadCount={3} hasUnseenAnnouncement={false} onNavigate={(view) => useKukeStore.setState({ workspaceView: view === 'tasks' ? 'tasks' : 'chat' })} onCreateGroup={() => undefined} onOpenAnnouncement={() => undefined} onOpenSettings={() => undefined} />
      {/* 和 ChatDashboard 里的 <main> 一样：画布色铺在这一层，任务中心自己不再铺一遍 */}
      <div data-kc-surface="page" style={{ minWidth: 0, flex: 1, overflow: 'hidden', background: 'var(--kc-chat)' }}>
        {workspaceView === 'tasks'
          ? <TaskCenterPanel currentUser={me} isMobile={false} />
          : <DesktopChatPanel conversations={conversations} currentUser={me} currentRole="owner" members={members} />}
      </div>
    </main>
  );
}

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, staleTime: Infinity } } });

function start(): void {
  const data = params.get('data');
  scenario.data = data === 'empty' || data === 'slow' ? data : 'normal';
  scenario.canCreate = params.get('create') !== '0';
  installFetch();
  useKukeStore.setState({
    token: 'harness',
    currentUser: me,
    activeConversationId: 1,
    layoutMode: 'desktop',
    themeMode: 'light',
    workspaceView: params.get('view') === 'chat' ? 'chat' : 'tasks',
    taskCenterScope: (params.get('scope') as TaskCenterScope | null) ?? 'assigned'
  });
  const taskId = Number(params.get('task') ?? 0);
  if (taskId) {
    if (params.get('view') === 'chat') {
      useKukeStore.getState().openChatTaskDetail(taskId);
    } else {
      useKukeStore.getState().openTask(taskId);
    }
  }
  createRoot(document.getElementById('root') as HTMLElement).render(
    <QueryClientProvider client={queryClient}>
      <Harness />
    </QueryClientProvider>
  );
}

start();
