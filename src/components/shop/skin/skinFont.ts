import { isRecord } from '@/api/normalizers';

/**
 * 气泡皮肤的专属字体（docs/shop.md 2.6）。
 *
 * 服务端把字体放在样式旁边（cosmetics.bubble.font、商品的 font），不放进 style：老客户端遇到不认识的字段会把整件皮肤作废。
 * 形状是 { key, name, woff2, ttf }，电脑端用 woff2。地址来自网络，这里只认 https、没有引号括号反斜杠的；key 只能是小写字母数字。
 *
 * 加载：第一次有气泡要用某款字体时才去下载（fetch 成 ArrayBuffer 再交给 FontFace —— 走 connect-src，不受页面 font-src 的限制，
 * 扩展跑在别人的页面里也能用），下载到的文件按地址放进 Cache Storage，下次打开直接读本地。服务端换字体文件会换文件名，所以不用管过期。
 * 下载中、下载失败都用原来的字体：字体族名后面跟着应用自己的字体栈，缺的字也会落到那里。
 */

export interface SkinFont {
  key: string;
  name: string;
  /** 已校验的 https 地址 */
  url: string;
}

const KEY = /^[a-z0-9_-]{1,32}$/;
const SAFE_URL = /^https:\/\/[^\s"'()\\<>]{1,500}$/;
const CACHE_NAME = 'kukechat-skin-fonts-v1';
/** 应用正文的字体栈（同 tailwind.css 里桌面端的写法），专属字体缺字、还没加载完时落到这里 */
const FALLBACK = 'Inter, "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';

/** 从服务端给的 font 对象里读出能用的那部分；不合法返回 null（按没有字体处理，皮肤照常画）。 */
export function readSkinFont(value: unknown): SkinFont | null {
  if (!isRecord(value) || typeof value.key !== 'string' || !KEY.test(value.key) || typeof value.woff2 !== 'string' || !SAFE_URL.test(value.woff2)) {
    return null;
  }
  return { key: value.key, name: typeof value.name === 'string' && value.name.trim() ? value.name.trim().slice(0, 40) : value.key, url: value.woff2 };
}

export function skinFontFamily(font: SkinFont): string {
  return `"kcsk-font-${font.key}", ${FALLBACK}`;
}

const loading = new Map<string, Promise<boolean>>();

async function fetchFontData(url: string): Promise<ArrayBuffer> {
  let cache: Cache | null = null;
  try {
    cache = typeof caches === 'undefined' ? null : await caches.open(CACHE_NAME);
    const hit = await cache?.match(url);
    if (hit) {
      return await hit.arrayBuffer();
    }
  } catch {
    // Cache Storage 不可用（隐私模式、不安全的上下文）就每次下载
    cache = null;
  }
  const response = await fetch(url, { credentials: 'omit', mode: 'cors' });
  if (!response.ok) {
    throw new Error(`font ${response.status}`);
  }
  if (cache) {
    void cache.put(url, response.clone()).catch(() => undefined);
  }
  return response.arrayBuffer();
}

/** 确保某款字体已经注册（或正在下载）。重复调用只下载一次；失败了这次会话里不再重试，用回原来的字体。 */
export function ensureSkinFont(font: SkinFont): Promise<boolean> {
  const id = `${font.key}|${font.url}`;
  const known = loading.get(id);
  if (known) {
    return known;
  }
  const task = (async () => {
    if (typeof document === 'undefined' || typeof FontFace === 'undefined' || !document.fonts) {
      return false;
    }
    try {
      const face = new FontFace(`kcsk-font-${font.key}`, await fetchFontData(font.url), { display: 'swap' });
      await face.load();
      document.fonts.add(face);
      return true;
    } catch {
      return false;
    }
  })();
  loading.set(id, task);
  return task;
}
