/**
 * 运行平台判断（桌面端区分 Windows / macOS 用）。macOS 的 WKWebView 和浏览器的 UA 里都带 "Macintosh"；
 * iPad 在桌面模式下也会报 Macintosh，所以排除带触摸点的情况。
 */
export function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (!/Macintosh|Mac OS X/i.test(ua)) return false;
  return !(typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1);
}

/** 快捷键提示里的修饰键：macOS 显示 ⌘，其他平台显示 Ctrl */
export function modKeyLabel(): string {
  return isMacPlatform() ? '⌘' : 'Ctrl';
}

/** 「Ctrl+Enter」「⌘↵」这类组合键提示文字 */
export function modKeyCombo(key: string): string {
  return isMacPlatform() ? `⌘${key === 'Enter' ? '↵' : key}` : `Ctrl+${key}`;
}
