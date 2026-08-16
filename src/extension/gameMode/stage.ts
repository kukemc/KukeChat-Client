/**
 * 把覆盖层贴合到 Scratch 舞台上。
 *
 * 舞台的逻辑坐标是固定的（默认 480×360，Gandi 可自定义），但它在页面上的物理
 * 尺寸随小窗 / 大窗 / 全屏 / 手机旋转不断变化。这里负责把两者对上，让开发者
 * 用**舞台逻辑坐标**摆放聊天框，实际显示自动等比缩放。
 *
 * 三条经验来自 kukemc/WebDev 扩展踩过的坑：
 *
 * 1. **用布局盒（offsetLeft/offsetWidth）而不是 getBoundingClientRect()。**
 *    后者返回的是应用 CSS transform 之后的轴对齐包围盒；手机端播放器会把舞台
 *    整体 rotate(90deg)，包围盒的宽高会被对调、原点也不对，覆盖层就会缩成一小
 *    块贴在角落。布局盒不受 transform 影响。
 *
 * 2. **覆盖层必须挂成 canvas 的兄弟节点。** 这样祖先层面的 transform / 裁剪
 *    会自动同样作用到覆盖层上，不需要自己复刻。
 *
 * 3. **用 requestAnimationFrame 持续对齐，而不是 ResizeObserver。** 舞台尺寸
 *    变化的来源太多（布局切换、全屏、窗口缩放、设备旋转、CSS 动画），逐个监听
 *    容易漏；每帧对齐一次代价很低且绝不会失同步。
 */

import type { ScratchRuntime } from '@/types/scratch';

/** Scratch 默认舞台逻辑尺寸。 */
const DEFAULT_STAGE_WIDTH = 480;
const DEFAULT_STAGE_HEIGHT = 360;

export interface StageGeometry {
  /** 舞台在页面上的物理尺寸与位置（相对挂载父容器的布局盒）。 */
  left: number;
  top: number;
  width: number;
  height: number;
  /** 舞台逻辑尺寸。 */
  logicalWidth: number;
  logicalHeight: number;
  /** 逻辑 → 物理的等比缩放系数。 */
  scale: number;
}

let runtimeRef: ScratchRuntime | undefined;

export function setStageRuntime(runtime: ScratchRuntime | undefined): void {
  runtimeRef = runtime;
}

/**
 * 找到舞台 canvas。
 *
 * 首选从渲染器直接取 —— 这是唯一确定的答案。编辑器页面里同时存在多个
 * canvas（角色缩略图、造型编辑器、绘图板等），按「第一个可见的」去猜会选错，
 * 表现为聊天框尺寸和位置都对不上舞台。
 */
export function findStageCanvas(): HTMLCanvasElement | null {
  const renderer = (runtimeRef as (ScratchRuntime & { renderer?: { canvas?: unknown; gl?: { canvas?: unknown } } }) | undefined)?.renderer;
  const fromRenderer = renderer?.canvas ?? renderer?.gl?.canvas;
  if (fromRenderer instanceof HTMLCanvasElement && fromRenderer.isConnected) {
    return fromRenderer;
  }

  // 兜底：取渲染面积最大的可见 canvas。舞台几乎总是页面里最大的那个。
  let best: HTMLCanvasElement | null = null;
  let bestArea = 0;
  for (const canvas of Array.from(document.querySelectorAll('canvas'))) {
    if (canvas.offsetParent === null) {
      continue;
    }
    const area = canvas.offsetWidth * canvas.offsetHeight;
    if (area > bestArea) {
      bestArea = area;
      best = canvas;
    }
  }
  return best;
}

/**
 * 舞台逻辑尺寸。Gandi 支持自定义舞台大小，优先问 runtime。
 */
export function stageLogicalSize(): { width: number; height: number } {
  const rt = runtimeRef as
    | (ScratchRuntime & {
        stageWidth?: number;
        stageHeight?: number;
        renderer?: { _nativeSize?: unknown };
      })
    | undefined;

  // 渲染器的 _nativeSize 是舞台逻辑尺寸的权威来源，Gandi 改过舞台大小时
  // 只有它是准的；runtime.stageWidth 与默认值都只是退路。
  const native = rt?.renderer?._nativeSize;
  if (Array.isArray(native) && native.length >= 2) {
    const [w, h] = native;
    if (typeof w === 'number' && w > 0 && typeof h === 'number' && h > 0) {
      return { width: w, height: h };
    }
  }

  const width = typeof rt?.stageWidth === 'number' && rt.stageWidth > 0 ? rt.stageWidth : DEFAULT_STAGE_WIDTH;
  const height = typeof rt?.stageHeight === 'number' && rt.stageHeight > 0 ? rt.stageHeight : DEFAULT_STAGE_HEIGHT;
  return { width, height };
}

/**
 * 覆盖层应当挂到哪个元素下 —— 优先是舞台 canvas 的父容器。
 *
 * 作为 canvas 的兄弟节点，祖先的 transform 会自动同样作用到覆盖层上。
 * 父容器是 `display: contents` 时它不生成盒子、无法作为定位基准，退回 body。
 */
export function stageOverlayHost(canvas: HTMLCanvasElement): HTMLElement {
  const parent = canvas.parentElement;
  if (!parent || !parent.isConnected) {
    return document.body;
  }
  try {
    if (window.getComputedStyle(parent).display === 'contents') {
      return document.body;
    }
  } catch {
    return document.body;
  }
  return parent;
}

/** 全屏时舞台会被搬进全屏元素，覆盖层要跟着走。 */
export function fullscreenElement(): HTMLElement | null {
  const node = document.fullscreenElement as HTMLElement | null;
  return node && node.nodeType === 1 ? node : null;
}

// 被我们改成 relative 的容器，卸载时要还原，别在页面上留痕
let patchedHost: { element: HTMLElement; inlinePosition: string } | null = null;

/**
 * 把覆盖层挂进 host，并保证它能作为定位基准。
 *
 * **这是最容易出错的一步**：`position: absolute` 的覆盖层会以最近的
 * *已定位* 祖先为基准。舞台容器多数是 `position: static`，直接挂进去
 * 会让覆盖层以更上层的某个祖先定位 —— 表现就是聊天框跑到舞台外面、
 * 或者切换舞台大小后彻底消失。所以静态容器要临时改成 relative。
 */
export function attachOverlayHost(overlay: HTMLElement, host: HTMLElement): boolean {
  if (!host.isConnected || host.tagName === 'CANVAS') {
    return false;
  }
  if (overlay.parentElement !== host) {
    try {
      host.appendChild(overlay);
    } catch {
      return false;
    }
  }

  if (patchedHost && patchedHost.element !== host) {
    restoreOverlayHost();
  }

  if (host === document.body || patchedHost?.element === host) {
    return true;
  }

  try {
    if (window.getComputedStyle(host).position === 'static') {
      patchedHost = { element: host, inlinePosition: host.style.position };
      host.style.position = 'relative';
    }
  } catch {
    // 拿不到样式就按原样挂，至少不会崩
  }
  return true;
}

/** 还原此前为了定位而改过的容器样式。 */
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
 * 计算覆盖层要对齐到的盒子。
 *
 * 优先读布局盒；只有当 canvas 并非由该 host 定位时（绝对/固定定位到别处，
 * 或只能挂到 body）才退回矩形差值。
 */
function overlayBox(canvas: HTMLCanvasElement, host: HTMLElement): { left: number; top: number; width: number; height: number } {
  if (host !== document.body && canvas.offsetParent === host) {
    const width = canvas.offsetWidth;
    const height = canvas.offsetHeight;
    if (width && height) {
      return { left: canvas.offsetLeft, top: canvas.offsetTop, width, height };
    }
  }

  const canvasRect = canvas.getBoundingClientRect();
  if (host === document.body) {
    // 挂在 body 上时用 fixed 定位，直接用视口坐标
    return { left: canvasRect.left, top: canvasRect.top, width: canvasRect.width, height: canvasRect.height };
  }
  const hostRect = host.getBoundingClientRect();
  return {
    left: canvasRect.left - hostRect.left,
    top: canvasRect.top - hostRect.top,
    width: canvasRect.width,
    height: canvasRect.height
  };
}

export function measureStage(canvas: HTMLCanvasElement, host: HTMLElement): StageGeometry {
  const box = overlayBox(canvas, host);
  const logical = stageLogicalSize();
  // 舞台始终等比渲染，取较小的一边即可；两边一致时结果相同
  const scale = Math.min(box.width / logical.width, box.height / logical.height) || 1;
  return {
    ...box,
    logicalWidth: logical.width,
    logicalHeight: logical.height,
    scale
  };
}

/** canvas 自身带的 transform 与圆角需要复刻，祖先层面的由「同父」自动继承。 */
export function readCanvasShape(canvas: HTMLCanvasElement): { transform: string; transformOrigin: string; borderRadius: string } {
  try {
    const style = window.getComputedStyle(canvas);
    const transform = style.transform && style.transform !== 'none' ? style.transform : '';
    const radius = style.borderRadius && style.borderRadius !== '0px' ? style.borderRadius : '';
    return {
      transform,
      transformOrigin: transform ? style.transformOrigin || '50% 50%' : '',
      borderRadius: radius
    };
  } catch {
    // 跨文档或已卸载的元素
    return { transform: '', transformOrigin: '', borderRadius: '' };
  }
}

/**
 * 覆盖层的 z-index。取舞台 canvas 的层级再加一点，既盖住画面又不越过
 * 编辑器自己的弹窗。
 */
export function stageOverlayZIndex(canvas: HTMLCanvasElement): number {
  try {
    const raw = window.getComputedStyle(canvas).zIndex;
    const base = Number.parseInt(raw, 10);
    return Number.isFinite(base) ? base + 5 : 10;
  } catch {
    return 10;
  }
}
