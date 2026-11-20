import { sectionOf } from '../core/time.js';

export const GROUPS = ['REPLY', 'CONTENT_INTERACTION', 'SYSTEM', 'COMMUNITY', 'FRIEND_SHARE'];
export const GROUP_LABEL = {
  ALL: '全部消息',
  CHAT: '私信',
  FRIENDS: '好友',
  REPLY: '回复我的',
  CONTENT_INTERACTION: '内容互动',
  SYSTEM: '系统通知',
  COMMUNITY: '社区通知',
  FRIEND_SHARE: '好友分享',
};

/* ------------------------------------------------------------------ */
/* 消息 → 展示模型                                                      */
/* ------------------------------------------------------------------ */
export const KIND_NOUN = { CREATION: '作品', POST: '文章', ASSET_MARKET: '素材', EXTENSION: '扩展', PROFILE: '留言板', HASH_TAG: '话题', ACTIVITY: '活动', TEAM: 'Game Jam 战队', OUTSIDE_EMBED: '教程', SEASON: '星球' };

export function sender(item) {
  const s = item.senderInfo || {};
  return {
    name: s.name || item.senderName || '',
    oid: s.oid || item.senderOid || '',
    avatar: s.avatar || item.avatar || '',
  };
}
export function subjectTitle(item) {
  return (item.creationInfo && item.creationInfo.title) || item.subjectOutline
    || (item.assetMarketInfo && item.assetMarketInfo.name) || (item.extensionInfo && item.extensionInfo.name)
    || (item.content && (item.content.subject_outline || item.content.homework_title)) || '';
}
export function thumbOf(item) {
  const c = item.creationInfo;
  if (c) return c.latestCoverLink || (c.creationRelease && c.creationRelease.coverLink) || '';
  if (item.assetMarketInfo && item.assetMarketInfo.previewImages) return item.assetMarketInfo.previewImages[0] || '';
  if (item.extensionInfo) return item.extensionInfo.cover || '';
  return '';
}
export function interactionVerb(item) {
  const c = item.contentCategory || '';
  const noun = KIND_NOUN[item.subjectType] || '内容';
  if (c === 'COMMENT_LIKED') return '赞了你的' + (item.target && item.target.parentCommentId ? '回复' : '评论');
  if (c.endsWith('_FAVORITE')) return '收藏了你的' + noun;
  if (c.endsWith('_LIKED')) return '赞了你的' + noun;
  if (c === 'CREATION_REMIXED') return '改编了你的作品';
  if (c === 'ASSET_MARKET_DONATE') return '打赏了你的素材';
  if (c === 'ASSET_MARKET_PURCHASED') return '获取了你的素材';
  return '与你的' + noun + '互动';
}
export function replyVerb(item) {
  const isReply = Boolean(item.message) || Boolean(item.target && item.target.parentCommentId);
  const type = item.subjectType;
  if (type === 'PROFILE') return isReply ? '回复了你在留言板的留言' : '在你的留言板留言';
  const noun = KIND_NOUN[type] || '内容';
  if (isReply) return '回复了你在' + noun;
  if (type === 'OUTSIDE_EMBED' && !(item.content && item.content.ext && item.content.ext.courseTitle)) return isReply ? '回复了你在教程中的评论' : '在教程中评论';
  if (type === 'OUTSIDE_EMBED' || type === 'HASH_TAG' || type === 'SEASON' || type === 'ACTIVITY') return '在' + noun;
  return '评论了你的' + noun;
}
export function replyTail(item) {
  if (item.subjectType === 'OUTSIDE_EMBED' && !(item.content && item.content.ext && item.content.ext.courseTitle)) return '';
  const isReply = Boolean(item.message) || Boolean(item.target && item.target.parentCommentId);
  if (item.subjectType === 'PROFILE') return '';
  if (isReply) return '中的评论';
  if (['OUTSIDE_EMBED', 'HASH_TAG', 'SEASON', 'ACTIVITY'].includes(item.subjectType)) return '中评论';
  return '';
}
export function shareTarget(item) {
  if (item.subjectType === 'ASSET_MARKET' || item.subjectType === 'SHARE_CODE') return '分享了素材';
  if (item.subjectType === 'PROFILE') return '分享了一位创作者';
  if (item.subjectType === 'SOCIETY') return '';
  return '分享了作品';
}
export const SYSTEM_TITLE = {
  CREATION_AUDIT_PASSED: '作品审核通过', CREATION_AUDIT_REJECTED: '作品审核未通过', CREATION_BANNED: '作品被下架',
  CREATION_CHECKED: '作品审核结果', COMMENT_DELETED: '评论被删除', COMMENT_RESTORED: '评论已恢复', COMMENT_REJECTED: '评论未通过审核',
  REPORT_LOG_REJECTED: '举报未通过', MEMBER_MUTED: '账号禁言', POST_VISIBILITY_CHANGED: '文章可见性变更',
  COMMUNITY_ACTIVITY_AUDIT_PASSED: '活动审核通过', COMMUNITY_ACTIVITY_AUDIT_REJECTED: '活动审核未通过',
  TEAM_FORMED: '战队已组建', TEAM_DELETED: '战队已解散', TEAM_MEMBER_JOINED: '新成员加入战队', TEAM_MEMBER_DELETED: '成员离开战队',
  SESSION_CREATED: '新会话', INVITEE_REGISTERED: '好友加入社区', POST_RATED_AS_EXCELLENT: '文章被评为精选',
  CREATION_RECOMMENDED_AS_POTENTIAL: '作品被评为潜力新作', CREATION_UPDATED_TO_EXCELLENT: '作品被评为精选', COMMUNITY_ACTIVITY: '社区公告',
};

// 内容互动里同一作品、同一动作、同一时间段的消息合并成一行
export function buildRows(items, aggregate) {
  const sections = [];
  const bySection = new Map();
  for (const it of items) {
    const sec = sectionOf(it.createdAt);
    let s = bySection.get(sec.key);
    if (!s) { s = { ...sec, rows: [], agg: new Map() }; bySection.set(sec.key, s); sections.push(s); }
    const canAgg = aggregate && ((it.group === 'CONTENT_INTERACTION' && it.subjectOid && it.contentCategory !== 'COMMENT_LIKED') || it.contentCategory === 'FOLLOWED');
    if (canAgg) {
      const k = it.contentCategory + '|' + (it.contentCategory === 'FOLLOWED' ? '' : it.subjectOid);
      const row = s.agg.get(k);
      if (row) { row.items.push(it); continue; }
      const nr = { key: 'agg:' + sec.key + ':' + k, items: [it] };
      s.agg.set(k, nr); s.rows.push(nr);
    } else {
      s.rows.push({ key: it.id, items: [it] });
    }
  }
  return sections;
}
