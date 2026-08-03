import { isTauriDesktopApp } from '@/utils/appMode';

let lastAttentionAt = 0;
const ATTENTION_COOLDOWN_MS = 1200;

function isBrowserWindowFocused(): boolean {
  return typeof document !== 'undefined' && document.hasFocus() && document.visibilityState === 'visible';
}

export async function requestDesktopAttention(): Promise<void> {
  if (!isTauriDesktopApp() || isBrowserWindowFocused()) {
    return;
  }

  const now = Date.now();
  if (now - lastAttentionAt < ATTENTION_COOLDOWN_MS) {
    return;
  }
  lastAttentionAt = now;

  try {
    const [{ invoke }, { getCurrentWindow, UserAttentionType }] = await Promise.all([import('@tauri-apps/api/core'), import('@tauri-apps/api/window')]);
    void invoke('flash_tray_for_message').catch(() => undefined);
    const appWindow = getCurrentWindow();
    if (await appWindow.isFocused()) {
      return;
    }
    await appWindow.requestUserAttention(UserAttentionType.Informational);
  } catch {
    // Browser builds and older desktop builds can safely ignore taskbar attention.
  }
}
