import { useMemo } from 'react';
import { cx } from '@/components/chat/desktop/runtime';
import { Icon } from '@/components/ui/Icon';
import type { ShopItem } from '@/types/shop';
import { formatRemaining, itemAction, priceLabel, TAG_LABEL, TAG_TONE, type ShopItemAction } from './labels';
import { parseBubbleSkin } from './skin/bubbleSkin';
import type { ShopController } from './useShopController';

/** 商品卡片、试穿、确认框里都会出现的几个小部件。桌面和移动两套界面共用（类名前缀 ksp-，样式在 shop.css）。 */

/** 名字后面的一排标签：使用中 / 已拥有 / 新品 · 热门 · 限时（带倒计时）/ 已下架。 */
export function ItemTags({ item, now }: { item: ShopItem; now: number }): JSX.Element | null {
  const action = itemAction(item);
  const remaining = item.tag === 'limited' && !item.delisted ? formatRemaining(item.available_until, now) : null;
  const unsupported = useMemo(() => parseBubbleSkin(item.style) === null, [item.style]);
  const tags: JSX.Element[] = [];
  if (action === 'equipped') {
    tags.push(<span key="equipped" className="kui-tag kui-tag--ok">使用中</span>);
  } else if (action === 'owned') {
    tags.push(<span key="owned" className="kui-tag">已拥有</span>);
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

/** 价格那一行：金币数，或者「Lv.N 解锁」之类的一句话。已经拥有的不再显示价格。 */
export function PriceLine({ item }: { item: ShopItem }): JSX.Element {
  const action = itemAction(item);
  if (action === 'equipped' || action === 'owned') {
    return <span className="ksp-price ksp-price--text">{action === 'equipped' ? '正在使用' : '已在你的装扮里'}</span>;
  }
  const price = priceLabel(item, action);
  return (
    <span className={cx('ksp-price', price.kind === 'text' && 'ksp-price--text')}>
      {price.kind === 'coins' ? <Icon name="coins" className="h-4 w-4" /> : null}
      <b>{price.text}</b>
      {price.hint ? <small>{price.hint}</small> : null}
    </span>
  );
}

const DISABLED_LABEL: Partial<Record<ShopItemAction, string>> = { 'level-locked': '等级不够', 'not-for-sale': '暂不出售', delisted: '已下架' };

/**
 * 状态按钮：购买 / 免费领取 / 装备 / 卸下 / 等级不够 / 暂不出售 / 已下架。
 * className 由调用方给（桌面是 kui-btn 那一组，移动端是自己的一组），primary 是「主要动作」时额外加的类。
 */
export function ItemButton({ item, shop, className, primaryClassName, onBeforeBuy }: { item: ShopItem; shop: ShopController; className: string; primaryClassName: string; onBeforeBuy?: () => void }): JSX.Element {
  const action = itemAction(item);
  const busy = shop.equipPending === item.sku;
  if (action === 'equipped') {
    return <button type="button" className={className} data-action="unequip" disabled={busy} onClick={() => shop.unequipItem(item)}>{busy ? '卸下中…' : '卸下'}</button>;
  }
  if (action === 'owned') {
    return <button type="button" className={cx(className, primaryClassName)} data-action="equip" disabled={busy} onClick={() => shop.equip(item)}>{busy ? '装备中…' : '装备'}</button>;
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
