// 作品页 /detail/<oid>：右侧信息栏加一张卡片 —— 作品群（作者在 KukeChat 开了游戏模式并绑定这个作品的公开群）
// 和此刻在玩的好友；「邀请好友一起玩」把作品链接私聊发给选中的好友。没登录 KukeChat 时不显示。
import { h } from '../core/dom.js';
import { KC_ICON } from '../core/icons.js';
import { ensureSession, kcRequest } from './client.js';
import { memo, registerInjector } from './pages.js';

const loadWork = memo(async (oid) => {
  if (!(await ensureSession())) return null;
  return kcRequest('GET', '/ccw/works/' + oid);
}, 30000);

const loadFriends = memo(() => kcRequest('GET', '/friends').catch(() => []), 120000);

async function join(group, btn) {
  btn.disabled = true;
  btn.textContent = '加入中…';
  try {
    await kcRequest('POST', `/conversations/${group.conversation_id}/join`);
    group.is_member = true;
    location.assign('/notice/chat?c=' + group.conversation_id);
  } catch (err) {
    btn.disabled = false;
    btn.textContent = (err && err.message) || '加入失败';
  }
}

function invitePanel(oid, anchor) {
  const old = document.querySelector('.ccwk-invite');
  if (old) { old.remove(); return; }
  const title = (document.title || '').replace(/\s*[-|_].*$/, '').trim() || '这个作品';
  const list = h('div', { class: 'ccwk-invite-list' }, h('div', { class: 'ccwk-muted', text: '加载好友…' }));
  const panel = h('div', { class: 'ccwk-invite' },
    h('div', { class: 'ccwk-sub-title', text: '邀请好友一起玩' }),
    list);
  anchor.after(panel);
  loadFriends('all').then((friends) => {
    const rows = (Array.isArray(friends) ? friends : []).map((f) => f.friend || f.user || f).filter((u) => u && u.id);
    if (!rows.length) { list.replaceChildren(h('div', { class: 'ccwk-muted', text: '还没有 KukeChat 好友' })); return; }
    list.replaceChildren(...rows.slice(0, 30).map((u) => {
      const btn = h('button', { type: 'button', class: 'ccwk-btn is-sm' }, '邀请');
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          const conv = await kcRequest('POST', '/conversations/direct', { user_id: u.id, temporary: true });
          await kcRequest('POST', `/conversations/${conv.id}/messages`, { type: 'text', content: `一起来玩「${title}」吧 https://www.ccw.site/detail/${oid}` });
          btn.textContent = '已邀请';
        } catch (err) {
          btn.disabled = false;
          btn.textContent = '失败';
          btn.title = (err && err.message) || '';
        }
      });
      return h('div', { class: 'ccwk-invite-row' },
        h('img', { src: u.avatar_url || '', alt: '' }),
        h('span', { text: u.nickname || u.username }),
        btn);
    }));
  });
}

function renderWork(info, className, oid) {
  const g = info.group;
  const playing = info.playing || [];
  const joinBtn = g && !g.is_member ? h('button', { type: 'button', class: 'ccwk-btn is-primary' }, '加入群聊') : null;
  if (joinBtn) joinBtn.addEventListener('click', () => join(g, joinBtn));
  const inviteBtn = h('button', { type: 'button', class: 'ccwk-btn' }, '邀请好友一起玩');
  const card = h('div', { class: className + ' ccwk-card ccwk-work' },
    h('div', { class: 'ccwk-card-head' },
      h('span', { class: 'ccwk-brand' }, h('img', { src: KC_ICON, alt: '' }), g ? '作品群' : 'KukeChat'),
      g ? h('span', { class: 'ccwk-muted', text: g.member_count + ' 名成员' }) : null),
    g ? h('div', { class: 'ccwk-who' },
      h('img', { class: 'ccwk-avatar is-square', src: g.avatar_url || KC_ICON, alt: '' }),
      h('div', { class: 'ccwk-who-text' },
        h('div', { class: 'ccwk-name', text: g.title }),
        h('div', { class: 'ccwk-muted', text: g.is_member ? '你已在群里' : '公开群，可直接加入' }))) : null,
    playing.length ? h('div', { class: 'ccwk-playing' },
      h('span', { class: 'ccwk-faces' }, playing.slice(0, 4).map((p) => h('img', { src: p.avatar_url || '', alt: '', title: p.nickname || '' }))),
      h('span', null, h('b', { text: playing.length === 1 ? (playing[0].nickname || '1 位好友') : playing.length + ' 位好友' }), ' 正在玩')) : null,
    h('div', { class: 'ccwk-actions' },
      joinBtn,
      g && g.is_member ? h('a', { class: 'ccwk-btn is-primary', href: '/notice/chat?c=' + g.conversation_id }, '进入群聊') : null,
      inviteBtn));
  inviteBtn.addEventListener('click', () => invitePanel(oid, card.querySelector('.ccwk-actions')));
  card.dataset.oid = oid;
  return card;
}

function inject(m) {
  const oid = m[1].toLowerCase();
  const panel = document.querySelector('[class*="baseInfoPanel-"] [class*="content-"]');
  const tpl = panel && panel.querySelector('[class*="card-"]');
  if (!tpl) return;
  document.querySelectorAll('.ccwk-work').forEach((n) => { if (n.dataset.oid !== oid) n.remove(); });
  if (panel.querySelector('.ccwk-work')) return;
  loadWork(oid).then((info) => {
    if (!info || !location.pathname.toLowerCase().includes(oid) || panel.querySelector('.ccwk-work') || !tpl.isConnected) return;
    const cls = tpl.className.split(/\s+/).filter((c) => /^card-/.test(c)).join(' ');
    tpl.after(renderWork(info, cls, oid));
  }).catch(() => {});
}

export function installWork() {
  registerInjector(/^\/detail\/([0-9a-f]{24})\/?/i, inject);
}
