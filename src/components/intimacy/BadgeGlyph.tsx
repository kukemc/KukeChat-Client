import { cx } from '@/components/chat/desktop/runtime';
import type { BadgeTier } from '@/types/intimacy';

/**
 * 好友成就徽章的内置图形：一枚扁平的圆章，中间是系列自己的符号。
 *
 * 服务器只下发图形的名字（icon），图形画在这里；认不出的名字画一颗星，没揭晓的隐藏成就画一个问号。
 * 这是徽章图形不是界面图标，所以不走 ui/Icon。画法（和群升级那一套克制的黑白一家）：
 *   - 画板 48×48；不用渐变、高光、斜面、裁剪和遮罩，所以没有 id —— 一屏画几十枚、又在 shadow root 里，也不会互相串；
 *   - 解锁了：墨色实心圆（深色主题下反过来是近白），符号是挖空色；没解锁：一圈很淡的细线，符号也是淡灰；
 *   - 档位（tier）不靠颜色分，靠外圈：1 只有圆；2 多一道细外圈；3 外圈顶上断开、嵌一颗小星；
 *     4（最高档）同 3，整枚换成玫瑰色 —— 全套里唯一的颜色，只给最难拿的那一档；
 *   - 名字旁的小号（14–16 像素）也要认得出：符号都是大块的实心形状，线条至少 2 个单位粗；20 像素及以下不画外圈（只剩实心圆），
 *     更大的尺寸外圈的线宽按尺寸换算，不会细到 1 像素以下。
 * 颜色走 CSS 变量（intimacy.css 的 .kit-glyph），SVG 上的属性只是样式表没加载时的兜底。
 */

const round = (value: number): number => Math.round(value * 100) / 100;

function point(cx: number, cy: number, radius: number, degrees: number): [number, number] {
  const angle = (degrees * Math.PI) / 180;
  return [round(cx + radius * Math.cos(angle)), round(cy + radius * Math.sin(angle))];
}

/** 圆上的一点，写成路径里的「x y」；角度按屏幕方向算：0 在右，90 在下，270 在上 */
function on(cx: number, cy: number, radius: number, degrees: number): string {
  return point(cx, cy, radius, degrees).join(' ');
}

function arc(radius: number, from: number, to: number, cx = 24, cy = 24): string {
  return `M${on(cx, cy, radius, from)}A${radius} ${radius} 0 ${to - from > 180 ? 1 : 0} 1 ${on(cx, cy, radius, to)}`;
}

function starPoints(cx: number, cy: number, outer: number, inner: number, points = 5, rotate = -90): string {
  return Array.from({ length: points * 2 }, (_, index) => on(cx, cy, index % 2 === 0 ? outer : inner, rotate + (index * 180) / points)).join(' ');
}

/** 四角星光（圆润的十字星） */
function spark(x: number, y: number, r: number): string {
  const k = r * 0.2;
  return `M${x} ${y - r}Q${x + k} ${y - k} ${x + r} ${y}Q${x + k} ${y + k} ${x} ${y + r}Q${x - k} ${y + k} ${x - r} ${y}Q${x - k} ${y - k} ${x} ${y - r}Z`;
}

const HEART = 'M0 6.2C-3.9 3.6-7 1-7-2.2A3.6 3.6 0 0 1 0-3.6A3.6 3.6 0 0 1 7-2.2C7 1 3.9 3.6 0 6.2Z';

/** 符号统一用 currentColor：实心的部分 fill，线条的部分 stroke */
const LINE = { fill: 'none', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
const SOLID = { fill: 'currentColor' } as const;

function Clover(): JSX.Element {
  // 四片心形叶子绕中心，叶尖朝里，右下一截茎
  return (
    <g>
      <path d="M25 25.5C26 28.8 27.8 31.4 30.6 33.4" {...LINE} strokeWidth="2.4" />
      {/* 叶子窄一点、往外挪一点，四片之间留出缝，小号也看得出是四片 */}
      {[45, 135, 225, 315].map((angle) => (
        <path key={angle} transform={`translate(23.6 23) rotate(${angle}) translate(0 -1.3)`} {...SOLID} d="M0 0C-2.7-1.7-5-3.8-5-6.3A2.5 2.5 0 0 1 0-7.6A2.5 2.5 0 0 1 5-6.3C5-3.8 2.7-1.7 0 0Z" />
      ))}
    </g>
  );
}

function Sparkle(): JSX.Element {
  return (
    <g {...SOLID}>
      <path d={spark(22, 25.6, 10.6)} />
      <path d={spark(32.4, 15.2, 4.4)} />
    </g>
  );
}

function Rings(): JSX.Element {
  // 两个扣在一起的环
  return (
    <g {...LINE} strokeWidth="2.8">
      <circle cx="19.6" cy="24" r="6.4" />
      <circle cx="28.4" cy="24" r="6.4" />
    </g>
  );
}

function Moon(): JSX.Element {
  return (
    <g {...SOLID}>
      <path transform="rotate(-28 23 25)" d="M23 13.8A11.2 11.2 0 0 0 23 36.2A6.4 11.2 0 0 1 23 13.8Z" />
      <polygon points={starPoints(32, 16.4, 3, 1.25)} />
    </g>
  );
}

function Sun(): JSX.Element {
  return (
    <g>
      {Array.from({ length: 8 }, (_, index) => index * 45).map((angle) => <path key={angle} d={`M${on(24, 24, 8.8, angle)}L${on(24, 24, 11.6, angle)}`} {...LINE} strokeWidth="2.4" />)}
      <circle cx="24" cy="24" r="5.8" {...SOLID} />
    </g>
  );
}

function Balloons(): JSX.Element {
  // 两个气球，线收到一起
  return (
    <g>
      <path d="M18.8 25.6C19 28.8 21.6 30.8 24 34M29.2 26.8C29 29.8 26.4 31.2 24 34" {...LINE} strokeWidth="1.7" />
      <ellipse cx="18.8" cy="19.4" rx="4.5" ry="5.6" {...SOLID} />
      <ellipse cx="29.2" cy="21.4" rx="3.9" ry="4.8" {...SOLID} />
    </g>
  );
}

function Weekend(): JSX.Element {
  // 日历：外框、顶上一条实心的页眉、两个挂扣，中间一颗心
  return (
    <g>
      <rect x="14.6" y="16.8" width="18.8" height="16.4" rx="3" {...LINE} strokeWidth="2.4" />
      <path d="M14.6 22.6V19.8a3 3 0 0 1 3-3h12.8a3 3 0 0 1 3 3v2.8Z" {...SOLID} />
      <path d="M19.6 13.6v4.2M28.4 13.6v4.2" {...LINE} strokeWidth="2.4" />
      <path d={HEART} transform="translate(24 27) scale(0.56)" {...SOLID} />
    </g>
  );
}

function Gems(): JSX.Element {
  // 一颗切面宝石，右上一点星光
  return (
    <g {...SOLID}>
      <path d="M16.2 20.4L20 15.4H28L31.8 20.4L24 33.6Z" strokeLinejoin="round" />
      <path d={spark(33.4, 13.2, 3)} />
    </g>
  );
}

function Cake(): JSX.Element {
  return (
    <g {...SOLID}>
      <ellipse cx="24" cy="11.4" rx="1.5" ry="2.1" />
      <rect x="23" y="14" width="2" height="3.8" rx="1" />
      <rect x="18" y="18.4" width="12" height="5.8" rx="1.8" />
      <rect x="14.6" y="25.6" width="18.8" height="8.4" rx="2.2" />
    </g>
  );
}

function Hearts(): JSX.Element {
  // 两颗并排的心，一颗略高
  return (
    <g {...SOLID}>
      <path d={HEART} transform="translate(18.6 22.6) rotate(-10) scale(0.84)" />
      <path d={HEART} transform="translate(29.6 26) rotate(10) scale(0.84)" />
    </g>
  );
}

function House(): JSX.Element {
  return (
    <g>
      <path d="M12.8 23.4L24 13.6L35.2 23.4" {...LINE} strokeWidth="2.6" />
      <path d="M16 22.6L24 15.8L32 22.6V32.2a1.6 1.6 0 0 1-1.6 1.6H17.6a1.6 1.6 0 0 1-1.6-1.6Z" {...SOLID} />
    </g>
  );
}

function Firework(): JSX.Element {
  return (
    <g>
      {Array.from({ length: 8 }, (_, index) => index * 45).map((angle) => (
        <g key={angle}>
          <path d={`M${on(24, 24, 4.4, angle)}L${on(24, 24, 8.4, angle)}`} {...LINE} strokeWidth="2.2" />
          <circle cx={point(24, 24, 11.2, angle)[0]} cy={point(24, 24, 11.2, angle)[1]} r="1.35" {...SOLID} />
        </g>
      ))}
      <circle cx="24" cy="24" r="1.9" {...SOLID} />
    </g>
  );
}

function SunMoon(): JSX.Element {
  // 左上一轮太阳，右下一弯月亮
  return (
    <g>
      {Array.from({ length: 8 }, (_, index) => index * 45).map((angle) => <path key={angle} d={`M${on(19, 19, 6.4, angle)}L${on(19, 19, 8.2, angle)}`} {...LINE} strokeWidth="1.9" />)}
      <circle cx="19" cy="19" r="4.2" {...SOLID} />
      <path transform="rotate(-28 29.6 29.6)" d="M29.6 22.4A7.2 7.2 0 0 0 29.6 36.8A4.1 7.2 0 0 1 29.6 22.4Z" {...SOLID} />
    </g>
  );
}

function Rainbow(): JSX.Element {
  // 三道拱
  return (
    <g {...LINE} strokeWidth="2.4">
      {[11, 7.4, 3.8].map((radius) => <path key={radius} d={arc(radius, 180, 360, 24, 30)} />)}
    </g>
  );
}

function Chaos(): JSX.Element {
  // 无序：一圈歪歪扭扭的螺旋，右上一颗小星
  const points = Array.from({ length: 36 }, (_, index) => {
    const t = index / 35;
    return on(23 + Math.sin(t * 9) * 0.7, 25, 1 + t * 9.6, t * 600 - 90);
  });
  return (
    <g>
      <path d={`M${points.join('L')}`} {...LINE} strokeWidth="2.2" />
      <polygon points={starPoints(33, 14.2, 3, 1.3)} {...SOLID} />
    </g>
  );
}

function Harmony(): JSX.Element {
  // 一颗六角星
  return <polygon points={starPoints(24, 24, 11.4, 6.2, 6)} {...SOLID} strokeLinejoin="round" />;
}

function Horn(): JSX.Element {
  // 一只角，角尖一颗星
  return (
    <g {...SOLID}>
      <path d="M15.4 34.6L30.4 15.4L23.2 36.4Z" strokeLinejoin="round" />
      <polygon points={starPoints(33, 13.2, 3.8, 1.6)} />
    </g>
  );
}

function Unknown(): JSX.Element {
  return (
    <g>
      <path d="M19.4 19.8A4.8 4.8 0 1 1 26.6 24C25 24.9 24 25.8 24 27.8" {...LINE} strokeWidth="3" />
      <circle cx="24" cy="33" r="2" {...SOLID} />
    </g>
  );
}

function Fallback(): JSX.Element {
  return <polygon points={starPoints(24, 24.8, 11.2, 5)} {...SOLID} strokeLinejoin="round" />;
}

const ART: Record<string, () => JSX.Element> = {
  clover: Clover,
  sparkle: Sparkle,
  rings: Rings,
  moon: Moon,
  sun: Sun,
  balloons: Balloons,
  weekend: Weekend,
  gems: Gems,
  cake: Cake,
  hearts: Hearts,
  house: House,
  firework: Firework,
  sunmoon: SunMoon,
  rainbow: Rainbow,
  chaos: Chaos,
  harmony: Harmony,
  horn: Horn,
  unknown: Unknown
};

export const BADGE_ICON_NAMES = Object.keys(ART).filter((name) => name !== 'unknown');

/** 兜底色（样式表没加载时）：浅色主题的墨色 / 挖空色 / 淡线 / 玫瑰色 */
const INK = '#1b1c21';
const ON_INK = '#ffffff';
const FAINT = '#c9cbd2';
const ROSE = '#d9577a';

export interface BadgeGlyphProps {
  icon: string;
  tier: BadgeTier;
  size?: number;
  /** 没解锁：只剩一圈淡线 */
  locked?: boolean;
  /** 没揭晓的隐藏成就：画问号 */
  mystery?: boolean;
  className?: string;
  title?: string;
}

export function BadgeGlyph({ icon, tier, size = 40, locked = false, mystery = false, className, title }: BadgeGlyphProps): JSX.Element {
  const key = mystery ? 'unknown' : icon in ART ? icon : 'fallback';
  const Art = key === 'fallback' ? Fallback : ART[key];
  // 20 像素及以下（名字旁、列表里）外圈会糊成一团：只画实心圆和符号，最高档照样是玫瑰色
  const compact = size <= 20;
  const ringed = tier >= 2 && !compact;
  const crowned = tier >= 3 && !compact;
  // 画板 48 个单位对应 size 像素：外圈、没解锁的那圈线至少要有 1 像素
  const px = 48 / Math.max(1, size);
  const ringWidth = round(Math.max(1.5, px));
  const outlineWidth = round(Math.max(1.3, px));
  const discRadius = ringed ? 16.8 : compact ? 22 : 20.4;
  const color = tier === 4 ? ROSE : INK;
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      className={cx('kit-glyph', locked && 'is-locked', className)}
      data-badge-icon={key}
      data-badge-tier={tier}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      {ringed && !crowned ? <circle className="kit-g-ring" cx="24" cy="24" r="21.2" fill="none" stroke={locked ? FAINT : color} strokeWidth={ringWidth} /> : null}
      {crowned ? <path className="kit-g-ring" d={arc(21.2, -90 + 19, 270 - 19)} fill="none" stroke={locked ? FAINT : color} strokeWidth={ringWidth} strokeLinecap="round" /> : null}
      {crowned ? <path className="kit-g-pip" d={spark(24, 3, 3.4)} fill={locked ? FAINT : color} /> : null}
      <circle
        className="kit-g-disc"
        cx="24"
        cy="24"
        r={locked ? discRadius - outlineWidth / 2 : discRadius}
        fill={locked ? 'none' : color}
        stroke={locked ? FAINT : 'none'}
        strokeWidth={locked ? outlineWidth : undefined}
      />
      <g className="kit-g-sym" color={locked ? FAINT : ON_INK} transform={`translate(24 24) scale(${ringed ? 0.8 : compact ? 1.04 : 0.96}) translate(-24 -24)`}>
        <Art />
      </g>
    </svg>
  );
}
