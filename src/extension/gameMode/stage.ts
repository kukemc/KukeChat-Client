/**
 * 把覆盖层贴合到 Scratch 舞台上。
 *
 * 这一层直接移植自 kukemc/WebDev 扩展（`src/stage/StageMethods.js`），那套逻辑
 * 已在 CCW 编辑器、作品播放页、全屏、手机端旋转等场景下长期验证过。自行推导
 * 几何很容易在某个场景翻车，所以这里保持与其一致，不做「简化」。
 *
 * 几条关键经验：
 *
 * 1. **优先读布局盒（offsetLeft/offsetWidth），而不是 getBoundingClientRect()。**
 *    后者返回的是应用 CSS transform 之后的轴对齐包围盒；手机端播放器会把舞台
 *    整体 rotate(90deg)，包围盒的宽高会被对调、原点也不对，覆盖层会缩成一小块
 *    贴在角落。布局盒不受 transform 影响。
 *
 * 2. **覆盖层挂成 canvas 的兄弟节点**，天然继承祖先的 transform 与裁剪。
 *    容器是 `display: contents` 时不生成盒子、当不了定位基准，要继续往上找。
 *
 * 3. **容器是 position:static 时必须临时改成 relative**，否则绝对定位的覆盖层
 *    会以更上层的祖先为基准，表现为聊天框跑到舞台外面。
 *
 * 4. **z-index 要遍历整条祖先链取最大值再加一。** 只看 canvas 自身通常是
 *    auto(0)，会被舞台外层容器的层级盖住。
 *
 * 5. **用 requestAnimationFrame 持续对齐**，而不是逐个监听尺寸变化来源。
 */

import type { ScratchRuntime } from '@/types/scratch';

/** Scratch 默认舞台逻辑尺寸。 */
const DEFAULT_STAGE_WIDTH = 480;
const DEFAULT_STAGE_HEIGHT = 360;

export interface StageBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface StageGeometry extends StageBox {
  logicalWidth: number;
  logicalHeight: number;
  /** 逻辑 → 物理的等比缩放系数。 */
  scale: number;
  /** 等比缩放后为居中留出的偏移。 */
  offsetX: number;
  offsetY: number;
}

let runtimeRef: ScratchRuntime | undefined;

export function setStageRuntime(runtime: ScratchRuntime | undefined): void {
  runtimeRef = runtime;
}

type RendererLike = {
  canvas?: unknown;
  _canvas?: unknown;
  gl?: { canvas?: unknown };
  _gl?: { canvas?: unknown };
  _nativeSize?: unknown;
};

function renderer(): RendererLike | undefined {
  return (runtimeRef as (ScratchRuntime & { renderer?: RendererLike }) | undefined)?.renderer;
}

export function fullscreenElement(): HTMLElement | null {
  const doc = document as Document & {
    webkitFullscreenElement?: Element | null;
    mozFullScreenElement?: Element | null;
    msFullscreenElement?: Element | null;
  };
  const node =
    doc.fullscreenElement ??
    doc.webkitFullscreenElement ??
    doc.mozFullScreenElement ??
    doc.msFullscreenElement ??
    null;
  return node instanceof HTMLElement ? node : null;
}

/**
 * 舞台 canvas。渲染器持有的那个才是确定答案 —— 编辑器页面里同时存在角色
 * 缩略图、造型编辑器等多个 canvas，按 DOM 顺序去猜必然选错。
 */
export function findStageCanvas(): HTMLCanvasElement | null {
  const r = renderer();
  for (const candidate of [r?.canvas, r?._canvas, r?.gl?.canvas, r?._gl?.canvas]) {
    if (candidate instanceof HTMLCanvasElement) {
      return candidate;
    }
  }
  return document.querySelector<HTMLCanvasElement>('canvas[class*="stage"], canvas');
}

/** 舞台逻辑尺寸。渲染器的 _nativeSize 是权威来源（Gandi 可自定义舞台大小）。 */
export function stageLogicalSize(): { width: number; height: number } {
  const native = renderer()?._nativeSize;
  if (Array.isArray(native) && native.length >= 2) {
    const [w, h] = native;
    if (typeof w === 'number' && w > 0 && typeof h === 'number' && h > 0) {
      return { width: w, height: h };
    }
  }
  const rt = runtimeRef as (ScratchRuntime & { stageWidth?: number; stageHeight?: number }) | undefined;
  return {
    width: typeof rt?.stageWidth === 'number' && rt.stageWidth > 0 ? rt.stageWidth : DEFAULT_STAGE_WIDTH,
    height: typeof rt?.stageHeight === 'number' && rt.stageHeight > 0 ? rt.stageHeight : DEFAULT_STAGE_HEIGHT
  };
}

/**
 * 覆盖层该挂到哪个元素下。
 *
 * 返回 null 表示当前没有可用挂载点 —— canvas 自己就是全屏元素时它处于顶层，
 * 任何兄弟节点都盖不上去，此时调用方应把覆盖层隐藏。
 */
export function stageOverlayHost(canvas: HTMLCanvasElement | null): HTMLElement | null {
  const fullscreen = fullscreenElement();
  if (!canvas || canvas.nodeType !== 1) {
    return fullscreen ? null : document.body;
  }
  if (fullscreen && canvas === fullscreen) {
    return null;
  }

  let parent = canvas.parentElement;
  // display:contents 的容器不生成盒子，不能作为定位参照，继续往上找
  while (parent && parent.nodeType === 1 && parent !== document.body) {
    let display = '';
    try {
      display = window.getComputedStyle(parent).display;
    } catch {
      break;
    }
    if (display !== 'contents') {
      break;
    }
    parent = parent.parentElement;
  }
  if (parent && parent.nodeType === 1 && parent.tagName !== 'CANVAS') {
    return parent;
  }
  if (fullscreen && fullscreen.tagName !== 'CANVAS') {
    return fullscreen;
  }
  return fullscreen ? null : document.body;
}

// 被改成 relative 的容器，切换或卸载时要还原，别在页面上留痕
let patchedHost: { element: HTMLElement; inlinePosition: string } | null = null;

export function restoreOverlayHost(): void {
  if (!patchedHost) {
    return;
  }
  const { element, inlinePosition } = patchedHost;
  patchedHost = null;
  try {
    if (element.style.position === 'relative') {
      if (inlinePosition) {
        element.style.position = inlinePosition;
      } else {
        element.style.removeProperty('position');
      }
    }
  } catch {
    // 元素已卸载，无需还原
  }
}

/**
 * 把覆盖层挂进 host，并保证它能作为定位基准。
 *
 * @returns 实际挂载到的元素；返回 null 表示当前无法挂载，应隐藏覆盖层。
 */
export function attachOverlayHost(overlay: HTMLElement, host: HTMLElement | null): HTMLElement | null {
  let target = host;
  if (!target || target.nodeType !== 1 || !target.isConnected) {
    if (fullscreenElement()) {
      return null;
    }
    target = document.body;
  }
  if (target.tagName === 'CANVAS') {
    return null;
  }
  if (target !== document.body) {
    let display = '';
    try {
      display = window.getComputedStyle(target).display;
    } catch {
      display = 'contents';
    }
    if (display === 'contents') {
      if (fullscreenElement()) {
        return null;
      }
      target = document.body;
    }
  }

  if (patchedHost && patchedHost.element !== target) {
    restoreOverlayHost();
  }

  if (overlay.parentElement !== target) {
    try {
      target.appendChild(overlay);
    } catch {
      return null;
    }
  }

  if (target !== document.body && patchedHost?.element !== target) {
    try {
      if (window.getComputedStyle(target).position === 'static') {
        patchedHost = { element: target, inlinePosition: target.style.position };
        target.style.position = 'relative';
      }
    } catch {
      // 拿不到样式就按原样挂
    }
  }
  return target;
}

/** 舞台在视口中的矩形。全屏时以全屏元素内的 canvas 为准。 */
function stageRect(canvas: HTMLCanvasElement): StageBox {
  const fullscreen = fullscreenElement();
  if (fullscreen) {
    if (canvas === fullscreen) {
      return { left: 0, top: 0, width: 0, height: 0 };
    }
    let target: Element | null = fullscreen.contains(canvas) ? canvas : null;
    target = target ?? fullscreen.querySelector('canvas') ?? fullscreen;
    const rect = target.getBoundingClientRect();
    if (rect.width && rect.height) {
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    }
    return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
  }
  const rect = canvas.getBoundingClientRect();
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

/** 矩形差值兜底路径，需补上 host 的滚动与边框偏移。 */
function overlayRect(canvas: HTMLCanvasElement, host: HTMLElement): StageBox {
  const rect = stageRect(canvas);
  if (host === document.body) {
    return rect;
  }
  const hostRect = host.getBoundingClientRect();
  return {
    left: rect.left - hostRect.left + (host.scrollLeft || 0) - (host.clientLeft || 0),
    top: rect.top - hostRect.top + (host.scrollTop || 0) - (host.clientTop || 0),
    width: rect.width,
    height: rect.height
  };
}

/**
 * 覆盖层要对齐到的盒子。
 *
 * 优先布局盒 —— 它不受 transform 影响；只有 canvas 并非由该 host 定位时
 * （绝对定位到别处、或只能挂 body）才退回矩形差值。
 */
export function overlayBox(canvas: HTMLCanvasElement, host: HTMLElement): StageBox {
  if (host !== document.body && canvas.offsetParent === host) {
    const width = canvas.offsetWidth;
    const height = canvas.offsetHeight;
    if (width && height) {
      return { left: canvas.offsetLeft, top: canvas.offsetTop, width, height };
    }
  }
  return overlayRect(canvas, host);
}

export function measureStage(canvas: HTMLCanvasElement, host: HTMLElement): StageGeometry {
  const box = overlayBox(canvas, host);
  const logical = stageLogicalSize();
  // 舞台等比渲染（contain），取较小的一边；两边一致时结果相同
  const scale = Math.min(box.width / logical.width, box.height / logical.height) || 1;
  return {
    ...box,
    logicalWidth: logical.width,
    logicalHeight: logical.height,
    scale,
    offsetX: (box.width - logical.width * scale) / 2,
    offsetY: (box.height - logical.height * scale) / 2
  };
}

function meaningfulBorderRadius(radius: string): string {
  const value = String(radius || '').trim();
  if (!value) {
    return '';
  }
  // "0px" / "0px 0px 0px 0px" 之类等同于没有圆角
  return /^(?:0(?:px|%)?\s*)+$/.test(value) ? '' : value;
}

/** canvas 自身带的 transform 与圆角需要复刻，祖先层面的由「同父」自动继承。 */
export function readCanvasShape(canvas: HTMLCanvasElement): {
  transform: string;
  transformOrigin: string;
  borderRadius: string;
} {
  try {
    const style = window.getComputedStyle(canvas);
    const transform = style.transform && style.transform !== 'none' ? style.transform : '';
    return {
      transform,
      transformOrigin: transform ? style.transformOrigin || '50% 50%' : '',
      borderRadius: meaningfulBorderRadius(style.borderRadius)
    };
  } catch {
    return { transform: '', transformOrigin: '', borderRadius: '' };
  }
}

function elementZIndex(element: Element): number {
  try {
    const value = window.getComputedStyle(element).zIndex;
    if (!value || value === 'auto') {
      return 0;
    }
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return 0;
  }
}

/**
 * 覆盖层的 z-index：遍历 canvas 与全屏元素的整条祖先链取最大值再加一。
 *
 * 只看 canvas 自身通常是 auto(0)，会被舞台外层容器的层级盖住。
 */
export function stageOverlayZIndex(canvas: HTMLCanvasElement): number {
  let maxZ = 0;
  for (const start of [canvas, fullscreenElement()]) {
    let current: Element | null = start;
    while (current && current.nodeType === 1) {
      maxZ = Math.max(maxZ, elementZIndex(current));
      current = current.parentElement;
    }
  }
  return Math.max(1, maxZ + 1);
}
