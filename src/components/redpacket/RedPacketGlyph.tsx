/**
 * 红包的图标：自己画的一只小红包，不用图标库里的线框。所有出现「红包」图标的地方都用它
 * （聊天卡片、输入区工具栏、右上角的「N 个红包未领」、发红包 / 红包记录的标题栏、商店里的入口、引用和搜索里的红包摘要、语音红包的小字）。
 *
 * 和拆红包弹层的正面是同一套：全是纯色，不做渐变——
 *   信封身 #C62F24（深红），封口 #E9493A，封口的弧边下面垫一片错开一点的暗红影子，靠它分出层次；
 *   弧边正中压一枚金币 #F6CD78，币面一道细内圈 #D9A443、中间一个方孔（墨色 #7A2A0C）；
 *   信封身下部一道很淡的细线，算是一点纹样。
 * 画板 24×24，信封占 16×21（竖长，和真的红包一样）。小于 20 像素时去掉内圈和细线、方孔改成实心，16 像素也看得清。
 * onRed：压在红底上（聊天里的红包卡片）时外沿加一圈淡金的细边，不然红上叠红分不开。
 * clipPath 的 id 来自 useId：一页里画多少个都不会串，放在 shadow root 里也一样。
 */
import { useId } from 'react';

interface RedPacketGlyphProps {
  /** 显示的像素边长，同时决定画完整版还是简化版。className 里的宽高会盖过它 */
  size?: number;
  className?: string;
  /** 压在红底上：外沿加一圈淡金细边 */
  onRed?: boolean;
  /** 给读屏用的名字；不传就当装饰 */
  title?: string;
}

/** 小于这个像素数就画简化版 */
const SIMPLE_BELOW = 20;

/** 封口：顶上整片，底边是一道往下鼓的弧，弧底（正中）在 y = 12 */
const FLAP = 'M3 0H21V9.4Q12 14.6 3 9.4Z';
const SEAL_Y = 12;

export function RedPacketGlyph({ size = 18, className, onRed = false, title }: RedPacketGlyphProps): JSX.Element {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const clip = `krp-glyph-${id}`;
  const simple = size < SIMPLE_BELOW;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className ? `krp-glyph ${className}` : 'krp-glyph'}
      style={{ flex: 'none' }}
      data-red-packet-glyph=""
      {...(title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': true })}
    >
      <defs>
        <clipPath id={clip}>
          <rect x="4" y="1.5" width="16" height="21" rx="2.6" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <rect x="4" y="1.5" width="16" height="21" fill="#C62F24" />
        {simple ? null : <path d="M8 19.2H16" stroke="#E04A3A" strokeWidth="0.7" strokeLinecap="round" />}
        {/* 封口下沿的影子：同一片封口往下错开一点，暗红实色 */}
        <path d={FLAP} transform="translate(0 0.95)" fill="#8F1E16" fillOpacity="0.42" />
        <path d={FLAP} fill="#E9493A" />
      </g>
      {onRed ? <rect x="4.4" y="1.9" width="15.2" height="20.2" rx="2.25" stroke="#FFE7A8" strokeOpacity="0.6" strokeWidth="0.8" /> : null}
      {/* 金币：纯金面 + 细内圈 + 方孔 */}
      <circle cx="12" cy={SEAL_Y} r={simple ? 3.7 : 3.5} fill="#F6CD78" />
      {simple ? (
        <rect x="11.15" y={SEAL_Y - 0.85} width="1.7" height="1.7" rx="0.25" fill="#7A2A0C" />
      ) : (
        <>
          <circle cx="12" cy={SEAL_Y} r="2.6" stroke="#D9A443" strokeOpacity="0.8" strokeWidth="0.5" />
          <rect x="11.1" y={SEAL_Y - 0.9} width="1.8" height="1.8" rx="0.2" stroke="#7A2A0C" strokeWidth="0.6" />
        </>
      )}
    </svg>
  );
}
