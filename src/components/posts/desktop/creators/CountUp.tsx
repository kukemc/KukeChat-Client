import { useLayoutEffect, useRef } from 'react';
import { compactNumber, compactNumberScale } from '../../ccwCreatorsData';
import { prefersReducedMotion } from './motion';

const DURATION = 1100;

/* 所有正在滚的数字共用一个 rAF：一屏三四十个数字同时滚，也只有一个回调；全部滚完，回调就停。 */
const rolling = new Set<(now: number) => boolean>();
let frame = 0;

function tick(now: number): void {
  frame = 0;
  rolling.forEach((step) => {
    if (!step(now)) {
      rolling.delete(step);
    }
  });
  if (rolling.size > 0) {
    frame = window.requestAnimationFrame(tick);
  }
}

function roll(step: (now: number) => boolean): () => void {
  rolling.add(step);
  if (!frame) {
    frame = window.requestAnimationFrame(tick);
  }
  return () => {
    rolling.delete(step);
  };
}

/**
 * 从 0 滚到目标值的数字。run 变成 true 时开始，只滚一次。
 * 滚动全程用终值的单位和小数位（23.8万 就一直是 x.x万），再垫一份看不见的终值占住宽度，所以不会抖。
 * 直接改文本节点，不走 React 渲染。
 */
export function CountUp({ value, run, delay = 0, instant = false }: { value?: number | null; run: boolean; delay?: number; /** 不滚，直接显示终值（片头里已经滚过一遍的那个数） */ instant?: boolean }): JSX.Element {
  const target = Math.max(0, value ?? 0);
  const liveRef = useRef<HTMLSpanElement>(null);
  const done = useRef(false);
  const final = compactNumber(target);

  // 用 layout effect：文本在第一次绘制前就写好，不会先闪一下空白或终值
  useLayoutEffect(() => {
    const live = liveRef.current;
    if (!live) {
      return undefined;
    }
    if (!run) {
      live.textContent = done.current ? final : compactNumber(0);
      return undefined;
    }
    if (instant || done.current || target === 0 || prefersReducedMotion()) {
      done.current = true;
      live.textContent = final;
      return undefined;
    }
    const { divisor, digits, suffix } = compactNumberScale(target);
    let startedAt = 0;
    live.textContent = divisor === 1 ? '0' : `${(0).toFixed(digits)}${suffix}`;
    const stop = roll((now) => {
      startedAt ||= now + delay;
      const progress = Math.min(1, Math.max(0, (now - startedAt) / DURATION));
      // 先快后慢，最后几个数能看清
      const eased = 1 - (1 - progress) ** 4;
      const current = target * eased;
      live.textContent = progress >= 1 ? final : divisor === 1 ? String(Math.round(current)) : `${(current / divisor).toFixed(digits)}${suffix}`;
      if (progress >= 1) {
        done.current = true;
        return false;
      }
      return true;
    });
    return () => {
      stop();
      // 中途被卸载或重排：下次直接显示终值，不再从头滚
      done.current = true;
    };
  }, [delay, final, instant, run, target]);

  return (
    <span className="kcr-num" aria-label={final}>
      <span className="kcr-num-ghost" aria-hidden="true">{final}</span>
      <span ref={liveRef} className="kcr-num-live" aria-hidden="true" />
    </span>
  );
}
