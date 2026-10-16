/** 登录页动效共用的小工具：统一缓动曲线、减少动态效果的判断、主按钮的积木外形。 */

/** cubic-bezier(x1, y1, x2, y2) 的 JS 版，和 CSS 里的 --klg-sp 是同一条曲线。 */
export function bezier(x1: number, y1: number, x2: number, y2: number): (x: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const X = (t: number): number => ((ax * t + bx) * t + cx) * t;
  const Y = (t: number): number => ((ay * t + by) * t + cy) * t;
  const dX = (t: number): number => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    let t = x;
    for (let i = 0; i < 6; i += 1) {
      const d = dX(t);
      if (Math.abs(d) < 1e-6) break;
      t -= (X(t) - x) / d;
    }
    return Y(Math.min(1, Math.max(0, t)));
  };
}

export const EASE = bezier(0.2, 0.8, 0.2, 1);

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/* Scratch 命令积木的凹口曲线（原版深 8，这里按 0.75 压到 6），宽 32，起点距左边 16 */
const NOTCH_DN = 'c2,0 3,.75 4,1.5 l4,3 c1,.75 2,1.5 4,1.5 h12 c2,0 3,-.75 4,-1.5 l4,-3 c1,-.75 2,-1.5 4,-1.5';
const NOTCH_UP = 'c-2,0 -3,.75 -4,1.5 l-4,3 c-1,.75 -2,1.5 -4,1.5 h-12 c-2,0 -3,-.75 -4,-1.5 l-4,-3 c-1,-.75 -2,-1.5 -4,-1.5';

/** 主按钮的外形：圆角矩形 + 顶部 Scratch 凹口 + 底部凸起，一条路径画完，没有接缝。 */
export function buttonPath(w: number, h = 44, r = 8): string {
  return `M0,${r} A${r},${r} 0 0 1 ${r},0 H16 ${NOTCH_DN} H${w - r} A${r},${r} 0 0 1 ${w},${r} V${h - r} A${r},${r} 0 0 1 ${w - r},${h} H48 ${NOTCH_UP} H${r} A${r},${r} 0 0 1 0,${h - r} Z`;
}

const HAT_TOP = 'c25,-22 71,-22 96,0';

/** 静态兜底积木用的外形：命令积木（hat 为 true 时是帽子积木）。 */
export function blockPath(w: number, h: number, hat = false): string {
  const r = 4;
  const top = hat ? `M0,${16} ${HAT_TOP} H${w - r} a${r},${r} 0 0 1 ${r},${r}` : `M0,${r} a${r},${r} 0 0 1 ${r},-${r} H16 ${NOTCH_DN} H${w - r} a${r},${r} 0 0 1 ${r},${r}`;
  const y0 = hat ? 16 : 0;
  return `${top} V${y0 + h - r} a${r},${r} 0 0 1 -${r},${r} H48 ${NOTCH_UP} H${r} a${r},${r} 0 0 1 -${r},-${r} Z`;
}
