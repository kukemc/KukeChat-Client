import type { CSSProperties } from 'react';

/**
 * 生日当天打开应用时放一次的庆祝画面，纯展示：不读 store、不起定时器，时间轴全在 birthday-scene.css 里
 * （前缀 kbds-），宿主负责全屏容器、压暗的底、点一下跳过和到点卸载。
 *
 * 蛋糕、蜡烛、彩带都是这里画的矢量插画，不是界面图标，所以不走 ui/Icon。一个 shadow root 里会同时有很多 SVG，
 * 所以不用带 id 的渐变和裁剪：体积感靠平涂的底色上叠白色高光和压暗的侧面（和 shop/skin/ornaments.tsx 一个路数）。
 */

/** 动画版从出现到完全淡出的总时长（毫秒）。样式里的淡出时刻由它经 --kbds-total 推算，改这一个数就够。 */
export const BIRTHDAY_SCENE_MS = 3800;

const SHADE = { fill: '#000000', fillOpacity: 0.12 } as const;

const CREAM = '#fff4e3';
const BERRY = '#ff7fa3';
const GRAPE = '#a58bff';
const PARTY_COLORS = ['#ff7fa3', '#ffd24d', '#5ec8ff', '#6fe0a8', '#a58bff', '#ff9f5a'] as const;

/** 三根蜡烛：横坐标、烛顶的纵坐标（中间那根高一点）、颜色 */
const CANDLES = [
  { x: 78, top: 44, color: '#5ec8ff' },
  { x: 100, top: 36, color: '#ffd24d' },
  { x: 122, top: 44, color: '#6fe0a8' }
] as const;

/** 下层的奶油：从右往左一排长短不一的垂滴，宽 140 */
const FROSTING_LOWER =
  'M30 124a10 10 0 0 1 10-10h120a10 10 0 0 1 10 10v8a7 7 0 0 1-14 0v-2a6 6 0 0 0-12 0v12a7 7 0 0 1-14 0v-10a6 6 0 0 0-12 0v4a7 7 0 0 1-14 0v-5a6 6 0 0 0-12 0v14a7 7 0 0 1-14 0v-13a6 6 0 0 0-12 0v6a7 7 0 0 1-14 0v-7a6 6 0 0 0-12 0v3a5 5 0 0 1-10 0Z';
/** 上层的奶油，宽 92 */
const FROSTING_UPPER =
  'M54 78a10 10 0 0 1 10-10h72a10 10 0 0 1 10 10v7a6 6 0 0 1-12 0v-1a5 5 0 0 0-10 0v10a6 6 0 0 1-12 0v-9a5 5 0 0 0-10 0v3a6 6 0 0 1-12 0v-3a5 5 0 0 0-10 0v11a6 6 0 0 1-12 0v-11a5 5 0 0 0-10 0v2a2 2 0 0 1-4 0Z';
/** 上层那一圈糖珠的横坐标 */
const PEARLS = [62, 74, 86, 98, 110, 122, 134] as const;
/** 四角星，24×24 的画板 */
const SPARKLE = 'M12 1C12.9 7.6 16.4 11.1 23 12C16.4 12.9 12.9 16.4 12 23C11.1 16.4 7.6 12.9 1 12C7.6 11.1 11.1 7.6 12 1Z';
/** 卷起来的彩带 */
const STREAMER = 'M8 3C17 9 -1 15 8 21S-1 33 8 39S17 51 8 57';

/** CSS 自定义属性没有进 CSSProperties 的类型，统一从这里过一下 */
function vars(values: Record<`--kbds-${string}`, string | number>): CSSProperties {
  return values as CSSProperties;
}

type Bit = { key: number; shape: 'rect' | 'dot' | 'strip'; front: boolean; style: CSSProperties };

/**
 * 纸屑的位置、大小、快慢都由序号算出来（不在渲染时取随机数）：横向用黄金分割铺开，免得挤成一团；
 * 每三片里有一片落在蛋糕和文字前面，其余在后面。
 */
const CONFETTI: Bit[] = Array.from({ length: 26 }, (_, index) => ({
  key: index,
  shape: (['rect', 'dot', 'strip'] as const)[index % 3],
  front: index % 3 === 0,
  style: vars({
    '--kbds-x': `${Math.round(((index * 61.8 + 4) % 100) * 10) / 10}%`,
    '--kbds-color': PARTY_COLORS[index % PARTY_COLORS.length],
    '--kbds-size': `${7 + (index % 4) * 2}px`,
    '--kbds-delay': `${120 + ((index * 137) % 1500)}ms`,
    '--kbds-dur': `${1900 + ((index * 53) % 900)}ms`,
    '--kbds-sway': `${(index % 2 === 0 ? 1 : -1) * (8 + (index % 5) * 4)}px`,
    '--kbds-spin': `${(index % 2 === 0 ? 1 : -1) * (160 + (index % 4) * 70)}deg`,
    '--kbds-tumble': `${700 + ((index * 91) % 500)}ms`
  })
}));

/** 彩带比纸屑少、大、落得慢 */
const STREAMERS = Array.from({ length: 6 }, (_, index) => ({
  key: index,
  color: PARTY_COLORS[(index * 2 + 1) % PARTY_COLORS.length],
  style: vars({
    '--kbds-x': `${6 + index * 17.5}%`,
    '--kbds-delay': `${(index * 290) % 1100}ms`,
    '--kbds-dur': `${2700 + ((index * 170) % 700)}ms`,
    '--kbds-tilt': `${(index % 2 === 0 ? 1 : -1) * 16}deg`,
    '--kbds-tumble': `${900 + index * 80}ms`
  })
}));

/** 蛋糕周围的几颗闪光：相对舞台的位置（百分比）和大小 */
const SPARKLES = [
  { left: 2, top: 30, size: 18, color: '#ffe08a' },
  { left: 90, top: 22, size: 22, color: '#ffffff' },
  { left: 12, top: 66, size: 12, color: '#ffffff' },
  { left: 88, top: 62, size: 14, color: '#ffe08a' },
  { left: 50, top: -4, size: 12, color: '#ffffff' }
] as const;

/** 静态贺卡顶上撒的纸屑：位置写死，都落在卡片的上半截，不压字 */
const CARD_BITS = [
  { left: 7, top: 9, turn: -24, shape: 'rect' },
  { left: 19, top: 30, turn: 18, shape: 'dot' },
  { left: 12, top: 52, turn: 40, shape: 'strip' },
  { left: 30, top: 6, turn: 62, shape: 'strip' },
  { left: 46, top: 3, turn: 0, shape: 'dot' },
  { left: 68, top: 7, turn: -38, shape: 'rect' },
  { left: 80, top: 28, turn: 28, shape: 'strip' },
  { left: 90, top: 10, turn: 12, shape: 'dot' },
  { left: 86, top: 50, turn: -16, shape: 'rect' },
  { left: 3, top: 34, turn: 70, shape: 'rect' }
] as const;

function Candle({ x, top, color, index }: { x: number; top: number; color: string; index: number }): JSX.Element {
  return (
    <g className="kbds-candle" style={vars({ '--kbds-i': index })}>
      <rect x={x - 4} y={top} width="8" height={70 - top} rx="3" fill={color} />
      {/* 斜条纹 */}
      {[6, 14, 22].filter((offset) => top + offset < 66).map((offset) => (
        <path key={offset} d={`M${x - 3.2} ${top + offset + 2}L${x + 3.2} ${top + offset - 2}`} fill="none" stroke="#ffffff" strokeOpacity="0.7" strokeWidth="2.4" />
      ))}
      <rect x={x + 1.4} y={top} width="2.6" height={70 - top} rx="1.3" {...SHADE} />
      {/* 烛脚陷进奶油里的那一小圈 */}
      <ellipse cx={x} cy="70" rx="7" ry="2.6" fill={CREAM} />
      <path d={`M${x} ${top}v-4`} fill="none" stroke="#5a4636" strokeWidth="1.4" strokeLinecap="round" />
      {/* 外层的 g 只管摆位置：CSS 的 transform 会盖掉 transform 属性，所以动画放在里面那层 */}
      <g transform={`translate(${x} ${top - 3})`}>
        <circle className="kbds-glow" cx="0" cy="-6" r="13" fill="#ffd36b" fillOpacity="0.3" />
        <g className="kbds-flame">
          <g className="kbds-flicker">
            <path d="M0 -16C5 -9 6 -5 6 -1A6 6 0 0 1 -6 -1C-6 -5 -5 -9 0 -16Z" fill="#ffa726" />
            <path d="M0 -9.5C2.6 -5.5 3 -3.5 3 -1.5A3 3 0 0 1 -3 -1.5C-3 -3.5 -2.6 -5.5 0 -9.5Z" fill="#fff3b0" />
          </g>
        </g>
      </g>
    </g>
  );
}

/** 两层蛋糕，200×190 的画板。分成盘子、下层、上层、蜡烛几组，动画版里一组一组冒出来。 */
function Cake(): JSX.Element {
  return (
    <svg className="kbds-cake-svg" viewBox="0 0 200 190" aria-hidden="true" focusable="false">
      <g className="kbds-plate">
        <ellipse cx="100" cy="177" rx="72" ry="6" fill="#000000" fillOpacity="0.2" />
        <ellipse cx="100" cy="170" rx="88" ry="9.5" fill="#f4eeff" />
        <ellipse cx="100" cy="168.6" rx="80" ry="6.6" fill="#ffffff" fillOpacity="0.7" />
      </g>

      <g className="kbds-tier kbds-tier--lower">
        <path d="M30 124a10 10 0 0 1 10-10h120a10 10 0 0 1 10 10v38a8 8 0 0 1-8 8H38a8 8 0 0 1-8-8Z" fill={BERRY} />
        {/* 腰上一道波浪裱花 */}
        <path d="M30 160q8.75 7 17.5 0t17.5 0t17.5 0t17.5 0t17.5 0t17.5 0t17.5 0t17.5 0" fill="none" stroke={CREAM} strokeOpacity="0.8" strokeWidth="3" strokeLinecap="round" />
        <path d={FROSTING_LOWER} fill={CREAM} />
        <path d="M44 120H98" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" />
        <path d="M37 148v9" fill="none" stroke="#ffffff" strokeOpacity="0.45" strokeWidth="4" strokeLinecap="round" />
        {/* 背光的右侧 */}
        <path d="M152 114h8a10 10 0 0 1 10 10v38a8 8 0 0 1-8 8h-10Z" {...SHADE} />
      </g>

      <g className="kbds-tier kbds-tier--upper">
        <ellipse cx="100" cy="117" rx="50" ry="4" fill="#000000" fillOpacity="0.14" />
        <path d="M54 78a10 10 0 0 1 10-10h72a10 10 0 0 1 10 10v38H54Z" fill={GRAPE} />
        {PEARLS.map((x, index) => <circle key={x} cx={x} cy="109" r="2.3" fill={index % 2 === 0 ? '#ffd24d' : CREAM} />)}
        <path d={FROSTING_UPPER} fill={CREAM} />
        <path d="M66 73.5H104" fill="none" stroke="#ffffff" strokeWidth="2.6" strokeLinecap="round" />
        <path d="M60.5 95v10" fill="none" stroke="#ffffff" strokeOpacity="0.45" strokeWidth="3.4" strokeLinecap="round" />
        <path d="M133 68h3a10 10 0 0 1 10 10v38h-13Z" {...SHADE} />
      </g>

      {CANDLES.map((candle, index) => <Candle key={candle.x} {...candle} index={index} />)}
    </svg>
  );
}

/** 两行祝福。名字是用户填的，长度不定：只当文本节点渲染，放不下就自己占一行并省略。 */
function Greeting({ name }: { name: string }): JSX.Element {
  return (
    <div className="kbds-text">
      <div className="kbds-title">
        <span className="kbds-hello">
          {['生', '日', '快', '乐', '，'].map((char, index) => (
            <span key={index} className="kbds-char" style={vars({ '--kbds-i': index })}>{char}</span>
          ))}
        </span>
        <span className="kbds-name">{name}</span>
      </div>
      <div className="kbds-sub">今天的你最闪耀</div>
    </div>
  );
}

export function BirthdayScene({ name, still }: { name: string; still: boolean }): JSX.Element {
  if (still) {
    return (
      <div className="kbds kbds--still">
        <div className="kbds-card">
          <div className="kbds-card-bits" aria-hidden="true">
            {CARD_BITS.map((bit, index) => (
              <i
                key={index}
                className={`kbds-bit kbds-bit--${bit.shape}`}
                style={{ left: `${bit.left}%`, top: `${bit.top}%`, transform: `rotate(${bit.turn}deg)`, ...vars({ '--kbds-color': PARTY_COLORS[index % PARTY_COLORS.length], '--kbds-size': `${8 + (index % 3) * 2}px` }) }}
              />
            ))}
          </div>
          <div className="kbds-stage">
            <Cake />
          </div>
          <Greeting name={name} />
        </div>
      </div>
    );
  }

  return (
    <div className="kbds kbds--live" style={vars({ '--kbds-total': `${BIRTHDAY_SCENE_MS}ms` })}>
      <div className="kbds-sky" aria-hidden="true">
        {STREAMERS.map((streamer) => (
          <div key={`s${streamer.key}`} className="kbds-fall" style={streamer.style}>
            <svg className="kbds-streamer" viewBox="0 0 16 60" focusable="false">
              <path d={STREAMER} fill="none" stroke={streamer.color} strokeWidth="4" strokeLinecap="round" />
              <path d={STREAMER} fill="none" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </div>
        ))}
        {CONFETTI.map((bit) => (
          <div key={bit.key} className={bit.front ? 'kbds-fall kbds-fall--front' : 'kbds-fall'} style={bit.style}>
            <i className={`kbds-bit kbds-bit--${bit.shape}`} />
          </div>
        ))}
      </div>

      <div className="kbds-main">
        <div className="kbds-stage">
          <div className="kbds-halo" aria-hidden="true" />
          <div className="kbds-cake">
            <Cake />
          </div>
          {SPARKLES.map((sparkle, index) => (
            <svg
              key={index}
              className="kbds-sparkle"
              viewBox="0 0 24 24"
              width={sparkle.size}
              height={sparkle.size}
              aria-hidden="true"
              focusable="false"
              style={{ left: `${sparkle.left}%`, top: `${sparkle.top}%`, color: sparkle.color, ...vars({ '--kbds-i': index }) }}
            >
              <path d={SPARKLE} fill="currentColor" />
            </svg>
          ))}
        </div>
        <Greeting name={name} />
      </div>
    </div>
  );
}

/**
 * 名字旁边的小蛋糕标记，24×24 的画板。只有一根蜡烛、一层蛋糕、一圈奶油，色块都够大，14px 也认得出。
 * 给了 title 就当图片念出来，没给就对读屏隐藏。
 */
export function CakeMark({ size = 14, className, title }: { size?: number; className?: string; title?: string }): JSX.Element {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
      style={{ flex: 'none', verticalAlign: '-0.125em' }}
    >
      {title ? <title>{title}</title> : null}
      <path d="M12 0.8C14.2 3.4 14.8 4.7 14.8 6A2.8 2.8 0 0 1 9.2 6C9.2 4.7 9.8 3.4 12 0.8Z" fill="#ffa726" />
      <rect x="10.5" y="7.6" width="3" height="4.6" rx="0.8" fill="#5ec8ff" />
      <path d="M2.5 14a3 3 0 0 1 3-3h13a3 3 0 0 1 3 3v6.5a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2Z" fill={BERRY} />
      <path d="M2.5 14a3 3 0 0 1 3-3h13a3 3 0 0 1 3 3v1.4a2.375 2.375 0 0 1-4.75 0a2.375 2.375 0 0 1-4.75 0a2.375 2.375 0 0 1-4.75 0a2.375 2.375 0 0 1-4.75 0Z" fill={CREAM} />
      <path d="M18 11h0.5a3 3 0 0 1 3 3v6.5a2 2 0 0 1-2 2H18Z" {...SHADE} />
    </svg>
  );
}
