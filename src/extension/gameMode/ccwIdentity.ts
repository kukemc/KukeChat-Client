/**
 * CCW 社区身份 —— **仅供界面展示，永远不可作为身份凭据**。
 *
 * `runtime.ccwAPI.getUserInfo()` 运行在作品所在的浏览器页面里，作品脚本、用户
 * 脚本、浏览器扩展都能覆写它，让它返回任意内容：
 *
 *     runtime.ccwAPI.getUserInfo = () => Promise.resolve({ userId: '别人的ID' });
 *
 * 因此本模块的产物一律用 `Untrusted` 前缀标注，且**不提供任何把它送往服务端的
 * 方法**。KukeChat 里唯一有效的身份来源始终是安全登录换来的令牌 —— 那个令牌由
 * 后端签发、后端校验，页面无法伪造。
 *
 * 允许的用法：把玩家的 CCW 昵称 / 头像显示在授权按钮上，让提示更亲切。
 * 禁止的用法：据此判断玩家是谁、跳过授权、或把 userId 发给后端换取权限。
 */

import type { ScratchRuntime } from '@/types/scratch';

/** 平台约定的自我限流：60 秒窗口内最多 5 次会打扰用户的调用。 */
const REQUEST_WINDOW_MS = 60_000;
const REQUEST_TOLERANT = 5;

/**
 * 来自页面的、**未经验证**的 CCW 身份信息。
 *
 * 类型名刻意带上 Untrusted，避免它在调用链里被当成可信数据传递。
 */
export interface UntrustedCcwIdentity {
  readonly untrusted: true;
  displayName: string | null;
  avatarUrl: string | null;
}

let runtimeRef: ScratchRuntime | undefined;
let cached: UntrustedCcwIdentity | null | undefined;
let promptTimestamps: number[] = [];

export function setCcwRuntime(runtime: ScratchRuntime | undefined): void {
  runtimeRef = runtime;
  cached = undefined;
}

/** `ccwAPI` 在编辑器 / 播放器 / 离线运行时的可用集合不同，用前必须检测。 */
function ccwApi(): NonNullable<ScratchRuntime['ccwAPI']> | null {
  return runtimeRef?.ccwAPI ?? null;
}

export function isCcwPlatformAvailable(): boolean {
  return ccwApi() !== null;
}

/**
 * 读取当前访客的 CCW 身份，**只用于渲染提示文案**。
 *
 * 平台不可用、未登录 CCW 或调用失败时返回 null。任何失败都不应该影响游戏模式
 * 本身 —— 玩家仍然可以走完整的安全登录流程。
 */
export async function readUntrustedCcwIdentity(): Promise<UntrustedCcwIdentity | null> {
  if (cached !== undefined) {
    return cached;
  }

  const api = ccwApi();
  if (!api?.getUserInfo) {
    cached = null;
    return cached;
  }

  try {
    const user = await api.getUserInfo();
    if (!user) {
      cached = null;
      return cached;
    }
    const displayName = typeof user.userName === 'string' && user.userName.trim() ? user.userName.trim() : null;
    const avatarUrl = typeof user.avatar === 'string' && user.avatar.trim() ? user.avatar.trim() : null;
    cached = displayName || avatarUrl ? { untrusted: true, displayName, avatarUrl } : null;
  } catch {
    cached = null;
  }
  return cached;
}

/**
 * 向平台询问当前作品的 UUID。
 *
 * 相比从 URL 解析，它在**编辑器里也可用**（编辑器路径是 `/gandi/project/<id>`，
 * 解析不出作品 oid），因此开发者能直接在编辑器内调试游戏模式。
 *
 * 信任级别与 URL 解析完全相同：两者都只是「客户端声称自己是哪个作品」，
 * 真正的校验发生在服务端 —— 它会比对该群绑定的作品是否与此一致。
 *
 * 平台不提供该接口时返回 null，由调用方回落到 URL 解析。
 */
export async function readPlatformCreationOid(): Promise<string | null> {
  const api = ccwApi();
  if (!api?.getProjectUUID) {
    return null;
  }
  try {
    const oid = await api.getProjectUUID();
    return typeof oid === 'string' && oid.trim() ? oid.trim().toLowerCase() : null;
  } catch {
    return null;
  }
}

/**
 * 平台报告的设备类型，实测返回 'PC'。
 *
 * 用来给舞台聊天框挑一个合适的默认尺寸 —— 手机上舞台本来就小，
 * 桌面端的默认宽高会盖掉大半个游戏画面。
 */
export async function readPlatformDeviceType(): Promise<string | null> {
  const api = ccwApi();
  if (!api?.getDeviceType) {
    return null;
  }
  try {
    const type = await api.getDeviceType();
    return typeof type === 'string' && type.trim() ? type.trim() : null;
  } catch {
    return null;
  }
}

/** 清掉缓存，例如玩家在别的标签页切换了 CCW 账号后。 */
export function forgetCcwIdentity(): void {
  cached = undefined;
}

/**
 * 平台约定的限流闸门，用于所有**会弹窗打扰玩家**的 ccwAPI 调用
 * （投币、关注、评论、设头像、分享）。
 *
 * 官方扩展用它防止作品靠循环反复弹窗骚扰用户；不遵守可能被平台限制。
 * 玩家同意一次后调用 {@link resetCcwPromptQuota} 清零。
 */
export function canPromptCcwUser(): boolean {
  const now = Date.now();
  promptTimestamps = promptTimestamps.filter((time) => now - time <= REQUEST_WINDOW_MS);
  promptTimestamps.push(now);
  return promptTimestamps.length <= REQUEST_TOLERANT;
}

export function resetCcwPromptQuota(): void {
  promptTimestamps = [];
}
