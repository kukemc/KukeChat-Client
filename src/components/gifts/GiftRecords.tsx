import { useState } from 'react';
import { CakeMark } from '@/components/birthday/BirthdayScene';
import { cx } from '@/components/chat/desktop/runtime';
import { RedPacketLayer } from '@/components/redpacket/RedPacketLayer';
import { formatCoins, formatShopTime } from '@/components/shop/labels';
import { getDisplayName } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { useKukeStore } from '@/store/kukeStore';
import type { GiftDirection, GiftRecord } from '@/types/gift';
import { giftThingLabel } from '@/utils/gift';
import { useCharmLabel, useMyGifts } from './data';
import { GiftThing } from './GiftThing';

const PAGE_SIZE = 20;

const TABS: Array<{ value: GiftDirection; label: string }> = [
  { value: 'received', label: '收到的' },
  { value: 'sent', label: '送出的' }
];

/** 记录里的一行（礼物记录和礼物墙展开的那一段共用）：送的东西、谁、什么时候、生日标记、留言。 */
export function GiftRecordRow({ record, who, side, onOpenUser }: { record: GiftRecord; /** 这一行要写的那个人（收到的记录写送的人，送出的写收的人） */ who: 'from' | 'to'; side: JSX.Element | null; onOpenUser?: (userId: number) => void }): JSX.Element {
  const user = who === 'from' ? record.from_user : record.to_user;
  const name = getDisplayName(user, '有人');
  const body = (
    <>
      <span className="kgf-record-thing"><GiftThing gift={record.gift} item={record.item} wearer={record.to_user} size={34} avatarSize="sm" /></span>
      <span className="krp-record-main">
        <span className="krp-record-greeting">{who === 'from' ? `${name} 送的` : `送给 ${name}`} {giftThingLabel(record)}{record.on_birthday ? <span className="kgf-record-birthday" title="生日当天送的"><CakeMark size={13} />生日礼物</span> : null}</span>
        <span className="krp-record-note">{record.created_at ? formatShopTime(record.created_at) : ''}{record.conversation_id === null ? ' · 从个人主页送的' : ''}</span>
        {record.message ? <span className="kgf-record-message">「{record.message}」</span> : null}
      </span>
      {side}
    </>
  );
  return user && onOpenUser
    ? <button type="button" className="krp-record kgf-record" data-record={record.id} title={`看看 ${name} 的主页`} onClick={() => onOpenUser(user.id)}>{body}</button>
    : <div className="krp-record kgf-record" data-record={record.id}>{body}</div>;
}

/** 礼物记录（GET /gifts/mine）：收到的、送出的各一个列表，顶上是这个方向的合计。点一行去那个人的主页。 */
export function GiftRecords({ onClose }: { onClose: () => void }): JSX.Element {
  const [direction, setDirection] = useState<GiftDirection>('received');
  const [offset, setOffset] = useState(0);
  const query = useMyGifts(direction, PAGE_SIZE, offset);
  const charmLabel = useCharmLabel();
  const openUserSpace = useKukeStore((state) => state.openUserSpace);
  const page = query.data;
  // 切换方向、翻页的那一下手头还是上一份数据（placeholderData），等新的到了再显示
  const stale = query.isPlaceholderData;
  const total = page?.total ?? 0;

  return (
    <RedPacketLayer label="礼物记录" onClose={onClose} className="kgf-layer">
      <section className="krp-panel krp-panel--tall kgf-panel" data-gift-view="records" data-direction={direction}>
        <header className="krp-panel-head">
          <span className="krp-panel-icon kgf-panel-icon"><Icon name="gift" className="h-4 w-4" /></span>
          <h2>礼物记录</h2>
          <button type="button" className="kui-icon-btn" aria-label="关闭" onClick={onClose}><Icon name="close" className="h-4 w-4" /></button>
        </header>
        <div className="krp-records-top">
          <div className="kui-segment krp-kinds" role="tablist" aria-label="礼物记录">
            {TABS.map((tab) => (
              <button key={tab.value} type="button" role="tab" aria-selected={direction === tab.value} className={cx(direction === tab.value && 'is-active')} onClick={() => {
                setDirection(tab.value);
                setOffset(0);
              }}>{tab.label}</button>
            ))}
          </div>
          <div className="krp-total krp-total--records kgf-total" data-gift="records-sum">
            <p className="krp-total-number"><b>{page && !stale ? formatCoins(page.sum) : '—'}</b><span>{direction === 'received' ? charmLabel : '币'}</span></p>
            <p className="krp-total-note">{direction === 'received' ? '共收到' : '共送出'}{page && !stale ? ` ${total} 次礼物` : ''}</p>
          </div>
        </div>
        <div className="krp-panel-body krp-panel-body--flush kui-scroll">
          {query.isLoading || stale ? <p className="krp-empty" role="status">加载中…</p>
            : query.error ? <p className="krp-empty" role="alert">礼物记录没有加载出来：{query.error.message} <button type="button" className="krp-link kgf-link" onClick={() => void query.refetch()}>重试</button></p>
            : !page || page.items.length === 0 ? <p className="krp-empty">{direction === 'received' ? '还没有收到过礼物。' : '还没有送过礼物。在聊天的工具栏、对方的资料卡上都可以送。'}</p>
            : (
              <ul className="krp-records" data-gift="records">
                {page.items.map((record) => (
                  <li key={record.id}>
                    <GiftRecordRow
                      record={record}
                      who={direction === 'received' ? 'from' : 'to'}
                      onOpenUser={(userId) => {
                        onClose();
                        openUserSpace(userId);
                      }}
                      side={<span className="krp-record-side"><span className={cx('krp-record-amount', direction === 'received' && 'kgf-amount--in')}>{direction === 'received' ? '+' : '−'}{formatCoins(record.amount)}</span></span>}
                    />
                  </li>
                ))}
              </ul>
            )}
        </div>
        {total > PAGE_SIZE ? (
          <footer className="krp-panel-foot krp-panel-foot--pager">
            <span>第 {offset + 1}–{Math.min(total, offset + PAGE_SIZE)} 条，共 {total} 条</span>
            <button type="button" className="kui-btn kui-btn--sm" disabled={offset === 0 || query.isFetching} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>上一页</button>
            <button type="button" className="kui-btn kui-btn--sm" disabled={offset + PAGE_SIZE >= total || query.isFetching} onClick={() => setOffset(offset + PAGE_SIZE)}>下一页</button>
          </footer>
        ) : null}
      </section>
    </RedPacketLayer>
  );
}
