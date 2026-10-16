import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { cx } from '@/components/chat/desktop/runtime';
import { formatCoins, formatShopTime } from '@/components/shop/labels';
import { getDisplayName } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { useKukeStore } from '@/store/kukeStore';
import type { Conversation } from '@/types/api';
import type { RedPacketDirection, RedPacketRecord, RedPacketStatus } from '@/types/redPacket';
import { useMyRedPackets } from './data';
import { OpenRedPacketDialog } from './OpenRedPacketDialog';
import { RedPacketLayer } from './RedPacketLayer';

const PAGE_SIZE = 20;

const TABS: Array<{ value: RedPacketDirection; label: string }> = [
  { value: 'received', label: '收到的' },
  { value: 'sent', label: '发出的' }
];

const STATUS_TEXT: Record<RedPacketStatus, string> = { active: '领取中', finished: '已领完', expired: '已过期', revoked: '已撤回' };

function recordNote(record: RedPacketRecord, direction: RedPacketDirection): string {
  const kind = record.kind === 'lucky' ? '拼手气' : '普通';
  if (direction === 'received') {
    return `${getDisplayName(record.sender, '有人')} 发的${kind}红包`;
  }
  return `${kind}红包 · 已领 ${Math.min(record.claimed_count, record.count)}/${record.count} 个`;
}

/** 红包记录（GET /red-packets/mine）：收到的、发出的各一个列表，顶上是这个方向的合计。点一行看那个红包的领取详情，关掉详情回到列表。 */
export function RedPacketRecords({ onClose }: { onClose: () => void }): JSX.Element {
  const [direction, setDirection] = useState<RedPacketDirection>('received');
  const [offset, setOffset] = useState(0);
  const query = useMyRedPackets(direction, PAGE_SIZE, offset);
  const page = query.data;
  // 切换方向、翻页的那一下手头还是上一份数据（placeholderData），等新的到了再显示
  const stale = query.isPlaceholderData;
  const total = page?.total ?? 0;
  const [opened, setOpened] = useState<RedPacketRecord | null>(null);
  const queryClient = useQueryClient();
  const currentUser = useKukeStore((state) => state.currentUser);

  if (opened && currentUser) {
    // 是不是群里的红包：会话在手头的列表里就看它的类型；不在（已经退群之类）就按群算 —— 只影响「私聊里自己发的不能领」这一条，领的时候服务端还会再判
    const conversation = queryClient.getQueryData<Conversation[]>(['conversations'])?.find((item) => item.id === opened.conversation_id);
    return (
      <OpenRedPacketDialog
        target={{ meta: { id: opened.id, kind: opened.kind, greeting: opened.greeting, count: opened.count }, conversationId: opened.conversation_id, sender: direction === 'sent' ? currentUser : opened.sender }}
        isGroup={conversation ? conversation.type === 'group' : true}
        currentUser={currentUser}
        initialDetail
        onClose={() => setOpened(null)}
      />
    );
  }

  return (
    <RedPacketLayer label="红包记录" onClose={onClose}>
      <section className="krp-panel krp-panel--tall" data-red-packet-view="records" data-direction={direction}>
        <header className="krp-panel-head">
          <span className="krp-panel-icon"><Icon name="redPacket" className="h-4 w-4" /></span>
          <h2>红包记录</h2>
          <button type="button" className="kui-icon-btn" aria-label="关闭" onClick={onClose}><Icon name="close" className="h-4 w-4" /></button>
        </header>
        <div className="krp-records-top">
          <div className="kui-segment krp-kinds" role="tablist" aria-label="红包记录">
            {TABS.map((tab) => (
              <button key={tab.value} type="button" role="tab" aria-selected={direction === tab.value} className={cx(direction === tab.value && 'is-active')} onClick={() => {
                setDirection(tab.value);
                setOffset(0);
              }}>{tab.label}</button>
            ))}
          </div>
          <div className="krp-total krp-total--records" data-red-packet="records-sum">
            <p className="krp-total-number"><b>{page && !stale ? formatCoins(page.sum) : '—'}</b><span>币</span></p>
            <p className="krp-total-note">{direction === 'received' ? '共收到' : '共发出'}{page && !stale ? ` ${total} 个红包` : ''}</p>
          </div>
        </div>
        <div className="krp-panel-body krp-panel-body--flush kui-scroll">
          {query.isLoading || stale ? <p className="krp-empty" role="status">加载中…</p>
            : query.error ? <p className="krp-empty" role="alert">红包记录没有加载出来：{query.error.message} <button type="button" className="krp-link" onClick={() => void query.refetch()}>重试</button></p>
            : !page || page.items.length === 0 ? <p className="krp-empty">{direction === 'received' ? '还没有收到过红包。' : '还没有发过红包。'}</p>
            : (
              <ul className="krp-records" data-red-packet="records">
                {page.items.map((record) => (
                  <li key={record.key}>
                    <button type="button" className="krp-record" data-record={record.id} title="查看领取详情" onClick={() => setOpened(record)}>
                      <span className="krp-record-main">
                        <span className="krp-record-greeting">{record.greeting}</span>
                        <span className="krp-record-note">{recordNote(record, direction)}{record.created_at ? ` · ${formatShopTime(record.created_at)}` : ''}</span>
                        {record.refunded_amount > 0 ? <span className="krp-record-refund" data-red-packet="refunded">没领完，退回 {formatCoins(record.refunded_amount)} 币</span> : null}
                      </span>
                      <span className="krp-record-side">
                        <span className="krp-record-amount">{direction === 'received' ? '+' : '−'}{formatCoins(record.amount)}</span>
                        {direction === 'sent' && record.status ? <span className={cx('kui-tag', record.status === 'active' && 'kui-tag--accent')}>{STATUS_TEXT[record.status]}</span> : null}
                      </span>
                      <Icon name="chevron" className="krp-record-go h-3.5 w-3.5" />
                    </button>
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
