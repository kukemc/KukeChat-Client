import { useEffect } from 'react';

/**
 * 窗口不在前台时让装饰性的无限动画停下来（皮肤、头像框这些；具体是哪些见 shop.css「看不见的时候不动」）。
 *
 * 判断「不在前台」：页面不可见（最小化、藏到托盘、切走标签页），或者窗口失去焦点（切到别的程序）。
 * 失焦有时只是点到了标题栏之外的系统区域、马上又回来，所以失焦后等一小会儿再停，回到前台立刻恢复。
 * 停的办法是给根节点打 data-kc-motion="paused"，样式表据此把动画设成 paused，回来时接着原来的进度播。
 *
 * @param subscribeNative 壳自己的焦点事件（桌面端是 Tauri 窗口的 onFocusChanged）：WebView 里的 blur / focus
 *   在某些情况下（点托盘、Alt+Tab 到别的程序）不一定送到页面，用原生事件兜一下。返回取消订阅的函数。
 */
export function useWindowMotionPause(
  getRoot: () => HTMLElement | null,
  subscribeNative?: (onFocusChange: (focused: boolean) => void) => Promise<() => void> | (() => void)
): void {
  useEffect(() => {
    const root = getRoot();
    if (!root || typeof document === 'undefined') {
      return undefined;
    }
    // 刚启动时 WebView 的 hasFocus() 不一定准，先当作在前台；真不在前台，随后的 blur / 原生事件会改过来
    let focused = true;
    let timer: number | null = null;
    const apply = (): void => {
      const paused = document.visibilityState === 'hidden' || !focused;
      if (paused) {
        root.setAttribute('data-kc-motion', 'paused');
      } else {
        root.removeAttribute('data-kc-motion');
      }
    };
    const setFocused = (next: boolean, fromNative = false): void => {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
      if (next) {
        focused = true;
        apply();
        return;
      }
      timer = window.setTimeout(() => {
        timer = null;
        // 页面自己的 blur 要再确认一次（焦点可能只是在页面里的 iframe 之间挪了一下）；壳说失焦了就是失焦了
        focused = fromNative ? false : document.hasFocus();
        apply();
      }, 400);
    };
    const onFocus = (): void => setFocused(true);
    const onBlur = (): void => setFocused(false);
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', apply);
    apply();

    let disposed = false;
    let unsubscribeNative: (() => void) | null = null;
    if (subscribeNative) {
      Promise.resolve(subscribeNative((next) => setFocused(next, true))).then((unsubscribe) => {
        if (disposed) {
          unsubscribe();
        } else {
          unsubscribeNative = unsubscribe;
        }
      }).catch(() => undefined);
    }
    return () => {
      disposed = true;
      unsubscribeNative?.();
      if (timer !== null) {
        window.clearTimeout(timer);
      }
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', apply);
      root.removeAttribute('data-kc-motion');
    };
    // getRoot / subscribeNative 只在挂载时用一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
