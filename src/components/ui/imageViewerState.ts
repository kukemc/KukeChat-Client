import { useEffect, useState } from 'react';
import { resolveAssetUrl } from '@/utils/assetUrl';

// 看图浮层的状态：当前第几张、缩放和位移、按窗口算出的适配尺寸、键盘操作。
// 手机端（手势）和桌面端（滚轮、拖动）各有各的界面，这一份是它们共用的。

export interface ImageViewerState {
  images: string[];
  index: number;
}

export interface ImageViewerProps {
  viewer: ImageViewerState;
  mobile?: boolean;
  portal?: boolean;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

interface ImageViewerSize {
  width: number;
  height: number;
}

export const MIN_SCALE = 0.35;
export const MAX_SCALE = 5;

export function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function getKukePortalRoot(): Element {
  const host = document.getElementById('kukechat-shadow-host');
  return host?.shadowRoot?.querySelector('.kc-window-frame:not(.kc-window-minimized)') ?? document.querySelector('.kc-window-frame:not(.kc-window-minimized)') ?? host?.shadowRoot?.getElementById('kukechat-root') ?? document.getElementById('kukechat-root') ?? document.body;
}

function getKukeViewportSize(): ImageViewerSize {
  const root = getKukePortalRoot();
  const rect = root.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) {
    return { width: rect.width, height: rect.height };
  }
  return {
    width: typeof window === 'undefined' ? 1024 : window.innerWidth,
    height: typeof window === 'undefined' ? 768 : window.innerHeight
  };
}

interface ImageViewerOptions extends Pick<ImageViewerProps, 'viewer' | 'onClose' | 'onNavigate'> {
  /** 图片最多占窗口宽、高的几成 */
  fit: { width: number; height: number };
  /** Esc 由这里直接关闭。桌面端的浮层另有一套按层级响应 Esc 的机制，传 false */
  closeOnEscape: boolean;
}

export function useImageViewer({ viewer, fit, closeOnEscape, onClose, onNavigate }: ImageViewerOptions) {
  const safeIndex = Math.min(Math.max(viewer.index, 0), viewer.images.length - 1);
  const src = resolveAssetUrl(viewer.images[safeIndex]);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [showHint, setShowHint] = useState(true);
  const [naturalSize, setNaturalSize] = useState<ImageViewerSize | null>(null);
  const [viewportSize, setViewportSize] = useState<ImageViewerSize>(getKukeViewportSize);
  const maxFitWidth = viewportSize.width * fit.width;
  const maxFitHeight = viewportSize.height * fit.height;
  const fittedSize = naturalSize
    ? (() => {
        const fitScale = Math.min(maxFitWidth / naturalSize.width, maxFitHeight / naturalSize.height, 1);
        return {
          width: Math.max(1, Math.round(naturalSize.width * fitScale)),
          height: Math.max(1, Math.round(naturalSize.height * fitScale))
        };
      })()
    : null;
  /** 图片没加载出来之前先用上限框住，拿到原始尺寸后换成算好的宽高 */
  const imageFitStyle = fittedSize
    ? { width: `${fittedSize.width}px`, height: `${fittedSize.height}px` }
    : { maxWidth: `${maxFitWidth}px`, maxHeight: `${maxFitHeight}px` };

  const zoom = (delta: number): void => {
    setScale((value) => clampNumber(Number((value + delta).toFixed(2)), MIN_SCALE, MAX_SCALE));
  };

  const resetView = (): void => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  const navigate = (index: number): void => {
    resetView();
    onNavigate(index);
  };

  useEffect(() => {
    resetView();
    setShowHint(true);
    setNaturalSize(null);
  }, [src]);

  useEffect(() => {
    function updateViewportSize(): void {
      setViewportSize(getKukeViewportSize());
    }

    updateViewportSize();
    window.addEventListener('resize', updateViewportSize);
    window.addEventListener('orientationchange', updateViewportSize);
    return () => {
      window.removeEventListener('resize', updateViewportSize);
      window.removeEventListener('orientationchange', updateViewportSize);
    };
  }, []);

  useEffect(() => {
    if (!showHint) {
      return;
    }
    const timer = window.setTimeout(() => setShowHint(false), 2200);
    return () => window.clearTimeout(timer);
  }, [showHint]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        if (closeOnEscape) {
          onClose();
        }
      } else if (event.key === 'ArrowLeft' && safeIndex > 0) {
        navigate(safeIndex - 1);
      } else if (event.key === 'ArrowRight' && safeIndex < viewer.images.length - 1) {
        navigate(safeIndex + 1);
      } else if (event.key === '+' || event.key === '=') {
        zoom(0.2);
      } else if (event.key === '-') {
        zoom(-0.2);
      } else if (event.key === '0') {
        resetView();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeOnEscape, onClose, safeIndex, viewer.images.length]);

  return {
    safeIndex,
    src,
    count: viewer.images.length,
    scale,
    setScale,
    position,
    setPosition,
    showHint,
    imageFitStyle,
    onImageLoad: (event: React.SyntheticEvent<HTMLImageElement>) => setNaturalSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight }),
    zoom,
    resetView,
    navigate
  };
}
