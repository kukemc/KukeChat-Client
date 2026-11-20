import { create } from 'zustand';
import { getFriendActivities, type CcwActivity } from '@/api/ccwSocial';
import { isRecord, pickNumber } from '@/api/normalizers';
import { CCW_SITE_URL } from '@/config/ccw';
import { subscribeRealtimeEvents } from '@/realtime/events';
import { useKukeStore } from './kukeStore';

/**
 * 好友在共创世界上「正在玩 / 正在创作」（后端 docs/ccw-social.md）。
 *
 * 登录时拉一次好友的活动，之后靠 ccw.activity.updated 推送更新。服务端不发「结束」：
 * 每条活动带 expires_at，过了时间还没收到新的推送就自己删掉（和 typingStore 的过期同一个思路）。
 */
interface CcwActivityState {
  byUser: Record<number, CcwActivity>;
}

export const useCcwActivityStore = create<CcwActivityState>(() => ({ byUser: {} }));

const expiryTimers = new Map<number, number>();

function removeActivity(userId: number): void {
  window.clearTimeout(expiryTimers.get(userId));
  expiryTimers.delete(userId);
  useCcwActivityStore.setState(({ byUser }) => {
    if (!(userId in byUser)) return { byUser };
    const { [userId]: _removed, ...rest } = byUser;
    return { byUser: rest };
  });
}

function isActivity(value: unknown): value is CcwActivity {
  return isRecord(value) && typeof value.kind === 'string' && typeof value.title === 'string' && typeof value.expires_at === 'string';
}

export function setCcwActivity(userId: number, activity: CcwActivity | null): void {
  const expiresAt = activity ? Date.parse(activity.expires_at) : NaN;
  if (!activity || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    removeActivity(userId);
    return;
  }
  window.clearTimeout(expiryTimers.get(userId));
  expiryTimers.set(userId, window.setTimeout(() => removeActivity(userId), expiresAt - Date.now()));
  useCcwActivityStore.setState(({ byUser }) => ({ byUser: { ...byUser, [userId]: activity } }));
}

export function clearCcwActivities(): void {
  expiryTimers.forEach((timer) => window.clearTimeout(timer));
  expiryTimers.clear();
  useCcwActivityStore.setState({ byUser: {} });
}

/** 登录、换账号时调用。拉不到不影响别的功能。 */
export async function loadFriendActivities(): Promise<void> {
  try {
    const list = await getFriendActivities();
    list.forEach((item) => setCcwActivity(item.user_id, item.activity));
  } catch {
    // 老版本服务端没有这个接口：当作没人在玩
  }
}

export function useCcwActivity(userId: number | null | undefined): CcwActivity | null {
  return useCcwActivityStore((state) => (userId == null ? null : state.byUser[userId] ?? null));
}

const KIND_LABEL: Record<CcwActivity['kind'], string> = { play: '正在玩', create: '正在创作', read: '正在看' };

export function ccwActivityLabel(activity: CcwActivity): string {
  return `${KIND_LABEL[activity.kind] ?? '正在玩'}《${activity.title}》`;
}

/** 「12 分钟」「1 小时 5 分钟」；不到一分钟显示「刚刚开始」 */
export function ccwActivityElapsed(activity: CcwActivity, now = Date.now()): string {
  const minutes = Math.floor((now - Date.parse(activity.started_at)) / 60000);
  if (!Number.isFinite(minutes) || minutes < 1) return '刚刚开始';
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  return minutes % 60 ? `${hours} 小时 ${minutes % 60} 分钟` : `${hours} 小时`;
}

export function ccwActivityUrl(activity: CcwActivity): string | null {
  if (!activity.ccw_oid) return null;
  return activity.kind === 'read' ? null : `${CCW_SITE_URL}/detail/${activity.ccw_oid}`;
}

// 模块加载时订阅一次：活动跟着连接走，不属于哪个组件
subscribeRealtimeEvents((event) => {
  if (event.rawType !== 'ccw.activity.updated' || !isRecord(event.data)) return;
  const userId = pickNumber(event.data, 'user_id');
  if (userId === null) return;
  setCcwActivity(userId, isActivity(event.data.activity) ? event.data.activity : null);
});

// 换账号时清空，免得看到上一个账号的好友状态
let lastUserId = useKukeStore.getState().currentUser?.id ?? null;
useKukeStore.subscribe((state) => {
  const id = state.currentUser?.id ?? null;
  if (id === lastUserId) return;
  lastUserId = id;
  clearCcwActivities();
  if (id !== null) void loadFriendActivities();
});
if (lastUserId !== null) void loadFriendActivities();
