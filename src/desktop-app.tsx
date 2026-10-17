import React, { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { ChatShell } from '@/app/ChatShell';
import { getOnlineUsers } from '@/api/users';
import { getDisplayName } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { DesktopJustUpdatedNotice, DesktopUpdateDialog, DesktopUpdatePill } from '@/components/desktop/DesktopUpdateDialog';
import { OnlineUsersCard } from '@/components/window/OnlineUsersCard';
import { SelfCardTrigger } from '@/components/window/SelfCardTrigger';
import { startDesktopUpdateSchedule } from '@/native/desktopUpdate';
import { useRealtime } from '@/realtime/client';
import { useKukeStore } from '@/store/kukeStore';
import { installDesktopExternalLinkHandler } from '@/utils/desktopExternalLinks';
import { useResolvedThemeMode } from '@/utils/theme';
import { isMacPlatform } from '@/utils/platform';
import '@/styles/tailwind.css';
import { ThemeEffects } from '@/theme/ThemeEffects';
import { useThemeRootProps } from '@/theme/useTheme';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 10_000
    }
  }
});

const FONT_SCALE_MULTIPLIERS = [0.88, 1, 1.08, 1.16, 1.26] as const;
const ONLINE_POPOVER_WIDTH = 288;
const ONLINE_POPOVER_ESTIMATED_HEIGHT = 360;

function getKukePortalRoot(): Element {
  return document.querySelector('.kc-desktop-app') ?? document.getElementById('kukechat-root') ?? document.body;
}

if (typeof window !== 'undefined') {
  window.__KukeChatAppMode = 'tauri-desktop';
  if (import.meta.env.DEV) {
    const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    window.__KukeChatPreviewConfig = {
      apiBaseUrl: `${protocol}//${window.location.host}`,
      wsUrl: `${wsProtocol}//${window.location.host}/ws`
    };
  }
}

function DesktopRealtimeConnector(): null {
  useRealtime(true);
  return null;
}

function DesktopAutoUpdater(): JSX.Element {
  useEffect(() => startDesktopUpdateSchedule(), []);
  return <><DesktopUpdateDialog /><DesktopJustUpdatedNotice /></>;
}

// macOS 用系统红绿灯（tauri.macos.conf.json 里 titleBarStyle: Overlay），左边给它们留位置，自绘的三个按钮不显示
const IS_MAC = isMacPlatform();
const MAC_TITLEBAR_STYLE: React.CSSProperties = { paddingLeft: 84, paddingRight: 12 };

function DesktopTitleBar(): JSX.Element {
  const appWindow = getCurrentWindow();
  const onlineAnchorRef = useRef<HTMLDivElement | null>(null);
  const closeOnlinePopoverTimer = useRef<number | null>(null);
  const [onlinePopoverOpen, setOnlinePopoverOpen] = useState(false);
  const [onlinePopoverStyle, setOnlinePopoverStyle] = useState<React.CSSProperties | null>(null);
  const currentUser = useKukeStore((state) => state.currentUser);
  const token = useKukeStore((state) => state.token);
  const unreadCount = useKukeStore((state) => state.unreadCount);
  const onlineCount = useKukeStore((state) => state.onlineCount);
  const onlineUsersQuery = useQuery({
    queryKey: ['online-users'],
    queryFn: getOnlineUsers,
    enabled: Boolean(token && currentUser),
    staleTime: 10_000,
    refetchOnWindowFocus: true,
    retry: false
  });
  const onlineTotal = onlineUsersQuery.data?.online_count ?? onlineCount;
  const title = currentUser ? getDisplayName(currentUser) : 'KukeChat';
  const bio = currentUser?.bio?.trim() || '咕咕咕~';
  const unreadBadge = unreadCount > 99 ? '99+' : String(unreadCount);

  function startWindowDrag(event: ReactPointerEvent<HTMLElement>): void {
    if (event.button !== 0 || (event.target as HTMLElement | null)?.closest('button, [data-window-action]')) {
      return;
    }

    void appWindow.startDragging();
  }

  function updateOnlinePopoverPosition(): void {
    const rect = onlineAnchorRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    const left = Math.min(Math.max(12, rect.left + rect.width / 2 - ONLINE_POPOVER_WIDTH / 2), Math.max(12, window.innerWidth - ONLINE_POPOVER_WIDTH - 12));
    const top = Math.min(rect.bottom + 8, Math.max(12, window.innerHeight - ONLINE_POPOVER_ESTIMATED_HEIGHT - 12));
    setOnlinePopoverStyle({
      position: 'fixed',
      left,
      top,
      width: ONLINE_POPOVER_WIDTH,
      zIndex: 2147483647
    });
  }

  function clearOnlinePopoverTimer(): void {
    if (closeOnlinePopoverTimer.current !== null) {
      window.clearTimeout(closeOnlinePopoverTimer.current);
      closeOnlinePopoverTimer.current = null;
    }
  }

  function openOnlinePopover(): void {
    clearOnlinePopoverTimer();
    updateOnlinePopoverPosition();
    setOnlinePopoverOpen(true);
    void onlineUsersQuery.refetch();
  }

  function scheduleCloseOnlinePopover(): void {
    clearOnlinePopoverTimer();
    closeOnlinePopoverTimer.current = window.setTimeout(() => {
      setOnlinePopoverOpen(false);
    }, 120);
  }

  useEffect(() => {
    if (!onlinePopoverOpen) {
      return;
    }

    updateOnlinePopoverPosition();
    window.addEventListener('resize', updateOnlinePopoverPosition);
    window.addEventListener('scroll', updateOnlinePopoverPosition, true);
    return () => {
      window.removeEventListener('resize', updateOnlinePopoverPosition);
      window.removeEventListener('scroll', updateOnlinePopoverPosition, true);
    };
  }, [onlinePopoverOpen]);

  useEffect(() => {
    return clearOnlinePopoverTimer;
  }, []);

  const onlineUsersPopover = currentUser && onlinePopoverOpen && onlinePopoverStyle ? createPortal(
    <div
      data-window-action
      onMouseEnter={clearOnlinePopoverTimer}
      onMouseLeave={scheduleCloseOnlinePopover}
      style={onlinePopoverStyle}
      className="kwf-popover-fixed"
    >
      <OnlineUsersCard count={onlineTotal} users={onlineUsersQuery.data?.users ?? []} loading={onlineUsersQuery.isLoading} />
    </div>,
    getKukePortalRoot()
  ) : null;

  return (
    <>
    <header onPointerDown={startWindowDrag} className={currentUser ? 'kwf-titlebar' : 'kwf-titlebar kwf-titlebar--bare'} style={IS_MAC ? MAC_TITLEBAR_STYLE : undefined}>
      <div className="kwf-identity">
        {currentUser ? <SelfCardTrigger user={currentUser} label={title} /> : null}
        {currentUser ? <span className="kwf-bio">{bio}</span> : null}
        {currentUser ? (
          <div ref={onlineAnchorRef} data-window-action className="kwf-online" onMouseEnter={openOnlinePopover} onMouseLeave={scheduleCloseOnlinePopover} onFocus={openOnlinePopover} onBlur={scheduleCloseOnlinePopover}>
            <span className="kwf-online-count" title={`当前在线 ${onlineTotal} 人`}>在线 {onlineTotal}</span>
          </div>
        ) : null}
        {unreadCount > 0 ? <span className="kui-badge">{unreadBadge}</span> : null}
      </div>
      <div className="kwf-controls">
        <DesktopUpdatePill />
        {IS_MAC ? null : <>
        <button type="button" onClick={() => void appWindow.minimize()} className="kwf-control" aria-label="最小化窗口" title="最小化">
          <Icon name="minus" className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => void appWindow.toggleMaximize()} className="kwf-control" aria-label="最大化或还原窗口" title="最大化/还原">
          <Icon name="maximize" className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => void appWindow.close()} className="kwf-control kwf-control--close" aria-label="隐藏到托盘" title="隐藏到托盘">
          <Icon name="close" className="h-4 w-4" />
        </button>
        </>}
      </div>
    </header>
    {onlineUsersPopover}
    </>
  );
}

function DesktopAppContent(): JSX.Element {
  const themeMode = useKukeStore((state) => state.themeMode);
  const resolvedThemeMode = useResolvedThemeMode(themeMode);
  const themeRoot = useThemeRootProps(resolvedThemeMode);
  const uiFontScale = useKukeStore((state) => state.uiFontScale);
  const setLayoutMode = useKukeStore((state) => state.setLayoutMode);

  useEffect(() => {
    window.__KukeChatAppMode = 'tauri-desktop';
    setLayoutMode('desktop');
    useKukeStore.setState({ isOpen: true, isMinimized: false, isFullscreen: false });
  }, [setLayoutMode]);

  useEffect(() => installDesktopExternalLinkHandler(), []);

  useEffect(() => {
    const root = document.getElementById('kukechat-root');
    if (!root) {
      return;
    }

    root.dataset.desktopApp = 'true';
    root.dataset.fontScale = String(uiFontScale);
    root.style.setProperty('--kc-font-multiplier', String(FONT_SCALE_MULTIPLIERS[uiFontScale] ?? 1));
    root.style.setProperty('--kc-ui-font-scale', String(uiFontScale));
  }, [uiFontScale]);

  return (
    <main
      data-theme={resolvedThemeMode}
      data-layout="desktop"
      data-font-scale={uiFontScale}
      data-kc-wallpaper={themeRoot['data-kc-wallpaper']}
      style={themeRoot.style}
      className="kc-desktop-app relative flex h-full min-h-0 flex-col overflow-hidden [color:var(--kc-text)]"
    >
      <ThemeEffects scheme={resolvedThemeMode} />
      <DesktopTitleBar />
      <div className="kc-desktop-content relative z-0 min-h-0 flex-1 overflow-hidden [background:var(--kc-window)]">
        <ChatShell />
      </div>
      <DesktopAutoUpdater />
    </main>
  );
}

function DesktopAppRoot(): JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <DesktopRealtimeConnector />
      <DesktopAppContent />
    </QueryClientProvider>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary allowReload>
      <DesktopAppRoot />
    </ErrorBoundary>
  </React.StrictMode>
);
