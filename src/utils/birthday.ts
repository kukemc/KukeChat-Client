/**
 * 生日的几个纯函数：今天是不是生日、怎么写、年月日三个选择框的取值范围。不依赖接口层。
 *
 * 约定（和服务端一致）：「今天」一律按北京时间（UTC+8）；2 月 29 日生日在平年按 2 月 28 日过。
 * 用户对象上的 birthday 是 { month, day, year }，year 只有本人选择公开时才有。
 */

export interface BirthdayDate {
  month: number;
  day: number;
  /** 出生年份；别人的资料上只有对方选择公开时才有 */
  year: number | null;
}

/** 填生日时默认停在哪一天 */
export const DEFAULT_BIRTHDAY = { year: 2008, month: 5, day: 7 } as const;
export const BIRTHDAY_MIN_YEAR = 1900;

const CHINA_OFFSET_MS = 8 * 3_600_000;

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** 某年某月有几天。 */
export function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28;
  }
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

/** 北京时间的今天是哪年哪月哪日。 */
export function chinaToday(now: number): { year: number; month: number; day: number } {
  const local = new Date(now + CHINA_OFFSET_MS);
  return { year: local.getUTCFullYear(), month: local.getUTCMonth() + 1, day: local.getUTCDate() };
}

/** 用户对象上的 birthday：形状不对（不是合法的月、日）返回 null。 */
export function normalizeBirthday(value: unknown): BirthdayDate | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const { month, day, year } = value as Record<string, unknown>;
  if (typeof month !== 'number' || typeof day !== 'number' || !Number.isInteger(month) || !Number.isInteger(day) || month < 1 || month > 12 || day < 1 || day > daysInMonth(2000, month)) {
    return null;
  }
  return { month, day, year: typeof year === 'number' && Number.isInteger(year) && year >= BIRTHDAY_MIN_YEAR ? year : null };
}

/** 今天是不是这个生日。2 月 29 日的生日在平年算 2 月 28 日。 */
export function isBirthdayOn(birthday: Pick<BirthdayDate, 'month' | 'day'> | null | undefined, now: number): boolean {
  if (!birthday) {
    return false;
  }
  const today = chinaToday(now);
  if (birthday.month === 2 && birthday.day === 29 && !isLeapYear(today.year)) {
    return today.month === 2 && today.day === 28;
  }
  return today.month === birthday.month && today.day === birthday.day;
}

/** 「5 月 7 日」；有年份（本人公开了）写成「2008 年 5 月 7 日」。 */
export function formatBirthday(birthday: BirthdayDate | null | undefined): string {
  if (!birthday) {
    return '';
  }
  const day = `${birthday.month} 月 ${birthday.day} 日`;
  return birthday.year ? `${birthday.year} 年 ${day}` : day;
}

/** 这个年月日是不是一个能填的生日：真实存在的日期、不早于 1900 年、不在未来（按北京时间）。 */
export function isValidBirthday(year: number, month: number, day: number, now: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day) || year < BIRTHDAY_MIN_YEAR || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    return false;
  }
  const today = chinaToday(now);
  return year < today.year || (year === today.year && (month < today.month || (month === today.month && day <= today.day)));
}

/** 换了年或月之后，日不能超过那个月的天数（2 月 30 日 → 2 月 28 / 29 日）。 */
export function clampBirthdayDay(year: number, month: number, day: number): number {
  return Math.min(Math.max(1, day), daysInMonth(year, month));
}

/** 年份选择框的选项：从今年往回到 1900。 */
export function birthdayYears(now: number): number[] {
  const { year } = chinaToday(now);
  return Array.from({ length: year - BIRTHDAY_MIN_YEAR + 1 }, (_, index) => year - index);
}
