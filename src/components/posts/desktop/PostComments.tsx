import { useMemo, useState } from 'react';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import type { Post, PostComment, PostTopic, User } from '@/types/api';
import { COMMENT_MAX_LENGTH, type CommentThreadData, type OpenUserSpace, buildCommentThreads, formatTime, replyTargetName } from '../postModel';
import { useCreatePostComment, useTogglePostCommentLike } from '../postQueries';
import { MentionInput } from './MentionInput';
import { PostText } from './PostBody';

interface CommentContext {
  post: Post;
  currentUser: User;
  friendUsers: User[];
  topicOptions: PostTopic[];
  onOpenUserSpace: OpenUserSpace;
  onSelectTopic?: (topic: string) => void;
}

/** 帖子下面展开的评论区：一个输入框，下面按楼排开。 */
export function PostComments({ disabled, ...context }: CommentContext & { disabled: boolean }): JSX.Element {
  const { post, currentUser, friendUsers, topicOptions } = context;
  const [draft, setDraft] = useState('');
  const createMutation = useCreatePostComment(post.id, friendUsers);
  const threads = useMemo(() => buildCommentThreads(post.recent_comments ?? []), [post.recent_comments]);
  const canSend = !disabled && Boolean(draft.trim()) && !createMutation.isPending;

  function send(): void {
    if (canSend) {
      createMutation.mutate({ content: draft, parentId: null }, { onSuccess: () => setDraft('') });
    }
  }

  return (
    <section className="kpo-comments">
      <div className="kpo-reply-form">
        <span className="kpo-avatar-s"><Avatar user={currentUser} size="sm" /></span>
        <MentionInput value={draft} onChange={setDraft} onEnter={send} friends={friendUsers} topics={topicOptions} disabled={disabled} maxLength={COMMENT_MAX_LENGTH} placeholder={disabled ? '动态审核通过后才能评论' : '写下你的评论…'} />
        <button type="button" className="kui-btn kui-btn--primary" disabled={!canSend} onClick={send}>发送</button>
      </div>
      {threads.length === 0
        ? <p className="kpo-comments-empty">还没有评论，来抢沙发</p>
        : threads.map((thread) => <CommentThread key={thread.root.id} thread={thread} {...context} />)}
    </section>
  );
}

/** 一楼：顶上一条评论，下面是挂在它名下的所有回复，默认只露两条。 */
function CommentThread({ thread, ...context }: CommentContext & { thread: CommentThreadData }): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const replies = expanded ? thread.replies : thread.replies.slice(0, 2);
  return (
    <CommentRow comment={thread.root} {...context}>
      {thread.replies.length > 0 ? (
        <div className="kpo-replies">
          {replies.map((reply) => <CommentRow key={reply.id} comment={reply} replyTo={replyTargetName(reply)} nested {...context} />)}
          {thread.replies.length > 2 ? <button type="button" className="kpo-replies-toggle" onClick={() => setExpanded((value) => !value)}>{expanded ? '收起回复' : `共 ${thread.replies.length} 条回复，点击查看`}</button> : null}
        </div>
      ) : null}
    </CommentRow>
  );
}

function CommentRow({ comment, replyTo, nested = false, children, post, currentUser, friendUsers, topicOptions, onOpenUserSpace, onSelectTopic }: CommentContext & { comment: PostComment; replyTo?: string; nested?: boolean; children?: React.ReactNode }): JSX.Element {
  const [replying, setReplying] = useState(false);
  const [draft, setDraft] = useState('');
  const likeMutation = useTogglePostCommentLike(post.id, comment.id);
  const replyMutation = useCreatePostComment(post.id, friendUsers);
  // 动态或这条评论还没过审时，不能点赞也不能回复
  const blocked = post.moderation_status !== 'approved' || comment.moderation_status !== 'approved';
  const authorName = getDisplayName(comment.author, `用户 ${comment.author_id}`);
  const canSend = !blocked && Boolean(draft.trim()) && !replyMutation.isPending;

  function closeReply(): void {
    setReplying(false);
    setDraft('');
  }

  function send(): void {
    if (canSend) {
      replyMutation.mutate({ content: draft, parentId: comment.id }, { onSuccess: closeReply });
    }
  }

  return (
    <div className="kpo-comment">
      <button type="button" className={`kpo-avatar-btn ${nested ? 'kpo-avatar-s' : ''}`} onClick={() => onOpenUserSpace(comment.author, comment.author_id)}>
        <Avatar user={comment.author} size="sm" />
      </button>
      <div className="kpo-comment-main">
        <div className="kpo-comment-head">
          <button type="button" className="kpo-name" onClick={() => onOpenUserSpace(comment.author, comment.author_id)}>{authorName}</button>
          {replyTo ? <><span>回复</span><em>@{replyTo}</em></> : null}
          {comment.author_id === currentUser.id && comment.moderation_status === 'pending' ? <span className="kui-tag kui-tag--warn">审核中</span> : null}
        </div>
        <PostText content={comment.content} mentionUsers={friendUsers} onOpenUserSpace={onOpenUserSpace} onSelectTopic={onSelectTopic} />
        <div className="kpo-comment-foot">
          <time>{formatTime(comment.created_at)}</time>
          <button type="button" className={comment.liked_by_me ? 'is-on' : undefined} disabled={blocked || likeMutation.isPending} aria-label="赞" onClick={() => likeMutation.mutate()}>
            <Icon name="like" />{comment.like_count || 0}
          </button>
          <button type="button" className={replying ? 'is-on' : undefined} disabled={blocked} onClick={() => (replying ? closeReply() : setReplying(true))}>回复</button>
        </div>
        {replying ? (
          <div className="kpo-reply-form">
            <MentionInput value={draft} onChange={setDraft} onEnter={send} friends={friendUsers} topics={topicOptions} disabled={blocked} autoFocus maxLength={COMMENT_MAX_LENGTH} placeholder={`回复 ${authorName}…`} />
            <button type="button" className="kui-btn kui-btn--primary" disabled={!canSend} onClick={send}>发送</button>
            <button type="button" className="kui-btn kui-btn--ghost" onClick={closeReply}>取消</button>
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );
}
