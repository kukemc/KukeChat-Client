import { useMemo, useState } from 'react';
import { cx } from '@/components/chat/desktop/runtime';
import type { JuryOutcome, JuryVoteItem, JuryVotesQuery } from '@/types/jury';
import { useJury } from '../context';
import { errorText, isUnavailable, useJuryHistory, useJuryMyStats, useJuryVotes } from '../data/queries';
import { CaseDetail } from '../detail/CaseDetail';
import { GrowthView } from '../growth/GrowthView';
import { formatDateTime, KIND_LABEL, reviewNo } from '../labels';
import { isUnhandledMachineCase, UnhandledTag } from '../senior/caseOrigin';
import { Card, Loading, LoadError, SectionFrame, StateBlock } from '../widgets/Frame';
import { Pager } from '../widgets/Pager';
import { OutcomeTag, VoteTag } from '../widgets/Tags';
import { MineStats } from './MineStats';

const PAGE_SIZE = 20;
type StateFilter = 'all' | 'open' | 'closed';
type AgreedFilter = 'all' | 'yes' | 'no';

interface Filters {
  state: StateFilter;
  outcome: JuryOutcome | 'all';
  agreed: AgreedFilter;
}

const NO_FILTER: Filters = { state: 'all', outcome: 'all', agreed: 'all' };

function matches(item: JuryVoteItem, filters: Filters): boolean {
  if (filters.state === 'open' && item.outcome !== null) return false;
  if (filters.state === 'closed' && item.outcome === null) return false;
  if (filters.outcome !== 'all' && item.outcome !== filters.outcome) return false;
  if (filters.agreed !== 'all' && item.agreed !== (filters.agreed === 'yes')) return false;
  return true;
}

function HistoryTable({ items, onOpen }: { items: JuryVoteItem[]; onOpen: ((caseId: number) => void) | null }): JSX.Element {
  return (
    <div className="kjr-table kjr-table--mine" role="table" aria-label="我的投票记录">
      <div className="kjr-tr kjr-th" role="row">
        <span role="columnheader" title="评审编号只有你自己看得到，和公示栏里的案件编号不通用">评审编号</span><span role="columnheader">举报理由</span><span role="columnheader">我的票</span><span role="columnheader">结论</span><span role="columnheader">是否一致</span><span role="columnheader">投票时间</span>
      </div>
      {items.map((item) => {
        const cells = (
          <>
            <span role="cell" className="kjr-td-id">#{item.case_id}{item.vote_stage === 'panel' ? <span className="kui-tag kui-tag--accent" data-vote-stage="panel" title="这一票是在资深合议里投的">合议</span> : null}<small>{KIND_LABEL[item.kind]}</small></span>
            <span role="cell" className="kjr-td-text">{item.is_quality_check ? <span className="kui-tag kui-tag--accent">质控题</span> : item.primary_reason ?? '—'}</span>
            <span role="cell"><VoteTag vote={item.vote} short /></span>
            <span role="cell">{item.vote === 'recuse' ? <span className="kjr-meta">已改派给别的委员</span>
              // 三期：机器案件「未作处理」结案，服务端给的是 clean + auto，但不是认定不违规（列表项没有 case_origin，靠「这一票不计一致率」认）
              : isUnhandledMachineCase({ outcome: item.outcome, source: item.verdict_source, agreed: item.agreed }) ? <UnhandledTag />
              : <OutcomeTag outcome={item.outcome} level={item.verdict_level} stage={item.stage} overturned={item.overturned} />}
              {/* 三期：原审没定下来、由资深合议给出结论的案件，在原审委员这里也标出来 */}
              {item.outcome && item.verdict_source === 'panel' && item.vote !== 'recuse' ? <small data-verdict-source="panel" title="原审没有形成结论，这个结论是资深合议给出的">合议定案</small> : null}</span>
            <span role="cell" className={cx(item.agreed === true && 'kjr-yes', item.agreed === false && 'kjr-no')}>{item.agreed === null ? '—' : item.agreed ? '一致' : '不一致'}</span>
            <span role="cell" className="kjr-td-time">{formatDateTime(item.voted_at)}{item.opinion_count ? <small>{item.opinion_count} 条观点</small> : null}</span>
          </>
        );
        // 二期：主动回避的记录不能进详情（can_view 为 false）
        return onOpen && item.can_view !== false
          ? <button key={`${item.case_id}-${item.voted_at}`} type="button" role="row" className="kjr-tr" data-case={item.case_id} onClick={() => onOpen(item.case_id)}>{cells}</button>
          : <div key={`${item.case_id}-${item.voted_at}`} role="row" className="kjr-tr" data-case={item.case_id}>{cells}</div>;
      })}
    </div>
  );
}

function FilterBar({ filters, onChange }: { filters: Filters; onChange: (filters: Filters) => void }): JSX.Element {
  const states: Array<{ value: StateFilter; label: string }> = [{ value: 'all', label: '全部' }, { value: 'open', label: '未定案' }, { value: 'closed', label: '已定案' }];
  return (
    <div className="kjr-filters">
      <div className="kui-segment" role="tablist" aria-label="案件状态">
        {states.map((item) => <button key={item.value} type="button" role="tab" aria-selected={filters.state === item.value} className={filters.state === item.value ? 'is-active' : undefined} onClick={() => onChange({ ...filters, state: item.value })}>{item.label}</button>)}
      </div>
      <select className="kui-select" aria-label="按结论筛选" value={filters.outcome} onChange={(event) => onChange({ ...filters, outcome: event.target.value as Filters['outcome'] })}>
        <option value="all">全部结论</option>
        <option value="violation">结论：违规</option>
        <option value="clean">结论：不违规</option>
      </select>
      <select className="kui-select" aria-label="按是否一致筛选" value={filters.agreed} onChange={(event) => onChange({ ...filters, agreed: event.target.value as AgreedFilter })}>
        <option value="all">一致与否</option>
        <option value="yes">与结论一致</option>
        <option value="no">与结论不一致</option>
      </select>
      {filters.state !== 'all' || filters.outcome !== 'all' || filters.agreed !== 'all' ? <button type="button" className="kui-btn kui-btn--ghost kui-btn--sm" onClick={() => onChange(NO_FILTER)}>清除筛选</button> : null}
    </div>
  );
}

interface ListState {
  filters: Filters;
  offset: number;
}

function History({ list, onListChange }: { list: ListState; onListChange: (list: ListState) => void }): JSX.Element {
  const { config, nav } = useJury();
  const { filters, offset } = list;
  const setOffset = (next: number): void => onListChange({ filters, offset: next });
  const params = useMemo<JuryVotesQuery>(() => ({
    limit: PAGE_SIZE,
    offset,
    ...(filters.state !== 'all' ? { state: filters.state } : {}),
    ...(filters.outcome !== 'all' ? { outcome: filters.outcome } : {}),
    ...(filters.agreed !== 'all' ? { agreed: filters.agreed === 'yes' } : {})
  }), [filters, offset]);
  const full = config.has('votes');
  const votes = useJuryVotes(params, full);
  // 完整历史接口不可用（旧后端）：退回最近 50 条，在本地筛选、分页
  const legacy = !full || (!votes.data && isUnavailable(votes.error));
  const history = useJuryHistory(legacy && !config.loading);
  const legacyItems = useMemo(() => (history.data ?? []).filter((item) => matches(item, filters)), [filters, history.data]);

  const changeFilters = (next: Filters): void => onListChange({ filters: next, offset: 0 });
  const query = legacy ? history : votes;
  const items: JuryVoteItem[] = legacy ? legacyItems.slice(offset, offset + PAGE_SIZE) : votes.data?.items ?? [];
  const total = legacy ? legacyItems.length : votes.data?.total ?? 0;
  const filtered = filters.state !== 'all' || filters.outcome !== 'all' || filters.agreed !== 'all';
  const canOpen = config.has('case_detail');

  return (
    <Card title="投票记录" aside={legacy ? <span className="kjr-meta">当前只能查看最近 50 条</span> : undefined} className="kjr-history">
      <FilterBar filters={filters} onChange={changeFilters} />
      {config.loading || query.isLoading ? <Loading compact />
        : query.error && !query.data ? <LoadError compact message={errorText(query.error, '投票记录加载失败，请稍后再试。')} onRetry={() => void query.refetch()} />
        : items.length === 0 ? (
          <StateBlock icon="clock" title={filtered ? '没有符合条件的记录' : '还没有投过票'} compact actions={filtered ? <button type="button" className="kui-btn kui-btn--sm" onClick={() => changeFilters(NO_FILTER)}>清除筛选</button> : undefined}>
            {filtered ? '换一个筛选条件试试。' : '在评审台投出第一票后，记录会出现在这里。'}
          </StateBlock>
        ) : (
          <>
            <HistoryTable items={items} onOpen={canOpen ? (caseId) => nav.patch({ caseId }) : null} />
            <Pager total={total} limit={PAGE_SIZE} offset={offset} busy={!legacy && votes.isPlaceholderData} onChange={setOffset} />
          </>
        )}
    </Card>
  );
}

/** 我的评审：个人统计 + 完整的投票记录；点一条进入案件详情（和评审台的投后视图是同一个）。 */
export function MineSection(): JSX.Element {
  const { status, config, nav } = useJury();
  const stats = useJuryMyStats(config.has('votes'));
  // 筛选和页码放在这一层：点进一个案件再返回，列表还在原来的位置
  const [list, setList] = useState<ListState>({ filters: NO_FILTER, offset: 0 });
  const caseId = nav.route.caseId ?? null;

  if (caseId !== null) {
    return (
      <SectionFrame title={reviewNo(caseId)} subtitle="我的评审" onBack={() => nav.patch({ caseId: null })}>
        <CaseDetail caseId={caseId} />
      </SectionFrame>
    );
  }
  // 二期：成长视图（层级、风纪值、成就）。后端一项相关能力都没有时不出现这个页签
  const hasGrowth = ['tiers', 'points', 'achievements', 'badge'].some((capability) => config.has(capability));
  const growing = hasGrowth && nav.route.tab === 'growth' && Boolean(status);
  const tabs = hasGrowth ? (
    <div className="kui-segment" role="tablist" aria-label="我的评审">
      <button type="button" role="tab" data-tab="records" aria-selected={!growing} className={growing ? undefined : 'is-active'} onClick={() => nav.patch({ tab: null })}>评审记录</button>
      <button type="button" role="tab" data-tab="growth" aria-selected={growing} className={growing ? 'is-active' : undefined} onClick={() => nav.patch({ tab: 'growth' })}>成长</button>
    </div>
  ) : undefined;
  if (growing && status) {
    return (
      <SectionFrame title="我的评审" subtitle="层级、风纪值和成就" actions={tabs}>
        <GrowthView status={status} />
      </SectionFrame>
    );
  }
  return (
    <SectionFrame title="我的评审" subtitle="你投过的每一票，以及它们和最终结论的对照" actions={tabs}>
      <MineStats basic={status?.stats ?? null} full={stats.data} />
      <History list={list} onListChange={setList} />
    </SectionFrame>
  );
}
