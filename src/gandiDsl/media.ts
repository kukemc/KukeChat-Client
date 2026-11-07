/**
 * 积木上会出现的几张图标，打进包里。
 *
 * 导出的 SVG 要能单独打开、拖进别处，里面的 `<image>` 必须是 data URL。积木库画出来的是
 * 「媒体目录 + 文件名」，而那个目录可能取不到：安卓渲染页在 file:// 下 fetch 不了，宿主编辑器的
 * 图标在别人的 CDN 上可能跨域。所以按文件名先查这张表，查不到再去 fetch。
 */
import dropdownArrow from '../../vendor/gandi-blocks/media/dropdown-arrow.svg?raw';
import dropdownArrowDark from '../../vendor/gandi-blocks/media/dropdown-arrow-dark.svg?raw';
import greenFlag from '../../vendor/gandi-blocks/media/green-flag.svg?raw';
import repeat from '../../vendor/gandi-blocks/media/repeat.svg?raw';
import rotateLeft from '../../vendor/gandi-blocks/media/rotate-left.svg?raw';
import rotateRight from '../../vendor/gandi-blocks/media/rotate-right.svg?raw';

function svgDataUrl(text: string): string {
  return `data:image/svg+xml;base64,${utf8ToBase64(text)}`;
}

export function utf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export function base64ToUtf8(data: string): string {
  const binary = atob(data.replace(/\s+/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

const BUILTIN: Record<string, string> = {
  'dropdown-arrow.svg': dropdownArrow,
  'dropdown-arrow-dark.svg': dropdownArrowDark,
  'green-flag.svg': greenFlag,
  'repeat.svg': repeat,
  'rotate-left.svg': rotateLeft,
  'rotate-right.svg': rotateRight
};

const cache = new Map<string, string>();

/** 按文件名查内置图标，返回 data URL；不认识返回 null。 */
export function builtinMedia(href: string): string | null {
  const name = href.split(/[?#]/)[0].split('/').pop() ?? '';
  const text = BUILTIN[name];
  if (!text) return null;
  let url = cache.get(name);
  if (!url) {
    url = svgDataUrl(text);
    cache.set(name, url);
  }
  return url;
}
