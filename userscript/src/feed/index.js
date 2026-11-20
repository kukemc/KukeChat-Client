import { ApiError, api, post } from '../core/api.js';
import { h } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { syncStickyTop, watchHeader } from '../core/sticky.js';
import { injectStyle } from '../core/style.js';
import { dayStart, fullTime, relTime } from '../core/time.js';
import { state } from '../notice/state.js';
import { avatarEl, card, pixImg, toast } from '../notice/view.js';

/* ------------------------------------------------------------------ */
/* 动态页（/feed）                                                      */
/* ------------------------------------------------------------------ */
export const FEED_FILTERS = [
  ['ALL', '全部动态', 'ALL'],
  ['WORKS', '作品更新', 'CONTENT_INTERACTION'],
  ['POSTS', '文章', 'COMMUNITY'],
  ['LIKES', '赞与分享', 'FRIEND_SHARE'],
  ['FOLLOWS', '关注', 'SYSTEM'],
];
export const feed = { filter: 'ALL', groups: [], ids: new Set(), cursor: null, hasMore: true, loading: false, error: null, loaded: false, me: null, rec: null, recPage: 0, expanded: new Set(), gen: 0 };
export let feedRoot = null, feedNavEl = null, feedToolbarEl = null, feedListEl = null, feedFootEl = null, feedSideEl = null, feedMeEl = null;
export let feedActive = false;
export const isFeedPath = () => /^\/feed\/?$/.test(location.pathname);

export function feedKind(t) {
  if (t === 'CREATION_ITERATED' || t === 'CREATION_PUBLISHED' || t === 'CREATION_RATED_AS_EXCELLENT') return 'WORKS';
  if (t === 'POST_PUBLISHED') return 'POSTS';
  if (t === 'CREATION_LIKED' || t === 'CREATION_SHARE' || t === 'POST_LIKED' || t === 'ASSET_MARKET_LIKED' || t === 'ASSET_MARKET_SHARE') return 'LIKES';
  if (t === 'FOLLOWING' || t === 'USER_RECOMMEND') return 'FOLLOWS';
  return 'OTHER';
}
export const msIso = (ms) => new Date(ms || Date.now()).toISOString();
// 动态按天分段：今天、昨天，之后是「11月18日 周三」
export function feedSectionOf(ms) {
  const d = new Date(ms || Date.now());
  const days = Math.round((dayStart(new Date()) - dayStart(d)) / 86400000);
  const key = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  if (days <= 0) return { key, label: '今天' };
  if (days === 1) return { key, label: '昨天' };
  const label = (d.getFullYear() === new Date().getFullYear() ? '' : d.getFullYear() + '年') + (d.getMonth() + 1) + '月' + d.getDate() + '日 周' + '日一二三四五六'[d.getDay()];
  return { key, label };
}
export const fmtNum = (n) => (n == null ? '' : n >= 10000 ? (n / 10000).toFixed(n >= 100000 ? 0 : 1) + 'w' : String(n));

export async function loadFeedPage() {
  if (feed.loading || !feed.hasMore) return;
  feed.loading = true; feed.error = null;
  const gen = feed.gen;
  try {
    const p = await post('/spread_feed/aggregated/list', { cursor: feed.cursor });
    if (gen !== feed.gen) return;
    for (const g of (p && p.items) || []) {
      const old = feed.groups.find((x) => x.groupId === g.groupId);
      if (old) {
        const src = new Map(old.sources.map((s) => [s.feedId, s]));
        g.sources.forEach((s) => src.set(s.feedId, s));
        old.sources = Array.from(src.values());
        old.releaseIds = Array.from(new Set([...(old.releaseIds || []), ...(g.releaseIds || [])]));
      } else feed.groups.push(g);
    }
    if (p && p.hasMore && (!p.nextCursor || p.nextCursor === feed.cursor)) throw new ApiError('', '动态加载失败');
    feed.cursor = p ? p.nextCursor : null;
    feed.hasMore = Boolean(p && p.hasMore);
    feed.loaded = true;
  } catch (e) {
    if (gen === feed.gen) feed.error = e;
  } finally {
    if (gen === feed.gen) feed.loading = false;
  }
}

export async function loadFeedSide() {
  try {
    const self = await post('/students/self/detail', {});
    const oid = self && (self.studentOid || self.oid);
    if (oid) feed.me = await post('/creation/student/detail', { studentOid: oid });
  } catch (_) { /* 未登录 */ }
  renderFeedMe();
  try {
    feed.rec = await post('/recommend_creator/list', { excellentCount: 4, potentialCount: 8 });
  } catch (_) { feed.rec = []; }
  renderFeedSide();
}

export function mountFeed() {
  if (feedRoot) return;
  feedRoot = h('div', { id: 'ccwf-root', class: 'ccwn-app' });
  feedNavEl = h('nav', { class: 'ccwn-nav' });
  feedMeEl = h('div', { class: 'ccwf-me' });
  const main = h('section', { class: 'ccwf-main' });
  feedToolbarEl = h('header', { class: 'ccwf-top' });
  feedListEl = h('div', { class: 'ccwf-list' });
  feedFootEl = h('div', { class: 'ccwf-foot' });
  main.append(feedToolbarEl, feedListEl, feedFootEl);
  feedSideEl = h('aside', { class: 'ccwn-side' });
  feedRoot.append(h('div', { class: 'ccwf-layout' }, h('div', { class: 'ccwn-left' }, feedMeEl, feedNavEl), main, feedSideEl));
  document.body.appendChild(feedRoot);
  new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) feedPump(); }, { rootMargin: '900px 0px' }).observe(feedFootEl);
}

export function feedCounts() {
  const c = { ALL: 0, WORKS: 0, POSTS: 0, LIKES: 0, FOLLOWS: 0 };
  feed.groups.forEach((g) => { const k = feedKind(g.feed.type); c.ALL++; if (c[k] != null) c[k]++; });
  return c;
}

export function renderFeedNav() {
  const c = feedCounts();
  feedNavEl.replaceChildren(h('div', { class: 'ccwn-nav-card' }, FEED_FILTERS.map(([k, label, pix]) =>
    h('a', { class: 'ccwn-nav-item' + (feed.filter === k ? ' is-active' : ''), href: '/feed', onclick: (e) => { e.preventDefault(); setFeedFilter(k); } },
      h('span', { class: 'ccwn-tile' }, pixImg(k === 'ALL' ? 'FRIEND_SHARE' : pix, 30)),
      h('span', { class: 'ccwn-nav-text' },
        h('span', { class: 'ccwn-nav-top' }, h('span', { class: 'ccwn-nav-label', text: label }), c[k] ? h('span', { class: 'ccwn-nav-time', text: c[k] + (feed.hasMore ? '+' : '') + ' 条' }) : null))))));
}

export function renderFeedToolbar() {
  const label = FEED_FILTERS.find((f) => f[0] === feed.filter)[1];
  feedToolbarEl.replaceChildren(
    h('div', { class: 'ccwn-title' }, h('h1', { text: label === '全部动态' ? '好友动态' : label }), h('span', { class: 'ccwn-sub', text: '你关注的创作者' })),
    h('div', { class: 'ccwn-tools' },
      h('button', { type: 'button', class: 'ccwn-icon', title: '刷新', onclick: () => resetFeed() }, icon('refresh', 16))));
  syncStickyTop();
}

export function renderFeedMe() {
  const m = feed.me;
  if (!m) { feedMeEl.replaceChildren(); return; }
  feedMeEl.replaceChildren(h('section', { class: 'ccwn-card ccwf-mecard' },
    h('a', { class: 'ccwf-me-head', href: '/student/' + m.oid, target: '_blank', rel: 'noreferrer' },
      avatarEl(m.avatar, '', 44), h('span', null, h('b', { text: m.name || '' }), h('span', { text: (m.bio || '').trim() || '这个人很懒，什么都没写' }))),
    h('div', { class: 'ccwf-me-stats' },
      [['作品', m.creationCount], ['粉丝', m.followerCount], ['关注', m.followingCount], ['获赞', m.likeCount]].map(([l, n]) =>
        h('div', null, h('b', { text: fmtNum(n || 0) }), h('span', { text: l }))))));
}

export function renderFeedSide() {
  const list = feed.rec || [];
  if (!list.length) { feedSideEl.replaceChildren(); return; }
  const per = 6;
  const pages = Math.max(1, Math.ceil(list.length / per));
  const page = list.slice((feed.recPage % pages) * per, (feed.recPage % pages) * per + per);
  const more = pages > 1 ? h('button', { type: 'button', class: 'ccwn-link', onclick: () => { feed.recPage++; renderFeedSide(); } }, '换一批') : null;
  feedSideEl.replaceChildren(card('为你推荐', more, h('ul', { class: 'ccwf-recs' }, page.map((u) => {
    const st = state.following[u.studentOid];
    const followed = st && st !== 'UNFOLLOWED';
    const btn = followed ? h('span', { class: 'ccwn-muted-tag', text: '已关注' }) : h('button', { type: 'button', class: 'ccwn-btn is-primary is-tiny', onclick: async (e) => {
      const b = e.currentTarget; b.disabled = true;
      try { state.following[u.studentOid] = (await api.follow(u.studentOid)) || 'FOLLOWED'; renderFeedSide(); }
      catch (err) { b.disabled = false; toast(err.message || '关注失败'); }
    } }, '关注');
    return h('li', null,
      avatarEl(u.avatar, u.studentOid, 36),
      h('a', { class: 'ccwf-rec-text', href: '/student/' + u.studentOid, target: '_blank', rel: 'noreferrer' },
        h('b', { text: u.name || '' }),
        h('span', { text: (u.creatorType === 'EXCELLENT' ? '优秀创作者' : '潜力创作者') + ' · ' + fmtNum(u.followerCount || 0) + ' 粉丝' })),
      btn);
  }))));
}

/* ---------- 卡片 ---------- */
export function workHref(c, releaseOid) {
  return '/detail/' + c.creationOid + '?from=feed' + (releaseOid ? '&feedReleaseOid=' + encodeURIComponent(releaseOid) : '');
}
export function postHref(p) { return '/post/' + (p.slug || p.postOid || p.oid); }
export const ownerOf = (g) => g.feed.ownerInfo || {};
export const userA = (u, cls) => (u && u.oid
  ? h('a', { class: cls || 'ccwf-name', href: '/student/' + u.oid, target: '_blank', rel: 'noreferrer', text: u.name || '创作者' })
  : h('span', { class: cls || 'ccwf-name', text: (u && u.name) || '创作者' }));
export const coverOf = (c) => c.coverLink || c.coverGifLink || '';

export const FEED_CHIP = {
  CREATION_ITERATED: ['作品更新', 'green'], CREATION_PUBLISHED: ['新作品', 'blue'], CREATION_RATED_AS_EXCELLENT: ['精选', 'amber'],
  POST_PUBLISHED: ['文章', 'violet'], CREATION_LIKED: ['点赞', 'pink'], POST_LIKED: ['点赞', 'pink'], CREATION_SHARE: ['分享', 'teal'], FOLLOWING: ['关注', 'teal'],
};

// 卡片头：头像、名字、动作 · 时间、右上角类型
export function cardHead(users, action, ms, type) {
  const list = users.filter(Boolean);
  const first = list[0] || {};
  const avatars = list.length > 1
    ? h('div', { class: 'ccwf-avs' }, list.slice(0, 3).map((u) => avatarEl(u.avatar, u.oid, 40)))
    : avatarEl(first.avatar, first.oid, 40);
  const names = [];
  list.slice(0, 2).forEach((u, i) => { if (i) names.push(h('span', { class: 'ccwf-sep', text: '、' })); names.push(userA(u)); });
  if (list.length > 2) names.push(h('span', { class: 'ccwf-sep', text: ' 等 ' + list.length + ' 人' }));
  const chip = FEED_CHIP[type];
  return h('header', { class: 'ccwf-head' },
    avatars,
    h('div', { class: 'ccwf-who' },
      h('div', { class: 'ccwf-names' }, names),
      h('div', { class: 'ccwf-sub' }, h('span', { text: action }), h('span', { class: 'ccwf-dot', text: '·' }), h('time', { datetime: msIso(ms), title: fullTime(msIso(ms)), text: relTime(msIso(ms)) }))),
    chip ? h('span', { class: 'ccwf-chip tone-' + chip[1], text: chip[0] }) : null);
}

// 浏览 / 点赞 / 评论：放在文字区底部，和封面下沿对齐
export function statsRow(views, likes, comments) {
  return h('div', { class: 'ccwf-stats' },
    [['eye', views, '浏览'], ['heart', likes, '点赞'], ['reply', comments, '评论']].map(([ic, n, title]) =>
      (n == null ? null : h('span', { title }, icon(ic, 14), fmtNum(n)))));
}

// 转发式卡头：谁做了什么，小字一行；真正的作者在下面的引用卡里
export function reHead(u, action, ms, ic, tone) {
  return h('header', { class: 'ccwf-rehead tone-' + tone },
    h('span', { class: 'ccwf-re-icon' }, icon(ic, 14)),
    avatarEl(u.avatar, u.oid, 22),
    userA(u),
    h('span', { class: 'ccwf-re-act', text: action }),
    h('span', { class: 'ccwf-dot', text: '·' }),
    h('time', { datetime: msIso(ms), title: fullTime(msIso(ms)), text: relTime(msIso(ms)) }));
}
export function quoteHead(author, what) {
  if (!author) return null;
  return h('div', { class: 'ccwf-qhead' }, avatarEl(author.avatar, author.oid, 28), userA(author), h('span', { class: 'ccwf-re-act', text: what }));
}

// 作品：封面在左，标题和这次的更新内容在右
export function workBody(c, opts) {
  const o = opts || {};
  const desc = (c.description || '').trim();
  return h('a', { class: 'ccwf-media', href: workHref(c, c.creationReleaseOid), target: '_blank', rel: 'noreferrer' },
    h('div', { class: 'ccwf-cover' },
      h('img', { src: coverOf(c), alt: '', loading: 'lazy' }),
      o.version ? h('span', { class: 'ccwf-badge', text: o.version }) : null,
      c.isTeamwork ? h('span', { class: 'ccwf-badge is-left', text: '协作' }) : null),
    h('div', { class: 'ccwf-text' },
      h('h3', { text: c.creationTitle || '未命名作品' }),
      o.label && (desc || o.update) ? h('div', { class: 'ccwf-label' }, o.label, o.multi ? h('span', { text: '同日多次更新' }) : null) : null,
      desc ? h('p', { text: desc }) : (o.update ? h('p', { class: 'is-muted', text: '作者没有填写更新说明' }) : null),
      statsRow(c.viewCount, c.likeCount, c.commentCount)));
}

export function articleBody(p) {
  const img = p.featureImage && p.featureImage.url;
  return h('a', { class: 'ccwf-media is-article', href: postHref(p), target: '_blank', rel: 'noreferrer' },
    img ? h('div', { class: 'ccwf-cover is-wide' }, h('img', { src: img, alt: '', loading: 'lazy' }), p.rank === 'EXCELLENT' ? h('span', { class: 'ccwf-badge is-gold', text: '精选' }) : null) : null,
    h('div', { class: 'ccwf-text' },
      h('h3', { text: p.title || '' }),
      p.tags && p.tags.length ? h('div', { class: 'ccwf-tags' }, p.tags.slice(0, 4).map((t) => h('span', { text: '#' + t }))) : null,
      statsRow(p.viewCount, p.likeCount, p.commentCount)));
}

// 作品墙：标题叠在封面底部
export function tileWall(items, isPost) {
  return h('div', { class: 'ccwf-wall' + (isPost ? ' is-wide' : '') }, items.map((x) => {
    const href = isPost ? postHref(x) : workHref(x);
    const img = isPost ? x.featureImage && x.featureImage.url : coverOf(x);
    const by = isPost ? x.author && x.author.name : x.studentBaseInfo && x.studentBaseInfo.name;
    return h('a', { class: 'ccwf-tile', href, target: '_blank', rel: 'noreferrer', title: (isPost ? x.title : x.creationTitle) || '' },
      img ? h('img', { src: img, alt: '', loading: 'lazy' }) : null,
      h('span', { class: 'ccwf-tile-cap' }, h('b', { text: (isPost ? x.title : x.creationTitle) || '' }), by ? h('span', { text: by }) : null));
  }));
}

export function personWall(people) {
  return h('div', { class: 'ccwf-people' }, people.map(({ u, status }) => {
    const st = state.following[u.oid] || status;
    const followed = st === 'FOLLOWED' || st === 'BOTH_FOLLOWED';
    const btn = followed
      ? h('span', { class: 'ccwf-followed', text: st === 'BOTH_FOLLOWED' ? '已互关' : '已关注' })
      : h('button', { type: 'button', class: 'ccwn-btn is-primary is-tiny', onclick: async (e) => {
        e.preventDefault();
        const b = e.currentTarget; b.disabled = true;
        try { state.following[u.oid] = (await api.follow(u.oid)) || 'FOLLOWED'; b.replaceWith(h('span', { class: 'ccwf-followed', text: '已关注' })); }
        catch (err) { b.disabled = false; toast(err.message || '关注失败'); }
      } }, '关注');
    return h('div', { class: 'ccwf-person' },
      h('a', { href: '/student/' + u.oid, target: '_blank', rel: 'noreferrer', class: 'ccwf-person-link' },
        avatarEl(u.avatar, '', 56),
        h('b', { text: u.name || '' }),
        h('span', { text: (u.creationCount != null ? u.creationCount + ' 作品 · ' : '') + fmtNum(u.followerCount || 0) + ' 粉丝' })),
      btn);
  }));
}

export function renderFeedCard(groups, key) {
  const g = groups[0];
  const f = g.feed;
  const t = f.type;
  const o = ownerOf(g);
  const c = f.creationContent;
  const LIMIT = 8;
  const open = feed.expanded.has(key);
  const toggle = (n) => (n > LIMIT ? h('button', { type: 'button', class: 'ccwf-more', onclick: () => { if (open) feed.expanded.delete(key); else feed.expanded.add(key); renderFeedList(); } }, open ? '收起' : '还有 ' + (n - LIMIT) + ' 个') : null);
  const card = (...kids) => h('article', { class: 'ccwf-card' }, ...kids);

  if (t === 'CREATION_ITERATED' || t === 'CREATION_PUBLISHED') {
    const owners = [];
    const seen = new Set();
    (g.sources && g.sources.length ? g.sources.map((s) => s.ownerInfo) : [o]).forEach((u) => { if (u && !seen.has(u.oid)) { seen.add(u.oid); owners.push(u); } });
    const mine = owners.length === 1 && c && c.studentOid === owners[0].oid;
    const version = c && (c.customVersion ? 'V' + c.customVersion : c.version ? 'V' + c.version : '');
    const action = t === 'CREATION_PUBLISHED' ? (mine ? '发布了新作品' : '参与的作品发布了') : (mine ? '更新了作品' : '参与的作品更新了');
    return card(cardHead(owners, action, f.feedTime, t),
      c ? workBody(c, { version, label: t === 'CREATION_ITERATED' ? '更新内容' : '作品简介', multi: (g.releaseIds || []).length > 1, update: t === 'CREATION_ITERATED' }) : null);
  }
  if (t === 'CREATION_RATED_AS_EXCELLENT') {
    return card(cardHead([o], '参与的作品被评为精选', f.feedTime, t), c ? workBody(c, { label: '作品简介' }) : null);
  }
  if (t === 'POST_PUBLISHED' && f.postContent) {
    return card(cardHead([o], '发布了文章', f.feedTime, t), articleBody(f.postContent));
  }
  if (t === 'FOLLOWING') {
    const people = groups.map((x) => x.feed.socialActionContent).filter((s) => s && s.studentBaseInfo).map((s) => ({ u: s.studentBaseInfo, status: s.followStatusWithCurrent }));
    const shown = open ? people : people.slice(0, LIMIT);
    return card(reHead(o, people.length > 1 ? '关注了 ' + people.length + ' 位创作者' : '关注了创作者', f.feedTime, 'follow', 'teal'), personWall(shown), toggle(people.length));
  }
  if (t === 'CREATION_LIKED' || t === 'POST_LIKED' || t === 'CREATION_SHARE') {
    const isPost = t === 'POST_LIKED';
    const share = t === 'CREATION_SHARE';
    const [ic, tone] = share ? ['share', 'teal'] : ['heart', 'pink'];
    const items = groups.map((x) => (isPost ? x.feed.postContent : x.feed.creationContent)).filter(Boolean);
    if (items.length === 1) {
      const one = items[0];
      const author = isPost ? one.author : one.studentBaseInfo;
      const img = isPost ? one.featureImage && one.featureImage.url : coverOf(one);
      // 点赞、分享是次要动态：小封面 + 标题 + 作者，不展开简介
      return h('article', { class: 'ccwf-card is-compact' },
        reHead(o, share ? '分享了' : '赞了', f.feedTime, ic, tone),
        h('a', { class: 'ccwf-mini-quote', href: isPost ? postHref(one) : workHref(one), target: '_blank', rel: 'noreferrer' },
          h('span', { class: 'ccwf-mq-cover' + (isPost ? ' is-wide' : '') }, img ? h('img', { src: img, alt: '', loading: 'lazy' }) : null),
          h('span', { class: 'ccwf-mq-text' },
            h('b', { text: (isPost ? one.title : one.creationTitle) || '' }),
            author ? h('span', { class: 'ccwf-mq-by' }, avatarEl(author.avatar, '', 18), h('span', { text: author.name + (isPost ? ' 的文章' : ' 的作品') })) : null,
            statsRow(one.viewCount, one.likeCount, one.commentCount))));
    }
    const shown = open ? items : items.slice(0, LIMIT);
    const what = isPost ? ' 篇文章' : ' 个作品';
    return card(reHead(o, (share ? '分享了 ' : '赞了 ') + items.length + what, f.feedTime, ic, tone), tileWall(shown, isPost), toggle(items.length));
  }
  return card(cardHead([o], f.title || '有新动态', f.feedTime, t), c ? workBody(c, { showAuthor: true }) : null);
}

export function renderFeedList() {
  const groups = feed.groups.filter((g) => feed.filter === 'ALL' || feedKind(g.feed.type) === feed.filter);
  const rows = [];
  let curKey = null;
  let aggMap = null;
  for (const g of groups) {
    const sec = feedSectionOf(g.feed.feedTime);
    if (sec.key !== curKey) { curKey = sec.key; aggMap = new Map(); rows.push({ section: sec }); }
    const t = g.feed.type;
    if (t === 'CREATION_LIKED' || t === 'POST_LIKED' || t === 'FOLLOWING' || t === 'CREATION_SHARE') {
      const k = sec.key + '|' + t + '|' + (g.feed.ownerId || '');
      const r = aggMap.get(k);
      if (r) { r.groups.push(g); continue; }
      const nr = { key: k, groups: [g] };
      aggMap.set(k, nr); rows.push(nr);
    } else rows.push({ key: g.groupId, groups: [g] });
  }
  const nodes = rows.map((r, i) => (r.section
    ? h('div', { class: 'ccwf-day' + (i === 0 ? ' is-first' : '') }, h('span', { text: r.section.label }))
    : renderFeedCard(r.groups, r.key)));
  feedListEl.replaceChildren(...nodes);
  renderFeedFoot(groups.length);
  renderFeedNav();
}

export function renderFeedFoot(count) {
  let content;
  if (feed.error) content = h('div', { class: 'ccwf-state' }, h('span', { text: feed.error.message || '动态加载失败' }), h('button', { type: 'button', class: 'ccwn-btn', onclick: () => { feed.error = null; feedPump(); } }, '重试'));
  else if (feed.loading || feed.hasMore) content = count ? h('div', { class: 'ccwf-state', text: '加载中…' }) : h('div', null, [0, 1, 2].map(() => h('div', { class: 'ccwf-card ccwf-sk' }, h('div', { class: 'ccwf-sk-head' }, h('i'), h('b')), h('div', { class: 'ccwf-sk-body' }, h('i'), h('div', null, h('b'), h('s'), h('s'))))));
  else if (!count) content = h('div', { class: 'ccwf-state is-empty', text: feed.filter === 'ALL' ? '还没有动态，去关注一些创作者吧' : '这一类还没有动态' });
  else content = h('div', { class: 'ccwf-state', text: '已经看完了' });
  feedFootEl.replaceChildren(content);
}

export let feedPumping = false;
export async function feedPump() {
  if (feedPumping || !feedActive) return;
  feedPumping = true;
  const gen = feed.gen;
  try {
    for (let i = 0; i < 20 && gen === feed.gen && feed.hasMore && !feed.error; i++) {
      if (feedFootEl.getBoundingClientRect().top > window.innerHeight + 1000) break;
      renderFeedFoot(feed.groups.length);
      await loadFeedPage();
      if (gen !== feed.gen) break;
      renderFeedList();
    }
  } finally {
    feedPumping = false;
    if (gen === feed.gen) renderFeedList();
  }
}

export function setFeedFilter(k) {
  feed.filter = k;
  renderFeedToolbar();
  renderFeedList();
  window.scrollTo(0, 0);
  feedPump();
}
export function resetFeed() {
  feed.gen++;
  Object.assign(feed, { groups: [], cursor: null, hasMore: true, loading: false, error: null, loaded: false });
  feed.expanded.clear();
  renderFeedList();
  feedPump();
  loadFeedSide();
}

export function activateFeed() {
  if (feedActive) return;
  feedActive = true;
  document.documentElement.classList.add('ccwf-on');
  injectStyle();
  mountFeed();
  feedRoot.style.display = '';
  watchHeader();
  document.title = '好友动态 - 共创世界';
  renderFeedToolbar();
  renderFeedList();
  if (!feed.loaded) { feedPump(); loadFeedSide(); } else feedPump();
}
export function deactivateFeed() {
  if (!feedActive) return;
  feedActive = false;
  document.documentElement.classList.remove('ccwf-on');
  if (feedRoot) feedRoot.style.display = 'none';
}
