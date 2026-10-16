import { useState } from 'react';
import type { ShopItem } from '@/types/shop';
import { usePurchaseItem } from './data';
import { canRenew, describePurchaseError, itemAction, type PurchaseFailure, type ShopItemAction } from './labels';
import type { ShopController } from './useShopController';

/**
 * 购买确认框现在该显示哪一种画面：
 *   confirm   确认购买 / 确认免费领取 / 确认续期（已经拥有的限时商品，renewing 为 true）
 *   short     余额不够：还差多少、去投币、投完刷新
 *   unbound   还没绑定 CCW 账号
 *   blocked   这件现在拿不到（已下架、等级不够、不出售）
 *   done      已经到手，可以一键装备
 */
export type PurchaseView = 'confirm' | 'short' | 'unbound' | 'blocked' | 'done';

export interface PurchaseFlow {
  view: PurchaseView;
  action: ShopItemAction;
  /** 免费领取（等级解锁），不扣币 */
  free: boolean;
  /** 这次是给已经拥有的限时商品续期：确认框要写明续到哪天 */
  renewing: boolean;
  /** 刚刚续期成功（打开时就是来续期的） */
  renewed: boolean;
  balance: number;
  /** 买完之后的余额 */
  balanceAfter: number;
  shortfall: number;
  /** 要给用户看的错误（余额不够、没绑定这两种有自己的画面，不在这里） */
  error: string | null;
  /** blocked 时的说明 */
  blockedText: string;
  pending: boolean;
  /** 这次打开弹窗之后刚到手的（区别于打开时就已经拥有） */
  justObtained: boolean;
  confirm: () => void;
  donate: () => void;
  /** 现在能不能去投币（服务端没配置官方作品、402 里也没带地址时不能） */
  canDonate: boolean;
}

const BLOCKED_TEXT: Partial<Record<ShopItemAction, string>> = {
  delisted: '这件商品已经下架，现在买不了了。',
  'not-for-sale': '这件商品不出售，只在活动里送出。'
};

/** 购买流程的状态，桌面的对话框和移动端的底部面板共用。 */
export function usePurchaseFlow(item: ShopItem, shop: ShopController): PurchaseFlow {
  const purchase = usePurchaseItem();
  // verifiedAt：失败那一刻手头余额的核实时间，用来判断之后有没有刷新出新的余额
  const [failure, setFailure] = useState<(PurchaseFailure & { verifiedAt: string | null }) | null>(null);
  const [justObtained, setJustObtained] = useState(false);
  // 打开弹窗的那一刻是不是来续期的（买到之后它也会变成「可以续期」，不能现算）
  const [openedToRenew] = useState(() => canRenew(item));
  const action = itemAction(item);
  const balance = shop.balance?.balance ?? 0;
  const bound = shop.balance?.bound ?? false;
  // 续期：已经拥有的限时商品再买一次。续成功之后它还是「可以续期」，所以靠 justObtained 分辨「要不要再问一遍」
  const renewing = canRenew(item) && !justObtained;
  const paying = action === 'buy' || renewing;
  const free = action === 'claim' || (paying && item.price <= 0);
  const verifiedAt = shop.balance?.verified_at ?? null;
  // 服务端说不够（它是先向 CCW 重新核实过的），但手头的余额看着够：以服务端给的差额为准，直到用户刷新出新的余额
  const serverShortfall = failure?.code === 'insufficient_coins' && failure.verifiedAt === verifiedAt ? failure.shortfall ?? 1 : 0;
  const localShortfall = free ? 0 : Math.max(0, item.price - balance);
  const shortfall = Math.max(localShortfall, serverShortfall);

  let view: PurchaseView;
  if ((action === 'owned' || action === 'equipped') && !renewing) {
    view = 'done';
  } else if (!paying && action !== 'claim') {
    view = 'blocked';
  } else if ((!bound && action !== 'claim') || failure?.code === 'ccw_not_bound') {
    // 等级够了的免费领取不要求绑定 CCW（docs/shop.md 3.6）：没绑定的人照样走确认框。花币买的才要先绑定
    view = 'unbound';
  } else if (shortfall > 0) {
    view = 'short';
  } else {
    view = 'confirm';
  }

  const confirm = (): void => {
    if (purchase.isPending) {
      return;
    }
    setFailure(null);
    purchase.mutate(item, {
      onSuccess: () => setJustObtained(true),
      onError: (error) => setFailure({ ...describePurchaseError(error, item), verifiedAt })
    });
  };

  const special = failure?.code === 'insufficient_coins' || failure?.code === 'ccw_not_bound';
  return {
    view,
    action,
    free,
    renewing,
    renewed: justObtained && openedToRenew,
    balance,
    balanceAfter: free ? balance : balance - item.price,
    shortfall,
    error: failure && !special && view !== 'done' ? failure.message : null,
    blockedText: BLOCKED_TEXT[action] ?? (item.unlock_level !== null ? `这件不出售，账号等级达到 Lv.${item.unlock_level} 后可以免费解锁。你现在是 Lv.${shop.shop?.level ?? 0}。` : '这件商品现在还拿不到。'),
    pending: purchase.isPending,
    justObtained,
    confirm,
    // 402 里带了投币地址就用它的
    donate: () => shop.donate(failure?.donateUrl),
    canDonate: Boolean(failure?.donateUrl) || shop.canDonate
  };
}
