import { type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ccwStudentProfileUrl } from '@/config';
import { createDirectConversation, getConversations } from '@/api/conversations';
import { getFriends, getOutgoingFriendRequests, sendFriendRequest } from '@/api/friends';
import { getAllBookmarkedMessages, sharePostToConversation, shareUserToConversation } from '@/api/messages';
import { createPost, createPostComment, deletePost, getPost, getPostFeed, getPostLikes, getPostNotifications, getTrendingPostTopics, getUserPostStats, getUserPosts, markPostNotificationRead, markPostNotificationsRead, pinPost, repostPost, searchPostTopics, togglePostCommentLike, togglePostLike, unpinPost, updatePost, uploadPostImage } from '@/api/posts';
import { getUserProfile, updateMyProfile, uploadProfileCover } from '@/api/users';
import { useKukeStore } from '@/store/kukeStore';
import type { CcwCreationPreview, Conversation, Message, MessageMetadata, Post, PostComment, PostFeedScope, PostFeedSort, PostLike, PostModerationStatus, PostNotification, PostReference, PostStats, PostTopic, PostVisibility, User } from '@/types/api';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { CcwCreationCard } from '@/components/ui/CcwCreationCard';
import { ImageViewer, type ImageViewerState } from '@/components/ui/ImageViewer';
import { MobilePostDetailPage } from '@/components/posts/MobilePostDetailPage';
import { CcwCreatorsPage } from '@/components/posts/CcwCreatorsPage';
import { FavoritesPanel } from '@/components/chat/MessagePanel';
import { MobileStatusBar } from '@/components/mobile/MobileChrome';
import { BotCenterPanel } from '@/components/bots/BotCenterPanel';
import { ApiError } from '@/api/client';
import { createReport } from '@/api/reports';
import { ReportModal } from '@/components/chat/ReportModal';
import type { CreateReportPayload } from '@/types/api';
import { resolveAssetUrl, resolveThumbnailUrl } from '@/utils/assetUrl';
import { parseApiDate } from '@/utils/dateTime';
import { hasPendingOutgoingFriendRequest, isFriendUserId } from '@/utils/friendship';
import { openExternalUrl } from '@/utils/openExternalUrl';
import { registerNativeBackHandler } from '@/native/back';
import { runNativeRouteTransition } from '@/native/transition';
import { getMobileFeatureDefinition, getMobileSpaceFeatureIds, type MobileFeatureId } from '@/mobile/features';

interface PostsPanelProps {
  currentUser: User;
  isMobile: boolean;
  onOpenMobileUserProfile?: (user: User | null | undefined, fallbackId: number) => void;
  conversations?: Conversation[];
  bookmarks?: Awaited<ReturnType<typeof getAllBookmarkedMessages>>;
  bookmarksLoading?: boolean;
  bookmarksError?: unknown;
  onOpenForwardBundle?: (message: Message) => void;
  onMobileSecondaryActiveChange?: (active: boolean) => void;
  onOpenMobileBots?: () => void;
  onOpenMobileFeature?: (featureId: MobileFeatureId) => void;
  onOpenMobileMenuSettings?: () => void;
  mobileInitialView?: 'home' | 'posts';
}

interface ComposerImage {
  id: string;
  file: File;
  previewUrl: string;
}

interface ComposerDraft {
  content: string;
  visibility: PostVisibility;
}

const PAGE_SIZE = 20;
const MAX_IMAGES = 9;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const URL_PATTERN_SOURCE = '(https?:\\/\\/[^\\s]+)';
const POST_URL_PATTERN = /(https?:\/\/[^\s]+)/g;

function getKukePortalRoot(): Element {
  const host = document.getElementById('kukechat-shadow-host');
  return host?.shadowRoot?.querySelector('.kc-window-frame:not(.kc-window-minimized)') ?? document.querySelector('.kc-window-frame:not(.kc-window-minimized)') ?? host?.shadowRoot?.getElementById('kukechat-root') ?? document.getElementById('kukechat-root') ?? document.body;
}

function mergeTopics(...groups: Array<PostTopic[] | undefined>): PostTopic[] {
  const merged = new Map<string, PostTopic>();
  for (const group of groups) {
    for (const topic of group ?? []) {
      merged.set(topic.name.toLowerCase(), topic);
    }
  }
  return [...merged.values()];
}

function composerDraftKey(userId: number): string {
  return `kukechat.postComposerDraft.${userId}`;
}

function loadComposerDraft(userId: number): ComposerDraft | null {
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

function saveComposerDraft(userId: number, draft: ComposerDraft): void {
  if (typeof localStorage === 'undefined') {
    return;
  }
  if (!draft.content.trim() && draft.visibility === 'public') {
    localStorage.removeItem(composerDraftKey(userId));
    return;
  }
  localStorage.setItem(composerDraftKey(userId), JSON.stringify(draft));
}

function clearComposerDraft(userId: number): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(composerDraftKey(userId));
  }
}

const feedTabs: Array<{ scope: PostFeedScope; label: string; description: string }> = [
  { scope: 'friends', label: '好友动态', description: '看看好友们最近在做什么' },
  { scope: 'square', label: '动态广场', description: '发现大家公开分享的内容' },
  { scope: 'mine', label: '我的空间', description: '管理我发布过的动态' }
];
const feedSortTabs: Array<{ value: PostFeedSort; label: string; description: string }> = [
  { value: 'latest', label: '最新', description: '按发布时间展示' },
  { value: 'hot', label: '热门', description: '结合发布时间、点赞和评论热度' }
];

const profileLayoutOptions = [
  { value: 'classic', label: '经典名片', detail: '平衡封面和资料卡' },
  { value: 'banner', label: '沉浸封面', detail: '更高头图和大头像' },
  { value: 'compact', label: '紧凑档案', detail: '压缩头图突出动态' }
] as const;

const profileCardStyleOptions = [
  { value: 'soft', label: '柔和', detail: '浅色卡片，适合默认封面' },
  { value: 'glass', label: '玻璃', detail: '半透明浮层，适合图片封面' },
  { value: 'solid', label: '纯色', detail: '高对比信息卡' }
] as const;
const profileAccentPresets = ['#168bff', '#7c3aed', '#ff4f86', '#f97316', '#10b981', '#111827'] as const;

type ProfileLayout = (typeof profileLayoutOptions)[number]['value'];
type ProfileCardStyle = (typeof profileCardStyleOptions)[number]['value'];

type RepostTarget = Post | PostReference;

const emptyPostStats: PostStats = { post_count: 0, like_count: 0, comment_count: 0 };

function randomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatTime(value: string): string {
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

function visibilityLabel(visibility: PostVisibility): string {
  if (visibility === 'friends') {
    return '好友可见';
  }
  if (visibility === 'private') {
    return '仅自己';
  }
  return '公开';
}

function moderationLabel(status: PostModerationStatus): string {
  if (status === 'pending') {
    return '审核中';
  }
  if (status === 'rejected') {
    return '未通过';
  }
  return '已通过';
}

function requestErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  return fallback;
}

function invalidatePosts(queryClient: ReturnType<typeof useQueryClient>): void {
  void queryClient.invalidateQueries({ queryKey: ['posts'] });
}

function userHandle(user: User | null | undefined, fallbackId: number): string {
  if (user?.username) {
    return `@${user.username}`;
  }
  return `用户 ${fallbackId}`;
}

function formatCompact(value?: number | null): string {
  if (typeof value !== 'number') {
    return '-';
  }
  return Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function conversationDisplayTitle(conversation: Conversation, currentUser: User): string {
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

function ConversationShareAvatar({ conversation, title }: { conversation: Conversation; title: string }): JSX.Element {
  if (conversation.type === 'group') {
    const avatar = resolveThumbnailUrl(conversation.avatar_url);
    if (avatar) {
      return <img src={avatar} alt={title} className="h-10 w-10 shrink-0 rounded-full border object-cover [border-color:var(--kc-border)]" />;
    }
    return <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border text-sm font-black [background:var(--kc-accent-soft)] [border-color:var(--kc-border)] [color:var(--kc-accent)]">{title.trim().slice(0, 1) || '群'}</span>;
  }
  return <Avatar user={conversation.direct_user} label={title} size="md" />;
}

function postShareMetadata(post: RepostTarget): MessageMetadata {
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

function userShareMetadata(user: User): MessageMetadata {
  const name = getDisplayName(user, `用户 ${user.id}`);
  return {
    share_card: {
      type: 'user',
      user_id: user.id,
      name,
      username: user.username,
      avatar_url: user.avatar_url,
      bio: user.bio,
      profile_title: user.profile_title,
      profile_tagline: user.profile_tagline,
      profile_status: user.profile_status,
      ccw_name: user.ccw_name,
      ccw_avatar_url: user.ccw_avatar_url,
      ccw_student_oid: user.ccw_student_oid
    }
  };
}

function UserShareTargetModal({ user, currentUser, isMobile, onClose }: { user: User; currentUser: User; isMobile: boolean; onClose: () => void }): JSX.Element {
  const [query, setQuery] = useState('');
  const [targetConversationId, setTargetConversationId] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const conversationsQuery = useQuery({ queryKey: ['conversations'], queryFn: getConversations });
  const cleanQuery = query.trim().toLowerCase();
  const conversations = conversationsQuery.data ?? [];
  const filteredConversations = conversations.filter((conversation) => {
    const title = conversationDisplayTitle(conversation, currentUser);
    return !cleanQuery || title.toLowerCase().includes(cleanQuery) || String(conversation.id).includes(cleanQuery);
  });
  const selectedConversation = conversations.find((conversation) => conversation.id === targetConversationId) ?? null;
  const mutation = useMutation({
    mutationFn: () => {
      if (!targetConversationId) {
        throw new Error('请选择要发送的群聊或私聊');
      }
      const content = [note.trim(), `[个人名片] ${getDisplayName(user, `用户 ${user.id}`)}`].filter(Boolean).join('\n');
      return shareUserToConversation(targetConversationId, content.slice(0, 500), userShareMetadata(user));
    },
    onSuccess: () => {
      if (targetConversationId) {
        void queryClient.invalidateQueries({ queryKey: ['messages', targetConversationId] });
      }
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      onClose();
    },
    onError: (err) => setError(err instanceof Error ? err.message : '发送名片失败')
  });

  useEffect(() => {
    if (!isMobile) {
      return undefined;
    }
    return registerNativeBackHandler(() => {
      onClose();
      return true;
    }, 178);
  }, [isMobile, onClose]);

  const picker = (
    <div className={isMobile ? 'mt-3 rounded-[22px] bg-[#f4f6fa] p-3' : 'mt-4 rounded-3xl border p-3 [background:var(--kc-panel-muted)] [border-color:var(--kc-border)]'}>
      <label className={isMobile ? 'flex h-10 items-center gap-2 rounded-[16px] bg-white px-3' : 'flex h-10 items-center gap-2 rounded-2xl border px-3 [background:var(--kc-panel)] [border-color:var(--kc-border)]'}>
        <Icon name="search" className="h-4 w-4 shrink-0 [color:var(--kc-muted)]" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索群聊或私聊" className={isMobile ? 'min-w-0 flex-1 border-0 bg-transparent text-[14px] font-semibold text-[#151922] outline-none placeholder:text-[#a4adba]' : 'min-w-0 flex-1 border-0 bg-transparent text-sm outline-none [color:var(--kc-text)] placeholder:[color:var(--kc-muted)]'} />
      </label>
      <div className="scroll-soft mt-2 grid max-h-52 gap-1 overflow-y-auto">
        {conversationsQuery.isLoading ? <p className="px-3 py-2 text-sm [color:var(--kc-muted)]">正在加载会话...</p> : null}
        {!conversationsQuery.isLoading && filteredConversations.length === 0 ? <p className="px-3 py-2 text-sm [color:var(--kc-muted)]">没有找到匹配会话</p> : null}
        {filteredConversations.map((conversation) => {
          const title = conversationDisplayTitle(conversation, currentUser);
          const active = targetConversationId === conversation.id;
          return (
            <button key={conversation.id} type="button" onClick={() => setTargetConversationId(conversation.id)} className={`${isMobile ? 'rounded-[18px] bg-white px-3 py-2.5' : 'rounded-2xl px-3 py-2.5 hover:[background:var(--kc-hover)]'} flex items-center gap-3 text-left transition ${active ? '[background:var(--kc-active)] ring-2 ring-sky-100' : ''}`}>
              <ConversationShareAvatar conversation={conversation} title={title} />
              <span className="min-w-0 flex-1">
                <span className={isMobile ? 'block truncate text-[14px] font-bold text-[#151922]' : 'block truncate text-sm font-semibold [color:var(--kc-text)]'}>{title}</span>
                <span className="mt-0.5 block truncate text-xs [color:var(--kc-muted)]">{conversation.type === 'group' ? `群聊 · ${conversation.member_count ?? 0} 人` : '私聊'}</span>
              </span>
              {active ? <Icon name="check" className="h-4 w-4 shrink-0 [color:var(--kc-accent)]" /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
  const preview = (
    <div className={isMobile ? 'mt-3 rounded-[22px] bg-[#f4f6fa] p-4' : 'mt-4 rounded-3xl border p-4 [background:var(--kc-panel-muted)] [border-color:var(--kc-border)]'}>
      <div className="flex items-center gap-3">
        <Avatar user={user} size="md" />
        <span className="min-w-0 flex-1"><span className={isMobile ? 'block truncate text-[15px] font-black text-[#151922]' : 'block truncate text-sm font-black [color:var(--kc-text)]'}>{getDisplayName(user, `用户 ${user.id}`)}</span><span className="mt-0.5 block truncate text-xs [color:var(--kc-muted)]">个人名片 · {user.profile_title?.trim() || user.username || `ID ${user.id}`}</span></span>
      </div>
      <p className={isMobile ? 'mt-3 line-clamp-2 text-[13px] font-semibold leading-5 text-[#8b95a5]' : 'mt-3 line-clamp-2 text-sm leading-6 [color:var(--kc-muted)]'}>{user.profile_tagline?.trim() || user.bio?.trim() || '点击名片即可进入个人主页'}</p>
    </div>
  );

  if (isMobile) {
    return createPortal(
      <div className="fixed inset-0 z-[2147483646] [background:var(--kc-mobile-bg,#f1f3f8)]">
        <section className="kc-qq-page flex h-full min-h-0 flex-col overflow-hidden text-[#111827]">
          <MobileStatusBar />
          <header className="kc-qq-nav-header shrink-0">
            <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full bg-white text-[#526070]" aria-label="关闭分享"><Icon name="close" className="h-5 w-5" /></button>
            <div className="min-w-0 text-center"><h2 className="text-[17px] font-bold text-[#151922]">发送个人名片</h2><p className="text-[11px] font-semibold text-[#8b95a5]">选择一个群聊或好友</p></div>
            <button type="button" onClick={() => mutation.mutate()} disabled={!targetConversationId || mutation.isPending} className="rounded-full bg-[#168bff] px-4 py-2 text-[13px] font-bold text-white shadow-[0_8px_18px_rgba(22,139,255,0.2)] disabled:opacity-50">{mutation.isPending ? '发送中' : '发送'}</button>
          </header>
          <div className="kc-qq-scroll scroll-soft min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(var(--kc-mobile-bottom-nav-space)+24px)] pt-3">
            <section className="kc-qq-card p-4">
              <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={120} placeholder="可选，给名片加一句附言..." className="min-h-[92px] w-full resize-none rounded-[22px] border-0 bg-[#f4f6fa] px-4 py-3 text-[15px] font-medium leading-7 text-[#151922] outline-none placeholder:text-[#a4adba] focus:ring-2 focus:ring-sky-100" />
              {picker}
              {preview}
              {selectedConversation ? <p className="mt-3 rounded-2xl bg-[#eef7ff] px-3 py-2 text-[12px] font-bold text-[#168bff]">发送给：{conversationDisplayTitle(selectedConversation, currentUser)}</p> : null}
              {error ? <p className="mt-3 rounded-2xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-500">{error}</p> : null}
            </section>
          </div>
        </section>
      </div>,
      getKukePortalRoot()
    );
  }

  return createPortal(
    <div className="pointer-events-auto absolute inset-0 z-[2147483646] flex items-center justify-center p-6 [background:rgba(15,23,42,0.28)]" onMouseDown={onClose}>
      <section onMouseDown={(event) => event.stopPropagation()} className="flex max-h-[calc(100%-48px)] min-h-0 w-full max-w-[600px] flex-col overflow-hidden rounded-[30px] border shadow-float [background:var(--kc-panel)] [border-color:var(--kc-border)] [color:var(--kc-text)]">
        <header className="flex items-center justify-between border-b px-5 py-4 [border-color:var(--kc-border)]"><div className="flex items-center gap-3"><Avatar user={user} size="md" /><div><h2 className="text-base font-semibold">发送个人名片</h2><p className="text-xs [color:var(--kc-muted)]">选择要发送到的聊天</p></div></div><button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full [color:var(--kc-muted)] hover:[background:var(--kc-hover)]"><Icon name="close" className="h-5 w-5" /></button></header>
        <div className="scroll-soft min-h-0 flex-1 overflow-y-auto p-5">
          <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={120} placeholder="可选，给名片加一句附言..." className="min-h-[92px] w-full resize-none rounded-3xl border px-4 py-3 text-sm outline-none [background:var(--kc-panel-muted)] [border-color:var(--kc-border)] focus:[border-color:var(--kc-accent)]" />
          {picker}
          {preview}
          {selectedConversation ? <p className="mt-3 rounded-2xl px-3 py-2 text-xs font-semibold [background:var(--kc-accent-soft)] [color:var(--kc-accent)]">发送给：{conversationDisplayTitle(selectedConversation, currentUser)}</p> : null}
          {error ? <p className="mt-3 rounded-2xl px-3 py-2 text-xs [background:rgba(239,68,68,0.12)] [color:#dc2626]">{error}</p> : null}
        </div>
        <footer className="flex items-center justify-end border-t px-5 py-4 [border-color:var(--kc-border)]"><button type="button" onClick={() => mutation.mutate()} disabled={!targetConversationId || mutation.isPending} className="rounded-full px-5 py-2 text-sm font-semibold text-white [background:var(--kc-accent)] disabled:opacity-50">{mutation.isPending ? '发送中...' : '发送'}</button></footer>
      </section>
    </div>,
    getKukePortalRoot()
  );
}

function hasActiveTextSelection(): boolean {
  return Boolean(window.getSelection()?.toString().trim());
}

function legacyMentionToPlain(content: string): string {
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

function extractMentionUserIds(content: string, users: User[]): number[] {
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

function extractTopicNames(content: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const match of content.matchAll(/(^|\s)#([\w\u4e00-\u9fff][\w\u4e00-\u9fff-]{0,39})/g)) {
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

function mentionToken(user: User): string {
  return `@${getDisplayName(user)} `;
}

function replaceTriggerToken(value: string, token: string, cursor = value.length): string {
  const before = value.slice(0, cursor);
  const after = value.slice(cursor);
  const match = before.match(/(?:^|\s)([@#][\w\u4e00-\u9fff-]*)$/);
  if (!match || match.index === undefined) {
    return `${value}${value && !value.endsWith(' ') ? ' ' : ''}${token}`;
  }
  const prefixEnd = match[0].startsWith(' ') ? match.index + 1 : match.index;
  return `${before.slice(0, prefixEnd)}${token}${after}`;
}

function inputTrigger(value: string, cursor = value.length): { type: 'mention' | 'topic'; query: string } | null {
  const before = value.slice(0, cursor);
  const match = before.match(/(?:^|\s)([@#]([\w\u4e00-\u9fff-]{0,40}))$/);
  if (!match) {
    return null;
  }
  return { type: match[1].startsWith('@') ? 'mention' : 'topic', query: match[2] ?? '' };
}

function MentionTopicInput({ value, onChange, onPaste, friends, topics, multiline = false, disabled = false, maxLength, placeholder, className, suggestionLayerRef }: { value: string; onChange: (value: string) => void; onPaste?: (event: React.ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void; friends: User[]; topics: PostTopic[]; multiline?: boolean; disabled?: boolean; maxLength: number; placeholder: string; className: string; suggestionLayerRef?: React.RefObject<HTMLElement | null> }): JSX.Element {
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const [focused, setFocused] = useState(false);
  const [cursor, setCursor] = useState(value.length);
  const [suggestionRect, setSuggestionRect] = useState<{ left: number; top: number; width: number; maxHeight: number; placement: 'top' | 'bottom' } | null>(null);
  const trigger = inputTrigger(value, cursor);
  const query = trigger?.query.toLowerCase() ?? '';
  const topicSearchQuery = useQuery({
    queryKey: ['post-topics', 'search', query],
    queryFn: () => searchPostTopics(query, 8),
    enabled: focused && trigger?.type === 'topic',
    staleTime: 30_000
  });
  const friendMatches = trigger?.type === 'mention'
    ? friends.filter((user) => getDisplayName(user).toLowerCase().includes(query) || user.username.toLowerCase().includes(query)).slice(0, 8)
    : [];
  const topicOptions = mergeTopics(topicSearchQuery.data, topics);
  const topicMatches = trigger?.type === 'topic'
    ? topicOptions.filter((topic) => topic.name.toLowerCase().includes(query)).slice(0, 8)
    : [];
  const exactTopicExists = trigger?.type === 'topic' && Boolean(query) && topicOptions.some((topic) => topic.name.toLowerCase() === query);
  const topicSearchPending = trigger?.type === 'topic' && topicSearchQuery.isFetching;

  function updateCursorFromElement(): void {
    const nextCursor = inputRef.current?.selectionStart ?? value.length;
    setCursor(nextCursor);
  }

  function updateSuggestionRect(): void {
    const layer = suggestionLayerRef?.current;
    const input = inputRef.current;
    if (!layer || !input) {
      setSuggestionRect(null);
      return;
    }
    const inputRect = input.getBoundingClientRect();
    const layerRect = layer.getBoundingClientRect();
    const gap = 10;
    const edgePadding = 14;
    const spaceBelow = layerRect.bottom - inputRect.bottom - gap - edgePadding;
    const spaceAbove = inputRect.top - layerRect.top - gap - edgePadding;
    const placement: 'top' | 'bottom' = spaceBelow < 150 && spaceAbove > spaceBelow ? 'top' : 'bottom';
    const available = placement === 'top' ? spaceAbove : spaceBelow;
    setSuggestionRect({
      left: Math.max(edgePadding, inputRect.left - layerRect.left),
      top: placement === 'top' ? inputRect.top - layerRect.top - gap : inputRect.bottom - layerRect.top + gap,
      width: Math.min(inputRect.width, layerRect.width - edgePadding * 2),
      maxHeight: Math.max(120, Math.min(220, available)),
      placement
    });
  }

  function chooseMention(user: User): void {
    onChange(replaceTriggerToken(value, mentionToken(user), cursor));
    setCursor((current) => current + mentionToken(user).length);
  }

  function chooseTopic(name: string): void {
    const normalized = name.trim().replace(/^#/, '');
    if (normalized) {
      onChange(replaceTriggerToken(value, `#${normalized} `, cursor));
      setCursor((current) => current + normalized.length + 2);
    }
  }

  const commonProps = {
    value,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      onChange(event.target.value);
      setCursor(event.target.selectionStart ?? event.target.value.length);
    },
    onClick: updateCursorFromElement,
    onKeyUp: updateCursorFromElement,
    onSelect: updateCursorFromElement,
    onFocus: () => {
      setFocused(true);
      window.setTimeout(updateCursorFromElement, 0);
      window.setTimeout(updateSuggestionRect, 0);
    },
    onBlur: () => window.setTimeout(() => setFocused(false), 120),
    onPaste,
    disabled,
    maxLength,
    placeholder,
    className
  };

  useEffect(() => {
    if (!focused || !trigger || !suggestionLayerRef?.current) {
      return undefined;
    }
    updateSuggestionRect();
    window.addEventListener('resize', updateSuggestionRect);
    return () => window.removeEventListener('resize', updateSuggestionRect);
  }, [focused, trigger?.type, trigger?.query, value, suggestionLayerRef]);

  const suggestionPopup = focused && trigger ? (
    <div className={`kc-topic-suggest-popup ${suggestionLayerRef?.current ? 'pointer-events-auto absolute' : 'absolute left-0 right-0 top-[calc(100%+10px)]'} z-[80] overflow-y-auto overflow-x-hidden rounded-[18px] border border-black/10 bg-white p-1.5 text-[14px] leading-normal text-[#111827] shadow-[0_18px_42px_rgba(15,23,42,0.18)]`} style={suggestionLayerRef?.current && suggestionRect ? { left: suggestionRect.left, top: suggestionRect.top, width: suggestionRect.width, maxHeight: suggestionRect.maxHeight, transform: suggestionRect.placement === 'top' ? 'translateY(-100%)' : undefined } : { maxHeight: 220 }}>
      {trigger.type === 'mention' ? (
        friendMatches.length > 0 ? friendMatches.map((user) => (
          <button key={user.id} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => chooseMention(user)} className="flex w-full min-w-0 items-center gap-2.5 rounded-xl px-2.5 py-2 text-left font-bold transition hover:bg-slate-100">
            <span className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-full bg-sky-100 text-xs font-black text-[#0b84ff]">{getDisplayName(user).trim().slice(0, 1).toUpperCase() || '@'}</span>
            <span className="min-w-0 flex-1 truncate">@{getDisplayName(user)}</span>
          </button>
        )) : <p style={{ margin: 0, padding: '8px 10px', color: '#64748b', fontSize: 12, fontWeight: 600 }}>没有匹配的好友</p>
      ) : (
        <>
          {topicSearchPending ? <p style={{ margin: 0, padding: '8px 10px', color: '#64748b', fontSize: 12, fontWeight: 600 }}>正在搜索话题...</p> : null}
          {topicMatches.map((topic) => (
            <button key={topic.id} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => chooseTopic(topic.name)} className="flex w-full min-w-0 items-center gap-2.5 rounded-xl px-2.5 py-2 text-left font-bold transition hover:bg-slate-100">
              <span className="min-w-0 flex-1 truncate">#{topic.name}</span><span className="shrink-0 text-xs font-bold text-slate-500">{topic.post_count}</span>
            </button>
          ))}
          {query && !topicSearchPending && !exactTopicExists ? <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => chooseTopic(trigger.query)} className="flex w-full min-w-0 items-center gap-2.5 rounded-xl px-2.5 py-2 text-left font-bold text-[#0b84ff] transition hover:bg-sky-50"><span className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-sky-100 text-base leading-[18px] text-[#0b84ff]">+</span> 创建新话题 #{trigger.query}</button> : null}
          {!query && topicMatches.length === 0 ? <p style={{ margin: 0, padding: '8px 10px', color: '#64748b', fontSize: 12, fontWeight: 600 }}>输入话题名称</p> : null}
        </>
      )}
    </div>
  ) : null;

  return (
    <div className="relative min-w-0 flex-1 basis-0">
      {multiline ? <textarea ref={(node) => { inputRef.current = node; }} {...commonProps} /> : <input ref={(node) => { inputRef.current = node; }} {...commonProps} />}
      {suggestionLayerRef?.current && suggestionPopup ? createPortal(suggestionPopup, suggestionLayerRef.current) : suggestionPopup}
    </div>
  );
}

function renderRichText(content: string, onOpenUserSpace: (user: User | null | undefined, fallbackId: number) => void, onSelectTopic?: (topic: string) => void, mentionUsers: User[] = []): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const plainMentionUsers = uniqueMentionUsers(mentionUsers).sort((a, b) => getDisplayName(b).length - getDisplayName(a).length);
  const mentionNames = plainMentionUsers.map((user) => escapeRegExp(getDisplayName(user).trim())).filter(Boolean).join('|');
  const pattern = new RegExp(`@\\[([^\\]]+)]\\((\\d+)\\)${mentionNames ? `|(^|\\s)@(${mentionNames})(?=\\s|$|[，。！？,.!?])` : ''}|(^|\\s)#([\\w\\u4e00-\\u9fff][\\w\\u4e00-\\u9fff-]{0,39})`, 'g');
  let lastIndex = 0;
  for (const match of content.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      nodes.push(content.slice(lastIndex, index));
    }
    if (match[1] && match[2]) {
      const userId = Number(match[2]);
      nodes.push(<button key={`mention-${index}-${userId}`} type="button" onClick={() => onOpenUserSpace(null, userId)} className="font-bold [color:var(--kc-accent)] hover:underline">@{match[1]}</button>);
    } else if (match[4]) {
      const prefix = match[3] ?? '';
      const name = match[4];
      const user = plainMentionUsers.find((item) => getDisplayName(item) === name);
      if (prefix) {
        nodes.push(prefix);
      }
      nodes.push(<button key={`mention-plain-${index}-${user?.id ?? name}`} type="button" onClick={() => user ? onOpenUserSpace(user, user.id) : undefined} className="inline-flex rounded-md px-1 font-bold [background:var(--kc-accent-soft)] [color:var(--kc-accent)] hover:underline">@{name}</button>);
    } else if (match[6]) {
      const prefix = match[5] ?? '';
      const topic = match[6];
      if (prefix) {
        nodes.push(prefix);
      }
      nodes.push(<button key={`topic-${index}-${topic}`} type="button" onClick={() => onSelectTopic?.(topic)} className="font-bold [color:var(--kc-accent)] hover:underline">#{topic}</button>);
    }
    lastIndex = index + match[0].length;
  }
  if (lastIndex < content.length) {
    nodes.push(content.slice(lastIndex));
  }
  return nodes.length ? nodes : [content];
}

function renderRichTextSafe(content: string, onOpenUserSpace: (user: User | null | undefined, fallbackId: number) => void, onSelectTopic?: (topic: string) => void, mentionUsers: User[] = [], interactive = true): ReactNode[] {
  if (!interactive) {
    return [content];
  }
  if (POST_URL_PATTERN.test(content)) {
    POST_URL_PATTERN.lastIndex = 0;
    const nodes: ReactNode[] = [];
    content.split(POST_URL_PATTERN).forEach((part, index) => {
      if (!part) {
        return;
      }
      if (/^https?:\/\/[^\s]+$/i.test(part)) {
        nodes.push(<a key={`url-${index}`} href={part} target="_blank" rel="noreferrer" className="font-bold [color:var(--kc-accent)] hover:underline [overflow-wrap:anywhere]">{part}</a>);
        return;
      }
      nodes.push(...renderRichTextSafe(part, onOpenUserSpace, onSelectTopic, mentionUsers));
    });
    return nodes;
  }
  POST_URL_PATTERN.lastIndex = 0;
  const mentionUsersByName = uniqueMentionUsers(mentionUsers).sort((a, b) => getDisplayName(b).length - getDisplayName(a).length);
  const mentionNames = mentionUsersByName.map((user) => escapeRegExp(getDisplayName(user).trim())).filter(Boolean).join('|');
  const patterns = [
    '@\\[([^\\]]+)]\\((\\d+)\\)',
    mentionNames ? `(^|\\s)@(${mentionNames})(?=\\s|$|[，。！？,.!?])` : '',
    '(^|\\s)#([\\w\\u4e00-\\u9fff][\\w\\u4e00-\\u9fff-]{0,39})'
  ].filter(Boolean);
  const matcher = new RegExp(patterns.join('|'), 'g');
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  for (const match of content.matchAll(matcher)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      nodes.push(content.slice(lastIndex, index));
    }
    if (match[1] && match[2]) {
      const userId = Number(match[2]);
      nodes.push(<button key={`legacy-mention-${index}-${userId}`} type="button" onClick={() => onOpenUserSpace(null, userId)} className="inline-flex rounded-md px-1 font-bold [background:var(--kc-accent-soft)] [color:var(--kc-accent)] hover:underline">@{match[1]}</button>);
    } else if (mentionNames && match[4]) {
      const prefix = match[3] ?? '';
      const name = match[4];
      const user = mentionUsersByName.find((item) => getDisplayName(item) === name);
      if (prefix) {
        nodes.push(prefix);
      }
      nodes.push(<button key={`plain-mention-${index}-${user?.id ?? name}`} type="button" onClick={() => user ? onOpenUserSpace(user, user.id) : undefined} className="inline-flex rounded-md px-1 font-bold [background:var(--kc-accent-soft)] [color:var(--kc-accent)] hover:underline">@{name}</button>);
    } else {
      const prefixIndex = mentionNames ? 5 : 3;
      const topicIndex = mentionNames ? 6 : 4;
      const prefix = match[prefixIndex] ?? '';
      const topic = match[topicIndex];
      if (topic) {
        if (prefix) {
          nodes.push(prefix);
        }
        nodes.push(<button key={`topic-${index}-${topic}`} type="button" onClick={() => onSelectTopic?.(topic)} className="font-bold [color:var(--kc-accent)] hover:underline">#{topic}</button>);
      }
    }
    lastIndex = index + match[0].length;
  }
  if (lastIndex < content.length) {
    nodes.push(content.slice(lastIndex));
  }
  return nodes.length ? nodes : [content];
}

function CcwCreationCards({ previews = [], compact = false }: { previews?: CcwCreationPreview[]; compact?: boolean }): JSX.Element | null {
  if (previews.length === 0) {
    return null;
  }
  return <div className="space-y-2">{previews.map((preview) => <CcwCreationCard key={`${preview.oid}:${preview.access_key ?? ''}`} oid={preview.oid} accessKey={preview.access_key ?? undefined} preview={preview} compact={compact} />)}</div>;
}

function notificationText(notification: PostNotification): string {
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

function likeSummaryText(post: Post): string {
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

function profileAccent(user: User | null | undefined): string {
  const value = user?.profile_accent_color ?? '';
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#168bff';
}

function profileCover(user: User | null | undefined, isSelf = false): string | null {
  if (isSelf && user?.profile_cover_moderation_status === 'pending' && user.profile_cover_pending_url) {
    return user.profile_cover_pending_url;
  }
  return user?.profile_cover_url ?? null;
}

function interestList(value: string | null | undefined): string[] {
  return (value ?? '').split(/[，,\s]+/).map((item) => item.trim()).filter(Boolean).slice(0, 8);
}

function profilePanelClass(style: string | null | undefined, coverUrl: string | null): string {
  if (style === 'glass') {
    return coverUrl ? 'bg-white/16 text-white backdrop-blur-md' : '[background:color-mix(in_srgb,var(--kc-panel)_72%,transparent)] backdrop-blur [border-color:var(--kc-border)]';
  }
  if (style === 'solid') {
    return coverUrl ? 'bg-white text-slate-950' : '[background:var(--kc-panel)] [border-color:var(--kc-border)]';
  }
  return coverUrl ? 'bg-white/78 text-slate-950 backdrop-blur' : '[background:var(--kc-panel-muted)] [border-color:var(--kc-border)]';
}

function normalizeProfileLayout(value: string | null | undefined): ProfileLayout {
  return profileLayoutOptions.some((option) => option.value === value) ? value as ProfileLayout : 'classic';
}

function normalizeProfileCardStyle(value: string | null | undefined): ProfileCardStyle {
  return profileCardStyleOptions.some((option) => option.value === value) ? value as ProfileCardStyle : 'soft';
}

function profileCoverClasses(layout: ProfileLayout, isMobile: boolean): string {
  if (isMobile) {
    if (layout === 'banner') {
      return 'min-h-[310px] rounded-b-[34px] px-4 pb-6 pt-3';
    }
    if (layout === 'compact') {
      return 'min-h-[184px] rounded-b-[24px] px-4 pb-4 pt-3';
    }
    return 'min-h-[246px] rounded-b-[30px] px-4 pb-5 pt-3';
  }
  if (layout === 'banner') {
    return 'min-h-[300px]';
  }
  if (layout === 'compact') {
    return 'min-h-[148px]';
  }
  return 'min-h-[220px]';
}

function profileContentMaxClass(layout: ProfileLayout): string {
  if (layout === 'banner') {
    return 'max-w-[1040px]';
  }
  if (layout === 'compact') {
    return 'max-w-[820px]';
  }
  return 'max-w-[940px]';
}

function profilePostGapClass(layout: ProfileLayout): string {
  if (layout === 'banner') {
    return 'grid gap-4';
  }
  if (layout === 'compact') {
    return 'grid gap-2';
  }
  return 'grid gap-3';
}

function PostImageGrid({ images, onOpenImage }: { images: string[]; onOpenImage: (images: string[], index: number) => void }): JSX.Element | null {
  if (images.length === 0) {
    return null;
  }
  const validImages = images.filter((imageUrl) => resolveAssetUrl(imageUrl) && resolveThumbnailUrl(imageUrl));
  if (validImages.length === 0) {
    return null;
  }
  const gridClass = validImages.length === 1 ? 'grid-cols-1' : validImages.length === 2 ? 'grid-cols-2' : 'grid-cols-3';
  const maxWidth = validImages.length === 1 ? 340 : 430;
  return (
    <div className={`mt-3 grid min-w-0 max-w-full gap-2 ${gridClass}`} style={{ width: '100%', maxWidth }}>
      {validImages.map((imageUrl, index) => {
        const resolved = resolveThumbnailUrl(imageUrl);
        if (!resolved) {
          return null;
        }
        return (
          <button type="button" key={`${imageUrl}-${index}`} onClick={(event) => { event.stopPropagation(); onOpenImage(validImages, index); }} className={`group overflow-hidden rounded-[16px] border text-left [background:var(--kc-panel-muted)] [border-color:var(--kc-border)] ${validImages.length === 1 ? 'aspect-[4/3]' : 'aspect-square'}`}>
            <img src={resolved} alt={`动态图片 ${index + 1}`} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.04]" />
          </button>
        );
      })}
    </div>
  );
}

function RepostPreviewCard({ post, isMobile, onOpenPost, onOpenImage }: { post: RepostTarget | null | undefined; isMobile: boolean; onOpenPost: (postId: number) => void; onOpenImage?: (images: string[], index: number) => void }): JSX.Element {
  if (!post) {
    return (
      <div className={`${isMobile ? 'bg-[#f4f6fa] text-[#8b95a5]' : '[background:var(--kc-panel-muted)] [color:var(--kc-muted)]'} mt-4 rounded-[20px] px-4 py-5 text-sm font-semibold`}>
        原动态不可见或已删除
      </div>
    );
  }
  return (
    <div role="button" tabIndex={0} onClick={() => { if (!hasActiveTextSelection()) { onOpenPost(post.id); } }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpenPost(post.id); } }} className={`${isMobile ? 'bg-[#f4f6fa] text-[#151922]' : '[background:var(--kc-panel-muted)] [color:var(--kc-text)]'} mt-4 block w-full cursor-pointer select-text rounded-[20px] p-3 text-left transition hover:ring-2 hover:ring-sky-100`}>
      <div className="flex min-w-0 items-center gap-2 text-sm font-bold">
        <Avatar user={post.author} size="sm" />
        <span className="truncate">{getDisplayName(post.author, `用户 ${post.author_id}`)}</span>
        <span className="shrink-0 text-xs font-semibold [color:var(--kc-muted)]">{formatTime(post.created_at)}</span>
      </div>
      {post.content ? <><p className={`${isMobile ? 'text-[#151922]' : '[color:var(--kc-text)]'} mt-2 line-clamp-4 select-text whitespace-pre-wrap break-words text-sm leading-6`}>{post.content}</p><CcwCreationCards previews={post.ccw_creations} compact={isMobile} /></> : null}
      <PostImageGrid images={post.image_urls ?? []} onOpenImage={onOpenImage ?? (() => undefined)} />
    </div>
  );
}

function RepostModal({ post, currentUser, isMobile, onClose }: { post: Post; currentUser: User; isMobile: boolean; onClose: () => void }): JSX.Element {
  const [content, setContent] = useState('');
  const [visibility, setVisibility] = useState<PostVisibility>('public');
  const [mode, setMode] = useState<'zone' | 'chat'>('zone');
  const [targetConversationId, setTargetConversationId] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [imageViewer, setImageViewer] = useState<ImageViewerState | null>(null);
  const queryClient = useQueryClient();
  const conversationsQuery = useQuery({ queryKey: ['conversations'], queryFn: getConversations, enabled: mode === 'chat' });

  useEffect(() => {
    if (!isMobile) {
      return undefined;
    }
    return registerNativeBackHandler(() => {
      onClose();
      return true;
    }, 175);
  }, [isMobile, onClose]);

  const mutation = useMutation<unknown, Error>({
    mutationFn: () => {
      if (mode === 'chat') {
        if (!targetConversationId) {
          throw new Error('请选择要发送的群聊或私聊');
        }
        const shareTarget = previewPost;
        const summary = shareTarget.content.trim() || '分享了一条动态';
        const messageContent = [content.trim(), `[动态] ${getDisplayName(shareTarget.author, `用户 ${shareTarget.author_id}`)}：${summary}`].filter(Boolean).join('\n');
        return sharePostToConversation(targetConversationId, messageContent.slice(0, 500), postShareMetadata(shareTarget));
      }
      return repostPost(post.id, { content: content.trim(), visibility });
    },
    onSuccess: () => {
      if (mode === 'chat' && targetConversationId) {
        void queryClient.invalidateQueries({ queryKey: ['messages', targetConversationId] });
        void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      } else {
        invalidatePosts(queryClient);
      }
      onClose();
    },
    onError: (err) => setError(err instanceof Error ? err.message : '转发失败')
  });
  const canSubmit = !mutation.isPending && (mode === 'zone' || Boolean(targetConversationId));
  const previewPost = post.repost_of ?? post;
  const cleanQuery = query.trim().toLowerCase();
  const conversations = conversationsQuery.data ?? [];
  const filteredConversations = conversations.filter((conversation) => {
    const title = conversationDisplayTitle(conversation, currentUser);
    return !cleanQuery || title.toLowerCase().includes(cleanQuery) || String(conversation.id).includes(cleanQuery);
  });

  const modeTabs = (
    <div className={isMobile ? 'mb-3 grid grid-cols-2 gap-2' : 'mb-4 grid grid-cols-2 gap-2'}>
      <button type="button" onClick={() => setMode('zone')} className={`${isMobile ? 'rounded-[18px] py-2 text-[13px] font-bold' : 'rounded-2xl py-2 text-sm font-semibold'} transition ${mode === 'zone' ? 'bg-[#168bff] text-white [background:var(--kc-accent)]' : isMobile ? 'bg-[#f4f6fa] text-[#8b95a5]' : '[background:var(--kc-panel-muted)] [color:var(--kc-muted)]'}`}>转发到动态</button>
      <button type="button" onClick={() => setMode('chat')} className={`${isMobile ? 'rounded-[18px] py-2 text-[13px] font-bold' : 'rounded-2xl py-2 text-sm font-semibold'} transition ${mode === 'chat' ? 'bg-[#168bff] text-white [background:var(--kc-accent)]' : isMobile ? 'bg-[#f4f6fa] text-[#8b95a5]' : '[background:var(--kc-panel-muted)] [color:var(--kc-muted)]'}`}>发送到聊天</button>
    </div>
  );

  const targetPicker = mode === 'chat' ? (
    <div className={isMobile ? 'mt-3 rounded-[22px] bg-[#f4f6fa] p-3' : 'mt-4 rounded-3xl border p-3 [background:var(--kc-panel-muted)] [border-color:var(--kc-border)]'}>
      <label className={isMobile ? 'flex h-10 items-center gap-2 rounded-[16px] bg-white px-3' : 'flex h-10 items-center gap-2 rounded-2xl border px-3 [background:var(--kc-panel)] [border-color:var(--kc-border)]'}>
        <Icon name="search" className="h-4 w-4 shrink-0 [color:var(--kc-muted)]" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索群聊或私聊" className={isMobile ? 'min-w-0 flex-1 border-0 bg-transparent text-[14px] font-semibold text-[#151922] outline-none placeholder:text-[#a4adba]' : 'min-w-0 flex-1 border-0 bg-transparent text-sm outline-none [color:var(--kc-text)] placeholder:[color:var(--kc-muted)]'} />
      </label>
      <div className="scroll-soft mt-2 grid max-h-52 gap-1 overflow-y-auto">
        {conversationsQuery.isLoading ? <p className="px-3 py-2 text-sm [color:var(--kc-muted)]">正在加载会话...</p> : null}
        {!conversationsQuery.isLoading && filteredConversations.length === 0 ? <p className="px-3 py-2 text-sm [color:var(--kc-muted)]">没有找到匹配会话</p> : null}
        {filteredConversations.map((conversation) => {
          const title = conversationDisplayTitle(conversation, currentUser);
          const active = targetConversationId === conversation.id;
          return (
            <button key={conversation.id} type="button" onClick={() => setTargetConversationId(conversation.id)} className={`${isMobile ? 'rounded-[18px] bg-white px-3 py-2.5' : 'rounded-2xl px-3 py-2.5 hover:[background:var(--kc-hover)]'} flex items-center gap-3 text-left transition ${active ? '[background:var(--kc-active)] ring-2 ring-sky-100' : ''}`}>
              <ConversationShareAvatar conversation={conversation} title={title} />
              <span className="min-w-0 flex-1">
                <span className={isMobile ? 'block truncate text-[14px] font-bold text-[#151922]' : 'block truncate text-sm font-semibold [color:var(--kc-text)]'}>{title}</span>
                <span className="mt-0.5 block truncate text-xs [color:var(--kc-muted)]">{conversation.type === 'group' ? `群聊 · ${conversation.member_count ?? 0} 人` : '私聊'}</span>
              </span>
              {active ? <Icon name="check" className="h-4 w-4 shrink-0 [color:var(--kc-accent)]" /> : null}
            </button>
          );
        })}
      </div>
    </div>
  ) : null;

  if (isMobile) {
    const mobileModal = (
      <div className="fixed inset-0 z-[2147483646] [background:var(--kc-mobile-bg,#f1f3f8)]">
        <section className="kc-qq-page flex h-full min-h-0 flex-col overflow-hidden text-[#111827]">
          <header className="kc-qq-nav-header kc-qq-nav-header-mobile-safe shrink-0">
            <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full bg-white text-[#526070]" aria-label="关闭转发"><Icon name="close" className="h-5 w-5" /></button>
            <div className="min-w-0 text-center">
              <h2 className="text-[17px] font-bold text-[#151922]">转发动态</h2>
              <p className="text-[11px] font-semibold text-[#8b95a5]">转发到动态或聊天</p>
            </div>
            <button type="button" onClick={() => mutation.mutate()} disabled={!canSubmit} className="rounded-full bg-[#168bff] px-4 py-2 text-[13px] font-bold text-white shadow-[0_8px_18px_rgba(22,139,255,0.2)] disabled:opacity-50">
              {mutation.isPending ? '转发中' : '转发'}
            </button>
          </header>
          <div className="kc-qq-scroll scroll-soft min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-3">
            <section className="kc-qq-card p-4">
              {modeTabs}
              <div className="mb-4 flex items-center gap-3">
                <Avatar user={currentUser} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-bold text-[#151922]">{getDisplayName(currentUser)}</p>
                  <p className="text-[12px] font-semibold text-[#8b95a5]">{mode === 'chat' ? '发送动态卡片到会话' : '转发后会进入审核'}</p>
                </div>
              </div>
              <textarea value={content} onChange={(event) => setContent(event.target.value)} maxLength={2000} placeholder="说说转发理由..." className="min-h-[120px] w-full resize-none rounded-[22px] border-0 bg-[#f4f6fa] px-4 py-3 text-[15px] font-medium leading-7 text-[#151922] outline-none placeholder:text-[#a4adba] focus:ring-2 focus:ring-sky-100" />
              {mode === 'zone' ? <div className="mt-3 flex flex-wrap items-center gap-2">
                {(['public', 'friends', 'private'] as PostVisibility[]).map((item) => (
                  <button key={item} type="button" onClick={() => setVisibility(item)} className={`rounded-full px-3 py-2 text-[12px] font-bold transition ${visibility === item ? 'bg-[#168bff] text-white shadow-[0_8px_18px_rgba(22,139,255,0.18)]' : 'bg-[#f4f6fa] text-[#8b95a5]'}`}>
                    {visibilityLabel(item)}
                  </button>
                ))}
              </div> : null}
              {targetPicker}
              <RepostPreviewCard post={previewPost} isMobile={isMobile} onOpenPost={() => undefined} onOpenImage={(images, index) => setImageViewer({ images, index })} />
              {error ? <p className="mt-3 rounded-2xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-500">{error}</p> : null}
            </section>
          </div>
        </section>
        {imageViewer ? <ImageViewer viewer={imageViewer} mobile={isMobile} onClose={() => setImageViewer(null)} onNavigate={(index) => setImageViewer((current) => current ? { ...current, index } : current)} /> : null}
      </div>
    );
    return createPortal(mobileModal, getKukePortalRoot());
  }

  const desktopModal = (
    <div className="pointer-events-auto absolute inset-0 z-[2147483646] flex items-center justify-center p-6 [background:rgba(15,23,42,0.28)]" onMouseDown={onClose}>
      <section onMouseDown={(event) => event.stopPropagation()} className="flex max-h-[calc(100%-48px)] min-h-0 w-full max-w-[640px] flex-col overflow-hidden rounded-[30px] border shadow-float [background:var(--kc-panel)] [border-color:var(--kc-border)] [color:var(--kc-text)]">
        <header className="flex items-center justify-between border-b px-5 py-4 [border-color:var(--kc-border)]">
          <div className="flex items-center gap-3">
            <Avatar user={currentUser} size="md" />
            <div>
              <h2 className="text-base font-semibold">转发动态</h2>
              <p className="text-xs [color:var(--kc-muted)]">转发到动态或聊天</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full [color:var(--kc-muted)] hover:[background:var(--kc-hover)]"><Icon name="close" className="h-5 w-5" /></button>
        </header>
        <div className="scroll-soft min-h-0 flex-1 overflow-y-auto p-5">
          {modeTabs}
          <textarea value={content} onChange={(event) => setContent(event.target.value)} maxLength={2000} placeholder={mode === 'chat' ? '可选，给动态卡片加一句附言...' : '说说转发理由...'} className="min-h-[120px] w-full resize-none rounded-3xl border px-4 py-3 text-sm outline-none [background:var(--kc-panel-muted)] [border-color:var(--kc-border)] focus:[border-color:var(--kc-accent)]" />
          {mode === 'zone' ? <div className="mt-4 flex flex-wrap items-center gap-2">
            {(['public', 'friends', 'private'] as PostVisibility[]).map((item) => (
              <button key={item} type="button" onClick={() => setVisibility(item)} className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${visibility === item ? '[background:var(--kc-accent)] text-white' : '[background:var(--kc-panel-muted)] [color:var(--kc-muted)] hover:[color:var(--kc-text)]'}`}>
                {visibilityLabel(item)}
              </button>
            ))}
          </div> : null}
          {targetPicker}
          <RepostPreviewCard post={previewPost} isMobile={isMobile} onOpenPost={() => undefined} onOpenImage={(images, index) => setImageViewer({ images, index })} />
          {error ? <p className="mt-3 rounded-2xl px-3 py-2 text-xs [background:rgba(239,68,68,0.12)] [color:#dc2626]">{error}</p> : null}
        </div>
        <footer className="flex items-center justify-end border-t px-5 py-4 [border-color:var(--kc-border)]">
          <button type="button" onClick={() => mutation.mutate()} disabled={!canSubmit} className="rounded-full px-5 py-2 text-sm font-semibold text-white [background:var(--kc-accent)] disabled:opacity-50">
            {mutation.isPending ? '转发中...' : '转发'}
          </button>
        </footer>
      </section>
      {imageViewer ? <ImageViewer viewer={imageViewer} mobile={isMobile} onClose={() => setImageViewer(null)} onNavigate={(index) => setImageViewer((current) => current ? { ...current, index } : current)} /> : null}
    </div>
  );
  return createPortal(desktopModal, getKukePortalRoot());
}

function ComposerModal({ currentUser, isMobile, editingPost, onClose, transitionStyle }: { currentUser: User; isMobile: boolean; editingPost?: Post | null; onClose: () => void; transitionStyle?: CSSProperties }): JSX.Element {
  const savedDraft = !editingPost ? loadComposerDraft(currentUser.id) : null;
  const [content, setContent] = useState(editingPost?.content ?? savedDraft?.content ?? '');
  const [visibility, setVisibility] = useState<PostVisibility>(editingPost?.visibility ?? savedDraft?.visibility ?? 'public');
  const [images, setImages] = useState<ComposerImage[]>([]);
  const [existingImageUrls, setExistingImageUrls] = useState<string[]>(editingPost?.image_urls ?? []);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const suggestionLayerRef = useRef<HTMLDivElement | null>(null);
  const imagesRef = useRef<ComposerImage[]>([]);
  const queryClient = useQueryClient();
  const friendsQuery = useQuery({ queryKey: ['friends'], queryFn: getFriends });
  const topicsQuery = useQuery({ queryKey: ['post-topics'], queryFn: () => getTrendingPostTopics(5) });
  const isEditing = Boolean(editingPost);

  useEffect(() => {
    if (!isMobile) {
      return undefined;
    }
    return registerNativeBackHandler(() => {
      onClose();
      return true;
    }, 170);
  }, [isMobile, onClose]);

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  useEffect(() => {
    if (!isEditing) {
      saveComposerDraft(currentUser.id, { content, visibility });
    }
  }, [content, currentUser.id, isEditing, visibility]);

  useEffect(() => () => {
    imagesRef.current.forEach((image) => URL.revokeObjectURL(image.previewUrl));
  }, []);

  const mutation = useMutation({
    mutationFn: async () => {
      const uploadedUrls: string[] = [];
      for (const image of images) {
        const uploaded = await uploadPostImage(image.file);
        uploadedUrls.push(uploaded.url);
      }
      const nextImageUrls = [...existingImageUrls, ...uploadedUrls];
      const payload = { content: legacyMentionToPlain(content.trim()), visibility, image_urls: nextImageUrls, mention_user_ids: extractMentionUserIds(content, friendUsers), topic_names: extractTopicNames(content) };
      return editingPost ? updatePost(editingPost.id, payload) : createPost(payload);
    },
    onSuccess: () => {
      if (!isEditing) {
        clearComposerDraft(currentUser.id);
      }
      invalidatePosts(queryClient);
      onClose();
    },
    onError: (err) => setError(err instanceof Error ? err.message : (editingPost ? '编辑失败' : '发布失败'))
  });

  function stageFiles(files: FileList | File[]): void {
    const nextFiles = Array.from(files);
    setError(null);
    setImages((current) => {
      const available = Math.max(0, MAX_IMAGES - existingImageUrls.length - current.length);
      if (available === 0) {
        setError(`最多只能上传 ${MAX_IMAGES} 张图片`);
        return current;
      }
      const accepted: ComposerImage[] = [];
      for (const file of nextFiles.slice(0, available)) {
        if (!file.type.startsWith('image/')) {
          setError('只能上传图片文件');
          continue;
        }
        if (file.size > MAX_IMAGE_BYTES) {
          setError('单张图片不能超过 3MB');
          continue;
        }
        accepted.push({ id: `${file.name}-${file.size}-${randomId()}`, file, previewUrl: URL.createObjectURL(file) });
      }
      return [...current, ...accepted];
    });
  }

  function removeImage(id: string): void {
    setImages((current) => {
      const target = current.find((image) => image.id === id);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return current.filter((image) => image.id !== id);
    });
  }

  function removeExistingImage(url: string): void {
    setExistingImageUrls((current) => current.filter((item) => item !== url));
  }

  function handlePaste(event: React.ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>): void {
    const pastedFiles = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith('image/'));
    if (pastedFiles.length === 0) {
      return;
    }
    event.preventDefault();
    stageFiles(pastedFiles);
  }

  const friendUsers = (friendsQuery.data ?? []).map((friend) => friend.friend ?? friend.user).filter((user): user is User => Boolean(user) && user.id !== currentUser.id);
  const topicOptions = topicsQuery.data ?? [];
  const canSubmit = Boolean(content.trim() || images.length > 0 || existingImageUrls.length > 0 || editingPost?.repost_of_id) && !mutation.isPending;
  const title = isEditing ? '编辑动态' : '发表动态';

  if (isMobile) {
    const mobileModal = (
      <div className="kc-space-secondary-page pointer-events-auto fixed inset-0 z-[2147483646] [background:var(--kc-mobile-bg,#f1f3f8)]" style={transitionStyle} onMouseDown={undefined}>
        <section onMouseDown={(event) => event.stopPropagation()} className="kc-qq-page flex h-full min-h-0 flex-col overflow-hidden text-[#111827]">
          <header className="kc-qq-nav-header kc-qq-nav-header-mobile-safe shrink-0">
            <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full bg-white text-[#526070]" aria-label="关闭发布动态">
              <Icon name="close" className="h-5 w-5" />
            </button>
            <div className="min-w-0 text-center">
              <h2 className="text-[17px] font-bold text-[#151922]">{title}</h2>
              <p className="text-[11px] font-semibold text-[#8b95a5]">支持 #话题 和 @好友</p>
            </div>
            <button type="button" onClick={() => mutation.mutate()} disabled={!canSubmit} className="rounded-full bg-[#168bff] px-4 py-2 text-[13px] font-bold text-white shadow-[0_8px_18px_rgba(22,139,255,0.2)] disabled:opacity-50">
              {mutation.isPending ? (isEditing ? '保存中' : '发布中') : (isEditing ? '保存' : '发布')}
            </button>
          </header>
          <div className="kc-qq-scroll scroll-soft min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-3">
            <section className="kc-qq-card p-4">
              <div className="mb-4 flex items-center gap-3">
                <Avatar user={currentUser} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-bold text-[#151922]">{getDisplayName(currentUser)}</p>
                  <p className="text-[12px] font-semibold text-[#8b95a5]">记录此刻，发布后会进入审核</p>
                </div>
              </div>
              <MentionTopicInput value={content} onChange={setContent} onPaste={handlePaste} friends={friendUsers} topics={topicOptions} suggestionLayerRef={suggestionLayerRef} multiline maxLength={2000} placeholder="这一刻的想法..." className="min-h-[180px] w-full resize-none rounded-[22px] border-0 bg-[#f4f6fa] px-4 py-3 text-[15px] font-medium leading-7 text-[#151922] outline-none placeholder:text-[#a4adba] focus:ring-2 focus:ring-sky-100" />
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {(['public', 'friends', 'private'] as PostVisibility[]).map((item) => (
                  <button key={item} type="button" onClick={() => setVisibility(item)} className={`rounded-full px-3 py-2 text-[12px] font-bold transition ${visibility === item ? 'bg-[#168bff] text-white shadow-[0_8px_18px_rgba(22,139,255,0.18)]' : 'bg-[#f4f6fa] text-[#8b95a5]'}`}>
                    {visibilityLabel(item)}
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={existingImageUrls.length + images.length >= MAX_IMAGES || mutation.isPending} className="mt-3 flex w-full min-h-12 items-center justify-center gap-2 rounded-[20px] bg-[#eaf4ff] px-4 py-3 text-[14px] font-bold text-[#168bff] shadow-sm disabled:opacity-50">
                <Icon name="image" className="h-5 w-5" /> 添加图片 {existingImageUrls.length + images.length}/{MAX_IMAGES}
              </button>
              {existingImageUrls.length > 0 || images.length > 0 ? (
                <div className="mt-4 grid grid-cols-3 gap-2">
                  {existingImageUrls.map((url) => (
                    <div key={url} className="group relative aspect-square overflow-hidden rounded-[18px] bg-[#f4f6fa]">
                      <img src={resolveThumbnailUrl(url)} alt="已上传图片" className="h-full w-full object-cover" />
                      <button type="button" onClick={() => removeExistingImage(url)} className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-black/50 text-white opacity-90" aria-label="移除图片"><Icon name="close" className="h-4 w-4" /></button>
                    </div>
                  ))}
                  {images.map((image) => (
                    <div key={image.id} className="group relative aspect-square overflow-hidden rounded-[18px] bg-[#f4f6fa]">
                      <img src={image.previewUrl} alt="待发布图片" className="h-full w-full object-cover" />
                      <button type="button" onClick={() => removeImage(image.id)} className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-black/50 text-white opacity-90" aria-label="移除图片">
                        <Icon name="close" className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
              <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple className="hidden" onChange={(event) => {
                if (event.target.files) {
                  stageFiles(event.target.files);
                }
                event.target.value = '';
              }} />
              {error ? <p className="mt-3 rounded-2xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-500">{error}</p> : null}
            </section>
          </div>
        </section>
        <div ref={suggestionLayerRef} className="pointer-events-none absolute inset-0 z-[2147483647]" />
      </div>
    );
    return createPortal(mobileModal, getKukePortalRoot());
  }

  return (
    <div className={`fixed inset-0 z-[2147483646] ${isMobile ? '[background:var(--kc-chat)]' : 'grid place-items-center p-4 [background:rgba(15,23,42,0.28)]'}`} onMouseDown={isMobile ? undefined : onClose}>
      <section onMouseDown={(event) => event.stopPropagation()} className={`${isMobile ? 'flex h-full flex-col rounded-none' : 'flex max-h-[88vh] w-full max-w-[720px] flex-col overflow-hidden rounded-[30px] border shadow-float [border-color:var(--kc-border)]'} [background:var(--kc-panel)] [color:var(--kc-text)]`}>
        <header className={`flex items-center justify-between border-b px-5 py-4 [border-color:var(--kc-border)] ${isMobile ? 'pt-[max(18px,env(safe-area-inset-top))]' : ''}`}>
          <div className="flex items-center gap-3">
            <Avatar user={currentUser} size="md" />
            <div>
              <h2 className="text-base font-semibold">{title}</h2>
              <p className="text-xs [color:var(--kc-muted)]">支持 #话题 和 @好友</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full [color:var(--kc-muted)] hover:[background:var(--kc-hover)]">
            <Icon name="close" className="h-5 w-5" />
          </button>
        </header>
        <div className="scroll-soft min-h-0 flex-1 overflow-y-auto p-5">
          <MentionTopicInput value={content} onChange={setContent} onPaste={handlePaste} friends={friendUsers} topics={topicOptions} suggestionLayerRef={suggestionLayerRef} multiline maxLength={2000} placeholder="这一刻的想法..." className="min-h-[140px] w-full resize-none rounded-3xl border px-4 py-3 text-sm outline-none [background:var(--kc-panel-muted)] [border-color:var(--kc-border)] focus:[border-color:var(--kc-accent)]" />
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {(['public', 'friends', 'private'] as PostVisibility[]).map((item) => (
              <button key={item} type="button" onClick={() => setVisibility(item)} className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${visibility === item ? '[background:var(--kc-accent)] text-white' : '[background:var(--kc-panel-muted)] [color:var(--kc-muted)] hover:[color:var(--kc-text)]'}`}>
                {visibilityLabel(item)}
              </button>
            ))}
          </div>
          {existingImageUrls.length > 0 || images.length > 0 ? (
            <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {existingImageUrls.map((url) => (
                <div key={url} className="group relative aspect-square overflow-hidden rounded-2xl border [border-color:var(--kc-border)]">
                  <img src={resolveThumbnailUrl(url)} alt="已上传图片" className="h-full w-full object-cover" />
                  <button type="button" onClick={() => removeExistingImage(url)} className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-black/50 text-white opacity-90"><Icon name="close" className="h-4 w-4" /></button>
                </div>
              ))}
              {images.map((image) => (
                <div key={image.id} className="group relative aspect-square overflow-hidden rounded-2xl border [border-color:var(--kc-border)]">
                  <img src={image.previewUrl} alt="待发布图片" className="h-full w-full object-cover" />
                  <button type="button" onClick={() => removeImage(image.id)} className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-black/50 text-white opacity-90">
                    <Icon name="close" className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple className="hidden" onChange={(event) => {
            if (event.target.files) {
              stageFiles(event.target.files);
            }
            event.target.value = '';
          }} />
          {error ? <p className="mt-3 rounded-2xl px-3 py-2 text-xs [background:rgba(239,68,68,0.12)] [color:#dc2626]">{error}</p> : null}
        </div>
        <footer className="flex items-center justify-between border-t px-5 py-4 [border-color:var(--kc-border)]">
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={existingImageUrls.length + images.length >= MAX_IMAGES || mutation.isPending} className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold [background:var(--kc-panel-muted)] [color:var(--kc-text)] disabled:opacity-50">
            <Icon name="image" className="h-4 w-4" /> 图片 {existingImageUrls.length + images.length}/{MAX_IMAGES}
          </button>
          <button type="button" onClick={() => mutation.mutate()} disabled={!canSubmit} className="rounded-full px-5 py-2 text-sm font-semibold text-white [background:var(--kc-accent)] disabled:opacity-50">
            {mutation.isPending ? (isEditing ? '保存中...' : '发布中...') : (isEditing ? '保存' : '发布')}
          </button>
        </footer>
      </section>
      <div ref={suggestionLayerRef} className="pointer-events-none absolute inset-0 z-[2147483647]" />
    </div>
  );
}

function LikesModal({ post, isMobile, onClose, onOpenUserSpace }: { post: Post; isMobile: boolean; onClose: () => void; onOpenUserSpace: (user: User | null | undefined, fallbackId: number) => void }): JSX.Element {
  const likesQuery = useQuery({ queryKey: ['posts', 'likes', post.id], queryFn: () => getPostLikes(post.id) });
  useEffect(() => {
    if (!isMobile) {
      return undefined;
    }
    return registerNativeBackHandler(() => {
      onClose();
      return true;
    }, 180);
  }, [isMobile, onClose]);
  const likes = likesQuery.data ?? [];
  if (isMobile) {
    const mobileModal = (
      <div className="fixed inset-0 z-[2147483646] [background:var(--kc-mobile-bg,#f1f3f8)]" onMouseDown={undefined}>
        <section onMouseDown={(event) => event.stopPropagation()} className="kc-qq-page flex h-full min-h-0 flex-col overflow-hidden text-[#111827]">
          <MobileStatusBar />
          <header className="kc-qq-nav-header shrink-0">
            <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full bg-white text-[#526070]" aria-label="关闭点赞列表"><Icon name="close" className="h-5 w-5" /></button>
            <div className="min-w-0 text-center">
              <h2 className="text-[17px] font-bold text-[#151922]">点赞列表</h2>
              <p className="text-[11px] font-semibold text-[#8b95a5]">{post.like_count} 人赞了这条动态</p>
            </div>
             <span className="h-9 w-9" />
          </header>
          <div className="kc-qq-scroll scroll-soft min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(var(--kc-mobile-bottom-nav-space)+24px)] pt-3">
            <section className="kc-qq-card overflow-hidden p-0">
              {likes.length === 0 ? <p className="kc-qq-post-empty">还没有点赞</p> : likes.map((like: PostLike) => (
                <div key={like.id} className="kc-qq-favorite-item items-center">
                  <button type="button" onClick={() => {
                    onClose();
                    onOpenUserSpace(like.user, like.user_id);
                  }} className="shrink-0 rounded-full">
                    <Avatar user={like.user} size="md" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <button type="button" onClick={() => {
                      onClose();
                      onOpenUserSpace(like.user, like.user_id);
                    }} className="block max-w-full truncate text-left text-[15px] font-bold text-[#151922] hover:[color:var(--kc-accent)]">{getDisplayName(like.user, `用户 ${like.user_id}`)}</button>
                    <p className="text-[12px] font-semibold text-[#8b95a5]">{formatTime(like.created_at)}</p>
                  </div>
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-[#eef4ff] text-[#168bff]"><Icon name="like" className="h-4 w-4" /></span>
                </div>
              ))}
            </section>
          </div>
        </section>
      </div>
    );
    return createPortal(mobileModal, getKukePortalRoot());
  }
  const desktopModal = (
    <div className="pointer-events-auto absolute inset-0 z-[2147483646] flex items-center justify-center p-6 [background:rgba(15,23,42,0.26)]" onMouseDown={onClose}>
      <section onMouseDown={(event) => event.stopPropagation()} className="flex max-h-[calc(100%-48px)] min-h-0 w-full max-w-[460px] flex-col overflow-hidden rounded-[30px] border shadow-float [background:var(--kc-panel)] [border-color:var(--kc-border)] [color:var(--kc-text)]">
        <header className="flex items-center justify-between border-b px-5 py-4 [border-color:var(--kc-border)]">
          <div>
            <h2 className="text-base font-semibold">点赞列表</h2>
            <p className="mt-1 text-xs [color:var(--kc-muted)]">{post.like_count} 人赞了这条动态</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full [color:var(--kc-muted)] hover:[background:var(--kc-hover)]"><Icon name="close" className="h-5 w-5" /></button>
        </header>
        <div className="scroll-soft min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
          {likes.length === 0 ? <p className="rounded-3xl py-10 text-center text-sm [background:var(--kc-panel-muted)] [color:var(--kc-muted)]">还没有点赞</p> : likes.map((like: PostLike) => (
            <div key={like.id} className="flex items-center gap-3 rounded-2xl px-3 py-2.5 transition hover:[background:var(--kc-hover)]">
              <button type="button" onClick={() => {
                onClose();
                onOpenUserSpace(like.user, like.user_id);
              }} className="shrink-0 rounded-full">
                <Avatar user={like.user} size="md" />
              </button>
              <div className="min-w-0 flex-1">
                <button type="button" onClick={() => {
                  onClose();
                  onOpenUserSpace(like.user, like.user_id);
                }} className="block max-w-full truncate text-left text-sm font-semibold hover:[color:var(--kc-accent)]">{getDisplayName(like.user, `用户 ${like.user_id}`)}</button>
                <p className="text-xs [color:var(--kc-muted)]">{formatTime(like.created_at)}</p>
              </div>
              <span className="grid h-8 w-8 place-items-center rounded-full [background:rgba(24,144,255,0.12)] [color:var(--kc-accent)]"><Icon name="like" className="h-4 w-4" /></span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
  return createPortal(desktopModal, getKukePortalRoot());
}

function NotificationsModal({ isMobile, onClose, onOpenPost, onOpenUserSpace, transitionStyle }: { isMobile: boolean; onClose: () => void; onOpenPost: (postId: number) => void; onOpenUserSpace: (user: User | null | undefined, fallbackId: number) => void; transitionStyle?: CSSProperties }): JSX.Element {
  const queryClient = useQueryClient();
  const notificationsQuery = useQuery({ queryKey: ['post-notifications'], queryFn: () => getPostNotifications(50) });
  const readAllMutation = useMutation({ mutationFn: markPostNotificationsRead, onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['post-notifications'] }) });
  const readOneMutation = useMutation({ mutationFn: markPostNotificationRead, onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['post-notifications'] }) });
  const notifications = notificationsQuery.data?.items ?? [];
  useEffect(() => {
    if (!isMobile) {
      return undefined;
    }
    return registerNativeBackHandler(() => {
      onClose();
      return true;
    }, 185);
  }, [isMobile, onClose]);
  return (
    <div className={`${isMobile ? 'kc-space-secondary-page fixed inset-0 z-[2147483646] [background:var(--kc-mobile-bg,#f1f3f8)]' : 'absolute inset-0 z-50 grid place-items-center overflow-hidden p-4 [background:rgba(15,23,42,0.28)]'}`} style={isMobile ? transitionStyle : undefined} onMouseDown={isMobile ? undefined : onClose}>
      <section onMouseDown={(event) => event.stopPropagation()} className={`${isMobile ? 'h-full rounded-none' : 'max-h-[calc(100%-32px)] w-full max-w-[520px] rounded-[30px] border shadow-float [border-color:var(--kc-border)]'} flex flex-col overflow-hidden [background:var(--kc-panel)] [color:var(--kc-text)]`}>
        <header className={`flex items-center justify-between border-b px-5 py-4 [border-color:var(--kc-border)] ${isMobile ? 'pt-[max(18px,env(safe-area-inset-top))]' : ''}`}>
          <div>
            <h2 className="text-base font-semibold">动态互动</h2>
            <p className="mt-1 text-xs [color:var(--kc-muted)]">{notificationsQuery.data?.unread_count ?? 0} 条未读互动</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => readAllMutation.mutate()} disabled={readAllMutation.isPending} className="rounded-full px-3 py-1.5 text-xs font-semibold [background:var(--kc-panel-muted)] [color:var(--kc-muted)]">全部已读</button>
            <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full [color:var(--kc-muted)] hover:[background:var(--kc-hover)]"><Icon name="close" className="h-5 w-5" /></button>
          </div>
        </header>
        <div className="scroll-soft min-h-0 flex-1 overflow-y-auto p-4">
          {notificationsQuery.isLoading ? <p className="rounded-3xl py-10 text-center text-sm [background:var(--kc-panel-muted)] [color:var(--kc-muted)]">正在加载互动...</p> : null}
          {!notificationsQuery.isLoading && notifications.length === 0 ? <p className="rounded-3xl py-10 text-center text-sm [background:var(--kc-panel-muted)] [color:var(--kc-muted)]">还没有新的动态互动</p> : null}
          {notifications.map((notification) => (
            <button key={notification.id} type="button" onClick={() => {
              if (!notification.read_at) {
                readOneMutation.mutate(notification.id);
              }
              if (!isMobile) {
                onClose();
              }
              onOpenPost(notification.post_id);
            }} className={`mb-2 flex w-full items-start gap-3 rounded-2xl px-3 py-3 text-left transition hover:[background:var(--kc-hover)] ${notification.read_at ? '[background:var(--kc-panel)]' : '[background:var(--kc-accent-soft)]'}`}>
              <span onClick={(event) => {
                event.stopPropagation();
                onClose();
                onOpenUserSpace(notification.actor, notification.actor_id);
              }} className="shrink-0 rounded-full"><Avatar user={notification.actor} size="md" /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold [color:var(--kc-text)]">{notificationText(notification)}</span>
                {notification.comment?.content ? <span className="mt-1 block line-clamp-2 text-xs leading-5 [color:var(--kc-muted)]">{notification.comment.content}</span> : notification.post?.content ? <span className="mt-1 block line-clamp-2 text-xs leading-5 [color:var(--kc-muted)]">{notification.post.content}</span> : null}
                <span className="mt-1 block text-[11px] [color:var(--kc-muted)]">{formatTime(notification.created_at)}</span>
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

interface CommentThreadData {
  root: PostComment;
  replies: PostComment[];
}

function buildCommentThreads(comments: PostComment[]): CommentThreadData[] {
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

function CommentItem({ comment, post, currentUser, friendUsers, topicOptions, isMobile, parentAuthorName, nested = false, withDivider = true, showDelete = false, onReplyCreated, onDelete, onOpenUserSpace, onSelectTopic }: { comment: PostComment; post: Post; currentUser: User; friendUsers: User[]; topicOptions: PostTopic[]; isMobile: boolean; parentAuthorName?: string; nested?: boolean; withDivider?: boolean; showDelete?: boolean; onReplyCreated?: () => void; onDelete?: (commentId: number) => void; onOpenUserSpace: (user: User | null | undefined, fallbackId: number) => void; onSelectTopic?: (topic: string) => void }): JSX.Element {
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyContent, setReplyContent] = useState('');
  const queryClient = useQueryClient();
  const interactionsBlocked = post.moderation_status !== 'approved' || comment.moderation_status !== 'approved';
  const authorName = getDisplayName(comment.author, `用户 ${comment.author_id}`);
  const likeMutation = useMutation({
    mutationFn: () => togglePostCommentLike(post.id, comment.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['posts', 'detail', post.id] });
      void queryClient.invalidateQueries({ queryKey: ['posts', 'comments', post.id] });
      invalidatePosts(queryClient);
    }
  });
  const replyMutation = useMutation({
    mutationFn: () => createPostComment(post.id, { content: legacyMentionToPlain(replyContent), parent_id: comment.id, mention_user_ids: extractMentionUserIds(replyContent, friendUsers) }),
    onSuccess: () => {
      setReplyContent('');
      setReplyOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['posts', 'detail', post.id] });
      void queryClient.invalidateQueries({ queryKey: ['posts', 'comments', post.id] });
      invalidatePosts(queryClient);
      onReplyCreated?.();
    }
  });

  return (
    <div className={`${nested ? 'py-2' : isMobile ? `${withDivider ? 'border-b border-slate-100 last:border-b-0' : ''} px-0 py-4` : `${withDivider ? 'border-b last:border-b-0 [border-color:var(--kc-border)]' : ''} py-3`} flex items-start gap-3`}>
      <button type="button" onClick={() => onOpenUserSpace(comment.author, comment.author_id)} className={`${nested ? 'mt-1' : 'mt-0.5'} shrink-0 rounded-full`}>
        <Avatar user={comment.author} size={nested ? 'sm' : 'md'} />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <button type="button" onClick={() => onOpenUserSpace(comment.author, comment.author_id)} className={`${isMobile ? 'text-[#151922]' : '[color:var(--kc-text)]'} max-w-full truncate text-left ${nested ? 'text-[13px]' : 'text-sm'} font-bold hover:[color:var(--kc-accent)]`}>{authorName}</button>
          {parentAuthorName ? <><span className="text-xs font-semibold [color:var(--kc-muted)]">回复</span><span className="max-w-[180px] truncate text-xs font-bold [color:var(--kc-accent)]">@{parentAuthorName}</span></> : null}
          {comment.author_id === currentUser.id && comment.moderation_status === 'pending' ? <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-600">审核中</span> : null}
          {showDelete && (comment.author_id === currentUser.id || post.author_id === currentUser.id) ? <button type="button" onClick={() => onDelete?.(comment.id)} className="ml-auto shrink-0 text-xs [color:var(--kc-muted)] hover:text-red-500">删除</button> : null}
        </div>
        <p className={`${isMobile ? 'text-[#151922]' : '[color:var(--kc-text)]'} mt-1 select-text whitespace-pre-wrap break-words ${nested ? 'text-[13px] leading-5' : 'text-[14px] leading-6'}`}>{renderRichTextSafe(comment.content, onOpenUserSpace, onSelectTopic, friendUsers)}</p>
        <div className={`${nested ? 'mt-1.5' : 'mt-2'} flex flex-wrap items-center gap-3 text-xs font-semibold [color:var(--kc-muted)]`}>
          <span>{formatTime(comment.created_at)}</span>
          <button type="button" onClick={() => likeMutation.mutate()} disabled={interactionsBlocked || likeMutation.isPending} className={`inline-flex items-center gap-1 hover:text-rose-500 disabled:opacity-50 ${comment.liked_by_me ? 'text-rose-500' : ''}`}>
            <Icon name="like" className="h-3.5 w-3.5" /> {comment.like_count || 0}
          </button>
          <button type="button" onClick={() => setReplyOpen((open) => !open)} disabled={interactionsBlocked} className="hover:[color:var(--kc-accent)] disabled:opacity-50">回复</button>
        </div>
        {replyOpen ? (
          <div className="mt-3 rounded-2xl border p-2 [background:var(--kc-panel-muted)] [border-color:var(--kc-border)]">
            <div className="mb-2 flex items-center justify-between gap-2 px-1 text-xs font-semibold [color:var(--kc-muted)]">
              <span className="truncate">回复 <span className="font-bold [color:var(--kc-accent)]">@{authorName}</span></span>
              <button type="button" onClick={() => {
                setReplyOpen(false);
                setReplyContent('');
              }} className="shrink-0 hover:[color:var(--kc-text)]">取消</button>
            </div>
            <div className="flex min-w-0 items-center gap-2">
              <MentionTopicInput value={replyContent} onChange={setReplyContent} friends={friendUsers} topics={topicOptions} maxLength={500} disabled={interactionsBlocked} placeholder={`回复 ${authorName}...`} className={`${isMobile ? 'bg-white text-[#151922]' : '[background:var(--kc-panel)] [color:var(--kc-text)]'} h-9 w-full min-w-0 rounded-xl border px-3 text-sm outline-none [border-color:var(--kc-border)] focus:[border-color:var(--kc-accent)] disabled:opacity-60`} />
              <button type="button" onClick={() => replyMutation.mutate()} disabled={interactionsBlocked || !replyContent.trim() || replyMutation.isPending} className="shrink-0 rounded-xl bg-[#168bff] px-3 py-1.5 text-sm font-bold text-white disabled:bg-slate-200 disabled:text-slate-400">发送</button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function CommentThread({ thread, post, currentUser, friendUsers, topicOptions, isMobile, showDelete = false, onDelete, onOpenUserSpace, onSelectTopic }: { thread: CommentThreadData; post: Post; currentUser: User; friendUsers: User[]; topicOptions: PostTopic[]; isMobile: boolean; showDelete?: boolean; onDelete?: (commentId: number) => void; onOpenUserSpace: (user: User | null | undefined, fallbackId: number) => void; onSelectTopic?: (topic: string) => void }): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const visibleReplies = expanded ? thread.replies : thread.replies.slice(0, 2);

  return (
    <div>
      <CommentItem comment={thread.root} post={post} currentUser={currentUser} friendUsers={friendUsers} topicOptions={topicOptions} isMobile={isMobile} withDivider={thread.replies.length === 0} showDelete={showDelete} onDelete={onDelete} onOpenUserSpace={onOpenUserSpace} onSelectTopic={onSelectTopic} />
      {thread.replies.length > 0 ? (
        <div className={`${isMobile ? 'ml-[52px]' : 'ml-[52px]'} -mt-1 mb-2 rounded-[18px] px-3 py-1.5 [background:color-mix(in_srgb,var(--kc-panel-muted)_42%,var(--kc-panel)_58%)]`}>
          {visibleReplies.map((reply) => (
            <CommentItem key={reply.id} comment={reply} post={post} currentUser={currentUser} friendUsers={friendUsers} topicOptions={topicOptions} isMobile={isMobile} parentAuthorName={reply.parent_id ? getDisplayName(reply.parent_author, `评论 ${reply.parent_id}`) : undefined} nested showDelete={showDelete} onDelete={onDelete} onOpenUserSpace={onOpenUserSpace} onSelectTopic={onSelectTopic} />
          ))}
          {thread.replies.length > 2 ? (
            <button type="button" onClick={() => setExpanded((value) => !value)} className="mb-1 ml-10 mt-1 text-xs font-semibold [color:var(--kc-muted)] hover:[color:var(--kc-accent)]">
              {expanded ? '收起回复' : `共${thread.replies.length}条回复，点击查看`}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function PostCard({ post, currentUser, friendUsers = [], topicOptions = [], isMobile, compact = false, mobileListMode = false, highlighted = false, onPostRef, onOpenUserSpace, onOpenPost, onEditPost, onSelectTopic }: { post: Post; currentUser: User; friendUsers?: User[]; topicOptions?: PostTopic[]; isMobile: boolean; compact?: boolean; mobileListMode?: boolean; highlighted?: boolean; onPostRef?: (postId: number, node: HTMLElement | null) => void; onOpenUserSpace: (user: User | null | undefined, fallbackId: number) => void; onOpenPost: (postId: number) => void; onEditPost?: (post: Post) => void; onSelectTopic?: (topic: string) => void }): JSX.Element {
  const [likesOpen, setLikesOpen] = useState(false);
  const [commentsExpanded, setCommentsExpanded] = useState(false);
  const [inlineComment, setInlineComment] = useState('');
  const [actionsOpen, setActionsOpen] = useState(false);
  const [repostOpen, setRepostOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [imageViewer, setImageViewer] = useState<ImageViewerState | null>(null);
  const queryClient = useQueryClient();
  const isPending = post.moderation_status === 'pending';
  const isRejected = post.moderation_status === 'rejected';
  const interactionDisabled = isPending || isRejected;
  const likeMutation = useMutation({
    mutationFn: () => togglePostLike(post.id),
    onSuccess: () => invalidatePosts(queryClient)
  });
  const deleteMutation = useMutation({
    mutationFn: () => deletePost(post.id),
    onSuccess: () => invalidatePosts(queryClient)
  });
  const pinMutation = useMutation({
    mutationFn: () => post.pinned_at ? unpinPost(post.id) : pinPost(post.id),
    onSuccess: () => invalidatePosts(queryClient)
  });
  const commentMutation = useMutation({
    mutationFn: () => createPostComment(post.id, { content: legacyMentionToPlain(inlineComment), parent_id: null, mention_user_ids: extractMentionUserIds(inlineComment, friendUsers) }),
    onSuccess: () => {
      setInlineComment('');
      void queryClient.invalidateQueries({ queryKey: ['posts', 'detail', post.id] });
      void queryClient.invalidateQueries({ queryKey: ['posts', 'comments', post.id] });
      invalidatePosts(queryClient);
      setCommentsExpanded(true);
    }
  });
  const reportMutation = useMutation({
    mutationFn: (payload: CreateReportPayload) => createReport(payload),
    onSuccess: () => setReportOpen(false)
  });
  const likes = post.recent_likes ?? [];
  const comments = post.recent_comments ?? [];
  const commentThreads = useMemo(() => buildCommentThreads(comments), [comments]);
  const hasComments = comments.length > 0;
  const cardClass = isMobile
    ? 'kc-qq-card kc-qq-post-card overflow-hidden p-0'
    : 'overflow-visible rounded-[22px] border px-5 py-5 shadow-[0_8px_24px_rgba(15,23,42,0.04)] [background:var(--kc-panel)] [border-color:var(--kc-border)] [color:var(--kc-text)]';
  const actionButtonClass = 'inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50';
  const handleCardClick = (event: MouseEvent<HTMLElement>): void => {
    if (!mobileListMode) {
      return;
    }
    const target = event.target;
    if (target instanceof HTMLElement && target !== event.currentTarget && target.closest('button,a,input,textarea,select,[contenteditable="true"]')) {
      return;
    }
    if (hasActiveTextSelection()) {
      return;
    }
    onOpenPost(post.id);
  };
  const handleCardKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (!mobileListMode || (event.key !== 'Enter' && event.key !== ' ')) {
      return;
    }
    event.preventDefault();
    onOpenPost(post.id);
  };
  return (
    <article ref={(node) => onPostRef?.(post.id, node)} role={mobileListMode ? 'button' : undefined} tabIndex={mobileListMode ? 0 : undefined} onClick={handleCardClick} onKeyDown={handleCardKeyDown} className={`${cardClass} scroll-mt-4 transition-shadow ${mobileListMode ? 'cursor-pointer' : ''} ${highlighted ? 'ring-2 ring-sky-300 ring-offset-2 ring-offset-transparent' : ''}`}>
      <div className={isMobile ? 'flex items-start gap-3 p-4' : 'flex items-start gap-4'}>
        <button type="button" onClick={() => onOpenUserSpace(post.author, post.author_id)} className="group relative shrink-0 rounded-full">
          <Avatar user={post.author} size={isMobile ? 'md' : 'lg'} />
          {isMobile ? <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-[#34c759]" /> : null}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <button type="button" onClick={() => onOpenUserSpace(post.author, post.author_id)} className={`${isMobile ? 'text-[17px] text-[#151922]' : 'text-base [color:var(--kc-text)]'} block max-w-full truncate text-left font-bold hover:[color:var(--kc-accent)]`}>{getDisplayName(post.author, `用户 ${post.author_id}`)}</button>
              <div className={`mt-1 flex flex-wrap items-center gap-2 ${isMobile ? 'text-[12px] text-[#8b95a5]' : 'text-xs [color:var(--kc-muted)]'}`}>
                <span>{formatTime(post.created_at)}</span>
                <span className="h-1 w-1 rounded-full bg-current opacity-40" />
                <span>{visibilityLabel(post.visibility)}</span>
                {isPending ? <span className="rounded-full bg-amber-50 px-2 py-0.5 font-bold text-amber-600">仅自己可见</span> : null}
              </div>
            </div>
            <div className="relative flex shrink-0 items-center gap-2">
              {post.author_id === currentUser.id && !compact ? (
                <>
                  <button type="button" onClick={() => setActionsOpen((open) => !open)} className={`${isMobile ? 'bg-[#f4f6fa] text-[#8b95a5]' : '[color:var(--kc-muted)] hover:[background:var(--kc-hover)]'} grid h-8 w-8 place-items-center rounded-full`} aria-label="更多动态操作" aria-expanded={actionsOpen}>
                    <Icon name="more" className="h-5 w-5" />
                  </button>
                  {actionsOpen ? (
                    <div className="absolute right-0 top-9 z-20 w-36 overflow-hidden rounded-2xl border p-1 shadow-[0_18px_40px_rgba(15,23,42,0.14)] [background:var(--kc-panel)] [border-color:var(--kc-border)]">
                      <button type="button" onClick={() => {
                        setActionsOpen(false);
                        onEditPost?.(post);
                      }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold [color:var(--kc-text)] hover:[background:var(--kc-hover)]">
                        <Icon name="edit" className="h-4 w-4" /> 编辑动态
                      </button>
                      <button type="button" onClick={() => {
                        setActionsOpen(false);
                        pinMutation.mutate();
                      }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold [color:var(--kc-text)] hover:[background:var(--kc-hover)]">
                        <Icon name="pin" className="h-4 w-4" /> {post.pinned_at ? '取消置顶' : '置顶动态'}
                      </button>
                      <button type="button" onClick={() => {
                        setActionsOpen(false);
                        if (window.confirm('确定要删除这条动态吗？')) {
                          deleteMutation.mutate();
                        }
                      }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-red-500 hover:bg-red-50">
                        <Icon name="trash" className="h-4 w-4" /> 删除动态
                      </button>
                    </div>
                  ) : null}
                </>
              ) : !compact ? (
                <>
                  <button type="button" onClick={() => setActionsOpen((open) => !open)} className={`${isMobile ? 'bg-[#f4f6fa] text-[#8b95a5]' : '[color:var(--kc-muted)] hover:[background:var(--kc-hover)]'} grid h-8 w-8 place-items-center rounded-full`} aria-label="更多动态操作" aria-expanded={actionsOpen}><Icon name="more" className="h-5 w-5" /></button>
                  {actionsOpen ? <div className="absolute right-0 top-9 z-20 w-36 overflow-hidden rounded-2xl border p-1 shadow-[0_18px_40px_rgba(15,23,42,0.14)] [background:var(--kc-panel)] [border-color:var(--kc-border)]"><button type="button" onClick={() => { setActionsOpen(false); setReportOpen(true); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-red-500 hover:bg-red-50"><Icon name="flag" className="h-4 w-4" /> 举报动态</button></div> : null}
                </>
              ) : <span className={`${isMobile ? 'text-[#c0c5ce]' : '[color:var(--kc-muted)]'}`}><Icon name="more" className="h-5 w-5" /></span>}
            </div>
          </div>
          {post.author_id === currentUser.id && post.moderation_status !== 'approved' ? (
            <div className={`mt-4 rounded-2xl px-4 py-2 text-xs font-semibold ${isRejected ? 'bg-red-50 text-red-500' : 'bg-amber-50 text-amber-600'}`}>
              {moderationLabel(post.moderation_status)}{isPending ? '，当前仅自己可见，审核通过后其他用户才能看到和互动。' : '，这条动态不会对其他用户展示。'}
            </div>
          ) : null}
          {post.pinned_at ? <span className="mt-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold [background:var(--kc-accent-soft)] [color:var(--kc-accent)]"><Icon name="pin" className="h-3.5 w-3.5" />置顶</span> : null}
          {post.content ? <p className={`${isMobile ? 'mt-4 text-[15px] leading-7 text-[#151922]' : 'mt-3 text-[15px] leading-7 [color:var(--kc-text)]'} select-text whitespace-pre-wrap break-words`}>{renderRichTextSafe(post.content, onOpenUserSpace, onSelectTopic, friendUsers, !mobileListMode)}</p> : null}
          {!mobileListMode ? <CcwCreationCards previews={post.ccw_creations} compact={isMobile} /> : null}
          <PostImageGrid images={post.image_urls ?? []} onOpenImage={mobileListMode ? () => onOpenPost(post.id) : (images, index) => setImageViewer({ images, index })} />
          {post.repost_of_id ? <RepostPreviewCard post={post.repost_of} isMobile={isMobile} onOpenPost={mobileListMode ? () => onOpenPost(post.id) : onOpenPost} onOpenImage={mobileListMode ? () => onOpenPost(post.id) : (images, index) => setImageViewer({ images, index })} /> : null}
          {post.like_count > 0 ? (
            mobileListMode ? <div className={`${isMobile ? 'bg-[#f4f8ff] text-[#526070]' : '[background:var(--kc-panel-muted)] [color:var(--kc-muted)]'} mt-4 flex w-full items-start gap-2 rounded-2xl px-4 py-3 text-left text-sm leading-6 transition hover:[color:var(--kc-accent)]`}>
              <Icon name="like" className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{likeSummaryText(post)}</span>
            </div> : <button type="button" onClick={() => setLikesOpen(true)} className={`${isMobile ? 'bg-[#f4f8ff] text-[#526070]' : '[background:var(--kc-panel-muted)] [color:var(--kc-muted)]'} mt-4 flex w-full items-start gap-2 rounded-2xl px-4 py-3 text-left text-sm leading-6 transition hover:[color:var(--kc-accent)]`}>
              <Icon name="like" className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{likeSummaryText(post)}</span>
            </button>
          ) : null}
          <div className={`${isMobile ? 'mt-4 flex items-center gap-1 border-t border-[#eef1f6] pt-3 text-[#8b95a5]' : 'mt-4 flex items-center gap-1 border-t pt-3 [border-color:var(--kc-border)] [color:var(--kc-muted)]'}`}>
            <button type="button" onClick={() => likeMutation.mutate()} disabled={likeMutation.isPending || interactionDisabled} className={`${actionButtonClass} hover:text-rose-500 ${post.liked_by_me ? 'text-rose-500' : ''}`}>
              <Icon name="like" className="h-5 w-5" /> 点赞 {post.like_count || 0}
            </button>
            <button type="button" onClick={() => { if (mobileListMode) { onOpenPost(post.id); return; } setCommentsExpanded((value) => !value); }} disabled={isRejected} className={`${actionButtonClass} hover:[color:var(--kc-accent)] ${commentsExpanded ? '[color:var(--kc-accent)]' : ''}`}>
              <Icon name="message" className="h-5 w-5" /> 评论 {post.comment_count || 0}
            </button>
            <button type="button" onClick={() => setRepostOpen(true)} disabled={interactionDisabled} className={`${actionButtonClass} hover:[color:var(--kc-accent)]`}>
              <Icon name="share" className="h-5 w-5" /> 分享
            </button>
          </div>
          <div className={`grid transition-[grid-template-rows,opacity,margin] duration-300 ease-out ${commentsExpanded ? 'mt-4 grid-rows-[1fr] opacity-100' : 'mt-0 grid-rows-[0fr] opacity-0'}`}>
            <div className="min-h-0 overflow-hidden">
              <section className={`${isMobile ? 'rounded-[22px] bg-[#f7f9fc] p-3' : 'border-t pt-4 [border-color:var(--kc-border)]'}`}>
                <div className="mb-3 flex items-center justify-between gap-4">
                  <h3 className={`${isMobile ? 'text-[#151922]' : '[color:var(--kc-text)]'} text-sm font-bold`}>评论 <span className="font-semibold [color:var(--kc-muted)]">{post.comment_count || 0}</span></h3>
                  {post.comment_count > 1 ? <div className="flex items-center gap-2 text-xs font-semibold [color:var(--kc-muted)]"><button type="button" className="[color:var(--kc-accent)]">最热</button><span>|</span><button type="button">最新</button></div> : null}
                </div>
                <div className="mb-3 flex min-w-0 items-center gap-3">
                  <span className="shrink-0"><Avatar user={currentUser} size="md" /></span>
                  <MentionTopicInput value={inlineComment} onChange={setInlineComment} friends={friendUsers} topics={topicOptions} disabled={interactionDisabled} maxLength={500} placeholder={interactionDisabled ? '动态审核通过后才能评论' : '写下你的评论...'} className={`${isMobile ? 'bg-white text-[#151922] placeholder:text-[#a4adba]' : '[background:var(--kc-panel-muted)] [color:var(--kc-text)]'} h-10 w-full min-w-0 rounded-xl border px-3 text-sm outline-none transition [border-color:var(--kc-border)] focus:[border-color:var(--kc-accent)] disabled:cursor-not-allowed disabled:opacity-60`} />
                  <button type="button" onClick={() => commentMutation.mutate()} disabled={interactionDisabled || !inlineComment.trim() || commentMutation.isPending} className="shrink-0 rounded-xl bg-[#168bff] px-3.5 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-sky-600 disabled:bg-slate-200 disabled:text-slate-400 disabled:opacity-100">发送</button>
                </div>
                <div className="space-y-0">
                  {!hasComments ? <p className="py-3 text-center text-sm [color:var(--kc-muted)]">还没有评论，来抢沙发</p> : commentThreads.map((thread) => (
                    <CommentThread key={thread.root.id} thread={thread} post={post} currentUser={currentUser} friendUsers={friendUsers} topicOptions={topicOptions} isMobile={isMobile} onOpenUserSpace={onOpenUserSpace} onSelectTopic={onSelectTopic} />
                  ))}
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
      {likesOpen ? <LikesModal post={post} isMobile={isMobile} onClose={() => setLikesOpen(false)} onOpenUserSpace={onOpenUserSpace} /> : null}
      {repostOpen ? <RepostModal post={post} currentUser={currentUser} isMobile={isMobile} onClose={() => setRepostOpen(false)} /> : null}
      {reportOpen ? <ReportModal targetType="post" targetId={post.id} targetLabel={`动态：${post.content.trim().slice(0, 48) || `#${post.id}`}`} reportedUserId={post.author_id} isPending={reportMutation.isPending} error={reportMutation.error} onSubmit={(payload) => reportMutation.mutate(payload)} onClose={() => setReportOpen(false)} /> : null}
      {imageViewer ? <ImageViewer viewer={imageViewer} mobile={isMobile} onClose={() => setImageViewer(null)} onNavigate={(index) => setImageViewer((current) => current ? { ...current, index } : current)} /> : null}
    </article>
  );
}

function UserSpaceModal({ profileUser, fallbackId, currentUser, isMobile, onClose, onOpenUserSpace, onOpenPost, onEditPost }: { profileUser: User | null | undefined; fallbackId: number; currentUser: User; isMobile: boolean; onClose: () => void; onOpenUserSpace: (user: User | null | undefined, fallbackId: number) => void; onOpenPost: (postId: number) => void; onEditPost: (post: Post) => void }): JSX.Element {
  const isSelf = fallbackId === currentUser.id;
  const queryClient = useQueryClient();
  const setCurrentUser = useKukeStore((state) => state.setCurrentUser);
  const setActiveConversationId = useKukeStore((state) => state.setActiveConversationId);
  const setWorkspaceView = useKukeStore((state) => state.setWorkspaceView);
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [shareProfileOpen, setShareProfileOpen] = useState(false);
  const [postSort, setPostSort] = useState<PostFeedSort>('latest');
  const profileQuery = useQuery({
    queryKey: ['users', fallbackId],
    queryFn: () => getUserProfile(fallbackId),
    initialData: profileUser ?? (isSelf ? currentUser : undefined),
    staleTime: 30_000,
    refetchInterval: (query) => query.state.data?.profile_cover_moderation_status === 'pending' ? 3_000 : false
  });
  const postsQuery = useInfiniteQuery({
    queryKey: ['posts', 'user', fallbackId, postSort],
    queryFn: ({ pageParam }) => getUserPosts(fallbackId, { sort: postSort, beforeId: pageParam, limit: PAGE_SIZE }),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) => lastPage.length < PAGE_SIZE ? undefined : lastPage[lastPage.length - 1]?.id
  });
  const statsQuery = useQuery({ queryKey: ['posts', 'user', fallbackId, 'stats'], queryFn: () => getUserPostStats(fallbackId) });
  const friendsQuery = useQuery({ queryKey: ['friends'], queryFn: getFriends, enabled: !isSelf });
  const outgoingFriendRequestsQuery = useQuery({ queryKey: ['friend-requests', 'outgoing'], queryFn: getOutgoingFriendRequests, enabled: !isSelf });
  const posts = useMemo(() => postsQuery.data?.pages.flat() ?? [], [postsQuery.data]);
  const rawDisplayUser = profileQuery.data ?? profileUser ?? (isSelf ? currentUser : null);
  const [profileDraft, setProfileDraft] = useState({
    bio: rawDisplayUser?.bio ?? '',
    profile_title: rawDisplayUser?.profile_title ?? '',
    profile_tagline: rawDisplayUser?.profile_tagline ?? '',
    profile_status: rawDisplayUser?.profile_status ?? '',
    profile_location: rawDisplayUser?.profile_location ?? '',
    profile_interests: rawDisplayUser?.profile_interests ?? '',
    profile_layout: rawDisplayUser?.profile_layout ?? 'classic',
    profile_card_style: rawDisplayUser?.profile_card_style ?? 'soft',
    profile_accent_color: rawDisplayUser?.profile_accent_color ?? '#168bff',
    profile_cover_url: rawDisplayUser?.profile_cover_pending_url ?? rawDisplayUser?.profile_cover_url ?? ''
  });

  useEffect(() => {
    if (!rawDisplayUser || editingProfile) {
      return;
    }
    setProfileDraft({
      bio: rawDisplayUser.bio ?? '',
      profile_title: rawDisplayUser.profile_title ?? '',
      profile_tagline: rawDisplayUser.profile_tagline ?? '',
      profile_status: rawDisplayUser.profile_status ?? '',
      profile_location: rawDisplayUser.profile_location ?? '',
      profile_interests: rawDisplayUser.profile_interests ?? '',
      profile_layout: rawDisplayUser.profile_layout ?? 'classic',
      profile_card_style: rawDisplayUser.profile_card_style ?? 'soft',
      profile_accent_color: rawDisplayUser.profile_accent_color ?? '#168bff',
      profile_cover_url: rawDisplayUser.profile_cover_pending_url ?? rawDisplayUser.profile_cover_url ?? ''
    });
  }, [editingProfile, rawDisplayUser]);

  const saveProfileMutation = useMutation({
    mutationFn: updateMyProfile,
    onSuccess: (updatedUser) => {
      setCurrentUser(updatedUser);
      queryClient.setQueryData(['users', fallbackId], updatedUser);
      void queryClient.invalidateQueries({ queryKey: ['me'] });
      setEditingProfile(false);
    }
  });
  const coverMutation = useMutation({
    mutationFn: uploadProfileCover,
    onSuccess: (response) => setProfileDraft((draft) => ({ ...draft, profile_cover_url: response.url }))
  });

  useEffect(() => {
    if (!isMobile) {
      return undefined;
    }
    return registerNativeBackHandler(() => {
      onClose();
      return true;
    }, 165);
  }, [isMobile, onClose]);

  const displayUser = rawDisplayUser;
  const displayName = getDisplayName(displayUser, isSelf ? getDisplayName(currentUser) : `用户 ${fallbackId}`);
  const profileTitle = (editingProfile ? profileDraft.profile_title : displayUser?.profile_title)?.trim() || (isSelf ? '我的空间' : '个人主页');
  const profileTagline = (editingProfile ? profileDraft.profile_tagline : displayUser?.profile_tagline)?.trim();
  const profileStatus = (editingProfile ? profileDraft.profile_status : displayUser?.profile_status)?.trim();
  const profileBio = (editingProfile ? profileDraft.bio : displayUser?.bio)?.trim();
  const profileLocation = (editingProfile ? profileDraft.profile_location : displayUser?.profile_location)?.trim();
  const interests = interestList(editingProfile ? profileDraft.profile_interests : displayUser?.profile_interests);
  const profileLayout = normalizeProfileLayout(editingProfile ? profileDraft.profile_layout : displayUser?.profile_layout);
  const profileCardStyle = normalizeProfileCardStyle(editingProfile ? profileDraft.profile_card_style : displayUser?.profile_card_style);
  const accent = editingProfile && /^#[0-9a-fA-F]{6}$/.test(profileDraft.profile_accent_color) ? profileDraft.profile_accent_color : profileAccent(displayUser);
  const coverUrl = editingProfile ? (profileDraft.profile_cover_url || null) : profileCover(displayUser, isSelf);
  const metricCardClass = profilePanelClass(profileCardStyle, coverUrl);
  const coverBackground = coverUrl ? `linear-gradient(135deg,rgba(6,10,20,.68),rgba(6,10,20,.18)),url(${resolveAssetUrl(coverUrl)}) center/cover` : `radial-gradient(circle at 15% 20%,rgba(255,255,255,.34),transparent 30%),radial-gradient(circle at 82% 12%,rgba(255,255,255,.22),transparent 24%),linear-gradient(135deg,${accent} 0%,#7c8cff 48%,#ff7eb3 100%)`;
  const coverErrorMessage = coverMutation.error instanceof Error ? coverMutation.error.message : '封面上传失败，请稍后重试。';
  const saveErrorMessage = saveProfileMutation.error instanceof Error ? saveProfileMutation.error.message : '保存失败，请检查输入后重试。';
  const stats = statsQuery.data ?? emptyPostStats;
  const visiblePosts = stats.post_count;
  const totalLikes = stats.like_count;
  const totalComments = stats.comment_count;
  const hasCcwAccount = Boolean(displayUser?.ccw_student_oid);
  const ccwProfileUrl = displayUser?.ccw_student_oid ? ccwStudentProfileUrl(displayUser.ccw_student_oid) : null;
  const ccwAvatarUrl = resolveThumbnailUrl(displayUser?.ccw_avatar_url);
  const ccwPrimaryStats = [
    { label: '粉丝', value: displayUser?.ccw_follower_count },
    { label: '获赞', value: displayUser?.ccw_like_count },
    { label: '浏览', value: displayUser?.ccw_view_count }
  ];
  const ccwSecondaryStats = [
    { label: '关注', value: displayUser?.ccw_following_count },
    { label: '收藏', value: displayUser?.ccw_favorite_count },
    { label: '作品', value: displayUser?.ccw_creation_count }
  ];
  const postGapClass = profilePostGapClass(profileLayout);
  const metricCards = hasCcwAccount ? [
    { label: '关注', value: formatCompact(displayUser?.ccw_following_count), icon: 'users' as const },
    { label: '粉丝', value: formatCompact(displayUser?.ccw_follower_count), icon: 'ccw' as const },
    { label: '获赞', value: formatCompact(displayUser?.ccw_like_count), icon: 'like' as const }
  ] : [
    { label: '动态', value: formatCompact(visiblePosts), icon: 'feed' as const },
    { label: '获赞', value: formatCompact(totalLikes), icon: 'like' as const },
    { label: '评论', value: formatCompact(totalComments), icon: 'message' as const }
  ];
  const isFriend = isFriendUserId(friendsQuery.data ?? [], fallbackId, currentUser.id);
  const hasPendingFriendRequest = hasPendingOutgoingFriendRequest(outgoingFriendRequestsQuery.data ?? [], fallbackId);
  const friendRequestMutation = useMutation({
    mutationFn: sendFriendRequest,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['friends'] });
      void queryClient.invalidateQueries({ queryKey: ['friend-requests'] });
    }
  });
  const directMutation = useMutation({
    mutationFn: createDirectConversation,
    onSuccess: (conversation) => {
      setActiveConversationId(conversation.id);
      setWorkspaceView('chat');
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      onClose();
    }
  });
  const friendButtonDisabled = isFriend ? directMutation.isPending : hasPendingFriendRequest || friendRequestMutation.isPending || friendsQuery.isLoading || outgoingFriendRequestsQuery.isLoading;
  const friendButtonLabel = isFriend ? directMutation.isPending ? '打开中' : '发消息' : hasPendingFriendRequest ? '已申请' : friendRequestMutation.isPending ? '发送中' : '加好友';
  const friendRequestError = friendRequestMutation.error ? requestErrorMessage(friendRequestMutation.error, '好友申请发送失败') : null;
  const directMessageError = directMutation.error ? requestErrorMessage(directMutation.error, '发起私聊失败') : null;

  function updateDraft(key: keyof typeof profileDraft, value: string): void {
    setProfileDraft((draft) => ({ ...draft, [key]: value }));
  }

  function chooseCover(event: React.ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    if (file) {
      coverMutation.mutate(file);
    }
    event.target.value = '';
  }

  function saveProfile(): void {
    saveProfileMutation.mutate(profileDraft);
  }

  function handleFriendAction(): void {
    if (isSelf || friendButtonDisabled) {
      return;
    }
    if (isFriend) {
      directMutation.mutate({ user_id: fallbackId, temporary: false });
      return;
    }
    friendRequestMutation.mutate(fallbackId);
  }

  const profileEditor = isSelf && editingProfile ? (
    <section className={isMobile ? 'kc-qq-card overflow-hidden p-0' : 'overflow-hidden rounded-[30px] border [background:var(--kc-panel)] [border-color:var(--kc-border)]'}>
      <div className="relative overflow-hidden px-5 py-5 text-white sm:px-6" style={{ background: `linear-gradient(135deg,${accent},#111827)` }}>
        <div className="absolute -right-10 -top-12 h-32 w-32 rounded-full bg-white/16 blur-2xl" />
        <div className="absolute bottom-0 left-1/3 h-24 w-24 rounded-full bg-white/10 blur-xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-1.5 rounded-full bg-white/16 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-white/82 backdrop-blur"><Icon name="sparkles" className="h-3.5 w-3.5" /> Studio</p>
            <h3 className="mt-3 text-[22px] font-black leading-tight">主页自定义工作台</h3>
            <p className="mt-1 max-w-[560px] text-[13px] font-medium leading-6 text-white/78">调整封面、文案、版式和强调色会实时预览；封面审核通过后公开展示。</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={() => setEditingProfile(false)} className="inline-flex items-center gap-1.5 rounded-full bg-white/12 px-3 py-2 text-[12px] font-bold text-white/86 backdrop-blur transition hover:bg-white/18"><Icon name="close" className="h-3.5 w-3.5" />取消</button>
            <button type="button" onClick={saveProfile} disabled={saveProfileMutation.isPending || coverMutation.isPending} className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-[12px] font-black text-slate-950 shadow-[0_12px_28px_rgba(0,0,0,.18)] transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-50"><Icon name="check" className="h-3.5 w-3.5" />{saveProfileMutation.isPending ? '保存中' : '保存主页'}</button>
          </div>
        </div>
      </div>
      <input ref={coverInputRef} type="file" accept="image/*" onChange={chooseCover} className="hidden" />
      <div className={isMobile ? 'grid gap-4 p-4' : 'grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_300px]'}>
        <div className="grid min-w-0 gap-4">
          <section className={isMobile ? 'rounded-[26px] bg-[#f6f8fc] p-3' : 'rounded-[24px] border p-4 [background:var(--kc-panel-muted)] [border-color:var(--kc-border)]'}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h4 className={isMobile ? 'text-[15px] font-black text-[#111827]' : 'text-base font-bold [color:var(--kc-text)]'}>封面舞台</h4>
                <p className={isMobile ? 'mt-1 text-[12px] font-medium text-[#8b95a5]' : 'mt-1 text-xs [color:var(--kc-muted)]'}>建议使用横向图片，留出头像和文字安全区。</p>
              </div>
              <Icon name="image" className={isMobile ? 'h-5 w-5 text-[#168bff]' : 'h-5 w-5 [color:var(--kc-accent)]'} />
            </div>
            <button type="button" onClick={() => coverInputRef.current?.click()} disabled={coverMutation.isPending} className="group relative min-h-[154px] w-full cursor-pointer overflow-hidden rounded-[24px] text-left shadow-[0_18px_44px_rgba(15,23,42,.16)] disabled:opacity-50" style={{ background: coverBackground }}>
              <div className="absolute inset-0 bg-gradient-to-br from-black/10 via-transparent to-black/26 transition duration-300 group-hover:from-black/4 group-hover:to-black/18" />
              <div className="relative flex h-full min-h-[154px] items-end justify-between gap-3 p-4 text-white">
                <span className="min-w-0"><span className="block text-[18px] font-black">{coverMutation.isPending ? '封面上传中...' : '点击更换主页封面'}</span><span className="mt-1 block text-[12px] font-semibold text-white/78">支持图片上传，审核通过后公开展示</span></span>
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white/20 backdrop-blur"><Icon name="upload" className="h-5 w-5" /></span>
              </div>
            </button>
          </section>

          <section className={isMobile ? 'rounded-[26px] bg-[#eef7ff] p-3' : 'rounded-[24px] border p-4 [background:linear-gradient(135deg,color-mix(in_srgb,var(--kc-accent)_12%,transparent),var(--kc-panel-muted))] [border-color:color-mix(in_srgb,var(--kc-accent)_28%,var(--kc-border))]'}>
            <div className="flex items-center gap-3">
              <span className={isMobile ? 'grid h-11 w-11 place-items-center rounded-[18px] bg-[#168bff] text-white' : 'grid h-11 w-11 place-items-center rounded-[18px] text-white [background:var(--kc-accent)]'}><Icon name="ccw" className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1">
                <h4 className={isMobile ? 'text-[15px] font-black text-[#111827]' : 'text-base font-bold [color:var(--kc-text)]'}>CCW 账号</h4>
                <p className={isMobile ? 'mt-1 text-[12px] font-medium text-[#8b95a5]' : 'mt-1 text-xs [color:var(--kc-muted)]'}>{displayUser?.ccw_student_oid ? `已绑定 ${displayUser.ccw_name || 'CCW 账号'}，可在设置中刷新或同步资料。` : '绑定入口在 设置 > CCW 账号，绑定后这里会展示关注、粉丝和获赞。'}</p>
              </div>
            </div>
            {displayUser?.ccw_student_oid ? (
              <div className={isMobile ? 'mt-3 grid grid-cols-3 rounded-[20px] bg-white text-center text-[12px] font-bold text-[#8b95a5]' : 'mt-3 grid grid-cols-3 rounded-[20px] text-center text-xs font-bold [background:var(--kc-panel)] [color:var(--kc-muted)]'}>
                <span className="px-2 py-3"><strong className={isMobile ? 'block text-[16px] text-[#111827]' : 'block text-base [color:var(--kc-text)]'}>{formatCompact(displayUser.ccw_following_count)}</strong>关注</span>
                <span className={isMobile ? 'border-x border-[#eef2f7] px-2 py-3' : 'border-x px-2 py-3 [border-color:var(--kc-border)]'}><strong className={isMobile ? 'block text-[16px] text-[#111827]' : 'block text-base [color:var(--kc-text)]'}>{formatCompact(displayUser.ccw_follower_count)}</strong>粉丝</span>
                <span className="px-2 py-3"><strong className={isMobile ? 'block text-[16px] text-[#111827]' : 'block text-base [color:var(--kc-text)]'}>{formatCompact(displayUser.ccw_like_count)}</strong>获赞</span>
              </div>
            ) : null}
          </section>

          <section className={isMobile ? 'grid gap-3 rounded-[26px] bg-[#f6f8fc] p-3' : 'grid gap-4 rounded-[24px] border p-4 [background:var(--kc-panel-muted)] [border-color:var(--kc-border)]'}>
            <div>
              <h4 className={isMobile ? 'text-[15px] font-black text-[#111827]' : 'text-base font-bold [color:var(--kc-text)]'}>身份文案</h4>
              <p className={isMobile ? 'mt-1 text-[12px] font-medium text-[#8b95a5]' : 'mt-1 text-xs [color:var(--kc-muted)]'}>用短标题、状态和标签建立主页第一印象。</p>
            </div>
            <div className={isMobile ? 'grid gap-3' : 'grid gap-3 sm:grid-cols-2'}>
              <label className="grid gap-2">
                <span className={isMobile ? 'text-[13px] font-bold text-[#526070]' : 'text-sm font-bold [color:var(--kc-text)]'}>主页标题</span>
                <input value={profileDraft.profile_title} onChange={(event) => updateDraft('profile_title', event.target.value)} className={isMobile ? 'kc-qq-input' : 'glass-input rounded-2xl px-4 py-3 text-sm outline-none'} placeholder="我的空间" />
              </label>
              <label className="grid gap-2">
                <span className={isMobile ? 'text-[13px] font-bold text-[#526070]' : 'text-sm font-bold [color:var(--kc-text)]'}>主页标签</span>
                <input value={profileDraft.profile_tagline} onChange={(event) => updateDraft('profile_tagline', event.target.value)} className={isMobile ? 'kc-qq-input' : 'glass-input rounded-2xl px-4 py-3 text-sm outline-none'} placeholder="今天也要开心聊天" />
              </label>
              <label className="grid gap-2">
                <span className={isMobile ? 'text-[13px] font-bold text-[#526070]' : 'text-sm font-bold [color:var(--kc-text)]'}>当前状态</span>
                <input value={profileDraft.profile_status} onChange={(event) => updateDraft('profile_status', event.target.value)} className={isMobile ? 'kc-qq-input' : 'glass-input rounded-2xl px-4 py-3 text-sm outline-none'} placeholder="在线摸鱼中" />
              </label>
              <label className="grid gap-2">
                <span className={isMobile ? 'text-[13px] font-bold text-[#526070]' : 'text-sm font-bold [color:var(--kc-text)]'}>所在地</span>
                <input value={profileDraft.profile_location} onChange={(event) => updateDraft('profile_location', event.target.value)} className={isMobile ? 'kc-qq-input' : 'glass-input rounded-2xl px-4 py-3 text-sm outline-none'} placeholder="互联网角落" />
              </label>
            </div>
            <label className="grid gap-2">
              <span className={isMobile ? 'text-[13px] font-bold text-[#526070]' : 'text-sm font-bold [color:var(--kc-text)]'}>兴趣标签</span>
              <input value={profileDraft.profile_interests} onChange={(event) => updateDraft('profile_interests', event.target.value)} className={isMobile ? 'kc-qq-input' : 'glass-input rounded-2xl px-4 py-3 text-sm outline-none'} placeholder="聊天, 编程, 音乐" />
            </label>
            <label className="grid gap-2">
              <span className={isMobile ? 'text-[13px] font-bold text-[#526070]' : 'text-sm font-bold [color:var(--kc-text)]'}>个人简介</span>
              <textarea value={profileDraft.bio} onChange={(event) => updateDraft('bio', event.target.value)} rows={isMobile ? 3 : 4} maxLength={1000} className={isMobile ? 'kc-qq-input min-h-[92px] resize-none leading-6' : 'glass-input min-h-[112px] resize-none rounded-2xl px-4 py-3 text-sm leading-6 outline-none'} placeholder="写一段会展示在主页封面里的简介" />
              <span className={isMobile ? 'text-right text-[11px] font-bold text-[#8b95a5]' : 'text-right text-xs [color:var(--kc-muted)]'}>{profileDraft.bio.length}/1000</span>
            </label>
          </section>

          <section className={isMobile ? 'grid gap-3 rounded-[26px] bg-[#f6f8fc] p-3' : 'grid gap-4 rounded-[24px] border p-4 [background:var(--kc-panel-muted)] [border-color:var(--kc-border)]'}>
            <div>
              <h4 className={isMobile ? 'text-[15px] font-black text-[#111827]' : 'text-base font-bold [color:var(--kc-text)]'}>视觉系统</h4>
              <p className={isMobile ? 'mt-1 text-[12px] font-medium text-[#8b95a5]' : 'mt-1 text-xs [color:var(--kc-muted)]'}>版式决定空间节奏，卡片风格决定资料层次。</p>
            </div>
            <div className={isMobile ? 'grid gap-2' : 'grid gap-3 sm:grid-cols-3'}>
              {profileLayoutOptions.map((option) => {
                const active = profileDraft.profile_layout === option.value;
                return (
                  <button key={option.value} type="button" onClick={() => updateDraft('profile_layout', option.value)} className={`${isMobile ? 'rounded-[20px] p-3' : 'rounded-[18px] border p-4'} cursor-pointer text-left transition hover:-translate-y-0.5 ${active ? 'text-white shadow-[0_14px_30px_rgba(22,139,255,.22)]' : isMobile ? 'bg-white text-[#111827]' : '[background:var(--kc-panel)] [border-color:var(--kc-border)] [color:var(--kc-text)]'}`} style={active ? { background: accent, borderColor: accent } : undefined}>
                    <span className="block text-sm font-black">{option.label}</span>
                    <span className="mt-1 block text-xs opacity-75">{option.detail}</span>
                  </button>
                );
              })}
            </div>
            <div className={isMobile ? 'grid gap-2' : 'grid gap-3 sm:grid-cols-3'}>
              {profileCardStyleOptions.map((option) => {
                const active = profileDraft.profile_card_style === option.value;
                return (
                  <button key={option.value} type="button" onClick={() => updateDraft('profile_card_style', option.value)} className={`${isMobile ? 'rounded-[20px] p-3' : 'rounded-[18px] border p-4'} cursor-pointer text-left transition hover:-translate-y-0.5 ${active ? 'bg-[#111827] text-white shadow-[0_14px_30px_rgba(17,24,39,.18)] [border-color:#111827]' : isMobile ? 'bg-white text-[#111827]' : '[background:var(--kc-panel)] [border-color:var(--kc-border)] [color:var(--kc-text)]'}`}>
                    <span className="block text-sm font-black">{option.label}</span>
                    <span className="mt-1 block text-xs opacity-75">{option.detail}</span>
                  </button>
                );
              })}
            </div>
            <div className="grid gap-2">
              <span className={isMobile ? 'text-[13px] font-bold text-[#526070]' : 'text-sm font-bold [color:var(--kc-text)]'}>强调色</span>
              <div className="flex flex-wrap items-center gap-2">
                {profileAccentPresets.map((color) => (
                  <button key={color} type="button" onClick={() => updateDraft('profile_accent_color', color)} className={`grid h-9 w-9 cursor-pointer place-items-center rounded-full border-2 transition hover:scale-105 ${profileDraft.profile_accent_color === color ? 'border-white shadow-[0_0_0_3px_rgba(22,139,255,.22)]' : 'border-transparent'}`} style={{ background: color }} aria-label={`选择强调色 ${color}`}>
                    {profileDraft.profile_accent_color === color ? <Icon name="check" className="h-4 w-4 text-white" /> : null}
                  </button>
                ))}
                <input type="color" value={profileDraft.profile_accent_color} onChange={(event) => updateDraft('profile_accent_color', event.target.value)} className={isMobile ? 'h-9 w-14 cursor-pointer rounded-full border-0 bg-white px-1 py-1' : 'h-9 w-14 cursor-pointer rounded-full border px-1 py-1 [background:var(--kc-panel)] [border-color:var(--kc-border)]'} aria-label="自定义强调色" />
              </div>
            </div>
          </section>
        </div>

        <aside className={isMobile ? 'grid gap-3 rounded-[26px] bg-[#f6f8fc] p-3' : 'sticky top-4 grid self-start rounded-[24px] border p-4 [background:var(--kc-panel-muted)] [border-color:var(--kc-border)]'}>
          <p className={isMobile ? 'text-[13px] font-black text-[#526070]' : 'text-sm font-bold [color:var(--kc-text)]'}>实时预览</p>
          <div className="overflow-hidden rounded-[24px] bg-white shadow-[0_20px_50px_rgba(15,23,42,.14)]">
            <div className="h-24" style={{ background: coverBackground }} />
            <div className="-mt-8 px-4 pb-4">
              <Avatar user={displayUser} size="lg" />
              <h5 className="mt-2 truncate text-[18px] font-black text-slate-950">{displayName}</h5>
              <p className="truncate text-[12px] font-bold text-slate-500">{profileTitle} · {userHandle(displayUser, fallbackId)}</p>
              {profileTagline ? <p className="mt-3 inline-flex max-w-full rounded-full px-3 py-1 text-[12px] font-black text-white" style={{ background: accent }}><span className="truncate">{profileTagline}</span></p> : null}
            </div>
          </div>
          {coverMutation.error ? <p className={isMobile ? 'rounded-[18px] bg-red-50 px-4 py-3 text-[13px] text-red-500' : 'rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500'}>{coverErrorMessage}</p> : null}
          {saveProfileMutation.error ? <p className={isMobile ? 'rounded-[18px] bg-red-50 px-4 py-3 text-[13px] text-red-500' : 'rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500'}>{saveErrorMessage}</p> : null}
        </aside>
      </div>
    </section>
  ) : null;

  if (isMobile) {
    const mobileAvatarSize = profileLayout === 'banner' ? 'lg' : profileLayout === 'compact' ? 'md' : 'lg';
    return (
      <section className="kc-qq-page kc-profile-space-page flex h-full min-h-0 flex-col overflow-hidden text-[#111827]">
        <MobileStatusBar />
        <div className="kc-qq-scroll scroll-soft min-h-0 flex-1 overflow-y-auto pb-[calc(var(--kc-mobile-bottom-nav-space)+24px)]">
          <header className={`kc-profile-hero relative overflow-hidden text-white ${profileCoverClasses(profileLayout, true)}`}>
            <div className="absolute inset-0 z-0" style={{ background: coverBackground }} />
            <div className="absolute inset-x-0 bottom-0 z-0 h-28 [background:linear-gradient(to_top,rgba(0,0,0,0.42),transparent)]" />
            <div className="absolute right-4 top-16 z-0 h-24 w-24 rounded-full blur-2xl [background:rgba(255,255,255,0.12)]" />
            <div className="relative z-10 mb-4 flex items-center justify-between">
              <button type="button" onClick={onClose} className="grid h-9 w-9 cursor-pointer place-items-center rounded-full text-white backdrop-blur transition [background:rgba(255,255,255,0.18)] hover:[background:rgba(255,255,255,0.24)]" aria-label="返回动态">
                <Icon name="chevronLeft" className="h-5 w-5" />
              </button>
              <p className="max-w-[52vw] truncate text-[15px] font-black">{profileTitle}</p>
              <div className="flex items-center gap-2">
                {displayUser ? <button type="button" onClick={() => setShareProfileOpen(true)} className="inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-bold text-white backdrop-blur transition [background:rgba(255,255,255,0.18)] hover:[background:rgba(255,255,255,0.24)]"><Icon name="send" className="h-3.5 w-3.5" />分享</button> : null}
                {isSelf ? (
                  <button type="button" onClick={() => setEditingProfile((value) => !value)} className="inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-bold text-white backdrop-blur transition [background:rgba(255,255,255,0.18)] hover:[background:rgba(255,255,255,0.24)]"><Icon name="edit" className="h-3.5 w-3.5" />{editingProfile ? '收起' : '编辑'}</button>
                ) : (
                  <button type="button" onClick={handleFriendAction} disabled={friendButtonDisabled} className="inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-bold text-white backdrop-blur transition [background:rgba(255,255,255,0.18)] hover:[background:rgba(255,255,255,0.24)] disabled:cursor-not-allowed disabled:opacity-60"><Icon name={isFriend ? 'message' : 'userPlus'} className="h-3.5 w-3.5" />{friendButtonLabel}</button>
                )}
              </div>
            </div>
            <div className={`relative z-10 flex min-w-0 ${profileLayout === 'banner' ? 'mt-12 flex-col items-start gap-4' : profileLayout === 'compact' ? 'items-center gap-3' : 'items-center gap-4'}`}>
              <Avatar user={displayUser} size={mobileAvatarSize} />
              <div className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <h2 className={`${profileLayout === 'banner' ? 'text-[30px]' : profileLayout === 'compact' ? 'text-[21px]' : 'text-[24px]'} truncate font-black leading-tight`}>{displayName}</h2>
                  {isSelf ? <span className="rounded-full px-2 py-0.5 text-[11px] font-black backdrop-blur [background:rgba(255,255,255,0.18)] [color:rgba(255,255,255,0.9)]">我的空间</span> : null}
                </div>
                <p className="mt-1 text-[13px] font-semibold [color:rgba(255,255,255,0.78)]">{userHandle(displayUser, fallbackId)}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                    {profileTagline ? <p className="inline-flex max-w-full select-text rounded-full px-2.5 py-1 text-[12px] font-bold backdrop-blur [background:rgba(255,255,255,0.18)] [color:rgba(255,255,255,0.9)]"><span className="truncate">{profileTagline}</span></p> : null}
                  {profileStatus ? <p className="inline-flex max-w-full rounded-full px-2.5 py-1 text-[12px] font-bold backdrop-blur [background:rgba(0,0,0,0.16)] [color:rgba(255,255,255,0.86)]"><span className="truncate">{profileStatus}</span></p> : null}
                </div>
                  <p className="mt-3 line-clamp-2 select-text text-[13px] font-medium leading-5 [color:rgba(255,255,255,0.82)]">{profileBio || (isSelf ? '还没有填写简介' : '这个人还没有写简介')}</p>
                {isSelf && displayUser?.profile_cover_moderation_status === 'pending' ? <p className="mt-2 text-[11px] font-bold [color:rgba(255,255,255,0.8)]">封面审核中，仅自己可见</p> : null}
                {isSelf && displayUser?.profile_cover_moderation_status === 'rejected' ? <p className="mt-2 text-[11px] font-bold [color:#fee2e2]">封面审核未通过，请重新上传</p> : null}
              </div>
            </div>
            <div className={`kc-profile-metrics relative z-10 grid grid-cols-3 gap-2 text-center text-[12px] font-bold ${profileLayout === 'compact' ? 'mt-4' : 'mt-6'}`}>
              {metricCards.map((metric) => (
                <div key={metric.label} className={`rounded-[20px] px-2 py-2.5 ${metricCardClass}`}>
                  <Icon name={metric.icon} className="mx-auto mb-1 h-4 w-4 opacity-70" />
                  <p className="text-[20px] leading-none">{metric.value}</p>
                  <p className="mt-1 opacity-75">{metric.label}</p>
                </div>
              ))}
            </div>
          </header>
          <div className="kc-profile-body px-4 py-3">
            <div className="kc-profile-stagger grid gap-3">
              {profileEditor}
              {friendRequestError || directMessageError ? <p className="rounded-[18px] bg-red-50 px-4 py-3 text-[13px] font-bold text-red-500">{friendRequestError || directMessageError}</p> : null}
              <section className="kc-qq-card grid gap-3 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-[17px] font-black text-[#111827]">空间名片</h3>
                    <p className="mt-1 text-[12px] font-medium text-[#8b95a5]">{profileTitle} · {visiblePosts} 条可见动态</p>
                  </div>
                  <span className="grid h-10 w-10 place-items-center rounded-[18px] text-white shadow-[0_10px_20px_rgba(22,139,255,.2)]" style={{ background: accent }}><Icon name="sparkles" className="h-5 w-5" /></span>
                </div>
                {(profileLocation || interests.length > 0) ? (
                  <div className="grid gap-3 rounded-[22px] bg-[#f6f8fc] p-3">
                    {profileLocation ? <p className="inline-flex items-center gap-2 text-[13px] font-bold text-[#526070]"><Icon name="pin" className="h-4 w-4 text-[#8b95a5]" />{profileLocation}</p> : null}
                    {interests.length > 0 ? <div className="flex flex-wrap gap-2">{interests.map((item) => <span key={item} className="rounded-full px-3 py-1 text-[12px] font-bold text-white" style={{ background: accent }}>{item}</span>)}</div> : null}
                  </div>
                ) : (
                  <p className="rounded-[22px] bg-[#f6f8fc] px-4 py-3 text-[13px] font-bold text-[#8b95a5]">{isSelf ? '编辑主页后，这里会展示所在地和兴趣标签。' : '这个人还没有公开更多资料。'}</p>
                )}
              </section>
              {ccwProfileUrl ? (
                <section className="kc-qq-card overflow-hidden border border-[#cfe8ff] bg-[linear-gradient(145deg,#f4faff,#ffffff)] p-4 shadow-[0_18px_44px_rgba(22,139,255,.10)]">
                  <div className="flex items-start gap-3">
                    {ccwAvatarUrl ? <img src={ccwAvatarUrl} alt={displayUser?.ccw_name ?? 'CCW'} className="h-16 w-16 rounded-[24px] object-cover shadow-[0_12px_26px_rgba(22,139,255,.16)]" /> : <span className="grid h-16 w-16 place-items-center rounded-[24px] bg-[#168bff] text-white"><Icon name="ccw" className="h-7 w-7" /></span>}
                    <div className="min-w-0 flex-1 pt-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <h3 className="min-w-0 truncate text-[21px] font-black leading-tight text-[#111827]">{displayUser?.ccw_name || '已绑定 CCW'}</h3>
                        <span className="shrink-0 rounded-full bg-[#168bff] px-2.5 py-1 text-[11px] font-black leading-none text-white shadow-[0_8px_18px_rgba(22,139,255,.18)]">CCW</span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-[12px] font-medium leading-5 text-[#7b8796]">{displayUser?.ccw_bio || '这个 CCW 用户暂时没有公开简介。'}</p>
                    </div>
                    <button type="button" onClick={() => void openExternalUrl(ccwProfileUrl)} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-[#168bff] shadow-[0_8px_18px_rgba(22,139,255,.12)]"><Icon name="external" className="h-[18px] w-[18px]" /></button>
                  </div>
                  <div className="mt-4 grid grid-cols-3 overflow-hidden rounded-[24px] bg-white shadow-[0_10px_24px_rgba(15,23,42,.06)] ring-1 ring-[#e7edf5]">
                    {ccwPrimaryStats.map((stat, index) => <span key={stat.label} className={`px-2 py-3 text-center ${index > 0 ? 'border-l border-[#edf1f6]' : ''}`}><strong className={`block whitespace-nowrap text-[18px] leading-none tracking-[-0.02em] ${index === 0 ? 'text-[#168bff]' : 'text-[#111827]'}`}>{formatCompact(stat.value)}</strong><small className="mt-1 block text-[11px] font-black text-[#8b95a5]">{stat.label}</small></span>)}
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-1.5">
                    {ccwSecondaryStats.map((stat) => <span key={stat.label} className="truncate rounded-full bg-white px-2.5 py-1 text-center text-[11px] font-black text-[#526070] shadow-[0_6px_14px_rgba(15,23,42,.04)]">{stat.label}<strong className="ml-1 text-[#111827]">{formatCompact(stat.value)}</strong></span>)}
                  </div>
                </section>
              ) : null}
              <div className="flex items-center justify-between gap-3 px-1">
                <h3 className="text-[17px] font-black text-[#111827]">{isSelf ? '我的动态' : 'Ta 的动态'}</h3>
                <span className="text-[12px] font-bold text-[#8b95a5]">共 {visiblePosts} 条</span>
              </div>
              {postsQuery.isLoading ? <p className="kc-qq-post-empty">正在打开个人主页...</p> : null}
              {!postsQuery.isLoading && posts.length === 0 ? (
                <section className="kc-qq-card grid place-items-center gap-2 px-5 py-10 text-center">
                  <span className="grid h-14 w-14 place-items-center rounded-[24px] bg-[#edf6ff] text-[#168bff]"><Icon name="feed" className="h-7 w-7" /></span>
                  <p className="text-[15px] font-black text-[#111827]">暂无可见动态</p>
                  <p className="text-[12px] font-medium text-[#8b95a5]">新的动态会出现在这里。</p>
                </section>
              ) : null}
              <div className={`kc-profile-stagger ${postGapClass}`}>
                {posts.map((post) => <PostCard key={post.id} post={post} currentUser={currentUser} isMobile={isMobile} onOpenUserSpace={onOpenUserSpace} onOpenPost={onOpenPost} onEditPost={onEditPost} />)}
              </div>
              {postsQuery.hasNextPage ? <button type="button" onClick={() => void postsQuery.fetchNextPage()} className="mx-auto cursor-pointer rounded-full bg-white px-5 py-2 text-[13px] font-bold text-[#8b95a5] shadow-sm transition hover:text-[#168bff]">加载更多</button> : null}
            </div>
          </div>
        </div>
        {shareProfileOpen && displayUser ? <UserShareTargetModal user={displayUser} currentUser={currentUser} isMobile={isMobile} onClose={() => setShareProfileOpen(false)} /> : null}
      </section>
    );
  }

  return (
    <section className="kc-profile-space-page flex h-full min-h-0 flex-col overflow-hidden [background:linear-gradient(180deg,color-mix(in_srgb,var(--kc-accent)_7%,var(--kc-chat))_0%,var(--kc-chat)_260px)] [color:var(--kc-text)]">
      <div className="scroll-soft min-h-0 flex-1 overflow-y-auto px-8 py-5">
        <div className={`kc-profile-body mx-auto grid gap-5 ${profileContentMaxClass(profileLayout)}`}>
          <div className="kc-profile-toolbar flex items-center justify-between gap-4">
            <button type="button" onClick={onClose} className="inline-flex cursor-pointer items-center gap-1.5 rounded-[14px] px-3 py-2 text-sm font-semibold transition [color:var(--kc-muted)] hover:[background:var(--kc-hover)] hover:[color:var(--kc-text)]">
              <Icon name="chevronLeft" className="h-4 w-4" /> 返回动态
            </button>
              <div className="flex items-center gap-2">
                {displayUser ? <button type="button" onClick={() => setShareProfileOpen(true)} className="inline-flex cursor-pointer items-center gap-2 rounded-[14px] border px-4 py-2 text-sm font-bold transition [background:var(--kc-panel)] [border-color:var(--kc-border)] [color:var(--kc-text)] hover:-translate-y-0.5 hover:[background:var(--kc-hover)]"><Icon name="send" className="h-4 w-4" />分享</button> : null}
                {isSelf ? (
                  <button type="button" onClick={() => setEditingProfile((value) => !value)} className="inline-flex cursor-pointer items-center gap-2 rounded-[14px] border px-4 py-2 text-sm font-bold transition [background:var(--kc-panel)] [border-color:var(--kc-border)] [color:var(--kc-text)] hover:-translate-y-0.5 hover:[background:var(--kc-hover)]"><Icon name="edit" className="h-4 w-4" />{editingProfile ? '收起编辑' : '编辑主页'}</button>
                ) : (
                  <button type="button" onClick={handleFriendAction} disabled={friendButtonDisabled} className="inline-flex cursor-pointer items-center gap-2 rounded-[14px] border px-4 py-2 text-sm font-bold transition [background:var(--kc-panel)] [border-color:var(--kc-border)] [color:var(--kc-text)] hover:-translate-y-0.5 hover:[background:var(--kc-hover)] disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-55"><Icon name={isFriend ? 'message' : 'userPlus'} className="h-4 w-4" />{friendButtonLabel}</button>
                )}
              </div>
          </div>

          <section className={`kc-profile-hero overflow-hidden rounded-[34px] border shadow-[0_24px_70px_rgba(15,23,42,.12)] [background:var(--kc-panel)] [border-color:var(--kc-border)] ${profileCoverClasses(profileLayout, false)}`}>
            <div className={`relative flex h-full min-h-[inherit] overflow-hidden px-7 py-6 ${profileLayout === 'banner' ? 'items-end' : profileLayout === 'compact' ? 'items-center gap-5 py-5' : 'items-center gap-6'}`}>
              <div className="absolute inset-0 z-0" style={{ background: coverBackground }} />
              <div className="absolute inset-0 z-0 [background:radial-gradient(circle_at_75%_20%,rgba(255,255,255,0.22),transparent_26%),linear-gradient(90deg,rgba(0,0,0,0.46),rgba(0,0,0,0.12)_56%,rgba(0,0,0,0.32))]" />
              {profileLayout === 'banner' ? (
                <div className="relative z-10 flex w-full items-end gap-5 rounded-[30px] border p-5 shadow-[0_22px_54px_rgba(0,0,0,.2)] backdrop-blur-xl [background:linear-gradient(135deg,rgba(7,12,24,0.64),rgba(7,12,24,0.34))] [border-color:rgba(255,255,255,0.18)]">
                  <div className="shrink-0 rounded-full p-2 shadow-[0_22px_48px_rgba(15,23,42,.3)] [background:rgba(255,255,255,0.2)]">
                    <Avatar user={displayUser} size="lg" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className="truncate text-[36px] font-black leading-tight text-white [text-shadow:0_2px_16px_rgba(0,0,0,.32)]">{displayName}</h1>
                      {isSelf ? <span className="rounded-full px-2.5 py-1 text-xs font-black text-white backdrop-blur [background:rgba(255,255,255,0.18)]">我的空间</span> : null}
                    </div>
                    <p className="mt-1 text-sm font-bold [color:rgba(255,255,255,0.82)]">{profileTitle} · {userHandle(displayUser, fallbackId)}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {profileTagline ? <p className="inline-flex max-w-full rounded-full px-3 py-1.5 text-xs font-bold backdrop-blur [background:rgba(255,255,255,0.16)] [color:rgba(255,255,255,0.92)]"><span className="truncate">{profileTagline}</span></p> : null}
                      {profileStatus ? <p className="inline-flex max-w-full rounded-full px-3 py-1.5 text-xs font-bold backdrop-blur [background:rgba(0,0,0,0.18)] [color:rgba(255,255,255,0.86)]"><span className="truncate">{profileStatus}</span></p> : null}
                    </div>
                    <p className="mt-3 line-clamp-2 max-w-[620px] select-text text-sm font-medium leading-6 [color:rgba(255,255,255,0.86)]">{profileBio || (isSelf ? '还没有填写简介' : '这个人还没有写简介')}</p>
                    {isSelf && displayUser?.profile_cover_moderation_status === 'pending' ? <p className="mt-2 text-xs font-semibold [color:rgba(255,255,255,0.78)]">封面审核中，仅自己可见</p> : null}
                    {isSelf && displayUser?.profile_cover_moderation_status === 'rejected' ? <p className="mt-2 text-xs font-semibold [color:#fee2e2]">封面审核未通过，请重新上传</p> : null}
                  </div>
                  <div className="kc-profile-metrics grid min-w-[250px] grid-cols-3 gap-2 text-center">
                    {metricCards.map((metric) => (
                      <div key={metric.label} className="rounded-[20px] px-3 py-3 backdrop-blur [background:rgba(255,255,255,0.14)] [color:white]">
                        <Icon name={metric.icon} className="mx-auto mb-1 h-4 w-4 [color:rgba(255,255,255,0.72)]" />
                        <p className="text-xl font-black leading-none">{metric.value}</p>
                        <p className="mt-1 text-xs font-bold [color:rgba(255,255,255,0.72)]">{metric.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  <div className="relative z-10 shrink-0 rounded-full p-1.5 shadow-[0_12px_28px_rgba(15,23,42,.22)] [background:rgba(255,255,255,0.16)]">
                    <Avatar user={displayUser} size="lg" />
                  </div>
                  <div className="relative z-10 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className={`${profileLayout === 'compact' ? 'text-[24px]' : 'text-[30px]'} truncate font-black leading-tight text-white`}>{displayName}</h1>
                      {isSelf ? <span className="rounded-full px-2.5 py-1 text-xs font-black text-white backdrop-blur [background:rgba(255,255,255,0.18)]">我的空间</span> : null}
                    </div>
                    <p className="mt-1 text-sm font-bold [color:rgba(255,255,255,0.78)]">{profileTitle} · {userHandle(displayUser, fallbackId)}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {profileTagline ? <p className="inline-flex max-w-full rounded-full px-3 py-1.5 text-xs font-bold backdrop-blur [background:rgba(255,255,255,0.16)] [color:rgba(255,255,255,0.92)]"><span className="truncate">{profileTagline}</span></p> : null}
                      {profileStatus ? <p className="inline-flex max-w-full rounded-full px-3 py-1.5 text-xs font-bold backdrop-blur [background:rgba(0,0,0,0.16)] [color:rgba(255,255,255,0.84)]"><span className="truncate">{profileStatus}</span></p> : null}
                    </div>
                    <p className="mt-3 line-clamp-2 max-w-[620px] select-text text-sm font-medium leading-6 [color:rgba(255,255,255,0.82)]">{profileBio || (isSelf ? '还没有填写简介' : '这个人还没有写简介')}</p>
                    {isSelf && displayUser?.profile_cover_moderation_status === 'pending' ? <p className="mt-2 text-xs font-semibold [color:rgba(255,255,255,0.78)]">封面审核中，仅自己可见</p> : null}
                    {isSelf && displayUser?.profile_cover_moderation_status === 'rejected' ? <p className="mt-2 text-xs font-semibold [color:#fee2e2]">封面审核未通过，请重新上传</p> : null}
                  </div>
                   <div className={`kc-profile-metrics relative z-10 grid gap-2 text-center ${profileLayout === 'compact' ? 'min-w-[172px] grid-cols-1' : 'min-w-[250px] grid-cols-3'}`}>
                    {metricCards.map((metric) => (
                      <div key={metric.label} className={`rounded-[18px] px-3 py-3 ${metricCardClass}`}>
                        <Icon name={metric.icon} className="mx-auto mb-1 h-4 w-4 opacity-70" />
                        <p className="text-xl font-black leading-none">{metric.value}</p>
                        <p className="mt-1 text-xs font-bold opacity-70">{metric.label}</p>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </section>

          {profileEditor}
          {friendRequestError || directMessageError ? <p className="rounded-[18px] border px-4 py-3 text-sm font-semibold [background:rgba(239,68,68,0.1)] [border-color:rgba(239,68,68,0.18)] [color:#dc2626]">{friendRequestError || directMessageError}</p> : null}

          <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
            <aside className="kc-profile-aside kc-profile-stagger grid content-start gap-4">
              <section className="rounded-[28px] border p-5 shadow-[0_14px_40px_rgba(15,23,42,.05)] [background:var(--kc-panel)] [border-color:var(--kc-border)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-black [color:var(--kc-text)]">空间名片</h2>
                    <p className="mt-1 text-xs font-semibold [color:var(--kc-muted)]">主页资料与个性标签</p>
                  </div>
                  <span className="grid h-11 w-11 place-items-center rounded-[18px] text-white shadow-[0_10px_24px_rgba(15,23,42,.16)]" style={{ background: accent }}><Icon name="sparkles" className="h-5 w-5" /></span>
                </div>
                <div className="mt-4 grid gap-3">
                  {profileLocation ? <p className="inline-flex items-center gap-2 rounded-[16px] px-3 py-2 text-sm font-semibold [background:var(--kc-panel-muted)] [color:var(--kc-muted)]"><Icon name="pin" className="h-4 w-4" />{profileLocation}</p> : null}
                  {interests.length > 0 ? <div className="flex flex-wrap gap-2">{interests.map((item) => <span key={item} className="rounded-full px-3 py-1 text-xs font-black text-white" style={{ background: accent }}>{item}</span>)}</div> : null}
                  {!profileLocation && interests.length === 0 ? <p className="rounded-[16px] px-3 py-3 text-sm font-semibold [background:var(--kc-panel-muted)] [color:var(--kc-muted)]">{isSelf ? '编辑主页后，这里会展示所在地和兴趣标签。' : '这个人还没有公开更多资料。'}</p> : null}
                </div>
              </section>
              <section className="rounded-[28px] border p-5 [background:linear-gradient(135deg,color-mix(in_srgb,var(--kc-accent)_12%,transparent),transparent),var(--kc-panel)] [border-color:var(--kc-border)]">
                <p className="text-sm font-black [color:var(--kc-text)]">空间状态</p>
                <p className="mt-2 select-text text-sm leading-6 [color:var(--kc-muted)]">{profileStatus || (isSelf ? '写一句状态，让主页更有现场感。' : 'Ta 暂时没有写状态。')}</p>
              </section>
              {ccwProfileUrl ? (
                <section className="rounded-[30px] border p-5 shadow-[0_18px_46px_rgba(15,23,42,.06)] [background:linear-gradient(145deg,color-mix(in_srgb,var(--kc-accent)_10%,transparent),var(--kc-panel)_52%)] [border-color:color-mix(in_srgb,var(--kc-accent)_24%,var(--kc-border))]">
                  <div className="flex items-start gap-3">
                    {ccwAvatarUrl ? <img src={ccwAvatarUrl} alt={displayUser?.ccw_name ?? 'CCW'} className="h-16 w-16 rounded-[24px] object-cover shadow-[0_14px_32px_rgba(15,23,42,.12)]" /> : <span className="grid h-16 w-16 place-items-center rounded-[24px] text-white" style={{ background: accent }}><Icon name="ccw" className="h-7 w-7" /></span>}
                    <div className="min-w-0 flex-1 pt-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <h2 className="min-w-0 truncate text-xl font-black leading-tight [color:var(--kc-text)]">{displayUser?.ccw_name || '已绑定 CCW'}</h2>
                        <span className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black leading-none text-white shadow-[0_8px_18px_rgba(22,139,255,.18)] [background:var(--kc-accent)]">CCW</span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 [color:var(--kc-muted)]">{displayUser?.ccw_bio || '这个 CCW 用户暂时没有公开简介。'}</p>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-3 overflow-hidden rounded-[24px] border [background:var(--kc-panel)] [border-color:var(--kc-border)]">
                    {ccwPrimaryStats.map((stat, index) => <span key={stat.label} className={`px-2 py-3 text-center ${index > 0 ? 'border-l [border-color:var(--kc-border)]' : ''}`}><strong className={`block whitespace-nowrap text-[17px] leading-none tracking-[-0.02em] ${index === 0 ? '[color:var(--kc-accent)]' : '[color:var(--kc-text)]'}`}>{formatCompact(stat.value)}</strong><small className="mt-1 block text-[11px] font-black [color:var(--kc-muted)]">{stat.label}</small></span>)}
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-1.5">
                    {ccwSecondaryStats.map((stat) => <span key={stat.label} className="truncate rounded-full border px-2.5 py-1 text-center text-[11px] font-black [background:var(--kc-panel)] [border-color:var(--kc-border)] [color:var(--kc-muted)]">{stat.label}<strong className="ml-1 [color:var(--kc-text)]">{formatCompact(stat.value)}</strong></span>)}
                  </div>
                  <button type="button" onClick={() => void openExternalUrl(ccwProfileUrl)} className="mt-4 flex w-full items-center justify-center gap-2 rounded-[18px] border px-4 py-2.5 text-sm font-black [border-color:var(--kc-border)] [color:var(--kc-accent)] hover:[background:var(--kc-hover)]"><Icon name="external" className="h-4 w-4" />打开 CCW 主页</button>
                </section>
              ) : null}
            </aside>

            <main className="kc-profile-main min-w-0">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-black [color:var(--kc-text)]">{isSelf ? '我的动态' : 'Ta 的动态'}</h2>
                  <p className="mt-1 text-sm [color:var(--kc-muted)]">共 {visiblePosts} 条可见动态</p>
                </div>
                <div className="flex shrink-0 gap-2 rounded-full p-1 [background:var(--kc-panel-muted)]">
                  {feedSortTabs.map((tab) => <button key={tab.value} type="button" onClick={() => setPostSort(tab.value)} className={`rounded-full px-3 py-1.5 text-xs font-bold ${postSort === tab.value ? '[background:var(--kc-accent)] text-white' : '[color:var(--kc-muted)] hover:[color:var(--kc-text)]'}`}>{tab.label}</button>)}
                </div>
              </div>
              {postsQuery.isLoading ? <p className="rounded-[24px] border p-6 text-center text-sm [background:var(--kc-panel)] [border-color:var(--kc-border)] [color:var(--kc-muted)]">正在打开个人主页...</p> : null}
              {!postsQuery.isLoading && posts.length === 0 ? (
                <section className="grid place-items-center gap-3 rounded-[28px] border p-10 text-center [background:var(--kc-panel)] [border-color:var(--kc-border)]">
                  <span className="grid h-14 w-14 place-items-center rounded-[22px] text-white" style={{ background: accent }}><Icon name="feed" className="h-7 w-7" /></span>
                  <p className="text-base font-black [color:var(--kc-text)]">暂无可见动态</p>
                  <p className="text-sm [color:var(--kc-muted)]">新的动态会展示在这里。</p>
                </section>
              ) : null}
              <div className={`kc-profile-stagger ${postGapClass}`}>
                {posts.map((post) => <PostCard key={post.id} post={post} currentUser={currentUser} isMobile={isMobile} onOpenUserSpace={onOpenUserSpace} onOpenPost={onOpenPost} onEditPost={onEditPost} />)}
              </div>
              {postsQuery.hasNextPage ? <button type="button" onClick={() => void postsQuery.fetchNextPage()} className="mx-auto mt-4 block cursor-pointer rounded-[14px] border px-5 py-2 text-sm font-semibold transition [background:var(--kc-panel)] [border-color:var(--kc-border)] [color:var(--kc-muted)] hover:[color:var(--kc-text)]">加载更多</button> : null}
            </main>
          </div>
        </div>
      </div>
      {shareProfileOpen && displayUser ? <UserShareTargetModal user={displayUser} currentUser={currentUser} isMobile={isMobile} onClose={() => setShareProfileOpen(false)} /> : null}
    </section>
  );
}

export function PostsPanel({ currentUser, isMobile, onOpenMobileUserProfile, conversations = [], bookmarks = [], bookmarksLoading = false, bookmarksError = null, onOpenForwardBundle, onMobileSecondaryActiveChange, onOpenMobileBots, onOpenMobileFeature, onOpenMobileMenuSettings, mobileInitialView = 'home' }: PostsPanelProps): JSX.Element {
  const pendingUserSpaceId = useKukeStore((state) => state.pendingUserSpaceId);
  const pendingPostId = useKukeStore((state) => state.pendingPostId);
  const clearPendingUserSpace = useKukeStore((state) => state.clearPendingUserSpace);
  const clearPendingPost = useKukeStore((state) => state.clearPendingPost);
  const mobileFeatureOrder = useKukeStore((state) => state.mobileFeatureOrder);
  const [scope, setScope] = useState<PostFeedScope>('friends');
  const [feedSort, setFeedSort] = useState<PostFeedSort>('latest');
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [creatorsOpen, setCreatorsOpen] = useState(false);
  const [mobileSpaceView, setMobileSpaceView] = useState<'home' | 'posts' | 'favorites' | 'bots'>(mobileInitialView);
  const [spaceTarget, setSpaceTarget] = useState<{ user: User | null | undefined; fallbackId: number } | null>(null);
  const [detailPost, setDetailPost] = useState<Post | null>(null);
  const [openingDetailPostId, setOpeningDetailPostId] = useState<number | null>(() => isMobile && pendingPostId ? pendingPostId : null);
  const [focusedPostId, setFocusedPostId] = useState<number | null>(null);
  const [pinnedPost, setPinnedPost] = useState<Post | null>(null);
  const [openPostError, setOpenPostError] = useState<string | null>(null);
  const [mobileTransitionOwner, setMobileTransitionOwner] = useState<'composer' | 'notifications' | 'detail' | 'loading' | null>(null);
  const postRefs = useRef(new Map<number, HTMLElement>());
  const feedQuery = useInfiniteQuery({
    queryKey: ['posts', 'feed', scope, selectedTopic, feedSort],
    queryFn: ({ pageParam }) => getPostFeed({ scope, topic: selectedTopic, sort: feedSort, beforeId: pageParam, limit: PAGE_SIZE }),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) => lastPage.length < PAGE_SIZE ? undefined : lastPage[lastPage.length - 1]?.id
  });
  const feedPosts = useMemo(() => feedQuery.data?.pages.flat() ?? [], [feedQuery.data]);
  const posts = useMemo(() => pinnedPost && !feedPosts.some((post) => post.id === pinnedPost.id) ? [pinnedPost, ...feedPosts] : feedPosts, [feedPosts, pinnedPost]);
  const myStatsQuery = useQuery({ queryKey: ['posts', 'user', currentUser.id, 'stats'], queryFn: () => getUserPostStats(currentUser.id) });
  const topicsQuery = useQuery({ queryKey: ['post-topics'], queryFn: () => getTrendingPostTopics(5) });
  const notificationsQuery = useQuery({ queryKey: ['post-notifications'], queryFn: () => getPostNotifications(10) });
  const friendsQuery = useQuery({ queryKey: ['friends'], queryFn: getFriends });
  const friendUsers = (friendsQuery.data ?? []).map((friend) => friend.friend ?? friend.user).filter((user): user is User => Boolean(user) && user.id !== currentUser.id);
  const topicOptions = topicsQuery.data ?? [];
  const activeTab = feedTabs.find((tab) => tab.scope === scope) ?? feedTabs[0];
  useEffect(() => {
    if (focusedPostId === null) {
      return undefined;
    }
    const timeout = window.setTimeout(() => {
      postRefs.current.get(focusedPostId)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
    return () => window.clearTimeout(timeout);
  }, [focusedPostId, posts]);

  function setPostRef(postId: number, node: HTMLElement | null): void {
    if (node) {
      postRefs.current.set(postId, node);
      return;
    }
    postRefs.current.delete(postId);
  }

  function openUserSpace(user: User | null | undefined, fallbackId: number): void {
    if (isMobile && onOpenMobileUserProfile) {
      onOpenMobileUserProfile(user, fallbackId);
      return;
    }
    runNativeRouteTransition('secondary-forward', () => setSpaceTarget({ user: user ?? null, fallbackId }), isMobile);
  }

  function closeUserSpace(): void {
    runNativeRouteTransition('secondary-back', () => setSpaceTarget(null), isMobile);
  }

  function setMobileSpaceSecondaryView(view: 'home' | 'posts' | 'favorites' | 'bots'): void {
    runNativeRouteTransition(view === 'home' ? 'secondary-back' : 'secondary-forward', () => {
      if (view !== 'home') {
        onMobileSecondaryActiveChange?.(true);
      }
      setMobileSpaceView(view);
      if (view === 'home') {
        onMobileSecondaryActiveChange?.(false);
      }
    }, isMobile);
  }

  function openCreatorsPage(): void {
    runNativeRouteTransition('secondary-forward', () => {
      setCreatorsOpen(true);
      onMobileSecondaryActiveChange?.(true);
    }, isMobile);
  }

  function closeCreatorsPage(): void {
    runNativeRouteTransition('secondary-back', () => {
      setCreatorsOpen(false);
      if (isMobile) onMobileSecondaryActiveChange?.(false);
    }, isMobile);
  }

  function openNotificationsPage(): void {
    runNativeRouteTransition('secondary-forward', () => {
      onMobileSecondaryActiveChange?.(true);
      setMobileTransitionOwner('notifications');
      setNotificationsOpen(true);
    }, isMobile);
  }

  function closeNotificationsPage(): void {
    runNativeRouteTransition('secondary-back', () => {
      setMobileTransitionOwner('notifications');
      setNotificationsOpen(false);
      onMobileSecondaryActiveChange?.(false);
    }, isMobile);
  }

  function openPostFromNotifications(postId: number): void {
    runNativeRouteTransition('secondary-forward', () => {
      onMobileSecondaryActiveChange?.(true);
      setNotificationsOpen(false);
      setDetailPost(null);
      setMobileTransitionOwner('loading');
      setOpeningDetailPostId(postId);
    }, isMobile);
    void getPost(postId).then((loadedPost) => {
      setDetailPost(loadedPost);
      setOpeningDetailPostId(null);
      setMobileTransitionOwner('detail');
    }).catch(() => {
      setOpeningDetailPostId(null);
      setOpenPostError('原动态不可见或已删除');
      window.setTimeout(() => setOpenPostError(null), 2600);
    });
  }

  function selectTopic(topic: string | null): void {
    setSelectedTopic(topic);
    setFeedSort('latest');
    setPinnedPost(null);
    setFocusedPostId(null);
  }

  function openComposer(post?: Post): void {
    runNativeRouteTransition('secondary-forward', () => {
      onMobileSecondaryActiveChange?.(true);
      setMobileTransitionOwner('composer');
      setEditingPost(post ?? null);
      setComposerOpen(true);
    }, isMobile);
  }

  function closeComposer(): void {
    runNativeRouteTransition('secondary-back', () => {
      setMobileTransitionOwner('composer');
      setComposerOpen(false);
      setEditingPost(null);
      onMobileSecondaryActiveChange?.(false);
    }, isMobile);
  }

  const mobileSecondaryActive = isMobile && ((mobileInitialView === 'home' && mobileSpaceView !== 'home') || creatorsOpen || Boolean(spaceTarget) || Boolean(detailPost) || openingDetailPostId !== null || notificationsOpen || composerOpen);
  const mobileSpaceTransitionStyle: CSSProperties | undefined = isMobile && mobileInitialView === 'home' && mobileSpaceView !== 'home' ? { viewTransitionName: 'kc-mobile-route' } : undefined;
  const composerTransitionStyle: CSSProperties | undefined = isMobile && mobileTransitionOwner === 'composer' ? { viewTransitionName: 'kc-mobile-route' } : undefined;
  const notificationsTransitionStyle: CSSProperties | undefined = isMobile && mobileTransitionOwner === 'notifications' ? { viewTransitionName: 'kc-mobile-route' } : undefined;
  const detailLoadingTransitionStyle: CSSProperties | undefined = isMobile && mobileTransitionOwner === 'loading' ? { viewTransitionName: 'kc-mobile-route' } : undefined;
  const detailTransitionStyle: CSSProperties | undefined = isMobile && mobileTransitionOwner === 'detail' ? { viewTransitionName: 'kc-mobile-route' } : undefined;
  const creatorsTransitionStyle: CSSProperties | undefined = isMobile && creatorsOpen ? { viewTransitionName: 'kc-mobile-route' } : undefined;

  useEffect(() => {
    onMobileSecondaryActiveChange?.(mobileSecondaryActive);
    return () => onMobileSecondaryActiveChange?.(false);
  }, [mobileSecondaryActive, onMobileSecondaryActiveChange]);

  useEffect(() => {
    if (!isMobile || mobileInitialView !== 'home' || mobileSpaceView === 'home') {
      return undefined;
    }
    return registerNativeBackHandler(() => {
      setMobileSpaceSecondaryView('home');
      return true;
    }, 20);
  }, [isMobile, mobileInitialView, mobileSpaceView]);

  useEffect(() => {
    if (!isMobile || !creatorsOpen || spaceTarget) return undefined;
    return registerNativeBackHandler(() => {
      closeCreatorsPage();
      return true;
    }, 25);
  }, [creatorsOpen, isMobile, spaceTarget]);

  useEffect(() => {
    if (!pendingUserSpaceId) {
      return;
    }
    setSpaceTarget({ user: null, fallbackId: pendingUserSpaceId });
    clearPendingUserSpace(pendingUserSpaceId);
  }, [clearPendingUserSpace, pendingUserSpaceId]);

  useEffect(() => {
    if (!pendingPostId) {
      return;
    }
    if (isMobile) {
      setMobileSpaceSecondaryView('posts');
    }
    void openPost(pendingPostId);
    clearPendingPost(pendingPostId);
  }, [clearPendingPost, pendingPostId]);

  function closeMobilePostDetail(): void {
    runNativeRouteTransition('secondary-back', () => {
      setMobileTransitionOwner(detailPost ? 'detail' : 'loading');
      setOpeningDetailPostId(null);
      setDetailPost(null);
      onMobileSecondaryActiveChange?.(false);
    }, isMobile);
  }

  async function openPost(postId: number): Promise<void> {
    setOpenPostError(null);
    if (isMobile) {
      const localPost = posts.find((post) => post.id === postId) ?? pinnedPost;
      if (localPost && localPost.id === postId) {
        runNativeRouteTransition('secondary-forward', () => {
          onMobileSecondaryActiveChange?.(true);
          setMobileTransitionOwner('detail');
          setDetailPost(localPost);
          setOpeningDetailPostId(null);
        }, true);
        return;
      }
      runNativeRouteTransition('secondary-forward', () => {
        onMobileSecondaryActiveChange?.(true);
        setMobileTransitionOwner('loading');
        setOpeningDetailPostId(postId);
      }, true);
      try {
        const loadedPost = await getPost(postId);
        setDetailPost(loadedPost);
        setOpeningDetailPostId(null);
        setMobileTransitionOwner('detail');
      } catch {
        setOpeningDetailPostId(null);
        setOpenPostError('原动态不可见或已删除');
        window.setTimeout(() => setOpenPostError(null), 2600);
      }
      return;
    }
    setSpaceTarget(null);
    if (!posts.some((post) => post.id === postId)) {
      try {
        setPinnedPost(await getPost(postId));
      } catch {
        setOpenPostError('原动态不可见或已删除');
        window.setTimeout(() => setOpenPostError(null), 2600);
        return;
      }
    }
    setFocusedPostId(postId);
    window.setTimeout(() => setFocusedPostId((current) => current === postId ? null : current), 2200);
  }

  const myStats = myStatsQuery.data ?? emptyPostStats;
  const totalLikes = myStats.like_count;
  const totalComments = myStats.comment_count;
  const mobilePostDetailLoadingPage = openingDetailPostId !== null && isMobile ? (
    <section className="kc-space-secondary-page fixed inset-0 z-[2147483647] flex min-h-0 w-screen max-w-[100vw] flex-col overflow-hidden [background:var(--kc-mobile-bg)] [color:var(--kc-mobile-text)]" style={detailLoadingTransitionStyle}>
      <header className="flex min-h-[calc(max(44px,env(safe-area-inset-top))+58px)] shrink-0 items-end justify-between gap-3 px-4 pb-3 pt-[max(44px,env(safe-area-inset-top))] [background:var(--kc-mobile-bg)]">
        <button type="button" onClick={closeMobilePostDetail} className="grid h-9 w-9 place-items-center rounded-full bg-[#f4f6fa] text-[#526070]" aria-label="返回上一级"><Icon name="chevronLeft" className="h-5 w-5" /></button>
        <h2 className="min-w-0 flex-1 truncate text-center text-[17px] font-black text-[#151922]">动态详情</h2>
        <span className="h-9 w-9 shrink-0" />
      </header>
      <main className="grid min-h-0 flex-1 place-items-center px-6 text-center">
        <div className="grid gap-3">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-[24px] bg-[#edf6ff] text-[#168bff]"><Icon name="feed" className="h-7 w-7" /></span>
          <p className="text-[15px] font-black text-[#151922]">正在打开动态详情...</p>
        </div>
      </main>
    </section>
  ) : null;

  const mobilePostDetailPage = detailPost && isMobile ? (
    <MobilePostDetailPage post={detailPost} currentUser={currentUser} friendUsers={friendUsers} topicOptions={topicOptions} isMobile={isMobile} transitionStyle={detailTransitionStyle} onClose={closeMobilePostDetail} onOpenUserSpace={openUserSpace} onOpenPost={(postId) => void openPost(postId)} onEditPost={openComposer} />
  ) : null;

  if (spaceTarget) {
    return (
      <>
        <UserSpaceModal
          profileUser={spaceTarget.user}
          fallbackId={spaceTarget.fallbackId}
          currentUser={currentUser}
          isMobile={isMobile}
          onClose={closeUserSpace}
          onOpenUserSpace={openUserSpace}
          onOpenPost={(postId) => void openPost(postId)}
          onEditPost={(post) => {
            closeUserSpace();
            openComposer(post);
          }}
        />
        {mobilePostDetailLoadingPage}
        {mobilePostDetailPage}
      </>
    );
  }

  if (creatorsOpen) {
    return <CcwCreatorsPage isMobile={isMobile} transitionStyle={creatorsTransitionStyle} onBack={closeCreatorsPage} onOpenUserSpace={openUserSpace} />;
  }

  if (isMobile && mobileSpaceView === 'favorites') {
    return (
      <>
        <FavoritesPanel
          conversations={conversations}
          currentUser={currentUser}
          items={bookmarks}
          isLoading={bookmarksLoading}
          error={bookmarksError}
          isMobile
          onOpenForwardBundle={onOpenForwardBundle ?? (() => undefined)}
          onMobileBack={() => setMobileSpaceSecondaryView('home')}
          transitionStyle={mobileSpaceTransitionStyle}
        />
      </>
    );
  }

  if (isMobile && mobileSpaceView === 'posts') {
    return (
      <section className="kc-qq-page h-full min-h-0 overflow-hidden text-[#111827]" style={mobileSpaceTransitionStyle}>
        <MobileStatusBar />
        <div className="kc-qq-scroll kc-mobile-page-transition scroll-soft h-[calc(100%-30px)] overflow-y-auto px-4 pb-5">
          <header className="kc-qq-home-header kc-qq-sticky-home-header">
            <div className="flex min-w-0 items-center gap-3">
              {mobileInitialView === 'home' ? <button type="button" onClick={() => setMobileSpaceSecondaryView('home')} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-[#526070] shadow-sm" aria-label="返回空间">
                <Icon name="chevronLeft" className="h-5 w-5" />
              </button> : null}
              <div className="min-w-0">
                <h1 className="truncate text-[25px] font-bold leading-tight text-[#111827]">动态</h1>
                <p className="mt-1 truncate text-[13px] font-medium text-[#8b95a5]">好友近况、公开分享与我的空间</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={openNotificationsPage} className="kc-qq-round-action relative" aria-label="动态互动" title="动态互动">
                <Icon name="bell" className="h-5 w-5" />
                {(notificationsQuery.data?.unread_count ?? 0) > 0 ? <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-[#ff4f86] px-1.5 py-0.5 text-[10px] font-black text-white">{notificationsQuery.data?.unread_count}</span> : null}
              </button>
              <button type="button" onClick={() => openComposer()} className="kc-qq-round-action" aria-label="发布动态" title="发布动态">
                <Icon name="plus" className="h-5 w-5" />
              </button>
            </div>
          </header>

          <section className="kc-qq-channel-hero kc-qq-posts-hero">
            <div className="min-w-0">
              <p className="text-[13px] font-bold text-[#eaf4ff]">Kuke Zone</p>
              <h2 className="mt-2 text-[30px] font-black leading-none text-white">{posts.length}</h2>
              <p className="mt-2 text-[13px] font-medium text-white/80">{activeTab.description}，随手记录今天的闪光时刻。</p>
            </div>
            <span className="grid h-16 w-16 shrink-0 place-items-center rounded-[26px] bg-white/18 text-white backdrop-blur">
              <Icon name="feed" className="h-8 w-8" />
            </span>
          </section>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="kc-qq-channel-stat">
              <Icon name="users" className="h-5 w-5 text-[#168bff]" />
              <span>可见动态</span>
              <strong>{myStats.post_count}</strong>
            </div>
            <div className="kc-qq-channel-stat">
              <Icon name="like" className="h-5 w-5 text-[#ff4f86]" />
              <span>互动点赞</span>
              <strong>{totalLikes}</strong>
            </div>
            <div className="kc-qq-channel-stat">
              <Icon name="message" className="h-5 w-5 text-[#34c759]" />
              <span>评论</span>
              <strong>{totalComments}</strong>
            </div>
          </div>

          <div className="kc-qq-post-tabs">
            {feedTabs.map((tab) => (
              <button key={tab.scope} type="button" onClick={() => { setCreatorsOpen(false); setScope(tab.scope); setFeedSort('latest'); }} className={`kc-qq-post-tab ${scope === tab.scope ? 'kc-qq-post-tab-active' : ''}`}>
                {tab.label}
              </button>
            ))}
            <button type="button" onClick={openCreatorsPage} className="kc-qq-post-tab kc-creators-tab"><Icon name="sparkles" className="h-4 w-4" />大佬入住</button>
          </div>

          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {feedSortTabs.map((tab) => <button key={tab.value} type="button" onClick={() => { setFeedSort(tab.value); setSelectedTopic(null); }} className={`kc-pc-chip shrink-0 rounded-full px-3 py-2 text-[12px] font-bold ${feedSort === tab.value && selectedTopic === null ? 'kc-pc-chip-active bg-[#168bff] text-white' : 'bg-white text-[#8b95a5]'}`}>{tab.label}</button>)}
            {selectedTopic ? <button type="button" onClick={() => selectTopic(null)} className="kc-pc-chip kc-pc-chip-active shrink-0 rounded-full bg-[#eaf4ff] px-3 py-2 text-[12px] font-bold text-[#168bff]">#{selectedTopic} ×</button> : null}
          </div>

          <button type="button" onClick={() => openComposer()} className="kc-qq-card kc-qq-post-composer mt-3 flex w-full items-center gap-3 p-3 text-left">
            <Avatar user={currentUser} size="md" />
            <div className="min-w-0 flex-1 rounded-full bg-[#f4f6fa] px-4 py-3 text-[14px] font-semibold text-[#8b95a5]">分享今天的新鲜事...</div>
            <span className="grid h-10 w-10 place-items-center rounded-full bg-[#168bff] text-white shadow-[0_8px_18px_rgba(22,139,255,0.22)]">
              <Icon name="image" className="h-5 w-5" />
            </span>
          </button>

          <section key={`${scope}-${feedSort}-${selectedTopic ?? 'all'}`} className="kc-pc-tab-content kc-pc-stagger mt-3 grid gap-3">
            {feedQuery.isLoading ? <p className="kc-qq-post-empty">正在加载动态...</p> : null}
            {!feedQuery.isLoading && posts.length === 0 ? <p className="kc-qq-post-empty">这里还没有动态，发一条点亮空间吧</p> : null}
            {openPostError ? <p className="rounded-2xl bg-amber-50 px-4 py-3 text-center text-[13px] font-bold text-amber-600">{openPostError}</p> : null}
            {posts.map((post) => <PostCard key={post.id} post={post} currentUser={currentUser} friendUsers={friendUsers} topicOptions={topicOptions} isMobile={isMobile} mobileListMode highlighted={focusedPostId === post.id} onPostRef={setPostRef} onOpenUserSpace={openUserSpace} onOpenPost={(postId) => void openPost(postId)} onEditPost={openComposer} onSelectTopic={selectTopic} />)}
            {feedQuery.hasNextPage ? <button type="button" onClick={() => void feedQuery.fetchNextPage()} className="mx-auto rounded-full bg-white px-5 py-2 text-[13px] font-bold text-[#8b95a5] shadow-sm">加载更多</button> : null}
          </section>
        </div>
        {composerOpen ? <ComposerModal currentUser={currentUser} isMobile={isMobile} editingPost={editingPost} transitionStyle={composerTransitionStyle} onClose={closeComposer} /> : null}
        {notificationsOpen ? <NotificationsModal isMobile={isMobile} transitionStyle={notificationsTransitionStyle} onClose={closeNotificationsPage} onOpenUserSpace={openUserSpace} onOpenPost={(postId) => { if (isMobile) { openPostFromNotifications(postId); return; } void openPost(postId); }} /> : null}
        {mobilePostDetailLoadingPage}
        {mobilePostDetailPage}
      </section>
    );
  }

  if (isMobile) {
    return (
      <section className="kc-qq-page h-full min-h-0 overflow-hidden [color:var(--kc-text,#111827)]">
        <MobileStatusBar />
        <div className="kc-qq-scroll kc-mobile-page-transition scroll-soft h-[calc(100%-30px)] overflow-y-auto px-4 pb-5">
          <header className="kc-qq-home-header kc-qq-sticky-home-header">
            <div>
              <h1 className="text-[25px] font-bold leading-tight [color:var(--kc-text,#111827)]">空间</h1>
              <p className="mt-1 text-[13px] font-medium [color:var(--kc-muted,#8b95a5)]">聊天收藏与重要内容</p>
            </div>
            <button type="button" data-mobile-space-settings-button="true" onClick={onOpenMobileMenuSettings} className="grid h-9 w-9 shrink-0 place-items-center rounded-full [background:var(--kc-panel-muted,#f4f6fa)] [color:var(--kc-muted,#8b95a5)] active:scale-[0.96] active:[background:var(--kc-hover,#eef2f7)]" aria-label="空间菜单设置">
              <Icon name="settings" className="h-5 w-5" />
            </button>
          </header>

          <section className="kc-qq-channel-hero kc-qq-posts-hero">
            <div className="min-w-0">
              <p className="text-[13px] font-bold text-[#eaf4ff]">Kuke Space</p>
              <h2 className="mt-2 text-[30px] font-black leading-none text-white">空间</h2>
              <p className="mt-2 text-[13px] font-medium text-white/80">集中管理收藏消息、图片和转发记录。</p>
            </div>
            <span className="grid h-16 w-16 shrink-0 place-items-center rounded-[26px] bg-white/18 text-white backdrop-blur">
              <Icon name="star" className="h-8 w-8" />
            </span>
          </section>

          <div className="mt-3 grid gap-3">
            {getMobileSpaceFeatureIds(mobileFeatureOrder).map((featureId) => {
              const feature = getMobileFeatureDefinition(featureId);
              return (
                <button key={featureId} type="button" data-mobile-space-feature-id={featureId} onClick={() => featureId === 'bots' ? onOpenMobileBots?.() : onOpenMobileFeature?.(featureId)} className="kc-qq-card flex items-center gap-3 p-4 text-left active:scale-[0.99]">
                  <span className="grid h-14 w-14 shrink-0 place-items-center rounded-[24px] [background:var(--kc-accent-soft)] [color:var(--kc-accent)]"><Icon name={feature.icon} className="h-7 w-7" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[17px] font-black [color:var(--kc-text)]">{feature.label}</span>
                    <span className="mt-1 block text-[13px] font-semibold leading-5 [color:var(--kc-muted)]">{feature.detail}</span>
                  </span>
                  <Icon name="chevron" className="h-5 w-5 shrink-0 [color:var(--kc-muted)]" />
                </button>
              );
            })}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={`kc-pc-page-shell relative h-full min-h-0 overflow-hidden [background:var(--kc-chat)] [color:var(--kc-text)] ${isMobile ? 'flex flex-col' : 'grid grid-cols-[minmax(0,1fr)_292px]'}`}>
      <main className="kc-pc-page-main flex min-h-0 flex-col overflow-hidden">
        <header className="kc-pc-page-hero shrink-0 border-b px-8 py-4 [border-color:var(--kc-border)]">
          <div className="mx-auto max-w-[860px]">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="text-[22px] font-bold leading-7 [color:var(--kc-text)]">动态空间</h1>
                  <span className="rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.14em] [background:var(--kc-accent-soft)] [color:var(--kc-accent)]">Kuke Zone</span>
                </div>
                <p className="mt-1 text-sm [color:var(--kc-muted)]">{activeTab.description}</p>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setNotificationsOpen(true)} className="relative inline-flex items-center gap-2 rounded-[14px] border px-4 py-2 text-sm font-semibold [background:var(--kc-panel)] [border-color:var(--kc-border)] [color:var(--kc-text)]">
                  <Icon name="bell" className="h-4 w-4" /> 互动
                  {(notificationsQuery.data?.unread_count ?? 0) > 0 ? <span className="rounded-full bg-[#ff4f86] px-1.5 py-0.5 text-[10px] font-black text-white">{notificationsQuery.data?.unread_count}</span> : null}
                </button>
                <button type="button" onClick={() => openComposer()} className="inline-flex items-center gap-2 rounded-[14px] px-4 py-2 text-sm font-semibold text-white shadow-sm [background:var(--kc-accent)] hover:opacity-90">
                <Icon name="plus" className="h-4 w-4" /> 发布动态
              </button>
              </div>
            </div>
            <div className="mt-3 inline-flex rounded-[16px] border p-1 [background:var(--kc-panel)] [border-color:var(--kc-border)]">
              {feedTabs.map((tab) => (
                <button key={tab.scope} type="button" onClick={() => { setCreatorsOpen(false); setScope(tab.scope); setFeedSort('latest'); }} className={`kc-pc-segment-tab rounded-xl px-3.5 py-1.5 text-sm font-semibold transition ${scope === tab.scope ? 'kc-pc-segment-tab-active [background:var(--kc-accent)] text-white shadow-sm' : '[color:var(--kc-muted)] hover:[background:var(--kc-hover)] hover:[color:var(--kc-text)]'}`}>
                  {tab.label}
                </button>
              ))}
              <button type="button" onClick={openCreatorsPage} className="kc-pc-segment-tab kc-creators-tab inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-sm font-semibold [color:var(--kc-accent)] hover:[background:var(--kc-accent-soft)]"><Icon name="sparkles" className="h-4 w-4" />大佬入住</button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {feedSortTabs.map((tab) => <button key={tab.value} type="button" onClick={() => { setFeedSort(tab.value); setSelectedTopic(null); }} className={`kc-pc-chip rounded-full px-3 py-1.5 text-xs font-semibold ${feedSort === tab.value && selectedTopic === null ? 'kc-pc-chip-active [background:var(--kc-accent)] text-white' : '[background:var(--kc-panel)] [color:var(--kc-muted)] hover:[color:var(--kc-accent)]'}`}>{tab.label}</button>)}
              {selectedTopic ? <button type="button" onClick={() => selectTopic(null)} className="kc-pc-chip kc-pc-chip-active rounded-full px-3 py-1.5 text-xs font-semibold [background:var(--kc-accent-soft)] [color:var(--kc-accent)]">#{selectedTopic} ×</button> : null}
            </div>
          </div>
        </header>
        <div className="scroll-soft min-h-0 flex-1 overflow-y-auto px-8 py-4">
          <div key={`${scope}-${feedSort}-${selectedTopic ?? 'all'}`} className="kc-pc-tab-content kc-pc-stagger mx-auto grid max-w-[860px] gap-3">
            <button type="button" onClick={() => openComposer()} className="kc-pc-card-motion flex w-full items-center gap-3 rounded-[22px] border px-4 py-3 text-left shadow-[0_8px_24px_rgba(15,23,42,0.04)] transition hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(15,23,42,0.07)] [background:var(--kc-panel)] [border-color:var(--kc-border)]">
              <Avatar user={currentUser} size="md" />
              <span className="min-w-0 flex-1 rounded-[14px] px-4 py-2.5 text-sm [background:var(--kc-panel-muted)] [color:var(--kc-muted)]">分享你的新鲜事...</span>
              <span className="inline-flex items-center gap-2 rounded-[14px] px-3 py-2 text-sm font-semibold text-white [background:var(--kc-accent)]"><Icon name="image" className="h-4 w-4" /> 发布</span>
            </button>
            {feedQuery.isLoading ? <p className="rounded-[20px] border p-6 text-center text-sm [background:var(--kc-panel)] [border-color:var(--kc-border)] [color:var(--kc-muted)]">正在加载动态...</p> : null}
            {!feedQuery.isLoading && posts.length === 0 ? <p className="rounded-[20px] border p-8 text-center text-sm [background:var(--kc-panel)] [border-color:var(--kc-border)] [color:var(--kc-muted)]">这里还没有动态，发一条点亮空间吧</p> : null}
            {openPostError ? <p className="rounded-[20px] border px-4 py-3 text-center text-sm font-semibold [background:rgba(245,158,11,0.12)] [border-color:rgba(245,158,11,0.18)] [color:#d97706]">{openPostError}</p> : null}
            {posts.map((post) => <PostCard key={post.id} post={post} currentUser={currentUser} friendUsers={friendUsers} topicOptions={topicOptions} isMobile={isMobile} highlighted={focusedPostId === post.id} onPostRef={setPostRef} onOpenUserSpace={openUserSpace} onOpenPost={(postId) => void openPost(postId)} onEditPost={openComposer} onSelectTopic={selectTopic} />)}
            {feedQuery.hasNextPage ? <button type="button" onClick={() => void feedQuery.fetchNextPage()} className="mx-auto rounded-[14px] border px-5 py-2 text-sm font-semibold [background:var(--kc-panel)] [border-color:var(--kc-border)] [color:var(--kc-muted)] hover:[color:var(--kc-text)]">加载更多</button> : null}
          </div>
        </div>
      </main>
      {!isMobile ? (
        <aside className="kc-pc-page-aside scroll-soft min-h-0 overflow-y-auto border-l p-4 [border-color:var(--kc-border)] [background:var(--kc-chat)]">
          <div className="kc-pc-card-motion rounded-[22px] border p-4 [border-color:var(--kc-border)] [background:linear-gradient(135deg,rgba(96,165,250,.12),rgba(244,114,182,.08)),var(--kc-panel)]">
            <div className="flex items-center gap-3">
              <Avatar user={currentUser} size="lg" />
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-base font-bold [color:var(--kc-text)]">{getDisplayName(currentUser)}</h2>
                <p className="mt-1 line-clamp-2 text-xs leading-5 [color:var(--kc-muted)]">{currentUser.bio || '还没有填写空间签名'}</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-[16px] px-2 py-2 [background:var(--kc-panel)]"><p className="text-base font-bold [color:var(--kc-text)]">{myStats.post_count}</p><p className="text-[11px] [color:var(--kc-muted)]">动态</p></div>
              <div className="rounded-[16px] px-2 py-2 [background:var(--kc-panel)]"><p className="text-base font-bold [color:var(--kc-text)]">{totalLikes}</p><p className="text-[11px] [color:var(--kc-muted)]">获赞</p></div>
              <div className="rounded-[16px] px-2 py-2 [background:var(--kc-panel)]"><p className="text-base font-bold [color:var(--kc-text)]">{totalComments}</p><p className="text-[11px] [color:var(--kc-muted)]">评论</p></div>
            </div>
            <button type="button" onClick={() => openUserSpace(currentUser, currentUser.id)} className="mt-4 w-full rounded-[14px] border px-4 py-2 text-sm font-semibold [background:var(--kc-panel)] [border-color:color-mix(in_srgb,var(--kc-accent)_35%,var(--kc-border))] [color:var(--kc-accent)] hover:[background:var(--kc-accent-soft)]">进入我的空间</button>
          </div>
          <div className="kc-pc-card-motion mt-3 rounded-[20px] border p-4 text-sm [border-color:var(--kc-border)] [background:var(--kc-panel)]">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold [color:var(--kc-text)]">热门话题</p>
              <Icon name="feed" className="h-4 w-4 [color:var(--kc-accent)]" />
            </div>
            <div className="mt-3 grid gap-2">
              {topicOptions.length === 0 ? <p className="text-xs [color:var(--kc-muted)]">还没有热门话题</p> : topicOptions.map((topic, index) => (
                <button key={topic.id} type="button" onClick={() => selectTopic(topic.name)} className={`kc-pc-nav-row flex items-center gap-2 rounded-[14px] px-3 py-2 text-left transition hover:[background:var(--kc-hover)] ${selectedTopic === topic.name ? 'kc-pc-nav-row-active [background:var(--kc-accent-soft)]' : '[background:var(--kc-panel-muted)]'}`}>
                  <span className="grid h-6 w-6 place-items-center rounded-full text-[11px] font-black [background:var(--kc-panel)] [color:var(--kc-accent)]">{index + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold [color:var(--kc-text)]">#{topic.name}</span>
                  <span className="text-xs [color:var(--kc-muted)]">{topic.post_count}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="kc-pc-card-motion mt-3 rounded-[20px] border p-4 text-sm [border-color:var(--kc-border)] [background:var(--kc-panel)]">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold [color:var(--kc-text)]">发布小提示</p>
              <Icon name="feed" className="h-4 w-4 [color:var(--kc-accent)]" />
            </div>
            <div className="mt-3 grid gap-2 text-xs leading-5 [color:var(--kc-muted)]">
              <p>公开动态会展示在广场中。</p>
              <p>好友可见只会出现在好友动态里。</p>
              <p>审核通过后，其他用户才能互动。</p>
            </div>
          </div>
        </aside>
      ) : null}
      {composerOpen ? <ComposerModal currentUser={currentUser} isMobile={isMobile} editingPost={editingPost} transitionStyle={composerTransitionStyle} onClose={closeComposer} /> : null}
      {notificationsOpen ? <NotificationsModal isMobile={isMobile} transitionStyle={notificationsTransitionStyle} onClose={isMobile ? closeNotificationsPage : () => setNotificationsOpen(false)} onOpenUserSpace={openUserSpace} onOpenPost={(postId) => { if (isMobile) { openPostFromNotifications(postId); return; } void openPost(postId); }} /> : null}
    </section>
  );
}
