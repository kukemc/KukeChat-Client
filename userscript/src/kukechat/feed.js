// 动态页里并进来的 KukeChat 动态（关注的人 / 所有人），以及发动态的输入框、右栏「好友在玩」。
//
// 混排规则：KukeChat 动态包装成和 CCW 动态组同样的结构，按时间混在一起。CCW 那边还有没加载的更早动态时，
// 只放不早于已加载最旧一条的 KukeChat 动态 —— 否则往下翻时 CCW 的旧动态会插到 KukeChat 动态上面，时间线错乱。
import { h } from '../core/dom.js';
import { KC_ICON, icon } from '../core/icons.js';
import { compressForUpload } from './imageCompress.js';
import { fullTime, relTime } from '../core/time.js';
import { currentKukeUser, ensureSession, kcIso, kcRequest } from './client.js';
import { myFollowings } from './ccwGraph.js';
import { activityHref, activityText } from './pages.js';

// 两份数据：follow = 好友 + 我在共创世界关注的人 + 自己（/ccw/feed），square = 所有人的公开动态（KukeChat 的广场，/posts/feed?scope=square）。
// 用哪份由页面上的切换决定（默认所有人，记在 localStorage），「全部动态」的混排和「KukeChat」分类都跟着它。
const fresh = () => ({ posts: [], ids: new Set(), before: null, hasMore: true, loading: false });
const stores = { follow: fresh(), square: fresh() };
const session = { enabled: null, follows: null };
const SCOPE_KEY = 'kukechat-ccw:feed-scope';
let kcScope = (() => { try { return localStorage.getItem(SCOPE_KEY) === 'follow' ? 'follow' : 'square'; } catch (_) { return 'square'; } })();

export function getKcScope() { return kcScope; }
export function setKcScope(scope) {
  if (scope !== 'follow' && scope !== 'square') return;
  kcScope = scope;
  try { localStorage.setItem(SCOPE_KEY, scope); } catch (_) { /* 存不了就只管这次 */ }
}
export function kcStore() { return stores[kcScope]; }

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
export async function loadKcPage() {
  const scope = kcScope;
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
  const store = kcStore();
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
      p.content ? postText(p.content) : null,
      imgs.length ? h('div', { class: 'ccwk-feed-imgs n' + imgs.length }, imgs.map((src) => h('a', { href: src, target: '_blank', rel: 'noreferrer' }, h('img', { src, alt: '', loading: 'lazy' })))) : null,
      repost ? h('div', { class: 'ccwk-feed-repost' }, h('b', { text: ((repost.author && (repost.author.nickname || repost.author.username)) || '') + '：' }), (repost.content || '').slice(0, 140)) : null,
      (p.ccw_creations || []).slice(0, 2).map(creationQuote),
      statsRow(null, p.like_count, p.comment_count)));
}

/**
 * 动态页顶上的输入框：发 KukeChat 动态。
 * 平时只有一行（头像 + 「有什么新鲜事？」）；点进去或写了字、加了图才展开：输入区跟着内容长高，下面一条工具栏 ——
 * 左边图片、话题、「公开 / 仅好友」，右边字数和「发布」。Ctrl / ⌘ + Enter 发布，Esc 收起（没写字时）。
 * 图片：点按钮选、直接粘贴、拖进来都行，最多 9 张，传之前在本地压缩（imageCompress.js）。
 * 话题：正文里的 #话题 后端会自己识别；输入 # 时弹出热门 / 搜索到的话题，选一个补全。
 */
const MAX_POST = 2000;
const MAX_IMAGES = 9;

export function renderComposer(onPosted) {
  const me = currentKukeUser();
  if (!me) return null;
  let visibility = 'public';
  let busy = false;
  const images = []; // { id, preview, url, error, uploading }
  let nextId = 1;

  const ta = h('textarea', { class: 'ccwk-cp-input', rows: '1', maxlength: String(MAX_POST), placeholder: '有什么新鲜事？' });
  const count = h('span', { class: 'ccwk-cp-count' });
  const note = h('span', { class: 'ccwk-cp-note' });
  const btn = h('button', { type: 'button', class: 'ccwk-cp-send', disabled: true }, '发布');
  const thumbs = h('div', { class: 'ccwk-cp-imgs' });
  const picker = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true });
  const imgBtn = h('button', { type: 'button', class: 'ccwk-cp-tool', title: '图片（也可以直接粘贴、拖进来）' }, icon('image', 16));
  const tagBtn = h('button', { type: 'button', class: 'ccwk-cp-tool', title: '话题' }, icon('hash', 16));
  const suggest = h('div', { class: 'ccwk-cp-suggest', role: 'listbox' });
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
      h('div', { class: 'ccwk-cp-body' }, ta, suggest),
      h('img', { class: 'ccwk-cp-mark', src: KC_ICON, alt: '', title: '发到 KukeChat：好友和关注你的人能在这里看到' })),
    thumbs,
    h('div', { class: 'ccwk-cp-bar' },
      h('span', { class: 'ccwk-cp-left' }, imgBtn, tagBtn, seg, picker),
      h('span', { class: 'ccwk-cp-right' }, note, count, btn)));

  const uploading = () => images.some((x) => x.uploading);
  const sync = () => {
    const n = ta.value.length;
    const ready = images.filter((x) => x.url).length;
    btn.disabled = busy || uploading() || (!ta.value.trim() && !ready);
    count.textContent = n > MAX_POST - 200 ? `${n} / ${MAX_POST}` : '';
    imgBtn.disabled = images.length >= MAX_IMAGES;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 320) + 'px';
    card.classList.toggle('is-open', card.contains(document.activeElement) || Boolean(ta.value.trim()) || images.length > 0 || busy);
  };

  /* ---------- 图片 ---------- */
  const renderThumbs = () => {
    thumbs.replaceChildren(...images.map((x) => {
      const rm = h('button', { type: 'button', class: 'ccwk-cp-rm', title: '移除' }, icon('close', 12));
      rm.addEventListener('click', () => {
        const i = images.indexOf(x);
        if (i >= 0) images.splice(i, 1);
        URL.revokeObjectURL(x.preview);
        renderThumbs();
        sync();
      });
      return h('div', { class: 'ccwk-cp-img' + (x.uploading ? ' is-busy' : '') + (x.error ? ' is-error' : ''), title: x.error || '' },
        h('img', { src: x.preview, alt: '' }),
        x.uploading ? h('i', { class: 'ccwk-cp-spin' }) : null,
        x.error ? h('span', { class: 'ccwk-cp-err', text: '失败' }) : null,
        rm);
    }));
    thumbs.classList.toggle('has-images', images.length > 0);
  };
  const addFiles = (files) => {
    const list = [...files].filter((f) => (f.type || '').startsWith('image/'));
    if (!list.length) return;
    const room = MAX_IMAGES - images.length;
    if (room <= 0) { note.textContent = `最多 ${MAX_IMAGES} 张图`; return; }
    if (list.length > room) note.textContent = `最多 ${MAX_IMAGES} 张图，多出来的没加`;
    list.slice(0, room).forEach((file) => {
      const x = { id: nextId++, preview: URL.createObjectURL(file), url: null, error: null, uploading: true };
      images.push(x);
      (async () => {
        try {
          const blob = await compressForUpload(file);
          const form = new FormData();
          form.append('file', blob, blob.name || 'image.jpg');
          const r = await kcRequest('POST', '/uploads/post-image', form);
          x.url = r && r.url;
          if (!x.url) throw new Error('上传失败');
        } catch (err) {
          x.error = (err && err.message) || '上传失败';
        } finally {
          x.uploading = false;
          renderThumbs();
          sync();
        }
      })();
    });
    renderThumbs();
    sync();
  };
  imgBtn.addEventListener('click', () => picker.click());
  picker.addEventListener('change', () => { addFiles(picker.files || []); picker.value = ''; });
  ta.addEventListener('paste', (e) => {
    const files = e.clipboardData && e.clipboardData.files;
    if (files && files.length && [...files].some((f) => (f.type || '').startsWith('image/'))) { e.preventDefault(); addFiles(files); }
  });
  card.addEventListener('dragover', (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); card.classList.add('is-drop'); } });
  card.addEventListener('dragleave', (e) => { if (!card.contains(e.relatedTarget)) card.classList.remove('is-drop'); });
  card.addEventListener('drop', (e) => {
    if (!e.dataTransfer || !e.dataTransfer.files.length) return;
    e.preventDefault();
    card.classList.remove('is-drop');
    addFiles(e.dataTransfer.files);
    ta.focus();
  });

  /* ---------- 话题 ---------- */
  let topics = [];
  let active = 0;
  let query = null; // 光标前正在输入的 #xxx 里的 xxx；null = 没在输话题
  let topicTimer = 0;
  let trending = null;
  const closeSuggest = () => { query = null; topics = []; suggest.replaceChildren(); suggest.classList.remove('is-open'); };
  const renderSuggest = () => {
    if (query == null || !topics.length) { suggest.replaceChildren(); suggest.classList.remove('is-open'); return; }
    suggest.replaceChildren(
      h('div', { class: 'ccwk-cp-sg-title', text: query ? '话题' : '热门话题' }),
      ...topics.map((t, i) => {
        const row = h('button', { type: 'button', role: 'option', class: 'ccwk-cp-sg' + (i === active ? ' is-on' : '') },
          h('b', { text: '#' + t.name }), t.post_count ? h('span', { text: t.post_count + ' 条动态' }) : null);
        row.addEventListener('mousedown', (e) => { e.preventDefault(); pickTopic(t.name); });
        return row;
      }));
    suggest.classList.add('is-open');
  };
  const pickTopic = (name) => {
    const caret = ta.selectionStart;
    const before = ta.value.slice(0, caret).replace(/#[^\s#]*$/, '#' + name + ' ');
    ta.value = before + ta.value.slice(caret);
    ta.selectionStart = ta.selectionEnd = before.length;
    closeSuggest();
    sync();
    ta.focus();
  };
  const lookupTopics = () => {
    const m = ta.value.slice(0, ta.selectionStart).match(/(^|\s)#([^\s#]{0,40})$/);
    if (!m) { closeSuggest(); return; }
    query = m[2];
    active = 0;
    window.clearTimeout(topicTimer);
    topicTimer = window.setTimeout(async () => {
      const q = query;
      try {
        let list;
        if (!q) {
          if (!trending) trending = await kcRequest('GET', '/posts/topics/trending?limit=5');
          list = trending;
        } else {
          list = await kcRequest('GET', '/posts/topics/search?limit=6&q=' + encodeURIComponent(q));
        }
        if (q !== query) return;
        topics = (Array.isArray(list) ? list : []).filter((t) => t && t.name);
        // 搜不到也给一个「用这个新话题」
        if (q && !topics.some((t) => t.name === q)) topics.push({ name: q, post_count: 0 });
        renderSuggest();
      } catch (_) { /* 话题建议拿不到不影响发动态 */ }
    }, query ? 180 : 0);
  };
  tagBtn.addEventListener('click', () => {
    const caret = ta.selectionStart ?? ta.value.length;
    const pre = ta.value.slice(0, caret);
    const insert = (pre && !/\s$/.test(pre) ? ' ' : '') + '#';
    ta.value = pre + insert + ta.value.slice(caret);
    ta.focus();
    ta.selectionStart = ta.selectionEnd = caret + insert.length;
    sync();
    lookupTopics();
  });

  /* ---------- 发布 ---------- */
  const submit = async () => {
    const content = ta.value.trim();
    const urls = images.filter((x) => x.url).map((x) => x.url);
    if ((!content && !urls.length) || busy || uploading()) return;
    busy = true;
    note.textContent = '发布中…';
    sync();
    try {
      const post = await kcRequest('POST', '/posts', { content, visibility, image_urls: urls });
      ta.value = '';
      images.forEach((x) => URL.revokeObjectURL(x.preview));
      images.length = 0;
      renderThumbs();
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
  ta.addEventListener('input', () => { sync(); lookupTopics(); });
  ta.addEventListener('click', lookupTopics);
  ta.addEventListener('focus', sync);
  ta.addEventListener('keydown', (e) => {
    if (suggest.classList.contains('is-open')) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        active = (active + (e.key === 'ArrowDown' ? 1 : topics.length - 1)) % topics.length;
        renderSuggest();
        return;
      }
      if ((e.key === 'Enter' && !e.ctrlKey && !e.metaKey) || e.key === 'Tab') { e.preventDefault(); pickTopic(topics[active].name); return; }
      if (e.key === 'Escape') { e.preventDefault(); closeSuggest(); return; }
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); }
    if (e.key === 'Escape' && !ta.value.trim() && !images.length) ta.blur();
  });
  btn.addEventListener('click', submit);
  // 点工具栏里的按钮时输入框会先失焦：等一下再判断，免得工具栏闪一下就收起
  card.addEventListener('focusout', () => window.setTimeout(() => { if (!card.contains(document.activeElement)) { closeSuggest(); sync(); } }, 150));
  return card;
}

/** 动态正文：#话题 高亮，其余原样（textContent，不解析 HTML） */
export function postText(content) {
  const el = h('div', { class: 'ccwk-feed-text' });
  const re = /(^|[^\w#])#([\w\u4e00-\u9fff][\w\u4e00-\u9fff-]{0,39})/g;
  let last = 0;
  let m;
  while ((m = re.exec(content))) {
    const start = m.index + m[1].length;
    if (start > last) el.appendChild(document.createTextNode(content.slice(last, start)));
    el.appendChild(h('span', { class: 'ccwk-topic', text: '#' + m[2] }));
    last = start + 1 + m[2].length;
  }
  if (last < content.length) el.appendChild(document.createTextNode(content.slice(last)));
  return el;
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
