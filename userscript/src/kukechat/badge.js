// 顶栏信封的红点 = CCW 自己的未读 + KukeChat 私信未读。不另加图标（用户明确不要）。
// 原生红点藏起来，换成我们算好的合计；CCW 的数字从原生红点里读，原生数字变了跟着变。
import { h } from '../core/dom.js';
import { onUnread } from './unread.js';

let kc = 0;
let ours = null;

function envelope() {
  return document.querySelector('#root header [class*="notice-"]');
}

function nativeCount(env) {
  const badge = env.querySelector('[class*="totalNotice-"]');
  // 消息中心标完已读会把原生红点藏起来但不清文字（notice/view.js syncHeaderBadge）
  if (!badge || badge.style.display === 'none') return 0;
  const t = (badge.textContent || '').trim();
  return parseInt(t, 10) || 0;
}

function render() {
  const env = envelope();
  if (!env) return;
  const total = nativeCount(env) + kc;
  if (!ours || !env.contains(ours)) {
    ours = h('span', { class: 'ccwk-env-badge' });
    if (getComputedStyle(env).position === 'static') env.style.position = 'relative';
    env.appendChild(ours);
  }
  // 只在有私信未读时才接管；没有就让原生红点照常显示
  document.documentElement.classList.toggle('ccwk-badge', kc > 0);
  // 自己的改动也会触发上面的 MutationObserver：值没变就别写，免得循环
  const text = total > 99 ? '99+' : String(total);
  const display = kc > 0 && total > 0 ? '' : 'none';
  if (ours.textContent !== text) ours.textContent = text;
  if (ours.style.display !== display) ours.style.display = display;
}

export function installBadge() {
  onUnread((n) => { kc = n; render(); });
  // 顶栏是 React 渲染的：等它出现，之后原生数字变化时重算
  const watch = () => {
    const env = envelope();
    if (!env) { window.setTimeout(watch, 500); return; }
    new MutationObserver(() => render()).observe(env, { subtree: true, childList: true, characterData: true });
    render();
  };
  watch();
}
