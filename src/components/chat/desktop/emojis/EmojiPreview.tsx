import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { cx } from '../runtime';

export interface EmojiPreviewHandle {
  /** 鼠标移到了哪个格子上；传 null 表示移开了 */
  show: (cell: HTMLElement | null) => void;
  hide: () => void;
}

interface PreviewState {
  src?: string;
  glyph?: string;
  name: string;
  style: CSSProperties;
}

/** 第一次要停一下才出现，免得鼠标划过面板时一路闪；已经出现之后换格子是立刻跟上的。 */
const SHOW_DELAY_MS = 320;
const IMAGE_SIZE = 176;
const GLYPH_SIZE = 104;
const GAP = 8;
/** 面板底部分类栏的高度，放在面板里面时要让开它 */
const TABS_HEIGHT = 44;

/**
 * 悬停时的大图预览。格子用 data-kce-preview（img / emoji）、data-src、data-name 描述自己，
 * 面板在滚动区上统一监听鼠标，不给每个格子单独挂事件；状态也留在这里，换预览不会重渲染整个网格。
 */
export const EmojiPreview = forwardRef<EmojiPreviewHandle, { rootRef: RefObject<HTMLElement> }>(function EmojiPreview({ rootRef }, ref) {
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const cellRef = useRef<HTMLElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const visibleRef = useRef(false);
  visibleRef.current = preview !== null;

  function clearTimer(): void {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function place(cell: HTMLElement, size: number): CSSProperties {
    const root = rootRef.current;
    if (!root) {
      return {};
    }
    // 面板右边还有地方就放到面板外面，贴着底；放不下就放进面板里离鼠标最远的那个角
    const host = root.offsetParent;
    if (host instanceof HTMLElement && host.clientWidth - root.offsetLeft - root.offsetWidth >= size + GAP) {
      return { left: root.offsetWidth + GAP, bottom: 0 };
    }
    const bounds = root.getBoundingClientRect();
    const rect = cell.getBoundingClientRect();
    const cellOnRight = rect.left + rect.width / 2 - bounds.left > bounds.width / 2;
    const cellOnTop = rect.top + rect.height / 2 - bounds.top < bounds.height / 2;
    return { [cellOnRight ? 'left' : 'right']: GAP, [cellOnTop ? 'bottom' : 'top']: cellOnTop ? TABS_HEIGHT + GAP : GAP };
  }

  function reveal(cell: HTMLElement): void {
    const isImage = cell.dataset.kcePreview === 'img';
    const src = isImage ? cell.dataset.src : undefined;
    if (isImage && !src) {
      setPreview(null);
      return;
    }
    setPreview({ src, glyph: isImage ? undefined : cell.textContent ?? '', name: cell.dataset.name ?? '', style: place(cell, isImage ? IMAGE_SIZE : GLYPH_SIZE) });
  }

  function hide(): void {
    clearTimer();
    cellRef.current = null;
    setPreview(null);
  }

  useImperativeHandle(ref, () => ({
    show: (cell) => {
      if (cell === cellRef.current) {
        return;
      }
      if (!cell) {
        hide();
        return;
      }
      clearTimer();
      cellRef.current = cell;
      if (visibleRef.current) {
        reveal(cell);
      } else {
        timerRef.current = window.setTimeout(() => reveal(cell), SHOW_DELAY_MS);
      }
    },
    hide
  }));

  useEffect(() => clearTimer, []);

  if (!preview) {
    return null;
  }
  return (
    <div className={cx('kce-preview', preview.src ? 'kce-preview--image' : 'kce-preview--glyph')} style={preview.style} aria-hidden="true">
      {preview.src ? <img src={preview.src} alt="" /> : <span className="kce-preview-glyph">{preview.glyph}</span>}
      {preview.name ? <span className="kce-preview-name">{preview.name}</span> : null}
    </div>
  );
});
