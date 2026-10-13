import { useState } from 'react';
import { cx } from '@/components/chat/desktop/runtime';
import { Icon } from '@/components/ui/Icon';
import { Modal, ModalStatus } from '@/components/ui/desktop/Modal';
import type { ShopItem } from '@/types/shop';
import { BubbleStage, tryOnSamples } from '../BubbleSample';
import { useShopPurchases } from '../data';
import { ItemButton, ItemTags, PriceLine } from '../ItemParts';
import { DEFAULT_PREVIEW_TEXT, formatCoins, formatShopTime, sourceLabel } from '../labels';
import { usePurchaseFlow, type PurchaseView } from '../usePurchaseFlow';
import type { ShopController } from '../useShopController';

const PURCHASE_TITLE: Record<PurchaseView, string> = { confirm: '确认购买', short: '金币不够', unbound: '先绑定 CCW 账号', blocked: '现在拿不到', done: '已拥有' };

/**
 * 购买确认。同一个框按情况换画面（usePurchaseFlow 的 view）：
 * 确认 → 余额不够时直接变成「还差 N 个币 + 去投币 + 我投完了，刷新余额」→ 到手后可以一键装备。
 */
export function PurchaseDialog({ item, shop, openBinding }: { item: ShopItem; shop: ShopController; openBinding: () => void }): JSX.Element {
  const flow = usePurchaseFlow(item, shop);
  const close = shop.closePurchase;
  const equipping = shop.equipPending === item.sku;
  const title = flow.view === 'confirm' && flow.free ? '免费领取' : flow.view === 'done' && flow.justObtained ? '到手了' : PURCHASE_TITLE[flow.view];

  let footer: JSX.Element;
  if (flow.view === 'confirm') {
    footer = (
      <>
        <button type="button" className="kui-btn kui-btn--ghost" disabled={flow.pending} onClick={close}>取消</button>
        <button type="button" className="kui-btn kui-btn--primary" data-action="confirm-purchase" disabled={flow.pending} onClick={flow.confirm}>
          {flow.pending ? '处理中…' : flow.free ? '免费领取' : `确认购买（${formatCoins(item.price)} 币）`}
        </button>
      </>
    );
  } else if (flow.view === 'short') {
    footer = (
      <>
        <button type="button" className="kui-btn kui-btn--ghost" onClick={close}>取消</button>
        <button type="button" className="kui-btn" data-action="refresh-after-donate" disabled={shop.refreshing || shop.refreshWait > 0} onClick={shop.refresh}>
          <Icon name="refresh" className={cx('h-3.5 w-3.5', shop.refreshing && 'animate-spin')} />
          {shop.refreshing ? '核实中…' : shop.refreshWait > 0 ? `${shop.refreshWait} 秒后可刷新` : '我投完了，刷新余额'}
        </button>
        <button type="button" className="kui-btn kui-btn--primary" data-action="donate" disabled={!flow.canDonate} title={flow.canDonate ? undefined : '暂时不能充值'} onClick={flow.donate}><Icon name="external" className="h-3.5 w-3.5" />去投币</button>
      </>
    );
  } else if (flow.view === 'unbound') {
    footer = (
      <>
        <button type="button" className="kui-btn kui-btn--ghost" onClick={close}>取消</button>
        <button type="button" className="kui-btn kui-btn--primary" data-action="bind-ccw" onClick={() => {
          close();
          shop.closeTryOn();
          openBinding();
        }}>去绑定 CCW 账号</button>
      </>
    );
  } else if (flow.view === 'done' && flow.action === 'owned') {
    footer = (
      <>
        <button type="button" className="kui-btn kui-btn--ghost" disabled={equipping} onClick={close}>以后再说</button>
        <button type="button" className="kui-btn kui-btn--primary" data-action="equip-now" disabled={equipping} onClick={() => {
          shop.equip(item);
          close();
        }}>立即装备</button>
      </>
    );
  } else {
    footer = <button type="button" className="kui-btn kui-btn--primary" onClick={close}>{flow.view === 'done' ? '完成' : '知道了'}</button>;
  }

  return (
    <Modal title={title} subtitle={item.name} className="kmd-modal--sm" raised dismissOnBackdrop={!flow.pending} dismissOnEscape={!flow.pending} onClose={close} footer={footer}>
      <div className="ksp-buy" data-shop="purchase" data-view={flow.view}>
        <BubbleStage style={item.style} messages={[{ mine: true, text: item.preview_text.trim() || DEFAULT_PREVIEW_TEXT }]} layout="desktop" className="ksp-stage--boxed" />
        {flow.view === 'confirm' ? (
          flow.free ? <p className="ksp-buy-lead">{item.unlock_level !== null ? `你的账号等级已经达到 Lv.${item.unlock_level}，` : ''}这件可以免费领取，不扣金币。</p> : (
            <dl className="ksp-bill">
              <div><dt>价格</dt><dd><Icon name="coins" className="h-3.5 w-3.5" />{formatCoins(item.price)}</dd></div>
              <div><dt>现在的余额</dt><dd>{formatCoins(flow.balance)}</dd></div>
              <div className="is-total"><dt>买完之后</dt><dd>{formatCoins(flow.balanceAfter)}</dd></div>
            </dl>
          )
        ) : null}
        {flow.view === 'short' ? (
          <>
            <p className="ksp-buy-short">还差 <b>{formatCoins(flow.shortfall)}</b> 个币</p>
            <dl className="ksp-bill">
              <div><dt>价格</dt><dd><Icon name="coins" className="h-3.5 w-3.5" />{formatCoins(item.price)}</dd></div>
              <div><dt>现在的余额</dt><dd>{formatCoins(flow.balance)}</dd></div>
            </dl>
            <p className="kui-note">点「去投币」打开 KukeChat 官方作品页，给作品投币，回来点「我投完了，刷新余额」。币是投给 KukeChat 官方作品的。</p>
            {shop.balance?.stale ? <p className="kui-note kui-note--warn">上次向 CCW 核实没有成功，余额可能不是最新的，过一会儿再刷新。</p> : null}
            {shop.refreshError ? <p className="kui-note kui-note--danger" role="alert">{shop.refreshError}</p> : null}
          </>
        ) : null}
        {flow.view === 'unbound' ? <p className="ksp-buy-lead">金币是按你绑定的 CCW 账号核实的：你在 CCW 给 KukeChat 官方作品投过多少币，这里就有多少。绑定之后，以前投过的也算数。</p> : null}
        {flow.view === 'blocked' ? <p className="ksp-buy-lead">{flow.blockedText}</p> : null}
        {flow.view === 'done' ? (
          <p className="ksp-buy-lead">
            {flow.action === 'equipped' ? `「${item.name}」正在使用中，你发出的消息已经是这个气泡了。` : `「${item.name}」${flow.justObtained ? '已经是你的了' : '已经在你的装扮里'}。现在就换上？`}
          </p>
        ) : null}
        {flow.error ? <p className="kui-note kui-note--danger" role="alert" data-shop="purchase-error">{flow.error}</p> : null}
      </div>
    </Modal>
  );
}

/** 试穿：在大一点的预览里看这件皮肤在几种消息形态下的样子，不需要先买。 */
export function TryOnDialog({ item, shop }: { item: ShopItem; shop: ShopController }): JSX.Element {
  return (
    <Modal
      title="试穿"
      subtitle={item.name}
      className="kmd-modal--lg"
      onClose={shop.closeTryOn}
      footer={(
        <div className="ksp-tryon-foot">
          <PriceLine item={item} />
          <ItemButton item={item} shop={shop} className="kui-btn" primaryClassName="kui-btn--primary" />
        </div>
      )}
    >
      <div className="ksp-tryon" data-shop="tryon">
        <BubbleStage style={item.style} messages={tryOnSamples(item.preview_text)} layout="desktop" avatars className="ksp-stage--boxed ksp-stage--tall" />
        <div className="ksp-tryon-info">
          <div className="ksp-item-title"><h3>{item.name}</h3><ItemTags item={item} now={shop.now} /></div>
          {item.description ? <p className="ksp-item-desc">{item.description}</p> : null}
          <p className="ksp-tryon-note">左边是别人看到的你，右边是你自己看到的。只是预览，没有真的换上。</p>
        </div>
      </div>
    </Modal>
  );
}

const HISTORY_PAGE_SIZE = 20;

/** 购买记录（GET /shop/purchases）：买的、等级解锁的、被赠送的都在这里。 */
export function HistoryDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const [offset, setOffset] = useState(0);
  const query = useShopPurchases(HISTORY_PAGE_SIZE, offset, true);
  const page = query.data;
  const total = page?.total ?? 0;
  return (
    <Modal
      title="购买记录"
      subtitle={total > 0 ? `共 ${total} 条` : undefined}
      className="kmd-modal--md kmd-modal--tall"
      onClose={onClose}
      footer={total > HISTORY_PAGE_SIZE ? (
        <div className="ksp-pager">
          <span>第 {offset + 1}–{Math.min(total, offset + HISTORY_PAGE_SIZE)} 条</span>
          <button type="button" className="kui-btn kui-btn--sm" disabled={offset === 0 || query.isFetching} onClick={() => setOffset(Math.max(0, offset - HISTORY_PAGE_SIZE))}>上一页</button>
          <button type="button" className="kui-btn kui-btn--sm" disabled={offset + HISTORY_PAGE_SIZE >= total || query.isFetching} onClick={() => setOffset(offset + HISTORY_PAGE_SIZE)}>下一页</button>
        </div>
      ) : undefined}
    >
      <div data-shop="history">
        {query.isLoading ? <ModalStatus>加载中…</ModalStatus>
          : query.error ? <ModalStatus tone="error">购买记录没有加载出来：{query.error.message}</ModalStatus>
          : !page || page.items.length === 0 ? <ModalStatus>还没有记录。买到、等级解锁、被赠送的装扮都会记在这里。</ModalStatus>
          : (
            <ul className="ksp-history">
              {page.items.map((record) => (
                <li key={record.id} className={record.revoked_at ? 'is-revoked' : undefined} data-record={record.id}>
                  <span className="ksp-history-name">{record.item.name}</span>
                  <span className="ksp-history-tags">
                    <span className="kui-tag">{sourceLabel(record.source)}</span>
                    {record.revoked_at ? <span className="kui-tag kui-tag--danger" title={`${formatShopTime(record.revoked_at)} 被收回`}>已收回</span> : null}
                    {record.refunded ? <span className="kui-tag kui-tag--ok">已退币</span> : null}
                  </span>
                  <span className="ksp-history-price">{record.price > 0 ? <><Icon name="coins" className="h-3.5 w-3.5" />{formatCoins(record.price)}</> : '免费'}</span>
                  <time className="ksp-history-time">{formatShopTime(record.created_at)}</time>
                </li>
              ))}
            </ul>
          )}
      </div>
    </Modal>
  );
}
