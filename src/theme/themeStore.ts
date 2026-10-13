import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { sanitizeThemeSettings, type ThemeSettings } from './themes';

/**
 * 主题里「当前这一套」以外的东西：深色单独的一套、性能优先开关、存下来的「我的主题」。
 *
 * 当前主题（浅色，或两种配色共用的那一套）仍在 kukeStore.themeSettings 里——它是 1.x 就有的字段，
 * 各处都在读，留在原地迁移成本最低。这里单独持久化，键名不同，互不影响。
 */

export interface SavedTheme {
  id: string;
  name: string;
  light: ThemeSettings;
  /** 深色单独的一套；null 表示这份主题两种配色共用 light。 */
  dark: ThemeSettings | null;
  savedAt: number;
}

export const MAX_SAVED_THEMES = 24;
export const MAX_THEME_NAME = 24;

/** 主题名只当文字显示，但仍然去掉控制字符并限长：它可能来自别人分享的主题码。 */
export function cleanThemeName(value: unknown, fallback = '未命名主题'): string {
  if (typeof value !== 'string') {
    return fallback;
  }
  const cleaned = Array.from(value.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202f\ufeff]/g, '').trim()).slice(0, MAX_THEME_NAME).join('');
  return cleaned || fallback;
}

function newThemeId(): string {
  return `t${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

interface ThemeStoreState {
  /** 深色配色单独的一套设置；null 表示浅色、深色共用 kukeStore.themeSettings。 */
  dark: ThemeSettings | null;
  /** 性能优先：关掉所有实时模糊。 */
  performance: boolean;
  saved: SavedTheme[];
  /** 当前这套是从哪份「我的主题」来的，用来显示「已修改」和提供覆盖保存。 */
  activeSavedId: string | null;
  setDark: (settings: ThemeSettings | null) => void;
  updateDark: (patch: Partial<ThemeSettings>) => void;
  setPerformance: (performance: boolean) => void;
  setActiveSaved: (id: string | null) => void;
  /** 存一份新主题，返回它的 id；已经存满时返回 null。 */
  saveTheme: (name: string, light: ThemeSettings, dark: ThemeSettings | null) => string | null;
  overwriteTheme: (id: string, light: ThemeSettings, dark: ThemeSettings | null) => void;
  renameTheme: (id: string, name: string) => void;
  deleteTheme: (id: string) => void;
}

type PersistedThemeState = Pick<ThemeStoreState, 'dark' | 'performance' | 'saved' | 'activeSavedId'>;

function sanitizePersisted(value: unknown): PersistedThemeState {
  const source = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
  const saved: SavedTheme[] = [];
  for (const item of Array.isArray(source.saved) ? source.saved.slice(0, MAX_SAVED_THEMES) : []) {
    if (typeof item !== 'object' || item === null) {
      continue;
    }
    const theme = item as Record<string, unknown>;
    if (typeof theme.id !== 'string' || !/^t[a-z0-9]{4,24}$/.test(theme.id) || saved.some((existing) => existing.id === theme.id)) {
      continue;
    }
    saved.push({
      id: theme.id,
      name: cleanThemeName(theme.name),
      light: sanitizeThemeSettings(theme.light),
      dark: typeof theme.dark === 'object' && theme.dark !== null ? sanitizeThemeSettings(theme.dark) : null,
      savedAt: typeof theme.savedAt === 'number' && Number.isFinite(theme.savedAt) ? theme.savedAt : 0
    });
  }
  const activeSavedId = typeof source.activeSavedId === 'string' && saved.some((theme) => theme.id === source.activeSavedId) ? source.activeSavedId : null;
  return {
    dark: typeof source.dark === 'object' && source.dark !== null ? sanitizeThemeSettings(source.dark) : null,
    performance: source.performance === true,
    saved,
    activeSavedId
  };
}

export const useThemeStore = create<ThemeStoreState>()(
  persist<ThemeStoreState, [], [], PersistedThemeState>(
    (set, get) => ({
      dark: null,
      performance: false,
      saved: [],
      activeSavedId: null,
      setDark: (settings) => set({ dark: settings ? sanitizeThemeSettings(settings) : null }),
      updateDark: (patch) => set((state) => (state.dark ? { dark: sanitizeThemeSettings({ ...state.dark, ...patch }) } : {})),
      setPerformance: (performance) => set({ performance }),
      setActiveSaved: (id) => set({ activeSavedId: id }),
      saveTheme: (name, light, dark) => {
        if (get().saved.length >= MAX_SAVED_THEMES) {
          return null;
        }
        const id = newThemeId();
        set((state) => ({ saved: [...state.saved, { id, name: cleanThemeName(name), light, dark, savedAt: Date.now() }], activeSavedId: id }));
        return id;
      },
      overwriteTheme: (id, light, dark) => set((state) => ({ saved: state.saved.map((theme) => (theme.id === id ? { ...theme, light, dark, savedAt: Date.now() } : theme)) })),
      renameTheme: (id, name) => set((state) => ({ saved: state.saved.map((theme) => (theme.id === id ? { ...theme, name: cleanThemeName(name, theme.name) } : theme)) })),
      deleteTheme: (id) => set((state) => ({ saved: state.saved.filter((theme) => theme.id !== id), activeSavedId: state.activeSavedId === id ? null : state.activeSavedId }))
    }),
    {
      name: 'kukechat-theme-library',
      version: 1,
      migrate: (persisted) => sanitizePersisted(persisted),
      merge: (persisted, current) => ({ ...current, ...sanitizePersisted(persisted) }),
      partialize: (state) => ({ dark: state.dark, performance: state.performance, saved: state.saved, activeSavedId: state.activeSavedId })
    }
  )
);
