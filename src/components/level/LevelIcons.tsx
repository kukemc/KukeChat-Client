import { memo, type CSSProperties } from 'react';
import { readAccountLevel } from '@/api/levels';
import { useLevelStore } from '@/store/levelStore';
import type { User } from '@/types/api';
import { LevelGlyph } from './LevelGlyph';
import { describeParts, splitLevel, type LevelPart } from './levelMath';

/**
 * 账号等级的图标（docs/account-level.md 1.2）：四进制的皇冠 / 太阳 / 月亮 / 星星，从大到小排。
 *
 *   variant="full"     完整的图标串：23 级 = 1 太阳 1 月亮 3 星星。等级页、资料卡、排行榜、悬停的小卡片里用。
 *   variant="compact"  紧凑形态，给聊天消息行、成员列表这些挤的地方：只画最大的那一种图标（1–3 个），后面跟等级数字。
 *                      宽度有上限（最多三四个图标加一个数字），等级再高也不会把昵称挤没；完整的图标串在悬停 / 点开的小卡片里。
 *
 * 0 级、或者当前连接的服务端没有账号等级（GET /levels/rules 是 404）时什么都不画。
 *
 * 消息行是热路径，所以这个组件很轻：
 *   · 只收数字和布尔值，整个包在 memo 里 —— 等级没变就不重渲染，父组件怎么渲染都一样；
 *   · 不发请求、不挂查询的观察者，换算表和开关读的是 store/levelStore（几乎不变的一小块状态）；
 *   · 自己不绑任何事件。悬停和点击由 LevelHoverCard 在根上统一监听，靠元素上的 data-klv 认出来。
 */
export interface LevelIconsProps {
  /** 等级，0–256。先过 readAccountLevel，传进来的应该已经是干净的整数 */
  level: number;
  /** 这是谁的等级：悬停的小卡片据此去取累计活跃天。不给就只显示等级本身 */
  userId?: number | null;
  variant?: 'compact' | 'full';
  /** 这是聊天里昵称旁的图标：受「在聊天里显示等级图标」开关控制 */
  inChat?: boolean;
  /** 是当前用户自己的：点了进等级页 */
  self?: boolean;
  /** 放在别的按钮里（成员列表的一行）：只响应悬停，点击留给外面那个按钮 */
  passive?: boolean;
  /** 只是一串图标：不参与悬停和点击（等级页、小卡片自己里面的那一串） */
  plain?: boolean;
  /** 图标的边长，像素。默认 13 */
  size?: number;
  className?: string;
}

function glyphs(parts: readonly LevelPart[]): JSX.Element[] {
  const result: JSX.Element[] = [];
  for (const part of parts) {
    for (let index = 0; index < part.count; index += 1) {
      result.push(<LevelGlyph key={`${part.key}${index}`} kind={part.key} />);
    }
  }
  return result;
}

function LevelIconsInner({ level, userId, variant = 'compact', inChat = false, self = false, passive = false, plain = false, size, className }: LevelIconsProps): JSX.Element | null {
  const hidden = useLevelStore((state) => state.available === false || (inChat && !state.showInChat));
  const rules = useLevelStore((state) => state.icons);
  if (hidden || level < 1) {
    return null;
  }
  const parts = splitLevel(level, rules);
  if (parts.length === 0) {
    return null;
  }
  const compact = variant === 'compact';
  return (
    <span
      className={`klv ${compact ? 'klv--compact' : 'klv--full'}${className ? ` ${className}` : ''}`}
      style={size ? { '--klv-s': `${size}px` } as CSSProperties : undefined}
      role="img"
      aria-label={`账号等级 ${level}：${describeParts(parts)}`}
      data-klv={plain ? undefined : level}
      data-klv-uid={plain ? undefined : userId ?? undefined}
      data-klv-self={!plain && self ? '' : undefined}
      data-klv-passive={!plain && passive ? '' : undefined}
    >
      <span className="klv-icons">{glyphs(compact ? parts.slice(0, 1) : parts)}</span>
      {compact ? <span className="klv-num">{level}</span> : null}
    </span>
  );
}

export const LevelIcons = memo(LevelIconsInner);

/** 用户对象上的等级。机器人没有等级；旧后端的用户对象上没有这个字段，按 0 处理。 */
export function levelOfUser(user: Pick<User, 'account_level' | 'is_bot'> | null | undefined): number {
  return user && !user.is_bot ? readAccountLevel(user.account_level) : 0;
}

/** 直接给用户对象的写法：昵称旁边一行里用它。 */
export function UserLevelIcons({ user, ...rest }: Omit<LevelIconsProps, 'level' | 'userId'> & { user: User | null | undefined }): JSX.Element | null {
  const level = levelOfUser(user);
  return level > 0 ? <LevelIcons level={level} userId={user?.id} {...rest} /> : null;
}
