import { ASSETS_HOST, GAMEJAM_HOST, ORIGIN } from './config.js';

export function safeUrl(raw) {
  if (!raw) return '';
  try {
    const u = new URL(raw, ORIGIN);
    return (u.protocol === 'https:' || u.protocol === 'http:') && !u.username && !u.password ? u.href : '';
  } catch (_) { return ''; }
}

export const ANCHOR_TYPES = ['CREATION', 'PROFILE', 'HASH_TAG', 'POST', 'SEASON', 'ACTIVITY', 'ASSET_MARKET', 'EXTENSION'];
export function withCommentAnchor(href, commentId, subjectType) {
  if (!href || !commentId || !ANCHOR_TYPES.includes(subjectType)) return href;
  const id = String(commentId).trim();
  if (!/^\d+$/.test(id)) return href;
  const u = new URL(href);
  u.searchParams.set('comment', id);
  return u.href;
}

// 与 hub 的 notificationTargetHref 同样的规则
export function targetHref(item) {
  const t = item.target || { type: 'NONE' };
  if (t.type === 'NONE') return '';
  if (t.type === 'URL') return safeUrl(t.url);
  const id = t.subjectId;
  let base = '';
  switch (t.subjectType) {
    case 'CREATION': base = '/detail/' + id; break;
    case 'PROFILE': base = '/student/' + id; break;
    case 'ACTIVITY': base = '/events/' + encodeURIComponent(id); break;
    case 'POST': base = item.url || (item.content && item.content.ext && item.content.ext.slug ? '/post/' + item.content.ext.slug : ''); break;
    case 'SEASON': base = '/stars'; break;
    case 'TEAM': base = GAMEJAM_HOST + '/teamDetail?id=' + encodeURIComponent(id) + '&activityId=1688636318306'; break;
    case 'ASSET_MARKET': base = item.url || (item.assetMarketInfo && item.assetMarketInfo.path ? ASSETS_HOST + '/assets' + item.assetMarketInfo.path : ''); break;
    case 'EXTENSION': base = item.url || (item.extensionInfo && item.extensionInfo.eid ? ASSETS_HOST + '/extension/' + item.extensionInfo.eid : ''); break;
    default: base = item.url || ''; break;
  }
  let href = safeUrl(base);
  if (href && t.subjectType === 'HASH_TAG') {
    const u = new URL(href); u.searchParams.set('tab', 'forum'); href = u.href;
  }
  return withCommentAnchor(href, t.commentId, t.subjectType);
}
