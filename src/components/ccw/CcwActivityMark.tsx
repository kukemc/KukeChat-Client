import { Icon } from '@/components/ui/Icon';
import { ccwActivityElapsed, ccwActivityLabel, useCcwActivity } from '@/store/ccwActivityStore';

/**
 * 名字旁的小手柄：这个人此刻正在共创世界上玩 / 创作（docs/ccw-social.md）。悬停看是哪个作品、玩了多久。
 *
 * 和 FriendBadgeMark 一样只给用户 id：没在玩、或服务端没有这个功能时什么也不画，名字旁边哪儿都能放。
 */
export function CcwActivityMark({ userId, size = 14, className }: { userId: number | null | undefined; size?: number; className?: string }): JSX.Element | null {
  const activity = useCcwActivity(userId);
  if (!activity) {
    return null;
  }
  return (
    <span className={`kccw-mark${className ? ` ${className}` : ''}`} style={{ width: size, height: size }} title={`${ccwActivityLabel(activity)} · ${ccwActivityElapsed(activity)}`} aria-label={ccwActivityLabel(activity)}>
      <Icon name="gamepad" className="h-full w-full" />
    </span>
  );
}
