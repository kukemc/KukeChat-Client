import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { normalizeProfileLikedEvent } from '@/api/profileLikes';
import { cx } from '@/components/chat/desktop/runtime';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { getDesktopPortalRoot } from '@/components/ui/desktop/Modal';
import { subscribeRealtimeEvents } from '@/realtime/events';
import { useKukeStore } from '@/store/kukeStore';
import { useThemeStore } from '@/theme/themeStore';
import type { User } from '@/types/api';
import { formatLikeCount } from './data';

interface LikeHint {
  id: number;
  from: User | null;
  today: number;
}

const LIFETIME_MS = 3200;

/**
 * 有人赞了我的资料（实时事件 user.profile.liked，只发给本人）时的一条小提示：「某某 赞了你」+ 今天的 +N。
 * 挂在主界面上，停在哪个页面都会出现；窗口上沿落下来一小条，三秒多自己收起。
 *
 * 它不接鼠标、不抢焦点：这种事可能很频繁（服务端已经把 3 秒内的合并成一条），不能挡着人操作。
 * 想看是谁，去自己的资料卡 / 个人主页上点赞数。事件连着来时只留最后一条。
 * 缓存的刷新（各处的赞数跟着变）在 data.ts 的 handleProfileLikeEvent，这里只管提示。
 */
export function ProfileLikeToasts(): JSX.Element | null {
  const isMobile = useKukeStore((state) => state.layoutMode === 'mobile');
  const still = useThemeStore((state) => state.performance);
  const [hint, setHint] = useState<LikeHint | null>(null);
  const nextId = useRef(1);

  useEffect(() => subscribeRealtimeEvents((event) => {
    if (event.rawType !== 'user.profile.liked') {
      return;
    }
    const data = normalizeProfileLikedEvent(event.data);
    if (data) {
      setHint({ id: nextId.current++, from: data.from_user, today: data.today_count });
    }
  }), []);

  useEffect(() => {
    if (!hint) {
      return undefined;
    }
    const timer = window.setTimeout(() => setHint((current) => (current?.id === hint.id ? null : current)), LIFETIME_MS);
    return () => window.clearTimeout(timer);
  }, [hint]);

  if (!hint) {
    return null;
  }
  const name = hint.from ? getDisplayName(hint.from, '有人') : '有人';
  const node = (
    <div className={cx('klk-toast-layer', isMobile && 'is-mobile')} aria-live="polite">
      <div key={hint.id} className={cx('klk-toast', still && 'is-still')} role="status" data-like-toast={hint.today}>
        {hint.from ? <Avatar user={hint.from} label={name} size="sm" /> : <span className="klk-toast-mark"><Icon name="like" className="h-3.5 w-3.5" /></span>}
        <span className="klk-toast-text"><b>{name}</b> 赞了你</span>
        {hint.today > 0 ? <span className="klk-toast-plus"><Icon name="like" className="h-3 w-3" />今天 +{formatLikeCount(hint.today)}</span> : null}
      </div>
    </div>
  );
  // 移动布局下各个二级页面是挂到窗口根上的全屏层，提示也得挂过去才不会被它们盖住
  return isMobile ? createPortal(node, getDesktopPortalRoot()) : node;
}
