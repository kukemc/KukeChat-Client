import type { TeamupProfile, User } from '@/types/api';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { resolveAssetUrl, resolveThumbnailUrl } from '@/utils/assetUrl';
import { CCW_CREATION_URL_PATTERN } from '@/utils/ccwLinks';
import { SKILL_LEVEL_LABEL, skillMeta } from './teamupConstants';

function profileUser(profile: TeamupProfile): User {
  return profile.author ?? { id: profile.user_id, username: `用户 ${profile.user_id}`, nickname: `用户 ${profile.user_id}` };
}

function cleanIntro(intro: string): string {
  return intro
    .replace(CCW_CREATION_URL_PATTERN, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~|-]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function compactCount(value: number): string {
  return value >= 10000 ? `${(value / 10000).toFixed(1)}w` : value >= 1000 ? `${(value / 1000).toFixed(1)}k` : `${value}`;
}

type ShowcaseItem =
  | { kind: 'work'; key: string; cover: string; title: string; likeCount: number; viewCount: number }
  | { kind: 'image'; key: string; cover: string };

function buildShowcase(profile: TeamupProfile): ShowcaseItem[] {
  const items: ShowcaseItem[] = [];
  for (const creation of profile.ccw_creations ?? []) {
    const cover = resolveAssetUrl(creation.cover_url ?? undefined);
    if (cover) {
      items.push({ kind: 'work', key: `w-${creation.oid}`, cover, title: creation.title, likeCount: creation.like_count ?? 0, viewCount: creation.view_count ?? 0 });
    }
  }
  for (const url of profile.image_urls) {
    const cover = resolveThumbnailUrl(url) ?? url;
    if (cover) {
      items.push({ kind: 'image', key: `i-${url}`, cover });
    }
  }
  return items;
}

function ShowcaseTile({ item, extra }: { item: ShowcaseItem; extra?: number }): JSX.Element {
  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-lg border [background:var(--kc-panel-muted)] [border-color:var(--kc-border)]">
      <img src={item.cover} alt="" loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.05]" />
      {item.kind === 'work' ? (
        <>
          <span className="absolute inset-0 [background:linear-gradient(180deg,transparent_40%,rgba(0,0,0,0.66))]" />
          <span className="absolute left-1 top-1 grid h-4 w-4 place-items-center rounded-md bg-black/55 text-white backdrop-blur-sm"><Icon name="sparkles" className="h-2.5 w-2.5" /></span>
          <div className="absolute inset-x-1 bottom-1 space-y-0.5">
            <p className="line-clamp-1 text-[11px] font-bold leading-tight text-white drop-shadow">{item.title}</p>
            <div className="flex items-center gap-2 text-[10px] font-bold text-white/95">
              <span className="inline-flex items-center gap-0.5"><Icon name="heart" className="h-2.5 w-2.5" />{compactCount(item.likeCount)}</span>
              <span className="inline-flex items-center gap-0.5"><Icon name="eye" className="h-2.5 w-2.5" />{compactCount(item.viewCount)}</span>
            </div>
          </div>
        </>
      ) : null}
      {extra && extra > 0 ? <span className="absolute inset-0 grid place-items-center bg-black/60 text-sm font-black text-white backdrop-blur-[1px]">+{extra}</span> : null}
    </div>
  );
}

function ShowcaseStrip({ items }: { items: ShowcaseItem[] }): JSX.Element | null {
  if (items.length === 0) {
    return null;
  }
  const shown = items.slice(0, 3);
  const extra = items.length - shown.length;
  return (
    <div className="mt-3 grid grid-cols-3 gap-1.5">
      {shown.map((item, index) => (
        <ShowcaseTile key={item.key} item={item} extra={index === shown.length - 1 ? extra : 0} />
      ))}
    </div>
  );
}

export function TeamupCard({ profile, onOpen }: { profile: TeamupProfile; onOpen: (profile: TeamupProfile) => void }): JSX.Element {
  const user = profileUser(profile);
  const intro = cleanIntro(profile.intro);
  const creations = profile.ccw_creations ?? [];
  const showcase = buildShowcase(profile);
  const isClosed = profile.status === 'closed';
  const isPending = profile.moderation_status === 'pending';
  const isRejected = profile.moderation_status === 'rejected';

  const statusBadge = isPending
    ? <span className="rounded-full bg-amber-100/95 px-2 py-0.5 text-[11px] font-bold text-amber-700 shadow-sm backdrop-blur-sm">审核中</span>
    : isRejected ? <span className="rounded-full bg-red-100/95 px-2 py-0.5 text-[11px] font-bold text-red-700 shadow-sm backdrop-blur-sm">未通过</span>
    : isClosed ? <span className="rounded-full px-2 py-0.5 text-[11px] font-bold shadow-sm backdrop-blur-sm [background:color-mix(in_srgb,var(--kc-panel-muted)_92%,transparent)] [color:var(--kc-muted)]">已满员</span>
    : <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100/95 px-2 py-0.5 text-[11px] font-bold text-emerald-700 shadow-sm backdrop-blur-sm"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />招募中</span>;

  const cover = profile.background_url ? resolveThumbnailUrl(profile.background_url) ?? profile.background_url : null;

  return (
    <article className="kc-teamup-card-glow kc-teamup-card-frosted group relative flex cursor-pointer flex-col overflow-hidden rounded-[22px]" onClick={() => onOpen(profile)}>
      <span className="absolute right-3 top-3 z-20">{statusBadge}</span>
      {cover ? (
        <div className="relative -mx-px -mt-px h-20 overflow-hidden">
          <img src={cover} alt="" loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
          <span className="absolute inset-0 [background:linear-gradient(180deg,transparent_28%,color-mix(in_srgb,var(--kc-panel)_76%,transparent))]" />
        </div>
      ) : (
        <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-400/60 to-transparent opacity-0 transition group-hover:opacity-100" />
      )}
      <div className={`flex flex-col p-4 ${cover ? '-mt-7' : ''}`}>
      <div className="flex items-center gap-3">
        <span className="relative shrink-0">
          <span className="absolute -inset-0.5 rounded-full bg-gradient-to-br from-sky-400/40 to-indigo-400/30 opacity-0 blur-sm transition group-hover:opacity-100" />
          <span className={`relative block rounded-full ${cover ? 'ring-2 ring-white/70 dark:ring-white/10' : ''}`}><Avatar user={user} size="lg" /></span>
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 pr-16">
            <h3 className="min-w-0 flex-1 truncate text-[15px] font-black [color:var(--kc-text)]">{getDisplayName(user)}</h3>
          </div>
          <div className="mt-1 flex items-center gap-2 text-[11px] font-bold [color:var(--kc-muted)]">
            {profile.is_friend ? <span className="inline-flex items-center gap-1 [color:var(--kc-accent)]"><Icon name="check" className="h-3 w-3" />已是好友</span> : <span className="inline-flex items-center gap-1"><Icon name="users" className="h-3 w-3" />寻找队友中</span>}
          </div>
        </div>
      </div>

      <p className="mt-3 line-clamp-2 text-sm font-bold leading-[1.35rem] [color:var(--kc-text)]">{profile.headline}</p>
      {intro ? <p className="mt-1.5 line-clamp-2 text-xs leading-5 [color:var(--kc-muted)]">{intro}</p> : null}

      {profile.skills.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {profile.skills.slice(0, 4).map((item) => {
            const meta = skillMeta(item.skill);
            return (
              <span key={item.skill} className="kc-teamup-skill-pill inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold [background:var(--kc-panel-muted)] [color:var(--kc-text)]">
                <Icon name={meta.icon} className="h-3 w-3 [color:var(--kc-accent)]" />
                {meta.label}
                <span className="kc-teamup-skill-level opacity-60">{SKILL_LEVEL_LABEL[item.level]}</span>
              </span>
            );
          })}
          {profile.skills.length > 4 ? <span className="kc-teamup-skill-more rounded-lg px-2 py-1 text-[11px] font-bold [background:var(--kc-accent-soft)] [color:var(--kc-accent)]">+{profile.skills.length - 4}</span> : null}
        </div>
      ) : null}

      {profile.looking_for.length > 0 ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px] [color:var(--kc-muted)]">
          <span className="font-bold">想找</span>
          {profile.looking_for.slice(0, 3).map((skill) => {
            const meta = skillMeta(skill);
            return <span key={skill} className="kc-teamup-looking-pill inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-bold [border-color:var(--kc-border)] [color:var(--kc-text)]"><Icon name={meta.icon} className="h-2.5 w-2.5 [color:var(--kc-accent)]" />{meta.label}</span>;
          })}
        </div>
      ) : null}

      <ShowcaseStrip items={showcase} />

      <div className="mt-3 flex items-center gap-3 border-t pt-3 text-xs font-semibold [color:var(--kc-muted)] [border-color:var(--kc-border)]">
        {creations.length > 0 ? <span className="inline-flex items-center gap-1"><Icon name="sparkles" className="h-3.5 w-3.5" />{creations.length} 代表作</span> : null}
        <span className="inline-flex items-center gap-1"><Icon name="eye" className="h-3.5 w-3.5" />{profile.view_count}</span>
        <span className="inline-flex items-center gap-1"><Icon name="message" className="h-3.5 w-3.5" />{profile.comment_count}</span>
        <Icon name="chevron" className="ml-auto h-4 w-4 opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-60" />
      </div>
      </div>
    </article>
  );
}
