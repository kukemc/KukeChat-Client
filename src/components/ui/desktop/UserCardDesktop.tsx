import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { FriendBadgeMark } from '@/components/intimacy/FriendBadgeMark';
import { FriendIntimacyCard } from '@/components/intimacy/FriendIntimacyCard';
import { FriendSparkRow } from '@/components/spark/FriendSparkRow';
import { cx } from '@/components/chat/desktop/runtime';
import { BirthdayToday, useBirthdayFact } from '@/components/birthday/BirthdayBits';
import { isBirthdayToday } from '@/components/birthday/data';
import { SendGiftButton } from '@/components/gifts/GiftEntry';
import { JuryBadge } from '@/components/jury/growth/JuryBadge';
import { UserLevelCard } from '@/components/level/UserLevelCard';
import { ProfileLikeButton } from '@/components/likes/ProfileLikeButton';
import { openBotForUser } from '@/components/bots/openBotForUser';
import { useKukeStore } from '@/store/kukeStore';
import { resolveThumbnailUrl } from '@/utils/assetUrl';
import { openExternalUrl } from '@/utils/openExternalUrl';
import { Avatar } from '../Avatar';
import { Icon } from '../Icon';
import { formatCompactCount, useUserCardData, type UserCardProps } from '../userCardData';
import { useEscapeLayer } from './Modal';

const EDGE = 12;
/** 翻到上面时要让开的高度：消息头像 36px，加上它上下各留的 8px */
const ANCHOR_HEIGHT = 52;

/**
 * 桌面端的资料卡：头像、名字和标签、几行资料、底部一排操作。
 * 贴着 anchor 往下弹，按实际量到的尺寸收进容器里；没给 anchor 就居中。
 * 浮层铺满的就是 anchor 坐标所在的那个容器（调用方把卡片渲染在容器里），所以直接量浮层，用不到 containerRef。
 */
export function UserCardDesktop({ user, anchor, label, action, onClose }: UserCardProps): JSX.Element {
  const openUserSpace = useKukeStore((state) => state.openUserSpace);
  const { name, isBot, online, statusLabel, ccwProfileUrl } = useUserCardData(user, label);
  const cardRef = useRef<HTMLElement>(null);
  const birthday = useBirthdayFact(user);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  useEscapeLayer(onClose);

  // 每次渲染后都重新量一遍：在线状态、CCW 资料到了之后卡片会变高
  useLayoutEffect(() => {
    function place(): void {
      const card = cardRef.current;
      const layer = card?.parentElement;
      if (!card || !layer) {
        return;
      }
      const maxLeft = Math.max(EDGE, layer.clientWidth - card.offsetWidth - EDGE);
      const maxTop = Math.max(EDGE, layer.clientHeight - card.offsetHeight - EDGE);
      const left = Math.round(Math.min(Math.max((anchor?.left ?? layer.clientWidth / 2) - card.offsetWidth / 2, EDGE), maxLeft));
      // anchor 在头像下沿再往下一点。下面放不下就翻到头像上面去，而不是压在头像上
      const below = anchor?.top ?? (layer.clientHeight - card.offsetHeight) / 2;
      const top = Math.round(Math.min(Math.max(below > maxTop && anchor ? below - card.offsetHeight - ANCHOR_HEIGHT : below, EDGE), maxTop));
      setPosition((current) => (current?.left === left && current.top === top ? current : { left, top }));
    }
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  });

  const accent = /^#[0-9a-fA-F]{6}$/.test(user?.profile_accent_color ?? '') ? user?.profile_accent_color : null;
  const ccwAvatarUrl = resolveThumbnailUrl(user?.ccw_avatar_url);
  const showAction = Boolean(user && !isBot && action);

  return (
    <div className="kmd-card-layer" onMouseDown={onClose}>
      <section ref={cardRef} role="dialog" aria-label={`${name} 的资料卡`} className="kmd-card kui-scroll" style={position ? position : { visibility: 'hidden' }} onMouseDown={(event) => event.stopPropagation()}>
        <header className="kmd-card-head">
          <span className="kmd-card-avatar">
            <Avatar user={user} label={name} size="lg" frame />
            <i className={online ? 'is-online' : undefined} />
          </span>
          <div className="kmd-card-id">
            <h3>{name}<FriendBadgeMark userId={user?.id} size={18} openable /></h3>
            {user ? <p>{isBot ? '机器人账号' : user.username ? `@${user.username}` : '未设置用户名'}<span>ID {user.id}</span></p> : null}
            <p className={cx('kmd-card-status', online && 'is-online')}>{statusLabel}</p>
          </div>
          <button type="button" className="kui-icon-btn" aria-label="关闭资料卡" onClick={onClose}><Icon name="close" className="h-4 w-4" /></button>
          {/* 资料点赞：压在头部右下角，和状态那一行齐平。服务端没有这个功能时不出现 */}
          <ProfileLikeButton user={user} className="kmd-card-like" />
        </header>

        {isBot || user?.profile_tagline || user?.profile_status || user?.jury_badge ? (
          <div className="kmd-card-tags">
            {isBot ? <span className="kui-tag kui-tag--accent"><Icon name="bot" className="h-3 w-3" />机器人</span> : null}
            {isBot ? null : <JuryBadge tier={user?.jury_badge} variant="card" />}
            {user?.profile_tagline ? <span className="kui-tag kui-tag--accent" style={accent ? { '--kc-accent': accent } as CSSProperties : undefined}>{user.profile_tagline}</span> : null}
            {user?.profile_status ? <span className="kui-tag">{user.profile_status}</span> : null}
          </div>
        ) : null}

        {/* 账号等级（docs/account-level.md）：等级图标、累计活跃天，下面一行统计（连续天数、名次、注册天数、心意值）；自己的点了进等级页 */}
        <UserLevelCard user={user} charm onNavigate={onClose} />
        {/* 是我的好友的话：我们的友谊等级、亲密度，点开「我们的友谊」（先把资料卡关掉） */}
        {isBot ? null : <FriendIntimacyCard userId={user?.id} className="kit-row--card" onOpen={onClose} />}
        {isBot ? null : <FriendSparkRow userId={user?.id} className="ksk-row--card" onOpen={onClose} />}

        <dl className="kmd-card-rows">
          <div>
            <dt>简介</dt>
            <dd className={user?.bio?.trim() ? undefined : 'is-empty'}>{user?.bio?.trim() || (isBot ? '这个机器人还没有写介绍' : '这个人还没有写简介')}</dd>
          </div>
          {/* 生日：填了就一直显示（对方公开了年份才带年份）；生日当天后面跟一个「今天生日」，底部的送礼按钮也换成「送生日礼物」 */}
          {birthday ? (
            <div data-birthday="fact">
              <dt>生日</dt>
              <dd className="kmd-card-birthday">{birthday}<BirthdayToday user={user} /></dd>
            </div>
          ) : null}
          {ccwProfileUrl ? (
            <div>
              <dt>CCW</dt>
              <dd>
                <button type="button" className="kmd-card-ccw" title="打开 CCW 主页" onClick={() => void openExternalUrl(ccwProfileUrl)}>
                  {ccwAvatarUrl ? <img src={ccwAvatarUrl} alt="" /> : <Icon name="ccw" className="h-4 w-4" />}
                  <span>{user?.ccw_name || 'CCW 账号'}</span>
                  <small>粉丝 {formatCompactCount(user?.ccw_follower_count)} · 获赞 {formatCompactCount(user?.ccw_like_count)}</small>
                  <Icon name="external" className="h-3.5 w-3.5" />
                </button>
              </dd>
            </div>
          ) : null}
        </dl>

        {user && !isBot ? (
          <footer className="kmd-card-actions">
            {showAction && action?.helperText ? <p>{action.helperText}</p> : null}
            <button type="button" className="kui-btn" onClick={() => {
              openUserSpace(user.id);
              onClose();
            }}>个人主页</button>
            {/* 从资料卡送礼物不落聊天消息。礼物功能关着、是自己时不出现 */}
            <SendGiftButton user={user} className="kui-btn" onOpen={onClose}>{isBirthdayToday(user) ? '送生日礼物' : '送礼物'}</SendGiftButton>
            {showAction && action ? <button type="button" className={cx('kui-btn', action.tone !== 'muted' && 'kui-btn--primary')} disabled={action.disabled || !action.onClick} onClick={() => action.onClick?.(user)}>{action.label}</button> : null}
          </footer>
        ) : null}
        {/* 机器人：打开它的机器人详情（介绍、指令、评价、加到群） */}
        {user && isBot ? (
          <footer className="kmd-card-actions">
            <button type="button" className="kui-btn kui-btn--primary" onClick={() => {
              openBotForUser(user.id);
              onClose();
            }}>查看机器人</button>
          </footer>
        ) : null}
      </section>
    </div>
  );
}
