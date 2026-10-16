import { useEffect } from 'react';
import { normalizeIntimacyBadges, normalizeIntimacyLevelUp } from '@/api/intimacy';
import { toast } from '@/components/ui/toast';
import { subscribeRealtimeEvents } from '@/realtime/events';
import { BadgeGlyph } from './BadgeGlyph';
import { openIntimacy } from './data';

/**
 * 好友成就解锁、友谊升级的提示（实时事件 intimacy.badge.unlocked / intimacy.level.up，双方各收一份）。挂在主界面上。
 * 走统一的提示组件：徽章画在 leading 里，点「看看」打开「我们的友谊」。一次解锁好几枚时只出一条，写第一枚的名字和总数。
 * 缓存的更新在 data.ts 的 handleIntimacyEvent，这里只管提示。
 */
export function IntimacyToasts(): null {
  useEffect(() => subscribeRealtimeEvents((event) => {
    if (event.rawType === 'intimacy.badge.unlocked') {
      const data = normalizeIntimacyBadges(event.data);
      if (!data) {
        return;
      }
      const [first] = [...data.badges].sort((left, right) => right.tier - left.tier);
      const name = data.friend?.display_name || '好友';
      toast.show({
        id: `intimacy.badge:${data.friend_id}:${data.badges.map((badge) => `${badge.series}.${badge.level}`).join(',')}`,
        tone: 'success',
        message: data.badges.length > 1 ? `和 ${name} 解锁了「${first.name}」等 ${data.badges.length} 枚好友徽章` : `和 ${name} 解锁了好友徽章「${first.name}」`,
        subtitle: first.series_name && first.series_name !== first.name ? first.series_name : undefined,
        leading: <BadgeGlyph icon={first.icon} tier={first.tier} size={34} />,
        duration: 7000,
        actions: [{ label: '看看', onClick: () => openIntimacy(data.friend_id) }]
      });
      return;
    }
    if (event.rawType === 'intimacy.level.up') {
      const data = normalizeIntimacyLevelUp(event.data);
      if (!data) {
        return;
      }
      const name = data.friend?.display_name || '好友';
      toast.show({
        id: `intimacy.level:${data.friend_id}`,
        tone: 'success',
        message: `和 ${name} 的友谊升到了「${data.level_name}」`,
        subtitle: `友谊等级 Lv.${data.level}`,
        duration: 6500,
        actions: [{ label: '看看', onClick: () => openIntimacy(data.friend_id) }]
      });
    }
  }), []);
  return null;
}
