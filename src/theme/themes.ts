/**
 * 主题引擎：把「预设 + 用户自定义」翻译成一组 CSS 变量（--kc-*）。
 *
 * 界面里的颜色都读这些变量，所以这里只负责产出变量，不关心具体组件。
 * 「经典」预设在没有任何自定义时不输出颜色变量，界面保持样式表里的默认值
 * （src/styles/kui.css 里 [data-layout='desktop'] 那两块）。那边改了，这里的「经典」和 SURFACES 要跟着改。
 *
 * 材质：界面按「面」分区（导航栏、会话列表、顶栏……），每个面是实色、半透明或毛玻璃。
 *   · 半透明 = 这个面的令牌换成带透明度的颜色，背景图直接透上来；
 *   · 毛玻璃 = 半透明 + 面的背景里再垫一张「预先模糊好的背景图」，由 ThemeEffects 对齐到背景图的坐标上，
 *     视觉上等同 backdrop-filter，但没有任何实时开销。只有浮层（菜单、对话框、抽屉）和显式打开的气泡用真的 backdrop-filter。
 * 面不在背景图上时（没设背景，或背景只铺聊天区而这个面在外面）一律按实色处理。
 */

import { BUILTIN_WALLPAPERS, getBuiltinWallpaper } from './wallpapers';

export { BUILTIN_WALLPAPERS } from './wallpapers';
export type { BuiltinWallpaper } from './wallpapers';

export type ThemeScheme = 'light' | 'dark';
export type BubbleStyle = 'soft' | 'solid';
export type WallpaperScope = 'chat' | 'window';
export type WallpaperFit = 'cover' | 'contain' | 'stretch' | 'tile';
export type WallpaperAlign = 'center' | 'top' | 'bottom' | 'left' | 'right';
export type WallpaperMode = 'none' | WallpaperScope;
export type MaterialKind = 'solid' | 'translucent' | 'glass';
export type MaterialPresetId = 'solid' | 'translucent' | 'frost' | 'crystal' | 'custom';
export type SurfaceId = 'rail' | 'list' | 'header' | 'composer' | 'sidebar' | 'bubbleIn' | 'bubbleOut' | 'overlay';
export type AvatarShape = 'circle' | 'rounded';
export type Density = 'cozy' | 'compact';

export interface SurfaceMaterial {
  kind: MaterialKind;
  /** 这个面自己的颜色占多少（百分比）。实色时不起作用。 */
  opacity: number;
}

export type MaterialMap = Record<SurfaceId, SurfaceMaterial>;

export interface ThemeSettings {
  /** 结构版本。没有这个字段的是 1.x 存下来的旧结构，读取时走 migrateLegacy。 */
  version: 2;
  presetId: string;
  /** 自定义强调色（#rrggbb）。null 表示跟随预设。 */
  accent: string | null;
  /** 自己消息的气泡样式。null 表示跟随预设。 */
  bubbleStyle: BubbleStyle | null;
  /** 自己消息的气泡颜色（#rrggbb）。设了就盖过 bubbleStyle；null 表示跟随强调色。 */
  bubbleOutColor: string | null;
  /** 收到的消息的气泡颜色（#rrggbb）。null 表示用主题的默认面。 */
  bubbleInColor: string | null;
  /** 气泡圆角，像素。 */
  radius: number;
  /** 朝头像的那个角是否收成小尖角。 */
  bubbleTail: boolean;
  avatarShape: AvatarShape;
  density: Density;
  /** 'none'、内置背景的 id，或用户图片（'custom' 是 1.x 留下的那一张，'img:xxxx' 是图库里的）。 */
  wallpaper: string;
  wallpaperScope: WallpaperScope;
  /** 消息画布上那层主题色遮罩的浓度，0–100（百分比）。100 就是把背景完全盖住。 */
  wallpaperDim: number;
  /** 背景本身的模糊，0–30（像素，按 1440 宽的窗口算）。只对用户图片生效。 */
  wallpaperBlur: number;
  /** 背景的明暗，-60–60：负数压暗，正数提亮。 */
  wallpaperShade: number;
  /** 背景的饱和度，0–200（百分比）。只对用户图片生效。 */
  wallpaperSaturation: number;
  wallpaperFit: WallpaperFit;
  wallpaperAlign: WallpaperAlign;
  /** 材质预设；'custom' 时逐面读 materials。 */
  material: MaterialPresetId;
  materials: MaterialMap;
  /** 毛玻璃的模糊强度，4–40（像素，同上按 1440 宽算）。 */
  glassBlur: number;
}

export interface ThemePreset {
  id: string;
  name: string;
  tagline: string;
  /**
   * 强调色。light 是饱满的那一个：浅色下的文字、图标、实底都用它，深色下的实底（主按钮、选中、纯色气泡）也用它；
   * dark 是提亮过的，只在深色下给文字和图标用——饱满的那个压在深底上当字太暗。
   */
  accent: Record<ThemeScheme, string>;
  /** 界面底色里掺入多少强调色（百分比），0 表示用中性灰。 */
  tint: number;
  bubbleStyle: BubbleStyle;
  /** 预设自带的内置背景 id。 */
  wallpaper?: string;
  /** 预设自带的背景范围和材质。不写就是「只铺聊天区」和默认材质。 */
  scope?: WallpaperScope;
  material?: Exclude<MaterialPresetId, 'custom'>;
  dim?: number;
}

export const THEME_PRESETS: ThemePreset[] = [
  { id: 'classic', name: '经典', tagline: '冷调灰配一抹蓝', accent: { light: '#1f6bff', dark: '#5b93ff' }, tint: 0, bubbleStyle: 'solid' },
  { id: 'sky', name: '晴空', tagline: '纯色气泡，干净利落', accent: { light: '#0099ff', dark: '#2aa7ff' }, tint: 3, bubbleStyle: 'solid' },
  { id: 'mint', name: '薄荷', tagline: '清爽的绿', accent: { light: '#12b886', dark: '#34d3a0' }, tint: 5, bubbleStyle: 'soft' },
  { id: 'sakura', name: '樱花', tagline: '柔和的粉', accent: { light: '#f06595', dark: '#ff8fb3' }, tint: 6, bubbleStyle: 'soft', wallpaper: 'blossom' },
  { id: 'sunset', name: '落日', tagline: '暖橙色调', accent: { light: '#f76707', dark: '#ff922b' }, tint: 5, bubbleStyle: 'solid', wallpaper: 'dusk' },
  { id: 'lavender', name: '薰衣草', tagline: '安静的紫', accent: { light: '#7950f2', dark: '#9775fa' }, tint: 6, bubbleStyle: 'soft' },
  { id: 'ocean', name: '深海', tagline: '青蓝渐变背景', accent: { light: '#0c8599', dark: '#3bc9db' }, tint: 7, bubbleStyle: 'solid', wallpaper: 'tide' },
  { id: 'graphite', name: '石墨', tagline: '极简黑白灰', accent: { light: '#495057', dark: '#adb5bd' }, tint: 0, bubbleStyle: 'solid' },
  { id: 'pine', name: '松林', tagline: '沉稳的墨绿', accent: { light: '#2b8a3e', dark: '#51cf66' }, tint: 5, bubbleStyle: 'solid' },
  { id: 'amber', name: '琥珀', tagline: '明亮的暖黄', accent: { light: '#f59f00', dark: '#ffc94d' }, tint: 4, bubbleStyle: 'soft' },
  { id: 'draft', name: '草稿纸', tagline: '网格底，适合聊代码', accent: { light: '#3b5bdb', dark: '#748ffc' }, tint: 2, bubbleStyle: 'solid', wallpaper: 'grid', material: 'translucent', dim: 0 },
  { id: 'harbor', name: '雾港', tagline: '整窗背景 + 轻玻璃', accent: { light: '#1c7ed6', dark: '#4dabf7' }, tint: 4, bubbleStyle: 'solid', wallpaper: 'harbor', scope: 'window', material: 'frost', dim: 8 },
  { id: 'nebula', name: '星云', tagline: '整窗背景 + 通透玻璃', accent: { light: '#7048e8', dark: '#9f8cff' }, tint: 6, bubbleStyle: 'soft', wallpaper: 'nebula', scope: 'window', material: 'crystal', dim: 0 },
  { id: 'ember', name: '余烬', tagline: '暖色背景 + 轻玻璃', accent: { light: '#e8590c', dark: '#ff922b' }, tint: 5, bubbleStyle: 'solid', wallpaper: 'ember', scope: 'window', material: 'frost', dim: 10 }
];

export const ACCENT_SWATCHES = ['#1f6bff', '#0099ff', '#12b886', '#40c057', '#f59f00', '#f76707', '#fa5252', '#f06595', '#be4bdb', '#7950f2', '#0c8599', '#495057'];

export const SURFACE_IDS: SurfaceId[] = ['rail', 'list', 'header', 'composer', 'sidebar', 'bubbleIn', 'bubbleOut', 'overlay'];

const SOLID: SurfaceMaterial = { kind: 'solid', opacity: 100 };
const t = (opacity: number): SurfaceMaterial => ({ kind: 'translucent', opacity });
const g = (opacity: number): SurfaceMaterial => ({ kind: 'glass', opacity });

/**
 * 一键套用的材质。越往后越通透；气泡从不用毛玻璃（它在滚动的消息列表里），最多半透明。
 * 透明度都留了余量：字要压在这些面上读，太透就花了。
 */
export const MATERIAL_PRESETS: Record<Exclude<MaterialPresetId, 'custom'>, MaterialMap> = {
  solid: { rail: SOLID, list: SOLID, header: SOLID, composer: SOLID, sidebar: SOLID, bubbleIn: SOLID, bubbleOut: SOLID, overlay: SOLID },
  translucent: { rail: t(68), list: t(74), header: t(86), composer: t(90), sidebar: t(84), bubbleIn: SOLID, bubbleOut: SOLID, overlay: SOLID },
  frost: { rail: g(52), list: g(60), header: g(66), composer: g(74), sidebar: g(64), bubbleIn: t(90), bubbleOut: SOLID, overlay: g(80) },
  crystal: { rail: g(30), list: g(40), header: g(46), composer: g(58), sidebar: g(44), bubbleIn: t(68), bubbleOut: t(84), overlay: g(68) }
};

export const MATERIAL_PRESET_LIST: Array<{ id: Exclude<MaterialPresetId, 'custom'>; name: string; hint: string }> = [
  { id: 'solid', name: '实色', hint: '所有面都是实底，背景只从消息画布透出来' },
  { id: 'translucent', name: '半透明', hint: '侧栏和顶栏透出背景，不做模糊' },
  { id: 'frost', name: '轻玻璃', hint: '侧栏、顶栏、输入框是毛玻璃，字清楚' },
  { id: 'crystal', name: '通透', hint: '更薄的玻璃，气泡也半透明' }
];

/** 每个面最少保留多少自己的颜色：再低字就压不住了。 */
export const MIN_OPACITY: Record<SurfaceId, number> = { rail: 10, list: 20, header: 25, composer: 30, sidebar: 25, bubbleIn: 35, bubbleOut: 50, overlay: 55 };

export const DEFAULT_THEME_SETTINGS: ThemeSettings = {
  version: 2,
  presetId: 'classic',
  accent: null,
  bubbleStyle: null,
  bubbleOutColor: null,
  bubbleInColor: null,
  radius: 10,
  bubbleTail: true,
  avatarShape: 'circle',
  density: 'cozy',
  wallpaper: 'none',
  wallpaperScope: 'chat',
  wallpaperDim: 20,
  wallpaperBlur: 0,
  wallpaperShade: 0,
  wallpaperSaturation: 100,
  wallpaperFit: 'cover',
  wallpaperAlign: 'center',
  material: 'frost',
  materials: MATERIAL_PRESETS.frost,
  glassBlur: 24
};

/** 设置界面按节恢复默认时用：每一节管哪些字段。 */
export const THEME_SECTIONS = {
  wallpaper: ['wallpaper', 'wallpaperScope', 'wallpaperDim', 'wallpaperBlur', 'wallpaperShade', 'wallpaperSaturation', 'wallpaperFit', 'wallpaperAlign'],
  material: ['material', 'materials', 'glassBlur'],
  color: ['accent', 'bubbleStyle', 'bubbleOutColor', 'bubbleInColor'],
  shape: ['radius', 'bubbleTail', 'avatarShape', 'density']
} as const satisfies Record<string, ReadonlyArray<keyof ThemeSettings>>;

export type ThemeSection = keyof typeof THEME_SECTIONS;

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const LIBRARY_WALLPAPER = /^img:[a-z0-9]{4,20}$/;
const FITS: WallpaperFit[] = ['cover', 'contain', 'stretch', 'tile'];
const ALIGNS: WallpaperAlign[] = ['center', 'top', 'bottom', 'left', 'right'];
const KINDS: MaterialKind[] = ['solid', 'translucent', 'glass'];
const MATERIAL_IDS: MaterialPresetId[] = ['solid', 'translucent', 'frost', 'crystal', 'custom'];
/** 平铺时每块的宽度。用户图片可能有几千像素宽，按原尺寸铺等于没铺。 */
export const TILE_WIDTH = 320;

/**
 * 各配色方案下界面的中性底色，和样式表里桌面布局的默认值一一对应。
 * 明度顺序是界面层次的来源：浅色下导航栏 < 会话列表 < 消息画布 < 面板；深色下导航栏 < 画布 < 列表 < 面板。
 */
const SURFACES: Record<ThemeScheme, Record<'window' | 'titlebar' | 'rail' | 'list' | 'chat' | 'panel' | 'panelMuted' | 'bubbleIn', string>> = {
  light: { window: '#eceef3', titlebar: '#e7e9ef', rail: '#e2e4eb', list: '#eceef3', chat: '#f5f6f9', panel: '#ffffff', panelMuted: '#f0f1f5', bubbleIn: '#ffffff' },
  dark: { window: '#0b0c0f', titlebar: '#0d0e11', rail: '#090a0c', list: '#15161b', chat: '#0e0f12', panel: '#1b1d23', panelMuted: '#212329', bubbleIn: '#22242a' }
};

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOR.test(value);
}

export function isLibraryWallpaper(id: string): boolean {
  return id === 'custom' || LIBRARY_WALLPAPER.test(id);
}

export function isWallpaperId(value: unknown): value is string {
  return typeof value === 'string' && (value === 'none' || isLibraryWallpaper(value) || BUILTIN_WALLPAPERS.some((item) => item.id === value));
}

export function getThemePreset(id: string): ThemePreset {
  return THEME_PRESETS.find((preset) => preset.id === id) ?? THEME_PRESETS[0];
}

/** 把预设的整套搭配摊成一份设置的改动。用户自己上传的背景图由调用方决定要不要保留。 */
export function presetPatch(preset: ThemePreset): Partial<ThemeSettings> {
  return {
    presetId: preset.id,
    accent: null,
    bubbleStyle: null,
    bubbleOutColor: null,
    bubbleInColor: null,
    wallpaper: preset.wallpaper ?? 'none',
    wallpaperScope: preset.scope ?? 'chat',
    wallpaperDim: preset.dim ?? DEFAULT_THEME_SETTINGS.wallpaperDim,
    wallpaperShade: 0,
    material: preset.material ?? DEFAULT_THEME_SETTINGS.material
  };
}

/* ───────── 读取与校验 ───────── */

/**
 * 1.x 的结构只有 presetId / accent / bubbleStyle / radius / wallpaper / wallpaperScope / wallpaperDim / wallpaperBlur，
 * 而且 wallpaperDim 在「整窗」下身兼两职（各个面的浓度 + 画布遮罩）。这里换算成新结构里看起来一样的值：
 *   · 只铺聊天区：当时所有面都是实色 → 材质取「实色」，遮罩浓度照旧；
 *   · 铺整窗：当时导航栏、列表是 max(30, dim)% 的半透明，顶栏、输入框、侧栏再实 32 个点 → 逐面写成自定义材质。
 *     画布当时被铺了两层同样的遮罩（外层容器一层、聊天面板一层），现在只铺一层，所以浓度按两层叠加后的结果换算。
 * 没用过背景图的人直接拿新默认值。
 */
function migrateLegacy(source: Record<string, unknown>): Record<string, unknown> {
  const hasWallpaper = isWallpaperId(source.wallpaper) && source.wallpaper !== 'none';
  if (!hasWallpaper) {
    return { ...source, version: 2 };
  }
  const dim = typeof source.wallpaperDim === 'number' && Number.isFinite(source.wallpaperDim) ? Math.min(90, Math.max(0, source.wallpaperDim)) : 20;
  if (source.wallpaperScope === 'window') {
    const opacity = Math.max(30, dim);
    const raised = Math.min(92, opacity + 32);
    return {
      ...source,
      version: 2,
      wallpaperDim: Math.round(100 - ((100 - opacity) * (100 - opacity)) / 100),
      // 旧版整窗背景下模糊不生效
      wallpaperBlur: 0,
      material: 'custom',
      materials: { rail: t(opacity), list: t(opacity), header: t(raised), composer: t(raised), sidebar: t(raised), bubbleIn: SOLID, bubbleOut: SOLID, overlay: SOLID }
    };
  }
  // 旧版只对用户上传的图片做模糊
  return { ...source, version: 2, material: 'solid', wallpaperBlur: source.wallpaper === 'custom' ? source.wallpaperBlur : 0 };
}

type Invalid = (field: string) => void;

/**
 * 逐字段读出一份合法的设置：只认识白名单里的字段，其余一概丢掉。
 * 字段缺失用默认值；字段在但取值不合法时也用默认值，同时通过 invalid 报告——导入别人的主题时据此整份拒收。
 */
function readThemeSettings(value: unknown, invalid?: Invalid): ThemeSettings {
  const raw = typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const source = raw.version === 2 ? raw : migrateLegacy(raw);
  const defaults = DEFAULT_THEME_SETTINGS;

  function pick<T>(field: string, test: (input: unknown) => input is T, fallback: T): T {
    const input = source[field];
    if (input === undefined) {
      return fallback;
    }
    if (test(input)) {
      return input;
    }
    invalid?.(field);
    return fallback;
  }
  const oneOf = <T extends string>(options: readonly T[]) => (input: unknown): input is T => typeof input === 'string' && (options as readonly string[]).includes(input);
  const isBoolean = (input: unknown): input is boolean => typeof input === 'boolean';
  const within = (min: number, max: number) => (input: unknown): input is number => typeof input === 'number' && Number.isFinite(input) && input >= min && input <= max;
  const color = (field: string): string | null => {
    const input = source[field];
    if (input === undefined || input === null) {
      return null;
    }
    if (isHexColor(input)) {
      return input.toLowerCase();
    }
    invalid?.(field);
    return null;
  };
  const number = (field: string, min: number, max: number, fallback: number): number => Math.round(pick(field, within(min, max), fallback));

  const material = pick('material', oneOf(MATERIAL_IDS), defaults.material);
  const materialSource = typeof source.materials === 'object' && source.materials !== null && !Array.isArray(source.materials) ? source.materials as Record<string, unknown> : null;
  if (source.materials !== undefined && !materialSource) {
    invalid?.('materials');
  }
  const base = MATERIAL_PRESETS[material === 'custom' ? 'frost' : material];
  const materials = {} as MaterialMap;
  for (const id of SURFACE_IDS) {
    const entry = materialSource?.[id];
    if (typeof entry === 'object' && entry !== null) {
      const { kind, opacity } = entry as Record<string, unknown>;
      if (oneOf(KINDS)(kind) && within(0, 100)(opacity)) {
        materials[id] = { kind, opacity: Math.round(Math.max(MIN_OPACITY[id], opacity)) };
        continue;
      }
      invalid?.(`materials.${id}`);
    } else if (entry !== undefined) {
      invalid?.(`materials.${id}`);
    }
    materials[id] = base[id];
  }

  return {
    version: 2,
    presetId: pick('presetId', (input): input is string => typeof input === 'string' && THEME_PRESETS.some((preset) => preset.id === input), defaults.presetId),
    accent: color('accent'),
    bubbleStyle: source.bubbleStyle === null ? null : pick<BubbleStyle | null>('bubbleStyle', oneOf<BubbleStyle>(['soft', 'solid']), null),
    bubbleOutColor: color('bubbleOutColor'),
    bubbleInColor: color('bubbleInColor'),
    radius: number('radius', 4, 20, defaults.radius),
    bubbleTail: pick('bubbleTail', isBoolean, defaults.bubbleTail),
    avatarShape: pick('avatarShape', oneOf<AvatarShape>(['circle', 'rounded']), defaults.avatarShape),
    density: pick('density', oneOf<Density>(['cozy', 'compact']), defaults.density),
    wallpaper: pick('wallpaper', isWallpaperId, defaults.wallpaper),
    wallpaperScope: pick('wallpaperScope', oneOf<WallpaperScope>(['chat', 'window']), defaults.wallpaperScope),
    wallpaperDim: number('wallpaperDim', 0, 100, defaults.wallpaperDim),
    wallpaperBlur: number('wallpaperBlur', 0, 30, defaults.wallpaperBlur),
    wallpaperShade: number('wallpaperShade', -60, 60, defaults.wallpaperShade),
    wallpaperSaturation: number('wallpaperSaturation', 0, 200, defaults.wallpaperSaturation),
    wallpaperFit: pick('wallpaperFit', oneOf(FITS), defaults.wallpaperFit),
    wallpaperAlign: pick('wallpaperAlign', oneOf(ALIGNS), defaults.wallpaperAlign),
    material,
    materials,
    glassBlur: number('glassBlur', 4, 40, defaults.glassBlur)
  };
}

/** 本地存储里读出来的东西不可信，逐字段校验后再用；1.x 的旧结构在这里迁移。 */
export function sanitizeThemeSettings(value: unknown): ThemeSettings {
  return readThemeSettings(value);
}

/** 严格校验：有任何一个字段取值不合法就返回这些字段的名字，由调用方拒收。 */
export function validateThemeSettings(value: unknown): { settings: ThemeSettings; invalid: string[] } {
  const invalid: string[] = [];
  const settings = readThemeSettings(value, (field) => invalid.push(field));
  return { settings, invalid };
}

/* ───────── 颜色 ───────── */

/** 在某个底色上该用深色字还是白字。 */
export function contrastColor(hex: string): string {
  const channel = (offset: number): number => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  // 阈值偏向白字：饱满的蓝、绿、粉上白字更干净；琥珀、明黄这类亮色（0.42 以上）白字就糊了，换深色字
  return luminance > 0.42 ? '#16181d' : '#ffffff';
}

function mix(color: string, amount: number, base: string): string {
  return amount <= 0 ? base : `color-mix(in srgb, ${color} ${amount}%, ${base})`;
}

function translucent(color: string, opacity: number): string {
  return opacity >= 100 ? color : `color-mix(in srgb, ${color} ${Math.max(0, Math.round(opacity))}%, transparent)`;
}

function paint(color: string, material: SurfaceMaterial): string {
  return material.kind === 'solid' ? color : translucent(color, material.opacity);
}

export function resolveAccent(settings: ThemeSettings, scheme: ThemeScheme): string {
  return settings.accent ?? getThemePreset(settings.presetId).accent[scheme];
}

/** 实底用的强调色：上面要压字，两种配色方案下都用饱满的那一个。 */
function resolveAccentFill(settings: ThemeSettings): string {
  return settings.accent ?? getThemePreset(settings.presetId).accent.light;
}

export function resolveBubbleStyle(settings: ThemeSettings): BubbleStyle {
  return settings.bubbleStyle ?? getThemePreset(settings.presetId).bubbleStyle;
}

/* ───────── 背景 ───────── */

const ALIGN_POSITION: Record<WallpaperAlign, string> = { center: '50% 50%', top: '50% 0%', bottom: '50% 100%', left: '0% 50%', right: '100% 50%' };
/** 和 ALIGN_POSITION 是同一件事的数字版，ThemeEffects 用它把模糊版对到同一个位置上。 */
export const ALIGN_FACTOR: Record<WallpaperAlign, [x: number, y: number]> = { center: [0.5, 0.5], top: [0.5, 0], bottom: [0.5, 1], left: [0, 0.5], right: [1, 0.5] };
const FIT_SIZE: Record<WallpaperFit, string> = { cover: 'cover', contain: 'contain', stretch: '100% 100%', tile: `${TILE_WIDTH}px auto` };

/** 用户图片的 background 简写里，图片后面那一截（位置 / 尺寸 重复）。 */
export function wallpaperPlacement(settings: ThemeSettings): string {
  return `${ALIGN_POSITION[settings.wallpaperAlign]} / ${FIT_SIZE[settings.wallpaperFit]} ${settings.wallpaperFit === 'tile' ? 'repeat' : 'no-repeat'}`;
}

/** 当前背景的 background 简写；没有背景（或用户图片还没读出来）时是 null。 */
export function resolveWallpaperImage(settings: ThemeSettings, scheme: ThemeScheme, customUrl: string | null): string | null {
  if (settings.wallpaper === 'none') {
    return null;
  }
  if (isLibraryWallpaper(settings.wallpaper)) {
    // customUrl 只会是 wallpaperStore 给出的 blob: 地址，不是用户能写进来的字符串
    return customUrl ? `url("${customUrl}") ${wallpaperPlacement(settings)}` : null;
  }
  return getBuiltinWallpaper(settings.wallpaper)?.image[scheme] ?? null;
}

/** 当前背景作用在哪：不显示、只在聊天消息区、还是铺满整个窗口。 */
export function wallpaperMode(settings: ThemeSettings, scheme: ThemeScheme, customWallpaperUrl: string | null): WallpaperMode {
  return resolveWallpaperImage(settings, scheme, customWallpaperUrl) ? settings.wallpaperScope : 'none';
}

/* ───────── 材质 ───────── */

export interface ThemeEnvironment {
  /** 性能优先：不用任何实时模糊。 */
  performance?: boolean;
}

/** 设置里选的材质（预设或逐面自定义），还没考虑这个面当前在不在背景图上。 */
export function resolveMaterials(settings: ThemeSettings): MaterialMap {
  return settings.material === 'custom' ? settings.materials : MATERIAL_PRESETS[settings.material];
}

/** 某个面当前为什么用不了设置里选的材质；能用时是 null。设置界面拿它来解释。 */
export function materialBlocker(surface: SurfaceId, mode: WallpaperMode, settings: ThemeSettings, environment: ThemeEnvironment = {}): 'no-wallpaper' | 'outside-wallpaper' | 'performance' | null {
  const chosen = resolveMaterials(settings)[surface];
  if (surface === 'overlay') {
    // 浮层的玻璃透出的是它下面的界面，不依赖背景图；但没有背景图时预设不动浮层，只有逐面自定义才生效
    if (chosen.kind === 'glass' && environment.performance) {
      return 'performance';
    }
    return mode === 'none' && settings.material !== 'custom' ? 'no-wallpaper' : null;
  }
  if (mode === 'none') {
    return 'no-wallpaper';
  }
  if (mode === 'chat' && (surface === 'rail' || surface === 'list' || surface === 'sidebar')) {
    return 'outside-wallpaper';
  }
  if ((surface === 'bubbleIn' || surface === 'bubbleOut') && chosen.kind === 'glass' && environment.performance) {
    return 'performance';
  }
  return null;
}

/**
 * 每个面实际用什么材质。选了玻璃但当前不成立的，退到最接近的那一档：
 *   · 面不在背景图上 → 实色（半透明的面压在纯色底上只会是一块脏灰）；
 *   · 性能优先 → 浮层退回实色（没有模糊的半透明菜单压在文字上看不清），气泡退回半透明。
 */
export function effectiveMaterials(settings: ThemeSettings, mode: WallpaperMode, environment: ThemeEnvironment = {}): MaterialMap {
  const chosen = resolveMaterials(settings);
  const result = {} as MaterialMap;
  for (const id of SURFACE_IDS) {
    const material = { kind: chosen[id].kind, opacity: Math.max(MIN_OPACITY[id], chosen[id].opacity) };
    const blocker = materialBlocker(id, mode, settings, environment);
    if (id === 'overlay') {
      // 浮层只有实色和玻璃两种
      result[id] = material.kind === 'glass' && !blocker ? material : SOLID;
    } else if (blocker === 'performance') {
      result[id] = { ...material, kind: 'translucent' };
    } else {
      result[id] = blocker ? SOLID : material;
    }
  }
  return result;
}

/** 哪些面要垫预模糊的背景。'page' 是聊天以外的页面：顶栏是玻璃时，这些页面的内容区整块垫上，里面滚动的卡片就都是玻璃了。 */
export type FrostRole = 'rail' | 'list' | 'header' | 'composer' | 'sidebar' | 'page';

export function frostRoles(settings: ThemeSettings, mode: WallpaperMode): FrostRole[] {
  if (mode === 'none') {
    return [];
  }
  const materials = effectiveMaterials(settings, mode);
  const roles: FrostRole[] = (['rail', 'list', 'header', 'composer', 'sidebar'] as const).filter((id) => materials[id].kind === 'glass');
  if (mode === 'window' && materials.header.kind === 'glass') {
    roles.push('page');
  }
  return roles;
}

/** 内置背景的模糊版（单个 <image>）；用户图片的模糊版要现算，这里返回 null。 */
export function builtinFrostImage(settings: ThemeSettings, scheme: ThemeScheme): string | null {
  const frost = getBuiltinWallpaper(settings.wallpaper)?.frost[scheme];
  return typeof frost === 'function' ? frost(settings.glassBlur) : frost ?? null;
}

/* ───────── 变量 ───────── */

const DENSITY: Record<Density, { item: number; grouped: number; bubble: string; conversation: number; member: number }> = {
  cozy: { item: 14, grouped: 3, bubble: '7px 12px', conversation: 62, member: 5 },
  compact: { item: 8, grouped: 2, bubble: '5px 10px', conversation: 52, member: 2 }
};

/** 会话列表是定高的虚拟列表，行高要让组件知道。 */
export function conversationRowHeight(density: Density): number {
  return DENSITY[density].conversation;
}

/**
 * @param complete 输出全部颜色变量，不依赖外层已有的主题。画预设缩略图时用：缩略图嵌在当前主题里，
 *                 不写全的话「经典」会继承到当前主题的颜色。
 */
export function themeVariables(settings: ThemeSettings, scheme: ThemeScheme, customWallpaperUrl: string | null, complete = false, environment: ThemeEnvironment = {}): Record<string, string> {
  const preset = getThemePreset(settings.presetId);
  const dark = scheme === 'dark';
  const accent = resolveAccent(settings, scheme);
  const fill = resolveAccentFill(settings);
  const onFill = contrastColor(fill);
  const base = SURFACES[scheme];
  const variables: Record<string, string> = { '--kc-radius': `${settings.radius}px` };
  // 样式表的默认值就是没改过强调色的「经典」，这时颜色交给样式表
  const stock = !complete && preset.id === 'classic' && settings.accent === null;
  const tint = dark ? preset.tint * 1.4 : preset.tint;

  // 各个面掺同样比例的强调色：比例不一样的话，面与面的明度顺序会被搅乱，层次就没了
  const surfaces = {
    window: mix(accent, tint, base.window),
    titlebar: mix(accent, stock ? 0 : dark ? 20 : 14, base.titlebar),
    rail: mix(accent, tint, base.rail),
    list: mix(accent, tint, base.list),
    chat: mix(accent, tint, base.chat)
  };

  if (!stock) {
    variables['--kc-accent'] = accent;
    variables['--kc-accent-fill'] = fill;
    variables['--kc-accent-contrast'] = onFill;
    variables['--kc-accent-soft'] = mix(fill, dark ? 22 : 14, base.panel);
    variables['--kc-titlebar'] = surfaces.titlebar;
  }
  if (tint > 0 || complete) {
    variables['--kc-bubble-in'] = base.bubbleIn;
    variables['--kc-window'] = surfaces.window;
    variables['--kc-rail'] = surfaces.rail;
    variables['--kc-list'] = surfaces.list;
    variables['--kc-chat'] = surfaces.chat;
    variables['--kc-panel-muted'] = mix(accent, tint, base.panelMuted);
  }

  /* 形状与密度：和默认值一样时不输出，留给样式表 */
  if (!settings.bubbleTail) {
    variables['--kc-bubble-tail'] = `${settings.radius}px`;
  }
  if (settings.avatarShape === 'rounded') {
    variables['--kc-avatar-radius'] = '28%';
  }
  if (settings.density === 'compact') {
    const density = DENSITY.compact;
    variables['--kc-space-item'] = `${density.item}px`;
    variables['--kc-space-grouped'] = `${density.grouped}px`;
    variables['--kc-bubble-padding'] = density.bubble;
    variables['--kc-conversation-height'] = `${density.conversation}px`;
    variables['--kc-member-padding'] = `${density.member}px`;
  }

  const wallpaper = resolveWallpaperImage(settings, scheme, customWallpaperUrl);
  const mode: WallpaperMode = wallpaper ? settings.wallpaperScope : 'none';
  const materials = effectiveMaterials(settings, mode, environment);

  /* 气泡 */
  const bubbleIn = settings.bubbleInColor ?? base.bubbleIn;
  if (settings.bubbleInColor) {
    const text = contrastColor(settings.bubbleInColor);
    variables['--kc-bubble-in-text'] = text;
    // 自选的底色上，主题的强调色不一定读得清：往字色那边拉一半
    variables['--kc-bubble-in-accent'] = `color-mix(in srgb, ${accent} 50%, ${text})`;
    variables['--kc-bubble-in-muted'] = translucent(text, 68);
  }
  if (settings.bubbleInColor || materials.bubbleIn.kind !== 'solid') {
    variables['--kc-bubble-in'] = paint(bubbleIn, materials.bubbleIn);
  }

  let bubbleOut: string | null = null;
  if (settings.bubbleOutColor) {
    const text = contrastColor(settings.bubbleOutColor);
    bubbleOut = settings.bubbleOutColor;
    variables['--kc-bubble-out-text'] = text;
    variables['--kc-bubble-out-accent'] = text;
    variables['--kc-bubble-out-muted'] = translucent(text, 76);
  } else if (resolveBubbleStyle(settings) === 'soft') {
    // 柔和气泡是浅浅的一层强调色，上面的字、链接照常用正文的颜色
    bubbleOut = mix(accent, dark ? 30 : 20, base.bubbleIn);
    variables['--kc-bubble-out-text'] = 'var(--kc-text)';
    variables['--kc-bubble-out-accent'] = 'var(--kc-accent)';
    variables['--kc-bubble-out-muted'] = 'var(--kc-muted)';
  } else if (!stock || materials.bubbleOut.kind !== 'solid') {
    bubbleOut = fill;
    variables['--kc-bubble-out-text'] = onFill;
    variables['--kc-bubble-out-accent'] = onFill;
    variables['--kc-bubble-out-muted'] = translucent(onFill, 76);
  }
  if (bubbleOut) {
    variables['--kc-bubble-out'] = paint(bubbleOut, materials.bubbleOut);
  }
  if (materials.bubbleIn.kind === 'glass' || materials.bubbleOut.kind === 'glass') {
    // 气泡在滚动的列表里，这是唯一一处滚动内容上的实时模糊，只有用户在高级选项里显式打开才会有；半径收着点
    const filter = `blur(${Math.min(16, settings.glassBlur)}px) saturate(1.4)`;
    if (materials.bubbleIn.kind === 'glass') {
      variables['--kc-bubble-in-filter'] = filter;
    }
    if (materials.bubbleOut.kind === 'glass') {
      variables['--kc-bubble-out-filter'] = filter;
    }
  }

  /* 浮层：真的 backdrop-filter。它们是临时出现的小面，下面压的是任意内容，预模糊的背景图替代不了 */
  if (materials.overlay.kind === 'glass') {
    variables['--kc-overlay-surface'] = translucent('var(--kui-raised)', materials.overlay.opacity);
    variables['--kc-overlay-drawer'] = translucent('var(--kc-panel)', materials.overlay.opacity);
    variables['--kc-overlay-filter'] = `blur(${Math.min(28, settings.glassBlur)}px) saturate(1.6)`;
  }

  if (wallpaper) {
    variables['--kc-wallpaper-bg'] = wallpaper;
    variables['--kc-wallpaper-base'] = surfaces.window;
    if (isLibraryWallpaper(settings.wallpaper) && settings.wallpaperSaturation !== 100) {
      variables['--kc-wallpaper-filter'] = `saturate(${settings.wallpaperSaturation}%)`;
    }
    if (settings.wallpaperShade !== 0) {
      variables['--kc-wallpaper-shade'] = translucent(settings.wallpaperShade < 0 ? '#000000' : '#ffffff', Math.abs(settings.wallpaperShade));
    }
    variables['--kc-frost-repeat'] = isLibraryWallpaper(settings.wallpaper) && settings.wallpaperFit === 'tile' ? 'repeat' : 'no-repeat';
    // 直接压在背景图上的小字（时间、系统消息、昵称）：字色比平时的灰字重一档，四周再垫一圈面板色的晕，不然看不清
    variables['--kc-notice-text'] = dark ? '#d0d4dd' : '#3d424e';
    variables['--kc-notice-bg'] = translucent(base.panel, dark ? 60 : 82);
    variables['--kc-notice-halo'] = halo(base.panel);
    if (isLibraryWallpaper(settings.wallpaper)) {
      // 照片的明暗没法预料：毛玻璃面透出来的模糊图先往主题的方向刷一层（浅色刷白、深色刷黑），再叠面自己的底色。
      // 内置背景浅色、深色各有一张，不需要
      variables['--kc-frost-wash'] = translucent(dark ? '#000000' : '#ffffff', dark ? 30 : 16);
    }
    variables['--kc-header-surface'] = paint(base.panel, materials.header);
    variables['--kc-composer-surface'] = paint(base.panel, materials.composer);
    if (mode === 'window') {
      // 整窗背景：各区域的底色改成半透明，让窗口最底层的图片透上来
      variables['--kc-window'] = 'transparent';
      variables['--kc-titlebar'] = paint(surfaces.titlebar, materials.rail);
      variables['--kc-rail'] = paint(surfaces.rail, materials.rail);
      variables['--kc-list'] = paint(surfaces.list, materials.list);
      variables['--kc-chat'] = translucent(surfaces.chat, settings.wallpaperDim);
      // 聊天以外的页面里贴着画布的面（顶栏、卡片）跟着「顶栏」走
      variables['--kc-chat-surface'] = paint(base.panel, materials.header);
      variables['--kc-side-surface'] = paint(base.panel, materials.sidebar);
      if ((['rail', 'list', 'header', 'sidebar'] as const).some((id) => materials[id].kind !== 'solid')) {
        // 面透了之后，原来的灰字压在上面对比度不够：说明文字、时间这两档灰各加重一档
        variables['--kc-muted'] = dark ? '#b3b9c7' : '#4f5564';
        variables['--kc-subtle'] = dark ? '#8f95a4' : '#767c8b';
      }
      // 面很透的时候，给上面的字垫一圈同色的晕，压在花的图上也认得出
      if (materials.rail.kind !== 'solid' && materials.rail.opacity < 45) {
        variables['--kc-halo-rail-icon'] = `drop-shadow(0 0 2px ${translucent(surfaces.rail, 80)})`;
      }
      if (materials.list.kind !== 'solid' && materials.list.opacity < 45) {
        variables['--kc-halo-list'] = halo(surfaces.list);
      }
      if (materials.sidebar.kind !== 'solid' && materials.sidebar.opacity < 45) {
        variables['--kc-halo-side'] = halo(base.panel);
      }
    } else {
      variables['--kc-wallpaper-veil'] = translucent(surfaces.chat, settings.wallpaperDim);
    }
    if (materials.header.kind !== 'solid' && materials.header.opacity < 45) {
      variables['--kc-halo-header'] = halo(base.panel);
    }
  }

  return variables;
}

function halo(color: string): string {
  const soft = translucent(color, 70);
  return `0 0 1px ${soft}, 0 0 4px ${soft}`;
}
