import type { User } from '@/types/api';
import { resolveThumbnailUrl } from '@/utils/assetUrl';

interface AvatarProps {
  user?: User | null;
  label?: string | null;
  avatarUrl?: string | null;
  size?: 'sm' | 'message' | 'md' | 'lg' | 'xl';
  /**
   * 没有图片时按什么取占位色。用户不用传（按 user.id）；群聊请传群 id，
   * 否则只能按显示的名字取色，而列表里的群名带着成员数，人数一变颜色就跟着变。
   */
  toneKey?: number | string | null;
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

/** 头像占位的色相。底色和字色由样式表（.kc-avatar-tone）从它调出浅色、深色各一套。 */
const PLACEHOLDER_TONES = ['#3b6fe0', '#7a55d6', '#16907c', '#c57a12', '#d1456b', '#1b8fb5', '#4c9a2a', '#b34fc0'];

/**
 * 按人固定取色：同一个人在会话列表、消息、成员名单里都是同一种颜色。
 * 数字（用户 id、群 id）直接取模，改昵称、群名片都不换色；实在没有 id 的才按名字算。
 */
function placeholderTone(key: number | string): string {
  let seed = 0;
  if (typeof key === 'number') {
    seed = Math.abs(Math.trunc(key));
  } else {
    for (const char of key) {
      seed = (seed * 31 + (char.codePointAt(0) ?? 0)) % 9973;
    }
  }
  return PLACEHOLDER_TONES[seed % PLACEHOLDER_TONES.length];
}

export function Avatar({ user, label, avatarUrl, size = 'md', toneKey }: AvatarProps): JSX.Element {
  const name = label || getDisplayName(user);
  const initial = name.trim().slice(0, 1).toUpperCase() || 'K';
  const imageUrl = resolveThumbnailUrl(avatarUrl || user?.avatar_url);

  // Branded avatar for the built-in 任务助手 bot (no uploaded image).
  if (!imageUrl && user?.is_bot && user.username === TASK_ASSISTANT_USERNAME) {
    return (
      <div
        className={`${sizeClass[size]} kc-avatar grid shrink-0 place-items-center rounded-full shadow-none`}
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
    return <img src={imageUrl} alt={name} className={`${sizeClass[size]} kc-avatar shrink-0 rounded-full object-cover [background:var(--kc-active)]`} draggable={false} />;
  }

  return (
    <div className={`${sizeClass[size]} kc-avatar kc-avatar-tone grid shrink-0 select-none place-items-center rounded-full font-semibold`} style={{ '--kc-avatar-tone': placeholderTone(toneKey ?? (user?.id && user.id > 0 ? user.id : name)) } as React.CSSProperties} aria-label={name}>
      {initial}
    </div>
  );
}
