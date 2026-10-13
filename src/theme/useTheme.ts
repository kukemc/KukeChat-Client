import { useCallback, useEffect, useMemo, useSyncExternalStore, type CSSProperties } from 'react';
import { useKukeStore } from '@/store/kukeStore';
import { useResolvedThemeMode } from '@/utils/theme';
import { DEFAULT_THEME_SETTINGS, THEME_SECTIONS, conversationRowHeight, isLibraryWallpaper, themeVariables, wallpaperMode, type ThemeEnvironment, type ThemeScheme, type ThemeSection, type ThemeSettings, type WallpaperMode } from './themes';
import { useThemeStore } from './themeStore';
import { loadWallpaperLibrary, useWallpaperEntry } from './wallpaperStore';

export interface ThemeRootProps {
  style: CSSProperties;
  'data-kc-wallpaper': WallpaperMode;
}

/** 某个配色方案当前用的那套设置：深色单独配过就用深色那套，否则两种配色共用一套。 */
export function useThemeSettings(scheme: ThemeScheme): ThemeSettings {
  const shared = useKukeStore((state) => state.themeSettings);
  const dark = useThemeStore((state) => state.dark);
  return scheme === 'dark' && dark ? dark : shared;
}

function useMediaQuery(query: string): boolean {
  const subscribe = useCallback((notify: () => void) => {
    if (typeof window === 'undefined' || !window.matchMedia) {
      return () => undefined;
    }
    const media = window.matchMedia(query);
    media.addEventListener?.('change', notify);
    return () => media.removeEventListener?.('change', notify);
  }, [query]);
  return useSyncExternalStore(subscribe, () => typeof window !== 'undefined' && Boolean(window.matchMedia?.(query).matches), () => false);
}

const BACKDROP_FILTER_SUPPORTED = typeof CSS === 'undefined' || !CSS.supports || CSS.supports('backdrop-filter', 'blur(1px)') || CSS.supports('-webkit-backdrop-filter', 'blur(1px)');

/** 实时模糊现在能不能用，以及不能用的原因。设置界面拿它来解释，主题引擎拿它来退化。 */
export function useRealtimeBlurStatus(): { enabled: boolean; reason: 'performance' | 'reduced-transparency' | 'unsupported' | null } {
  const performance = useThemeStore((state) => state.performance);
  const reducedTransparency = useMediaQuery('(prefers-reduced-transparency: reduce)');
  const reason = !BACKDROP_FILTER_SUPPORTED ? 'unsupported' : reducedTransparency ? 'reduced-transparency' : performance ? 'performance' : null;
  return { enabled: reason === null, reason };
}

export function useThemeEnvironment(): ThemeEnvironment {
  const { enabled } = useRealtimeBlurStatus();
  return useMemo(() => ({ performance: !enabled }), [enabled]);
}

/**
 * 给界面根节点（带 data-theme 的那个元素）用：返回要挂上去的 CSS 变量和背景模式。
 * 变量写在内联 style 上，优先级高于样式表里的默认主题。根节点里还要放一个 <ThemeEffects />，毛玻璃靠它对齐。
 */
export function useThemeRootProps(scheme: ThemeScheme): ThemeRootProps {
  const settings = useThemeSettings(scheme);
  const environment = useThemeEnvironment();
  const wallpaperUrl = useWallpaperEntry(settings.wallpaper)?.url ?? null;

  useEffect(() => {
    void loadWallpaperLibrary();
  }, []);

  return useMemo(() => ({
    style: themeVariables(settings, scheme, wallpaperUrl, false, environment) as CSSProperties,
    'data-kc-wallpaper': wallpaperMode(settings, scheme, wallpaperUrl)
  }), [environment, scheme, settings, wallpaperUrl]);
}

/** 会话列表的行高跟着界面密度走。列表是定高的虚拟列表，得在组件里知道这个数。 */
export function useConversationRowHeight(): number {
  const scheme = useResolvedThemeMode(useKukeStore((state) => state.themeMode));
  return conversationRowHeight(useThemeSettings(scheme).density);
}

/** 被当前主题或任何一份「我的主题」引用着的图库图片：淘汰旧图时不能动它们。 */
export function wallpapersInUse(): Set<string> {
  const { dark, saved } = useThemeStore.getState();
  const all = [useKukeStore.getState().themeSettings, dark, ...saved.flatMap((theme) => [theme.light, theme.dark])];
  return new Set(all.filter((settings): settings is ThemeSettings => settings !== null).map((settings) => settings.wallpaper).filter(isLibraryWallpaper));
}

/** 把一整套主题换上去（应用「我的主题」、导入主题时用）。 */
export function applyTheme(light: ThemeSettings, dark: ThemeSettings | null, savedId: string | null = null): void {
  useKukeStore.setState({ themeSettings: light });
  useThemeStore.getState().setDark(dark);
  useThemeStore.getState().setActiveSaved(savedId);
}

export interface ThemeEditor {
  settings: ThemeSettings;
  /** 浅色、深色是否各用一套。 */
  split: boolean;
  update: (patch: Partial<ThemeSettings>) => void;
  setSplit: (split: boolean) => void;
  /** 把某一节恢复成默认值。 */
  resetSection: (section: ThemeSection) => void;
  /** 全部恢复默认：两种配色都回到出厂状态。 */
  resetAll: () => void;
}

/** 设置界面用：读写「正在看的这个配色方案」的那套设置。 */
export function useThemeEditor(scheme: ThemeScheme): ThemeEditor {
  const settings = useThemeSettings(scheme);
  const split = useThemeStore((state) => state.dark !== null);
  const editingDark = split && scheme === 'dark';

  const update = useCallback((patch: Partial<ThemeSettings>) => {
    if (editingDark) {
      useThemeStore.getState().updateDark(patch);
    } else {
      useKukeStore.getState().updateThemeSettings(patch);
    }
  }, [editingDark]);

  const setSplit = useCallback((next: boolean) => {
    const shared = useKukeStore.getState().themeSettings;
    const dark = useThemeStore.getState().dark;
    if (next) {
      useThemeStore.getState().setDark(dark ?? shared);
    } else {
      // 合回一套：保留眼前正在用的这一套
      if (scheme === 'dark' && dark) {
        useKukeStore.setState({ themeSettings: dark });
      }
      useThemeStore.getState().setDark(null);
    }
  }, [scheme]);

  const resetSection = useCallback((section: ThemeSection) => {
    const patch: Partial<ThemeSettings> = {};
    for (const key of THEME_SECTIONS[section]) {
      Object.assign(patch, { [key]: DEFAULT_THEME_SETTINGS[key] });
    }
    update(patch);
  }, [update]);

  const resetAll = useCallback(() => applyTheme(DEFAULT_THEME_SETTINGS, null), []);

  return { settings, split, update, setSplit, resetSection, resetAll };
}
