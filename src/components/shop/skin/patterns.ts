/**
 * 气泡皮肤的内置纹样（docs/shop.md 2.2 的 pattern.key）。
 *
 * 样式里只有图案的名字、颜色、不透明度和缩放；图案本身是这里画的：每个图案是一小块可以无缝平铺的 SVG，
 * 由这里的代码拼成 data: 地址，当作 CSS 背景铺在气泡里。拼进去的只有三样东西 —— 校验过的 #hex 颜色、
 * 夹过范围的数字、这个文件里写死的路径 —— 服务端的字符串一个字都不会进到地址里。
 *
 * 画的时候守几条：线条和形状都偏小偏疏（上面要压字），每块的四边能对上（平铺看不出接缝），
 * 一块里的元素大小、位置错开一点（不要一眼看出格子）。加新图案要发版，名字也要写进契约。
 */

export const PATTERN_KEYS = ['dots', 'grid', 'stripes', 'waves', 'stars', 'hearts', 'pixels', 'clouds', 'petals', 'noise'] as const;
export type PatternKey = (typeof PATTERN_KEYS)[number];

export function isPatternKey(value: unknown): value is PatternKey {
  return typeof value === 'string' && (PATTERN_KEYS as readonly string[]).includes(value);
}

interface PatternTile {
  width: number;
  height: number;
  /** 画一块。color 是校验过的 #hex，alpha 是 0–1 的数字 */
  draw: (color: string, alpha: number) => string;
}

function round(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/** 四角星（闪光）：四个尖朝上下左右，边往里收。 */
export function sparklePath(cx: number, cy: number, r: number): string {
  const a = 0.1 * r;
  const b = 0.46 * r;
  const p = (x: number, y: number): string => `${round(cx + x)} ${round(cy + y)}`;
  return `M${p(0, -r)}C${p(a, -b)} ${p(b, -a)} ${p(r, 0)}C${p(b, a)} ${p(a, b)} ${p(0, r)}C${p(-a, b)} ${p(-b, a)} ${p(-r, 0)}C${p(-b, -a)} ${p(-a, -b)} ${p(0, -r)}Z`;
}

/** 爱心：s 是半宽，(cx, cy) 是中心。 */
export function heartPath(cx: number, cy: number, s: number): string {
  const p = (x: number, y: number): string => `${round(cx + x * s)} ${round(cy + y * s)}`;
  return `M${p(0, 0.92)}C${p(-0.7, 0.42)} ${p(-1, 0.05)} ${p(-1, -0.36)}C${p(-1, -0.68)} ${p(-0.76, -0.9)} ${p(-0.5, -0.9)}C${p(-0.29, -0.9)} ${p(-0.1, -0.78)} ${p(0, -0.58)}C${p(0.1, -0.78)} ${p(0.29, -0.9)} ${p(0.5, -0.9)}C${p(0.76, -0.9)} ${p(1, -0.68)} ${p(1, -0.36)}C${p(1, 0.05)} ${p(0.7, 0.42)} ${p(0, 0.92)}Z`;
}

/** 一朵小云：(x, y) 是左上角，k 是缩放，原始大小约 22×13。 */
function cloudPath(x: number, y: number, k: number): string {
  const p = (px: number, py: number): string => `${round(x + px * k)} ${round(y + py * k)}`;
  const r = (value: number): string => round(value * k);
  return `M${p(5, 13)}A${r(4.2)} ${r(4.2)} 0 0 1 ${p(4.6, 4.7)}A${r(5.6)} ${r(5.6)} 0 0 1 ${p(15.2, 3.6)}A${r(4.8)} ${r(4.8)} 0 0 1 ${p(17, 13)}Z`;
}

/** 一片花瓣：尖朝下、顶上有个小缺口，以原点为中心，高约 14。配合 transform 摆位置。 */
const PETAL = 'M0 7C-3.6 4.2 -5 0.6 -4 -2.8C-3.4 -4.8 -1.9 -6.2 -0.9 -6.6L0 -5L0.9 -6.6C1.9 -6.2 3.4 -4.8 4 -2.8C5 0.6 3.6 4.2 0 7Z';

/** 固定种子的伪随机数：细颗粒每次画出来都得是同一张，不然同一件皮肤的两个气泡对不上，缓存也白做。 */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const NOISE_SIZE = 32;
const NOISE_LEVELS = [1, 0.62, 0.34];
const NOISE_PATHS: string[] = (() => {
  const random = seeded(20260212);
  const paths = NOISE_LEVELS.map(() => '');
  for (let index = 0; index < 96; index += 1) {
    const x = Math.floor(random() * NOISE_SIZE);
    const y = Math.floor(random() * NOISE_SIZE);
    paths[Math.floor(random() * NOISE_LEVELS.length)] += `M${x} ${y}h1v1h-1z`;
  }
  return paths;
})();

const TILES: Record<PatternKey, PatternTile> = {
  // 圆点：错开的两排
  dots: {
    width: 18,
    height: 18,
    draw: (color, alpha) => `<g fill='${color}' fill-opacity='${alpha}'><circle cx='4.5' cy='4.5' r='1.6'/><circle cx='13.5' cy='13.5' r='1.6'/></g>`
  },
  // 细格：一像素的线
  grid: {
    width: 18,
    height: 18,
    draw: (color, alpha) => `<path d='M18 .5H.5V18' fill='none' stroke='${color}' stroke-opacity='${alpha}'/>`
  },
  // 斜纹：45°，线比间隙窄
  stripes: {
    width: 14,
    height: 14,
    draw: (color, alpha) => `<path d='M-3.5 3.5l7-7M0 14L14 0M10.5 17.5l7-7' stroke='${color}' stroke-opacity='${alpha}' stroke-width='3'/>`
  },
  // 波浪：两行错半个波长
  waves: {
    width: 36,
    height: 22,
    draw: (color, alpha) => `<g fill='none' stroke='${color}' stroke-opacity='${alpha}' stroke-width='1.5' stroke-linecap='round'><path d='M0 6q9-6 18 0t18 0'/><path d='M-18 17q9-6 18 0t18 0t18 0'/></g>`
  },
  // 星点：三颗大小不一的四角星，几粒小点
  stars: {
    width: 46,
    height: 46,
    draw: (color, alpha) => `<g fill='${color}' fill-opacity='${alpha}'><path d='${sparklePath(10, 11, 4.6)}'/><path d='${sparklePath(33, 29, 3.2)}'/><path d='${sparklePath(37, 8, 1.9)}'/><circle cx='21' cy='37' r='1'/><circle cx='24' cy='17' r='.8'/><circle cx='5' cy='30' r='.7'/><circle cx='42' cy='42' r='.6'/></g>`
  },
  // 小爱心：一大一小错开，各歪一点
  hearts: {
    width: 32,
    height: 30,
    draw: (color, alpha) => `<g fill='${color}' fill-opacity='${alpha}'><path d='${heartPath(0, 0, 4.4)}' transform='translate(9 9) rotate(-12)'/><path d='${heartPath(0, 0, 3.2)}' transform='translate(24 22) rotate(14)'/></g>`
  },
  // 像素块：四块深浅不一的方块
  pixels: {
    width: 20,
    height: 20,
    draw: (color, alpha) => `<g fill='${color}'><rect width='5' height='5' fill-opacity='${round(alpha)}'/><rect x='10' y='5' width='5' height='5' fill-opacity='${round(alpha * 0.55)}'/><rect x='5' y='15' width='5' height='5' fill-opacity='${round(alpha * 0.78)}'/><rect x='15' y='10' width='5' height='5' fill-opacity='${round(alpha * 0.4)}'/></g>`
  },
  // 云朵：一大一小
  clouds: {
    width: 66,
    height: 40,
    draw: (color, alpha) => `<g fill='${color}' fill-opacity='${alpha}'><path d='${cloudPath(5, 3, 1)}'/><path d='${cloudPath(38, 23, 0.7)}'/></g>`
  },
  // 花瓣：四片，朝向和大小都不一样，像是飘下来的
  petals: {
    width: 44,
    height: 44,
    draw: (color, alpha) => `<g fill='${color}' fill-opacity='${alpha}'><path d='${PETAL}' transform='translate(11 11) rotate(-32) scale(.8)'/><path d='${PETAL}' transform='translate(33 28) rotate(38) scale(.62)'/><path d='${PETAL}' transform='translate(31 7) rotate(96) scale(.4)'/><path d='${PETAL}' transform='translate(9 35) rotate(-80) scale(.46)'/></g>`
  },
  // 细颗粒：一像素的点，三档深浅
  noise: {
    width: NOISE_SIZE,
    height: NOISE_SIZE,
    draw: (color, alpha) => `<g fill='${color}'>${NOISE_PATHS.map((path, level) => `<path d='${path}' fill-opacity='${round(alpha * NOISE_LEVELS[level])}'/>`).join('')}</g>`
  }
};

export interface PatternPaint {
  /** CSS 的 url("data:image/svg+xml,…") */
  image: string;
  /** background-size */
  size: string;
}

const cache = new Map<string, PatternPaint>();
const MAX_CACHE = 120;

/**
 * 画一种纹样。color 必须是校验过的 #hex，alpha、scale 是已经夹到合法范围的数字 —— 调用方是 bubbleSkin.ts，那里负责校验。
 */
export function patternPaint(key: PatternKey, color: string, alpha: number, scale: number): PatternPaint {
  const id = `${key}|${color}|${alpha}|${scale}`;
  const known = cache.get(id);
  if (known) {
    return known;
  }
  const tile = TILES[key];
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${tile.width}' height='${tile.height}' viewBox='0 0 ${tile.width} ${tile.height}'>${tile.draw(color, alpha)}</svg>`;
  const paint: PatternPaint = {
    image: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`,
    size: `${round(tile.width * scale)}px ${round(tile.height * scale)}px`
  };
  if (cache.size >= MAX_CACHE) {
    cache.clear();
  }
  cache.set(id, paint);
  return paint;
}
