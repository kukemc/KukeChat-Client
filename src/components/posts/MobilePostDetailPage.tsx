import { type CSSProperties, type ChangeEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getConversations } from '@/api/conversations';
import { getFriends } from '@/api/friends';
import { sharePostToConversation } from '@/api/messages';
import { createReport } from '@/api/reports';
import { createPostComment, deletePost, getPost, getPostComments, getPostLikes, pinPost, repostPost, togglePostCommentLike, togglePostLike, unpinPost } from '@/api/posts';
import type { CcwCreationPreview, Conversation, CreateReportPayload, MessageMetadata, Post, PostComment, PostLike, PostModerationStatus, PostReference, PostTopic, PostVisibility, User } from '@/types/api';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { CcwCreationCard } from '@/components/ui/CcwCreationCard';
import { ImageViewer, type ImageViewerState } from '@/components/ui/ImageViewer';
import { resolveAssetUrl, resolveThumbnailUrl } from '@/utils/assetUrl';
import { parseApiDate } from '@/utils/dateTime';
import { registerNativeBackHandler } from '@/native/back';
import { ReportModal } from '@/components/chat/ReportModal';

function getKukePortalRoot(): Element {
  const host = document.getElementById('kukechat-shadow-host');
  return host?.shadowRoot?.querySelector('.kc-window-frame:not(.kc-window-minimized)') ?? document.querySelector('.kc-window-frame:not(.kc-window-minimized)') ?? host?.shadowRoot?.getElementById('kukechat-root') ?? document.getElementById('kukechat-root') ?? document.body;
}

type RepostTarget = Post | PostReference;



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


function invalidatePosts(queryClient: ReturnType<typeof useQueryClient>): void {
  void queryClient.invalidateQueries({ queryKey: ['posts'] });
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

function MentionTopicInput({ value, onChange, friends, topics, multiline = false, disabled = false, maxLength, placeholder, className }: { value: string; onChange: (value: string) => void; friends: User[]; topics: PostTopic[]; multiline?: boolean; disabled?: boolean; maxLength: number; placeholder: string; className: string }): JSX.Element {
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const [focused, setFocused] = useState(false);
  const [cursor, setCursor] = useState(value.length);
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null);
  const trigger = inputTrigger(value, cursor);
  const query = trigger?.query.toLowerCase() ?? '';
  const friendMatches = trigger?.type === 'mention'
    ? friends.filter((user) => getDisplayName(user).toLowerCase().includes(query) || user.username.toLowerCase().includes(query)).slice(0, 8)
    : [];
  const topicMatches = trigger?.type === 'topic'
    ? topics.filter((topic) => topic.name.toLowerCase().includes(query)).slice(0, 8)
    : [];
  const exactTopicExists = trigger?.type === 'topic' && Boolean(query) && topics.some((topic) => topic.name.toLowerCase() === query);
  const popupStyle: CSSProperties | null = menuStyle ? { ...menuStyle, position: 'fixed', zIndex: 2147483647 } : null;
  const popupBoxStyle: CSSProperties = {
    display: 'block',
    boxSizing: 'border-box',
    maxHeight: 220,
    overflowY: 'auto',
    overflowX: 'hidden',
    padding: 6,
    border: '1px solid rgba(15, 23, 42, 0.08)',
    borderRadius: 16,
    background: '#fff',
    color: '#111827',
    boxShadow: '0 18px 42px rgba(15, 23, 42, 0.18)',
    fontFamily: 'Inter, "PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
    fontSize: 14,
    lineHeight: 1.4,
    opacity: 1,
    pointerEvents: 'auto'
  };
  const popupOptionStyle: CSSProperties = {
    display: 'flex',
    width: '100%',
    minWidth: 0,
    alignItems: 'center',
    gap: 10,
    margin: 0,
    padding: '8px 10px',
    border: 0,
    borderRadius: 12,
    background: 'transparent',
    color: '#111827',
    cursor: 'pointer',
    textAlign: 'left',
    font: 'inherit',
    fontWeight: 700,
    appearance: 'none'
  };

  useEffect(() => {
    if (!focused || !trigger || typeof window === 'undefined') {
      setMenuStyle(null);
      return undefined;
    }
    const updateMenuStyle = (): void => {
      const rect = inputRef.current?.getBoundingClientRect();
      if (!rect) {
        setMenuStyle(null);
        return;
      }
      const width = Math.min(Math.max(rect.width, 260), Math.max(260, window.innerWidth - 24));
      const left = Math.min(Math.max(12, rect.left), Math.max(12, window.innerWidth - width - 12));
      const belowTop = rect.bottom + 8;
      const shouldShowAbove = belowTop + 220 > window.innerHeight && rect.top > 240;
      const top = shouldShowAbove ? rect.top - 228 : belowTop;
      setMenuStyle({ left, top: Math.max(12, top), width });
    };
    updateMenuStyle();
    window.addEventListener('resize', updateMenuStyle);
    window.addEventListener('scroll', updateMenuStyle, true);
    return () => {
      window.removeEventListener('resize', updateMenuStyle);
      window.removeEventListener('scroll', updateMenuStyle, true);
    };
  }, [focused, trigger, value, cursor]);

  function updateCursorFromElement(): void {
    const nextCursor = inputRef.current?.selectionStart ?? value.length;
    setCursor(nextCursor);
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
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      onChange(event.target.value);
      setCursor(event.target.selectionStart ?? event.target.value.length);
    },
    onClick: updateCursorFromElement,
    onKeyUp: updateCursorFromElement,
    onSelect: updateCursorFromElement,
    onFocus: () => {
      setFocused(true);
      window.setTimeout(updateCursorFromElement, 0);
    },
    onBlur: () => window.setTimeout(() => setFocused(false), 120),
    disabled,
    maxLength,
    placeholder,
    className
  };

  return (
    <div className="relative min-w-0 flex-1 basis-0">
      {multiline ? <textarea ref={(node) => { inputRef.current = node; }} {...commonProps} /> : <input ref={(node) => { inputRef.current = node; }} {...commonProps} />}
      {focused && trigger && popupStyle && typeof document !== 'undefined' ? createPortal(
        <div style={{ ...popupBoxStyle, ...popupStyle }}>
          {trigger.type === 'mention' ? (
            friendMatches.length > 0 ? friendMatches.map((user) => (
              <button key={user.id} type="button" onMouseDown={(event) => event.preventDefault()} onMouseEnter={(event) => { event.currentTarget.style.background = '#f1f5f9'; }} onMouseLeave={(event) => { event.currentTarget.style.background = 'transparent'; }} onClick={() => chooseMention(user)} style={popupOptionStyle}>
                <span style={{ display: 'grid', width: 28, height: 28, flexShrink: 0, placeItems: 'center', overflow: 'hidden', borderRadius: 999, background: '#e0f2fe', color: '#0b84ff', fontSize: 12, fontWeight: 800 }}>{getDisplayName(user).trim().slice(0, 1).toUpperCase() || '@'}</span>
                <span style={{ minWidth: 0, flex: '1 1 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{getDisplayName(user)}</span>
              </button>
            )) : <p style={{ margin: 0, padding: '8px 10px', color: '#64748b', fontSize: 12, fontWeight: 600 }}>没有匹配的好友</p>
          ) : (
            <>
              {topicMatches.map((topic) => (
                <button key={topic.id} type="button" onMouseDown={(event) => event.preventDefault()} onMouseEnter={(event) => { event.currentTarget.style.background = '#f1f5f9'; }} onMouseLeave={(event) => { event.currentTarget.style.background = 'transparent'; }} onClick={() => chooseTopic(topic.name)} style={popupOptionStyle}>
                  <span style={{ minWidth: 0, flex: '1 1 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>#{topic.name}</span><span style={{ flexShrink: 0, color: '#64748b', fontSize: 12, fontWeight: 700 }}>{topic.post_count}</span>
                </button>
              ))}
              {query && !exactTopicExists ? <button type="button" onMouseDown={(event) => event.preventDefault()} onMouseEnter={(event) => { event.currentTarget.style.background = '#eef6ff'; }} onMouseLeave={(event) => { event.currentTarget.style.background = 'transparent'; }} onClick={() => chooseTopic(trigger.query)} style={{ ...popupOptionStyle, color: '#0b84ff' }}><span style={{ display: 'inline-flex', width: 18, height: 18, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 999, background: '#e0f2fe', color: '#0b84ff', fontSize: 16, lineHeight: '18px' }}>+</span> 创建新话题 #{trigger.query}</button> : null}
              {!query && topicMatches.length === 0 ? <p style={{ margin: 0, padding: '8px 10px', color: '#64748b', fontSize: 12, fontWeight: 600 }}>输入话题名称</p> : null}
            </>
          )}
        </div>,
        document.body
      ) : null}
    </div>
  );
}

function renderRichTextSafe(content: string, onOpenUserSpace: (user: User | null | undefined, fallbackId: number) => void, onSelectTopic?: (topic: string) => void, mentionUsers: User[] = []): ReactNode[] {
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
    }, 210);
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
      <div className="kc-space-secondary-page kc-native-keyboard-page fixed inset-0 z-[2147483646] flex min-h-0 flex-col [background:var(--kc-mobile-bg,#f1f3f8)]" onClick={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
        <section className="kc-qq-page flex h-full min-h-0 flex-col overflow-hidden text-[#111827]">
          <header className="flex min-h-[calc(max(44px,env(safe-area-inset-top))+58px)] shrink-0 items-end justify-between gap-3 px-4 pb-3 pt-[max(44px,env(safe-area-inset-top))] [background:var(--kc-mobile-bg,#f1f3f8)]">
            <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full bg-white text-[#526070]" aria-label="关闭转发"><Icon name="chevronLeft" className="h-5 w-5" /></button>
            <div className="min-w-0 text-center">
              <h2 className="text-[17px] font-bold text-[#151922]">转发动态</h2>
              <p className="text-[11px] font-semibold text-[#8b95a5]">转发到动态或聊天</p>
            </div>
            <button type="button" onClick={() => mutation.mutate()} disabled={!canSubmit} className="rounded-full bg-[#168bff] px-4 py-2 text-[13px] font-bold text-white shadow-[0_8px_18px_rgba(22,139,255,0.2)] disabled:opacity-50">
              {mutation.isPending ? '转发中' : '转发'}
            </button>
          </header>
          <div className="kc-qq-scroll scroll-soft min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(var(--kc-native-safe-bottom,env(safe-area-inset-bottom))+24px)] pt-3">
            <section className="kc-qq-card p-4">
              {modeTabs}
              <div className="mb-4 flex items-center gap-3">
                <Avatar user={currentUser} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-bold text-[#151922]">{getDisplayName(currentUser)}</p>
                  <p className="text-[12px] font-semibold text-[#8b95a5]">{mode === 'chat' ? '发送动态卡片到会话' : '转发后会进入审核'}</p>
                </div>
              </div>
              <textarea value={content} onChange={(event) => setContent(event.target.value)} maxLength={2000} placeholder="说说转发理由..." className="kc-native-composer min-h-[96px] max-h-[28dvh] w-full resize-none rounded-[22px] border-0 bg-[#f4f6fa] px-4 py-3 text-[15px] font-medium leading-7 text-[#151922] outline-none placeholder:text-[#a4adba] focus:ring-2 focus:ring-sky-100" />
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

function LikesModal({ post, isMobile, onClose, onOpenUserSpace }: { post: Post; isMobile: boolean; onClose: () => void; onOpenUserSpace: (user: User | null | undefined, fallbackId: number) => void }): JSX.Element {
  const likesQuery = useQuery({ queryKey: ['posts', 'likes', post.id], queryFn: () => getPostLikes(post.id) });
  useEffect(() => {
    if (!isMobile) {
      return undefined;
    }
    return registerNativeBackHandler(() => {
      onClose();
      return true;
    }, 220);
  }, [isMobile, onClose]);
  const likes = likesQuery.data ?? [];
  if (isMobile) {
    const mobileModal = (
      <div className="kc-space-secondary-page fixed inset-0 z-[2147483646] flex min-h-0 flex-col [background:var(--kc-mobile-bg,#f1f3f8)]" onMouseDown={undefined}>
        <section onMouseDown={(event) => event.stopPropagation()} className="kc-qq-page flex h-full min-h-0 flex-col overflow-hidden text-[#111827]">
          <header className="flex min-h-[calc(max(44px,env(safe-area-inset-top))+58px)] shrink-0 items-end justify-between gap-3 px-4 pb-3 pt-[max(44px,env(safe-area-inset-top))] [background:var(--kc-mobile-bg,#f1f3f8)]">
            <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full bg-white text-[#526070]" aria-label="返回动态详情"><Icon name="chevronLeft" className="h-5 w-5" /></button>
            <div className="min-w-0 text-center">
              <h2 className="text-[17px] font-bold text-[#151922]">点赞列表</h2>
              <p className="text-[11px] font-semibold text-[#8b95a5]">{post.like_count} 人赞了这条动态</p>
            </div>
             <span className="h-9 w-9" />
          </header>
          <div className="kc-qq-scroll scroll-soft min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(var(--kc-native-safe-bottom,env(safe-area-inset-bottom))+24px)] pt-3">
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
            <div className="kc-native-composer flex min-w-0 items-center gap-2">
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

function PostCard({ post, currentUser, friendUsers = [], topicOptions = [], isMobile, compact = false, mobileListMode = false, forceDetailOnComment = false, disableAuthorProfileJump = false, highlighted = false, onPostRef, onOpenUserSpace, onOpenPost, onOpenRepost, onEditPost, onSelectTopic }: { post: Post; currentUser: User; friendUsers?: User[]; topicOptions?: PostTopic[]; isMobile: boolean; compact?: boolean; mobileListMode?: boolean; forceDetailOnComment?: boolean; disableAuthorProfileJump?: boolean; highlighted?: boolean; onPostRef?: (postId: number, node: HTMLElement | null) => void; onOpenUserSpace: (user: User | null | undefined, fallbackId: number) => void; onOpenPost: (postId: number) => void; onOpenRepost?: (post: Post) => void; onEditPost?: (post: Post) => void; onSelectTopic?: (topic: string) => void }): JSX.Element {
  const [likesOpen, setLikesOpen] = useState(false);
  const [commentsExpanded, setCommentsExpanded] = useState(false);
  const [inlineComment, setInlineComment] = useState('');
  const [actionsOpen, setActionsOpen] = useState(false);
  const [repostOpen, setRepostOpen] = useState(false);
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
  const likes = post.recent_likes ?? [];
  const comments = post.recent_comments ?? [];
  const commentThreads = useMemo(() => buildCommentThreads(comments), [comments]);
  const hasComments = comments.length > 0;
  const cardClass = isMobile
    ? 'kc-qq-card kc-qq-post-card overflow-hidden p-0'
    : 'overflow-visible rounded-[22px] border px-5 py-5 shadow-[0_8px_24px_rgba(15,23,42,0.04)] [background:var(--kc-panel)] [border-color:var(--kc-border)] [color:var(--kc-text)]';
  const actionButtonClass = 'inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50';
  return (
    <article ref={(node) => onPostRef?.(post.id, node)} role={mobileListMode ? 'button' : undefined} tabIndex={mobileListMode ? 0 : undefined} onClick={mobileListMode ? () => onOpenPost(post.id) : undefined} onKeyDown={mobileListMode ? (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpenPost(post.id); } } : undefined} className={`${cardClass} scroll-mt-4 transition-shadow ${mobileListMode ? 'cursor-pointer' : ''} ${highlighted ? 'ring-2 ring-sky-300 ring-offset-2 ring-offset-transparent' : ''}`}>
      <div className={isMobile ? 'flex items-start gap-3 p-4' : 'flex items-start gap-4'}>
        <button type="button" onClick={(event) => { event.stopPropagation(); if (!disableAuthorProfileJump) onOpenUserSpace(post.author, post.author_id); }} className="group relative shrink-0 rounded-full">
          <Avatar user={post.author} size={isMobile ? 'md' : 'lg'} />
          {isMobile ? <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-[#34c759]" /> : null}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <button type="button" onClick={(event) => { event.stopPropagation(); if (!disableAuthorProfileJump) onOpenUserSpace(post.author, post.author_id); }} className={`${isMobile ? 'text-[17px] text-[#151922]' : 'text-base [color:var(--kc-text)]'} block max-w-full truncate text-left font-bold hover:[color:var(--kc-accent)]`}>{getDisplayName(post.author, `用户 ${post.author_id}`)}</button>
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
              ) : <span className={`${isMobile ? 'text-[#c0c5ce]' : '[color:var(--kc-muted)]'}`}><Icon name="more" className="h-5 w-5" /></span>}
            </div>
          </div>
          {post.author_id === currentUser.id && post.moderation_status !== 'approved' ? (
            <div className={`mt-4 rounded-2xl px-4 py-2 text-xs font-semibold ${isRejected ? 'bg-red-50 text-red-500' : 'bg-amber-50 text-amber-600'}`}>
              {moderationLabel(post.moderation_status)}{isPending ? '，当前仅自己可见，审核通过后其他用户才能看到和互动。' : '，这条动态不会对其他用户展示。'}
            </div>
          ) : null}
          {post.pinned_at ? <span className="mt-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold [background:var(--kc-accent-soft)] [color:var(--kc-accent)]"><Icon name="pin" className="h-3.5 w-3.5" />置顶</span> : null}
          {post.content ? <><p className={`${isMobile ? 'mt-4 text-[15px] leading-7 text-[#151922]' : 'mt-3 text-[15px] leading-7 [color:var(--kc-text)]'} select-text whitespace-pre-wrap break-words`}>{renderRichTextSafe(post.content, onOpenUserSpace, onSelectTopic, friendUsers)}</p><CcwCreationCards previews={post.ccw_creations} compact={isMobile} /></> : null}
          <PostImageGrid images={post.image_urls ?? []} onOpenImage={(images, index) => setImageViewer({ images, index })} />
          {post.repost_of_id ? <div onClick={(event) => event.stopPropagation()}><RepostPreviewCard post={post.repost_of} isMobile={isMobile} onOpenPost={onOpenPost} onOpenImage={(images, index) => setImageViewer({ images, index })} /></div> : null}
{post.like_count > 0 ? (
            <button type="button" onClick={(event) => { event.stopPropagation(); mobileListMode ? onOpenPost(post.id) : setLikesOpen(true); }} className={`${isMobile ? 'bg-[#f4f8ff] text-[#526070]' : '[background:var(--kc-panel-muted)] [color:var(--kc-muted)]'} mt-4 flex w-full items-start gap-2 rounded-2xl px-4 py-3 text-left text-sm leading-6 transition hover:[color:var(--kc-accent)]`}>
              <Icon name="like" className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{likeSummaryText(post)}</span>
            </button>
          ) : null}
          <div className={`${isMobile ? 'mt-4 flex items-center gap-1 border-t border-[#eef1f6] pt-3 text-[#8b95a5]' : 'mt-4 flex items-center gap-1 border-t pt-3 [border-color:var(--kc-border)] [color:var(--kc-muted)]'}`}>
            <button type="button" onClick={(event) => { event.stopPropagation(); likeMutation.mutate(); }} disabled={likeMutation.isPending || interactionDisabled} className={`${actionButtonClass} hover:text-rose-500 ${post.liked_by_me ? 'text-rose-500' : ''}`}>
              <Icon name="like" className="h-5 w-5" /> 点赞 {post.like_count || 0}
            </button>
            <button type="button" onClick={(event) => { event.stopPropagation(); (mobileListMode || forceDetailOnComment) ? onOpenPost(post.id) : setCommentsExpanded((value) => !value); }} disabled={isRejected} className={`${actionButtonClass} hover:[color:var(--kc-accent)] ${commentsExpanded ? '[color:var(--kc-accent)]' : ''}`}>
              <Icon name="message" className="h-5 w-5" /> 评论 {post.comment_count || 0}
            </button>
            <button type="button" onClick={(event) => { event.stopPropagation(); if (isMobile && mobileListMode && onOpenRepost) { onOpenRepost(post); } else { setRepostOpen(true); } }} disabled={interactionDisabled} className={`${actionButtonClass} hover:[color:var(--kc-accent)]`}>
              <Icon name="share" className="h-5 w-5" /> 分享
            </button>
          </div>
          {!mobileListMode ? (
          <div className={`grid transition-[grid-template-rows,opacity,margin] duration-300 ease-out ${commentsExpanded && !forceDetailOnComment ? 'mt-4 grid-rows-[1fr] opacity-100' : 'mt-0 grid-rows-[0fr] opacity-0'}`}>
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
          ) : null}
        </div>
      </div>
      {likesOpen ? <LikesModal post={post} isMobile={isMobile} onClose={() => setLikesOpen(false)} onOpenUserSpace={onOpenUserSpace} /> : null}
      {repostOpen && !(isMobile && mobileListMode && onOpenRepost) ? <RepostModal post={post} currentUser={currentUser} isMobile={isMobile} onClose={() => setRepostOpen(false)} /> : null}
      {imageViewer ? <ImageViewer viewer={imageViewer} mobile={isMobile} onClose={() => setImageViewer(null)} onNavigate={(index) => setImageViewer((current) => current ? { ...current, index } : current)} /> : null}
    </article>
  );
}

function MobileDetailCommentItem({ comment, post, currentUser, friendUsers, topicOptions, parentAuthorName, nested = false, onOpenUserSpace, onSelectTopic }: { comment: PostComment; post: Post; currentUser: User; friendUsers: User[]; topicOptions: PostTopic[]; parentAuthorName?: string; nested?: boolean; onOpenUserSpace: (user: User | null | undefined, fallbackId: number) => void; onSelectTopic?: (topic: string) => void }): JSX.Element {
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
      void queryClient.invalidateQueries({ queryKey: ['posts', 'comments', post.id] });
      void queryClient.invalidateQueries({ queryKey: ['posts', 'detail', post.id] });
      invalidatePosts(queryClient);
    }
  });

  return (
    <div className={`${nested ? 'ml-[46px] mt-2 rounded-[18px] bg-[#f6f8fc] px-3 py-2.5' : 'border-b border-[#eef1f6] px-4 py-4 last:border-b-0'} flex items-start gap-3`}>
      <button type="button" onClick={() => onOpenUserSpace(comment.author, comment.author_id)} className="shrink-0 rounded-full">
        <Avatar user={comment.author} size={nested ? 'sm' : 'md'} />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <button type="button" onClick={() => onOpenUserSpace(comment.author, comment.author_id)} className="max-w-full truncate text-left text-[14px] font-black text-[#151922]">{authorName}</button>
          {parentAuthorName ? <span className="min-w-0 truncate text-[12px] font-bold text-[#8b95a5]">回复 @{parentAuthorName}</span> : null}
          {comment.author_id === currentUser.id && comment.moderation_status === 'pending' ? <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-600">审核中</span> : null}
        </div>
        <p className="mt-1 select-text whitespace-pre-wrap break-words text-[14px] leading-6 text-[#151922]">{renderRichTextSafe(comment.content, onOpenUserSpace, onSelectTopic, friendUsers)}</p>
        <div className="mt-2 flex flex-wrap items-center gap-4 text-[12px] font-bold text-[#8b95a5]">
          <span>{formatTime(comment.created_at)}</span>
          <button type="button" onClick={() => likeMutation.mutate()} disabled={interactionsBlocked || likeMutation.isPending} className={`inline-flex items-center gap-1 disabled:opacity-50 ${comment.liked_by_me ? 'text-rose-500' : ''}`}><Icon name="like" className="h-3.5 w-3.5" />{comment.like_count || 0}</button>
          <button type="button" onClick={() => setReplyOpen((value) => !value)} disabled={interactionsBlocked} className="disabled:opacity-50">回复</button>
        </div>
        {replyOpen ? (
          <div className="mt-3 rounded-[18px] bg-[#f6f8fc] p-2">
            <div className="mb-2 flex items-center justify-between px-1 text-[12px] font-bold text-[#8b95a5]"><span>回复 @{authorName}</span><button type="button" onClick={() => { setReplyOpen(false); setReplyContent(''); }}>取消</button></div>
            <div className="flex min-w-0 items-center gap-2">
              <MentionTopicInput value={replyContent} onChange={setReplyContent} friends={friendUsers} topics={topicOptions} maxLength={500} disabled={interactionsBlocked} placeholder={`回复 ${authorName}...`} className="h-10 w-full min-w-0 rounded-[16px] border-0 bg-white px-3 text-[14px] font-semibold text-[#151922] outline-none placeholder:text-[#a4adba]" />
              <button type="button" onClick={() => replyMutation.mutate()} disabled={interactionsBlocked || !replyContent.trim() || replyMutation.isPending} className="shrink-0 rounded-[16px] bg-[#168bff] px-3 py-2 text-[13px] font-black text-white disabled:bg-slate-200 disabled:text-slate-400">发送</button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function MobileDetailCommentThread({ thread, post, currentUser, friendUsers, topicOptions, onOpenUserSpace, onSelectTopic }: { thread: CommentThreadData; post: Post; currentUser: User; friendUsers: User[]; topicOptions: PostTopic[]; onOpenUserSpace: (user: User | null | undefined, fallbackId: number) => void; onSelectTopic?: (topic: string) => void }): JSX.Element {
  return (
    <div>
      <MobileDetailCommentItem comment={thread.root} post={post} currentUser={currentUser} friendUsers={friendUsers} topicOptions={topicOptions} onOpenUserSpace={onOpenUserSpace} onSelectTopic={onSelectTopic} />
      {thread.replies.map((reply) => <MobileDetailCommentItem key={reply.id} comment={reply} post={post} currentUser={currentUser} friendUsers={friendUsers} topicOptions={topicOptions} parentAuthorName={reply.parent_id ? getDisplayName(reply.parent_author, `评论 ${reply.parent_id}`) : undefined} nested onOpenUserSpace={onOpenUserSpace} onSelectTopic={onSelectTopic} />)}
    </div>
  );
}

export interface MobilePostDetailPageProps {
  post?: Post | null;
  postId?: number | null;
  currentUser: User;
  friendUsers: User[];
  topicOptions: PostTopic[];
  isMobile: boolean;
  onClose: () => void;
  onOpenUserSpace: (user: User | null | undefined, fallbackId: number) => void;
  onOpenPost: (postId: number) => void;
  onEditPost?: (post: Post) => void;
  transitionStyle?: CSSProperties;
}

export function MobilePostDetailPage({ post, postId, currentUser, friendUsers, topicOptions, isMobile, onClose, onOpenUserSpace, onOpenPost, onEditPost, transitionStyle }: MobilePostDetailPageProps): JSX.Element {
  const targetPostId = post?.id ?? postId ?? null;
  const detailQuery = useQuery({ queryKey: ['posts', 'detail', targetPostId], queryFn: () => getPost(targetPostId ?? 0), initialData: post ?? undefined, enabled: Boolean(targetPostId) });
  const commentsQuery = useQuery({ queryKey: ['posts', 'comments', targetPostId], queryFn: () => getPostComments(targetPostId ?? 0), enabled: Boolean(targetPostId) });
  const detailPost = detailQuery.data ?? post;
  const [imageViewer, setImageViewer] = useState<ImageViewerState | null>(null);
  const [likesOpen, setLikesOpen] = useState(false);
  const [repostOpen, setRepostOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [comment, setComment] = useState('');
  const queryClient = useQueryClient();
  const comments = commentsQuery.data ?? detailPost?.recent_comments ?? [];
  const commentThreads = useMemo(() => buildCommentThreads(comments), [comments]);
  const interactionDisabled = detailPost?.moderation_status !== 'approved';
  const likeMutation = useMutation({ mutationFn: () => togglePostLike(detailPost?.id ?? 0), onSuccess: () => { if (detailPost?.id) void queryClient.invalidateQueries({ queryKey: ['posts', 'detail', detailPost.id] }); invalidatePosts(queryClient); } });
  const commentMutation = useMutation({
    mutationFn: () => createPostComment(detailPost?.id ?? 0, { content: legacyMentionToPlain(comment), parent_id: null, mention_user_ids: extractMentionUserIds(comment, friendUsers) }),
    onSuccess: () => {
      setComment('');
      if (detailPost?.id) {
        void queryClient.invalidateQueries({ queryKey: ['posts', 'comments', detailPost.id] });
        void queryClient.invalidateQueries({ queryKey: ['posts', 'detail', detailPost.id] });
      }
      invalidatePosts(queryClient);
    }
  });
  const deleteMutation = useMutation({ mutationFn: () => deletePost(detailPost?.id ?? 0), onSuccess: () => { invalidatePosts(queryClient); onClose(); } });
  const pinMutation = useMutation({ mutationFn: () => detailPost?.pinned_at ? unpinPost(detailPost.id) : pinPost(detailPost?.id ?? 0), onSuccess: () => { if (detailPost?.id) void queryClient.invalidateQueries({ queryKey: ['posts', 'detail', detailPost.id] }); invalidatePosts(queryClient); } });
  const reportMutation = useMutation({ mutationFn: (payload: CreateReportPayload) => createReport(payload), onSuccess: () => setReportOpen(false) });

  useEffect(() => {
    if (!isMobile) {
      return undefined;
    }
    return registerNativeBackHandler(() => {
      onClose();
      return true;
    }, 185);
  }, [isMobile, onClose]);

  if (!detailPost) {
    return (
      <section className="kc-space-secondary-page kc-native-keyboard-page fixed inset-0 z-[2147483646] flex min-h-0 w-screen max-w-[100vw] flex-col overflow-hidden [background:var(--kc-mobile-bg)] [color:var(--kc-mobile-text)]">
        <header className="flex min-h-[calc(max(44px,env(safe-area-inset-top))+58px)] shrink-0 items-end justify-between gap-3 px-4 pb-3 pt-[max(44px,env(safe-area-inset-top))] [background:var(--kc-mobile-bg)]">
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full bg-[#f4f6fa] text-[#526070]" aria-label="返回"><Icon name="chevronLeft" className="h-5 w-5" /></button>
          <h2 className="min-w-0 flex-1 truncate text-center text-[17px] font-black text-[#151922]">动态详情</h2>
          <span className="h-9 w-9 shrink-0" />
        </header>
        <main className="grid min-h-0 flex-1 place-items-center px-6 text-center"><div className="grid gap-3"><span className="mx-auto h-12 w-12 animate-pulse rounded-2xl bg-white" /><p className="text-[14px] font-bold text-[#8b95a5]">正在打开动态...</p></div></main>
      </section>
    );
  }

  return (
    <section className="kc-space-secondary-page kc-native-keyboard-page fixed inset-0 z-[2147483646] flex min-h-0 w-screen max-w-[100vw] flex-col overflow-hidden [background:var(--kc-mobile-bg)] [color:var(--kc-mobile-text)]" style={transitionStyle}>
      <header className="flex min-h-[calc(max(44px,env(safe-area-inset-top))+58px)] shrink-0 items-end justify-between gap-3 px-4 pb-3 pt-[max(44px,env(safe-area-inset-top))] [background:var(--kc-mobile-bg)]">
        <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full bg-[#f4f6fa] text-[#526070]" aria-label="返回空间"><Icon name="chevronLeft" className="h-5 w-5" /></button>
        <div className="min-w-0 text-center">
          <h2 className="text-[17px] font-black text-[#151922]">动态详情</h2>
        </div>
        {detailPost.author_id === currentUser.id ? (
          <div className="relative">
            <button type="button" onClick={() => setActionsOpen((open) => !open)} className="grid h-9 w-9 place-items-center rounded-full bg-[#f4f6fa] text-[#526070]" aria-label="更多动态操作"><Icon name="more" className="h-5 w-5" /></button>
            {actionsOpen ? <div className="absolute right-0 top-10 z-20 w-36 overflow-hidden rounded-2xl bg-white p-1 shadow-[0_18px_40px_rgba(15,23,42,0.16)]"><button type="button" onClick={() => { setActionsOpen(false); onEditPost?.(detailPost); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-bold text-[#151922]"><Icon name="edit" className="h-4 w-4" />编辑</button><button type="button" onClick={() => { setActionsOpen(false); pinMutation.mutate(); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-bold text-[#151922]"><Icon name="pin" className="h-4 w-4" />{detailPost.pinned_at ? '取消置顶' : '置顶'}</button><button type="button" onClick={() => { setActionsOpen(false); if (window.confirm('确定要删除这条动态吗？')) deleteMutation.mutate(); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-bold text-red-500"><Icon name="trash" className="h-4 w-4" />删除</button></div> : null}
          </div>
        ) : (
          <div className="relative">
            <button type="button" onClick={() => setActionsOpen((open) => !open)} className="grid h-9 w-9 place-items-center rounded-full bg-[#f4f6fa] text-[#526070]" aria-label="更多动态操作"><Icon name="more" className="h-5 w-5" /></button>
            {actionsOpen ? <div className="absolute right-0 top-10 z-20 w-36 overflow-hidden rounded-2xl bg-white p-1 shadow-[0_18px_40px_rgba(15,23,42,0.16)]"><button type="button" onClick={() => { setActionsOpen(false); setReportOpen(true); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-bold text-red-500"><Icon name="flag" className="h-4 w-4" />举报动态</button></div> : null}
          </div>
        )}
      </header>
      <main className="kc-post-detail-scroll kc-qq-scroll scroll-soft min-h-0 flex-1 overflow-y-auto">
        {detailQuery.isFetching ? <p className="mx-4 my-3 rounded-2xl bg-[#f4f6fa] px-4 py-2 text-center text-[12px] font-bold text-[#8b95a5]">正在同步动态...</p> : null}
        <article className="bg-white px-4 pb-5 pt-3">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => onOpenUserSpace(detailPost.author, detailPost.author_id)} className="shrink-0 rounded-full"><Avatar user={detailPost.author} size="lg" /></button>
            <div className="min-w-0 flex-1">
              <button type="button" onClick={() => onOpenUserSpace(detailPost.author, detailPost.author_id)} className="block max-w-full truncate text-left text-[17px] font-black text-[#151922]">{getDisplayName(detailPost.author, `用户 ${detailPost.author_id}`)}</button>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] font-semibold text-[#8b95a5]"><span>{formatTime(detailPost.created_at)}</span><span className="h-1 w-1 rounded-full bg-current opacity-40" /><span>{visibilityLabel(detailPost.visibility)}</span>{detailPost.pinned_at ? <span className="rounded-full bg-[#eaf4ff] px-2 py-0.5 text-[#168bff]">置顶</span> : null}</div>
            </div>
          </div>
          {detailPost.moderation_status !== 'approved' ? <p className="mt-4 rounded-2xl bg-amber-50 px-3 py-2 text-[12px] font-bold text-amber-600">{moderationLabel(detailPost.moderation_status)}</p> : null}
          {detailPost.content ? <><p className="mt-5 select-text whitespace-pre-wrap break-words text-[17px] leading-8 text-[#151922]">{renderRichTextSafe(detailPost.content, onOpenUserSpace, undefined, friendUsers)}</p><CcwCreationCards previews={detailPost.ccw_creations} compact /></> : null}
          <PostImageGrid images={detailPost.image_urls ?? []} onOpenImage={(images, index) => setImageViewer({ images, index })} />
          {detailPost.repost_of_id ? <RepostPreviewCard post={detailPost.repost_of} isMobile onOpenPost={onOpenPost} onOpenImage={(images, index) => setImageViewer({ images, index })} /> : null}
          {detailPost.like_count > 0 ? <button type="button" onClick={() => setLikesOpen(true)} className="mt-5 flex w-full items-start gap-2 rounded-[18px] bg-[#f6f8fc] px-4 py-3 text-left text-[13px] font-bold leading-6 text-[#526070]"><Icon name="like" className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" /><span>{likeSummaryText(detailPost)}</span></button> : null}
          <div className="mt-5 grid grid-cols-3 rounded-[22px] bg-[#f6f8fc] p-1 text-[13px] font-black text-[#526070]">
            <button type="button" onClick={() => likeMutation.mutate()} disabled={likeMutation.isPending || interactionDisabled} className={`flex h-10 items-center justify-center gap-1.5 rounded-[18px] ${detailPost.liked_by_me ? 'text-rose-500' : ''} disabled:opacity-50`}><Icon name="like" className="h-4 w-4" />赞 {detailPost.like_count || 0}</button>
            <span className="flex h-10 items-center justify-center gap-1.5 rounded-[18px] text-[#168bff]"><Icon name="message" className="h-4 w-4" />评论 {comments.length || detailPost.comment_count || 0}</span>
            <button type="button" onClick={() => setRepostOpen(true)} disabled={interactionDisabled} className="flex h-10 items-center justify-center gap-1.5 rounded-[18px] disabled:opacity-50"><Icon name="share" className="h-4 w-4" />分享</button>
          </div>
        </article>
        <section className="border-t-[8px] border-[#f2f4f8] bg-white pb-[calc(var(--kc-native-safe-bottom,env(safe-area-inset-bottom))+20px)]">
          <div className="sticky top-0 z-10 flex min-h-[52px] items-center justify-between bg-white px-4 py-4">
            <h3 className="text-[17px] font-black text-[#151922]">全部评论</h3>
            <span className="text-[12px] font-bold text-[#8b95a5]">{comments.length || detailPost.comment_count || 0} 条</span>
          </div>
          <div className="px-4 pb-4 pt-1">
            <div className="kc-native-composer flex min-w-0 items-center gap-2 rounded-[22px] bg-[#f6f8fc] p-2">
              <Avatar user={currentUser} size="sm" />
              <MentionTopicInput value={comment} onChange={setComment} friends={friendUsers} topics={topicOptions} disabled={interactionDisabled} maxLength={500} placeholder={interactionDisabled ? '动态审核通过后才能评论' : '写下你的评论...'} className="h-10 w-full min-w-0 rounded-[16px] border-0 bg-white px-3 text-[14px] font-semibold text-[#151922] outline-none placeholder:text-[#a4adba]" />
              <button type="button" onClick={() => commentMutation.mutate()} disabled={interactionDisabled || !comment.trim() || commentMutation.isPending} className="shrink-0 rounded-[16px] bg-[#168bff] px-3 py-2 text-[13px] font-black text-white disabled:bg-slate-200 disabled:text-slate-400">发送</button>
            </div>
          </div>
          {commentsQuery.isLoading ? <p className="px-4 py-5 text-center text-[13px] font-bold text-[#8b95a5]">正在加载评论...</p> : null}
          {!commentsQuery.isLoading && commentThreads.length === 0 ? <p className="px-4 py-8 text-center text-[13px] font-bold text-[#8b95a5]">还没有评论，来抢沙发</p> : null}
          {commentThreads.map((thread) => <MobileDetailCommentThread key={thread.root.id} thread={thread} post={detailPost} currentUser={currentUser} friendUsers={friendUsers} topicOptions={topicOptions} onOpenUserSpace={onOpenUserSpace} />)}
        </section>
      </main>
      {likesOpen ? <LikesModal post={detailPost} isMobile onClose={() => setLikesOpen(false)} onOpenUserSpace={onOpenUserSpace} /> : null}
      {repostOpen ? <RepostModal post={detailPost} currentUser={currentUser} isMobile onClose={() => setRepostOpen(false)} /> : null}
      {reportOpen ? <ReportModal targetType="post" targetId={detailPost.id} targetLabel={`动态：${detailPost.content.trim().slice(0, 48) || `#${detailPost.id}`}`} reportedUserId={detailPost.author_id} isPending={reportMutation.isPending} error={reportMutation.error} onSubmit={(payload) => reportMutation.mutate(payload)} onClose={() => setReportOpen(false)} /> : null}
      {imageViewer ? <ImageViewer viewer={imageViewer} mobile onClose={() => setImageViewer(null)} onNavigate={(index) => setImageViewer((current) => current ? { ...current, index } : current)} /> : null}
    </section>
  );
}
