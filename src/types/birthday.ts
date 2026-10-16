/** 生日（/api/v1/users/me/birthday）。公开资料上的那一份（UserBirthday）在 types/api.ts 的 User 上。 */

/** GET /users/me/birthday */
export interface MyBirthday {
  /** 没填是 null */
  birthday: { year: number; month: number; day: number } | null;
  /** 是否公开出生年份；关着的时候别人只看得到几月几日 */
  show_year: boolean;
  /** 今天是我的生日，而且今年还没播过庆生动画 */
  celebrate_today: boolean;
}

/** PUT /users/me/birthday 的请求体 */
export interface BirthdayPayload {
  year: number;
  month: number;
  day: number;
  show_year: boolean;
}
