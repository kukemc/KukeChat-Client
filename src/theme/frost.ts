import { readWallpaperBlob } from './wallpaperStore';

/**
 * 预模糊的背景图：毛玻璃面透出来的那一层。
 *
 * 背景图是静态的，所以「模糊后的背景」可以提前算好：把图缩小，在内存里做一次高斯模糊，存成一张小图。
 * 面用它当背景并对齐到背景图的坐标上（见 ThemeEffects），看起来和 backdrop-filter 一样，
 * 但之后的每一帧都只是贴一张图，没有实时模糊。
 *
 * 只在换图、换模糊强度或饱和度时算一次，结果按参数缓存。frostStats.generated 记了总共算过几次，方便自查。
 */

export interface FrostOptions {
  /** 模糊半径（高斯的 σ），按图片显示出来的像素算。 */
  radius: number;
  /** 饱和度，百分比。烘进图里：面的背景没法再单独套滤镜。 */
  saturation: number;
  /** 图片是平铺的：模糊时左右、上下首尾相接，铺开后没有接缝。 */
  wrap: boolean;
  /** 显示时一个原图像素占多少屏幕像素，用来把 radius 换算到原图上。 */
  displayScale: number;
}

export interface FrostImage {
  url: string;
}

export const frostStats = { generated: 0 };

const CACHE_LIMIT = 6;
const cache = new Map<string, { promise: Promise<FrostImage | null>; url: string | null }>();

/** 三次方框模糊逼近高斯：给定 σ，返回三次各自的半径。 */
function boxRadii(sigma: number): number[] {
  const ideal = Math.sqrt((12 * sigma * sigma) / 3 + 1);
  let lower = Math.floor(ideal);
  if (lower % 2 === 0) {
    lower -= 1;
  }
  lower = Math.max(1, lower);
  const upper = lower + 2;
  const switchAt = Math.round((12 * sigma * sigma - 3 * lower * lower - 12 * lower - 9) / (-4 * lower - 4));
  return [0, 1, 2].map((index) => ((index < switchAt ? lower : upper) - 1) / 2);
}

/** 沿一个方向做一次方框模糊。stride 是相邻采样点在数组里的间距（横向 4，纵向 4×宽）。 */
function boxPass(source: Uint8ClampedArray, target: Uint8ClampedArray, lines: number, length: number, lineStride: number, stride: number, radius: number, wrap: boolean): void {
  const size = radius * 2 + 1;
  const at = (position: number): number => (wrap ? ((position % length) + length) % length : Math.min(length - 1, Math.max(0, position)));
  for (let line = 0; line < lines; line += 1) {
    const start = line * lineStride;
    for (let channel = 0; channel < 4; channel += 1) {
      let sum = 0;
      for (let offset = -radius; offset <= radius; offset += 1) {
        sum += source[start + at(offset) * stride + channel];
      }
      for (let position = 0; position < length; position += 1) {
        target[start + position * stride + channel] = sum / size;
        sum += source[start + at(position + radius + 1) * stride + channel] - source[start + at(position - radius) * stride + channel];
      }
    }
  }
}

/** 原地模糊。 */
function blur(data: Uint8ClampedArray, width: number, height: number, sigma: number, wrap: boolean): void {
  const spare = new Uint8ClampedArray(data.length);
  for (const radius of boxRadii(sigma)) {
    if (radius < 1) {
      continue;
    }
    // 横向写进 spare，纵向再写回来：每一轮结束结果都在 data 里
    boxPass(data, spare, height, width, width * 4, 4, Math.min(radius, width - 1), wrap);
    boxPass(spare, data, width, height, 4, width * 4, Math.min(radius, height - 1), wrap);
  }
}

function saturate(data: Uint8ClampedArray, amount: number): void {
  for (let index = 0; index < data.length; index += 4) {
    const luma = 0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2];
    data[index] = luma + (data[index] - luma) * amount;
    data[index + 1] = luma + (data[index + 1] - luma) * amount;
    data[index + 2] = luma + (data[index + 2] - luma) * amount;
  }
}

async function generate(blob: Blob, options: FrostOptions): Promise<string | null> {
  const bitmap = await createImageBitmap(blob);
  try {
    const long = Math.max(bitmap.width, bitmap.height);
    const sigmaSource = options.radius / Math.max(options.displayScale, 0.01);
    // 模糊过的图用不着分辨率：缩到 σ 只剩 3 个像素左右，既省计算又省内存。图本来就小、或模糊很轻时不放大
    const scale = Math.min(1, Math.max(3 / Math.max(sigmaSource, 0.01), 96 / long), 1024 / long);
    const width = Math.max(2, Math.round(bitmap.width * scale));
    const height = Math.max(2, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      return null;
    }
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, width, height);
    const image = context.getImageData(0, 0, width, height);
    if (options.saturation !== 100) {
      saturate(image.data, options.saturation / 100);
    }
    const sigma = sigmaSource * scale;
    if (sigma >= 0.5) {
      blur(image.data, width, height, sigma, options.wrap);
    }
    context.putImageData(image, 0, 0);
    const output = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.92));
    frostStats.generated += 1;
    return output ? URL.createObjectURL(output) : null;
  } finally {
    bitmap.close();
  }
}

/**
 * 取某张图库图片的模糊版。同样的参数只算一次；缓存满了丢掉最早的，并释放它的 object URL。
 * 算不出来（图片读不到、环境不支持 canvas）时得到 null，调用方按「没有毛玻璃」处理。
 */
export function frostImage(wallpaperId: string, options: FrostOptions): Promise<FrostImage | null> {
  const key = `${wallpaperId}|${options.radius}|${options.saturation}|${options.wrap ? 1 : 0}|${options.displayScale.toFixed(4)}`;
  const hit = cache.get(key);
  if (hit) {
    // 挪到最后，表示刚用过
    cache.delete(key);
    cache.set(key, hit);
    return hit.promise;
  }
  const entry: { promise: Promise<FrostImage | null>; url: string | null } = { promise: Promise.resolve(null), url: null };
  entry.promise = readWallpaperBlob(wallpaperId)
    .then((blob) => (blob ? generate(blob, options) : null))
    .then((url) => {
      entry.url = url;
      // 生成期间已经被挤出缓存的，没人会再用到，直接释放
      if (url && cache.get(key) !== entry) {
        URL.revokeObjectURL(url);
        return null;
      }
      return url ? { url } : null;
    })
    .catch(() => null);
  cache.set(key, entry);
  while (cache.size > CACHE_LIMIT) {
    const [oldestKey, oldest] = cache.entries().next().value as [string, typeof entry];
    cache.delete(oldestKey);
    if (oldest.url) {
      URL.revokeObjectURL(oldest.url);
    }
  }
  return entry.promise;
}
