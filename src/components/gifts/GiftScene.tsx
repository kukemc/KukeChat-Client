import { useId, type CSSProperties } from 'react';
import { GiftGlyph } from './GiftGlyph';

/**
 * 送礼物时放的一段动画。只管画，不碰任何 store，也不用定时器：全是 CSS 动画（样式在 styles/gift-effects.css），
 * 放完自己淡出。排队、点一下跳过、三档的压暗背景、「减少动态效果」时干脆不渲染，都由宿主负责；
 * 宿主给一个定了位的容器，这里铺满它（absolute + inset 0，不接点击）。
 *
 *   二档  在聊天区里放：礼物从侧边抛进来，落地弹一下，溅出一圈彩屑，再飘上去淡掉。送了多个就错开抛几个（最多 5 个）。
 *   三档  全屏：火箭和城堡各有专门的一幕（升空 / 拔地而起加烟花），其余的礼物共用一幕（放光、撒彩屑、礼物蹦到正中）。
 *
 * 只动 transform 和 opacity。粒子的角度、远近都由序号算出来（noise），同样的参数每次渲染出来一样，不用 Math.random。
 * 整幕的时长通过 --kgfx-ms 交给 CSS，里面各段的时间都按它的比例排，所以改 GIFT_SCENE_MS 不用动样式。
 */

/** 每一档放多久（毫秒）；宿主到点卸载 */
export const GIFT_SCENE_MS: Record<2 | 3, number> = { 2: 2200, 3: 2800 };

/** 二档里最多同时抛几个 */
const MAX_COPIES = 5;

type Vars = CSSProperties & { [name: `--kgfx-${string}`]: string | number };

const round = (value: number): number => Math.round(value * 100) / 100;

/** 由序号得到的 0 到 1 之间的固定小数，代替随机数 */
function noise(seed: number): number {
  const value = Math.sin(seed * 12.9898 + 4.1414) * 43758.5453;
  return value - Math.floor(value);
}

const CONFETTI = ['#ffcb3d', '#ff8fb3', '#45b7ff', '#5ccb7f', '#a97bff', '#ff9a2e'] as const;
const SPARKS = ['#ffe487', '#fff4c9', '#ffcb3d', '#ff8fb3'] as const;

type BitShape = 'dot' | 'chip' | 'star' | 'ray';

/** 从一点炸开的一圈粒子：每个粒子自己的方向、远近、转多少，都写在它的变量里，动画是同一套关键帧 */
function bits(count: number, seed: number, shapes: readonly BitShape[], colours: readonly string[], spin: boolean): JSX.Element[] {
  return Array.from({ length: count }, (_, index) => {
    const style: Vars = {
      '--kgfx-a': `${Math.round((index + noise(seed + index * 3.1) * 0.7) * (360 / count))}deg`,
      '--kgfx-d': round(0.5 + noise(seed + index * 7.7) * 0.5),
      '--kgfx-spin': spin ? `${Math.round((noise(seed + index * 1.3) - 0.5) * 900)}deg` : '0deg',
      '--kgfx-i': index % 4,
      '--kgfx-c': colours[index % colours.length]
    };
    return <i key={index} className={`kgfx-bit kgfx-bit-${shapes[index % shapes.length]}`} style={style} />;
  });
}

/** 礼物周围一闪一闪的小星：位置是相对礼物那个方框的百分比 */
const TWINKLES: ReadonlyArray<readonly [number, number]> = [[-20, -6], [110, 6], [-12, 72], [114, 64], [16, -22], [86, -18]];

function Twinkles(): JSX.Element {
  return (
    <>
      {TWINKLES.map(([x, y], index) => (
        <i key={index} className="kgfx-twinkle" style={{ '--kgfx-tx': `${x}%`, '--kgfx-ty': `${y}%`, '--kgfx-i': index } as Vars} />
      ))}
    </>
  );
}

function Caption({ icon, name, count, fromName, toName }: { icon: string; name: string; count: number; fromName: string; toName: string }): JSX.Element {
  return (
    <div className="kgfx-caption">
      <div className="kgfx-chip">
        <GiftGlyph icon={icon} size={20} className="kgfx-chip-glyph" />
        <b className="kgfx-who">{fromName}</b>
        <span className="kgfx-verb">送给</span>
        <b className="kgfx-who">{toName}</b>
        <span className="kgfx-what">{name}</span>
        {count > 1 && <em className="kgfx-count">×{count}</em>}
      </div>
    </div>
  );
}

/** 二档：礼物从左右两边轮流抛进来，落在中间排成一排 */
function TossScene({ icon, count }: { icon: string; count: number }): JSX.Element {
  const copies = Math.min(count, MAX_COPIES);
  const step = copies > 3 ? 13 : 17;
  return (
    <>
      <div className="kgfx-burst kgfx-toss-burst">{bits(12, 2, ['star', 'chip', 'dot'], CONFETTI, true)}</div>
      {Array.from({ length: copies }, (_, index) => {
        const slot = index - (copies - 1) / 2;
        const style: Vars = {
          '--kgfx-i': index,
          '--kgfx-x': `${round(slot * step)}%`,
          '--kgfx-from': `${index % 2 === 0 ? -46 : 46}%`,
          '--kgfx-tilt': `${round(slot * 5 + (index % 2 === 0 ? -3 : 3))}deg`
        };
        return (
          <div key={index} className="kgfx-toss" style={style}>
            <div className="kgfx-toss-hop">
              <div className="kgfx-toss-item">
                <GiftGlyph icon={icon} size={96} />
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}

/** 三档通用的放射光：十二道粗细相间的光芒，越往外越淡。渐变要 id，用 useId 保证一页里不重名 */
function Rays(): JSX.Element {
  const id = `kgfx-rays-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <svg className="kgfx-rays" viewBox="-50 -50 100 100" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={id} gradientUnits="userSpaceOnUse" cx="0" cy="0" r="50">
          <stop offset="0.1" stopColor="#ffe487" stopOpacity="0.9" />
          <stop offset="0.45" stopColor="#ffcb3d" stopOpacity="0.36" />
          <stop offset="0.8" stopColor="#ffcb3d" stopOpacity="0.08" />
          <stop offset="1" stopColor="#ffcb3d" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g fill={`url(#${id})`}>
        {Array.from({ length: 12 }, (_, index) => {
          const half = index % 2 === 0 ? 5.4 : 2.8;
          return <polygon key={index} points={`0,0 ${-half},-50 ${half},-50`} transform={`rotate(${index * 30})`} />;
        })}
      </g>
    </svg>
  );
}

/** 三档通用：光芒转起来，礼物蹦到正中，四周撒彩屑 */
function GrandScene({ icon, count }: { icon: string; count: number }): JSX.Element {
  return (
    <>
      <div className="kgfx-halo" />
      <Rays />
      <div className="kgfx-burst kgfx-grand-burst">{bits(30, 5, ['chip', 'dot', 'chip', 'star'], CONFETTI, true)}</div>
      <div className="kgfx-orbit">
        <Twinkles />
      </div>
      <div className="kgfx-hero">
        <GiftGlyph icon={icon} size={200} />
        {count > 1 && <span className="kgfx-times">×{count}</span>}
      </div>
    </>
  );
}

/** 火箭那一幕里往下划过的星：横向位置、快慢、亮度都由序号定 */
const STREAKS = Array.from({ length: 14 }, (_, index): Vars => ({
  left: `${round(4 + index * 6.7 + noise(index + 11) * 4)}%`,
  '--kgfx-speed': `${Math.round(520 + noise(index + 23) * 260)}ms`,
  '--kgfx-wait': `${Math.round(noise(index + 37) * 400)}ms`,
  '--kgfx-o': round(0.35 + noise(index + 41) * 0.55)
}));

/** 三档·火箭：从屏幕下面升上来，悬着抖一会儿，尾焰变大，冲出屏幕顶 */
function RocketScene(): JSX.Element {
  return (
    <>
      <div className="kgfx-streaks">
        {STREAKS.map((style, index) => (
          <i key={index} className="kgfx-streak" style={style} />
        ))}
      </div>
      <div className="kgfx-ring" />
      <div className="kgfx-rocket-lift">
        <div className="kgfx-rocket-shake">
          <div className="kgfx-rocket">
            {Array.from({ length: 6 }, (_, index) => (
              <i key={index} className="kgfx-puff" style={{ '--kgfx-i': index, '--kgfx-px': `${Math.round((noise(index + 3) - 0.5) * 180)}%` } as Vars} />
            ))}
            <div className="kgfx-flame">
              <svg className="kgfx-flame-flicker" viewBox="0 0 40 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
                <path d="M3 0H37C40 32 31 70 20 100C9 70 0 32 3 0Z" fill="#ff8a2e" fillOpacity="0.92" />
                <path d="M9 0H31C33 26 27 54 20 76C13 54 7 26 9 0Z" fill="#ffc94a" />
                <path d="M14 0H26C27 18 24 36 20 50C16 36 13 18 14 0Z" fill="#fff1b0" />
              </svg>
            </div>
            <GiftGlyph icon="rocket" size={200} />
          </div>
        </div>
      </div>
    </>
  );
}

/** 城堡背后的四朵烟花：位置（占屏幕的百分比）、几时放（占整幕的比例）、颜色 */
const FIREWORKS: ReadonlyArray<{ x: number; y: number; at: number; colours: readonly string[] }> = [
  { x: 22, y: 26, at: 0.3, colours: ['#ffcb3d', '#ffe487'] },
  { x: 78, y: 21, at: 0.41, colours: ['#ff8fb3', '#ffd0e0'] },
  { x: 50, y: 13, at: 0.52, colours: ['#45b7ff', '#b5e3ff'] },
  { x: 71, y: 40, at: 0.62, colours: ['#a97bff', '#ffe487'] }
];

/** 三档·城堡：从地里升起来（外面套一个裁剪框，只露出地面以上的部分），脚下扬尘，背后放烟花 */
function CastleScene({ count }: { count: number }): JSX.Element {
  return (
    <>
      {FIREWORKS.map((firework, index) => (
        <div key={index} className="kgfx-burst kgfx-firework" style={{ left: `${firework.x}%`, top: `${firework.y}%`, '--kgfx-at': `calc(var(--kgfx-ms) * ${firework.at})` } as Vars}>
          <i className="kgfx-firework-flash" style={{ '--kgfx-c': firework.colours[1] } as Vars} />
          {bits(12, 50 + index * 9, ['ray'], firework.colours, false)}
        </div>
      ))}
      <div className="kgfx-orbit">
        <Twinkles />
      </div>
      <div className="kgfx-castle">
        <div className="kgfx-ground" />
        <div className="kgfx-castle-mask">
          <div className="kgfx-castle-rise">
            <GiftGlyph icon="castle" size={240} />
          </div>
        </div>
        {Array.from({ length: 6 }, (_, index) => (
          <i key={index} className="kgfx-puff kgfx-dust" style={{ '--kgfx-i': index, '--kgfx-px': `${(index % 2 === 0 ? -1 : 1) * (120 + Math.round(noise(index + 5) * 140))}%` } as Vars} />
        ))}
        {count > 1 && <span className="kgfx-times">×{count}</span>}
      </div>
    </>
  );
}

export function GiftScene({ tier, icon, name, count, fromName, toName }: { tier: 2 | 3; icon: string; name: string; count: number; fromName: string; toName: string }): JSX.Element {
  const total = Number.isFinite(count) ? Math.max(1, Math.floor(count)) : 1;
  const kind = tier === 2 ? 'toss' : icon === 'rocket' ? 'rocket' : icon === 'castle' ? 'castle' : 'grand';
  return (
    // 这一幕纯属装饰：谁送了什么，聊天记录里另有一条消息，读屏不用再念一遍
    <div className={`kgfx-scene kgfx-t${tier} kgfx-is-${kind}`} style={{ '--kgfx-ms': `${GIFT_SCENE_MS[tier]}ms` } as Vars} aria-hidden="true">
      {kind === 'toss' && <TossScene icon={icon} count={total} />}
      {kind === 'grand' && <GrandScene icon={icon} count={total} />}
      {kind === 'rocket' && <RocketScene />}
      {kind === 'castle' && <CastleScene count={total} />}
      <Caption icon={icon} name={name} count={total} fromName={fromName} toName={toName} />
    </div>
  );
}
