// 往 CCW 原有页面里插 KukeChat 的东西（主页名片、评论区、作品页）。
// CCW 是 React 单页应用，节点随时会被重画：每次 DOM 变化（按帧节流）把当前页面的注入函数再跑一遍，
// 注入函数自己保证幂等（插过就不再插，被 React 冲掉了就补回来）。
import { kcIso } from './client.js';

const injectors = [];
let frame = 0;

export function registerInjector(match, run) {
  injectors.push({ match, run });
}

function tick() {
  frame = 0;
  const path = location.pathname;
  injectors.forEach(({ match, run }) => {
    const m = path.match(match);
    if (!m) return;
    try { run(m); } catch (_) { /* 一个页面出错不影响别的 */ }
  });
}

export function schedulePages() {
  if (!frame) frame = requestAnimationFrame(tick);
}

export function installPages() {
  new MutationObserver(schedulePages).observe(document.body, { childList: true, subtree: true });
  schedulePages();
}

/** 每个 key 只请求一次，结果缓存；失败的过一会儿可以重试 */
export function memo(fn, ttl = 60000) {
  const cache = new Map();
  return (key) => {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < ttl) return hit.value;
    const value = Promise.resolve().then(() => fn(key)).catch((err) => { cache.delete(key); throw err; });
    cache.set(key, { at: Date.now(), value });
    return value;
  };
}

export const GIFT_EMOJI = { flower: '🌸', lollipop: '🍭', cake: '🎂', trophy: '🏆', rocket: '🚀', castle: '🏰', star: '⭐', heart: '❤️', balloon: '🎈', crown: '👑', cat: '🐱', icecream: '🍦' };

export function activityText(a) {
  if (!a) return '';
  const mins = Math.max(0, Math.round((Date.now() - Date.parse(kcIso(a.started_at))) / 60000));
  const dur = mins < 1 ? '刚刚开始' : mins < 60 ? mins + ' 分钟' : Math.floor(mins / 60) + ' 小时';
  return (a.kind === 'create' ? '正在创作 ' : '正在玩 ') + '「' + a.title + '」 · ' + dur;
}

export function activityHref(a) {
  return a && a.ccw_oid ? '/detail/' + a.ccw_oid : null;
}
