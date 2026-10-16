import type { Conversation } from '@/types/api';
import type { GroupPlusTier } from '@/types/groupPlus';
import { parseApiDate } from '@/utils/dateTime';

/**
 * 群档位的展示信息和几个纯函数。只放「不依赖网络」的东西：角标、后缀标签、会话列表都用它，
 * 所以不能引用 data.ts（那边有请求和缓存，会让头像组件的依赖变得很重）。
 */

export interface TierMeta {
  key: GroupPlusTier;
  /** 后缀标签上的字，也是档位的名字 */
  label: string;
  rank: number;
}

export const TIER_ORDER: readonly GroupPlusTier[] = ['free', 'pro', 'pro_plus', 'max'];

export const TIER_META: Record<GroupPlusTier, TierMeta> = {
  free: { key: 'free', label: '免费', rank: 0 },
  pro: { key: 'pro', label: 'Pro', rank: 1 },
  pro_plus: { key: 'pro_plus', label: 'Pro+', rank: 2 },
  max: { key: 'max', label: 'MAX', rank: 3 }
};

export function tierRank(tier: GroupPlusTier): number {
  return TIER_META[tier].rank;
}

/**
 * 有效档位。服务端给的 plus_tier 已经是有效档位，但「到期降级」没有实时事件（docs/group-plus.md 第 4 节），
 * 一个开了很久的窗口里缓存的档位可能已经过期了：这里按到期时间再判断一次，过期就是 free。
 */
export function effectiveTier(tier: GroupPlusTier | null | undefined, expiresAt: string | null | undefined, now: number = Date.now()): GroupPlusTier {
  if (!tier || tier === 'free') {
    return 'free';
  }
  const until = parseApiDate(expiresAt)?.getTime();
  // 没有到期时间的付费档位按有效处理（后台赠送也有到期时间，这里只是兜底）
  if (until !== undefined && until <= now) {
    return 'free';
  }
  return tier;
}

/** 永久档位的到期时间是 2999-12-31 的哨兵值（docs/group-plus.md 9.2）：年份 >= 2999 就当永久。 */
export const PERMANENT_YEAR = 2999;

export function isPermanentExpiry(expiresAt: string | null | undefined): boolean {
  const date = parseApiDate(expiresAt);
  return date !== null && date !== undefined && date.getUTCFullYear() >= PERMANENT_YEAR;
}

/**
 * 是不是永久档位（只有后台能给，不能再购买）。服务端给了 plus_permanent / permanent 就用它，
 * 旧服务端没有这个字段时按到期年份判断。免费档恒为 false。
 */
export function isPermanentPlus(tier: GroupPlusTier | null | undefined, expiresAt: string | null | undefined, flag?: boolean | null): boolean {
  if (!tier || tier === 'free') {
    return false;
  }
  return flag === true || isPermanentExpiry(expiresAt);
}

/** 一个会话当前的有效档位；私聊、旧后端（没有字段）都是 free。 */
export function conversationTier(conversation: Pick<Conversation, 'type' | 'plus_tier' | 'plus_expires_at'> | null | undefined): GroupPlusTier {
  if (!conversation || conversation.type !== 'group') {
    return 'free';
  }
  return effectiveTier(conversation.plus_tier, conversation.plus_expires_at);
}

/** 人数、条数：1000 → 1000，20000 → 2 万，50000 → 5 万 */
export function formatLimit(value: number): string {
  if (value >= 10_000 && value % 1000 === 0) {
    const wan = value / 10_000;
    return `${Number.isInteger(wan) ? wan : wan.toFixed(1)} 万`;
  }
  return value.toLocaleString('zh-CN');
}

/** 字节数：1048576 → 1 MB，209715200 → 200 MB，1073741824 → 1 GB */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit === 0 || value >= 100 || Number.isInteger(value) ? 0 : 1;
  return `${value.toFixed(digits)} ${units[unit]}`;
}

/** 距离某个时间还有多久：「3 天」「5 小时」「20 分钟」；已经过了返回 null */
export function formatRemaining(until: string | null | undefined, now: number = Date.now()): string | null {
  const time = parseApiDate(until)?.getTime();
  if (time === undefined) {
    return null;
  }
  const diff = time - now;
  if (diff <= 0) {
    return null;
  }
  const minutes = Math.ceil(diff / 60_000);
  if (minutes < 60) {
    return `${minutes} 分钟`;
  }
  const hours = Math.ceil(diff / 3_600_000);
  if (hours < 48) {
    return `${hours} 小时`;
  }
  return `${Math.ceil(diff / 86_400_000)} 天`;
}

/** 保留时长选项的名字：24 → 1 天，168 → 7 天，720 → 30 天 */
export function ttlLabel(hours: number): string {
  if (hours % 24 === 0) {
    return `${hours / 24} 天`;
  }
  return `${hours} 小时`;
}
