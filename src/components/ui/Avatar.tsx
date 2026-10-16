import { avatarFrameOf, parseAvatarFrame } from '@/components/shop/skin/avatarFrame';
import { AvatarFrameDecor } from '@/components/shop/skin/AvatarFrameDecor';
import { PlusCornerBadge } from '@/components/groupPlus/PlusBadge';
import type { GroupPlusTier } from '@/types/groupPlus';
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
  /**
   * 画不画这个人装备的头像框（docs/shop.md 头像框一节）。默认不画：成员名单、会话列表这些地方头像成百上千，都带上动效太重。
   * 只在聊天消息行、资料卡、个人空间头部、标题栏里自己的头像这几处打开。
   */
  frame?: boolean;
  /** 商店预览用：不看这个人装备了什么，直接套这一份头像框的 style（照样要过校验）；传 null 是明确不套。 */
  frameStyle?: unknown;
  /**
   * 群的有效档位（components/groupPlus/tier.ts 的 conversationTier）：不是 free 时在右下角画档位角标。
   * 只有群头像传；会套一层和头像一样大的容器，同头像框的做法。
   */
  plusTier?: GroupPlusTier | null;
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

export function Avatar({ user, label, avatarUrl, size = 'md', toneKey, frame = false, frameStyle, plusTier }: AvatarProps): JSX.Element {
  const worn = frameStyle !== undefined ? parseAvatarFrame(frameStyle) : frame ? avatarFrameOf(user) : null;
  const plus = plusTier && plusTier !== 'free' ? plusTier : null;
  if (!worn) {
    if (plus) {
      // 群头像的档位角标：外面套一层和头像一样大的相对定位容器，角标落在右下角（不占布局）
      return (
        <div className={`${sizeClass[size]} kgp-avatar kgp-avatar--${size} shrink-0`}>
          <AvatarFace user={user} label={label} avatarUrl={avatarUrl} toneKey={toneKey} className="h-full w-full" />
          <PlusCornerBadge tier={plus} />
        </div>
      );
    }
    return <AvatarFace user={user} label={label} avatarUrl={avatarUrl} toneKey={toneKey} className={sizeClass[size]} />;
  }
  // 外面套一层和头像一样大的方块（原来落在头像上的尺寸类、外面按「第一个子元素」给的尺寸，现在都落在它上面），
  // 环、光、装饰绝对定位在它里面往外探，不占布局。用 div：有几处样式是按 img / div 选头像的
  return (
    <div className={`${sizeClass[size]} kcaf kcaf--${size} shrink-0`} style={worn.vars}>
      <AvatarFace user={user} label={label} avatarUrl={avatarUrl} toneKey={toneKey} className="h-full w-full" />
      <AvatarFrameDecor frame={worn} seed={user?.id} />
    </div>
  );
}

function AvatarFace({ user, label, avatarUrl, toneKey, className }: Pick<AvatarProps, 'user' | 'label' | 'avatarUrl' | 'toneKey'> & { className: string }): JSX.Element {
  const name = label || getDisplayName(user);
  const initial = name.trim().slice(0, 1).toUpperCase() || 'K';
  const imageUrl = resolveThumbnailUrl(avatarUrl || user?.avatar_url);

  // Branded avatar for the built-in 任务助手 bot (no uploaded image).
  if (!imageUrl && user?.is_bot && user.username === TASK_ASSISTANT_USERNAME) {
    return (
      <div
        className={`${className} kc-avatar grid shrink-0 place-items-center rounded-full shadow-none`}
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
    return <img src={imageUrl} alt={name} className={`${className} kc-avatar shrink-0 rounded-full object-cover [background:var(--kc-active)]`} draggable={false} />;
  }

  return (
    <div className={`${className} kc-avatar kc-avatar-tone grid shrink-0 select-none place-items-center rounded-full font-semibold`} style={{ '--kc-avatar-tone': placeholderTone(toneKey ?? (user?.id && user.id > 0 ? user.id : name)) } as React.CSSProperties} aria-label={name}>
      {initial}
    </div>
  );
}
