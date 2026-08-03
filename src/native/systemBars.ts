import { Capacitor, registerPlugin } from '@capacitor/core';
import type { ResolvedThemeMode } from '@/utils/theme';

type KukeSystemBarsPlugin = {
  setStyle(options: { light: boolean }): Promise<void>;
};

const KukeSystemBars = registerPlugin<KukeSystemBarsPlugin>('KukeSystemBars');

export async function setNativeSystemBarsTheme(theme: ResolvedThemeMode): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  await KukeSystemBars.setStyle({ light: theme === 'light' }).catch(() => undefined);
}
