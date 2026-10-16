import type { CSSProperties } from 'react';
import { isRecord } from '@/api/normalizers';
import { isOrnamentCorner, isOrnamentKey, type OrnamentSpec } from './ornaments';
import { isPatternKey, patternPaint, type PatternPaint } from './patterns';

/**
 * 气泡皮肤：把服务端给的 `style`（docs/shop.md 2.2）变成能挂到气泡上的样式。
 *
 * `style` 来自网络，哪怕服务端保存时校验过，这里也当它不可信，自己再校验一遍：
 *   · 只读契约里列出的字段，每个值都先解析成记号（颜色、角度、百分比、长度、枚举名），再由这里**重新拼**成字符串。
 *     服务端的原文从不进入样式，所以 `url(...)`、`expression(...)`、分号、花括号这些东西没有任何路径能带出去。
 *     纹样和角饰在样式里只是一个名字：图形是客户端内置的（patterns.ts / ornaments.tsx），名字只用来查表。
 *   · 产物只有两样：一组 CSS 自定义属性（--kcsk-*，通过 React 的 style 对象挂上去）和几个固定的类名。真正的声明写在 shop.css 里。
 *   · 不认识的 version、不认识的字段 → 整件皮肤作废，按没装备处理（契约 2.2）。
 *   · `background` 和 `text` 是一对，缺一个或有一个不合法 → 整件作废：只剩一半的话字和底可能撞色，读不了。
 *   · 其余可空的字段（link / border / radius / shadow / animation / pattern / ornaments）不合法 → 只丢掉这一个。
 *   · 纹样、角饰的 key 不认识 → 跳过那一项，其余照常画（契约：以后加新图案要发版，旧客户端照样能画出别的部分）。
 *   · `dark` 里有任何一项不合法 → 整个深色覆盖作废，深色下沿用浅色那一套（同样是为了不出现「新底色配旧字色」）。
 *   · 数值都有上限：阴影的偏移、模糊、扩散会被夹到一个不会盖住旁边消息的范围里；角饰最多两个、最大 28 像素。
 */

export type BubbleSkinAnimation = 'none' | 'flow' | 'shimmer' | 'breathe';

interface SkinPaint {
  background: string;
  /** 底是渐变（flow 只对渐变有意义） */
  gradient: boolean;
  text: string;
  link: string;
  border: { color: string; width: number } | null;
  shadow: string | null;
  pattern: PatternPaint | null;
  /** 光晕呼吸用的颜色（#rrggbb）：取阴影的颜色，没有就取底色里居中的那个 */
  glow: string;
}

export interface BubbleSkin {
  light: SkinPaint;
  dark: SkinPaint;
  /** 圆角，像素；null 表示用主题的 */
  radius: number | null;
  animation: BubbleSkinAnimation;
  ornaments: OrnamentSpec[];
  /** 浅色或深色下有纹样 */
  hasPattern: boolean;
  /** 挂到气泡元素上的自定义属性，解析时算好，同一件皮肤的所有气泡共用一个对象 */
  vars: CSSProperties;
}

const SUPPORTED_VERSION = 1;
const TOP_FIELDS = new Set(['version', 'background', 'text', 'link', 'border', 'radius', 'shadow', 'animation', 'pattern', 'ornaments', 'dark']);
const DARK_FIELDS = new Set(['background', 'text', 'link', 'border', 'shadow', 'pattern']);
const BORDER_FIELDS = new Set(['color', 'width']);
const PATTERN_FIELDS = new Set(['key', 'color', 'opacity', 'scale']);
const ORNAMENT_FIELDS = new Set(['key', 'corner', 'color', 'size', 'animated']);

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const HEX_IN_TEXT = /#[0-9a-f]{3,8}/g;
const ANGLE = /^-?\d{1,4}(?:\.\d{1,3})?(?:deg|grad|rad|turn)$/i;
const PERCENT = /^-?\d{1,3}(?:\.\d{1,3})?%$/;
const LENGTH = /^(-?\d{1,3}(?:\.\d{1,2})?)(px)?$/i;

const MAX_BACKGROUND_LENGTH = 400;
const MAX_GRADIENT_STOPS = 12;
const MAX_SHADOW_LENGTH = 160;
const MAX_SHADOW_LAYERS = 2;
const MAX_SHADOW_OFFSET = 16;
const MAX_SHADOW_BLUR = 32;
const MAX_SHADOW_SPREAD = 6;
const MIN_RADIUS = 4;
const MAX_RADIUS = 22;
const MAX_BORDER_WIDTH = 3;
const MAX_PATTERN_OPACITY = 0.6;
const DEFAULT_PATTERN_OPACITY = 0.18;
const MIN_PATTERN_SCALE = 0.5;
const MAX_PATTERN_SCALE = 2;
const MAX_ORNAMENTS = 2;
const MIN_ORNAMENT_SIZE = 10;
const MAX_ORNAMENT_SIZE = 28;
const DEFAULT_ORNAMENT_SIZE = 18;

/**
 * 角饰往气泡上、下探出去多少（和 shop.css 里 .kcsk-orn 的 --kcsk-oy 是同一个算法）：
 * 伸进气泡里的那一截不超过 8 像素（落在内边距里，盖不到字），其余的探在外面，至少探出 40%。
 * 气泡上下本来就留着 3 像素以上的空（昵称、回应、下一条消息），超出的部分给气泡加外边距垫出来，
 * 角饰就不会压到上面的昵称和相邻的消息。
 */
const ORNAMENT_RISE = 0.4;
const ORNAMENT_INSET = 8;
const ORNAMENT_FREE_SPACE = 3;

export function absent(value: unknown): value is null | undefined {
  return value === null || value === undefined;
}

export function onlyKnownFields(source: Record<string, unknown>, known: ReadonlySet<string>): boolean {
  return Object.keys(source).every((key) => known.has(key));
}

export function inRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

/** `#rgb` / `#rrggbb` / `#rrggbbaa`，统一成小写。 */
export function readColor(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const text = value.trim();
  return HEX_COLOR.test(text) ? text.toLowerCase() : null;
}

/** 去掉透明度，统一成 #rrggbb。 */
export function opaque(color: string): string {
  const hex = color.slice(1);
  return hex.length === 3 ? `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}` : `#${hex.slice(0, 6)}`;
}

/**
 * 一个颜色，或一个 linear-gradient / radial-gradient：里面只能有角度（仅线性、仅第一项）、颜色和百分比。
 * allowConic 为 true 时还接受 conic-gradient（头像框的环用，见 avatarFrame.ts）：第一项可以是「from 角度」，色标的位置可以是角度；气泡不接受它。
 */
export function readBackground(value: unknown, allowConic = false): { value: string; gradient: boolean } | null {
  if (typeof value !== 'string' || value.length > MAX_BACKGROUND_LENGTH) {
    return null;
  }
  const text = value.trim();
  const solid = readColor(text);
  if (solid) {
    return { value: solid, gradient: false };
  }
  // 括号里不许再有括号：嵌套函数（url()、var()、calc() …）一律进不来
  const match = /^(linear|radial|conic)-gradient\(([^()]*)\)$/i.exec(text);
  if (!match) {
    return null;
  }
  const kind = match[1].toLowerCase();
  const conic = kind === 'conic';
  if (conic && !allowConic) {
    return null;
  }
  const parts = match[2].split(',');
  const output: string[] = [];
  let stops = 0;
  let previousWasHint = false;
  for (let index = 0; index < parts.length; index += 1) {
    const tokens = parts[index].trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) {
      return null;
    }
    if (index === 0 && kind === 'linear' && tokens.length === 1 && ANGLE.test(tokens[0])) {
      output.push(tokens[0].toLowerCase());
      continue;
    }
    if (index === 0 && conic && tokens.length === 2 && tokens[0].toLowerCase() === 'from' && ANGLE.test(tokens[1])) {
      output.push(`from ${tokens[1].toLowerCase()}`);
      continue;
    }
    const color = readColor(tokens[0]);
    if (color) {
      // 颜色后面最多跟两个位置
      const positions = tokens.slice(1);
      if (positions.length > 2 || !positions.every((position) => PERCENT.test(position) || (conic && ANGLE.test(position)))) {
        return null;
      }
      output.push([color, ...positions.map((position) => position.toLowerCase())].join(' '));
      stops += 1;
      previousWasHint = false;
      continue;
    }
    // 两个色标之间单独的一个百分比（过渡的中点）
    if (tokens.length === 1 && PERCENT.test(tokens[0]) && stops > 0 && !previousWasHint && index < parts.length - 1) {
      output.push(tokens[0]);
      previousWasHint = true;
      continue;
    }
    return null;
  }
  if (stops < 2 || stops > MAX_GRADIENT_STOPS || previousWasHint) {
    return null;
  }
  return { value: `${kind}-gradient(${output.join(', ')})`, gradient: true };
}

function readLength(token: string): number | null {
  const match = LENGTH.exec(token);
  if (!match) {
    return null;
  }
  const amount = Number(match[1]);
  // 不带单位的只有 0 是合法的长度
  if (!Number.isFinite(amount) || (amount !== 0 && !match[2])) {
    return null;
  }
  return amount;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 「偏移 偏移 模糊 [扩散] 颜色」，最多两层；不接受 inset。数值夹到不会糊住旁边消息的范围里。 */
function readShadow(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > MAX_SHADOW_LENGTH) {
    return null;
  }
  const layers = value.split(',');
  if (layers.length > MAX_SHADOW_LAYERS) {
    return null;
  }
  const output: string[] = [];
  for (const layer of layers) {
    const tokens = layer.trim().split(/\s+/).filter(Boolean);
    if (tokens.length !== 4 && tokens.length !== 5) {
      return null;
    }
    const color = readColor(tokens[tokens.length - 1]);
    const x = readLength(tokens[0]);
    const y = readLength(tokens[1]);
    const blur = readLength(tokens[2]);
    const spread = tokens.length === 5 ? readLength(tokens[3]) : 0;
    if (!color || x === null || y === null || blur === null || spread === null || blur < 0) {
      return null;
    }
    output.push(`${clamp(x, -MAX_SHADOW_OFFSET, MAX_SHADOW_OFFSET)}px ${clamp(y, -MAX_SHADOW_OFFSET, MAX_SHADOW_OFFSET)}px ${clamp(blur, 0, MAX_SHADOW_BLUR)}px ${clamp(spread, -MAX_SHADOW_SPREAD, MAX_SHADOW_SPREAD)}px ${color}`);
  }
  return output.join(', ');
}

/** 读一个可空的对象字段时的三种结果之外的两种：值不合法（只丢这一项）、里面有不认识的字段（整件作废）。 */
export const INVALID = Symbol('invalid');
export const UNKNOWN_FIELD = Symbol('unknown-field');
export type Read<T> = T | typeof INVALID | typeof UNKNOWN_FIELD;

/** 宽度 0 也是合法的边框：表示不要边框。 */
function readBorder(value: unknown): Read<{ color: string; width: number }> {
  if (!isRecord(value)) {
    return INVALID;
  }
  if (!onlyKnownFields(value, BORDER_FIELDS)) {
    return UNKNOWN_FIELD;
  }
  const color = readColor(value.color);
  if (!color || !inRange(value.width, 0, MAX_BORDER_WIDTH)) {
    return INVALID;
  }
  return { color, width: Math.round(value.width * 2) / 2 };
}

/** 纹样。key 不认识返回 null（跳过，不算错）。 */
function readPattern(value: unknown): Read<PatternPaint | null> {
  if (!isRecord(value)) {
    return INVALID;
  }
  if (!onlyKnownFields(value, PATTERN_FIELDS)) {
    return UNKNOWN_FIELD;
  }
  if (typeof value.key !== 'string') {
    return INVALID;
  }
  if (!isPatternKey(value.key)) {
    return null;
  }
  const color = readColor(value.color);
  const opacity = absent(value.opacity) ? DEFAULT_PATTERN_OPACITY : value.opacity;
  const scale = absent(value.scale) ? 1 : value.scale;
  if (!color || !inRange(opacity, 0, MAX_PATTERN_OPACITY) || !inRange(scale, MIN_PATTERN_SCALE, MAX_PATTERN_SCALE)) {
    return INVALID;
  }
  if (opacity === 0) {
    return null;
  }
  return patternPaint(value.key, color, Math.round(opacity * 1000) / 1000, Math.round(scale * 100) / 100);
}

/** 角饰：最多两个。某一个的 key 不认识或取值不合法就跳过那一个；同一个角上只留第一个。 */
function readOrnaments(value: unknown): Read<OrnamentSpec[]> {
  if (!Array.isArray(value) || value.length > MAX_ORNAMENTS) {
    return INVALID;
  }
  const result: OrnamentSpec[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) {
      continue;
    }
    if (!onlyKnownFields(entry, ORNAMENT_FIELDS)) {
      return UNKNOWN_FIELD;
    }
    const color = readColor(entry.color);
    const size = absent(entry.size) ? DEFAULT_ORNAMENT_SIZE : entry.size;
    if (!isOrnamentKey(entry.key) || !isOrnamentCorner(entry.corner) || !color || !inRange(size, MIN_ORNAMENT_SIZE, MAX_ORNAMENT_SIZE)) {
      continue;
    }
    if (result.some((existing) => existing.corner === entry.corner)) {
      continue;
    }
    result.push({ key: entry.key, corner: entry.corner, color, size: Math.round(size), animated: entry.animated === true });
  }
  return result;
}

/** 光晕的颜色：有阴影用阴影的第一个颜色，否则取底色里居中的那个色标。 */
function glowOf(background: string, shadow: string | null): string {
  const fromShadow = shadow?.match(HEX_IN_TEXT)?.[0];
  if (fromShadow) {
    return opaque(fromShadow);
  }
  const stops = background.match(HEX_IN_TEXT) ?? [];
  return opaque(stops[Math.floor((stops.length - 1) / 2)] ?? '#ffffff');
}

function paintVars(prefix: string, paint: SkinPaint, target: Record<string, string>): void {
  target[`${prefix}bg`] = paint.background;
  target[`${prefix}text`] = paint.text;
  target[`${prefix}link`] = paint.link;
  target[`${prefix}bw`] = paint.border && paint.border.width > 0 ? `${paint.border.width}px` : '0px';
  target[`${prefix}bc`] = paint.border && paint.border.width > 0 ? paint.border.color : 'transparent';
  target[`${prefix}glow`] = paint.glow;
  // 没有阴影时不输出这个变量：样式表里它的回退值是主题自己的气泡投影
  if (paint.shadow) {
    target[`${prefix}shadow`] = paint.shadow;
  }
  target[`${prefix}pat`] = paint.pattern?.image ?? 'none';
  target[`${prefix}pat-size`] = paint.pattern?.size ?? 'auto';
}

function buildSkin(source: Record<string, unknown>): BubbleSkin | null {
  if (source.version !== SUPPORTED_VERSION || !onlyKnownFields(source, TOP_FIELDS)) {
    return null;
  }
  const background = readBackground(source.background);
  const text = readColor(source.text);
  if (!background || !text) {
    return null;
  }

  const border = absent(source.border) ? null : readBorder(source.border);
  const pattern = absent(source.pattern) ? null : readPattern(source.pattern);
  const ornaments = absent(source.ornaments) ? [] : readOrnaments(source.ornaments);
  if (border === UNKNOWN_FIELD || pattern === UNKNOWN_FIELD || ornaments === UNKNOWN_FIELD) {
    return null;
  }
  const shadow = absent(source.shadow) ? null : readShadow(source.shadow);
  const light: SkinPaint = {
    background: background.value,
    gradient: background.gradient,
    text,
    link: readColor(source.link) ?? text,
    border: border === INVALID ? null : border,
    shadow,
    pattern: pattern === INVALID ? null : pattern,
    glow: glowOf(background.value, shadow)
  };

  let dark = light;
  if (isRecord(source.dark)) {
    const override = source.dark;
    if (!onlyKnownFields(override, DARK_FIELDS)) {
      return null;
    }
    const darkBackground = absent(override.background) ? null : readBackground(override.background);
    const darkText = absent(override.text) ? null : readColor(override.text);
    const darkLink = absent(override.link) ? null : readColor(override.link);
    const darkShadow = absent(override.shadow) ? null : readShadow(override.shadow);
    const darkBorder = absent(override.border) ? null : readBorder(override.border);
    const darkPattern = absent(override.pattern) ? undefined : readPattern(override.pattern);
    if (darkBorder === UNKNOWN_FIELD || darkPattern === UNKNOWN_FIELD) {
      return null;
    }
    const valid = (absent(override.background) || darkBackground !== null)
      && (absent(override.text) || darkText !== null)
      && (absent(override.link) || darkLink !== null)
      && (absent(override.shadow) || darkShadow !== null)
      && darkBorder !== INVALID
      && darkPattern !== INVALID;
    if (valid) {
      const repainted = darkBackground !== null || darkText !== null;
      const nextBackground = darkBackground?.value ?? light.background;
      const nextShadow = darkShadow ?? light.shadow;
      dark = {
        background: nextBackground,
        gradient: darkBackground ? darkBackground.gradient : light.gradient,
        text: darkText ?? light.text,
        // 深色覆盖里写了 link 就用它。没写：底色或字色换过之后，浅色那个链接色不一定还读得清，退回深色的字色
        link: darkLink ?? (repainted ? darkText ?? light.text : light.link),
        border: darkBorder ?? light.border,
        shadow: nextShadow,
        // 没写就沿用浅色的纹样；写了但 key 不认识（null）就是深色下不要纹样
        pattern: darkPattern === undefined ? light.pattern : darkPattern,
        glow: glowOf(nextBackground, nextShadow)
      };
    }
  }

  const radius = inRange(source.radius, MIN_RADIUS, MAX_RADIUS) ? Math.round(source.radius) : null;
  const animation: BubbleSkinAnimation = source.animation === 'flow' || source.animation === 'shimmer' || source.animation === 'breathe' ? source.animation : 'none';
  const ornamentList = ornaments === INVALID ? [] : ornaments;

  const vars: Record<string, string> = {};
  paintVars('--kcsk-', light, vars);
  paintVars('--kcsk-d-', dark, vars);
  if (radius !== null) {
    vars['--kcsk-radius'] = `${radius}px`;
  }
  // 角饰探出气泡上、下沿的部分，超过本来就有的空隙时用外边距垫出来
  const rise = (corners: string): number => Math.max(0, ...ornamentList.filter((item) => corners.includes(item.corner[0])).map((item) => Math.max(item.size * ORNAMENT_RISE, item.size - ORNAMENT_INSET) - ORNAMENT_FREE_SPACE));
  const marginTop = Math.ceil(rise('t'));
  const marginBottom = Math.ceil(rise('b'));
  if (marginTop > 0) {
    vars['--kcsk-mt'] = `${marginTop}px`;
  }
  if (marginBottom > 0) {
    vars['--kcsk-mb'] = `${marginBottom}px`;
  }
  return { light, dark, radius, animation, ornaments: ornamentList, hasPattern: Boolean(light.pattern || dark.pattern), vars: vars as CSSProperties };
}

// 聊天里每条消息的发送者对象是各自的一份，同一件皮肤会以很多个不同的对象出现。
// 先按对象查（消息对象在缓存里长期存在，查一次就够），查不到再按内容查，让同一件皮肤共用同一份解析结果。
const byObject = new WeakMap<object, BubbleSkin | null>();
const byContent = new Map<string, BubbleSkin | null>();
const MAX_CONTENT_CACHE = 200;
const MAX_STYLE_JSON = 4000;

/** 解析并校验一份 `style`。不是合法的皮肤返回 null，调用方按没装备处理。 */
export function parseBubbleSkin(style: unknown): BubbleSkin | null {
  if (!isRecord(style)) {
    return null;
  }
  const known = byObject.get(style);
  if (known !== undefined) {
    return known;
  }
  let key: string | null;
  try {
    key = JSON.stringify(style);
  } catch {
    key = null;
  }
  let skin: BubbleSkin | null = null;
  if (key !== null && key.length <= MAX_STYLE_JSON) {
    const cached = byContent.get(key);
    if (cached !== undefined) {
      skin = cached;
    } else {
      skin = buildSkin(style);
      if (byContent.size >= MAX_CONTENT_CACHE) {
        byContent.clear();
      }
      byContent.set(key, skin);
    }
  }
  byObject.set(style, skin);
  return skin;
}

/** 一个人装备着的气泡皮肤。用户对象没有 cosmetics（旧后端）、没装备、皮肤不合法，都是 null。 */
export function bubbleSkinOf(user: { cosmetics?: unknown } | null | undefined): BubbleSkin | null {
  const cosmetics = user?.cosmetics;
  if (!isRecord(cosmetics) || !isRecord(cosmetics.bubble)) {
    return null;
  }
  return parseBubbleSkin(cosmetics.bubble.style);
}

/**
 * 气泡元素上要加的类名：
 *   kcsk                皮肤本身
 *   kcsk--in / --out    朝向（别人的 / 自己的），给不靠主题变量画圆角的气泡（移动端、语音）用
 *   kcsk--r             皮肤自带圆角
 *   kcsk--spill         有东西要探出气泡（角饰、呼吸的光晕），气泡不能裁切自己的内容
 *   kcsk--orn-tl 等     哪些角上有角饰，气泡角上原有的收藏 / 精华标记据此让位
 */
export function bubbleSkinClass(skin: BubbleSkin, mine: boolean): string {
  let name = `kcsk ${mine ? 'kcsk--out' : 'kcsk--in'}`;
  if (skin.radius !== null) {
    name += ' kcsk--r';
  }
  if (skin.ornaments.length > 0 || skin.animation === 'breathe') {
    name += ' kcsk--spill';
  }
  for (const ornament of skin.ornaments) {
    name += ` kcsk--orn-${ornament.corner}`;
  }
  return name;
}
