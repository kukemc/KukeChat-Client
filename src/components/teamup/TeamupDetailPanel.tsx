import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createTeamupComment,
  deleteTeamupComment,
  getTeamupComments,
  getTeamupProfile,
  toggleTeamupCommentLike
} from '@/api/teamup';
import { TEAMUP_SHARE_URL, ccwStudentProfileUrl } from '@/config';
import { acceptFriendRequest, sendFriendRequest } from '@/api/friends';
import { getConversations } from '@/api/conversations';
import { shareTeamupProfileToConversation } from '@/api/messages';
import type { Conversation, MessageMetadata, TeamupProfile, TeamupComment, TeamupShareCardMetadata, User } from '@/types/api';
import { useKukeStore } from '@/store/kukeStore';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { CcwCreationCard } from '@/components/ui/CcwCreationCard';
import { Markdown } from '@/components/ui/Markdown';
import { ImageViewer, type ImageViewerState } from '@/components/ui/ImageViewer';
import { resolveAssetUrl, resolveThumbnailUrl } from '@/utils/assetUrl';
import { openExternalUrl } from '@/utils/openExternalUrl';
import { CCW_CREATION_URL_PATTERN } from '@/utils/ccwLinks';
import { formatMessageDateTime } from '@/utils/dateTime';
import { SKILL_LEVEL_LABEL, skillMeta } from './teamupConstants';
import { TeamupBackground } from './TeamupBackground';

// Same landing page the group invite links use; opens KukeChat with the param.
const TEAMUP_SHARE_BASE = TEAMUP_SHARE_URL;

const TEAMUP_SHARE_PHRASES = [
  '求组队！我的名片：',
  '找队友在线等，很急！我的组队名片：',
  '🎮 寻找搭档中，来看看我的组队名片：',
  '组队ing～这是我的名片，速来：',
  '一起来开黑做项目吧！我的名片：',
  '蹲一个靠谱队友，我的组队名片：'
];

function teamupShareUrl(profileId: number): string {
  return `${TEAMUP_SHARE_BASE}?teamup=${profileId}`;
}

function teamupShareText(profileId: number): string {
  const phrase = TEAMUP_SHARE_PHRASES[Math.floor(Math.random() * TEAMUP_SHARE_PHRASES.length)];
  return `${phrase}\n${teamupShareUrl(profileId)}`;
}

async function copyTeamupShareText(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    /* fall through to legacy copy */
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

function cleanIntro(intro: string): string {
  return intro.replace(CCW_CREATION_URL_PATTERN, ' ').replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function profileUser(profile: TeamupProfile): User {
  return profile.author ?? { id: profile.user_id, username: `用户 ${profile.user_id}`, nickname: `用户 ${profile.user_id}` };
}

function formatCompact(value?: number | null): string {
  if (typeof value !== 'number') {
    return '-';
  }
  if (value >= 10000) {
    return `${(value / 10000).toFixed(value >= 100000 ? 0 : 1)}w`;
  }
  return String(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '请求失败，请稍后再试';
}

function teamupShareMetadata(profile: TeamupProfile, user: User): MessageMetadata {
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

function conversationTitle(conversation: Conversation, currentUser?: User | null): string {
  if (conversation.type === 'group') {
    return conversation.title?.trim() || '群聊';
  }
  const other = conversation.direct_user ?? conversation.members?.find((member) => member.user_id !== currentUser?.id)?.user;
  return other ? getDisplayName(other) : conversation.title?.trim() || '私聊';
}

interface CommentThreadData {
  root: TeamupComment;
  replies: TeamupComment[];
}

function buildCommentThreads(comments: TeamupComment[]): CommentThreadData[] {
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

interface CommentItemProps {
  comment: TeamupComment;
  currentUser: User;
  canModerate: boolean;
  nested?: boolean;
  withDivider?: boolean;
  parentAuthorName?: string;
  onReply: (comment: TeamupComment) => void;
  onLike: (commentId: number) => void;
  onDelete: (commentId: number) => void;
  onOpenUser: (userId: number) => void;
}

function CommentItem({ comment, currentUser, canModerate, nested = false, withDivider = true, parentAuthorName, onReply, onLike, onDelete, onOpenUser }: CommentItemProps): JSX.Element {
  const authorName = getDisplayName(comment.author, `用户 ${comment.author_id}`);
  const canDelete = comment.author_id === currentUser.id || canModerate;
  return (
    <div className={`${nested ? 'py-2' : `${withDivider ? 'border-b last:border-b-0 [border-color:var(--kc-border)]' : ''} py-3`} flex items-start gap-3`}>
      <button type="button" onClick={() => onOpenUser(comment.author_id)} className={`${nested ? 'mt-1' : 'mt-0.5'} shrink-0 rounded-full`}>
        <Avatar user={comment.author ?? { id: comment.author_id, username: `用户 ${comment.author_id}` }} size={nested ? 'sm' : 'md'} />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <button type="button" onClick={() => onOpenUser(comment.author_id)} className={`max-w-full truncate text-left font-bold [color:var(--kc-text)] hover:[color:var(--kc-accent)] ${nested ? 'text-[13px]' : 'text-sm'}`}>{authorName}</button>
          {parentAuthorName ? <><span className="text-xs font-semibold [color:var(--kc-muted)]">回复</span><span className="max-w-[180px] truncate text-xs font-bold [color:var(--kc-accent)]">@{parentAuthorName}</span></> : null}
          {comment.author_id === currentUser.id && comment.moderation_status === 'pending' ? <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-600">审核中</span> : null}
          {canDelete ? <button type="button" onClick={() => onDelete(comment.id)} className="ml-auto shrink-0 text-xs [color:var(--kc-muted)] hover:text-red-500">删除</button> : null}
        </div>
        <p className={`mt-1 select-text whitespace-pre-wrap break-words [color:var(--kc-text)] ${nested ? 'text-[13px] leading-5' : 'text-[14px] leading-6'}`}>{comment.content}</p>
        <div className={`${nested ? 'mt-1.5' : 'mt-2'} flex flex-wrap items-center gap-3 text-xs font-semibold [color:var(--kc-muted)]`}>
          <span>{formatMessageDateTime(comment.created_at)}</span>
          <button type="button" onClick={() => onLike(comment.id)} className={`inline-flex items-center gap-1 hover:text-rose-500 ${comment.liked_by_me ? 'text-rose-500' : ''}`}><Icon name="like" className="h-3.5 w-3.5" />{comment.like_count || 0}</button>
          <button type="button" onClick={() => onReply(comment)} className="hover:[color:var(--kc-accent)]">回复</button>
        </div>
      </div>
    </div>
  );
}

interface CommentThreadProps {
  thread: CommentThreadData;
  currentUser: User;
  canModerate: boolean;
  onReply: (comment: TeamupComment) => void;
  onLike: (commentId: number) => void;
  onDelete: (commentId: number) => void;
  onOpenUser: (userId: number) => void;
}

function CommentThread({ thread, currentUser, canModerate, onReply, onLike, onDelete, onOpenUser }: CommentThreadProps): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const visibleReplies = expanded ? thread.replies : thread.replies.slice(0, 2);
  return (
    <div>
      <CommentItem comment={thread.root} currentUser={currentUser} canModerate={canModerate} withDivider={thread.replies.length === 0} parentAuthorName={undefined} onReply={onReply} onLike={onLike} onDelete={onDelete} onOpenUser={onOpenUser} />
      {thread.replies.length > 0 ? (
        <div className="mb-2 ml-[52px] -mt-1 rounded-[18px] px-3 py-1.5 [background:color-mix(in_srgb,var(--kc-panel-muted)_42%,var(--kc-panel)_58%)]">
          {visibleReplies.map((reply) => (
            <CommentItem key={reply.id} comment={reply} currentUser={currentUser} canModerate={canModerate} nested parentAuthorName={reply.parent_author ? getDisplayName(reply.parent_author, `评论 ${reply.parent_id}`) : undefined} onReply={onReply} onLike={onLike} onDelete={onDelete} onOpenUser={onOpenUser} />
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

interface DetailProps {
  profileId: number;
  initialProfile?: TeamupProfile | null;
  currentUser: User;
  isFriend: boolean;
  hasPendingRequest: boolean;
  incomingRequestId?: number | null;
  onBack: () => void;
  onEdit?: (profile: TeamupProfile) => void;
  onFriendRequested: (profile: TeamupProfile) => void;
  isMobile?: boolean;
}

export function TeamupDetailPanel({ profileId, initialProfile, currentUser, isFriend, hasPendingRequest, incomingRequestId, onBack, onEdit, onFriendRequested, isMobile }: DetailProps): JSX.Element {
  const queryClient = useQueryClient();
  const openUserSpace = useKukeStore((state) => state.openUserSpace);
  const [commentText, setCommentText] = useState('');
  const [replyTo, setReplyTo] = useState<TeamupComment | null>(null);
  const [viewer, setViewer] = useState<ImageViewerState | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareMode, setShareMode] = useState<'menu' | 'forward'>('menu');
  const [shareTargetId, setShareTargetId] = useState(0);
  const [shareDone, setShareDone] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const composerRef = useRef<HTMLInputElement | null>(null);

  const profileQuery = useQuery({
    queryKey: ['teamup', 'profile', profileId],
    queryFn: () => getTeamupProfile(profileId),
    initialData: initialProfile ?? undefined
  });
  const commentsQuery = useQuery({
    queryKey: ['teamup', 'comments', profileId],
    queryFn: () => getTeamupComments(profileId)
  });

  const profile = profileQuery.data;

  const friendMutation = useMutation({
    mutationFn: (receiverId: number) => sendFriendRequest(receiverId),
    onSuccess: (result) => {
      setActionError(null);
      // The backend auto-accepts when the other user already invited us, so refresh
      // friend/conversation state in case we just became friends.
      if (result?.status === 'accepted') {
        void queryClient.invalidateQueries({ queryKey: ['friends'] });
        void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      }
      if (profile) {
        onFriendRequested(profile);
      }
    },
    onError: (error) => setActionError(errorMessage(error))
  });

  const acceptMutation = useMutation({
    mutationFn: (requestId: number) => acceptFriendRequest(requestId),
    onSuccess: () => {
      setActionError(null);
      void queryClient.invalidateQueries({ queryKey: ['friends'] });
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      if (profile) {
        onFriendRequested(profile);
      }
    },
    onError: (error) => setActionError(errorMessage(error))
  });

  const commentMutation = useMutation({
    mutationFn: (payload: { content: string; parentId?: number }) => createTeamupComment(profileId, { content: payload.content, parent_id: payload.parentId ?? null }),
    onSuccess: () => {
      setCommentText('');
      setReplyTo(null);
      void queryClient.invalidateQueries({ queryKey: ['teamup', 'comments', profileId] });
      void queryClient.invalidateQueries({ queryKey: ['teamup', 'profile', profileId] });
    },
    onError: (error) => setActionError(errorMessage(error))
  });

  const likeMutation = useMutation({
    mutationFn: (commentId: number) => toggleTeamupCommentLike(profileId, commentId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['teamup', 'comments', profileId] })
  });

  const deleteCommentMutation = useMutation({
    mutationFn: (commentId: number) => deleteTeamupComment(profileId, commentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['teamup', 'comments', profileId] });
      void queryClient.invalidateQueries({ queryKey: ['teamup', 'profile', profileId] });
    }
  });

  const conversationsQuery = useQuery({
    queryKey: ['conversations'],
    queryFn: getConversations,
    enabled: shareOpen
  });
  const conversations = conversationsQuery.data ?? [];

  const shareMutation = useMutation({
    mutationFn: () => {
      if (!profile || !shareTargetId) {
        throw new Error('请选择一个会话');
      }
      return shareTeamupProfileToConversation(shareTargetId, `[组队名片] ${getDisplayName(profileUser(profile))}`, teamupShareMetadata(profile, profileUser(profile)));
    },
    onSuccess: () => {
      setShareDone(true);
      void queryClient.invalidateQueries({ queryKey: ['messages', shareTargetId] });
      window.setTimeout(() => {
        setShareOpen(false);
        setShareDone(false);
      }, 900);
    },
    onError: (error) => setActionError(errorMessage(error))
  });

  useEffect(() => {
    if (shareOpen && !shareTargetId) {
      setShareTargetId(conversations[0]?.id ?? 0);
    }
  }, [shareOpen, conversations, shareTargetId]);

  function openShare(): void {
    setShareMode('menu');
    setLinkCopied(false);
    setShareOpen(true);
  }

  async function handleCopyShareLink(): Promise<void> {
    if (!profile) {
      return;
    }
    const ok = await copyTeamupShareText(teamupShareText(profile.id));
    if (ok) {
      setLinkCopied(true);
      window.setTimeout(() => { setLinkCopied(false); setShareOpen(false); }, 1100);
    } else {
      setActionError('复制失败，请手动复制链接。');
    }
  }

  useEffect(() => {
    if (replyTo && composerRef.current) {
      composerRef.current.focus();
    }
  }, [replyTo]);

  const galleryImages = useMemo(() => (profile?.image_urls ?? []).map((url) => resolveAssetUrl(url) ?? url), [profile?.image_urls]);
  const comments = commentsQuery.data ?? [];
  const threads = useMemo(() => buildCommentThreads(comments), [comments]);

  if (!profile) {
    return (
      <section className="grid h-full place-items-center [background:var(--kc-chat)] [color:var(--kc-muted)]">
        {profileQuery.isLoading ? '加载中…' : '名片不存在或已下架'}
      </section>
    );
  }

  const user = profileUser(profile);
  const displayIntro = cleanIntro(profile.intro);
  const isSelf = profile.is_self || profile.user_id === currentUser.id;
  const friendlyState = isFriend || profile.is_friend;
  const creations = profile.ccw_creations ?? [];
  const backgroundUrl = profile.background_url ? resolveAssetUrl(profile.background_url) ?? profile.background_url : null;

  function submitComment(): void {
    const content = commentText.trim();
    if (!content) {
      return;
    }
    commentMutation.mutate({ content, parentId: replyTo?.id });
  }

  return (
    <section className="kc-teamup-surface flex h-full min-h-0 flex-col overflow-hidden [color:var(--kc-text)]">
      {backgroundUrl ? <div className="kc-teamup-surface-bg" style={{ backgroundImage: `url(${backgroundUrl})` }} /> : <TeamupBackground variant="soft" />}
      <header className="kc-teamup-detail-glass relative z-10 flex shrink-0 items-center gap-3 border-x-0 border-t-0 px-4 py-3">
        <button type="button" onClick={onBack} className="ghost-button grid h-9 w-9 place-items-center rounded-xl"><Icon name="chevronLeft" className="h-5 w-5" /></button>
        <h2 className="min-w-0 flex-1 truncate text-base font-black">组队名片</h2>
        <button type="button" onClick={openShare} className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold shadow-sm transition hover:-translate-y-0.5 [background:var(--kc-panel)] [border-color:var(--kc-border-strong)] [color:var(--kc-text)] hover:[background:var(--kc-hover)]"><Icon name="share" className="h-3.5 w-3.5 [color:var(--kc-accent)]" />分享</button>
        {isSelf && onEdit ? <button type="button" onClick={() => onEdit(profile)} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-white shadow-sm transition hover:-translate-y-0.5 [background:var(--kc-accent)]"><Icon name="edit" className="h-3.5 w-3.5" />编辑</button> : null}
      </header>

      <div className="scroll-soft kc-pc-page-main relative z-10 min-h-0 flex-1 overflow-y-auto">
        <div className={`mx-auto w-full ${isMobile ? 'max-w-full px-4' : 'max-w-5xl px-6'} pb-8`}>
          {/* Header card */}
          <div className="kc-pc-page-hero kc-teamup-detail-glass relative mt-4 overflow-hidden rounded-[24px] p-5 sm:p-6">
            <div className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-gradient-to-br from-sky-400/20 via-indigo-400/12 to-transparent blur-2xl" />
            <div className="pointer-events-none absolute -bottom-24 left-10 h-44 w-44 rounded-full bg-gradient-to-tr from-emerald-400/14 to-transparent blur-2xl" />
            <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start">
              <button type="button" onClick={() => openUserSpace(user.id)} className="group relative shrink-0 rounded-full">
                <span className="absolute -inset-1 rounded-full bg-gradient-to-br from-sky-400/40 to-indigo-400/30 opacity-0 blur transition group-hover:opacity-100" />
                <span className="relative block"><Avatar user={user} size="xl" /></span>
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => openUserSpace(user.id)} className="min-w-0 truncate text-2xl font-black tracking-tight hover:underline">{getDisplayName(user)}</button>
                  {profile.status === 'recruiting' ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-700"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />招募中</span> : <span className="rounded-full px-2.5 py-1 text-[11px] font-bold [background:var(--kc-panel-muted)] [color:var(--kc-muted)]">已满员</span>}
                  {profile.moderation_status === 'pending' ? <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-700">审核中</span> : null}
                  {profile.moderation_status === 'rejected' ? <span className="rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-bold text-red-700">未通过</span> : null}
                </div>
                <p className="mt-1.5 text-base font-bold leading-6 [color:var(--kc-text)]">{profile.headline}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold [color:var(--kc-muted)]">
                  <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 [background:var(--kc-panel-muted)]"><Icon name="eye" className="h-3.5 w-3.5 [color:var(--kc-accent)]" />{profile.view_count} 浏览</span>
                  <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 [background:var(--kc-panel-muted)]"><Icon name="message" className="h-3.5 w-3.5 [color:var(--kc-accent)]" />{profile.comment_count} 留言</span>
                  {creations.length > 0 ? <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 [background:var(--kc-panel-muted)]"><Icon name="sparkles" className="h-3.5 w-3.5 [color:var(--kc-accent)]" />{creations.length} 代表作</span> : null}
                </div>
              </div>
              {!isSelf ? (
                <div className="flex shrink-0 gap-2">
                  {friendlyState || acceptMutation.isSuccess ? (
                    <span className="inline-flex items-center gap-1.5 rounded-2xl px-4 py-2.5 text-sm font-black [background:var(--kc-accent-soft)] [color:var(--kc-accent)]"><Icon name="check" className="h-4 w-4" />已是好友</span>
                  ) : incomingRequestId ? (
                    <button type="button" onClick={() => acceptMutation.mutate(incomingRequestId)} disabled={acceptMutation.isPending} className="liquid-button inline-flex items-center gap-1.5 rounded-2xl px-4 py-2.5 text-sm font-black disabled:opacity-50"><Icon name="userPlus" className="h-4 w-4" />{acceptMutation.isPending ? '处理中…' : '接受组队'}</button>
                  ) : hasPendingRequest || friendMutation.isSuccess ? (
                    <span className="inline-flex items-center gap-1.5 rounded-2xl px-4 py-2.5 text-sm font-bold [background:var(--kc-panel-muted)] [color:var(--kc-muted)]"><Icon name="clock" className="h-4 w-4" />申请已发送</span>
                  ) : (
                    <button type="button" onClick={() => friendMutation.mutate(profile.user_id)} disabled={friendMutation.isPending} className="liquid-button inline-flex items-center gap-1.5 rounded-2xl px-4 py-2.5 text-sm font-black disabled:opacity-50"><Icon name="userPlus" className="h-4 w-4" />{friendMutation.isPending ? '发送中…' : '组队'}</button>
                  )}
                  <button type="button" onClick={() => openUserSpace(user.id)} className="ghost-button inline-flex items-center gap-1.5 rounded-2xl border px-4 py-2.5 text-sm font-bold [border-color:var(--kc-border)]"><Icon name="profile" className="h-4 w-4" />主页</button>
                </div>
              ) : null}
            </div>
          </div>

          {actionError ? <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{actionError}</div> : null}

          {/* Two-column body */}
          <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="kc-pc-stagger min-w-0 space-y-5">
              {displayIntro ? (
                <div className="kc-teamup-detail-glass rounded-[22px] p-5">
                  <h3 className="mb-2 flex items-center gap-1.5 text-xs font-black [color:var(--kc-muted)]"><Icon name="profile" className="h-3.5 w-3.5" />个人介绍</h3>
                  <Markdown content={displayIntro} className="text-[15px] [color:var(--kc-text)]" />
                </div>
              ) : null}

              {galleryImages.length > 0 ? (
                <div className="kc-teamup-detail-glass rounded-[22px] p-5">
                  <h3 className="mb-3 flex items-center gap-1.5 text-xs font-black [color:var(--kc-muted)]"><Icon name="image" className="h-3.5 w-3.5" />作品配图</h3>
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                    {profile.image_urls.map((url, index) => (
                      <button key={url} type="button" onClick={() => setViewer({ images: galleryImages, index })} className="group aspect-[4/3] overflow-hidden rounded-2xl border [border-color:var(--kc-border)]">
                        <img src={resolveThumbnailUrl(url) ?? url} alt="" loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {creations.length > 0 ? (
                <div className="kc-teamup-detail-glass rounded-[22px] p-5">
                  <h3 className="mb-3 flex items-center gap-1.5 text-xs font-black [color:var(--kc-muted)]"><Icon name="sparkles" className="h-3.5 w-3.5" />共创代表作</h3>
                  <div className="space-y-2.5">
                    {creations.map((preview) => (
                      <CcwCreationCard key={preview.oid} oid={preview.oid} accessKey={preview.access_key ?? ''} preview={preview} />
                    ))}
                  </div>
                </div>
              ) : null}

              {!displayIntro && galleryImages.length === 0 && creations.length === 0 ? (
                <div className="kc-teamup-detail-glass grid place-items-center rounded-[22px] py-14 text-center [color:var(--kc-muted)]">
                  <Icon name="profile" className="h-9 w-9 opacity-60" />
                  <p className="mt-2 text-sm font-bold">这位肝酱还没有填写详细介绍</p>
                </div>
              ) : null}
            </div>

            {/* Sidebar */}
            <aside className="kc-pc-stagger space-y-4 lg:sticky lg:top-4 lg:self-start">
              {profile.skills.length > 0 ? (
                <div className="kc-teamup-detail-glass rounded-[22px] p-5">
                  <h3 className="mb-3 flex items-center gap-1.5 text-xs font-black [color:var(--kc-muted)]"><Icon name="sparkles" className="h-3.5 w-3.5" />擅长</h3>
                  <div className="flex flex-col gap-2">
                    {profile.skills.map((item) => {
                      const meta = skillMeta(item.skill);
                      return (
                        <div key={item.skill} className="flex items-center gap-2 rounded-xl px-3 py-2 [background:var(--kc-panel-muted)]">
                          <Icon name={meta.icon} className="h-4 w-4 [color:var(--kc-accent)]" />
                          <span className="text-sm font-bold [color:var(--kc-text)]">{meta.label}</span>
                          <span className="ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold [background:var(--kc-accent-soft)] [color:var(--kc-accent)]">{SKILL_LEVEL_LABEL[item.level]}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {profile.looking_for.length > 0 ? (
                <div className="kc-teamup-detail-glass rounded-[22px] p-5">
                  <h3 className="mb-3 flex items-center gap-1.5 text-xs font-black [color:var(--kc-muted)]"><Icon name="userPlus" className="h-3.5 w-3.5" />想找队友</h3>
                  <div className="flex flex-wrap gap-2">
                    {profile.looking_for.map((skill) => {
                      const meta = skillMeta(skill);
                      return <span key={skill} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold [background:var(--kc-panel-muted)] [color:var(--kc-text)]"><Icon name={meta.icon} className="h-3.5 w-3.5 [color:var(--kc-accent)]" />{meta.label}</span>;
                    })}
                  </div>
                </div>
              ) : null}

              {user.ccw_student_oid ? (
                <div className="kc-teamup-detail-glass overflow-hidden rounded-[22px]">
                  <div className="flex items-center gap-3 p-4">
                    {resolveThumbnailUrl(user.ccw_avatar_url) ? (
                      <img src={resolveThumbnailUrl(user.ccw_avatar_url)} alt={user.ccw_name ?? 'CCW'} className="h-12 w-12 rounded-2xl object-cover" />
                    ) : (
                      <span className="grid h-12 w-12 place-items-center rounded-2xl text-white [background:var(--kc-accent)]"><Icon name="ccw" className="h-6 w-6" /></span>
                    )}
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] [color:var(--kc-accent)]">CCW 已绑定</p>
                      <h4 className="truncate text-base font-black [color:var(--kc-text)]">{user.ccw_name || user.ccw_student_oid}</h4>
                    </div>
                  </div>
                  {user.ccw_bio ? <p className="line-clamp-2 px-4 pb-3 text-xs leading-5 [color:var(--kc-muted)]">{user.ccw_bio}</p> : null}
                  <div className="grid grid-cols-3 border-t text-center text-xs font-bold [border-color:var(--kc-border)]">
                    <span className="px-2 py-3"><strong className="block text-base [color:var(--kc-text)]">{formatCompact(user.ccw_following_count)}</strong><span className="[color:var(--kc-muted)]">关注</span></span>
                    <span className="border-x px-2 py-3 [border-color:var(--kc-border)]"><strong className="block text-base [color:var(--kc-text)]">{formatCompact(user.ccw_follower_count)}</strong><span className="[color:var(--kc-muted)]">粉丝</span></span>
                    <span className="px-2 py-3"><strong className="block text-base [color:var(--kc-text)]">{formatCompact(user.ccw_like_count)}</strong><span className="[color:var(--kc-muted)]">获赞</span></span>
                  </div>
                  <div className="grid grid-cols-3 border-t text-center text-xs font-bold [border-color:var(--kc-border)]">
                    <span className="px-2 py-3"><strong className="block text-base [color:var(--kc-text)]">{formatCompact(user.ccw_creation_count)}</strong><span className="[color:var(--kc-muted)]">作品</span></span>
                    <span className="border-x px-2 py-3 [border-color:var(--kc-border)]"><strong className="block text-base [color:var(--kc-text)]">{formatCompact(user.ccw_favorite_count)}</strong><span className="[color:var(--kc-muted)]">收藏</span></span>
                    <span className="px-2 py-3"><strong className="block text-base [color:var(--kc-text)]">{formatCompact(user.ccw_view_count)}</strong><span className="[color:var(--kc-muted)]">浏览</span></span>
                  </div>
                  {user.ccw_student_oid ? (
                    <div className="p-3">
                      <button type="button" onClick={() => void openExternalUrl(ccwStudentProfileUrl(user.ccw_student_oid as string))} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl px-3 py-2 text-sm font-bold text-white [background:var(--kc-accent)]"><Icon name="external" className="h-4 w-4" />打开 CCW 主页</button>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {profile.contact_note ? (
                <div className="kc-teamup-detail-glass rounded-[22px] p-4 text-sm leading-6 [color:var(--kc-muted)]"><Icon name="bell" className="mr-1.5 inline h-4 w-4 [color:var(--kc-accent)]" />{profile.contact_note}</div>
              ) : null}

              {profile.skills.length === 0 && profile.looking_for.length === 0 && !profile.contact_note && !user.ccw_student_oid ? (
                <div className="kc-teamup-detail-glass rounded-[22px] p-5 text-center text-xs [color:var(--kc-muted)]">暂未填写技能与招募偏好</div>
              ) : null}
            </aside>
          </div>

          <section className="kc-teamup-detail-glass mt-5 rounded-[22px] p-5">
            <h3 className="mb-3 flex items-center gap-1.5 text-sm font-black [color:var(--kc-text)]"><Icon name="message" className="h-4 w-4 [color:var(--kc-accent)]" />留言板 <span className="font-semibold [color:var(--kc-muted)]">{profile.comment_count}</span></h3>

            {replyTo ? (
              <div className="mb-2 flex items-center justify-between rounded-xl px-3 py-1.5 text-xs [background:var(--kc-panel-muted)] [color:var(--kc-muted)]">
                <span className="truncate">回复 <span className="font-bold [color:var(--kc-accent)]">@{getDisplayName(replyTo.author)}</span></span>
                <button type="button" onClick={() => setReplyTo(null)} className="shrink-0 hover:[color:var(--kc-text)]"><Icon name="close" className="h-3.5 w-3.5" /></button>
              </div>
            ) : null}
            <div className="mb-4 flex min-w-0 items-center gap-3">
              <span className="shrink-0"><Avatar user={currentUser} size="md" /></span>
              <input ref={composerRef} value={commentText} onChange={(event) => setCommentText(event.target.value)} maxLength={500} placeholder={replyTo ? `回复 ${getDisplayName(replyTo.author)}...` : '留下你的留言...'} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submitComment(); } }} className="h-10 w-full min-w-0 rounded-xl border px-3 text-sm outline-none transition [background:var(--kc-panel-muted)] [border-color:var(--kc-border)] [color:var(--kc-text)] focus:[border-color:var(--kc-accent)]" />
              <button type="button" onClick={submitComment} disabled={!commentText.trim() || commentMutation.isPending} className="shrink-0 rounded-xl bg-[#168bff] px-3.5 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-sky-600 disabled:bg-slate-200 disabled:text-slate-400 disabled:opacity-100">发送</button>
            </div>

            <div className="space-y-0">
              {threads.length === 0 ? (
                <p className="py-3 text-center text-sm [color:var(--kc-muted)]">还没有留言，来抢沙发</p>
              ) : (
                threads.map((thread) => (
                  <CommentThread
                    key={thread.root.id}
                    thread={thread}
                    currentUser={currentUser}
                    canModerate={isSelf}
                    onReply={setReplyTo}
                    onLike={(commentId) => likeMutation.mutate(commentId)}
                    onDelete={(commentId) => deleteCommentMutation.mutate(commentId)}
                    onOpenUser={(userId) => openUserSpace(userId)}
                  />
                ))
              )}
            </div>
          </section>
        </div>
      </div>

      {viewer ? <ImageViewer viewer={viewer} mobile={isMobile} onClose={() => setViewer(null)} onNavigate={(index) => setViewer((previous) => (previous ? { ...previous, index } : previous))} /> : null}

      {shareOpen ? (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-black/35 p-4 backdrop-blur-sm" onClick={() => !shareMutation.isPending && setShareOpen(false)}>
          <div className="kc-message-enter w-full max-w-lg rounded-[26px] border p-5 shadow-[0_24px_80px_rgba(15,23,42,0.22)] [background:var(--kc-panel)] [border-color:var(--kc-border)]" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-3"><h3 className="text-base font-black">分享组队名片</h3><button type="button" onClick={() => setShareOpen(false)} className="grid h-9 w-9 place-items-center rounded-full transition hover:[background:var(--kc-hover)]"><Icon name="close" className="h-4 w-4" /></button></div>
            {shareMode === 'menu' ? (
              <>
                <p className="mt-2 text-sm [color:var(--kc-muted)]">转发名片到联系人或群聊，也可以复制带文案的分享链接。</p>
                <div className="mt-4 space-y-2.5">
                  <button type="button" onClick={() => setShareMode('forward')} className="flex w-full items-center gap-3.5 rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md [border-color:var(--kc-border)] hover:[background:var(--kc-hover)]">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl [background:var(--kc-accent-soft)] [color:var(--kc-accent)]"><Icon name="share" className="h-5 w-5" /></span>
                    <span className="min-w-0 flex-1"><span className="block text-sm font-black [color:var(--kc-text)]">转发组队名片</span><span className="mt-0.5 block text-xs [color:var(--kc-muted)]">选择一个群或联系人发送可点开的名片卡片。</span></span>
                    <Icon name="chevron" className="h-4 w-4 shrink-0 [color:var(--kc-muted)]" />
                  </button>
                  <button type="button" onClick={() => void handleCopyShareLink()} className="flex w-full items-center gap-3.5 rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md [border-color:var(--kc-border)] hover:[background:var(--kc-hover)]">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl [background:var(--kc-panel-muted)] [color:var(--kc-text)]"><Icon name={linkCopied ? 'check' : 'copy'} className="h-5 w-5" /></span>
                    <span className="min-w-0 flex-1"><span className="block text-sm font-black [color:var(--kc-text)]">{linkCopied ? '已复制到剪贴板' : '复制链接'}</span><span className="mt-0.5 block text-xs [color:var(--kc-muted)]">复制带文案的分享链接，发到任意地方。</span></span>
                  </button>
                </div>
              </>
            ) : (
            <>
            <p className="mt-2 text-sm [color:var(--kc-muted)]">选择一个群聊或好友，发送这张求组队名片。对方点击即可打开详情页。</p>
            <div className="mt-4 rounded-2xl border p-2 [background:var(--kc-panel-muted)] [border-color:var(--kc-border)]">
              <div className="scroll-soft max-h-72 space-y-1 overflow-y-auto">
                {conversationsQuery.isLoading ? <p className="px-3 py-5 text-center text-sm [color:var(--kc-muted)]">加载会话中…</p> : null}
                {!conversationsQuery.isLoading && conversations.length === 0 ? <p className="px-3 py-5 text-center text-sm [color:var(--kc-muted)]">暂无可分享的会话</p> : null}
                {conversations.map((conversation) => {
                  const active = conversation.id === shareTargetId;
                  const title = conversationTitle(conversation, currentUser);
                  return (
                    <button key={conversation.id} type="button" onClick={() => setShareTargetId(conversation.id)} className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition ${active ? '[background:var(--kc-accent-soft)] [color:var(--kc-accent)]' : 'hover:[background:var(--kc-hover)]'}`}>
                      <Avatar label={title} avatarUrl={conversation.avatar_url ?? conversation.direct_user?.avatar_url} size="sm" />
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{title}</span><span className="mt-0.5 block text-xs [color:var(--kc-muted)]">{conversation.type === 'group' ? `群聊 · ${conversation.member_count ?? 0} 人` : '好友/私聊'}</span></span>
                      {active ? <Icon name="check" className="h-4 w-4 shrink-0" /> : null}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setShareMode('menu')} className="ghost-button rounded-2xl px-4 py-2 text-sm font-bold">返回</button><button type="button" onClick={() => shareMutation.mutate()} disabled={!shareTargetId || shareMutation.isPending || shareDone} className="liquid-button inline-flex items-center gap-1.5 rounded-2xl px-4 py-2 text-sm font-black disabled:opacity-50">{shareDone ? <><Icon name="check" className="h-4 w-4" />已发送</> : shareMutation.isPending ? '发送中…' : '发送名片'}</button></div>
            </>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
