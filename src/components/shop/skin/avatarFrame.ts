import type { CSSProperties } from 'react';
import { isRecord } from '@/api/normalizers';
import { absent, inRange, INVALID, onlyKnownFields, opaque, readBackground, readColor, UNKNOWN_FIELD, type Read } from './bubbleSkin';
import { frameOrnamentLayout, isFrameOrnamentKey, isFramePosition, type FrameOrnamentKey, type FramePiece, type FramePosition } from './frameOrnaments';

/**
 * 头像框：把服务端给的 `style`（docs/shop.md 头像框一节）变成能挂到头像外面的样式。
 *
 * 和气泡皮肤（bubbleSkin.ts）是同一套规矩，校验用的也是那边的函数：`style` 来自网络，不可信 ——
 *   · 只读契约里列出的字段；颜色、渐变都先解析成记号再由这里重新拼，服务端的原文从不进入样式；
 *   · 产物是一组 CSS 自定义属性（--kcaf-*）和算好位置的装饰，声明写在 shop.css（.kcaf）；
 *   · 不认识的 version、不认识的字段 → 整件作废，按没装备处理；
 *   · 环（ring）是必须的：缺了、底色或宽度不合法 → 整件作废（没有环就不成其为头像框）；
 *   · 可空的字段（gap / glow / animation / ornaments）不合法 → 只丢掉这一个；
 *   · 装饰的 key、position 不认识 → 跳过那一项，其余照常画；
 *   · `dark` 里有任何一项不合法 → 整个深色覆盖作废，深色下沿用浅色那一套。
 *
 * 尺寸的单位：契约里的宽度、留白、装饰大小都「按 40 像素的头像计」。这里把它们全换成相对头像方块的百分比
 * （1 个单位 = 2.5%），所以同一份结果套在 24 像素到 80 像素的头像上都是等比的，不用知道头像实际多大。
 */

export type AvatarFrameAnimation = 'none' | 'spin' | 'pulse' | 'shimmer';

interface FramePaint {
  background: string;
  gradient: boolean;
  glow: { color: string; blur: number } | null;
}

export interface AvatarFrame {
  light: FramePaint;
  dark: FramePaint;
  /** 环的宽度、环和头像之间的留白，按 40 像素的头像计 */
  width: number;
  gap: number;
  animation: AvatarFrameAnimation;
  /** 算好位置的装饰；成对的装饰（猫耳、翅膀 …）在这里已经拆成两片 */
  pieces: FramePiece[];
  /** 浅色或深色下有外发光 */
  hasGlow: boolean;
  /** 挂到头像外面那一层上的自定义属性，同一件头像框的所有头像共用一个对象 */
  vars: CSSProperties;
}

const SUPPORTED_VERSION = 1;
const TOP_FIELDS = new Set(['version', 'ring', 'glow', 'animation', 'ornaments', 'dark']);
const RING_FIELDS = new Set(['background', 'width', 'gap']);
const GLOW_FIELDS = new Set(['color', 'blur']);
const ORNAMENT_FIELDS = new Set(['key', 'position', 'color', 'size', 'animated']);
const DARK_FIELDS = new Set(['ring', 'glow']);
const DARK_RING_FIELDS = new Set(['background']);

const MIN_RING_WIDTH = 2;
const MAX_RING_WIDTH = 6;
const MAX_RING_GAP = 3;
const MAX_GLOW_BLUR = 16;
const DEFAULT_GLOW_BLUR = 8;
const MAX_ORNAMENTS = 3;
const MIN_ORNAMENT_SIZE = 10;
const MAX_ORNAMENT_SIZE = 28;
const DEFAULT_ORNAMENT_SIZE = 18;

/** 头像的半径（按 40 像素计） */
const RADIUS = 20;
/**
 * 装饰最多探出头像多远（上下左右各自量，按 40 像素计）。头像周围能用的空是有限的：
 * 资料卡里头像离卡片边 16 像素（头像 56 像素，折过来 11.4 个单位），消息行里头像上方 14 像素（头像 36 像素，15 个单位）。
 * 取最紧的那个。装饰大了不会更往外探，而是往头像里面靠 —— 垫在头像后面的那几种（猫耳、角、翅膀）往里靠的部分本来就看不见。
 */
const MAX_OVERHANG = 11;

const ANGLE_OF: Record<FramePosition, number> = { top: 0, tr: 45, right: 90, br: 135, bottom: 180, bl: 225, left: 270, tl: 315 };

const round = (value: number, digits = 2): number => {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
};
/** 按 40 像素计的长度 → 相对头像方块的百分比 */
const percent = (units: number): string => `${round(units * 2.5)}%`;
/** 把角度收到 (-180, 180] */
const normalize = (degrees: number): number => {
  const value = ((degrees % 360) + 360) % 360;
  return value > 180 ? value - 360 : value;
};

function readGlow(value: unknown, fallbackBlur: number): Read<{ color: string; blur: number } | null> {
  if (!isRecord(value)) {
    return INVALID;
  }
  if (!onlyKnownFields(value, GLOW_FIELDS)) {
    return UNKNOWN_FIELD;
  }
  const color = readColor(value.color);
  const blur = absent(value.blur) ? fallbackBlur : value.blur;
  if (!color || !inRange(blur, 0, MAX_GLOW_BLUR)) {
    return INVALID;
  }
  return blur === 0 ? null : { color, blur: round(blur, 1) };
}

interface OrnamentEntry {
  key: FrameOrnamentKey;
  position: FramePosition;
  color: string;
  size: number;
  animated: boolean;
}

/** 装饰：最多三个。某一个的 key / position 不认识或取值不合法就跳过那一个；同一个位置只留第一个。 */
function readOrnaments(value: unknown): Read<OrnamentEntry[]> {
  if (!Array.isArray(value) || value.length > MAX_ORNAMENTS) {
    return INVALID;
  }
  const result: OrnamentEntry[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) {
      continue;
    }
    if (!onlyKnownFields(entry, ORNAMENT_FIELDS)) {
      return UNKNOWN_FIELD;
    }
    const color = readColor(entry.color);
    const size = absent(entry.size) ? DEFAULT_ORNAMENT_SIZE : entry.size;
    if (!isFrameOrnamentKey(entry.key) || !isFramePosition(entry.position) || !color || !inRange(size, MIN_ORNAMENT_SIZE, MAX_ORNAMENT_SIZE)) {
      continue;
    }
    if (result.some((existing) => existing.position === entry.position)) {
      continue;
    }
    result.push({ key: entry.key, position: entry.position, color, size: Math.round(size), animated: entry.animated === true });
  }
  return result;
}

/**
 * 把一片装饰放到环上。angle 是它在环上的方位（从正上方顺时针，度），turn 是它自己转多少度，mirror 是左右镜像（成对装饰的左边那片）。
 * 中心先放在「自然」的半径上，再按 MAX_OVERHANG 往里收：上下、左右各自量它探出头像方块多远。
 */
function placePiece(entry: OrnamentEntry, id: string, angle: number, turn: number, mirror: boolean, natural: number, half: [number, number], back: boolean): FramePiece {
  const theta = (angle * Math.PI) / 180;
  const sin = Math.sin(theta);
  const cos = Math.cos(theta);
  const phi = (turn * Math.PI) / 180;
  // 转过之后在水平、竖直方向上各占多宽
  const extentX = entry.size * (half[0] * Math.abs(Math.cos(phi)) + half[1] * Math.abs(Math.sin(phi)));
  const extentY = entry.size * (half[0] * Math.abs(Math.sin(phi)) + half[1] * Math.abs(Math.cos(phi)));
  let radius = natural;
  if (Math.abs(sin) > 0.05) {
    radius = Math.min(radius, (RADIUS + MAX_OVERHANG - extentX) / Math.abs(sin));
  }
  if (Math.abs(cos) > 0.05) {
    radius = Math.min(radius, (RADIUS + MAX_OVERHANG - extentY) / Math.abs(cos));
  }
  radius = Math.max(0, radius);
  const side = percent(entry.size);
  return {
    id,
    key: entry.key,
    color: entry.color,
    animated: entry.animated,
    back,
    box: {
      left: `${round(50 + radius * sin * 2.5)}%`,
      top: `${round(50 - radius * cos * 2.5)}%`,
      width: side,
      height: side,
      transform: `translate(-50%, -50%) rotate(${round(turn, 1)}deg)${mirror ? ' scaleX(-1)' : ''}`
    }
  };
}

/** 翅膀在环上的方位：position 只决定它长得高一点还是低一点，左右总是成对的。 */
function wingAngle(position: FramePosition): number {
  if (position === 'top' || position === 'tl' || position === 'tr') {
    return 64;
  }
  return position === 'bottom' || position === 'bl' || position === 'br' ? 112 : 90;
}

function buildPieces(ornaments: OrnamentEntry[], width: number, gap: number): FramePiece[] {
  const outer = RADIUS + gap + width;
  const middle = RADIUS + gap + width / 2;
  const pieces: FramePiece[] = [];
  for (const entry of ornaments) {
    const layout = frameOrnamentLayout(entry.key);
    const natural = layout.lift === undefined ? middle : outer + entry.size * layout.lift;
    const back = layout.back === true;
    const base = ANGLE_OF[entry.position];
    if (entry.key === 'wings') {
      const angle = wingAngle(entry.position);
      const tilt = (angle - 90) * 0.5;
      pieces.push(placePiece(entry, `${entry.position}-r`, angle, tilt, false, natural, layout.half, back));
      pieces.push(placePiece(entry, `${entry.position}-l`, -angle, -tilt, true, natural, layout.half, back));
      continue;
    }
    // out：顶上那半圈跟着方位转，底下那半圈转过去就倒了，保持正的（成对的那几种是从头像后面长出来的，哪个方位都朝外）；
    // hug：以正下方为正，贴着环转
    const turnOf = (angle: number): number => {
      if (layout.turn === 'hug') {
        const fromTop = normalize(angle);
        return entry.key === 'bow' && Math.abs(fromTop) <= 90 ? fromTop : normalize(angle - 180);
      }
      if (layout.turn === 'out') {
        const fromTop = normalize(angle);
        return layout.pair || Math.abs(fromTop) <= 100 ? fromTop : 0;
      }
      return 0;
    };
    if (layout.pair) {
      // 从外面看：贴着环的那种（月桂）右边那枝在方位的逆时针一侧，朝外的那种（耳朵、角）右边那片在顺时针一侧
      const sign = layout.turn === 'hug' ? -1 : 1;
      const right = base + sign * layout.pair.spread;
      const left = base - sign * layout.pair.spread;
      pieces.push(placePiece(entry, `${entry.position}-r`, right, turnOf(right), false, natural, layout.half, back));
      pieces.push(placePiece(entry, `${entry.position}-l`, left, turnOf(left), true, natural, layout.half, back));
      continue;
    }
    pieces.push(placePiece(entry, entry.position, base, turnOf(base), false, natural, layout.half, back));
  }
  return pieces;
}

/** 没写外发光、但动效是 pulse：拿环上居中的那个颜色当光的颜色。 */
function fallbackGlow(background: string): { color: string; blur: number } {
  const stops = background.match(/#[0-9a-f]{3,8}/g) ?? [];
  return { color: `${opaque(stops[Math.floor((stops.length - 1) / 2)] ?? '#ffffff')}99`, blur: DEFAULT_GLOW_BLUR };
}

function buildFrame(source: Record<string, unknown>): AvatarFrame | null {
  if (source.version !== SUPPORTED_VERSION || !onlyKnownFields(source, TOP_FIELDS)) {
    return null;
  }
  if (!isRecord(source.ring) || !onlyKnownFields(source.ring, RING_FIELDS)) {
    return null;
  }
  const background = readBackground(source.ring.background, true);
  if (!background || !inRange(source.ring.width, MIN_RING_WIDTH, MAX_RING_WIDTH)) {
    return null;
  }
  const width = Math.round(source.ring.width * 2) / 2;
  const gap = inRange(source.ring.gap, 0, MAX_RING_GAP) ? Math.round(source.ring.gap * 2) / 2 : 0;

  const glow = absent(source.glow) ? null : readGlow(source.glow, DEFAULT_GLOW_BLUR);
  const ornaments = absent(source.ornaments) ? [] : readOrnaments(source.ornaments);
  if (glow === UNKNOWN_FIELD || ornaments === UNKNOWN_FIELD) {
    return null;
  }
  const animation: AvatarFrameAnimation = source.animation === 'spin' || source.animation === 'pulse' || source.animation === 'shimmer' ? source.animation : 'none';
  const lightGlow = glow === INVALID ? null : glow;
  const light: FramePaint = { background: background.value, gradient: background.gradient, glow: lightGlow ?? (animation === 'pulse' ? fallbackGlow(background.value) : null) };

  let dark = light;
  if (isRecord(source.dark)) {
    const override = source.dark;
    if (!onlyKnownFields(override, DARK_FIELDS)) {
      return null;
    }
    let valid = true;
    let darkBackground: { value: string; gradient: boolean } | null = null;
    if (!absent(override.ring)) {
      if (!isRecord(override.ring)) {
        valid = false;
      } else if (!onlyKnownFields(override.ring, DARK_RING_FIELDS)) {
        return null;
      } else if (!absent(override.ring.background)) {
        darkBackground = readBackground(override.ring.background, true);
        valid = darkBackground !== null;
      }
    }
    const darkGlow = absent(override.glow) ? undefined : readGlow(override.glow, lightGlow?.blur ?? DEFAULT_GLOW_BLUR);
    if (darkGlow === UNKNOWN_FIELD) {
      return null;
    }
    if (valid && darkGlow !== INVALID) {
      const nextBackground = darkBackground?.value ?? light.background;
      // 没写就沿用浅色的光；写了但 blur 是 0（null）就是深色下不要光 —— pulse 例外，它得有光可呼吸
      const nextGlow = darkGlow === undefined ? (lightGlow ?? (animation === 'pulse' ? fallbackGlow(nextBackground) : null)) : darkGlow ?? (animation === 'pulse' ? fallbackGlow(nextBackground) : null);
      dark = { background: nextBackground, gradient: darkBackground ? darkBackground.gradient : light.gradient, glow: nextGlow };
    }
  }

  const vars: Record<string, string> = {
    '--kcaf-bg': light.background,
    '--kcaf-d-bg': dark.background,
    '--kcaf-out': percent(gap + width),
    '--kcaf-w': percent(width),
    '--kcaf-glow': light.glow?.color ?? 'transparent',
    '--kcaf-d-glow': dark.glow?.color ?? 'transparent',
    '--kcaf-blur': String(light.glow?.blur ?? 0),
    '--kcaf-d-blur': String(dark.glow?.blur ?? 0)
  };
  return {
    light,
    dark,
    width,
    gap,
    animation,
    pieces: buildPieces(ornaments === INVALID ? [] : ornaments, width, gap),
    hasGlow: Boolean(light.glow || dark.glow),
    vars: vars as CSSProperties
  };
}

// 和气泡皮肤一样：聊天里每条消息的发送者对象是各自的一份，先按对象查，查不到再按内容查，让同一件头像框共用同一份解析结果。
const byObject = new WeakMap<object, AvatarFrame | null>();
const byContent = new Map<string, AvatarFrame | null>();
const MAX_CONTENT_CACHE = 200;
const MAX_STYLE_JSON = 4000;

/** 解析并校验一份头像框的 `style`。不合法返回 null，调用方按没装备处理。 */
export function parseAvatarFrame(style: unknown): AvatarFrame | null {
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
  let frame: AvatarFrame | null = null;
  if (key !== null && key.length <= MAX_STYLE_JSON) {
    const cached = byContent.get(key);
    if (cached !== undefined) {
      frame = cached;
    } else {
      frame = buildFrame(style);
      if (byContent.size >= MAX_CONTENT_CACHE) {
        byContent.clear();
      }
      byContent.set(key, frame);
    }
  }
  byObject.set(style, frame);
  return frame;
}

/** 一个人装备着的头像框。用户对象没有 cosmetics（旧后端）、没装备、样式不合法，都是 null。 */
export function avatarFrameOf(user: { cosmetics?: unknown } | null | undefined): AvatarFrame | null {
  const cosmetics = user?.cosmetics;
  if (!isRecord(cosmetics) || !isRecord(cosmetics.frame)) {
    return null;
  }
  return parseAvatarFrame(cosmetics.frame.style);
}
