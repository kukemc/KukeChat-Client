/**
 * KukeChat 的金币：自己画的，不用图标库里的。
 *
 * 扁平的一枚圆币，币面中间是白色的几何 K（KukeChat 的 K）。不画厚度、浮雕和高光——那一套看着旧。
 *   - color：很收敛的琥珀渐变（上浅下深，色相几乎不变）+ 一圈很淡的内描边，用在余额、价格、红包金额、礼物价格。
 *     配色固定，不跟主题走；外沿一圈稍深的线，浅色背景上不发虚。
 *   - line：只有线条，颜色跟 currentColor，线宽和 ui/Icon 里的图标一样（1.9），用在跟着文字颜色走的小字和菜单里。
 * 画板 24×24。小于 16 像素时去掉内描边，K 再加粗一点，12 像素也认得出。
 * 按 size 选画法，所以用 className 改了显示尺寸时也要把 size 传成差不多的像素数。
 * 渐变的 id 来自 useId：一页里画多少个都不会串，放在 shadow root 里也一样。
 */
import { useId } from 'react';

export type CoinIconVariant = 'color' | 'line';

interface CoinIconProps {
  variant?: CoinIconVariant;
  /** 显示的像素边长，同时决定用完整版还是简化版。className 里的宽高会盖过它 */
  size?: number;
  className?: string;
  /** 给读屏用的名字；不传就当装饰（旁边一般已经写了数字和「币」） */
  title?: string;
}

/** 小于这个像素数就画简化版 */
const SIMPLE_BELOW = 16;

/** K：竖笔 + 上臂 + 下腿，下腿从上臂中段起笔，端点都是圆头 */
const K_PATH = 'M9.35 7.3v9.4M14.9 7.3 9.5 12.35M11.75 10.25l3.35 6.45';

export function CoinIcon({ variant = 'color', size = 16, className, title }: CoinIconProps): JSX.Element {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const simple = size < SIMPLE_BELOW;
  const shared = { xmlns: 'http://www.w3.org/2000/svg', width: size, height: size, viewBox: '0 0 24 24', className, style: { flex: 'none' as const }, ...(title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': true }) };

  if (variant === 'line') {
    return (
      <svg {...shared} data-coin="line" fill="none" stroke="currentColor" strokeWidth={simple ? 2.1 : 1.9} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9.2" />
        <path d={K_PATH} />
      </svg>
    );
  }

  const face = `kcoin-f-${id}`;
  return (
    <svg {...shared} data-coin="color" fill="none">
      <defs>
        <linearGradient id={face} x1="12" y1="1.5" x2="12" y2="22.5" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFC83D" />
          <stop offset="1" stopColor="#F29A0E" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="10.5" fill={`url(#${face})`} />
      <circle cx="12" cy="12" r="10.15" stroke="#C9780A" strokeOpacity="0.35" strokeWidth="0.7" />
      {simple ? null : <circle cx="12" cy="12" r="7.9" stroke="#FFFFFF" strokeOpacity="0.38" strokeWidth="0.8" />}
      <path d={K_PATH} stroke="#FFFFFF" strokeWidth={simple ? 2.7 : 2.25} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
