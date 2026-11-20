// 私信未读数：并进 CCW 顶栏信封原有的红点（不另加图标），消息中心导航的「私信」也用它。
// 进页面时拉一次会话列表求和，之后跟着实时事件增减；有人在别的设备上读了就重拉。
import { currentKukeUser, kcRequest, onLogin } from './client.js';
import { onRealtime } from './realtime.js';
import { setMutedConversations } from './toast.js';

let total = 0;
let byConversation = new Map(); // id → { unread, muted }
const listeners = new Set();
let refreshTimer = 0;

const isMuted = (c) => Boolean(c.my_do_not_disturb || c.my_message_setting === 'silent' || c.my_message_setting === 'ignore');

function publish() {
  let sum = 0;
  byConversation.forEach((c) => { if (!c.muted) sum += c.unread; });
  total = sum;
  listeners.forEach((fn) => fn(total));
}

export async function refreshUnread() {
  try {
    const list = await kcRequest('GET', '/conversations');
    if (!Array.isArray(list)) return;
    byConversation = new Map(list.map((c) => [c.id, {
      unread: Math.max(0, c.unread_count || 0), muted: isMuted(c),
      // 提醒卡片要用：私聊还是群、群名和头像
      type: c.type, title: c.display_title || c.title || '', avatar: c.avatar_url || null,
    }]));
    setMutedConversations(list.filter(isMuted).map((c) => c.id));
    publish();
  } catch (_) { /* 拉不到就保持原样 */ }
}

export function onUnread(fn) {
  listeners.add(fn);
  fn(total);
  return () => listeners.delete(fn);
}

/** 会话的类型、名字、头像（会话列表里有的才有）；没有返回 null */
export function conversationInfo(id) {
  return byConversation.get(id) || null;
}

export function unreadTotal() {
  return total;
}

/** 消息中心里打开了某个会话：本地先清掉它的未读，服务端的已读由界面包自己上报 */
export function markConversationSeen(id) {
  const c = byConversation.get(id);
  if (c && c.unread) { c.unread = 0; publish(); }
}

let activeConversation = null;
export function setActiveConversation(id) {
  activeConversation = id;
  if (id != null) markConversationSeen(id);
}

export function installUnread() {
  refreshUnread();
  onLogin(() => refreshUnread());
  onRealtime((e) => {
    if (e.type === 'message.created' && e.data) {
      const me = currentKukeUser();
      if (me && e.data.sender_id === me.id) return;
      const id = e.data.conversation_id;
      if (id === activeConversation) return;
      const c = byConversation.get(id);
      if (c) { c.unread += 1; publish(); } else refreshUnreadSoon();
    } else if (e.type === 'conversation.read' || e.type === 'conversation.updated' || e.type === 'connection.ready') {
      refreshUnreadSoon();
    }
  });
}

function refreshUnreadSoon() {
  window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(refreshUnread, 800);
}
