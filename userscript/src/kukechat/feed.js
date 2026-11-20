// 动态页里并进来的 KukeChat 动态（关注的人 / 所有人），以及发动态的输入框、右栏「好友在玩」。
//
// 混排规则：KukeChat 动态包装成和 CCW 动态组同样的结构，按时间混在一起。CCW 那边还有没加载的更早动态时，
// 只放不早于已加载最旧一条的 KukeChat 动态 —— 否则往下翻时 CCW 的旧动态会插到 KukeChat 动态上面，时间线错乱。
import { h } from '../core/dom.js';
import { KC_ICON } from '../core/icons.js';
import { fullTime, relTime } from '../core/time.js';
import { currentKukeUser, ensureSession, kcIso, kcRequest } from './client.js';
import { myFollowings } from './ccwGraph.js';
import { activityHref, activityText } from './pages.js';

// 两份数据：follow = 好友 + 我在共创世界关注的人 + 自己（/ccw/feed），square = 所有人的公开动态（KukeChat 的广场，/posts/feed?scope=square）。
// 「全部动态」的混排只用 follow，免得所有人的动态把共创世界自己的动态淹没；「KukeChat」分类可以在两者之间切换。
const fresh = () => ({ posts: [], ids: new Set(), before: null, hasMore: true, loading: false });
const stores = { follow: fresh(), square: fresh() };
const session = { enabled: null, follows: null };
let kcScope = 'square';

export function getKcScope() { return kcScope; }
export function setKcScope(scope) { if (scope === 'follow' || scope === 'square') kcScope = scope; }
/** onlyKc：「KukeChat」分类（按切换选）；否则是混排用的 follow */
export function kcStore(onlyKc) { return stores[onlyKc ? kcScope : 'follow']; }

export async function kcFeedEnabled() {
  if (session.enabled == null) session.enabled = await ensureSession().catch(() => false);
  return session.enabled;
}

export function resetKcFeed() {
  stores.follow = fresh();
  stores.square = fresh();
}

function addPost(store, post, front) {
  if (!post || store.ids.has(post.id)) return;
  store.ids.add(post.id);
  if (front) store.posts.unshift(post); else store.posts.push(post);
}

/** 加载一页；返回是否有新内容 */
export async function loadKcPage(onlyKc) {
  const scope = onlyKc ? kcScope : 'follow';
  const store = stores[scope];
  if (store.loading || !store.hasMore || !(await kcFeedEnabled())) return false;
  store.loading = true;
  try {
    let page;
    if (scope === 'square') {
      page = await kcRequest('GET', '/posts/feed?scope=square&limit=20' + (store.before ? '&before_id=' + store.before : ''));
    } else {
      if (!session.follows) session.follows = (await myFollowings()).map((f) => f.oid);
      page = await kcRequest('POST', '/ccw/feed', { ccw_oids: session.follows, before_id: store.before, limit: 20 });
    }
    const list = Array.isArray(page) ? page : [];
    list.forEach((p) => addPost(store, p, false));
    // 广场第一页可能带置顶的旧动态：翻页按不置顶的最小 id 往下翻
    const ids = list.filter((p) => !p.pinned_at).map((p) => p.id);
    if (ids.length) store.before = Math.min(...ids);
    store.hasMore = list.length >= 20;
    if (stores[scope] !== store) return false; // 加载途中被刷新重置了
    return list.length > 0;
  } catch (_) {
    store.hasMore = false;
    return false;
  } finally {
    store.loading = false;
  }
}

const groupOf = (p) => ({ groupId: 'kc-' + p.id, kc: p, feed: { type: 'KC_POST', feedTime: Date.parse(kcIso(p.created_at)), ownerId: 'kc-' + p.author_id } });
const byTime = (a, b) => (b.feed.feedTime || 0) - (a.feed.feedTime || 0);

/**
 * 和 CCW 动态组混排。ccwHasMore 时按 CCW 已加载最旧的时间截断；
 * 返回 needMore：截断线以上的 KukeChat 动态可能还没拉完，要再拉一页。
 */
export function mergeWithCcw(ccwGroups, ccwHasMore, onlyKc) {
  const store = kcStore(onlyKc);
  const cutoff = ccwHasMore && ccwGroups.length ? Math.min(...ccwGroups.map((g) => g.feed.feedTime || 0)) : -Infinity;
  const kcGroups = store.posts.map(groupOf).filter((g) => onlyKc || g.feed.feedTime >= cutoff);
  const oldestKc = store.posts.length ? Math.min(...store.posts.map((p) => Date.parse(kcIso(p.created_at)))) : Infinity;
  const needMore = store.hasMore && (onlyKc || oldestKc >= cutoff);
  const merged = onlyKc ? kcGroups.sort(byTime) : ccwGroups.concat(kcGroups).sort(byTime);
  return { groups: merged, needMore };
}

function author(p) {
  const u = p.author || {};
  return { name: u.nickname || u.username || 'KukeChat 用户', avatar: u.avatar_url || u.ccw_avatar_url || '', oid: u.ccw_student_oid || '' };
}

function creationQuote(c) {
  return h('a', { class: 'ccwf-mini-quote', href: '/detail/' + c.oid, target: '_blank', rel: 'noreferrer' },
    h('span', { class: 'ccwf-mq-cover' }, c.cover_url ? h('img', { src: c.cover_url, alt: '', loading: 'lazy' }) : null),
    h('span', { class: 'ccwf-mq-text' },
      h('b', { text: c.title || '' }),
      h('span', { class: 'ccwf-mq-by' }, h('span', { text: (c.author_name || '') + ' 的作品' }))));
}

/** avatarEl / statsRow 由动态页传进来，免得两个模块互相引用 */
export function renderKcCard(g, { avatarEl, statsRow }) {
  const p = g.kc;
  const a = author(p);
  const iso = kcIso(p.created_at);
  const imgs = (p.image_urls || []).slice(0, 4);
  const repost = p.repost_of;
  return h('article', { class: 'ccwf-card ccwk-feed-card' },
    h('header', { class: 'ccwf-head' },
      avatarEl(a.avatar, a.oid, 40),
      h('div', { class: 'ccwf-who' },
        h('div', { class: 'ccwf-names' }, a.oid ? h('a', { class: 'ccwf-name', href: '/student/' + a.oid, target: '_blank', rel: 'noreferrer', text: a.name }) : h('span', { class: 'ccwf-name', text: a.name })),
        h('div', { class: 'ccwf-sub' },
          h('span', { text: p.visibility === 'friends' ? '仅好友可见' : p.visibility === 'private' ? '仅自己可见' : '发布了动态' }),
          h('span', { class: 'ccwf-dot', text: '·' }),
          h('time', { datetime: iso, title: fullTime(iso), text: relTime(iso) }))),
      h('span', { class: 'ccwf-chip ccwk-chip' }, h('img', { src: KC_ICON, alt: '' }), 'KukeChat')),
    h('div', { class: 'ccwk-feed-body' },
      p.content ? h('div', { class: 'ccwk-feed-text', text: p.content }) : null,
      imgs.length ? h('div', { class: 'ccwk-feed-imgs n' + imgs.length }, imgs.map((src) => h('a', { href: src, target: '_blank', rel: 'noreferrer' }, h('img', { src, alt: '', loading: 'lazy' })))) : null,
      repost ? h('div', { class: 'ccwk-feed-repost' }, h('b', { text: ((repost.author && (repost.author.nickname || repost.author.username)) || '') + '：' }), (repost.content || '').slice(0, 140)) : null,
      (p.ccw_creations || []).slice(0, 2).map(creationQuote),
      statsRow(null, p.like_count, p.comment_count)));
}

/**
 * 动态页顶上的输入框：发 KukeChat 动态。
 * 平时只有一行（头像 + 「有什么新鲜事？」）；点进去或写了字才展开：输入区跟着内容长高，下面一条工具栏 ——
 * 左边「公开 / 仅好友」，右边字数和「发布」。Ctrl / ⌘ + Enter 发布，Esc 收起（没写字时）。
 */
const MAX_POST = 2000;

export function renderComposer(onPosted) {
  const me = currentKukeUser();
  if (!me) return null;
  let visibility = 'public';
  let busy = false;
  const ta = h('textarea', { class: 'ccwk-cp-input', rows: '1', maxlength: String(MAX_POST), placeholder: '有什么新鲜事？' });
  const count = h('span', { class: 'ccwk-cp-count' });
  const note = h('span', { class: 'ccwk-cp-note' });
  const btn = h('button', { type: 'button', class: 'ccwk-cp-send', disabled: true }, '发布');
  const seg = h('div', { class: 'ccwk-cp-seg', role: 'radiogroup', 'aria-label': '谁可以看' },
    [['public', '公开'], ['friends', '仅好友']].map(([value, label]) => {
      const b = h('button', { type: 'button', role: 'radio', class: 'ccwk-cp-opt' + (value === visibility ? ' is-on' : ''), 'aria-checked': String(value === visibility) }, label);
      b.addEventListener('click', () => {
        visibility = value;
        seg.querySelectorAll('.ccwk-cp-opt').forEach((o) => { const on = o === b; o.classList.toggle('is-on', on); o.setAttribute('aria-checked', String(on)); });
        ta.focus();
      });
      return b;
    }));
  const card = h('div', { class: 'ccwf-card ccwk-cp' },
    h('div', { class: 'ccwk-cp-row' },
      h('img', { class: 'ccwk-cp-av', src: me.avatar_url || me.ccw_avatar_url || KC_ICON, alt: '' }),
      ta,
      h('img', { class: 'ccwk-cp-mark', src: KC_ICON, alt: '', title: '发到 KukeChat：好友和关注你的人能在这里看到' })),
    h('div', { class: 'ccwk-cp-bar' },
      seg,
      h('span', { class: 'ccwk-cp-right' }, note, count, btn)));

  const sync = () => {
    const n = ta.value.length;
    const text = ta.value.trim();
    btn.disabled = busy || !text;
    count.textContent = n > MAX_POST - 200 ? `${n} / ${MAX_POST}` : '';
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 320) + 'px';
    card.classList.toggle('is-open', document.activeElement === ta || Boolean(text) || busy);
  };
  const submit = async () => {
    const content = ta.value.trim();
    if (!content || busy) return;
    busy = true;
    note.textContent = '发布中…';
    sync();
    try {
      const post = await kcRequest('POST', '/posts', { content, visibility });
      ta.value = '';
      note.textContent = post && post.moderation_status === 'pending' ? '已发布，审核后别人可见' : '已发布';
      window.setTimeout(() => { note.textContent = ''; }, 3000);
      // 自己发的两份里都有（广场只收公开的）
      if (post && post.id) {
        addPost(stores.follow, post, true);
        if (post.visibility === 'public') addPost(stores.square, post, true);
      }
      onPosted();
    } catch (err) {
      note.textContent = (err && err.message) || '发布失败';
    } finally {
      busy = false;
      sync();
    }
  };
  ta.addEventListener('input', sync);
  ta.addEventListener('focus', sync);
  // 点工具栏里的按钮时输入框会先失焦：等一下再判断，免得工具栏闪一下就收起
  ta.addEventListener('blur', () => window.setTimeout(() => { if (!card.contains(document.activeElement)) sync(); }, 120));
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); }
    if (e.key === 'Escape' && !ta.value.trim()) ta.blur();
  });
  btn.addEventListener('click', submit);
  card.addEventListener('focusout', () => window.setTimeout(() => { if (!card.contains(document.activeElement)) sync(); }, 120));
  return card;
}

/** 右栏：此刻在玩 / 在创作的好友。card 是消息中心的侧栏卡片组件 */
export async function renderPlayingFriends(card) {
  if (!(await kcFeedEnabled())) return null;
  const [acts, friends] = await Promise.all([
    kcRequest('GET', '/ccw/activity/friends').catch(() => []),
    kcRequest('GET', '/friends').catch(() => []),
  ]);
  const byId = new Map((Array.isArray(friends) ? friends : []).map((f) => [f.user.id, f.user]));
  const rows = (Array.isArray(acts) ? acts : []).filter((x) => x.activity && byId.has(x.user_id));
  if (!rows.length) return null;
  return card('好友在玩', h('img', { class: 'ccwk-side-icon', src: KC_ICON, alt: '', title: '来自 KukeChat' }), h('div', { class: 'ccwk-pf-list' },
    rows.slice(0, 8).map((x) => {
      const u = byId.get(x.user_id);
      const href = activityHref(x.activity);
      return h(href ? 'a' : 'div', { class: 'ccwk-pf-row', href },
        h('span', { class: 'ccwk-pf-av' }, h('img', { src: u.avatar_url || u.ccw_avatar_url || KC_ICON, alt: '' }), h('i', { class: 'ccwk-cdot' })),
        h('span', { class: 'ccwk-pf-text' },
          h('b', { text: u.nickname || u.username }),
          h('span', { text: activityText(x.activity) })),
        x.activity.cover_url ? h('img', { class: 'ccwk-pf-cover', src: x.activity.cover_url, alt: '' }) : null);
    })));
}
