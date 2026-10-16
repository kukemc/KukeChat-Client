import { useState } from 'react';
import { createPortal } from 'react-dom';
import { cx } from '@/components/chat/desktop/runtime';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { useKukeStore } from '@/store/kukeStore';
import type { LevelLeaderboardItem, LevelLeaderboardPeriod } from '@/types/level';
import { parseApiDate } from '@/utils/dateTime';
import { useLevelLeaderboard } from './data';
import { formatDays } from './labels';
import { LevelIcons } from './LevelIcons';

const PERIODS: Array<{ value: LevelLeaderboardPeriod; label: string; hint: string }> = [
  { value: 'all', label: '总榜', hint: '按累计活跃天排' },
  { value: 'month', label: '月榜', hint: '按本月新增的活跃天排' }
];

function Row({ item, period, mine, pinned = false, layout, onOpen }: { item: LevelLeaderboardItem; period: LevelLeaderboardPeriod; mine: boolean; pinned?: boolean; layout: 'desktop' | 'mobile'; onOpen: (userId: number) => void }): JSX.Element {
  const name = item.user ? getDisplayName(item.user, `用户 ${item.user.id}`) : '已注销的用户';
  const userId = item.user?.id ?? null;
  return (
    <button type="button" className={cx('kjr-tr', mine && 'is-me', pinned && 'is-pinned')} role="row" data-rank={item.rank} data-me={mine || undefined} data-pinned={pinned || undefined} disabled={userId === null} onClick={() => userId !== null && onOpen(userId)}>
      <span role="cell" className={cx('kjr-rank', item.rank <= 3 && `is-top is-top${item.rank}`)}>{item.rank}</span>
      <span role="cell" className="kjr-lb-who">
        <Avatar user={item.user} label={name} size="sm" />
        <span className="klv-lb-id">
          <span className="kjr-lb-name">{name}</span>
          {layout === 'mobile' ? <span className="klv-lb-sub">累计 {formatDays(item.active_days)} 天</span> : null}
        </span>
        {mine ? <span className="kui-tag kui-tag--accent">我</span> : null}
      </span>
      {/* 行本身是按钮（点了看这个人），图标只响应悬停 */}
      <span role="cell" className="klv-lb-level"><LevelIcons level={item.level} userId={userId} variant={layout === 'mobile' ? 'compact' : 'full'} passive /></span>
      {layout === 'desktop' ? <span role="cell" className={cx('klv-lb-num', period === 'all' && 'is-key')}>{formatDays(item.active_days)}<small> 天</small></span> : null}
      <span role="cell" className={cx('klv-lb-num', (period === 'month' || layout === 'mobile') && 'is-key')}>+{formatDays(item.gained)}{layout === 'mobile' ? <small> 本月</small> : null}</span>
    </button>
  );
}

/**
 * 活跃排行榜（排行榜页的「活跃榜」页签）：总榜（累计活跃天）和月榜（本月新增）两个页签。行的样子、前三名的圆牌、钉在底部的「我」沿用风纪排行榜的那一套
 * （kjr-table / kjr-rank / kjr-lb-pinned），这里只定自己的列。一次 50 条，往下点「加载更多」；
 * 自己不在已经加载的这些行里时，底部钉一行自己的名次：桌面上它贴着滚动区域的下沿（position: sticky）；
 * 移动端的滚动区域底下留着一截给底栏和安全区的内边距，贴不到底，所以那边把这一行送到页面给的 pinnedSlot 里（滚动区域外面的页脚）。
 */
export function LevelLeaderboard({ layout, pinnedSlot }: { layout: 'desktop' | 'mobile'; pinnedSlot?: HTMLElement | null }): JSX.Element {
  const [period, setPeriod] = useState<LevelLeaderboardPeriod>('all');
  const currentUserId = useKukeStore((state) => state.currentUser?.id ?? null);
  const openUserSpace = useKukeStore((state) => state.openUserSpace);
  const query = useLevelLeaderboard(period, true);
  const pages = query.data?.pages;
  const first = pages?.[0];
  const items = pages?.flatMap((page) => page.items) ?? [];
  const current = PERIODS.find((item) => item.value === period) ?? PERIODS[0];
  // 我的名次以最后加载的那一页为准（最新）
  const me = pages && pages.length > 0 ? pages[pages.length - 1].me : null;
  const listed = currentUserId !== null && items.some((item) => item.user?.id === currentUserId);
  const generatedAt = parseApiDate(first?.generated_at);

  return (
    <section className="klv-card klv-board" data-level="board" data-period={period}>
      <header className="klv-card-head">
        <div className="kui-segment" role="tablist" aria-label="榜单">
          {PERIODS.map((item) => <button key={item.value} type="button" role="tab" data-period={item.value} aria-selected={period === item.value} className={period === item.value ? 'is-active' : undefined} onClick={() => setPeriod(item.value)}>{item.label}</button>)}
        </div>
        <div className="klv-card-aside"><span className="klv-meta">{current.hint}{first ? ` · ${first.total.toLocaleString('zh-CN')} 人上榜` : ''}</span></div>
      </header>
      {query.isLoading ? <p className="klv-quiet klv-board-state" role="status">加载中…</p>
        : query.error && !first ? (
          <div className="klv-board-state" role="alert">
            <p className="kui-note kui-note--danger">排行榜没有加载出来：{query.error.message}</p>
            <button type="button" className="kui-btn kui-btn--sm" onClick={() => void query.refetch()}>重试</button>
          </div>
        )
        : items.length === 0 ? <p className="klv-quiet klv-board-state" data-level-board="empty">{period === 'month' ? '这个月还没有人上榜。' : '还没有人上榜。'}拿到第一个活跃天就会出现在这里。</p>
        : (
          <div className={cx('kjr-table klv-table', `klv-table--${layout}`)} role="table" aria-label={current.label} data-rows={items.length}>
            {layout === 'desktop' ? <div className="kjr-tr kjr-th" role="row"><span role="columnheader">名次</span><span role="columnheader">用户</span><span role="columnheader">等级</span><span role="columnheader" className="klv-lb-num">累计活跃</span><span role="columnheader" className="klv-lb-num">本月新增</span></div> : null}
            {items.map((item) => <Row key={`${item.rank}-${item.user?.id ?? 'x'}`} item={item} period={period} mine={item.user?.id === currentUserId} layout={layout} onOpen={openUserSpace} />)}
            {query.hasNextPage ? (
              <div className="klv-board-more">
                <button type="button" className="kui-btn kui-btn--sm" data-action="board-more" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>{query.isFetchingNextPage ? '加载中…' : `加载更多（已显示 ${items.length} / ${first?.total ?? items.length}）`}</button>
              </div>
            ) : null}
            {me && !listed && !pinnedSlot ? (
              <div className="kjr-lb-pinned" role="rowgroup">
                <div className="kjr-lb-gap" role="presentation"><i />你的位置<i /></div>
                <Row item={me} period={period} mine pinned layout={layout} onOpen={openUserSpace} />
              </div>
            ) : null}
          </div>
        )}
      {me && !listed && pinnedSlot && items.length > 0 ? createPortal(
        <div className={`kjr-table klv-table klv-table--${layout} klv-pinned-foot`} role="rowgroup" aria-label="你的位置">
          <Row item={me} period={period} mine pinned layout={layout} onOpen={openUserSpace} />
        </div>,
        pinnedSlot
      ) : null}
      {first && !me && items.length > 0 ? <p className="klv-quiet klv-board-note" data-level-board="me-none"><Icon name="info" className="h-3.5 w-3.5" />{period === 'month' ? '你这个月还没有记入活跃天，所以不在月榜上。' : '你还没有上榜：拿到第一个活跃天之后就会出现（名次每分钟更新一次）。'}</p> : null}
      <p className="klv-quiet klv-board-note">
        {period === 'month' ? '月榜按北京时间的自然月算，只计每天结算记入的活跃天。' : '总榜按累计活跃天排。'}机器人和封禁中的账号不上榜。{generatedAt ? `榜单每分钟更新，上次更新 ${generatedAt.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}。` : ''}
      </p>
    </section>
  );
}
