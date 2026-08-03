export function isNativeMobileApp(): boolean {
  return typeof window !== 'undefined' && window.__KukeChatAppMode === 'native-mobile';
}

export function isTauriDesktopApp(): boolean {
  return typeof window !== 'undefined' && (window.__KukeChatAppMode === 'tauri-desktop' || '__TAURI_INTERNALS__' in window);
}
