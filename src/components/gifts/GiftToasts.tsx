import { useEffect, useRef } from 'react';
import { normalizeGiftRecord } from '@/api/gifts';
import { isRecord } from '@/api/normalizers';
import { formatCoins } from '@/components/shop/labels';
import { getDisplayName } from '@/components/ui/Avatar';
import { toast } from '@/components/ui/toast';
import { subscribeRealtimeEvents } from '@/realtime/events';
import { useKukeStore } from '@/store/kukeStore';
import type { GiftRecord } from '@/types/gift';
import { giftThingLabel } from '@/utils/gift';
import { useCharmLabel } from './data';
import { GiftThing } from './GiftThing';

const LIFETIME_MS = 10_000;

/**
 * 「有人送了我礼物」的提示（实时事件 gift.received，只发给收礼人，无论有没有落聊天消息）。
 * 不管正停在哪个页面都会出现：在别的会话里、在商店里、从对方的个人主页送来的（没有消息）都看得到。
 * 可以点过去看：在会话里送的进那个会话，从主页送的进自己的礼物墙；送的是装扮的话多一个「去装扮」。
 *
 * 只负责订阅事件、往统一的提示里塞一条（图形走 leading 插槽），自己不再渲染任何东西。
 * 缓存的刷新在 data.ts 的 handleGiftEvent；礼物功能的开关不在这里看：服务端发了事件就是真的收到了。
 */
export function GiftToasts(): null {
  const charmLabel = useCharmLabel();
  const visibleConversationId = useKukeStore((state) => state.visibleConversationId);
  // 订阅一次就够，回调里从 ref 读最新的值
  const latest = useRef({ charmLabel, visibleConversationId });
  latest.current = { charmLabel, visibleConversationId };

  useEffect(() => subscribeRealtimeEvents((event) => {
    if (event.rawType !== 'gift.received' || !isRecord(event.data)) {
      return;
    }
    const record = normalizeGiftRecord(event.data.record);
    if (!record) {
      return;
    }
    const { charmLabel: charm, visibleConversationId: visible } = latest.current;
    const from = getDisplayName(record.from_user, '有人');
    // 就在那个会话里：卡片和动效已经在眼前了，不用再给「去看看」
    const here = record.conversation_id !== null && record.conversation_id === visible;
    const detail = record.message ? `「${record.message}」`
      : record.item ? '已经放进你的装扮里'
        : `${charm} +${formatCoins(record.amount)}`;
    const subtitle = record.on_birthday ? `生日礼物 · ${detail}` : detail;

    toast.show({
      // 同一个礼物只提示一次：事件重连、重放时不会多出一条
      id: `gift.received:${record.id}`,
      tone: 'info',
      message: `${from} 送了你 ${giftThingLabel(record)}`,
      subtitle,
      leading: <GiftThing gift={record.gift} item={record.item} wearer={record.to_user} size={40} avatarSize="md" />,
      duration: LIFETIME_MS,
      actions: [
        ...(record.item ? [{
          label: '去装扮',
          onClick: () => useKukeStore.getState().openShopItem(record.item?.sku ?? '')
        }] : []),
        ...(here ? [] : [{
          label: record.conversation_id !== null ? '去看看' : '看我的礼物墙',
          onClick: () => {
            const state = useKukeStore.getState();
            if (record.conversation_id !== null) {
              state.setActiveConversationId(record.conversation_id);
            } else if (state.currentUser) {
              // 没落聊天消息的：去自己的礼物墙看
              state.openUserSpace(state.currentUser.id);
            }
          }
        }])
      ]
    });
  }), []);

  return null;
}
