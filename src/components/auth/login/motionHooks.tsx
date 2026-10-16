import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { prefersReducedMotion } from '../blocks/motion';

/** 系统「减少动态效果」：开着时登录页的所有过渡都瞬时完成。 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(prefersReducedMotion);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (): void => setReduced(query.matches);
    query.addEventListener?.('change', onChange);
    return () => query.removeEventListener?.('change', onChange);
  }, []);
  return reduced;
}

/**
 * 文字交叉淡入 + 轻微上移。swapKey 变了才换；连续切换时以最后一次为准，
 * 中途又切回当前显示的内容就只轻轻闪一下。instant 为真时直接换。
 */
export function SwapText({ swapKey, instant, children }: { swapKey: string; instant: boolean; children: ReactNode }): JSX.Element {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [shownKey, setShownKey] = useState(swapKey);
  const keyRef = useRef(swapKey);
  keyRef.current = swapKey;
  // 淡出期间还显示旧内容：key 一致时随时记下最新的内容
  const frozen = useRef<ReactNode>(children);
  if (shownKey === swapKey) frozen.current = children;
  const entering = useRef(false);

  useLayoutEffect(() => {
    const node = ref.current;
    if (swapKey === shownKey) {
      if (entering.current) return;
      if (node && node.getAnimations().length) {
        node.getAnimations().forEach((a) => a.cancel());
        if (!instant) node.animate([{ opacity: 0.3 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });
      }
      return;
    }
    if (!node || instant || typeof node.animate !== 'function') {
      node?.getAnimations().forEach((a) => a.cancel());
      setShownKey(swapKey);
      return;
    }
    node.getAnimations().forEach((a) => a.cancel());
    const out = node.animate([{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(-5px)' }], { duration: 130, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' });
    out.onfinish = () => {
      if (keyRef.current !== swapKey) return;
      entering.current = true;
      setShownKey(swapKey);
    };
  }, [swapKey, shownKey, instant]);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!entering.current || !node) return;
    entering.current = false;
    node.getAnimations().forEach((a) => a.cancel());
    node.animate([{ opacity: 0, transform: 'translateY(5px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }, [shownKey]);

  return <span ref={ref} className="klg-swap">{shownKey === swapKey ? children : frozen.current}</span>;
}

/** 只在一种模式里出现的东西：高度从 0 展开、淡入；收起时设 inert，Tab 键和读屏都跳过它。 */
export function Collapse({ open, delay = 0, instant, children }: { open: boolean; delay?: number; instant: boolean; children: ReactNode }): JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    if (ref.current) ref.current.inert = !open;
  }, [open]);
  return (
    <div ref={ref} className={`klg-clp ${open ? 'is-open' : ''}`} style={{ transitionDelay: instant ? '0ms' : `${delay}ms` }} aria-hidden={open ? undefined : true}>
      <div>{children}</div>
    </div>
  );
}
