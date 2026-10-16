/**
 * 表情面板的本地预览页：只挂面板本身，用来看聊天预览页里切不出来的情况（普通成员、私聊）。
 *
 *   http://127.0.0.1:5180/dev/emoji-harness.html?role=member&chat=group&theme=dark
 *
 * 假接口和 chat-harness 共用 dev/mocks/emojis.ts，地址栏上的 ?stickers= 等开关同样有效。
 * 只用于开发，不会进入任何构建产物。
 */
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@/styles/tailwind.css';
import { featureMocks } from './mocks';
import { EmojiPanel } from '@/components/chat/desktop/emojis/EmojiPanel';
import { useKukeStore } from '@/store/kukeStore';
import type { MemberRole, User } from '@/types/api';

const params = new URLSearchParams(window.location.search);
const me = { id: 1, username: 'kuke', nickname: '酷可mc' } as User;

const realFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, window.location.origin);
  if (!url.pathname.includes('/api/v1/')) {
    return realFetch(input, init);
  }
  const path = url.pathname.replace(/^.*\/api\/v1/, '');
  await new Promise((resolve) => window.setTimeout(resolve, 180));
  let body: unknown;
  try {
    body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
  } catch {
    body = undefined;
  }
  for (const mock of featureMocks) {
    const mocked = await mock({ path, url, method: (init?.method ?? 'GET').toUpperCase(), body });
    if (mocked) {
      return mocked;
    }
  }
  return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
};

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
useKukeStore.setState({ token: 'harness', currentUser: me, layoutMode: 'desktop' });

function Harness(): JSX.Element {
  const [theme, setTheme] = useState<'light' | 'dark'>(params.get('theme') === 'dark' ? 'dark' : 'light');
  const [role, setRole] = useState<MemberRole>((params.get('role') as MemberRole | null) ?? 'owner');
  const [isGroup, setIsGroup] = useState(params.get('chat') !== 'direct');
  const [open, setOpen] = useState(true);
  const [log, setLog] = useState<string[]>([]);
  const note = (line: string): void => setLog((current) => [line, ...current].slice(0, 8));
  const control = { padding: '6px 10px', border: '1px solid var(--kc-border-strong)', borderRadius: 7, textAlign: 'left' } as const;

  return (
    <main data-theme={theme} data-layout="desktop" data-font-scale={1} style={{ display: 'flex', height: '100%', background: 'var(--kc-window)', color: 'var(--kc-text)' }}>
      <aside data-harness="controls" style={{ display: 'flex', width: 200, flex: 'none', flexDirection: 'column', gap: 8, padding: 12, borderRight: '1px solid var(--kc-border)', background: 'var(--kc-list)', fontSize: 13 }}>
        <strong>表情面板预览</strong>
        <button type="button" data-harness="open" style={control} onMouseDown={(event) => event.stopPropagation()} onClick={() => setOpen((value) => !value)}>{open ? '收起面板' : '打开面板'}</button>
        <button type="button" data-harness="theme" style={control} onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>切换深浅色（{theme}）</button>
        <button type="button" data-harness="role" style={control} onClick={() => setRole(role === 'owner' ? 'admin' : role === 'admin' ? 'member' : 'owner')}>我的身份：{role}</button>
        <button type="button" data-harness="chat" style={control} onClick={() => setIsGroup((value) => !value)}>会话类型：{isGroup ? '群聊' : '私聊'}</button>
        <div data-harness="log" style={{ marginTop: 8, color: 'var(--kc-muted)', fontSize: 12, lineHeight: 1.6, overflowWrap: 'anywhere' }}>
          {log.length === 0 ? '选中的表情会记在这里' : log.map((line, index) => <div key={index}>{line}</div>)}
        </div>
      </aside>
      <section className="kcd" style={{ flex: 1, minWidth: 0 }}>
        <div className="kcd-column" style={{ display: 'flex', flex: 1, minWidth: 0, flexDirection: 'column' }}>
          <header className="kcd-header" style={{ height: 56, flex: 'none', background: 'var(--kc-chat-surface)', borderBottom: '1px solid var(--kc-border)' }} />
          <div style={{ flex: 1 }} />
          <div className="kcd-composer-slot">
            <form className="kcd-composer" style={{ height: 120 }} onSubmit={(event) => {
              event.preventDefault();
              note('（表单被提交了：这不应该发生）');
            }}>
              <EmojiPanel
                open={open}
                conversationId={1}
                isGroup={isGroup}
                currentRole={role}
                sending={false}
                onInsert={(emoji) => note(`插入 ${emoji}`)}
                onSend={(variables) => {
                  setOpen(false);
                  note(`发送 ${JSON.stringify(variables.metadata)}`);
                }}
                onClose={() => setOpen(false)}
              />
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <QueryClientProvider client={queryClient}>
    <Harness />
  </QueryClientProvider>
);
