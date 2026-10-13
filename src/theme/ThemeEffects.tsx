import { useEffect, useMemo, useRef } from 'react';
import { frostImage, frostStats } from './frost';
import { ALIGN_FACTOR, TILE_WIDTH, builtinFrostImage, frostRoles, isLibraryWallpaper, wallpaperMode, wallpaperPlacement, type FrostRole, type ThemeScheme, type ThemeSettings, type WallpaperAlign, type WallpaperFit } from './themes';
import { useThemeSettings } from './useTheme';
import { useWallpaperEntry } from './wallpaperStore';

/**
 * 毛玻璃的「预模糊背景」怎么落到各个面上。
 *
 * 做法：每个玻璃面的背景里垫一张模糊过的背景图，尺寸和位置换算成「和底下那张清晰的背景图完全重合」。
 * 这样面里看到的就是它正下方那块背景的模糊版——和 backdrop-filter 的结果一样，但面是静态的，之后不产生任何绘制。
 *
 * 为什么不用别的办法（用一个独立的测试页对比过：窗口无 transform、窗口带缩放、中间层留有 transform 三种情况）：
 *   · background-attachment: fixed —— 相对的是浏览器视口而不是我们的窗口，三种情况都对不上；
 *     祖先一有 transform 它还会退化成 scroll。扩展里的浮窗可以拖动、缩放，没法用。
 *   · 给面套一个 position: fixed 的伪元素再用 clip-path 裁 —— 只有「窗口自己带 transform、中间没有别的 transform」时才对得上；
 *     而页面的进场动画结束后会留下 transform，把它截在中间那一层。
 *   · 真的 backdrop-filter —— 附近一有重绘就要重新模糊一遍；而且任何一层祖先带着 filter（进场动画同样会留下），
 *     它就取不到窗口底层的背景图，只能模糊那一层里面的内容。
 * 量布局坐标的办法在三种情况下都对齐。量的是 offsetLeft 一路加上去，不是 getBoundingClientRect：
 * 后者会把进场动画的位移、浮窗的缩放都算进去。
 *
 * 开销：只在「某个面或宿主的尺寸变了」（ResizeObserver）和「界面里多了或少了面」（MutationObserver，一帧最多扫一次）时才量，
 * 量完和上次一样就什么都不写。滚动消息列表不会触发它。
 */

interface TargetRule {
  role: FrostRole;
  /** 写到元素上的 data-kc-frost 值，样式表按它决定叠哪种底色。 */
  tint: string;
  selector: string;
  accept?: (element: HTMLElement) => boolean;
}

/* 任何元素都可以用 data-kc-surface="<面>" 声明自己是哪种面（外观设置里的预览就是这么接进来的） */
const RULES: TargetRule[] = [
  { role: 'rail', tint: 'rail', selector: '.ksh-rail, [data-kc-surface="rail"]' },
  { role: 'rail', tint: 'titlebar', selector: '.kwf-titlebar' },
  { role: 'list', tint: 'list', selector: '.ksh-pane, [data-kc-surface="list"]' },
  { role: 'header', tint: 'header', selector: '.kcd-header, [data-kc-surface="header"]' },
  { role: 'composer', tint: 'composer', selector: '.kcd-composer, .kcd-selection-bar, [data-kc-surface="composer"]' },
  { role: 'sidebar', tint: 'sidebar', selector: '.kcd-sidebar, [data-kc-surface="sidebar"]' },
  // 聊天以外的页面：整块内容区垫上模糊的背景，页面里那些半透明的卡片、列表栏就都成了玻璃。聊天页的画布要露出清晰的背景，不算
  { role: 'page', tint: 'page', selector: '.kc-pc-view, [data-kc-surface="page"]', accept: (element) => !element.querySelector(':scope > .kcd') }
];

const HOST_SELECTOR = { window: '[data-kc-wallpaper="window"]', chat: '.kcd-column' } as const;
const VARIABLES = ['--kc-fx', '--kc-fy', '--kc-fw', '--kc-fh'];
/**
 * 模糊半径是按「图片显示出来大约这么宽」换算到原图上的。取聊天区和整窗之间的一个常见值：
 * 模糊图只在换图、换强度时算一次，不跟着窗口大小重算，所以窗口越大模糊看起来越重一点，和图片一起等比放大。
 */
const DISPLAY_REFERENCE = 1100;

interface AlignConfig {
  mode: 'chat' | 'window';
  roles: FrostRole[];
  /** 用户图片的原始尺寸和摆法；内置背景是拉伸铺满宿主的，为 null。 */
  image: { width: number; height: number; fit: WallpaperFit; align: WallpaperAlign } | null;
}

export const alignStats = { scans: 0, measures: 0, writes: 0 };

/** 元素（边框盒左上角）相对宿主内边距盒的布局坐标。 */
function offsetWithin(element: HTMLElement, host: HTMLElement): { x: number; y: number } | null {
  let x = 0;
  let y = 0;
  let node: HTMLElement = element;
  while (node !== host) {
    const parent = node.offsetParent as HTMLElement | null;
    if (!parent || !host.contains(parent)) {
      return null;
    }
    x += node.offsetLeft;
    y += node.offsetTop;
    if (parent !== host) {
      x += parent.clientLeft;
      y += parent.clientTop;
    }
    node = parent;
  }
  return { x, y };
}

/** 背景图在宿主里画在哪、画多大。和 CSS 的 background-size / background-position 是同一套算法。 */
function placeImage(hostWidth: number, hostHeight: number, image: AlignConfig['image']): { x: number; y: number; width: number; height: number } {
  if (!image || image.fit === 'stretch' || image.width <= 0 || image.height <= 0) {
    return { x: 0, y: 0, width: hostWidth, height: hostHeight };
  }
  const scale = image.fit === 'tile'
    ? TILE_WIDTH / image.width
    : image.fit === 'cover' ? Math.max(hostWidth / image.width, hostHeight / image.height) : Math.min(hostWidth / image.width, hostHeight / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  const [alignX, alignY] = ALIGN_FACTOR[image.align];
  return { x: (hostWidth - width) * alignX, y: (hostHeight - height) * alignY, width, height };
}

class FrostAligner {
  private config: AlignConfig | null = null;
  private targets = new Map<HTMLElement, { rule: TargetRule; host: HTMLElement }>();
  private written = new WeakMap<HTMLElement, string>();
  private frame = 0;
  private readonly resize: ResizeObserver;
  private readonly mutation: MutationObserver;

  constructor(private readonly root: HTMLElement) {
    this.resize = new ResizeObserver(() => this.measure());
    this.mutation = new MutationObserver(() => {
      if (this.config && !this.frame) {
        // 攒到下一帧开头再扫：这一帧里新出现的面随后被 ResizeObserver 量到，赶得上首次绘制
        this.frame = requestAnimationFrame(() => {
          this.frame = 0;
          this.scan();
        });
      }
    });
    this.mutation.observe(root, { childList: true, subtree: true });
  }

  configure(config: AlignConfig | null): void {
    this.config = config;
    this.scan();
    this.measure();
  }

  destroy(): void {
    cancelAnimationFrame(this.frame);
    this.mutation.disconnect();
    this.resize.disconnect();
    for (const element of this.targets.keys()) {
      this.release(element);
    }
    this.targets.clear();
  }

  private release(element: HTMLElement): void {
    element.removeAttribute('data-kc-frost');
    for (const name of VARIABLES) {
      element.style.removeProperty(name);
    }
    this.written.delete(element);
  }

  /** 找出当前该垫模糊背景的元素。只查 DOM，不读布局。 */
  private scan(): void {
    alignStats.scans += 1;
    const found = new Map<HTMLElement, { rule: TargetRule; host: HTMLElement }>();
    const config = this.config;
    if (config) {
      for (const rule of RULES) {
        if (!config.roles.includes(rule.role)) {
          continue;
        }
        for (const element of this.root.querySelectorAll<HTMLElement>(rule.selector)) {
          const host = element.closest<HTMLElement>(HOST_SELECTOR[config.mode]);
          if (host && host !== element && !found.has(element) && (!rule.accept || rule.accept(element))) {
            found.set(element, { rule, host });
          }
        }
      }
    }
    let changed = found.size !== this.targets.size;
    for (const [element, entry] of this.targets) {
      const next = found.get(element);
      if (!next || next.host !== entry.host || next.rule !== entry.rule) {
        changed = true;
        if (!next) {
          this.release(element);
        }
      }
    }
    if (!changed) {
      return;
    }
    this.targets = found;
    this.resize.disconnect();
    const hosts = new Set<HTMLElement>();
    for (const [element, entry] of found) {
      this.resize.observe(element);
      hosts.add(entry.host);
    }
    hosts.forEach((host) => this.resize.observe(host));
  }

  private measure(): void {
    const config = this.config;
    if (!config) {
      return;
    }
    alignStats.measures += 1;
    for (const [element, { rule, host }] of this.targets) {
      const offset = offsetWithin(element, host);
      if (!offset) {
        continue;
      }
      const placed = placeImage(host.clientWidth, host.clientHeight, config.image);
      // 背景的定位原点是元素的内边距盒，所以要再减掉元素自己的边框
      const values = [placed.x - offset.x - element.clientLeft, placed.y - offset.y - element.clientTop, placed.width, placed.height].map((value) => `${Math.round(value * 100) / 100}px`);
      const signature = `${rule.tint}|${values.join('|')}`;
      if (this.written.get(element) === signature) {
        continue;
      }
      alignStats.writes += 1;
      this.written.set(element, signature);
      element.setAttribute('data-kc-frost', rule.tint);
      VARIABLES.forEach((name, index) => element.style.setProperty(name, values[index]));
    }
  }
}

/**
 * 放在主题根节点里面（任意位置，自己不占地方）。负责两件事：
 *   1. 用户图片的模糊版是现算的，算好后把地址写到根节点的变量上；
 *   2. 把模糊版对齐到每个玻璃面上。
 * 没放它的地方主题照常生效，只是毛玻璃退化成半透明、背景模糊不起作用。
 *
 * @param settings 不传就读当前主题；预览页自己管主题状态时可以传进来。
 */
export function ThemeEffects({ scheme, settings: override }: { scheme: ThemeScheme; settings?: ThemeSettings }): JSX.Element {
  const stored = useThemeSettings(scheme);
  const settings = override ?? stored;
  const entry = useWallpaperEntry(settings.wallpaper);
  const markerRef = useRef<HTMLSpanElement>(null);
  const alignerRef = useRef<FrostAligner | null>(null);

  const library = isLibraryWallpaper(settings.wallpaper);
  const mode = wallpaperMode(settings, scheme, entry?.url ?? null);
  const roles = useMemo(() => frostRoles(settings, mode), [mode, settings]);
  const rolesKey = roles.join(',');
  const builtinFrost = library ? null : builtinFrostImage(settings, scheme);
  const { wallpaper, wallpaperFit, wallpaperAlign, wallpaperBlur, wallpaperSaturation, glassBlur } = settings;
  const placement = wallpaperPlacement(settings);
  const imageWidth = entry?.width ?? 0;
  const imageHeight = entry?.height ?? 0;

  useEffect(() => {
    const root = markerRef.current?.closest<HTMLElement>('[data-layout]');
    if (!root) {
      return undefined;
    }
    const aligner = new FrostAligner(root);
    alignerRef.current = aligner;
    if (import.meta.env.DEV) {
      Object.assign(window, { __kcThemeStats: { frost: frostStats, align: alignStats } });
    }
    return () => {
      aligner.destroy();
      alignerRef.current = null;
    };
  }, []);

  // 模糊版的地址
  useEffect(() => {
    const root = markerRef.current?.closest<HTMLElement>('[data-layout]');
    if (!root || mode === 'none') {
      return undefined;
    }
    if (!library) {
      if (builtinFrost) {
        root.style.setProperty('--kc-frost-image', builtinFrost);
      }
      return () => root.style.removeProperty('--kc-frost-image');
    }
    if (imageWidth <= 0) {
      return undefined;
    }
    let cancelled = false;
    const wrap = wallpaperFit === 'tile';
    const displayScale = wrap ? TILE_WIDTH / imageWidth : DISPLAY_REFERENCE / Math.max(imageWidth, imageHeight);
    // 拖滑杆时参数连着变，等手停下来再算
    const timer = window.setTimeout(() => {
      if (wallpaperBlur > 0) {
        // 饱和度由样式表的 filter 统一加在背景层上，这里不重复烘
        void frostImage(wallpaper, { radius: wallpaperBlur, saturation: 100, wrap, displayScale }).then((image) => {
          if (!cancelled && image) {
            root.style.setProperty('--kc-wallpaper-soft-bg', `url("${image.url}") ${placement}`);
          }
        });
      } else {
        root.style.removeProperty('--kc-wallpaper-soft-bg');
      }
      if (rolesKey) {
        void frostImage(wallpaper, { radius: Math.round(Math.hypot(wallpaperBlur, glassBlur)), saturation: wallpaperSaturation, wrap, displayScale }).then((image) => {
          if (!cancelled && image) {
            root.style.setProperty('--kc-frost-image', `url("${image.url}")`);
          }
        });
      }
    }, 140);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [builtinFrost, glassBlur, imageHeight, imageWidth, library, mode, placement, rolesKey, wallpaper, wallpaperBlur, wallpaperFit, wallpaperSaturation]);

  // 换了图、没了背景：之前算出来的地址不能留着
  useEffect(() => {
    const root = markerRef.current?.closest<HTMLElement>('[data-layout]');
    return () => {
      root?.style.removeProperty('--kc-wallpaper-soft-bg');
      root?.style.removeProperty('--kc-frost-image');
    };
  }, [library, mode, wallpaper]);

  // 对齐
  useEffect(() => {
    alignerRef.current?.configure(mode === 'none' || !rolesKey ? null : {
      mode,
      roles: rolesKey.split(',') as FrostRole[],
      image: library ? { width: imageWidth, height: imageHeight, fit: wallpaperFit, align: wallpaperAlign } : null
    });
  }, [imageHeight, imageWidth, library, mode, rolesKey, wallpaperAlign, wallpaperFit]);

  return <span ref={markerRef} hidden data-kc-effects="" />;
}
