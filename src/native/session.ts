import type { AuthSession, User } from '@/types/api';
import { isTauriDesktopApp } from '@/utils/appMode';

const NATIVE_SESSION_KEY = 'kukechat-native-session';

function isUser(value: unknown): value is User {
  return typeof value === 'object' && value !== null && typeof (value as { id?: unknown }).id === 'number' && typeof (value as { username?: unknown }).username === 'string';
}

function parseSession(value: string | null): AuthSession | null {
  if (!value) {
    return null;
  }
  try {
    const parsed = JSON.parse(value) as { token?: unknown; user?: unknown };
    if (typeof parsed.token === 'string' && parsed.token && isUser(parsed.user)) {
      return { token: parsed.token, user: parsed.user };
    }
  } catch {
    // Ignore invalid local data.
  }
  return null;
}

/** 只有桌面端把登录态单独存一份；扩展形态的登录态走 store 的持久化。 */
export async function loadNativeSession(): Promise<AuthSession | null> {
  if (!isTauriDesktopApp()) {
    return null;
  }
  return parseSession(window.localStorage.getItem(NATIVE_SESSION_KEY));
}

export async function saveNativeSession(session: AuthSession): Promise<void> {
  if (!isTauriDesktopApp()) {
    return;
  }
  window.localStorage.setItem(NATIVE_SESSION_KEY, JSON.stringify(session));
}

export async function clearNativeSession(): Promise<void> {
  if (!isTauriDesktopApp()) {
    return;
  }
  window.localStorage.removeItem(NATIVE_SESSION_KEY);
}
