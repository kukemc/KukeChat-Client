// 「分享给…」：把作品、KukeChat 动态发到好友私聊或群聊里（作品页的「邀请好友一起玩」、动态卡片的「分享」共用）。
// 列表 = 最近的会话（私聊 + 群聊）+ 还没聊过的好友；可以搜索、多选（最多 9 个）、写一句附言。
// 发出去的就是普通文字消息：作品链接由服务端自动变成作品卡片；动态带 share_card，和 KukeChat 里「分享到聊天」一样显示成动态卡片。
import { h } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { currentKukeUser, kcRequest } from './client.js';

const MAX_PICK = 9;

const nameOf = (u) => (u && (u.remark || u.nickname || u.username)) || 'KukeChat 用户';

async function loadTargets() {
  const [convs, friends] = await Promise.all([
    kcRequest('GET', '/conversations').catch(() => []),
    kcRequest('GET', '/friends').catch(() => []),
  ]);
  const me = currentKukeUser();
  // 「我的设备」（发给自己）排最前面，同桌面端的转发；列表里没有就取一次（服务端没有就建，幂等）
  const list = Array.isArray(convs) ? convs.slice() : [];
  if (!list.some((c) => c && c.type === 'self')) {
    const self = await kcRequest('GET', '/conversations/self').catch(() => null);
    if (self && self.id) list.push(self);
  }
  const seenUsers = new Set();
  const rows = [];
  list.forEach((c) => {
    if (!c || !c.id) return;
    if (c.type === 'self') {
      rows.unshift({ key: 'c' + c.id, conversationId: c.id, group: false, name: '我的设备', avatar: (me && me.avatar_url) || '', sub: '发给自己', search: '我的设备 自己 self', recent: true });
      return;
    }
    if (c.type !== 'direct' && c.type !== 'group') return;
    const other = c.direct_user || (c.members || []).map((m) => m.user).find((u) => u && (!me || u.id !== me.id));
    if (c.type === 'direct' && other) seenUsers.add(other.id);
    rows.push({
      key: 'c' + c.id,
      conversationId: c.id,
      group: c.type === 'group',
      name: c.display_title || c.title || (other ? nameOf(other) : '私聊'),
      avatar: c.avatar_url || (other && other.avatar_url) || '',
      sub: c.type === 'group' ? '群聊' + (c.member_count ? ' · ' + c.member_count + ' 人' : '') : other && other.username ? '@' + other.username : '私聊',
      search: [c.display_title, c.title, other && other.nickname, other && other.username, other && other.remark].filter(Boolean).join(' ').toLowerCase(),
      recent: true,
    });
  });
  (Array.isArray(friends) ? friends : []).map((f) => f.friend || f.user || f).forEach((u) => {
    if (!u || !u.id || seenUsers.has(u.id)) return;
    seenUsers.add(u.id);
    rows.push({
      key: 'u' + u.id,
      userId: u.id,
      group: false,
      name: nameOf(u),
      avatar: u.avatar_url || '',
      sub: u.username ? '@' + u.username : '好友',
      search: [u.remark, u.nickname, u.username].filter(Boolean).join(' ').toLowerCase(),
      recent: false,
    });
  });
  return rows;
}

async function sendTo(row, message) {
  let id = row.conversationId;
  if (!id) {
    const conv = await kcRequest('POST', '/conversations/direct', { user_id: row.userId });
    id = conv && conv.id;
    if (!id) throw new Error('打不开和 TA 的私聊');
    row.conversationId = id;
  }
  await kcRequest('POST', `/conversations/${id}/messages`, { type: 'text', content: message.content, metadata: message.metadata || undefined });
}

/**
 * 打开分享弹窗。
 * - title：弹窗标题，如「邀请好友一起玩」「分享动态」
 * - preview：顶上的预览元素（要分享的东西长什么样）
 * - build(note)：根据附言生成要发的消息 { content, metadata? }
 */
export function openSharePicker({ title, preview, build, notePlaceholder }) {
  document.querySelector('.ccwk-share-mask')?.remove();
  const picked = new Map(); // key -> row
  let rows = null;
  let query = '';
  let sending = false;

  const close = () => { mask.remove(); document.removeEventListener('keydown', onKey, true); };
  const onKey = (e) => { if (e.key === 'Escape' && !sending) { e.stopPropagation(); close(); } };

  const search = h('input', { class: 'ccwk-share-search', type: 'search', placeholder: '搜索好友、群聊', autocomplete: 'off', spellcheck: 'false' });
  const list = h('div', { class: 'ccwk-share-list', role: 'listbox', 'aria-multiselectable': 'true' }, h('div', { class: 'ccwk-share-empty', text: '加载中…' }));
  const chips = h('div', { class: 'ccwk-share-chips' });
  const note = h('textarea', { class: 'ccwk-share-note', rows: '1', maxlength: '300', placeholder: notePlaceholder || '说点什么…（可以不写）' });
  const status = h('span', { class: 'ccwk-share-status' });
  const sendBtn = h('button', { type: 'button', class: 'ccwk-btn is-primary is-sm', disabled: true }, '发送');

  function rowEl(r) {
    const on = picked.has(r.key);
    const el = h('button', { type: 'button', role: 'option', 'aria-selected': String(on), class: 'ccwk-share-row' + (on ? ' is-on' : '') + (r.state ? ' is-' + r.state : ''), title: r.error || '' },
      r.avatar ? h('img', { class: r.group ? 'is-square' : '', src: r.avatar, alt: '', loading: 'lazy' }) : h('span', { class: 'ccwk-share-ph' + (r.group ? ' is-square' : ''), text: (r.name || '?').slice(0, 1) }),
      h('span', { class: 'ccwk-share-text' }, h('b', { text: r.name }), h('span', { text: r.state === 'done' ? '已发送' : r.state === 'fail' ? (r.error || '没发出去') : r.sub })),
      h('span', { class: 'ccwk-share-tick' }, on || r.state === 'done' ? icon('check', 14) : null));
    el.addEventListener('click', () => toggle(r));
    return el;
  }

  function toggle(r) {
    if (sending || r.state === 'done') return;
    if (picked.has(r.key)) picked.delete(r.key);
    else if (picked.size >= MAX_PICK) { status.textContent = '一次最多选 ' + MAX_PICK + ' 个'; return; }
    else picked.set(r.key, r);
    status.textContent = '';
    paint();
  }

  function paint() {
    if (!rows) return;
    const q = query.trim().toLowerCase();
    const shown = q ? rows.filter((r) => r.search.includes(q) || r.name.toLowerCase().includes(q)) : rows;
    if (!shown.length) {
      list.replaceChildren(h('div', { class: 'ccwk-share-empty', text: q ? '没找到「' + query.trim() + '」' : '还没有好友和群聊' }));
    } else if (q) {
      list.replaceChildren(...shown.slice(0, 200).map(rowEl));
    } else {
      const recent = shown.filter((r) => r.recent);
      const others = shown.filter((r) => !r.recent);
      list.replaceChildren(
        recent.length ? h('div', { class: 'ccwk-share-sec', text: '最近聊天' }) : null,
        ...recent.slice(0, 200).map(rowEl),
        others.length ? h('div', { class: 'ccwk-share-sec', text: '好友' }) : null,
        ...others.slice(0, 300).map(rowEl));
    }
    chips.replaceChildren(...Array.from(picked.values()).map((r) => {
      const x = h('button', { type: 'button', class: 'ccwk-share-chip', title: '移除' }, h('span', { text: r.name }), icon('close', 10));
      x.addEventListener('click', () => toggle(r));
      return x;
    }));
    chips.hidden = !picked.size;
    sendBtn.disabled = sending || !picked.size;
    sendBtn.textContent = picked.size ? '发送（' + picked.size + '）' : '发送';
  }

  sendBtn.addEventListener('click', async () => {
    if (sending || !picked.size) return;
    sending = true;
    sendBtn.disabled = true;
    status.textContent = '发送中…';
    const message = build(note.value.trim());
    const targets = Array.from(picked.values());
    const results = await Promise.all(targets.map((r) => sendTo(r, message).then(() => { r.state = 'done'; r.error = ''; return true; }, (err) => { r.state = 'fail'; r.error = (err && err.message) || '没发出去'; return false; })));
    sending = false;
    targets.forEach((r) => { if (r.state === 'done') picked.delete(r.key); });
    const failed = results.filter((ok) => !ok).length;
    paint();
    if (!failed) {
      status.textContent = '已发送';
      sendBtn.textContent = '已发送';
      sendBtn.disabled = true;
      setTimeout(close, 900);
    } else {
      status.textContent = failed + ' 个没发出去，可以再试一次';
    }
  });

  search.addEventListener('input', () => { query = search.value; paint(); });
  note.addEventListener('input', () => { note.style.height = 'auto'; note.style.height = Math.min(note.scrollHeight, 96) + 'px'; });
  note.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); sendBtn.click(); } });

  const panel = h('section', { class: 'ccwk-share', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('header', { class: 'ccwk-share-head' },
      h('h2', { text: title }),
      h('button', { type: 'button', class: 'ccwk-share-x', title: '关闭', 'aria-label': '关闭', onclick: () => { if (!sending) close(); } }, icon('close', 14))),
    preview ? h('div', { class: 'ccwk-share-preview' }, preview) : null,
    h('label', { class: 'ccwk-share-find' }, icon('search', 14), search),
    list,
    h('footer', { class: 'ccwk-share-foot' }, chips, note, h('div', { class: 'ccwk-share-bar' }, status, sendBtn)));
  const mask = h('div', { class: 'ccwk-share-mask' }, panel);
  mask.addEventListener('mousedown', (e) => { if (e.target === mask && !sending) close(); });
  document.addEventListener('keydown', onKey, true);
  document.body.appendChild(mask);
  chips.hidden = true;
  search.focus();

  loadTargets().then((r) => { rows = r; paint(); }, () => {
    list.replaceChildren(h('div', { class: 'ccwk-share-empty', text: '加载失败，关掉再打开试试' }));
  });
}
