import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { registerNativeBackHandler } from '@/native/back';
import { resolveAssetUrl } from '@/utils/assetUrl';
import { Icon } from './Icon';

export interface ImageViewerState {
  images: string[];
  index: number;
}

interface ImageViewerPoint {
  x: number;
  y: number;
}

interface ImageViewerGesture {
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  startAt: number;
  originX: number;
  originY: number;
  originScale: number;
  pinchDistance?: number;
}

interface ImageViewerSize {
  width: number;
  height: number;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function pointDistance(left: ImageViewerPoint, right: ImageViewerPoint): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function midpoint(left: ImageViewerPoint, right: ImageViewerPoint): ImageViewerPoint {
  return { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 };
}

function touchesToPoints(touches: TouchList | React.TouchList): ImageViewerPoint[] {
  const points: ImageViewerPoint[] = [];
  for (let index = 0; index < touches.length; index += 1) {
    const touch = touches.item(index);
    if (touch) {
      points.push({ x: touch.clientX, y: touch.clientY });
    }
  }
  return points;
}

function getKukePortalRoot(): Element {
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

export function ImageViewer({ viewer, mobile = false, portal = true, onClose, onNavigate }: { viewer: ImageViewerState; mobile?: boolean; portal?: boolean; onClose: () => void; onNavigate: (index: number) => void }): JSX.Element {
  const safeIndex = Math.min(Math.max(viewer.index, 0), viewer.images.length - 1);
  const current = viewer.images[safeIndex];
  const src = resolveAssetUrl(current);
  const hasMany = viewer.images.length > 1;
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState<{ pointerId: number; x: number; y: number; originX: number; originY: number } | null>(null);
  const [isDraggingMobileImage, setIsDraggingMobileImage] = useState(false);
  const [showHint, setShowHint] = useState(true);
  const [naturalSize, setNaturalSize] = useState<ImageViewerSize | null>(null);
  const [viewportSize, setViewportSize] = useState<ImageViewerSize>(getKukeViewportSize);
  const gestureRef = useRef<ImageViewerGesture | null>(null);
  const touchPointsRef = useRef(new Map<number, ImageViewerPoint>());
  const lastTapRef = useRef(0);
  const maxFitWidth = viewportSize.width * (mobile ? 0.92 : 0.86);
  const maxFitHeight = viewportSize.height * (mobile ? 0.76 : 0.82);
  const fittedSize = naturalSize
    ? (() => {
        const fitScale = Math.min(maxFitWidth / naturalSize.width, maxFitHeight / naturalSize.height, 1);
        return {
          width: Math.max(1, Math.round(naturalSize.width * fitScale)),
          height: Math.max(1, Math.round(naturalSize.height * fitScale))
        };
      })()
    : null;
  const imageFitStyle = fittedSize
    ? { width: `${fittedSize.width}px`, height: `${fittedSize.height}px` }
    : { maxWidth: `${maxFitWidth}px`, maxHeight: `${maxFitHeight}px` };

  const zoom = (delta: number): void => {
    setScale((value) => clampNumber(Number((value + delta).toFixed(2)), 0.35, 5));
  };

  const resetView = (): void => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  const navigate = (index: number): void => {
    resetView();
    onNavigate(index);
  };

  const finishMobileGesture = (): void => {
    const gesture = gestureRef.current;
    gestureRef.current = null;
    touchPointsRef.current.clear();
    setIsDraggingMobileImage(false);
    if (!gesture) {
      return;
    }

    const dx = gesture.lastX - gesture.startX;
    const dy = gesture.lastY - gesture.startY;
    const elapsed = Math.max(1, Date.now() - gesture.startAt);
    const fastSwipe = Math.abs(dx) / elapsed > 0.45;

    if (scale <= 1.05 && Math.abs(dy) > 120 && Math.abs(dy) > Math.abs(dx) * 1.2) {
      onClose();
      return;
    }

    if (scale <= 1.05 && Math.abs(dx) > 72 && Math.abs(dx) > Math.abs(dy) * 1.2 && (fastSwipe || Math.abs(dx) > 110)) {
      if (dx < 0 && safeIndex < viewer.images.length - 1) {
        navigate(safeIndex + 1);
        return;
      }
      if (dx > 0 && safeIndex > 0) {
        navigate(safeIndex - 1);
        return;
      }
    }

    if (scale < 1) {
      resetView();
      return;
    }
    if (scale <= 1.05) {
      setPosition({ x: 0, y: 0 });
    }
  };

  const startMobileGesture = (points: ImageViewerPoint[], startAt = Date.now()): void => {
    if (points.length === 0) {
      return;
    }

    const startPoint = points.length >= 2 ? midpoint(points[0], points[1]) : points[0];
    gestureRef.current = {
      startX: startPoint.x,
      startY: startPoint.y,
      lastX: startPoint.x,
      lastY: startPoint.y,
      startAt,
      originX: position.x,
      originY: position.y,
      originScale: scale,
      pinchDistance: points.length >= 2 ? pointDistance(points[0], points[1]) : undefined
    };
    setIsDraggingMobileImage(true);
  };

  const updateMobileGesture = (points: ImageViewerPoint[]): void => {
    const gesture = gestureRef.current;
    if (!gesture || points.length === 0) {
      return;
    }

    const currentPoint = points.length >= 2 ? midpoint(points[0], points[1]) : points[0];
    gesture.lastX = currentPoint.x;
    gesture.lastY = currentPoint.y;

    const dx = currentPoint.x - gesture.startX;
    const dy = currentPoint.y - gesture.startY;

    if (points.length >= 2 && gesture.pinchDistance) {
      const nextScale = clampNumber(gesture.originScale * (pointDistance(points[0], points[1]) / gesture.pinchDistance), 1, 5);
      setScale(nextScale);
      setPosition({ x: gesture.originX + dx, y: gesture.originY + dy });
      return;
    }

    if (scale > 1.05) {
      setPosition({ x: gesture.originX + dx, y: gesture.originY + dy });
    } else {
      setPosition({ x: dx * 0.28, y: dy * 0.28 });
    }
  };

  useEffect(() => {
    resetView();
    setShowHint(true);
    setNaturalSize(null);
    gestureRef.current = null;
    touchPointsRef.current.clear();
    setIsDraggingMobileImage(false);
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
        onClose();
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
  }, [onClose, safeIndex, viewer.images.length]);

  useEffect(() => {
    if (!mobile) {
      return undefined;
    }
    return registerNativeBackHandler(() => {
      onClose();
      return true;
    }, 130);
  }, [mobile, onClose]);

  if (mobile) {
    const mobileViewer = (
      <div
        className="kc-mobile-image-viewer pointer-events-auto absolute inset-0 z-[2147483647] overflow-hidden bg-black text-white"
        style={{ touchAction: 'none', overscrollBehavior: 'none' }}
        onTouchStart={(event) => {
          event.preventDefault();
          const points = touchesToPoints(event.touches);
          const now = Date.now();
          if (points.length === 1 && now - lastTapRef.current < 280) {
            lastTapRef.current = 0;
            if (scale > 1.05) {
              resetView();
            } else {
              setScale(2.35);
              setPosition({ x: 0, y: 0 });
            }
            return;
          }
          lastTapRef.current = points.length === 1 ? now : 0;
          startMobileGesture(points, now);
        }}
        onTouchMove={(event) => {
          event.preventDefault();
          const points = touchesToPoints(event.touches);
          if (!gestureRef.current) {
            startMobileGesture(points);
          }
          updateMobileGesture(points);
        }}
        onTouchEnd={(event) => {
          event.preventDefault();
          const points = touchesToPoints(event.touches);
          if (points.length > 0) {
            startMobileGesture(points);
            return;
          }
          finishMobileGesture();
        }}
        onTouchCancel={(event) => {
          event.preventDefault();
          finishMobileGesture();
        }}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-32 bg-gradient-to-b from-black/70 to-transparent" />
        <div className="absolute left-0 right-0 top-0 z-20 flex items-center justify-between px-4 pb-3 pt-[max(14px,env(safe-area-inset-top))]">
          <button type="button" onClick={onClose} className="pointer-events-auto grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white backdrop-blur-md active:scale-95" aria-label="关闭图片预览">
            <Icon name="chevronLeft" className="h-6 w-6" />
          </button>
          <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/95 backdrop-blur-md">{safeIndex + 1} / {viewer.images.length}</span>
          <button type="button" onClick={resetView} className="pointer-events-auto rounded-full bg-white/10 px-3 py-2 text-xs font-semibold text-white backdrop-blur-md active:scale-95">原图</button>
        </div>

        <div className="flex h-full w-full items-center justify-center overflow-hidden px-0 py-0">
          {src ? (
            <img
              src={src}
              alt="图片预览"
              draggable={false}
              onLoad={(event) => setNaturalSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
              className={`max-h-full max-w-full select-none object-contain ${isDraggingMobileImage ? '' : 'transition-transform duration-200 ease-out'}`}
              style={{ ...imageFitStyle, transform: `translate3d(${position.x}px, ${position.y}px, 0) scale(${scale})`, touchAction: 'none' }}
            />
          ) : <div className="rounded-2xl bg-white/10 px-5 py-4 text-sm font-semibold text-white">图片不可用</div>}
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-32 bg-gradient-to-t from-black/60 to-transparent" />
        {showHint ? <div className="pointer-events-none absolute bottom-[max(20px,env(safe-area-inset-bottom))] left-1/2 z-20 max-w-[calc(100vw-32px)] -translate-x-1/2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white/90 backdrop-blur-md">双击缩放，双指缩放，左右滑动切换，下滑关闭</div> : null}
      </div>
    );
    return portal ? createPortal(mobileViewer, getKukePortalRoot()) : mobileViewer;
  }

  const desktopViewer = (
    <div className="pointer-events-auto absolute inset-0 z-[2147483647] flex items-center justify-center p-4 backdrop-blur-sm" style={{ backgroundColor: 'rgba(0, 0, 0, 0.82)' }} onMouseDown={onClose}>
      <div
        className="relative flex h-full w-full items-center justify-center overflow-hidden"
        onMouseDown={(event) => event.stopPropagation()}
        onWheel={(event) => {
          event.preventDefault();
          zoom(event.deltaY < 0 ? 0.15 : -0.15);
        }}
      >
        {src ? <img src={src} alt="图片预览" draggable={false} onLoad={(event) => setNaturalSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          setDragStart({ pointerId: event.pointerId, x: event.clientX, y: event.clientY, originX: position.x, originY: position.y });
        }} onPointerMove={(event) => {
          if (!dragStart || dragStart.pointerId !== event.pointerId) {
            return;
          }
          setPosition({ x: dragStart.originX + event.clientX - dragStart.x, y: dragStart.originY + event.clientY - dragStart.y });
        }} onPointerUp={(event) => {
          if (dragStart?.pointerId === event.pointerId) {
            setDragStart(null);
          }
        }} className="select-none rounded-2xl object-contain shadow-2xl transition-transform duration-75" style={{ ...imageFitStyle, transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`, cursor: dragStart ? 'grabbing' : scale > 1 ? 'grab' : 'zoom-in' }} /> : <div className="rounded-2xl bg-white/10 px-5 py-4 text-sm font-semibold text-white">图片不可用</div>}

        <div className="absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/55 px-3 py-2 text-white shadow-xl">
          <button type="button" onClick={() => zoom(-0.2)} className="grid h-8 w-8 place-items-center rounded-full transition hover:bg-white/15" aria-label="缩小">-</button>
          <button type="button" onClick={resetView} className="rounded-full px-3 py-1 text-xs font-semibold transition hover:bg-white/15" aria-label="重置缩放">{Math.round(scale * 100)}%</button>
          <button type="button" onClick={() => zoom(0.2)} className="grid h-8 w-8 place-items-center rounded-full transition hover:bg-white/15" aria-label="放大">+</button>
        </div>

        <button type="button" onClick={onClose} className="absolute right-4 top-4 grid h-11 w-11 place-items-center rounded-full bg-black/60 text-white shadow-xl transition hover:bg-black/80" aria-label="关闭图片预览">
          <Icon name="close" className="h-5 w-5" />
        </button>
        {hasMany && safeIndex > 0 ? (
          <button type="button" onClick={() => navigate(safeIndex - 1)} className="absolute left-5 top-1/2 grid h-14 w-14 -translate-y-1/2 place-items-center rounded-full bg-black/60 text-white shadow-xl transition hover:bg-black/80" aria-label="上一张">
            <Icon name="chevron" className="h-7 w-7 rotate-180" />
          </button>
        ) : null}
        {hasMany && safeIndex < viewer.images.length - 1 ? (
          <button type="button" onClick={() => navigate(safeIndex + 1)} className="absolute right-5 top-1/2 grid h-14 w-14 -translate-y-1/2 place-items-center rounded-full bg-black/60 text-white shadow-xl transition hover:bg-black/80" aria-label="下一张">
            <Icon name="chevron" className="h-7 w-7" />
          </button>
        ) : null}
        {hasMany ? <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-3 py-1.5 text-xs font-semibold text-white shadow-xl">{safeIndex + 1} / {viewer.images.length}</div> : null}
        {showHint ? <div className="pointer-events-none absolute bottom-14 left-1/2 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-full bg-black/50 px-3 py-1.5 text-xs font-medium text-white/90 shadow-xl transition-opacity">滚轮缩放，拖拽移动</div> : null}
      </div>
    </div>
  );
  return portal ? createPortal(desktopViewer, getKukePortalRoot()) : desktopViewer;
}
