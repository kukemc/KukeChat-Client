import { useMemo } from 'react';
import { cx } from '@/components/chat/desktop/runtime';
import { Icon } from '@/components/ui/Icon';
import { CoinIcon } from '@/components/ui/CoinIcon';
import type { ShopItem } from '@/types/shop';
import { canRenew, expiryDateLabel, formatRemaining, itemAction, ownedExpiry, priceLabel, renewalDateLabel, TAG_LABEL, TAG_TONE, type ShopItemAction } from './labels';
import { durationLabel } from '@/utils/shopExpiry';
import { parseAvatarFrame } from './skin/avatarFrame';
import { parseBubbleSkin } from './skin/bubbleSkin';
import type { ShopController } from './useShopController';

/** 商品卡片、试穿、确认框里都会出现的几个小部件。桌面和移动两套界面共用（类名前缀 ksp-，样式在 shop.css）。 */

/** 这个版本的客户端画不画得出这件商品（style 过不了对应类别的校验就是画不出）。 */
function canRender(item: ShopItem): boolean {
  return (item.category === 'frame' ? parseAvatarFrame(item.style) : parseBubbleSkin(item.style)) !== null;
}

/** 名字后面的一排标签：使用中 / 已拥有 / 有效期（没买的写「30 天」，买了的写「还剩 N 天」）/ 新品 · 热门 · 限时（带倒计时）/ 已下架。 */
export function ItemTags({ item, now }: { item: ShopItem; now: number }): JSX.Element | null {
  const action = itemAction(item);
  const remaining = item.tag === 'limited' && !item.delisted ? formatRemaining(item.available_until, now) : null;
  const unsupported = useMemo(() => !canRender(item), [item]);
  const tags: JSX.Element[] = [];
  if (action === 'equipped') {
    tags.push(<span key="equipped" className="kui-tag kui-tag--ok">使用中</span>);
  } else if (action === 'owned') {
    tags.push(<span key="owned" className="kui-tag">已拥有</span>);
  }
  // 有效期：拥有的写还剩几天（不超过 3 天时标红），没拥有的写买了能用多久。永久商品什么都不写
  const owned = action === 'equipped' || action === 'owned';
  const expiry = owned ? ownedExpiry(item, now) : null;
  const duration = owned ? null : durationLabel(item.duration_days);
  if (expiry) {
    tags.push(<span key="expiry" className={cx('kui-tag ksp-tag-term', expiry.soon ? 'kui-tag--danger is-soon' : 'kui-tag--warn')} data-shop="expiry" data-soon={expiry.soon || undefined}><Icon name="clock" className="h-3 w-3" />{expiry.text}</span>);
  } else if (duration) {
    tags.push(<span key="duration" className="kui-tag kui-tag--warn ksp-tag-term" data-shop="duration" title={`买一次拥有 ${duration}，到期后自动卸下，可以续期`}><Icon name="clock" className="h-3 w-3" />{duration}</span>);
  }
  if (item.delisted) {
    tags.push(<span key="delisted" className="kui-tag">已下架</span>);
  } else if (item.tag) {
    tags.push(<span key="tag" className={cx('kui-tag', TAG_TONE[item.tag])}>{TAG_LABEL[item.tag]}{remaining ? ` · ${remaining}` : ''}</span>);
  }
  if (unsupported) {
    tags.push(<span key="unsupported" className="kui-tag kui-tag--warn" title="这个版本的客户端画不出这件装扮，更新客户端后就能看到">需更新客户端</span>);
  }
  return tags.length > 0 ? <span className="ksp-tags">{tags}</span> : null;
}

/** 价格那一行：金币数，或者「Lv.N 解锁」之类的一句话。已经拥有的不再显示价格（能续期的限时商品写续期的价钱）。 */
export function PriceLine({ item }: { item: ShopItem }): JSX.Element {
  const action = itemAction(item);
  if (action === 'equipped' || action === 'owned') {
    if (canRenew(item) && item.price > 0) {
      return <span className="ksp-price ksp-price--text">续期 <CoinIcon variant="line" size={14} className="h-3.5 w-3.5" /><b>{item.price.toLocaleString('zh-CN')}</b><small>/ {durationLabel(item.duration_days)}</small></span>;
    }
    return <span className="ksp-price ksp-price--text">{action === 'equipped' ? '正在使用' : '已在你的装扮里'}</span>;
  }
  const price = priceLabel(item, action);
  return (
    <span className={cx('ksp-price', price.kind === 'text' && 'ksp-price--text')}>
      {price.kind === 'coins' ? <CoinIcon size={16} className="h-4 w-4" /> : null}
      <b>{price.text}</b>
      {price.hint ? <small>{price.hint}</small> : null}
    </span>
  );
}

const DISABLED_LABEL: Partial<Record<ShopItemAction, string>> = { 'level-locked': '等级不够', 'not-for-sale': '暂不出售', delisted: '已下架' };

/**
 * 状态按钮：购买 / 免费领取 / 装备 / 卸下 / 等级不够 / 暂不出售 / 已下架。已经拥有的限时商品多一个「续期」。
 * className 由调用方给（桌面是 kui-btn 那一组，移动端是自己的一组），primary 是「主要动作」时额外加的类。
 */
export function ItemButton({ item, shop, className, primaryClassName, onBeforeBuy }: { item: ShopItem; shop: ShopController; className: string; primaryClassName: string; onBeforeBuy?: () => void }): JSX.Element {
  const action = itemAction(item);
  const busy = shop.equipPending === item.sku;
  if (action === 'equipped' || action === 'owned') {
    const main = action === 'equipped'
      ? <button type="button" className={className} data-action="unequip" disabled={busy} onClick={() => shop.unequipItem(item)}>{busy ? '卸下中…' : '卸下'}</button>
      : <button type="button" className={cx(className, primaryClassName)} data-action="equip" disabled={busy} onClick={() => shop.equip(item)}>{busy ? '装备中…' : '装备'}</button>;
    if (!canRenew(item)) {
      return main;
    }
    return (
      <span className="ksp-actions">
        <button type="button" className={className} data-action="renew" onClick={() => {
          onBeforeBuy?.();
          shop.openPurchase(item);
        }}>续期</button>
        {main}
      </span>
    );
  }
  if (action === 'buy' || action === 'claim') {
    return (
      <button type="button" className={cx(className, primaryClassName)} data-action={action} onClick={() => {
        onBeforeBuy?.();
        shop.openPurchase(item);
      }}>
        {action === 'claim' || item.price <= 0 ? '免费领取' : '购买'}
      </button>
    );
  }
  const hint = action === 'level-locked' && item.unlock_level !== null ? `需要 Lv.${item.unlock_level}，你现在是 Lv.${shop.shop?.level ?? 0}` : undefined;
  return <button type="button" className={className} data-action={action} disabled title={hint}>{DISABLED_LABEL[action] ?? '暂不可用'}</button>;
}

/**
 * 确认框账单里说明有效期的那两行（限时商品才有）：买一次多少天、买完 / 续完到哪天。
 * 续期时把现在的到期日也写出来，让人看得出是「接着往后加」。放在 <dl className="ksp-bill"> 里面。
 */
export function TermRows({ item, renewing, now }: { item: ShopItem; renewing: boolean; now: number }): JSX.Element | null {
  const duration = durationLabel(item.duration_days);
  const until = renewalDateLabel(item, now);
  if (!duration || !until) {
    return null;
  }
  const current = renewing ? expiryDateLabel(item.expires_at, now) : null;
  return (
    <>
      <div data-shop="term"><dt>有效期</dt><dd>{renewing ? `再加 ${duration}` : duration}</dd></div>
      {current ? <div><dt>现在到</dt><dd>{current}</dd></div> : null}
      <div data-shop="until"><dt>{renewing ? '续期到' : '可以用到'}</dt><dd>{until}</dd></div>
    </>
  );
}

/** 到手之后那句话：续期的写「已续期到 X」，其余的问要不要换上。桌面和移动的确认框共用。 */
export function doneText(item: ShopItem, action: ShopItemAction, justObtained: boolean, inUse: string, now: number, renewed = false): string {
  const until = expiryDateLabel(item.expires_at, now);
  if (renewed && until) {
    return action === 'equipped' ? `「${item.name}」已续期到 ${until}，正在使用中。` : `「${item.name}」已续期到 ${until}。现在就换上？`;
  }
  const term = until ? `，可以用到 ${until}` : '';
  if (action === 'equipped') {
    return `「${item.name}」正在使用中${term}，${inUse}`;
  }
  return `「${item.name}」${justObtained ? '已经是你的了' : '已经在你的装扮里'}${term}。现在就换上？`;
}
