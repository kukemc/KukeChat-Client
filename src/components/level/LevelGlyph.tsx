import type { CSSProperties } from 'react';
import type { LevelIconKey } from '@/types/level';

/**
 * 等级图标的四个图形：星星、月亮、太阳、皇冠。和气泡皮肤的角饰（shop/skin/ornaments.tsx）是同一套画法 ——
 * 一个主体色，叠一块提亮的面和一圈压暗的边 —— 但这里是为 12–14 像素画的：画板只有 16×16，形状更饱满，
 * 细节只留在放大之后才看得见的地方（星星的棱面、月亮旁的小星、皇冠上的宝石）。
 *
 * 颜色不写在这里：每个部位只有一个类名（klv-a 主体 / klv-b 提亮 / klv-c 压暗 / klv-d 点缀 / klv-w 高光），
 * 四种图形各自的配色在 styles/level.css（.klv-g--star 等），深色模式下换一组。这是插画，不是界面图标，所以不走 ui/Icon。
 */

function point(cx: number, cy: number, radius: number, degrees: number): string {
  const angle = (degrees * Math.PI) / 180;
  return `${Math.round((cx + radius * Math.sin(angle)) * 100) / 100} ${Math.round((cy - radius * Math.cos(angle)) * 100) / 100}`;
}

const STAR_CENTER = [8, 8.55] as const;
const STAR_OUTER = 7;
const STAR_INNER = 3.15;
/** 五角星的十个顶点 */
const STAR_POINTS = Array.from({ length: 10 }, (_, index) => point(STAR_CENTER[0], STAR_CENTER[1], index % 2 === 0 ? STAR_OUTER : STAR_INNER, index * 36)).join(' ');
/** 每个角靠左的那半边提亮，五角星就有了棱 */
const STAR_FACETS = Array.from({ length: 5 }, (_, index) => `M${point(STAR_CENTER[0], STAR_CENTER[1], STAR_OUTER - 0.5, index * 72)}L${point(STAR_CENTER[0], STAR_CENTER[1], STAR_INNER - 0.25, index * 72 - 36)}L${STAR_CENTER[0]} ${STAR_CENTER[1]}Z`).join('');
const SUN_RAYS = Array.from({ length: 8 }, (_, index) => `M${point(8, 8, 5.6, index * 45)}L${point(8, 8, 7.1, index * 45)}`).join('');

const SHAPES: Record<LevelIconKey, JSX.Element> = {
  star: (
    <>
      <polygon className="klv-a" points={STAR_POINTS} />
      <path className="klv-b" d={STAR_FACETS} />
    </>
  ),
  // 一弯新月，缺口里一颗小星
  moon: (
    <>
      <path className="klv-a" d="M13.9 9.9A6.4 6.4 0 1 1 6.1 2.1A5.8 5.8 0 0 0 13.9 9.9Z" />
      <path className="klv-b klv-line" d="M4 5.3A5.5 5.5 0 0 0 3.7 11.5" />
      <path className="klv-d" d="M11.9 2.2Q12.2 4 14 4.3Q12.2 4.6 11.9 6.4Q11.6 4.6 9.8 4.3Q11.6 4 11.9 2.2Z" />
    </>
  ),
  sun: (
    <>
      <path className="klv-d klv-line" d={SUN_RAYS} />
      <circle className="klv-a" cx="8" cy="8" r="3.75" />
      <path className="klv-b klv-line" d="M5.9 7.5A2.3 2.3 0 0 1 7.6 5.85" />
    </>
  ),
  // 三个尖、尖上各一颗珠，正中一粒红宝石
  crown: (
    <>
      <path className="klv-a" d="M2.75 11.3L1.75 5.5L5.3 8.1L8 3.6L10.7 8.1L14.25 5.5L13.25 11.3Z" />
      <rect className="klv-c" x="2.7" y="11.9" width="10.6" height="2.1" rx="1.05" />
      <circle className="klv-b" cx="1.75" cy="4.9" r="1.05" />
      <circle className="klv-b" cx="8" cy="3" r="1.1" />
      <circle className="klv-b" cx="14.25" cy="4.9" r="1.05" />
      <circle className="klv-d" cx="8" cy="9.4" r="1.2" />
      <path className="klv-w klv-line" d="M3.55 7.9L3.95 10.3" />
    </>
  )
};

/** 一个图标。大小由 --klv-s 决定（默认 13 像素），可以用 size 单独指定。 */
export function LevelGlyph({ kind, size, className }: { kind: LevelIconKey; size?: number; className?: string }): JSX.Element {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" className={`klv-g klv-g--${kind}${className ? ` ${className}` : ''}`} style={size ? { '--klv-s': `${size}px` } as CSSProperties : undefined}>
      {SHAPES[kind]}
    </svg>
  );
}
