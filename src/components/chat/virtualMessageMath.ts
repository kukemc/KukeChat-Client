export function messageRowOffsets(ids: readonly number[], measured: ReadonlyMap<number, number>, estimate: number, gap: number): number[] {
  const offsets = new Array<number>(ids.length + 1);
  offsets[0] = 0;
  for (let i = 0; i < ids.length; i++) {
    offsets[i + 1] = offsets[i] + (measured.get(ids[i]) ?? estimate) + gap;
  }
  return offsets;
}

/** Returns the first row whose trailing edge is strictly after position. */
export function firstMessageRowAfter(offsets: readonly number[], position: number): number {
  let low = 0;
  let high = offsets.length - 1;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (offsets[mid + 1] <= position) low = mid + 1;
    else high = mid;
  }
  return low;
}

export function virtualMessageRange(offsets: readonly number[], top: number, viewportHeight: number, overscan: number): { start: number; end: number } {
  const count = offsets.length - 1;
  return {
    start: firstMessageRowAfter(offsets, Math.max(0, top - overscan)),
    end: Math.min(count, firstMessageRowAfter(offsets, top + viewportHeight + overscan) + 1)
  };
}
