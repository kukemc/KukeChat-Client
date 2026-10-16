import { isRecord } from '@/api/normalizers';
import { chinaToday, isBirthdayOn, isValidBirthday } from '@/utils/birthday';
import { json, type MockHandler } from './types';

/*
 * 生日接口（/users/me/birthday）的假实现，照着契约草案（生日一节）写，状态只存在内存里。
 * 场景写在 birthdayScenario 上，预览页（dev/shop-harness.tsx）的控制条和地址参数改的就是它。
 *
 * 和契约对齐的几处：日期随时可以改、随时可以清空，没有次数限制（next_change_at 恒为 null）；日期非法 / 在未来 / 早于 1900 是 422 invalid_birthday；
 * celebrate_today = 今天是我的生日、而且今年还没标记过「播过了」。
 * 别人的生日（公开资料上的 birthday / is_birthday_today）由 birthdayState.setOther 摆布。
 */

export interface BirthdayScenario {
  /** ok 正常；missing 旧后端，没有这些接口（404） */
  backend: 'ok' | 'missing';
  /** 保存时强制返回的错误 */
  saveError: 'none' | 'invalid_birthday' | 'server';
  delay: number;
}

export const birthdayScenario: BirthdayScenario = { backend: 'ok', saveError: 'none', delay: 200 };

interface Birthday {
  year: number;
  month: number;
  day: number;
}

let mine: Birthday | null = null;
let showYear = false;
/** 今年是不是已经播过庆生动画 */
let celebrated = false;
const others = new Map<number, { birthday: Birthday; showYear: boolean }>();

/** 发过哪些生日请求，给自动化脚本核对用 */
export const birthdayRequests: Array<{ method: string; path: string; body: unknown }> = [];

function fail(status: number, code: string, message: string, extra: Record<string, unknown> = {}): Response {
  return json({ detail: { code, message, ...extra } }, status);
}

function view(): Record<string, unknown> {
  return { birthday: mine, show_year: showYear, next_change_at: null, celebrate_today: Boolean(mine) && isBirthdayOn(mine, Date.now()) && !celebrated };
}

/** 预览页用：直接摆布生日的状态 */
export const birthdayState = {
  /** 我的生日；today 为 true 时放在今天（北京时间），年份 2008 */
  setMine(value: Birthday | 'today' | null, options: { showYear?: boolean; celebrated?: boolean } = {}): void {
    const today = chinaToday(Date.now());
    mine = value === 'today' ? { year: 2008, month: today.month, day: today.day } : value;
    showYear = options.showYear ?? showYear;
    celebrated = options.celebrated ?? false;
  },
  /** 别人的生日；today 为 true 时就是今天 */
  setOther(userId: number, value: Birthday | 'today' | null, show = false): void {
    if (value === null) {
      others.delete(userId);
      return;
    }
    const today = chinaToday(Date.now());
    others.set(userId, { birthday: value === 'today' ? { year: 2009, month: today.month, day: today.day } : value, showYear: show });
  },
  isBirthdayToday(userId: number, meId: number): boolean {
    const birthday = userId === meId ? mine : others.get(userId)?.birthday ?? null;
    return isBirthdayOn(birthday, Date.now());
  },
  /** 公开资料上和生日有关的两个字段（契约里 UserPublic 新增的） */
  publicFields(userId: number, meId: number): { birthday: { month: number; day: number; year: number | null } | null; is_birthday_today: boolean } {
    const entry = userId === meId ? (mine ? { birthday: mine, showYear } : null) : others.get(userId) ?? null;
    if (!entry) {
      return { birthday: null, is_birthday_today: false };
    }
    return { birthday: { month: entry.birthday.month, day: entry.birthday.day, year: entry.showYear ? entry.birthday.year : null }, is_birthday_today: isBirthdayOn(entry.birthday, Date.now()) };
  },
  get celebrated(): boolean {
    return celebrated;
  }
};

export const birthdayMock: MockHandler = async ({ path, method, body }) => {
  if (!path.startsWith('/users/me/birthday')) {
    return undefined;
  }
  birthdayRequests.push({ method, path, body });
  await new Promise((resolve) => window.setTimeout(resolve, birthdayScenario.delay));
  if (birthdayScenario.backend === 'missing') {
    return json({ detail: 'Not Found' }, 404);
  }
  if (path === '/users/me/birthday' && method === 'GET') {
    return json(view());
  }
  if (path === '/users/me/birthday' && method === 'PUT') {
    const forced = birthdayScenario.saveError;
    if (forced === 'server') {
      return json({ detail: 'Internal Server Error' }, 500);
    }
    const source = isRecord(body) ? body : {};
    const year = Number(source.year);
    const month = Number(source.month);
    const day = Number(source.day);
    if (forced === 'invalid_birthday' || !isValidBirthday(year, month, day, Date.now())) {
      return fail(422, 'invalid_birthday', '生日日期不合法');
    }
    mine = { year, month, day };
    showYear = source.show_year === true;
    return json(view());
  }
  if (path === '/users/me/birthday' && method === 'DELETE') {
    mine = null;
    return json({});
  }
  if (path === '/users/me/birthday/celebrated' && method === 'POST') {
    celebrated = true;
    return json({});
  }
  return json({ detail: 'Not Found' }, 404);
};
