/**
 * 游戏模式的授权流程。
 *
 * 游戏模式**只接受安全登录**：作品页面永远拿不到用户的账号密码，登录始终发生在
 * 后端自己的 `/login` 页面里，作品侧只能拿到一个换取来的令牌。
 *
 * 流程本身对用户是「一次授权，长期有效」：
 *
 *   点授权 → 尝试用浏览器里已有的安全登录 Cookie 换令牌
 *            ├─ 成功 → 直接完成，不需要输密码
 *            └─ 401  → 弹出安全登录页 → 登录成功后自动重试换令牌
 *
 * 只要 Cookie 还在，之后进入任何作品都只是一次静默的换令牌，不会再打扰用户。
 */

import { getCookieSession, openSecureLoginPopup } from '@/api/auth';
import { ApiError } from '@/api/client';
import { SECURE_LOGIN_ORIGIN } from '@/config';
import type { AuthSession } from '@/types/api';

const STORAGE_KEY = 'kukechat-game-mode-session';
/** 安全登录弹窗最长等待时间，超时后不再阻塞玩家。 */
const POPUP_TIMEOUT_MS = 180_000;

export interface GameAuthState {
  token: string | null;
  userId: number | null;
  displayName: string | null;
  avatarUrl: string | null;
}

const ANONYMOUS: GameAuthState = { token: null, userId: null, displayName: null, avatarUrl: null };

let current: GameAuthState = { ...ANONYMOUS };
const listeners = new Set<(state: GameAuthState) => void>();

function emit(): void {
  for (const listener of listeners) {
    listener(current);
  }
}

export function subscribeGameAuth(listener: (state: GameAuthState) => void): () => void {
  listeners.add(listener);
  listener(current);
  return () => listeners.delete(listener);
}

export function getGameAuth(): GameAuthState {
  return current;
}

export function isGameAuthorized(): boolean {
  return Boolean(current.token);
}

function applySession(session: AuthSession): void {
  current = {
    token: session.token,
    userId: session.user.id,
    displayName: session.user.nickname || session.user.username,
    avatarUrl: session.user.avatar_url ?? null
  };
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // 隐私模式下 sessionStorage 可能不可用，失败不影响本次会话
  }
  emit();
}

export function clearGameAuth(): void {
  current = { ...ANONYMOUS };
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // 同上
  }
  emit();
}

/** 页面加载时恢复上次的令牌，避免同一次游玩里反复授权。 */
export function restoreGameAuth(): void {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return;
    }
    const parsed = JSON.parse(raw) as Partial<GameAuthState>;
    if (typeof parsed.token === 'string' && parsed.token && typeof parsed.userId === 'number') {
      current = {
        token: parsed.token,
        userId: parsed.userId,
        displayName: typeof parsed.displayName === 'string' ? parsed.displayName : null,
        avatarUrl: typeof parsed.avatarUrl === 'string' ? parsed.avatarUrl : null
      };
      emit();
    }
  } catch {
    // 存储内容损坏时按未授权处理
  }
}

/**
 * 静默授权：只尝试用已有的安全登录 Cookie 换令牌，不弹任何窗口。
 *
 * 用于作品加载时判断玩家能否直接发言。
 */
export async function trySilentAuthorize(): Promise<boolean> {
  try {
    applySession(await getCookieSession());
    return true;
  } catch {
    return false;
  }
}

function waitForSecureLogin(popup: Window | null): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;

    const finish = (ok: boolean): void => {
      if (settled) {
        return;
      }
      settled = true;
      window.removeEventListener('message', onMessage);
      window.clearInterval(closedTimer);
      window.clearTimeout(timeoutTimer);
      resolve(ok);
    };

    function onMessage(event: MessageEvent): void {
      if (event.origin !== SECURE_LOGIN_ORIGIN) {
        return;
      }
      if ((event.data as { type?: string } | null)?.type === 'kukechat.cookie-login.success') {
        finish(true);
      }
    }

    window.addEventListener('message', onMessage);

    // 用户直接关掉弹窗时也要结束等待，否则授权按钮会一直转圈
    const closedTimer = window.setInterval(() => {
      if (popup && popup.closed) {
        finish(false);
      }
    }, 500);

    const timeoutTimer = window.setTimeout(() => finish(false), POPUP_TIMEOUT_MS);
  });
}

export type GameAuthorizeResult = 'authorized' | 'cancelled' | 'blocked';

/**
 * 完整授权流程。已有安全登录会话时不会弹窗。
 *
 * 返回 `blocked` 表示浏览器拦截了弹窗，需要提示玩家放行。
 */
export async function authorizeGameMode(): Promise<GameAuthorizeResult> {
  if (await trySilentAuthorize()) {
    return 'authorized';
  }

  const popup = openSecureLoginPopup();
  if (!popup) {
    return 'blocked';
  }

  const loggedIn = await waitForSecureLogin(popup);
  if (!loggedIn) {
    return 'cancelled';
  }

  // 登录页刚种下 Cookie，这里再换一次令牌
  return (await trySilentAuthorize()) ? 'authorized' : 'cancelled';
}

/** 令牌失效时清空并尝试静默续期，返回是否仍可发言。 */
export async function refreshGameAuthAfterFailure(error: unknown): Promise<boolean> {
  if (!(error instanceof ApiError) || error.status !== 401) {
    return isGameAuthorized();
  }
  clearGameAuth();
  return trySilentAuthorize();
}
