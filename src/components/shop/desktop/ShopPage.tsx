import { createPortal } from 'react-dom';
import { cx } from '@/components/chat/desktop/runtime';
import { GiftRecordsButton } from '@/components/gifts/GiftEntry';
import { RedPacketRecordsButton } from '@/components/redpacket/RedPacketEntry';
import { Icon } from '@/components/ui/Icon';
import { CoinIcon } from '@/components/ui/CoinIcon';
import { getDesktopPortalRoot } from '@/components/ui/desktop/Modal';
import { useKukeStore } from '@/store/kukeStore';
import type { ShopItem } from '@/types/shop';
import { ItemButton, ItemTags, PriceLine } from '../ItemParts';
import { ItemPreview } from '../ItemPreview';
import { balanceExtras, canRenew, categoryText, formatCoins, formatVerifiedAt, itemAction, ownedExpiry } from '../labels';
import { useShopController, type ShopController } from '../useShopController';
import { HistoryDialog, PurchaseDialog, TryOnDialog } from './ShopDialogs';

/**
 * 商店：桌面端的一级页面（导航栏里「风纪」下面那个入口）。
 * 从上到下：标题栏 → 余额 + 我的装扮 → 按类别分栏的商品网格。状态和动作都在 useShopController，这里只管画。
 * 契约：KukeChat-Server 的 docs/shop.md。预览页：dev/shop-harness.html。样式在 src/styles/shop.css（前缀 ksp-）。
 */
export function ShopPage(): JSX.Element {
  const shop = useShopController();
  const openSettingsTab = useKukeStore((state) => state.openSettingsTab);
  const openBinding = (): void => openSettingsTab('ccw');
  const data = shop.shop;

  return (
    <section className="ksp-root" aria-label="商店">
      <div className="ksp">
        <header className="ksp-head">
          <h1 className="ksp-head-title">商店</h1>
          <p className="ksp-head-sub">用 CCW 金币换聊天里的装扮</p>
          {data ? (
            <div className="ksp-head-actions">
              <RedPacketRecordsButton className="kui-btn kui-btn--ghost kui-btn--sm"><Icon name="redPacket" className="h-3.5 w-3.5" />红包记录</RedPacketRecordsButton>
              <GiftRecordsButton className="kui-btn kui-btn--ghost kui-btn--sm"><Icon name="gift" className="h-3.5 w-3.5" />礼物记录</GiftRecordsButton>
              <button type="button" className="kui-btn kui-btn--ghost kui-btn--sm" data-action="history" onClick={() => shop.setHistoryOpen(true)}><Icon name="clock" className="h-3.5 w-3.5" />购买记录</button>
            </div>
          ) : null}
        </header>
        <div className="ksp-body kui-scroll">
          <div className="ksp-wrap">
            {data ? <ShopContent shop={shop} openBinding={openBinding} />
              : data === null ? <ShopState icon="store" title="商店即将开放">当前连接的服务端还没有开放商店。开放后这里会自动出现，不需要更新客户端。</ShopState>
              : shop.query.error ? <ShopState icon="alert" tone="danger" title="商店没有加载出来" actions={<button type="button" className="kui-btn kui-btn--sm" onClick={() => void shop.query.refetch()}>重试</button>}>{shop.query.error.message}</ShopState>
              : <ShopSkeleton />}
          </div>
        </div>
      </div>
      {/* 页面外层带 transform（进场动画的结束帧），position: fixed 的后代会被圈在里面；对话框挂到窗口根上才能盖住整个窗口 */}
      {shop.tryOnTarget ? createPortal(<TryOnDialog item={shop.tryOnTarget} shop={shop} />, getDesktopPortalRoot()) : null}
      {shop.purchaseTarget ? createPortal(<PurchaseDialog key={shop.purchaseTarget.id} item={shop.purchaseTarget} shop={shop} openBinding={openBinding} />, getDesktopPortalRoot()) : null}
      {shop.historyOpen ? createPortal(<HistoryDialog onClose={() => shop.setHistoryOpen(false)} />, getDesktopPortalRoot()) : null}
    </section>
  );
}

function ShopContent({ shop, openBinding }: { shop: ShopController; openBinding: () => void }): JSX.Element {
  return (
    <>
      <div className="ksp-top">
        <BalanceCard shop={shop} openBinding={openBinding} />
        <WardrobeCard shop={shop} />
      </div>
      {shop.categories.length === 0 ? (
        <ShopState icon="store" title="还没有上架商品" compact>商品上架后会出现在这里。</ShopState>
      ) : (
        <section className="ksp-catalog">
          <header className="ksp-catalog-head">
            {shop.categories.length > 1 ? (
              <div className="kui-segment" role="tablist" aria-label="商品类别">
                {shop.categories.map((category) => (
                  <button key={category.key} type="button" role="tab" aria-selected={shop.activeCategory === category.key} className={shop.activeCategory === category.key ? 'is-active' : undefined} onClick={() => shop.setActiveCategory(category.key)}>{category.label}</button>
                ))}
              </div>
            ) : <h2 className="ksp-h">{shop.categories[0].label}</h2>}
            <span className="ksp-catalog-count">{shop.items.length} 件 · 点预览可以试穿</span>
          </header>
          {shop.items.length === 0 ? <p className="kui-empty">这个类别还没有商品。</p> : (
            <div className="ksp-grid">
              {shop.items.map((item) => <ItemCard key={item.id} item={item} shop={shop} />)}
            </div>
          )}
        </section>
      )}
    </>
  );
}

/** 余额区。没绑定 CCW 时整块换成引导绑定。 */
function BalanceCard({ shop, openBinding }: { shop: ShopController; openBinding: () => void }): JSX.Element | null {
  const balance = shop.balance;
  if (!balance) {
    return null;
  }
  if (!balance.bound) {
    return (
      <section className="ksp-card ksp-bind" data-shop="unbound">
        <span className="ksp-coin"><Icon name="ccw" className="h-5 w-5" /></span>
        <div className="ksp-bind-text">
          <h2>绑定 CCW 账号后才能购买</h2>
          <p>金币是你在 CCW 给 KukeChat 官方作品投出的币，按绑定的 CCW 账号核实；以前投过的也算数。没绑定也可以先逛逛、试穿。</p>
        </div>
        <button type="button" className="kui-btn kui-btn--primary" data-action="bind-ccw" onClick={openBinding}>去绑定 CCW 账号</button>
      </section>
    );
  }
  return (
    <section className="ksp-card ksp-balance" data-shop="balance">
      <div className="ksp-balance-main">
        <span className="ksp-coin"><CoinIcon size={26} /></span>
        <div className="ksp-balance-figure">
          <p className="ksp-balance-label">金币余额</p>
          <p className="ksp-balance-number" data-shop="balance-number">{formatCoins(balance.balance)}</p>
        </div>
        <div className="ksp-balance-actions">
          <button type="button" className="kui-btn" data-action="refresh" disabled={shop.refreshing || shop.refreshWait > 0} onClick={shop.refresh}>
            <Icon name="refresh" className={cx('h-3.5 w-3.5', shop.refreshing && 'animate-spin')} />
            {shop.refreshing ? '核实中…' : shop.refreshWait > 0 ? `${shop.refreshWait} 秒后可刷新` : '刷新余额'}
          </button>
          <button type="button" className="kui-btn kui-btn--primary" data-action="donate" disabled={!shop.canDonate} title={shop.canDonate ? undefined : '暂时不能充值'} onClick={() => shop.donate()}><Icon name="external" className="h-3.5 w-3.5" />去投币</button>
        </div>
      </div>
      <dl className="ksp-stats">
        <div><dt>累计投币</dt><dd>{formatCoins(balance.donated)}</dd></div>
        <div><dt>已花</dt><dd>{formatCoins(balance.spent)}</dd></div>
        {/* 红包、礼物进出的几项：服务端给了、不是 0 才有 */}
        {balanceExtras(balance).map((row) => <div key={row.key} data-shop={`balance-${row.key}`}><dt>{row.label}</dt><dd>{row.text}</dd></div>)}
        <div><dt>核实</dt><dd>{formatVerifiedAt(balance.verified_at, shop.now)}</dd></div>
      </dl>
      {balance.stale ? <p className="kui-note kui-note--warn" data-shop="stale">上次向 CCW 核实没有成功，这里显示的是之前的余额，可能不是最新的。过一会儿再点「刷新余额」。</p> : null}
      {shop.refreshError ? <p className="kui-note kui-note--danger" role="alert">{shop.refreshError}</p> : null}
      {shop.canDonate ? null : <p className="kui-note kui-note--warn" data-shop="no-donate">暂时不能充值：服务端还没有配置投币的官方作品，配置好之后「去投币」就能用了。</p>}
      <p className={cx('kui-note', shop.donated && 'ksp-note--live')} data-shop="donate-hint">
        {shop.donated ? '投完了吗？回到这里点「刷新余额」，新投的币就会算进来。' : '金币怎么来：点「去投币」打开 KukeChat 官方作品页，给作品投币，回来点「刷新余额」。'}
        币是投给 KukeChat 官方作品的，只用来换这里的装扮，没有现金价值。
      </p>
    </section>
  );
}

/** 我的装扮：每个槽现在装备的是什么，可以卸下。 */
function WardrobeCard({ shop }: { shop: ShopController }): JSX.Element | null {
  if (shop.wardrobe.length === 0) {
    return null;
  }
  return (
    <section className="ksp-card ksp-wardrobe" data-shop="wardrobe">
      <header className="ksp-card-head"><h2><Icon name="shirt" className="h-4 w-4" />我的装扮</h2></header>
      {shop.wardrobe.map(({ category, sku, item }) => {
        // 装备着的是限时商品：写还剩几天，不超过 3 天时标红；能续期的给一个「续期」
        const expiry = item ? ownedExpiry(item, shop.now) : null;
        return (
          <div key={category.key} className="ksp-slot" data-slot={category.slot}>
            <div className="ksp-slot-text">
              <p className="ksp-slot-label">{category.label}</p>
              <p className="ksp-slot-name">{item ? item.name : sku ? '已装备一件装扮' : '没有装备'}{expiry ? <span className={cx('ksp-expiry', expiry.soon && 'is-soon')} data-shop="slot-expiry" data-soon={expiry.soon || undefined}><Icon name="clock" className="h-3 w-3" />{expiry.text}</span> : null}</p>
              <p className="ksp-slot-hint">{expiry?.soon ? '快到期了，到期后会自动卸下。续期可以接着用。' : sku ? categoryText(category.key).slotEquipped : categoryText(category.key).slotEmpty}</p>
            </div>
            <ItemPreview category={category.key} style={item?.style} previewText={item?.preview_text} variant="slot" layout="desktop" />
            {item && canRenew(item) ? <button type="button" className={cx('kui-btn kui-btn--sm', expiry?.soon && 'kui-btn--primary')} data-action="renew-slot" onClick={() => shop.openPurchase(item)}>续期</button> : null}
            {sku ? <button type="button" className="kui-btn kui-btn--sm" data-action="unequip-slot" disabled={shop.equipPending !== null} onClick={() => shop.unequip(category.slot)}>{shop.equipPending === category.slot ? '卸下中…' : '卸下'}</button> : null}
          </div>
        );
      })}
    </section>
  );
}

function ItemCard({ item, shop }: { item: ShopItem; shop: ShopController }): JSX.Element {
  const action = itemAction(item);
  return (
    <article className={cx('ksp-item', action === 'equipped' && 'is-equipped')} data-sku={item.sku} data-state={action}>
      {/* 不用 <button>：预览里的文字可能带链接，按钮里不能再套链接 */}
      <div className="ksp-item-preview" role="button" tabIndex={0} title="点开试穿" aria-label={`试穿 ${item.name}`} onClick={() => shop.openTryOn(item)} onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          shop.openTryOn(item);
        }
      }}>
        <ItemPreview category={item.category} style={item.style} previewText={item.preview_text} variant="card" layout="desktop" />
        <span className="ksp-item-try"><Icon name="eye" className="h-3.5 w-3.5" />试穿</span>
      </div>
      <div className="ksp-item-body">
        <div className="ksp-item-title"><h3>{item.name}</h3><ItemTags item={item} now={shop.now} /></div>
        {item.description ? <p className="ksp-item-desc">{item.description}</p> : null}
        <div className="ksp-item-foot">
          <PriceLine item={item} />
          <ItemButton item={item} shop={shop} className="kui-btn kui-btn--sm" primaryClassName="kui-btn--primary" />
        </div>
      </div>
    </article>
  );
}

function ShopState({ icon, title, tone, compact, actions, children }: { icon: 'store' | 'alert'; title: string; tone?: 'danger'; compact?: boolean; actions?: React.ReactNode; children: React.ReactNode }): JSX.Element {
  return (
    <div className={cx('ksp-state', compact && 'is-compact', tone === 'danger' && 'is-danger')} role={tone === 'danger' ? 'alert' : undefined}>
      <span className="ksp-state-icon"><Icon name={icon} className="h-5 w-5" /></span>
      <p className="ksp-state-title">{title}</p>
      <div className="ksp-state-text">{children}</div>
      {actions ? <div className="ksp-state-actions">{actions}</div> : null}
    </div>
  );
}

/** 加载中的骨架：块和流光用的是名单页的 .kcr-bone，这里只定每一块的大小。 */
function ShopSkeleton(): JSX.Element {
  return (
    <div className="ksp-skeleton" role="status" aria-label="正在加载商店">
      <div className="ksp-top">
        <span className="kcr-bone ksp-bone--card" />
        <span className="kcr-bone ksp-bone--card" />
      </div>
      <div className="ksp-grid">
        {[0, 1, 2, 3, 4, 5].map((index) => <span key={index} className="kcr-bone ksp-bone--item" style={{ '--kcr-delay': `${index * 90}ms` } as React.CSSProperties} />)}
      </div>
    </div>
  );
}
