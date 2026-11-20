// 全站新消息提醒：任何共创世界页面收到 KukeChat 消息时，右下角一张小卡片。
//
// - 一个会话一张卡：同一个会话再来消息就更新这张（「3 条新消息」），不会一条叠一张。最多同时 3 张。
// - 卡片：头像、会话名（群名 / 对方名字）、最新一条（群里带发送者）；@ 我、回复我的标出来。
//   点卡片打开消息中心里的这个会话；「回复」点了才展开输入框；鼠标没停在上面时 8 秒后收起。
// - 设置（卡片上的齿轮、消息中心左栏）：全部消息 / 只有私聊和 @ 我 / 关闭，记在 localStorage。默认只有私聊和 @ 我。
// - 正在看的会话、免打扰的会话、自己发的、系统消息不提醒；在消息中心看私信时都不提醒。
import { h } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { currentKukeUser, kcRequest } from './client.js';
import { onRealtime } from './realtime.js';
import { conversationInfo, refreshUnread } from './unread.js';

const MAX = 3;
const HIDE_MS = 8000;
const MODE_KEY = 'kukechat-ccw:notify';
export const NOTIFY_MODES = [['important', '私聊和 @ 我'], ['all', '全部消息'], ['off', '关闭']];

let stack = null;
let viewing = null;
let mutedIds = new Set();
const toasts = new Map(); // conversation_id → { card, count, timer, ... }
const modeListeners = new Set();

/** '*' 表示正在消息中心里看私信，什么都不提醒 */
export function setViewingConversation(id) { viewing = id; }
export function setMutedConversations(ids) { mutedIds = new Set(ids); }

export function notifyMode() {
  try {
    const v = localStorage.getItem(MODE_KEY);
    return v === 'all' || v === 'off' ? v : 'important';
  } catch (_) { return 'important'; }
}
export function setNotifyMode(mode) {
  try { localStorage.setItem(MODE_KEY, mode); } catch (_) { /* 存不了就算了 */ }
  if (mode === 'off') [...toasts.keys()].forEach((id) => closeToast(id));
  modeListeners.forEach((fn) => fn(mode));
}
export function onNotifyMode(fn) { modeListeners.add(fn); return () => modeListeners.delete(fn); }

/** 三档选择（卡片上的设置面板、消息中心左栏共用） */
export function renderNotifyModeSwitch() {
  const seg = h('div', { class: 'ccwk-cp-seg ccwk-nt-seg', role: 'radiogroup', 'aria-label': '新消息提醒' });
  const paint = () => {
    const mode = notifyMode();
    seg.replaceChildren(...NOTIFY_MODES.map(([value, label]) => {
      const b = h('button', { type: 'button', role: 'radio', class: 'ccwk-cp-opt' + (mode === value ? ' is-on' : ''), 'aria-checked': String(mode === value) }, label);
      b.addEventListener('click', (e) => { e.stopPropagation(); setNotifyMode(value); });
      return b;
    }));
  };
  paint();
  onNotifyMode(paint);
  return seg;
}

/* ---------- 判断 ---------- */

function mentionsMe(m, me) {
  const meta = m.metadata || {};
  if (meta.mention_all === true || meta.mentionAll === true) return 'all';
  if (Array.isArray(meta.mentions) && meta.mentions.some((x) => x && (x.user_id === me.id || x === me.id))) return 'me';
  return null;
}
function repliesToMe(m, me) {
  const q = m.metadata && m.metadata.quote;
  return Boolean(q && q.sender_id === me.id);
}

const pendingRefresh = new Map();
/** 会话的类型和名字：先看消息自带的 conversation，再看未读模块的会话列表；都没有（新会话）就重新拉一次会话列表 */
async function conversationOf(id, m) {
  const c = m && m.conversation;
  if (c && typeof c === 'object' && c.type) return { type: c.type, title: c.display_title || c.title || '', avatar: c.avatar_url || null };
  const known = conversationInfo(id);
  if (known) return known;
  if (!pendingRefresh.has(id)) pendingRefresh.set(id, refreshUnread().finally(() => pendingRefresh.delete(id)));
  await pendingRefresh.get(id);
  return conversationInfo(id);
}

function preview(m) {
  const t = String(m.type || '').toLowerCase();
  const map = { image: '[图片]', voice: '[语音]', file: '[文件]', red_packet: '[红包]', redpacket: '[红包]', poll: '[投票]', gift: '[礼物]', forward_bundle: '[聊天记录]' };
  if (map[t]) return map[t];
  const text = String(m.content || '').replace(/\s+/g, ' ').trim();
  return text || '[消息]';
}

/* ---------- 卡片 ---------- */

function ensureStack() {
  if (!stack || !stack.isConnected) {
    stack = h('div', { class: 'ccwk-toasts' });
    document.body.appendChild(stack);
  }
  return stack;
}

function closeToast(id) {
  const t = toasts.get(id);
  if (!t) return;
  toasts.delete(id);
  window.clearTimeout(t.timer);
  t.card.classList.add('is-out');
  window.setTimeout(() => t.card.remove(), 180);
}

function arm(t, id) {
  window.clearTimeout(t.timer);
  t.timer = window.setTimeout(() => closeToast(id), HIDE_MS);
}

function buildToast(id) {
  const t = { count: 0, timer: 0, hovering: false };
  const av = h('img', { class: 'ccwk-nt-av', alt: '' });
  const title = h('b', { class: 'ccwk-nt-title' });
  const tag = h('span', { class: 'ccwk-nt-tag' });
  const count = h('span', { class: 'ccwk-nt-count' });
  const line = h('span', { class: 'ccwk-nt-line' });
  const replyBtn = h('button', { type: 'button', class: 'ccwk-nt-act' }, '回复');
  const gear = h('button', { type: 'button', class: 'ccwk-nt-icon', title: '提醒设置' }, icon('bell', 13));
  const x = h('button', { type: 'button', class: 'ccwk-nt-icon', title: '关闭' }, icon('close', 12));
  const input = h('input', { class: 'ccwk-nt-input', placeholder: '回复…（Enter 发送）', maxlength: '500' });
  const settings = h('div', { class: 'ccwk-nt-settings' }, h('span', { text: '新消息提醒' }), renderNotifyModeSwitch());
  const card = h('div', { class: 'ccwk-nt', role: 'status' },
    h('div', { class: 'ccwk-nt-main' },
      av,
      h('div', { class: 'ccwk-nt-text' },
        h('div', { class: 'ccwk-nt-head' }, title, tag, count),
        line),
      h('div', { class: 'ccwk-nt-tools' }, replyBtn, gear, x)),
    input,
    settings);
  t.card = card;
  t.paint = (m, info, flag) => {
    const sender = m.sender || {};
    const senderName = m.sender_display_name || sender.nickname || sender.username || '有人';
    const group = info && info.type && info.type !== 'direct';
    title.textContent = group ? (info.title || '群聊') : senderName;
    av.src = (group ? info.avatar : sender.avatar_url) || sender.avatar_url || 'https://m.ccw.site/community/images/avatar-default.png';
    av.classList.toggle('is-group', Boolean(group));
    line.textContent = (group ? senderName + '：' : '') + preview(m);
    tag.textContent = flag === 'me' ? '@ 了你' : flag === 'all' ? '@ 全体' : flag === 'reply' ? '回复了你' : '';
    count.textContent = t.count > 1 ? t.count + ' 条新消息' : '';
  };

  card.addEventListener('mouseenter', () => { t.hovering = true; window.clearTimeout(t.timer); });
  card.addEventListener('mouseleave', () => { t.hovering = false; if (!card.contains(document.activeElement)) arm(t, id); });
  // 点卡片空白处：打开这个会话
  card.addEventListener('click', (e) => {
    if (e.target.closest('button, input, .ccwk-nt-settings')) return;
    closeToast(id);
    location.assign('/notice/chat?c=' + id);
  });
  replyBtn.addEventListener('click', () => {
    card.classList.toggle('is-replying');
    card.classList.remove('is-settings');
    if (card.classList.contains('is-replying')) input.focus();
  });
  gear.addEventListener('click', () => { card.classList.toggle('is-settings'); card.classList.remove('is-replying'); });
  x.addEventListener('click', () => closeToast(id));
  input.addEventListener('keydown', async (e) => {
    if (e.key === 'Escape') { card.classList.remove('is-replying'); return; }
    if (e.key !== 'Enter' || e.isComposing) return;
    e.preventDefault();
    const content = input.value.trim();
    if (!content || input.disabled) return;
    input.disabled = true;
    try {
      await kcRequest('POST', `/conversations/${id}/messages`, { content, type: 'text' });
      input.value = '';
      input.placeholder = '已发送';
      window.setTimeout(() => closeToast(id), 700);
    } catch (err) {
      input.disabled = false;
      input.placeholder = (err && err.message) || '发送失败';
    }
  });
  input.addEventListener('blur', () => { if (!t.hovering) arm(t, id); });
  return t;
}

async function show(m, flag) {
  const id = m.conversation_id;
  const info = await conversationOf(id, m);
  let t = toasts.get(id);
  if (!t) {
    t = buildToast(id);
    toasts.set(id, t);
    const s = ensureStack();
    s.appendChild(t.card);
    // 超过上限：先收起最早那张
    while (toasts.size > MAX) closeToast(toasts.keys().next().value);
  } else {
    // 移到最下面（最新）
    t.card.parentNode && t.card.parentNode.appendChild(t.card);
    t.card.classList.remove('is-bump');
    void t.card.offsetWidth;
    t.card.classList.add('is-bump');
  }
  t.count += 1;
  t.paint(m, info, flag);
  if (!t.hovering && !t.card.contains(document.activeElement)) arm(t, id);
}

export function installToast() {
  onRealtime(async (e) => {
    if (e.type !== 'message.created' || !e.data) return;
    const m = e.data;
    const me = currentKukeUser();
    const mode = notifyMode();
    if (!me || mode === 'off' || m.sender_id === me.id) return;
    if (viewing === '*' || m.conversation_id === viewing || mutedIds.has(m.conversation_id)) return;
    if (String(m.type || '').toLowerCase() === 'system') return;
    const mention = mentionsMe(m, me);
    const flag = mention || (repliesToMe(m, me) ? 'reply' : null);
    if (mode === 'important' && !flag) {
      const info = await conversationOf(m.conversation_id, m);
      if (!info || info.type !== 'direct') return;
    }
    show(m, flag);
  });
}
