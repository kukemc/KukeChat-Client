import type { PropsWithChildren, PointerEvent as ReactPointerEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getOnlineUsers } from '@/api/users';
import { useKukeStore, type Point, type Size } from '@/store/kukeStore';
import { Icon } from '@/components/ui/Icon';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { isTauriDesktopApp } from '@/utils/appMode';
import { useResolvedThemeMode } from '@/utils/theme';

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
  const onlineUsers = onlineUsersQuery.data?.users ?? [];
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

  return (
    <section
      ref={frameRef}
      data-theme={resolvedThemeMode}
      data-layout={layoutMode}
      data-font-scale={uiFontScale}
      style={{ ...frameStyle, '--kc-ui-font-scale': uiFontScale } as React.CSSProperties & { '--kc-ui-font-scale': number }}
      className={`kc-window-frame liquid-shell pointer-events-auto fixed select-none shadow-float [background:var(--kc-window)] ${isMinimized ? 'border [border-color:var(--kc-border-strong)]' : ''} ${isDesktopApp ? 'kc-window-desktop-app' : ''} ${layoutMode === 'mobile' && !isMinimized ? 'kc-window-mobile rounded-[28px]' : ''} ${isMinimized ? 'kc-window-minimized overflow-visible' : 'overflow-hidden'} ${isDraggingWindow ? 'kc-window-dragging' : ''} ${bubbleSnapSide ? `kc-window-bubble-snap-${bubbleSnapSide}` : ''} ${isFullscreen ? 'kc-window-fullscreen rounded-2xl' : isMinimized ? 'rounded-full' : layoutMode === 'mobile' ? 'rounded-[28px]' : 'rounded-md'}`}
      aria-label="KukeChat floating window"
    >
      {isMinimized ? (
        <button
          data-window-action
          type="button"
          onPointerDown={startBubbleMove}
          onClick={handleBubbleClick}
          className="group relative flex h-full w-full items-center justify-center rounded-full border border-white/65 bg-gradient-to-br from-[#f8fbff] via-[#e7f4ff] to-[#d9ecfb] text-[#1f5f8f] shadow-[0_18px_42px_rgba(15,23,42,0.24),inset_0_1px_0_rgba(255,255,255,0.9)] transition duration-300 ease-out hover:-translate-y-1 hover:scale-105 hover:shadow-[0_24px_52px_rgba(15,23,42,0.30),inset_0_1px_0_rgba(255,255,255,0.95)] active:translate-y-0 active:scale-95"
          aria-label="展开 KukeChat"
        >
          <span className="absolute inset-1 rounded-full bg-[radial-gradient(circle_at_30%_25%,rgba(255,255,255,0.92),rgba(255,255,255,0)_44%)] opacity-90" aria-hidden="true" />
          <span className="relative grid h-12 w-12 place-items-center rounded-full bg-white/80 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.75)] transition duration-300 group-hover:rotate-[-4deg] group-hover:scale-105">
            <Icon name="message" className="h-6 w-6" />
          </span>
          {unreadCount > 0 ? (
            <span className="absolute -right-1 -top-1 grid min-w-[24px] place-items-center rounded-full border-2 border-white bg-red-500 px-1.5 py-0.5 text-[10px] font-extrabold leading-none text-white shadow-[0_8px_18px_rgba(239,68,68,0.42)]">
              {unreadBadge}
            </span>
          ) : null}
        </button>
      ) : (
        <>
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
          {layoutMode !== 'mobile' && !isDesktopApp ? <header onPointerDown={startMove} className="relative z-[100] flex h-10 touch-none items-center justify-between border-b px-2 [background:var(--kc-titlebar)] [border-color:var(--kc-border)] [color:var(--kc-text)] cursor-grab active:cursor-grabbing">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar user={currentUser} label={title} size="sm" />
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="truncate text-sm font-semibold">{title}</h1>
            <span className="truncate text-xs [color:var(--kc-muted)]">{currentUser?.bio?.trim() || '咕咕咕~'}</span>
            <div data-window-action className="group/online relative shrink-0" onMouseEnter={() => void onlineUsersQuery.refetch()}>
              <span className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold [background:var(--kc-panel)] [border-color:var(--kc-border)] [color:var(--kc-muted)]">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.75)]" />
                在线 {onlineUsersQuery.data?.online_count ?? onlineCount}
              </span>
              <div className="pointer-events-none absolute left-1/2 top-full z-[120] w-72 -translate-x-1/2 translate-y-1 pt-2 opacity-0 transition duration-150 group-hover/online:pointer-events-auto group-hover/online:translate-y-0 group-hover/online:opacity-100">
                <div className="overflow-hidden rounded-[22px] border shadow-float backdrop-blur-xl [background:color-mix(in_srgb,var(--kc-panel)_92%,transparent)] [border-color:var(--kc-border)]">
                  <div className="flex items-center justify-between border-b px-3 py-2.5 [border-color:var(--kc-border)]">
                    <span className="text-sm font-semibold [color:var(--kc-text)]">当前在线</span>
                    <span className="rounded-full px-2 py-0.5 text-[11px] font-bold [background:var(--kc-accent-soft)] [color:var(--kc-accent)]">{onlineUsersQuery.data?.online_count ?? onlineCount} 人</span>
                  </div>
                  <div className="scroll-soft max-h-72 overflow-y-auto p-2">
                    {onlineUsersQuery.isLoading ? <p className="px-2 py-3 text-xs [color:var(--kc-muted)]">正在加载在线用户...</p> : null}
                    {!onlineUsersQuery.isLoading && onlineUsers.length === 0 ? <p className="px-2 py-3 text-xs [color:var(--kc-muted)]">暂时没有在线用户</p> : null}
                    {onlineUsers.map((user) => {
                      const name = getDisplayName(user, `用户 ${user.id}`);
                      return (
                        <div key={user.id} className="flex items-center gap-2.5 rounded-2xl px-2 py-2 transition hover:[background:var(--kc-hover)]">
                          <div className="relative shrink-0">
                            <Avatar user={user} label={name} size="sm" />
                            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.75)]" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold [color:var(--kc-text)]">{name}</p>
                            <p className="truncate text-[11px] [color:var(--kc-muted)]">@{user.username} · ID {user.id}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
            {unreadCount > 0 ? <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{unreadCount}</span> : null}
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button data-window-action type="button" onClick={toggleLayoutMode} className="kc-icon-button h-8 w-10" aria-label="切换为手机模式" title="手机模式">
            <Icon name="mobileMode" className="h-4 w-4" />
          </button>
          {isMinimized ? (
            <button data-window-action type="button" onClick={restoreWindow} className="kc-icon-button h-8 w-10" aria-label="还原窗口">
              <Icon name="maximize" className="h-4 w-4" />
            </button>
          ) : (
            <button data-window-action type="button" onClick={minimizeWindow} className="kc-icon-button h-8 w-10" aria-label="最小化窗口">
              <Icon name="minus" className="h-4 w-4" />
            </button>
          )}
          <button data-window-action type="button" onClick={toggleFullscreen} className="kc-icon-button h-8 w-10 disabled:cursor-not-allowed disabled:opacity-40" aria-label={isFullscreen ? '退出全屏' : '全屏窗口'}>
            <Icon name={isFullscreen ? 'shrink' : 'maximize'} className="h-4 w-4" />
          </button>
          <button data-window-action type="button" onClick={closeWindow} className="kc-icon-button h-8 w-10 hover:bg-red-500 hover:text-white" aria-label="关闭窗口">
            <Icon name="close" className="h-4 w-4" />
          </button>
        </div>
           </header> : null}

          <div className={layoutMode === 'mobile' || isDesktopApp ? 'h-full overflow-hidden' : 'relative z-0 h-[calc(100%-40px)] overflow-hidden'}>{children}</div>
          {!isDesktopApp && !isFullscreen && layoutMode !== 'mobile' ? <div onPointerDown={startResize} className="absolute bottom-0 right-0 h-7 w-7 cursor-nwse-resize rounded-tl-2xl border-b border-r border-white/20 bg-white/5" aria-hidden="true" /> : null}
        </>
      )}
    </section>
  );
}
