export interface InstantScrollState {
  frame: number | null;
  originalBehavior: string;
  originalPriority: string;
}

/** Keep CSS smooth scrolling disabled until the next paint; repeated writes share one restoration frame. */
export function instantScroll(scroll: HTMLDivElement, top: number, state: InstantScrollState): void {
  if (state.frame === null) {
    state.originalBehavior = scroll.style.getPropertyValue('scroll-behavior');
    state.originalPriority = scroll.style.getPropertyPriority('scroll-behavior');
  } else {
    window.cancelAnimationFrame(state.frame);
  }
  scroll.style.setProperty('scroll-behavior', 'auto', 'important');
  scroll.scrollTop = Math.max(0, top);
  state.frame = window.requestAnimationFrame(() => restoreScrollBehavior(scroll, state));
}

/** Restore the exact original inline declaration, including !important, on unmount. */
export function restoreScrollBehavior(scroll: HTMLDivElement, state: InstantScrollState): void {
  if (state.frame === null) return;
  window.cancelAnimationFrame(state.frame);
  if (state.originalBehavior) {
    scroll.style.setProperty('scroll-behavior', state.originalBehavior, state.originalPriority);
  } else {
    scroll.style.removeProperty('scroll-behavior');
  }
  state.frame = null;
}
