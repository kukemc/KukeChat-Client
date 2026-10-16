import { useState, type SyntheticEvent } from 'react';
import { cx } from '@/components/chat/desktop/runtime';
import { termLabel } from '@/components/shop/labels';
import { useKukeStore } from '@/store/kukeStore';
import type { Message } from '@/types/api';
import type { GiftMeta } from '@/types/gift';
import { giftTierOf } from '@/utils/gift';
import { GiftThing } from './GiftThing';
import { GIFT_FRESH_MS, recipientAsUser, useGiftMotion, useGiftUi } from './ui';

function stop(event: SyntheticEvent): void {
  event.stopPropagation();
}

function senderName(message: Message): string {
  return message.sender_display_name || message.sender?.nickname || message.sender?.username || '有人';
}

/**
 * 聊天里的一张礼物卡片，桌面和移动的消息列表共用（类名前缀 kgf-，样式在 gifts.css）。
 * 谁送给谁、送的什么（礼物图形 ×数量，或者商品的小样：气泡 / 头像框）、留言。内容全部来自消息上的 `metadata.gift`，不发请求。
 * 送的是商店商品、而且收礼人是我：多一个「去装扮」，直达商店里那一件（东西已经在我的装扮里了，不会自动换上）。
 *
 * 小动画（tier 1，以及更大的动效播的时候卡片上的那一下）只在这条消息刚到的时候播一次：挂上来的那一刻看 useGiftUi 的 fresh 表，
 * 之后滚走再滚回来就是静止的卡片。
 */
export function GiftCard({ message, meta, mine }: { message: Message; meta: GiftMeta; mine: boolean }): JSX.Element {
  const currentUserId = useKukeStore((state) => state.currentUser?.id ?? null);
  const openShopItem = useKukeStore((state) => state.openShopItem);
  const motion = useGiftMotion();
  // 只在挂上来的那一刻判断一次：之后表里清掉了也不影响这张卡片把动画播完
  const [fresh] = useState(() => {
    const at = useGiftUi.getState().fresh[meta.id];
    return at !== undefined && Date.now() - at < GIFT_FRESH_MS;
  });
  const toMe = meta.to_user.id === currentUserId;
  const from = mine ? '你' : senderName(message);
  const to = toMe ? '你' : meta.to_user.display_name;
  const tier = giftTierOf(meta);
  const thing = meta.item ? meta.item.name : meta.gift?.name ?? '礼物';

  return (
    <div
      className={cx('kgf-card', `kgf-card--${meta.kind}`, `is-tier${tier}`, toMe && 'is-to-me', fresh && motion && 'is-fresh')}
      data-gift={meta.id}
      data-gift-kind={meta.kind}
      data-tier={tier}
      role="group"
      aria-label={`${from} 送给 ${to} ${thing}${meta.count > 1 ? ` ×${meta.count}` : ''}${meta.message ? `，留言：${meta.message}` : ''}`}
      // 行上的双击是「引用」，在卡片上连点不该触发它
      onDoubleClick={stop}
    >
      <p className="kgf-card-line"><span className="kgf-card-who">{from}</span><span className="kgf-card-verb">送给</span><span className="kgf-card-who">{to}</span></p>
      <div className="kgf-card-body">
        <span className="kgf-card-thing">
          <i className="kgf-card-glow" aria-hidden="true" />
          <GiftThing gift={meta.gift} item={meta.item} wearer={meta.item ? recipientAsUser(meta.to_user) : null} size={64} avatarSize="lg" />
        </span>
        <span className="kgf-card-text">
          <span className="kgf-card-name">{thing}{meta.kind === 'gift' && meta.count > 1 ? <b className="kgf-card-count">×{meta.count}</b> : null}</span>
          {meta.item ? <span className="kgf-card-term">{meta.item.category === 'frame' ? '头像框' : meta.item.category === 'bubble' ? '气泡' : '装扮'} · {termLabel(meta.item)}</span> : null}
          {meta.message ? <span className="kgf-card-message"><span>{meta.message}</span></span> : null}
        </span>
      </div>
      {meta.item && toMe ? (
        <div className="kgf-card-foot">
          <span>已经放进你的装扮里</span>
          <button type="button" className="kgf-card-go" data-action="gift-wear" onClick={(event) => {
            event.stopPropagation();
            openShopItem(meta.item?.sku ?? '');
          }}>去装扮</button>
        </div>
      ) : null}
    </div>
  );
}
