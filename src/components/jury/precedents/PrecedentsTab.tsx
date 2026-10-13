import { useMemo, useState } from 'react';
import type { Precedent, PrecedentQuery } from '@/types/jurySenior';
import { useJury } from '../context';
import { usePrecedents } from '../data/precedents';
import { errorText, useModerationRules } from '../data/queries';
import { formatDay, KIND_LABEL } from '../labels';
import { Card, Loading, LoadError, StateBlock } from '../widgets/Frame';
import { Pager } from '../widgets/Pager';
import { OutcomeTag } from '../widgets/Tags';

const PAGE_SIZE = 10;

export const PRECEDENT_BY_LABEL: Record<Precedent['by'], string> = { senior: '资深委员标注', admin: '管理员标注' };

function Row({ item, onOpen }: { item: Precedent; onOpen: () => void }): JSX.Element {
  return (
    <li>
      <button type="button" className="kjr-prec-row" data-precedent={item.id} onClick={onOpen}>
        <span className="kjr-prec-title">{item.title}</span>
        <span className="kjr-prec-excerpt">{item.summary}</span>
        <span className="kjr-prec-meta">
          <OutcomeTag outcome={item.outcome} level={item.level} />
          {item.category_label ? <span className="kui-tag">{item.category_label}</span> : null}
          {item.mine ? <span className="kui-tag kui-tag--accent">我标注的</span> : null}
          <span>{KIND_LABEL[item.kind] ?? item.kind} · 案件 #{item.case_id} · {PRECEDENT_BY_LABEL[item.by] ?? item.by} · {formatDay(item.created_at)}</span>
        </span>
      </button>
    </li>
  );
}

/** 规则手册 · 判例库：被标为判例的已定案件和它们的裁判要旨。所有登录用户可读。 */
export function PrecedentsTab(): JSX.Element {
  const { nav, identity } = useJury();
  const categories = useModerationRules().data?.categories ?? [];
  const [list, setList] = useState({ category: '', offset: 0 });
  const params = useMemo<PrecedentQuery>(() => ({ limit: PAGE_SIZE, offset: list.offset, ...(list.category ? { category: list.category } : {}) }), [list]);
  const query = usePrecedents(params, true);
  const items = query.data?.items ?? [];

  return (
    <>
      <p className="kui-note kjr-lead-note">
        判例是从已经定案的案件里挑出来的：它把一类情况「该怎么判」写成一段裁判要旨，给之后的评审对尺度用。规则说的是原则，判例说的是原则落到具体情况上是什么样。
        由资深委员（只能标自己投过票的案件）和管理员标注。
      </p>
      <Card className="kjr-history">
        <div className="kjr-filters">
          {categories.length > 0 ? (
            <select className="kui-select" aria-label="按违规类别筛选" value={list.category} onChange={(event) => setList({ category: event.target.value, offset: 0 })}>
              <option value="">全部类别</option>
              {categories.map((category) => <option key={category.key} value={category.key}>{category.label}</option>)}
            </select>
          ) : null}
          {list.category ? <button type="button" className="kui-btn kui-btn--ghost kui-btn--sm" onClick={() => setList({ category: '', offset: 0 })}>清除筛选</button> : null}
          {query.data ? <span className="kjr-meta kjr-prec-total">共 {query.data.total} 个判例</span> : null}
        </div>
        {query.isLoading ? <Loading compact />
          : !query.data ? <LoadError compact message={errorText(query.error, '判例库加载失败，请稍后再试。')} onRetry={() => void query.refetch()} />
          : items.length === 0 ? (
            <StateBlock icon="bookmark" title={list.category ? '这个类别下还没有判例' : '还没有判例'} compact actions={list.category ? <button type="button" className="kui-btn kui-btn--sm" onClick={() => setList({ category: '', offset: 0 })}>清除筛选</button> : undefined}>
              {list.category ? '换一个类别看看。' : identity.isSenior ? '你可以在「我的评审」里打开一个自己投过票、已经定案的案件，把它标为判例。' : '资深委员和管理员标出第一个判例后，会出现在这里。'}
            </StateBlock>
          ) : (
            <>
              <ul className="kjr-prec-list">{items.map((item) => <Row key={item.id} item={item} onOpen={() => nav.patch({ itemId: item.id })} />)}</ul>
              <Pager total={query.data.total} limit={PAGE_SIZE} offset={list.offset} busy={query.isPlaceholderData} onChange={(offset) => setList({ ...list, offset })} />
            </>
          )}
      </Card>
    </>
  );
}
