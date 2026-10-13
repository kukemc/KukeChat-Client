/**
 * 从题图里取一个主色，给卡片上一层环境光，也当图片没加载出来时的占位底色。
 *
 * 做得很轻：把图缩到 6×6 的画布上取平均，结果按地址缓存。跨域的图读不出像素——
 * 第一次失败就记住那个来源，以后不再为它发请求，直接退回强调色。
 */
import { useEffect, useState } from 'react';

const SAMPLE = 6;
const tones = new Map<string, string | null>();
const pending = new Map<string, Promise<string | null>>();
const blockedOrigins = new Set<string>();

function originOf(url: string): string {
  try {
    return new URL(url, window.location.href).origin;
  } catch {
    return '';
  }
}

function whenIdle(task: () => void): void {
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(task, { timeout: 600 });
  } else {
    window.setTimeout(task, 0);
  }
}

function averageColor(image: HTMLImageElement): string | null {
  const canvas = document.createElement('canvas');
  canvas.width = SAMPLE;
  canvas.height = SAMPLE;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    return null;
  }
  context.drawImage(image, 0, 0, SAMPLE, SAMPLE);
  const { data } = context.getImageData(0, 0, SAMPLE, SAMPLE);
  let red = 0;
  let green = 0;
  let blue = 0;
  let weight = 0;
  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3] / 255;
    red += data[index] * alpha;
    green += data[index + 1] * alpha;
    blue += data[index + 2] * alpha;
    weight += alpha;
  }
  if (weight < 1) {
    return null;
  }
  return `rgb(${Math.round(red / weight)} ${Math.round(green / weight)} ${Math.round(blue / weight)})`;
}

function readTone(url: string): Promise<string | null> {
  const known = pending.get(url);
  if (known) {
    return known;
  }
  const origin = originOf(url);
  const task = new Promise<string | null>((resolve) => {
    if (blockedOrigins.has(origin)) {
      resolve(null);
      return;
    }
    const image = new Image();
    // blob: 和同源的图不需要；跨域的必须带上，否则画布会被污染
    if (!url.startsWith('blob:') && origin !== window.location.origin) {
      image.crossOrigin = 'anonymous';
    }
    image.decoding = 'async';
    image.onload = () => whenIdle(() => {
      try {
        resolve(averageColor(image));
      } catch {
        blockedOrigins.add(origin);
        resolve(null);
      }
    });
    image.onerror = () => {
      // 带着 CORS 请求失败：多半是对方没给跨域头。这张图本身坏了也会走到这里，代价只是这个来源不再取色
      if (image.crossOrigin) {
        blockedOrigins.add(origin);
      }
      resolve(null);
    };
    image.src = url;
  }).then((tone) => {
    tones.set(url, tone);
    pending.delete(url);
    return tone;
  });
  pending.set(url, task);
  return task;
}

/** 题图的主色。active 为 false 时不去取（卡片还没进视口）；取不到返回 null。 */
export function useCoverTone(url: string | undefined, active: boolean): string | null {
  const [tone, setTone] = useState<string | null>(() => (url ? tones.get(url) ?? null : null));
  useEffect(() => {
    if (!url || !active) {
      return undefined;
    }
    if (tones.has(url)) {
      setTone(tones.get(url) ?? null);
      return undefined;
    }
    let alive = true;
    void readTone(url).then((value) => {
      if (alive) {
        setTone(value);
      }
    });
    return () => {
      alive = false;
    };
  }, [active, url]);
  return tone;
}
