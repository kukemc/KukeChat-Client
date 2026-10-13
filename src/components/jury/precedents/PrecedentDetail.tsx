import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import type { PrecedentDetail as PrecedentDetailData } from '@/types/jurySenior';
import { useJury } from '../context';
import { usePrecedent, usePrecedentActions } from '../data/precedents';
import { errorStatus, errorText } from '../data/queries';
import { formatDateTime, HIDDEN_REASON_TEXT, KIND_LABEL, levelText, publicCaseNo } from '../labels';
import { CaseEvidence } from '../widgets/Evidence';
import { Card, Loading, LoadError, SectionFrame, StateBlock } from '../widgets/Frame';
import { OutcomeTag } from '../widgets/Tags';
import { PrecedentEditor } from './PrecedentEditor';
import { PRECEDENT_BY_LABEL } from './PrecedentsTab';

/** 案件内容：在任委员看到完整的匿名视图；其他人按公示栏的规则，只有认定违规的公开动态才有文字。 */
function CaseContent({ detail }: { detail: PrecedentDetailData }): JSX.Element {
  const { config } = useJury();
  if (detail.case) {
    return (
      <Card title="案件内容" aside={<span className="kjr-meta">已匿名 · 只有在任委员能看到这一块</span>}>
        <CaseEvidence view={{ case_id: detail.case_id, kind: detail.kind, messages: detail.case.messages, post: detail.case.post }} contextNear={config.config.rules.context_near} />
      </Card>
    );
  }
  // unpublished 是判例特有的：案件此刻不在公示栏里（公示栏里遇不到这种情况，那边直接是 404）
  const reason = detail.content_hidden_reason ?? 'group_message';
  const hidden = detail.content ? null
    : reason === 'unpublished' ? { title: '案件还没有公示，暂时不展示内容', text: `案件定案满 ${config.config.rules.publish_delay_hours} 小时、且没有待处理的申诉之后才进公示栏；在那之前，案件内容只有在任委员看得到。` }
    : HIDDEN_REASON_TEXT[reason] ?? { title: '这个案件不公示内容', text: '' };
  return (
    <Card title="案件内容" aside={<span className="kjr-meta">{KIND_LABEL[detail.kind] ?? detail.kind}{detail.content ? ' · 已匿名' : ''}</span>}>
      {detail.content ? (
        <article className="kjr-post" aria-label="被举报的动态">
          <header><span className="kjr-msg-flag">被举报的动态</span><time>{formatDateTime(detail.content.created_at)}</time></header>
          {detail.content.text ? <p>{detail.content.text}</p> : <p className="kjr-msg-note">这篇动态没有文字</p>}
          {detail.content.image_count > 0 ? <p className="kjr-withheld"><Icon name="image" className="h-4 w-4" />原文带 {detail.content.image_count} 张图片。图片一律不公示。</p> : null}
        </article>
      ) : hidden ? <StateBlock icon={reason === 'unpublished' ? 'clock' : 'eyeOff'} title={hidden.title} compact><span data-hidden-reason={reason}>{hidden.text} 判例的裁判要旨不受影响，照常可读。</span></StateBlock> : null}
    </Card>
  );
}

function Facts({ detail, onEdit, onRemoved }: { detail: PrecedentDetailData; onEdit: () => void; onRemoved: () => void }): JSX.Element {
  const { nav, config } = useJury();
  const { remove } = usePrecedentActions();
  const [confirming, setConfirming] = useState(false);
  // 判例里的 case_id 是案件的公开编号，所以只能指到公示栏；案件此刻不在公示栏里（unpublished）时没有地方可去
  const published = config.has('public_cases') && detail.content_hidden_reason !== 'unpublished';
  return (
    <Card className="kjr-vs">
      <section className="kjr-vs-block">
        <h3 className="kjr-h">结论<span>{publicCaseNo(detail.case_id)}</span></h3>
        <p className="kjr-vs-line"><OutcomeTag outcome={detail.outcome} level={detail.level} /></p>
        <dl className="kjr-dl">
          {detail.category_label ? <div><dt>认定类别</dt><dd>{detail.category_label}{detail.level ? ` · ${levelText(detail.level)}` : ''}</dd></div> : null}
          <div><dt>案件类型</dt><dd>{KIND_LABEL[detail.kind] ?? detail.kind}</dd></div>
          <div><dt>标注</dt><dd>{PRECEDENT_BY_LABEL[detail.by] ?? detail.by}</dd></div>
          <div><dt>标注时间</dt><dd>{formatDateTime(detail.created_at)}</dd></div>
        </dl>
        {published ? <div><button type="button" className="kui-btn kui-btn--sm" data-action="open-public-case" onClick={() => nav.goSection('bulletin', { caseId: detail.case_id })}>在公示栏查看这个案件</button></div> : null}
      </section>
      {detail.mine ? (
        <section className="kjr-vs-block" data-block="precedent-manage">
          <h3 className="kjr-h">这是你标注的判例</h3>
          {confirming ? (
            <>
              <p className="kjr-meta">撤销后它会从判例库和练习场的题库里拿掉，案件本身的结论不受影响。</p>
              {remove.error ? <p className="kui-note kui-note--danger" role="alert">{errorText(remove.error, '撤销失败，请稍后再试。')}</p> : null}
              <div className="kjr-btn-row">
                <button type="button" className="kui-btn kui-btn--sm" disabled={remove.isPending} onClick={() => setConfirming(false)}>取消</button>
                <button type="button" className="kui-btn kui-btn--sm kui-btn--danger" data-action="confirm-remove-precedent" disabled={remove.isPending} onClick={() => remove.mutate({ precedentId: detail.id, publicCaseId: detail.case_id }, { onSuccess: onRemoved })}>{remove.isPending ? '撤销中…' : '确认撤销'}</button>
              </div>
            </>
          ) : (
            <div className="kjr-btn-row">
              <button type="button" className="kui-btn kui-btn--sm" data-action="edit-precedent" onClick={onEdit}><Icon name="edit" className="h-3.5 w-3.5" />修改</button>
              <button type="button" className="kui-btn kui-btn--sm" data-action="remove-precedent" onClick={() => setConfirming(true)}>撤销判例</button>
            </div>
          )}
        </section>
      ) : null}
    </Card>
  );
}

/** 一个判例：裁判要旨（全站可读）+ 案件内容（范围同公示栏；在任委员能看到匿名的完整视图）。 */
export function PrecedentDetailPage({ precedentId, onBack }: { precedentId: number; onBack: () => void }): JSX.Element {
  const query = usePrecedent(precedentId);
  const [editing, setEditing] = useState(false);
  const detail = query.data;

  return (
    <SectionFrame title={`判例 #${precedentId}`} subtitle="规则手册 · 判例库" onBack={onBack}>
      {query.isLoading ? <Loading />
        : !detail ? (errorStatus(query.error) === 404
          ? <StateBlock icon="bookmark" title="这个判例不存在">它可能已经被撤销了。</StateBlock>
          : <LoadError message={errorText(query.error, '判例加载失败，请稍后再试。')} onRetry={() => void query.refetch()} />)
        : (
          <div className="kjr-case">
            <div className="kjr-case-main">
              <Card className="kjr-prec-doc">
                <p className="kjr-prec-kicker">裁判要旨</p>
                <h2 className="kjr-prec-headline">{detail.title}</h2>
                <p className="kjr-prec-summary">{detail.summary}</p>
              </Card>
              <CaseContent detail={detail} />
            </div>
            <Facts detail={detail} onEdit={() => setEditing(true)} onRemoved={onBack} />
          </div>
        )}
      {editing && detail ? <PrecedentEditor precedent={detail} onClose={() => setEditing(false)} /> : null}
    </SectionFrame>
  );
}
