import { useMemo, useState } from 'react';
import type { JuryOpinion } from '@/types/jury';
import { useJury } from '../context';
import { useOpinionActions } from '../data/opinions';
import { errorCode, errorText, isUnavailable, useJuryOpinions } from '../data/queries';
import { restrictionReason, restrictionUntil } from '../growth/labels';
import { Card, Loading, LoadError, NotOpenYet, StateBlock } from '../widgets/Frame';
import { OpinionItem, type OpinionHandlers } from './OpinionItem';
import { ReportOpinionModal } from './ReportOpinionModal';

type Sort = 'time' | 'likes';

function Composer({ max, pending, error, replyTo, onCancelReply, onSubmit }: { max: number; pending: boolean; error: string | null; replyTo: JuryOpinion | null; onCancelReply: () => void; onSubmit: (content: string, done: () => void) => void }): JSX.Element {
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
      {replyTo ? <p className="kjr-composer-to">回复 {replyTo.alias}<button type="button" className="kui-link" onClick={onCancelReply}>取消</button></p> : null}
      <textarea className="kui-textarea kui-scroll" rows={replyTo ? 2 : 3} value={text} aria-label={replyTo ? '回复内容' : '观点内容'} autoFocus={Boolean(replyTo)} onChange={(event) => setText(event.target.value.slice(0, max))}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            // 别让评审台把它当成「下一件」之类的快捷键
            event.stopPropagation();
            submit();
          }
        }}
        placeholder={replyTo ? '写下你的回复' : '说说你的看法：为什么这么判断、哪里拿不准。请就事论事，不要转述或猜测当事人的身份。'} />
      {error ? <p className="kui-note kui-note--danger" role="alert">{error}</p> : null}
      <div className="kjr-composer-foot">
        <span className="kjr-meta">{text.length}/{max}</span>
        <button type="submit" className="kui-btn kui-btn--primary" data-action={replyTo ? 'submit-reply' : 'submit-opinion'} disabled={!content || pending}>{pending ? '发表中…' : replyTo ? '回复' : '发表观点'}</button>
      </div>
    </form>
  );
}

/**
 * 观点区：只有对这个案件投过票的委员、在投票之后才能看和发（盲审不能被跟风破坏）。
 * 权限由服务端判断，这里只按返回处理：403 not_voted 显示无权限，接口不存在显示尚未开放。
 */
export function Opinions({ caseId, settled }: { caseId: number; settled: boolean }): JSX.Element {
  const { identity, config } = useJury();
  const query = useJuryOpinions(caseId, true);
  const actions = useOpinionActions(caseId);
  const [sort, setSort] = useState<Sort>('time');
  const [replyTo, setReplyTo] = useState<JuryOpinion | null>(null);
  const [reporting, setReporting] = useState<JuryOpinion | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const rules = config.config.opinions;
  // 受处罚期间服务端会拒绝发表、回复、点赞和举报（403 juror_restricted），所以直接按只读显示
  const canAct = identity.isJuror && !identity.restricted;

  const roots = useMemo(() => {
    const items = query.data?.items ?? [];
    return sort === 'likes' ? [...items].sort((left, right) => right.like_count - left.like_count) : items;
  }, [query.data, sort]);

  const handlers: OpinionHandlers = {
    canAct,
    replyingTo: replyTo?.id ?? null,
    deletingId: actions.remove.isPending ? actions.remove.variables ?? null : null,
    onReply: (opinion) => {
      setReplyTo((current) => (current?.id === opinion.id ? null : opinion));
      actions.post.reset();
    },
    onLike: (opinion) => {
      setNotice(null);
      actions.like.mutate({ opinionId: opinion.id, liked: !opinion.liked }, { onError: (error) => setNotice(errorText(error, '操作失败，请稍后再试。')) });
    },
    onDelete: (opinion) => {
      setNotice(null);
      actions.remove.mutate(opinion.id, { onError: (error) => setNotice(errorText(error, '删除失败，请稍后再试。')) });
    },
    onReport: (opinion) => {
      actions.report.reset();
      setReporting(opinion);
    }
  };

  const title = <>观点区{query.data ? <span className="kjr-count">{query.data.total}</span> : null}</>;
  const aside = roots.length > 1 ? (
    <div className="kui-segment" role="tablist" aria-label="排序">
      <button type="button" role="tab" aria-selected={sort === 'time'} className={sort === 'time' ? 'is-active' : undefined} onClick={() => setSort('time')}>按时间</button>
      <button type="button" role="tab" aria-selected={sort === 'likes'} className={sort === 'likes' ? 'is-active' : undefined} onClick={() => setSort('likes')}>按赞同</button>
    </div>
  ) : undefined;

  if (query.isLoading) {
    return <Card title="观点区"><Loading compact /></Card>;
  }
  if (!query.data) {
    const code = errorCode(query.error);
    return (
      <Card title="观点区">
        {isUnavailable(query.error) ? <NotOpenYet what="观点区" compact />
          : code === 'not_voted' ? <StateBlock icon="lock" title="投票之后才能看到观点区" compact>为了保证每个人独立判断，观点区只对已经投过这个案件的委员开放。</StateBlock>
          : code === 'opinions_closed' ? <StateBlock icon="info" title="这个案件没有观点区" compact />
          : <LoadError compact message={errorText(query.error, '观点区加载失败，请稍后再试。')} onRetry={() => void query.refetch()} />}
      </Card>
    );
  }

  const composerFor = (target: JuryOpinion | null): JSX.Element => (
    <Composer
      key={target ? `reply-${target.id}` : 'root'}
      max={rules.max_length}
      replyTo={target}
      pending={actions.post.isPending && (actions.post.variables?.parentId ?? null) === (target?.id ?? null)}
      error={actions.post.error && (actions.post.variables?.parentId ?? null) === (target?.id ?? null) ? errorText(actions.post.error, '发表失败，请稍后再试。') : null}
      onCancelReply={() => setReplyTo(null)}
      onSubmit={(content, done) => actions.post.mutate({ content, parentId: target?.id ?? null }, { onSuccess: () => {
        done();
        setReplyTo(null);
      } })}
    />
  );

  return (
    <Card title={title} aside={aside} className="kjr-opinions">
      <p className="kjr-meta">只有投过这个案件的委员能看到这里。大家都用案件内的匿名代号，{settled ? '案件已定案，所以能看到每位委员投的票。' : '定案之前看不到别人投了什么。'}</p>
      {canAct ? composerFor(null)
        : identity.restriction ? <p className="kui-note kui-note--warn" data-notice="restriction">{restrictionReason(identity.restriction)}，{restrictionUntil(identity.restriction)}。这期间不能发表观点和点赞，可以继续阅读。</p>
        : <p className="kui-note">只有在任委员可以发表观点和点赞，你现在可以阅读。</p>}
      {notice ? <p className="kui-note kui-note--danger" role="alert">{notice}</p> : null}
      {roots.length === 0 ? (
        <StateBlock icon="message" title="还没有人发表观点" compact>{canAct ? '投票时写的理由会自动出现在这里。你可以第一个说说为什么这么判断。' : '投票时写的理由会自动出现在这里。'}</StateBlock>
      ) : (
        <ul className="kjr-ops">
          {roots.map((root) => {
            const replies = root.replies ?? [];
            const replyTarget = replyTo && (replyTo.id === root.id || replies.some((reply) => reply.id === replyTo.id)) ? replyTo : null;
            return (
              <li key={root.id} className="kjr-thread">
                <ul>
                  <OpinionItem opinion={root} handlers={handlers} />
                  {replies.map((reply) => <OpinionItem key={reply.id} opinion={reply} handlers={handlers} reply />)}
                </ul>
                {replyTarget ? <div className="kjr-thread-reply">{composerFor(replyTarget)}</div> : null}
              </li>
            );
          })}
        </ul>
      )}
      {reporting ? (
        <ReportOpinionModal
          opinion={reporting}
          reasons={rules.report_reasons}
          pending={actions.report.isPending}
          error={actions.report.error ? errorText(actions.report.error, '举报提交失败，请稍后再试。') : null}
          onClose={() => setReporting(null)}
          onSubmit={(reason, details) => actions.report.mutate({ opinionId: reporting.id, reason, details: details || undefined }, { onSuccess: () => setReporting(null) })}
        />
      ) : null}
    </Card>
  );
}
