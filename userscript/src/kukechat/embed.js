// 完整的 KukeChat 界面：只在消息中心打开「私信 / 好友」时才加载（chat-api.kuke.ink/embed/kukechat.js，约 5MB，浏览器会缓存）。
// 用界面包桥接对象上的 embed 接口（KukeChat-Client src/extension/embed.ts）把窗口停靠进页面，
// 再往它的 Shadow DOM 里注入样式：去掉标题栏、图标栏、缩放角，换成共创世界的配色。
//
// 只在消息中心加载：作品页里可能已经有作品自带的 KukeChat 扩展，两份界面包会抢同一个窗口。
import { KUKECHAT_BASE } from './client.js';

let loading = null;

export function loadKukeChat() {
  const existing = window.__KukeChatExtensionBridge;
  if (existing && existing.embed) return Promise.resolve(existing);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = KUKECHAT_BASE + '/embed/kukechat.js';
    s.async = true;
    s.onload = () => {
      const bridge = window.__KukeChatExtensionBridge;
      if (bridge && bridge.embed) resolve(bridge);
      else reject(new Error('KukeChat 界面包版本太旧，没有嵌入接口'));
    };
    s.onerror = () => reject(new Error('KukeChat 加载失败'));
    document.head.appendChild(s);
  }).catch((err) => { loading = null; throw err; });
  return loading;
}

const DOCK_CSS = `
:host([data-kc-docked]) .kwf-titlebar,
:host([data-kc-docked]) .kwf-resize,
:host([data-kc-docked]) .ksh-rail { display: none !important; }
:host([data-kc-docked]) .kc-window-frame {
  border-radius: 14px !important;
  overflow: hidden;
  border: 1px solid rgba(255,255,255,.065) !important;
  box-shadow: 0 24px 60px -24px rgba(0,0,0,.55) !important;
}
:host([data-kc-docked]) .kc-window-frame > div.relative { height: 100% !important; }
:host([data-kc-docked]) .kc-pc-dashboard { grid-template-columns: var(--ksh-pane-width, 280px) minmax(0, 1fr) !important; }
/* 共创世界的配色：深底偏蓝紫、绿色强调（和消息中心、动态页一致） */
:host([data-kc-docked]) #kukechat-root#kukechat-root [data-theme='dark'] {
  --kc-accent: #3ddc84;
  --kc-accent-fill: #23a35e;
  --kc-window: #1b1b28;
  --kc-list: #1e1e2c;
  --kc-chat: #17171f;
  --kc-panel: #23232f;
  --kc-panel-muted: #272736;
  --kc-border: rgba(255,255,255,.065);
  --kc-text: #ececf2;
  --kc-muted: #8a8a9a;
}
`;

function shadowRoot() {
  const host = document.getElementById('kukechat-shadow-host');
  return host && host.shadowRoot;
}

function injectDockStyle() {
  const root = shadowRoot();
  if (!root || root.getElementById('kc-ccw-dock-style')) return;
  const st = document.createElement('style');
  st.id = 'kc-ccw-dock-style';
  st.textContent = DOCK_CSS;
  root.appendChild(st);
}

/** 停靠到元素所在的位置；元素尺寸变了跟着变。返回取消函数。 */
export async function dockInto(el) {
  const bridge = await loadKukeChat();
  let frame = 0;
  const place = () => {
    frame = 0;
    if (!el.isConnected) return;
    const r = el.getBoundingClientRect();
    if (r.width < 200 || r.height < 200) return;
    bridge.embed.dock({ x: r.left, y: r.top, width: r.width, height: r.height });
    injectDockStyle();
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(place); };
  place();
  // 界面包第一次挂载 Shadow DOM 是异步的，样式晚一点再补一次
  window.setTimeout(injectDockStyle, 300);
  window.setTimeout(injectDockStyle, 1500);
  const ro = new ResizeObserver(schedule);
  ro.observe(el);
  window.addEventListener('resize', schedule);
  window.addEventListener('scroll', schedule, true);
  // 占位块只被挤动（尺寸不变）时 ResizeObserver 不触发：停靠期间每半秒对一次位置，没变就什么都不做
  let last = '';
  const poll = window.setInterval(() => {
    if (!el.isConnected) return;
    const r = el.getBoundingClientRect();
    const key = [r.left, r.top, r.width, r.height].map(Math.round).join(',');
    if (key !== last) { last = key; schedule(); }
  }, 500);
  return () => {
    window.clearInterval(poll);
    ro.disconnect();
    window.removeEventListener('resize', schedule);
    window.removeEventListener('scroll', schedule, true);
    cancelAnimationFrame(frame);
    bridge.embed.undock();
  };
}

export async function withEmbed(fn) {
  const bridge = await loadKukeChat();
  return fn(bridge.embed);
}
