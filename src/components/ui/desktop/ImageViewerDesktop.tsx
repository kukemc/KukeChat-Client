import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../Icon';
import { MAX_SCALE, MIN_SCALE, useImageViewer, type ImageViewerProps } from '../imageViewerState';
import { getDesktopPortalRoot, useEscapeLayer } from './Modal';

/**
 * 桌面端的看图浮层：深色遮罩，图片居中，底部一条工具条。浅色主题下也是深色的。
 * 滚轮缩放、按住拖动；← → 切换、+ - 缩放、0 复原（键盘操作在 useImageViewer 里）。
 */
export function ImageViewerDesktop({ viewer, portal = true, onClose, onNavigate }: Omit<ImageViewerProps, 'mobile'>): JSX.Element {
  const { safeIndex, src, count, scale, position, setPosition, showHint, imageFitStyle, onImageLoad, zoom, resetView, navigate } = useImageViewer({ viewer, fit: { width: 0.86, height: 0.8 }, closeOnEscape: false, onClose, onNavigate });
  const [drag, setDrag] = useState<{ pointerId: number; x: number; y: number; originX: number; originY: number } | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  useEscapeLayer(onClose);

  // React 的 onWheel 是被动监听，拦不住默认行为（Ctrl + 滚轮会缩放整个页面），所以自己挂一个
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) {
      return undefined;
    }
    function handleWheel(event: WheelEvent): void {
      event.preventDefault();
      zoomRef.current(event.deltaY < 0 ? 0.15 : -0.15);
    }
    stage.addEventListener('wheel', handleWheel, { passive: false });
    return () => stage.removeEventListener('wheel', handleWheel);
  }, []);

  const hasPrevious = safeIndex > 0;
  const hasNext = safeIndex < count - 1;

  const node = (
    // 点图片和工具条以外的地方关闭
    <div ref={stageRef} className="kmd-viewer" role="dialog" aria-modal="true" aria-label="图片预览" onMouseDown={(event) => {
      if (event.target === event.currentTarget) {
        onClose();
      }
    }}>
      {src ? (
        <img
          src={src}
          alt="图片预览"
          draggable={false}
          className={drag ? 'is-dragging' : undefined}
          style={{ ...imageFitStyle, transform: `translate(${position.x}px, ${position.y}px) scale(${scale})` }}
          onLoad={onImageLoad}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            setDrag({ pointerId: event.pointerId, x: event.clientX, y: event.clientY, originX: position.x, originY: position.y });
          }}
          onPointerMove={(event) => {
            if (drag?.pointerId === event.pointerId) {
              setPosition({ x: drag.originX + event.clientX - drag.x, y: drag.originY + event.clientY - drag.y });
            }
          }}
          onPointerUp={(event) => {
            if (drag?.pointerId === event.pointerId) {
              setDrag(null);
            }
          }}
          onPointerCancel={() => setDrag(null)}
        />
      ) : <p className="kmd-viewer-missing">图片不可用</p>}

      <button type="button" className="kmd-viewer-btn kmd-viewer-close" aria-label="关闭图片预览" title="关闭（Esc）" onClick={onClose}><Icon name="close" className="h-[18px] w-[18px]" /></button>
      {hasPrevious ? <button type="button" className="kmd-viewer-btn kmd-viewer-nav is-previous" aria-label="上一张" title="上一张（←）" onClick={() => navigate(safeIndex - 1)}><Icon name="chevronLeft" className="h-5 w-5" /></button> : null}
      {hasNext ? <button type="button" className="kmd-viewer-btn kmd-viewer-nav is-next" aria-label="下一张" title="下一张（→）" onClick={() => navigate(safeIndex + 1)}><Icon name="chevron" className="h-5 w-5" /></button> : null}

      <div className="kmd-viewer-bar">
        {count > 1 ? <span className="kmd-viewer-count">{safeIndex + 1} / {count}</span> : null}
        <button type="button" className="kmd-viewer-btn" aria-label="缩小" title="缩小（-）" disabled={scale <= MIN_SCALE} onClick={() => zoom(-0.2)}><Icon name="minus" className="h-4 w-4" /></button>
        <button type="button" className="kmd-viewer-btn kmd-viewer-scale" aria-label="重置缩放" title="恢复原始大小（0）" onClick={resetView}>{Math.round(scale * 100)}%</button>
        <button type="button" className="kmd-viewer-btn" aria-label="放大" title="放大（+）" disabled={scale >= MAX_SCALE} onClick={() => zoom(0.2)}><Icon name="plus" className="h-4 w-4" /></button>
      </div>
      {showHint ? <p className="kmd-viewer-hint">滚轮缩放，拖拽移动</p> : null}
    </div>
  );
  return portal ? createPortal(node, getDesktopPortalRoot()) : node;
}
