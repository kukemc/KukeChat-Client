/**
 * 「大佬入住」页的动效基础件。几条共同的约束：
 *   · 只动 transform 和 opacity；
 *   · 没有常驻的 rAF 循环——指针不动、数字滚完，就没有任何回调在跑；
 *   · 系统开了「减少动态效果」时，位移类的动效全部不做。
 */
import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react';

export const EASE = {
  /** 快出慢收：入场、落位 */
  out: 'cubic-bezier(0.16, 1, 0.3, 1)',
  /** 两头慢：从一个位置搬到另一个位置 */
  inOut: 'cubic-bezier(0.76, 0, 0.24, 1)',
  /** 略微冲过头再回来：有分量的东西落下 */
  back: 'cubic-bezier(0.34, 1.4, 0.64, 1)'
};

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/* ───────── 进入视口（只触发一次） ───────── */

const enterCallbacks = new WeakMap<Element, (order: number) => void>();
let enterObserver: IntersectionObserver | null = null;

function observeEnter(element: Element, callback: (order: number) => void): () => void {
  if (!enterObserver) {
    enterObserver = new IntersectionObserver((entries) => {
      // 同一批进入视口的元素按顺序编号，用来错开各自的入场
      let order = 0;
      for (const entry of entries) {
        const enter = entry.isIntersecting ? enterCallbacks.get(entry.target) : undefined;
        if (enter) {
          enterCallbacks.delete(entry.target);
          enterObserver?.unobserve(entry.target);
          enter(order);
          order += 1;
        }
      }
    }, { threshold: 0.1 });
  }
  enterCallbacks.set(element, callback);
  enterObserver.observe(element);
  return () => {
    enterCallbacks.delete(element);
    enterObserver?.unobserve(element);
  };
}

/**
 * 元素第一次进入视口时变成 seen，之后不再变回去。
 * order 是它在同一批里的序号（0 起），拿去算入场的延迟。enabled 为 false 时先不观察（片头还在播）。
 */
export function useInViewOnce(ref: RefObject<Element>, enabled = true): { seen: boolean; order: number } {
  const [state, setState] = useState({ seen: false, order: 0 });
  useEffect(() => {
    const element = ref.current;
    if (!enabled || state.seen || !element) {
      return undefined;
    }
    return observeEnter(element, (order) => setState({ seen: true, order }));
  }, [enabled, ref, state.seen]);
  return state;
}

/* ───────── 指针倾斜 ───────── */

const TILT_DEGREES = 7;

function clearTilt(card: HTMLElement): void {
  card.classList.remove('is-tilting');
  for (const name of ['--kcr-rx', '--kcr-ry', '--kcr-px', '--kcr-py', '--kcr-sx', '--kcr-sy']) {
    card.style.removeProperty(name);
  }
}

/**
 * 容器里带 data-tilt 的卡片跟着指针轻微倾斜，并把指针位置写进 CSS 变量（光斑、题图视差用）。
 * 整个容器只挂一组监听；指针每动一下最多排一次 rAF，指针停了就什么都不跑。
 */
export function useTilt(containerRef: RefObject<HTMLElement>, enabled: boolean): void {
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !enabled || prefersReducedMotion() || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      return undefined;
    }
    let current: HTMLElement | null = null;
    let frame = 0;
    let pointerX = 0;
    let pointerY = 0;

    function apply(): void {
      frame = 0;
      if (!current) {
        return;
      }
      const rect = current.getBoundingClientRect();
      // -1..1：指针在卡片里偏离中心多少
      const x = Math.min(1, Math.max(-1, ((pointerX - rect.left) / rect.width) * 2 - 1));
      const y = Math.min(1, Math.max(-1, ((pointerY - rect.top) / rect.height) * 2 - 1));
      const style = current.style;
      style.setProperty('--kcr-rx', `${(-y * TILT_DEGREES).toFixed(2)}deg`);
      style.setProperty('--kcr-ry', `${(x * TILT_DEGREES).toFixed(2)}deg`);
      style.setProperty('--kcr-px', x.toFixed(3));
      style.setProperty('--kcr-py', y.toFixed(3));
      style.setProperty('--kcr-sx', `${(pointerX - rect.left).toFixed(1)}px`);
      style.setProperty('--kcr-sy', `${(pointerY - rect.top).toFixed(1)}px`);
    }

    function onMove(event: PointerEvent): void {
      const card = (event.target as Element | null)?.closest<HTMLElement>('[data-tilt]') ?? null;
      if (card !== current) {
        if (current) {
          clearTilt(current);
        }
        current = card;
        card?.classList.add('is-tilting');
      }
      if (!card) {
        return;
      }
      pointerX = event.clientX;
      pointerY = event.clientY;
      if (!frame) {
        frame = window.requestAnimationFrame(apply);
      }
    }

    function onLeave(): void {
      if (frame) {
        window.cancelAnimationFrame(frame);
        frame = 0;
      }
      if (current) {
        clearTilt(current);
        current = null;
      }
    }

    container.addEventListener('pointermove', onMove);
    container.addEventListener('pointerleave', onLeave);
    return () => {
      container.removeEventListener('pointermove', onMove);
      container.removeEventListener('pointerleave', onLeave);
      onLeave();
    };
  }, [containerRef, enabled]);
}

/* ───────── 换位置的过渡（FLIP） ───────── */

/**
 * 列表重新排序时，让每一项从旧位置滑到新位置。
 * 用法：改顺序之前调 capture() 记下旧位置；顺序变了之后（signature 变化）自动从旧位置滑过来。
 * 只处理新旧位置至少有一个在视口附近的项。
 */
export function useFlip(containerRef: RefObject<HTMLElement>, signature: string): { capture: () => void } {
  const before = useRef<Map<string, DOMRect> | null>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const previous = before.current;
    before.current = null;
    if (!container || !previous || prefersReducedMotion()) {
      return;
    }
    const viewportHeight = window.innerHeight;
    const near = (rect: DOMRect): boolean => rect.bottom > -240 && rect.top < viewportHeight + 240;
    container.querySelectorAll<HTMLElement>('[data-flip]').forEach((element) => {
      const from = previous.get(element.dataset.flip ?? '');
      if (!from) {
        return;
      }
      const to = element.getBoundingClientRect();
      const dx = from.left - to.left;
      const dy = from.top - to.top;
      if ((Math.abs(dx) < 1 && Math.abs(dy) < 1) || (!near(from) && !near(to))) {
        return;
      }
      element.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }], { duration: 620, easing: EASE.inOut });
    });
  }, [containerRef, signature]);

  return {
    capture: () => {
      const rects = new Map<string, DOMRect>();
      containerRef.current?.querySelectorAll<HTMLElement>('[data-flip]').forEach((element) => {
        rects.set(element.dataset.flip ?? '', element.getBoundingClientRect());
      });
      before.current = rects;
    }
  };
}
