import { useState } from 'react';
import { cx } from '@/components/chat/desktop/runtime';
import type { AppealMineItem } from '@/types/jurySenior';
import { errorText } from '../data/queries';
import { useMyAppealReviews } from '../data/senior';
import { formatDateTime, formatDay, KIND_LABEL, levelText } from '../labels';
import { Card, Loading, LoadError, StateBlock } from '../widgets/Frame';
import { Pager } from '../widgets/Pager';
import { APPEAL_VOTE_TONE, appealVoteLabel, PENALTY_SOURCE_LABEL, penaltyLabel, REVIEW_TYPE_LABEL } from './labels';

const PAGE_SIZE = 20;

function Row({ item }: { item: AppealMineItem }): JSX.Element {
  const type = item.type ?? 'appeal';
  const agreed = item.outcome ? item.outcome === item.my_vote : null;
  return (
    <div role="row" className="kjr-tr" data-review={item.review_id}>
      <span role="cell" className="kjr-td-id">#{item.review_id}<small>{REVIEW_TYPE_LABEL[type]}</small></span>
      <span role="cell" className="kjr-td-text">
        {type === 'reconsider' ? '对「不违规」的结论申请复议' : `${item.category_label ?? '处罚'}${item.level ? ` · ${levelText(item.level)}` : ''}${item.penalty ? ` · ${penaltyLabel(item.penalty)}` : ''}`}
        <small>{KIND_LABEL[item.kind] ?? item.kind}{item.source ? ` · ${PENALTY_SOURCE_LABEL[item.source] ?? item.source}` : ''}</small>
      </span>
      <span role="cell"><span className={cx('kui-tag', APPEAL_VOTE_TONE[item.my_vote])}>{appealVoteLabel(item.my_vote, type)}</span></span>
      <span role="cell">{item.outcome ? <span className={cx('kui-tag', APPEAL_VOTE_TONE[item.outcome])}>{appealVoteLabel(item.outcome, type)}</span> : <span className="kui-tag kui-tag--warn">等待其他委员</span>}</span>
      <span role="cell" className={cx(agreed === true && 'kjr-yes', agreed === false && 'kjr-no')}>{agreed === null ? '—' : agreed ? '一致' : '不一致'}</span>
      <span role="cell" className="kjr-td-time">{formatDateTime(item.voted_at)}{item.settled_at ? <small>{formatDay(item.settled_at)} 出结果</small> : null}</span>
    </div>
  );
}

/** 我参与过的复审：我的意见、最后的结果。复审没有观点区，所以这里只有一张表，没有详情页。 */
export function AppealHistory(): JSX.Element {
  const [offset, setOffset] = useState(0);
  const query = useMyAppealReviews({ limit: PAGE_SIZE, offset }, true);
  const items = query.data?.items ?? [];
  return (
    <div className="kjr-body kui-scroll">
      <div className="kjr-wrap">
        <Card title="复审记录" aside={<span className="kjr-meta">结果可能被管理员改掉，以申诉人收到的通知为准</span>} className="kjr-history">
          {query.isLoading ? <Loading compact />
            : !query.data ? <LoadError compact message={errorText(query.error, '复审记录加载失败，请稍后再试。')} onRetry={() => void query.refetch()} />
            : items.length === 0 ? <StateBlock icon="clock" title="还没有参与过复审" compact>投出第一张复审票后，记录会出现在这里。</StateBlock>
            : (
              <>
                <div className="kjr-table kjr-table--reviews" role="table" aria-label="我参与过的复审">
                  <div className="kjr-tr kjr-th" role="row">
                    <span role="columnheader">复审</span><span role="columnheader">对象</span><span role="columnheader">我的意见</span><span role="columnheader">结果</span><span role="columnheader">是否一致</span><span role="columnheader">投票时间</span>
                  </div>
                  {items.map((item) => <Row key={item.review_id} item={item} />)}
                </div>
                <Pager total={query.data.total} limit={PAGE_SIZE} offset={offset} busy={query.isPlaceholderData} onChange={setOffset} />
              </>
            )}
        </Card>
      </div>
    </div>
  );
}
