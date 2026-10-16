import { cx } from '@/components/chat/desktop/runtime';
import type { BadgeTier } from '@/types/intimacy';

/**
 * 好友成就徽章的内置插画：一枚奖章，外框按 tier 换（1 铜、2 银、3 金、4 彩虹），中间是系列自己的图形。
 *
 * 服务器只下发图形的名字（icon），图形画在这里；认不出的名字画一颗星，没揭晓的隐藏成就画一个问号。
 * 这是装饰插画不是界面图标，所以不走 ui/Icon。画法和礼物插画（gifts/GiftGlyph.tsx）一家：
 *   - 画板 48×48；不描边，靠右下一块暗面、左上一道白色高光分出体积；
 *   - 不用渐变、裁剪和遮罩，所以没有 id —— 好友列表里一屏画几十枚、又在 shadow root 里，也不会互相串；
 *   - 配色固定，不跟主题走；名字旁的小号（14–16 像素）也要认得出，所以中间的图形都是大块的。
 * 彩虹外框是六段弧拼的（不是渐变）。没揭晓的隐藏成就服务端给的图形是 unknown，画问号。
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

const GLINT = { fill: 'none', stroke: '#ffffff', strokeOpacity: 0.62, strokeLinecap: 'round' } as const;
const SHINE = { fill: '#ffffff', fillOpacity: 0.65 } as const;
const SOFT = { strokeLinejoin: 'round', strokeLinecap: 'round' } as const;

interface RimColors {
  base: string;
  lo: string;
  hi: string;
}

const RIMS: Record<Exclude<BadgeTier, 4>, RimColors> = {
  1: { base: '#d39256', lo: '#b06d37', hi: '#efbb86' },
  2: { base: '#bcc7d6', lo: '#8e9bb0', hi: '#e6ecf4' },
  3: { base: '#ffcb3d', lo: '#ef9f1a', hi: '#ffe58c' }
};
const RAINBOW = ['#ff5a5f', '#ff9f3a', '#ffd43b', '#57cc72', '#3fa8ff', '#9a6cff'];

/** 每个系列中间那块底色：和图形配，浅深背景上都分得开 */
const DISC: Record<string, string> = {
  clover: '#e3f7e4',
  sparkle: '#fff4d6',
  rings: '#ffe5ef',
  moon: '#2f3a78',
  sun: '#fff1cc',
  balloons: '#ffe5f1',
  weekend: '#e2f2ff',
  gems: '#e6f4ff',
  cake: '#fff0e6',
  hearts: '#ffe8ee',
  house: '#fff3df',
  firework: '#26285c',
  sunmoon: '#3a3f86',
  rainbow: '#dff2ff',
  chaos: '#ede6d9',
  harmony: '#f3e6ff',
  horn: '#efe7ff',
  unknown: '#e8eaf0'
};

const GREEN = '#4fbf6f';
const GREEN_LO = '#36a057';
const PINK = '#ff7fb0';
const PINK_LO = '#e9578f';
const BLUE = '#45b0ff';
const BLUE_LO = '#2588e3';
const PURPLE = '#a06bff';
const PURPLE_LO = '#7d48e6';
const YELLOW = '#ffcc33';
const YELLOW_LO = '#f2a516';

function Clover(): JSX.Element {
  // 四片心形叶子绕中心，叶尖朝里
  const leaf = (angle: number): JSX.Element => (
    <path key={angle} transform={`rotate(${angle} 24 22.5)`} fill={angle % 180 === 0 ? GREEN : GREEN_LO} d="M24 22.5C21.2 20.6 18.6 18.4 18.6 15.9A2.85 2.85 0 0 1 24 14.7A2.85 2.85 0 0 1 29.4 15.9C29.4 18.4 26.8 20.6 24 22.5Z" {...SOFT} />
  );
  return (
    <g>
      <path d="M24.5 23.5C25.4 27.6 27.4 30.8 30.2 33.2" fill="none" stroke={GREEN_LO} strokeWidth="2.2" strokeLinecap="round" />
      {[0, 90, 180, 270].map(leaf)}
      <circle cx="24" cy="22.5" r="1.6" fill="#ffe36b" />
      <path d="M20.2 15.6a1.7 1.7 0 0 1 2.1-.6" {...GLINT} strokeWidth="1.2" />
    </g>
  );
}

function Harmony(): JSX.Element {
  // 一颗六角星形的宝石，中间一颗小星
  return (
    <g>
      <polygon points={starPoints(24, 24, 11.5, 6.4, 6)} fill={PURPLE} stroke={PURPLE} strokeWidth="1.4" strokeLinejoin="round" />
      <polygon points={starPoints(24, 24, 11.5, 6.4, 6, 30)} fill={PURPLE_LO} opacity="0.35" />
      <polygon points={starPoints(24, 24, 5.6, 2.6, 5)} fill="#ffffff" fillOpacity="0.92" />
      <circle cx="17.5" cy="17" r="1.3" {...SHINE} />
    </g>
  );
}

function Rings(): JSX.Element {
  // 两个扣在一起的环
  return (
    <g fill="none" strokeLinecap="round">
      <circle cx="20" cy="24" r="6.6" stroke={PINK} strokeWidth="3.6" />
      <circle cx="28" cy="24" r="6.6" stroke={BLUE} strokeWidth="3.6" />
      {/* 让粉色的环在上面压回一段，看起来是扣着的 */}
      <path d={arc(6.6, -60, 10, 20, 24)} stroke={PINK} strokeWidth="3.6" />
      <path d={arc(6.6, 200, 235, 20, 24)} stroke="#ffffff" strokeOpacity="0.6" strokeWidth="1.2" />
    </g>
  );
}

function Moon(): JSX.Element {
  return (
    <g>
      <path transform="rotate(-28 24 24)" d="M24 13.2A10.8 10.8 0 0 0 24 34.8A6 10.8 0 0 1 24 13.2Z" fill="#ffe27a" stroke="#ffe27a" strokeWidth="1.2" strokeLinejoin="round" />
      <polygon points={starPoints(31.2, 17.6, 2.8, 1.2)} fill="#ffffff" />
      <polygon points={starPoints(30, 29.5, 1.8, 0.8)} fill="#c8d2ff" />
      <circle cx="35" cy="24" r="0.9" fill="#c8d2ff" />
    </g>
  );
}

function Sun(): JSX.Element {
  const rays = Array.from({ length: 8 }, (_, index) => index * 45);
  return (
    <g>
      {rays.map((angle) => <path key={angle} d={`M${on(24, 24, 9.4, angle)}L${on(24, 24, 13, angle)}`} stroke={YELLOW_LO} strokeWidth="2.6" strokeLinecap="round" />)}
      <circle cx="24" cy="24" r="7.4" fill={YELLOW} />
      <path d="M24 31.4a7.4 7.4 0 0 0 7.4-7.4" fill="none" stroke={YELLOW_LO} strokeWidth="2.4" />
      <path d={arc(5.2, 200, 250)} {...GLINT} strokeWidth="1.4" />
    </g>
  );
}

function Balloons(): JSX.Element {
  // 三个气球
  const balloon = (x: number, y: number, fill: string, lo: string): JSX.Element => (
    <g key={x}>
      <path d={`M${x} ${y + 5.2}C${x - 0.6} ${y + 8} ${x + 1.4} ${y + 9.6} ${24} 35`} fill="none" stroke="#8a8fa3" strokeWidth="0.9" />
      <ellipse cx={x} cy={y} rx="4.4" ry="5.2" fill={fill} />
      <path d={`M${x + 4.1} ${y + 1.6}A4.4 5.2 0 0 1 ${x - 1.4} ${y + 5}`} fill="none" stroke={lo} strokeWidth="1.6" />
      <path d={`M${x - 2.6} ${y - 2}a2.2 2.6 0 0 1 1.6-2`} {...GLINT} strokeWidth="1.1" />
    </g>
  );
  return (
    <g>
      {balloon(18.2, 21.5, BLUE, BLUE_LO)}
      {balloon(29.8, 21.5, BLUE, BLUE_LO)}
      {balloon(24, 17.4, YELLOW, YELLOW_LO)}
    </g>
  );
}

function Weekend(): JSX.Element {
  return (
    <g>
      <rect x="14" y="15.5" width="20" height="18" rx="3.4" fill="#ffffff" />
      <path d="M14 22v-3.1a3.4 3.4 0 0 1 3.4-3.4h13.2a3.4 3.4 0 0 1 3.4 3.4V22Z" fill={BLUE} />
      <rect x="18" y="12.8" width="2.4" height="5.4" rx="1.2" fill={BLUE_LO} />
      <rect x="27.6" y="12.8" width="2.4" height="5.4" rx="1.2" fill={BLUE_LO} />
      <path d="M24 31.2c-2.6-1.7-4.6-3.4-4.6-5.3a2.3 2.3 0 0 1 4.6-.8a2.3 2.3 0 0 1 4.6.8c0 1.9-2 3.6-4.6 5.3Z" fill={PINK} />
    </g>
  );
}

function Gems(): JSX.Element {
  // 三颗钻石
  const gem = (x: number, y: number, size: number): JSX.Element => (
    <g key={`${x}-${y}`}>
      <path d={`M${x} ${y - size}L${x + size * 0.72} ${y}L${x} ${y + size}L${x - size * 0.72} ${y}Z`} fill={BLUE} stroke={BLUE} strokeWidth="1" strokeLinejoin="round" />
      <path d={`M${x} ${y - size}L${x + size * 0.72} ${y}L${x} ${y + size}Z`} fill={BLUE_LO} />
      <path d={`M${x - size * 0.34} ${y - size * 0.4}L${x - size * 0.1} ${y - size * 0.72}`} {...GLINT} strokeWidth="1.1" />
    </g>
  );
  return (
    <g>
      {gem(24, 18.6, 6.2)}
      {gem(18.4, 28.6, 5)}
      {gem(29.6, 28.6, 5)}
    </g>
  );
}

function Cake(): JSX.Element {
  return (
    <g>
      <rect x="23" y="11.6" width="2" height="5.4" rx="1" fill={BLUE} />
      <path d="M24 8.6c1.4 1.4 1.8 2.6.9 3.4a1.3 1.3 0 0 1-1.8 0c-.9-.8-.5-2 .9-3.4Z" fill="#ff9f3a" />
      <rect x="17.2" y="17" width="13.6" height="7.2" rx="2.4" fill={PINK} />
      <rect x="13.6" y="23.2" width="20.8" height="10" rx="2.8" fill="#ffd9a8" />
      <path d="M13.6 26.6c2.6 1.6 4.4 1.6 6.9 0s4.4-1.6 6.9 0 4.4 1.6 7 0" fill="none" stroke={PINK_LO} strokeWidth="2" strokeLinecap="round" />
      <path d="M19.4 19.6h4" {...GLINT} strokeWidth="1.3" />
    </g>
  );
}

function Horn(): JSX.Element {
  // 一只螺纹的角，角尖一颗星
  return (
    <g>
      <path d="M15.6 34.2L31.4 13.2L22.4 36.4Z" fill="#f6d8ff" stroke="#f6d8ff" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M17.6 31.8l5.3 1.9M20.6 27.6l5.4 1.9M23.6 23.4l5 1.8M26.4 19.4l3.6 1.3" stroke={PURPLE} strokeWidth="1.5" strokeLinecap="round" />
      <polygon points={starPoints(33.2, 12.6, 4.4, 1.9)} fill={YELLOW} />
      <circle cx="13.6" cy="18" r="1.2" fill={PURPLE} />
      <circle cx="35" cy="27" r="1" fill={PURPLE} />
    </g>
  );
}

function House(): JSX.Element {
  return (
    <g>
      <path d="M14.2 23.4L24 14.6L33.8 23.4V33a1.8 1.8 0 0 1-1.8 1.8H16a1.8 1.8 0 0 1-1.8-1.8Z" fill="#ffd9a8" stroke="#ffd9a8" strokeWidth="1" strokeLinejoin="round" />
      <path d="M11.8 24.2L24 13.2L36.2 24.2" fill="none" stroke="#e8743b" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="21.2" y="27.4" width="5.6" height="7.4" rx="1.2" fill="#b0743f" />
      <path d="M29.6 26.4c-1.1-.8-2-1.5-2-2.3a1 1 0 0 1 2-.4a1 1 0 0 1 2 .4c0 .8-.9 1.5-2 2.3Z" fill={PINK} />
    </g>
  );
}

function Firework(): JSX.Element {
  const colors = ['#ff6b8b', '#ffd43b', '#6bd0ff', '#9ef08a'];
  return (
    <g strokeLinecap="round">
      {Array.from({ length: 12 }, (_, index) => {
        const angle = index * 30;
        const color = colors[index % colors.length];
        const [x, y] = point(24, 24, 12.6, angle);
        return (
          <g key={angle}>
            <path d={`M${on(24, 24, 4, angle)}L${on(24, 24, 10.2, angle)}`} stroke={color} strokeWidth="1.9" />
            <circle cx={x} cy={y} r="1.15" fill={color} />
          </g>
        );
      })}
      <circle cx="24" cy="24" r="2.2" fill="#ffffff" />
    </g>
  );
}

function Chaos(): JSX.Element {
  // 无序：一圈歪歪扭扭的螺旋，外加一块方糖和一颗星
  const points = Array.from({ length: 40 }, (_, index) => {
    const t = index / 39;
    const radius = 1 + t * 10;
    const angle = t * 600 - 90;
    return on(23 + Math.sin(t * 9) * 0.8, 24, radius, angle);
  });
  return (
    <g>
      <path d={`M${points.join('L')}`} fill="none" stroke="#8a5a2b" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="29.6" y="11.2" width="5" height="5" rx="1" transform="rotate(18 32 13.7)" fill="#ffffff" stroke="#d5c7b1" strokeWidth="0.8" />
      <polygon points={starPoints(14.2, 32.6, 3, 1.3)} fill={YELLOW} />
    </g>
  );
}

function Sparkle(): JSX.Element {
  // 一大一小两颗四角星光
  const spark = (x: number, y: number, r: number): string => `M${x} ${y - r}Q${x + r * 0.18} ${y - r * 0.18} ${x + r} ${y}Q${x + r * 0.18} ${y + r * 0.18} ${x} ${y + r}Q${x - r * 0.18} ${y + r * 0.18} ${x - r} ${y}Q${x - r * 0.18} ${y - r * 0.18} ${x} ${y - r}Z`;
  return (
    <g>
      <path d={spark(21.6, 25.4, 10.4)} fill={YELLOW} />
      <path d={spark(21.6, 25.4, 10.4)} fill={YELLOW_LO} opacity="0.35" transform="translate(1.2 1.2)" />
      <path d={spark(31.6, 15.6, 4.6)} fill={PINK} />
      <circle cx="33.4" cy="29.6" r="1.4" fill={PINK} />
      <circle cx="18.6" cy="22" r="1.3" {...SHINE} />
    </g>
  );
}

function Hearts(): JSX.Element {
  const heart = 'M0 6.2C-3.9 3.6-7 1-7-2.2A3.6 3.6 0 0 1 0-3.6A3.6 3.6 0 0 1 7-2.2C7 1 3.9 3.6 0 6.2Z';
  return (
    <g>
      <path d={heart} transform="translate(19.4 23.4) rotate(-14) scale(1.18)" fill={PINK} />
      <path d={heart} transform="translate(28.6 26.6) rotate(12) scale(1.18)" fill={PURPLE} />
      <path d={heart} transform="translate(28.6 26.6) rotate(12) scale(1.18)" fill={PURPLE_LO} opacity="0.3" />
      <circle cx="15.8" cy="20.4" r="1.2" {...SHINE} />
    </g>
  );
}

function Rainbow(): JSX.Element {
  // 一道彩虹拱，左下角一朵云
  return (
    <g fill="none" strokeLinecap="round">
      {RAINBOW.map((color, index) => <path key={color} d={arc(13 - index * 1.9, 180, 360, 24, 31)} stroke={color} strokeWidth="2" />)}
      <g fill="#ffffff">
        <circle cx="13.6" cy="31.4" r="3.4" />
        <circle cx="17.6" cy="30.2" r="4" />
        <circle cx="21.2" cy="32" r="2.8" />
      </g>
    </g>
  );
}

function SunMoon(): JSX.Element {
  // 左上一轮太阳，右下一弯月亮，各占半边
  return (
    <g>
      {Array.from({ length: 8 }, (_, index) => index * 45).map((angle) => <path key={angle} d={`M${on(19, 19, 6.6, angle)}L${on(19, 19, 8.8, angle)}`} stroke={YELLOW} strokeWidth="1.8" strokeLinecap="round" />)}
      <circle cx="19" cy="19" r="5" fill={YELLOW} />
      <path transform="rotate(-28 29.5 29.5)" d="M29.5 22.6A6.9 6.9 0 0 0 29.5 36.4A3.9 6.9 0 0 1 29.5 22.6Z" fill="#c8d2ff" stroke="#c8d2ff" strokeWidth="1" strokeLinejoin="round" />
      <polygon points={starPoints(35.4, 23.4, 1.8, 0.8)} fill="#ffffff" />
    </g>
  );
}

function Unknown(): JSX.Element {
  return (
    <g>
      <path d="M19.4 20.2A4.8 4.8 0 1 1 26.6 24.4C25 25.3 24 26.2 24 28.2" fill="none" stroke="#8b92a8" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="24" cy="33.4" r="2.1" fill="#8b92a8" />
    </g>
  );
}

function Fallback(): JSX.Element {
  return (
    <g>
      <polygon points={starPoints(24, 24.6, 11, 5)} fill={YELLOW} stroke={YELLOW} strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="20.2" cy="21" r="1.2" {...SHINE} />
    </g>
  );
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

function Rim({ tier }: { tier: BadgeTier }): JSX.Element {
  if (tier === 4) {
    return (
      <g>
        <circle cx="24" cy="24" r="21.6" fill="#ffffff" />
        {RAINBOW.map((color, index) => <path key={color} d={arc(19.4, -90 + index * 60, -90 + (index + 1) * 60 + 0.6)} fill="none" stroke={color} strokeWidth="4.6" />)}
        <path d={arc(21.4, 192, 262)} {...GLINT} strokeWidth="1.3" />
      </g>
    );
  }
  const colors = RIMS[tier];
  return (
    <g>
      <circle cx="24" cy="24" r="21.6" fill={colors.base} />
      <path d={arc(21.6, -30, 120)} fill="none" stroke={colors.lo} strokeWidth="3.2" />
      <circle cx="24" cy="24" r="17.6" fill="none" stroke={colors.lo} strokeWidth="1" strokeOpacity="0.55" />
      <path d={arc(19.6, 196, 252)} fill="none" stroke={colors.hi} strokeWidth="1.5" strokeLinecap="round" />
    </g>
  );
}

/** 金、彩虹两档在奖章下面多两条飘带 */
function Ribbons({ tier }: { tier: BadgeTier }): JSX.Element | null {
  if (tier < 3) {
    return null;
  }
  const color = tier === 4 ? '#ff6b9a' : '#e2574c';
  const lo = tier === 4 ? '#7d6bff' : '#b83c33';
  return (
    <g>
      <path d="M15.6 36.8L12.4 46.4L16.6 44.6L19 48L22 39.4Z" fill={color} />
      <path d="M32.4 36.8L35.6 46.4L31.4 44.6L29 48L26 39.4Z" fill={lo} />
    </g>
  );
}

export interface BadgeGlyphProps {
  icon: string;
  tier: BadgeTier;
  size?: number;
  /** 没解锁：灰掉 */
  locked?: boolean;
  /** 没揭晓的隐藏成就：画问号 */
  mystery?: boolean;
  className?: string;
  title?: string;
}

export function BadgeGlyph({ icon, tier, size = 40, locked = false, mystery = false, className, title }: BadgeGlyphProps): JSX.Element {
  const key = mystery ? 'unknown' : icon in ART ? icon : 'fallback';
  const Art = key === 'fallback' ? Fallback : ART[key];
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
      <Ribbons tier={tier} />
      <Rim tier={tier} />
      <circle cx="24" cy="24" r="16.4" fill={DISC[key] ?? '#fff6d8'} />
      <g transform="translate(24 24) scale(0.82) translate(-24 -24)">
        <Art />
      </g>
    </svg>
  );
}
