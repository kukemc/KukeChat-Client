import { useEffect, useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData, type QueryClient, type UseInfiniteQueryResult, type UseQueryResult } from '@tanstack/react-query';
import { create } from 'zustand';
import { ApiError, NetworkError } from '@/api/client';
import { isRecord } from '@/api/normalizers';
import { ProfileLikesUnsupportedError, getProfileLikeOptions, getProfileLikeState, getReceivedProfileLikes, likeProfile, normalizeProfileLikedEvent, readProfileLikeCount } from '@/api/profileLikes';
import { compactNumber } from '@/components/home/homeModel';
import { patchUserInCaches } from '@/realtime/userPatch';
import { useKukeStore } from '@/store/kukeStore';
import { absorbMuteError, formatMuteEnd, useMuteStatus } from '@/store/moderationStore';
import type { User } from '@/types/api';
import type { ProfileLikeOptions, ProfileLikesReceived, ProfileLikeState } from '@/types/profileLikes';

/**
 * 资料点赞的数据层：缓存 key、查询、乐观更新、实时事件怎么处理。契约：KukeChat-Server 的 docs/chat-features.md 第 6 节。
 *
 * 「服务端有没有资料点赞」靠 GET /users/likes/options 探测，做法和账号等级、商店一样：
 * 值有三种 —— ProfileLikeOptions（有）、null（接口 404，还没部署）、undefined（还没拿到 / 请求失败）。
 * 只有确实拿到了才显示点赞相关的界面，其余两种都不显示。探测只在第一次有资料卡 / 个人空间打开时发生。
 *
 * 赞数有两个来源：用户对象上的 profile_like_count（跟着消息、成员列表一起来），和打开资料卡 / 个人空间时
 * 取的那一次 GET /users/{id}/likes（更新，还带着「我今天点过没有、还能不能点」）。显示时后者优先。
 * 点赞成功、收到 user.profile.liked 之后，用 realtime/userPatch.ts 把所有缓存里这个人的 profile_like_count 改掉，不重新请求。
 *
 * 查询缓存里放的始终是服务端说的状态；自己刚点下去、接口还没返回的那一下另外记在 pending 里，显示时再叠上去
 * （和公告回应一个写法）：失败了把它拿掉就等于回滚。
 */
export const likeKeys = {
  root: ['profile-likes'] as const,
  options: ['profile-likes', 'options'] as const,
  states: ['profile-likes', 'state'] as const,
  state: (userId: number) => ['profile-likes', 'state', userId] as const,
  received: ['profile-likes', 'received'] as const
};

/** 赞数的显示：上千之后缩写成 1.2k、3.4万（和公告回应、主页统计用的是同一个函数）。 */
export const formatLikeCount = compactNumber;

function errorCode(error: unknown): string | null {
  if (!(error instanceof ApiError) || !isRecord(error.detail)) {
    return null;
  }
  const detail = isRecord(error.detail.detail) ? error.detail.detail : error.detail;
  return typeof detail.code === 'string' ? detail.code : null;
}

/** 接口在这个后端上不存在（还没部署资料点赞）。带错误码的 404（比如 user_not_found）不算。 */
export function isProfileLikesUnavailable(error: unknown): boolean {
  if (error instanceof ProfileLikesUnsupportedError) {
    return true;
  }
  return error instanceof ApiError && (error.status === 404 || error.status === 405 || error.status === 501) && errorCode(error) === null;
}

async function fetchOptions(): Promise<ProfileLikeOptions | null> {
  try {
    return await getProfileLikeOptions();
  } catch (error) {
    if (isProfileLikesUnavailable(error)) {
      return null;
    }
    throw error;
  }
}

/** 服务端还没有资料点赞时，每隔这么久再探一次；部署之后点赞按钮自己出现，不用重启客户端。 */
const UNAVAILABLE_RETRY_MS = 10 * 60_000;

/** 上限数字。data 为 null 表示当前连接的服务端没有资料点赞；undefined 是还不知道。数字很少变，拿到之后半小时内不重拉。 */
export function useProfileLikeOptions(enabled = true): UseQueryResult<ProfileLikeOptions | null> {
  return useQuery({
    queryKey: likeKeys.options,
    queryFn: fetchOptions,
    enabled,
    retry: false,
    staleTime: 30 * 60_000,
    refetchInterval: (query) => (query.state.data === null ? UNAVAILABLE_RETRY_MS : false)
  });
}

/** 我和某个人之间的点赞状态。打开资料卡 / 个人空间时取一次，半分钟内再打开不重取。 */
export function useProfileLikeState(userId: number, enabled: boolean): UseQueryResult<ProfileLikeState> {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: likeKeys.state(userId),
    queryFn: async () => {
      const state = await getProfileLikeState(userId);
      // 这里拿到的赞数比用户对象上的新：对不上就把各处缓存里的一起改掉（一样的话什么都不动）
      patchUserInCaches(queryClient, userId, { profile_like_count: state.like_count });
      return state;
    },
    enabled: enabled && userId > 0,
    retry: false,
    staleTime: 30_000
  });
}

interface PendingState {
  /** 正在点赞、接口还没返回的那些人 */
  pending: Record<number, true>;
  begin: (userId: number) => void;
  end: (userId: number) => void;
}

const usePendingLikes = create<PendingState>((set) => ({
  pending: {},
  begin: (userId) => set((state) => ({ pending: { ...state.pending, [userId]: true } })),
  end: (userId) => set((state) => {
    const pending = { ...state.pending };
    delete pending[userId];
    return { pending };
  })
}));

/** 服务端没带说明时，各个错误码自己的一句话。 */
const CODE_MESSAGES: Record<string, string> = {
  user_not_found: '这个用户不存在',
  cannot_like_self: '不能给自己点赞',
  cannot_like_bot: '不能给机器人点赞',
  already_liked_today: '今天已经给 Ta 点过赞了，明天可以再赞',
  like_limit: '今天点赞的人数到上限了',
  account_muted: '禁言期间不能点赞'
};

/** 点赞失败时给用户看的那句话。服务端带了 message 的原样用它的。 */
export function describeProfileLikeError(error: unknown): string {
  if (error instanceof ApiError) {
    const code = errorCode(error);
    if (code) {
      // ApiError 读不出 message 时会退回「请求失败：状态码」，那种不拿来当提示
      return error.message && !error.message.startsWith('请求失败') ? error.message : CODE_MESSAGES[code] ?? '点赞失败，请稍后重试';
    }
    if (error.status === 404 || error.status === 405 || error.status === 501) {
      return '服务器暂不支持资料点赞';
    }
  }
  if (error instanceof ProfileLikesUnsupportedError) {
    return error.message;
  }
  if (error instanceof NetworkError) {
    return '网络不通，赞没有点上';
  }
  return '点赞失败，请稍后重试';
}

/** 没有服务端状态可改时，从用户对象起一份。 */
function stateFrom(current: ProfileLikeState | undefined, user: User): ProfileLikeState {
  return current ?? { user_id: user.id, like_count: readProfileLikeCount(user) ?? 0, today_count: 0, liked_today: false, can_like: true, left_today: null };
}

/** 失败的原因说明了服务端现在的状态（今天点过了、到上限了……）：把缓存改成那个样子，按钮才会停在对的状态上。 */
function applyLikeFailure(queryClient: QueryClient, user: User, error: unknown): void {
  const code = errorCode(error);
  const key = likeKeys.state(user.id);
  if (code === 'already_liked_today') {
    queryClient.setQueryData<ProfileLikeState>(key, (current) => ({ ...stateFrom(current, user), liked_today: true, can_like: false }));
  } else if (code === 'like_limit') {
    // 到上限了：对谁都不能再点（今天已经点过的那些不受影响）
    queryClient.setQueryData<ProfileLikeState>(key, (current) => ({ ...stateFrom(current, user), can_like: false, left_today: 0 }));
    queryClient.setQueriesData<ProfileLikeState | undefined>({ queryKey: likeKeys.states }, (current) => (current && current.can_like ? { ...current, can_like: false, left_today: 0 } : current));
  } else if (code === 'account_muted' || code === 'cannot_like_self' || code === 'cannot_like_bot') {
    queryClient.setQueryData<ProfileLikeState>(key, (current) => ({ ...stateFrom(current, user), can_like: false }));
  } else if (isProfileLikesUnavailable(error)) {
    // 接口没了（服务端回滚了？）：重新探测一次，探测结果是 404 的话所有点赞界面会收起来
    void queryClient.invalidateQueries({ queryKey: likeKeys.options });
  }
}

/** 点赞成功：这个人的状态整份换成接口返回的，各处缓存里他的赞数跟着改；我今天的剩余名额也同步给别人的状态。 */
function applyLikeSuccess(queryClient: QueryClient, userId: number, state: ProfileLikeState): void {
  queryClient.setQueryData<ProfileLikeState>(likeKeys.state(userId), state);
  patchUserInCaches(queryClient, userId, { profile_like_count: state.like_count });
  const left = state.left_today;
  if (left === null) {
    return;
  }
  queryClient.setQueriesData<ProfileLikeState | undefined>({ queryKey: likeKeys.states }, (current) => {
    if (!current || current.user_id === userId || current.left_today === left) {
      return current;
    }
    // 名额用完了：今天还没点过的人都不能再点
    return { ...current, left_today: left, can_like: left > 0 ? current.can_like : false };
  });
}

export type ProfileLikeStatus =
  /** 状态还没取回来：先显示赞数，不能点 */
  | 'loading'
  /** 可以点 */
  | 'idle'
  /** 今天已经点过（或者刚点下去、接口还没返回） */
  | 'liked'
  /** 不能点：自己 / 机器人 / 被禁言 / 到每日上限 */
  | 'blocked';

export interface ProfileLikeModel {
  /** 当前连接的服务端有资料点赞，而且拿得到这个人的赞数。false 时按钮整个不出现 */
  available: boolean;
  /** 要显示的赞数（已经叠上了还在路上的那一下） */
  count: number;
  status: ProfileLikeStatus;
  /** 现在这个状态的说明：可以点时是「赞一下」，点过了是「明天可以再赞」，不能点时是原因 */
  hint: string;
  /** 最近一次失败、或者点了不能点的按钮时的说明，几秒后自己消失 */
  notice: string;
  /** 刚刚点成功了一次（用来播一下反馈），每成功一次加一 */
  burst: number;
  /** 点一下：能点就点赞，不能点就把原因显示出来 */
  press: () => void;
}

const NOTICE_DURATION_MS = 3600;

/** 给某个人点赞的按钮要用的全部状态。资料卡、个人空间（桌面和移动）共用。 */
export function useProfileLike(user: User | null | undefined): ProfileLikeModel {
  const queryClient = useQueryClient();
  const currentUserId = useKukeStore((state) => state.currentUser?.id ?? null);
  const userId = user?.id ?? 0;
  const isSelf = userId > 0 && userId === currentUserId;
  const isBot = Boolean(user?.is_bot);
  const options = useProfileLikeOptions(userId > 0).data ?? null;
  // 机器人不能被点赞，状态不用问服务端
  const stateQuery = useProfileLikeState(userId, Boolean(options) && !isBot);
  const pending = usePendingLikes((state) => userId in state.pending);
  // 只读已经有的禁言状态（主界面登录后拉过一次），不为了它再发请求
  const mute = useMuteStatus(false);
  const [notice, setNotice] = useState('');
  const [burst, setBurst] = useState(0);

  useEffect(() => {
    if (!notice) {
      return undefined;
    }
    const timer = window.setTimeout(() => setNotice(''), NOTICE_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const mutation = useMutation({
    mutationFn: (target: User) => likeProfile(target.id),
    onMutate: (target) => {
      setNotice('');
      usePendingLikes.getState().begin(target.id);
    },
    onSuccess: (state, target) => {
      applyLikeSuccess(queryClient, target.id, state);
      setBurst((value) => value + 1);
    },
    onError: (error, target) => {
      absorbMuteError(error);
      applyLikeFailure(queryClient, target, error);
      setNotice(describeProfileLikeError(error));
    },
    // 拿掉这次操作：成功时缓存已经是新状态，失败时显示就回到了服务端的状态
    onSettled: (_state, _error, target) => usePendingLikes.getState().end(target.id)
  });

  const server = stateQuery.data;
  const baseCount = server?.like_count ?? readProfileLikeCount(user);
  const alreadyLiked = Boolean(server?.liked_today);
  const count = (baseCount ?? 0) + (pending && !alreadyLiked ? 1 : 0);

  let status: ProfileLikeStatus;
  let hint: string;
  if (pending || alreadyLiked) {
    status = 'liked';
    hint = '今天已经赞过了，明天可以再赞';
  } else if (isSelf) {
    status = 'blocked';
    hint = '不能给自己点赞';
  } else if (isBot) {
    status = 'blocked';
    hint = '不能给机器人点赞';
  } else if (server && !server.can_like) {
    status = 'blocked';
    // 服务端给了原因就以它为准；老一点的服务端不给，退回按本地已知的禁言状态和剩余名额猜
    if (mute.muted || server.reason === 'muted') {
      hint = mute.muted && mute.until ? `你已被禁言至 ${formatMuteEnd(mute.until)}，期间不能点赞` : '禁言期间不能点赞';
    } else if (server.reason === 'limit' || server.left_today === 0) {
      hint = options && options.targets_per_day > 0 ? `今天点赞的人数到上限了（每天最多给 ${options.targets_per_day} 个人点赞）` : '今天点赞的人数到上限了';
    } else {
      hint = '现在不能给 Ta 点赞';
    }
  } else if (!server && stateQuery.isPending && stateQuery.fetchStatus !== 'idle') {
    status = 'loading';
    hint = '正在读取点赞状态…';
  } else {
    // 状态取回来了而且能点；或者状态没取到（网络问题），那就让他点，结果以点赞接口说的为准
    status = 'idle';
    hint = '赞一下';
  }

  function press(): void {
    if (!user || pending) {
      return;
    }
    if (status === 'idle') {
      mutation.mutate(user);
      return;
    }
    if (status !== 'loading') {
      setNotice(hint);
    }
  }

  return { available: Boolean(options) && baseCount !== null, count, status, hint, notice, burst, press };
}

export interface MyProfileLikes {
  /** 当前连接的服务端有资料点赞，而且拿得到我的赞数 */
  available: boolean;
  total: number;
  /** 今天收到的赞；还没取到时是 0 */
  today: number;
}

/**
 * 我自己收到的赞：总数 + 今天的 +N。自己的资料卡、自己的个人空间打开时取一次（GET /users/{我}/likes），
 * 之后由 user.profile.liked 事件接着改（handleProfileLikeEvent）。
 */
export function useMyProfileLikes(user: User | null | undefined): MyProfileLikes {
  const userId = user?.id ?? 0;
  const options = useProfileLikeOptions(userId > 0).data ?? null;
  const stateQuery = useProfileLikeState(userId, Boolean(options));
  const total = stateQuery.data?.like_count ?? readProfileLikeCount(user);
  return { available: Boolean(options) && total !== null, total: total ?? 0, today: stateQuery.data?.today_count ?? 0 };
}

export const RECEIVED_PAGE_SIZE = 20;

/** 谁赞了我，往下加载。 */
export function useReceivedProfileLikes(enabled = true): UseInfiniteQueryResult<InfiniteData<ProfileLikesReceived, number>> {
  return useInfiniteQuery({
    queryKey: likeKeys.received,
    queryFn: ({ pageParam }) => getReceivedProfileLikes(RECEIVED_PAGE_SIZE, pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) => {
      const loaded = pages.reduce((sum, page) => sum + page.items.length, 0);
      return lastPage.items.length >= RECEIVED_PAGE_SIZE && loaded < lastPage.total ? loaded : undefined;
    },
    enabled,
    retry: false,
    staleTime: 30_000
  });
}

/**
 * 实时事件 user.profile.liked（只发给被赞的人本人）。src/realtime/client.ts 收到后调这里；预览页模拟事件时也调这里。
 * 服务端 3 秒内只推一条合并后的事件，所以数字直接用事件里的，不在本地累加：
 * 先把所有缓存里我的赞数改掉（资料卡、个人空间立刻跟着变），今天的 +N 写进我自己的那份状态，「谁赞了我」标成过期。
 * 轻量的提示由 ProfileLikeToasts 自己订阅事件。
 */
export function handleProfileLikeEvent(queryClient: QueryClient, data: unknown): void {
  const event = normalizeProfileLikedEvent(data);
  const me = useKukeStore.getState().currentUser;
  if (!event || !me) {
    return;
  }
  patchUserInCaches(queryClient, me.id, { profile_like_count: event.like_count });
  queryClient.setQueryData<ProfileLikeState>(likeKeys.state(me.id), (current) => ({
    user_id: me.id,
    liked_today: false,
    can_like: false,
    left_today: current?.left_today ?? null,
    like_count: event.like_count,
    today_count: event.today_count
  }));
  // 合并后的事件里只有最后一个人，名单没法在本地补全：开着就重取，没开着下次打开时重取
  void queryClient.invalidateQueries({ queryKey: likeKeys.received });
}
