// KukeChat 实时连接（常驻轻量层）：每个 CCW 页面一条 WebSocket，收新消息、已读、好友「正在玩」。
// 完整的聊天界面只在消息中心打开私信时才加载（embed.js），平时不加载 5MB 的界面包。
// 连上后 KukeChat 里会显示「在线」—— 人在逛共创世界，这是对的。
import { KUKECHAT_BASE, currentToken, ensureSession } from './client.js';

const listeners = new Set();
let socket = null;
let retry = 0;
let pingTimer = 0;
let started = false;

export function onRealtime(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(event) {
  listeners.forEach((fn) => {
    try { fn(event); } catch (_) { /* 一个监听出错不影响别的 */ }
  });
}

async function connect() {
  if (!(await ensureSession())) {
    // 没登录 KukeChat：5 分钟后再看看（ensureSession 自己会节流）
    window.setTimeout(connect, 5 * 60 * 1000);
    return;
  }
  const url = KUKECHAT_BASE.replace(/^http/, 'ws') + '/ws?token=' + encodeURIComponent(currentToken());
  socket = new WebSocket(url);
  socket.onopen = () => {
    retry = 0;
    window.clearInterval(pingTimer);
    pingTimer = window.setInterval(() => { if (socket && socket.readyState === 1) socket.send('ping'); }, 25000);
  };
  socket.onmessage = (e) => {
    if (typeof e.data !== 'string' || e.data === 'pong') return;
    try {
      const msg = JSON.parse(e.data);
      if (msg && typeof msg.type === 'string') emit(msg);
    } catch (_) { /* 不是 JSON 的忽略 */ }
  };
  socket.onclose = () => {
    window.clearInterval(pingTimer);
    socket = null;
    // 断线重连：1、2、4……最多 60 秒
    retry = Math.min(retry + 1, 6);
    window.setTimeout(connect, Math.min(60, 2 ** (retry - 1)) * 1000);
    emit({ type: 'kc.disconnected', data: null });
  };
}

export function startRealtime() {
  if (started) return;
  started = true;
  connect();
}
