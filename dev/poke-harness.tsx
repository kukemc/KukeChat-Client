/**
 * 戳一戳设置项的本地预览：真实的设置页「我的资料」，接口用 dev/mocks/ 里的假数据。
 *
 *   http://127.0.0.1:5180/dev/poke-harness.html      ?theme=dark   ?options=fail（动作列表加载失败）
 *
 * 聊天里的戳一戳（发起、显示、头像抖动）在 chat-harness.html 里看。
 * 后缀带「违规」两个字会被假接口当成审核不通过。只用于开发时看界面，不会进入任何构建产物。
 */
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@/styles/tailwind.css';
import { DesktopSettingsPanel } from '@/components/settings/desktop/DesktopSettingsPanel';
import { useKukeStore } from '@/store/kukeStore';
import { getThemePreset } from '@/theme/themes';
import { useThemeRootProps } from '@/theme/useTheme';
import type { User } from '@/types/api';
import { featureMocks } from './mocks';
import { json } from './mocks/types';

const params = new URLSearchParams(window.location.search);
const me = { id: 1, username: 'kuke', nickname: '酷可mc', bio: '正在重写界面', presence_status: 'online', poke_action: '拍', poke_suffix: '的小脑袋' } as User;

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
  await new Promise((resolve) => window.setTimeout(resolve, 400));
  if (path === '/users/poke-options' && params.get('options') === 'fail') {
    return json({ detail: 'Not Found' }, 404);
  }
  for (const mock of featureMocks) {
    const mocked = await mock({ path, url, method, body });
    if (mocked) {
      return mocked;
    }
  }
  return json(path === '/auth/me' ? useKukeStore.getState().currentUser : []);
};

// 和真实应用同源：换一个存储键，免得把开发时真实的登录状态和主题设置冲掉
useKukeStore.persist.setOptions({ name: 'kukechat-poke-harness' });
const initialTheme = params.get('theme') === 'dark' ? 'dark' : 'light';
useKukeStore.setState({ token: 'harness', currentUser: me, layoutMode: 'desktop', themeMode: initialTheme });

function Harness(): JSX.Element {
  const [theme, setTheme] = useState<'light' | 'dark'>(initialTheme);
  const themeRoot = useThemeRootProps(theme);
  const currentUser = useKukeStore((state) => state.currentUser) ?? me;
  const button: React.CSSProperties = { padding: '3px 9px', border: '1px solid #9aa1b1', borderRadius: 6, background: '#fff', color: '#12141a', font: '12px sans-serif', cursor: 'pointer' };
  return (
    <div style={{ display: 'flex', height: '100%', flexDirection: 'column' }}>
      <div data-harness="controls" style={{ display: 'flex', flex: 'none', gap: 6, padding: 6, background: '#e3e6ee' }}>
        <button type="button" style={button} data-harness="theme" onClick={() => {
          const next = theme === 'light' ? 'dark' : 'light';
          setTheme(next);
          useKukeStore.setState({ themeMode: next });
        }}>切换深浅色</button>
        <button type="button" style={button} data-harness="preset" onClick={() => useKukeStore.getState().updateThemeSettings({ presetId: 'sakura', accent: null, bubbleStyle: null, wallpaper: getThemePreset('sakura').wallpaper ?? 'none', wallpaperScope: 'window', wallpaperDim: 55 })}>樱花 + 整窗背景</button>
        <button type="button" style={button} data-harness="preset-reset" onClick={() => useKukeStore.getState().resetThemeSettings()}>恢复默认主题</button>
      </div>
      <main data-theme={theme} data-layout="desktop" data-font-scale={1} data-kc-wallpaper={themeRoot['data-kc-wallpaper']} style={{ ...themeRoot.style, minHeight: 0, flex: 1, background: 'var(--kc-window)', color: 'var(--kc-text)' }}>
        <DesktopSettingsPanel user={currentUser} initialTab="account" />
      </main>
    </div>
  );
}

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, staleTime: Infinity } } });
createRoot(document.getElementById('root') as HTMLElement).render(
  <QueryClientProvider client={queryClient}>
    <Harness />
  </QueryClientProvider>
);
