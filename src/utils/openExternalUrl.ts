import { isTauriDesktopApp } from '@/utils/appMode';

export async function openExternalUrl(url: string): Promise<void> {
  const normalized = url.trim();
  if (!/^https?:\/\//i.test(normalized)) {
    return;
  }

  if (isTauriDesktopApp()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('open_external_url', { url: normalized });
      return;
    } catch {
      // Fall through to the browser behavior for web previews or older desktop builds.
    }
  }

  window.open(normalized, '_blank', 'noopener,noreferrer');
}
