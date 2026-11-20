// KukeChat 接口：用 chat-api.kuke.ink 的会话 cookie 换令牌，请求带客户端证明头（和客户端 src/api/client.ts 同一套算法）。
// 后端约定见 KukeChat-Server/docs/ccw-social.md。没登录 KukeChat 时所有调用都返回 null，不打扰页面。

/* global __USERSCRIPT_VERSION__ */
const DEFAULT_BASE = 'https://chat-api.kuke.ink';
// 调试：localStorage['kukechat-ccw:api'] = 'http://127.0.0.1:8000' 可以对着本地后端联调
const BASE = (() => {
  try { return (localStorage.getItem('kukechat-ccw:api') || DEFAULT_BASE).replace(/\/$/, ''); } catch (_) { return DEFAULT_BASE; }
})();
const CLIENT = 'kukechat-ccw/' + (typeof __USERSCRIPT_VERSION__ === 'string' ? __USERSCRIPT_VERSION__ : 'dev');

let token = null;
let me = null;
let sessionTried = 0;
let sessionPromise = null;
const RETRY_MS = 5 * 60 * 1000;

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}
function nonce() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function rawRequest(method, path, body, opts) {
  const o = opts || {};
  const headers = { 'X-Kuke-Client': CLIENT, 'X-Kuke-Platform': 'web' };
  const ts = String(Date.now());
  const n = nonce();
  headers['X-Kuke-Timestamp'] = ts;
  headers['X-Kuke-Nonce'] = n;
  headers['X-Kuke-Proof'] = await sha256Hex(`${method}|${path.split('?')[0]}|${ts}|${n}|KukeChat`);
  if (o.token) headers.Authorization = 'Bearer ' + o.token;
  const form = typeof FormData !== 'undefined' && body instanceof FormData;
  // FormData 让浏览器自己带 multipart 的 Content-Type（含 boundary）
  if (body !== undefined && !form) headers['Content-Type'] = 'application/json';
  const res = await fetch(BASE + '/api/v1' + path, {
    method,
    headers,
    body: body === undefined ? undefined : form ? body : JSON.stringify(body),
    credentials: o.cookie ? 'include' : 'omit',
    keepalive: Boolean(o.keepalive),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
  if (!res.ok) {
    const err = new Error((data && data.detail && (typeof data.detail === 'string' ? data.detail : data.detail.message)) || ('KukeChat ' + res.status));
    err.status = res.status;
    throw err;
  }
  return data;
}

/** 用 cookie 换令牌。没登录（401）就记下时间，5 分钟内不再试。 */
export function ensureSession() {
  if (token) return Promise.resolve(me);
  if (sessionPromise) return sessionPromise;
  // 仅供开发联调：localStorage['kukechat-ccw:token'] 直接给一个令牌，不走 cookie（README 里有说明）
  let devToken = null;
  try { devToken = localStorage.getItem('kukechat-ccw:token'); } catch (_) { /* 读不到就算了 */ }
  if (devToken) {
    sessionPromise = rawRequest('GET', '/auth/me', undefined, { token: devToken })
      .then((user) => { token = devToken; me = user; return me; })
      .catch(() => null)
      .finally(() => { sessionPromise = null; });
    return sessionPromise;
  }
  if (sessionTried && Date.now() - sessionTried < RETRY_MS) return Promise.resolve(null);
  sessionTried = Date.now();
  sessionPromise = rawRequest('GET', '/auth/session', undefined, { cookie: true })
    .then((r) => {
      token = r && r.access_token;
      me = (r && r.user) || null;
      return token ? me : null;
    })
    .catch(() => null)
    .finally(() => { sessionPromise = null; });
  return sessionPromise;
}

/** 实时连接要用（WebSocket 只认令牌）。没登录时为 null。 */
export function currentToken() {
  return token;
}

export const KUKECHAT_BASE = BASE;

/** KukeChat 接口的时间是不带时区的 UTC（同客户端 src/utils/dateTime.ts parseApiDate）：补上 Z 再交给 Date */
export function kcIso(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value) ? value + 'Z' : value;
}

export function currentKukeUser() {
  return me;
}

/** 登录了才发；令牌过期（401）时重新换一次再试。 */
export async function kcRequest(method, path, body, opts) {
  if (!(await ensureSession())) return null;
  try {
    return await rawRequest(method, path, body, { ...(opts || {}), token });
  } catch (err) {
    if (err.status !== 401) throw err;
    token = null;
    sessionTried = 0;
    if (!(await ensureSession())) return null;
    return rawRequest(method, path, body, { ...(opts || {}), token });
  }
}

/** 离开页面时用：不等登录、不重试，keepalive 让请求在页面关掉后也能发出去。 */
export function kcRequestOnUnload(method, path) {
  if (!token) return;
  rawRequest(method, path, undefined, { token, keepalive: true }).catch(() => {});
}

/** 不要求登录的公开接口（如作品页「聊天」）；登录了就带上令牌，服务端可以顺便返回和我有关的信息。 */
export async function kcPublic(method, path) {
  await ensureSession().catch(() => null);
  return rawRequest(method, path, undefined, { token: token || undefined });
}

/* ---------- 登录 ----------
 * 没登录 KukeChat 时，各处给一个「登录」按钮：小窗打开 chat-api.kuke.ink/login，登录成功后那边会种下会话 cookie。
 * 小窗关掉、或者回到这个页面时重新换一次令牌；换到了就通知各模块（动态、实时连接、未读数）接上，不用刷新页面。 */
const loginListeners = new Set();

export function onLogin(fn) {
  loginListeners.add(fn);
  return () => loginListeners.delete(fn);
}

/** 不管 5 分钟的节流，马上再试一次；新登录上了就通知 */
export async function retrySession() {
  if (token) return me;
  sessionTried = 0;
  const user = await ensureSession();
  if (user) loginListeners.forEach((fn) => { try { fn(user); } catch (_) { /* 一个出错不影响别的 */ } });
  return user;
}

let loginWatch = 0;
export function openKukeChatLogin() {
  const url = BASE + '/login?origin=' + encodeURIComponent(location.origin);
  const w = 460;
  const hgt = 680;
  const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - w) / 2));
  const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - hgt) / 2));
  const popup = window.open(url, 'kukechat-login', `popup=yes,width=${w},height=${hgt},left=${left},top=${top}`);
  if (!popup) { window.open(url, '_blank', 'noopener'); }
  window.clearInterval(loginWatch);
  // 小窗关掉就再试一次；没开成小窗（被拦）就靠下面的 focus 兜底
  loginWatch = window.setInterval(() => {
    if (popup && popup.closed) { window.clearInterval(loginWatch); retrySession(); }
  }, 800);
  window.setTimeout(() => window.clearInterval(loginWatch), 10 * 60 * 1000);
}

// 在别的标签页登录完切回来，也接上
window.addEventListener('focus', () => { if (!token) retrySession(); });
