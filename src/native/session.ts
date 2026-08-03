import type { AuthSession, User } from '@/types/api';
import { isNativeMobileApp, isTauriDesktopApp } from '@/utils/appMode';

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

function canUseLocalAppSession(): boolean {
  return isNativeMobileApp() || isTauriDesktopApp();
}

export async function loadNativeSession(): Promise<AuthSession | null> {
  if (!canUseLocalAppSession()) {
    return null;
  }

  if (isTauriDesktopApp()) {
    return parseSession(window.localStorage.getItem(NATIVE_SESSION_KEY));
  }

  try {
    const { Preferences } = await import('@capacitor/preferences');
    const result = await Preferences.get({ key: NATIVE_SESSION_KEY });
    return parseSession(result.value);
  } catch {
    return parseSession(window.localStorage.getItem(NATIVE_SESSION_KEY));
  }
}

export async function saveNativeSession(session: AuthSession): Promise<void> {
  if (!canUseLocalAppSession()) {
    return;
  }

  const value = JSON.stringify(session);
  if (isTauriDesktopApp()) {
    window.localStorage.setItem(NATIVE_SESSION_KEY, value);
    return;
  }

  try {
    const { Preferences } = await import('@capacitor/preferences');
    await Preferences.set({ key: NATIVE_SESSION_KEY, value });
  } catch {
    window.localStorage.setItem(NATIVE_SESSION_KEY, value);
  }
}

export async function clearNativeSession(): Promise<void> {
  if (!canUseLocalAppSession()) {
    return;
  }

  if (isTauriDesktopApp()) {
    window.localStorage.removeItem(NATIVE_SESSION_KEY);
    return;
  }

  try {
    const { Preferences } = await import('@capacitor/preferences');
    await Preferences.remove({ key: NATIVE_SESSION_KEY });
  } catch {
    window.localStorage.removeItem(NATIVE_SESSION_KEY);
  }
}
