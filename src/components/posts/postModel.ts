/**
 * 动态的纯逻辑：常量、文案、@ 与 # 的解析、草稿、评论分组。
 * 移动端（PostsPanel.tsx）和桌面端（desktop/）共用这一份，这里不放任何界面。
 */
import { ApiError } from '@/api/client';
import { getDisplayName } from '@/components/ui/Avatar';
import type { Conversation, MessageMetadata, Post, PostComment, PostFeedScope, PostFeedSort, PostModerationStatus, PostNotification, PostReference, PostStats, PostTopic, PostVisibility, User } from '@/types/api';
import { parseApiDate } from '@/utils/dateTime';

export type OpenUserSpace = (user: User | null | undefined, fallbackId: number) => void;
export type RepostTarget = Post | PostReference;

export interface ComposerImage {
  id: string;
  file: File;
  previewUrl: string;
}

export interface ComposerDraft {
  content: string;
  visibility: PostVisibility;
}

export const PAGE_SIZE = 20;
export const MAX_IMAGES = 9;
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
export const MAX_COMPRESSIBLE_IMAGE_ORIGINAL_BYTES = 12 * 1024 * 1024;
export const POST_MAX_LENGTH = 2000;
export const COMMENT_MAX_LENGTH = 500;
export const POST_IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';

export const visibilityOptions: PostVisibility[] = ['public', 'friends', 'private'];

export const feedTabs: Array<{ scope: PostFeedScope; label: string; description: string }> = [
  { scope: 'friends', label: '好友动态', description: '看看好友们最近在做什么' },
  { scope: 'square', label: '动态广场', description: '发现大家公开分享的内容' },
  { scope: 'mine', label: '我的空间', description: '管理我发布过的动态' }
];

export const feedSortTabs: Array<{ value: PostFeedSort; label: string; description: string }> = [
  { value: 'latest', label: '最新', description: '按发布时间展示' },
  { value: 'hot', label: '热门', description: '结合发布时间、点赞和评论热度' }
];

export const emptyPostStats: PostStats = { post_count: 0, like_count: 0, comment_count: 0 };

export function randomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function formatTime(value: string): string {
  const date = parseApiDate(value);
  if (!date) {
    return value;
  }
  const diffSeconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (!Number.isFinite(diffSeconds) || diffSeconds < 0) {
    return '刚刚';
  }
  if (diffSeconds < 60) {
    return '刚刚';
  }
  if (diffSeconds < 3600) {
    return `${Math.floor(diffSeconds / 60)}分钟前`;
  }
  if (diffSeconds < 86400) {
    return `${Math.floor(diffSeconds / 3600)}小时前`;
  }
  return date.toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function visibilityLabel(visibility: PostVisibility): string {
  if (visibility === 'friends') {
    return '好友可见';
  }
  if (visibility === 'private') {
    return '仅自己';
  }
  return '公开';
}

export function moderationLabel(status: PostModerationStatus): string {
  if (status === 'pending') {
    return '审核中';
  }
  if (status === 'rejected') {
    return '未通过';
  }
  return '已通过';
}

export function requestErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  return fallback;
}

export function userHandle(user: User | null | undefined, fallbackId: number): string {
  if (user?.username) {
    return `@${user.username}`;
  }
  return `用户 ${fallbackId}`;
}

export function formatCompact(value?: number | null): string {
  if (typeof value !== 'number') {
    return '-';
  }
  return Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

export function conversationDisplayTitle(conversation: Conversation, currentUser: User): string {
  const displayTitle = conversation.display_title?.trim();
  if (conversation.type === 'group') {
    return displayTitle || conversation.title?.trim() || '未命名群聊';
  }
  if (displayTitle) {
    return displayTitle;
  }
  const directMember = conversation.members?.find((member) => member.user_id !== currentUser.id)?.user;
  return getDisplayName(conversation.direct_user ?? directMember, conversation.title || '私聊');
}

export function postShareMetadata(post: RepostTarget): MessageMetadata {
  const authorName = getDisplayName(post.author, `用户 ${post.author_id}`);
  return {
    share_card: {
      type: 'post',
      post_id: post.id,
      author_id: post.author_id,
      author_name: authorName,
      author_avatar_url: post.author?.avatar_url ?? null,
      content: post.content,
      image_urls: post.image_urls ?? [],
      ccw_creations: post.ccw_creations ?? [],
      created_at: post.created_at
    }
  };
}

/** 分享到聊天时消息的纯文本部分：附言在上，动态摘要在下。 */
export function postShareText(post: RepostTarget, note: string): string {
  const summary = post.content.trim() || '分享了一条动态';
  return [note.trim(), `[动态] ${getDisplayName(post.author, `用户 ${post.author_id}`)}：${summary}`].filter(Boolean).join('\n').slice(0, 500);
}

export function userCardShareText(user: User, note: string): string {
  return [note.trim(), `[个人名片] ${getDisplayName(user, `用户 ${user.id}`)}`].filter(Boolean).join('\n').slice(0, 500);
}

export function hasActiveTextSelection(): boolean {
  return Boolean(window.getSelection()?.toString().trim());
}

/* ───────── 发布框草稿 ───────── */

function composerDraftKey(userId: number): string {
  return `kukechat.postComposerDraft.${userId}`;
}

export function loadComposerDraft(userId: number): ComposerDraft | null {
  if (typeof localStorage === 'undefined') {
    return null;
  }
  try {
    const raw = localStorage.getItem(composerDraftKey(userId));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<ComposerDraft>;
    if (typeof parsed.content !== 'string') {
      return null;
    }
    const visibility = parsed.visibility === 'friends' || parsed.visibility === 'private' ? parsed.visibility : 'public';
    return { content: parsed.content, visibility };
  } catch {
    return null;
  }
}

export function saveComposerDraft(userId: number, draft: ComposerDraft): void {
  if (typeof localStorage === 'undefined') {
    return;
  }
  if (!draft.content.trim() && draft.visibility === 'public') {
    localStorage.removeItem(composerDraftKey(userId));
    return;
  }
  localStorage.setItem(composerDraftKey(userId), JSON.stringify(draft));
}

export function clearComposerDraft(userId: number): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(composerDraftKey(userId));
  }
}

/** 逐个校验待上传的图片。返回能用的文件，以及最后一条要提示给用户的错误。 */
export function pickAcceptableImages(files: File[]): { accepted: File[]; error: string | null } {
  const accepted: File[] = [];
  let error: string | null = null;
  for (const file of files) {
    if (!file.type.startsWith('image/')) {
      error = '只能上传图片文件';
      continue;
    }
    const maxOriginalBytes = /^(image\/jpeg|image\/png|image\/webp)$/i.test(file.type) ? MAX_COMPRESSIBLE_IMAGE_ORIGINAL_BYTES : MAX_IMAGE_BYTES;
    if (file.size > maxOriginalBytes) {
      error = 'JPEG/PNG/WEBP 原图不能超过 12MB，GIF 及其他图片原图不能超过 3MB；压缩后不能超过 3MB';
      continue;
    }
    accepted.push(file);
  }
  return { accepted, error };
}

/* ───────── @ 好友与 # 话题 ───────── */

const TOPIC_BODY = '[\\w\\u4e00-\\u9fff][\\w\\u4e00-\\u9fff-]{0,39}';

export function mergeTopics(...groups: Array<PostTopic[] | undefined>): PostTopic[] {
  const merged = new Map<string, PostTopic>();
  for (const group of groups) {
    for (const topic of group ?? []) {
      merged.set(topic.name.toLowerCase(), topic);
    }
  }
  return [...merged.values()];
}

/** 旧格式的 @[昵称](id) 还原成纯文本的 @昵称。 */
export function legacyMentionToPlain(content: string): string {
  return content.replace(/@\[([^\]]+)]\(\d+\)/g, '@$1');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function uniqueMentionUsers(users: User[]): User[] {
  const seen = new Set<number>();
  return users.filter((user) => {
    if (seen.has(user.id)) {
      return false;
    }
    seen.add(user.id);
    return true;
  });
}

export function extractMentionUserIds(content: string, users: User[]): number[] {
  const plain = legacyMentionToPlain(content);
  const ids: number[] = [];
  const seen = new Set<number>();
  for (const user of uniqueMentionUsers(users)) {
    const name = getDisplayName(user).trim();
    if (!name) {
      continue;
    }
    const pattern = new RegExp(`(^|\\s)@${escapeRegExp(name)}(?=\\s|$|[，。！？,.!?])`);
    if (pattern.test(plain) && !seen.has(user.id)) {
      ids.push(user.id);
      seen.add(user.id);
    }
    if (ids.length >= 20) {
      break;
    }
  }
  return ids;
}

export function extractTopicNames(content: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const match of content.matchAll(new RegExp(`(^|\\s)#(${TOPIC_BODY})`, 'g'))) {
    const name = match[2]?.trim();
    const key = name.toLowerCase();
    if (!name || seen.has(key)) {
      continue;
    }
    names.push(name);
    seen.add(key);
  }
  return names.slice(0, 10);
}

export function mentionToken(user: User): string {
  return `@${getDisplayName(user)} `;
}

/** 把光标前正在输入的 @xxx / #xxx 换成选中的那一项；光标前没有触发词时接在末尾。 */
export function replaceTriggerToken(value: string, token: string, cursor = value.length): string {
  const before = value.slice(0, cursor);
  const after = value.slice(cursor);
  const match = before.match(/(?:^|\s)([@#][\w一-鿿-]*)$/);
  if (!match || match.index === undefined) {
    return `${value}${value && !value.endsWith(' ') ? ' ' : ''}${token}`;
  }
  const prefixEnd = match[0].startsWith(' ') ? match.index + 1 : match.index;
  return `${before.slice(0, prefixEnd)}${token}${after}`;
}

export function inputTrigger(value: string, cursor = value.length): { type: 'mention' | 'topic'; query: string } | null {
  const before = value.slice(0, cursor);
  const match = before.match(/(?:^|\s)([@#]([\w一-鿿-]{0,40}))$/);
  if (!match) {
    return null;
  }
  return { type: match[1].startsWith('@') ? 'mention' : 'topic', query: match[2] ?? '' };
}

/* ───────── 正文拆分 ───────── */

export type PostTextToken =
  | { type: 'text'; text: string }
  | { type: 'url'; url: string }
  /** user 为空且带 userId 的是旧格式 @[昵称](id)；都为空说明只认出了名字 */
  | { type: 'mention'; name: string; user?: User; userId?: number }
  | { type: 'topic'; name: string };

function tokenizePlainSegment(content: string, mentionUsers: User[], tokens: PostTextToken[]): void {
  const usersByName = uniqueMentionUsers(mentionUsers).sort((a, b) => getDisplayName(b).length - getDisplayName(a).length);
  const mentionNames = usersByName.map((user) => escapeRegExp(getDisplayName(user).trim())).filter(Boolean).join('|');
  const patterns = [
    '@\\[([^\\]]+)]\\((\\d+)\\)',
    mentionNames ? `(^|\\s)@(${mentionNames})(?=\\s|$|[，。！？,.!?])` : '',
    `(^|\\s)#(${TOPIC_BODY})`
  ].filter(Boolean);
  const matcher = new RegExp(patterns.join('|'), 'g');
  // 有可 @ 的好友时，话题的两个捕获组排在好友的后面
  const topicGroup = mentionNames ? 5 : 3;
  let lastIndex = 0;
  for (const match of content.matchAll(matcher)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      tokens.push({ type: 'text', text: content.slice(lastIndex, index) });
    }
    if (match[1] && match[2]) {
      tokens.push({ type: 'mention', name: match[1], userId: Number(match[2]) });
    } else if (mentionNames && match[4]) {
      const name = match[4];
      if (match[3]) {
        tokens.push({ type: 'text', text: match[3] });
      }
      tokens.push({ type: 'mention', name, user: usersByName.find((item) => getDisplayName(item) === name) });
    } else if (match[topicGroup + 1]) {
      if (match[topicGroup]) {
        tokens.push({ type: 'text', text: match[topicGroup] });
      }
      tokens.push({ type: 'topic', name: match[topicGroup + 1] });
    }
    lastIndex = index + match[0].length;
  }
  if (lastIndex < content.length) {
    tokens.push({ type: 'text', text: content.slice(lastIndex) });
  }
}

/** 把正文拆成文字、链接、@ 好友、# 话题。怎么画由两端各自决定。 */
export function tokenizePostText(content: string, mentionUsers: User[] = []): PostTextToken[] {
  const tokens: PostTextToken[] = [];
  for (const part of content.split(/(https?:\/\/[^\s]+)/)) {
    if (!part) {
      continue;
    }
    if (/^https?:\/\/[^\s]+$/i.test(part)) {
      tokens.push({ type: 'url', url: part });
    } else {
      tokenizePlainSegment(part, mentionUsers, tokens);
    }
  }
  return tokens;
}

/* ───────── 互动 ───────── */

export function notificationText(notification: PostNotification): string {
  const name = getDisplayName(notification.actor, `用户 ${notification.actor_id}`);
  if (notification.type === 'like') {
    return `${name} 赞了你的内容`;
  }
  if (notification.type === 'comment') {
    return `${name} 评论了你的动态`;
  }
  if (notification.type === 'reply') {
    return `${name} 回复了你`;
  }
  if (notification.type === 'repost') {
    return `${name} 转发了你的动态`;
  }
  return `${name} 提到了你`;
}

export function likeSummaryText(post: Post): string {
  const count = post.like_count || 0;
  const names = (post.recent_likes ?? []).map((user) => getDisplayName(user)).filter(Boolean);
  if (count <= 0) {
    return '';
  }
  if (names.length === 0) {
    return `${count} 人赞了`;
  }
  const shownNames = names.slice(0, Math.min(names.length, 5));
  return `${shownNames.join('、')}${count > shownNames.length ? ` 等 ${count} 人赞了` : ` ${count} 人赞了`}`;
}

export interface CommentThreadData {
  root: PostComment;
  replies: PostComment[];
}

/** 评论按楼归组：不管回复嵌了几层，都挂到最顶上那条评论下面。 */
export function buildCommentThreads(comments: PostComment[]): CommentThreadData[] {
  const byId = new Map(comments.map((comment) => [comment.id, comment]));
  const roots: PostComment[] = [];
  const repliesByRoot = new Map<number, PostComment[]>();

  function findRoot(comment: PostComment): PostComment {
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

export function replyTargetName(reply: PostComment): string | undefined {
  return reply.parent_id ? getDisplayName(reply.parent_author, `评论 ${reply.parent_id}`) : undefined;
}
