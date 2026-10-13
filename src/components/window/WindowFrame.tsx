import type { PropsWithChildren, PointerEvent as ReactPointerEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getOnlineUsers } from '@/api/users';
import { useKukeStore, type Point, type Size } from '@/store/kukeStore';
import logoUrl from '@/assets/logo.png';
import { Icon } from '@/components/ui/Icon';
import { isTauriDesktopApp } from '@/utils/appMode';
import { useResolvedThemeMode } from '@/utils/theme';
import { ThemeEffects } from '@/theme/ThemeEffects';
import { useThemeRootProps } from '@/theme/useTheme';
import { OnlineUsersCard } from './OnlineUsersCard';
import { SelfCardTrigger } from './SelfCardTrigger';

type DragMode = 'move' | 'resize';

interface InteractionState {
  mode: DragMode;
  pointerId: number;
  captureTarget: HTMLElement;
  startX: number;
  startY: number;
  startPosition: Point;
  startSize: Size;
  moved: boolean;
  currentPosition: Point;
}

type SnapSide = 'left' | 'right' | null;

const BUBBLE_SIZE: Size = { width: 68, height: 68 };
const MOBILE_SIZE: Size = { width: 390, height: 760 };
const MOBILE_VIEWPORT_MARGIN = 16;
const WINDOW_VIEWPORT_MARGIN = 24;
const SNAP_GAP = 12;
const SNAP_THRESHOLD = 56;
const DRAG_CLICK_THRESHOLD = 4;
const FONT_SCALE_MULTIPLIERS = [0.88, 1, 1.08, 1.16, 1.26] as const;

function clampPosition(position: Point, size: Size): Point {
  const viewportSize = getViewportSize();
  const maxX = Math.max(12, viewportSize.width - size.width - 12);
  const maxY = Math.max(12, viewportSize.height - size.height - 12);
  return {
    x: Math.min(Math.max(12, position.x), maxX),
    y: Math.min(Math.max(12, position.y), maxY)
  };
}

function getSmartRestorePosition(bubblePosition: Point, windowSize: Size): Point {
  const bubbleCenterX = bubblePosition.x + BUBBLE_SIZE.width / 2;
  const bubbleCenterY = bubblePosition.y + BUBBLE_SIZE.height / 2;
  const spaceLeft = bubbleCenterX;
  const spaceRight = window.innerWidth - bubbleCenterX;
  const spaceTop = bubbleCenterY;
  const spaceBottom = window.innerHeight - bubbleCenterY;

  const nextPosition = {
    x: spaceRight >= spaceLeft ? bubblePosition.x : bubblePosition.x + BUBBLE_SIZE.width - windowSize.width,
    y: spaceBottom >= spaceTop ? bubblePosition.y : bubblePosition.y + BUBBLE_SIZE.height - windowSize.height
  };

  return clampPosition(nextPosition, windowSize);
}

function getViewportSize(): Size {
  if (typeof window === 'undefined') {
    return MOBILE_SIZE;
  }

  const visualViewport = window.visualViewport;
  const width = Math.min(
    window.innerWidth,
    document.documentElement.clientWidth || window.innerWidth,
    visualViewport?.width ?? window.innerWidth
  );
  const height = Math.min(
    window.innerHeight,
    document.documentElement.clientHeight || window.innerHeight,
    visualViewport?.height ?? window.innerHeight
  );
  return { width, height };
}

function getMobileScale(viewportSize: Size): number {
  const availableWidth = Math.max(120, viewportSize.width - MOBILE_VIEWPORT_MARGIN);
  const availableHeight = Math.max(120, viewportSize.height - MOBILE_VIEWPORT_MARGIN);
  return Math.min(1, availableWidth / MOBILE_SIZE.width, availableHeight / MOBILE_SIZE.height);
}

function getViewportScale(contentSize: Size, viewportSize: Size): number {
  const availableWidth = Math.max(240, viewportSize.width - WINDOW_VIEWPORT_MARGIN);
  const availableHeight = Math.max(180, viewportSize.height - WINDOW_VIEWPORT_MARGIN);
  return Math.min(1, availableWidth / contentSize.width, availableHeight / contentSize.height);
}

export function WindowFrame({ children }: PropsWithChildren): JSX.Element {
  const interaction = useRef<InteractionState | null>(null);
  const suppressBubbleClick = useRef(false);
  const animationFrame = useRef<number | null>(null);
  const pendingPosition = useRef<Point | null>(null);
  const pendingSize = useRef<Size | null>(null);
  const frameRef = useRef<HTMLElement | null>(null);
  const [bubbleSnapSide, setBubbleSnapSide] = useState<SnapSide>(null);
  const [isDraggingWindow, setIsDraggingWindow] = useState(false);
  const position = useKukeStore((state) => state.position);
  const minimizedPosition = useKukeStore((state) => state.minimizedPosition);
  const size = useKukeStore((state) => state.size);
  const isMinimized = useKukeStore((state) => state.isMinimized);
  const isFullscreen = useKukeStore((state) => state.isFullscreen);
  const closeWindow = useKukeStore((state) => state.closeWindow);
  const minimizeWindow = useKukeStore((state) => state.minimizeWindow);
  const restoreWindow = useKukeStore((state) => state.restoreWindow);
  const toggleFullscreen = useKukeStore((state) => state.toggleFullscreen);
  const themeMode = useKukeStore((state) => state.themeMode);
  const resolvedThemeMode = useResolvedThemeMode(themeMode);
  const themeRoot = useThemeRootProps(resolvedThemeMode);
  const uiFontScale = useKukeStore((state) => state.uiFontScale);
  const layoutMode = useKukeStore((state) => state.layoutMode);
  const toggleLayoutMode = useKukeStore((state) => state.toggleLayoutMode);
  const setWindowPosition = useKukeStore((state) => state.setWindowPosition);
  const setMinimizedPosition = useKukeStore((state) => state.setMinimizedPosition);
  const setWindowSize = useKukeStore((state) => state.setWindowSize);
  const unreadCount = useKukeStore((state) => state.unreadCount);
  const onlineCount = useKukeStore((state) => state.onlineCount);
  const currentUser = useKukeStore((state) => state.currentUser);
  const token = useKukeStore((state) => state.token);
  const isDesktopApp = isTauriDesktopApp();
  const onlineUsersQuery = useQuery({
    queryKey: ['online-users'],
    queryFn: getOnlineUsers,
    enabled: Boolean(token && currentUser && !isMinimized),
    staleTime: 10_000,
    refetchOnWindowFocus: true,
    retry: false
  });

  useEffect(() => {
    const root = frameRef.current?.closest('#kukechat-root') as HTMLElement | null;
    if (!root) {
      return;
    }

    root.dataset.fontScale = String(uiFontScale);
    root.style.setProperty('--kc-font-multiplier', String(FONT_SCALE_MULTIPLIERS[uiFontScale] ?? 1));
    root.style.setProperty('--kc-ui-font-scale', String(uiFontScale));
  }, [uiFontScale]);

  useEffect(() => {
    function getBubbleSnapSide(nextPosition: Point): SnapSide {
      if (!isMinimized) {
        return null;
      }

      const rightDistance = window.innerWidth - (nextPosition.x + BUBBLE_SIZE.width);
      if (nextPosition.x <= SNAP_THRESHOLD) {
        return 'left';
      }
      if (rightDistance <= SNAP_THRESHOLD) {
        return 'right';
      }
      return null;
    }

    function snapBubblePosition(nextPosition: Point, side: SnapSide): Point {
      if (side === 'left') {
        return { ...nextPosition, x: SNAP_GAP };
      }
      if (side === 'right') {
        return { ...nextPosition, x: Math.max(SNAP_GAP, window.innerWidth - BUBBLE_SIZE.width - SNAP_GAP) };
      }
      return nextPosition;
    }

    function flushInteraction(): void {
      animationFrame.current = null;
      if (pendingPosition.current) {
        if (isMinimized) {
          setMinimizedPosition(pendingPosition.current);
        } else {
          setWindowPosition(pendingPosition.current);
        }
        pendingPosition.current = null;
      }
      if (pendingSize.current) {
        setWindowSize(pendingSize.current);
        pendingSize.current = null;
      }
    }

    function scheduleInteractionUpdate(): void {
      if (animationFrame.current === null) {
        animationFrame.current = window.requestAnimationFrame(flushInteraction);
      }
    }

    function onPointerMove(event: PointerEvent): void {
      const current = interaction.current;
      if (!current || isFullscreen) {
        return;
      }

      event.preventDefault();

      const deltaX = event.clientX - current.startX;
      const deltaY = event.clientY - current.startY;
      if (!current.moved && Math.hypot(deltaX, deltaY) > DRAG_CLICK_THRESHOLD) {
        current.moved = true;
      }

      if (current.mode === 'move') {
        const nextPosition = clampPosition(
          {
            x: current.startPosition.x + deltaX,
            y: current.startPosition.y + deltaY
          },
          isMinimized ? BUBBLE_SIZE : current.startSize
        );
        current.currentPosition = nextPosition;
        pendingPosition.current = nextPosition;
        setBubbleSnapSide(getBubbleSnapSide(nextPosition));
        scheduleInteractionUpdate();
        return;
      }

      pendingSize.current = {
        width: current.startSize.width + deltaX,
        height: current.startSize.height + deltaY
      };
      scheduleInteractionUpdate();
    }

    function onPointerUp(event: PointerEvent): void {
      const current = interaction.current;
      const finalPosition = current?.currentPosition ?? pendingPosition.current ?? current?.startPosition ?? position;
      const finalSnapSide = current?.mode === 'move' ? getBubbleSnapSide(finalPosition) : null;
      if (current) {
        try {
          current.captureTarget.releasePointerCapture(current.pointerId);
        } catch {
          // Capture can already be released by the browser when the pointer leaves the page.
        }
      }
      if (current?.mode === 'move' && isMinimized) {
        suppressBubbleClick.current = current.moved;
        pendingPosition.current = snapBubblePosition(finalPosition, finalSnapSide);
      }
      interaction.current = null;
      setBubbleSnapSide(null);
      setIsDraggingWindow(false);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      if (animationFrame.current !== null) {
        window.cancelAnimationFrame(animationFrame.current);
        animationFrame.current = null;
      }
      flushInteraction();
      event.preventDefault();
    }

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      if (animationFrame.current !== null) {
        window.cancelAnimationFrame(animationFrame.current);
      }
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isFullscreen, isMinimized, position, setMinimizedPosition, setWindowPosition, setWindowSize]);

  function startMove(event: ReactPointerEvent<HTMLDivElement>): void {
    if (isDesktopApp || isFullscreen || layoutMode === 'mobile') {
      return;
    }

    const target = event.target;
    if (target instanceof Element && target.closest('[data-window-action]')) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'grabbing';

    interaction.current = {
      mode: 'move',
      pointerId: event.pointerId,
      captureTarget: event.currentTarget,
      startX: event.clientX,
      startY: event.clientY,
      startPosition: position,
      startSize: desktopVisualSize,
      moved: false,
      currentPosition: position
    };
    setIsDraggingWindow(true);
  }

  function startBubbleMove(event: ReactPointerEvent<HTMLButtonElement>): void {
    if (!isMinimized) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'grabbing';
    suppressBubbleClick.current = false;

    interaction.current = {
      mode: 'move',
      pointerId: event.pointerId,
      captureTarget: event.currentTarget,
      startX: event.clientX,
      startY: event.clientY,
      startPosition: minimizedPosition,
      startSize: BUBBLE_SIZE,
      moved: false,
      currentPosition: minimizedPosition
    };
    setIsDraggingWindow(true);
  }

  function handleBubbleClick(): void {
    if (suppressBubbleClick.current) {
      suppressBubbleClick.current = false;
      return;
    }
    setWindowPosition(getSmartRestorePosition(minimizedPosition, size));
    restoreWindow();
  }

  function startResize(event: ReactPointerEvent<HTMLDivElement>): void {
    if (isDesktopApp || isFullscreen || isMinimized || layoutMode === 'mobile') {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'nwse-resize';
    interaction.current = {
      mode: 'resize',
      pointerId: event.pointerId,
      captureTarget: event.currentTarget,
      startX: event.clientX,
      startY: event.clientY,
      startPosition: position,
      startSize: size,
      moved: false,
      currentPosition: position
    };
    setIsDraggingWindow(true);
  }

  const title = currentUser?.username || 'KukeChat';
  const unreadBadge = unreadCount > 99 ? '99+' : String(unreadCount);
  const onlineTotal = onlineUsersQuery.data?.online_count ?? onlineCount;
  const viewportSize = getViewportSize();
  const mobileScale = getMobileScale(viewportSize);
  const mobileVisualSize = { width: MOBILE_SIZE.width * mobileScale, height: MOBILE_SIZE.height * mobileScale };
  const mobilePosition = clampPosition(position, mobileVisualSize);
  const desktopScale = layoutMode !== 'mobile' && !isMinimized && !isFullscreen ? getViewportScale(size, viewportSize) : 1;
  const desktopVisualSize = { width: size.width * desktopScale, height: size.height * desktopScale };
  const desktopPosition = clampPosition(position, desktopVisualSize);
  const frameStyle = isDesktopApp
    ? { left: 0, top: 0, width: '100%', height: '100%' }
    : layoutMode === 'mobile' && !isMinimized
    ? {
        left: mobilePosition.x,
        top: mobilePosition.y,
        width: MOBILE_SIZE.width,
        height: MOBILE_SIZE.height,
        transform: mobileScale < 1 ? `scale(${mobileScale})` : undefined,
        transformOrigin: 'top left'
      }
    : isFullscreen
      ? { left: 12, top: 12, width: 'calc(100vw - 24px)', height: 'calc(100vh - 24px)' }
    : isMinimized
      ? { left: minimizedPosition.x, top: minimizedPosition.y, width: 68, height: 68 }
      : {
          left: desktopPosition.x,
          top: desktopPosition.y,
          width: size.width,
          height: size.height,
          transform: desktopScale < 1 ? `scale(${desktopScale})` : undefined,
          transformOrigin: 'top left'
        };

  // 自定义主题目前只作用于桌面布局；手机布局有自己的一套配色
  const themed = layoutMode === 'desktop';
  // 手机布局的外框沿用原来那套类名；桌面布局的外框和最小化后的悬浮球是 kwf-（desktop-settings.css）
  const frameLook = isMinimized
    ? 'kc-window-minimized kwf-bubble-frame'
    : layoutMode === 'mobile'
      ? `kc-window-mobile liquid-shell shadow-float overflow-hidden [background:var(--kc-window)] ${isFullscreen ? 'kc-window-fullscreen rounded-2xl' : 'rounded-[28px]'}`
      : `kwf-frame ${isFullscreen ? 'kc-window-fullscreen' : ''}`;

  return (
    <section
      ref={frameRef}
      data-theme={resolvedThemeMode}
      data-layout={layoutMode}
      data-font-scale={uiFontScale}
      data-kc-wallpaper={themed && !isMinimized ? themeRoot['data-kc-wallpaper'] : 'none'}
      style={{ ...(themed ? themeRoot.style : undefined), ...frameStyle, '--kc-ui-font-scale': uiFontScale } as React.CSSProperties & { '--kc-ui-font-scale': number }}
      className={`kc-window-frame pointer-events-auto fixed select-none ${frameLook} ${isDesktopApp ? 'kc-window-desktop-app' : ''} ${isDraggingWindow ? 'kc-window-dragging' : ''} ${bubbleSnapSide ? `kc-window-bubble-snap-${bubbleSnapSide}` : ''}`}
      aria-label="KukeChat floating window"
    >
      {isMinimized ? (
        <button data-window-action type="button" onPointerDown={startBubbleMove} onClick={handleBubbleClick} className="kui kwf-bubble" aria-label="展开 KukeChat">
          <span className="kwf-bubble-logo"><img src={logoUrl} alt="" draggable={false} /></span>
          {unreadCount > 0 ? <span className="kui-badge">{unreadBadge}</span> : null}
        </button>
      ) : (
        <>
          {themed ? <ThemeEffects scheme={resolvedThemeMode} /> : null}
          {layoutMode === 'mobile' ? (
            <div className="kc-mobile-floating-actions">
              <button data-window-action type="button" onClick={minimizeWindow} className="kc-mobile-floating-action" aria-label="最小化为圆圈" title="最小化">
                <Icon name="minus" className="h-4 w-4" />
              </button>
              <button data-window-action type="button" onClick={toggleLayoutMode} className="kc-mobile-floating-action" aria-label="切换为电脑模式" title="电脑模式">
                <Icon name="maximize" className="h-4 w-4" />
              </button>
            </div>
          ) : null}
          {layoutMode !== 'mobile' && !isDesktopApp ? (
            <header onPointerDown={startMove} className="kwf-titlebar kwf-titlebar--floating">
              <div className="kwf-identity">
                {currentUser ? <SelfCardTrigger user={currentUser} label={title} /> : <h1 className="kwf-title">{title}</h1>}
                {currentUser ? <span className="kwf-bio">{currentUser.bio?.trim() || '咕咕咕~'}</span> : null}
                {currentUser ? (
                  <div data-window-action className="kwf-online" onMouseEnter={() => void onlineUsersQuery.refetch()}>
                    <span className="kwf-online-count">在线 {onlineTotal}</span>
                    <div className="kwf-popover"><OnlineUsersCard count={onlineTotal} users={onlineUsersQuery.data?.users ?? []} loading={onlineUsersQuery.isLoading} /></div>
                  </div>
                ) : null}
                {unreadCount > 0 ? <span className="kui-badge">{unreadBadge}</span> : null}
              </div>
              <div className="kwf-controls">
                <button data-window-action type="button" onClick={toggleLayoutMode} className="kwf-control" aria-label="切换为手机模式" title="手机模式">
                  <Icon name="mobileMode" className="h-4 w-4" />
                </button>
                <button data-window-action type="button" onClick={minimizeWindow} className="kwf-control" aria-label="最小化窗口" title="最小化">
                  <Icon name="minus" className="h-4 w-4" />
                </button>
                <button data-window-action type="button" onClick={toggleFullscreen} className="kwf-control" aria-label={isFullscreen ? '退出全屏' : '全屏窗口'} title={isFullscreen ? '退出全屏' : '全屏'}>
                  <Icon name={isFullscreen ? 'shrink' : 'maximize'} className="h-4 w-4" />
                </button>
                <button data-window-action type="button" onClick={closeWindow} className="kwf-control kwf-control--close" aria-label="关闭窗口" title="关闭">
                  <Icon name="close" className="h-4 w-4" />
                </button>
              </div>
            </header>
          ) : null}

          <div className={layoutMode === 'mobile' || isDesktopApp ? 'h-full overflow-hidden' : 'relative z-0 h-[calc(100%-40px)] overflow-hidden'}>{children}</div>
          {!isDesktopApp && !isFullscreen && layoutMode !== 'mobile' ? <div onPointerDown={startResize} className="kwf-resize" aria-hidden="true" /> : null}
        </>
      )}
    </section>
  );
}
