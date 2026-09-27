export interface VirtualRange {
  first: number;
  last: number;
}

/** Indices are half-open and overscan is bounded by a fixed number of rows. */
export function conversationWindow(count: number, scrollTop: number, listTop: number, viewportHeight: number, stride: number, overscan: number): VirtualRange {
  const first = Math.max(0, Math.min(count, Math.floor((scrollTop - listTop) / stride) - overscan));
  const last = Math.min(count, Math.max(first, Math.ceil((scrollTop + viewportHeight - listTop) / stride) + overscan));
  return { first, last };
}
