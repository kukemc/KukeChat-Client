// 脚本自己的几个开关（记在 localStorage）：毛玻璃效果、新消息提示音。默认都开。
// 设置卡片放在消息中心和动态页的左栏，两处共用。
import { h } from './dom.js';

const KEYS = { blur: 'kukechat-ccw:blur', sound: 'kukechat-ccw:sound' };
const listeners = new Set();

export function pref(name) {
  try { return localStorage.getItem(KEYS[name]) !== 'off'; } catch (_) { return true; }
}
export function setPref(name, on) {
  try { localStorage.setItem(KEYS[name], on ? 'on' : 'off'); } catch (_) { /* 存不了就只管这次 */ }
  applyPrefs();
  listeners.forEach((fn) => fn(name, on));
}
export function onPref(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/** 关掉毛玻璃：卡片不再每帧模糊背后的内容，滚动时省很多绘制（机器差、卡片多时明显） */
export function applyPrefs() {
  document.documentElement.classList.toggle('ccwn-noblur', !pref('blur'));
}

/** 一行开关：标题 + 小字说明 + 拨动开关 */
export function prefToggle(name, title, desc) {
  const sw = h('button', { type: 'button', role: 'switch', class: 'ccwn-switch' });
  const paint = () => { const on = pref(name); sw.classList.toggle('is-on', on); sw.setAttribute('aria-checked', String(on)); };
  sw.setAttribute('aria-label', title);
  sw.addEventListener('click', (e) => { e.stopPropagation(); setPref(name, !pref(name)); });
  onPref((n) => { if (n === name) paint(); });
  paint();
  return h('div', { class: 'ccwn-pref' }, h('div', { class: 'ccwn-pref-text' }, h('b', { text: title }), desc ? h('span', { text: desc }) : null), sw);
}
