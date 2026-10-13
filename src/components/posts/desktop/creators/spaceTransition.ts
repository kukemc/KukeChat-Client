/**
 * 从名单里的一张卡片进到 Ta 的主页、以及原路返回时的衔接转场。
 *
 * 调用时两页都在 DOM 里（主页以 .is-over 叠在名单页上面）。名单页和主页交叉淡入淡出；卡片的题图和头像
 * 各出一个替身，题图飞到主页封面的位置、头像飞到主页头像的位置，到位后替身淡掉，露出主页上真的那一份。
 * 返回时反着来。全程只有 transform 和 opacity。
 */
import { EASE } from './motion';

const DURATION = 520;
const STEPS = 14;

function easeInOut(value: number): number {
  return value < 0.5 ? 8 * value ** 4 : 1 - (-2 * value + 2) ** 4 / 2;
}

function intersects(rect: DOMRect, frame: DOMRect): boolean {
  return rect.width > 0 && rect.height > 0 && rect.bottom > frame.top && rect.top < frame.bottom && rect.right > frame.left && rect.left < frame.right;
}

/**
 * 题图的替身：一个裁切框里装着图。框从 from 变到 to 时宽高比会变，直接缩放会把图拉变形，
 * 所以给里面的图同时加一份反向的缩放——逐帧算好关键帧，两者始终互相抵消，图只是等比放大并被裁切。
 */
function flyCover(layer: HTMLElement, frame: DOMRect, from: DOMRect, to: DOMRect, image: string | null, color: string): Animation[] {
  const box = document.createElement('div');
  box.className = 'kcr-fly-cover';
  box.style.cssText = `left:${from.left - frame.left}px;top:${from.top - frame.top}px;width:${from.width}px;height:${from.height}px;background:${color}`;
  const inner = document.createElement('div');
  if (image) {
    inner.style.backgroundImage = `url("${image}")`;
  }
  box.appendChild(inner);
  layer.appendChild(box);
  const boxFrames: Keyframe[] = [];
  const innerFrames: Keyframe[] = [];
  for (let step = 0; step <= STEPS; step += 1) {
    const progress = easeInOut(step / STEPS);
    const scaleX = 1 + (to.width / from.width - 1) * progress;
    const scaleY = 1 + (to.height / from.height - 1) * progress;
    const cover = Math.max(scaleX, scaleY);
    boxFrames.push({ transform: `translate(${((to.left - from.left) * progress).toFixed(2)}px, ${((to.top - from.top) * progress).toFixed(2)}px) scale(${scaleX.toFixed(4)}, ${scaleY.toFixed(4)})` });
    innerFrames.push({ transform: `scale(${(cover / scaleX).toFixed(4)}, ${(cover / scaleY).toFixed(4)})` });
  }
  const options: KeyframeAnimationOptions = { duration: DURATION, easing: 'linear', fill: 'both' };
  return [box.animate(boxFrames, options), inner.animate(innerFrames, options)];
}

/** 头像的替身：两头都是圆的，等比缩放就行。 */
function flyAvatar(layer: HTMLElement, frame: DOMRect, source: Element, from: DOMRect, to: DOMRect): Animation[] {
  const box = document.createElement('div');
  box.className = 'kcr-fly-avatar';
  box.style.cssText = `left:${from.left - frame.left}px;top:${from.top - frame.top}px;width:${from.width}px;height:${from.height}px`;
  const copy = source.cloneNode(true) as HTMLElement;
  // 原件此刻已经被藏起来了，替身别把这条样式也抄过来
  copy.style.removeProperty('visibility');
  box.appendChild(copy);
  layer.appendChild(box);
  return [box.animate([{ transform: 'translate(0, 0) scale(1)' }, { transform: `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${to.width / from.width})` }], { duration: DURATION, easing: EASE.inOut, fill: 'both' })];
}

/**
 * 播放转场。返回的函数用来收尾（撤掉替身、还原被临时改动的样式）——
 * 调用方应当先把页面切到转场之后的状态，再调它，中间才不会闪一帧。
 */
export async function playSpaceTransition(root: HTMLElement, card: HTMLElement | null, direction: 'open' | 'close'): Promise<() => void> {
  const listPage = root.querySelector<HTMLElement>('.kcr');
  const spacePage = root.querySelector<HTMLElement>('.kpo-page.is-over');
  const frame = root.getBoundingClientRect();
  const opening = direction === 'open';
  const animations: Animation[] = [];
  const hidden: HTMLElement[] = [];
  const layer = document.createElement('div');
  layer.className = 'kcr-fly';
  root.appendChild(layer);

  const heroCover = spacePage?.querySelector<HTMLElement>('.kpo-hero-cover') ?? null;
  const heroAvatar = spacePage?.querySelector<HTMLElement>('.kpo-hero-avatar') ?? null;
  const cardCover = card?.querySelector<HTMLElement>('[data-shared="cover"]') ?? null;
  const cardAvatar = card?.querySelector<HTMLElement>('[data-shared="avatar"]') ?? null;

  function pair(cardPart: HTMLElement | null, heroPart: HTMLElement | null): { from: DOMRect; to: DOMRect } | null {
    if (!cardPart || !heroPart) {
      return null;
    }
    const cardRect = cardPart.getBoundingClientRect();
    const heroRect = heroPart.getBoundingClientRect();
    // 任何一头不在画面里（主页被滚走了、卡片不在视口）就不飞，只做两页的淡入淡出
    if (!intersects(cardRect, frame) || !intersects(heroRect, frame)) {
      return null;
    }
    // 起点那一份先藏起来，免得和替身叠出两个
    const source = opening ? cardPart : heroPart;
    source.style.visibility = 'hidden';
    hidden.push(source);
    return opening ? { from: cardRect, to: heroRect } : { from: heroRect, to: cardRect };
  }

  const coverPath = pair(cardCover, heroCover);
  if (coverPath && cardCover) {
    const image = cardCover.querySelector('img')?.currentSrc || null;
    animations.push(...flyCover(layer, frame, coverPath.from, coverPath.to, image, getComputedStyle(cardCover).backgroundColor));
  }
  const avatarPath = pair(cardAvatar, heroAvatar);
  if (avatarPath && cardAvatar) {
    animations.push(...flyAvatar(layer, frame, cardAvatar, avatarPath.from, avatarPath.to));
  }

  if (listPage) {
    animations.push(listPage.animate(opening ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 0 }, { opacity: 1 }], { duration: opening ? 300 : 420, easing: 'ease-out', fill: 'both' }));
  }
  if (spacePage) {
    animations.push(spacePage.animate(
      opening ? [{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'translateY(0)' }] : [{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(10px)' }],
      { duration: opening ? 460 : 260, delay: opening ? 60 : 0, easing: opening ? EASE.out : 'ease-in', fill: 'both' }
    ));
  }

  await Promise.all(animations.map((animation) => animation.finished)).catch(() => undefined);
  // 替身已经压在真元素上了：淡掉它，把真的露出来
  await layer.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, easing: 'linear', fill: 'both' }).finished.catch(() => undefined);

  return () => {
    animations.forEach((animation) => animation.cancel());
    hidden.forEach((element) => element.style.removeProperty('visibility'));
    layer.remove();
  };
}
