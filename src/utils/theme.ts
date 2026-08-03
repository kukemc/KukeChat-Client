import { useEffect, useState } from 'react';
import type { ThemeMode } from '@/store/kukeStore';

export type ResolvedThemeMode = 'light' | 'dark';

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function resolveThemeMode(themeMode: ThemeMode): ResolvedThemeMode {
  if (themeMode === 'system') {
    return systemPrefersDark() ? 'dark' : 'light';
  }
  return themeMode;
}

export function useResolvedThemeMode(themeMode: ThemeMode): ResolvedThemeMode {
  const [resolvedThemeMode, setResolvedThemeMode] = useState<ResolvedThemeMode>(() => resolveThemeMode(themeMode));

  useEffect(() => {
    setResolvedThemeMode(resolveThemeMode(themeMode));
    if (themeMode !== 'system' || typeof window === 'undefined') {
      return;
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setResolvedThemeMode(mediaQuery.matches ? 'dark' : 'light');
    mediaQuery.addEventListener?.('change', update);
    return () => mediaQuery.removeEventListener?.('change', update);
  }, [themeMode]);

  return resolvedThemeMode;
}
