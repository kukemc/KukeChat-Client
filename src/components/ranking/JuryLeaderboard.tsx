import { useState } from 'react';
import { createPortal } from 'react-dom';
import { cx } from '@/components/chat/desktop/runtime';
import { useJuryLeaderboard } from '@/components/jury/data/growth';
import { TierTag } from '@/components/jury/widgets/Tags';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { useKukeStore } from '@/store/kukeStore';
import type { JuryLeaderboardItem, JuryLeaderboardPeriod } from '@/types/juryGrowth';
import { parseApiDate } from '@/utils/dateTime';

const PERIODS: Array<{ value: JuryLeaderboardPeriod; label: string; hint: string }> = [
  { value: 'week', label: '本周', hint: '按本周拿到的风纪值排' },
  { value: 'month', label: '本月', hint: '按本月拿到的风纪值排' },
  { value: 'all', label: '总榜', hint: '按累计风纪值排' }
];

function Row({ item, mine, pinned = false, layout, onOpen }: { item: JuryLeaderboardItem; mine: boolean; pinned?: boolean; layout: 'desktop' | 'mobile'; onOpen: (userId: number) => void }): JSX.Element {
  // 没有公开身份的委员服务端不给 user：显示成「匿名委员」，这一行点不了
  const name = item.user ? getDisplayName(item.user, '委员') : '匿名委员';
  const userId = item.user?.id ?? null;
  const votes = typeof item.votes === 'number' ? `${item.votes.toLocaleString('zh-CN')} 票` : '—';
  return (
    <button type="button" className={cx('kjr-tr', mine && 'is-me', pinned && 'is-pinned')} role="row" data-rank={item.rank} data-me={mine || undefined} data-pinned={pinned || undefined} disabled={userId === null} onClick={() => userId !== null && onOpen(userId)}>
      <span role="cell" className={cx('kjr-rank', item.rank <= 3 && `is-top is-top${item.rank}`)}>{item.rank}</span>
      <span role="cell" className="kjr-lb-who">
        {item.user ? <Avatar user={item.user} label={name} size="sm" /> : <span className="kjr-lb-anon" aria-hidden="true"><Icon name="profile" className="h-3.5 w-3.5" /></span>}
        <span className="klv-lb-id">
          <span className="kjr-lb-name">{name}</span>
          {layout === 'mobile' ? <span className="klv-lb-sub">本期 {votes}</span> : null}
        </span>
        {mine ? <span className="kui-tag kui-tag--accent">我</span> : null}
      </span>
      <span role="cell" className="klv-lb-level"><TierTag tier={item.tier} /></span>
      {layout === 'desktop' ? <span role="cell" className="klv-lb-num">{votes}</span> : null}
      <span role="cell" className="klv-lb-num is-key">{item.points.toLocaleString('zh-CN')}</span>
    </button>
  );
}

/**
 * 风纪榜：按风纪值排的周榜、月榜、总榜（GET /jury/leaderboard），放在排行榜页里，和活跃榜、心意榜同一个样子
 * （kjr-table / klv-table 的行、前三名的圆牌、钉在底部的「我」）。风纪页里自己的「排行榜」板块还在，那边多了公开身份的设置和规则说明。
 * 只有公开了身份的委员显示昵称和头像，其余是「匿名委员」。自己不在这一页里但有名次时，底部钉一行自己的位置（移动端送到 pinnedSlot）。
 */
export function JuryLeaderboard({ layout, pinnedSlot }: { layout: 'desktop' | 'mobile'; pinnedSlot?: HTMLElement | null }): JSX.Element {
  const [period, setPeriod] = useState<JuryLeaderboardPeriod>('week');
  const openUserSpace = useKukeStore((state) => state.openUserSpace);
  const query = useJuryLeaderboard(period, true);
  const board = query.isPlaceholderData ? undefined : query.data;
  const items = board?.items ?? [];
  const current = PERIODS.find((item) => item.value === period) ?? PERIODS[0];
  const listed = items.some((item) => item.me);
  // me 和榜单行同形；早期的后端只给名次和分数，票数那一格就是「—」
  const me: JuryLeaderboardItem | null = board?.me ? { ...board.me, me: true } : null;
  const generatedAt = parseApiDate(board?.generated_at);

  return (
    <section className="klv-card klv-board krk-jury" data-ranking-board="jury" data-period={period}>
      <header className="klv-card-head">
        <div className="kui-segment" role="tablist" aria-label="风纪榜">
          {PERIODS.map((item) => <button key={item.value} type="button" role="tab" data-period={item.value} aria-selected={period === item.value} className={period === item.value ? 'is-active' : undefined} onClick={() => setPeriod(item.value)}>{item.label}</button>)}
        </div>
        <div className="klv-card-aside"><span className="klv-meta">{current.hint}</span></div>
      </header>
      {query.isLoading || query.isPlaceholderData ? <p className="klv-quiet klv-board-state" role="status">加载中…</p>
        : query.error && !board ? (
          <div className="klv-board-state" role="alert">
            <p className="kui-note kui-note--danger">风纪榜没有加载出来：{query.error.message}</p>
            <button type="button" className="kui-btn kui-btn--sm" onClick={() => void query.refetch()}>重试</button>
          </div>
        )
        : items.length === 0 ? <p className="klv-quiet klv-board-state" data-ranking-empty="jury">{period === 'all' ? '还没有人上榜。' : `${current.label}还没有人上榜。`}只列在任委员，拿到风纪值之后才会出现在这里。</p>
        : (
          <div className={cx('kjr-table klv-table krk-jury-table', `klv-table--${layout}`)} role="table" aria-label={`风纪榜 · ${current.label}`} data-rows={items.length}>
            {layout === 'desktop' ? <div className="kjr-tr kjr-th" role="row"><span role="columnheader">名次</span><span role="columnheader">委员</span><span role="columnheader">层级</span><span role="columnheader" className="klv-lb-num">本期投票</span><span role="columnheader" className="klv-lb-num">风纪值</span></div> : null}
            {items.map((item) => <Row key={`${item.rank}-${item.user?.id ?? 'x'}`} item={item} mine={Boolean(item.me)} layout={layout} onOpen={openUserSpace} />)}
            {me && !listed && !pinnedSlot ? (
              <div className="kjr-lb-pinned" role="rowgroup">
                <div className="kjr-lb-gap" role="presentation"><i />你的位置<i /></div>
                <Row item={me} mine pinned layout={layout} onOpen={openUserSpace} />
              </div>
            ) : null}
          </div>
        )}
      {me && !listed && pinnedSlot && items.length > 0 ? createPortal(
        <div className={`kjr-table klv-table krk-jury-table klv-table--${layout} klv-pinned-foot`} role="rowgroup" aria-label="你的位置">
          <Row item={me} mine pinned layout={layout} onOpen={openUserSpace} />
        </div>,
        pinnedSlot
      ) : null}
      {board && !me && items.length > 0 ? <p className="klv-quiet klv-board-note" data-ranking-me="none"><Icon name="info" className="h-3.5 w-3.5" />{period === 'all' ? '你还不在风纪榜上：只列在任委员，拿到风纪值之后才会出现。' : `你${current.label}还没有拿到风纪值，所以不在榜上。`}</p> : null}
      <p className="klv-quiet klv-board-note">
        没有公开身份的委员显示为「匿名委员」。周榜和月榜按北京时间的自然周、自然月算。{generatedAt ? `榜单每分钟更新，上次更新 ${generatedAt.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}。` : ''}
      </p>
    </section>
  );
}
