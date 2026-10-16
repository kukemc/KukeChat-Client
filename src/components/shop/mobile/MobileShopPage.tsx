import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { cx } from '@/components/chat/desktop/runtime';
import { Icon } from '@/components/ui/Icon';
import { CoinIcon } from '@/components/ui/CoinIcon';
import { registerNativeBackHandler } from '@/native/back';
import { GiftRecordsButton } from '@/components/gifts/GiftEntry';
import { RedPacketRecordsButton } from '@/components/redpacket/RedPacketEntry';
import type { ShopItem } from '@/types/shop';
import { useShopPurchases } from '../data';
import { doneText, ItemButton, ItemTags, PriceLine, TermRows } from '../ItemParts';
import { ItemPreview } from '../ItemPreview';
import { balanceExtras, canRenew, categoryText, expiryDateLabel, formatCoins, formatShopTime, formatVerifiedAt, itemAction, ownedExpiry, purchaseSourceLabel } from '../labels';
import { durationLabel } from '@/utils/shopExpiry';
import { usePurchaseFlow, type PurchaseView } from '../usePurchaseFlow';
import { useShopController, type ShopController } from '../useShopController';

const BUTTON = 'ksp-m-btn';
const BUTTON_PRIMARY = 'ksp-m-btn--primary';

/**
 * 商店的移动端界面：从「空间」页的功能入口进来的二级页面。内容和桌面端一样（余额、我的装扮、商品、试穿、购买、购买记录），
 * 状态和动作同样来自 useShopController；弹出的东西都是页面里自己的底部面板，不用 portal。
 * 外框沿用移动端页面的那一套（kc-qq-page / kc-qq-card），自己的样式在 shop.css（前缀 ksp-m-），颜色取移动端的令牌，深色下跟着变。
 */
export function MobileShopPage({ onMobileBack, onOpenCcwBinding, transitionStyle }: { onMobileBack?: () => void; onOpenCcwBinding?: () => void; transitionStyle?: CSSProperties }): JSX.Element {
  const shop = useShopController();
  const data = shop.shop;
  const topOverlay = shop.purchaseTarget ? 'purchase' : shop.tryOnTarget ? 'tryon' : shop.historyOpen ? 'history' : null;
  const { closePurchase, closeTryOn, setHistoryOpen } = shop;

  // 系统返回键：先关最上面的面板，都关了才轮到页面自己返回
  useEffect(() => {
    if (!topOverlay) {
      return undefined;
    }
    return registerNativeBackHandler(() => {
      if (topOverlay === 'purchase') {
        closePurchase();
      } else if (topOverlay === 'tryon') {
        closeTryOn();
      } else {
        setHistoryOpen(false);
      }
      return true;
    }, 100);
  }, [closePurchase, closeTryOn, setHistoryOpen, topOverlay]);

  return (
    <section className="kc-qq-page kui ksp-m flex h-full min-h-0 flex-col overflow-hidden" style={transitionStyle} aria-label="商店">
      <header className="kc-qq-home-header kc-qq-sticky-home-header mx-4 shrink-0">
        {onMobileBack ? <button type="button" onClick={onMobileBack} className="ksp-m-round" aria-label="返回"><Icon name="chevronLeft" className="h-5 w-5" /></button> : <span className="h-9 w-9" />}
        <div className="min-w-0 text-center"><h1 className="ksp-m-title">商店</h1><p className="ksp-m-subtitle">用 CCW 金币换聊天里的装扮</p></div>
        {data ? <button type="button" onClick={() => shop.setHistoryOpen(true)} className="ksp-m-round" aria-label="购买记录" title="购买记录" data-action="history"><Icon name="clock" className="h-5 w-5" /></button> : <span className="h-9 w-9" />}
      </header>
      <div className="kc-qq-scroll kc-mobile-page-transition scroll-soft min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(var(--kc-native-safe-bottom,env(safe-area-inset-bottom))+24px)]">
        {data ? <MobileContent shop={shop} onOpenCcwBinding={onOpenCcwBinding} />
          : data === null ? <MobileState icon="store" title="商店即将开放">当前连接的服务端还没有开放商店，开放后这里会自动出现。</MobileState>
          : shop.query.error ? <MobileState icon="alert" title="商店没有加载出来" action={<button type="button" className={BUTTON} onClick={() => void shop.query.refetch()}>重试</button>}>{shop.query.error.message}</MobileState>
          : <div className="ksp-m-loading" role="status" aria-label="正在加载商店"><span className="kcr-bone ksp-m-bone--hero" /><span className="kcr-bone ksp-m-bone--row" /><div className="ksp-m-grid"><span className="kcr-bone ksp-m-bone--item" /><span className="kcr-bone ksp-m-bone--item" /></div></div>}
      </div>

      {shop.historyOpen ? <HistorySheet onClose={() => shop.setHistoryOpen(false)} /> : null}
      {shop.tryOnTarget ? <TryOnSheet item={shop.tryOnTarget} shop={shop} /> : null}
      {shop.purchaseTarget ? <PurchaseSheet key={shop.purchaseTarget.id} item={shop.purchaseTarget} shop={shop} onOpenCcwBinding={onOpenCcwBinding} /> : null}
    </section>
  );
}

function MobileContent({ shop, onOpenCcwBinding }: { shop: ShopController; onOpenCcwBinding?: () => void }): JSX.Element {
  const balance = shop.balance;
  return (
    <>
      {balance && !balance.bound ? (
        <section className="ksp-m-hero ksp-m-hero--bind" data-shop="unbound">
          <span className="ksp-m-hero-icon"><Icon name="ccw" className="h-6 w-6" /></span>
          <h2>绑定 CCW 账号后才能购买</h2>
          <p>金币是你在 CCW 给 KukeChat 官方作品投出的币，按绑定的 CCW 账号核实；以前投过的也算数。没绑定也可以先逛逛、试穿。</p>
          <button type="button" className="ksp-m-hero-btn is-primary" data-action="bind-ccw" onClick={onOpenCcwBinding}>去绑定 CCW 账号</button>
        </section>
      ) : balance ? (
        <section className="ksp-m-hero" data-shop="balance">
          <div className="ksp-m-hero-top">
            <div>
              <p className="ksp-m-hero-label">金币余额</p>
              <p className="ksp-m-hero-number" data-shop="balance-number">{formatCoins(balance.balance)}</p>
            </div>
            <span className="ksp-m-hero-icon"><CoinIcon size={30} /></span>
          </div>
          <p className="ksp-m-hero-stats">累计投币 {formatCoins(balance.donated)} · 已花 {formatCoins(balance.spent)}{balanceExtras(balance).map((row) => ` · ${row.label} ${row.text}`).join('')} · {formatVerifiedAt(balance.verified_at, shop.now)}</p>
          <div className="ksp-m-hero-actions">
            <button type="button" className="ksp-m-hero-btn" data-action="refresh" disabled={shop.refreshing || shop.refreshWait > 0} onClick={shop.refresh}>
              <Icon name="refresh" className={cx('h-4 w-4', shop.refreshing && 'animate-spin')} />
              {shop.refreshing ? '核实中…' : shop.refreshWait > 0 ? `${shop.refreshWait} 秒后可刷新` : '刷新余额'}
            </button>
            <button type="button" className="ksp-m-hero-btn is-primary" data-action="donate" disabled={!shop.canDonate} title={shop.canDonate ? undefined : '暂时不能充值'} onClick={() => shop.donate()}><Icon name="external" className="h-4 w-4" />去投币</button>
          </div>
        </section>
      ) : null}

      {/* 余额除了买装扮，还会因为发红包、抢红包变：记录的入口放在余额下面 */}
      <RedPacketRecordsButton className="ksp-m-link-row"><Icon name="redPacket" className="h-4 w-4" /><span>红包记录</span><Icon name="chevron" className="h-4 w-4" /></RedPacketRecordsButton>
      <GiftRecordsButton className="ksp-m-link-row"><Icon name="gift" className="h-4 w-4" /><span>礼物记录</span><Icon name="chevron" className="h-4 w-4" /></GiftRecordsButton>

      {balance?.bound ? (
        <div className="ksp-m-notes">
          {balance.stale ? <p className="ksp-m-note is-warn" data-shop="stale">上次向 CCW 核实没有成功，这里显示的是之前的余额，可能不是最新的。过一会儿再刷新。</p> : null}
          {shop.refreshError ? <p className="ksp-m-note is-danger" role="alert">{shop.refreshError}</p> : null}
          {shop.canDonate ? null : <p className="ksp-m-note is-warn" data-shop="no-donate">暂时不能充值：服务端还没有配置投币的官方作品。</p>}
          <p className={cx('ksp-m-note', shop.donated && 'is-live')} data-shop="donate-hint">
            {shop.donated ? '投完了吗？回到这里点「刷新余额」，新投的币就会算进来。' : '金币怎么来：点「去投币」打开 KukeChat 官方作品页，给作品投币，回来点「刷新余额」。'}
            币是投给 KukeChat 官方作品的，只用来换这里的装扮，没有现金价值。
          </p>
        </div>
      ) : null}

      {shop.wardrobe.length > 0 ? (
        <section className="kc-qq-card ksp-m-card mt-3" data-shop="wardrobe">
          <p className="kc-qq-section-title">我的装扮</p>
          {shop.wardrobe.map(({ category, sku, item }) => {
            const expiry = item ? ownedExpiry(item, shop.now) : null;
            return (
              <div key={category.key} className="ksp-m-slot" data-slot={category.slot}>
                <div className="min-w-0 flex-1">
                  <p className="ksp-m-slot-name"><span>{category.label}</span>{item ? item.name : sku ? '已装备一件装扮' : '没有装备'}{expiry ? <span className={cx('ksp-expiry', expiry.soon && 'is-soon')} data-shop="slot-expiry" data-soon={expiry.soon || undefined}><Icon name="clock" className="h-3 w-3" />{expiry.text}</span> : null}</p>
                  <ItemPreview category={category.key} style={item?.style} previewText={item?.preview_text} variant="slot" layout="mobile" />
                </div>
                <div className="ksp-m-slot-actions">
                  {item && canRenew(item) ? <button type="button" className={cx(BUTTON, expiry?.soon && BUTTON_PRIMARY)} data-action="renew-slot" onClick={() => shop.openPurchase(item)}>续期</button> : null}
                  {sku ? <button type="button" className={BUTTON} data-action="unequip-slot" disabled={shop.equipPending !== null} onClick={() => shop.unequip(category.slot)}>{shop.equipPending === category.slot ? '卸下中…' : '卸下'}</button> : null}
                </div>
              </div>
            );
          })}
        </section>
      ) : null}

      {shop.categories.length > 1 ? (
        <div className="ksp-m-tabs" role="tablist" aria-label="商品类别">
          {shop.categories.map((category) => (
            <button key={category.key} type="button" role="tab" aria-selected={shop.activeCategory === category.key} className={cx('ksp-m-tab', shop.activeCategory === category.key && 'is-active')} onClick={() => shop.setActiveCategory(category.key)}>{category.label}</button>
          ))}
        </div>
      ) : shop.categories.length === 1 ? <p className="kc-qq-section-title mt-4">{shop.categories[0].label} · {shop.items.length} 件，点预览可以试穿</p> : null}

      {shop.categories.length === 0 ? <MobileState icon="store" title="还没有上架商品">商品上架后会出现在这里。</MobileState>
        : shop.items.length === 0 ? <p className="ksp-m-empty">这个类别还没有商品。</p>
        : (
          <div className="ksp-m-grid">
            {shop.items.map((item) => <MobileItemCard key={item.id} item={item} shop={shop} />)}
          </div>
        )}
    </>
  );
}

function MobileItemCard({ item, shop }: { item: ShopItem; shop: ShopController }): JSX.Element {
  const action = itemAction(item);
  return (
    <article className={cx('kc-qq-card ksp-m-item', action === 'equipped' && 'is-equipped')} data-sku={item.sku} data-state={action}>
      <div className="ksp-m-item-preview" role="button" tabIndex={0} aria-label={`试穿 ${item.name}`} onClick={() => shop.openTryOn(item)}>
        <ItemPreview category={item.category} style={item.style} previewText={item.preview_text} variant="card" layout="mobile" />
      </div>
      <div className="ksp-m-item-body">
        <h3>{item.name}</h3>
        <ItemTags item={item} now={shop.now} />
        {item.description ? <p className="ksp-m-item-desc">{item.description}</p> : null}
        <div className="ksp-m-item-foot">
          <PriceLine item={item} />
          <ItemButton item={item} shop={shop} className={BUTTON} primaryClassName={BUTTON_PRIMARY} />
        </div>
      </div>
    </article>
  );
}

function MobileState({ icon, title, action, children }: { icon: 'store' | 'alert'; title: string; action?: ReactNode; children: ReactNode }): JSX.Element {
  return (
    <div className="ksp-m-state">
      <span className="ksp-m-state-icon"><Icon name={icon} className="h-6 w-6" /></span>
      <p className="ksp-m-state-title">{title}</p>
      <p className="ksp-m-state-text">{children}</p>
      {action}
    </div>
  );
}

/** 底部面板的外壳：遮罩 + 从下面升起来的一块。tall 是占大半屏的那种（试穿、购买记录）。 */
function Sheet({ title, subtitle, tall, onClose, footer, children, dataShop }: { title: string; subtitle?: string; tall?: boolean; onClose: () => void; footer?: ReactNode; children: ReactNode; dataShop: string }): JSX.Element {
  return (
    <div className="ksp-m-backdrop" onClick={onClose}>
      <section className={cx('ksp-m-sheet', tall && 'is-tall')} role="dialog" aria-modal="true" aria-label={title} data-shop={dataShop} onClick={(event) => event.stopPropagation()}>
        <header className="ksp-m-sheet-head">
          <div className="min-w-0"><h2>{title}</h2>{subtitle ? <p>{subtitle}</p> : null}</div>
          <button type="button" className="ksp-m-round" aria-label="关闭" onClick={onClose}><Icon name="close" className="h-4 w-4" /></button>
        </header>
        <div className="ksp-m-sheet-body kc-qq-scroll">{children}</div>
        {footer ? <footer className="ksp-m-sheet-foot">{footer}</footer> : null}
      </section>
    </div>
  );
}

function TryOnSheet({ item, shop }: { item: ShopItem; shop: ShopController }): JSX.Element {
  return (
    <Sheet title="试穿" subtitle={item.name} tall onClose={shop.closeTryOn} dataShop="tryon" footer={<><PriceLine item={item} /><ItemButton item={item} shop={shop} className={`${BUTTON} is-large`} primaryClassName={BUTTON_PRIMARY} /></>}>
      <ItemPreview category={item.category} style={item.style} previewText={item.preview_text} variant="tryon" layout="mobile" />
      <div className="ksp-m-tryon-info">
        <ItemTags item={item} now={shop.now} />
        {item.description ? <p>{item.description}</p> : null}
        <p className="ksp-m-quiet">{categoryText(item.category).tryOnNote}</p>
      </div>
    </Sheet>
  );
}

const PURCHASE_TITLE: Record<PurchaseView, string> = { confirm: '确认购买', short: '金币不够', unbound: '先绑定 CCW 账号', blocked: '现在拿不到', done: '已拥有' };

function PurchaseSheet({ item, shop, onOpenCcwBinding }: { item: ShopItem; shop: ShopController; onOpenCcwBinding?: () => void }): JSX.Element {
  const flow = usePurchaseFlow(item, shop);
  const close = shop.closePurchase;
  const title = flow.view === 'confirm' && flow.free ? '免费领取' : flow.view === 'confirm' && flow.renewing ? '续期' : flow.view === 'done' && flow.justObtained ? (flow.renewed ? '已续期' : '到手了') : PURCHASE_TITLE[flow.view];

  let footer: JSX.Element;
  if (flow.view === 'confirm') {
    footer = <button type="button" className={`${BUTTON} ${BUTTON_PRIMARY} is-large is-block`} data-action="confirm-purchase" disabled={flow.pending} onClick={flow.confirm}>{flow.pending ? '处理中…' : flow.free ? '免费领取' : `${flow.renewing ? '确认续期' : '确认购买'}（${formatCoins(item.price)} 币）`}</button>;
  } else if (flow.view === 'short') {
    footer = (
      <>
        <button type="button" className={`${BUTTON} is-large is-block`} data-action="refresh-after-donate" disabled={shop.refreshing || shop.refreshWait > 0} onClick={shop.refresh}>{shop.refreshing ? '核实中…' : shop.refreshWait > 0 ? `${shop.refreshWait} 秒后可刷新` : '我投完了，刷新余额'}</button>
        <button type="button" className={`${BUTTON} ${BUTTON_PRIMARY} is-large is-block`} data-action="donate" disabled={!flow.canDonate} onClick={flow.donate}>{flow.canDonate ? '去投币' : '暂时不能充值'}</button>
      </>
    );
  } else if (flow.view === 'unbound') {
    footer = <button type="button" className={`${BUTTON} ${BUTTON_PRIMARY} is-large is-block`} data-action="bind-ccw" onClick={onOpenCcwBinding}>去绑定 CCW 账号</button>;
  } else if (flow.view === 'done' && flow.action === 'owned') {
    footer = (
      <>
        <button type="button" className={`${BUTTON} is-large is-block`} onClick={close}>以后再说</button>
        <button type="button" className={`${BUTTON} ${BUTTON_PRIMARY} is-large is-block`} data-action="equip-now" onClick={() => {
          shop.equip(item);
          close();
        }}>立即装备</button>
      </>
    );
  } else {
    footer = <button type="button" className={`${BUTTON} ${BUTTON_PRIMARY} is-large is-block`} onClick={close}>{flow.view === 'done' ? '完成' : '知道了'}</button>;
  }

  return (
    <Sheet title={title} subtitle={item.name} onClose={flow.pending ? () => undefined : close} dataShop="purchase" footer={footer}>
      <div data-view={flow.view}>
        <ItemPreview category={item.category} style={item.style} previewText={item.preview_text} variant="buy" layout="mobile" />
        {flow.view === 'confirm' ? (
          flow.free ? <p className="ksp-m-lead">{item.unlock_level !== null ? `你的账号等级已经达到 Lv.${item.unlock_level}，` : ''}这件可以免费领取，不扣金币。</p> : (
            <dl className="ksp-bill">
              <div><dt>价格</dt><dd><CoinIcon size={14} className="h-3.5 w-3.5" />{formatCoins(item.price)}</dd></div>
              <div><dt>现在的余额</dt><dd>{formatCoins(flow.balance)}</dd></div>
              <div className="is-total"><dt>{flow.renewing ? '续完之后' : '买完之后'}</dt><dd>{formatCoins(flow.balanceAfter)}</dd></div>
              <TermRows item={item} renewing={flow.renewing} now={shop.now} />
            </dl>
          )
        ) : null}
        {flow.view === 'short' ? (
          <>
            <p className="ksp-buy-short">还差 <b>{formatCoins(flow.shortfall)}</b> 个币</p>
            <dl className="ksp-bill">
              <div><dt>价格</dt><dd><CoinIcon size={14} className="h-3.5 w-3.5" />{formatCoins(item.price)}</dd></div>
              <div><dt>现在的余额</dt><dd>{formatCoins(flow.balance)}</dd></div>
            </dl>
            <p className="ksp-m-note">点「去投币」打开 KukeChat 官方作品页，给作品投币，回来点「我投完了，刷新余额」。币是投给 KukeChat 官方作品的。</p>
            {shop.balance?.stale ? <p className="ksp-m-note is-warn">上次向 CCW 核实没有成功，余额可能不是最新的，过一会儿再刷新。</p> : null}
            {shop.refreshError ? <p className="ksp-m-note is-danger" role="alert">{shop.refreshError}</p> : null}
          </>
        ) : null}
        {flow.view === 'unbound' ? <p className="ksp-m-lead">金币是按你绑定的 CCW 账号核实的：你在 CCW 给 KukeChat 官方作品投过多少币，这里就有多少。绑定之后，以前投过的也算数。</p> : null}
        {flow.view === 'blocked' ? <p className="ksp-m-lead">{flow.blockedText}</p> : null}
        {flow.view === 'done' ? <p className="ksp-m-lead" data-shop="done-text">{doneText(item, flow.action, flow.justObtained, categoryText(item.category).inUse, shop.now, flow.renewed)}</p> : null}
        {flow.error ? <p className="ksp-m-note is-danger" role="alert" data-shop="purchase-error">{flow.error}</p> : null}
      </div>
    </Sheet>
  );
}

const HISTORY_PAGE_SIZE = 20;

function HistorySheet({ onClose }: { onClose: () => void }): JSX.Element {
  const [offset, setOffset] = useState(0);
  const query = useShopPurchases(HISTORY_PAGE_SIZE, offset, true);
  const page = query.data;
  const total = page?.total ?? 0;
  return (
    <Sheet
      title="购买记录"
      subtitle={total > 0 ? `共 ${total} 条` : undefined}
      tall
      onClose={onClose}
      dataShop="history"
      footer={total > HISTORY_PAGE_SIZE ? (
        <>
          <button type="button" className={`${BUTTON} is-block`} disabled={offset === 0 || query.isFetching} onClick={() => setOffset(Math.max(0, offset - HISTORY_PAGE_SIZE))}>上一页</button>
          <span className="ksp-m-quiet shrink-0">{offset + 1}–{Math.min(total, offset + HISTORY_PAGE_SIZE)}</span>
          <button type="button" className={`${BUTTON} is-block`} disabled={offset + HISTORY_PAGE_SIZE >= total || query.isFetching} onClick={() => setOffset(offset + HISTORY_PAGE_SIZE)}>下一页</button>
        </>
      ) : undefined}
    >
      {query.isLoading ? <p className="ksp-m-empty">加载中…</p>
        : query.error ? <p className="ksp-m-note is-danger" role="alert">购买记录没有加载出来：{query.error.message}</p>
        : !page || page.items.length === 0 ? <p className="ksp-m-empty">还没有记录。买到、等级解锁、被赠送的装扮都会记在这里。</p>
        : (
          <ul className="ksp-history">
            {page.items.map((record) => (
              <li key={record.id} className={record.revoked_at ? 'is-revoked' : undefined} data-record={record.id}>
                <span className="ksp-history-name">{record.item.name}</span>
                <span className="ksp-history-tags">
                  <span className="kui-tag">{purchaseSourceLabel(record)}</span>
                  {durationLabel(record.duration_days) ? <span className="kui-tag kui-tag--warn" title={record.expires_at ? `到 ${expiryDateLabel(record.expires_at, Date.now())}` : undefined}>{durationLabel(record.duration_days)}</span> : null}
                  {record.revoked_at ? <span className="kui-tag kui-tag--danger">已收回</span> : null}
                  {record.refunded ? <span className="kui-tag kui-tag--ok">已退币</span> : null}
                </span>
                <span className="ksp-history-price">{record.price > 0 ? <><CoinIcon size={14} className="h-3.5 w-3.5" />{formatCoins(record.price)}</> : '免费'}</span>
                <time className="ksp-history-time">{formatShopTime(record.created_at)}</time>
              </li>
            ))}
          </ul>
        )}
    </Sheet>
  );
}
