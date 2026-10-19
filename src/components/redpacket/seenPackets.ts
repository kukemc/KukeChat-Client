import { useSyncExternalStore } from 'react';
import { useKukeStore } from '@/store/kukeStore';

/*
 * 「看过了」的红包（按红包消息的 id 记）。右上角的「N 个红包未领」不再算它们：
 *   · 点提示跳过去的那个；
 *   · 红包卡片真的在视口里露过脸（MessageList 用 IntersectionObserver 报上来）。
 * 有的红包就是不想领，看过一眼还一直挂着提示很烦。按账号存在 localStorage，最多留最近的 SEEN_LIMIT 个；
 * 存不了（隐私模式、配额满）就只在这次运行里记着。
 */

const SEEN_LIMIT = 500;
const STORAGE_PREFIX = 'kukechat:seen-red-packets:';

let loadedFor: number | null = null;
let seenIds: number[] = [];
let seenSet = new Set<number>();
let version = 0;
const listeners = new Set<() => void>();

function storageKey(userId: number): string {
  return `${STORAGE_PREFIX}${userId}`;
}

/** 换了账号（或第一次用）就从 localStorage 读一份这个账号的 */
function ensureLoaded(): number | null {
  const userId = useKukeStore.getState().currentUser?.id ?? null;
  if (userId === loadedFor) {
    return userId;
  }
  loadedFor = userId;
  seenIds = [];
  if (userId !== null) {
    try {
      const raw = window.localStorage.getItem(storageKey(userId));
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) {
        seenIds = parsed.filter((item): item is number => typeof item === 'number' && Number.isFinite(item)).slice(-SEEN_LIMIT);
      }
    } catch {
      seenIds = [];
    }
  }
  seenSet = new Set(seenIds);
  version += 1;
  return userId;
}

function persist(userId: number): void {
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(seenIds));
  } catch {
    // 存不了就算了，这次运行里照样记着
  }
}

/** 这几条红包消息看过了。不是红包的 id 也可以传进来（视口里露过脸的每一行都会报），只是多占几个位置 —— 调用方先筛一遍。 */
export function markRedPacketsSeen(messageIds: Iterable<number>): void {
  const userId = ensureLoaded();
  let changed = false;
  for (const id of messageIds) {
    if (!seenSet.has(id)) {
      seenSet.add(id);
      seenIds.push(id);
      changed = true;
    }
  }
  if (!changed) {
    return;
  }
  if (seenIds.length > SEEN_LIMIT) {
    seenIds.splice(0, seenIds.length - SEEN_LIMIT);
    seenSet = new Set(seenIds);
  }
  version += 1;
  if (userId !== null) {
    persist(userId);
  }
  listeners.forEach((listener) => listener());
}

export function isRedPacketSeen(messageId: number): boolean {
  ensureLoaded();
  return seenSet.has(messageId);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function snapshot(): number {
  ensureLoaded();
  return version;
}

/** 看过的集合变了就重渲染；返回一个版本号，配合 isRedPacketSeen 用 */
export function useSeenRedPacketsVersion(): number {
  // 换账号时 currentUser 变了，跟着重读一份
  useKukeStore((state) => state.currentUser?.id ?? null);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
