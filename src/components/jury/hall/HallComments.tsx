import { useMemo, useState } from 'react';
import { cx } from '@/components/chat/desktop/runtime';
import { getDisplayName } from '@/components/ui/Avatar';
import { useKukeStore } from '@/store/kukeStore';
import type { HallComment, HallPost } from '@/types/juryHall';
import { useJury } from '../context';
import { flattenComments, useHallCommentActions, useHallComments, useHallRules } from '../data/hall';
import { errorText } from '../data/queries';
import { formatDateTime } from '../labels';
import { Card, Loading, LoadError, StateBlock } from '../widgets/Frame';
import { useHallRole } from './HallGuide';
import { HallPerson } from './HallPerson';
import type { HallReportTarget } from './HallReportModal';
import { formatAgo, hallErrorText } from './labels';

function Composer({ max, pending, error, replyTo, onCancelReply, onSubmit }: { max: number; pending: boolean; error: string | null; replyTo: HallComment | null; onCancelReply: () => void; onSubmit: (content: string, done: () => void) => void }): JSX.Element {
  const me = useKukeStore((state) => state.currentUser);
  const [text, setText] = useState('');
  const content = text.trim();
  const submit = (): void => {
    if (content && !pending) {
      onSubmit(content, () => setText(''));
    }
  };
  return (
    <form className="kjr-composer" onSubmit={(event) => {
      event.preventDefault();
      submit();
    }}>
      {replyTo ? <p className="kjr-composer-to">回复 {getDisplayName(replyTo.author, '已注销用户')}<button type="button" className="kui-link" onClick={onCancelReply}>取消</button></p> : null}
      <textarea className="kui-textarea kui-scroll" rows={replyTo ? 2 : 3} value={text} aria-label={replyTo ? '回复内容' : '评论内容'} autoFocus={Boolean(replyTo)} onChange={(event) => setText(event.target.value.slice(0, max))}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            submit();
          }
        }}
        placeholder={replyTo ? '写下你的回复' : '说说你的看法。就事论事，对规则提意见，不对人；不要讨论具体的未结案件。'} />
      {error ? <p className="kui-note kui-note--danger" role="alert">{error}</p> : null}
      <div className="kjr-composer-foot">
        <span className="kjr-meta">以「{getDisplayName(me, '我')}」的名义公开发表 · {text.length}/{max}</span>
        <button type="submit" className="kui-btn kui-btn--primary" data-action={replyTo ? 'submit-hall-reply' : 'submit-hall-comment'} disabled={!content || pending}>{pending ? '发表中…' : replyTo ? '回复' : '发表评论'}</button>
      </div>
    </form>
  );
}

interface ItemHandlers {
  canAct: boolean;
  /** 帖子作者的 id：他的评论带「楼主」 */
  authorId: number | null;
  replyingTo: number | null;
  deletingId: number | null;
  reported: ReadonlySet<string>;
  onReply: (comment: HallComment) => void;
  onDelete: (comment: HallComment) => void;
  onReport: (target: HallReportTarget) => void;
}

/** 一条评论（或一条回复）。实名：圆头像 + 昵称 + 层级，点头像看资料卡。 */
function CommentItem({ comment, handlers, reply = false }: { comment: HallComment; handlers: ItemHandlers; reply?: boolean }): JSX.Element {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const gone = comment.state !== 'visible';
  const deleting = handlers.deletingId === comment.id;
  const reported = Boolean(comment.reported) || handlers.reported.has(`comment:${comment.id}`);

  return (
    <li className={cx('kjr-hall-cm', reply && 'is-reply', gone && 'is-gone')} data-comment={comment.id}>
      <p className="kjr-op-head">
        <HallPerson user={comment.author} tier={comment.author_tier} size={reply ? 'xs' : 'sm'} />
        {comment.author && comment.author.id === handlers.authorId ? <span className="kui-tag">楼主</span> : null}
        {comment.mine ? <span className="kui-tag kui-tag--accent">我</span> : null}
        <time title={formatDateTime(comment.created_at)}>{formatAgo(comment.created_at)}</time>
      </p>
      <div className="kjr-hall-cm-main">
        {gone ? (
          <p className="kjr-op-gone">{comment.state === 'deleted' ? '这条评论已删除' : '这条评论被多位委员举报，已折叠，等待管理员处理'}</p>
        ) : (
          <p className="kjr-op-body">{reply && comment.reply_to ? <span className="kjr-op-to">回复 <HallPerson user={comment.reply_to} nameOnly />：</span> : null}{comment.content}</p>
        )}
        {gone ? null : (
          <p className="kjr-op-actions">
            {handlers.canAct ? <button type="button" className={cx('kjr-op-btn', handlers.replyingTo === comment.id && 'is-on')} data-action="hall-reply" onClick={() => handlers.onReply(comment)}>回复</button> : null}
            {comment.mine ? (
              confirmingDelete ? (
                <>
                  <button type="button" className="kjr-op-btn is-danger" data-action="hall-confirm-delete" disabled={deleting} onClick={() => handlers.onDelete(comment)}>{deleting ? '删除中…' : '确认删除'}</button>
                  <button type="button" className="kjr-op-btn" disabled={deleting} onClick={() => setConfirmingDelete(false)}>取消</button>
                </>
              ) : <button type="button" className="kjr-op-btn" data-action="hall-delete" onClick={() => setConfirmingDelete(true)}>删除</button>
            ) : (
              <button type="button" className="kjr-op-btn" data-action="hall-report" disabled={reported} onClick={() => handlers.onReport({ type: 'comment', id: comment.id, author: getDisplayName(comment.author, '已注销用户'), quote: comment.content ?? '' })}>{reported ? '已举报' : '举报'}</button>
            )}
          </p>
        )}
      </div>
    </li>
  );
}

/**
 * 帖子下面的评论区：实名，一层回复。评论按时间正序分页，往后翻用「加载更多」。
 * 能不能评论以服务端给的 post.can_comment 为准；不能评论时按身份说明原因。
 */
export function HallComments({ post, reported, onReport }: { post: HallPost; reported: ReadonlySet<string>; onReport: (target: HallReportTarget) => void }): JSX.Element {
  const { identity, nav } = useJury();
  const rules = useHallRules();
  const role = useHallRole();
  const query = useHallComments(post.id);
  const actions = useHallCommentActions(post.id);
  const [replyTo, setReplyTo] = useState<HallComment | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const canAct = post.can_comment && !identity.restricted;
  const { items, total } = useMemo(() => flattenComments(query.data), [query.data]);

  // 平铺的列表按 parent_id 归组。根评论一定排在它的回复前面；万一找不到根（数据不一致），就当成根评论显示
  const threads = useMemo(() => {
    const roots: Array<{ root: HallComment; replies: HallComment[] }> = [];
    const byRoot = new Map<number, { root: HallComment; replies: HallComment[] }>();
    for (const item of items) {
      const parent = item.parent_id === null ? undefined : byRoot.get(item.parent_id);
      if (parent) {
        parent.replies.push(item);
      } else {
        const thread = { root: item, replies: [] };
        byRoot.set(item.id, thread);
        roots.push(thread);
      }
    }
    return roots;
  }, [items]);

  const handlers: ItemHandlers = {
    canAct,
    authorId: post.author?.id ?? null,
    replyingTo: replyTo?.id ?? null,
    deletingId: actions.remove.isPending ? actions.remove.variables ?? null : null,
    reported,
    onReply: (comment) => {
      setReplyTo((current) => (current?.id === comment.id ? null : comment));
      actions.post.reset();
    },
    onDelete: (comment) => {
      setNotice(null);
      actions.remove.mutate(comment.id, { onError: (error) => setNotice(hallErrorText(error, rules, '删除失败，请稍后再试。')) });
    },
    onReport
  };

  const composerFor = (target: HallComment | null): JSX.Element => {
    const sameTarget = (actions.post.variables?.parentId ?? null) === (target?.id ?? null);
    return (
      <Composer
        key={target ? `reply-${target.id}` : 'root'}
        max={rules.comment_max}
        replyTo={target}
        pending={actions.post.isPending && sameTarget}
        error={actions.post.error && sameTarget ? hallErrorText(actions.post.error, rules, '发表失败，请稍后再试。') : null}
        onCancelReply={() => setReplyTo(null)}
        onSubmit={(content, done) => actions.post.mutate({ content, parentId: target?.id ?? null }, { onSuccess: () => {
          done();
          setReplyTo(null);
        } })}
      />
    );
  };

  const remaining = Math.max(0, total - items.length);
  return (
    <Card title={<>评论<span className="kjr-count">{query.data ? total : post.comment_count}</span></>} className="kjr-opinions kjr-hall-comments">
      {canAct ? composerFor(null)
        : role === 'restricted' ? <p className="kui-note kui-note--warn" data-role="comment-blocked">受处罚期间不能评论{identity.restriction?.until ? `，${formatDateTime(identity.restriction.until)} 恢复` : ''}。你仍然可以阅读。</p>
        : role === 'guest' ? <p className="kui-note" data-role="comment-blocked">评论限在任的风纪委员，你现在可以阅读。<button type="button" className="kui-link" onClick={() => nav.goSection('overview')}>了解怎样成为委员</button></p>
        : <p className="kui-note" data-role="comment-blocked">{post.state === 'hidden' ? '这个帖子已被折叠，等管理员处理期间不能评论。' : post.status === 'closed' ? '这个帖子已关闭，不能再评论。' : '这个帖子现在不能评论。'}</p>}
      {notice ? <p className="kui-note kui-note--danger" role="alert">{notice}</p> : null}
      {query.isLoading ? <Loading compact />
        : !query.data ? <LoadError compact message={errorText(query.error, '评论加载失败，请稍后再试。')} onRetry={() => void query.refetch()} />
        : threads.length === 0 ? (
          <StateBlock icon="message" title="还没有评论" compact>{canAct ? '来说第一句。' : '这个帖子下面还没有人发言。'}</StateBlock>
        ) : (
          <ul className="kjr-ops">
            {threads.map(({ root, replies }) => {
              const replyTarget = replyTo && (replyTo.id === root.id || replies.some((reply) => reply.id === replyTo.id)) ? replyTo : null;
              return (
                <li key={root.id} className="kjr-thread">
                  <ul>
                    <CommentItem comment={root} handlers={handlers} />
                    {replies.map((reply) => <CommentItem key={reply.id} comment={reply} handlers={handlers} reply />)}
                  </ul>
                  {replyTarget ? <div className="kjr-thread-reply">{composerFor(replyTarget)}</div> : null}
                </li>
              );
            })}
          </ul>
        )}
      {query.hasNextPage ? (
        <div className="kjr-hall-more">
          <button type="button" className="kui-btn kui-btn--sm" data-action="hall-more-comments" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>{query.isFetchingNextPage ? '加载中…' : `加载更多评论（还有 ${remaining} 条）`}</button>
        </div>
      ) : null}
    </Card>
  );
}
