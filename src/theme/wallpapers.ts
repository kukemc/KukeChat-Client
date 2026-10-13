/**
 * 内置背景：全部用 CSS 渐变和内联 SVG 画出来，仓库里不放图片。
 *
 * 每张背景给两样东西：
 *   · image —— 铺在界面上的那张，写成 background 简写，可以叠多层（底色渐变 + 网格、噪点之类的纹理）；
 *   · frost —— 毛玻璃面透出来的「模糊版」，必须是单个 <image>。
 *       纯渐变本身就是糊的，直接复用；纹理（网格、点阵、噪点）模糊之后看不见，只留底色那一层；
 *       有形状的场景（山、圆、色带）给一个函数，按模糊强度在同一张 SVG 里套 feGaussianBlur。
 *     所以内置背景的毛玻璃不需要任何脚本计算，浏览器把这张 SVG 栅格化一次就完了。
 */

import type { ThemeScheme } from './themes';

export type FrostSource = string | ((blur: number) => string);

export interface BuiltinWallpaper {
  id: string;
  name: string;
  image: Record<ThemeScheme, string>;
  frost: Record<ThemeScheme, FrostSource>;
}

const STRETCH = 'center / 100% 100% no-repeat';

function svgImage(body: string, attributes = "width='100%' height='100%' preserveAspectRatio='none' viewBox='0 0 100 100'"): string {
  return `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' ${attributes}>${body}</svg>`)}")`;
}

type Stain = [x: number, y: number, radius: number, color: string, opacity?: number];

/** 几团晕开的颜色。坐标和半径是 0–100 的百分比：整张图会被拉伸到铺满，色团跟着窗口比例变形，没有接缝。 */
function stains(list: Stain[]): { defs: string; body: string } {
  return {
    defs: list.map(([, , , color, opacity = 1], index) => `<radialGradient id='g${index}'><stop offset='0' stop-color='${color}' stop-opacity='${opacity}'/><stop offset='1' stop-color='${color}' stop-opacity='0'/></radialGradient>`).join(''),
    body: list.map(([x, y, radius], index) => `<circle cx='${x}' cy='${y}' r='${radius}' fill='url(#g${index})'/>`).join('')
  };
}

/** 一块底色上晕开几团颜色，没有任何硬边，模糊版就是它自己。 */
function mesh(base: string, list: Stain[]): string {
  const { defs, body } = stains(list);
  return svgImage(`<defs>${defs}</defs><rect width='100' height='100' fill='${base}'/>${body}`);
}

interface Scene {
  /** 天空 / 底色：从上到下的两个颜色。 */
  sky: [top: string, bottom: string];
  glow?: Stain[];
  /** 有硬边的形状（SVG 片段）。画得比画布大一圈：模糊时边缘才有东西可采，不会往里发虚。 */
  shapes: string;
}

/** 场景的画布是 160×100，按「铺满并居中裁切」摆进窗口：形状不会被拉变形，窗口比例不同时只是两侧或上下多裁掉一点。 */
const SCENE = "width='100%' height='100%' preserveAspectRatio='xMidYMid slice' viewBox='0 0 160 100'";
/** 窗口宽 1100 时一个画布单位大约是 7 个像素，模糊强度按这个换算。 */
const SCENE_UNIT = 7;

/**
 * 有形状的场景。清晰版和模糊版是同一份 SVG，模糊版只是给形状那一组套了高斯模糊。
 */
function scene({ sky, glow = [], shapes }: Scene): { image: string; frost: (blur: number) => string } {
  const { defs, body } = stains(glow);
  const head = `<defs><linearGradient id='s' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='${sky[0]}'/><stop offset='1' stop-color='${sky[1]}'/></linearGradient>${defs}`;
  const backdrop = `<rect x='-40' y='-40' width='240' height='180' fill='url(#s)'/>${body}`;
  return {
    image: `${svgImage(`${head}</defs>${backdrop}${shapes}`, SCENE)} ${STRETCH}`,
    frost: (blur) => svgImage(`${head}<filter id='f' x='-30%' y='-30%' width='160%' height='160%' color-interpolation-filters='sRGB'><feGaussianBlur stdDeviation='${(blur / SCENE_UNIT).toFixed(2)}'/></filter></defs>${backdrop}<g filter='url(#f)'>${shapes}</g>`, SCENE)
  };
}

/** 一层山：一条起伏的线往下填到底。 */
function ridge(path: string, color: string, opacity = 1): string {
  return `<path d='M-40 ${path} L200 140 L-40 140Z' fill='${color}' fill-opacity='${opacity}'/>`;
}

function disc(x: number, y: number, radius: number, color: string, opacity = 1): string {
  return `<circle cx='${x}' cy='${y}' r='${radius}' fill='${color}' fill-opacity='${opacity}'/>`;
}

/** 一圈细环，可以压扁并倾斜（行星环）。 */
function ring(x: number, y: number, radiusX: number, radiusY: number, tilt: number, color: string, opacity: number, width = 0.3): string {
  return `<ellipse cx='${x}' cy='${y}' rx='${radiusX}' ry='${radiusY}' transform='rotate(${tilt} ${x} ${y})' fill='none' stroke='${color}' stroke-opacity='${opacity}' stroke-width='${width}'/>`;
}

function stars(color: string, list: Array<[x: number, y: number, radius: number, opacity: number]>): string {
  return list.map(([x, y, radius, opacity]) => disc(x, y, radius, color, opacity)).join('');
}

/** 可以平铺的噪点：一小块分形噪声只留 alpha，颜色由调用方给（浅色主题压深色颗粒，深色主题压浅色颗粒）。 */
function grain(color: string, strength: number): string {
  return svgImage(
    `<filter id='n' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='0.82' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 ${strength} 0' result='a'/><feComposite in='SourceGraphic' in2='a' operator='in'/></filter><rect width='180' height='180' fill='${color}' filter='url(#n)'/>`,
    "width='180' height='180'"
  );
}

function linear(angle: number, ...stops: string[]): string {
  return `linear-gradient(${angle}deg, ${stops.join(', ')})`;
}

/** 只有一层渐变的背景，模糊版就是它自己。 */
function plain(id: string, name: string, light: string, dark: string): BuiltinWallpaper {
  return { id, name, image: { light, dark }, frost: { light, dark } };
}

/** 底色上压一层平铺的纹理。纹理写成不带底色的 background 层。 */
function textured(id: string, name: string, base: Record<ThemeScheme, string>, texture: Record<ThemeScheme, string>): BuiltinWallpaper {
  return {
    id,
    name,
    image: { light: `${texture.light}, ${base.light} ${STRETCH}`, dark: `${texture.dark}, ${base.dark} ${STRETCH}` },
    frost: base
  };
}

function scenic(id: string, name: string, light: Scene, dark: Scene): BuiltinWallpaper {
  const lightScene = scene(light);
  const darkScene = scene(dark);
  return { id, name, image: { light: lightScene.image, dark: darkScene.image }, frost: { light: lightScene.frost, dark: darkScene.frost } };
}

function gridLines(color: string, size: number): string {
  return `linear-gradient(${color} 1px, transparent 1px) 0 0 / ${size}px ${size}px, linear-gradient(90deg, ${color} 1px, transparent 1px) 0 0 / ${size}px ${size}px`;
}

function dots(color: string, size: number): string {
  return `radial-gradient(circle at 1.5px 1.5px, ${color} 1.2px, transparent 1.6px) 0 0 / ${size}px ${size}px`;
}

const STREAM = {
  light: mesh('#fafbff', [[12, 18, 52, '#ffd6e7'], [86, 12, 50, '#c5e4ff'], [70, 88, 52, '#d8ffe4']]),
  dark: mesh('#161821', [[12, 18, 52, '#4a1d36'], [86, 12, 50, '#173a5e'], [70, 88, 52, '#16402b']])
};

/* 远山四层，由浅到深；天上一轮日 / 月 */
const RIDGES = ['64 C-10 60 16 50 40 57 S84 44 112 53 S168 46 200 56', '73 C-6 70 22 62 50 68 S96 60 124 66 S172 62 200 70', '82 C-4 78 28 76 56 80 S102 72 134 78 S178 76 200 80', '91 C0 88 34 86 64 90 S110 84 146 89 S184 88 200 90'];

function harbor(tones: string[], sun: string, sunOpacity: number): string {
  return `${disc(114, 25, 4.6, sun, sunOpacity)}${RIDGES.map((path, index) => ridge(path, tones[index])).join('')}`;
}

const STARFIELD: Array<[number, number, number, number]> = [[14, 12, 0.32, 0.9], [38, 30, 0.22, 0.7], [58, 9, 0.28, 0.8], [76, 44, 0.2, 0.6], [92, 18, 0.36, 0.9], [104, 62, 0.22, 0.7], [128, 84, 0.3, 0.8], [146, 12, 0.24, 0.7], [152, 58, 0.34, 0.9], [22, 54, 0.26, 0.7], [48, 86, 0.3, 0.8], [70, 70, 0.2, 0.6], [8, 88, 0.24, 0.7], [136, 40, 0.2, 0.6]];

/* 一颗带环的行星、一颗小卫星，背后是星点 */
function nebula(planet: string, moon: string, ringColor: string, starColor: string): string {
  return `${stars(starColor, STARFIELD)}${ring(118, 34, 21, 4.6, -16, ringColor, 0.5)}${disc(118, 34, 11, planet, 0.62)}${disc(36, 72, 5.2, moon, 0.5)}`;
}

/* 三条斜着的光带，右上角一轮落日 */
function ember(bands: string[], sun: string): string {
  return `<path d='M-40 44 L96 -40 L132 -40 L-40 66Z' fill='${bands[0]}' fill-opacity='0.6'/><path d='M30 140 L200 26 L200 58 L86 140Z' fill='${bands[1]}' fill-opacity='0.5'/><path d='M-40 80 L96 140 L52 140 L-40 98Z' fill='${bands[2]}' fill-opacity='0.62'/>${disc(132, 22, 6.5, sun, 0.9)}`;
}

export const BUILTIN_WALLPAPERS: BuiltinWallpaper[] = [
  plain('blossom', '花信', linear(160, '#ffe3ec 0%', '#fff4e6 48%', '#e5dbff 100%'), linear(160, '#3a1f2b 0%', '#2b2030 52%', '#1f2238 100%')),
  plain('dusk', '晚霞', linear(165, '#ffe8cc 0%', '#ffd8a8 38%', '#ffc9c9 72%', '#eebefa 100%'), linear(165, '#3b2314 0%', '#3a1d24 55%', '#2a1d3a 100%')),
  plain('tide', '潮汐', linear(170, '#d0ebff 0%', '#c5f6fa 45%', '#e6fcf5 100%'), linear(170, '#0b2535 0%', '#0d2f3a 50%', '#102a2c 100%')),
  plain('aurora', '极光', linear(135, '#d3f9d8 0%', '#c5f6fa 34%', '#dbe4ff 68%', '#f3d9fa 100%'), linear(135, '#10291c 0%', '#0f2a33 36%', '#1a2147 70%', '#2c1a3a 100%')),
  plain('paper', '纸张', linear(180, '#fbf8f1 0%', '#f3eee3 100%'), linear(180, '#24221f 0%', '#1c1b19 100%')),
  {
    id: 'mesh',
    name: '流光',
    // 铺在界面上的仍是原来那几层 CSS 渐变（老用户看到的不变），模糊版换成等价的 SVG：毛玻璃面只接受单张图
    image: {
      light: 'radial-gradient(at 12% 18%, #ffd6e7 0, transparent 46%), radial-gradient(at 86% 12%, #c5e4ff 0, transparent 44%), radial-gradient(at 70% 88%, #d8ffe4 0, transparent 46%), linear-gradient(#fafbff, #fafbff)',
      dark: 'radial-gradient(at 12% 18%, #4a1d36 0, transparent 46%), radial-gradient(at 86% 12%, #173a5e 0, transparent 44%), radial-gradient(at 70% 88%, #16402b 0, transparent 46%), linear-gradient(#161821, #161821)'
    },
    frost: STREAM
  },
  scenic('harbor', '雾港',
    { sky: ['#cfe1f4', '#f4ece6'], glow: [[114, 25, 26, '#fff7df', 0.95]], shapes: harbor(['#b4cbe3', '#93b3d4', '#7399c2', '#577fae'], '#fffaf0', 0.95) },
    { sky: ['#0a1322', '#1b2740'], glow: [[114, 25, 26, '#3a5a94', 0.5]], shapes: harbor(['#1b2a45', '#152238', '#101a2c', '#0b1320'], '#d5e2fb', 0.85) }),
  scenic('nebula', '星云',
    { sky: ['#e9e6ff', '#f7efff'], glow: [[18, 16, 70, '#b9a8ff', 0.85], [150, 30, 64, '#8fd3ff', 0.8], [92, 104, 70, '#ffb8de', 0.8]], shapes: nebula('#8f7dff', '#ff9fd0', '#7f6bff', '#7f6bff') },
    { sky: ['#0b0b1c', '#150f26'], glow: [[18, 16, 70, '#3b2a8c', 0.9], [150, 30, 64, '#0f4a78', 0.85], [92, 104, 70, '#6a1f5a', 0.8]], shapes: nebula('#6d55e0', '#b0367f', '#b3a6ff', '#ffffff') }),
  scenic('ember', '余烬',
    { sky: ['#fff1e2', '#ffe3d3'], glow: [[132, 22, 44, '#ffd27a', 0.8]], shapes: ember(['#ffb48a', '#ff8d68', '#ffcf8a'], '#ffc45c') },
    { sky: ['#1a100c', '#22120f'], glow: [[132, 22, 44, '#7a3a10', 0.8]], shapes: ember(['#6b2c12', '#8a2f1c', '#5a3a0e'], '#ff9a3c') }),
  textured('grid', '网格', { light: linear(180, '#f6f8fc 0%', '#e9eef7 100%'), dark: linear(180, '#14171d 0%', '#0e1014 100%') }, { light: gridLines('rgba(40, 70, 130, 0.075)', 28), dark: gridLines('rgba(150, 180, 255, 0.06)', 28) }),
  textured('dots', '点阵', { light: linear(160, '#f4f6fb 0%', '#eef1f8 100%'), dark: linear(160, '#15171c 0%', '#101216 100%') }, { light: dots('rgba(40, 60, 110, 0.16)', 20), dark: dots('rgba(170, 190, 255, 0.13)', 20) }),
  textured('grain', '砂纸', { light: linear(150, '#efe9df 0%', '#e6ebe4 55%', '#dfe6ee 100%'), dark: linear(150, '#211e1a 0%', '#1a1d1b 55%', '#171a20 100%') }, { light: `${grain('#3b3226', 0.34)} 0 0 / 180px 180px`, dark: `${grain('#f1e9dc', 0.2)} 0 0 / 180px 180px` })
];

export function getBuiltinWallpaper(id: string): BuiltinWallpaper | undefined {
  return BUILTIN_WALLPAPERS.find((item) => item.id === id);
}
