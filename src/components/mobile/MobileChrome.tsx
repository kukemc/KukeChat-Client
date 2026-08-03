import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { useRef } from 'react';
import { useKukeStore } from '@/store/kukeStore';
import { Icon } from '@/components/ui/Icon';
import { isNativeMobileApp } from '@/utils/appMode';

interface MobileStatusBarProps {
  rightAction?: ReactNode;
  title?: string;
}

interface MobileDragState {
  pointerId: number;
  startX: number;
  startY: number;
  startLeft: number;
  startTop: number;
  width: number;
  height: number;
}

function clampMobileWindow(left: number, top: number, width: number, height: number): { x: number; y: number } {
  return {
    x: Math.min(Math.max(8, left), Math.max(8, window.innerWidth - width - 8)),
    y: Math.min(Math.max(8, top), Math.max(8, window.innerHeight - height - 8))
  };
}

export function MobileStatusBar({ rightAction, title = 'KukeChat' }: MobileStatusBarProps): JSX.Element {
  const dragState = useRef<MobileDragState | null>(null);
  const setWindowPosition = useKukeStore((state) => state.setWindowPosition);

  if (isNativeMobileApp()) {
    return <div className="kc-native-safe-top" aria-hidden="true" />;
  }

  function startDrag(event: ReactPointerEvent<HTMLDivElement>): void {
    const target = event.target;
    if (target instanceof Element && target.closest('button, a, input, textarea, select, [data-mobile-chrome-action]')) {
      return;
    }

    const frame = event.currentTarget.closest<HTMLElement>('.kc-window-frame');
    if (!frame) {
      return;
    }

    const rect = frame.getBoundingClientRect();
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'grabbing';
    dragState.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startLeft: rect.left,
      startTop: rect.top,
      width: rect.width,
      height: rect.height
    };
  }

  function moveDrag(event: ReactPointerEvent<HTMLDivElement>): void {
    const current = dragState.current;
    if (!current || current.pointerId !== event.pointerId) {
      return;
    }

    const next = clampMobileWindow(
      current.startLeft + event.clientX - current.startX,
      current.startTop + event.clientY - current.startY,
      current.width,
      current.height
    );
    setWindowPosition(next);
  }

  function stopDrag(event: ReactPointerEvent<HTMLDivElement>): void {
    if (dragState.current?.pointerId === event.pointerId) {
      dragState.current = null;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    }
  }

  return (
    <div className="kc-mobile-statusbar" aria-label="移动窗口标题栏" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={stopDrag} onPointerCancel={stopDrag}>
      <span className="kc-mobile-window-title">{title}</span>
      <div className="kc-mobile-statusbar-icons" data-mobile-chrome-action>
        {rightAction}
      </div>
    </div>
  );
}

export function MobilePcModeButton(): JSX.Element {
  const toggleLayoutMode = useKukeStore((state) => state.toggleLayoutMode);

  if (isNativeMobileApp()) {
    return <></>;
  }

  return (
    <button type="button" data-mobile-chrome-action onClick={toggleLayoutMode} className="kc-mobile-pc-button" aria-label="切换为电脑模式" title="电脑模式">
      <Icon name="maximize" className="h-3.5 w-3.5" />
    </button>
  );
}
