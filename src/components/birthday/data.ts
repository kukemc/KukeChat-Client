import { useMutation, useQuery, useQueryClient, type QueryClient, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query';
import { ApiError, NetworkError } from '@/api/client';
import { clearMyBirthday, getMyBirthday, markBirthdayCelebrated, setMyBirthday } from '@/api/birthday';
import { isShopUnavailable, shopErrorCode } from '@/components/shop/data';
import { patchUserInCaches } from '@/realtime/userPatch';
import { useKukeStore } from '@/store/kukeStore';
import type { User } from '@/types/api';
import type { BirthdayPayload, MyBirthday } from '@/types/birthday';
import { formatBirthday, isBirthdayOn, normalizeBirthday, type BirthdayDate } from '@/utils/birthday';

/**
 * 生日的数据层。我自己的那一份（GET /users/me/birthday：日期、是否公开年份、今天要不要庆生）按 ['birthday', 'me'] 缓存；
 * 它的值有三种：MyBirthday（接口在）、null（当前连接的服务端没有生日功能，404）、undefined（还没拿到）。
 * 别人看到的那一份在用户对象上（user.birthday / user.is_birthday_today）：我改了、清了之后，把所有缓存里自己的副本一起改掉，
 * 资料卡、个人空间上的生日当场跟着变。
 */
export const birthdayKeys = {
  me: ['birthday', 'me'] as const
};

const UNAVAILABLE_RETRY_MS = 10 * 60_000;

async function fetchMyBirthday(): Promise<MyBirthday | null> {
  try {
    return await getMyBirthday();
  } catch (error) {
    // 旧后端没有这个接口（404）：不是出错，是「没有生日功能」
    if (isShopUnavailable(error)) {
      return null;
    }
    throw error;
  }
}

/** 我的生日设置。data 为 null 表示当前连接的服务端没有生日功能（设置项、庆生都不出现）。 */
export function useMyBirthday(enabled = true): UseQueryResult<MyBirthday | null> {
  return useQuery({
    queryKey: birthdayKeys.me,
    queryFn: fetchMyBirthday,
    enabled,
    retry: false,
    staleTime: 5 * 60_000,
    refetchInterval: (query) => (query.state.data === null ? UNAVAILABLE_RETRY_MS : false)
  });
}

/** 把我的生日同步到用户对象上：别人看到的是 { month, day, year }，year 只有公开时才有。 */
function syncMyPublicBirthday(queryClient: QueryClient, mine: MyBirthday | null): void {
  const me = useKukeStore.getState().currentUser;
  if (!me) {
    return;
  }
  const birthday = mine?.birthday ? { month: mine.birthday.month, day: mine.birthday.day, year: mine.show_year ? mine.birthday.year : null } : null;
  patchUserInCaches(queryClient, me.id, { birthday, is_birthday_today: isBirthdayOn(birthday, Date.now()) });
}

/** 保存生日（日期和「公开出生年份」一起提交）。成功后缓存换成回包里的；回包读不出来就重拉。 */
export function useSaveBirthday(): UseMutationResult<MyBirthday | null, Error, BirthdayPayload> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: BirthdayPayload) => setMyBirthday(payload),
    onSuccess: (result, payload) => {
      if (result) {
        queryClient.setQueryData<MyBirthday | null>(birthdayKeys.me, result);
        syncMyPublicBirthday(queryClient, result);
      } else {
        syncMyPublicBirthday(queryClient, { birthday: { year: payload.year, month: payload.month, day: payload.day }, show_year: payload.show_year, celebrate_today: false });
        void queryClient.invalidateQueries({ queryKey: birthdayKeys.me });
      }
    }
  });
}

/** 清空生日。随时可以清空，之后也随时可以重新填。 */
export function useClearBirthday(): UseMutationResult<void, Error, void> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => clearMyBirthday(),
    onSuccess: () => {
      queryClient.setQueryData<MyBirthday | null | undefined>(birthdayKeys.me, (current) => (current ? { ...current, birthday: null, celebrate_today: false } : current));
      syncMyPublicBirthday(queryClient, null);
      void queryClient.invalidateQueries({ queryKey: birthdayKeys.me });
    }
  });
}

/** 庆生动画播完了：告诉服务端今年播过了，手头的 celebrate_today 先改掉（请求失败也不再播第二遍，见 BirthdayCelebration）。 */
export function markCelebrated(queryClient: QueryClient): void {
  queryClient.setQueryData<MyBirthday | null | undefined>(birthdayKeys.me, (current) => (current ? { ...current, celebrate_today: false } : current));
  void markBirthdayCelebrated().catch(() => undefined);
}

/** 保存失败该怎么说。 */
export function describeBirthdayError(error: unknown): string {
  const code = shopErrorCode(error);
  if (code === 'invalid_birthday') {
    return '这个日期不对：要是真实存在的日子，不能在未来，也不能早于 1900 年。';
  }
  if (error instanceof NetworkError) {
    return '网络连接不上，检查一下网络再试。';
  }
  if (error instanceof ApiError && error.status >= 500) {
    return '服务器开小差了，稍后再试。';
  }
  return error instanceof Error && error.message ? error.message : '没有保存成功，稍后再试。';
}

/** 用户对象上公开的生日（过一遍校验）；没填、旧后端没有这个字段都是 null。 */
export function birthdayOf(user: Pick<User, 'birthday'> | null | undefined): BirthdayDate | null {
  return normalizeBirthday(user?.birthday);
}

/** 资料上写的生日：「5 月 7 日」，对方公开了年份才带年份；没填返回空串。 */
export function birthdayText(user: Pick<User, 'birthday'> | null | undefined): string {
  return formatBirthday(birthdayOf(user));
}

/** 今天是不是这个人的生日：以服务端给的 is_birthday_today 为准（它按北京时间、按平年 2 月 29 日的规则算好了）。 */
export function isBirthdayToday(user: Pick<User, 'is_birthday_today' | 'is_bot'> | null | undefined): boolean {
  return user?.is_birthday_today === true && !user.is_bot;
}
