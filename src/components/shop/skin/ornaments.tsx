import type { CSSProperties } from 'react';
import { heartPath, sparklePath } from './patterns';

/**
 * 气泡皮肤的内置角饰（docs/shop.md 2.2 的 ornaments[].key）：骑在气泡角上的小矢量图形。
 *
 * 样式里只有图形的名字、哪个角、颜色、大小、动不动；图形本身画在这里，都在 24×24 的画板上，主体用 currentColor，
 * 再叠一点白色高光和压暗的细节让它有体积（单色的剪影贴在气泡上会显得很平）。这里是装饰插画，不是界面图标，
 * 所以不走 ui/Icon。加新图形要发版，名字也要写进契约。
 */

// cursor 往后六个是 2.0.10 加的
export const ORNAMENT_KEYS = ['sparkle', 'star', 'moon', 'sun', 'heart', 'petal', 'cloud', 'paw', 'leaf', 'crown', 'pixel_heart', 'bolt', 'snow', 'cursor', 'stamp', 'cherry', 'note', 'koi', 'planet'] as const;
export type OrnamentKey = (typeof ORNAMENT_KEYS)[number];
export const ORNAMENT_CORNERS = ['tl', 'tr', 'bl', 'br'] as const;
export type OrnamentCorner = (typeof ORNAMENT_CORNERS)[number];

export function isOrnamentKey(value: unknown): value is OrnamentKey {
  return typeof value === 'string' && (ORNAMENT_KEYS as readonly string[]).includes(value);
}

export function isOrnamentCorner(value: unknown): value is OrnamentCorner {
  return typeof value === 'string' && (ORNAMENT_CORNERS as readonly string[]).includes(value);
}

/** animated 时怎么动：闪（缩一点、淡一点）、晃（左右摆）、浮（上下飘）、跳（像心跳那样胀一下）、亮灭（光标那样一下有一下没有）。都很轻。 */
export type Motion = 'twinkle' | 'sway' | 'float' | 'pulse' | 'blink';

export const ORNAMENT_MOTION: Record<OrnamentKey, Motion> = {
  sparkle: 'twinkle', star: 'twinkle', sun: 'twinkle', snow: 'twinkle', bolt: 'twinkle',
  moon: 'float', cloud: 'float',
  petal: 'sway', leaf: 'sway', paw: 'sway', crown: 'sway',
  heart: 'pulse', pixel_heart: 'pulse',
  cursor: 'blink', stamp: 'sway', cherry: 'sway', koi: 'sway', note: 'float', planet: 'float'
};

const HIGHLIGHT = { fill: '#ffffff', fillOpacity: 0.5 } as const;
export const SHADE = { fill: '#000000', fillOpacity: 0.16 } as const;

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

/** 邮票四边的齿孔：每边五个小圆 */
const STAMP_HOLES = [4.8, 8.4, 12, 15.6, 19.2].map((at) => [`M${at - 1.1} 3a1.1 1.1 0 1 0 2.2 0a1.1 1.1 0 1 0 -2.2 0`, `M${at - 1.1} 21a1.1 1.1 0 1 0 2.2 0a1.1 1.1 0 1 0 -2.2 0`, `M1.9 ${at}a1.1 1.1 0 1 0 2.2 0a1.1 1.1 0 1 0 -2.2 0`, `M19.9 ${at}a1.1 1.1 0 1 0 2.2 0a1.1 1.1 0 1 0 -2.2 0`].join('')).join('');

/** 头像框（frameOrnaments.tsx）也画这些图形，所以导出。 */
export const ORNAMENT_SHAPES: Record<OrnamentKey, () => JSX.Element> = {
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
  ),
  // 光标：命令行的提示符「>」加一个方块光标
  cursor: () => (
    <>
      <path d="M2.6 6.6L8.2 12L2.6 17.4" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="11.4" y="4.6" width="9.6" height="14.8" rx="1" fill="currentColor" />
      <rect x="12.8" y="6" width="2.4" height="5.6" rx="0.6" {...HIGHLIGHT} />
    </>
  ),
  // 邮票：齿孔边的方块，中间一块白底上是山和太阳
  stamp: () => (
    <g transform="rotate(8 12 12)">
      <rect x="3" y="3" width="18" height="18" rx="0.8" fill="currentColor" />
      <path d={STAMP_HOLES} fill="#ffffff" fillOpacity="0.92" />
      <rect x="6" y="6" width="12" height="12" rx="0.6" fill="#ffffff" fillOpacity="0.9" />
      <path d="M7.4 16.6L10.6 11.8L12.6 14.4L14.2 12.4L16.6 16.6Z" fill="currentColor" />
      <circle cx="14.6" cy="9.2" r="1.5" fill="currentColor" />
    </g>
  ),
  // 樱桃：两颗挂在一根分叉的梗上，梗顶一片叶子
  cherry: () => (
    <>
      <path d="M7.6 13.6C8.6 9 11.6 5.4 16 3.2M16.4 13.6C16.2 9.6 16.2 6.2 16 3.2" fill="none" stroke="#6b4a2b" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M16 3.2C18 1.6 20.8 1.8 22 3.4C20.4 5 18 5.2 16 3.2Z" fill="#4caf50" />
      <circle cx="7.4" cy="16.8" r="4.6" fill="currentColor" />
      <circle cx="16.6" cy="17.6" r="4.2" fill="currentColor" />
      <path d="M16.6 21.8A4.2 4.2 0 0 0 20.6 16.4A4.6 4.6 0 0 1 16.6 21.8Z" {...SHADE} />
      <circle cx="5.6" cy="15" r="1.3" {...HIGHLIGHT} />
      <circle cx="15" cy="16" r="1.1" {...HIGHLIGHT} />
    </>
  ),
  // 音符：两个连起来的八分音符
  note: () => (
    <>
      <path d="M8.6 17.4V6L19.8 3.4V14.8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8.6 6L19.8 3.4V6.8L8.6 9.4Z" fill="currentColor" />
      <ellipse cx="6" cy="17.8" rx="3.4" ry="2.6" transform="rotate(-20 6 17.8)" fill="currentColor" />
      <ellipse cx="17.2" cy="15.2" rx="3.4" ry="2.6" transform="rotate(-20 17.2 15.2)" fill="currentColor" />
      <ellipse cx="5" cy="17" rx="1.2" ry="0.7" transform="rotate(-20 5 17)" {...HIGHLIGHT} />
      <ellipse cx="16.2" cy="14.4" rx="1.2" ry="0.7" transform="rotate(-20 16.2 14.4)" {...HIGHLIGHT} />
    </>
  ),
  // 锦鲤：头朝左，身上几块白斑，尾巴分叉
  koi: () => (
    <>
      <path d="M18.4 12.4L23 8C22.5 10.6 22.5 14.2 23.2 17Z" fill="currentColor" />
      <path d="M2.6 12.6C5.6 7.4 12 5.8 16.6 9C18 10 18.8 11.2 19 12.4C18.8 13.6 18 14.8 16.6 15.8C12 19 5.6 17.8 2.6 12.6Z" fill="currentColor" />
      <path d="M10.6 16.6L9 20.4L12.8 17.8Z" fill="currentColor" />
      <path d="M10.6 16.6L9 20.4L12.8 17.8Z" {...SHADE} />
      <path d="M8.4 9.6C10.2 8.4 12.6 8.4 14.2 9.8C12.8 11.4 10.2 11.6 8.4 9.6ZM12.8 14.6C14 13.4 15.8 13.2 17 14.2C15.8 15.4 14 15.6 12.8 14.6Z" fill="#ffffff" fillOpacity="0.88" />
      <circle cx="5.6" cy="11.6" r="0.95" fill="#1a1a1a" />
      <path d="M4.6 14.6C6.6 16.6 10 17.2 13 16.2" fill="none" stroke="#000000" strokeOpacity="0.16" strokeWidth="1" strokeLinecap="round" />
    </>
  ),
  // 行星：一个球套着一圈斜着的环，环在球后面的那半截先画；前面那半截先垫一道白边，和球分开
  planet: () => (
    <g transform="rotate(-20 12 12)">
      <path d="M1.6 12A10.4 3.4 0 0 1 22.4 12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="12" cy="12" r="6.4" fill="currentColor" />
      <path d="M12 18.4A6.4 6.4 0 0 0 18.4 12A5.4 5.4 0 0 1 12 18.4Z" {...SHADE} />
      <path d="M8.2 9.4A4.6 4.6 0 0 1 11.6 7.2" fill="none" stroke="#ffffff" strokeOpacity="0.6" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M1.6 12A10.4 3.4 0 0 0 22.4 12" fill="none" stroke="#ffffff" strokeOpacity="0.9" strokeWidth="3.4" strokeLinecap="round" />
      <path d="M1.6 12A10.4 3.4 0 0 0 22.4 12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
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
 *
 * 动的是外面这层 span，不是里面的 svg：Chrome 不把 SVG 元素上的 transform 动画放到合成器上，
 * 动 svg 的话每一帧都要在主线程上重算样式、重新分层，几十个角饰同屏时会把主线程占满。
 */
export function Ornament({ spec, motion, delay }: { spec: OrnamentSpec; motion: boolean; delay: number }): JSX.Element {
  const Shape = ORNAMENT_SHAPES[spec.key];
  return (
    <span
      aria-hidden="true"
      className={`kcsk-orn kcsk-orn--${spec.corner}${spec.animated && motion ? ` kcsk-orn--${ORNAMENT_MOTION[spec.key]}` : ''}`}
      style={{ '--kcsk-os': `${spec.size}px`, '--kcsk-delay': `${delay}s`, color: spec.color } as CSSProperties}
    >
      <svg viewBox="0 0 24 24" focusable="false">
        <Shape />
      </svg>
    </span>
  );
}
