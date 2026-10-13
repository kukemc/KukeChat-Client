import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { voteAppealReview } from '@/api/jurySenior';
import { Icon } from '@/components/ui/Icon';
import type { AppealReviewView, AppealVoteBody, AppealVoteResult } from '@/types/jurySenior';
import { useJury } from '../context';
import { errorCode, errorStatus, errorText, juryKeys, useModerationRules } from '../data/queries';
import { appealRules, seniorKeys, useNextAppealReview } from '../data/senior';
import { formatDateTime, formatRemaining, levelText, OUTCOME_LABEL, SOURCE_LABEL } from '../labels';
import { CaseEvidence } from '../widgets/Evidence';
import { Card, Loading, StateBlock } from '../widgets/Frame';
import { KindTag, TallyBar } from '../widgets/Tags';
import { AppealVotePanel } from './AppealVotePanel';
import { appealVoteLabel, PENALTY_SOURCE_LABEL, penaltyLabel, REVIEW_TYPE_LABEL } from './labels';
import { OriginOpinions } from './OriginReview';
import { SeniorIdle, seniorIdleReason } from './SeniorIdle';
import { useVoteKeys, type VoteKeyTarget } from './useVoteKeys';

/** 复审的对象：申诉是「原处罚」，复议是「原结论」。 */
function Subject({ review }: { review: AppealReviewView }): JSX.Element {
  if (review.type === 'reconsider') {
    const verdict = review.verdict;
    return (
      <Card title="被质疑的结论" aside={<span className="kui-tag kui-tag--ok">{verdict ? OUTCOME_LABEL[verdict.outcome] : '不违规'}</span>}>
        <dl className="kjr-review-facts">
          <div><dt>原结论</dt><dd>认定不违规，举报不成立</dd></div>
          <div><dt>结论来源</dt><dd>{verdict ? SOURCE_LABEL[verdict.source as keyof typeof SOURCE_LABEL] ?? verdict.source : '—'}</dd></div>
          <div><dt>定案时间</dt><dd>{formatDateTime(verdict?.closed_at)}</dd></div>
        </dl>
      </Card>
    );
  }
  return (
    <Card title="原处罚" aside={<span className="kui-tag kui-tag--danger">{review.category_label ?? '违规'}{review.level ? ` · ${levelText(review.level)}` : ''}</span>}>
      <dl className="kjr-review-facts">
        <div><dt>违规类别</dt><dd>{review.category_label ?? '—'}</dd></div>
        <div><dt>等级</dt><dd>{levelText(review.level) || '—'}</dd></div>
        <div><dt>处置</dt><dd>{penaltyLabel(review.penalty)}</dd></div>
        <div><dt>谁给的</dt><dd>{review.source ? PENALTY_SOURCE_LABEL[review.source] ?? review.source : '—'}</dd></div>
      </dl>
    </Card>
  );
}

/** 当事人自己写的话：申诉理由，或举报人的复议理由。 */
function Statement({ review }: { review: AppealReviewView }): JSX.Element {
  const reconsider = review.type === 'reconsider';
  const text = reconsider ? review.reconsider_text : review.appeal_text;
  return (
    <Card className="kjr-review-statement" title={reconsider ? '举报人的复议理由' : '申诉理由'} aside={<span className="kjr-meta">{formatDateTime(reconsider ? review.requested_at : review.appealed_at)} 提交</span>}>
      {text ? <blockquote className="kjr-quote">{text}</blockquote> : <p className="kjr-msg-note">没有写理由</p>}
      <p className="kjr-quiet">{reconsider ? '这是举报人的一面之词，他看不到原审的讨论。请对照内容和原审的理由来判断。' : '这是被处罚人的一面之词。请对照内容本身判断它成不成立，不要去猜他是谁。'}</p>
    </Card>
  );
}

function Content({ review, onViewerOpenChange }: { review: AppealReviewView; onViewerOpenChange: (open: boolean) => void }): JSX.Element {
  const { config } = useJury();
  const hasCase = review.messages.length > 0 || review.post !== null;
  return (
    <Card title={review.type === 'reconsider' ? '被举报的内容' : '被处罚的内容'} aside={<span className="kjr-meta">已匿名</span>}>
      {hasCase ? <CaseEvidence view={{ case_id: review.review_id, kind: review.kind, messages: review.messages, post: review.post }} contextNear={config.config.rules.context_near} onViewerOpenChange={onViewerOpenChange} />
        : review.content ? (
          <article className="kjr-post" aria-label="被处罚的内容">
            <header><span className="kjr-msg-flag">被处罚的那一条</span></header>
            {review.content.text ? <p>{review.content.text}</p> : <p className="kjr-msg-note">没有文字</p>}
            {review.content.image_count > 0 ? <p className="kjr-withheld"><Icon name="image" className="h-4 w-4" />原文带 {review.content.image_count} 张图片，这里不展示。</p> : null}
          </article>
        ) : <p className="kjr-msg-note">没有可以展示的内容</p>}
      {!hasCase && review.content ? <p className="kjr-quiet kjr-review-nocase">这是机器自动给出的处罚，没有经过委员评审，所以只有这一条内容，没有上下文。</p> : null}
    </Card>
  );
}

function Origin({ review }: { review: AppealReviewView }): JSX.Element {
  const origin = review.origin;
  if (!origin) {
    return <Card title="原审"><StateBlock icon="bot" title="这条处罚没有经过委员评审" compact>它是机器审核直接给出的，没有票数分布，也没有观点。你们是第一批看它的人。</StateBlock></Card>;
  }
  return (
    <Card title="原审" aside={<span className="kjr-meta">只读 · 原审委员在本案里的匿名代号</span>}>
      {origin.tally ? <><p className="kjr-sub">原审票数分布</p><TallyBar tally={origin.tally} /></> : null}
      <div className="kjr-card-sep" />
      <OriginOpinions opinions={origin.opinions} />
    </Card>
  );
}

interface Done {
  review: AppealReviewView;
  body: AppealVoteBody;
  result: AppealVoteResult;
}

function DoneView({ done, onNext, onHistory }: { done: Done; onNext: () => void; onHistory: () => void }): JSX.Element {
  const { config } = useJury();
  const rules = appealRules(config.config);
  const { review, body, result } = done;
  const type = review.type ?? 'appeal';
  const who = type === 'reconsider' ? '举报人' : '申诉人';
  return (
    <div className="kjr-body kui-scroll" data-phase="after">
      <div className="kjr-wrap">
        <StateBlock icon="check" title={`复审 #${review.review_id} · 你的意见已提交`} actions={(
          <>
            <button type="button" className="kui-btn" data-action="review-history" onClick={onHistory}>复审记录</button>
            <button type="button" className="kui-btn kui-btn--primary" data-action="next-review" onClick={onNext}>下一件</button>
          </>
        )}>
          <p data-result={result.settled ? result.outcome ?? '' : 'open'}>
            你投的是「{appealVoteLabel(body.vote, type)}」。
            {result.settled && result.outcome
              ? `已有 ${rules.consensus_votes} 票相同，复审结果：${appealVoteLabel(result.outcome, type)}。结果已通知${who}。`
              : `还差其他复审委员的票，${rules.consensus_votes} 票相同即出结果，到时会通知${who}。结论可以在「复审记录」里看到。`}
          </p>
          {result.reward && result.reward.points > 0 ? <p className="kjr-meta">风纪值 +{result.reward.points}</p> : null}
        </StateBlock>
      </div>
    </div>
  );
}

/**
 * 申诉复审（含举报人复议）：一次一件。左边依次是当事人的理由、原处罚 / 原结论、匿名内容、原审的分布和观点；
 * 右边是复审意见。投完只有结果，没有观点区 —— 复审的理由留给管理员和其他复审委员。
 */
export function AppealDesk({ onHistory }: { onHistory: () => void }): JSX.Element {
  const { identity, config } = useJury();
  const queryClient = useQueryClient();
  const moderation = useModerationRules().data;
  const panelRef = useRef<VoteKeyTarget>(null);
  const keys = useVoteKeys(panelRef);
  const [done, setDone] = useState<Done | null>(null);
  const [skipped, setSkipped] = useState<string | null>(null);
  // 申诉开关没开时，这个队列里只可能有举报人复议；两样都没有就不去领
  const appealsOn = config.config.switches.appeals;
  const enabled = appealsOn || config.has('reconsider');
  const query = useNextAppealReview(done === null && enabled && identity.isSenior && !identity.restricted);
  const review = query.data ?? null;
  const rules = appealRules(config.config);

  const vote = useMutation({
    mutationFn: ({ target, body }: { target: AppealReviewView; body: AppealVoteBody }) => voteAppealReview(target.review_id, body),
    onSuccess: (result, variables) => {
      releasedRef.current = variables.target.review_id;
      queryClient.removeQueries({ queryKey: seniorKeys.appealNext });
      void queryClient.invalidateQueries({ queryKey: seniorKeys.appealsMine });
      void queryClient.invalidateQueries({ queryKey: juryKeys.me });
      setSkipped(null);
      setDone({ review: variables.target, body: variables.body, result });
    },
    onError: (error, variables) => {
      // 这一件已经不在手上了，或者手里这份已经过时：说明原因，换下一件。
      // 404 review_not_found 没分给我 / 409 review_closed 已结束或已转管理员、already_voted 已投过 / 422 invalid_vote 选项和这件复审对不上
      const code = errorCode(error) ?? '';
      const status = errorStatus(error);
      if (status === 404 || status === 409 || code === 'invalid_vote') {
        const why = code === 'review_closed' ? '已经结束，或者已经转给管理员处理'
          : code === 'already_voted' ? '你已经投过了，这次没有重复记票'
          : code === 'invalid_vote' ? '手里这份已经过时，选项对不上，已为你重新领取'
          : '已经不在你手上了（可能已经改派）';
        setSkipped(`复审 #${variables.target.review_id} ${why}。`);
        releasedRef.current = variables.target.review_id;
        queryClient.removeQueries({ queryKey: seniorKeys.appealNext });
        void queryClient.invalidateQueries({ queryKey: juryKeys.me });
      }
    }
  });

  const reviewId = review?.review_id ?? null;
  // 手里这一件不是我自己交出去的，却换成了别的或者没了：实时事件 jury.queue.changed 会重拉队列，
  // 另外两位先投出了结果、或者这件到期转给管理员时就会这样。要说一声，不能悄悄把正在看的换掉
  const heldRef = useRef<number | null>(null);
  const releasedRef = useRef<number | null>(null);
  useEffect(() => {
    const held = heldRef.current;
    heldRef.current = reviewId;
    if (held !== null && held !== reviewId && releasedRef.current !== held) {
      setSkipped(`复审 #${held} 已经不在你手上了：其他复审委员已经投出了结果，或者它已经转给管理员。${reviewId !== null ? '下面是下一件。' : ''}`);
    }
  }, [reviewId]);
  const focusRoot = keys.rootRef;
  useEffect(() => {
    focusRoot.current?.focus({ preventScroll: true });
  }, [focusRoot, reviewId]);

  if (done) {
    return <DoneView done={done} onHistory={onHistory} onNext={() => {
      vote.reset();
      setDone(null);
    }} />;
  }
  if (!enabled && identity.isSenior && !identity.restricted) {
    return (
      <div className="kjr-body kui-scroll" data-phase="disabled">
        <div className="kjr-wrap">
          <StateBlock icon="clock" title="申诉复审还没有启用">
            这项功能由管理员决定什么时候打开。现在所有申诉都直接由管理员处理；打开之后，符合条件的申诉会先交给 {rules.seats} 位资深委员复审。
          </StateBlock>
        </div>
      </div>
    );
  }

  const idle = seniorIdleReason(query, identity);
  const expires = formatRemaining(review?.expires_at);
  return (
    <div ref={keys.rootRef} className="kjr-keyscope kjr-senior-scope" tabIndex={-1} data-phase={idle ?? (review ? 'review' : 'loading')} onKeyDown={keys.onKeyDown}>
      {!appealsOn && !idle ? <p className="kjr-flash kjr-flash--plain" role="status">申诉复审的开关还没有打开，现在这个队列里只有举报人申请的复议。</p> : null}
      {skipped !== null ? <p className="kjr-flash kjr-flash--plain" role="status" data-skipped="1">{skipped}</p> : null}
      {idle ? (
        <div className="kjr-body kui-scroll"><div className="kjr-wrap"><SeniorIdle reason={idle} queue="appeal" error={query.error} onRetry={() => void query.refetch()} /></div></div>
      ) : !review ? <div className="kjr-body"><Loading label="正在领取复审…" /></div> : (
        <div className="kjr-desk">
          <div className="kjr-desk-evidence kui-scroll">
            <header className="kjr-case-head">
              <h2>复审 #{review.review_id}</h2>
              <span className="kui-tag kui-tag--accent" data-type={review.type ?? 'appeal'}>{REVIEW_TYPE_LABEL[review.type ?? 'appeal']}</span>
              <KindTag kind={review.kind} />
              {expires ? <span className="kjr-meta">复审还剩 {expires}，到期没有结果会转给管理员</span> : null}
            </header>
            <Statement review={review} />
            <Subject review={review} />
            <Content review={review} onViewerOpenChange={keys.onViewerOpenChange} />
            <Origin review={review} />
          </div>
          <AppealVotePanel key={review.review_id} ref={panelRef} review={review} rules={rules} moderation={moderation} categories={config.config.categories ?? []} pending={vote.isPending}
            error={vote.error ? errorText(vote.error, '复审意见提交失败，请稍后重试。') : null}
            onSubmit={(body) => vote.mutate({ target: review, body })} />
        </div>
      )}
    </div>
  );
}
