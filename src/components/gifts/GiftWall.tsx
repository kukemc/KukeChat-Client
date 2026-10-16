import { useState } from 'react';
import { cx } from '@/components/chat/desktop/runtime';
import { formatCoins } from '@/components/shop/labels';
import { getDisplayName } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { useKukeStore } from '@/store/kukeStore';
import type { User } from '@/types/api';
import type { GiftWallEntry } from '@/types/gift';
import { charmOf, useCharmLabel, useGiftsEnabled, useGiftWall, useGiftWallRecords } from './data';
import { SendGiftButton } from './GiftEntry';
import { GiftRecordRow } from './GiftRecords';
import { GiftThing } from './GiftThing';

const RECORDS_PAGE = 8;

function entryKey(entry: GiftWallEntry): string {
  return entry.kind === 'item' ? `item:${entry.item?.sku ?? ''}` : `gift:${entry.gift?.key ?? ''}`;
}

/** 某一种礼物的送礼记录：谁送的、什么时候、是不是生日礼物。留言服务端只给本人和送的那个人，别人拿到的是 null，这里有就显示。 */
function WallRecords({ userId, entry, onOpenUser }: { userId: number; entry: GiftWallEntry; onOpenUser: (userId: number) => void }): JSX.Element {
  const [limit, setLimit] = useState(RECORDS_PAGE);
  const query = useGiftWallRecords(userId, entry.kind === 'item' ? { itemSku: entry.item?.sku } : { giftKey: entry.gift?.key }, limit, 0, true);
  const page = query.data;
  const name = entry.item?.name ?? entry.gift?.name ?? '礼物';
  return (
    <div className="kgf-wall-records" data-gift="wall-records" data-entry={entryKey(entry)}>
      <p className="kgf-wall-records-title">「{name}」的送礼记录{page ? <span>共 {page.total} 次</span> : null}</p>
      {query.isLoading ? <p className="kgf-wall-quiet" role="status">加载中…</p>
        : query.error ? <p className="kgf-wall-quiet" role="alert">记录没有加载出来：{query.error.message} <button type="button" className="kui-link" onClick={() => void query.refetch()}>重试</button></p>
        : !page || page.items.length === 0 ? <p className="kgf-wall-quiet">还没有记录。</p>
        : (
          <ul className="krp-records kgf-wall-list">
            {page.items.map((record) => <li key={record.id}><GiftRecordRow record={record} who="from" onOpenUser={onOpenUser} side={null} /></li>)}
          </ul>
        )}
      {page && page.total > page.items.length ? <button type="button" className="kui-btn kui-btn--sm kgf-wall-more" disabled={query.isFetching} onClick={() => setLimit(limit + RECORDS_PAGE * 2)}>{query.isFetching ? '加载中…' : `再看一些（${page.items.length} / ${page.total}）`}</button> : null}
    </div>
  );
}

/**
 * 礼物墙：个人空间里的一块，展示这个人收到过的所有礼物（GET /users/{id}/gifts，公开）。
 * 写法跟同一页上的「账号等级」一样：一个数字（收到几件）+ 一行次要信息（几种），下面是固定列数的格子（图形一样大，名字在上、数量在下）。
 * 心意值不单独占地方，交给外面那层壳放在小标题旁边（frame 的第二个参数）。点某一种，格子下面展开它的送礼记录。
 * 看别人的墙时右上角有「送礼物」（界面里通用的次要按钮）。
 *
 * 礼物功能关着（或者服务端没有）、对方是机器人、接口出错时整块不出现 —— 外面要套的那层带标题的壳通过 frame 给，这样连壳一起不出现。
 */
export function GiftWall({ user, isSelf, frame }: { user: User | null | undefined; isSelf: boolean; frame?: (wall: JSX.Element, charm: JSX.Element | null) => JSX.Element }): JSX.Element | null {
  const enabled = useGiftsEnabled();
  const charmLabel = useCharmLabel();
  const openUserSpace = useKukeStore((state) => state.openUserSpace);
  const active = enabled && Boolean(user) && !user?.is_bot;
  const query = useGiftWall(user?.id, active);
  const [opened, setOpened] = useState<string | null>(null);
  if (!active || !user || query.error) {
    return null;
  }
  const wall = query.data;
  const name = getDisplayName(user, 'Ta');
  // 心意值以用户对象上的为准（送礼成功、gift.received 时它是第一个变的），墙的数据晚一步重拉
  const charmValue = Math.max(charmOf(user) ?? 0, wall?.charm ?? 0);
  const openedEntry = wall?.summary.find((entry) => entryKey(entry) === opened) ?? null;
  const send = isSelf ? null : <SendGiftButton user={user} className="kui-btn kui-btn--sm kgf-wall-send"><Icon name="gift" className="h-3.5 w-3.5" />送礼物</SendGiftButton>;
  const charm = <span className="kgf-wall-charm" data-gift="wall-charm" title={`${charmLabel}：收到的礼物花了送礼人多少金币，就涨多少`}>{charmLabel}<b>{formatCoins(charmValue)}</b></span>;

  const element = (
    <div className="kgf-wall" data-gift-wall={user.id} data-state={!wall ? 'loading' : wall.summary.length === 0 ? 'empty' : 'ready'}>
      {!wall ? (
        <div className="kgf-wall-grid" role="status" aria-label="正在加载礼物墙">{[0, 1, 2].map((index) => <span key={index} className="kcr-bone kgf-wall-bone" />)}</div>
      ) : wall.summary.length === 0 ? (
        <div className="kgf-wall-empty" data-gift="wall-empty">
          <span className="kgf-wall-empty-icon" aria-hidden="true"><Icon name="gift" className="h-5 w-5" /></span>
          <p className="kgf-wall-empty-title">{isSelf ? '还没有收到礼物' : `${name} 还没有收到礼物`}</p>
          <p className="kgf-wall-empty-text">{isSelf ? '朋友送你的礼物会摆在这里。' : '送出第一份礼物，它会一直摆在这里。'}</p>
          {send}
        </div>
      ) : (
        <>
          <div className="kgf-wall-bar">
            <span className="kgf-wall-sum" data-gift="wall-total"><b>{formatCoins(wall.total_count)}</b>件礼物<i>·</i>{wall.summary.length} 种</span>
            {send}
          </div>
          <ul className="kgf-wall-grid" data-gift="wall-grid">
            {wall.summary.map((entry) => {
              const key = entryKey(entry);
              const label = entry.item?.name ?? entry.gift?.name ?? '礼物';
              return (
                <li key={key}>
                  <button type="button" className={cx('kgf-wall-tile', opened === key && 'is-active')} data-entry={key} aria-expanded={opened === key} title={`${label} ×${entry.count}：看看是谁送的`} onClick={() => setOpened(opened === key ? null : key)}>
                    <span className="kgf-wall-tile-thing"><GiftThing gift={entry.gift} item={entry.item} wearer={user} size={36} avatarSize="sm" /></span>
                    <span className="kgf-wall-tile-name">{label}</span>
                    <span className="kgf-wall-tile-count">×{formatCoins(entry.count)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {openedEntry ? <WallRecords key={entryKey(openedEntry)} userId={user.id} entry={openedEntry} onOpenUser={openUserSpace} /> : null}
        </>
      )}
    </div>
  );
  return frame ? frame(element, charm) : element;
}
