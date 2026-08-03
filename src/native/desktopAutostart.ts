import { isTauriDesktopApp } from '@/utils/appMode';

export async function getDesktopAutostartEnabled(): Promise<boolean> {
  if (!isTauriDesktopApp()) {
    return false;
  }

  const { invoke } = await import('@tauri-apps/api/core');
  return Boolean(await invoke<boolean>('get_desktop_autostart_enabled'));
}

export async function setDesktopAutostartEnabled(enabled: boolean): Promise<boolean> {
  if (!isTauriDesktopApp()) {
    return false;
  }

  const { invoke } = await import('@tauri-apps/api/core');
  return Boolean(await invoke<boolean>('set_desktop_autostart_enabled', { enabled }));
}
