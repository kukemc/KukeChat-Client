/**
 * 礼物的内置插画：十二个矢量图形，外加一个认不出名字时用的礼物盒。
 *
 * 服务器只下发图形的名字（icon），图形本身画在这里。这些是装饰插画，不是界面图标，所以不走 ui/Icon。
 * 一套画法，保证摆在一起是一家的：
 *   - 画板都是 48×48，主体大约占 y 2 到 46；
 *   - 不描边，靠色块自己的明暗分出体积：光从左上来，右下压一块同色系的暗面，左上点一道白色高光；
 *   - 折角用同色的圆头描边磨圆（strokeLinejoin="round"），不出现尖角；
 *   - 各有各的固定配色，不跟主题走。贴着轮廓的大色块都用带颜色的中间调，不用纯白和近黑，浅色深色背景上都分得开；
 *   - 不用渐变和裁剪，所以没有 id —— 一页里画几十个、又在 shadow root 里，也不会互相串。
 * 细节的粗细按 20 像素还能看清来定（线宽不低于 1.1），放大到 96 以上也不空。
 */

export const GIFT_ICON_NAMES = ['flower', 'lollipop', 'cake', 'trophy', 'rocket', 'castle', 'star', 'heart', 'balloon', 'crown', 'cat', 'icecream'] as const;
export type GiftIconName = (typeof GIFT_ICON_NAMES)[number];

export function isGiftIconName(value: unknown): value is GiftIconName {
  return typeof value === 'string' && (GIFT_ICON_NAMES as readonly string[]).includes(value);
}

const round = (value: number): number => Math.round(value * 100) / 100;

/** 圆上的一点；角度按屏幕方向算：0 在右，90 在下，270 在上 */
function on(cx: number, cy: number, radius: number, degrees: number): string {
  const angle = (degrees * Math.PI) / 180;
  return `${round(cx + radius * Math.cos(angle))} ${round(cy + radius * Math.sin(angle))}`;
}

/** 圆右下的一弯暗面：外沿贴着圆，内沿是一段更平的弧 */
function shadeArc(cx: number, cy: number, radius: number, from = -38, to = 128): string {
  const flat = round(radius * 1.32);
  return `M${on(cx, cy, radius, from)}A${radius} ${radius} 0 0 1 ${on(cx, cy, radius, to)}A${flat} ${flat} 0 0 0 ${on(cx, cy, radius, from)}Z`;
}

/** 圆左上的一道高光（描边用），radius 传比圆小一圈的半径 */
function glintArc(cx: number, cy: number, radius: number, from = 196, to = 250): string {
  return `M${on(cx, cy, radius, from)}A${radius} ${radius} 0 0 1 ${on(cx, cy, radius, to)}`;
}

/** 五角星的十个顶点，尖朝上 */
function starPoints(cx: number, cy: number, outer: number, inner: number): string {
  return Array.from({ length: 10 }, (_, index) => on(cx, cy, index % 2 === 0 ? outer : inner, -90 + index * 36)).join(' ');
}

/** 高光：一道圆头的白线 */
const GLINT = { fill: 'none', stroke: '#ffffff', strokeOpacity: 0.62, strokeLinecap: 'round' } as const;
/** 高光：一小块白 */
const SHINE = { fill: '#ffffff', fillOpacity: 0.6 } as const;

const GOLD = '#ffcb3d';
const GOLD_HI = '#ffe487';
const GOLD_LO = '#f0a11c';
const RED = '#ff5470';
const RED_LO = '#e2315c';
const PINK = '#ff8fb3';
const PINK_LO = '#ef6292';
const BLUE = '#45b7ff';
const BLUE_LO = '#2590e6';
const GREEN = '#5ccb7f';
const GREEN_LO = '#3fae6a';

/** 花：五片花瓣绕着花心，花心在 (24, 17.5)。from / to 是这一瓣露在轮廓上、要压暗的那段弧（背光的三瓣才有） */
const FLOWER_PETALS = ([[-90], [198], [-18, -38, 92], [126, 44, 128], [54, -30, 128]] as const).map(([degrees, from, to]) => {
  const angle = (degrees * Math.PI) / 180;
  const x = round(24 + 8.2 * Math.cos(angle));
  const y = round(17.5 + 8.2 * Math.sin(angle));
  return { x, y, shade: from === undefined ? '' : shadeArc(x, y, 7.4, from, to) };
});

/** 棒棒糖的螺旋：一串半径越来越大的半圆，圆心左右交替 */
const LOLLIPOP_SWIRL = 'M24 17.5a3 3 0 0 1 6 0a6 6 0 0 1-12 0a9 9 0 0 1 18 0a11.6 11.6 0 0 1-23.2 0';

/** 蛋糕的奶油：下沿是六个长短不一的垂滴 */
const CAKE_DRIPS = [4.6, 9.4, 4.6, 6.4, 10.4, 4.6].map((depth) => `q-2.67 ${depth}-5.33 0`).join('');

/** 星星的顶点：中心 (24, 25)，外径 20，内径 9.2。O 是尖，I 是凹进去的角，从正上方顺时针数 */
const STAR = starPoints(24, 25, 20, 9.2);
const STAR_LIGHT = `24 25 ${on(24, 25, 20, 198)} ${on(24, 25, 9.2, 234)} ${on(24, 25, 20, -90)}`;
const STAR_SHADE = `24 25 ${on(24, 25, 20, -18)} ${on(24, 25, 9.2, 18)} ${on(24, 25, 20, 54)} ${on(24, 25, 9.2, 90)}`;

const SHAPES: Record<GiftIconName, () => JSX.Element> = {
  // 花：粉色的五瓣花，黄花心，一根茎一片叶
  flower: () => (
    <>
      <path d="M24 29C23 35 23.4 40.5 24.6 45.4" fill="none" stroke={GREEN_LO} strokeWidth="3" strokeLinecap="round" />
      <path d="M24.2 39.4C27 33.6 32.4 32 37.2 33.2C35.6 38.8 30 41.8 24.2 39.4Z" fill={GREEN} />
      <path d="M24.2 39.4C29 38.8 33.6 36.8 37.2 33.2C35.6 38.8 30 41.8 24.2 39.4Z" fill={GREEN_LO} />
      {FLOWER_PETALS.map(({ x, y }) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="7.4" fill={PINK} />
      ))}
      <path d={FLOWER_PETALS.map((petal) => petal.shade).join('')} fill={PINK_LO} />
      <path d={glintArc(16.2, 14.97, 4.6)} {...GLINT} strokeWidth="1.8" />
      <path d={glintArc(24, 9.3, 4.6)} {...GLINT} strokeWidth="1.8" />
      <circle cx="24" cy="17.5" r="5.6" fill={GOLD} />
      <path d={shadeArc(24, 17.5, 5.6)} fill={GOLD_LO} />
      <circle cx="22.2" cy="15.7" r="1.5" {...SHINE} />
    </>
  ),
  // 棒棒糖：紫色的圆糖，一圈浅色的螺旋，米色的棍
  lollipop: () => (
    <>
      <rect x="21.9" y="29" width="4.2" height="17.2" rx="2.1" fill="#e9cfa6" />
      <path d="M24.4 29h1.7v15.1a2.1 2.1 0 0 1-1.7 2.06Z" fill="#cfab7c" />
      <circle cx="24" cy="17.5" r="14.6" fill="#a97bff" />
      <path d={LOLLIPOP_SWIRL} fill="none" stroke="#ffe0f5" strokeWidth="3" strokeLinecap="round" />
      <path d={shadeArc(24, 17.5, 14.6)} fill="#4a1fb4" fillOpacity="0.3" />
      <path d={glintArc(24, 17.5, 11.4, 200, 246)} {...GLINT} strokeWidth="2.2" />
    </>
  ),
  // 蛋糕：盘子上一块圆蛋糕，粉色奶油往下滴，顶上两颗樱桃一根蜡烛
  cake: () => (
    <>
      <ellipse cx="24" cy="41.6" rx="20" ry="4" fill="#b5c3de" />
      <ellipse cx="24" cy="40.7" rx="17.6" ry="2.5" fill="#d3dcef" />
      <path d="M8 24H40V37a4 4 0 0 1-4 4H12a4 4 0 0 1-4-4Z" fill="#ffcf96" />
      <rect x="8" y="33.4" width="32" height="2.6" fill="#fff0da" />
      <path d="M33 24H40V37a4 4 0 0 1-4 4H31.4C32.6 35.6 33 30 33 24Z" fill="#b8641a" fillOpacity="0.3" />
      <rect x="22" y="9.4" width="4" height="9.6" rx="1.4" fill={BLUE} />
      <path d="M22 13.6l4-2.2M22 17l4-2.2" fill="none" stroke="#ffffff" strokeOpacity="0.75" strokeWidth="1.2" />
      <path d="M24 1.6C26.4 4.2 27.2 5.8 27.2 7.2A3.2 3.2 0 0 1 20.8 7.2C20.8 5.8 21.6 4.2 24 1.6Z" fill="#ff9d2e" />
      <circle cx="24" cy="7.3" r="1.5" fill="#ffe680" />
      <circle cx="14" cy="16.6" r="3" fill={RED} />
      <circle cx="34" cy="16.6" r="3" fill={RED_LO} />
      <circle cx="13" cy="15.6" r="0.9" {...SHINE} />
      <path d={`M8 27V22a4 4 0 0 1 4-4H36a4 4 0 0 1 4 4V27${CAKE_DRIPS}Z`} fill={PINK} />
      <path d="M34.67 18H36a4 4 0 0 1 4 4V27q-2.67 4.6-5.33 0Z" fill={PINK_LO} />
      <path d="M12.6 21.6H21" {...GLINT} strokeWidth="1.8" />
    </>
  ),
  // 奖杯：金杯，两只耳，杯身一颗星，下面是木底座
  trophy: () => (
    <>
      <path d="M13 9.5H8.6a1.6 1.6 0 0 0-1.6 1.7C7.4 16.6 10 19.8 14.5 20.6M35 9.5h4.4a1.6 1.6 0 0 1 1.6 1.7C40.6 16.6 38 19.8 33.5 20.6" fill="none" stroke={GOLD_LO} strokeWidth="3" strokeLinecap="round" />
      <rect x="21" y="25" width="6" height="9" fill={GOLD_LO} />
      <path d="M14 4.5H34a1.5 1.5 0 0 1 1.5 1.5V16a11.5 11.5 0 0 1-23 0V6A1.5 1.5 0 0 1 14 4.5Z" fill={GOLD} />
      <path d="M29 4.5H34a1.5 1.5 0 0 1 1.5 1.5V16A11.5 11.5 0 0 1 24 27.5C28.6 23 29.6 14 29 4.5Z" fill={GOLD_LO} />
      <rect x="11" y="3.6" width="26" height="3.6" rx="1.8" fill={GOLD_HI} />
      <polygon points={starPoints(24, 16, 4.6, 2)} fill="#fff4c9" stroke="#fff4c9" strokeWidth="1" strokeLinejoin="round" />
      <path d="M16.4 10.6V16a7.6 7.6 0 0 0 1.9 5" {...GLINT} strokeWidth="2" />
      <rect x="15" y="32" width="18" height="4.8" rx="2" fill={GOLD} />
      <rect x="11.5" y="36" width="25" height="8.6" rx="2.4" fill="#ad745c" />
      <path d="M30 36h4.1a2.4 2.4 0 0 1 2.4 2.4v3.8a2.4 2.4 0 0 1-2.4 2.4H30Z" fill="#8c5846" />
      <rect x="18.6" y="38.7" width="10.8" height="3.2" rx="1.2" fill={GOLD_HI} />
    </>
  ),
  // 火箭：竖着的，灰蓝的箭身，红色的头和尾翼，一扇圆窗，尾巴喷火
  rocket: () => (
    <>
      <path d="M19.4 37.9h9.2C28.6 42 26.6 45 24 47.4C21.4 45 19.4 42 19.4 37.9Z" fill="#ff9a2e" />
      <path d="M21.6 37.9h4.8C26.4 40.4 25.4 42.2 24 43.8C22.6 42.2 21.6 40.4 21.6 37.9Z" fill="#ffe066" />
      <path d="M14.5 23.5C9.6 26.4 7.4 31.4 7.8 38.6L14.5 34.5Z" fill={RED} stroke={RED} strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M33.5 23.5C38.4 26.4 40.6 31.4 40.2 38.6L33.5 34.5Z" fill={RED_LO} stroke={RED_LO} strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M17.5 34.4h13l-1.4 3.6h-10.2z" fill="#7d89a8" />
      <path d="M24 2C31 8 33.5 16 33.5 25V34.5H14.5V25C14.5 16 17 8 24 2Z" fill="#cdd8f3" />
      <path d="M28.6 13.78H31.88C33.02 17.27 33.5 21.04 33.5 25V34.5H28.6Z" fill="#a5b5de" />
      <path d="M24 2C27.92 5.36 30.43 9.35 31.88 13.78H16.12C17.57 9.35 20.08 5.36 24 2Z" fill={RED} />
      <path d="M24 2C27.92 5.36 30.43 9.35 31.88 13.78H28.6C28 9.6 26.6 5.6 24 2Z" fill={RED_LO} />
      <path d="M19.7 11C20.4 9.1 21.4 7.5 22.6 6.2" {...GLINT} strokeWidth="1.6" />
      <path d="M18.4 17.4V31" {...GLINT} strokeOpacity="0.8" strokeWidth="2" />
      <circle cx="24" cy="21.6" r="5.1" fill="#f3f6ff" />
      <circle cx="24" cy="21.6" r="3.5" fill={BLUE} />
      <path d={shadeArc(24, 21.6, 3.5)} fill={BLUE_LO} />
      <circle cx="22.8" cy="20.4" r="1" {...SHINE} />
      <rect x="22.6" y="28.6" width="2.8" height="7.6" rx="1.4" fill={RED_LO} />
    </>
  ),
  // 城堡：三座尖顶塔楼，前面一道带垛口的门楼，顶上插旗
  castle: () => (
    <>
      <path d="M24 7.4V2" fill="none" stroke="#8a76d8" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M24.4 1.7L30 3.7L24.4 5.7Z" fill={GOLD} stroke={GOLD} strokeWidth="0.8" strokeLinejoin="round" />
      <rect x="18.5" y="16" width="11" height="20" fill="#c9b8ff" />
      <rect x="26.3" y="16" width="3.2" height="20" fill="#a892f0" />
      <rect x="5" y="24.6" width="10" height="20" rx="1.2" fill="#c9b8ff" />
      <rect x="12" y="24.6" width="3" height="20" fill="#a892f0" />
      <rect x="33" y="24.6" width="10" height="20" rx="1.2" fill="#c9b8ff" />
      <path d="M40 24.6h1.8a1.2 1.2 0 0 1 1.2 1.2v17.6a1.2 1.2 0 0 1-1.2 1.2H40Z" fill="#a892f0" />
      <path d="M24 7L31.5 17H16.5Z" fill={PINK} stroke={PINK} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M24 7L31.5 17H27.2C26.8 13.4 25.7 10 24 7Z" fill={PINK_LO} stroke={PINK_LO} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M10 14.4L16.2 25.4H3.8Z" fill={PINK} stroke={PINK} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M10 14.4L16.2 25.4H12.6C12.3 21.5 11.4 17.8 10 14.4Z" fill={PINK_LO} stroke={PINK_LO} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M38 14.4L44.2 25.4H31.8Z" fill={PINK} stroke={PINK} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M38 14.4L44.2 25.4H40.6C40.3 21.5 39.4 17.8 38 14.4Z" fill={PINK_LO} stroke={PINK_LO} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M21.2 14.2L22.8 11.2M7.6 22.6L9 19.8M35.6 22.6L37 19.8" {...GLINT} strokeWidth="1.4" />
      <path d="M14 29.2h3.2v2.8h2.4v-2.8h3.2v2.8h2.4v-2.8h3.2v2.8h2.4v-2.8H34V44.6H14Z" fill="#e0d5ff" />
      <path d="M30.8 29.2H34V44.6H30.8Z" fill="#c9b8ff" />
      <path d="M20.4 44.6V39.4a3.6 3.6 0 0 1 7.2 0V44.6Z" fill="#6f55cc" />
      <path d="M24 35.8a3.6 3.6 0 0 1 3.6 3.6V44.6H24Z" fill="#5a41b4" />
      <rect x="22.5" y="20.6" width="3" height="5" rx="1.5" fill="#6f55cc" />
      <rect x="8.6" y="29.6" width="2.8" height="4.6" rx="1.4" fill="#6f55cc" />
      <rect x="36.6" y="29.6" width="2.8" height="4.6" rx="1.4" fill="#6f55cc" />
      <rect x="2.6" y="43.4" width="42.8" height="3" rx="1.5" fill={GREEN} />
      <path d="M30 43.4h13.9a1.5 1.5 0 0 1 0 3H30Z" fill={GREEN_LO} />
    </>
  ),
  // 星星：圆角的金色五角星，左上一片亮面、右下一片暗面，像切过的宝石
  star: () => (
    <>
      <polygon points={STAR} fill={GOLD} stroke={GOLD} strokeWidth="3.6" strokeLinejoin="round" />
      <polygon points={STAR_LIGHT} fill={GOLD_HI} />
      <polygon points={STAR_SHADE} fill={GOLD_LO} />
      <path d="M17.6 19.4L21.6 11.2" {...GLINT} strokeOpacity="0.8" strokeWidth="2.2" />
    </>
  ),
  heart: () => (
    <>
      <path d="M24 43C10 33 4 25 4 16.5C4 10 9 5.5 14.5 5.5C18.5 5.5 22 7.6 24 11C26 7.6 29.5 5.5 33.5 5.5C39 5.5 44 10 44 16.5C44 25 38 33 24 43Z" fill={RED} />
      <path d="M44 16.5C44 25 38 33 24 43C34.5 34 40 26 40 17.5C40 14 39 11 37 8.8C41.2 9.8 44 12.6 44 16.5Z" fill={RED_LO} />
      <path d="M10.2 17C10.2 13.2 12.8 10.6 16 10.6" {...GLINT} strokeWidth="2.8" />
      <circle cx="11.4" cy="22" r="1.5" {...SHINE} />
    </>
  ),
  // 气球：蓝色的，底下一个结，拖一根弯弯的线
  balloon: () => (
    <>
      <path d="M24 38.4C20.6 40.8 27.4 43.4 24 46.8" fill="none" stroke="#8fa3bd" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M24 33.6L27.2 38.6H20.8Z" fill={BLUE_LO} stroke={BLUE_LO} strokeWidth="1.2" strokeLinejoin="round" />
      <g transform="translate(24 18.6) scale(1 1.16)">
        <circle cx="0" cy="0" r="14.6" fill={BLUE} />
        <path d={shadeArc(0, 0, 14.6)} fill={BLUE_LO} />
      </g>
      <ellipse cx="17.6" cy="11.6" rx="2.6" ry="4.6" transform="rotate(28 17.6 11.6)" {...SHINE} />
    </>
  ),
  // 王冠：三个尖，尖上顶着金珠，箍上镶一红两蓝三颗宝石
  crown: () => (
    <>
      <path d="M8 35L5 16L15.5 24L24 10L32.5 24L43 16L40 35Z" fill={GOLD} stroke={GOLD} strokeWidth="3" strokeLinejoin="round" />
      <path d="M8 35L5 16L15.5 24L13.6 35Z" fill={GOLD_HI} />
      <path d="M32.5 24L43 16L40 35H31.4Z" fill={GOLD_LO} />
      <circle cx="5" cy="14.4" r="3" fill={GOLD_HI} />
      <circle cx="24" cy="8.4" r="3.2" fill={GOLD_HI} />
      <circle cx="43" cy="14.4" r="3" fill={GOLD} />
      <path d={shadeArc(43, 14.4, 3)} fill={GOLD_LO} />
      <path d={shadeArc(24, 8.4, 3.2)} fill={GOLD} />
      <path d="M24 19.4l3.2 4.6l-3.2 4.6l-3.2-4.6Z" fill={RED} stroke={RED} strokeWidth="0.9" strokeLinejoin="round" />
      <path d="M24 19.4l3.2 4.6l-3.2 4.6Z" fill={RED_LO} />
      <rect x="6.2" y="33.6" width="35.6" height="9.2" rx="3" fill={GOLD_LO} />
      <rect x="7.8" y="34.8" width="32.4" height="2" rx="1" fill={GOLD_HI} />
      <circle cx="24" cy="39.4" r="2.3" fill={RED} />
      <circle cx="14" cy="39.4" r="1.9" fill={BLUE} />
      <circle cx="34" cy="39.4" r="1.9" fill={BLUE} />
    </>
  ),
  // 猫：橘猫的脑袋，粉耳朵，额头三道纹
  cat: () => (
    <>
      <path d="M8 23L8.6 7L21 14.4Z" fill="#ffab52" stroke="#ffab52" strokeWidth="3" strokeLinejoin="round" />
      <path d="M40 23L39.4 7L27 14.4Z" fill="#f08a2c" stroke="#f08a2c" strokeWidth="3" strokeLinejoin="round" />
      <path d="M11.2 18.4L11.6 11.2L17.2 14.6Z" fill={PINK} stroke={PINK} strokeWidth="1" strokeLinejoin="round" />
      <path d="M36.8 18.4L36.4 11.2L30.8 14.6Z" fill={PINK_LO} stroke={PINK_LO} strokeWidth="1" strokeLinejoin="round" />
      <g transform="translate(24 28.6) scale(1.2 1)">
        <circle cx="0" cy="0" r="15.5" fill="#ffab52" />
        <path d={shadeArc(0, 0, 15.5)} fill="#f08a2c" />
      </g>
      <path d="M24 14.6v4.6M19.4 15.8l.9 3.8M28.6 15.8l-.9 3.8" fill="none" stroke="#e57a1c" strokeWidth="1.9" strokeLinecap="round" />
      <ellipse cx="24" cy="35" rx="7.6" ry="5" fill="#ffe6c8" />
      <circle cx="11.6" cy="33.4" r="2.5" fill={PINK} fillOpacity="0.6" />
      <circle cx="36.4" cy="33.4" r="2.5" fill={PINK} fillOpacity="0.6" />
      <ellipse cx="16.4" cy="27.6" rx="2.4" ry="3" fill="#5a3520" />
      <ellipse cx="31.6" cy="27.6" rx="2.4" ry="3" fill="#5a3520" />
      <circle cx="15.7" cy="26.5" r="0.95" fill="#ffffff" />
      <circle cx="30.9" cy="26.5" r="0.95" fill="#ffffff" />
      <path d="M22.3 32.2h3.4L24 34.2Z" fill="#ff7d95" stroke="#ff7d95" strokeWidth="0.9" strokeLinejoin="round" />
      <path d="M24 34.6C23.4 36.6 21.4 36.9 20.3 35.6M24 34.6C24.6 36.6 26.6 36.9 27.7 35.6" fill="none" stroke="#5a3520" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M10.6 24.6C11.4 22.4 12.8 20.6 14.6 19.4" {...GLINT} strokeOpacity="0.5" strokeWidth="1.8" />
    </>
  ),
  // 冰淇淋：华夫蛋筒上一球草莓味的，边上往下淌，撒了彩针，顶一颗樱桃
  icecream: () => (
    <>
      <path d="M14.5 25H33.5L24 45.5Z" fill="#f0b46a" stroke="#f0b46a" strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M28 25H33.5L24 45.5C26.4 39 27.8 32 28 25Z" fill="#d6924a" stroke="#d6924a" strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M18 26.5l8.5 9M23 26l6 6.4M30 26.5l-8.5 9M25 26l-6 6.4" fill="none" stroke="#b8732c" strokeOpacity="0.6" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M26.2 2.8C26.8 1.8 27.8 1.4 29 1.5" fill="none" stroke={GREEN_LO} strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="25.4" cy="5.8" r="3.3" fill={RED} />
      <path d={shadeArc(25.4, 5.8, 3.3)} fill={RED_LO} />
      <path d="M11 19a13 13 0 0 1 26 0v3a3.25 3.25 0 0 1-6.5 0a3.25 3.25 0 0 1-6.5 0a3.25 3.25 0 0 1-6.5 0a3.25 3.25 0 0 1-6.5 0Z" fill={PINK} />
      <path d="M37 19v3a3.25 3.25 0 0 1-5.6 2.2C33.6 20 34 13.5 31.4 8.3A13 13 0 0 1 37 19Z" fill={PINK_LO} />
      <path d={glintArc(24, 19, 9.4, 198, 244)} {...GLINT} strokeWidth="2.2" />
      <path d="M21 13.4l1.6 1.2" fill="none" stroke={BLUE} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M27.4 12l1.8-.8" fill="none" stroke={GOLD_HI} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M23.4 19.6l1.9.5" fill="none" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M28.6 17.4l.7 1.8" fill="none" stroke="#8ff0c4" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M17.6 19.4l.5 1.8" fill="none" stroke={GOLD_HI} strokeWidth="1.6" strokeLinecap="round" />
    </>
  )
};

/** 认不出名字时画的礼物盒：紫盒子，金丝带，顶上一个蝴蝶结 */
function GiftBox(): JSX.Element {
  return (
    <>
      <path d="M24 13.8C20.5 5.6 11.6 4.4 11 9.6C10.5 14 18.6 14.8 24 13.8Z" fill={GOLD} />
      <path d="M24 13.8C27.5 5.6 36.4 4.4 37 9.6C37.5 14 29.4 14.8 24 13.8Z" fill={GOLD_LO} />
      <rect x="9" y="21" width="30" height="23.6" rx="3.2" fill="#8e7bff" />
      <path d="M32 21h7v20.4a3.2 3.2 0 0 1-3.2 3.2H32Z" fill="#6f59e6" />
      <rect x="20.6" y="21" width="6.8" height="23.6" fill={GOLD} />
      <rect x="9" y="23" width="30" height="3" fill="#2a1a8a" fillOpacity="0.26" />
      <rect x="6" y="14" width="36" height="9.6" rx="3" fill="#a999ff" />
      <path d="M34 14h5a3 3 0 0 1 3 3v3.6a3 3 0 0 1-3 3H34Z" fill="#8e7bff" />
      <rect x="20.6" y="14" width="6.8" height="9.6" fill={GOLD_HI} />
      <rect x="21" y="9.8" width="6" height="5.8" rx="2.2" fill={GOLD_HI} />
      <path d="M10.2 17.8h6.6" {...GLINT} strokeWidth="1.8" />
      <path d="M12.6 29.6v9" {...GLINT} strokeOpacity="0.45" strokeWidth="2" />
    </>
  );
}

/** icon 是服务器下发的原样字符串；不认识的名字画成礼物盒 */
export function GiftGlyph({ icon, size = 40, className, title }: { icon: string; size?: number; className?: string; title?: string }): JSX.Element {
  const shape = isGiftIconName(icon) ? SHAPES[icon] : GiftBox;
  const a11y = title ? ({ role: 'img', 'aria-label': title } as const) : ({ 'aria-hidden': true } as const);
  return (
    <svg className={className ? `kgfx-glyph ${className}` : 'kgfx-glyph'} width={size} height={size} viewBox="0 0 48 48" focusable="false" {...a11y}>
      {shape()}
    </svg>
  );
}
