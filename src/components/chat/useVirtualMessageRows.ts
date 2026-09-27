import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { messageRowOffsets, virtualMessageRange } from './virtualMessageMath';
import { setInstantMessageScrollTop } from './instantMessageScroll';

/** Messages remain in chronological order; only mounted rows are measured/rendered. */
export function useVirtualMessageRows(
  ids: readonly number[],
  scrollRef: React.RefObject<HTMLDivElement>,
  listRef: React.RefObject<HTMLDivElement>,
  conversationId: number | null,
  gap: number,
  stickToBottomRef: React.RefObject<boolean>,
  estimate = 108
): {
  start: number;
  end: number;
  offsets: number[];
  totalHeight: number;
  measureRow: (node: HTMLDivElement | null) => void;
  syncScroll: () => void;
  scrollToIndex: (index: number, alignment?: 'center' | 'start') => void;
} {
  const measuredRef = useRef(new Map<number, number>());
  const idIndex = useMemo(() => new Map(ids.map((id, index) => [id, index])), [ids]);
  const idIndexRef = useRef(idIndex);
  idIndexRef.current = idIndex;
  const observedRef = useRef(new Map<Element, ResizeObserver>());
  const [measureVersion, setMeasureVersion] = useState(0);
  const [viewport, setViewport] = useState({ top: 0, height: 700 });
  const pendingFrameRef = useRef<number | null>(null);
  const idsRef = useRef(ids);
  idsRef.current = ids;

  // Conversation ids may collide; never reuse a previous conversation's measurements.
  const previousConversationRef = useRef(conversationId);
  if (previousConversationRef.current !== conversationId) {
    previousConversationRef.current = conversationId;
    measuredRef.current.clear();
    for (const observer of observedRef.current.values()) observer.disconnect();
    observedRef.current.clear();
  }

  // The version is incremented by ResizeObserver when a mounted row changes height.
  const offsets = useMemo(() => messageRowOffsets(ids, measuredRef.current, estimate, gap), [ids, estimate, gap, measureVersion, conversationId]);
  const totalHeight = offsets[ids.length];
  const offsetsRef = useRef(offsets);
  offsetsRef.current = offsets;

  const syncScroll = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    const top = Math.max(0, element.scrollTop - (listRef.current?.offsetTop ?? 0));
    const height = element.clientHeight;
    setViewport((current) => current.top === top && current.height === height ? current : { top, height });
  }, [scrollRef, listRef]);

  const { start, end } = virtualMessageRange(offsets, viewport.top, viewport.height, 550);

  const measureRow = useCallback((node: HTMLDivElement | null) => {
    if (!node || observedRef.current.has(node)) return;
    const id = Number(node.dataset.virtualMessageId);
    if (!Number.isFinite(id)) return;
    const observer = new ResizeObserver(() => {
      const row = node;
      if (!row.isConnected) {
        observedRef.current.get(row)?.disconnect();
        observedRef.current.delete(row);
        return;
      }
      if (!idIndexRef.current.has(id)) return;
      const next = Math.ceil(row.getBoundingClientRect().height);
      if (next <= 0 || measuredRef.current.get(id) === next) return;
      const old = measuredRef.current.get(id) ?? estimate;
      measuredRef.current.set(id, next);
      const element = scrollRef.current;
      const index = idIndexRef.current.get(id) ?? -1;
      // Keep the first visible message still when media above it grows or shrinks.
      const listTop = listRef.current?.offsetTop ?? 0;
      if (element && stickToBottomRef.current) {
        requestAnimationFrame(() => { if (stickToBottomRef.current) { setInstantMessageScrollTop(element, element.scrollHeight - element.clientHeight); syncScroll(); } });
      } else if (element && index >= 0 && listTop + offsetsRef.current[index] + old + gap < element.scrollTop) {
        setInstantMessageScrollTop(element, element.scrollTop + next - old);
      }
      if (pendingFrameRef.current === null) {
        pendingFrameRef.current = requestAnimationFrame(() => {
          pendingFrameRef.current = null;
          setMeasureVersion((version) => version + 1);
          syncScroll();
        });
      }
    });
    observer.observe(node);
    observedRef.current.set(node, observer);
  }, [estimate, gap, scrollRef, listRef, stickToBottomRef, syncScroll]);

  useLayoutEffect(() => {
    // Disconnect unmounted rows, including when React removes an entire conversation.
    for (const [node, observer] of observedRef.current) {
      if (!node.isConnected) {
        observer.disconnect();
        observedRef.current.delete(node);
      }
    }
    syncScroll();
  }, [ids, start, end, measureVersion, syncScroll]);

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const resize = new ResizeObserver(syncScroll);
    resize.observe(element);
    return () => resize.disconnect();
  }, [scrollRef, syncScroll]);

  useLayoutEffect(() => () => {
    for (const observer of observedRef.current.values()) observer.disconnect();
    observedRef.current.clear();
    if (pendingFrameRef.current !== null) cancelAnimationFrame(pendingFrameRef.current);
  }, []);

  const scrollToIndex = (index: number, alignment: 'center' | 'start' = 'center'): void => {
    const element = scrollRef.current;
    if (!element || index < 0 || index >= idsRef.current.length) return;
    const currentOffsets = offsetsRef.current;
    const height = currentOffsets[index + 1] - currentOffsets[index];
    setInstantMessageScrollTop(element, Math.max(0, (listRef.current?.offsetTop ?? 0) + currentOffsets[index] - (alignment === 'center' ? (element.clientHeight - height) / 2 : 0)));
    // The target can be thousands of rows away. Commit its virtual window before
    // the caller's next animation frame attempts DOM-based height calibration.
    flushSync(syncScroll);
  };

  return { start, end, offsets, totalHeight, measureRow, syncScroll, scrollToIndex };
}
