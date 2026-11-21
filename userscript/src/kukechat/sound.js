// 新消息提示音：用 Web Audio 现场合成一声短促的「叮咚」，不用额外下载音频文件。
// 浏览器要求页面上有过一次点击 / 按键才允许出声：之前来的消息静音，不报错。
import { pref } from '../core/prefs.js';

let ctx = null;
let last = 0;

function audio() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  return ctx;
}

// 第一次交互时把音频上下文解锁，之后来消息才能响
const unlock = () => {
  const c = audio();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
};
window.addEventListener('pointerdown', unlock, { capture: true, passive: true });
window.addEventListener('keydown', unlock, { capture: true, passive: true });

function tone(c, freq, start, dur, peak) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

/** 响一声；1.2 秒内连着来的消息只响一次。important（@ 我、私聊）稍微亮一点 */
export function playMessageSound(important) {
  if (!pref('sound')) return;
  const now = Date.now();
  if (now - last < 1200) return;
  const c = audio();
  if (!c || c.state !== 'running') return;
  last = now;
  const t = c.currentTime + 0.01;
  const peak = important ? 0.16 : 0.11;
  tone(c, 880, t, 0.16, peak);
  tone(c, 1318.5, t + 0.09, 0.28, peak);
}
