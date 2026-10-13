import { type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getAllBookmarkedMessages } from '@/api/messages';
import { getPost } from '@/api/posts';
import { useKukeStore } from '@/store/kukeStore';
import type { CcwCreationPreview, Conversation, Message, Post, PostComment, PostLike, PostTopic, User } from '@/types/api';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { CcwCreationCard } from '@/components/ui/CcwCreationCard';
import { ImageViewer, type ImageViewerState } from '@/components/ui/ImageViewer';
import { MobilePostDetailPage } from '@/components/posts/MobilePostDetailPage';
import { CcwCreatorsPage } from '@/components/posts/CcwCreatorsPage';
import { PostsDesktop } from '@/components/posts/desktop/PostsDesktop';
import { FavoritesPanel } from '@/components/chat/message/FavoritesPanel';
import { MobileStatusBar } from '@/components/mobile/MobileChrome';
import { ReportModal } from '@/components/chat/ReportModal';
import { resolveAssetUrl, resolveThumbnailUrl } from '@/utils/assetUrl';
import { openExternalUrl } from '@/utils/openExternalUrl';
import { registerNativeBackHandler } from '@/native/back';
import { runNativeRouteTransition } from '@/native/transition';
import { getMobileFeatureDefinition, getMobileSpaceFeatureIds, type MobileFeatureId } from '@/mobile/features';
import { useHiddenMobileFeatures } from '@/components/shop/data';
import { type CommentThreadData, MAX_IMAGES, type OpenUserSpace, POST_IMAGE_ACCEPT, type RepostTarget, buildCommentThreads, feedSortTabs, feedTabs, formatCompact, formatTime, hasActiveTextSelection, likeSummaryText, moderationLabel, notificationText, tokenizePostText, userHandle, visibilityLabel, visibilityOptions } from './postModel';
import { useCreatePostComment, useFriendUsers, usePostActions, usePostFeedState, usePostLikes, usePostNotificationActions, usePostNotifications, useReportMutation, useTogglePostCommentLike, useTrendingPostTopics, useUserPostStats } from './postQueries';
import { type SuggestionRect, placeSuggestions, useConversationPicker, useMentionInput, usePostComposer, useRepostForm, useUserCardShare } from './postForms';
import { type ProfileLayout, profileAccentPresets, profileCardStyleOptions, profileLayoutOptions, useUserSpace } from './userSpaceData';

/*
 * 动态页。桌面布局在 desktop/ 下另写了一套，这个文件里从 MobilePostsPanel 往上全是移动端的界面。
 * 两端共用的东西不在这里：纯逻辑在 postModel.ts，请求和缓存在 postQueries.ts，
 * 表单状态在 postForms.ts，个人空间的数据在 userSpaceData.ts。
 */

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

function getKukePortalRoot(): Element {
  const host = document.getElementById('kukechat-shadow-host');
  return host?.shadowRoot?.querySelector('.kc-window-frame:not(.kc-window-minimized)') ?? document.querySelector('.kc-window-frame:not(.kc-window-minimized)') ?? host?.shadowRoot?.getElementById('kukechat-root') ?? document.getElementById('kukechat-root') ?? document.body;
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

/** 选一个群聊或私聊。转发动态、发送名片都用它。 */
function ConversationPicker({ picker }: { picker: ReturnType<typeof useConversationPicker> }): JSX.Element {
  return (
    <div className="mt-3 rounded-[22px] bg-[#f4f6fa] p-3">
      <label className="flex h-10 items-center gap-2 rounded-[16px] bg-white px-3">
        <Icon name="search" className="h-4 w-4 shrink-0 [color:var(--kc-muted)]" />
        <input value={picker.query} onChange={(event) => picker.setQuery(event.target.value)} placeholder="搜索群聊或私聊" className="min-w-0 flex-1 border-0 bg-transparent text-[14px] font-semibold text-[#151922] outline-none placeholder:text-[#a4adba]" />
      </label>
      <div className="scroll-soft mt-2 grid max-h-52 gap-1 overflow-y-auto">
        {picker.isLoading ? <p className="px-3 py-2 text-sm [color:var(--kc-muted)]">正在加载会话...</p> : null}
        {!picker.isLoading && picker.items.length === 0 ? <p className="px-3 py-2 text-sm [color:var(--kc-muted)]">没有找到匹配会话</p> : null}
        {picker.items.map(({ conversation, title }) => {
          const active = picker.targetId === conversation.id;
          return (
            <button key={conversation.id} type="button" onClick={() => picker.setTargetId(conversation.id)} className={`rounded-[18px] bg-white px-3 py-2.5 flex items-center gap-3 text-left transition ${active ? '[background:var(--kc-active)] ring-2 ring-sky-100' : ''}`}>
              <ConversationShareAvatar conversation={conversation} title={title} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-bold text-[#151922]">{title}</span>
                <span className="mt-0.5 block truncate text-xs [color:var(--kc-muted)]">{conversation.type === 'group' ? `群聊 · ${conversation.member_count ?? 0} 人` : '私聊'}</span>
              </span>
              {active ? <Icon name="check" className="h-4 w-4 shrink-0 [color:var(--kc-accent)]" /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function UserShareTargetModal({ user, currentUser, onClose }: { user: User; currentUser: User; onClose: () => void }): JSX.Element {
  const { note, setNote, error, picker, isPending, canSubmit, submit } = useUserCardShare({ user, currentUser, onClose });

  useEffect(() => {
    return registerNativeBackHandler(() => {
      onClose();
      return true;
    }, 178);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[2147483646] [background:var(--kc-mobile-bg,#f1f3f8)]">
      <section className="kc-qq-page flex h-full min-h-0 flex-col overflow-hidden text-[#111827]">
        <MobileStatusBar />
        <header className="kc-qq-nav-header shrink-0">
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full bg-white text-[#526070]" aria-label="关闭分享"><Icon name="close" className="h-5 w-5" /></button>
          <div className="min-w-0 text-center"><h2 className="text-[17px] font-bold text-[#151922]">发送个人名片</h2><p className="text-[11px] font-semibold text-[#8b95a5]">选择一个群聊或好友</p></div>
          <button type="button" onClick={submit} disabled={!canSubmit} className="rounded-full bg-[#168bff] px-4 py-2 text-[13px] font-bold text-white shadow-[0_8px_18px_rgba(22,139,255,0.2)] disabled:opacity-50">{isPending ? '发送中' : '发送'}</button>
        </header>
        <div className="kc-qq-scroll scroll-soft min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(var(--kc-mobile-bottom-nav-space)+24px)] pt-3">
          <section className="kc-qq-card p-4">
            <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={120} placeholder="可选，给名片加一句附言..." className="min-h-[92px] w-full resize-none rounded-[22px] border-0 bg-[#f4f6fa] px-4 py-3 text-[15px] font-medium leading-7 text-[#151922] outline-none placeholder:text-[#a4adba] focus:ring-2 focus:ring-sky-100" />
            <ConversationPicker picker={picker} />
            <div className="mt-3 rounded-[22px] bg-[#f4f6fa] p-4">
              <div className="flex items-center gap-3">
                <Avatar user={user} size="md" />
                <span className="min-w-0 flex-1"><span className="block truncate text-[15px] font-black text-[#151922]">{getDisplayName(user, `用户 ${user.id}`)}</span><span className="mt-0.5 block truncate text-xs [color:var(--kc-muted)]">个人名片 · {user.profile_title?.trim() || user.username || `ID ${user.id}`}</span></span>
              </div>
              <p className="mt-3 line-clamp-2 text-[13px] font-semibold leading-5 text-[#8b95a5]">{user.profile_tagline?.trim() || user.bio?.trim() || '点击名片即可进入个人主页'}</p>
            </div>
            {picker.selectedTitle ? <p className="mt-3 rounded-2xl bg-[#eef7ff] px-3 py-2 text-[12px] font-bold text-[#168bff]">发送给：{picker.selectedTitle}</p> : null}
            {error ? <p className="mt-3 rounded-2xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-500">{error}</p> : null}
          </section>
        </div>
      </section>
    </div>,
    getKukePortalRoot()
  );
}

function MentionTopicInput({ value, onChange, onPaste, friends, topics, multiline = false, disabled = false, maxLength, placeholder, className, suggestionLayerRef }: { value: string; onChange: (value: string) => void; onPaste?: (event: React.ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void; friends: User[]; topics: PostTopic[]; multiline?: boolean; disabled?: boolean; maxLength: number; placeholder: string; className: string; suggestionLayerRef?: React.RefObject<HTMLElement | null> }): JSX.Element {
  const [suggestionRect, setSuggestionRect] = useState<SuggestionRect | null>(null);
  const { inputRef, fieldProps, focused, trigger, query, friendMatches, topicMatches, exactTopicExists, topicSearchPending, chooseMention, chooseTopic } = useMentionInput({ value, onChange, friends, topics, onFocus: () => window.setTimeout(updateSuggestionRect, 0) });

  function updateSuggestionRect(): void {
    const layer = suggestionLayerRef?.current;
    const input = inputRef.current;
    setSuggestionRect(layer && input ? placeSuggestions(input, layer) : null);
  }

  const commonProps = { ...fieldProps, onPaste, disabled, maxLength, placeholder, className };

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

function renderRichTextSafe(content: string, onOpenUserSpace: OpenUserSpace, onSelectTopic?: (topic: string) => void, mentionUsers: User[] = [], interactive = true): ReactNode[] {
  if (!interactive) {
    return [content];
  }
  return tokenizePostText(content, mentionUsers).map((token, index) => {
    if (token.type === 'text') {
      return token.text;
    }
    if (token.type === 'url') {
      return <a key={index} href={token.url} target="_blank" rel="noreferrer" className="font-bold [color:var(--kc-accent)] hover:underline [overflow-wrap:anywhere]">{token.url}</a>;
    }
    if (token.type === 'topic') {
      return <button key={index} type="button" onClick={() => onSelectTopic?.(token.name)} className="font-bold [color:var(--kc-accent)] hover:underline">#{token.name}</button>;
    }
    return (
      <button key={index} type="button" onClick={() => {
        if (token.user) {
          onOpenUserSpace(token.user, token.user.id);
        } else if (token.userId !== undefined) {
          onOpenUserSpace(null, token.userId);
        }
      }} className="inline-flex rounded-md px-1 font-bold [background:var(--kc-accent-soft)] [color:var(--kc-accent)] hover:underline">@{token.name}</button>
    );
  });
}

function CcwCreationCards({ previews = [], compact = false }: { previews?: CcwCreationPreview[]; compact?: boolean }): JSX.Element | null {
  if (previews.length === 0) {
    return null;
  }
  return <div className="space-y-2">{previews.map((preview) => <CcwCreationCard key={`${preview.oid}:${preview.access_key ?? ''}`} oid={preview.oid} accessKey={preview.access_key ?? undefined} preview={preview} compact={compact} />)}</div>;
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

function profileCoverClasses(layout: ProfileLayout): string {
  if (layout === 'banner') {
    return 'min-h-[310px] rounded-b-[34px] px-4 pb-6 pt-3';
  }
  if (layout === 'compact') {
    return 'min-h-[184px] rounded-b-[24px] px-4 pb-4 pt-3';
  }
  return 'min-h-[246px] rounded-b-[30px] px-4 pb-5 pt-3';
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

function RepostPreviewCard({ post, onOpenPost, onOpenImage }: { post: RepostTarget | null | undefined; onOpenPost: (postId: number) => void; onOpenImage?: (images: string[], index: number) => void }): JSX.Element {
  if (!post) {
    return (
      <div className="bg-[#f4f6fa] text-[#8b95a5] mt-4 rounded-[20px] px-4 py-5 text-sm font-semibold">
        原动态不可见或已删除
      </div>
    );
  }
  return (
    <div role="button" tabIndex={0} onClick={() => { if (!hasActiveTextSelection()) { onOpenPost(post.id); } }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpenPost(post.id); } }} className="bg-[#f4f6fa] text-[#151922] mt-4 block w-full cursor-pointer select-text rounded-[20px] p-3 text-left transition hover:ring-2 hover:ring-sky-100">
      <div className="flex min-w-0 items-center gap-2 text-sm font-bold">
        <Avatar user={post.author} size="sm" />
        <span className="truncate">{getDisplayName(post.author, `用户 ${post.author_id}`)}</span>
        <span className="shrink-0 text-xs font-semibold [color:var(--kc-muted)]">{formatTime(post.created_at)}</span>
      </div>
      {post.content ? <><p className="text-[#151922] mt-2 line-clamp-4 select-text whitespace-pre-wrap break-words text-sm leading-6">{post.content}</p><CcwCreationCards previews={post.ccw_creations} compact /></> : null}
      <PostImageGrid images={post.image_urls ?? []} onOpenImage={onOpenImage ?? (() => undefined)} />
    </div>
  );
}


function RepostModal({ post, currentUser, onClose }: { post: Post; currentUser: User; onClose: () => void }): JSX.Element {
  const { content, setContent, visibility, setVisibility, mode, setMode, error, picker, previewPost, isPending, canSubmit, submit } = useRepostForm({ post, currentUser, onClose });
  const [imageViewer, setImageViewer] = useState<ImageViewerState | null>(null);

  useEffect(() => {
    return registerNativeBackHandler(() => {
      onClose();
      return true;
    }, 175);
  }, [onClose]);

  const modeTabs = (
    <div className="mb-3 grid grid-cols-2 gap-2">
      <button type="button" onClick={() => setMode('zone')} className={`rounded-[18px] py-2 text-[13px] font-bold transition ${mode === 'zone' ? 'bg-[#168bff] text-white [background:var(--kc-accent)]' : 'bg-[#f4f6fa] text-[#8b95a5]'}`}>转发到动态</button>
      <button type="button" onClick={() => setMode('chat')} className={`rounded-[18px] py-2 text-[13px] font-bold transition ${mode === 'chat' ? 'bg-[#168bff] text-white [background:var(--kc-accent)]' : 'bg-[#f4f6fa] text-[#8b95a5]'}`}>发送到聊天</button>
    </div>
  );

  return createPortal(
    <div className="fixed inset-0 z-[2147483646] [background:var(--kc-mobile-bg,#f1f3f8)]">
      <section className="kc-qq-page flex h-full min-h-0 flex-col overflow-hidden text-[#111827]">
        <header className="kc-qq-nav-header kc-qq-nav-header-mobile-safe shrink-0">
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full bg-white text-[#526070]" aria-label="关闭转发"><Icon name="close" className="h-5 w-5" /></button>
          <div className="min-w-0 text-center">
            <h2 className="text-[17px] font-bold text-[#151922]">转发动态</h2>
            <p className="text-[11px] font-semibold text-[#8b95a5]">转发到动态或聊天</p>
          </div>
          <button type="button" onClick={submit} disabled={!canSubmit} className="rounded-full bg-[#168bff] px-4 py-2 text-[13px] font-bold text-white shadow-[0_8px_18px_rgba(22,139,255,0.2)] disabled:opacity-50">
            {isPending ? '转发中' : '转发'}
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
              {visibilityOptions.map((item) => (
                <button key={item} type="button" onClick={() => setVisibility(item)} className={`rounded-full px-3 py-2 text-[12px] font-bold transition ${visibility === item ? 'bg-[#168bff] text-white shadow-[0_8px_18px_rgba(22,139,255,0.18)]' : 'bg-[#f4f6fa] text-[#8b95a5]'}`}>
                  {visibilityLabel(item)}
                </button>
              ))}
            </div> : null}
            {mode === 'chat' ? <ConversationPicker picker={picker} /> : null}
            <RepostPreviewCard post={previewPost} onOpenPost={() => undefined} onOpenImage={(images, index) => setImageViewer({ images, index })} />
            {error ? <p className="mt-3 rounded-2xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-500">{error}</p> : null}
          </section>
        </div>
      </section>
      {imageViewer ? <ImageViewer viewer={imageViewer} mobile onClose={() => setImageViewer(null)} onNavigate={(index) => setImageViewer((current) => current ? { ...current, index } : current)} /> : null}
    </div>,
    getKukePortalRoot()
  );
}

function ComposerModal({ currentUser, editingPost, onClose, transitionStyle }: { currentUser: User; editingPost?: Post | null; onClose: () => void; transitionStyle?: CSSProperties }): JSX.Element {
  const { isEditing, title, content, setContent, visibility, setVisibility, images, existingImageUrls, imageCount, error, friendUsers, topicOptions, isPending, canAddImage, canSubmit, submit, removeImage, removeExistingImage, handlePaste, handleFileInput } = usePostComposer({ currentUser, editingPost, onClose });
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const suggestionLayerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return registerNativeBackHandler(() => {
      onClose();
      return true;
    }, 170);
  }, [onClose]);

  return createPortal(
    <div className="kc-space-secondary-page pointer-events-auto fixed inset-0 z-[2147483646] [background:var(--kc-mobile-bg,#f1f3f8)]" style={transitionStyle}>
      <section onMouseDown={(event) => event.stopPropagation()} className="kc-qq-page flex h-full min-h-0 flex-col overflow-hidden text-[#111827]">
        <header className="kc-qq-nav-header kc-qq-nav-header-mobile-safe shrink-0">
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full bg-white text-[#526070]" aria-label="关闭发布动态">
            <Icon name="close" className="h-5 w-5" />
          </button>
          <div className="min-w-0 text-center">
            <h2 className="text-[17px] font-bold text-[#151922]">{title}</h2>
            <p className="text-[11px] font-semibold text-[#8b95a5]">支持 #话题 和 @好友</p>
          </div>
          <button type="button" onClick={submit} disabled={!canSubmit} className="rounded-full bg-[#168bff] px-4 py-2 text-[13px] font-bold text-white shadow-[0_8px_18px_rgba(22,139,255,0.2)] disabled:opacity-50">
            {isPending ? (isEditing ? '保存中' : '发布中') : (isEditing ? '保存' : '发布')}
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
              {visibilityOptions.map((item) => (
                <button key={item} type="button" onClick={() => setVisibility(item)} className={`rounded-full px-3 py-2 text-[12px] font-bold transition ${visibility === item ? 'bg-[#168bff] text-white shadow-[0_8px_18px_rgba(22,139,255,0.18)]' : 'bg-[#f4f6fa] text-[#8b95a5]'}`}>
                  {visibilityLabel(item)}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={!canAddImage} className="mt-3 flex w-full min-h-12 items-center justify-center gap-2 rounded-[20px] bg-[#eaf4ff] px-4 py-3 text-[14px] font-bold text-[#168bff] shadow-sm disabled:opacity-50">
              <Icon name="image" className="h-5 w-5" /> 添加图片 {imageCount}/{MAX_IMAGES}
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
            <input ref={fileInputRef} type="file" accept={POST_IMAGE_ACCEPT} multiple className="hidden" onChange={handleFileInput} />
            {error ? <p className="mt-3 rounded-2xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-500">{error}</p> : null}
          </section>
        </div>
      </section>
      <div ref={suggestionLayerRef} className="pointer-events-none absolute inset-0 z-[2147483647]" />
    </div>,
    getKukePortalRoot()
  );
}

function LikesModal({ post, onClose, onOpenUserSpace }: { post: Post; onClose: () => void; onOpenUserSpace: OpenUserSpace }): JSX.Element {
  const likes = usePostLikes(post.id).data ?? [];

  useEffect(() => {
    return registerNativeBackHandler(() => {
      onClose();
      return true;
    }, 180);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[2147483646] [background:var(--kc-mobile-bg,#f1f3f8)]">
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
    </div>,
    getKukePortalRoot()
  );
}

function NotificationsModal({ onClose, onOpenPost, onOpenUserSpace, transitionStyle }: { onClose: () => void; onOpenPost: (postId: number) => void; onOpenUserSpace: OpenUserSpace; transitionStyle?: CSSProperties }): JSX.Element {
  const notificationsQuery = usePostNotifications(50);
  const { readAll: readAllMutation, readOne: readOneMutation } = usePostNotificationActions();
  const notifications = notificationsQuery.data?.items ?? [];

  useEffect(() => {
    return registerNativeBackHandler(() => {
      onClose();
      return true;
    }, 185);
  }, [onClose]);

  return (
    <div className="kc-space-secondary-page fixed inset-0 z-[2147483646] [background:var(--kc-mobile-bg,#f1f3f8)]" style={transitionStyle}>
      <section onMouseDown={(event) => event.stopPropagation()} className="h-full rounded-none flex flex-col overflow-hidden [background:var(--kc-panel)] [color:var(--kc-text)]">
        <header className="flex items-center justify-between border-b px-5 py-4 [border-color:var(--kc-border)] pt-[max(18px,env(safe-area-inset-top))]">
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


function CommentItem({ comment, post, currentUser, friendUsers, topicOptions, parentAuthorName, nested = false, withDivider = true, showDelete = false, onReplyCreated, onDelete, onOpenUserSpace, onSelectTopic }: { comment: PostComment; post: Post; currentUser: User; friendUsers: User[]; topicOptions: PostTopic[]; parentAuthorName?: string; nested?: boolean; withDivider?: boolean; showDelete?: boolean; onReplyCreated?: () => void; onDelete?: (commentId: number) => void; onOpenUserSpace: OpenUserSpace; onSelectTopic?: (topic: string) => void }): JSX.Element {
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyContent, setReplyContent] = useState('');
  const interactionsBlocked = post.moderation_status !== 'approved' || comment.moderation_status !== 'approved';
  const authorName = getDisplayName(comment.author, `用户 ${comment.author_id}`);
  const likeMutation = useTogglePostCommentLike(post.id, comment.id);
  const replyMutation = useCreatePostComment(post.id, friendUsers);

  function sendReply(): void {
    replyMutation.mutate({ content: replyContent, parentId: comment.id }, {
      onSuccess: () => {
        setReplyContent('');
        setReplyOpen(false);
        onReplyCreated?.();
      }
    });
  }

  return (
    <div className={`${nested ? 'py-2' : `${withDivider ? 'border-b border-slate-100 last:border-b-0' : ''} px-0 py-4`} flex items-start gap-3`}>
      <button type="button" onClick={() => onOpenUserSpace(comment.author, comment.author_id)} className={`${nested ? 'mt-1' : 'mt-0.5'} shrink-0 rounded-full`}>
        <Avatar user={comment.author} size={nested ? 'sm' : 'md'} />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <button type="button" onClick={() => onOpenUserSpace(comment.author, comment.author_id)} className={`text-[#151922] max-w-full truncate text-left ${nested ? 'text-[13px]' : 'text-sm'} font-bold hover:[color:var(--kc-accent)]`}>{authorName}</button>
          {parentAuthorName ? <><span className="text-xs font-semibold [color:var(--kc-muted)]">回复</span><span className="max-w-[180px] truncate text-xs font-bold [color:var(--kc-accent)]">@{parentAuthorName}</span></> : null}
          {comment.author_id === currentUser.id && comment.moderation_status === 'pending' ? <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-600">审核中</span> : null}
          {showDelete && (comment.author_id === currentUser.id || post.author_id === currentUser.id) ? <button type="button" onClick={() => onDelete?.(comment.id)} className="ml-auto shrink-0 text-xs [color:var(--kc-muted)] hover:text-red-500">删除</button> : null}
        </div>
        <p className={`text-[#151922] mt-1 select-text whitespace-pre-wrap break-words ${nested ? 'text-[13px] leading-5' : 'text-[14px] leading-6'}`}>{renderRichTextSafe(comment.content, onOpenUserSpace, onSelectTopic, friendUsers)}</p>
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
              <MentionTopicInput value={replyContent} onChange={setReplyContent} friends={friendUsers} topics={topicOptions} maxLength={500} disabled={interactionsBlocked} placeholder={`回复 ${authorName}...`} className="bg-white text-[#151922] h-9 w-full min-w-0 rounded-xl border px-3 text-sm outline-none [border-color:var(--kc-border)] focus:[border-color:var(--kc-accent)] disabled:opacity-60" />
              <button type="button" onClick={sendReply} disabled={interactionsBlocked || !replyContent.trim() || replyMutation.isPending} className="shrink-0 rounded-xl bg-[#168bff] px-3 py-1.5 text-sm font-bold text-white disabled:bg-slate-200 disabled:text-slate-400">发送</button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function CommentThread({ thread, post, currentUser, friendUsers, topicOptions, showDelete = false, onDelete, onOpenUserSpace, onSelectTopic }: { thread: CommentThreadData; post: Post; currentUser: User; friendUsers: User[]; topicOptions: PostTopic[]; showDelete?: boolean; onDelete?: (commentId: number) => void; onOpenUserSpace: OpenUserSpace; onSelectTopic?: (topic: string) => void }): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const visibleReplies = expanded ? thread.replies : thread.replies.slice(0, 2);

  return (
    <div>
      <CommentItem comment={thread.root} post={post} currentUser={currentUser} friendUsers={friendUsers} topicOptions={topicOptions} withDivider={thread.replies.length === 0} showDelete={showDelete} onDelete={onDelete} onOpenUserSpace={onOpenUserSpace} onSelectTopic={onSelectTopic} />
      {thread.replies.length > 0 ? (
        <div className="ml-[52px] -mt-1 mb-2 rounded-[18px] px-3 py-1.5 [background:color-mix(in_srgb,var(--kc-panel-muted)_42%,var(--kc-panel)_58%)]">
          {visibleReplies.map((reply) => (
            <CommentItem key={reply.id} comment={reply} post={post} currentUser={currentUser} friendUsers={friendUsers} topicOptions={topicOptions} parentAuthorName={reply.parent_id ? getDisplayName(reply.parent_author, `评论 ${reply.parent_id}`) : undefined} nested showDelete={showDelete} onDelete={onDelete} onOpenUserSpace={onOpenUserSpace} onSelectTopic={onSelectTopic} />
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


function PostCard({ post, currentUser, friendUsers = [], topicOptions = [], compact = false, mobileListMode = false, highlighted = false, onPostRef, onOpenUserSpace, onOpenPost, onEditPost, onSelectTopic }: { post: Post; currentUser: User; friendUsers?: User[]; topicOptions?: PostTopic[]; compact?: boolean; mobileListMode?: boolean; highlighted?: boolean; onPostRef?: (postId: number, node: HTMLElement | null) => void; onOpenUserSpace: OpenUserSpace; onOpenPost: (postId: number) => void; onEditPost?: (post: Post) => void; onSelectTopic?: (topic: string) => void }): JSX.Element {
  const [likesOpen, setLikesOpen] = useState(false);
  const [commentsExpanded, setCommentsExpanded] = useState(false);
  const [inlineComment, setInlineComment] = useState('');
  const [actionsOpen, setActionsOpen] = useState(false);
  const [repostOpen, setRepostOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [imageViewer, setImageViewer] = useState<ImageViewerState | null>(null);
  const isPending = post.moderation_status === 'pending';
  const isRejected = post.moderation_status === 'rejected';
  const interactionDisabled = isPending || isRejected;
  const { like: likeMutation, remove: deleteMutation, pin: pinMutation } = usePostActions(post);
  const commentMutation = useCreatePostComment(post.id, friendUsers);
  const reportMutation = useReportMutation(() => setReportOpen(false));
  const comments = post.recent_comments ?? [];
  const commentThreads = useMemo(() => buildCommentThreads(comments), [comments]);
  const hasComments = comments.length > 0;
  const cardClass = 'kc-qq-card kc-qq-post-card overflow-hidden p-0';
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

  function sendComment(): void {
    commentMutation.mutate({ content: inlineComment, parentId: null }, {
      onSuccess: () => {
        setInlineComment('');
        setCommentsExpanded(true);
      }
    });
  }

  return (
    <article ref={(node) => onPostRef?.(post.id, node)} role={mobileListMode ? 'button' : undefined} tabIndex={mobileListMode ? 0 : undefined} onClick={handleCardClick} onKeyDown={handleCardKeyDown} className={`${cardClass} scroll-mt-4 transition-shadow ${mobileListMode ? 'cursor-pointer' : ''} ${highlighted ? 'ring-2 ring-sky-300 ring-offset-2 ring-offset-transparent' : ''}`}>
      <div className="flex items-start gap-3 p-4">
        <button type="button" onClick={() => onOpenUserSpace(post.author, post.author_id)} className="group relative shrink-0 rounded-full">
          <Avatar user={post.author} size="md" />
          <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-[#34c759]" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <button type="button" onClick={() => onOpenUserSpace(post.author, post.author_id)} className="text-[17px] text-[#151922] block max-w-full truncate text-left font-bold hover:[color:var(--kc-accent)]">{getDisplayName(post.author, `用户 ${post.author_id}`)}</button>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-[#8b95a5]">
                <span>{formatTime(post.created_at)}</span>
                <span className="h-1 w-1 rounded-full bg-current opacity-40" />
                <span>{visibilityLabel(post.visibility)}</span>
                {isPending ? <span className="rounded-full bg-amber-50 px-2 py-0.5 font-bold text-amber-600">仅自己可见</span> : null}
              </div>
            </div>
            <div className="relative flex shrink-0 items-center gap-2">
              {post.author_id === currentUser.id && !compact ? (
                <>
                  <button type="button" onClick={() => setActionsOpen((open) => !open)} className="bg-[#f4f6fa] text-[#8b95a5] grid h-8 w-8 place-items-center rounded-full" aria-label="更多动态操作" aria-expanded={actionsOpen}>
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
                  <button type="button" onClick={() => setActionsOpen((open) => !open)} className="bg-[#f4f6fa] text-[#8b95a5] grid h-8 w-8 place-items-center rounded-full" aria-label="更多动态操作" aria-expanded={actionsOpen}><Icon name="more" className="h-5 w-5" /></button>
                  {actionsOpen ? <div className="absolute right-0 top-9 z-20 w-36 overflow-hidden rounded-2xl border p-1 shadow-[0_18px_40px_rgba(15,23,42,0.14)] [background:var(--kc-panel)] [border-color:var(--kc-border)]"><button type="button" onClick={() => { setActionsOpen(false); setReportOpen(true); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-red-500 hover:bg-red-50"><Icon name="flag" className="h-4 w-4" /> 举报动态</button></div> : null}
                </>
              ) : <span className="text-[#c0c5ce]"><Icon name="more" className="h-5 w-5" /></span>}
            </div>
          </div>
          {post.author_id === currentUser.id && post.moderation_status !== 'approved' ? (
            <div className={`mt-4 rounded-2xl px-4 py-2 text-xs font-semibold ${isRejected ? 'bg-red-50 text-red-500' : 'bg-amber-50 text-amber-600'}`}>
              {moderationLabel(post.moderation_status)}{isPending ? '，当前仅自己可见，审核通过后其他用户才能看到和互动。' : '，这条动态不会对其他用户展示。'}
            </div>
          ) : null}
          {post.pinned_at ? <span className="mt-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold [background:var(--kc-accent-soft)] [color:var(--kc-accent)]"><Icon name="pin" className="h-3.5 w-3.5" />置顶</span> : null}
          {post.content ? <p className="mt-4 text-[15px] leading-7 text-[#151922] select-text whitespace-pre-wrap break-words">{renderRichTextSafe(post.content, onOpenUserSpace, onSelectTopic, friendUsers, !mobileListMode)}</p> : null}
          {!mobileListMode ? <CcwCreationCards previews={post.ccw_creations} compact /> : null}
          <PostImageGrid images={post.image_urls ?? []} onOpenImage={mobileListMode ? () => onOpenPost(post.id) : (images, index) => setImageViewer({ images, index })} />
          {post.repost_of_id ? <RepostPreviewCard post={post.repost_of} onOpenPost={mobileListMode ? () => onOpenPost(post.id) : onOpenPost} onOpenImage={mobileListMode ? () => onOpenPost(post.id) : (images, index) => setImageViewer({ images, index })} /> : null}
          {post.like_count > 0 ? (
            mobileListMode ? <div className="bg-[#f4f8ff] text-[#526070] mt-4 flex w-full items-start gap-2 rounded-2xl px-4 py-3 text-left text-sm leading-6 transition hover:[color:var(--kc-accent)]">
              <Icon name="like" className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{likeSummaryText(post)}</span>
            </div> : <button type="button" onClick={() => setLikesOpen(true)} className="bg-[#f4f8ff] text-[#526070] mt-4 flex w-full items-start gap-2 rounded-2xl px-4 py-3 text-left text-sm leading-6 transition hover:[color:var(--kc-accent)]">
              <Icon name="like" className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{likeSummaryText(post)}</span>
            </button>
          ) : null}
          <div className="mt-4 flex items-center gap-1 border-t border-[#eef1f6] pt-3 text-[#8b95a5]">
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
              <section className="rounded-[22px] bg-[#f7f9fc] p-3">
                <div className="mb-3 flex items-center justify-between gap-4">
                  <h3 className="text-[#151922] text-sm font-bold">评论 <span className="font-semibold [color:var(--kc-muted)]">{post.comment_count || 0}</span></h3>
                  {post.comment_count > 1 ? <div className="flex items-center gap-2 text-xs font-semibold [color:var(--kc-muted)]"><button type="button" className="[color:var(--kc-accent)]">最热</button><span>|</span><button type="button">最新</button></div> : null}
                </div>
                <div className="mb-3 flex min-w-0 items-center gap-3">
                  <span className="shrink-0"><Avatar user={currentUser} size="md" /></span>
                  <MentionTopicInput value={inlineComment} onChange={setInlineComment} friends={friendUsers} topics={topicOptions} disabled={interactionDisabled} maxLength={500} placeholder={interactionDisabled ? '动态审核通过后才能评论' : '写下你的评论...'} className="bg-white text-[#151922] placeholder:text-[#a4adba] h-10 w-full min-w-0 rounded-xl border px-3 text-sm outline-none transition [border-color:var(--kc-border)] focus:[border-color:var(--kc-accent)] disabled:cursor-not-allowed disabled:opacity-60" />
                  <button type="button" onClick={sendComment} disabled={interactionDisabled || !inlineComment.trim() || commentMutation.isPending} className="shrink-0 rounded-xl bg-[#168bff] px-3.5 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-sky-600 disabled:bg-slate-200 disabled:text-slate-400 disabled:opacity-100">发送</button>
                </div>
                <div className="space-y-0">
                  {!hasComments ? <p className="py-3 text-center text-sm [color:var(--kc-muted)]">还没有评论，来抢沙发</p> : commentThreads.map((thread) => (
                    <CommentThread key={thread.root.id} thread={thread} post={post} currentUser={currentUser} friendUsers={friendUsers} topicOptions={topicOptions} onOpenUserSpace={onOpenUserSpace} onSelectTopic={onSelectTopic} />
                  ))}
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
      {likesOpen ? <LikesModal post={post} onClose={() => setLikesOpen(false)} onOpenUserSpace={onOpenUserSpace} /> : null}
      {repostOpen ? <RepostModal post={post} currentUser={currentUser} onClose={() => setRepostOpen(false)} /> : null}
      {reportOpen ? <ReportModal targetType="post" targetId={post.id} targetLabel={`动态：${post.content.trim().slice(0, 48) || `#${post.id}`}`} reportedUserId={post.author_id} isPending={reportMutation.isPending} error={reportMutation.error} onSubmit={(payload) => reportMutation.mutate(payload)} onClose={() => setReportOpen(false)} /> : null}
      {imageViewer ? <ImageViewer viewer={imageViewer} mobile onClose={() => setImageViewer(null)} onNavigate={(index) => setImageViewer((current) => current ? { ...current, index } : current)} /> : null}
    </article>
  );
}

function UserSpaceModal({ profileUser, fallbackId, currentUser, onClose, onOpenUserSpace, onOpenPost, onEditPost }: { profileUser: User | null | undefined; fallbackId: number; currentUser: User; onClose: () => void; onOpenUserSpace: OpenUserSpace; onOpenPost: (postId: number) => void; onEditPost: (post: Post) => void }): JSX.Element {
  const space = useUserSpace({ profileUser, fallbackId, currentUser, onClose });
  const { isSelf, displayUser, displayName, editingProfile, setEditingProfile, profileDraft, updateDraft, chooseCover, saveProfile, profileTitle, profileTagline, profileStatus, profileBio, profileLocation, interests, profileLayout, profileCardStyle, accent, coverUrl, metricCards, ccwProfileUrl, ccwAvatarUrl, ccwPrimaryStats, ccwSecondaryStats, posts, isFriend, friendButtonDisabled, friendButtonLabel, handleFriendAction } = space;
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const [shareProfileOpen, setShareProfileOpen] = useState(false);

  useEffect(() => {
    return registerNativeBackHandler(() => {
      onClose();
      return true;
    }, 165);
  }, [onClose]);

  const metricCardClass = profilePanelClass(profileCardStyle, coverUrl);
  const coverBackground = coverUrl ? `linear-gradient(135deg,rgba(6,10,20,.68),rgba(6,10,20,.18)),url(${resolveAssetUrl(coverUrl)}) center/cover` : `radial-gradient(circle at 15% 20%,rgba(255,255,255,.34),transparent 30%),radial-gradient(circle at 82% 12%,rgba(255,255,255,.22),transparent 24%),linear-gradient(135deg,${accent} 0%,#7c8cff 48%,#ff7eb3 100%)`;
  const visiblePosts = space.stats.post_count;
  const postGapClass = profilePostGapClass(profileLayout);
  const mobileAvatarSize = profileLayout === 'banner' ? 'lg' : profileLayout === 'compact' ? 'md' : 'lg';

  const profileEditor = isSelf && editingProfile ? (
    <section className="kc-qq-card overflow-hidden p-0">
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
            <button type="button" onClick={saveProfile} disabled={space.savePending || space.coverPending} className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-[12px] font-black text-slate-950 shadow-[0_12px_28px_rgba(0,0,0,.18)] transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-50"><Icon name="check" className="h-3.5 w-3.5" />{space.savePending ? '保存中' : '保存主页'}</button>
          </div>
        </div>
      </div>
      <input ref={coverInputRef} type="file" accept="image/*" onChange={chooseCover} className="hidden" />
      <div className="grid gap-4 p-4">
        <div className="grid min-w-0 gap-4">
          <section className="rounded-[26px] bg-[#f6f8fc] p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h4 className="text-[15px] font-black text-[#111827]">封面舞台</h4>
                <p className="mt-1 text-[12px] font-medium text-[#8b95a5]">建议使用横向图片，留出头像和文字安全区。</p>
              </div>
              <Icon name="image" className="h-5 w-5 text-[#168bff]" />
            </div>
            <button type="button" onClick={() => coverInputRef.current?.click()} disabled={space.coverPending} className="group relative min-h-[154px] w-full cursor-pointer overflow-hidden rounded-[24px] text-left shadow-[0_18px_44px_rgba(15,23,42,.16)] disabled:opacity-50" style={{ background: coverBackground }}>
              <div className="absolute inset-0 bg-gradient-to-br from-black/10 via-transparent to-black/26 transition duration-300 group-hover:from-black/4 group-hover:to-black/18" />
              <div className="relative flex h-full min-h-[154px] items-end justify-between gap-3 p-4 text-white">
                <span className="min-w-0"><span className="block text-[18px] font-black">{space.coverPending ? '封面上传中...' : '点击更换主页封面'}</span><span className="mt-1 block text-[12px] font-semibold text-white/78">支持图片上传，审核通过后公开展示</span></span>
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white/20 backdrop-blur"><Icon name="upload" className="h-5 w-5" /></span>
              </div>
            </button>
          </section>

          <section className="rounded-[26px] bg-[#eef7ff] p-3">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-[18px] bg-[#168bff] text-white"><Icon name="ccw" className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1">
                <h4 className="text-[15px] font-black text-[#111827]">CCW 账号</h4>
                <p className="mt-1 text-[12px] font-medium text-[#8b95a5]">{displayUser?.ccw_student_oid ? `已绑定 ${displayUser.ccw_name || 'CCW 账号'}，可在设置中刷新或同步资料。` : '绑定入口在 设置 > CCW 账号，绑定后这里会展示关注、粉丝和获赞。'}</p>
              </div>
            </div>
            {displayUser?.ccw_student_oid ? (
              <div className="mt-3 grid grid-cols-3 rounded-[20px] bg-white text-center text-[12px] font-bold text-[#8b95a5]">
                <span className="px-2 py-3"><strong className="block text-[16px] text-[#111827]">{formatCompact(displayUser.ccw_following_count)}</strong>关注</span>
                <span className="border-x border-[#eef2f7] px-2 py-3"><strong className="block text-[16px] text-[#111827]">{formatCompact(displayUser.ccw_follower_count)}</strong>粉丝</span>
                <span className="px-2 py-3"><strong className="block text-[16px] text-[#111827]">{formatCompact(displayUser.ccw_like_count)}</strong>获赞</span>
              </div>
            ) : null}
          </section>

          <section className="grid gap-3 rounded-[26px] bg-[#f6f8fc] p-3">
            <div>
              <h4 className="text-[15px] font-black text-[#111827]">身份文案</h4>
              <p className="mt-1 text-[12px] font-medium text-[#8b95a5]">用短标题、状态和标签建立主页第一印象。</p>
            </div>
            <div className="grid gap-3">
              <label className="grid gap-2">
                <span className="text-[13px] font-bold text-[#526070]">主页标题</span>
                <input value={profileDraft.profile_title} onChange={(event) => updateDraft('profile_title', event.target.value)} className="kc-qq-input" placeholder="我的空间" />
              </label>
              <label className="grid gap-2">
                <span className="text-[13px] font-bold text-[#526070]">主页标签</span>
                <input value={profileDraft.profile_tagline} onChange={(event) => updateDraft('profile_tagline', event.target.value)} className="kc-qq-input" placeholder="今天也要开心聊天" />
              </label>
              <label className="grid gap-2">
                <span className="text-[13px] font-bold text-[#526070]">当前状态</span>
                <input value={profileDraft.profile_status} onChange={(event) => updateDraft('profile_status', event.target.value)} className="kc-qq-input" placeholder="在线摸鱼中" />
              </label>
              <label className="grid gap-2">
                <span className="text-[13px] font-bold text-[#526070]">所在地</span>
                <input value={profileDraft.profile_location} onChange={(event) => updateDraft('profile_location', event.target.value)} className="kc-qq-input" placeholder="互联网角落" />
              </label>
            </div>
            <label className="grid gap-2">
              <span className="text-[13px] font-bold text-[#526070]">兴趣标签</span>
              <input value={profileDraft.profile_interests} onChange={(event) => updateDraft('profile_interests', event.target.value)} className="kc-qq-input" placeholder="聊天, 编程, 音乐" />
            </label>
            <label className="grid gap-2">
              <span className="text-[13px] font-bold text-[#526070]">个人简介</span>
              <textarea value={profileDraft.bio} onChange={(event) => updateDraft('bio', event.target.value)} rows={3} maxLength={1000} className="kc-qq-input min-h-[92px] resize-none leading-6" placeholder="写一段会展示在主页封面里的简介" />
              <span className="text-right text-[11px] font-bold text-[#8b95a5]">{profileDraft.bio.length}/1000</span>
            </label>
          </section>

          <section className="grid gap-3 rounded-[26px] bg-[#f6f8fc] p-3">
            <div>
              <h4 className="text-[15px] font-black text-[#111827]">视觉系统</h4>
              <p className="mt-1 text-[12px] font-medium text-[#8b95a5]">版式决定空间节奏，卡片风格决定资料层次。</p>
            </div>
            <div className="grid gap-2">
              {profileLayoutOptions.map((option) => {
                const active = profileDraft.profile_layout === option.value;
                return (
                  <button key={option.value} type="button" onClick={() => updateDraft('profile_layout', option.value)} className={`rounded-[20px] p-3 cursor-pointer text-left transition hover:-translate-y-0.5 ${active ? 'text-white shadow-[0_14px_30px_rgba(22,139,255,.22)]' : 'bg-white text-[#111827]'}`} style={active ? { background: accent, borderColor: accent } : undefined}>
                    <span className="block text-sm font-black">{option.label}</span>
                    <span className="mt-1 block text-xs opacity-75">{option.detail}</span>
                  </button>
                );
              })}
            </div>
            <div className="grid gap-2">
              {profileCardStyleOptions.map((option) => {
                const active = profileDraft.profile_card_style === option.value;
                return (
                  <button key={option.value} type="button" onClick={() => updateDraft('profile_card_style', option.value)} className={`rounded-[20px] p-3 cursor-pointer text-left transition hover:-translate-y-0.5 ${active ? 'bg-[#111827] text-white shadow-[0_14px_30px_rgba(17,24,39,.18)] [border-color:#111827]' : 'bg-white text-[#111827]'}`}>
                    <span className="block text-sm font-black">{option.label}</span>
                    <span className="mt-1 block text-xs opacity-75">{option.detail}</span>
                  </button>
                );
              })}
            </div>
            <div className="grid gap-2">
              <span className="text-[13px] font-bold text-[#526070]">强调色</span>
              <div className="flex flex-wrap items-center gap-2">
                {profileAccentPresets.map((color) => (
                  <button key={color} type="button" onClick={() => updateDraft('profile_accent_color', color)} className={`grid h-9 w-9 cursor-pointer place-items-center rounded-full border-2 transition hover:scale-105 ${profileDraft.profile_accent_color === color ? 'border-white shadow-[0_0_0_3px_rgba(22,139,255,.22)]' : 'border-transparent'}`} style={{ background: color }} aria-label={`选择强调色 ${color}`}>
                    {profileDraft.profile_accent_color === color ? <Icon name="check" className="h-4 w-4 text-white" /> : null}
                  </button>
                ))}
                <input type="color" value={profileDraft.profile_accent_color} onChange={(event) => updateDraft('profile_accent_color', event.target.value)} className="h-9 w-14 cursor-pointer rounded-full border-0 bg-white px-1 py-1" aria-label="自定义强调色" />
              </div>
            </div>
          </section>
        </div>

        <aside className="grid gap-3 rounded-[26px] bg-[#f6f8fc] p-3">
          <p className="text-[13px] font-black text-[#526070]">实时预览</p>
          <div className="overflow-hidden rounded-[24px] bg-white shadow-[0_20px_50px_rgba(15,23,42,.14)]">
            <div className="h-24" style={{ background: coverBackground }} />
            <div className="-mt-8 px-4 pb-4">
              <Avatar user={displayUser} size="lg" />
              <h5 className="mt-2 truncate text-[18px] font-black text-slate-950">{displayName}</h5>
              <p className="truncate text-[12px] font-bold text-slate-500">{profileTitle} · {userHandle(displayUser, fallbackId)}</p>
              {profileTagline ? <p className="mt-3 inline-flex max-w-full rounded-full px-3 py-1 text-[12px] font-black text-white" style={{ background: accent }}><span className="truncate">{profileTagline}</span></p> : null}
            </div>
          </div>
          {space.coverError ? <p className="rounded-[18px] bg-red-50 px-4 py-3 text-[13px] text-red-500">{space.coverError}</p> : null}
          {space.saveError ? <p className="rounded-[18px] bg-red-50 px-4 py-3 text-[13px] text-red-500">{space.saveError}</p> : null}
        </aside>
      </div>
    </section>
  ) : null;

  return (
    <section className="kc-qq-page kc-profile-space-page flex h-full min-h-0 flex-col overflow-hidden text-[#111827]">
      <MobileStatusBar />
      <div className="kc-qq-scroll scroll-soft min-h-0 flex-1 overflow-y-auto pb-[calc(var(--kc-mobile-bottom-nav-space)+24px)]">
        <header className={`kc-profile-hero relative overflow-hidden text-white ${profileCoverClasses(profileLayout)}`}>
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
            {space.friendError ? <p className="rounded-[18px] bg-red-50 px-4 py-3 text-[13px] font-bold text-red-500">{space.friendError}</p> : null}
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
            {space.postsLoading ? <p className="kc-qq-post-empty">正在打开个人主页...</p> : null}
            {!space.postsLoading && posts.length === 0 ? (
              <section className="kc-qq-card grid place-items-center gap-2 px-5 py-10 text-center">
                <span className="grid h-14 w-14 place-items-center rounded-[24px] bg-[#edf6ff] text-[#168bff]"><Icon name="feed" className="h-7 w-7" /></span>
                <p className="text-[15px] font-black text-[#111827]">暂无可见动态</p>
                <p className="text-[12px] font-medium text-[#8b95a5]">新的动态会出现在这里。</p>
              </section>
            ) : null}
            <div className={`kc-profile-stagger ${postGapClass}`}>
              {posts.map((post) => <PostCard key={post.id} post={post} currentUser={currentUser} onOpenUserSpace={onOpenUserSpace} onOpenPost={onOpenPost} onEditPost={onEditPost} />)}
            </div>
            {space.hasMorePosts ? <button type="button" onClick={space.loadMorePosts} className="mx-auto cursor-pointer rounded-full bg-white px-5 py-2 text-[13px] font-bold text-[#8b95a5] shadow-sm transition hover:text-[#168bff]">加载更多</button> : null}
          </div>
        </div>
      </div>
      {shareProfileOpen && displayUser ? <UserShareTargetModal user={displayUser} currentUser={currentUser} onClose={() => setShareProfileOpen(false)} /> : null}
    </section>
  );
}

function MobilePostsPanel({ currentUser, onOpenMobileUserProfile, conversations = [], bookmarks = [], bookmarksLoading = false, bookmarksError = null, onOpenForwardBundle, onMobileSecondaryActiveChange, onOpenMobileBots, onOpenMobileFeature, onOpenMobileMenuSettings, mobileInitialView = 'home' }: Omit<PostsPanelProps, 'isMobile'>): JSX.Element {
  const pendingUserSpaceId = useKukeStore((state) => state.pendingUserSpaceId);
  const pendingPostId = useKukeStore((state) => state.pendingPostId);
  const clearPendingUserSpace = useKukeStore((state) => state.clearPendingUserSpace);
  const clearPendingPost = useKukeStore((state) => state.clearPendingPost);
  const mobileFeatureOrder = useKukeStore((state) => state.mobileFeatureOrder);
  const hiddenMobileFeatures = useHiddenMobileFeatures();
  const feed = usePostFeedState();
  const { scope, feedSort, selectedTopic, pinnedPost, focusedPostId, openPostError, feedQuery, posts, setPostRef, selectTopic } = feed;
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [creatorsOpen, setCreatorsOpen] = useState(false);
  const [mobileSpaceView, setMobileSpaceView] = useState<'home' | 'posts' | 'favorites' | 'bots'>(mobileInitialView);
  const [spaceTarget, setSpaceTarget] = useState<{ user: User | null | undefined; fallbackId: number } | null>(null);
  const [detailPost, setDetailPost] = useState<Post | null>(null);
  const [openingDetailPostId, setOpeningDetailPostId] = useState<number | null>(() => pendingPostId || null);
  const [mobileTransitionOwner, setMobileTransitionOwner] = useState<'composer' | 'notifications' | 'detail' | 'loading' | null>(null);
  const myStats = useUserPostStats(currentUser.id);
  const topicOptions = useTrendingPostTopics().data ?? [];
  const notificationsQuery = usePostNotifications(10);
  const friendUsers = useFriendUsers(currentUser.id);
  const activeTab = feedTabs.find((tab) => tab.scope === scope) ?? feedTabs[0];

  function openUserSpace(user: User | null | undefined, fallbackId: number): void {
    if (onOpenMobileUserProfile) {
      onOpenMobileUserProfile(user, fallbackId);
      return;
    }
    runNativeRouteTransition('secondary-forward', () => setSpaceTarget({ user: user ?? null, fallbackId }), true);
  }

  function closeUserSpace(): void {
    runNativeRouteTransition('secondary-back', () => setSpaceTarget(null), true);
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
    }, true);
  }

  function openCreatorsPage(): void {
    runNativeRouteTransition('secondary-forward', () => {
      setCreatorsOpen(true);
      onMobileSecondaryActiveChange?.(true);
    }, true);
  }

  function closeCreatorsPage(): void {
    runNativeRouteTransition('secondary-back', () => {
      setCreatorsOpen(false);
      onMobileSecondaryActiveChange?.(false);
    }, true);
  }

  function openNotificationsPage(): void {
    runNativeRouteTransition('secondary-forward', () => {
      onMobileSecondaryActiveChange?.(true);
      setMobileTransitionOwner('notifications');
      setNotificationsOpen(true);
    }, true);
  }

  function closeNotificationsPage(): void {
    runNativeRouteTransition('secondary-back', () => {
      setMobileTransitionOwner('notifications');
      setNotificationsOpen(false);
      onMobileSecondaryActiveChange?.(false);
    }, true);
  }

  function openPostFromNotifications(postId: number): void {
    runNativeRouteTransition('secondary-forward', () => {
      onMobileSecondaryActiveChange?.(true);
      setNotificationsOpen(false);
      setDetailPost(null);
      setMobileTransitionOwner('loading');
      setOpeningDetailPostId(postId);
    }, true);
    void getPost(postId).then((loadedPost) => {
      setDetailPost(loadedPost);
      setOpeningDetailPostId(null);
      setMobileTransitionOwner('detail');
    }).catch(() => {
      setOpeningDetailPostId(null);
      feed.showOpenPostError();
    });
  }

  function openComposer(post?: Post): void {
    runNativeRouteTransition('secondary-forward', () => {
      onMobileSecondaryActiveChange?.(true);
      setMobileTransitionOwner('composer');
      setEditingPost(post ?? null);
      setComposerOpen(true);
    }, true);
  }

  function closeComposer(): void {
    runNativeRouteTransition('secondary-back', () => {
      setMobileTransitionOwner('composer');
      setComposerOpen(false);
      setEditingPost(null);
      onMobileSecondaryActiveChange?.(false);
    }, true);
  }

  const mobileSecondaryActive = (mobileInitialView === 'home' && mobileSpaceView !== 'home') || creatorsOpen || Boolean(spaceTarget) || Boolean(detailPost) || openingDetailPostId !== null || notificationsOpen || composerOpen;
  const routeTransition: CSSProperties = { viewTransitionName: 'kc-mobile-route' };
  const mobileSpaceTransitionStyle = mobileInitialView === 'home' && mobileSpaceView !== 'home' ? routeTransition : undefined;
  const composerTransitionStyle = mobileTransitionOwner === 'composer' ? routeTransition : undefined;
  const notificationsTransitionStyle = mobileTransitionOwner === 'notifications' ? routeTransition : undefined;
  const detailLoadingTransitionStyle = mobileTransitionOwner === 'loading' ? routeTransition : undefined;
  const detailTransitionStyle = mobileTransitionOwner === 'detail' ? routeTransition : undefined;
  const creatorsTransitionStyle = creatorsOpen ? routeTransition : undefined;

  useEffect(() => {
    onMobileSecondaryActiveChange?.(mobileSecondaryActive);
    return () => onMobileSecondaryActiveChange?.(false);
  }, [mobileSecondaryActive, onMobileSecondaryActiveChange]);

  useEffect(() => {
    if (mobileInitialView !== 'home' || mobileSpaceView === 'home') {
      return undefined;
    }
    return registerNativeBackHandler(() => {
      setMobileSpaceSecondaryView('home');
      return true;
    }, 20);
  }, [mobileInitialView, mobileSpaceView]);

  useEffect(() => {
    if (!creatorsOpen || spaceTarget) return undefined;
    return registerNativeBackHandler(() => {
      closeCreatorsPage();
      return true;
    }, 25);
  }, [creatorsOpen, spaceTarget]);

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
    setMobileSpaceSecondaryView('posts');
    void openPost(pendingPostId);
    clearPendingPost(pendingPostId);
  }, [clearPendingPost, pendingPostId]);

  function closeMobilePostDetail(): void {
    runNativeRouteTransition('secondary-back', () => {
      setMobileTransitionOwner(detailPost ? 'detail' : 'loading');
      setOpeningDetailPostId(null);
      setDetailPost(null);
      onMobileSecondaryActiveChange?.(false);
    }, true);
  }

  async function openPost(postId: number): Promise<void> {
    feed.clearOpenPostError();
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
      feed.showOpenPostError();
    }
  }

  const totalLikes = myStats.like_count;
  const totalComments = myStats.comment_count;
  const mobilePostDetailLoadingPage = openingDetailPostId !== null ? (
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

  const mobilePostDetailPage = detailPost ? (
    <MobilePostDetailPage post={detailPost} currentUser={currentUser} friendUsers={friendUsers} topicOptions={topicOptions} isMobile transitionStyle={detailTransitionStyle} onClose={closeMobilePostDetail} onOpenUserSpace={openUserSpace} onOpenPost={(postId) => void openPost(postId)} onEditPost={openComposer} />
  ) : null;

  if (spaceTarget) {
    return (
      <>
        <UserSpaceModal
          profileUser={spaceTarget.user}
          fallbackId={spaceTarget.fallbackId}
          currentUser={currentUser}
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
    return <CcwCreatorsPage isMobile transitionStyle={creatorsTransitionStyle} onBack={closeCreatorsPage} onOpenUserSpace={openUserSpace} />;
  }

  if (mobileSpaceView === 'favorites') {
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

  if (mobileSpaceView === 'posts') {
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
              <button key={tab.scope} type="button" onClick={() => { setCreatorsOpen(false); feed.selectScope(tab.scope); }} className={`kc-qq-post-tab ${scope === tab.scope ? 'kc-qq-post-tab-active' : ''}`}>
                {tab.label}
              </button>
            ))}
            <button type="button" onClick={openCreatorsPage} className="kc-qq-post-tab kc-creators-tab"><Icon name="sparkles" className="h-4 w-4" />大佬入住</button>
          </div>

          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {feedSortTabs.map((tab) => <button key={tab.value} type="button" onClick={() => feed.selectSort(tab.value)} className={`kc-pc-chip shrink-0 rounded-full px-3 py-2 text-[12px] font-bold ${feedSort === tab.value && selectedTopic === null ? 'kc-pc-chip-active bg-[#168bff] text-white' : 'bg-white text-[#8b95a5]'}`}>{tab.label}</button>)}
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
            {posts.map((post) => <PostCard key={post.id} post={post} currentUser={currentUser} friendUsers={friendUsers} topicOptions={topicOptions} mobileListMode highlighted={focusedPostId === post.id} onPostRef={setPostRef} onOpenUserSpace={openUserSpace} onOpenPost={(postId) => void openPost(postId)} onEditPost={openComposer} onSelectTopic={selectTopic} />)}
            {feedQuery.hasNextPage ? <button type="button" onClick={() => void feedQuery.fetchNextPage()} className="mx-auto rounded-full bg-white px-5 py-2 text-[13px] font-bold text-[#8b95a5] shadow-sm">加载更多</button> : null}
          </section>
        </div>
        {composerOpen ? <ComposerModal currentUser={currentUser} editingPost={editingPost} transitionStyle={composerTransitionStyle} onClose={closeComposer} /> : null}
        {notificationsOpen ? <NotificationsModal transitionStyle={notificationsTransitionStyle} onClose={closeNotificationsPage} onOpenUserSpace={openUserSpace} onOpenPost={openPostFromNotifications} /> : null}
        {mobilePostDetailLoadingPage}
        {mobilePostDetailPage}
      </section>
    );
  }

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
          {getMobileSpaceFeatureIds(mobileFeatureOrder, hiddenMobileFeatures).map((featureId) => {
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

/** 入口：桌面布局渲染 desktop/ 下的页面，移动端是上面这一套。 */
export function PostsPanel({ isMobile, ...props }: PostsPanelProps): JSX.Element {
  return isMobile ? <MobilePostsPanel {...props} /> : <PostsDesktop currentUser={props.currentUser} />;
}
