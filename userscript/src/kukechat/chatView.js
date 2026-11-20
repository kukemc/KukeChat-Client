// 消息中心里的「私信 / 好友」：中栏和右栏让给停靠进来的 KukeChat（/notice/chat、/notice/friends）。
// 地址 /notice/chat?c=<会话 id> 直接打开那个会话（新消息提醒里点「打开」就到这里）；
// ?u=<KukeChat 用户 id> 和这个人私聊（主页名片、评论区的「私信」），不是好友时是临时会话。
import { h } from '../core/dom.js';
import { dockInto, withEmbed } from './embed.js';
import { setActiveConversation } from './unread.js';
import { setViewingConversation } from './toast.js';

let slot = null;
let undock = null;
let currentView = null;

function ensureSlot() {
  const layout = document.querySelector('#ccwn-root .ccwn-layout');
  if (!layout) return null;
  if (!slot || !slot.isConnected) {
    slot = h('section', { class: 'ccwk-slot' },
      h('div', { class: 'ccwk-loading', text: '正在打开 KukeChat…' }));
    layout.appendChild(slot);
  }
  return slot;
}

export async function enterChat(view) {
  // 私信视图锁住了页面滚动（styles/app.css html.ccwk-chat）：先回到顶，免得锁在半截
  window.scrollTo(0, 0);
  document.documentElement.classList.add('ccwk-chat');
  setViewingConversation('*');
  const el = ensureSlot();
  if (!el) return;
  const q = new URLSearchParams(location.search);
  const conversationId = Number(q.get('c')) || null;
  const userId = Number(q.get('u')) || null;
  try {
    if (!undock) undock = await dockInto(el);
    el.classList.add('is-ready');
    await withEmbed((embed) => {
      embed.setView(view === 'FRIENDS' ? 'contacts' : 'chat');
      if (conversationId) {
        embed.openConversation(conversationId);
        setActiveConversation(conversationId);
      } else if (userId) {
        return embed.openDirect(userId);
      }
      return null;
    });
    currentView = view;
  } catch (err) {
    el.replaceChildren(h('div', { class: 'ccwk-loading is-error', text: (err && err.message) || 'KukeChat 加载失败，请刷新重试' }));
  }
}

export function exitChat() {
  if (!currentView && !undock) return;
  document.documentElement.classList.remove('ccwk-chat');
  setViewingConversation(null);
  currentView = null;
  setActiveConversation(null);
  if (undock) { undock(); undock = null; }
  if (slot) { slot.remove(); slot = null; }
}

export const CHAT_VIEWS = ['CHAT', 'FRIENDS'];
