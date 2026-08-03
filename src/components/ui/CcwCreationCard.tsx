import type { MouseEvent } from 'react';
import { ccwWorkDetailUrl } from '@/config';
import { Icon } from '@/components/ui/Icon';
import type { CcwCreationPreview } from '@/types/api';
import { resolveAssetUrl } from '@/utils/assetUrl';
import { openExternalUrl } from '@/utils/openExternalUrl';

function compactNumber(value?: number | null): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '0';
  }
  if (value >= 10000) {
    return `${(value / 10000).toFixed(value >= 100000 ? 0 : 1)}万`;
  }
  return String(value);
}

function previewSummary(value?: string | null): string | null {
  const summary = value
    ?.replace(/^\s{0,3}#{1,6}\s*/gm, '')
    .replace(/[*_`~>\-[\]]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return summary || null;
}

function StatItem({ icon, label, value }: { icon: 'eye' | 'like' | 'message'; label: string; value?: number | null }): JSX.Element {
  return (
    <span className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 font-semibold [color:var(--kc-muted)]">
      <Icon name={icon} className="h-3 w-3 opacity-70" />
      <span>{label}</span>
      <span className="tabular-nums [color:var(--kc-text)]">{compactNumber(value)}</span>
    </span>
  );
}

export function CcwCreationCard({ oid, accessKey = '', preview, compact = false }: { oid: string; accessKey?: string; preview?: CcwCreationPreview; compact?: boolean }): JSX.Element | null {
  const fallbackUrl = ccwWorkDetailUrl(oid, accessKey);

  if (!preview) {
    return null;
  }

  const coverUrl = resolveAssetUrl(preview?.cover_url ?? undefined);
  const authorAvatar = resolveAssetUrl(preview?.author_avatar_url ?? undefined);
  const href = preview?.url ?? fallbackUrl;
  const description = previewSummary(preview.description);

  function openCard(event: MouseEvent<HTMLAnchorElement>): void {
    event.preventDefault();
    event.stopPropagation();
    void openExternalUrl(href);
  }

  if (compact) {
    return (
      <a href={href} target="_blank" rel="noreferrer" onClick={openCard} className="group mt-2 block w-full min-w-0 overflow-hidden rounded-[20px] border text-left shadow-[0_8px_22px_rgba(15,23,42,0.08)] transition duration-200 [background:color-mix(in_srgb,var(--kc-panel)_96%,white_4%)] [border-color:color-mix(in_srgb,var(--kc-border)_70%,transparent)]">
        <div className="relative aspect-video w-full overflow-hidden rounded-t-[19px] bg-slate-950">
          {coverUrl ? <img src={coverUrl} alt={preview.title} className="h-full w-full object-contain" loading="lazy" /> : <div className="grid h-full w-full place-items-center [color:var(--kc-muted)]"><Icon name="image" className="h-6 w-6" /></div>}
          <span className="absolute left-2.5 top-2.5 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-black tracking-wide text-white shadow-sm">CCW</span>
          <span className="absolute right-2.5 top-2.5 grid h-7 w-7 place-items-center rounded-full bg-white/88 text-slate-500 shadow-sm transition group-hover:text-sky-500">
            <Icon name="share" className="h-3.5 w-3.5" />
          </span>
        </div>
        <div className="min-w-0 p-3">
          <h3 className="line-clamp-1 text-[15px] font-black leading-5 [color:var(--kc-text)]">{preview.title}</h3>
          {description ? <p className="mt-1 line-clamp-2 text-xs leading-[18px] [color:var(--kc-muted)]">{description}</p> : null}
          <div className="mt-2 flex min-w-0 items-center gap-2 text-xs [color:var(--kc-muted)]">
            {authorAvatar ? <img src={authorAvatar} alt={preview.author_name} className="h-5 w-5 shrink-0 rounded-full object-cover" loading="lazy" /> : <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full [background:var(--kc-accent-soft)] [color:var(--kc-accent)]">{preview.author_name.slice(0, 1)}</span>}
            <span className="min-w-0 truncate font-bold [color:var(--kc-text)]">{preview.author_name}</span>
            {preview.version ? <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold [background:var(--kc-panel-muted)] [color:var(--kc-muted)]">v{preview.version}</span> : null}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
            <StatItem icon="eye" label="浏览" value={preview.view_count} />
            <StatItem icon="like" label="点赞" value={preview.like_count} />
            <StatItem icon="message" label="评论" value={preview.comment_count} />
          </div>
        </div>
      </a>
    );
  }

  return (
    <a href={href} target="_blank" rel="noreferrer" onClick={openCard} className={`group mt-2 block overflow-hidden rounded-[22px] border text-left shadow-[0_8px_24px_rgba(15,23,42,0.07)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_34px_rgba(15,23,42,0.12)] [background:color-mix(in_srgb,var(--kc-panel)_94%,white_6%)] [border-color:color-mix(in_srgb,var(--kc-border)_70%,transparent)] ${compact ? 'w-full max-w-[520px]' : 'max-w-[520px]'}`}>
      <div className="flex min-w-0 gap-3 p-3.5">
        <div className="relative aspect-video w-[156px] shrink-0 overflow-hidden rounded-[18px] bg-slate-950 sm:w-[176px]">
          {coverUrl ? <img src={coverUrl} alt={preview.title} className="h-full w-full object-contain" loading="lazy" /> : <div className="grid h-full w-full place-items-center [color:var(--kc-muted)]"><Icon name="image" className="h-6 w-6" /></div>}
          <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-black tracking-wide text-white shadow-sm">CCW</span>
        </div>
        <div className="min-w-0 flex-1 py-0.5">
          <div className="flex min-w-0 items-start gap-2">
            <div className="min-w-0 flex-1">
              <h3 className="line-clamp-1 text-[15px] font-black leading-5 [color:var(--kc-text)]">{preview.title}</h3>
              {description ? <p className="mt-1 line-clamp-2 text-xs leading-[18px] [color:var(--kc-muted)]">{description}</p> : null}
            </div>
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full transition [color:var(--kc-muted)] [background:var(--kc-panel-muted)] group-hover:[color:var(--kc-accent)] group-hover:[background:var(--kc-accent-soft)]">
              <Icon name="share" className="h-3.5 w-3.5" />
            </span>
          </div>
          <div className="mt-2 flex min-w-0 items-center gap-2 text-xs [color:var(--kc-muted)]">
            {authorAvatar ? <img src={authorAvatar} alt={preview.author_name} className="h-5 w-5 shrink-0 rounded-full object-cover" loading="lazy" /> : <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full [background:var(--kc-accent-soft)] [color:var(--kc-accent)]">{preview.author_name.slice(0, 1)}</span>}
            <span className="min-w-0 truncate font-bold [color:var(--kc-text)]">{preview.author_name}</span>
            {preview.version ? <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold [background:var(--kc-panel-muted)] [color:var(--kc-muted)]">v{preview.version}</span> : null}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
            <StatItem icon="eye" label="浏览" value={preview.view_count} />
            <StatItem icon="like" label="点赞" value={preview.like_count} />
            <StatItem icon="message" label="评论" value={preview.comment_count} />
          </div>
        </div>
      </div>
    </a>
  );
}
