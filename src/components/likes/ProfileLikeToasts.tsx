import { useEffect } from 'react';
import { normalizeProfileLikedEvent } from '@/api/profileLikes';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { toast } from '@/components/ui/toast';
import { subscribeRealtimeEvents } from '@/realtime/events';
import { formatLikeCount } from './data';

/**
 * 有人赞了我的资料（实时事件 user.profile.liked，只发给本人）时的一条小提示：「某某 赞了你」+ 今天的 +N。
 * 挂在主界面上，停在哪个页面都会出现；几秒后自己收起。
 *
 * 走统一的提示组件（头像是 leading 插槽，不点、不抢焦点，不挡着人操作）。
 * 想看是谁，去自己的资料卡 / 个人主页上点赞数。事件连着来时只留最后一条。
 * 缓存的刷新（各处的赞数跟着变）在 data.ts 的 handleProfileLikeEvent。
 */
export function ProfileLikeToasts(): null {
  useEffect(() => subscribeRealtimeEvents((event) => {
    if (event.rawType !== 'user.profile.liked') {
      return;
    }
    const data = normalizeProfileLikedEvent(event.data);
    if (!data) {
      return;
    }
    const name = data.from_user ? getDisplayName(data.from_user, '有人') : '有人';
    const today = data.today_count;
    toast.show({
      // 连着来只留最后一条
      id: 'user.profile.liked',
      tone: 'info',
      message: `${name} 赞了你`,
      subtitle: today > 0 ? `今天 +${formatLikeCount(today)}` : undefined,
      leading: data.from_user
        ? <Avatar user={data.from_user} label={name} size="sm" />
        : <span className="klk-toast-mark"><Icon name="like" className="h-3.5 w-3.5" /></span>
    });
  }), []);

  return null;
}
