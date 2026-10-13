import { useState } from 'react';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import type { TeamupComment, User } from '@/types/api';
import { formatMessageDateTime } from '@/utils/dateTime';
import type { CommentThreadData } from '../teamupModel';
import type { TeamupDetailState } from '../useTeamupDetail';

const COMMENT_MAX = 500;
/** 一条留言下面默认露出几条回复，其余的收起来 */
const VISIBLE_REPLIES = 2;

interface CommentActions {
  currentUser: User;
  /** 名片主人可以删别人的留言 */
  canModerate: boolean;
  onReply: (comment: TeamupComment) => void;
  onLike: (commentId: number) => void;
  onDelete: (commentId: number) => void;
  onOpenUser: (userId: number) => void;
}

function CommentItem({ comment, nested = false, actions }: { comment: TeamupComment; nested?: boolean; actions: CommentActions }): JSX.Element {
  const { currentUser } = actions;
  const author = comment.author ?? { id: comment.author_id, username: `用户 ${comment.author_id}` };
  const mine = comment.author_id === currentUser.id;
  return (
    <div className={`ktu-comment ${nested ? 'is-nested' : ''}`}>
      <button type="button" className="ktu-comment-avatar" onClick={() => actions.onOpenUser(comment.author_id)} aria-label={`查看 ${getDisplayName(author)} 的主页`}>
        <Avatar user={author} size={nested ? 'sm' : 'message'} />
      </button>
      <div className="ktu-comment-main">
        <div className="ktu-comment-who">
          <button type="button" onClick={() => actions.onOpenUser(comment.author_id)}>{getDisplayName(author)}</button>
          {nested && comment.parent_author ? <span>回复 <b>@{getDisplayName(comment.parent_author, `评论 ${comment.parent_id}`)}</b></span> : null}
          {mine && comment.moderation_status === 'pending' ? <span className="kui-tag kui-tag--warn">审核中</span> : null}
        </div>
        <p className="ktu-comment-text">{comment.content}</p>
        <div className="ktu-comment-meta">
          <time>{formatMessageDateTime(comment.created_at)}</time>
          <button type="button" className={comment.liked_by_me ? 'is-liked' : undefined} aria-pressed={comment.liked_by_me} onClick={() => actions.onLike(comment.id)}><Icon name="like" />{comment.like_count || 0}</button>
          <button type="button" onClick={() => actions.onReply(comment)}>回复</button>
          {mine || actions.canModerate ? <button type="button" className="is-danger" onClick={() => actions.onDelete(comment.id)}>删除</button> : null}
        </div>
      </div>
    </div>
  );
}

function CommentThread({ thread, actions }: { thread: CommentThreadData; actions: CommentActions }): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const replies = expanded ? thread.replies : thread.replies.slice(0, VISIBLE_REPLIES);
  return (
    <li className="ktu-thread">
      <CommentItem comment={thread.root} actions={actions} />
      {thread.replies.length > 0 ? (
        <div className="ktu-replies">
          {replies.map((reply) => <CommentItem key={reply.id} comment={reply} nested actions={actions} />)}
          {thread.replies.length > VISIBLE_REPLIES ? (
            <button type="button" className="kui-link ktu-replies-toggle" onClick={() => setExpanded((value) => !value)}>
              {expanded ? '收起回复' : `共 ${thread.replies.length} 条回复，点击查看`}
            </button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/** 名片下面的留言板：输入框在上，留言按楼排在下面，回复只展开两层。 */
export function TeamupComments({ detail, count, currentUser, canModerate, onOpenUser }: { detail: TeamupDetailState; count: number; currentUser: User; canModerate: boolean; onOpenUser: (userId: number) => void }): JSX.Element {
  const { replyTo, commentText } = detail;
  const actions: CommentActions = {
    currentUser,
    canModerate,
    onReply: detail.setReplyTo,
    onLike: (commentId) => detail.likeMutation.mutate(commentId),
    onDelete: (commentId) => detail.deleteCommentMutation.mutate(commentId),
    onOpenUser
  };

  return (
    <section className="ktu-panel ktu-comments">
      <div className="kui-group">
        <div className="kui-group-title"><span>留言板</span><span>{count} 条</span></div>
        {replyTo ? (
          <p className="ktu-reply-to">
            <span>回复 <b>@{getDisplayName(replyTo.author)}</b></span>
            <button type="button" className="kui-icon-btn" aria-label="取消回复" onClick={() => detail.setReplyTo(null)}><Icon name="close" className="h-3.5 w-3.5" /></button>
          </p>
        ) : null}
        <div className="ktu-composer">
          <Avatar user={currentUser} size="sm" />
          <input
            ref={detail.composerRef}
            className="kui-input"
            value={commentText}
            maxLength={COMMENT_MAX}
            placeholder={replyTo ? `回复 ${getDisplayName(replyTo.author)}...` : '留下你的留言...'}
            aria-label="留言内容"
            onChange={(event) => detail.setCommentText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                detail.submitComment();
              }
            }}
          />
          <button type="button" className="kui-btn kui-btn--primary" disabled={!commentText.trim() || detail.commentMutation.isPending} onClick={detail.submitComment}>发送</button>
        </div>
        {detail.threads.length === 0
          ? <p className="kui-empty">还没有留言，来抢沙发</p>
          : <ul className="ktu-threads">{detail.threads.map((thread) => <CommentThread key={thread.root.id} thread={thread} actions={actions} />)}</ul>}
      </div>
    </section>
  );
}
