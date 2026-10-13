import type { CSSProperties } from 'react';
import { heartPath, sparklePath } from './patterns';

/**
 * 气泡皮肤的内置角饰（docs/shop.md 2.2 的 ornaments[].key）：骑在气泡角上的小矢量图形。
 *
 * 样式里只有图形的名字、哪个角、颜色、大小、动不动；图形本身画在这里，都在 24×24 的画板上，主体用 currentColor，
 * 再叠一点白色高光和压暗的细节让它有体积（单色的剪影贴在气泡上会显得很平）。这里是装饰插画，不是界面图标，
 * 所以不走 ui/Icon。加新图形要发版，名字也要写进契约。
 */

export const ORNAMENT_KEYS = ['sparkle', 'star', 'moon', 'sun', 'heart', 'petal', 'cloud', 'paw', 'leaf', 'crown', 'pixel_heart', 'bolt', 'snow'] as const;
export type OrnamentKey = (typeof ORNAMENT_KEYS)[number];
export const ORNAMENT_CORNERS = ['tl', 'tr', 'bl', 'br'] as const;
export type OrnamentCorner = (typeof ORNAMENT_CORNERS)[number];

export function isOrnamentKey(value: unknown): value is OrnamentKey {
  return typeof value === 'string' && (ORNAMENT_KEYS as readonly string[]).includes(value);
}

export function isOrnamentCorner(value: unknown): value is OrnamentCorner {
  return typeof value === 'string' && (ORNAMENT_CORNERS as readonly string[]).includes(value);
}

/** animated 时怎么动：闪（缩一点、淡一点）、晃（左右摆）、浮（上下飘）、跳（像心跳那样胀一下）。都很轻。 */
type Motion = 'twinkle' | 'sway' | 'float' | 'pulse';

const MOTION: Record<OrnamentKey, Motion> = {
  sparkle: 'twinkle', star: 'twinkle', sun: 'twinkle', snow: 'twinkle', bolt: 'twinkle',
  moon: 'float', cloud: 'float',
  petal: 'sway', leaf: 'sway', paw: 'sway', crown: 'sway',
  heart: 'pulse', pixel_heart: 'pulse'
};

const HIGHLIGHT = { fill: '#ffffff', fillOpacity: 0.5 } as const;
const SHADE = { fill: '#000000', fillOpacity: 0.16 } as const;

function point(radius: number, degrees: number): string {
  const angle = (degrees * Math.PI) / 180;
  return `${Math.round((12 + radius * Math.sin(angle)) * 100) / 100} ${Math.round((12 - radius * Math.cos(angle)) * 100) / 100}`;
}

/** 五角星的十个顶点 */
const STAR_POINTS = Array.from({ length: 10 }, (_, index) => point(index % 2 === 0 ? 9.6 : 4.3, index * 36)).join(' ');
const SUN_RAYS = Array.from({ length: 8 }, (_, index) => `M${point(7.6, index * 45)}L${point(10.4, index * 45)}`).join('');
/** 雪花的一条臂：主干加一对小分叉，转六次 */
const SNOW_ARM = 'M12 12V2.6M12 6.2l-2.4-2.3M12 6.2l2.4-2.3';
/** 像素爱心：7×6 的点阵，每格 3 */
const PIXEL_HEART_ROWS = ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'];
const PIXEL_HEART = PIXEL_HEART_ROWS.map((row, y) => Array.from(row).map((cell, x) => (cell === 'X' ? `M${1.5 + x * 3} ${3 + y * 3}h3v3h-3z` : '')).join('')).join('');

const SHAPES: Record<OrnamentKey, () => JSX.Element> = {
  // 闪光：一大一小两颗四角星
  sparkle: () => (
    <>
      <path d={sparklePath(10.5, 13, 9.4)} fill="currentColor" />
      <path d={sparklePath(19.6, 4.9, 3.6)} fill="currentColor" />
      <path d={sparklePath(10.5, 13, 3.4)} {...HIGHLIGHT} />
    </>
  ),
  star: () => (
    <>
      <polygon points={STAR_POINTS} fill="currentColor" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M8.7 9.4L10.5 5.8" fill="none" stroke="#ffffff" strokeOpacity="0.6" strokeWidth="1.5" strokeLinecap="round" />
    </>
  ),
  // 月亮：一弯新月，旁边一颗小星
  moon: () => (
    <>
      <path d="M20.6 14.6A9.3 9.3 0 1 1 9.4 3.4A7.3 7.3 0 0 0 20.6 14.6Z" fill="currentColor" />
      <path d="M7.2 7.2A7.6 7.6 0 0 0 5.4 14A9 9 0 0 1 7.2 7.2Z" {...HIGHLIGHT} />
      <path d={sparklePath(18.4, 6, 2.8)} fill="currentColor" />
    </>
  ),
  sun: () => (
    <>
      <path d={SUN_RAYS} fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
      <circle cx="12" cy="12" r="5.2" fill="currentColor" />
      <path d="M8.6 11.2A3.6 3.6 0 0 1 11.6 8.5A4.6 4.6 0 0 0 8.6 11.2Z" {...HIGHLIGHT} stroke="#ffffff" strokeOpacity="0.5" strokeWidth="0.9" strokeLinecap="round" />
    </>
  ),
  heart: () => (
    <>
      <path d={heartPath(12, 12.4, 9.6)} fill="currentColor" />
      <path d="M6.2 8.6C6.2 6.9 7.5 5.8 8.9 5.8" fill="none" stroke="#ffffff" strokeOpacity="0.6" strokeWidth="1.5" strokeLinecap="round" />
    </>
  ),
  // 花瓣：樱花的一片，尖上有个小缺口，歪着贴
  petal: () => (
    <g transform="rotate(-24 12 12)">
      <path d="M12 22C7.2 18.2 4.2 13.4 4.9 8.6C5.4 5.2 7.6 2.6 9.9 2L12 6.2L14.1 2C16.4 2.6 18.6 5.2 19.1 8.6C19.8 13.4 16.8 18.2 12 22Z" fill="currentColor" />
      <path d="M12 21.2C10.5 18.6 10.3 16 12 12.6C13.7 16 13.5 18.6 12 21.2Z" {...SHADE} />
      <path d="M7.3 10C7.4 8 8.2 6.2 9.4 5.2" fill="none" stroke="#ffffff" strokeOpacity="0.6" strokeWidth="1.3" strokeLinecap="round" />
    </g>
  ),
  cloud: () => (
    <>
      <path d="M6.8 19A4.6 4.6 0 0 1 6.1 9.9A6.3 6.3 0 0 1 18 8.9A5.1 5.1 0 0 1 17.6 19Z" fill="currentColor" />
      <path d="M7.4 11.6A4.7 4.7 0 0 1 11.4 6.9" fill="none" stroke="#ffffff" strokeOpacity="0.6" strokeWidth="1.4" strokeLinecap="round" />
    </>
  ),
  // 猫爪：一块掌垫，四个趾垫
  paw: () => (
    <>
      <path d="M12 11.6C8.7 11.6 6.2 14.3 6.2 17.1C6.2 19.3 7.9 20.5 9.8 20.5C10.8 20.5 11.3 20.1 12 20.1C12.7 20.1 13.2 20.5 14.2 20.5C16.1 20.5 17.8 19.3 17.8 17.1C17.8 14.3 15.3 11.6 12 11.6Z" fill="currentColor" />
      <ellipse cx="4.9" cy="10.4" rx="1.9" ry="2.5" transform="rotate(-22 4.9 10.4)" fill="currentColor" />
      <ellipse cx="9.2" cy="5.9" rx="2" ry="2.7" transform="rotate(-8 9.2 5.9)" fill="currentColor" />
      <ellipse cx="14.8" cy="5.9" rx="2" ry="2.7" transform="rotate(8 14.8 5.9)" fill="currentColor" />
      <ellipse cx="19.1" cy="10.4" rx="1.9" ry="2.5" transform="rotate(22 19.1 10.4)" fill="currentColor" />
      <ellipse cx="10.2" cy="15.2" rx="1.6" ry="1.1" transform="rotate(-24 10.2 15.2)" {...HIGHLIGHT} />
    </>
  ),
  leaf: () => (
    <>
      <path d="M4.3 19.9C3.4 11 8.6 4.2 19.9 4.1C20.3 14.9 13.9 20.6 4.3 19.9Z" fill="currentColor" />
      <path d="M4.9 19.3L15.6 8.6M9 15.2V10.9M9 15.2H13.4" fill="none" stroke="#000000" strokeOpacity="0.2" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M7 11C8.6 8.3 11.2 6.6 14.2 6" fill="none" stroke="#ffffff" strokeOpacity="0.5" strokeWidth="1.2" strokeLinecap="round" />
    </>
  ),
  crown: () => (
    <>
      <path d="M4.3 17.4L3 7.8L8.2 11.8L12 4.9L15.8 11.8L21 7.8L19.7 17.4Z" fill="currentColor" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <rect x="4" y="18.2" width="16" height="2.4" rx="1.2" fill="currentColor" />
      <rect x="4" y="18.2" width="16" height="2.4" rx="1.2" {...SHADE} />
      <circle cx="12" cy="14" r="1.5" {...HIGHLIGHT} />
      <circle cx="7.6" cy="15" r="1" {...HIGHLIGHT} />
      <circle cx="16.4" cy="15" r="1" {...HIGHLIGHT} />
    </>
  ),
  pixel_heart: () => (
    <>
      <path d={PIXEL_HEART} fill="currentColor" shapeRendering="crispEdges" />
      <path d="M4.5 6h3v3h-3z" {...HIGHLIGHT} shapeRendering="crispEdges" />
      <path d="M16.5 12h3v3h-3zM13.5 15h3v3h-3zM10.5 18h3v3h-3z" {...SHADE} shapeRendering="crispEdges" />
    </>
  ),
  bolt: () => (
    <>
      <path d="M13.9 2.2L4.9 13.3H11L9.7 21.8L19.1 10.2H12.7Z" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M12.4 4.8L7.4 11.6H10Z" {...HIGHLIGHT} />
    </>
  ),
  snow: () => (
    <g fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {[0, 60, 120, 180, 240, 300].map((angle) => <path key={angle} d={SNOW_ARM} transform={`rotate(${angle} 12 12)`} />)}
    </g>
  )
};

export interface OrnamentSpec {
  key: OrnamentKey;
  corner: OrnamentCorner;
  /** 校验过的 #hex */
  color: string;
  /** 像素，10–28 */
  size: number;
  animated: boolean;
}

/**
 * 一个角饰。绝对定位在气泡的某个角上，位置和探出去多少在 shop.css（.kcsk-orn--tl 等）。
 * motion 为 false（系统设了减少动态效果、或开了性能优先）时不动。
 */
export function Ornament({ spec, motion, delay }: { spec: OrnamentSpec; motion: boolean; delay: number }): JSX.Element {
  const Shape = SHAPES[spec.key];
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className={`kcsk-orn kcsk-orn--${spec.corner}${spec.animated && motion ? ` kcsk-orn--${MOTION[spec.key]}` : ''}`}
      style={{ '--kcsk-os': `${spec.size}px`, '--kcsk-delay': `${delay}s`, color: spec.color } as CSSProperties}
    >
      <Shape />
    </svg>
  );
}
