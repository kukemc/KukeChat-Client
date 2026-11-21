// 完整的 KukeChat 界面：chat-api.kuke.ink/embed/kukechat.js，约 5MB。
// 缓存：先问 /embed/manifest.json 拿内容的 md5，再按 kukechat.js?v=<md5> 加载。这个地址服务端给的是永久缓存，
// md5 不变浏览器就直接用本地那份，不下载、也不回服务器校验；界面包更新了 md5 就变，自然拿新的。
// 预加载：任何共创世界页面空闲时先把界面包下载进缓存（不执行）；进了消息中心空闲时直接执行好，点「私信」就不用等。
// 用界面包桥接对象上的 embed 接口（KukeChat-Client src/extension/embed.ts）把窗口停靠进页面，
// 再往它的 Shadow DOM 里注入样式：去掉标题栏和缩放角，换成共创世界的配色。
//
// 只在消息中心加载：作品页里可能已经有作品自带的 KukeChat 扩展，两份界面包会抢同一个窗口。
import { KUKECHAT_BASE } from './client.js';

let loading = null;
let urlPromise = null;
const MD5_KEY = 'kukechat-ccw:embed-md5';

function bundleUrl() {
  if (urlPromise) return urlPromise;
  const plain = KUKECHAT_BASE + '/embed/kukechat.js';
  const withV = (md5) => (md5 ? plain + '?v=' + encodeURIComponent(md5) : plain);
  urlPromise = fetch(KUKECHAT_BASE + '/embed/manifest.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : null))
    .then((m) => {
      const md5 = m && typeof m.md5 === 'string' && /^[0-9a-f]{32}$/.test(m.md5) ? m.md5 : null;
      if (!md5) throw new Error('no md5');
      try { localStorage.setItem(MD5_KEY, md5); } catch (_) { /* 存不了就算了 */ }
      return withV(md5);
    })
    .catch(() => {
      // 问不到就用上次记下的 md5（多半还没变），再不行就用不带版本的地址
      urlPromise = null;
      let md5 = null;
      try { md5 = localStorage.getItem(MD5_KEY); } catch (_) { /* 读不到 */ }
      return withV(md5);
    });
  return urlPromise;
}

const idle = (fn, timeout) => (window.requestIdleCallback ? window.requestIdleCallback(fn, { timeout }) : window.setTimeout(fn, 1200));
const isNotice = () => /^\/notice(\/|$)/.test(location.pathname);
let prefetched = false;

/** 只下载进缓存、不执行（作品页里可能有作品自带的 KukeChat 扩展，不能在那里执行第二份） */
function prefetchKukeChat() {
  if (prefetched || loading || window.__KukeChatExtensionBridge) return;
  prefetched = true;
  bundleUrl().then((url) => {
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.as = 'script';
    link.href = url;
    document.head.appendChild(link);
  });
}

/** 消息中心空闲时把界面包执行好 */
export function warmKukeChat() {
  idle(() => { if (isNotice()) loadKukeChat().catch(() => {}); }, 3000);
}

/** 页面加载完后：在消息中心就预先执行，别的页面只预下载 */
export function installEmbedPreload() {
  const go = () => idle(() => { if (isNotice()) loadKukeChat().catch(() => {}); else prefetchKukeChat(); }, 5000);
  if (document.readyState === 'complete') go();
  else window.addEventListener('load', go, { once: true });
}

export function loadKukeChat() {
  const existing = window.__KukeChatExtensionBridge;
  if (existing && existing.embed) return Promise.resolve(existing);
  if (loading) return loading;
  loading = bundleUrl().then((url) => new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url;
    s.async = true;
    s.onload = () => {
      const bridge = window.__KukeChatExtensionBridge;
      if (bridge && bridge.embed) resolve(bridge);
      else reject(new Error('KukeChat 界面包版本太旧，没有嵌入接口'));
    };
    s.onerror = () => reject(new Error('KukeChat 加载失败'));
    document.head.appendChild(s);
  })).catch((err) => { loading = null; throw err; });
  return loading;
}

const DOCK_CSS = `
/* 只去掉标题栏和缩放角。左侧图标栏要留着：动态、联系人、设置、商城等都从那里进；
   而且桌面布局是 grid（图标栏 56px + 列表 + 主区），藏掉图标栏会让后面的列整体错位 */
:host([data-kc-docked]) .kwf-titlebar,
:host([data-kc-docked]) .kwf-resize { display: none !important; }
:host([data-kc-docked]) .kc-window-frame {
  border-radius: 14px !important;
  overflow: hidden;
  border: 1px solid rgba(255,255,255,.065) !important;
  box-shadow: 0 24px 60px -24px rgba(0,0,0,.55) !important;
}
:host([data-kc-docked]) .kc-window-frame > div.relative { height: 100% !important; }
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
