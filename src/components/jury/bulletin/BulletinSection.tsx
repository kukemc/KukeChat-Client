import { useMemo, useState } from 'react';
import type { JuryCaseKind, JuryOutcome, JuryPublicCase, JuryPublicQuery } from '@/types/jury';
import { useJury } from '../context';
import { errorText, useJuryPublicCases, useModerationRules } from '../data/queries';
import { formatDateTime, formatHours, KIND_LABEL, publicCaseNo, reasonsText, SOURCE_LABEL } from '../labels';
import { Card, Loading, LoadError, SectionFrame, StateBlock } from '../widgets/Frame';
import { Pager } from '../widgets/Pager';
import { OutcomeTag, TallyBar } from '../widgets/Tags';
import { PrecedentTag } from '../precedents/PrecedentLinks';
import { hasNoReporter } from '../senior/caseOrigin';
import { PublicCaseDetail } from './PublicCaseDetail';

const PAGE_SIZE = 20;

interface ListState {
  kind: JuryCaseKind | 'all';
  outcome: JuryOutcome | 'all';
  category: string;
  offset: number;
}

const INITIAL: ListState = { kind: 'all', outcome: 'all', category: '', offset: 0 };

function Filters({ list, onChange }: { list: ListState; onChange: (list: ListState) => void }): JSX.Element {
  const categories = useModerationRules().data?.categories ?? [];
  const set = (patch: Partial<ListState>): void => onChange({ ...list, ...patch, offset: 0 });
  const kinds: Array<{ value: ListState['kind']; label: string }> = [{ value: 'all', label: '全部' }, { value: 'post', label: KIND_LABEL.post }, { value: 'message', label: KIND_LABEL.message }];
  const dirty = list.kind !== 'all' || list.outcome !== 'all' || list.category !== '';
  return (
    <div className="kjr-filters">
      <div className="kui-segment" role="tablist" aria-label="案件类型">
        {kinds.map((item) => <button key={item.value} type="button" role="tab" aria-selected={list.kind === item.value} className={list.kind === item.value ? 'is-active' : undefined} onClick={() => set({ kind: item.value })}>{item.label}</button>)}
      </div>
      <select className="kui-select" aria-label="按结论筛选" value={list.outcome} onChange={(event) => set({ outcome: event.target.value as ListState['outcome'] })}>
        <option value="all">全部结论</option>
        <option value="violation">结论：违规</option>
        <option value="clean">结论：不违规</option>
      </select>
      {categories.length > 0 ? (
        <select className="kui-select" aria-label="按违规类别筛选" value={list.category} onChange={(event) => set({ category: event.target.value })}>
          <option value="">全部类别</option>
          {categories.map((category) => <option key={category.key} value={category.key}>{category.label}</option>)}
        </select>
      ) : null}
      {dirty ? <button type="button" className="kui-btn kui-btn--ghost kui-btn--sm" onClick={() => onChange(INITIAL)}>清除筛选</button> : null}
    </div>
  );
}

function CaseTable({ items, onOpen }: { items: JuryPublicCase[]; onOpen: (caseId: number) => void }): JSX.Element {
  return (
    <div className="kjr-table kjr-table--public" role="table" aria-label="已公示的案件">
      <div className="kjr-tr kjr-th" role="row">
        <span role="columnheader">案件</span><span role="columnheader">举报理由</span><span role="columnheader">结论</span><span role="columnheader">票数分布</span><span role="columnheader">来源</span><span role="columnheader">定案时间</span>
      </div>
      {items.map((item) => (
        <button key={item.case_id} type="button" role="row" className="kjr-tr" data-case={item.case_id} onClick={() => onOpen(item.case_id)}>
          <span role="cell" className="kjr-td-id">#{item.case_id}<PrecedentTag precedentId={item.precedent_id} /><small>{KIND_LABEL[item.kind]}</small></span>
          <span role="cell" className="kjr-td-text">{reasonsText(item.reasons)}<small>{hasNoReporter(item) ? '机器筛查，没有举报人' : `${item.report_count} 人举报`}</small></span>
          <span role="cell" className="kjr-td-tags"><OutcomeTag outcome={item.outcome} level={item.level} overturned={item.overturned} />{item.category_label ? <small>{item.category_label}</small> : null}</span>
          {/* 改判过的案件：结论是新的，票数和来源仍是原审的，标出来免得被读成「这些票投出了现在的结论」 */}
          <span role="cell" className="kjr-td-tally">{item.tally ? <TallyBar tally={item.tally} compact /> : null}<small>{item.overturned ? '原审 ' : ''}{item.votes} 张有效票{!item.overturned && item.source !== 'jury' ? <span className="kjr-td-src"> · {SOURCE_LABEL[item.source] ?? item.source}</span> : null}</small></span>
          <span role="cell">{SOURCE_LABEL[item.source] ?? item.source}{item.overturned ? <small>原审</small> : null}</span>
          <span role="cell" className="kjr-td-time">{formatDateTime(item.closed_at)}<small>用时 {formatHours(item.hours)}</small></span>
        </button>
      ))}
    </div>
  );
}

/** 公示栏：委员评审并已定案的案件。所有登录用户可读。 */
export function BulletinSection(): JSX.Element {
  const { config, nav } = useJury();
  const [list, setList] = useState<ListState>(INITIAL);
  const params = useMemo<JuryPublicQuery>(() => ({
    limit: PAGE_SIZE,
    offset: list.offset,
    ...(list.kind !== 'all' ? { kind: list.kind } : {}),
    ...(list.outcome !== 'all' ? { outcome: list.outcome } : {}),
    ...(list.category ? { category: list.category } : {})
  }), [list]);
  const query = useJuryPublicCases(params, true);
  const caseId = nav.route.caseId ?? null;
  const rules = config.config.rules;
  const filtered = list.kind !== 'all' || list.outcome !== 'all' || list.category !== '';

  if (caseId !== null) {
    return (
      <SectionFrame title={publicCaseNo(caseId)} subtitle="公示栏" onBack={() => nav.patch({ caseId: null })}>
        <PublicCaseDetail caseId={caseId} />
      </SectionFrame>
    );
  }

  const items = query.data?.items ?? [];
  return (
    <SectionFrame title="公示栏" subtitle="风纪委员评审并已定案的案件，对所有人公开">
      <p className="kui-note kjr-lead-note">
        案件定案满 {rules.publish_delay_hours} 小时、且没有待处理的申诉后才会公示。公示的是结论和票数；只有被认定违规的公开动态会附上匿名的原文，群聊消息的内容和所有图片都不公示。
      </p>
      <Card className="kjr-history">
        <Filters list={list} onChange={setList} />
        {query.isLoading ? <Loading compact />
          : !query.data ? <LoadError compact message={errorText(query.error, '公示栏加载失败，请稍后再试。')} onRetry={() => void query.refetch()} />
          : items.length === 0 ? (
            <StateBlock icon="list" title={filtered ? '没有符合条件的案件' : '还没有公示的案件'} compact actions={filtered ? <button type="button" className="kui-btn kui-btn--sm" onClick={() => setList(INITIAL)}>清除筛选</button> : undefined}>
              {filtered ? '换一个筛选条件试试。' : `风纪委员会刚开始运转。第一批案件定案并过了 ${rules.publish_delay_hours} 小时的申诉期后，会出现在这里。`}
            </StateBlock>
          ) : (
            <>
              <CaseTable items={items} onOpen={(id) => nav.patch({ caseId: id })} />
              <Pager total={query.data.total} limit={PAGE_SIZE} offset={list.offset} busy={query.isPlaceholderData} onChange={(offset) => setList({ ...list, offset })} />
            </>
          )}
      </Card>
    </SectionFrame>
  );
}
