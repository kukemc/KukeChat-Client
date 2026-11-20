// 消息中心「全部消息 / 系统通知」顶上：共创世界里和你互关、也在用 KukeChat、但还不是好友的人，一键全部加好友。
// 只算互关（单向关注不算，免得变成群发申请）。关掉后 7 天内不再出现。
import { h } from '../core/dom.js';
import { KC_ICON } from '../core/icons.js';
import { ensureSession, kcRequest } from './client.js';
import { myFollowings } from './ccwGraph.js';

const DISMISS_KEY = 'kukechat-ccw:mutuals-dismissed';
let result = null;

function dismissed() {
  const t = Number(localStorage.getItem(DISMISS_KEY) || 0);
  return Date.now() - t < 7 * 86400000;
}

async function load() {
  if (!result) {
    result = (async () => {
      if (!(await ensureSession())) return null;
      const oids = (await myFollowings()).filter((f) => f.mutual).map((f) => f.oid);
      if (!oids.length) return null;
      return { oids, read: await kcRequest('POST', '/ccw/mutuals', { ccw_oids: oids, send: false }) };
    })().catch(() => { result = null; return null; });
  }
  return result;
}

function banner(data) {
  const users = data.read.users;
  const names = users.slice(0, 3).map((u) => u.nickname || '').filter(Boolean).join('、');
  const btn = h('button', { type: 'button', class: 'ccwk-btn is-primary is-sm' }, '全部加好友');
  const close = h('button', { type: 'button', class: 'ccwk-banner-x', title: '7 天内不再提示' }, '×');
  const el = h('div', { class: 'ccwk-banner' },
    h('span', { class: 'ccwk-faces' }, users.slice(0, 4).map((u) => h('img', { src: u.avatar_url || KC_ICON, alt: '' }))),
    h('div', { class: 'ccwk-banner-text' },
      h('b', { text: users.length + ' 位互关好友也在用 KukeChat' }),
      h('span', { text: names + (users.length > 3 ? ' 等' : '') + ' · 加为好友后可以私信、看到 TA 在玩什么' })),
    btn, close);
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = '发送中…';
    try {
      const r = await kcRequest('POST', '/ccw/mutuals', { ccw_oids: data.oids, send: true });
      btn.textContent = r.sent ? `已向 ${r.sent} 人发送申请` : '申请都已发过';
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
      result = null;
      window.setTimeout(() => el.remove(), 2400);
    } catch (err) {
      btn.disabled = false;
      btn.textContent = (err && err.message) || '发送失败';
    }
  });
  close.addEventListener('click', () => { localStorage.setItem(DISMISS_KEY, String(Date.now())); el.remove(); });
  return el;
}

/** 消息中心每次重画列表后调用：在 anchor（工具栏）后面放横幅 */
export function renderMutualsBanner(anchor, view) {
  const old = document.querySelector('.ccwk-banner');
  if (view !== 'ALL' && view !== 'SYSTEM') { if (old) old.remove(); return; }
  if (old || dismissed() || !anchor) return;
  load().then((data) => {
    if (!data || !data.read.users.length || document.querySelector('.ccwk-banner') || !anchor.isConnected) return;
    anchor.after(banner(data));
  });
}
