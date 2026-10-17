/**
 * 「添加表情回应」面板的本地预览页：只挂面板本身。
 *
 *   http://127.0.0.1:5195/dev/reaction-harness.html?theme=dark
 *   加 &closed=1 时一开始不打开面板，用来量第一次打开的耗时；再加 &prewarm=1 模拟聊天面板挂上后的字体预热。
 *
 * 假消息上带两条自己已经点过的回应（👍 ❤️），用来看「已回应」的样子。只用于开发，不进构建产物。
 */
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@/styles/tailwind.css';
import { prewarmReactionPicker, ReactionPickerPanel } from '@/components/chat/desktop/reactions/ReactionPickerPanel';
import type { Message } from '@/types/api';

const params = new URLSearchParams(window.location.search);
const message = {
  id: 1,
  conversation_id: 1,
  sender_id: 2,
  type: 'text',
  content: '周末去爬山吗',
  created_at: new Date().toISOString(),
  reactions: [
    { emoji: '👍', count: 3, reacted_by_me: true },
    { emoji: '❤️', count: 1, reacted_by_me: true },
    { emoji: '😂', count: 2, reacted_by_me: false }
  ]
} as unknown as Message;

function Harness(): JSX.Element {
  const [theme, setTheme] = useState<'light' | 'dark'>(params.get('theme') === 'dark' ? 'dark' : 'light');
  const [open, setOpen] = useState(params.get('closed') !== '1');
  const [log, setLog] = useState<string[]>([]);
  const overlayRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (params.get('prewarm') === '1') {
      prewarmReactionPicker(overlayRef.current);
    }
  }, []);
  const control = { padding: '6px 10px', border: '1px solid var(--kc-border-strong)', borderRadius: 7, textAlign: 'left' } as const;

  return (
    <main data-theme={theme} data-layout="desktop" data-font-scale={1} style={{ display: 'flex', height: '100%', background: 'var(--kc-window)', color: 'var(--kc-text)' }}>
      <aside style={{ display: 'flex', width: 200, flex: 'none', flexDirection: 'column', gap: 8, padding: 12, borderRight: '1px solid var(--kc-border)', background: 'var(--kc-list)', fontSize: 13 }}>
        <strong>表情回应面板预览</strong>
        <button type="button" data-harness="open" style={control} onClick={() => setOpen((value) => !value)}>{open ? '收起面板' : '打开面板'}</button>
        <button type="button" data-harness="theme" style={control} onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>切换深浅色（{theme}）</button>
        <div data-harness="log" style={{ marginTop: 8, color: 'var(--kc-muted)', fontSize: 12, lineHeight: 1.6 }}>
          {log.length === 0 ? '点过的表情会记在这里' : log.map((line, index) => <div key={index}>{line}</div>)}
        </div>
      </aside>
      <section className="kcd" style={{ flex: 1, minWidth: 0, background: 'var(--kc-chat-surface)' }}>
        <div ref={overlayRef} style={{ position: 'relative', height: '100%' }}>
          {open ? (
            <ReactionPickerPanel
              picker={{ message, left: 60, top: 60 }}
              overlayRoot={overlayRef.current}
              onPick={(_, emoji) => {
                setLog((current) => [`回应 ${emoji}`, ...current].slice(0, 10));
                setOpen(false);
              }}
              onClose={() => setOpen(false)}
            />
          ) : null}
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(<Harness />);
