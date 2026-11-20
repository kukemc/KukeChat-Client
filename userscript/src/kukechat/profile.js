// 个人主页 /student/<oid>：右栏顶上一张 KukeChat 名片（在线、正在玩、共同好友和群、礼物、最近动态、加好友 / 私信），
// 关注按钮旁一个「加好友 / 私信」。对方没有 KukeChat 或关了「允许被找到」时什么都不显示。
import { h } from '../core/dom.js';
import { KC_ICON } from '../core/icons.js';
import { relTime } from '../core/time.js';
import { ensureSession, kcIso, kcRequest } from './client.js';
import { GIFT_EMOJI, activityHref, activityText, memo, registerInjector } from './pages.js';

const loadCard = memo(async (oid) => {
  if (!(await ensureSession())) return null;
  const card = await kcRequest('GET', '/ccw/users/' + oid);
  if (!card || !card.has_account || !card.user) return card;
  const id = card.user.id;
  const [gifts, posts] = await Promise.all([
    kcRequest('GET', `/users/${id}/gifts`).catch(() => null),
    kcRequest('GET', `/posts/users/${id}?limit=3`).catch(() => []),
  ]);
  return { ...card, gifts, posts: Array.isArray(posts) ? posts : [] };
}, 30000);

const RELATION = { friend: '好友', outgoing: '已发送好友申请', incoming: '对方想加你为好友', self: '这是你' };

function dmHref(userId) { return '/notice/chat?u=' + userId; }

async function addFriend(card, btn) {
  btn.disabled = true;
  btn.textContent = '发送中…';
  try {
    await kcRequest('POST', '/friends/requests', { receiver_id: card.user.id });
    card.friendship = 'outgoing';
    btn.textContent = '已发送申请';
    document.querySelectorAll('.ccwk-pill').forEach((p) => { p.textContent = '已发送申请'; p.disabled = true; });
  } catch (err) {
    btn.disabled = false;
    btn.textContent = (err && err.message) || '发送失败';
  }
}

function actions(card) {
  const f = card.friendship;
  if (f === 'self') return null;
  if (f === 'friend') return [h('a', { class: 'ccwk-btn is-primary', href: dmHref(card.user.id) }, '发私信')];
  if (f === 'incoming') return [h('a', { class: 'ccwk-btn is-primary', href: '/notice/friends' }, '去通过申请')];
  if (f === 'outgoing') return [h('button', { type: 'button', class: 'ccwk-btn', disabled: true }, '已发送申请')];
  const add = h('button', { type: 'button', class: 'ccwk-btn is-primary' }, '加好友');
  add.addEventListener('click', () => addFriend(card, add));
  return [add, h('a', { class: 'ccwk-btn', href: dmHref(card.user.id) }, '私信')];
}

function renderCard(card, className) {
  const u = card.user;
  const a = card.activity;
  const lv = u.account_level ? h('span', { class: 'ccwk-lv', text: 'Lv.' + u.account_level }) : null;
  const facts = [];
  if (card.mutual_friend_count) facts.push(card.mutual_friend_count + ' 位共同好友');
  if (card.mutual_group_count) facts.push(card.mutual_group_count + ' 个共同群聊');
  const g = card.gifts;
  const giftRow = g && g.summary && g.summary.length
    ? h('div', { class: 'ccwk-gifts', title: '收到的礼物' },
      g.summary.slice(0, 6).map((e) => h('span', { class: 'ccwk-gift' },
        h('i', { text: (e.gift && GIFT_EMOJI[e.gift.icon]) || '🎁' }),
        h('span', { text: '×' + e.count }))),
      h('span', { class: 'ccwk-muted', text: '魅力 ' + (g.charm || 0) }))
    : null;
  const posts = card.posts && card.posts.length
    ? h('div', { class: 'ccwk-posts' },
      h('div', { class: 'ccwk-sub-title', text: '最近动态' }),
      card.posts.map((p) => h('div', { class: 'ccwk-post' },
        h('span', { class: 'ccwk-post-text', text: (p.content || (p.image_urls && p.image_urls.length ? '[图片]' : '')).replace(/\s+/g, ' ') }),
        h('span', { class: 'ccwk-muted', text: relTime(kcIso(p.created_at)) }))))
    : null;
  const href = activityHref(a);
  return h('div', { class: className + ' ccwk-card' },
    h('div', { class: 'ccwk-card-head' },
      h('span', { class: 'ccwk-brand' }, h('img', { src: KC_ICON, alt: '' }), 'KukeChat'),
      h('span', { class: 'ccwk-state' + (card.online ? ' is-online' : ''), text: card.online ? '在线' : '离线' })),
    h('div', { class: 'ccwk-who' },
      h('img', { class: 'ccwk-avatar', src: u.avatar_url || u.ccw_avatar_url || '', alt: '' }),
      h('div', { class: 'ccwk-who-text' },
        h('div', { class: 'ccwk-name' }, h('span', { text: u.nickname || u.username }), lv),
        h('div', { class: 'ccwk-muted', text: '@' + u.username + (RELATION[card.friendship] ? ' · ' + RELATION[card.friendship] : '') }))),
    a ? h(href ? 'a' : 'div', { class: 'ccwk-activity', href }, h('i', { class: 'ccwk-dot' }), activityText(a)) : null,
    facts.length ? h('div', { class: 'ccwk-facts', text: facts.join(' · ') }) : null,
    giftRow,
    posts,
    (() => { const btns = actions(card); return btns ? h('div', { class: 'ccwk-actions' }, btns) : null; })());
}

function pill(card, followBtn) {
  const f = card.friendship;
  if (f === 'self') return null;
  const label = f === 'friend' ? '私信' : f === 'outgoing' ? '已发送申请' : f === 'incoming' ? '通过申请' : '加好友';
  const el = h(f === 'none' ? 'button' : 'a', {
    class: 'ccwk-pill',
    type: f === 'none' ? 'button' : null,
    href: f === 'friend' ? dmHref(card.user.id) : f === 'incoming' ? '/notice/friends' : null,
    disabled: f === 'outgoing',
    style: followBtn ? `height:${followBtn.offsetHeight || 36}px` : null,
  }, h('img', { src: KC_ICON, alt: '' }), label);
  if (f === 'none') el.addEventListener('click', () => addFriend(card, el));
  return el;
}

function inject(m) {
  const oid = m[1].toLowerCase();
  const doc = document.querySelector('[class*="selfDoc-"]');
  const tpl = doc && doc.querySelector('[class*="selfInfo-"]');
  if (!tpl) return;
  // 换了主页：清掉上一个人的
  document.querySelectorAll('.ccwk-card, .ccwk-pill').forEach((n) => { if (n.dataset.oid !== oid) n.remove(); });
  const box = document.querySelector('[class*="settingBox-"]');
  const followBtn = box && box.querySelector('button');
  const needCard = !doc.querySelector('.ccwk-card');
  const needPill = followBtn && !box.querySelector('.ccwk-pill');
  if (!needCard && !needPill) return;
  loadCard(oid).then((card) => {
    if (!card || !card.has_account || !card.user) return;
    if (!location.pathname.toLowerCase().includes(oid)) return;
    if (needCard && doc.isConnected && !doc.querySelector('.ccwk-card')) {
      const el = renderCard(card, tpl.className.split(/\s+/).filter((c) => /^selfInfo-/.test(c)).join(' '));
      el.dataset.oid = oid;
      doc.insertBefore(el, doc.firstChild);
    }
    if (needPill && followBtn.isConnected && !box.querySelector('.ccwk-pill')) {
      const p = pill(card, followBtn);
      if (p) { p.dataset.oid = oid; box.style.width = 'auto'; followBtn.after(p); }
    }
  }).catch(() => {});
}

export function installProfile() {
  registerInjector(/^\/student\/([0-9a-f]{24})\/?/i, inject);
}
