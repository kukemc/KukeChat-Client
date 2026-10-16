import type { BirthdayPayload, MyBirthday } from '@/types/birthday';
import { daysInMonth } from '@/utils/birthday';
import { apiRequest } from './client';
import { isRecord } from './normalizers';

/**
 * 生日（/users/me/birthday）。旧后端没有这些接口，GET 会 404 —— 调用方（components/birthday/data.ts）把它当成「没有生日功能」。
 */

function normalizeMyBirthday(value: unknown): MyBirthday {
  const source = isRecord(value) ? value : {};
  const raw = isRecord(source.birthday) ? source.birthday : null;
  const year = raw && typeof raw.year === 'number' ? raw.year : null;
  const month = raw && typeof raw.month === 'number' ? raw.month : null;
  const day = raw && typeof raw.day === 'number' ? raw.day : null;
  const valid = year !== null && month !== null && day !== null && Number.isInteger(year) && Number.isInteger(month) && Number.isInteger(day) && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
  return {
    birthday: valid ? { year, month, day } : null,
    show_year: source.show_year === true,
    celebrate_today: source.celebrate_today === true
  };
}

export async function getMyBirthday(): Promise<MyBirthday> {
  return normalizeMyBirthday(await apiRequest<unknown>('/users/me/birthday'));
}

/**
 * 设置 / 修改生日，随时可以改，没有次数限制（服务端以前的 next_change_at 现在恒为 null，不再读它）。
 * 日期非法 / 在未来 / 早于 1900 是 422 invalid_birthday。
 * 回包按 GET 的形状读；读不出生日（服务端回了别的形状）时返回 null，调用方重拉一次。
 */
export async function setMyBirthday(payload: BirthdayPayload): Promise<MyBirthday | null> {
  const result = normalizeMyBirthday(await apiRequest<unknown>('/users/me/birthday', { method: 'PUT', body: payload }));
  return result.birthday ? result : null;
}

/** 清空生日。随时可以，清空之后也随时可以重新填。 */
export async function clearMyBirthday(): Promise<void> {
  await apiRequest<unknown>('/users/me/birthday', { method: 'DELETE' });
}

/** 标记今年的庆生动画已经播过。 */
export async function markBirthdayCelebrated(): Promise<void> {
  await apiRequest<unknown>('/users/me/birthday/celebrated', { method: 'POST' });
}
