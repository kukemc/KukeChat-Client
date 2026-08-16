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
import { showGameModal } from './modal';
import { muteSendPrompt, setSendPermission, unmuteSendPrompt } from './permissions';

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

const ALLOW_SEND_ID = 'allow-send';

/**
 * 授权前的确认弹窗。
 *
 * 这一步不能省：授权会把玩家的账号自动加入作品绑定的群，还可能把发言能力
 * 交给作品。玩家必须在看清后果后主动点确认，而不是点一下按钮就静默完成。
 *
 * 「允许本作品代我发言」**默认不勾选** —— 收消息不需要它，只有作品调用
 * 发送积木时才需要，届时会单独再问一次。
 */
async function confirmAuthorization(groupTitle: string | null): Promise<{ ok: boolean; allowSend: boolean }> {
  const target = groupTitle ? `「${groupTitle}」` : '本作品绑定的群聊';
  const result = await showGameModal({
    title: '授权 KukeChat 账号',
    paragraphs: [
      '本作品接入了 KukeChat 群聊。授权后你就能在作品内直接看到群消息并参与聊天。',
      '登录始终在 KukeChat 自己的页面完成，本作品拿不到你的账号和密码。'
    ],
    notices: [
      `授权后你的 KukeChat 账号会自动加入${target}。`,
      '你在群里的发言与普通成员一样，群主的禁言、限速与管理规则同样适用。'
    ],
    checkboxes: [
      {
        id: ALLOW_SEND_ID,
        label: '允许本作品代我发送消息',
        hint: '作品将能用积木以你的身份在群里发言。不勾选也能正常收消息；之后作品需要时会再征求你同意。',
        checked: false
      }
    ],
    confirmText: '同意并授权',
    cancelText: '取消'
  });
  return { ok: result.confirmed, allowSend: Boolean(result.checked[ALLOW_SEND_ID]) };
}

/**
 * 完整授权流程。
 *
 * 无论是否已有安全登录会话，都会先弹确认框 —— 「已经登录过」不等于
 * 「同意把账号接入这个作品」，这两件事必须分开征求。
 */
export async function authorizeGameMode(options: { groupTitle?: string | null; creationOid?: string | null } = {}): Promise<GameAuthorizeResult> {
  const confirmed = await confirmAuthorization(options.groupTitle ?? null);
  if (!confirmed.ok) {
    return 'cancelled';
  }

  // 玩家在授权框里勾了就直接记下，省得作品第一次发言时再问一遍
  if (confirmed.allowSend) {
    setSendPermission(options.creationOid, 'granted');
    unmuteSendPrompt(options.creationOid);
  } else {
    setSendPermission(options.creationOid, 'unset');
  }

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

/**
 * 作品调用发送积木但还没拿到发言权限时，向玩家申请。
 *
 * 提供「之后不再提示」，避免作品用循环反复弹窗骚扰玩家。
 */
export async function requestSendPermission(options: {
  groupTitle?: string | null;
  creationOid?: string | null;
  preview?: string;
}): Promise<boolean> {
  const MUTE_ID = 'mute';
  const target = options.groupTitle ? `「${options.groupTitle}」` : '群聊';
  const paragraphs = ['本作品想以你的身份在群里发送消息。'];
  if (options.preview) {
    paragraphs.push(`本次内容：${options.preview}`);
  }

  const result = await showGameModal({
    title: '允许本作品代你发言？',
    paragraphs,
    notices: [
      `同意后，本作品可以随时用积木以你的名义在${target}发言，直到你在设置中撤销。`
    ],
    checkboxes: [
      {
        id: MUTE_ID,
        label: '之后不再提示',
        hint: '拒绝并勾选后，本作品的发送请求会被静默忽略，不再打断你。',
        checked: false
      }
    ],
    confirmText: '允许',
    cancelText: '不允许'
  });

  if (result.confirmed) {
    setSendPermission(options.creationOid, 'granted');
    unmuteSendPrompt(options.creationOid);
    return true;
  }

  setSendPermission(options.creationOid, 'denied');
  if (result.checked[MUTE_ID]) {
    muteSendPrompt(options.creationOid);
  }
  return false;
}

/** 令牌失效时清空并尝试静默续期，返回是否仍可发言。 */
export async function refreshGameAuthAfterFailure(error: unknown): Promise<boolean> {
  if (!(error instanceof ApiError) || error.status !== 401) {
    return isGameAuthorized();
  }
  clearGameAuth();
  return trySilentAuthorize();
}
