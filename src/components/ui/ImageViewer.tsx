import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { registerNativeBackHandler } from '@/native/back';
import { Icon } from './Icon';
import { ImageViewerDesktop } from './desktop/ImageViewerDesktop';
import { clampNumber, getKukePortalRoot, useImageViewer, type ImageViewerProps } from './imageViewerState';

export type { ImageViewerState } from './imageViewerState';

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

/** 全屏看图。手机端靠手势（双击、双指缩放、左右滑切换、下滑关闭），桌面端靠滚轮、拖动和工具条。 */
export function ImageViewer({ mobile = false, ...props }: ImageViewerProps): JSX.Element {
  return mobile ? <MobileImageViewer {...props} /> : <ImageViewerDesktop {...props} />;
}

function MobileImageViewer({ viewer, portal = true, onClose, onNavigate }: Omit<ImageViewerProps, 'mobile'>): JSX.Element {
  const { safeIndex, src, count, scale, setScale, position, setPosition, showHint, imageFitStyle, onImageLoad, resetView, navigate } = useImageViewer({ viewer, fit: { width: 0.92, height: 0.76 }, closeOnEscape: true, onClose, onNavigate });
  const [isDraggingMobileImage, setIsDraggingMobileImage] = useState(false);
  const gestureRef = useRef<ImageViewerGesture | null>(null);
  const touchPointsRef = useRef(new Map<number, ImageViewerPoint>());
  const lastTapRef = useRef(0);

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
      if (dx < 0 && safeIndex < count - 1) {
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

  // 换了一张图，没做完的手势作废
  useEffect(() => {
    gestureRef.current = null;
    touchPointsRef.current.clear();
    setIsDraggingMobileImage(false);
  }, [src]);

  useEffect(() => registerNativeBackHandler(() => {
    onClose();
    return true;
  }, 130), [onClose]);

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
        <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/95 backdrop-blur-md">{safeIndex + 1} / {count}</span>
        <button type="button" onClick={resetView} className="pointer-events-auto rounded-full bg-white/10 px-3 py-2 text-xs font-semibold text-white backdrop-blur-md active:scale-95">原图</button>
      </div>

      <div className="flex h-full w-full items-center justify-center overflow-hidden px-0 py-0">
        {src ? (
          <img
            src={src}
            alt="图片预览"
            draggable={false}
            onLoad={onImageLoad}
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
