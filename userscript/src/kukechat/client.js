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
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(BASE + '/api/v1' + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
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
