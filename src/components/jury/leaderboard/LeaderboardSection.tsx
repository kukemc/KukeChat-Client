import { useState } from 'react';
import { cx } from '@/components/chat/desktop/runtime';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import type { JuryLeaderboard, JuryLeaderboardItem, JuryLeaderboardPeriod } from '@/types/juryGrowth';
import { useJury } from '../context';
import { useJuryLeaderboard } from '../data/growth';
import { errorText, isUnavailable } from '../data/queries';
import { formatDateTime } from '../labels';
import { Card, Loading, LoadError, NotOpenYet, SectionFrame, StateBlock } from '../widgets/Frame';
import { TierTag } from '../widgets/Tags';

const PERIODS: Array<{ value: JuryLeaderboardPeriod; label: string; name: string; scope: string }> = [
  { value: 'week', label: '本周', name: '周榜', scope: '本周' },
  { value: 'month', label: '本月', name: '月榜', scope: '本月' },
  { value: 'all', label: '总榜', name: '总榜', scope: '累计' }
];

function Row({ item, max, pinned = false }: { item: JuryLeaderboardItem; max: number; pinned?: boolean }): JSX.Element {
  const name = item.user ? getDisplayName(item.user, '委员') : '匿名委员';
  return (
    <div className={cx('kjr-tr', item.me && 'is-me', pinned && 'is-pinned')} role="row" data-rank={item.rank} data-me={item.me || undefined} data-pinned={pinned || undefined}>
      <span role="cell" className={cx('kjr-rank', item.rank <= 3 && `is-top is-top${item.rank}`)}>{item.rank}</span>
      <span role="cell" className="kjr-lb-who">
        {item.user ? <Avatar user={item.user} label={name} size="sm" /> : <span className="kjr-lb-anon" aria-hidden="true"><Icon name="profile" className="h-3.5 w-3.5" /></span>}
        <span className="kjr-lb-name">{name}</span>
        {item.me ? <span className="kui-tag kui-tag--accent">我</span> : null}
      </span>
      <span role="cell"><TierTag tier={item.tier} /></span>
      <span role="cell" className="kjr-lb-votes">{typeof item.votes === 'number' ? `${item.votes} 票` : '—'}</span>
      <span role="cell" className="kjr-lb-points">
        <b>{item.points}</b>
        <span className="kjr-lb-bar"><i style={{ width: `${max > 0 ? Math.max(4, (item.points / max) * 100) : 0}%` }} /></span>
      </span>
    </div>
  );
}

/** 我在这一期的位置：始终看得到，不管在不在当前这一页榜单里。 */
function MyStanding({ board, scope }: { board: JuryLeaderboard; scope: string }): JSX.Element {
  const { identity, status, nav, config } = useJury();
  const visible = Boolean(status?.badge_visible);
  const canSet = config.has('badge') && identity.isJuror;
  return (
    <Card className="kjr-lb-me">
      <div className="kjr-lb-me-main" data-my-rank={board.me?.rank ?? 'none'}>
        {board.me ? (
          <>
            <p className="kjr-lb-me-rank"><small>第</small><strong>{board.me.rank}</strong><small>名</small></p>
            <div>
              <p className="kjr-lb-me-title">{scope}拿到 {board.me.points} 风纪值</p>
              <p className="kjr-quiet">你在榜上显示为{visible ? '自己的昵称和头像' : '「匿名委员」'}。{canSet ? '' : visible ? '' : '公开身份后才会显示昵称。'}</p>
            </div>
          </>
        ) : (
          <>
            <p className="kjr-lb-me-rank is-empty"><strong>—</strong></p>
            <div>
              <p className="kjr-lb-me-title">{identity.isJuror ? `${scope}还没有得分，暂时不在榜上` : '排行榜只列在任委员'}</p>
              <p className="kjr-quiet">{identity.isJuror ? '投出的票所在的案件定案后才结算风纪值，所以刚投完票时榜上不会马上有变化。' : identity.canApply ? '成为委员并拿到风纪值之后，你的名次会出现在这里。' : '你现在不是在任委员。'}</p>
            </div>
          </>
        )}
      </div>
      {canSet ? <button type="button" className="kui-btn kui-btn--sm" data-action="lb-badge" onClick={() => nav.goSection('mine', { tab: 'growth' })}>{visible ? '身份已公开 · 去设置' : '公开我的身份'}</button> : null}
    </Card>
  );
}

/**
 * 排行榜：按风纪值排的周榜、月榜、总榜。只有选择公开身份的委员显示昵称和头像，其余是「匿名委员」；
 * 自己的名次始终可见 —— 不在这一页榜单里时，在榜单下面单独列一行。
 */
export function LeaderboardSection(): JSX.Element {
  const { identity } = useJury();
  const [period, setPeriod] = useState<JuryLeaderboardPeriod>('week');
  const query = useJuryLeaderboard(period, true);
  const board = query.data;
  const current = PERIODS.find((item) => item.value === period) ?? PERIODS[0];
  const stale = query.isPlaceholderData;

  const tabs = (
    <div className="kui-segment" role="tablist" aria-label="榜单周期">
      {PERIODS.map((item) => <button key={item.value} type="button" role="tab" data-period={item.value} aria-selected={period === item.value} className={period === item.value ? 'is-active' : undefined} onClick={() => setPeriod(item.value)}>{item.label}</button>)}
    </div>
  );

  let body: JSX.Element;
  if (query.isLoading) {
    body = <Loading />;
  } else if (!board) {
    body = isUnavailable(query.error) ? <NotOpenYet what="排行榜" /> : <LoadError message={errorText(query.error, '排行榜加载失败，请稍后再试。')} onRetry={() => void query.refetch()} />;
  } else {
    const max = Math.max(...board.items.map((item) => item.points), 1);
    const listed = board.items.some((item) => item.me);
    // 自己不在这一页里：补一行。me 和榜单行同形；早期的后端只给名次和分数，那时层级取自己的身份、票数留空
    const mine: JuryLeaderboardItem | null = board.me && !listed ? { ...board.me, tier: board.me.tier ?? identity.tier, me: true } : null;
    body = (
      <>
        <MyStanding board={board} scope={current.scope} />
        <Card title={current.name} aside={<span className="kjr-meta">{stale ? '加载中…' : `榜单每分钟更新 · 更新于 ${formatDateTime(board.generated_at)}`}</span>} className="kjr-lb">
          {board.items.length === 0 ? (
            <StateBlock icon="star" title={period === 'all' ? '还没有人上榜' : `${current.label}还没有人上榜`} compact>
              榜单只列在任委员，而且要拿到风纪值才上榜。风纪委员会刚成立，第一批案件定案之后这里才会有名字。
            </StateBlock>
          ) : (
            <div className="kjr-table kjr-table--lb" role="table" aria-label={current.name} data-rows={board.items.length}>
              <div className="kjr-tr kjr-th" role="row"><span role="columnheader">名次</span><span role="columnheader">委员</span><span role="columnheader">层级</span><span role="columnheader">本期投票</span><span role="columnheader">风纪值</span></div>
              {board.items.map((item) => <Row key={item.rank} item={item} max={max} />)}
              {mine ? (
                // 钉在榜单底部：榜单很长时往下翻，这一行始终贴着可视区域的下沿
                <div className="kjr-lb-pinned" role="rowgroup">
                  <div className="kjr-lb-gap" role="presentation"><i />你的位置<i /></div>
                  <Row item={mine} max={max} pinned />
                </div>
              ) : null}
            </div>
          )}
          {board.items.length > 0 && board.items.length < 5 ? <p className="kjr-quiet kjr-lb-note">榜单还很短：委员会刚成立，在任委员不多。</p> : null}
        </Card>
        <p className="kjr-quiet kjr-lb-rules">
          排的是风纪值：票与结论一致、质控题答对、观点被认可都会加分，明细在「我的评审 · 成长」里。只列在任委员，本期得分为 0 的不上榜；周榜和月榜按自然周、自然月（北京时间）计算。榜单每分钟更新一次，所以刚拿到的分数可能要等一会儿才出现在榜上，这期间它和你「成长」页里的风纪值会差一点。
          榜单不代表谁「更会判」—— 认真写理由、拿不准时弃权，同样是好的评审。
        </p>
      </>
    );
  }

  return <SectionFrame title="排行榜" subtitle="按风纪值排名；没有公开身份的委员显示为匿名" actions={tabs}>{body}</SectionFrame>;
}
