import { useState } from 'react';
import { createPortal } from 'react-dom';
import { cx } from '@/components/chat/desktop/runtime';
import { formatCoins } from '@/components/shop/labels';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { useKukeStore } from '@/store/kukeStore';
import type { CharmLeaderboardItem, CharmPeriod } from '@/types/gift';
import { CHARM_BOARD_SIZE, useCharmBoardLabel, useCharmLabel, useCharmLeaderboard } from './data';

const PERIODS: Array<{ value: CharmPeriod; label: string }> = [
  { value: 'all', label: '总榜' },
  { value: 'month', label: '本月' }
];

function Row({ item, mine, pinned = false, onOpen }: { item: CharmLeaderboardItem; mine: boolean; pinned?: boolean; onOpen: (userId: number) => void }): JSX.Element {
  const name = item.user ? getDisplayName(item.user, `用户 ${item.user.id}`) : '已注销的用户';
  const userId = item.user?.id ?? null;
  return (
    <button type="button" className={cx('kjr-tr', mine && 'is-me', pinned && 'is-pinned')} role="row" data-rank={item.rank} data-me={mine || undefined} data-pinned={pinned || undefined} disabled={userId === null} onClick={() => userId !== null && onOpen(userId)}>
      <span role="cell" className={cx('kjr-rank', item.rank <= 3 && `is-top is-top${item.rank}`)}>{item.rank}</span>
      <span role="cell" className="kjr-lb-who">
        <Avatar user={item.user} label={name} size="sm" />
        <span className="klv-lb-id"><span className="kjr-lb-name">{name}</span></span>
        {mine ? <span className="kui-tag kui-tag--accent">我</span> : null}
      </span>
      <span role="cell" className="klv-lb-num is-key">{formatCoins(item.charm)}</span>
    </button>
  );
}

/**
 * 心意榜：按收到礼物涨的心意值排，总榜和本月两个页签（GET /gifts/leaderboard）。放在排行榜页（components/ranking）的「心意榜」页签里，和活跃榜、风纪榜并列。
 * 行的样子、前三名的圆牌、钉在底部的「我」沿用活跃榜 / 风纪排行榜的那一套（kjr-table / kjr-rank / kjr-lb-pinned），这里只定自己的列。
 * 一次取前 50 名；自己不在这 50 名里、但有名次时，底部钉一行自己的位置（移动端送到页面给的 pinnedSlot 里，原因见 LevelLeaderboard）。
 */
export function CharmLeaderboard({ layout, pinnedSlot }: { layout: 'desktop' | 'mobile'; pinnedSlot?: HTMLElement | null }): JSX.Element {
  const [period, setPeriod] = useState<CharmPeriod>('all');
  const currentUser = useKukeStore((state) => state.currentUser);
  const openUserSpace = useKukeStore((state) => state.openUserSpace);
  const charmLabel = useCharmLabel();
  const boardLabel = useCharmBoardLabel();
  const query = useCharmLeaderboard(period, true);
  const board = query.data;
  const items = board?.items ?? [];
  const listed = currentUser !== null && items.some((item) => item.user?.id === currentUser.id);
  const me: CharmLeaderboardItem | null = board && currentUser && board.me.rank !== null ? { rank: board.me.rank, user: currentUser, charm: board.me.charm } : null;

  return (
    <section className="klv-card klv-board kgf-board" data-gift="board" data-period={period}>
      <header className="klv-card-head">
        <div className="kui-segment" role="tablist" aria-label={boardLabel}>
          {PERIODS.map((item) => <button key={item.value} type="button" role="tab" data-period={item.value} aria-selected={period === item.value} className={period === item.value ? 'is-active' : undefined} onClick={() => setPeriod(item.value)}>{item.label}</button>)}
        </div>
        <div className="klv-card-aside"><span className="klv-meta">{period === 'month' ? `按本月收到的${charmLabel}排` : `按累计收到的${charmLabel}排`}</span></div>
      </header>
      {query.isLoading ? <p className="klv-quiet klv-board-state" role="status">加载中…</p>
        : query.error && !board ? (
          <div className="klv-board-state" role="alert">
            <p className="kui-note kui-note--danger">{boardLabel}没有加载出来：{query.error.message}</p>
            <button type="button" className="kui-btn kui-btn--sm" onClick={() => void query.refetch()}>重试</button>
          </div>
        )
        : items.length === 0 ? <p className="klv-quiet klv-board-state" data-gift-board="empty">{period === 'month' ? '这个月还没有人收到礼物。' : '还没有人收到礼物。'}收到第一份礼物就会出现在这里。</p>
        : (
          <div className={cx('kjr-table klv-table kgf-table', `klv-table--${layout}`)} role="table" aria-label={boardLabel} data-rows={items.length}>
            {layout === 'desktop' ? <div className="kjr-tr kjr-th" role="row"><span role="columnheader">名次</span><span role="columnheader">用户</span><span role="columnheader" className="klv-lb-num">{charmLabel}</span></div> : null}
            {items.map((item) => <Row key={`${item.rank}-${item.user?.id ?? 'x'}`} item={item} mine={item.user?.id === currentUser?.id} onOpen={openUserSpace} />)}
            {me && !listed && !pinnedSlot ? (
              <div className="kjr-lb-pinned" role="rowgroup">
                <div className="kjr-lb-gap" role="presentation"><i />你的位置<i /></div>
                <Row item={me} mine pinned onOpen={openUserSpace} />
              </div>
            ) : null}
          </div>
        )}
      {me && !listed && pinnedSlot && items.length > 0 ? createPortal(
        <div className={`kjr-table klv-table kgf-table klv-table--${layout} klv-pinned-foot`} role="rowgroup" aria-label="你的位置">
          <Row item={me} mine pinned onOpen={openUserSpace} />
        </div>,
        pinnedSlot
      ) : null}
      {board && !me && items.length > 0 ? <p className="klv-quiet klv-board-note" data-gift-board="me-none"><Icon name="info" className="h-3.5 w-3.5" />{period === 'month' ? '你这个月还没有收到礼物，所以不在榜上。' : '你还没有上榜：收到第一份礼物之后就会出现。'}</p> : null}
      <p className="klv-quiet klv-board-note">{charmLabel}是收到礼物时涨的：别人送你的礼物花了多少金币，就涨多少。{period === 'month' ? '本月的榜按北京时间的自然月算。' : ''}这里显示前 {CHARM_BOARD_SIZE} 名。</p>
    </section>
  );
}
