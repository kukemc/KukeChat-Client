import { cx } from '@/components/chat/desktop/runtime';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import type { FriendIntimacy } from '@/types/intimacy';
import { BadgeGlyph } from './BadgeGlyph';
import { badgeTitle } from './FriendBadgeMark';
import { openIntimacy, useIntimacyFriends } from './data';

function Row({ item, layout }: { item: FriendIntimacy; layout: 'desktop' | 'mobile' }): JSX.Element {
  const name = getDisplayName(item.friend, `用户 ${item.friend.id}`);
  return (
    <button type="button" className="kjr-tr kit-tr" role="row" data-rank={item.rank} onClick={() => openIntimacy(item.friend.id)}>
      <span role="cell" className={cx('kjr-rank', item.rank <= 3 && `is-top is-top${item.rank}`)}>{item.rank}</span>
      <span role="cell" className="kjr-lb-who">
        <Avatar user={item.friend} label={name} size="sm" />
        <span className="klv-lb-id">
          <span className="kjr-lb-name">{name}</span>
          {item.badge ? <span className="kit-mark" title={badgeTitle(item.badge)}><BadgeGlyph icon={item.badge.icon} tier={item.badge.tier} size={16} /></span> : null}
          {item.new_badges > 0 ? <span className="kit-new" title={`${item.new_badges} 枚新徽章`}>新</span> : null}
        </span>
      </span>
      {layout === 'desktop' ? <span role="cell" className="kit-lb-level">{item.level_name}<small>Lv.{item.level}</small></span> : null}
      <span role="cell" className="klv-lb-num is-key">
        {item.intimacy.toLocaleString('zh-CN')}
        {item.today_gained > 0 ? <small className="kit-lb-today">今天 +{item.today_gained}</small> : layout === 'mobile' ? <small className="kit-lb-today is-quiet">{item.level_name}</small> : null}
      </span>
    </button>
  );
}

/**
 * 好友亲密榜：我自己的好友按和我的亲密度排（GET /intimacy/friends）。放在排行榜页的「亲密榜」页签里。
 * 行的样子沿用活跃榜那一套（kjr-table / kjr-rank），点一行打开「我们的友谊」。这个榜只有我自己看得到，没有「我的位置」那一行。
 */
export function IntimacyLeaderboard({ layout }: { layout: 'desktop' | 'mobile' }): JSX.Element {
  const query = useIntimacyFriends();
  const board = query.data;
  const items = board?.items ?? [];
  const active = items.filter((item) => item.intimacy > 0);
  const quiet = items.length - active.length;

  return (
    <section className="klv-card klv-board kit-board" data-intimacy="board">
      <header className="klv-card-head">
        <h2 className="kit-board-title"><Icon name="heart" className="h-4 w-4" />好友亲密榜</h2>
        <div className="klv-card-aside"><span className="klv-meta">只有你自己看得到</span></div>
      </header>
      {query.isLoading ? <p className="klv-quiet klv-board-state" role="status">加载中…</p>
        : query.error && !board ? (
          <div className="klv-board-state" role="alert">
            <p className="kui-note kui-note--danger">亲密榜没有加载出来：{query.error.message}</p>
            <button type="button" className="kui-btn kui-btn--sm" onClick={() => void query.refetch()}>重试</button>
          </div>
        )
        : items.length === 0 ? <p className="klv-quiet klv-board-state">还没有好友。加了好友、互相聊聊天，亲密度就会出现在这里。</p>
        : (
          <div className={cx('kjr-table klv-table kit-table', `klv-table--${layout}`)} role="table" aria-label="好友亲密榜" data-rows={active.length}>
            {layout === 'desktop' ? <div className="kjr-tr kjr-th kit-tr" role="row"><span role="columnheader">名次</span><span role="columnheader">好友</span><span role="columnheader">友谊等级</span><span role="columnheader" className="klv-lb-num">亲密度</span></div> : null}
            {active.map((item) => <Row key={item.friend.id} item={item} layout={layout} />)}
            {active.length === 0 ? <p className="klv-quiet klv-board-state">和好友互相聊几句，亲密度就会涨起来。</p> : null}
          </div>
        )}
      {quiet > 0 && active.length > 0 ? <p className="klv-quiet klv-board-note"><Icon name="info" className="h-3.5 w-3.5" />还有 {quiet} 个好友和你的亲密度是 0，没有列出来。</p> : null}
      <p className="klv-quiet klv-board-note">亲密度靠互相聊天、送礼物、连续互动和生日礼物涨，每天有上限（北京时间零点重新计）。点一行看你们的好友成就。</p>
    </section>
  );
}
