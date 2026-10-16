import { cx } from '@/components/chat/desktop/runtime';
import { SendGiftButton } from '@/components/gifts/GiftEntry';
import { getDisplayName } from '@/components/ui/Avatar';
import type { User } from '@/types/api';
import { CakeMark } from './BirthdayScene';
import { birthdayText, isBirthdayToday } from './data';

/**
 * 生日在各处露面的几个小部件（类名前缀 kbd-，样式在 birthday.css）。聊天消息行里不放任何生日标识。
 * 「今天是不是生日」以服务端给的 user.is_birthday_today 为准；旧后端没有这个字段，这些部件什么都不画。
 */

/**
 * 「今天生日」：一个小蛋糕 + 字，放在资料卡、个人空间头部的名字旁边。gift 为 true 时后面跟一个送礼入口
 * （礼物功能关着、是自己的时候那个入口自己不出现）。不是今天生日什么都不画。
 */
export function BirthdayToday({ user, gift = false, className, onGiftOpen }: { user: User | null | undefined; gift?: boolean; className?: string; /** 打开送礼面板之前要做的事（关掉资料卡） */ onGiftOpen?: () => void }): JSX.Element | null {
  if (!user || !isBirthdayToday(user)) {
    return null;
  }
  return (
    <span className={cx('kbd-today', className)} data-birthday-today={user.id}>
      <span className="kbd-today-tag"><CakeMark size={14} />今天生日</span>
      {gift ? <SendGiftButton user={user} className="kbd-today-gift" onOpen={onGiftOpen}>送礼物</SendGiftButton> : null}
    </span>
  );
}

/** 列表里名字后面的小蛋糕（好友列表）。只是一个标识，不改列表的顺序。 */
export function BirthdayMark({ user, className }: { user: User | null | undefined; className?: string }): JSX.Element | null {
  if (!user || !isBirthdayToday(user)) {
    return null;
  }
  return <CakeMark size={14} className={cx('kbd-mark', className)} title="今天生日" />;
}

/** 资料里的「生日」一行要写的字：「5 月 7 日」（对方公开了年份才带年份）；没填是 null，那一行就不出现。 */
export function useBirthdayFact(user: User | null | undefined): string | null {
  return user && !user.is_bot ? birthdayText(user) || null : null;
}

/**
 * 好友列表顶上的一条：「今天是 阿夸 的生日」，旁边是送礼入口（点名字去 Ta 的主页）。同一天有好几位就各一条，最多三条。
 * 没有人今天生日时什么都不画。
 */
export function FriendBirthdayBanner({ users, variant, onOpenUser }: { users: Array<User | null | undefined>; variant: 'desktop' | 'mobile'; onOpenUser?: (user: User) => void }): JSX.Element | null {
  const today = users.filter((user): user is User => Boolean(user) && isBirthdayToday(user));
  if (today.length === 0) {
    return null;
  }
  return (
    <div className={cx('kbd-banner', `kbd-banner--${variant}`)} data-birthday="friends-banner">
      {today.slice(0, 3).map((user) => (
        <div key={user.id} className="kbd-banner-row" data-user={user.id}>
          <CakeMark size={18} />
          <span className="kbd-banner-text">今天是 {onOpenUser ? <button type="button" className="kbd-banner-name" onClick={() => onOpenUser(user)}>{getDisplayName(user, `用户 ${user.id}`)}</button> : <b className="kbd-banner-name">{getDisplayName(user, `用户 ${user.id}`)}</b>} 的生日</span>
          <SendGiftButton user={user} className="kbd-banner-gift">送礼物</SendGiftButton>
        </div>
      ))}
      {today.length > 3 ? <p className="kbd-banner-more">还有 {today.length - 3} 位好友今天也过生日</p> : null}
    </div>
  );
}
