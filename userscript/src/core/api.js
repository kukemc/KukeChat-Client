import { API, PAGE_SIZE } from './config.js';
import { hmacMd5Hex } from './sign.js';

/* ------------------------------------------------------------------ */
/* 请求                                                                */
/* ------------------------------------------------------------------ */
export class ApiError extends Error {
  constructor(code, msg) { super(msg || '请求失败'); this.code = String(code || ''); }
}
export let signing = null;
export function ensureSigning() {
  if (!signing) {
    const opts = { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json;charset=UTF-8' } };
    signing = Promise.all([
      fetch(API + '/health/check', opts).then((r) => r.json()).catch(() => null),
      fetch(API + '/base/dateTime', opts).then((r) => r.json()).catch(() => null),
    ]).then(([hc, t]) => {
      const key = Array.isArray(hc && hc.body)
        ? hc.body.map(({ traceId }) => (traceId ? traceId[parseInt(traceId[0], 16) + 1] || '' : '')).reverse().join('')
        : '';
      const diff = (t && Number(t.body)) ? Number(t.body) - Date.now() : 0;
      return { key, diff };
    });
  }
  return signing;
}
export async function post(path, body, extraHeaders) {
  const data = body === undefined ? {} : body;
  const json = JSON.stringify(data);
  const headers = { 'Content-Type': 'application/json', ...(extraHeaders || {}) };
  const sig = await ensureSigning();
  if (sig.key) {
    const tt = String(Date.now() + sig.diff);
    headers.a = hmacMd5Hex(sig.key, 'ccw' + json + tt);
    headers.b = tt;
  }
  const res = await fetch(API + path, { method: 'POST', credentials: 'include', headers, body: json });
  let payload;
  try { payload = await res.json(); } catch (_) { throw new ApiError(res.status, '网络错误（' + res.status + '）'); }
  if (+payload.status !== 200) throw new ApiError(payload.code, (payload.msg || '请求失败').replace(/\(\w+\)/g, ''));
  return payload.body;
}

export const api = {
  summary: (prepareMarkAll) =>
    post('/notification/v3/summary', prepareMarkAll ? { includePreview: false, prepareMarkAll: true } : { includePreview: true },
      prepareMarkAll ? { 'Cache-Control': 'no-store' } : undefined),
  page: (group, filter, cursor) => post('/notification/v3/page', { group, filter, cursor, pageSize: PAGE_SIZE }),
  markRead: (req) => post('/notification/v3/mark_read', req),
  reply: (content, replyToId) => post('/comment/reply', { content, replyToId }),
  follow: (oid) => post('/study-community/following/follow', { followingOid: oid }),
  emojis: () => Promise.all([post('/emoji/all', {}), post('/emoji/category/list', {})]),
};
