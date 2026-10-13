import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import type { Post } from '@/types/api';
import { type OpenUserSpace, formatTime, notificationText } from '../postModel';
import { usePostLikes, usePostNotificationActions, usePostNotifications } from '../postQueries';
import { PostDialog } from './PostDialog';

/** 谁赞了这条动态。点人进他的空间。 */
export function LikesDialog({ post, onClose, onOpenUserSpace }: { post: Post; onClose: () => void; onOpenUserSpace: OpenUserSpace }): JSX.Element {
  const likesQuery = usePostLikes(post.id);
  const likes = likesQuery.data ?? [];

  return (
    <PostDialog title="点赞列表" note={`${post.like_count} 人赞了这条动态`} size="narrow" list onClose={onClose}>
      {likes.length === 0 ? <p className="kui-empty">{likesQuery.isLoading ? '正在加载…' : '还没有点赞'}</p> : likes.map((like) => (
        <button key={like.id} type="button" className="kpo-line" onClick={() => {
          onClose();
          onOpenUserSpace(like.user, like.user_id);
        }}>
          <Avatar user={like.user} size="sm" />
          <span className="kpo-line-text"><strong>{getDisplayName(like.user, `用户 ${like.user_id}`)}</strong></span>
          <small className="kui-muted">{formatTime(like.created_at)}</small>
        </button>
      ))}
    </PostDialog>
  );
}

/** 互动通知：谁赞了、评论了、转发了、提到了我。点一条跳到对应的动态。 */
export function NotificationsDialog({ onClose, onOpenPost, onOpenUserSpace }: { onClose: () => void; onOpenPost: (postId: number) => void; onOpenUserSpace: OpenUserSpace }): JSX.Element {
  const notificationsQuery = usePostNotifications(50);
  const { readAll, readOne } = usePostNotificationActions();
  const notifications = notificationsQuery.data?.items ?? [];
  const unreadCount = notificationsQuery.data?.unread_count ?? 0;

  return (
    <PostDialog title="动态互动" note={`${unreadCount} 条未读`} list onClose={onClose} headerExtra={<button type="button" className="kui-btn kui-btn--sm kui-btn--ghost" disabled={readAll.isPending || unreadCount === 0} onClick={() => readAll.mutate()}>全部已读</button>}>
      {notificationsQuery.isLoading ? <p className="kui-empty">正在加载互动…</p> : null}
      {!notificationsQuery.isLoading && notifications.length === 0 ? <p className="kui-empty">还没有新的动态互动</p> : null}
      {notifications.map((notification) => {
        const excerpt = notification.comment?.content || notification.post?.content;
        function open(): void {
          if (!notification.read_at) {
            readOne.mutate(notification.id);
          }
          onClose();
          onOpenPost(notification.post_id);
        }
        return (
          // 整行可点，头像另是一个按钮（进空间），所以外层不能再是 button
          <div key={notification.id} role="button" tabIndex={0} className={`kpo-line is-notice is-action ${notification.read_at ? '' : 'is-unread'}`} onClick={open} onKeyDown={(event) => {
            if (event.key === 'Enter') {
              open();
            }
          }}>
            <button type="button" className="kpo-avatar-btn" aria-label="进入 Ta 的空间" onClick={(event) => {
              event.stopPropagation();
              onClose();
              onOpenUserSpace(notification.actor, notification.actor_id);
            }}>
              <Avatar user={notification.actor} size="sm" />
            </button>
            <span className="kpo-line-text">
              <strong>{notificationText(notification)}</strong>
              {excerpt ? <span className="kpo-excerpt">{excerpt}</span> : null}
              <small>{formatTime(notification.created_at)}</small>
            </span>
            {notification.read_at ? null : <span className="kui-dot" aria-label="未读" />}
          </div>
        );
      })}
    </PostDialog>
  );
}
