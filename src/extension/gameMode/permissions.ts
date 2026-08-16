/**
 * 游戏模式的发送权限。
 *
 * 「登录授权」与「允许本作品代你发言」是两件事：
 *
 * - 登录授权只让玩家能被识别、能收消息，由安全登录流程完成。
 * - 发送权限是玩家**额外**授予**某一个作品**的能力 —— 作品拿到它之后，就能用
 *   「以玩家身份发送消息」积木替玩家在群里说话。这是真正需要谨慎对待的授权，
 *   所以默认关闭，且按作品分别记录：授权给 A 作品不等于授权给 B。
 *
 * 记录存在 localStorage 而不是 sessionStorage —— 玩家不该每次打开作品都被问一遍。
 */

const SEND_KEY_PREFIX = 'kukechat-game-send-permission:';
const PROMPT_KEY_PREFIX = 'kukechat-game-send-prompt-muted:';

export type SendPermission = 'granted' | 'denied' | 'unset';

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    // 隐私模式下不可用，按「未设置」处理
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // 存不下就只在本次会话内生效，不影响功能
  }
}

function normalizeOid(creationOid: string | null | undefined): string {
  return (creationOid || '').trim().toLowerCase();
}

export function getSendPermission(creationOid: string | null | undefined): SendPermission {
  const oid = normalizeOid(creationOid);
  if (!oid) {
    return 'unset';
  }
  const value = readStorage(SEND_KEY_PREFIX + oid);
  return value === 'granted' || value === 'denied' ? value : 'unset';
}

export function setSendPermission(creationOid: string | null | undefined, permission: SendPermission): void {
  const oid = normalizeOid(creationOid);
  if (!oid) {
    return;
  }
  if (permission === 'unset') {
    try {
      window.localStorage.removeItem(SEND_KEY_PREFIX + oid);
    } catch {
      // 同上
    }
    return;
  }
  writeStorage(SEND_KEY_PREFIX + oid, permission);
}

export function canSendOnBehalf(creationOid: string | null | undefined): boolean {
  return getSendPermission(creationOid) === 'granted';
}

/** 玩家勾选过「之后不再提示」后，作品再调发送积木不再弹窗。 */
export function isSendPromptMuted(creationOid: string | null | undefined): boolean {
  const oid = normalizeOid(creationOid);
  return Boolean(oid) && readStorage(PROMPT_KEY_PREFIX + oid) === '1';
}

export function muteSendPrompt(creationOid: string | null | undefined): void {
  const oid = normalizeOid(creationOid);
  if (oid) {
    writeStorage(PROMPT_KEY_PREFIX + oid, '1');
  }
}

/** 玩家重新授予发送权限时，顺带解除静音，否则以后想改都没入口。 */
export function unmuteSendPrompt(creationOid: string | null | undefined): void {
  const oid = normalizeOid(creationOid);
  if (!oid) {
    return;
  }
  try {
    window.localStorage.removeItem(PROMPT_KEY_PREFIX + oid);
  } catch {
    // 同上
  }
}
