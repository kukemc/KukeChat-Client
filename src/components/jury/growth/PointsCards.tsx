import { useState } from 'react';
import { cx } from '@/components/chat/desktop/runtime';
import type { JuryStatus } from '@/types/jury';
import { useJury } from '../context';
import { useJuryPoints } from '../data/growth';
import { errorText, isUnavailable } from '../data/queries';
import { formatDateTime } from '../labels';
import { Card, Loading, LoadError, NotOpenYet, StateBlock } from '../widgets/Frame';
import { Pager } from '../widgets/Pager';
import { POINT_KIND_LABEL, pointKindLabel, signed } from './labels';

const PAGE_SIZE = 20;
/** 「怎么获得」里各项的顺序；配置里多出来的项接在后面 */
const KIND_ORDER = ['vote_agreed', 'vote_disagreed', 'quality_correct', 'quality_wrong', 'daily_first', 'streak_7', 'opinion_liked', 'exam_passed', 'overturn_adjust', 'panel_agreed', 'panel_disagreed', 'review_vote'];

/** 风纪值的总数，和每一种事件值多少分（全部来自 config.points）。 */
export function PointsSummary({ status }: { status: JuryStatus }): JSX.Element {
  const { config, nav } = useJury();
  const table = config.config.points ?? {};
  const kinds = [...KIND_ORDER.filter((kind) => kind in table), ...Object.keys(table).filter((kind) => !KIND_ORDER.includes(kind))];
  const threshold = config.config.opinions.like_reward_threshold;
  const hint: Record<string, string> = {
    vote_agreed: '案件定案时结算',
    vote_disagreed: '认真参与同样有分',
    quality_correct: '投完当场结算',
    quality_wrong: '投完当场结算',
    daily_first: '每天第一张计入表决的票',
    streak_7: '每满 7 天一次',
    opinion_liked: threshold ? `一条观点的赞第一次达到 ${threshold} 个` : '观点获得足够多的赞',
    exam_passed: '只算第一次',
    overturn_adjust: '按新结论补差，可能加也可能减',
    panel_agreed: '资深委员 · 合议定案时结算',
    panel_disagreed: '资深委员 · 合议定案时结算',
    review_vote: '资深委员 · 每张申诉复审 / 举报复议票，投完当场结算'
  };
  return (
    <Card title="风纪值" aside={config.has('leaderboard') ? <button type="button" className="kui-btn kui-btn--ghost kui-btn--sm" onClick={() => nav.goSection('ranking')}>查看排行榜</button> : undefined} className="kjr-points">
      <p className="kjr-points-total" data-points-total={status.points ?? 0}><strong>{status.points ?? 0}</strong><span>风纪值</span></p>
      <p className="kjr-quiet">风纪值记录的是你为社区评审出的力。它只用于排行榜和成就，不能兑换任何东西；层级的晋升看的是票数、一致率和在任天数，不看风纪值。</p>
      {kinds.length > 0 ? (
        <>
          <h3 className="kjr-h">怎么获得</h3>
          <dl className="kjr-points-table">
            {kinds.map((kind) => (
              <div key={kind}>
                <dt>{POINT_KIND_LABEL[kind] ?? kind}{hint[kind] ? <small>{hint[kind]}</small> : null}</dt>
                <dd className={cx(table[kind] < 0 && 'kjr-no')}>{kind === 'overturn_adjust' ? `±${Math.abs(table[kind])}` : signed(table[kind])}</dd>
              </div>
            ))}
          </dl>
          <p className="kjr-quiet">弃权、上下文不足、主动回避和练习都不给分。总分不会低于 0。</p>
        </>
      ) : null}
    </Card>
  );
}

/** 风纪值明细：每一笔是什么时候、因为什么、来自哪个案件。 */
export function PointsLedger({ enabled }: { enabled: boolean }): JSX.Element {
  const { nav, config } = useJury();
  const [offset, setOffset] = useState(0);
  const query = useJuryPoints(PAGE_SIZE, offset, enabled);
  const items = query.data?.items ?? [];
  const canOpen = config.has('case_detail');
  return (
    <Card title="风纪值明细" className="kjr-ledger">
      {query.isLoading ? <Loading compact />
        : !query.data ? (isUnavailable(query.error) ? <NotOpenYet what="风纪值明细" compact /> : <LoadError compact message={errorText(query.error, '明细加载失败，请稍后再试。')} onRetry={() => void query.refetch()} />)
        : items.length === 0 ? <StateBlock icon="star" title="还没有风纪值记录" compact>投出的票所在的案件定案后，这里会出现第一笔。</StateBlock>
        : (
          <>
            <div className="kjr-table kjr-table--ledger" role="table" aria-label="风纪值明细">
              <div className="kjr-tr kjr-th" role="row"><span role="columnheader">时间</span><span role="columnheader">事项</span><span role="columnheader">评审</span><span role="columnheader">风纪值</span></div>
              {items.map((item, index) => (
                <div key={`${item.created_at}-${index}`} className="kjr-tr" role="row" data-ledger={item.kind}>
                  <span role="cell" className="kjr-td-time">{formatDateTime(item.created_at)}</span>
                  <span role="cell" className="kjr-td-text">{pointKindLabel(item.kind, item.label)}</span>
                  {/* 今日首票、连续参与这类加分不属于某个案件（case_id 为 null）：不渲染链接，免得点不动或跳到空页 */}
                  <span role="cell">{typeof item.case_id !== 'number' ? <span className="kjr-meta">—</span> : canOpen ? <button type="button" className="kui-link" onClick={() => nav.patch({ caseId: item.case_id })}>#{item.case_id}</button> : `#${item.case_id}`}</span>
                  <span role="cell" className={cx('kjr-ledger-points', item.points < 0 && 'kjr-no')}>{signed(item.points)}</span>
                </div>
              ))}
            </div>
            <Pager total={query.data.count} limit={PAGE_SIZE} offset={offset} busy={query.isPlaceholderData} onChange={setOffset} />
          </>
        )}
    </Card>
  );
}
