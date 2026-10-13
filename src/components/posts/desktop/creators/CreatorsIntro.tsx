/**
 * 「大佬入住」的片头。
 *
 * 四拍：① 舞台压暗，细线和圆环画出来 → ② 标题逐字升起、光扫过、人数滚到位 → ③ 前三名依次飞入，
 * 第一名压轴落下时有一下冲击 → ④ 标题、人数、三枚头像各自滑到页面上真正的位置，舞台淡出，露出页面。
 *
 * 片头里的标题、人数、头像不是另画的一套：它们从一开始就摆在页面上对应元素的位置上，只是被 transform
 * 挪到了舞台中央并放大。第 ④ 拍把 transform 收回去，它们就正好盖在真元素上，再换成真元素——所以是一镜到底。
 *
 * 编排用 Web Animations API：每一拍是一组 Animation，跳过时全部 cancel 并直接交还页面。
 */
import { type CSSProperties, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CcwCreator } from '@/types/api';
import { resolveThumbnailUrl } from '@/utils/assetUrl';
import { CountUp } from './CountUp';
import { Medal } from './CreatorCard';
import { EASE } from './motion';

export type IntroMode = 'full' | 'short';
export type IntroStatus = 'loading' | 'ready' | 'empty' | 'error';

interface IntroProps {
  mode: IntroMode;
  status: IntroStatus;
  top: CcwCreator[];
  total: number;
  /** 第 ④ 拍开始：页面上其余的东西可以入场了 */
  onLand: () => void;
  /** 片头里的替身即将撤掉：页面上的真元素现在显示出来 */
  onSettle: () => void;
  /** 片头结束。skipped 为 true 表示是被用户打断的：页面应当直接呈现最终状态，不要再补播入场 */
  onDone: (skipped: boolean) => void;
}

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface Placement {
  box: Box;
  /** 把它从页面上的位置挪到舞台上的 transform */
  stage: string;
}

const TITLE = '大佬入住';
const MAX_IMAGE_WAIT = 1400;

function place(target: Element, overlay: DOMRect, x: number, y: number, scale: number): Placement {
  const rect = target.getBoundingClientRect();
  const box = { left: rect.left - overlay.left, top: rect.top - overlay.top, width: rect.width, height: rect.height };
  const dx = x - (box.left + box.width / 2);
  const dy = y - (box.top + box.height / 2);
  return { box, stage: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(${scale.toFixed(3)})` };
}

function boxStyle(placement: Placement): CSSProperties {
  return { ...placement.box, transform: placement.stage, opacity: 0 };
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve())));
}

/** 头像图片先解码好，飞进来的才不会是空框。等不到就算了，不能让片头卡在这里。 */
function preloadAvatars(creators: CcwCreator[]): Promise<unknown> {
  const loads = creators.map((creator) => {
    const url = resolveThumbnailUrl(creator.avatar_url || creator.ccw_avatar_url);
    if (!url) {
      return Promise.resolve();
    }
    const image = new Image();
    image.src = url;
    return image.decode().catch(() => undefined);
  });
  return Promise.race([Promise.all(loads), new Promise((resolve) => window.setTimeout(resolve, MAX_IMAGE_WAIT))]);
}

/** 第一名落下那一刻迸出的一小把火星。画在一张临时画布上，七百毫秒后自己停、自己清。 */
function burstSparks(canvas: HTMLCanvasElement, x: number, y: number, color: string): () => void {
  const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  const context = canvas.getContext('2d');
  if (!context) {
    return () => undefined;
  }
  context.scale(ratio, ratio);
  const sparks = Array.from({ length: 44 }, (_, index) => {
    const angle = (index / 44) * Math.PI * 2 + Math.random() * 0.3;
    const speed = 5 + Math.random() * 10;
    return { x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed * 0.72, length: 6 + Math.random() * 14 };
  });
  const startedAt = performance.now();
  let frame = 0;
  function draw(now: number): void {
    const progress = Math.min(1, (now - startedAt) / 700);
    context?.clearRect(0, 0, width, height);
    if (progress >= 1 || !context) {
      frame = 0;
      return;
    }
    context.lineCap = 'round';
    context.lineWidth = 1.8;
    context.strokeStyle = color;
    context.globalAlpha = (1 - progress) ** 1.5;
    for (const spark of sparks) {
      spark.x += spark.vx;
      spark.y += spark.vy;
      spark.vx *= 0.92;
      spark.vy *= 0.92;
      context.beginPath();
      context.moveTo(spark.x, spark.y);
      context.lineTo(spark.x - spark.vx * (spark.length / 6), spark.y - spark.vy * (spark.length / 6));
      context.stroke();
    }
    frame = window.requestAnimationFrame(draw);
  }
  frame = window.requestAnimationFrame(draw);
  return () => {
    if (frame) {
      window.cancelAnimationFrame(frame);
    }
    context.clearRect(0, 0, width, height);
  };
}

/** 片头盖在页面根节点（它的父元素）上，也在那里面找要落位的目标元素。 */
export function CreatorsIntro({ mode, status, top, total, onLand, onSettle, onDone }: IntroProps): JSX.Element {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [texts, setTexts] = useState<{ title: Placement; eyebrow: Placement; count: Placement | null } | null>(null);
  const [medals, setMedals] = useState<Placement[] | null>(null);
  const [counting, setCounting] = useState(false);
  // 时间线是一个跑到底的异步函数，中途要读最新的属性，所以都放在 ref 里
  const live = useRef({ status, top, onLand, onSettle, onDone });
  live.current = { status, top, onLand, onSettle, onDone };
  const statusWaiters = useRef<Array<() => void>>([]);

  // 标题、英文小字、人数这三样的位置一进来就能量：它们在页面最顶上，数据来不来都不会动
  useLayoutEffect(() => {
    // 页面根节点从自己身上往外找：父组件的 ref 要等子组件的 layout effect 跑完才挂上，这里还拿不到
    const root = overlayRef.current?.parentElement;
    const overlay = overlayRef.current?.getBoundingClientRect();
    const title = root?.querySelector('.kcr-hero .kcr-title');
    const eyebrow = root?.querySelector('.kcr-hero .kcr-eyebrow');
    const count = root?.querySelector('.kcr-hero .kcr-count');
    if (!overlay || !title || !eyebrow) {
      live.current.onDone(true);
      return;
    }
    const titleRect = title.getBoundingClientRect();
    const scale = Math.min(2.3, Math.max(1.15, (overlay.width * 0.46) / titleRect.width));
    const centerY = overlay.height * 0.38;
    const half = (titleRect.height * scale) / 2;
    setTexts({
      title: place(title, overlay, overlay.width / 2, centerY, scale),
      eyebrow: place(eyebrow, overlay, overlay.width / 2, centerY - half - 22, 1.1),
      count: count ? place(count, overlay, overlay.width / 2, centerY + half + 26, 1.15) : null
    });
  }, []);

  useEffect(() => {
    if (status !== 'loading') {
      statusWaiters.current.splice(0).forEach((resolve) => resolve());
    }
    if (status === 'ready') {
      setCounting(true);
    }
  }, [status]);

  useEffect(() => {
    const overlayNode = overlayRef.current;
    const rootNode = overlayNode?.parentElement;
    if (!texts || !overlayNode || !rootNode) {
      return undefined;
    }
    // 下面的时间线是嵌套的异步函数，TS 的空值收窄带不进去，所以另起三个确定非空的名字
    const overlay: HTMLDivElement = overlayNode;
    const root: HTMLElement = rootNode;
    const spots = texts;
    const short = mode === 'short';
    const running: Animation[] = [];
    let stopSparks: (() => void) | null = null;
    let cancelled = false;

    const find = <T extends Element>(selector: string): T | null => overlay.querySelector<T>(selector);
    const findAll = <T extends Element>(selector: string): T[] => Array.from(overlay.querySelectorAll<T>(selector));
    function play(element: Element | null, keyframes: Keyframe[], options: KeyframeAnimationOptions): Animation | null {
      if (!element) {
        return null;
      }
      const animation = element.animate(keyframes, { fill: 'both', easing: EASE.out, ...options });
      running.push(animation);
      return animation;
    }
    const settled = (animations: Array<Animation | null>): Promise<unknown> => Promise.all(animations.filter((item): item is Animation => item !== null).map((item) => item.finished));
    const stageOf = (placement: Placement): string => placement.stage;
    /** 原地等一会儿。用一段空动画来等，这样跳过时它会和别的动画一起被取消 */
    const hold = (duration: number): Promise<unknown> => settled([play(overlay, [{ opacity: 1 }, { opacity: 1 }], { duration })]);

    async function run(): Promise<void> {
      const bg = find('.kcr-intro-bg');
      const lines = findAll<SVGGeometryElement>('.kcr-intro-lines [pathLength]');
      const titleBox = find<HTMLElement>('.kcr-intro-title');
      const eyebrowBox = find<HTMLElement>('.kcr-intro-eyebrow');
      const countBox = find<HTMLElement>('.kcr-intro-count');
      const sweep = find('.kcr-intro-sweep');
      const shine = find('.kcr-intro-shine');

      // ① 定舞台
      play(bg, [{ opacity: 0 }, { opacity: 1 }], { duration: short ? 140 : 220 });
      lines.forEach((line, index) => play(line, [{ strokeDashoffset: 1, opacity: 1 }, { strokeDashoffset: 0, opacity: 1 }], { duration: short ? 240 : 520, delay: short ? 0 : index * 50, easing: EASE.inOut }));
      if (!short) {
        await hold(280);
      }

      // ② 标题登场
      play(titleBox, [{ transform: stageOf(spots.title), opacity: 1 }, { transform: stageOf(spots.title), opacity: 1 }], { duration: 1 });
      const chars = findAll('.kcr-intro-char > i').map((char, index) => play(char, [{ transform: 'translateY(108%) rotate(6deg)' }, { transform: 'translateY(0) rotate(0deg)' }], { duration: short ? 320 : 580, delay: index * (short ? 25 : 65) }));
      play(eyebrowBox, [{ transform: `${stageOf(spots.eyebrow)} translateY(10px)`, opacity: 0 }, { transform: stageOf(spots.eyebrow), opacity: 1 }], { duration: short ? 240 : 460, delay: short ? 40 : 140 });
      if (spots.count) {
        play(countBox, [{ transform: `${stageOf(spots.count)} translateY(-10px)`, opacity: 0 }, { transform: stageOf(spots.count), opacity: 1 }], { duration: short ? 240 : 460, delay: short ? 90 : 300 });
      }
      // 光窗往右滑，窗里的白字同步往左退（两个百分比各按自己的宽度算，位移量相等），所以白字始终叠在标题上
      const sweepFrames = [{ transform: 'translateX(-110%)' }, { transform: 'translateX(300%)' }];
      const shineFrames = [{ transform: 'translateX(37.4%)' }, { transform: 'translateX(-102%)' }];
      const passSweep = (options: KeyframeAnimationOptions): Array<Animation | null> => [play(sweep, sweepFrames, { easing: 'linear', ...options }), play(shine, shineFrames, { easing: 'linear', ...options })];
      passSweep({ duration: short ? 460 : 620, delay: short ? 200 : 430 });
      // 精简版不等标题完全落定，紧接着就上人
      await (short ? hold(200) : settled(chars));

      // 数据或头像还没到：停在标题这一拍，让光一遍遍扫过去，直到等到为止
      let waitingLoop: Array<Animation | null> = [];
      const loopTimer = window.setTimeout(() => {
        waitingLoop = passSweep({ duration: 1500, iterations: Infinity });
      }, 560);
      if (live.current.status === 'loading') {
        await new Promise<void>((resolve) => statusWaiters.current.push(resolve));
      }
      const leaders = live.current.status === 'ready' ? live.current.top.slice(0, 3) : [];
      if (leaders.length > 0) {
        await preloadAvatars(leaders);
      }
      window.clearTimeout(loopTimer);
      waitingLoop.forEach((animation) => animation?.cancel());
      if (cancelled) {
        return;
      }

      // ③ 前三名登场
      let landed: Placement[] = [];
      if (leaders.length > 0) {
        // 领奖台此刻已经渲染在片头底下，量出三枚头像真正的位置
        await nextFrame();
        const frame = overlay.getBoundingClientRect();
        const rowY = frame.height * 0.72;
        const gap = Math.min(200, frame.width * 0.21);
        const seats = [{ x: frame.width / 2, y: rowY - 8, scale: 1.3 }, { x: frame.width / 2 - gap, y: rowY + 8, scale: 1.12 }, { x: frame.width / 2 + gap, y: rowY + 8, scale: 1.12 }];
        landed = leaders.flatMap((_, index) => {
          const target = root.querySelector(`.kcr-podium .kcr-medal[data-rank="${index + 1}"]`);
          return target ? [place(target, frame, seats[index].x, seats[index].y, seats[index].scale)] : [];
        });
        setMedals(landed);
        await nextFrame();
        if (cancelled) {
          return;
        }
        const boxes = findAll<HTMLElement>('.kcr-intro-medal');
        if (short) {
          await settled(boxes.map((box, index) => play(box, [{ transform: `${landed[index].stage} scale(0.7)`, opacity: 0 }, { transform: landed[index].stage, opacity: 1 }], { duration: 260, delay: index * 40, easing: EASE.back })));
        } else {
          // 第二、三名从两侧带着光带滑进来，第一名最后从镜头前砸下来
          const sides = [2, 1].filter((index) => boxes[index]).map((index, turn) => {
            const from = index === 1 ? -1 : 1;
            play(find(`.kcr-intro-streak[data-rank="${index + 1}"]`), [{ transform: `translateX(${from * 46}%) scaleX(0.2)`, opacity: 0 }, { transform: 'translateX(0) scaleX(1)', opacity: 0.9, offset: 0.4 }, { transform: `translateX(${-from * 30}%) scaleX(0.1)`, opacity: 0 }], { duration: 560, delay: turn * 130, easing: EASE.inOut });
            return play(boxes[index], [{ transform: `translateX(${from * 340}px) ${landed[index].stage} scale(0.86)`, opacity: 0 }, { transform: landed[index].stage, opacity: 1 }], { duration: 540, delay: turn * 130, easing: EASE.out });
          });
          const lead = play(boxes[0], [{ transform: `${landed[0].stage} translateY(-36px) scale(2.7)`, opacity: 0 }, { transform: `${landed[0].stage} translateY(-10px) scale(1.5)`, opacity: 1, offset: 0.55 }, { transform: landed[0].stage, opacity: 1 }], { duration: 460, delay: 300, easing: 'cubic-bezier(0.5, 0, 0.9, 0.6)' });
          await settled([lead]);
          // 落地的冲击：一圈光环荡开、画面白一下、舞台抖两下、迸出一把火星
          const shock = find<HTMLElement>('.kcr-intro-shock');
          if (shock) {
            shock.style.left = `${frame.width / 2}px`;
            shock.style.top = `${rowY - 8}px`;
          }
          play(shock, [{ transform: 'translate(-50%, -50%) scale(0.5)', opacity: 0.9 }, { transform: 'translate(-50%, -50%) scale(3.4)', opacity: 0 }], { duration: 760 });
          play(find('.kcr-intro-flash'), [{ opacity: 0 }, { opacity: 0.2, offset: 0.2 }, { opacity: 0 }], { duration: 420, easing: 'linear' });
          play(find('.kcr-intro-stage'), [{ transform: 'translate(0, 0)' }, { transform: 'translate(0, 5px)' }, { transform: 'translate(-3px, -3px)' }, { transform: 'translate(2px, 2px)' }, { transform: 'translate(0, 0)' }], { duration: 300, easing: 'linear', fill: 'none' });
          play(boxes[0], [{ transform: `${landed[0].stage} scale(0.93)` }, { transform: landed[0].stage }], { duration: 420, easing: EASE.back });
          const canvas = find<HTMLCanvasElement>('.kcr-intro-sparks');
          if (canvas) {
            stopSparks = burstSparks(canvas, frame.width / 2, rowY - 8, getComputedStyle(overlay).getPropertyValue('--kcr-gold-edge').trim() || '#ffd978');
          }
          await Promise.all([settled(sides), hold(260)]);
        }
      }
      if (cancelled) {
        return;
      }

      // ④ 落到页面上
      live.current.onLand();
      const landing = { duration: short ? 420 : 600, easing: EASE.inOut };
      const moves = [
        play(titleBox, [{ transform: stageOf(spots.title) }, { transform: 'none' }], landing),
        play(eyebrowBox, [{ transform: stageOf(spots.eyebrow), opacity: 1 }, { transform: 'none', opacity: 1 }], landing),
        spots.count ? play(countBox, [{ transform: stageOf(spots.count), opacity: 1 }, { transform: 'none', opacity: 1 }], landing) : null,
        ...findAll<HTMLElement>('.kcr-intro-medal').map((box, index) => play(box, [{ transform: landed[index].stage, opacity: 1 }, { transform: 'none', opacity: 1 }], { ...landing, delay: 40 + index * 45 }))
      ];
      play(bg, [{ opacity: 1 }, { opacity: 0 }], { duration: landing.duration * 0.8, delay: landing.duration * 0.15, easing: 'ease-in-out' });
      play(find('.kcr-intro-lines'), [{ opacity: 1 }, { opacity: 0 }], { duration: 320 });
      await settled(moves);
      if (cancelled) {
        return;
      }
      // 替身和真元素叠在同一个位置上交接：真的淡入，替身淡出
      live.current.onSettle();
      await settled([play(find('.kcr-intro-ghosts'), [{ opacity: 1 }, { opacity: 0 }], { duration: 180, easing: 'linear' })]);
      if (!cancelled) {
        cancelled = true;
        live.current.onDone(false);
      }
    }

    void run().catch(() => undefined);

    // 任何点击、按键、滚轮都直接跳到片尾；不拦事件，这一下照常落到页面上
    function skip(): void {
      if (cancelled) {
        return;
      }
      cancelled = true;
      statusWaiters.current.splice(0).forEach((resolve) => resolve());
      live.current.onDone(true);
    }
    const events: Array<keyof HTMLElementEventMap> = ['pointerdown', 'wheel', 'touchstart'];
    events.forEach((name) => root.addEventListener(name, skip, { capture: true, passive: true }));
    window.addEventListener('keydown', skip, true);
    window.addEventListener('resize', skip);
    return () => {
      cancelled = true;
      events.forEach((name) => root.removeEventListener(name, skip, true));
      window.removeEventListener('keydown', skip, true);
      window.removeEventListener('resize', skip);
      running.forEach((animation) => animation.cancel());
      stopSparks?.();
    };
    // 时间线只在量好位置后启动一次；其余属性通过 live 读最新值
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texts]);

  return (
    <div ref={overlayRef} className="kcr-intro" aria-hidden="true">
      <div className="kcr-intro-stage">
        <div className="kcr-intro-bg" />
        <svg className="kcr-intro-lines">
          <line pathLength={1} x1="50%" y1="0" x2="50%" y2="100%" />
          <line pathLength={1} x1="0" y1="38%" x2="100%" y2="38%" />
          <circle pathLength={1} cx="50%" cy="38%" r="168" />
          <circle pathLength={1} cx="50%" cy="38%" r="252" />
          <polyline pathLength={1} points="28,64 28,28 64,28" />
          <polyline pathLength={1} className="is-br" points="-28,-64 -28,-28 -64,-28" />
        </svg>
        <div className="kcr-intro-flash" />
        <div className="kcr-intro-shock" />
        <canvas className="kcr-intro-sparks" />
        <div className="kcr-intro-ghosts">
          {texts ? (
            <>
              <div className="kcr-intro-box kcr-intro-eyebrow" style={boxStyle(texts.eyebrow)}><p className="kcr-eyebrow">HALL OF FAME</p></div>
              <div className="kcr-intro-box kcr-intro-title" style={boxStyle(texts.title)}>
                <h1 className="kcr-title">{Array.from(TITLE).map((char, index) => <span key={index} className="kcr-intro-char"><i>{char}</i></span>)}</h1>
                <span className="kcr-intro-sweep"><span className="kcr-title kcr-intro-shine">{TITLE}</span></span>
              </div>
              {texts.count ? <div className="kcr-intro-box kcr-intro-count" style={boxStyle(texts.count)}><p className="kcr-count">{counting ? <><CountUp value={total} run /> 位创作者已入住</> : '名单清点中…'}</p></div> : null}
            </>
          ) : null}
          {medals?.map((placement, index) => (
            <div key={top[index]?.id ?? index} className="kcr-intro-box kcr-intro-medal" style={boxStyle(placement)}>
              {index > 0 ? <span className="kcr-intro-streak" data-rank={index + 1} /> : null}
              {top[index] ? <Medal creator={top[index]} rank={index + 1} /> : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
