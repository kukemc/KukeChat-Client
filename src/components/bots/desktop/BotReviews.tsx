import { useEffect, useState } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import type { Bot, BotReview, BotReviewReply } from '@/types/api';
import { useBotReviews, useReplyBotReview, useSaveBotReview, useToggleBotReviewLike } from '../botQueries';
import { errorMessage, formatBotDate, formatCount, ratingLabel, userName } from '../botShared';
import { Card, Stars, StarsInput, cx, type BotActions } from './botUi';

const REVIEW_MAX = 500;
// 回复默认只露出前几条，其余的点开再看
const REPLIES_PREVIEW = 2;

interface ReviewItemProps {
  botId: number;
  review: BotReview;
  /** 传了就是在渲染这条评价下面的一条回复 */
  reply?: BotReviewReply;
  actions: BotActions;
}

/** 一条评价或一条回复：两者只差星级和「回复谁」那一截，赞和回复的操作是一样的。 */
function ReviewItem({ botId, review, reply, actions }: ReviewItemProps): JSX.Element {
  const [replying, setReplying] = useState(false);
  const [draft, setDraft] = useState('');
  const like = useToggleBotReviewLike(botId);
  const send = useReplyBotReview(botId);
  const item = reply ?? review;
  const status = item.moderation_status ?? 'approved';
  const author = item.user ?? { id: item.user_id, username: `用户 ${item.user_id}` };
  const name = userName(author);

  function closeReply(): void {
    setReplying(false);
    setDraft('');
  }

  return (
    <div className={cx('kcb-review', reply && 'is-reply')}>
      <button type="button" className="kcb-review-avatar" aria-label={`打开 ${name} 的主页`} onClick={() => actions.openUser(item.user_id)}><Avatar user={author} size="sm" /></button>
      <div className="kcb-review-main">
        <div className="kcb-review-head">
          <button type="button" className="kcb-review-name" onClick={() => actions.openUser(item.user_id)}>{name}</button>
          {reply?.parent_author ? <span className="kcb-review-to">回复 {userName(reply.parent_author)}</span> : null}
          {reply ? null : <Stars value={review.rating} />}
          {status === 'pending' ? <span className="kui-tag kui-tag--warn">审核中</span> : null}
          {status === 'rejected' ? <span className="kui-tag kui-tag--danger">未通过</span> : null}
          <time>{formatBotDate(item.updated_at || item.created_at) || formatBotDate(item.created_at)}</time>
        </div>
        {item.content || !reply ? <p className={cx('kcb-review-text', !item.content && 'is-empty')}>{item.content || '只打了分，没有写评价'}</p> : null}
        <div className="kcb-review-actions">
          <button type="button" className={item.liked_by_me ? 'is-on' : undefined} aria-pressed={item.liked_by_me} disabled={like.isPending} onClick={() => like.mutate({ reviewId: review.id, replyId: reply?.id }, { onError: actions.report })}>
            <Icon name="like" className="h-3.5 w-3.5" />{item.like_count || '赞'}
          </button>
          <button type="button" className={replying ? 'is-on' : undefined} onClick={() => (replying ? closeReply() : setReplying(true))}>回复</button>
        </div>
        {replying ? (
          <form className="kcb-reply-form" onSubmit={(event) => {
            event.preventDefault();
            if (draft.trim() && !send.isPending) {
              send.mutate({ reviewId: review.id, content: draft, parentId: reply ? reply.id : null }, { onSuccess: closeReply });
            }
          }}>
            <input className="kui-input" value={draft} maxLength={REVIEW_MAX} placeholder={`回复 ${name}`} aria-label={`回复 ${name}`} autoFocus onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => {
              if (event.key === 'Escape') {
                closeReply();
              }
            }} />
            <button type="submit" className="kui-btn kui-btn--primary" disabled={!draft.trim() || send.isPending}>{send.isPending ? '发送中…' : '发送'}</button>
            <button type="button" className="kui-btn kui-btn--ghost" onClick={closeReply}>取消</button>
            {send.error ? <p className="kui-note kui-note--danger" role="alert">{errorMessage(send.error)}</p> : null}
          </form>
        ) : null}
      </div>
    </div>
  );
}

function ReviewThread({ botId, review, actions }: { botId: number; review: BotReview; actions: BotActions }): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const replies = review.replies ?? [];
  const visible = expanded ? replies : replies.slice(0, REPLIES_PREVIEW);
  return (
    <li className="kcb-thread">
      <ReviewItem botId={botId} review={review} actions={actions} />
      {replies.length > 0 ? (
        <div className="kcb-replies">
          {visible.map((reply) => <ReviewItem key={reply.id} botId={botId} review={review} reply={reply} actions={actions} />)}
          {replies.length > REPLIES_PREVIEW ? <button type="button" className="kui-link kcb-replies-more" onClick={() => setExpanded((value) => !value)}>{expanded ? '收起回复' : `展开全部 ${replies.length} 条回复`}</button> : null}
        </div>
      ) : null}
    </li>
  );
}

/** 自己的评分和评价。可以反复改，所以已经评过的话把上次的内容填回来。 */
function MyReview({ bot }: { bot: Bot }): JSX.Element {
  const [rating, setRating] = useState(5);
  const [content, setContent] = useState('');
  const save = useSaveBotReview(bot.id);
  const mine = bot.my_review;

  useEffect(() => {
    if (mine) {
      setRating(mine.rating);
      setContent(mine.content ?? '');
    }
  }, [mine]);

  return (
    <form className="kcb-myreview" onSubmit={(event) => {
      event.preventDefault();
      if (!save.isPending) {
        save.mutate({ rating, content });
      }
    }}>
      <div className="kcb-myreview-rate">
        <span>我的评分</span>
        <StarsInput value={rating} onChange={setRating} />
        <b>{ratingLabel(rating)} 分</b>
      </div>
      <textarea className="kui-textarea kui-scroll" rows={3} value={content} maxLength={REVIEW_MAX} placeholder="用下来怎么样？写两句给其他群主参考，之后可以随时修改" aria-label="我的评价" onChange={(event) => setContent(event.target.value)} />
      {save.error ? <p className="kui-note kui-note--danger" role="alert">{errorMessage(save.error)}</p> : null}
      <div className="kcb-myreview-foot">
        <span>{mine?.moderation_status === 'pending' ? '上次提交的评价还在审核' : `${content.length}/${REVIEW_MAX}`}</span>
        <button type="submit" className="kui-btn kui-btn--primary" disabled={save.isPending}>{save.isPending ? '提交中…' : mine ? '更新评价' : '发布评价'}</button>
      </div>
    </form>
  );
}

/** 详情页的评价区：自己的评分（创建者不能给自己打分）和所有人的评价、回复。 */
export function BotReviews({ bot, isOwner, actions }: { bot: Bot; isOwner: boolean; actions: BotActions }): JSX.Element {
  const reviewsQuery = useBotReviews(bot.id);
  const reviews = reviewsQuery.data ?? [];

  return (
    <Card title="评价" className="kcb-card--tail" aside={<span>{formatCount(bot.review_count)}</span>}>
      {isOwner ? <p className="kui-note kcb-review-note">创建者不能给自己的机器人评分。</p> : <MyReview bot={bot} />}
      {reviewsQuery.isLoading ? <p className="kcb-card-empty">正在加载评价…</p> : null}
      {reviewsQuery.error ? <p className="kui-note kui-note--danger" role="alert">{errorMessage(reviewsQuery.error)}</p> : null}
      {!reviewsQuery.isLoading && !reviewsQuery.error && reviews.length === 0 ? <p className="kcb-card-empty">还没有人评价</p> : null}
      {reviews.length > 0 ? <ul className="kcb-reviews">{reviews.map((review) => <ReviewThread key={review.id} botId={bot.id} review={review} actions={actions} />)}</ul> : null}
    </Card>
  );
}
