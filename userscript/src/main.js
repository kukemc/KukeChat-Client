import { applyRoute, parseRoute } from './core/router.js';
import { syncStickyTop } from './core/sticky.js';
import { isFeedPath } from './feed/index.js';
import { installPresence } from './kukechat/presence.js';
import { startRealtime } from './kukechat/realtime.js';
import { installUnread } from './kukechat/unread.js';
import { installBadge } from './kukechat/badge.js';
import { installToast } from './kukechat/toast.js';
import { injectStyle } from './core/style.js';
import { installPages } from './kukechat/pages.js';
import { installProfile } from './kukechat/profile.js';
import { installComments } from './kukechat/comments.js';
import { installWork } from './kukechat/work.js';
import { installWorkChat } from './kukechat/workChat.js';
import { installContentImageViewer } from './kukechat/imageViewer.js';

function installEverywhere() {
  // 这些在所有 CCW 页面都要有：实时连接、私信未读并进信封、新消息提醒
  injectStyle();
  startRealtime();
  installUnread();
  installBadge();
  installToast();
  // 往 CCW 原有页面里插的：主页名片、评论区、作品页
  installProfile();
  installComments();
  installWork();
  installWorkChat();
  installContentImageViewer();
  installPages();
}

function boot() {
  // 「正在玩」在所有页面都要跟着路由走；页面重写只接管消息中心和动态页
  installPresence();
  if (document.body) installEverywhere();
  else document.addEventListener('DOMContentLoaded', installEverywhere, { once: true });
  if (!parseRoute() && !isFeedPath()) return;
  if (!document.body) { document.addEventListener('DOMContentLoaded', () => applyRoute(false), { once: true }); return; }
  applyRoute(false);
}
boot();
window.addEventListener('resize', syncStickyTop);
// 页面自身路由先于脚本执行时，兜底再检查一次
window.addEventListener('load', () => { applyRoute(false); syncStickyTop(); });
