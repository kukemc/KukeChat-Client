import { useLayoutEffect, type RefObject } from 'react';

interface FitTextOptions {
  /** 外面那一块：高度是定的（红包正面「谁发的」到「开」之间），内容不能比它高 */
  box: RefObject<HTMLElement>;
  /** box 里实际排内容的那层（自然高度，可能还带着别的行），量它比 box 高不高 */
  inner: RefObject<HTMLElement>;
  /** 要缩字号的那段字 */
  text: RefObject<HTMLElement>;
  /** 字号范围（px，会再乘上外观里的字号倍数 --krp-fs） */
  maxPx: number;
  minPx: number;
  /** 最多几行 */
  maxLines: number;
  /** 文字变了就重新量 */
  content: string;
}

/** 外观里的字号倍数（红包样式上的 --krp-fs），读不到当 1 */
function fontScale(element: HTMLElement): number {
  const value = Number.parseFloat(getComputedStyle(element).getPropertyValue('--krp-fs'));
  return Number.isFinite(value) && value > 0 ? value : 1;
}

/** 当前字号下排了几行 */
function lineCount(element: HTMLElement): number {
  const lineHeight = Number.parseFloat(getComputedStyle(element).lineHeight);
  return lineHeight > 0 ? Math.round(element.offsetHeight / lineHeight) : 1;
}

/**
 * 放不下就缩字号：从 maxPx 起每次小 1px，直到「不超过 maxLines 行、整块内容不比 box 高」，最小到 minPx；
 * 最小字号还放不下，才按 box 能容下的行数截断（-webkit-line-clamp）。
 * 在 layout effect 里同步试完（每试一次强制排一次版，最多十来次），浏览器画第一帧之前字号就定了，不会闪一下大字；
 * 定下来之前 text 上没有 data-fit-ready，样式里是 visibility: hidden，兜住万一没跑到的情况。
 * 三个 ref 要在调用它的组件自己挂载时就已经接上（所以红包正面把这块拆成了 EnvelopeFit，放在 portal 里面渲染）。
 * box 的尺寸变了（窗口变矮、字号倍数变了）用 ResizeObserver 重新量；只看 box 不看 text，自己改字号不会再触发自己。
 */
export function useFitText({ box, inner, text, maxPx, minPx, maxLines, content }: FitTextOptions): void {
  useLayoutEffect(() => {
    const boxElement = box.current;
    const innerElement = inner.current;
    const textElement = text.current;
    if (!boxElement || !innerElement || !textElement) {
      return undefined;
    }

    const fit = (): void => {
      textElement.removeAttribute('data-fit-clamp');
      textElement.style.removeProperty('-webkit-line-clamp');
      const available = boxElement.clientHeight;
      if (available <= 0) {
        // 还没排版（被藏着）：先按默认字号显示，等 ResizeObserver 回来再量
        textElement.style.removeProperty('font-size');
        textElement.setAttribute('data-fit-ready', '');
        return;
      }
      const scale = fontScale(textElement);
      const floor = minPx * scale;
      let size = maxPx * scale;
      const fits = (): boolean => lineCount(textElement) <= maxLines && innerElement.offsetHeight <= available + 0.5;
      for (;;) {
        textElement.style.fontSize = `${size}px`;
        if (fits() || size <= floor) {
          break;
        }
        size = Math.max(floor, size - 1);
      }
      if (!fits()) {
        // 最小字号也放不下：按剩下的高度能放几行就截到几行，末尾省略
        const lineHeight = Number.parseFloat(getComputedStyle(textElement).lineHeight) || size * 1.3;
        const others = innerElement.offsetHeight - textElement.offsetHeight;
        const lines = Math.max(1, Math.min(maxLines, Math.floor((available - others) / lineHeight)));
        textElement.setAttribute('data-fit-clamp', '');
        textElement.style.setProperty('-webkit-line-clamp', String(lines));
      }
      textElement.setAttribute('data-fit-ready', '');
    };

    fit();
    let alive = true;
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      let lastHeight = boxElement.clientHeight;
      let lastWidth = boxElement.clientWidth;
      observer = new ResizeObserver(() => {
        if (boxElement.clientHeight === lastHeight && boxElement.clientWidth === lastWidth) {
          return;
        }
        lastHeight = boxElement.clientHeight;
        lastWidth = boxElement.clientWidth;
        fit();
      });
      observer.observe(boxElement);
    }
    // 网络字体晚到会改变字宽：到了再量一次
    void document.fonts?.ready.then(() => {
      if (alive) {
        fit();
      }
    });
    return () => {
      alive = false;
      observer?.disconnect();
    };
  }, [box, inner, text, maxPx, minPx, maxLines, content]);
}
