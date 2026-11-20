// 作品页右侧竖标签「基础信息 / 评论」下面加一个「聊天」：实时显示作品群（游戏模式绑定这个作品的公开群）的聊天。
// 不登录 KukeChat 也能看；登录了、是群成员就能直接发言，不是成员先一键加群。
//
// CCW 的标签是 React 管的（ul.sliderBarTab-* 里的 li，选中的带 active-*；内容在旁边的 div.sliderBarPanel-*）。
// 我们不碰 React 的状态：选中「聊天」时把原生 active 类挪到自己的标签上、用 CSS 藏起面板里原有的内容；
// 点回原生标签时先把 active 还回去，再让点击照常交给 React。
//
// 实时：群成员走 WebSocket 的 message.created；不是成员（或没登录）每 4 秒轮询一次 /ccw/works/{oid}/chat?after_id=。
import { h } from '../core/dom.js';
import { KC_ICON } from '../core/icons.js';
import { currentKukeUser, kcIso, kcPublic, kcRequest } from './client.js';
import { registerInjector } from './pages.js';
import { onRealtime } from './realtime.js';

const POLL_MS = 4000;
const AVATAR = 'https://m.ccw.site/community/images/avatar-default.png';

const chat = { oid: null, info: null, loading: false, messages: [], ids: new Set(), lastId: 0, open: false, nativeActive: null, panel: null, list: null, foot: null, timer: 0 };

function activeClass(el) {
  return [...el.classList].find((c) => /^active-/.test(c)) || null;
}

/* ---------- 数据 ---------- */

async function loadInfo(oid) {
  if (chat.loading) return;
  chat.loading = true;
  try {
    const r = await kcPublic('GET', `/ccw/works/${oid}/chat?limit=40`);
    if (chat.oid !== oid) return;
    chat.info = r && r.group ? r : { group: null };
    addMessages((r && r.messages) || []);
  } catch (_) {
    chat.info = { group: null };
  } finally {
    chat.loading = false;
  }
}

function addMessages(list) {
  const fresh = list.filter((m) => !chat.ids.has(m.id));
  if (!fresh.length) return false;
  fresh.forEach((m) => { chat.ids.add(m.id); chat.messages.push(m); chat.lastId = Math.max(chat.lastId, m.id); });
  chat.messages.sort((a, b) => a.id - b.id);
  if (chat.messages.length > 300) chat.messages.splice(0, chat.messages.length - 300);
  return true;
}

async function poll() {
  if (!chat.open || document.hidden || !chat.info || !chat.info.group) return;
  try {
    const r = await kcPublic('GET', `/ccw/works/${chat.oid}/chat?after_id=${chat.lastId}&limit=50`);
    if (r && r.group) {
      const old = chat.info.group;
      // 刚在这里加了群，这一轮的结果可能是加群前算的：只认「变成成员」，不认回退
      const member = r.group.is_member || old.is_member;
      const changed = member !== old.is_member || r.group.member_count !== old.member_count;
      chat.info.group = { ...r.group, is_member: member };
      if (changed) { renderHead(); renderFoot(); }
    }
    if (addMessages((r && r.messages) || [])) renderList(true);
  } catch (_) { /* 下一轮再试 */ }
}

/** WebSocket 推来的完整消息 → 和公开接口同样的精简结构 */
function fromRealtime(m) {
  const u = m.sender || {};
  const t = String(m.type || 'text').toLowerCase();
  const summary = { voice: '[语音]', forward_bundle: '[聊天记录]', poll: '[投票]', red_packet: '[红包]', gift: '[礼物]' };
  return {
    id: m.id, sender_id: m.sender_id, nickname: m.sender_display_name || u.nickname || u.username || 'KukeChat 用户',
    avatar_url: u.avatar_url, ccw_oid: u.ccw_student_oid, account_level: m.sender_level || u.account_level || 0,
    type: t, content: summary[t] || m.content || '', created_at: m.created_at,
  };
}

/* ---------- 界面 ---------- */

function timeLabel(iso) {
  const d = new Date(kcIso(iso));
  const pad = (n) => String(n).padStart(2, '0');
  const today = new Date();
  const hm = pad(d.getHours()) + ':' + pad(d.getMinutes());
  return d.toDateString() === today.toDateString() ? hm : (d.getMonth() + 1) + '/' + d.getDate() + ' ' + hm;
}

function messageEl(m, prev) {
  if (m.type === 'system') return h('div', { class: 'ccwk-wc-sys', text: m.content });
  const me = currentKukeUser();
  const mine = me && me.id === m.sender_id;
  // 同一个人 3 分钟内连发，只在第一条显示头像和名字
  const grouped = prev && prev.type !== 'system' && prev.sender_id === m.sender_id && Date.parse(kcIso(m.created_at)) - Date.parse(kcIso(prev.created_at)) < 180000;
  const body = m.type === 'image'
    ? h('a', { class: 'ccwk-wc-img', href: m.content, target: '_blank', rel: 'noreferrer' }, h('img', { src: m.content, alt: '', loading: 'lazy' }))
    : h('div', { class: 'ccwk-wc-bubble', text: m.content });
  const avatar = h('img', { class: 'ccwk-wc-av', src: m.avatar_url || AVATAR, alt: '' });
  return h('div', { class: 'ccwk-wc-msg' + (mine ? ' is-mine' : '') + (grouped ? ' is-grouped' : '') },
    grouped ? h('span', { class: 'ccwk-wc-av is-blank' }) : m.ccw_oid ? h('a', { href: '/student/' + m.ccw_oid, target: '_blank', rel: 'noreferrer' }, avatar) : avatar,
    h('div', { class: 'ccwk-wc-main' },
      grouped ? null : h('div', { class: 'ccwk-wc-meta' },
        h('b', { text: m.nickname }),
        m.account_level ? h('span', { class: 'ccwk-clv', text: 'Lv.' + m.account_level }) : null,
        h('time', { text: timeLabel(m.created_at) })),
      body));
}

function renderList(keepBottom) {
  if (!chat.list) return;
  const el = chat.list;
  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  const nodes = chat.messages.map((m, i) => messageEl(m, chat.messages[i - 1]));
  el.replaceChildren(...(nodes.length ? nodes : [h('div', { class: 'ccwk-wc-empty', text: '还没有人说话，来打个招呼吧' })]));
  if (!keepBottom || atBottom) el.scrollTop = el.scrollHeight;
}

function renderFoot() {
  if (!chat.foot) return;
  const g = chat.info && chat.info.group;
  const me = currentKukeUser();
  if (!g) { chat.foot.replaceChildren(); return; }
  if (!me) {
    chat.foot.replaceChildren(h('div', { class: 'ccwk-wc-gate' },
      h('span', { text: '登录 KukeChat 后可以一起聊天' }),
      h('a', { class: 'ccwk-btn is-primary is-sm', href: '/notice/chat' }, '登录')));
    return;
  }
  if (!g.is_member) {
    const btn = h('button', { type: 'button', class: 'ccwk-btn is-primary is-sm' }, '加入群聊');
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = '加入中…';
      try {
        await kcRequest('POST', `/conversations/${g.conversation_id}/join`);
        // 轮询可能已经换掉了 chat.info.group，改当前那个
        const cur = chat.info.group;
        cur.is_member = true;
        cur.member_count += 1;
        renderHead();
        renderFoot();
      } catch (err) {
        btn.disabled = false;
        btn.textContent = (err && err.message) || '加入失败';
      }
    });
    chat.foot.replaceChildren(h('div', { class: 'ccwk-wc-gate' }, h('span', { text: '加入作品群后就能一起聊' }), btn));
    return;
  }
  const input = h('textarea', { class: 'ccwk-wc-input', rows: '1', maxlength: '2000', placeholder: '说点什么…（Enter 发送，Shift+Enter 换行）' });
  const send = h('button', { type: 'button', class: 'ccwk-btn is-primary is-sm', disabled: true }, '发送');
  const submit = async () => {
    const content = input.value.trim();
    if (!content || send.disabled) return;
    send.disabled = true;
    input.disabled = true;
    try {
      const m = await kcRequest('POST', `/conversations/${g.conversation_id}/messages`, { type: 'text', content });
      input.value = '';
      if (m && m.id && addMessages([fromRealtime(m)])) renderList(false);
    } catch (err) {
      input.placeholder = (err && err.message) || '发送失败';
    } finally {
      input.disabled = false;
      send.disabled = !input.value.trim();
      input.focus();
    }
  };
  input.addEventListener('input', () => {
    send.disabled = !input.value.trim();
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); }
  });
  send.addEventListener('click', submit);
  chat.foot.replaceChildren(h('div', { class: 'ccwk-wc-compose' }, input, send));
}

let headEl = null;
function renderHead() {
  const g = chat.info && chat.info.group;
  if (!headEl || !g) return;
  headEl.replaceChildren(...[
    h('img', { class: 'ccwk-wc-gav', src: g.avatar_url || KC_ICON, alt: '' }),
    h('div', { class: 'ccwk-wc-title' },
      h('b', { text: g.title }),
      h('span', { text: g.member_count + ' 名成员 · KukeChat 作品群' })),
    g.is_member ? h('a', { class: 'ccwk-wc-open', href: '/notice/chat?c=' + g.conversation_id, title: '在消息中心打开' }, '打开') : null,
  ].filter(Boolean));
}

function buildPanel(height) {
  headEl = h('header', { class: 'ccwk-wc-head' });
  chat.list = h('div', { class: 'ccwk-wc-list' });
  chat.foot = h('footer', { class: 'ccwk-wc-foot' });
  chat.panel = h('section', { class: 'ccwk-wc', style: `height:${Math.max(420, height)}px` }, headEl, chat.list, chat.foot);
  renderHead();
  renderList(false);
  renderFoot();
  return chat.panel;
}

/* ---------- 标签切换 ---------- */

function openTab(bar, panelHost, tab) {
  if (chat.open) return;
  const active = [...bar.children].find((li) => li !== tab && activeClass(li));
  const cls = active && activeClass(active);
  if (active && cls) {
    active.classList.remove(cls);
    tab.classList.add(cls);
    chat.nativeActive = { el: active, cls };
  }
  const height = panelHost.getBoundingClientRect().height || window.innerHeight - 140;
  if (!chat.panel || !panelHost.contains(chat.panel)) panelHost.appendChild(buildPanel(Math.min(height, window.innerHeight - 120)));
  panelHost.classList.add('ccwk-wc-on');
  chat.open = true;
  renderHead();
  renderFoot();
  renderList(false);
  window.clearInterval(chat.timer);
  chat.timer = window.setInterval(poll, POLL_MS);
  poll();
}

function closeTab(tab) {
  if (!chat.open) return;
  chat.open = false;
  window.clearInterval(chat.timer);
  const n = chat.nativeActive;
  if (n) {
    tab.classList.remove(n.cls);
    if (n.el.isConnected) n.el.classList.add(n.cls);
    chat.nativeActive = null;
  }
  document.querySelectorAll('.ccwk-wc-on').forEach((el) => el.classList.remove('ccwk-wc-on'));
}

function reset(oid) {
  window.clearInterval(chat.timer);
  Object.assign(chat, { oid, info: null, loading: false, messages: [], ids: new Set(), lastId: 0, open: false, nativeActive: null, panel: null, list: null, foot: null, timer: 0 });
  headEl = null;
  document.querySelectorAll('.ccwk-wc-tab, .ccwk-wc').forEach((n) => n.remove());
  document.querySelectorAll('.ccwk-wc-on').forEach((el) => el.classList.remove('ccwk-wc-on'));
}

function inject(m) {
  const oid = m[1].toLowerCase();
  if (chat.oid !== oid) reset(oid);
  if (!chat.info) { loadInfo(oid); return; }
  if (!chat.info.group) return;
  const bar = document.querySelector('ul[class*="sliderBarTab-"]');
  const panelHost = bar && bar.parentElement && bar.parentElement.querySelector('[class*="sliderBarPanel-"]');
  if (!bar || !panelHost || bar.querySelector('.ccwk-wc-tab')) return;
  // 标签栏被 React 重建过：之前的「已打开」作废
  if (chat.open) { chat.open = false; chat.nativeActive = null; window.clearInterval(chat.timer); document.querySelectorAll('.ccwk-wc-on').forEach((el) => el.classList.remove('ccwk-wc-on')); }
  const native = bar.querySelector('li');
  const tab = h('li', { class: (native ? [...native.classList].filter((c) => /^sliderBarTabTitle-/.test(c)).join(' ') + ' ' : '') + 'ccwk-wc-tab', title: 'KukeChat 作品群' }, '聊天');
  tab.addEventListener('click', () => openTab(bar, panelHost, tab));
  // 点原生标签：先把 active 还回去、收起聊天，再让 React 处理
  bar.addEventListener('click', (e) => {
    const li = e.target.closest && e.target.closest('li');
    if (li && li !== tab) closeTab(tab);
  }, true);
  bar.appendChild(tab);
}

export function installWorkChat() {
  registerInjector(/^\/detail\/([0-9a-f]{24})\/?/i, inject);
  onRealtime((e) => {
    const g = chat.info && chat.info.group;
    if (e.type !== 'message.created' || !e.data || !g || e.data.conversation_id !== g.conversation_id) return;
    if (addMessages([fromRealtime(e.data)])) renderList(true);
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
}
