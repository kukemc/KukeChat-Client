import { Icon } from '@/components/ui/Icon';
import { errorStatus, errorText, useJuryPublicCase } from '../data/queries';
import { formatDateTime, formatHours, HIDDEN_REASON_TEXT, KIND_LABEL, levelText, reasonsText, SOURCE_LABEL } from '../labels';
import { PrecedentNotice } from '../precedents/PrecedentLinks';
import { hasNoReporter } from '../senior/caseOrigin';
import { Card, Loading, LoadError, StateBlock } from '../widgets/Frame';
import { OutcomeTag, TallyBar } from '../widgets/Tags';

/** 公示栏里的一个案件。内容只有「认定违规的公开动态」才有，而且只有文字；没有内容时说明为什么。 */
export function PublicCaseDetail({ caseId }: { caseId: number }): JSX.Element {
  const query = useJuryPublicCase(caseId);
  const detail = query.data;

  if (query.isLoading) {
    return <Loading />;
  }
  if (!detail) {
    return errorStatus(query.error) === 404
      ? <StateBlock icon="list" title="这个案件没有公示">它可能不存在，或者还没到公示时间。</StateBlock>
      : <LoadError message={errorText(query.error, '案件加载失败，请稍后再试。')} onRetry={() => void query.refetch()} />;
  }

  const hidden = detail.content ? null : HIDDEN_REASON_TEXT[detail.content_hidden_reason ?? 'group_message'];
  return (
    <div className="kjr-case">
      <div className="kjr-case-main">
        <Card title={detail.kind === 'post' ? '被举报的动态' : '被举报的消息'} aside={<span className="kjr-meta">{KIND_LABEL[detail.kind]}{detail.content ? ' · 已匿名' : ''}</span>}>
          {detail.content ? (
            <article className="kjr-post" aria-label="被举报的动态">
              <header><span className="kjr-msg-flag">被举报的动态</span><time>{formatDateTime(detail.content.created_at)}</time></header>
              {detail.content.text ? <p>{detail.content.text}</p> : <p className="kjr-msg-note">这篇动态没有文字</p>}
              {detail.content.image_count > 0 ? <p className="kjr-withheld"><Icon name="image" className="h-4 w-4" />原文带 {detail.content.image_count} 张图片。图片一律不公示。</p> : null}
            </article>
          ) : hidden ? (
            <StateBlock icon="eyeOff" title={hidden.title} compact>{hidden.text}</StateBlock>
          ) : null}
        </Card>
      </div>
      <Card className="kjr-vs">
        <section className="kjr-vs-block">
          {/* 改判后 outcome / 类别 / 等级是新结论，来源和票数分布仍是原审的：分开标明 */}
          <h3 className="kjr-h">结论<span>{detail.overturned ? '已改判' : SOURCE_LABEL[detail.source] ?? detail.source}</span></h3>
          <p className="kjr-vs-line"><OutcomeTag outcome={detail.outcome} level={detail.level} overturned={detail.overturned} /></p>
          {detail.overturned ? <p className="kui-note kui-note--warn" data-notice="overturned">原审的结论在定案后被改判，上面是改判后的结论。{detail.overturn_note ? `改判说明：${detail.overturn_note}` : ''}</p> : null}
          <dl className="kjr-dl">
            <div><dt>举报理由</dt><dd>{reasonsText(detail.reasons)}</dd></div>
            <div><dt>举报人数</dt><dd>{hasNoReporter(detail) ? '没有举报人（机器筛查）' : `${detail.report_count} 人`}</dd></div>
            {detail.category_label ? <div><dt>认定类别</dt><dd>{detail.category_label}{detail.level ? ` · ${levelText(detail.level)}` : ''}</dd></div> : null}
            {detail.overturned ? <div><dt>原审来源</dt><dd>{SOURCE_LABEL[detail.source] ?? detail.source}</dd></div> : null}
            <div><dt>{detail.overturned ? '原审定案' : '定案时间'}</dt><dd>{formatDateTime(detail.closed_at)}</dd></div>
            <div><dt>{detail.overturned ? '原审用时' : '用时'}</dt><dd>{formatHours(detail.hours)}</dd></div>
          </dl>
        </section>
        <section className="kjr-vs-block">
          <h3 className="kjr-h">{detail.overturned ? '原审的票数分布' : '票数分布'}<span>{detail.votes} 张有效票</span></h3>
          {detail.tally ? <TallyBar tally={detail.tally} /> : <p className="kjr-meta">这个案件没有公布票数分布。</p>}
          {detail.overturned && detail.tally ? <p className="kjr-meta" data-note="tally-original">这是改判之前委员们投的票，和现在的结论不对应。</p>
            : detail.source === 'admin' && detail.tally ? <p className="kjr-meta" data-note="tally-admin">结论由管理员裁定。这是案件转给管理员之前委员们已经投出的票，不是结论的依据。</p>
            : null}
        </section>
        <PrecedentNotice precedentId={detail.precedent_id} />
      </Card>
    </div>
  );
}
