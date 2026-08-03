import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ChatShell } from '@/app/ChatShell';
import { useRealtime } from '@/realtime/client';
import { useKukeStore } from '@/store/kukeStore';
import { requestNativeBack } from '@/native/back';
import { clearNativeBackgroundRealtimeMessageNotifications, configureNativeBackgroundRealtime, installNativeBackgroundRealtimeOpenHandler, setNativeBackgroundRealtimeForeground, startNativeBackgroundRealtime, stopNativeBackgroundRealtime } from '@/native/backgroundRealtime';
import { clearNativeMessageNotifications, installNativeNotificationHandlers } from '@/native/notifications';
import { setNativeSystemBarsTheme } from '@/native/systemBars';
import { MobileUpdateGate } from '@/components/settings/MobileUpdateModal';
import { useResolvedThemeMode } from '@/utils/theme';

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

function MobileRealtimeConnector(): null {
  useRealtime(true);
  return null;
}

function MobileAppContent(): JSX.Element {
  const token = useKukeStore((state) => state.token);
  const currentUser = useKukeStore((state) => state.currentUser);
  const themeMode = useKukeStore((state) => state.themeMode);
  const resolvedThemeMode = useResolvedThemeMode(themeMode);
  const uiFontScale = useKukeStore((state) => state.uiFontScale);
  const setLayoutMode = useKukeStore((state) => state.setLayoutMode);
  const openWindow = useKukeStore((state) => state.openWindow);

  useEffect(() => {
    window.__KukeChatAppMode = 'native-mobile';
    setLayoutMode('mobile');
    openWindow();
    void installNativeNotificationHandlers();
    void installNativeBackgroundRealtimeOpenHandler();
  }, [openWindow, setLayoutMode]);

  useEffect(() => {
    void configureNativeBackgroundRealtime(token, currentUser?.id ?? null, true);
  }, [currentUser?.id, token]);

  useEffect(() => {
    let removeListener: (() => void) | undefined;

    void import('@capacitor/app').then(({ App }) => {
      void App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) {
          void setNativeBackgroundRealtimeForeground(true);
          void clearNativeMessageNotifications();
          void clearNativeBackgroundRealtimeMessageNotifications();
          void stopNativeBackgroundRealtime(false);
          void installNativeBackgroundRealtimeOpenHandler();
          void queryClient.invalidateQueries({ queryKey: ['conversations'] });
          void queryClient.invalidateQueries({ queryKey: ['friends'] });
          void queryClient.invalidateQueries({ queryKey: ['friend-requests'] });
          void queryClient.invalidateQueries({ queryKey: ['group-join-requests'] });
          return;
        }
        void startNativeBackgroundRealtime(token, currentUser?.id ?? null);
      }).then((handle) => {
        removeListener = () => {
          void handle.remove();
        };
      });
    });

    return () => {
      removeListener?.();
    };
  }, [currentUser?.id, token]);

  useEffect(() => {
    let removeListener: (() => void) | undefined;

    void import('@capacitor/app').then(({ App }) => {
      void App.addListener('backButton', ({ canGoBack }) => {
        if (requestNativeBack()) {
          return;
        }
        if (canGoBack) {
          void App.exitApp();
          return;
        }
        void App.exitApp();
      }).then((handle) => {
        removeListener = () => {
          void handle.remove();
        };
      });
    });

    return () => {
      removeListener?.();
    };
  }, []);

  useEffect(() => {
    const root = document.getElementById('kukechat-root');
    if (!root) {
      return;
    }
    root.dataset.layout = 'mobile';
    root.dataset.theme = resolvedThemeMode;
    root.dataset.fontScale = String(uiFontScale);
    root.style.setProperty('--kc-font-multiplier', String(FONT_SCALE_MULTIPLIERS[uiFontScale] ?? 1));
    root.style.setProperty('--kc-ui-font-scale', String(uiFontScale));
  }, [resolvedThemeMode, uiFontScale]);

  useEffect(() => {
    void setNativeSystemBarsTheme(resolvedThemeMode);
  }, [resolvedThemeMode]);

  useEffect(() => {
    const root = document.getElementById('kukechat-root');
    if (!root) {
      return;
    }

    let removeShow: (() => void) | undefined;
    let removeDidShow: (() => void) | undefined;
    let removeHide: (() => void) | undefined;
    let removeDidHide: (() => void) | undefined;
    let frame = 0;
    let hideTimer = 0;
    let keyboardHiding = false;
    let keyboardShowToken = 0;
    let lastReportedKeyboardHeight = 0;
    let currentImeInset = 0;
    let baselineViewportHeight = Math.max(window.innerHeight, document.documentElement.clientHeight, window.visualViewport?.height ?? 0);

    const readLayoutHeight = (): number => Math.max(window.innerHeight, document.documentElement.clientHeight, window.visualViewport?.height ?? 0);

    const normalizeKeyboardHeight = (keyboardHeight: number, layoutHeight: number): number => {
      const reportedHeight = Math.max(0, keyboardHeight);
      if (!reportedHeight) {
        return 0;
      }
      const maxKeyboardHeight = Math.max(180, baselineViewportHeight * 0.58, layoutHeight * 0.58);
      if (reportedHeight <= maxKeyboardHeight) {
        return reportedHeight;
      }
      const cssHeight = reportedHeight / Math.max(1, window.devicePixelRatio || 1);
      if (cssHeight >= 120 && cssHeight <= maxKeyboardHeight) {
        return cssHeight;
      }
      return maxKeyboardHeight;
    };

    const applyImeInset = (value: number): void => {
      currentImeInset = Math.max(0, Math.round(value));
      root.style.setProperty('--kc-ime-inset', `${currentImeInset}px`);
    };

    const scrollFocusedKeyboardInputIntoView = (): void => {
      const activeElement = document.activeElement;
      if (!(activeElement instanceof HTMLElement)) {
        return;
      }
      const keyboardPage = activeElement.closest('.kc-native-keyboard-page');
      const scrollContainer = activeElement.closest('.kc-qq-scroll');
      if (!keyboardPage || !scrollContainer) {
        return;
      }
      window.setTimeout(() => activeElement.scrollIntoView({ block: 'nearest', inline: 'nearest' }), 80);
    };

    const updateImeInset = (): void => {
      frame = 0;
      const layoutHeight = readLayoutHeight();
      const viewport = window.visualViewport;
      const viewportBottom = viewport ? viewport.offsetTop + viewport.height : layoutHeight;
      const viewportKeyboardHeight = viewport ? Math.max(0, baselineViewportHeight - viewportBottom, baselineViewportHeight - viewport.height) : 0;
      const layoutAlreadyAvoidsKeyboard = baselineViewportHeight - layoutHeight > 80;
      const keyboardHeight = Math.max(normalizeKeyboardHeight(lastReportedKeyboardHeight, layoutHeight), viewportKeyboardHeight);
      const fallbackKeyboardTop = keyboardHeight > 0 ? layoutHeight - keyboardHeight : layoutHeight;
      const keyboardTop = layoutAlreadyAvoidsKeyboard
        ? layoutHeight
        : viewport && viewport.height < layoutHeight - 8
          ? viewportBottom
          : fallbackKeyboardTop;
      const keyboardAwareSurface = root.querySelector<HTMLElement>('.kc-native-keyboard-page');
      if (keyboardAwareSurface) {
        applyImeInset(Math.max(0, keyboardHeight));
        scrollFocusedKeyboardInputIntoView();
        return;
      }
      const composer = root.querySelector<HTMLElement>('.kc-native-composer');
      const composerBottom = composer ? composer.getBoundingClientRect().bottom + currentImeInset : layoutHeight;
      const nextInset = Math.max(0, composerBottom - keyboardTop);
      applyImeInset(Math.min(nextInset, Math.max(0, keyboardHeight)));
    };

    const clearHideTimer = (): void => {
      if (hideTimer) {
        window.clearTimeout(hideTimer);
        hideTimer = 0;
      }
    };

    const scheduleImeInset = (keyboardHeight = lastReportedKeyboardHeight, fromKeyboardShow = false): void => {
      clearHideTimer();
      if (fromKeyboardShow) {
        keyboardHiding = false;
        keyboardShowToken += 1;
      }
      lastReportedKeyboardHeight = Math.max(0, keyboardHeight);
      root.dataset.keyboard = 'shown';
      if (frame) {
        cancelAnimationFrame(frame);
      }
      frame = requestAnimationFrame(updateImeInset);
    };

    const isEditableElement = (target: EventTarget | null): target is HTMLElement => {
      if (!(target instanceof HTMLElement)) {
        return false;
      }
      return target.isContentEditable || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
    };

    const viewportLooksKeyboardOpen = (): boolean => {
      const viewport = window.visualViewport;
      if (!viewport) {
        return false;
      }
      return baselineViewportHeight - (viewport.offsetTop + viewport.height) > 80 || baselineViewportHeight - viewport.height > 80;
    };

    const commitKeyboardHidden = (): void => {
      keyboardHiding = false;
      delete root.dataset.keyboard;
      lastReportedKeyboardHeight = 0;
      applyImeInset(0);
      requestAnimationFrame(() => {
        baselineViewportHeight = readLayoutHeight();
      });
    };

    const startKeyboardHide = (): void => {
      clearHideTimer();
      keyboardHiding = true;
      root.dataset.keyboard = 'hiding';
      lastReportedKeyboardHeight = 0;
      applyImeInset(0);
      hideTimer = window.setTimeout(() => {
        hideTimer = 0;
        commitKeyboardHidden();
      }, 180);
    };

    const handleViewportResize = (): void => {
      if (keyboardHiding) {
        return;
      }
      if (root.dataset.keyboard === 'shown' || viewportLooksKeyboardOpen()) {
        scheduleImeInset();
        return;
      }
      baselineViewportHeight = readLayoutHeight();
    };

    const handleFocusIn = (event: FocusEvent): void => {
      if (!isEditableElement(event.target)) {
        return;
      }
      requestAnimationFrame(() => {
        if (root.dataset.keyboard === 'shown' || lastReportedKeyboardHeight > 0 || viewportLooksKeyboardOpen()) {
          scheduleImeInset();
        }
      });
    };

    window.visualViewport?.addEventListener('resize', handleViewportResize);
    window.addEventListener('resize', handleViewportResize);
    root.addEventListener('focusin', handleFocusIn);

    void import('@capacitor/keyboard').then(({ Keyboard }) => {
      void Keyboard.addListener('keyboardWillShow', (info) => {
        scheduleImeInset(info.keyboardHeight, true);
      }).then((handle) => {
        removeShow = () => {
          void handle.remove();
        };
      });
      void Keyboard.addListener('keyboardDidShow', (info) => {
        scheduleImeInset(info.keyboardHeight, true);
      }).then((handle) => {
        removeDidShow = () => {
          void handle.remove();
        };
      });
      void Keyboard.addListener('keyboardWillHide', () => {
        startKeyboardHide();
      }).then((handle) => {
        removeHide = () => {
          void handle.remove();
        };
      });
      void Keyboard.addListener('keyboardDidHide', () => {
        commitKeyboardHidden();
      }).then((handle) => {
        removeDidHide = () => {
          void handle.remove();
        };
      });
    });

    return () => {
      removeShow?.();
      removeDidShow?.();
      removeHide?.();
      removeDidHide?.();
      clearHideTimer();
      if (frame) {
        cancelAnimationFrame(frame);
      }
      window.visualViewport?.removeEventListener('resize', handleViewportResize);
      window.removeEventListener('resize', handleViewportResize);
      root.removeEventListener('focusin', handleFocusIn);
      commitKeyboardHidden();
    };
  }, []);

  return (
    <main data-theme={resolvedThemeMode} data-layout="mobile" data-font-scale={uiFontScale} className="kc-native-app h-full w-screen overflow-hidden [background:var(--kc-mobile-bg)] [color:var(--kc-mobile-text)]">
      <ChatShell />
      <MobileUpdateGate />
    </main>
  );
}

export function MobileAppRoot(): JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <MobileRealtimeConnector />
      <MobileAppContent />
    </QueryClientProvider>
  );
}
