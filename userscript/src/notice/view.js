import { api } from '../core/api.js';
import { h } from '../core/dom.js';
import { PIX, icon } from '../core/icons.js';
import { targetHref } from '../core/links.js';
import { looksHtml, plain, richText, safeHtml } from '../core/rich.js';
import { go, isActive } from '../core/router.js';
import { syncStickyTop } from '../core/sticky.js';
import { dayStart, fullTime, relTime } from '../core/time.js';
import { GROUPS, GROUP_LABEL, SYSTEM_TITLE, buildRows, interactionVerb, replyTail, replyVerb, sender, shareTarget, subjectTitle, thumbOf } from './model.js';
import { allDone, anyError, anyLoading, loadStream, markAllRead, nextStreamToLoad, observeRow, state, stream, viewGroups, visibleItems } from './state.js';
import { KC_ICON } from '../core/icons.js';
import { unreadTotal } from '../kukechat/unread.js';
import { renderNotifyModeSwitch } from '../kukechat/toast.js';
import { prefToggle } from '../core/prefs.js';

/* ------------------------------------------------------------------ */
/* 视图                                                                */
/* ------------------------------------------------------------------ */
export let root = null, navEl = null, toolbarEl = null, listEl = null, footEl = null, toastEl = null;
export const rowCache = new Map(); // row key -> {el, sig}
export const rowByItem = new Map(); // item id -> row el
export const sectionCache = new Map();

export let fansEl = null, sideEl = null;

/* ---------- 侧栏数据：近 7 天（单独只读拉取，不影响列表与标读） ---------- */
export const STAT_GROUPS = ['CONTENT_INTERACTION', 'REPLY', 'SYSTEM'];
export let statsGen = 0;
export async function loadStats() {
  const my = ++statsGen;
  state.stats = null;
  renderSide(); renderFans();
  const since = dayStart(new Date()) - 6 * 86400000;
  const all = [];
  const capped = {};
  try {
    await Promise.all(STAT_GROUPS.map(async (g) => {
      let cursor = null;
      for (let i = 0; i < 6; i++) {
        const p = await api.page(g, 'ALL', cursor);
        const its = p.items || [];
        all.push(...its);
        if (!p.hasMore || !p.nextCursor || !its.length || Date.parse(its[its.length - 1].createdAt) < since) return;
        cursor = p.nextCursor;
      }
      capped[g] = true;
    }));
  } catch (_) { /* 侧栏数据失败不影响主列表 */ }
  if (my !== statsGen) return;
  state.stats = { since, capped, items: all.filter((x) => Date.parse(x.createdAt) >= since) };
  renderSide(); renderFans();
}

export function computeStats() {
  const st = state.stats;
  const like = [], fav = [], cmt = [], fans = [];
  const works = new Map();
  const days = [];
  for (let i = 6; i >= 0; i--) days.push({ start: st.since + (6 - i) * 86400000, n: 0 });
  for (const x of st.items) {
    const c = x.contentCategory || '';
    const t = Date.parse(x.createdAt);
    const d = days.find((dd) => t >= dd.start && t < dd.start + 86400000);
    if (d) d.n++;
    let kind = null;
    if (x.group === 'REPLY') { cmt.push(x); kind = 'c'; }
    else if (c === 'FOLLOWED') fans.push(x);
    else if (c.endsWith('_FAVORITE')) { fav.push(x); kind = 'f'; }
    else if (c.endsWith('_LIKED')) { like.push(x); kind = 'l'; }
    if (kind && x.subjectOid && c !== 'COMMENT_LIKED' && subjectTitle(x)) {
      let w = works.get(x.subjectOid);
      if (!w) { w = { item: x, l: 0, f: 0, c: 0 }; works.set(x.subjectOid, w); }
      w[kind]++;
      if (!thumbOf(w.item) && thumbOf(x)) w.item = x;
    }
  }
  const top = Array.from(works.values()).sort((a, b) => (b.l + b.f + b.c) - (a.l + a.f + a.c)).slice(0, 5);
  const seen = new Set();
  const fanUsers = [];
  fans.forEach((x) => { const u = sender(x); if (u.oid && !seen.has(u.oid)) { seen.add(u.oid); fanUsers.push({ u, x }); } });
  return { like, fav, cmt, fans: fanUsers, days, top };
}

export function card(title, extra, ...body) {
  return h('section', { class: 'ccwn-card' }, h('header', { class: 'ccwn-card-head' }, h('h2', { text: title }), extra || null), ...body);
}

export function renderSide() {
  if (!sideEl) return;
  if (!state.stats) {
    sideEl.replaceChildren(card('近 7 天', null, h('div', { class: 'ccwn-card-sk' }, h('i'), h('i'), h('i'))));
    return;
  }
  const s = computeStats();
  const cap = (g) => (state.stats.capped[g] ? '+' : '');
  const tile = (ic, tone, n, label, g) => h('div', { class: 'ccwn-stat tone-' + tone },
    h('i', { class: 'ccwn-stat-dot' }),
    h('b', { text: n + cap(g) }), h('span', { text: label }));
  const tiles = h('div', { class: 'ccwn-stats' },
    tile('heart', 'pink', s.like.length, '获赞', 'CONTENT_INTERACTION'),
    tile('star', 'amber', s.fav.length, '收藏', 'CONTENT_INTERACTION'),
    tile('reply', 'blue', s.cmt.length, '评论', 'REPLY'),
    tile('follow', 'green', s.fans.length, '新粉丝', 'SYSTEM'));

  // 每日消息数：单一系列柱状图，悬停在标题右侧显示当天数值
  const max = Math.max(1, ...s.days.map((d) => d.n));
  const total = s.days.reduce((a, d) => a + d.n, 0);
  const readout = h('span', { class: 'ccwn-readout', text: '共 ' + total + ' 条' });
  const WEEK = '日一二三四五六';
  const bars = h('div', { class: 'ccwn-bars' }, s.days.map((d, i) => {
    const date = new Date(d.start);
    const label = i === 6 ? '今天' : '周' + WEEK[date.getDay()];
    const col = h('div', { class: 'ccwn-bar' + (i === 6 ? ' is-today' : '') },
      h('div', { class: 'ccwn-bar-track' }, h('i', { style: 'height:' + Math.max(d.n ? 4 : 0, Math.round((d.n / max) * 100)) + '%' })),
      h('span', { text: label }));
    col.addEventListener('mouseenter', () => { readout.textContent = (date.getMonth() + 1) + '月' + date.getDate() + '日 · ' + d.n + ' 条'; col.classList.add('is-hover'); });
    col.addEventListener('mouseleave', () => { readout.textContent = '共 ' + total + ' 条'; col.classList.remove('is-hover'); });
    return col;
  }));
  const chart = h('div', { class: 'ccwn-chart' }, h('div', { class: 'ccwn-chart-head' }, h('span', { text: '每日消息' }), readout), bars);

  const works = s.top.length ? h('ul', { class: 'ccwn-works' }, s.top.map((w) => {
    const href = targetHref(w.item);
    const cover = thumbOf(w.item);
    const nums = h('span', { class: 'ccwn-work-nums' },
      w.l ? h('span', { class: 'tone-pink' }, icon('heart', 12), String(w.l)) : null,
      w.f ? h('span', { class: 'tone-amber' }, icon('star', 12), String(w.f)) : null,
      w.c ? h('span', { class: 'tone-blue' }, icon('reply', 12), String(w.c)) : null);
    return h('li', null, h('a', { href: href || '#', target: '_blank', rel: 'noreferrer' },
      cover ? h('img', { src: cover, alt: '', loading: 'lazy' }) : h('span', { class: 'ccwn-work-ph' }),
      h('span', { class: 'ccwn-work-text' }, h('span', { class: 'ccwn-work-title', text: subjectTitle(w.item) }), nums)));
  })) : h('div', { class: 'ccwn-card-empty', text: '近 7 天还没有互动' });

  sideEl.replaceChildren(
    card('近 7 天', null, tiles, chart),
    card('互动最多的作品', null, works));
}

/** 左栏的设置：KukeChat 消息提醒三档、提示音、毛玻璃效果（消息中心和动态页共用） */
export function settingsCard() {
  return h('section', { class: 'ccwn-card ccwk-nt-card' },
    h('div', { class: 'ccwk-nt-card-head' }, h('span', { text: 'KukeChat 消息提醒' }), h('img', { src: KC_ICON, alt: '' })),
    renderNotifyModeSwitch(),
    h('div', { class: 'ccwn-prefs' },
      prefToggle('sound', '提示音', '弹出提醒时响一声'),
      prefToggle('blur', '毛玻璃效果', '滑动卡顿时可以关掉')));
}

/** 近 7 天的新粉丝全部列出来（不用去系统通知里翻到最后），可以直接回关 */
export function openFansDialog() {
  const s = computeStats();
  const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey, true); };
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  const list = h('ul', { class: 'ccwn-fans-list' }, s.fans.map(({ u, x }) => h('li', null,
    h('a', { class: 'ccwn-fans-user', href: '/student/' + u.oid, target: '_blank', rel: 'noreferrer' },
      avatarEl(u.avatar, '', 40),
      h('span', null, h('b', { text: u.name || '' }), h('time', { datetime: x.createdAt, title: fullTime(x.createdAt), text: relTime(x.createdAt) + ' 关注了你' }))),
    followCtl(u, x, true))));
  const panel = h('section', { class: 'ccwn-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': '新粉丝' },
    h('header', { class: 'ccwn-modal-head' },
      h('h2', { text: '近 7 天新粉丝 · ' + s.fans.length + (state.stats.capped.SYSTEM ? '+' : '') }),
      h('button', { type: 'button', class: 'ccwn-icon', title: '关闭', onclick: close }, icon('close', 16))),
    list,
    h('footer', { class: 'ccwn-modal-foot' }, h('button', { type: 'button', class: 'ccwn-link', onclick: () => { close(); go('SYSTEM', 'ALL'); } }, '在系统通知里查看')));
  const overlay = h('div', { class: 'ccwn-modal-mask' }, panel);
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', onKey, true);
  root.appendChild(overlay);
}

export function renderFans() {
  if (!fansEl) return;
  if (!state.stats) { fansEl.replaceChildren(); return; }
  const s = computeStats();
  if (!s.fans.length) { fansEl.replaceChildren(); return; }
  const more = h('button', { type: 'button', class: 'ccwn-link', onclick: () => openFansDialog() }, '全部');
  fansEl.replaceChildren(card('新粉丝 · ' + s.fans.length + (state.stats.capped.SYSTEM ? '+' : ''), more,
    h('div', { class: 'ccwn-fan-grid' }, s.fans.slice(0, 15).map(({ u }) =>
      h('a', { class: 'ccwn-fan', href: '/student/' + u.oid, target: '_blank', rel: 'noreferrer', title: u.name },
        avatarEl(u.avatar, '', 36), h('span', { text: u.name || '' }))))));
}

export function mount() {
  if (root) return;
  root = h('div', { id: 'ccwn-root', class: 'ccwn-app' });
  const layout = h('div', { class: 'ccwn-layout' });
  navEl = h('nav', { class: 'ccwn-nav' });
  const main = h('section', { class: 'ccwn-main' });
  toolbarEl = h('header', { class: 'ccwn-toolbar' });
  listEl = h('div', { class: 'ccwn-list' });
  footEl = h('div', { class: 'ccwn-foot' });
  main.append(toolbarEl, listEl, footEl);
  fansEl = h('div', { class: 'ccwn-fans' });
  sideEl = h('aside', { class: 'ccwn-side' });
  // KukeChat 新消息提醒的设置（kukechat/toast.js），放在导航下面
  layout.append(h('div', { class: 'ccwn-left' }, navEl, settingsCard(), fansEl), main, sideEl);
  toastEl = h('div', { class: 'ccwn-toast' });
  root.append(layout, toastEl);
  document.body.appendChild(root);
  new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) pump(); }, { rootMargin: '600px 0px' }).observe(footEl);
}

// 原版消息中心的像素图标（hub src/assets/icons）
export const GROUP_META = {
  ALL: { icon: 'all', tone: 'green' },
  REPLY: { icon: 'reply', tone: 'blue' },
  CONTENT_INTERACTION: { icon: 'heart', tone: 'pink' },
  SYSTEM: { icon: 'bell', tone: 'amber' },
  COMMUNITY: { icon: 'megaphone', tone: 'violet' },
  FRIEND_SHARE: { icon: 'share', tone: 'teal' },
};
export function badgeOf(it) {
  const c = it.contentCategory || '';
  if (it.group === 'REPLY') return ['reply', 'blue'];
  if (c === 'FOLLOWED') return ['follow', 'green'];
  if (c.endsWith('_FAVORITE')) return ['star', 'amber'];
  if (c.endsWith('_LIKED')) return ['heart', 'pink'];
  if (c === 'CREATION_REMIXED') return ['remix', 'violet'];
  if (c === 'ASSET_MARKET_DONATE') return ['coin', 'amber'];
  if (c === 'ASSET_MARKET_PURCHASED') return ['download', 'teal'];
  if (it.group === 'CONTENT_INTERACTION') return ['heart', 'pink'];
  if (it.group === 'FRIEND_SHARE') return ['share', 'teal'];
  if (it.group === 'COMMUNITY') return ['megaphone', 'violet'];
  return ['bell', 'amber'];
}

export function renderNav() {
  if (!navEl) return;
  const info = {};
  let total = 0;
  let latest = null;
  if (state.summary) {
    total = state.summary.totalUnread || 0;
    (state.summary.groups || []).forEach((g) => {
      info[g.group] = g;
      if (g.preview && (!latest || Date.parse(g.preview.createdAt) > Date.parse(latest.createdAt))) latest = g.preview;
    });
  }
  const items = ['ALL', 'CHAT', 'FRIENDS'].concat(GROUPS).map((g) => {
    const kc = g === 'CHAT' || g === 'FRIENDS';
    const n = g === 'ALL' ? total : g === 'CHAT' ? unreadTotal() : (info[g] && info[g].unreadCount) || 0;
    const pv = g === 'ALL' ? latest : kc ? null : info[g] && info[g].preview;
    const meta = GROUP_META[g] || { tone: 'green' };
    return h('a', {
      class: 'ccwn-nav-item tone-' + meta.tone + (state.view === g ? ' is-active' : ''),
      href: g === 'ALL' ? '/notice' : g === 'CHAT' ? '/notice/chat' : g === 'FRIENDS' ? '/notice/friends' : '/notice/category/' + g,
      onclick: (e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return; e.preventDefault(); go(g, 'ALL'); },
    },
    h('span', { class: 'ccwn-tile' }, kc ? h('img', { class: 'ccwk-tile', src: KC_ICON, alt: '' }) : pixImg(g, 30)),
    h('span', { class: 'ccwn-nav-text' },
      h('span', { class: 'ccwn-nav-top' },
        h('span', { class: 'ccwn-nav-label', text: GROUP_LABEL[g] }),
        n ? h('span', { class: 'ccwn-count', text: n > 99 ? '99+' : String(n) }) : pv ? h('span', { class: 'ccwn-nav-time', text: relTime(pv.createdAt) }) : null),
      h('span', { class: 'ccwn-nav-preview', text: kc ? (g === 'CHAT' ? 'KukeChat 私聊和群聊' : '联系人、好友申请') : pv ? plain(pv.text || '').replace(/\s+/g, ' ') : state.summary ? '暂无消息' : '' })));
  });
  navEl.replaceChildren(h('div', { class: 'ccwn-nav-card' }, items));
}

export function renderToolbar() {
  if (!toolbarEl) return;
  const unread = state.summary
    ? state.view === 'ALL' ? state.summary.totalUnread : ((state.summary.groups || []).find((g) => g.group === state.view) || {}).unreadCount
    : 0;
  const left = h('div', { class: 'ccwn-title' },
    h('h1', { text: GROUP_LABEL[state.view] }),
    unread ? h('span', { class: 'ccwn-sub', text: unread + ' 条未读' }) : h('span', { class: 'ccwn-sub', text: state.summary ? '没有未读消息' : '' }));
  const seg = state.view === 'CONTENT_INTERACTION'
    ? h('div', { class: 'ccwn-seg' }, [['ALL', '全部'], ['LIKE', '点赞'], ['FAVORITE', '收藏']].map(([f, l]) =>
      h('button', { type: 'button', class: state.filter === f ? 'is-on' : '', onclick: () => go(state.view, f) }, l)))
    : null;
  const right = h('div', { class: 'ccwn-tools' },
    seg,
    h('button', { type: 'button', class: 'ccwn-chip' + (state.unreadOnly ? ' is-on' : ''), onclick: () => { state.unreadOnly = !state.unreadOnly; renderToolbar(); renderList(); pump(); } }, '只看未读'),
    h('button', { type: 'button', class: 'ccwn-btn', onclick: (e) => markAllRead(e.currentTarget), disabled: state.summary && !state.summary.totalUnread }, '全部已读'),
    h('button', { type: 'button', class: 'ccwn-icon', title: '刷新', onclick: () => go(state.view, state.filter, true) }, icon('refresh', 16)));
  toolbarEl.replaceChildren(left, right);
  syncStickyTop();
}
export function svg(d) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 16 16'); s.setAttribute('width', '16'); s.setAttribute('height', '16');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', d); p.setAttribute('fill', 'currentColor');
  s.appendChild(p); return s;
}

export const DEFAULT_AVATAR = 'https://m.ccw.site/community/images/avatar-default.png';
export function avatarEl(src, oid, size) {
  const img = h('img', { class: 'ccwn-avatar', src: src || DEFAULT_AVATAR, alt: '', loading: 'lazy', width: size, height: size });
  img.onerror = () => { img.onerror = null; img.src = DEFAULT_AVATAR; };
  return oid ? h('a', { href: '/student/' + oid, target: '_blank', rel: 'noreferrer', class: 'ccwn-avatar-link' }, img) : img;
}
// 头像 + 右下角类型标记
export function pixImg(key, size) {
  return h('img', { class: 'ccwn-pix', src: PIX[key] || PIX.SYSTEM, alt: '', width: size, height: size });
}
export function leadEl(it, face) {
  return h('div', { class: 'ccwn-lead' }, face);
}
export function sysFace(it) {
  return h('div', { class: 'ccwn-sys-face' }, pixImg(it.contentCategory === 'FOLLOWED' ? 'FANS' : it.group, 30));
}
export function userLink(u) {
  const name = u.name || '未知用户';
  return u.oid ? h('a', { class: 'ccwn-user', href: '/student/' + u.oid, target: '_blank', rel: 'noreferrer', text: name }) : h('span', { class: 'ccwn-user', text: name });
}
export function subjectLink(item, title) {
  const href = targetHref(item);
  const t = title || subjectTitle(item);
  if (!t) return null;
  return href ? h('a', { class: 'ccwn-subject', href, target: '_blank', rel: 'noreferrer', text: t }) : h('span', { class: 'ccwn-subject', text: t });
}
export function thumbEl(item) {
  const src = thumbOf(item);
  if (!src) return null;
  const href = targetHref(item);
  const img = h('img', { src, alt: '', loading: 'lazy' });
  img.onerror = () => img.parentNode && img.parentNode.remove();
  return href ? h('a', { class: 'ccwn-thumb', href, target: '_blank', rel: 'noreferrer' }, img) : h('span', { class: 'ccwn-thumb' }, img);
}
export function asideEl(child) { return h('div', { class: 'ccwn-aside' }, child); }
export function timeEl(iso) { return h('time', { class: 'ccwn-time', datetime: iso, title: fullTime(iso), text: relTime(iso) }); }
export function bodyEl(content, cls) {
  const el = h('div', { class: 'ccwn-body is-clamped ' + (cls || '') });
  el.appendChild(content);
  requestAnimationFrame(() => {
    if (el.isConnected && el.scrollHeight > el.clientHeight + 4 && !(el.nextSibling && el.nextSibling.classList && el.nextSibling.classList.contains('ccwn-more'))) {
      el.after(h('button', { type: 'button', class: 'ccwn-more', onclick: (e) => { el.classList.remove('is-clamped'); el.classList.add('is-open'); e.currentTarget.remove(); } }, '展开'));
    }
  });
  return el;
}

export function renderRow(row) {
  const items = row.items;
  const it = items[0];
  const unread = items.some((x) => x.readState === 'UNREAD' && !state.readLocal.has(x.id));
  const el = h('article', { class: 'ccwn-row' + (unread ? ' is-unread' : ''), 'data-ids': items.map((x) => x.id).join(',') });
  items.forEach((x) => rowByItem.set(x.id, el));
  let content;
  if (items.length > 1) content = renderAggregate(row, items);
  else if (it.group === 'REPLY') content = renderReply(it);
  else if (it.group === 'CONTENT_INTERACTION') content = renderInteraction(it);
  else if (it.group === 'FRIEND_SHARE') content = renderShare(it);
  else content = renderSystem(it);
  el.append(...content.filter(Boolean));
  observeRow(el, items);
  return el;
}

// 标题行：左边是谁做了什么，右边是时间；悬停时操作按钮盖在时间的位置上
export function line(parts, iso, actions) {
  const meta = h('div', { class: 'ccwn-meta' }, timeEl(iso));
  const acts = (actions || []).filter(Boolean);
  if (acts.length) meta.appendChild(h('div', { class: 'ccwn-hover' }, acts));
  return h('div', { class: 'ccwn-line' }, h('div', { class: 'ccwn-head' }, ...parts), meta);
}
export const verb = (t) => h('span', { class: 'ccwn-verb', text: t });

export function renderInteraction(it) {
  const u = sender(it);
  const extra = it.contentCategory === 'CREATION_REMIXED' && it.content && it.content.remixed_creation_title
    ? h('div', { class: 'ccwn-body is-muted', text: '改编作品：' + it.content.remixed_creation_title }) : null;
  const quote = it.contentCategory === 'COMMENT_LIKED' && it.comment ? bodyEl(richText(plain(it.comment)), 'is-quote') : null;
  return [
    leadEl(it, avatarEl(u.avatar, u.oid, 40)),
    h('div', { class: 'ccwn-main-col' }, line([userLink(u), verb(interactionVerb(it)), subjectLink(it)], it.createdAt), quote, extra),
    asideEl(thumbEl(it)),
  ];
}

export function followCtl(u, it, small) {
  const status = state.following[u.oid] || (it.followInfo && it.followInfo.followingStatus);
  if (status === 'UNFOLLOWED') {
    return h('button', { type: 'button', class: 'ccwn-btn is-primary is-small' + (small ? ' is-tiny' : ''), onclick: async (e) => {
      e.stopPropagation();
      const b = e.currentTarget; b.disabled = true;
      try { state.following[u.oid] = (await api.follow(u.oid)) || 'BOTH_FOLLOWED'; b.replaceWith(h('span', { class: 'ccwn-muted-tag', text: '已互关' })); }
      catch (err) { b.disabled = false; toast(err.message || '关注失败'); }
    } }, '回关');
  }
  if (status) return h('span', { class: 'ccwn-muted-tag', text: status === 'BOTH_FOLLOWED' ? '已互关' : '已关注' });
  return null;
}

export function renderAggregate(row, items) {
  const it = items[0];
  const isFollow = it.contentCategory === 'FOLLOWED';
  const users = [];
  const seen = new Set();
  items.forEach((x) => { const u = sender(x); const k = u.oid || u.name; if (!seen.has(k)) { seen.add(k); users.push({ u, x }); } });
  const faces = h('div', { class: 'ccwn-faces' }, users.slice(0, 10).map(({ u }) => avatarEl(u.avatar, u.oid, 24)));
  const names = [];
  users.slice(0, 2).forEach(({ u }, i) => { if (i) names.push(h('span', { class: 'ccwn-sep', text: '、' })); names.push(userLink(u)); });
  if (users.length > 2) names.push(verb('等 ' + users.length + ' 人'));
  const open = state.expanded.has(row.key);
  const toggle = h('button', { type: 'button', class: 'ccwn-link', onclick: () => {
    if (state.expanded.has(row.key)) state.expanded.delete(row.key); else state.expanded.add(row.key);
    rowCache.delete(row.key); renderList();
  } }, open ? '收起' : (isFollow ? '查看全部 ' + users.length + ' 人' : '查看全部 ' + items.length + ' 条'));
  const detail = open ? h('ul', { class: 'ccwn-agg-list' }, users.map(({ u, x }) =>
    h('li', { class: x.readState === 'UNREAD' && !state.readLocal.has(x.id) ? 'is-unread' : '' },
      avatarEl(u.avatar, u.oid, 22), userLink(u), isFollow ? followCtl(u, x, true) : null, timeEl(x.createdAt)))) : null;
  const parts = isFollow ? names.concat(verb('关注了你')) : names.concat(verb(interactionVerb(it)), subjectLink(it));
  return [
    h('div', { class: 'ccwn-lead' }, sysFace(it)),
    h('div', { class: 'ccwn-main-col' }, line(parts, it.createdAt), h('div', { class: 'ccwn-sub-actions' }, open ? null : faces, toggle), detail),
    asideEl(isFollow ? null : thumbEl(it)),
  ];
}

export function renderReply(it) {
  const u = sender(it);
  const course = it.content && it.content.ext && (it.content.ext.courseTitle || '').replace(/[{}]/g, '');
  const kindTitle = it.subjectType === 'PROFILE' ? null
    : it.subjectType === 'OUTSIDE_EMBED' ? (course ? subjectLink(it, course) : null)
      : subjectLink(it);
  const tail = replyTail(it);
  const href = targetHref(it);
  const canReply = Boolean(it.triggeredById && it.actions && it.actions.reply);
  const col = h('div', { class: 'ccwn-main-col' });
  col.append(
    line([userLink(u), verb(replyVerb(it)), kindTitle, tail ? verb(tail) : null].filter(Boolean), it.createdAt, [
      canReply ? h('button', { type: 'button', class: 'ccwn-act', onclick: () => openComposer(it, col) }, '回复') : null,
      href ? h('a', { class: 'ccwn-act', href, target: '_blank', rel: 'noreferrer' }, '查看对话') : null,
    ]),
    ...[it.message ? bodyEl(richText(plain(it.message)), 'is-quote') : null,
      bodyEl(richText(plain(it.comment || '')), 'is-comment')].filter(Boolean));
  if (state.composer && state.composer.id === it.id) col.appendChild(composerEl(it));
  return [leadEl(it, avatarEl(u.avatar, u.oid, 40)), col, asideEl(thumbEl(it))];
}

export function composerEl(it) {
  const u = sender(it);
  const ta = h('textarea', { rows: '2', placeholder: '回复 ' + (u.name || '') + '…', maxlength: '500' });
  ta.value = state.composer.text || '';
  ta.addEventListener('input', () => { state.composer.text = ta.value; });
  const status = h('span', { class: 'ccwn-compose-status' });
  const send = h('button', { type: 'button', class: 'ccwn-btn is-primary' }, '发送');
  const cancel = h('button', { type: 'button', class: 'ccwn-btn' }, '取消');
  const close = () => { state.composer = null; box.remove(); };
  const submit = async () => {
    const text = ta.value.trim();
    if (!text) { ta.focus(); return; }
    send.disabled = true; status.textContent = '发送中…'; status.className = 'ccwn-compose-status';
    try {
      const r = await api.reply(text, it.triggeredById);
      close();
      toast(r && r.status === 'CREATED' ? '回复已提交，正在审核' : '回复成功');
    } catch (e) {
      send.disabled = false; status.textContent = e.message || '发送失败'; status.className = 'ccwn-compose-status is-error';
    }
  };
  send.onclick = submit; cancel.onclick = close;
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); }
    if (e.key === 'Escape') close();
  });
  const box = h('div', { class: 'ccwn-compose' }, ta, h('div', { class: 'ccwn-compose-bar' }, status, h('span', { class: 'ccwn-hint', text: 'Ctrl + Enter 发送' }), cancel, send));
  requestAnimationFrame(() => ta.focus());
  return box;
}
export function openComposer(it, col) {
  const prev = document.querySelector('.ccwn-compose');
  if (prev) prev.remove();
  if (state.composer && state.composer.id === it.id) { state.composer = null; return; }
  state.composer = { id: it.id, text: '' };
  col.appendChild(composerEl(it));
}

export function renderShare(it) {
  const u = sender(it);
  const v = shareTarget(it) || '发来分享';
  const msg = (it.content && it.content.message) || it.message || '';
  const title = it.subjectType === 'PROFILE' && it.studentInfo ? subjectLink(it, it.studentInfo.name) : subjectLink(it);
  const unavailable = it.target && it.target.type === 'NONE' && !msg && it.subjectType !== 'SOCIETY';
  return [
    leadEl(it, avatarEl(u.avatar, u.oid, 40)),
    h('div', { class: 'ccwn-main-col' },
      line([userLink(u), verb(v), title].filter(Boolean), it.createdAt),
      msg ? bodyEl(richText(plain(msg)), 'is-comment') : null,
      unavailable ? h('div', { class: 'ccwn-body is-muted', text: it.title || '该内容暂不可访问' }) : null),
    asideEl(thumbEl(it)),
  ];
}

export function renderSystem(it) {
  const u = sender(it);
  const hasSender = Boolean(it.senderInfo && it.senderInfo.name);
  if (it.contentCategory === 'FOLLOWED') {
    return [
      leadEl(it, avatarEl(u.avatar, u.oid, 40)),
      h('div', { class: 'ccwn-main-col' }, line([userLink(u), verb('关注了你')], it.createdAt)),
      asideEl(followCtl(u, it)),
    ];
  }
  const raw = it.comment || it.message || (it.content && it.content.comments) || '';
  const title = it.title || SYSTEM_TITLE[it.contentCategory] || (it.group === 'COMMUNITY' ? '社区通知' : '系统通知');
  const href = targetHref(it);
  const face = hasSender && it.contentCategory !== 'INVITEE_REGISTERED' ? leadEl(it, avatarEl(u.avatar, u.oid, 40)) : h('div', { class: 'ccwn-lead' }, sysFace(it));
  return [
    face,
    h('div', { class: 'ccwn-main-col' },
      line([h('span', { class: 'ccwn-sys-title', text: title })], it.createdAt, [href ? h('a', { class: 'ccwn-act', href, target: '_blank', rel: 'noreferrer' }, '查看') : null]),
      raw ? bodyEl(looksHtml(raw) ? safeHtml(raw) : richText(raw), 'is-system') : null),
    asideEl(thumbEl(it)),
  ];
}

export function reconcile(container, nodes) {
  for (let i = 0; i < nodes.length; i++) {
    if (container.children[i] !== nodes[i]) container.insertBefore(nodes[i], container.children[i] || null);
  }
  while (container.children.length > nodes.length) container.lastChild.remove();
}

export function rowSig(row) {
  return row.items.map((x) => x.id + (x.readState === 'UNREAD' && !state.readLocal.has(x.id) ? 'u' : '')).join(',') + (state.expanded.has(row.key) ? '+' : '');
}

export function renderList() {
  if (!listEl) return;
  const items = visibleItems();
  const sections = buildRows(items, true);
  const nodes = [];
  for (const s of sections) {
    let sh = sectionCache.get(s.key);
    if (!sh) { sh = h('div', { class: 'ccwn-section' }, h('span', { text: s.label }), h('b')); sectionCache.set(s.key, sh); }
    nodes.push(sh);
    for (const row of s.rows) {
      const sig = rowSig(row);
      let c = rowCache.get(row.key);
      if (!c || (c.sig !== sig && !(state.composer && row.items.some((x) => x.id === state.composer.id)))) {
        c = { el: renderRow(row), sig };
        rowCache.set(row.key, c);
      }
      nodes.push(c.el);
    }
  }
  reconcile(listEl, nodes);
  renderFoot(items.length);
}

export function renderFoot(count) {
  const err = anyError();
  let content;
  if (err) {
    content = h('div', { class: 'ccwn-state' }, h('span', { text: err.message || '加载失败' }), h('button', { type: 'button', class: 'ccwn-btn', onclick: () => { viewGroups().map(stream).forEach((s) => { s.error = null; }); pump(); } }, '重试'));
  } else if (anyLoading() || !allDone()) {
    content = count ? h('div', { class: 'ccwn-state is-loading' }, '加载中…') : h('div', { class: 'ccwn-skeleton' }, [0, 1, 2, 3, 4, 5].map(() => h('div', { class: 'ccwn-sk-row' }, h('i'), h('div', null, h('b'), h('s')))));
  } else if (!count) {
    content = h('div', { class: 'ccwn-empty' }, h('div', { class: 'ccwn-empty-title', text: state.unreadOnly ? '没有未读消息' : '暂无消息' }));
  } else {
    content = h('div', { class: 'ccwn-state is-end', text: '没有更早的消息了' });
  }
  footEl.replaceChildren(content);
}

export let pumping = false;
export async function pump() {
  if (pumping || !root || !isActive) return;
  pumping = true;
  const gen = state.gen;
  try {
    for (let guard = 0; guard < 30; guard++) {
      if (gen !== state.gen) break;
      const rect = footEl.getBoundingClientRect();
      const need = rect.top < window.innerHeight + 800;
      if (!need) break;
      const s = nextStreamToLoad();
      if (!s) break;
      renderFoot(visibleItems().length);
      await loadStream(s);
      if (gen !== state.gen) break;
      renderList();
    }
  } finally {
    pumping = false;
    if (gen === state.gen) renderList();
  }
}

export function toast(msg) {
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.classList.add('is-on');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => toastEl.classList.remove('is-on'), 2400);
}

// 顶栏信封上的未读角标跟着改，避免标完已读还挂着旧数字
export function syncHeaderBadge() {
  if (!state.summary) return;
  const n = state.summary.totalUnread || 0;
  document.querySelectorAll('header a[href*="/notice"]').forEach((a) => {
    // 跳过我们自己的合计红点（kukechat/badge.js）
    const badge = Array.from(a.querySelectorAll('*')).find((x) => !x.children.length && !x.classList.contains('ccwk-env-badge') && /^\d+\+?$/.test(x.textContent.trim()));
    if (!badge) return;
    if (n) { badge.textContent = n > 99 ? '99+' : String(n); badge.style.display = ''; }
    else badge.style.display = 'none';
  });
}
