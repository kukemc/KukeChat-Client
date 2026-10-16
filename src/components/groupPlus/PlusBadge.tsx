import type { GroupPlusTier } from '@/types/groupPlus';
import { TIER_META } from './tier';

/**
 * 群档位的两种标志（样式在 styles/group-plus.css，前缀 kgp-）：
 *   PlusCornerBadge  MAX 群头像右下角的专属徽记（琥珀色小圆 + 白色王冠，外圈一道面板色描边）。只有 MAX 有，Pro / Pro+ 只靠群名后的标签区分。
 *   PlusTierTag      群名后面的小标签（浅底同色字：Pro 蓝、Pro+ 紫、MAX 琥珀 + 小王冠），会话列表、聊天顶栏、群资料页、搜索结果里都用它，保持一致。
 * 颜色全在样式表里按浅色 / 深色各给一套；这里不写颜色，也不放动效（列表里成百上千个，动起来太重）。
 */

/** 王冠：16×16 的网格上画，小到 8px 也认得出（五个尖、一条底座） */
export function CrownGlyph({ className = 'kgp-corner-icon' }: { className?: string }): JSX.Element {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M2.2 5.1 5.4 7.6 8 3.2l2.6 4.4 3.2-2.5-1.1 6.2H3.3L2.2 5.1Z" />
      <rect fill="currentColor" x="3.4" y="11.9" width="9.2" height="1.6" rx="0.8" />
    </svg>
  );
}

/** 绝对定位在头像容器的右下角，容器要是 position: relative（Avatar 已经处理）。只给 MAX 画。 */
export function PlusCornerBadge({ tier }: { tier: GroupPlusTier }): JSX.Element | null {
  if (tier !== 'max') {
    return null;
  }
  return (
    <span className="kgp-corner kgp-corner--max" title="MAX 群" aria-hidden="true">
      <CrownGlyph />
    </span>
  );
}

/** 群名后面的档位标签。free 不画。size 只有两档：列表里用 sm，群资料页大标题旁用 md。 */
export function PlusTierTag({ tier, size = 'sm', className }: { tier: GroupPlusTier; size?: 'sm' | 'md'; className?: string }): JSX.Element | null {
  if (tier === 'free') {
    return null;
  }
  return (
    <span className={`kgp-tag kgp-tag--${tier} kgp-tag--${size}${className ? ` ${className}` : ''}`} data-plus-tier={tier} title={`${TIER_META[tier].label} 群`}>
      {tier === 'max' ? <CrownGlyph className="kgp-tag-icon" /> : null}
      {TIER_META[tier].label}
    </span>
  );
}
