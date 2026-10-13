import { useState } from 'react';
import { ReportModal } from '@/components/chat/ReportModal';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { ContextMenuItem, ContextMenuSurface } from '@/components/ui/ContextMenu';
import { Icon } from '@/components/ui/Icon';
import { ImageViewer, type ImageViewerState } from '@/components/ui/ImageViewer';
import type { Post, PostTopic, User } from '@/types/api';
import { type OpenUserSpace, formatTime, likeSummaryText, moderationLabel, visibilityLabel } from '../postModel';
import { usePostActions, useReportMutation } from '../postQueries';
import { LikesDialog } from './FeedDialogs';
import { CreationCards, PostImages, PostText, RepostQuote } from './PostBody';
import { PostComments } from './PostComments';
import { useDismiss } from './PostDialog';
import { RepostDialog } from './ShareDialogs';

interface PostItemProps {
  post: Post;
  currentUser: User;
  friendUsers: User[];
  topicOptions: PostTopic[];
  /** 刚从别处跳过来、需要描一圈提示的那条 */
  highlighted?: boolean;
  onPostRef?: (postId: number, node: HTMLElement | null) => void;
  onOpenUserSpace: OpenUserSpace;
  onOpenPost: (postId: number) => void;
  onEditPost: (post: Post) => void;
  onSelectTopic?: (topic: string) => void;
}

type Overlay = 'likes' | 'repost' | 'report' | null;

/** 帖子流里的一条动态。 */
export function PostItem({ post, currentUser, friendUsers, topicOptions, highlighted = false, onPostRef, onOpenUserSpace, onOpenPost, onEditPost, onSelectTopic }: PostItemProps): JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [viewer, setViewer] = useState<ImageViewerState | null>(null);
  const menuRef = useDismiss<HTMLDivElement>(menuOpen, () => setMenuOpen(false));
  const { like, remove, pin } = usePostActions(post);
  const reportMutation = useReportMutation(() => setOverlay(null));
  const isMine = post.author_id === currentUser.id;
  const pending = post.moderation_status === 'pending';
  const rejected = post.moderation_status === 'rejected';
  // 没过审的动态别人看不到，也就不能点赞、转发
  const locked = pending || rejected;
  const openAuthor = (): void => onOpenUserSpace(post.author, post.author_id);
  const openImages = (images: string[], index: number): void => setViewer({ images, index });

  function pick(action: () => void): () => void {
    return () => {
      setMenuOpen(false);
      action();
    };
  }

  return (
    <article ref={(node) => onPostRef?.(post.id, node)} className={`kpo-block kpo-post ${highlighted ? 'is-focused' : ''}`}>
      <header className="kpo-post-head">
        <button type="button" className="kpo-avatar-btn" onClick={openAuthor}><Avatar user={post.author} size="md" /></button>
        <div className="kpo-post-who">
          <button type="button" className="kpo-name" onClick={openAuthor}>{getDisplayName(post.author, `用户 ${post.author_id}`)}</button>
          <div className="kpo-meta">
            <span>{formatTime(post.created_at)}</span>
            <span>{visibilityLabel(post.visibility)}</span>
            {post.pinned_at ? <span className="kui-tag kui-tag--accent"><Icon name="pin" />置顶</span> : null}
            {locked ? <span className={`kui-tag ${rejected ? 'kui-tag--danger' : 'kui-tag--warn'}`}>{moderationLabel(post.moderation_status)}</span> : null}
          </div>
        </div>
        <div ref={menuRef} className="kpo-post-menu">
          <button type="button" className={`kui-icon-btn ${menuOpen ? 'is-active' : ''}`} aria-label="更多动态操作" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}><Icon name="more" className="h-4 w-4" /></button>
          {menuOpen ? (
            <ContextMenuSurface>
              {isMine ? (
                <>
                  <ContextMenuItem icon="edit" label="编辑动态" onClick={pick(() => onEditPost(post))} />
                  <ContextMenuItem icon="pin" label={post.pinned_at ? '取消置顶' : '置顶动态'} onClick={pick(() => pin.mutate())} />
                  <ContextMenuItem icon="trash" label="删除动态" danger onClick={pick(() => {
                    if (window.confirm('确定要删除这条动态吗？')) {
                      remove.mutate();
                    }
                  })} />
                </>
              ) : <ContextMenuItem icon="flag" label="举报动态" danger onClick={pick(() => setOverlay('report'))} />}
            </ContextMenuSurface>
          ) : null}
        </div>
      </header>

      <div className="kpo-post-body">
        {isMine && locked ? <p className={`kui-note ${rejected ? 'kui-note--danger' : 'kui-note--warn'}`}>{moderationLabel(post.moderation_status)}{pending ? '，当前仅自己可见，审核通过后其他用户才能看到和互动。' : '，这条动态不会对其他用户展示。'}</p> : null}
        {post.content ? <PostText content={post.content} mentionUsers={friendUsers} onOpenUserSpace={onOpenUserSpace} onSelectTopic={onSelectTopic} /> : null}
        <CreationCards previews={post.ccw_creations} />
        <PostImages images={post.image_urls ?? []} onOpen={openImages} />
        {post.repost_of_id ? <RepostQuote post={post.repost_of} onOpenPost={onOpenPost} onOpenImage={openImages} /> : null}
        {post.like_count > 0 ? <button type="button" className="kpo-likes" onClick={() => setOverlay('likes')}><Icon name="like" /><span>{likeSummaryText(post)}</span></button> : null}
        <div className="kpo-actions">
          <button type="button" className={`kpo-action ${post.liked_by_me ? 'is-on is-liked' : ''}`} aria-pressed={post.liked_by_me} disabled={like.isPending || locked} onClick={() => like.mutate()}>
            <Icon name="like" />{post.like_count > 0 ? post.like_count : '赞'}
          </button>
          <button type="button" className={`kpo-action ${commentsOpen ? 'is-on' : ''}`} aria-expanded={commentsOpen} disabled={rejected} onClick={() => setCommentsOpen((open) => !open)}>
            <Icon name="message" />{post.comment_count > 0 ? post.comment_count : '评论'}
          </button>
          <button type="button" className="kpo-action" disabled={locked} onClick={() => setOverlay('repost')}>
            <Icon name="share" />分享
          </button>
        </div>
        {commentsOpen ? <PostComments post={post} currentUser={currentUser} friendUsers={friendUsers} topicOptions={topicOptions} disabled={locked} onOpenUserSpace={onOpenUserSpace} onSelectTopic={onSelectTopic} /> : null}
      </div>

      {overlay === 'likes' ? <LikesDialog post={post} onClose={() => setOverlay(null)} onOpenUserSpace={onOpenUserSpace} /> : null}
      {overlay === 'repost' ? <RepostDialog post={post} currentUser={currentUser} onClose={() => setOverlay(null)} /> : null}
      {overlay === 'report' ? <ReportModal targetType="post" targetId={post.id} targetLabel={`动态：${post.content.trim().slice(0, 48) || `#${post.id}`}`} reportedUserId={post.author_id} isPending={reportMutation.isPending} error={reportMutation.error} onSubmit={(payload) => reportMutation.mutate(payload)} onClose={() => setOverlay(null)} /> : null}
      {viewer ? <ImageViewer viewer={viewer} mobile={false} onClose={() => setViewer(null)} onNavigate={(index) => setViewer((current) => (current ? { ...current, index } : current))} /> : null}
    </article>
  );
}
