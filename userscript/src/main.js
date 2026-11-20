import { applyRoute, parseRoute } from './core/router.js';
import { syncStickyTop } from './core/sticky.js';
import { isFeedPath } from './feed/index.js';
import { installPresence } from './kukechat/presence.js';

function boot() {
  // 「正在玩」在所有页面都要跟着路由走；页面重写只接管消息中心和动态页
  installPresence();
  if (!parseRoute() && !isFeedPath()) return;
  if (!document.body) { document.addEventListener('DOMContentLoaded', () => applyRoute(false), { once: true }); return; }
  applyRoute(false);
}
boot();
window.addEventListener('resize', syncStickyTop);
// 页面自身路由先于脚本执行时，兜底再检查一次
window.addEventListener('load', () => { applyRoute(false); syncStickyTop(); });
