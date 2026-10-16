import type { KeyboardEvent, MouseEvent } from 'react';
import { cx } from '@/components/chat/desktop/runtime';
import type { BadgeRef } from '@/types/intimacy';
import { BadgeGlyph } from './BadgeGlyph';
import { openIntimacy, useFriendBond } from './data';

/** 鼠标停在徽章上时的说明。 */
export function badgeTitle(badge: BadgeRef, friendName?: string): string {
  const head = friendName ? `和 ${friendName} 的好友徽章` : '好友徽章';
  return badge.series_name && badge.series_name !== badge.name ? `${head}：${badge.name}（${badge.series_name}）` : `${head}：${badge.name}`;
}

/**
 * 好友名字旁的那枚徽章（docs/intimacy.md 3.4：挂哪一枚是我自己选的，默认自动挂最好的那枚）。
 *
 * 只给用户 id 就行：不是好友、没解锁过徽章、选了不挂、服务端没有这个功能，都什么也不画 —— 所以昵称旁边哪儿都能放
 * （联系人、会话列表、聊天标题、群里的发言人），不用先判断是不是好友。数据来自好友亲密榜那一份缓存，不另外请求。
 *
 * openable：点一下打开「我们的友谊」。放在本身就是按钮的行里（联系人列表的一项）时不要开，免得一点两个动作。
 */
export function FriendBadgeMark({ userId, size = 16, openable = false, className }: { userId: number | null | undefined; size?: number; openable?: boolean; className?: string }): JSX.Element | null {
  const bond = useFriendBond(userId);
  const badge = bond?.badge;
  if (!bond || !badge) {
    return null;
  }
  const title = badgeTitle(badge);
  if (!openable) {
    return <span className={cx('kit-mark', className)} title={title} data-friend-badge={badge.series}><BadgeGlyph icon={badge.icon} tier={badge.tier} size={size} /></span>;
  }
  const open = (event: MouseEvent | KeyboardEvent): void => {
    event.stopPropagation();
    event.preventDefault();
    openIntimacy(bond.friend.id);
  };
  return (
    <span
      role="button"
      tabIndex={0}
      className={cx('kit-mark is-openable', className)}
      title={`${title} · 点开看看`}
      data-friend-badge={badge.series}
      onClick={open}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          open(event);
        }
      }}
    >
      <BadgeGlyph icon={badge.icon} tier={badge.tier} size={size} />
    </span>
  );
}
