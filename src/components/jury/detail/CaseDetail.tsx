import type { JuryCaseDetail, JuryVote } from '@/types/jury';
import { useJury } from '../context';
import { errorCode, errorStatus, errorText, isUnavailable, useJuryCase } from '../data/queries';
import { reviewNo, voteLabel } from '../labels';
import { caseSourceText } from '../senior/caseOrigin';
import { CaseEvidence } from '../widgets/Evidence';
import { Card, Loading, LoadError, NotOpenYet, StateBlock } from '../widgets/Frame';
import { VoteTag } from '../widgets/Tags';
import { Opinions } from './Opinions';
import { QualityCheckFeedback, VerdictSummary } from './VerdictSummary';

/** 刚投完票时手里就有的信息。详情接口不可用（旧后端）时，投后视图退回只显示这些。 */
export interface CaseFallback {
  caseId: number;
  vote: JuryVote;
  note: string | null;
  settled: boolean;
}

function FallbackView({ fallback }: { fallback: CaseFallback }): JSX.Element {
  return (
    <Card title="你的判断已记录" aside={<VoteTag vote={fallback.vote} />}>
      <p className="kjr-text">{fallback.settled ? '这一票让案件有了结论，感谢你的判断。' : `你在${reviewNo(fallback.caseId)}里投了「${voteLabel(fallback.vote)}」，现在等待其他委员表决。`}</p>
      {fallback.note ? <blockquote className="kjr-quote">{fallback.note}</blockquote> : null}
      <NotOpenYet what="案件详情和观点区" compact>开放后，投完票可以在这里看到案件的进展、结论和其他委员的观点。</NotOpenYet>
    </Card>
  );
}

function CaseBody({ detail, voteStage }: { detail: JuryCaseDetail; voteStage?: 'jury' | 'panel' }): JSX.Element {
  const { config } = useJury();
  const rules = config.config.rules;
  return (
    <div className="kjr-case">
      <div className="kjr-case-main">
        {detail.is_quality_check ? <QualityCheckFeedback detail={detail} /> : null}
        <Card title="案件内容" aside={<span className="kjr-meta">{caseSourceText(detail)}</span>}>
          {detail.content_available
            ? <CaseEvidence view={detail} contextNear={rules.context_near} />
            : <StateBlock icon="clock" title="案件内容已过保留期" compact>案件内容保留 {rules.content_retention_days} 天，从定案和你投票这两个时间里较晚的那个算起；之后只保留结论和票数。</StateBlock>}
        </Card>
        {detail.is_quality_check ? null
          : !detail.opinions_enabled ? <Card title="观点区"><StateBlock icon="info" title="这个案件没有观点区" compact /></Card>
          : config.has('opinions') ? <Opinions caseId={detail.case_id} settled={detail.stage === 'closed'} />
          : <Card title="观点区"><NotOpenYet what="观点区" compact /></Card>}
      </div>
      <VerdictSummary detail={detail} voteStage={voteStage} />
    </div>
  );
}

/**
 * 我投过票的案件：案件内容、我的票、进展与结论、观点区。
 * 评审台的投后视图和「我的评审」里点开一条记录，用的是同一个组件。
 */
export function CaseDetail({ caseId, fallback, voteStage }: { caseId: number; fallback?: CaseFallback; /** 这一票是合议票（资深工作台的投后视图传 panel）：结算的分值不同 */ voteStage?: 'jury' | 'panel' }): JSX.Element {
  const { config } = useJury();
  const enabled = config.has('case_detail');
  const query = useJuryCase(caseId, enabled);

  if (config.loading || (enabled && query.isLoading)) {
    return <Loading />;
  }
  if (query.data) {
    return <CaseBody detail={query.data} voteStage={voteStage} />;
  }
  if (!enabled || isUnavailable(query.error)) {
    return fallback ? <FallbackView fallback={fallback} /> : <NotOpenYet what="案件详情" />;
  }
  const code = errorCode(query.error);
  // 403 not_voted：案件分到手了但还没投，或者我主动回避了它
  if (code === 'not_voted') {
    return <StateBlock icon="lock" title="投票之后才能查看这个案件">为了不影响独立判断，案件的进展和观点区只对已经投过这个案件的委员开放。分到手还没投的案件请到评审台评审；主动回避过的案件不能再查看。</StateBlock>;
  }
  // 404 case_not_found：评审编号只对本人有效。拿公示栏的案件编号、别人的评审编号、或者旧链接 / 旧缓存里的编号进来都是这个结果
  if (code === 'case_not_found' || (errorStatus(query.error) === 404 && !isUnavailable(query.error))) {
    return <StateBlock icon="info" title="找不到这次评审">{reviewNo(caseId)} 不在你的评审记录里。评审编号只对你自己有效，和公示栏里的案件编号不通用；它也可能来自一条已经失效的旧链接。你投过的案件都在「我的评审」的列表里。</StateBlock>;
  }
  return <LoadError message={errorText(query.error, '案件加载失败，请稍后再试。')} onRetry={() => void query.refetch()} />;
}
