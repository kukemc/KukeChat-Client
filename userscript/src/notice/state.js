import { api } from '../core/api.js';
import { deactivate } from '../core/router.js';
import { GROUPS } from './model.js';
import { renderNav, renderToolbar, rowByItem, syncHeaderBadge, toast } from './view.js';

/* ------------------------------------------------------------------ */
/* 状态                                                                */
/* ------------------------------------------------------------------ */
export const state = {
  view: 'ALL',
  filter: 'ALL',
  unreadOnly: false,
  summary: null,
  streams: {}, // group -> { items, cursor, hasMore, loading, error }
  seen: new Set(), // 已提交标读的 id
  readLocal: new Set(), // 本地已读（等待淡出）
  expanded: new Set(),
  composer: null, // { id, text }
  following: {}, // oid -> status
  gen: 0,
};
export function streamKey(g) { return g + ':' + (g === 'CONTENT_INTERACTION' ? state.filter : 'ALL'); }
export function stream(g) {
  const k = streamKey(g);
  if (!state.streams[k]) state.streams[k] = { group: g, filter: g === 'CONTENT_INTERACTION' ? state.filter : 'ALL', items: [], ids: new Set(), cursor: null, hasMore: true, loading: false, error: null, loaded: false };
  return state.streams[k];
}
export const viewGroups = () => (state.view === 'ALL' ? GROUPS : [state.view]);

// 「只看未读」时不用把历史全翻完：未读的都在最前面，拉到已读的就说明后面没有未读了；
// 摘要里这个分类本来就 0 条未读，干脆不拉。否则点赞这种几千条的分类会一直转圈。
function unreadCountOf(g) {
  const sm = state.summary;
  const x = sm && (sm.groups || []).find((y) => y.group === g);
  return x && typeof x.unreadCount === 'number' ? x.unreadCount : null;
}
function exhausted(s) {
  if (!state.unreadOnly) return false;
  if (unreadCountOf(s.group) === 0) return true;
  const last = s.items[s.items.length - 1];
  return Boolean(last && last.readState !== 'UNREAD');
}
const pending = (s) => s.hasMore && !exhausted(s);

export async function loadStream(s) {
  if (s.loading || !s.hasMore) return;
  s.loading = true; s.error = null;
  const gen = state.gen;
  try {
    const p = await api.page(s.group, s.filter, s.cursor);
    if (gen !== state.gen) return;
    for (const it of p.items || []) {
      if (s.ids.has(it.id)) continue;
      s.ids.add(it.id);
      it._token = p.readToken; it._filter = s.filter;
      s.items.push(it);
    }
    s.cursor = p.nextCursor; s.hasMore = Boolean(p.hasMore && p.nextCursor);
    s.loaded = true;
  } catch (e) {
    if (gen !== state.gen) return;
    s.error = e;
    if (e.code === '10828906') { deactivate(true); return; }
  } finally {
    if (gen === state.gen) s.loading = false;
  }
}

// 多个分类按时间归并：只展示「所有还没拉完的分类都已覆盖到」的那一段
export function visibleItems() {
  const groups = viewGroups();
  const ss = groups.map(stream);
  let frontier = -Infinity;
  for (const s of ss) {
    if (!pending(s)) continue;
    if (!s.items.length) { frontier = Infinity; break; }
    frontier = Math.max(frontier, Date.parse(s.items[s.items.length - 1].createdAt));
  }
  let all = [];
  ss.forEach((s) => { all = all.concat(s.items); });
  all.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  if (groups.length > 1) all = all.filter((it) => Date.parse(it.createdAt) >= frontier);
  if (state.unreadOnly) all = all.filter((it) => it.readState === 'UNREAD' && !state.readLocal.has(it.id));
  return all;
}
export function nextStreamToLoad() {
  const ss = viewGroups().map(stream).filter((s) => pending(s) && !s.error);
  if (!ss.length) return null;
  const empty = ss.find((s) => !s.items.length);
  if (empty) return empty;
  return ss.reduce((best, s) => (Date.parse(s.items[s.items.length - 1].createdAt) > Date.parse(best.items[best.items.length - 1].createdAt) ? s : best));
}
export const allDone = () => viewGroups().map(stream).every((s) => !pending(s));
export const anyLoading = () => viewGroups().map(stream).some((s) => s.loading);
export const anyError = () => viewGroups().map(stream).find((s) => s.error);

export let summaryTimer = 0;
export function refreshSummary(delay) {
  clearTimeout(summaryTimer);
  summaryTimer = setTimeout(async () => {
    try {
      state.summary = await api.summary(false);
      renderNav(); renderToolbar(); syncHeaderBadge();
    } catch (e) {
      if (e.code === '10828906') deactivate(true);
    }
  }, delay || 0);
}

/* ---------- 标已读：正文进入视口并停留后提交 ---------- */
export const pendingRead = new Map(); // key(group|filter|token) -> {req, ids:Set}
export let flushTimer = 0;
export function queueRead(it) {
  if (it.readState !== 'UNREAD' || state.seen.has(it.id) || !it._token) return;
  state.seen.add(it.id);
  const k = it.group + '|' + it._filter + '|' + it._token;
  let p = pendingRead.get(k);
  if (!p) { p = { group: it.group, filter: it._filter, readToken: it._token, ids: new Set(), items: [] }; pendingRead.set(k, p); }
  p.ids.add(it.id); p.items.push(it);
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flushRead, 400);
}
export async function flushRead() {
  const batches = Array.from(pendingRead.values());
  pendingRead.clear();
  for (const b of batches) {
    try {
      await api.markRead({ group: b.group, filter: b.filter, readToken: b.readToken, ids: Array.from(b.ids) });
      b.items.forEach((it) => { it.readState = 'READ'; markRowRead(it.id); });
    } catch (_) {
      b.items.forEach((it) => state.seen.delete(it.id));
    }
  }
  refreshSummary(300);
}
export function markRowRead(id) {
  state.readLocal.add(id);
  const row = rowByItem.get(id);
  if (!row) return;
  const ids = row.dataset.ids.split(',');
  if (ids.every((x) => state.readLocal.has(x))) {
    setTimeout(() => row.classList.remove('is-unread'), 1600);
  }
}
export let io = null;
// 切换分类时丢掉旧的观察器（别的模块不能直接给 io 赋值）
export function resetRowObserver() {
  if (io) { io.disconnect(); io = null; }
}
export const dwell = new Map();
export function observeRow(row, items) {
  if (!items.some((it) => it.readState === 'UNREAD')) return;
  if (!io) {
    io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const el = e.target;
        if (e.isIntersecting && e.intersectionRatio >= 0.6) {
          if (!dwell.has(el)) dwell.set(el, setTimeout(() => {
            dwell.delete(el);
            if (document.visibilityState !== 'visible') return;
            (el._items || []).forEach(queueRead);
            io.unobserve(el);
          }, 500));
        } else if (dwell.has(el)) { clearTimeout(dwell.get(el)); dwell.delete(el); }
      }
    }, { threshold: [0, 0.6, 1] });
  }
  row._items = items;
  io.observe(row);
}

export async function markAllRead(btn) {
  btn.disabled = true; btn.textContent = '处理中…';
  try {
    const s = await api.summary(true);
    const token = s && s.markAll && s.markAll.readToken;
    if (token) {
      for (let i = 0; i < 50; i++) {
        const r = await api.markRead({ group: 'ALL', readToken: token });
        if (r.completed) break;
        await new Promise((res) => setTimeout(res, Math.max(200, r.retryAfterMs || 0)));
      }
    }
    Object.values(state.streams).forEach((st) => st.items.forEach((it) => { if (it.readState === 'UNREAD') { it.readState = 'READ'; markRowRead(it.id); } }));
    toast('已全部标为已读');
  } catch (e) {
    toast(e.message || '操作失败，请重试');
  }
  refreshSummary(0);
  btn.disabled = false; btn.textContent = '全部已读';
}
