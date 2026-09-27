// CSS .scroll-soft may specify smooth scrolling. Keep its original inline value
// across overlapping jumps and restore it after the next paint opportunity.
const pending = new WeakMap<HTMLElement, { original: string; token: number }>();

export function setInstantMessageScrollTop(element: HTMLElement, top: number, schedule: (callback: FrameRequestCallback) => number = requestAnimationFrame): void {
  const previous = pending.get(element);
  const original = previous?.original ?? element.style.scrollBehavior;
  const token = (previous?.token ?? 0) + 1;
  pending.set(element, { original, token });
  element.style.scrollBehavior = 'auto';
  element.scrollTop = top;
  schedule(() => {
    const current = pending.get(element);
    if (current?.token !== token) return;
    if (element.style.scrollBehavior === 'auto') element.style.scrollBehavior = current.original;
    pending.delete(element);
  });
}
