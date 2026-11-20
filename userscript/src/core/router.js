import { loadEmojis } from './rich.js';
import { watchHeader } from './sticky.js';
import { injectStyle } from './style.js';
import { activateFeed, deactivateFeed, isFeedPath } from '../feed/index.js';
import { syncPresence } from '../kukechat/presence.js';
import { CHAT_VIEWS, enterChat, exitChat } from '../kukechat/chatView.js';
import { onUnread } from '../kukechat/unread.js';
import { renderMutualsBanner } from '../kukechat/mutuals.js';
import { GROUPS } from '../notice/model.js';
import { io, refreshSummary, state, resetRowObserver } from '../notice/state.js';
import { listEl, loadStats, mount, pump, renderList, renderNav, renderToolbar, root, rowByItem, rowCache, sectionCache, toolbarEl } from '../notice/view.js';

/* ------------------------------------------------------------------ */
/* 路由                                                                */
/* ------------------------------------------------------------------ */
export function parseRoute() {
  if (/^\/notice\/chat\/?$/.test(location.pathname)) return { view: 'CHAT', filter: 'ALL' };
  if (/^\/notice\/friends\/?$/.test(location.pathname)) return { view: 'FRIENDS', filter: 'ALL' };
  const m = location.pathname.match(/^\/notice(?:\/category\/([A-Z_]+))?\/?$/);
  if (!m) {
    // 旧路由：/notice/like 等
    const old = location.pathname.match(/^\/notice\/(like|reply|friendShare|activity|judgement|follower|system)\/?$/);
    if (!old) return null;
    const map = { like: 'CONTENT_INTERACTION', reply: 'REPLY', friendShare: 'FRIEND_SHARE', activity: 'COMMUNITY', judgement: 'SYSTEM', follower: 'SYSTEM', system: 'ALL' };
    return { view: map[old[1]], filter: 'ALL' };
  }
  const view = m[1] && GROUPS.includes(m[1]) ? m[1] : 'ALL';
  const f = new URLSearchParams(location.search).get('filter');
  return { view, filter: view === 'CONTENT_INTERACTION' && ['LIKE', 'FAVORITE'].includes(f) ? f : 'ALL' };
}

export function go(view, filter, force) {
  const base = view === 'ALL' ? '/notice' : view === 'CHAT' ? '/notice/chat' : view === 'FRIENDS' ? '/notice/friends' : '/notice/category/' + view;
  const url = base + (filter && filter !== 'ALL' ? '?filter=' + filter : '');
  if (location.pathname + location.search !== url) origPush.call(history, history.state, '', url);
  applyRoute(force);
}

export let isActive = false;
export let disabledForAccount = false;
export function applyRoute(force) {
  syncPresence();
  if (isFeedPath()) activateFeed(); else deactivateFeed();
  const r = disabledForAccount ? null : parseRoute();
  if (!r) { exitChat(); if (isActive) deactivate(false); return; }
  if (CHAT_VIEWS.includes(r.view)) {
    // 私信 / 好友：中栏和右栏交给停靠进来的 KukeChat，不加载通知列表
    if (!isActive) activate();
    state.view = r.view;
    renderNav();
    enterChat(r.view);
    return;
  }
  exitChat();
  const changed = !isActive || r.view !== state.view || r.filter !== state.filter;
  if (!isActive) activate();
  if (!changed && !force) return;
  state.view = r.view; state.filter = r.filter;
  state.gen++;
  if (force) { state.streams = {}; state.readLocal.clear(); state.seen.clear(); refreshSummary(0); loadStats(); }
  rowCache.clear(); rowByItem.clear(); sectionCache.clear(); state.expanded.clear(); state.composer = null;
  resetRowObserver();
  // 切回已加载过的分类时保留列表；但其中标过已读的条目按最新状态重画
  listEl.replaceChildren();
  renderNav(); renderToolbar(); renderList();
  renderMutualsBanner(toolbarEl, state.view);
  window.scrollTo(0, 0);
  pump();
}

let unreadHooked = false;
export function activate() {
  isActive = true;
  if (!unreadHooked) { unreadHooked = true; onUnread(() => { if (isActive) renderNav(); }); }
  document.documentElement.classList.add('ccwn-on');
  injectStyle();
  mount();
  root.style.display = '';
  watchHeader();
  document.title = '消息中心 - 共创世界';
  loadEmojis().then(() => { rowCache.clear(); renderList(); });
  refreshSummary(0);
  loadStats();
}
export function deactivate(forAccount) {
  isActive = false;
  if (forAccount) disabledForAccount = true;
  document.documentElement.classList.remove('ccwn-on');
  if (root) root.style.display = 'none';
}

export const origPush = history.pushState;
export const origReplace = history.replaceState;
history.pushState = function () { const r = origPush.apply(this, arguments); queueMicrotask(() => applyRoute(false)); return r; };
history.replaceState = function () { const r = origReplace.apply(this, arguments); queueMicrotask(() => applyRoute(false)); return r; };
window.addEventListener('popstate', () => applyRoute(false));
document.addEventListener('visibilitychange', () => { if (isActive && document.visibilityState === 'visible') refreshSummary(0); });
