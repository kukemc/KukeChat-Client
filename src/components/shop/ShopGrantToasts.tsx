import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { isRecord } from '@/api/normalizers';
import { Icon } from '@/components/ui/Icon';
import { toast } from '@/components/ui/toast';
import { subscribeRealtimeEvents } from '@/realtime/events';
import { useKukeStore } from '@/store/kukeStore';
import type { ShopOverview } from '@/types/shop';
import { expiryLabel } from '@/utils/shopExpiry';
import { KNOWN_CATEGORIES, shopKeys, slotOfCategory, useEquipItem } from './data';
import { categoryText, describeEquipError } from './labels';

const LIFETIME_MS = 12_000;

type GrantKind = 'granted' | 'expiring' | 'expired';

const SOURCE_TEXT: Record<string, string> = { level: '升级解锁', grant: '收到赠送', gift: '收到礼物' };
const EVENT_KIND: Record<string, GrantKind> = { 'shop.item.granted': 'granted', 'shop.item.expiring': 'expiring', 'shop.item.expired': 'expired' };

/**
 * 和「我的装扮」有关的提示，不管用户正停在哪个页面都会出现，所以挂在主界面上而不是商店页里：
 *   · shop.item.granted   得到了一件装扮（被赠送，或升级后自动解锁）：可以当场换上，也可以去商店看看
 *   · shop.item.expiring  一件限时商品快到期了（到期前 3 天，服务端只发一次）：可以直接去续期
 *   · shop.item.expired   一件限时商品到期了，装备着的话已经被卸下：可以去商店再买
 *
 * 只用统一的提示组件表达（图形走 leading 插槽），自己不再渲染。
 * 「现在换上」的结果（换上中 / 已换上 / 失败）通过同一个 id 原地改写那一条提示。
 * 缓存的刷新在 data.ts 的 handleShopEvent。
 */
export function ShopGrantToasts(): null {
  const queryClient = useQueryClient();
  const equip = useEquipItem();
  const latest = useRef({ queryClient, equip });
  latest.current = { queryClient, equip };

  useEffect(() => subscribeRealtimeEvents((event) => {
    const kind = EVENT_KIND[event.rawType];
    if (!kind || !isRecord(event.data) || !isRecord(event.data.item)) {
      return;
    }
    const item = event.data.item;
    // 这个版本不认识的类别不提示：点了也没有地方看、没法换上
    if (typeof item.sku !== 'string' || typeof item.category !== 'string' || !KNOWN_CATEGORIES.has(item.category)) {
      return;
    }
    const sku = item.sku;
    const category = item.category;
    const name = typeof item.name === 'string' && item.name ? item.name : kind === 'granted' ? '新装扮' : '装扮';
    const source = typeof event.data.source === 'string' ? event.data.source : '';
    const expiresAt = typeof event.data.expires_at === 'string' ? event.data.expires_at : null;
    // 同一件装扮的同一类事件只留一条，后面原地改写它
    const id = `shop.${kind}:${sku}`;
    const goShopItem = (): void => useKukeStore.getState().openShopItem(sku);
    const goShop = (): void => useKukeStore.getState().openShop();

    /** 换上这件装扮；结果原地写回同一条提示 */
    const wear = (): void => {
      const { queryClient: client, equip: mutate } = latest.current;
      const categories = client.getQueryData<ShopOverview | null>(shopKeys.overview)?.categories ?? [];
      toast.show({
        id,
        tone: 'info',
        message: `获得新装扮「${name}」`,
        subtitle: '换上中…',
        leading: <span className="ksp-grant-leading"><Icon name="sparkles" className="h-5 w-5" /></span>,
        duration: LIFETIME_MS,
        actions: [{ label: '换上中…', disabled: true, onClick: () => undefined }]
      });
      mutate.mutate({ slot: slotOfCategory(categories, category), sku }, {
        onSuccess: () => {
          toast.show({
            id,
            tone: 'success',
            message: `已换上「${name}」`,
            subtitle: categoryText(category).inUse.replace(/。$/, ''),
            leading: <span className="ksp-grant-leading"><Icon name="check" className="h-5 w-5" /></span>,
            duration: 2600
          });
        },
        onError: (error) => {
          toast.show({
            id,
            tone: 'warning',
            message: `没能换上「${name}」`,
            subtitle: describeEquipError(error),
            leading: <span className="ksp-grant-leading"><Icon name="alert" className="h-5 w-5" /></span>,
            duration: 6000,
            actions: [{ label: '再试一次', onClick: wear }, { label: '去商店看看', onClick: goShop }]
          });
        }
      });
    };

    if (kind === 'granted') {
      toast.show({
        id,
        tone: 'success',
        message: `获得新装扮「${name}」`,
        subtitle: SOURCE_TEXT[source] ?? '已经放进你的装扮里',
        leading: <span className="ksp-grant-leading"><Icon name="sparkles" className="h-5 w-5" /></span>,
        duration: LIFETIME_MS,
        actions: [{ label: '现在换上', onClick: wear }, { label: '去商店看看', onClick: goShop }]
      });
      return;
    }

    const expiring = kind === 'expiring';
    toast.show({
      id,
      tone: 'warning',
      message: expiring ? `「${name}」快到期了` : `「${name}」已到期`,
      subtitle: expiring
        ? `${expiryLabel(expiresAt, Date.now()) ?? '还剩不到 3 天'}，到期后会自动卸下。续期可以接着用。`
        : '这件限时装扮到期了，已经从你的装扮里收回。还想用的话可以再买。',
      leading: <span className="ksp-grant-leading"><Icon name="clock" className="h-5 w-5" /></span>,
      duration: LIFETIME_MS,
      actions: [{ label: expiring ? '去续期' : '去商店看看', onClick: goShopItem }]
    });
  }), []);

  return null;
}
