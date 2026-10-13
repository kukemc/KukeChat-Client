import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { cx } from '@/components/chat/desktop/runtime';
import { getDisplayName } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import type { HallPost } from '@/types/juryHall';
import { useJury } from '../context';
import { hallKeys, useHallPost, useHallPostActions, useHallReport, useHallRules } from '../data/hall';
import { errorCode, errorStatus, errorText } from '../data/queries';
import { formatDateTime } from '../labels';
import { Card, Loading, LoadError, SectionFrame, StateBlock } from '../widgets/Frame';
import { HallComments } from './HallComments';
import { HallGuide, RealNameNotice } from './HallGuide';
import { HallPerson } from './HallPerson';
import { HallReportModal, type HallReportTarget } from './HallReportModal';
import { formatAgo, HALL_KIND_LABEL, HALL_KIND_SHORT, hallErrorText, HIDDEN_POST_TEXT, isHiddenPost, reportDoneText, statusTag } from './labels';
import { ProposalPanel } from './Proposal';

function PostCard({ post, reported, onEdit, onDeleted, onReport }: { post: HallPost; reported: boolean; onEdit: () => void; onDeleted: () => void; onReport: (target: HallReportTarget) => void }): JSX.Element {
  const rules = useHallRules();
  const actions = useHallPostActions();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const tag = statusTag(post);
  const hidden = isHiddenPost(post);
  const edited = post.updated_at && post.updated_at !== post.created_at;
  const authorName = getDisplayName(post.author, '已注销用户');

  return (
    <Card className="kjr-hall-post">
      <p className="kjr-hall-tags">
        {post.pinned ? <span className="kui-tag kui-tag--accent"><Icon name="pin" className="h-3 w-3" />置顶</span> : null}
        <span className={cx('kui-tag', post.kind === 'announcement' && 'kui-tag--accent')}>{HALL_KIND_SHORT[post.kind]}</span>
        {tag ? <span className={cx('kui-tag', tag.tone)}>{tag.text}</span> : null}
        {hidden ? <span className="kui-tag kui-tag--warn">已折叠</span> : null}
      </p>
      <h2 className="kjr-hall-post-title">{post.title}</h2>
      <p className="kjr-hall-byline">
        <HallPerson user={post.author} tier={post.author_tier} admin={post.kind === 'announcement'} />
        <span className="kjr-hall-byline-time"><time title={formatDateTime(post.created_at)}>发布于 {formatDateTime(post.created_at)}</time>{edited ? <span> · 最后活动 {formatAgo(post.updated_at)}</span> : null}</span>
      </p>
      {/* 被折叠的帖子没有正文（content 为 null），标题是服务端给的占位文字 */}
      {hidden || post.content === null
        ? <StateBlock icon="eyeOff" title="这条帖子已折叠" compact><span data-role="hall-hidden">{HIDDEN_POST_TEXT}管理员确认没有问题的话会恢复。</span></StateBlock>
        : <div className="kjr-hall-post-body">{post.content}</div>}
      {post.kind !== 'proposal' && post.admin_note ? <p className="kui-note"><b>管理员说明：</b>{post.admin_note}</p> : null}
      {actions.remove.error ? <p className="kui-note kui-note--danger" role="alert">{hallErrorText(actions.remove.error, rules, '删除失败，请稍后再试。')}</p> : null}
      <p className="kjr-op-actions kjr-hall-post-foot">
        {post.can_edit ? <button type="button" className="kjr-op-btn" data-action="hall-edit-post" onClick={onEdit}><Icon name="edit" className="h-3.5 w-3.5" />编辑</button> : null}
        {/* 能不能改 / 删以服务端的 can_edit / can_delete 为准，这里只是把「为什么不能」说出来 */}
        {post.mine && !post.can_edit && !hidden && post.kind === 'proposal' ? <span className="kjr-meta" data-role="hall-locked">{post.status === 'open' ? `已经有人表决，提案不能再修改${post.can_delete ? '；表决结束前可以撤回' : ''}` : '表决已经出结果，提案不能再修改或删除'}</span> : null}
        {post.mine && hidden ? <span className="kjr-meta" data-role="hall-locked">帖子被折叠期间不能修改</span> : null}
        {post.can_delete ? (
          confirmingDelete ? (
            <>
              <button type="button" className="kjr-op-btn is-danger" data-action="hall-confirm-delete-post" disabled={actions.remove.isPending} onClick={() => actions.remove.mutate(post.id, { onSuccess: onDeleted })}>{actions.remove.isPending ? '删除中…' : '确认删除这个帖子'}</button>
              <button type="button" className="kjr-op-btn" disabled={actions.remove.isPending} onClick={() => setConfirmingDelete(false)}>取消</button>
            </>
          ) : <button type="button" className="kjr-op-btn" data-action="hall-delete-post" onClick={() => setConfirmingDelete(true)}><Icon name="trash" className="h-3.5 w-3.5" />{post.kind === 'proposal' ? '撤回提案' : '删除'}</button>
        ) : null}
        {post.mine ? null : <button type="button" className="kjr-op-btn" data-action="hall-report-post" disabled={reported} onClick={() => onReport({ type: 'post', id: post.id, author: authorName, quote: post.title })}><Icon name="flag" className="h-3.5 w-3.5" />{reported ? '已举报' : '举报'}</button>}
      </p>
    </Card>
  );
}

/** 议事厅的一个帖子：正文、（提案的）表决面板、评论区。 */
export function HallPostView({ postId, onBack, onEdit, onGone }: { postId: number; onBack: () => void; onEdit: () => void; /** 正看着的帖子被删掉了：回列表，并在列表上说明 */ onGone: () => void }): JSX.Element {
  const { identity } = useJury();
  const queryClient = useQueryClient();
  const rules = useHallRules();
  const query = useHallPost(postId);
  const actions = useHallPostActions();
  const report = useHallReport();
  const [reporting, setReporting] = useState<HallReportTarget | null>(null);
  // 「我举报过没有」以帖子 / 评论自带的 reported 为准；刚举报完、缓存还没更新的这一阵先自己记着
  const [reported, setReported] = useState<ReadonlySet<string>>(() => new Set());
  const [toast, setToast] = useState<string | null>(null);
  const post = query.data;

  const markReported = (target: HallReportTarget): void => setReported((current) => new Set(current).add(`${target.type}:${target.id}`));
  const vote = post?.vote ?? null;

  // 帖子本来开着，重拉时变成了 404：它刚被作者或管理员删掉（jury.hall.changed 的 closed 之后会走到这里）。
  // 缓存里还留着旧内容，不能接着显示，也不该给一个报错页 —— 回到列表并说明。直接点开一个不存在的帖子不走这里（那时手里没有旧内容）
  const deleted = Boolean(post) && errorStatus(query.error) === 404;
  useEffect(() => {
    if (deleted) {
      queryClient.removeQueries({ queryKey: hallKeys.post(postId) });
      queryClient.removeQueries({ queryKey: hallKeys.comments(postId) });
      onGone();
    }
  }, [deleted, onGone, postId, queryClient]);

  return (
    <SectionFrame title={post ? HALL_KIND_LABEL[post.kind] : '议事厅'} subtitle="议事厅 · 实名公开讨论" onBack={onBack}>
      {query.isLoading ? <Loading />
        : !post ? (
          errorStatus(query.error) === 404
            ? <StateBlock icon="announcement" title="这个帖子不存在" actions={<button type="button" className="kui-btn" onClick={onBack}>回到议事厅</button>}>它可能已经被作者或管理员删除。</StateBlock>
            : <LoadError message={errorText(query.error, '帖子加载失败，请稍后再试。')} onRetry={() => void query.refetch()} />
        ) : (
          <div className={cx('kjr-hall-layout', vote && 'is-proposal')} data-post={post.id} data-status={post.status}>
            <div className="kjr-hall-main">
              {toast ? <p className="kui-note" role="status">{toast}</p> : null}
              <PostCard post={post} reported={Boolean(post.reported) || reported.has(`post:${post.id}`)} onEdit={onEdit} onDeleted={onBack} onReport={(target) => {
                report.reset();
                setReporting(target);
              }} />
              <HallComments post={post} reported={reported} onReport={(target) => {
                report.reset();
                setReporting(target);
              }} />
            </div>
            <aside className="kjr-hall-side">
              {vote ? (
                <ProposalPanel
                  post={post}
                  vote={vote}
                  pending={actions.vote.isPending ? actions.vote.variables?.vote ?? null : null}
                  error={actions.vote.error ? hallErrorText(actions.vote.error, rules, '表决提交失败，请稍后再试。') : null}
                  // 表决刚结束（409 vote_closed）时，数据层会把帖子的最新状态拉回来
                  onVote={(ballot) => actions.vote.mutate({ postId: post.id, vote: ballot })}
                />
              ) : <RealNameNotice />}
              <HallGuide />
            </aside>
          </div>
        )}
      {reporting ? (
        <HallReportModal
          target={reporting}
          reasons={rules.report_reasons}
          pending={report.isPending}
          error={report.error && errorCode(report.error) !== 'already_reported' ? hallErrorText(report.error, rules, '举报提交失败，请稍后再试。', 'report') : null}
          onClose={() => setReporting(null)}
          onSubmit={(reason, details) => report.mutate({ target_type: reporting.type, target_id: reporting.id, reason, ...(details ? { details } : {}) }, {
            onSuccess: (result) => {
              markReported(reporting);
              setToast(reportDoneText(result?.state, identity.isJuror, rules));
              setReporting(null);
            },
            onError: (error) => {
              // 重复举报不算失败：直接当作已经举报过
              if (errorCode(error) === 'already_reported') {
                markReported(reporting);
                setToast(hallErrorText(error, rules, ''));
                setReporting(null);
              }
            }
          })}
        />
      ) : null}
    </SectionFrame>
  );
}
