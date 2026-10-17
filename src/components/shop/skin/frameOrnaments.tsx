import type { CSSProperties } from 'react';
import { ORNAMENT_KEYS, ORNAMENT_MOTION, ORNAMENT_SHAPES, SHADE, type OrnamentKey } from './ornaments';

/**
 * 头像框上的装饰（docs/shop.md 头像框一节的 ornaments[].key）：贴在环上的小矢量图形。
 *
 * 气泡的十三个角饰在这里都能用（图形直接取 ornaments.tsx 的），另外有六个头像框专用的：
 *   cat_ears 猫耳 / halo 光环 / horns 小恶魔角 / laurel 月桂 / wings 翅膀 / bow 蝴蝶结。
 * 画法和角饰一样：24×24 的画板，主体用 currentColor，叠一点白色高光和压暗的细节。
 *
 * 其中四个是「成对」的 —— 样式里写一项，画出来是左右各一片：猫耳、恶魔角、翅膀、月桂。这里只画右边那一片，
 * 左边的是它的镜像；每一片各自贴在环上、各自转到合适的角度（位置在 avatarFrame.ts 里算），
 * 所以头像是 24 像素还是 80 像素、环粗还是细，两片都正好长在环上，不会因为整块缩放而对不上。
 * 猫耳、恶魔角、翅膀垫在头像后面（根部被头像盖住，像是从后面长出来的），其余的压在环上面。
 */

export const FRAME_ONLY_ORNAMENT_KEYS = ['cat_ears', 'halo', 'horns', 'laurel', 'wings', 'bow'] as const;
export type FrameOnlyOrnamentKey = (typeof FRAME_ONLY_ORNAMENT_KEYS)[number];
export type FrameOrnamentKey = OrnamentKey | FrameOnlyOrnamentKey;
export const FRAME_ORNAMENT_KEYS: readonly FrameOrnamentKey[] = [...ORNAMENT_KEYS, ...FRAME_ONLY_ORNAMENT_KEYS];

export const FRAME_POSITIONS = ['top', 'tr', 'right', 'br', 'bottom', 'bl', 'left', 'tl'] as const;
export type FramePosition = (typeof FRAME_POSITIONS)[number];

export function isFrameOrnamentKey(value: unknown): value is FrameOrnamentKey {
  return typeof value === 'string' && (FRAME_ORNAMENT_KEYS as readonly string[]).includes(value);
}

export function isFramePosition(value: unknown): value is FramePosition {
  return typeof value === 'string' && (FRAME_POSITIONS as readonly string[]).includes(value);
}

/** animated 时怎么动。前四种和气泡角饰共用关键帧；twitch 是耳朵偶尔抖一下，flap 是翅膀慢慢扇。 */
type FrameMotion = 'twinkle' | 'sway' | 'float' | 'pulse' | 'twitch' | 'flap';

const FRAME_MOTION: Record<FrameOnlyOrnamentKey, FrameMotion> = { cat_ears: 'twitch', halo: 'float', horns: 'pulse', laurel: 'float', wings: 'flap', bow: 'sway' };

export function frameOrnamentMotion(key: FrameOrnamentKey): FrameMotion {
  return key in FRAME_MOTION ? FRAME_MOTION[key as FrameOnlyOrnamentKey] : ORNAMENT_MOTION[key as OrnamentKey];
}

/**
 * 每种装饰怎么贴到环上（avatarFrame.ts 据此算位置）：
 *   pair     成对：一项画左右两片，spread 是每片偏离 position 的角度
 *   back     垫在头像后面
 *   turn     跟着 position 转：out 朝外（顶上是正的，右边就向右倒）；hug 贴着环（底下是正的，月桂、底下的蝴蝶结）；不写就一直正着
 *   lift     中心比环的外沿再往外多少（乘以 size）；不写就骑在环的中线上
 *   half     图形在自己画板里实际占的半宽、半高（占 size 的比例），用来算它探出头像多远
 */
export interface FrameOrnamentLayout {
  pair?: { spread: number };
  back?: boolean;
  turn?: 'out' | 'hug';
  lift?: number;
  half: [number, number];
}

const DEFAULT_LAYOUT: FrameOrnamentLayout = { half: [0.46, 0.46] };

const LAYOUT: Partial<Record<FrameOrnamentKey, FrameOrnamentLayout>> = {
  crown: { turn: 'out', lift: 0.2, half: [0.44, 0.36] },
  cat_ears: { pair: { spread: 33 }, back: true, turn: 'out', lift: 0.2, half: [0.4, 0.46] },
  horns: { pair: { spread: 37 }, back: true, turn: 'out', lift: 0.22, half: [0.36, 0.46] },
  wings: { pair: { spread: 90 }, back: true, lift: 0.26, half: [0.48, 0.4] },
  laurel: { pair: { spread: 27 }, turn: 'hug', lift: -0.04, half: [0.44, 0.3] },
  halo: { turn: 'out', lift: 0.24, half: [0.46, 0.2] },
  bow: { turn: 'hug', lift: 0.02, half: [0.46, 0.34] }
};

export function frameOrnamentLayout(key: FrameOrnamentKey): FrameOrnamentLayout {
  return LAYOUT[key] ?? DEFAULT_LAYOUT;
}

const round = (value: number): number => Math.round(value * 100) / 100;

/** 一片叶子：从 (x, y) 朝 degrees 方向长出去的梭形，length 长、width 是半宽 */
function leaf(x: number, y: number, length: number, width: number, degrees: number): string {
  const angle = (degrees * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const tipX = x + length * cos;
  const tipY = y + length * sin;
  const midX = x + length * 0.46 * cos;
  const midY = y + length * 0.46 * sin;
  return `M${round(x)} ${round(y)}Q${round(midX - width * sin)} ${round(midY + width * cos)} ${round(tipX)} ${round(tipY)}Q${round(midX + width * sin)} ${round(midY - width * cos)} ${round(x)} ${round(y)}Z`;
}

/** 月桂的一枝（右边那枝）：从左下往右上长，朝外、朝里各一排叶子，梢上一片。枝条的弯度贴着环 */
const LAUREL_STEM = 'M2.4 11.2Q12 14.6 21.6 9.4';
const LAUREL_OUTER = [leaf(3.6, 11.9, 6.4, 1.9, 44), leaf(8.2, 12.9, 6.6, 2, 36), leaf(13, 13, 6.4, 1.9, 26), leaf(17.4, 11.9, 5.6, 1.7, 14)].join('');
const LAUREL_INNER = [leaf(5.2, 11.9, 5.6, 1.7, -50), leaf(9.8, 12.6, 5.8, 1.8, -58), leaf(14.4, 12.2, 5.4, 1.7, -66)].join('');
const LAUREL_TIP = leaf(19.2, 10.6, 4.4, 1.5, -30);

/** 翅膀的羽毛分界：从根部往外的三道弧 */
const WING_FEATHERS = 'M4.6 15.4C8.4 14.6 12.6 12.4 15.8 8.6M6.2 17.4C10.4 17 14.6 15.2 18.2 12M8.4 19C11.8 19 15 18 17.6 16.2';

const FRAME_SHAPES: Record<FrameOnlyOrnamentKey, () => JSX.Element> = {
  // 猫耳（右耳）：尖稍微朝外歪一点，里面一块粉色的耳窝，外沿一道高光
  cat_ears: () => (
    <>
      <path d="M3 22.4C3.2 14.2 7.2 6.6 14.4 2.5C15.5 1.9 16.8 2.6 17 3.9C17.9 10.3 19.6 16.4 21.6 22.4Z" fill="currentColor" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M7.6 21.8C8.1 15.6 10.6 10.4 14.4 7.2C15.2 12.4 16.4 17.4 17.9 21.8Z" fill="#ff9fb8" fillOpacity="0.92" />
      <path d="M9.9 21.8C10.5 17.2 12 13.4 14 10.8" fill="none" stroke="#ffffff" strokeOpacity="0.5" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M5 16.4C5.9 11.6 8.6 7.4 12.6 4.6" fill="none" stroke="#ffffff" strokeOpacity="0.55" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M19.4 20.4C18.2 16.6 17.3 12.6 16.7 8.6" fill="none" stroke="#000000" strokeOpacity="0.14" strokeWidth="1.3" strokeLinecap="round" />
    </>
  ),
  // 光环：一个压扁的圆环，外面一圈淡淡的晕，上沿亮、下沿暗，旁边一粒小闪光
  halo: () => (
    <>
      <ellipse cx="12" cy="12" rx="9.4" ry="3.7" fill="none" stroke="currentColor" strokeOpacity="0.28" strokeWidth="5.6" />
      <ellipse cx="12" cy="12" rx="9.4" ry="3.7" fill="none" stroke="currentColor" strokeWidth="2.7" />
      <path d="M3.4 13.4A9.4 3.7 0 0 0 20.6 13.4" fill="none" stroke="#000000" strokeOpacity="0.16" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M4.2 10.2A9.4 3.7 0 0 1 14.6 8.5" fill="none" stroke="#ffffff" strokeOpacity="0.85" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M20.2 4.2L20.9 6.1L22.8 6.8L20.9 7.5L20.2 9.4L19.5 7.5L17.6 6.8L19.5 6.1Z" fill="#ffffff" fillOpacity="0.9" />
    </>
  ),
  // 小恶魔角（右角）：根粗尖细、朝外弯，几道横纹，迎光的一侧一道高光
  horns: () => (
    <>
      <path d="M4.6 22.4C3.6 15.8 6.4 10 11.8 6.6C14.6 4.9 17.6 3.6 19.8 1.8C20.7 7.4 20 12.8 17.4 17.2C16.3 19.2 14.9 20.9 13.4 22.4Z" fill="currentColor" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
      <path d="M19.4 3.6C19.8 8.2 19 12.6 16.8 16.4C15.8 18.2 14.6 19.8 13.2 21.2C15.4 17.4 16.6 13.4 16.6 9.2C16.6 7.6 17.6 5.4 19.4 3.6Z" {...SHADE} />
      <path d="M6.2 16.6C8.6 15.4 11.4 15.6 14 17.2M8 12C10.4 11 13 11.4 15.6 13M11.4 8C13.2 7.4 15 7.8 16.8 9" fill="none" stroke="#000000" strokeOpacity="0.2" strokeWidth="1" strokeLinecap="round" />
      <path d="M6.4 19.6C6.2 15.2 8.2 11.2 12 8.6" fill="none" stroke="#ffffff" strokeOpacity="0.55" strokeWidth="1.3" strokeLinecap="round" />
    </>
  ),
  // 月桂（右枝）
  laurel: () => (
    <>
      <path d={LAUREL_STEM} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d={LAUREL_OUTER} fill="currentColor" />
      <path d={LAUREL_INNER} fill="currentColor" />
      <path d={LAUREL_INNER} {...SHADE} />
      <path d={LAUREL_TIP} fill="currentColor" />
      <path d="M5.2 13.4L7.8 15.6M9.8 14.2L12.6 16M14.4 14L17.2 15.2" fill="none" stroke="#ffffff" strokeOpacity="0.55" strokeWidth="0.9" strokeLinecap="round" />
    </>
  ),
  // 翅膀（右翼）：根在左下，三层羽毛往右上展开，羽尖是分开的
  wings: () => (
    <>
      <path d="M1.6 15.2C2.4 8.6 8 3.6 16.4 2.2C19.4 1.7 21.9 2.3 23 3.4C21.5 4.3 20.4 5.5 19.8 7C21.3 7 22.4 7.5 23 8.4C21.3 9.2 20 10.4 19.2 11.9C20.5 12.1 21.4 12.7 21.9 13.6C19.9 14.3 18.3 15.4 17.2 16.9C18.2 17.3 18.9 17.9 19.2 18.8C14.2 21.9 7 21.6 1.6 15.2Z" fill="currentColor" stroke="currentColor" strokeWidth="0.9" strokeLinejoin="round" />
      <path d="M1.6 15.2C6.4 20.6 13 21.4 19.2 18.8C18.9 17.9 18.2 17.3 17.2 16.9C13 18.6 7.6 18.6 1.6 15.2Z" {...SHADE} />
      <path d={WING_FEATHERS} fill="none" stroke="#000000" strokeOpacity="0.18" strokeWidth="0.9" strokeLinecap="round" />
      <path d="M3.8 12.2C5.6 8 9.8 5 15.6 3.9" fill="none" stroke="#ffffff" strokeOpacity="0.7" strokeWidth="1.2" strokeLinecap="round" />
    </>
  ),
  // 蝴蝶结：两个环、一个结、两条飘带
  bow: () => (
    <>
      <path d="M10.6 13.4L7 21.6L9.9 20.4L11.4 22.6L12.9 14.6ZM13.4 13.4L17 21.6L14.1 20.4L12.6 22.6L11.1 14.6Z" fill="currentColor" stroke="currentColor" strokeWidth="0.8" strokeLinejoin="round" />
      <path d="M10.6 13.4L7 21.6L9.9 20.4L11.4 22.6L12.9 14.6ZM13.4 13.4L17 21.6L14.1 20.4L12.6 22.6L11.1 14.6Z" {...SHADE} />
      <path d="M11.4 11.6C8.4 6.8 4.4 4.9 2.5 6.3C0.9 8.6 1.2 14.4 2.9 16.5C5.2 17.6 8.9 15.6 11.4 11.6Z" fill="currentColor" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
      <path d="M12.6 11.6C15.6 6.8 19.6 4.9 21.5 6.3C23.1 8.6 22.8 14.4 21.1 16.5C18.8 17.6 15.1 15.6 12.6 11.6Z" fill="currentColor" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
      <path d="M10.4 11.7C8.2 12 5.8 13.2 3.6 15.2M13.6 11.7C15.8 12 18.2 13.2 20.4 15.2" fill="none" stroke="#000000" strokeOpacity="0.2" strokeWidth="1" strokeLinecap="round" />
      <path d="M3.4 9.4C3.8 8 4.8 7.2 6.2 7.4M17.8 7.4C19.2 7.2 20.2 8 20.6 9.4" fill="none" stroke="#ffffff" strokeOpacity="0.65" strokeWidth="1.2" strokeLinecap="round" />
      <rect x="9.7" y="9.1" width="4.6" height="5.4" rx="1.9" fill="currentColor" />
      <rect x="9.7" y="9.1" width="4.6" height="5.4" rx="1.9" {...SHADE} />
      <path d="M10.9 10.4C11.3 9.9 12 9.8 12.6 10" fill="none" stroke="#ffffff" strokeOpacity="0.6" strokeWidth="0.9" strokeLinecap="round" />
    </>
  )
};

function shapeOf(key: FrameOrnamentKey): () => JSX.Element {
  return key in FRAME_SHAPES ? FRAME_SHAPES[key as FrameOnlyOrnamentKey] : ORNAMENT_SHAPES[key as OrnamentKey];
}

/** 已经算好位置的一片装饰（成对的装饰是两片）。box 里只有 avatarFrame.ts 自己拼的百分比和角度。 */
export interface FramePiece {
  id: string;
  key: FrameOrnamentKey;
  /** 校验过的 #hex */
  color: string;
  animated: boolean;
  /** 垫在头像后面 */
  back: boolean;
  /** left / top / width / height / transform：相对头像那个方块的百分比 */
  box: CSSProperties;
}

/**
 * 一片装饰。外层 span 负责位置、大小、朝向（静态的），里面的 i 负责动（只动 transform / opacity），两层分开才不会互相盖掉 transform。
 * 动的是 i 而不是 svg：Chrome 不把 SVG 元素上的 transform 动画放到合成器上，动 svg 每一帧都要走主线程。
 * 样式在 shop.css（.kcaf-orn）。motion 为 false（开了性能优先）时不动。
 */
export function FrameOrnament({ piece, motion, delay }: { piece: FramePiece; motion: boolean; delay: number }): JSX.Element {
  const Shape = shapeOf(piece.key);
  return (
    <span className={`kcaf-orn${piece.back ? ' kcaf-orn--back' : ''}${piece.animated && motion ? ` kcaf-orn--${frameOrnamentMotion(piece.key)}` : ''}`} style={{ ...piece.box, '--kcaf-delay': `${delay}s`, color: piece.color } as CSSProperties} aria-hidden="true">
      <i><svg viewBox="0 0 24 24" focusable="false"><Shape /></svg></i>
    </span>
  );
}

/** 预览页的图鉴用：单独画一个图形（成对的只画右边那一片），不带定位。 */
export function FrameOrnamentGlyph({ ornament, color, size }: { ornament: FrameOrnamentKey; color: string; size: number }): JSX.Element {
  const Shape = shapeOf(ornament);
  return <svg viewBox="0 0 24 24" width={size} height={size} style={{ color, overflow: 'visible' }} aria-hidden="true" focusable="false"><Shape /></svg>;
}
