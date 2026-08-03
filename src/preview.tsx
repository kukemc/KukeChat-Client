import React from 'react';
import { createRoot } from 'react-dom/client';
import './extension/index';

if (typeof window !== 'undefined') {
  const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  window.__KukeChatPreviewConfig = {
    apiBaseUrl: `${protocol}//${window.location.host}`,
    wsUrl: `${wsProtocol}//${window.location.host}/ws`
  };
}

function Preview(): JSX.Element {
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: '#171717' }}>
      <section style={{ width: 'min(760px, 100%)', border: '1px solid #404040', borderRadius: 28, background: '#242424', boxShadow: '0 24px 70px rgba(0,0,0,.34)', padding: 32 }}>
        <p style={{ margin: 0, color: '#a1a1aa', fontWeight: 700, letterSpacing: '.18em', fontSize: 12 }}>KukeChat Extension Preview</p>
        <h1 style={{ margin: '12px 0 10px', color: '#f4f4f5', fontSize: 42, lineHeight: 1.08, fontWeight: 600 }}>黑白灰 Scratch/CCW 浮动聊天窗口</h1>
        <p style={{ margin: 0, color: '#a1a1aa', lineHeight: 1.8 }}>本页面用于本地预览。点击下面按钮会通过 Shadow DOM 在当前网页挂载 KukeChat 窗口，和 CCW/Scratch 点击积木后的行为一致。</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 24 }}>
          <button type="button" onClick={() => window.__KukeChatExtensionBridge?.openWindow()} style={{ border: 0, borderRadius: 16, background: '#f4f4f5', color: '#171717', padding: '12px 18px', fontWeight: 800, cursor: 'pointer' }}>打开 KukeChat</button>
          <button type="button" onClick={() => window.__KukeChatExtensionBridge?.minimizeWindow()} style={{ border: '1px solid #3f3f46', borderRadius: 16, background: 'transparent', color: '#d4d4d8', padding: '12px 18px', fontWeight: 800, cursor: 'pointer' }}>最小化</button>
          <button type="button" onClick={() => window.__KukeChatExtensionBridge?.toggleFullscreen()} style={{ border: '1px solid #3f3f46', borderRadius: 16, background: 'transparent', color: '#d4d4d8', padding: '12px 18px', fontWeight: 800, cursor: 'pointer' }}>全屏/还原</button>
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <Preview />
  </React.StrictMode>
);

window.__KukeChatExtensionBridge?.openWindow();
