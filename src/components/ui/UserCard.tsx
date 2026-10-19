import { useEffect, useMemo, useState } from 'react';
import { useKukeStore } from '@/store/kukeStore';
import { openBotForUser } from '@/components/bots/openBotForUser';
import type { CSSProperties } from 'react';
import { Avatar } from './Avatar';
import { Icon } from './Icon';
import { BirthdayToday, useBirthdayFact } from '@/components/birthday/BirthdayBits';
import { isBirthdayToday } from '@/components/birthday/data';
import { SendGiftButton } from '@/components/gifts/GiftEntry';
import { GiftGlyph } from '@/components/gifts/GiftGlyph';
import { UserLevelCard } from '@/components/level/UserLevelCard';
import { ProfileLikeButton } from '@/components/likes/ProfileLikeButton';
import { useIsDesktopLayout } from './desktop/Modal';
import { UserCardDesktop } from './desktop/UserCardDesktop';
import { formatCompactCount, useUserCardData, type UserCardProps } from './userCardData';
import { resolveAssetUrl, resolveThumbnailUrl } from '@/utils/assetUrl';
import { openExternalUrl } from '@/utils/openExternalUrl';

/** 点头像弹出的资料卡。 */
export function UserCard(props: UserCardProps): JSX.Element | null {
  const desktop = useIsDesktopLayout();
  if (!props.user && !props.label) {
    return null;
  }
  return desktop ? <UserCardDesktop {...props} /> : <MobileUserCard {...props} />;
}

/** 手机布局下的资料卡（外观由 kc-mobile-user-card 的样式接管）。 */
function MobileUserCard({ user, anchor, containerRef, label, action, onClose }: UserCardProps): JSX.Element {
  const openUserSpace = useKukeStore((state) => state.openUserSpace);
  const [viewportSize, setViewportSize] = useState(() => ({
    width: typeof window === 'undefined' ? 320 : window.innerWidth,
    height: typeof window === 'undefined' ? 480 : window.innerHeight
  }));
  const { name, isBot, online, statusLabel, ccwProfileUrl } = useUserCardData(user, label);
  const accent = /^#[0-9a-fA-F]{6}$/.test(user?.profile_accent_color ?? '') ? user?.profile_accent_color ?? '#168bff' : '#168bff';
  const coverUrl = user?.profile_cover_url ? resolveAssetUrl(user.profile_cover_url) : null;
  const coverBackground = coverUrl ? `linear-gradient(135deg,rgba(6,10,20,.36),rgba(6,10,20,.08)),url(${coverUrl}) center/cover` : `radial-gradient(circle at 15% 20%,rgba(255,255,255,.34),transparent 30%),radial-gradient(circle at 82% 12%,rgba(255,255,255,.22),transparent 24%),linear-gradient(135deg,${accent} 0%,#7c8cff 48%,#ff7eb3 100%)`;
  const actionTone = action?.tone ?? 'primary';
  const birthday = useBirthdayFact(user);
  const actionClassName = actionTone === 'muted'
    ? 'mt-4 w-full rounded-2xl px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-80 [background:var(--kc-panel-muted)] [color:var(--kc-muted)]'
    : 'mt-4 w-full rounded-2xl px-3 py-2 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60 [background:var(--kc-accent)] hover:opacity-90';

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }
    const updateViewportSize = (): void => {
      setViewportSize({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', updateViewportSize);
    return () => window.removeEventListener('resize', updateViewportSize);
  }, []);

  const style = useMemo<CSSProperties>(() => {
    const fallbackWidth = viewportSize.width;
    const fallbackHeight = viewportSize.height;
    const cardWidth = Math.min(300, Math.max(260, (containerRef?.current?.getBoundingClientRect().width ?? fallbackWidth) - 24));
    const cardHeightEstimate = (action && !isBot ? 340 : 300) + (user?.ccw_student_oid ? 86 : 0);
    const gap = 8;
    const padding = 12;
    const rect = containerRef?.current?.getBoundingClientRect();
    const width = rect?.width ?? fallbackWidth;
    const height = rect?.height ?? fallbackHeight;
    const anchorX = Math.min(Math.max(anchor?.left ?? width / 2, padding), width - padding);
    const anchorY = Math.min(Math.max(anchor?.top ?? height / 2, padding), height - padding);
    const maxLeft = Math.max(padding, width - cardWidth - padding);
    const left = Math.min(Math.max(anchorX - cardWidth / 2, padding), maxLeft);
    const spaceBelow = height - anchorY - padding;
    const topCandidate = spaceBelow >= cardHeightEstimate ? anchorY : anchorY - cardHeightEstimate - gap;
    const maxTop = Math.max(padding, height - cardHeightEstimate - padding);
    const top = Math.min(Math.max(topCandidate, padding), maxTop);

    return { left, top, width: cardWidth, maxHeight: Math.max(220, height - padding * 2) };
  }, [action, anchor?.left, anchor?.top, containerRef, isBot, user?.ccw_student_oid, viewportSize.height, viewportSize.width]);

  return (
    <div className="absolute inset-0 z-50" onMouseDown={onClose}>
      <section onMouseDown={(event) => event.stopPropagation()} style={style} className="kc-mobile-user-card absolute max-w-[calc(100%-24px)] overflow-hidden rounded-[28px] border shadow-float [background:var(--kc-panel)] [border-color:var(--kc-border)] [color:var(--kc-text)]">
        <div className="scroll-soft max-h-[inherit] overflow-y-auto">
        <div className="relative h-20" style={{ background: coverBackground }}>
          <div className="absolute inset-0 [background:linear-gradient(to_top,rgba(0,0,0,0.18),transparent_72%)]" />
          <button type="button" onClick={onClose} className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full text-white backdrop-blur [background:rgba(255,255,255,0.18)] hover:[background:rgba(255,255,255,0.26)]" aria-label="关闭资料卡">
              <Icon name="close" className="h-4 w-4" />
            </button>
        </div>
        <div className="px-4 pb-4">
          <div className="-mt-8 flex items-start justify-between gap-3">
            <div className="relative z-10 shrink-0 rounded-full p-1 [background:var(--kc-panel)] shadow-[0_10px_24px_rgba(15,23,42,0.18)]">
              <Avatar user={user} label={name} size="lg" frame />
            </div>
            <div className="mt-10 flex min-w-0 max-w-[170px] items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold shadow-sm [background:var(--kc-panel)] [color:var(--kc-muted)]">
              <span className={`kc-online-dot ${online ? 'kc-online-dot-on' : 'kc-online-dot-off'}`} />
              <span className="truncate">{statusLabel}</span>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <h3 className="min-w-0 flex-1 truncate text-lg font-black leading-tight">{name}</h3>
            {/* 资料点赞：服务端没有这个功能时不出现，名字照旧占满一行 */}
            <ProfileLikeButton user={user} />
          </div>
          {user ? (
            <p className="mt-0.5 truncate text-xs [color:var(--kc-muted)]">
              {isBot ? '机器人账号' : user.username ? `@${user.username}` : '未设置用户名'}
              <span className="ml-2 font-mono text-[10px] opacity-75">ID {user.id}</span>
            </p>
          ) : null}
          {isBot ? <p className="mt-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-black text-white [background:#168bff]"><Icon name="bot" className="h-3.5 w-3.5" />机器人</p> : null}
          <div className="mt-3 flex flex-wrap gap-2 text-xs [color:var(--kc-muted)]">
            {user?.profile_tagline ? <p className="inline-flex max-w-full rounded-full px-2.5 py-1 font-bold text-white" style={{ background: accent }}><span className="truncate">{user.profile_tagline}</span></p> : null}
            {user?.profile_status ? <p className="inline-flex max-w-full rounded-full px-2.5 py-1 font-semibold [background:var(--kc-panel-muted)] [color:var(--kc-text)]"><span className="truncate">{user.profile_status}</span></p> : null}
            {/* 简介和生日放在同一块淡底里：生日填了就一直显示（对方公开了年份才带年份），生日当天后面跟一个「今天生日」 */}
            <div className="w-full rounded-2xl px-3 py-2 leading-5 [background:var(--kc-panel-muted)]">
              <p className="line-clamp-3">{user?.bio?.trim() || (isBot ? '这个机器人还没有写介绍' : '这个人还没有写简介')}</p>
              {birthday ? <p className="kbd-card-fact" data-birthday="fact"><span className="kbd-card-fact-label">生日</span><span className="[color:var(--kc-text)]">{birthday}</span><BirthdayToday user={user} /></p> : null}
            </div>
          </div>
          {/* 等级和下面一行统计（连续天数、名次、注册天数、心意值） */}
          <UserLevelCard user={user} charm className="klv-user--pill mt-2" onNavigate={onClose} />
          {ccwProfileUrl ? (
            <button type="button" onClick={() => void openExternalUrl(ccwProfileUrl)} className="mt-3 grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-2xl border px-3 py-2 text-left transition [background:linear-gradient(135deg,color-mix(in_srgb,var(--kc-accent)_10%,transparent),var(--kc-panel-muted))] [border-color:color-mix(in_srgb,var(--kc-accent)_28%,var(--kc-border))] hover:-translate-y-0.5">
              {resolveThumbnailUrl(user?.ccw_avatar_url) ? <img src={resolveThumbnailUrl(user?.ccw_avatar_url)} alt={user?.ccw_name ?? 'CCW'} className="h-8 w-8 rounded-xl object-cover" /> : <span className="grid h-8 w-8 place-items-center rounded-xl text-white [background:var(--kc-accent)]"><Icon name="ccw" className="h-4 w-4" /></span>}
              <span className="min-w-0"><span className="block truncate text-xs font-black [color:var(--kc-text)]">{user?.ccw_name || 'CCW 账号'}</span><span className="mt-0.5 block truncate text-[11px] [color:var(--kc-muted)]">粉丝 {formatCompactCount(user?.ccw_follower_count)} · 获赞 {formatCompactCount(user?.ccw_like_count)}</span></span>
              <Icon name="external" className="h-4 w-4 [color:var(--kc-accent)]" />
            </button>
          ) : null}
          {user && !isBot ? <button type="button" onClick={() => { openUserSpace(user.id); onClose(); }} className="mt-3 w-full rounded-2xl px-3 py-2 text-sm font-semibold transition [background:var(--kc-panel-muted)] [color:var(--kc-text)] hover:[background:var(--kc-hover)]">进入个人主页</button> : null}
          {user && isBot ? <button type="button" onClick={() => { openBotForUser(user.id); onClose(); }} className="mt-3 w-full rounded-2xl px-3 py-2 text-sm font-semibold transition [background:var(--kc-panel-muted)] [color:var(--kc-text)] hover:[background:var(--kc-hover)]">查看机器人</button> : null}
          {/* 从资料卡送礼物不落聊天消息。礼物功能关着、是自己时不出现 */}
          <SendGiftButton user={user} className="kgf-send--block mt-2" onOpen={onClose}>{isBirthdayToday(user) ? <><GiftGlyph icon="gift" size={16} />送生日礼物</> : undefined}</SendGiftButton>
          {user && !isBot && action ? (
            <>
              {action.helperText ? <p className="mt-3 text-center text-[11px] leading-5 [color:var(--kc-muted)]">{action.helperText}</p> : null}
              <button type="button" disabled={action.disabled || !action.onClick} onClick={() => action.onClick?.(user)} className={actionClassName}>
                {action.label}
              </button>
            </>
          ) : null}
        </div>
        </div>
      </section>
    </div>
  );
}
