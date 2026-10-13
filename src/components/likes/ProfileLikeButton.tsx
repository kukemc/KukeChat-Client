import { useState } from 'react';
import { cx } from '@/components/chat/desktop/runtime';
import { getDisplayName } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { useThemeStore } from '@/theme/themeStore';
import type { User } from '@/types/api';
import { formatLikeCount, useMyProfileLikes, useProfileLike } from './data';

/**
 * 会「滚」一下的数字：数值变大时旧的往上滑出去、新的从下面滑进来（缩写后的文字没变也滚，表示这一下记上了）。
 * 变小（乐观更新回滚）和第一次出现时直接换。系统设了「减少动态效果」或开了性能优先时不滚，样式里关掉。
 */
export function RollingCount({ value }: { value: number }): JSX.Element {
  const [shown, setShown] = useState<{ value: number; from: string | null }>({ value, from: null });
  if (shown.value !== value) {
    setShown({ value, from: value > shown.value ? formatLikeCount(shown.value) : null });
  }
  const from = shown.value === value ? shown.from : null;
  return (
    <span className="klk-count">
      {from !== null ? <span key={`out-${value}`} className="is-out" aria-hidden="true">{from}</span> : null}
      <span key={`in-${value}`} className={from !== null ? 'is-in' : undefined}>{formatLikeCount(value)}</span>
    </span>
  );
}

interface ProfileLikeButtonProps {
  user: User | null | undefined;
  className?: string;
  /** 说明的小气泡往哪边展开：按钮靠右放时用 end（气泡的右边和按钮对齐），靠左放时用 start */
  align?: 'start' | 'end';
}

/**
 * 给别人的资料点赞的按钮：大拇指 + 赞数。资料卡和个人空间（桌面、移动）共用，外观跟着所在的布局走。
 *
 *   · 可以点：描边的大拇指；
 *   · 今天已经点过：实心、强调色，提示「明天可以再赞」；
 *   · 不能点（自己 / 机器人 / 被禁言 / 到每日上限）：灰掉，提示里写原因。
 *
 * 不能点的时候按钮也接点击（aria-disabled 而不是 disabled）：手机上没有悬停，点一下把原因用小气泡显示出来。
 * 点赞是乐观更新：点下去图标弹一下、数字 +1，失败了退回去，并在小气泡里显示服务端给的说明。
 * 当前连接的服务端没有资料点赞（GET /users/likes/options 是 404）、或者拿不到这个人的赞数时，什么都不画。
 */
export function ProfileLikeButton({ user, className, align = 'end' }: ProfileLikeButtonProps): JSX.Element | null {
  const like = useProfileLike(user);
  const still = useThemeStore((state) => state.performance);
  // 自己点下去的那一下才弹；打开时本来就是「已赞」不弹
  const [pops, setPops] = useState(0);
  if (!user || !like.available) {
    return null;
  }
  const name = getDisplayName(user, '用户');
  const liked = like.status === 'liked';
  const label = like.status === 'idle'
    ? `给 ${name} 点赞，现在 ${like.count} 个赞`
    : `${name} 收到 ${like.count} 个赞。${like.hint}`;

  return (
    <span className={cx('klk', align === 'start' && 'klk--start', still && 'is-still', className)} data-like-user={user.id} data-like-status={like.status}>
      <button
        type="button"
        className={cx('klk-btn', liked && 'is-liked', like.status === 'blocked' && 'is-blocked', like.status === 'loading' && 'is-loading')}
        aria-pressed={liked}
        aria-disabled={like.status !== 'idle'}
        aria-busy={like.status === 'loading' || undefined}
        aria-label={label}
        title={like.hint}
        onClick={() => {
          if (like.status === 'idle') {
            setPops((value) => value + 1);
          }
          like.press();
        }}
      >
        <span key={pops} className={cx('klk-thumb', pops > 0 && liked && 'is-pop')}><Icon name="like" className="klk-icon" /></span>
        <RollingCount value={like.count} />
      </button>
      {like.notice ? <span className="klk-notice" role="status">{like.notice}</span> : null}
    </span>
  );
}

interface MyLikesButtonProps {
  user: User | null | undefined;
  /** 「谁赞了我」是不是正开着 */
  open: boolean;
  /** 名单是就地展开的（自己的资料卡）还是另开一层（对话框 / 页面） */
  popup?: 'inline' | 'dialog';
  /** 就地展开时，名单那一块的 id */
  controls?: string;
  className?: string;
  onPress: () => void;
}

/**
 * 我自己收到的赞：大拇指 + 总赞数，今天收到过赞时右上角带一个红色的「+N」。点它看「谁赞了我」。
 * 自己的资料卡、自己的个人空间（桌面、移动）共用。没有资料点赞时什么都不画。
 */
export function MyLikesButton({ user, open, popup = 'dialog', controls, className, onPress }: MyLikesButtonProps): JSX.Element | null {
  const mine = useMyProfileLikes(user);
  const still = useThemeStore((state) => state.performance);
  if (!user || !mine.available) {
    return null;
  }
  return (
    <button
      type="button"
      className={cx('klk-mine', open && 'is-open', still && 'is-still', className)}
      data-like-mine={mine.total}
      data-like-today={mine.today}
      aria-haspopup={popup === 'dialog' ? 'dialog' : undefined}
      aria-expanded={popup === 'inline' ? open : undefined}
      aria-controls={popup === 'inline' && open ? controls : undefined}
      aria-label={`我收到 ${mine.total} 个赞${mine.today > 0 ? `，今天 +${mine.today}` : ''}。看看谁赞了我`}
      title={open && popup === 'inline' ? '收起' : '看看谁赞了我'}
      onClick={onPress}
    >
      <Icon name="like" className="klk-icon" />
      <RollingCount value={mine.total} />
      {mine.today > 0 ? <span key={mine.today} className="klk-plus" aria-hidden="true">+{formatLikeCount(mine.today)}</span> : null}
    </button>
  );
}
