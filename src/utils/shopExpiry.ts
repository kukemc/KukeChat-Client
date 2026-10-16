/**
 * 限时商品的「还剩几天」「续到哪天」。纯函数，不依赖接口层：商店卡片、我的装扮、续期确认框、送礼面板都从这里算。
 *
 * 商品上的 duration_days：null 是永久，N 是买一次拥有 N 天。expires_at 是我拥有的这件什么时候到期（永久或未拥有为 null）。
 * 续期的算法和服务端一致：还没到期就在原到期时间上再加 N 天，已经到期（或没有）就从现在起算 N 天。
 */

/** 剩下不超过这么多天就算「快到期」，界面上要醒目一点。和服务端发 shop.item.expiring 的提前量一致 */
export const EXPIRING_SOON_DAYS = 3;

const DAY_MS = 86_400_000;
const NAIVE_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/;

/** 接口里的时间：不带时区的按 UTC（和 utils/dateTime.ts 的 parseApiDate 一样） */
function timeOf(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const time = new Date(NAIVE_DATETIME.test(value) ? `${value}Z` : value).getTime();
  return Number.isNaN(time) ? null : time;
}

/** 正整数的天数；不是的话（null、0、小数、负数）按永久算，返回 null。 */
export function durationDaysOf(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

/** 到期时间过没过。没有到期时间（永久）不算过期。 */
export function isExpired(expiresAt: string | null | undefined, now: number): boolean {
  const time = timeOf(expiresAt);
  return time !== null && time <= now;
}

/**
 * 还剩几天，往上取整：剩 2 天零 1 小时算「还剩 3 天」，剩不到一天算 1。已经到期是 0；没有到期时间是 null。
 */
export function daysLeft(expiresAt: string | null | undefined, now: number): number | null {
  const time = timeOf(expiresAt);
  if (time === null) {
    return null;
  }
  return time <= now ? 0 : Math.ceil((time - now) / DAY_MS);
}

export function isExpiringSoon(expiresAt: string | null | undefined, now: number): boolean {
  const days = daysLeft(expiresAt, now);
  return days !== null && days <= EXPIRING_SOON_DAYS;
}

/** 「还剩 N 天」。最后一天写成「今天到期」；已经到期写「已到期」；没有到期时间返回 null。 */
export function expiryLabel(expiresAt: string | null | undefined, now: number): string | null {
  const time = timeOf(expiresAt);
  if (time === null) {
    return null;
  }
  if (time <= now) {
    return '已到期';
  }
  return time - now <= DAY_MS ? '今天到期' : `还剩 ${Math.ceil((time - now) / DAY_MS)} 天`;
}

/** 商品卡片上的时长：「30 天」；永久返回 null。 */
export function durationLabel(durationDays: number | null | undefined): string | null {
  const days = durationDaysOf(durationDays);
  return days === null ? null : `${days} 天`;
}

/** 现在买（或续期）一次之后的到期时间；永久商品返回 null。 */
export function renewedUntil(expiresAt: string | null | undefined, durationDays: number | null | undefined, now: number): Date | null {
  const days = durationDaysOf(durationDays);
  if (days === null) {
    return null;
  }
  const current = timeOf(expiresAt);
  return new Date((current !== null && current > now ? current : now) + days * DAY_MS);
}

/** 到期的日子，按北京时间写：「2026 年 11 月 13 日」；今年的省掉年份。 */
export function formatExpiryDate(date: Date, now: number): string {
  // 换成北京时间的「墙上时间」再读年月日，不受运行环境时区影响
  const local = new Date(date.getTime() + 8 * 3_600_000);
  const thisYear = new Date(now + 8 * 3_600_000).getUTCFullYear();
  const day = `${local.getUTCMonth() + 1} 月 ${local.getUTCDate()} 日`;
  return local.getUTCFullYear() === thisYear ? day : `${local.getUTCFullYear()} 年 ${day}`;
}
