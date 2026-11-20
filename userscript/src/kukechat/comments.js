// 评论区（作品页、主页留言板等所有 .c-comment-item）：有 KukeChat 的作者头像上加在线点、名字后加等级，
// 回复按钮旁加「私信」。一批最多 50 个 oid 走 /ccw/users/batch，结果缓存一分钟。
import { h } from '../core/dom.js';
import { currentKukeUser, ensureSession, kcRequest } from './client.js';
import { activityText, registerInjector } from './pages.js';

const OID = /^[0-9a-f]{24}$/i;
const known = new Map(); // oid → { at, brief | null }
const pending = new Set();
let flushTimer = 0;

/**
 * 作者 oid。头像链接没有 href（点头像弹的是悬浮卡），oid 在评论组件 props 的 data.commenter 里
 * （CCW 评论库 @ccw/comment，2026-11 线上核实）。拿不到就跳过这条。
 */
function authorOid(item) {
  const key = Object.keys(item).find((k) => k.startsWith('__reactFiber$'));
  let fiber = key && item[key];
  for (let depth = 0; fiber && depth < 4; depth++, fiber = fiber.return) {
    const data = fiber.memoizedProps && fiber.memoizedProps.data;
    const c = data && data.commenter;
    const oid = typeof c === 'string' ? c : c && typeof c === 'object' ? c.accountOid || c.studentOid || c.oid : null;
    if (typeof oid === 'string' && OID.test(oid)) return oid.toLowerCase();
  }
  return null;
}

async function flush() {
  flushTimer = 0;
  const oids = [...pending].slice(0, 50);
  oids.forEach((o) => pending.delete(o));
  if (!oids.length || !(await ensureSession())) return;
  try {
    const briefs = await kcRequest('POST', '/ccw/users/batch', { oids });
    const now = Date.now();
    oids.forEach((o) => known.set(o, { at: now, brief: null }));
    (briefs || []).forEach((b) => known.set(b.ccw_oid, { at: now, brief: b }));
    decorateAll();
  } catch (_) { /* 下次滚动再试 */ }
  if (pending.size) flushTimer = window.setTimeout(flush, 300);
}

function decorate(item, b) {
  const av = item.querySelector('.c-avatar-wrapper');
  if (av && b.online && !av.querySelector('.ccwk-cdot')) {
    if (getComputedStyle(av).position === 'static') av.style.position = 'relative';
    av.appendChild(h('i', { class: 'ccwk-cdot', title: b.activity ? activityText(b.activity) : '在 KukeChat 在线' }));
  }
  const nm = item.querySelector('.c-author-name');
  if (nm && b.account_level && !(nm.nextElementSibling && nm.nextElementSibling.classList.contains('ccwk-clv'))) {
    nm.after(h('span', { class: 'ccwk-clv', title: 'KukeChat 等级', text: 'Lv.' + b.account_level }));
  }
  const ctrl = item.querySelector('.c-reply-control > div');
  const me = currentKukeUser();
  if (ctrl && !ctrl.querySelector('.ccwk-cdm') && !(me && me.id === b.user_id)) {
    ctrl.insertBefore(h('a', { class: 'c-reply-btn ccwk-cdm', href: '/notice/chat?u=' + b.user_id, title: '在 KukeChat 里私信 TA' }, '私信'), ctrl.firstChild);
  }
}

function decorateAll() {
  document.querySelectorAll('.c-comment-item').forEach((item) => {
    // 嵌套回复也是 .c-comment-item：只处理自己这一层
    const oid = item.dataset.ccwkOid || authorOid(item);
    if (!oid) return;
    item.dataset.ccwkOid = oid;
    const k = known.get(oid);
    if (k && Date.now() - k.at < 60000) { if (k.brief) decorate(item, k.brief); return; }
    pending.add(oid);
  });
  if (pending.size && !flushTimer) flushTimer = window.setTimeout(flush, 200);
}

export function installComments() {
  registerInjector(/^\//, () => {
    if (!document.querySelector('.c-comment-item')) return;
    decorateAll();
  });
}
