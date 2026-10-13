import { TEAMUP_SHARE_URL } from '@/config';
import { parseApiDate } from '@/utils/dateTime';
import { getDisplayName } from '@/components/ui/Avatar';
import type { Conversation, MessageMetadata, TeamupComment, TeamupProfile, TeamupShareCardMetadata, User } from '@/types/api';
import { resolveAssetUrl, resolveThumbnailUrl } from '@/utils/assetUrl';
import { CCW_CREATION_URL_PATTERN } from '@/utils/ccwLinks';

/** 组队页两端共用的纯函数：排序打分、文案、留言分组。界面各写各的，这里不放任何样式。 */

export const PROFILE_PAGE_SIZE = 40;
export const DISCOVERY_SIZE = 12;

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '请求失败，请稍后再试';
}

export function profileUser(profile: TeamupProfile): User {
  return profile.author ?? { id: profile.user_id, username: `用户 ${profile.user_id}`, nickname: `用户 ${profile.user_id}` };
}

export function uniqueProfiles(groups: TeamupProfile[][]): TeamupProfile[] {
  const seen = new Set<number>();
  return groups.flat().filter((profile) => {
    if (seen.has(profile.id)) return false;
    seen.add(profile.id);
    return true;
  });
}

export function profileActivityScore(profile: TeamupProfile, now: number): number {
  const ageHours = Math.max(0, (now - (parseApiDate(profile.updated_at || profile.created_at)?.getTime() ?? now)) / 3600000);
  const freshness = 90 / (1 + ageHours / 18);
  const activity = Math.log2(profile.view_count + 2) * 12 + Math.log2(profile.comment_count * 3 + 2) * 16;
  const recruiting = profile.status === 'recruiting' ? 24 : 0;
  return freshness + activity + recruiting;
}

/** 有自己的名片时，把「对方会我想找的」「对方想找我会的」加进活跃度里。 */
export function recommendationScore(profile: TeamupProfile, myProfile: TeamupProfile | null, now: number): number {
  if (!myProfile || profile.is_self) return profileActivityScore(profile, now);
  const mySkills = new Set(myProfile.skills.map((item) => item.skill));
  const wantedByMe = new Set(myProfile.looking_for);
  const complementarySkills = profile.skills.filter((item) => wantedByMe.has(item.skill)).length;
  const theyNeedMine = profile.looking_for.filter((skill) => mySkills.has(skill)).length;
  return profileActivityScore(profile, now) + complementarySkills * 55 + theyNeedMine * 44;
}

export function relativePublishedAt(value: string): string {
  const minutes = Math.max(0, Math.floor((Date.now() - (parseApiDate(value)?.getTime() ?? Date.now())) / 60000));
  if (minutes < 60) return minutes < 2 ? '刚刚更新' : `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}

export function formatCountdown(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) {
    return `${days} 天 ${hours} 小时`;
  }
  if (hours > 0) {
    return `${hours} 小时 ${minutes} 分`;
  }
  return `${minutes} 分钟`;
}

/** 介绍里的 CCW 作品链接另有卡片展示，正文里去掉。 */
export function stripCcwLinks(text: string): string {
  return text.replace(CCW_CREATION_URL_PATTERN, ' ').replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

/** 名片卡片上的两行摘要：去掉作品链接和 Markdown 记号，只留文字。 */
export function introPlainText(intro: string): string {
  return intro
    .replace(CCW_CREATION_URL_PATTERN, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~|-]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function compactCount(value: number): string {
  return value >= 10000 ? `${(value / 10000).toFixed(1)}w` : value >= 1000 ? `${(value / 1000).toFixed(1)}k` : `${value}`;
}

/** CCW 资料里的计数，后端可能没同步到。 */
export function formatCcwCount(value?: number | null): string {
  if (typeof value !== 'number') {
    return '-';
  }
  if (value >= 10000) {
    return `${(value / 10000).toFixed(value >= 100000 ? 0 : 1)}w`;
  }
  return String(value);
}

export type ShowcaseItem =
  | { kind: 'work'; key: string; cover: string; title: string; likeCount: number; viewCount: number }
  | { kind: 'image'; key: string; cover: string };

/** 卡片上的作品条：代表作封面在前，配图在后。 */
export function buildShowcase(profile: TeamupProfile): ShowcaseItem[] {
  const items: ShowcaseItem[] = [];
  for (const creation of profile.ccw_creations ?? []) {
    const cover = resolveAssetUrl(creation.cover_url ?? undefined);
    if (cover) {
      items.push({ kind: 'work', key: `w-${creation.oid}`, cover, title: creation.title, likeCount: creation.like_count ?? 0, viewCount: creation.view_count ?? 0 });
    }
  }
  for (const url of profile.image_urls) {
    const cover = resolveThumbnailUrl(url) ?? url;
    if (cover) {
      items.push({ kind: 'image', key: `i-${url}`, cover });
    }
  }
  return items;
}

const TEAMUP_SHARE_PHRASES = [
  '求组队！我的名片：',
  '找队友在线等，很急！我的组队名片：',
  '🎮 寻找搭档中，来看看我的组队名片：',
  '组队ing～这是我的名片，速来：',
  '一起来开黑做项目吧！我的名片：',
  '蹲一个靠谱队友，我的组队名片：'
];

/** 复制出去的分享文案：随机一句开场白 + 落地页链接（和群邀请链接是同一个落地页）。 */
export function teamupShareText(profileId: number): string {
  const phrase = TEAMUP_SHARE_PHRASES[Math.floor(Math.random() * TEAMUP_SHARE_PHRASES.length)];
  return `${phrase}\n${TEAMUP_SHARE_URL}?teamup=${profileId}`;
}

export function teamupShareMetadata(profile: TeamupProfile, user: User): MessageMetadata {
  const card: TeamupShareCardMetadata = {
    type: 'teamup',
    profile_id: profile.id,
    user_id: profile.user_id,
    name: getDisplayName(user),
    avatar_url: user.avatar_url ?? null,
    headline: profile.headline ?? null,
    status: profile.status,
    skills: profile.skills.map((item) => item.skill),
    looking_for: profile.looking_for,
    creation_count: (profile.ccw_creations ?? []).length,
    cover_url: profile.background_url ?? null
  };
  return { share_card: card };
}

export function shareTargetTitle(conversation: Conversation, currentUser?: User | null): string {
  if (conversation.type === 'group') {
    return conversation.title?.trim() || '群聊';
  }
  const other = conversation.direct_user ?? conversation.members?.find((member) => member.user_id !== currentUser?.id)?.user;
  return other ? getDisplayName(other) : conversation.title?.trim() || '私聊';
}

export interface CommentThreadData {
  root: TeamupComment;
  replies: TeamupComment[];
}

/** 留言只展示两层：回复的回复也挂到最上面那条下面。 */
export function buildCommentThreads(comments: TeamupComment[]): CommentThreadData[] {
  const byId = new Map(comments.map((comment) => [comment.id, comment]));
  const roots: TeamupComment[] = [];
  const repliesByRoot = new Map<number, TeamupComment[]>();

  function findRoot(comment: TeamupComment): TeamupComment {
    let current = comment;
    const seen = new Set<number>();
    while (current.parent_id && byId.has(current.parent_id) && !seen.has(current.id)) {
      seen.add(current.id);
      const parent = byId.get(current.parent_id);
      if (!parent) {
        break;
      }
      current = parent;
    }
    return current;
  }

  for (const comment of comments) {
    if (!comment.parent_id || !byId.has(comment.parent_id)) {
      roots.push(comment);
      repliesByRoot.set(comment.id, repliesByRoot.get(comment.id) ?? []);
      continue;
    }
    const root = findRoot(comment);
    if (root.id === comment.id) {
      roots.push(comment);
      repliesByRoot.set(comment.id, repliesByRoot.get(comment.id) ?? []);
      continue;
    }
    const replies = repliesByRoot.get(root.id) ?? [];
    replies.push(comment);
    repliesByRoot.set(root.id, replies);
  }

  return roots.map((root) => ({ root, replies: repliesByRoot.get(root.id) ?? [] }));
}
