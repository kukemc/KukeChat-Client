// 防止共创世界「一连不上就掉登录」。
//
// 官方前端（hub src/store/student/actions.ts initStudentInfo）初始化时取当前用户信息，请求只要失败（网络断一下、超时、
// 服务端 5xx），就把 studentInfo 当成空的，接着 Cookies.remove('cookie-user-id') —— 页面靠这个 cookie 判断「登录了谁」，
// 删掉就成了未登录，要重新登录。服务端的会话其实还在。
//
// 这里在 document-start 接管 document.cookie 的写入：
// - 刚刚（几秒内）有共创世界接口因为网络失败 / 5xx 没请求成功，这时删 cookie-user-id 就拦下来，并提示刷新一下页面；
// - 其他时候的删除（登录过期 1092401、手动退出）照常放行，同时清掉备份；
// - 平时把 cookie-user-id 备份一份；启动时 cookie 没了但有备份（删除没被拦到），先问服务器当前登录的是不是这个人，是就写回去。
import { post } from './api.js';

const NAME = 'cookie-user-id';
const BACKUP_KEY = 'kukechat-ccw:ccw-uid';
const WINDOW_MS = 8000;
const API_HOST = 'community-web.ccw.site';

let lastNetFail = 0;
let noticeShown = false;

function rootDomain() {
  const m = /\.\w+\.\w+$/.exec(location.hostname);
  return m ? m[0] : '';
}
function readCookie(raw, name) {
  const m = String(raw || '').match(new RegExp('(?:^|;\\s*)' + name.replace(/[-]/g, '\\-') + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : '';
}
function backup(v) { try { if (v) localStorage.setItem(BACKUP_KEY, v); else localStorage.removeItem(BACKUP_KEY); } catch (_) { /* 存不了就算了 */ } }
function backedUp() { try { return localStorage.getItem(BACKUP_KEY) || ''; } catch (_) { return ''; } }

/** 这次写入是不是在删 cookie-user-id */
function isRemoval(str) {
  const s = String(str || '');
  if (!s.startsWith(NAME + '=')) return false;
  const value = s.slice(NAME.length + 1).split(';')[0].trim();
  if (!value) return true;
  const exp = /;\s*expires=([^;]+)/i.exec(s);
  if (exp && Date.parse(exp[1]) <= Date.now()) return true;
  const age = /;\s*max-age=(-?\d+)/i.exec(s);
  return Boolean(age && Number(age[1]) <= 0);
}

function showRecoverNotice() {
  if (noticeShown) return;
  noticeShown = true;
  const show = () => {
    const bar = document.createElement('div');
    bar.setAttribute('role', 'status');
    bar.style.cssText = 'position:fixed;left:50%;top:72px;transform:translateX(-50%);z-index:2147483646;display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:12px;background:rgba(36,36,50,.97);border:1px solid rgba(255,255,255,.1);box-shadow:0 12px 32px rgba(0,0,0,.45);color:#ececf2;font:13px/1.4 system-ui,sans-serif';
    const text = document.createElement('span');
    text.textContent = '网络波动，共创世界差点把你登出。登录状态已保住，刷新一下就好';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = '刷新';
    btn.style.cssText = 'border:0;border-radius:8px;padding:5px 12px;background:#23a35e;color:#fff;font:inherit;cursor:pointer';
    btn.addEventListener('click', () => location.reload());
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '×';
    close.setAttribute('aria-label', '关闭');
    close.style.cssText = 'border:0;background:none;color:#8a8a9a;font-size:16px;cursor:pointer;padding:0 2px';
    close.addEventListener('click', () => bar.remove());
    bar.append(text, btn, close);
    document.body.appendChild(bar);
  };
  if (document.body) show(); else document.addEventListener('DOMContentLoaded', show, { once: true });
}

function watchXhr() {
  // 监听要在 open 里挂：axios 在 open 之后才设 onloadend / onerror，先挂的先执行。
  // 若等它的回调先跑，请求失败 → 微任务里一路走到删 cookie，我们再记失败就晚了
  const open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    if (typeof url === 'string' && url.indexOf(API_HOST) !== -1 && !this.__kcWatched) {
      this.__kcWatched = true;
      const mark = () => { lastNetFail = Date.now(); };
      this.addEventListener('readystatechange', () => { if (this.readyState === 4 && (this.status === 0 || this.status >= 500)) mark(); });
      this.addEventListener('error', mark);
      this.addEventListener('timeout', mark);
    }
    return open.apply(this, arguments);
  };
}

export function installLoginGuard() {
  const desc = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
  if (!desc || !desc.get || !desc.set) return;
  const getRaw = () => desc.get.call(document);

  // 删除没被拦到（比如脚本当时没装、或者别的途径删的）：有备份就问一下服务器现在是谁登录着
  // （token 是 HttpOnly，脚本读不到，只能靠请求验证）。确实还是这个人，才写回去并提示刷新。
  const now = readCookie(getRaw(), NAME);
  if (now) backup(now);
  else if (backedUp()) {
    const want = backedUp();
    post('/students/self/detail', {}).then((me) => {
      const oid = me && (me.studentOid || me.oid);
      if (oid && oid === want && !readCookie(getRaw(), NAME)) {
        const d = rootDomain();
        desc.set.call(document, NAME + '=' + encodeURIComponent(oid) + '; path=/' + (d ? '; domain=' + d : '') + '; expires=' + new Date(Date.now() + 180 * 86400000).toUTCString());
        showRecoverNotice();
      } else if (!oid) backup('');
    }).catch(() => { /* 还是连不上：下次再试 */ });
  }

  watchXhr();
  Object.defineProperty(document, 'cookie', {
    configurable: true,
    get() { return getRaw(); },
    set(v) {
      if (isRemoval(v)) {
        if (Date.now() - lastNetFail < WINDOW_MS && readCookie(getRaw(), NAME)) {
          showRecoverNotice();
          return; // 网络失败引起的「掉登录」：不删
        }
        backup('');
      } else if (String(v).startsWith(NAME + '=')) {
        backup(decodeURIComponent(String(v).slice(NAME.length + 1).split(';')[0]));
      }
      desc.set.call(document, v);
    },
  });
}
