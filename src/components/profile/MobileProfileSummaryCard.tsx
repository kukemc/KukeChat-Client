import type { PostStats, User } from '@/types/api';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';

type ProfileCardStyle = NonNullable<User['profile_card_style']>;

interface MobileProfileSummaryCardProps {
  user?: User | null;
  name?: string;
  label?: string;
  handle?: string;
  userId?: number;
  bio?: string;
  statusLabel: string;
  online?: boolean;
  stats: PostStats;
  profileCardStyle?: User['profile_card_style'] | '';
  isBot?: boolean;
  profileTagline?: string;
  profileStatus?: string;
  email?: string | null;
  className?: string;
}

function normalizeProfileCardStyle(value: User['profile_card_style'] | ''): ProfileCardStyle {
  return value === 'glass' || value === 'solid' || value === 'soft' ? value : 'soft';
}

function displayHandle(user: User | null | undefined, handle: string | undefined, userId: number | undefined): string {
  if (handle) {
    return handle;
  }
  if (user?.username) {
    return `@${user.username}`;
  }
  return userId ? `用户 ${userId}` : '用户';
}

export function MobileProfileSummaryCard({ user, name, label, handle, userId, bio, statusLabel, online = false, stats, profileCardStyle, isBot = false, profileTagline, profileStatus, email, className = '' }: MobileProfileSummaryCardProps): JSX.Element {
  const cardStyle = normalizeProfileCardStyle(profileCardStyle ?? '');
  const resolvedName = name || getDisplayName(user, label || '用户');
  const resolvedUserId = userId ?? user?.id;
  const resolvedHandle = displayHandle(user, handle, resolvedUserId);
  const resolvedBio = bio?.trim() || '这个人还没有写简介';

  return (
    <section className={`kc-mobile-profile-summary-card w-full overflow-hidden rounded-[28px] p-4 text-left ${className}`} data-card-style={cardStyle}>
      <div className="flex items-start gap-3">
        <Avatar user={user} label={label || resolvedName} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <span className="min-w-0">
              <h2 className="kc-mobile-profile-summary-title truncate text-[22px] font-black leading-tight">{resolvedName}</h2>
              <p className="kc-mobile-profile-summary-muted mt-1 truncate text-[12px] font-bold">
                {isBot ? '机器人账号' : resolvedHandle}{resolvedUserId ? <span className="ml-2 font-mono text-[11px] opacity-75">ID {resolvedUserId}</span> : null}
              </p>
            </span>
            <span className="kc-mobile-profile-summary-status inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold">
              <span className={`kc-online-dot ${online ? 'kc-online-dot-on' : 'kc-online-dot-off'}`} />{statusLabel}
            </span>
          </div>
          <p className="kc-mobile-profile-summary-bio mt-1 line-clamp-1 select-text text-[12px] font-medium leading-5">{resolvedBio}</p>
        </div>
      </div>
      {(isBot || profileTagline || profileStatus) ? (
        <div className="mt-2 flex flex-wrap gap-2 pl-[52px]">
          {isBot ? <p className="inline-flex max-w-full items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-black text-white backdrop-blur [background:rgba(22,139,255,0.72)]"><Icon name="bot" className="h-3.5 w-3.5" />机器人</p> : null}
          {profileTagline ? <p className="kc-mobile-profile-summary-badge inline-flex max-w-full rounded-full px-3 py-1.5 text-[12px] font-bold"><span className="truncate">{profileTagline}</span></p> : null}
          {profileStatus ? <p className="kc-mobile-profile-summary-soft-badge inline-flex max-w-full rounded-full px-3 py-1.5 text-[12px] font-bold"><span className="truncate">{profileStatus}</span></p> : null}
        </div>
      ) : null}
      <div className="mt-4 grid grid-cols-3 gap-1.5 text-center text-[11px] font-bold">
        <span className="kc-mobile-profile-summary-metric rounded-[16px] px-2 py-2"><Icon name="feed" className="mx-auto mb-0.5 h-4 w-4 opacity-70" /><span className="block text-[18px] font-black leading-none">{stats.post_count}</span><span className="mt-1 block opacity-70">动态</span></span>
        <span className="kc-mobile-profile-summary-metric rounded-[16px] px-2 py-2"><Icon name="like" className="mx-auto mb-0.5 h-4 w-4 opacity-70" /><span className="block text-[18px] font-black leading-none">{stats.like_count}</span><span className="mt-1 block opacity-70">获赞</span></span>
        <span className="kc-mobile-profile-summary-metric rounded-[16px] px-2 py-2"><Icon name="message" className="mx-auto mb-0.5 h-4 w-4 opacity-70" /><span className="block text-[18px] font-black leading-none">{stats.comment_count}</span><span className="mt-1 block opacity-70">评论</span></span>
      </div>
      {email ? <p className="kc-mobile-profile-summary-muted px-1 pt-3 text-[12px]">邮箱：{email}</p> : null}
    </section>
  );
}
