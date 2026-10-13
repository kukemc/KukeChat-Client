import { useState, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { elementAnchorInContainer } from '@/components/chat/message/chatDom';
import { cx } from '@/components/chat/desktop/runtime';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { UserCard } from '@/components/ui/UserCard';
import type { User } from '@/types/api';
import type { JuryTier } from '@/types/jury';
import { TierTag } from '../widgets/Tags';

interface CardState {
  root: HTMLElement;
  anchor: { left: number; top: number };
}

/**
 * 议事厅里的一个人：圆头像 + 昵称（+ 层级）。点一下弹出资料卡。
 *
 * 议事厅是实名的，和案件里的匿名正相反 —— 所以这里用的是真正的头像，而不是观点区那种方形的代号标记。
 * 资料卡挂到风纪页的最外层（.kjr-root 是定位基准，会把绝对定位的后代圈在里面）。
 */
export function HallPerson({ user, tier, size = 'md', admin = false, nameOnly = false, interactive = true }: {
  /** 列表的整行已经是一个按钮，里面的人只展示、不能点 */
  interactive?: boolean;
  user: User | null;
  tier?: JuryTier | null;
  /** md 帖子作者（40）/ sm 评论（32）/ xs 回复和列表（22） */
  size?: 'md' | 'sm' | 'xs';
  /** 公告的作者是管理员，没有层级 */
  admin?: boolean;
  /** 只要名字，不要头像（「回复 某某」） */
  nameOnly?: boolean;
}): JSX.Element {
  const [card, setCard] = useState<CardState | null>(null);
  const name = getDisplayName(user, '已注销用户');

  function open(event: MouseEvent<HTMLButtonElement>): void {
    // 列表里整行是一个链接，点人不该跟着进帖子
    event.stopPropagation();
    const root = event.currentTarget.closest<HTMLElement>('.kjr-root');
    if (user && root) {
      setCard({ root, anchor: elementAnchorInContainer(event.currentTarget, root, nameOnly ? 0.5 : 0.2) });
    }
  }

  const face = nameOnly ? null : <span className="kjr-hall-face"><Avatar user={user} label={name} size={size === 'md' ? 'md' : 'sm'} /></span>;
  if (!interactive) {
    return <span className={cx('kjr-hall-person', `is-${size}`)}>{face}<b>{name}</b></span>;
  }
  return (
    <>
      <button type="button" className={cx('kjr-hall-person', `is-${size}`, nameOnly && 'is-name')} disabled={!user} title={user ? `查看 ${name} 的资料` : undefined} onClick={open}>
        {face}
        <b>{name}</b>
      </button>
      {/* author_tier 是作者此刻的层级：明确给了 null（不是没传）说明他现在不在任 */}
      {admin ? <span className="kui-tag kui-tag--accent">管理员</span> : tier === null && user ? <span className="kui-tag" data-tier="none" title="发言时是在任委员，现在不在任">不在任</span> : <TierTag tier={tier} />}
      {card ? createPortal(<UserCard user={user} label={name} anchor={card.anchor} onClose={() => setCard(null)} />, card.root) : null}
    </>
  );
}
