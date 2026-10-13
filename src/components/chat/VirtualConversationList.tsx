import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { conversationWindow } from './virtualConversationMath';
import { instantScroll, restoreScrollBehavior, type InstantScrollState } from './virtualConversationScroll';

/** Rows remain in the existing page scroller so the mobile sticky header keeps working. */
const OVERSCAN_ROWS = 5;

interface VirtualConversationListProps<T extends { id: number }> {
  items: T[];
  scrollRef: RefObject<HTMLDivElement>;
  activeId: number | null;
  searchKey: string;
  estimatedRowHeight: number;
  rowGap?: number;
  renderRow: (item: T, index: number) => ReactNode;
  className?: string;
}

interface Viewport {
  scrollTop: number;
  height: number;
  listTop: number;
}

export function VirtualConversationList<T extends { id: number }>({
  items, scrollRef, activeId, searchKey, estimatedRowHeight, rowGap = 0, renderRow, className
}: VirtualConversationListProps<T>): JSX.Element {
  const listRef = useRef<HTMLDivElement>(null);
  const measuredRowRef = useRef<HTMLDivElement>(null);
  const [rowHeight, setRowHeight] = useState(estimatedRowHeight);
  const hasMeasuredRef = useRef(false);
  const [viewport, setViewport] = useState<Viewport>({ scrollTop: 0, height: 0, listTop: 0 });
  const anchorRef = useRef<{ id: number; offset: number } | null>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const previousItemsRef = useRef(items);
  const previousSearchRef = useRef(searchKey);
  const previousActiveRef = useRef<number | null>(null);
  const previousStrideRef = useRef(rowHeight + rowGap);
  const previousListTopRef = useRef<number | null>(null);
  const instantScrollStateRef = useRef<InstantScrollState>({ frame: null, originalBehavior: '', originalPriority: '' });
  const stride = rowHeight + rowGap;
  const { first, last } = conversationWindow(items.length, viewport.scrollTop, viewport.listTop, viewport.height, stride, OVERSCAN_ROWS);

  useLayoutEffect(() => {
    const scroll = scrollRef.current;
    const state = instantScrollStateRef.current;
    return () => {
      if (scroll) restoreScrollBehavior(scroll, state);
    };
  }, [scrollRef]);

  const measureViewport = useCallback(() => {
    const scroll = scrollRef.current;
    const list = listRef.current;
    if (!scroll || !list) return;
    // Relative geometry works in both a ShadowRoot and a normal document; no window-scroll assumption.
    const listTop = list.getBoundingClientRect().top - scroll.getBoundingClientRect().top + scroll.scrollTop - scroll.clientTop;
    setViewport((previous) => previous.scrollTop === scroll.scrollTop && previous.height === scroll.clientHeight && Math.abs(previous.listTop - listTop) < 0.5
      ? previous : { scrollTop: scroll.scrollTop, height: scroll.clientHeight, listTop });
  }, [scrollRef]);

  useEffect(() => {
    // Passive effects run after the parent scroller ref has been attached. A child's
    // layout effect runs first and can otherwise permanently miss the scroll listener.
    const scroll = scrollRef.current;
    const list = listRef.current;
    if (!scroll || !list) return;
    measureViewport();
    const observer = new ResizeObserver(measureViewport);
    observer.observe(scroll);
    // A growing header/search area can shift the list without resizing the scroller.
    if (list.parentElement) observer.observe(list.parentElement);
    scroll.addEventListener('scroll', measureViewport, { passive: true });
    window.addEventListener('resize', measureViewport);
    return () => {
      observer.disconnect();
      scroll.removeEventListener('scroll', measureViewport);
      window.removeEventListener('resize', measureViewport);
    };
  }, [scrollRef, measureViewport]);

  // The first visible row is unrestrained; observe its intrinsic height for font-scale/theme changes.
  useLayoutEffect(() => {
    const row = measuredRowRef.current?.firstElementChild;
    if (!(row instanceof HTMLElement)) return;
    const measure = () => {
      // offsetHeight excludes entrance/press transforms, which must not change virtual coordinates.
      const next = Math.ceil(row.offsetHeight);
      if (next <= 0) return;
      // Rows may differ by a few pixels (e.g. unread badges). Changing the stride moves `first`
      // onto a different row, so after the first measurement only allow growth; otherwise two
      // heights ping-pong synchronously until React aborts with "Maximum update depth exceeded".
      const firstMeasurement = !hasMeasuredRef.current;
      hasMeasuredRef.current = true;
      setRowHeight((previous) => firstMeasurement ? next : Math.max(previous, next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    return () => observer.disconnect();
  }, [items.length, first, rowHeight]);

  // Preserve the first visible conversation and its pixel offset when activity reorders rows.
  useLayoutEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    const listTop = listRef.current ? listRef.current.getBoundingClientRect().top - scroll.getBoundingClientRect().top + scroll.scrollTop - scroll.clientTop : viewport.listTop;
    const actualScrollTop = scroll.scrollTop;
    const searchChanged = previousSearchRef.current !== searchKey;
    const itemsChanged = previousItemsRef.current !== items;
    const activeChanged = previousActiveRef.current !== activeId;
    const listShifted = previousListTopRef.current !== null && Math.abs(previousListTopRef.current - listTop) > 0.5;
    if (searchChanged) {
      instantScroll(scroll, listTop, instantScrollStateRef.current);
      anchorRef.current = null;
    } else if (itemsChanged || previousStrideRef.current !== stride || listShifted) {
      const anchor = anchorRef.current;
      if (anchor) {
        const index = items.findIndex((item) => item.id === anchor.id);
        if (index >= 0) instantScroll(scroll, listTop + index * stride + Math.min(anchor.offset, rowHeight), instantScrollStateRef.current);
      } else if (previousStrideRef.current !== stride && actualScrollTop > listTop) {
        const previousIndex = Math.floor((actualScrollTop - listTop) / previousStrideRef.current);
        instantScroll(scroll, listTop + previousIndex * stride, instantScrollStateRef.current);
      }
    }
    if (!searchChanged && activeChanged && activeId != null) {
      const index = items.findIndex((item) => item.id === activeId);
      if (index >= 0) {
        const top = listTop + index * stride;
        const stickyHeader = scroll.querySelector<HTMLElement>('.kc-qq-sticky-home-header');
        const stickyBottom = stickyHeader ? stickyHeader.getBoundingClientRect().bottom - scroll.getBoundingClientRect().top : 0;
        if (top < scroll.scrollTop + stickyBottom) instantScroll(scroll, top - stickyBottom, instantScrollStateRef.current);
        else if (top + rowHeight > scroll.scrollTop + scroll.clientHeight) instantScroll(scroll, top + rowHeight - scroll.clientHeight, instantScrollStateRef.current);
      }
    }
    previousItemsRef.current = items;
    previousListTopRef.current = listTop;
    previousStrideRef.current = stride;
    previousSearchRef.current = searchKey;
    previousActiveRef.current = activeId;
    measureViewport();
  }, [items, activeId, searchKey, rowHeight, stride, viewport.listTop, scrollRef, measureViewport]);

  const onScrollAnchor = useCallback(() => {
    const scroll = scrollRef.current;
    const currentItems = itemsRef.current;
    if (!scroll || !currentItems.length) return;
    const relative = Math.max(0, scroll.scrollTop - viewport.listTop);
    const index = Math.min(currentItems.length - 1, Math.floor(relative / stride));
    anchorRef.current = { id: currentItems[index].id, offset: relative - index * stride };
  }, [scrollRef, stride, viewport.listTop]);

  useEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    scroll.addEventListener('scroll', onScrollAnchor, { passive: true });
    return () => scroll.removeEventListener('scroll', onScrollAnchor);
  }, [scrollRef, onScrollAnchor]);

  return <div ref={listRef} className={className}>
    {first > 0 ? <div aria-hidden="true" style={{ height: first * stride }} /> : null}
    {items.slice(first, last).map((item, position) => <div key={item.id} ref={position === 0 ? measuredRowRef : undefined} style={{ height: stride, paddingBottom: rowGap }}>
      {renderRow(item, first + position)}
    </div>)}
    {last < items.length ? <div aria-hidden="true" style={{ height: (items.length - last) * stride }} /> : null}
  </div>;
}
