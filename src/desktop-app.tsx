import React, { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { ChatShell } from '@/app/ChatShell';
import { getOnlineUsers } from '@/api/users';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { useRealtime } from '@/realtime/client';
import { useKukeStore } from '@/store/kukeStore';
import { installDesktopExternalLinkHandler } from '@/utils/desktopExternalLinks';
import { useResolvedThemeMode } from '@/utils/theme';
import '@/styles/tailwind.css';

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

function DesktopAutoUpdater(): null {
  useEffect(() => {
    if (import.meta.env.DEV) {
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) {
        return;
      }

      void invoke('check_and_install_update').catch((error: unknown) => {
        console.warn('[KukeChat] 自动更新检查失败', error);
      });
    }, 2400);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  return null;
}

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
  const onlineUsers = onlineUsersQuery.data?.users ?? [];
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
      className="pointer-events-auto select-none pt-2"
    >
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
    </div>,
    getKukePortalRoot()
  ) : null;

  return (
    <>
    <header onPointerDown={startWindowDrag} className="kc-desktop-titlebar relative z-[100] flex h-11 shrink-0 touch-none items-center justify-between border-b px-3 [background:var(--kc-titlebar)] [border-color:var(--kc-border)] [color:var(--kc-text)]">
      <div className="flex h-full min-w-0 items-center gap-3">
        <div className="relative flex h-full shrink-0 items-center">
          <Avatar user={currentUser} label={title} size="sm" />
          {currentUser ? <span className="absolute bottom-1 right-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.75)]" /> : null}
        </div>
        <div className="flex min-w-0 items-center gap-2 leading-none">
          <h1 className="truncate text-sm font-semibold leading-none">{title}</h1>
          {currentUser ? <span className="truncate text-xs leading-none [color:var(--kc-muted)]">{bio}</span> : null}
          {currentUser ? (
            <div ref={onlineAnchorRef} data-window-action className="relative shrink-0" onMouseEnter={openOnlinePopover} onMouseLeave={scheduleCloseOnlinePopover} onFocus={openOnlinePopover} onBlur={scheduleCloseOnlinePopover}>
              <span className="inline-flex h-4 items-center gap-1.5 rounded-full px-1.5 text-[11px] font-semibold leading-none [color:var(--kc-muted)]" title={`当前在线 ${onlineUsersQuery.data?.online_count ?? onlineCount} 人`}>
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.75)]" />
                在线 {onlineUsersQuery.data?.online_count ?? onlineCount}
              </span>
            </div>
          ) : null}
          {unreadCount > 0 ? <span className="grid h-4 min-w-[22px] place-items-center rounded-full bg-red-500 px-1.5 text-[10px] font-extrabold leading-none text-white shadow-[0_8px_18px_rgba(239,68,68,0.34)]">{unreadBadge}</span> : null}
        </div>
      </div>
      <div className="flex h-full items-center gap-1">
        <button type="button" onClick={() => void appWindow.minimize()} className="kc-desktop-window-button" aria-label="最小化窗口" title="最小化">
          <Icon name="minus" className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => void appWindow.toggleMaximize()} className="kc-desktop-window-button" aria-label="最大化或还原窗口" title="最大化/还原">
          <Icon name="maximize" className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => void appWindow.close()} className="kc-desktop-window-button kc-desktop-window-button-close" aria-label="隐藏到托盘" title="隐藏到托盘">
          <Icon name="close" className="h-4 w-4" />
        </button>
      </div>
    </header>
    {onlineUsersPopover}
    </>
  );
}

function DesktopAppContent(): JSX.Element {
  const themeMode = useKukeStore((state) => state.themeMode);
  const resolvedThemeMode = useResolvedThemeMode(themeMode);
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
      className="kc-desktop-app flex h-full min-h-0 flex-col overflow-hidden [color:var(--kc-text)]"
    >
      <DesktopTitleBar />
      <div className="kc-desktop-content relative z-0 min-h-0 flex-1 overflow-hidden [background:var(--kc-window)]">
        <ChatShell />
      </div>
    </main>
  );
}

function DesktopAppRoot(): JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <DesktopAutoUpdater />
      <DesktopRealtimeConnector />
      <DesktopAppContent />
    </QueryClientProvider>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <DesktopAppRoot />
  </React.StrictMode>
);
