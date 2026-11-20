// 「正在玩 / 正在创作」上报（KukeChat-Server/docs/ccw-social.md）。
//
// 作品页 /detail/<oid>：正在玩；Gandi 编辑器（地址里带作品 oid）：正在创作。
// 页面在前台时每 60 秒心跳一次；切到后台就停，3 分钟后服务端自然过期；离开作品页、关掉标签页时主动清除。
// 作品标题和封面从 CCW 接口取（只读，不需要签名之外的东西）。没登录 KukeChat 时什么都不做。
import { post } from '../core/api.js';
import { kcRequest, kcRequestOnUnload } from './client.js';

const HEARTBEAT_MS = 60 * 1000;
const OID = /([0-9a-f]{24})/;

let current = null; // { key, kind, oid, title, cover }
let timer = 0;
let reported = false;
const infoCache = new Map();

function detect() {
  const path = location.pathname;
  const detail = path.match(/^\/detail\/([0-9a-f]{24})/);
  if (detail) return { kind: 'play', oid: detail[1] };
  if (/^\/(gandi|creator|editor)/.test(path)) {
    const m = (location.pathname + location.search).match(OID);
    return { kind: 'create', oid: m ? m[1] : null };
  }
  return null;
}

async function workInfo(oid) {
  if (!oid) return null;
  if (infoCache.has(oid)) return infoCache.get(oid);
  try {
    const d = await post('/creation/detail', { oid });
    const info = d && { title: d.title || '', cover: d.latestCoverLink || (d.creationRelease && d.creationRelease.coverLink) || null };
    infoCache.set(oid, info);
    return info;
  } catch (_) {
    return null;
  }
}

function titleFromDocument() {
  return (document.title || '').split(/ [-–|] /)[0].trim();
}

async function beat() {
  if (!current || document.visibilityState !== 'visible') return;
  const c = current;
  if (!c.title) {
    const info = await workInfo(c.oid);
    if (c !== current) return;
    c.title = (info && info.title) || titleFromDocument() || (c.kind === 'create' ? '新作品' : '一个作品');
    c.cover = info && info.cover;
  }
  try {
    await kcRequest('PUT', '/ccw/activity', { kind: c.kind, ccw_oid: c.oid, title: c.title.slice(0, 80), cover_url: c.cover || null });
    reported = true;
  } catch (_) {
    // 网络问题等下一次心跳
  }
}

function stop(onUnload) {
  window.clearInterval(timer);
  timer = 0;
  if (!reported) return;
  reported = false;
  if (onUnload) kcRequestOnUnload('DELETE', '/ccw/activity');
  else kcRequest('DELETE', '/ccw/activity').catch(() => {});
}

/** 每次路由变化时调用。 */
export function syncPresence() {
  const next = detect();
  const key = next ? next.kind + ':' + (next.oid || '') : null;
  if (current && current.key === key) return;
  if (current) stop(false);
  current = next ? { key, ...next, title: '', cover: null } : null;
  if (!current) return;
  beat();
  timer = window.setInterval(beat, HEARTBEAT_MS);
}

export function installPresence() {
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') beat(); });
  window.addEventListener('pagehide', () => stop(true));
  syncPresence();
}
