import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ccwStudentProfileUrl } from '@/config';
import { createDirectConversation, updateConversationMemberMute, updateConversationMemberRole } from '@/api/conversations';
import { ApiError } from '@/api/client';
import { getFriends, getOutgoingFriendRequests, sendFriendRequest } from '@/api/friends';
import { getPost, getTrendingPostTopics, getUserPostStats, getUserPosts, togglePostLike, uploadPostImage } from '@/api/posts';
import { getUserOnlineStatus, getUserProfile, updateMyProfile, uploadProfileCover } from '@/api/users';
import { useKukeStore } from '@/store/kukeStore';
import type { IconName } from '@/components/ui/Icon';
import type { ConversationMember, MemberRole, Post, PostFeedSort, PostStats, PostVisibility, User } from '@/types/api';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { ImageViewer, type ImageViewerState } from '@/components/ui/ImageViewer';
import { MobilePostDetailPage } from '@/components/posts/MobilePostDetailPage';
import { MobileProfileSummaryCard } from '@/components/profile/MobileProfileSummaryCard';
import { registerNativeBackHandler } from '@/native/back';
import { runNativeRouteTransition } from '@/native/transition';
import { resolveAssetUrl, resolveThumbnailUrl } from '@/utils/assetUrl';
import { parseApiDate } from '@/utils/dateTime';
import { hasPendingOutgoingFriendRequest, isFriendUserId } from '@/utils/friendship';
import { userPresenceLabel } from '@/utils/presence';
import { openExternalUrl } from '@/utils/openExternalUrl';

type ProfileActionTone = 'primary' | 'muted' | 'danger' | 'menu';

type ProfileDraft = {
  bio: string;
  profile_title: string;
  profile_tagline: string;
  profile_status: string;
  profile_location: string;
  profile_interests: string;
  profile_layout: 'classic' | 'banner' | 'compact' | '';
  profile_card_style: 'soft' | 'glass' | 'solid' | '';
  profile_accent_color: string;
  profile_cover_url: string;
};

export interface ProfileAction {
  label: string;
  onClick?: (user: User) => void;
  disabled?: boolean;
  tone?: ProfileActionTone;
  helperText?: string;
  icon?: IconName;
  actions?: ProfileAction[];
}

interface MobileUserProfilePageProps {
  user?: User | null;
  label?: string;
  fallbackUserId?: number;
  currentUserId: number;
  currentUser?: User;
  action?: ProfileAction;
  menuAction?: ProfileAction;
  menuOpen?: boolean;
  onMenuOpenChange?: (open: boolean) => void;
  groupContext?: {
    conversationId: number;
    member: ConversationMember;
    currentRole: MemberRole;
    onMemberUpdated?: (member: ConversationMember) => void;
  };
  onOpenUserProfile?: (user: User | null | undefined, fallbackId: number) => void;
  onOpenPost?: (postId: number) => void;
  onEditPost?: (post: Post) => void;
  transitionStyle?: CSSProperties;
  onClose: () => void;
}

const PAGE_SIZE = 20;
const emptyPostStats: PostStats = { post_count: 0, like_count: 0, comment_count: 0 };
const profileAccentPresets = ['#168bff', '#7c3aed', '#ff4f86', '#f97316', '#10b981', '#111827'] as const;
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
const muteDurationOptions = [
  { label: '10分钟', minutes: 10 },
  { label: '1小时', minutes: 60 },
  { label: '12小时', minutes: 720 },
  { label: '1天', minutes: 1440 }
] as const;

function memberUserId(member: ConversationMember | null | undefined): number | null {
  return member?.user_id ?? member?.user?.id ?? null;
}

function activeMemberMuted(member: ConversationMember | null | undefined): boolean {
  if (!member?.muted) {
    return false;
  }
  const until = parseApiDate(member.muted_until);
  return !member.muted_until || !until || until.getTime() > Date.now();
}

function muteUntilFromMinutes(minutes: number): string {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

function formatTime(value: string): string {
  const date = parseApiDate(value);
  if (!date) {
    return value;
  }
  const diffSeconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (!Number.isFinite(diffSeconds) || diffSeconds < 60) {
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

type CoverNavTone = 'light' | 'dark';
type CoverNavTones = { back: CoverNavTone; menu: CoverNavTone; title: CoverNavTone };

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function hexToRgb(hex: string): [number, number, number] {
  const match = /^#?([0-9a-fA-F]{6})$/.exec(hex);
  if (!match) {
    return [22, 139, 255];
  }
  const value = Number.parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function mixRgb(a: [number, number, number], b: [number, number, number], amount: number): [number, number, number] {
  const t = clamp01(amount);
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t
  ];
}

function relativeLuminance(r: number, g: number, b: number): number {
  const linear = [r, g, b].map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function toneForLuminance(luminance: number): CoverNavTone {
  return luminance > 0.48 ? 'dark' : 'light';
}

function estimateFallbackCoverLuminance(xRatio: number, yRatio: number, accent: string): number {
  const x = clamp01(xRatio);
  const y = clamp01(yRatio);
  const accentRgb = hexToRgb(accent);
  const midRgb: [number, number, number] = [124, 140, 255];
  const endRgb: [number, number, number] = [255, 126, 179];
  const base = x < 0.48 ? mixRgb(accentRgb, midRgb, x / 0.48) : mixRgb(midRgb, endRgb, (x - 0.48) / 0.52);
  const radialLeft = Math.max(0, 1 - Math.hypot((x - 0.15) / 0.3, (y - 0.2) / 0.3));
  const radialRight = Math.max(0, 1 - Math.hypot((x - 0.82) / 0.24, (y - 0.12) / 0.24));
  const lifted = mixRgb(base, [255, 255, 255], radialLeft * 0.34 + radialRight * 0.22);
  return relativeLuminance(lifted[0], lifted[1], lifted[2]);
}

function fallbackCoverNavTones(accent: string): CoverNavTones {
  return {
    back: toneForLuminance(estimateFallbackCoverLuminance(0.09, 0.22, accent)),
    menu: toneForLuminance(estimateFallbackCoverLuminance(0.91, 0.22, accent)),
    title: toneForLuminance(estimateFallbackCoverLuminance(0.5, 0.22, accent))
  };
}

function interestList(value: string | null | undefined): string[] {
  return (value ?? '').split(/[，,\s]+/).map((item) => item.trim()).filter(Boolean).slice(0, 8);
}

function parseInterestTags(value: string): string[] {
  const tags: string[] = [];
  const seen = new Set<string>();
  for (const rawTag of value.split(/[，,\n]+/)) {
    const tag = rawTag.trim();
    const key = tag.toLocaleLowerCase();
    if (!tag || seen.has(key)) {
      continue;
    }
    tags.push(tag);
    seen.add(key);
  }
  return tags;
}

function serializeInterestTags(tags: string[]): string {
  return tags.map((tag) => tag.trim()).filter(Boolean).join(', ');
}

function InterestTagManager({ value, onChange }: { value: string; onChange: (value: string) => void }): JSX.Element {
  const [draft, setDraft] = useState('');
  const tags = parseInterestTags(value);

  function addDraftTags(): void {
    const nextTags = parseInterestTags(serializeInterestTags([...tags, ...parseInterestTags(draft)]));
    onChange(serializeInterestTags(nextTags));
    setDraft('');
  }

  function removeTag(index: number): void {
    onChange(serializeInterestTags(tags.filter((_, currentIndex) => currentIndex !== index)));
  }

  return (
    <section className="grid gap-2">
      <div>
        <span className="text-[13px] font-bold text-[#526070]">兴趣标签</span>
        <p className="mt-1 text-[12px] font-medium text-[#8b95a5]">添加或删除标签，可一次输入多个。</p>
      </div>
      <div className="flex flex-wrap gap-2 rounded-[20px] bg-white p-3">
        {tags.length > 0 ? tags.map((tag, index) => <button key={`${tag}-${index}`} type="button" onClick={() => removeTag(index)} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-black text-white active:scale-[0.98] [background:var(--kc-accent)]"><span>{tag}</span><Icon name="close" className="h-3.5 w-3.5" /></button>) : <span className="text-[12px] font-bold text-[#8b95a5]">还没有兴趣标签</span>}
      </div>
      <div className="flex gap-2">
        <input value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addDraftTags(); } }} className="kc-qq-input min-w-0 flex-1" placeholder="例如：聊天、编程、音乐" />
        <button type="button" onClick={addDraftTags} disabled={!draft.trim()} className="shrink-0 rounded-[18px] px-4 text-[13px] font-black text-white disabled:opacity-50 [background:var(--kc-accent)]">添加</button>
      </div>
    </section>
  );
}

function userHandle(user: User | null | undefined, fallbackId: number): string {
  if (user?.username) {
    return `@${user.username}`;
  }
  return `用户 ${fallbackId}`;
}

function requestErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  return error instanceof Error ? error.message : fallback;
}

function invalidateUserPosts(queryClient: ReturnType<typeof useQueryClient>, userId: number): void {
  void queryClient.invalidateQueries({ queryKey: ['posts'] });
  void queryClient.invalidateQueries({ queryKey: ['posts', 'user', userId] });
}

function legacyMentionToPlain(content: string): string {
  return content.replace(/@\[([^\]]+)]\(\d+\)/g, '@$1');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function renderProfileRichText(content: string, mentionUsers: User[], onOpenProfile: (user: User | null | undefined, fallbackId: number) => void): ReactNode[] {
  const users = mentionUsers.slice().sort((a, b) => getDisplayName(b).length - getDisplayName(a).length);
  const mentionNames = users.map((item) => escapeRegExp(getDisplayName(item).trim())).filter(Boolean).join('|');
  const patterns = ['@\\[([^\\]]+)]\\((\\d+)\\)', mentionNames ? `(^|\\s)@(${mentionNames})(?=\\s|$|[，。！？,.!?])` : ''].filter(Boolean);
  if (patterns.length === 0) {
    return [content];
  }
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
      nodes.push(<button key={`mention-${index}-${userId}`} type="button" onClick={() => onOpenProfile(null, userId)} className="inline-flex rounded-md px-1 font-bold [background:var(--kc-accent-soft)] [color:var(--kc-accent)]">@{match[1]}</button>);
    } else if (match[4]) {
      const prefix = match[3] ?? '';
      const name = match[4];
      const matchedUser = users.find((item) => getDisplayName(item) === name);
      if (prefix) {
        nodes.push(prefix);
      }
      nodes.push(<button key={`plain-mention-${index}-${matchedUser?.id ?? name}`} type="button" onClick={() => matchedUser ? onOpenProfile(matchedUser, matchedUser.id) : undefined} className="inline-flex rounded-md px-1 font-bold [background:var(--kc-accent-soft)] [color:var(--kc-accent)]">@{name}</button>);
    }
    lastIndex = index + match[0].length;
  }
  if (lastIndex < content.length) {
    nodes.push(content.slice(lastIndex));
  }
  return nodes.length ? nodes : [content];
}

function extractMentionUserIds(content: string, users: User[]): number[] {
  const plain = legacyMentionToPlain(content);
  const ids: number[] = [];
  const seen = new Set<number>();
  for (const user of users) {
    const name = getDisplayName(user).trim();
    if (!name || seen.has(user.id)) {
      continue;
    }
    const pattern = new RegExp(`(^|\\s)@${escapeRegExp(name)}(?=\\s|$|[，。！？,.!?])`);
    if (pattern.test(plain)) {
      ids.push(user.id);
      seen.add(user.id);
    }
    if (ids.length >= 20) {
      break;
    }
  }
  return ids;
}

function ProfileImageGrid({ images, onOpenImage }: { images: string[]; onOpenImage: (images: string[], index: number) => void }): JSX.Element | null {
  const validImages = images.filter((imageUrl) => resolveAssetUrl(imageUrl) && resolveThumbnailUrl(imageUrl));
  if (validImages.length === 0) {
    return null;
  }
  const gridClass = validImages.length === 1 ? 'grid-cols-1' : validImages.length === 2 ? 'grid-cols-2' : 'grid-cols-3';
  return (
    <div className={`mt-3 grid min-w-0 gap-2 ${gridClass}`}>
      {validImages.map((imageUrl, index) => {
        const resolved = resolveThumbnailUrl(imageUrl);
        return resolved ? (
          <button type="button" key={`${imageUrl}-${index}`} onClick={() => onOpenImage(validImages, index)} className={`overflow-hidden rounded-[16px] bg-[#f4f6fa] ${validImages.length === 1 ? 'aspect-[4/3]' : 'aspect-square'}`}>
            <img src={resolved} alt={`动态图片 ${index + 1}`} className="h-full w-full object-cover" />
          </button>
        ) : null;
      })}
    </div>
  );
}

function MobileProfilePostCard({ post, currentUser, friendUsers, isSelf, profileUserId, onOpenProfile, onOpenPost, onEditPost }: { post: Post; currentUser: User; friendUsers: User[]; isSelf: boolean; profileUserId: number; onOpenProfile: (user: User | null | undefined, fallbackId: number) => void; onOpenPost?: (postId: number) => void; onEditPost?: (post: Post) => void }): JSX.Element {
  const queryClient = useQueryClient();
  const [imageViewer, setImageViewer] = useState<ImageViewerState | null>(null);
  const likeMutation = useMutation({
    mutationFn: () => togglePostLike(post.id),
    onSuccess: () => invalidateUserPosts(queryClient, post.author_id)
  });
  const interactionDisabled = post.moderation_status !== 'approved';
  const authorName = getDisplayName(post.author, `用户 ${post.author_id}`);
  return (
    <article role="button" tabIndex={0} onClick={() => onOpenPost?.(post.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpenPost?.(post.id); } }} className="kc-qq-card cursor-pointer overflow-hidden p-0">
      <div className="flex items-start gap-3 p-4">
        <button type="button" onClick={(event) => { event.stopPropagation(); if (post.author_id !== profileUserId) onOpenProfile(post.author, post.author_id); }} className="shrink-0 rounded-full">
          <Avatar user={post.author} size="md" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <button type="button" onClick={(event) => { event.stopPropagation(); if (post.author_id !== profileUserId) onOpenProfile(post.author, post.author_id); }} className="block max-w-full truncate text-left text-[16px] font-black text-[#151922]">{authorName}</button>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] font-semibold text-[#8b95a5]">
                <span>{formatTime(post.created_at)}</span>
                <span className="h-1 w-1 rounded-full bg-current opacity-40" />
                <span>{visibilityLabel(post.visibility)}</span>
                {post.pinned_at ? <span className="rounded-full bg-[#eaf4ff] px-2 py-0.5 text-[#168bff]">置顶</span> : null}
              </div>
            </div>
            {isSelf && onEditPost ? <button type="button" onClick={(event) => { event.stopPropagation(); onEditPost(post); }} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#f4f6fa] text-[#8b95a5]" aria-label="编辑动态"><Icon name="edit" className="h-4 w-4" /></button> : null}
          </div>
          {post.moderation_status !== 'approved' ? <p className="mt-3 rounded-2xl bg-amber-50 px-3 py-2 text-[12px] font-bold text-amber-600">{post.moderation_status === 'pending' ? '审核中，仅自己可见' : '审核未通过'}</p> : null}
          {post.content ? <p className="mt-3 select-text whitespace-pre-wrap break-words text-[15px] leading-7 text-[#151922]">{renderProfileRichText(post.content, friendUsers, onOpenProfile)}</p> : null}
          <ProfileImageGrid images={post.image_urls ?? []} onOpenImage={(images, index) => setImageViewer({ images, index })} />
          {post.repost_of ? (
            <button type="button" onClick={(event) => { event.stopPropagation(); onOpenPost?.(post.repost_of?.id ?? post.id); }} className="mt-3 block w-full rounded-[20px] bg-[#f4f6fa] p-3 text-left">
              <div className="flex items-center gap-2 text-[13px] font-bold text-[#526070]"><Avatar user={post.repost_of.author} size="sm" /><span className="truncate">{getDisplayName(post.repost_of.author, `用户 ${post.repost_of.author_id}`)}</span></div>
              <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-[13px] leading-6 text-[#526070]">{post.repost_of.content || '分享了一条图片动态'}</p>
            </button>
          ) : null}
          <div className="mt-4 flex items-center gap-1 border-t border-[#eef1f6] pt-3 text-[#8b95a5]">
            <button type="button" onClick={(event) => { event.stopPropagation(); likeMutation.mutate(); }} disabled={likeMutation.isPending || interactionDisabled} className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-sm font-bold ${post.liked_by_me ? 'text-rose-500' : ''} disabled:opacity-50`}><Icon name="like" className="h-5 w-5" />赞 {post.like_count || 0}</button>
            <button type="button" onClick={(event) => { event.stopPropagation(); onOpenPost?.(post.id); }} className="inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-sm font-bold"><Icon name="message" className="h-5 w-5" />评论 {post.comment_count || 0}</button>
            {onOpenPost ? <button type="button" onClick={(event) => { event.stopPropagation(); onOpenPost(post.id); }} className="ml-auto inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-sm font-bold"><Icon name="chevron" className="h-4 w-4" />详情</button> : null}
          </div>
        </div>
      </div>
      {imageViewer ? <ImageViewer viewer={imageViewer} mobile onClose={() => setImageViewer(null)} onNavigate={(index) => setImageViewer((current) => current ? { ...current, index } : current)} /> : null}
    </article>
  );
}

export function MobileUserProfilePage({ user, label, fallbackUserId, currentUserId, currentUser, action, groupContext, onOpenUserProfile, onOpenPost, onEditPost, transitionStyle, onClose }: MobileUserProfilePageProps): JSX.Element | null {
  const queryClient = useQueryClient();
  const userId = user?.id;
  const fallbackId = userId ?? fallbackUserId ?? currentUserId;
  const isSelf = fallbackId === currentUserId;
  const effectiveCurrentUser = currentUser ?? (isSelf && user ? user : undefined);
  const setCurrentUser = useKukeStore((state) => state.setCurrentUser);
  const setActiveConversationId = useKukeStore((state) => state.setActiveConversationId);
  const setWorkspaceView = useKukeStore((state) => state.setWorkspaceView);
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const [coverNavTones, setCoverNavTones] = useState<CoverNavTones>(() => fallbackCoverNavTones('#168bff'));
  const [nestedProfile, setNestedProfile] = useState<{ user: User | null | undefined; fallbackId: number } | null>(null);
  const [managementOpen, setManagementOpen] = useState(false);
  const [muteExpanded, setMuteExpanded] = useState(false);
  const [managedMember, setManagedMember] = useState<ConversationMember | null>(groupContext?.member ?? null);
  const [managementMessage, setManagementMessage] = useState('');
  const [postSort, setPostSort] = useState<PostFeedSort>('latest');
  const [localDetailPost, setLocalDetailPost] = useState<Post | null>(null);
  const [localDetailPostId, setLocalDetailPostId] = useState<number | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileScrollTop, setProfileScrollTop] = useState(0);
  const [profileDraft, setProfileDraft] = useState<ProfileDraft>({
    bio: user?.bio ?? '',
    profile_title: user?.profile_title ?? '',
    profile_tagline: user?.profile_tagline ?? '',
    profile_status: user?.profile_status ?? '',
    profile_location: user?.profile_location ?? '',
    profile_interests: user?.profile_interests ?? '',
    profile_layout: user?.profile_layout ?? 'classic',
    profile_card_style: user?.profile_card_style ?? 'soft',
    profile_accent_color: user?.profile_accent_color ?? '#168bff',
    profile_cover_url: user?.profile_cover_pending_url ?? user?.profile_cover_url ?? ''
  });

  const profileQuery = useQuery({
    queryKey: ['users', fallbackId],
    queryFn: () => getUserProfile(fallbackId),
    initialData: user ?? (isSelf ? currentUser : undefined),
    enabled: Boolean(fallbackId),
    staleTime: 30_000,
    refetchInterval: (query) => query.state.data?.profile_cover_moderation_status === 'pending' ? 3_000 : false
  });
  const onlineQuery = useQuery({
    queryKey: ['user-online', fallbackId],
    queryFn: () => getUserOnlineStatus(fallbackId),
    enabled: Boolean(fallbackId),
    staleTime: 15_000,
    retry: false
  });
  const statsQuery = useQuery({ queryKey: ['posts', 'user', fallbackId, 'stats'], queryFn: () => getUserPostStats(fallbackId), enabled: Boolean(userId) });
  const postsQuery = useInfiniteQuery({
    queryKey: ['posts', 'user', fallbackId, postSort],
    queryFn: ({ pageParam }) => getUserPosts(fallbackId, { sort: postSort, beforeId: pageParam, limit: PAGE_SIZE }),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) => lastPage.length < PAGE_SIZE ? undefined : lastPage[lastPage.length - 1]?.id,
    enabled: Boolean(userId && !user?.is_bot && effectiveCurrentUser)
  });
  const friendsQuery = useQuery({ queryKey: ['friends'], queryFn: getFriends, enabled: Boolean(effectiveCurrentUser && !isSelf) });
  const outgoingFriendRequestsQuery = useQuery({ queryKey: ['friend-requests', 'outgoing'], queryFn: getOutgoingFriendRequests, enabled: Boolean(effectiveCurrentUser && !isSelf) });
  const topicsQuery = useQuery({ queryKey: ['post-topics'], queryFn: () => getTrendingPostTopics(5), enabled: Boolean(effectiveCurrentUser) });

  const displayUser = profileQuery.data ?? user ?? (isSelf ? currentUser : null);
  const friendUsers = useMemo(() => (friendsQuery.data ?? []).map((friendship) => friendship.friend ?? friendship.user).filter((item): item is User => Boolean(item) && item.id !== currentUserId), [currentUserId, friendsQuery.data]);
  const topicOptions = topicsQuery.data ?? [];
  const posts = useMemo(() => postsQuery.data?.pages.flat() ?? [], [postsQuery.data]);

  useEffect(() => {
    return registerNativeBackHandler(() => {
      onClose();
      return true;
    }, 170);
  }, [onClose]);

  useEffect(() => {
    setManagedMember(groupContext?.member ?? null);
  }, [groupContext?.member]);

  useEffect(() => {
    if (!displayUser || editingProfile) {
      return;
    }
    setProfileDraft({
      bio: displayUser.bio ?? '',
      profile_title: displayUser.profile_title ?? '',
      profile_tagline: displayUser.profile_tagline ?? '',
      profile_status: displayUser.profile_status ?? '',
      profile_location: displayUser.profile_location ?? '',
      profile_interests: displayUser.profile_interests ?? '',
      profile_layout: displayUser.profile_layout ?? 'classic',
      profile_card_style: displayUser.profile_card_style ?? 'soft',
      profile_accent_color: displayUser.profile_accent_color ?? '#168bff',
      profile_cover_url: displayUser.profile_cover_pending_url ?? displayUser.profile_cover_url ?? ''
    });
  }, [displayUser, editingProfile]);

  const name = getDisplayName(displayUser, label || '用户');
  const isBot = Boolean(displayUser?.is_bot || user?.is_bot);
  const isBotOnline = Boolean(onlineQuery.data?.online);
  const statusLabel = isBot ? (isBotOnline ? '机器人在线' : '机器人离线') : userPresenceLabel(displayUser, onlineQuery.data);
  const accent = editingProfile && /^#[0-9a-fA-F]{6}$/.test(profileDraft.profile_accent_color) ? profileDraft.profile_accent_color : profileAccent(displayUser);
  const coverValue = editingProfile ? (profileDraft.profile_cover_url || null) : profileCover(displayUser, isSelf);
  const coverUrl = coverValue ? resolveAssetUrl(coverValue) : null;
  const fallbackCoverTones = useMemo(() => fallbackCoverNavTones(accent), [accent]);
  const coverImageBackground = coverUrl ? `url(${coverUrl}) center top/cover no-repeat` : `radial-gradient(circle at 15% 20%,rgba(255,255,255,.34),transparent 30%),radial-gradient(circle at 82% 12%,rgba(255,255,255,.22),transparent 24%),linear-gradient(135deg,${accent} 0%,#7c8cff 48%,#ff7eb3 100%)`;
  const coverBackground = coverUrl ? `url(${coverUrl}) center/cover no-repeat` : coverImageBackground;

  useEffect(() => {
    if (!coverUrl || typeof window === 'undefined') {
      setCoverNavTones(fallbackCoverTones);
      return;
    }

    let cancelled = false;
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    image.onload = () => {
      if (cancelled) {
        return;
      }
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 3;
        canvas.height = 1;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          setCoverNavTones(fallbackCoverTones);
          return;
        }
        const sampleY = Math.round(image.naturalHeight * 0.22);
        const xs = [0.09, 0.5, 0.91].map((ratio) => Math.round(image.naturalWidth * ratio));
        xs.forEach((x, index) => ctx.drawImage(image, x, sampleY, 1, 1, index, 0, 1, 1));
        const pixels = ctx.getImageData(0, 0, 3, 1).data;
        const luminanceAt = (index: number) => relativeLuminance(pixels[index * 4], pixels[index * 4 + 1], pixels[index * 4 + 2]);
        setCoverNavTones({
          back: toneForLuminance(luminanceAt(0)),
          title: toneForLuminance(luminanceAt(1)),
          menu: toneForLuminance(luminanceAt(2))
        });
      } catch {
        setCoverNavTones(fallbackCoverTones);
      }
    };
    image.onerror = () => {
      if (!cancelled) {
        setCoverNavTones(fallbackCoverTones);
      }
    };
    image.src = coverUrl;
    return () => {
      cancelled = true;
    };
  }, [coverUrl, fallbackCoverTones]);

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
  const imageUploadMutation = useMutation({ mutationFn: uploadPostImage });
  const memberRoleMutation = useMutation({
    mutationFn: ({ conversationId, memberId, role }: { conversationId: number; memberId: number; role: MemberRole }) => updateConversationMemberRole(conversationId, memberId, role),
    onSuccess: (member, variables) => {
      setManagedMember(member);
      groupContext?.onMemberUpdated?.(member);
      setManagementMessage(variables.role === 'admin' ? '已设为管理员。' : '已取消管理员。');
      void queryClient.invalidateQueries({ queryKey: ['conversation-members', variables.conversationId] });
      void queryClient.invalidateQueries({ queryKey: ['conversation-members-page', variables.conversationId] });
    },
    onError: () => setManagementMessage('成员角色更新失败，请稍后重试。')
  });
  const memberMuteMutation = useMutation({
    mutationFn: ({ conversationId, memberId, muted, mutedUntil }: { conversationId: number; memberId: number; muted: boolean; mutedUntil?: string | null }) => updateConversationMemberMute(conversationId, memberId, muted, mutedUntil),
    onSuccess: (member, variables) => {
      setManagedMember(member);
      groupContext?.onMemberUpdated?.(member);
      setManagementMessage(Boolean(member.muted) ? '已设置群禁言。' : '已解除群禁言。');
      void queryClient.invalidateQueries({ queryKey: ['conversation-members', variables.conversationId] });
      void queryClient.invalidateQueries({ queryKey: ['conversation-members-page', variables.conversationId] });
    },
    onError: () => setManagementMessage('成员禁言更新失败，请稍后重试。')
  });

  if (!user && !label) {
    return null;
  }

  const ccwProfileUrl = displayUser?.ccw_student_oid ? ccwStudentProfileUrl(displayUser.ccw_student_oid) : null;
  const profileTitle = (editingProfile ? profileDraft.profile_title : displayUser?.profile_title)?.trim() || (isSelf ? '我的空间' : '个人主页');
  const profileTagline = (editingProfile ? profileDraft.profile_tagline : displayUser?.profile_tagline)?.trim();
  const profileStatus = (editingProfile ? profileDraft.profile_status : displayUser?.profile_status)?.trim();
  const profileBio = (editingProfile ? profileDraft.bio : displayUser?.bio)?.trim();
  const profileLocation = (editingProfile ? profileDraft.profile_location : displayUser?.profile_location)?.trim();
  const interests = interestList(editingProfile ? profileDraft.profile_interests : displayUser?.profile_interests);
  const stats = statsQuery.data ?? emptyPostStats;
  const profileCardStyle = editingProfile ? profileDraft.profile_card_style : displayUser?.profile_card_style ?? '';
  const canAct = Boolean(displayUser && !isBot && action && displayUser.id !== currentUserId);
  const actionTone = action?.tone ?? 'primary';
  const internalIsFriend = isFriendUserId(friendsQuery.data ?? [], fallbackId, currentUserId);
  const hasPendingFriendRequest = hasPendingOutgoingFriendRequest(outgoingFriendRequestsQuery.data ?? [], fallbackId);
  const internalFriendButtonDisabled = internalIsFriend ? directMutation.isPending : hasPendingFriendRequest || friendRequestMutation.isPending || friendsQuery.isLoading || outgoingFriendRequestsQuery.isLoading;
  const internalFriendButtonLabel = internalIsFriend ? directMutation.isPending ? '打开中' : '发消息' : hasPendingFriendRequest ? '已申请' : friendRequestMutation.isPending ? '发送中' : '加好友';
  const friendRequestError = friendRequestMutation.error ? requestErrorMessage(friendRequestMutation.error, '好友申请发送失败') : null;
  const directMessageError = directMutation.error ? requestErrorMessage(directMutation.error, '发起私聊失败') : null;
  const saveErrorMessage = saveProfileMutation.error ? requestErrorMessage(saveProfileMutation.error, '保存失败') : null;
  const coverErrorMessage = coverMutation.error ? requestErrorMessage(coverMutation.error, '封面上传失败') : null;
  const actionClassName = actionTone === 'muted'
    ? 'h-12 w-full rounded-[18px] text-[16px] font-black transition disabled:cursor-not-allowed disabled:opacity-80 [background:var(--kc-panel-muted)] [color:var(--kc-muted)]'
    : actionTone === 'danger'
      ? 'h-12 w-full rounded-[18px] text-[16px] font-black text-white transition disabled:cursor-not-allowed disabled:opacity-60 [background:#ef4444] active:scale-[0.99]'
      : 'h-12 w-full rounded-[18px] text-[16px] font-black text-white transition disabled:cursor-not-allowed disabled:opacity-60 [background:var(--kc-accent)] active:scale-[0.99]';
  const managedUserId = memberUserId(managedMember);
  const canManageMute = Boolean(groupContext && managedMember && managedMember.role !== 'owner' && managedUserId && managedUserId !== currentUserId && (groupContext.currentRole === 'owner' || (groupContext.currentRole === 'admin' && managedMember.role === 'member')));
  const canManageRole = Boolean(groupContext && managedMember && groupContext.currentRole === 'owner' && managedMember.role !== 'owner' && managedUserId && managedUserId !== currentUserId);
  const isManagedMuted = activeMemberMuted(managedMember);
  const showManageButton = Boolean((canManageMute || canManageRole) && managedMember);
  const profileNavSurfaceOpacity = clamp01((profileScrollTop - 132) / 72);
  const profileHeaderTitleOpacity = clamp01((profileScrollTop - 84) / 64);
  const profileCoverShift = clamp01((profileScrollTop - 148) / 160) * 104;
  const profileHeaderOnSurface = profileNavSurfaceOpacity > 0.56;
  const profileStatusSurfaceStyle = { opacity: profileNavSurfaceOpacity };
  const profileHeaderStyle = { backgroundColor: 'transparent' };
  const profileHeaderTitleStyle = { opacity: profileHeaderTitleOpacity };
  const profileCoverLayerStyle = { background: coverImageBackground, transform: `translate3d(0, ${profileCoverShift}px, 0)` };
  const profileBackTone = profileHeaderOnSurface ? 'dark' : coverNavTones.back;
  const profileTitleTone = profileHeaderOnSurface ? 'dark' : coverNavTones.title;
  const profileMenuTone = profileHeaderOnSurface ? 'dark' : coverNavTones.menu;
  const profileDarkNavClass = 'text-[rgba(17,24,39,.92)] [text-shadow:0_1px_8px_rgba(255,255,255,.22)] active:bg-slate-900/10';
  const profileLightNavClass = 'text-white/95 [text-shadow:0_1px_8px_rgba(0,0,0,.28)] active:bg-white/15';
  const showProfileStatusTag = Boolean(profileStatus && profileStatus !== statusLabel);

  function updateDraft(key: keyof ProfileDraft, value: string): void {
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

  function handleInternalFriendAction(): void {
    if (isSelf || !effectiveCurrentUser || internalFriendButtonDisabled) {
      return;
    }
    if (internalIsFriend) {
      directMutation.mutate({ user_id: fallbackId, temporary: false });
      return;
    }
    friendRequestMutation.mutate(fallbackId);
  }

  function openProfile(targetUser: User | null | undefined, targetFallbackId: number): void {
    if (onOpenUserProfile) {
      onOpenUserProfile(targetUser, targetFallbackId);
      return;
    }
    setNestedProfile({ user: targetUser ?? null, fallbackId: targetFallbackId });
  }

  async function openLocalPostDetail(postId: number): Promise<void> {
    if (onOpenPost) {
      onOpenPost(postId);
      return;
    }
    const localPost = posts.find((post) => post.id === postId) ?? null;
    runNativeRouteTransition('secondary-forward', () => {
      setLocalDetailPost(localPost);
      setLocalDetailPostId(postId);
    }, true);
    if (localPost) {
      return;
    }
    try {
      setLocalDetailPost(await getPost(postId));
    } catch {
      setLocalDetailPostId(null);
    }
  }

  function closeLocalPostDetail(): void {
    runNativeRouteTransition('secondary-back', () => {
      setLocalDetailPost(null);
      setLocalDetailPostId(null);
    }, true);
  }

  function applyMute(minutes: number): void {
    if (!groupContext || !managedMember || !managedUserId || !canManageMute) {
      return;
    }
    memberMuteMutation.mutate({ conversationId: groupContext.conversationId, memberId: managedUserId, muted: true, mutedUntil: muteUntilFromMinutes(minutes) });
  }

  function clearMute(): void {
    if (!groupContext || !managedMember || !managedUserId || !canManageMute) {
      return;
    }
    memberMuteMutation.mutate({ conversationId: groupContext.conversationId, memberId: managedUserId, muted: false, mutedUntil: null });
  }

  function toggleAdmin(): void {
    if (!groupContext || !managedMember || !managedUserId || !canManageRole) {
      return;
    }
    memberRoleMutation.mutate({ conversationId: groupContext.conversationId, memberId: managedUserId, role: managedMember.role === 'admin' ? 'member' : 'admin' });
  }

  const profileEditor = isSelf && editingProfile ? (
    <section className="kc-qq-card grid gap-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[17px] font-black text-[#111827]">主页自定义</h3>
          <p className="mt-1 text-[12px] font-medium text-[#8b95a5]">封面、资料和强调色会同步到动态个人主页。</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={() => setEditingProfile(false)} className="rounded-full bg-[#f4f6fa] px-3 py-2 text-[12px] font-bold text-[#526070]">取消</button>
          <button type="button" onClick={saveProfile} disabled={saveProfileMutation.isPending || coverMutation.isPending} className="rounded-full bg-[#168bff] px-3 py-2 text-[12px] font-black text-white disabled:opacity-50">{saveProfileMutation.isPending ? '保存中' : '保存'}</button>
        </div>
      </div>
      <input ref={coverInputRef} type="file" accept="image/*" onChange={chooseCover} className="hidden" />
      <button type="button" onClick={() => coverInputRef.current?.click()} disabled={coverMutation.isPending} className="relative min-h-[148px] overflow-hidden rounded-[24px] text-left text-white shadow-[0_18px_44px_rgba(15,23,42,.16)] disabled:opacity-50" style={{ background: coverBackground }}>
        <div className="absolute inset-0 bg-gradient-to-br from-black/10 via-transparent to-black/28" />
        <div className="relative flex min-h-[148px] items-end justify-between gap-3 p-4">
          <span className="min-w-0"><span className="block text-[18px] font-black">{coverMutation.isPending ? '封面上传中...' : '更换主页背景图'}</span><span className="mt-1 block text-[12px] font-semibold text-white/78">动态页背景图会显示在这里</span></span>
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white/20 backdrop-blur"><Icon name="upload" className="h-5 w-5" /></span>
        </div>
      </button>
      <div className="grid gap-3">
        <input value={profileDraft.profile_title} onChange={(event) => updateDraft('profile_title', event.target.value)} className="kc-qq-input" placeholder="主页标题" />
        <input value={profileDraft.profile_tagline} onChange={(event) => updateDraft('profile_tagline', event.target.value)} className="kc-qq-input" placeholder="主页标签" />
        <input value={profileDraft.profile_status} onChange={(event) => updateDraft('profile_status', event.target.value)} className="kc-qq-input" placeholder="当前状态" />
        <input value={profileDraft.profile_location} onChange={(event) => updateDraft('profile_location', event.target.value)} className="kc-qq-input" placeholder="所在地" />
        <InterestTagManager value={profileDraft.profile_interests} onChange={(value) => updateDraft('profile_interests', value)} />
        <textarea value={profileDraft.bio} onChange={(event) => updateDraft('bio', event.target.value)} rows={3} maxLength={1000} className="kc-qq-input min-h-[92px] resize-none leading-6" placeholder="个人简介" />
      </div>
      <section className="grid gap-3 rounded-[24px] bg-[#f6f8fc] p-3">
        <div>
          <h4 className="text-[15px] font-black text-[#111827]">视觉系统</h4>
          <p className="mt-1 text-[12px] font-medium text-[#8b95a5]">手机版可保存全部选项，页面宽度效果请在电脑端个人主页查看。</p>
        </div>
        <div className="grid gap-2">
          <span className="text-[13px] font-bold text-[#526070]">页面宽度</span>
          <div className="grid grid-cols-3 gap-2">
            {profileLayoutOptions.map((option) => {
              const active = profileDraft.profile_layout === option.value;
              return <button key={option.value} type="button" onClick={() => updateDraft('profile_layout', option.value)} className={`rounded-[18px] px-2 py-3 text-center text-[12px] font-black ${active ? 'text-white shadow-[0_10px_24px_rgba(22,139,255,.2)]' : 'bg-white text-[#526070]'}`} style={active ? { background: accent } : undefined}>{option.label}</button>;
            })}
          </div>
        </div>
        <div className="grid gap-2">
          <span className="text-[13px] font-bold text-[#526070]">卡片风格</span>
          <div className="grid gap-2">
            {profileCardStyleOptions.map((option) => {
              const active = profileDraft.profile_card_style === option.value;
              return <button key={option.value} type="button" onClick={() => updateDraft('profile_card_style', option.value)} className={`rounded-[18px] px-3 py-3 text-left ${active ? 'bg-[#111827] text-white shadow-[0_10px_24px_rgba(17,24,39,.18)]' : 'bg-white text-[#111827]'}`}><span className="block text-[13px] font-black">{option.label}</span><span className="mt-1 block text-[11px] font-bold opacity-70">{option.detail}</span></button>;
            })}
          </div>
        </div>
        <div className="grid gap-2">
          <span className="text-[13px] font-bold text-[#526070]">主页强调色</span>
          <p className="text-[12px] font-medium text-[#8b95a5]">用于兴趣标签、资料按钮和个人主页重点色。</p>
          <div className="flex flex-wrap items-center gap-2">
            {profileAccentPresets.map((color) => <button key={color} type="button" onClick={() => updateDraft('profile_accent_color', color)} className={`grid h-9 w-9 place-items-center rounded-full border-2 ${profileDraft.profile_accent_color === color ? 'border-white shadow-[0_0_0_3px_rgba(22,139,255,.22)]' : 'border-transparent'}`} style={{ background: color }}>{profileDraft.profile_accent_color === color ? <Icon name="check" className="h-4 w-4 text-white" /> : null}</button>)}
            <input type="color" value={profileDraft.profile_accent_color} onChange={(event) => updateDraft('profile_accent_color', event.target.value)} className="h-9 w-14 rounded-full border-0 bg-white px-1 py-1" aria-label="自定义强调色" />
          </div>
        </div>
      </section>
      {coverErrorMessage ? <p className="rounded-[18px] bg-red-50 px-4 py-3 text-[13px] font-bold text-red-500">{coverErrorMessage}</p> : null}
      {saveErrorMessage ? <p className="rounded-[18px] bg-red-50 px-4 py-3 text-[13px] font-bold text-red-500">{saveErrorMessage}</p> : null}
    </section>
  ) : null;

  if (nestedProfile) {
    return <MobileUserProfilePage user={nestedProfile.user} label={nestedProfile.user ? undefined : `用户 ${nestedProfile.fallbackId}`} fallbackUserId={nestedProfile.fallbackId} currentUserId={currentUserId} currentUser={currentUser} onOpenPost={onOpenPost} onEditPost={onEditPost} onClose={() => setNestedProfile(null)} />;
  }

  if (managementOpen) {
    return (
      <div className="fixed inset-0 z-[2147483647] flex min-h-0 w-screen max-w-[100vw] flex-col overflow-hidden [background:var(--kc-mobile-chat)] [color:var(--kc-text)]">
        <header className="flex min-h-[calc(max(44px,env(safe-area-inset-top))+58px)] shrink-0 items-end justify-between gap-3 px-4 pb-3 pt-[max(44px,env(safe-area-inset-top))] [background:var(--kc-mobile-chat)]">
          <button type="button" onClick={() => setManagementOpen(false)} className="grid h-10 w-10 shrink-0 place-items-center rounded-full [color:var(--kc-text)] active:[background:var(--kc-hover)]" aria-label="返回个人主页"><Icon name="chevronLeft" className="h-6 w-6" /></button>
          <h2 className="min-w-0 flex-1 truncate text-center text-[18px] font-black">成员管理</h2>
          <span className="h-10 w-10 shrink-0" />
        </header>
        <main className="scroll-soft min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(var(--kc-native-safe-bottom,env(safe-area-inset-bottom))+32px)] pt-2">
          <section className="kc-qq-card p-4">
            <div className="flex items-center gap-3">
              <Avatar user={displayUser} label={name} size="md" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[16px] font-black text-[#151922]">{name}</p>
                <p className="mt-1 text-[12px] font-bold text-[#8b95a5]">{managedMember?.role === 'owner' ? '群主' : managedMember?.role === 'admin' ? '管理员' : '群成员'}</p>
              </div>
            </div>
            {managementMessage ? <p className="mt-3 rounded-[18px] bg-[#edf6ff] px-4 py-3 text-[13px] font-bold text-[#168bff]">{managementMessage}</p> : null}
          </section>
          <section className="kc-qq-card mt-3 overflow-hidden p-0">
            {canManageMute ? (
              <>
                <button type="button" onClick={() => setMuteExpanded((value) => !value)} className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left">
                  <span className="min-w-0"><span className="block text-[15px] font-black text-[#151922]">{isManagedMuted ? '解除群禁言' : '设置群禁言'}</span><span className="mt-1 block text-[12px] font-semibold text-[#8b95a5]">点击后在下方选择禁言时长</span></span>
                  <Icon name="chevron" className={`h-5 w-5 shrink-0 text-[#8b95a5] transition ${muteExpanded ? 'rotate-90' : ''}`} />
                </button>
                {muteExpanded ? (
                  <div className="border-t border-[#eef1f6] px-4 pb-4 pt-2">
                    {isManagedMuted ? <button type="button" onClick={clearMute} disabled={memberMuteMutation.isPending} className="mb-2 h-11 w-full rounded-[18px] bg-[#168bff] text-[14px] font-black text-white disabled:opacity-50">解除禁言</button> : null}
                    <div className="grid grid-cols-2 gap-2">
                      {muteDurationOptions.map((option) => <button key={option.label} type="button" onClick={() => applyMute(option.minutes)} disabled={memberMuteMutation.isPending} className="h-11 rounded-[18px] bg-[#f4f6fa] text-[13px] font-black text-[#526070] disabled:opacity-50">{option.label}</button>)}
                    </div>
                  </div>
                ) : null}
              </>
            ) : <p className="px-4 py-4 text-[13px] font-semibold text-[#8b95a5]">当前没有禁言权限。</p>}
            {canManageRole ? <button type="button" onClick={toggleAdmin} disabled={memberRoleMutation.isPending} className="flex w-full items-center justify-between gap-3 border-t border-[#eef1f6] px-4 py-4 text-left disabled:opacity-50"><span><span className="block text-[15px] font-black text-[#151922]">{managedMember?.role === 'admin' ? '取消管理员' : '设置为管理员'}</span><span className="mt-1 block text-[12px] font-semibold text-[#8b95a5]">仅群主可修改管理员身份</span></span><Icon name="shieldCheck" className="h-5 w-5 text-[#168bff]" /></button> : null}
          </section>
        </main>
      </div>
    );
  }

  const profileMainPage = (
    <div className={`kc-mobile-profile-page ${displayUser && canAct && action ? 'kc-mobile-profile-page-has-action' : ''} fixed inset-0 z-[2147483646] flex min-h-0 w-screen max-w-[100vw] flex-col overflow-hidden [background:var(--kc-mobile-bg,#f1f3f8)] [color:var(--kc-text)]`} style={transitionStyle}>
      <div className="kc-mobile-profile-fixed-cover fixed inset-x-0 top-0" style={profileCoverLayerStyle} aria-hidden="true" />
      <div className="kc-mobile-profile-scroll-status-surface fixed inset-x-0 top-0" style={profileStatusSurfaceStyle} aria-hidden="true" />
      <header className="kc-mobile-profile-cover-header flex min-h-[calc(max(44px,env(safe-area-inset-top))+58px)] shrink-0 items-end justify-between gap-3 px-4 pb-3 pt-[max(44px,env(safe-area-inset-top))]" style={profileHeaderStyle}>
        <button type="button" onClick={onClose} className={`kc-mobile-profile-cover-button grid h-10 w-10 shrink-0 place-items-center rounded-full ${profileBackTone === 'dark' ? profileDarkNavClass : profileLightNavClass}`} data-cover-tone={profileBackTone} data-surface-active={profileHeaderOnSurface ? 'true' : 'false'} aria-label="返回">
          <Icon name="chevronLeft" className="h-6 w-6" />
        </button>
        <h2 className={`kc-mobile-profile-cover-title min-w-0 flex-1 truncate text-center text-[18px] font-black ${profileTitleTone === 'dark' ? profileDarkNavClass : profileLightNavClass}`} style={profileHeaderTitleStyle} data-cover-tone={profileTitleTone} data-surface-active={profileHeaderOnSurface ? 'true' : 'false'}>{profileTitle}</h2>
        {showManageButton ? (
          <button type="button" onClick={() => setManagementOpen(true)} className={`kc-mobile-profile-cover-button grid h-10 w-10 shrink-0 place-items-center rounded-full ${profileMenuTone === 'dark' ? profileDarkNavClass : profileLightNavClass}`} data-cover-tone={profileMenuTone} data-surface-active={profileHeaderOnSurface ? 'true' : 'false'} aria-label="成员管理" title="成员管理">
            <Icon name="more" className="h-6 w-6" />
          </button>
        ) : <span className="h-10 w-10 shrink-0" />}
      </header>
      <main className="kc-mobile-profile-scroll scroll-soft min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(var(--kc-native-safe-bottom,env(safe-area-inset-bottom))+32px)] pt-[clamp(120px,25vh,190px)]" onScroll={(event) => setProfileScrollTop(event.currentTarget.scrollTop)}>
        <MobileProfileSummaryCard user={displayUser} name={name} label={name} handle={displayUser ? userHandle(displayUser, fallbackId) : undefined} userId={displayUser?.id ?? fallbackId} bio={profileBio || (isBot ? '这个机器人还没有写介绍' : '这个人还没有写简介')} statusLabel={statusLabel} online={isBotOnline || (!isBot && Boolean(onlineQuery.data?.online))} stats={stats} profileCardStyle={profileCardStyle} isBot={isBot} profileTagline={profileTagline} profileStatus={showProfileStatusTag ? profileStatus : undefined} email={!isBot ? displayUser?.email : null} />

        <div className="mt-3 grid gap-3">
          {profileEditor}
          {friendRequestError || directMessageError ? <p className="rounded-[18px] bg-red-50 px-4 py-3 text-[13px] font-bold text-red-500">{friendRequestError || directMessageError}</p> : null}
          {(profileLocation || interests.length > 0) ? (
            <section className="kc-mobile-profile-info-card kc-qq-card grid gap-3 p-4">
              <div className="flex items-center justify-between gap-3"><h3 className="text-[17px] font-black text-[#111827]">空间名片</h3><span className="grid h-10 w-10 place-items-center rounded-[18px] text-white" style={{ background: accent }}><Icon name="sparkles" className="h-5 w-5" /></span></div>
              {profileLocation ? <p className="inline-flex items-center gap-2 text-[13px] font-bold text-[#526070]"><Icon name="pin" className="h-4 w-4 text-[#8b95a5]" />{profileLocation}</p> : null}
              {interests.length > 0 ? <div className="flex flex-wrap gap-2">{interests.map((item) => <span key={item} className="rounded-full px-3 py-1 text-[12px] font-bold text-white" style={{ background: accent }}>{item}</span>)}</div> : null}
            </section>
          ) : null}
          {ccwProfileUrl ? (
            <button type="button" onClick={() => void openExternalUrl(ccwProfileUrl)} className="kc-qq-card grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 p-4 text-left">
              {resolveThumbnailUrl(displayUser?.ccw_avatar_url) ? <img src={resolveThumbnailUrl(displayUser?.ccw_avatar_url)} alt={displayUser?.ccw_name ?? 'CCW'} className="h-11 w-11 rounded-[18px] object-cover" /> : <span className="grid h-11 w-11 place-items-center rounded-[18px] bg-[#168bff] text-white"><Icon name="ccw" className="h-5 w-5" /></span>}
              <span className="min-w-0"><span className="block truncate text-[15px] font-black text-[#111827]">{displayUser?.ccw_name || 'CCW 账号'}</span><span className="mt-0.5 block truncate text-[12px] font-bold text-[#8b95a5]">粉丝 {formatCompact(displayUser?.ccw_follower_count)} · 获赞 {formatCompact(displayUser?.ccw_like_count)}</span></span>
              <Icon name="external" className="h-4 w-4 text-[#168bff]" />
            </button>
          ) : null}
          {effectiveCurrentUser && !isSelf && !action && !isBot ? <button type="button" onClick={handleInternalFriendAction} disabled={internalFriendButtonDisabled} className="h-12 w-full rounded-[18px] text-[16px] font-black text-white transition disabled:opacity-60 [background:var(--kc-accent)]">{internalFriendButtonLabel}</button> : null}
          <div className="flex items-center justify-between gap-3 px-1">
            <div>
              <h3 className="text-[17px] font-black text-[#111827]">{isSelf ? '我的动态' : 'Ta 的动态'}</h3>
              <p className="mt-1 text-[12px] font-bold text-[#8b95a5]">共 {stats.post_count} 条可见动态</p>
            </div>
            <div className="flex shrink-0 gap-1 rounded-full bg-white p-1 shadow-sm">
              {(['latest', 'hot'] as PostFeedSort[]).map((item) => <button key={item} type="button" onClick={() => setPostSort(item)} className={`rounded-full px-3 py-1.5 text-[12px] font-bold ${postSort === item ? 'bg-[#168bff] text-white' : 'text-[#8b95a5]'}`}>{item === 'latest' ? '最新' : '热门'}</button>)}
            </div>
          </div>
          {postsQuery.isLoading ? <p className="kc-qq-post-empty">正在打开个人主页...</p> : null}
          {!postsQuery.isLoading && posts.length === 0 ? (
            <section className="kc-qq-card grid place-items-center gap-2 px-5 py-10 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-[24px] bg-[#edf6ff] text-[#168bff]"><Icon name="feed" className="h-7 w-7" /></span>
              <p className="text-[15px] font-black text-[#111827]">暂无可见动态</p>
              <p className="text-[12px] font-medium text-[#8b95a5]">新的动态会出现在这里。</p>
            </section>
          ) : null}
          {effectiveCurrentUser ? posts.map((post) => <MobileProfilePostCard key={post.id} post={post} currentUser={effectiveCurrentUser} friendUsers={friendUsers} isSelf={isSelf} profileUserId={fallbackId} onOpenProfile={openProfile} onOpenPost={(postId) => void openLocalPostDetail(postId)} onEditPost={onEditPost} />) : null}
          {postsQuery.hasNextPage ? <button type="button" onClick={() => void postsQuery.fetchNextPage()} className="mx-auto rounded-full bg-white px-5 py-2 text-[13px] font-bold text-[#8b95a5] shadow-sm">加载更多</button> : null}
        </div>
      </main>
      {displayUser && canAct && action ? (
        <footer className="kc-mobile-profile-action-footer shrink-0 px-4 pb-[max(18px,env(safe-area-inset-bottom))] pt-3 [background:var(--kc-mobile-chat)]">
          {action.helperText ? <p className="mb-2 text-center text-[12px] [color:var(--kc-muted)]">{action.helperText}</p> : null}
          <button type="button" disabled={action.disabled || !action.onClick} onClick={() => action.onClick?.(displayUser)} className={actionClassName}>
            {action.label}
          </button>
        </footer>
      ) : null}
    </div>
  );

  return (
    <>
      {profileMainPage}
      {localDetailPostId !== null && !localDetailPost ? (
        <section className="kc-space-secondary-page fixed inset-0 z-[2147483647] flex min-h-0 w-screen max-w-[100vw] flex-col overflow-hidden [background:var(--kc-mobile-bg)] [color:var(--kc-mobile-text)]">
          <header className="flex min-h-[calc(max(44px,env(safe-area-inset-top))+58px)] shrink-0 items-end justify-between gap-3 px-4 pb-3 pt-[max(44px,env(safe-area-inset-top))] [background:var(--kc-mobile-bg)]">
            <button type="button" onClick={closeLocalPostDetail} className="grid h-9 w-9 place-items-center rounded-full bg-[#f4f6fa] text-[#526070]" aria-label="返回个人主页"><Icon name="chevronLeft" className="h-5 w-5" /></button>
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
      ) : null}
      {localDetailPost && (currentUser ?? effectiveCurrentUser ?? displayUser) ? (
        <MobilePostDetailPage
          post={localDetailPost}
          currentUser={(currentUser ?? effectiveCurrentUser ?? displayUser) as User}
          friendUsers={friendUsers}
          topicOptions={topicOptions}
          isMobile
          onClose={closeLocalPostDetail}
          onOpenUserSpace={openProfile}
          onOpenPost={(postId) => void openLocalPostDetail(postId)}
          onEditPost={onEditPost}
        />
      ) : null}
    </>
  );
}

function formatCompact(value?: number | null): string {
  if (typeof value !== 'number') {
    return '-';
  }
  return Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}
