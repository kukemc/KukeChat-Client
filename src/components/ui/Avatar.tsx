import type { User } from '@/types/api';
import { resolveThumbnailUrl } from '@/utils/assetUrl';

interface AvatarProps {
  user?: User | null;
  label?: string | null;
  avatarUrl?: string | null;
  size?: 'sm' | 'message' | 'md' | 'lg' | 'xl';
}

const sizeClass = {
  sm: 'h-8 w-8 text-xs',
  message: 'h-9 w-9 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-lg',
  xl: 'h-20 w-20 text-2xl'
};

export function getDisplayName(user?: User | null, fallback = 'KukeChat'): string {
  return user?.nickname || user?.username || fallback;
}

const TASK_ASSISTANT_USERNAME = 'task_assistant';

export function Avatar({ user, label, avatarUrl, size = 'md' }: AvatarProps): JSX.Element {
  const name = label || getDisplayName(user);
  const initial = name.trim().slice(0, 1).toUpperCase() || 'K';
  const imageUrl = resolveThumbnailUrl(avatarUrl || user?.avatar_url);

  // Branded avatar for the built-in 任务助手 bot (no uploaded image).
  if (!imageUrl && user?.is_bot && user.username === TASK_ASSISTANT_USERNAME) {
    return (
      <div
        className={`${sizeClass[size]} grid shrink-0 place-items-center rounded-full shadow-none`}
        style={{ background: 'linear-gradient(135deg,#3b82f6,#6366f1)' }}
        aria-label={name}
      >
        <svg viewBox="0 0 24 24" fill="none" className="h-1/2 w-1/2" aria-hidden="true">
          <path d="M4 12.5 9 17.5 20 6.5" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M9 12.5 12 15.5" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" opacity="0.6" />
        </svg>
      </div>
    );
  }

  if (imageUrl) {
    return <img src={imageUrl} alt={name} className={`${sizeClass[size]} shrink-0 rounded-full border object-cover shadow-none [border-color:var(--kc-border)]`} />;
  }

  return (
    <div className={`${sizeClass[size]} grid shrink-0 place-items-center rounded-full border font-semibold shadow-none [background:var(--kc-panel-muted)] [border-color:var(--kc-border)] [color:var(--kc-text)]`}>
      {initial}
    </div>
  );
}
