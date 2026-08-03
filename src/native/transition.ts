import { flushSync } from 'react-dom';

export type NativeRouteDirection = 'forward' | 'back' | 'tab-forward' | 'tab-back' | 'secondary-forward' | 'secondary-back';

type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => void) => { ready?: Promise<void>; finished: Promise<void> };
};

export function runNativeRouteTransition(direction: NativeRouteDirection, update: () => void, enabled: boolean): void {
  if (!enabled || typeof document === 'undefined') {
    update();
    return;
  }

  const root = document.documentElement;
  const transitionDocument = document as ViewTransitionDocument;
  root.dataset.kcRouteTransition = direction;

  if (typeof transitionDocument.startViewTransition === 'function') {
    const transition = transitionDocument.startViewTransition(() => flushSync(update));
    if (import.meta.env.DEV) {
      void transition.ready?.catch((error) => {
        console.warn('[KukeChat] route view transition skipped', direction, error);
      });
    }
    void transition.finished.finally(() => {
      if (root.dataset.kcRouteTransition === direction) {
        delete root.dataset.kcRouteTransition;
      }
    });
    return;
  }

  update();
  window.setTimeout(() => {
    if (root.dataset.kcRouteTransition === direction) {
      delete root.dataset.kcRouteTransition;
    }
  }, 240);
}
