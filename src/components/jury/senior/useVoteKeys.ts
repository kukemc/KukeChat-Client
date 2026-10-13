import { useCallback, useRef, type KeyboardEvent, type RefObject } from 'react';

/** 表决面板对键盘开放的三个动作（评审台的 VotePanel 和复审的 AppealVotePanel 都实现了它们） */
export interface VoteKeyTarget {
  pick: (index: number) => void;
  advance: () => void;
  cancel: () => boolean;
  cycleCategory?: (step: 1 | -1) => boolean;
}

/**
 * 合议 / 复审的快捷键，和评审台同一套：数字键选择，两次 Ctrl+Enter 提交，Esc 退出确认，C 换违规类别。
 * 只在焦点位于这一块内部时生效 —— 扩展是嵌在别人的页面里的，不能去抢整个页面的按键。
 */
export function useVoteKeys(panelRef: RefObject<VoteKeyTarget>): { rootRef: RefObject<HTMLDivElement>; onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void; onViewerOpenChange: (open: boolean) => void } {
  const rootRef = useRef<HTMLDivElement>(null);
  const viewerOpenRef = useRef(false);

  const onViewerOpenChange = useCallback((open: boolean) => {
    viewerOpenRef.current = open;
  }, []);

  const onKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    // 看图浮层和对话框是挂在别处的浮层，它们里面的按键不归这里管
    if (event.defaultPrevented || event.nativeEvent.isComposing || viewerOpenRef.current || !target || target.closest('[role="dialog"]') || !rootRef.current?.contains(target)) {
      return;
    }
    const typing = target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.isContentEditable;
    const plain = !typing && !event.ctrlKey && !event.metaKey && !event.altKey;
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      panelRef.current?.advance();
    } else if (event.key === 'Escape') {
      if (panelRef.current?.cancel()) {
        event.preventDefault();
      }
    } else if (plain && /^[1-9]$/.test(event.key)) {
      event.preventDefault();
      panelRef.current?.pick(Number(event.key));
    } else if (plain && event.key.toLowerCase() === 'c') {
      if (panelRef.current?.cycleCategory?.(event.shiftKey ? -1 : 1)) {
        event.preventDefault();
      }
    }
  }, [panelRef]);

  return { rootRef, onKeyDown, onViewerOpenChange };
}
