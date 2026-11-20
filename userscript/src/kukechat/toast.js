// 全站新消息提醒：任何 CCW 页面收到私信时右下角弹一张卡片，能直接回复，点「打开」进消息中心对应的会话。
// 正在看的会话、免打扰的会话、自己发的不提醒。最多叠 3 张；鼠标没停在上面时 8 秒后收起。
import { h } from '../core/dom.js';
import { currentKukeUser, kcRequest } from './client.js';
import { onRealtime } from './realtime.js';

const MAX = 3;
let stack = null;
let viewing = null;
let mutedIds = new Set();

/** '*' 表示正在消息中心里看私信，什么都不提醒 */
export function setViewingConversation(id) { viewing = id; }
export function setMutedConversations(ids) { mutedIds = new Set(ids); }

function preview(m) {
  const t = String(m.type || '').toLowerCase();
  if (t === 'image') return '[图片]';
  if (t === 'voice') return '[语音]';
  if (t === 'file') return '[文件]';
  if (t === 'red_packet' || t === 'redpacket') return '[红包]';
  if (t === 'poll') return '[投票]';
  const text = String(m.content || '').replace(/\s+/g, ' ').trim();
  return text.length > 80 ? text.slice(0, 80) + '…' : text || '[消息]';
}

function ensureStack() {
  if (!stack || !stack.isConnected) {
    stack = h('div', { class: 'ccwk-toasts' });
    document.body.appendChild(stack);
  }
  return stack;
}

function show(m) {
  const sender = m.sender || {};
  const name = m.sender_display_name || sender.nickname || sender.username || '新消息';
  const input = h('input', { class: 'ccwk-toast-input', placeholder: '回复…', maxlength: '500' });
  let timer = 0;
  const close = () => { window.clearTimeout(timer); card.classList.add('is-out'); window.setTimeout(() => card.remove(), 200); };
  const arm = () => { window.clearTimeout(timer); timer = window.setTimeout(close, 8000); };
  const send = async () => {
    const content = input.value.trim();
    if (!content) return;
    input.disabled = true;
    try {
      await kcRequest('POST', `/conversations/${m.conversation_id}/messages`, { content, type: 'text' });
      card.classList.add('is-sent');
      input.value = '已发送';
      window.setTimeout(close, 900);
    } catch (err) {
      input.disabled = false;
      input.placeholder = (err && err.message) || '发送失败';
    }
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); send(); }
    if (e.key === 'Escape') close();
  });
  const card = h('div', { class: 'ccwk-toast' },
    h('div', { class: 'ccwk-toast-head' },
      h('img', { class: 'ccwk-toast-av', src: sender.avatar_url || 'https://m.ccw.site/community/images/avatar-default.png', alt: '' }),
      h('div', { class: 'ccwk-toast-text' },
        h('b', { text: name }),
        h('span', { text: preview(m) })),
      h('button', { type: 'button', class: 'ccwk-toast-x', title: '关闭', onclick: close }, '×')),
    h('div', { class: 'ccwk-toast-reply' },
      input,
      h('a', { class: 'ccwk-toast-open', href: '/notice/chat?c=' + m.conversation_id }, '打开')));
  card.addEventListener('mouseenter', () => window.clearTimeout(timer));
  card.addEventListener('mouseleave', () => { if (document.activeElement !== input) arm(); });
  input.addEventListener('focus', () => window.clearTimeout(timer));
  input.addEventListener('blur', arm);
  const s = ensureStack();
  s.appendChild(card);
  while (s.children.length > MAX) s.firstChild.remove();
  arm();
}

export function installToast() {
  onRealtime((e) => {
    if (e.type !== 'message.created' || !e.data) return;
    const m = e.data;
    const me = currentKukeUser();
    if (!me || m.sender_id === me.id) return;
    if (viewing === '*' || m.conversation_id === viewing || mutedIds.has(m.conversation_id)) return;
    if (String(m.type || '').toLowerCase() === 'system') return;
    show(m);
  });
}
