import type { Conversation, Message, SelfTransferMeta } from '@/types/api';
import { parseApiDate } from './dateTime';

/*
 * 「我的设备」会话（KukeChat-Server/docs/self-chat.md）：每个人有且只有一个、只有自己的会话，
 * 用来在自己的几台设备之间发消息、传临时文件。同一个会话各端叫法不同：
 * 这个客户端（桌面端 / 网页 / 扩展）是「电脑」，所以把会话叫「我的手机」—— 对面是手机。
 *
 * 这里只放纯函数和常量：会话类型、设备类、名字、metadata.transfer 的解析。
 */

export type DeviceClass = 'computer' | 'phone';

/** 这个客户端的设备类：请求头 X-Kuke-Platform 只会是 desktop / web（api/device.ts），都算电脑 */
export const LOCAL_DEVICE_CLASS: DeviceClass = 'computer';

/** 这个客户端上「我的设备」会话的名字（1.3）：电脑上叫「我的手机」 */
export const SELF_CHAT_TITLE = '我的手机';

/** 每类设备发的消息在聊天里显示的名字（左边那一侧）、引用里的发言人 */
export function deviceLabel(kind: DeviceClass): string {
  return kind === 'phone' ? '我的手机' : '我的电脑';
}

export function isSelfConversation(conversation: Pick<Conversation, 'type'> | null | undefined): boolean {
  return conversation?.type === 'self';
}

/** metadata.device → 设备类（第 2 节）。不认识的值服务端会写成 web，这里同样按电脑；没有这个字段返回 null */
export function deviceClassOf(device: unknown): DeviceClass | null {
  if (typeof device !== 'string' || !device) {
    return null;
  }
  return device === 'android' || device === 'ios' ? 'phone' : 'computer';
}

export function messageDeviceClass(message: Pick<Message, 'metadata'>): DeviceClass | null {
  return deviceClassOf(message.metadata?.device);
}

/**
 * 这条消息是不是「这类设备」发的：是 → 画在右边。没有 metadata.device 的（理论上不会有）也当成右边。
 * 只对「我的设备」会话里的消息有意义（别的会话里的消息没有 device，恒为 true）。
 */
export function isLocalDeviceMessage(message: Pick<Message, 'metadata'>): boolean {
  const kind = messageDeviceClass(message);
  return kind === null || kind === LOCAL_DEVICE_CLASS;
}

/** 另一类设备发的（左边、计本地未读、要提醒） */
export function isOtherDeviceMessage(message: Pick<Message, 'metadata'>): boolean {
  return !isLocalDeviceMessage(message);
}

/** 左边那条消息的设备（只有手机 / 电脑两类，不是这类就是另一类） */
export function messageDeviceOrLocal(message: Pick<Message, 'metadata'>): DeviceClass {
  return messageDeviceClass(message) ?? LOCAL_DEVICE_CLASS;
}

/**
 * 服务端给的 display_title 是中性的「我的设备」，客户端要按 1.3 自己起名。
 * 在数据进缓存的地方统一换掉，各处的标题函数就不用一个个认 self。
 */
export function normalizeSelfConversation<T extends Pick<Conversation, 'type'> & { title?: string | null; display_title?: string | null }>(conversation: T): T {
  if (conversation.type !== 'self' || (conversation.display_title === SELF_CHAT_TITLE && conversation.title === SELF_CHAT_TITLE)) {
    return conversation;
  }
  return { ...conversation, title: SELF_CHAT_TITLE, display_title: SELF_CHAT_TITLE };
}

/** 文件消息的 metadata.transfer（5.3）；形状不对返回 null（按普通文字显示 content） */
export function selfTransferOf(message: Pick<Message, 'metadata'> | null | undefined): SelfTransferMeta | null {
  const raw = message?.metadata?.transfer;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const value = raw as Record<string, unknown>;
  if (typeof value.id !== 'number' || typeof value.name !== 'string') {
    return null;
  }
  return {
    id: value.id,
    name: value.name,
    size: typeof value.size === 'number' ? value.size : 0,
    content_type: typeof value.content_type === 'string' ? value.content_type : 'application/octet-stream',
    expires_at: typeof value.expires_at === 'string' ? value.expires_at : null,
    expired: value.expired === true
  };
}

export function isSelfTransferMessage(message: Pick<Message, 'metadata'> | null | undefined): boolean {
  return selfTransferOf(message) !== null;
}

/** 过期了没有：服务端现场算的 expired，或者 expires_at 已经过了（过期时服务端不推事件，自己按本机时间算） */
export function isTransferExpired(meta: Pick<SelfTransferMeta, 'expired' | 'expires_at'>, now: number = Date.now()): boolean {
  if (meta.expired) {
    return true;
  }
  const time = parseApiDate(meta.expires_at)?.getTime();
  return time !== undefined && time <= now;
}

/** 「5 小时后过期」「12 分钟后过期」；已经过期返回 null */
export function transferRemainingText(expiresAt: string | null | undefined, now: number = Date.now()): string | null {
  const time = parseApiDate(expiresAt)?.getTime();
  if (time === undefined) {
    return null;
  }
  const diff = time - now;
  if (diff <= 0) {
    return null;
  }
  const minutes = Math.ceil(diff / 60_000);
  if (minutes < 60) {
    return `${minutes} 分钟后过期`;
  }
  // 和群文件的剩余时间一样往上取整：刚发出去是「24 小时后过期」
  return `${Math.ceil(diff / 3_600_000)} 小时后过期`;
}

/** 一个字大概占多宽：中日韩文字、全角符号算两格，其余算一格 */
function charUnits(char: string): number {
  return /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/.test(char) || char.length > 1 ? 2 : 1;
}

/**
 * 文件名太长时砍中间、留住扩展名：「一个特别长的…文件名.apk」。max 按「格」算（汉字两格、字母一格），
 * 卡片上一行大约放得下 24 格；砍完正好放进一行，不会再被样式从末尾截掉（扩展名才是最想看到的）。
 */
export function middleEllipsis(name: string, max = 24): string {
  const chars = [...name];
  const total = chars.reduce((sum, char) => sum + charUnits(char), 0);
  if (total <= max) {
    return name;
  }
  const dot = name.lastIndexOf('.');
  const extensionUnits = dot > 0 && name.length - dot <= 10 ? [...name.slice(dot)].reduce((sum, char) => sum + charUnits(char), 0) : 0;
  // 尾巴留扩展名再多几格，头部拿剩下的（省略号占一格）
  const tailBudget = Math.max(extensionUnits + 4, Math.floor(max / 3));
  const headBudget = Math.max(2, max - tailBudget - 1);
  let head = '';
  let used = 0;
  for (const char of chars) {
    if (used + charUnits(char) > headBudget) break;
    head += char;
    used += charUnits(char);
  }
  let tail = '';
  used = 0;
  for (let index = chars.length - 1; index >= 0; index -= 1) {
    if (used + charUnits(chars[index]) > tailBudget) break;
    tail = chars[index] + tail;
    used += charUnits(chars[index]);
  }
  return `${head}…${tail}`;
}
