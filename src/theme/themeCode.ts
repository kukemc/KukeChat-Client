import { isLibraryWallpaper, resolveMaterials, validateThemeSettings, type MaterialMap, type SurfaceId, type ThemeSettings } from './themes';
import { cleanThemeName } from './themeStore';
import { readWallpaperBlob } from './wallpaperStore';

/**
 * 主题的导出与导入。
 *
 * 导出的是一份 JSON：{ "kukechat-theme": 1, name, light, dark, images? }。复制成文本时再包一层 base64，前面加 KCT1:。
 * 背景图默认不带（主题码要短到能贴进聊天里）；导出成文件时可以选择带上压缩过的图。
 *
 * 导入的内容来自别人，一个字都不能信：
 *   · 先限长度，再解析；结构不对、版本不认识直接拒收；
 *   · 设置项逐字段过 validateThemeSettings：只读白名单里的字段，颜色必须是 #rrggbb，枚举必须在表里，数字必须在范围内。
 *     有任何一项不合法就整份拒收，而不是悄悄换成默认值——别人给的东西和自己看到的不一样，不如不要；
 *   · 图片只接受 data:image/(jpeg|png|webp);base64，解码成 Blob 后还要走一遍图库的重新编码才会被使用；
 *   · 合法的值最后只通过主题引擎赋给 CSS 变量，名字只当文字显示，任何时候都不会被拼进样式表或 HTML。
 */

const PREFIX = 'KCT1:';
const FORMAT_KEY = 'kukechat-theme';
/** 不带图的主题码很短，留足余量即可；带图的文件按图片上限算。 */
const MAX_CODE_LENGTH = 16_000;
const MAX_IMAGE_DATA_LENGTH = 1_400_000;
export const MAX_THEME_FILE_BYTES = 3 * 1024 * 1024;
/** 导出时把背景图压到这个边长：主题文件是拿来分享的，不需要原图。 */
const EXPORT_IMAGE_EDGE = 1600;
const EMBEDDED = 'embedded';
const IMAGE_DATA = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

export interface ThemePackage {
  name: string;
  light: ThemeSettings;
  dark: ThemeSettings | null;
  /** 随主题带来的背景图，还没存进图库。存好之后把对应设置里的 wallpaper 换成图库 id。 */
  images: { light: Blob | null; dark: Blob | null };
  /** 导入时做过的调整，要告诉用户。 */
  notes: string[];
}

export type ThemeImportResult = { ok: true; value: ThemePackage } | { ok: false; error: string };

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function fromBase64(encoded: string): string {
  const binary = atob(encoded);
  return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

async function embedImage(wallpaperId: string): Promise<string | null> {
  const blob = await readWallpaperBlob(wallpaperId);
  if (!blob) {
    return null;
  }
  const bitmap = await createImageBitmap(blob);
  try {
    const scale = Math.min(1, EXPORT_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) {
      return null;
    }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    // 质量逐级往下试，直到塞得进上限
    for (const quality of [0.82, 0.7, 0.55, 0.4]) {
      const data = canvas.toDataURL('image/jpeg', quality);
      if (data.length <= MAX_IMAGE_DATA_LENGTH) {
        return data;
      }
    }
    return null;
  } finally {
    bitmap.close();
  }
}

/**
 * 导出当前主题。
 * @param withImages 把用户自己的背景图压缩后一起带上（只适合导出成文件）；否则用户图片会被去掉。
 */
export async function exportTheme(name: string, light: ThemeSettings, dark: ThemeSettings | null, withImages: boolean): Promise<{ json: string; code: string; droppedImage: boolean }> {
  const images: Record<string, string> = {};
  let droppedImage = false;
  const prepare = async (key: 'light' | 'dark', settings: ThemeSettings | null): Promise<ThemeSettings | null> => {
    if (!settings || !isLibraryWallpaper(settings.wallpaper)) {
      return settings;
    }
    const data = withImages ? await embedImage(settings.wallpaper).catch(() => null) : null;
    if (data) {
      images[key] = data;
      return { ...settings, wallpaper: EMBEDDED };
    }
    droppedImage = true;
    return { ...settings, wallpaper: 'none' };
  };
  const payload = {
    [FORMAT_KEY]: 1,
    name: cleanThemeName(name, '我的主题'),
    light: await prepare('light', light),
    dark: await prepare('dark', dark),
    ...(Object.keys(images).length > 0 ? { images } : {})
  };
  const json = JSON.stringify(payload);
  return { json, code: `${PREFIX}${toBase64(json)}`, droppedImage };
}

function decodeImage(data: unknown): Blob | null {
  if (typeof data !== 'string' || data.length > MAX_IMAGE_DATA_LENGTH || !IMAGE_DATA.test(data)) {
    return null;
  }
  const comma = data.indexOf(',');
  const type = data.slice(5, data.indexOf(';'));
  try {
    const binary = atob(data.slice(comma + 1));
    return new Blob([Uint8Array.from(binary, (char) => char.charCodeAt(0))], { type });
  } catch {
    return null;
  }
}

const FIELD_NAMES: Record<string, string> = {
  presetId: '预设', accent: '强调色', bubbleStyle: '气泡样式', bubbleOutColor: '我的气泡颜色', bubbleInColor: '收到的气泡颜色', radius: '气泡圆角', bubbleTail: '气泡尖角',
  avatarShape: '头像形状', density: '界面密度', wallpaper: '背景', wallpaperScope: '背景范围', wallpaperDim: '遮罩浓度', wallpaperBlur: '背景模糊', wallpaperShade: '背景明暗',
  wallpaperSaturation: '背景饱和度', wallpaperFit: '填充方式', wallpaperAlign: '对齐位置', material: '材质', materials: '材质', glassBlur: '玻璃模糊强度'
};

function describeField(field: string): string {
  return FIELD_NAMES[field.split('.')[0]] ?? field;
}

/** 气泡的毛玻璃是实时模糊，别人的主题不能替用户决定打开它：导入时一律降成半透明。 */
function tameBubbleGlass(settings: ThemeSettings, notes: string[]): ThemeSettings {
  const materials = resolveMaterials(settings);
  const bubbles: SurfaceId[] = ['bubbleIn', 'bubbleOut'];
  if (!bubbles.some((id) => materials[id].kind === 'glass')) {
    return settings;
  }
  const next = { ...materials } as MaterialMap;
  for (const id of bubbles) {
    if (next[id].kind === 'glass') {
      next[id] = { ...next[id], kind: 'translucent' };
    }
  }
  if (!notes.some((note) => note.includes('实时模糊'))) {
    notes.push('这份主题给气泡开了实时模糊，已改为半透明（可以在「材质」的高级选项里自己打开）。');
  }
  return { ...settings, material: 'custom', materials: next };
}

function readScheme(key: 'light' | 'dark', value: unknown, images: Record<string, unknown>, notes: string[]): { settings: ThemeSettings; image: Blob | null } | string {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return `主题码里缺少${key === 'light' ? '浅色' : '深色'}配置。`;
  }
  const source = value as Record<string, unknown>;
  let image: Blob | null = null;
  let wallpaper = source.wallpaper;
  if (wallpaper === EMBEDDED) {
    image = decodeImage(images[key]);
    if (!image) {
      return '主题里带的背景图不合法（只支持 JPEG / PNG / WebP，且不能太大）。';
    }
    // 先当成没有背景来校验，图存进图库后再由调用方填上 id
    wallpaper = 'none';
  } else if (typeof wallpaper === 'string' && isLibraryWallpaper(wallpaper)) {
    // 指向对方设备上的图库，这边没有
    wallpaper = 'none';
    notes.push('这份主题用的是对方自己的背景图，主题码里没带，背景已去掉。');
  }
  if (source.version !== 2) {
    return '这份主题来自不兼容的版本。';
  }
  const { settings, invalid } = validateThemeSettings({ ...source, wallpaper });
  if (invalid.length > 0) {
    return `主题码里的「${describeField(invalid[0])}」不是合法的取值，已拒绝导入。`;
  }
  return { settings: tameBubbleGlass(settings, notes), image };
}

/** 解析一段主题码或主题文件的内容。不合法就返回原因，绝不返回部分可用的结果。 */
export function parseTheme(input: string): ThemeImportResult {
  const text = input.trim();
  if (!text) {
    return { ok: false, error: '请先粘贴主题码。' };
  }
  if (text.length > MAX_THEME_FILE_BYTES) {
    return { ok: false, error: '内容太长了，这不像是一份主题。' };
  }
  let json = text;
  if (text.startsWith(PREFIX)) {
    const body = text.slice(PREFIX.length).replace(/\s+/g, '');
    if (body.length > MAX_CODE_LENGTH || !/^[A-Za-z0-9+/]+={0,2}$/.test(body)) {
      return { ok: false, error: '主题码不完整或被改动过。' };
    }
    try {
      json = fromBase64(body);
    } catch {
      return { ok: false, error: '主题码不完整或被改动过。' };
    }
  } else if (!text.startsWith('{')) {
    return { ok: false, error: '这不是 KukeChat 的主题码（应当以 KCT1: 开头）。' };
  }
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return { ok: false, error: '主题码不完整或被改动过。' };
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { ok: false, error: '这不是 KukeChat 的主题。' };
  }
  const source = data as Record<string, unknown>;
  if (source[FORMAT_KEY] !== 1) {
    return { ok: false, error: source[FORMAT_KEY] === undefined ? '这不是 KukeChat 的主题。' : '这份主题来自更新的版本，请先更新客户端。' };
  }
  const images = typeof source.images === 'object' && source.images !== null && !Array.isArray(source.images) ? source.images as Record<string, unknown> : {};
  const notes: string[] = [];
  const light = readScheme('light', source.light, images, notes);
  if (typeof light === 'string') {
    return { ok: false, error: light };
  }
  let dark: { settings: ThemeSettings; image: Blob | null } | null = null;
  if (source.dark !== null && source.dark !== undefined) {
    const result = readScheme('dark', source.dark, images, notes);
    if (typeof result === 'string') {
      return { ok: false, error: result };
    }
    dark = result;
  }
  return {
    ok: true,
    value: {
      name: cleanThemeName(source.name, '导入的主题'),
      light: light.settings,
      dark: dark?.settings ?? null,
      images: { light: light.image, dark: dark?.image ?? null },
      notes: Array.from(new Set(notes))
    }
  };
}
