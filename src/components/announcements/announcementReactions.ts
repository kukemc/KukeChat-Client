import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { create } from 'zustand';
import { DEFAULT_ANNOUNCEMENT_REACTION_OPTIONS, canRemoveAnnouncementReactionByPath, getAnnouncementReactionOptions, removeAnnouncementReaction, toggleAnnouncementReaction } from '@/api/announcements';
import { ApiError, NetworkError } from '@/api/client';
import { isRecord } from '@/api/normalizers';
import { compactNumber } from '@/components/home/homeModel';
import { absorbMuteError } from '@/store/moderationStore';
import type { Announcement, AnnouncementReaction, AnnouncementReactionOptions } from '@/types/api';

/*
 * 系统公告下面的 emoji 回应：缓存的改写、实时事件、乐观更新。手机端和桌面端的回应栏共用。
 *
 * 查询缓存（公告列表和「最新一条」）里放的始终是服务端说的状态。
 * 自己刚点下去、接口还没返回的那几个操作另外记在 pending 里，显示时再叠上去：
 * 失败了把它拿掉就等于回滚，中途到的实时事件也不会和它互相覆盖。
 */

/** 回应数量的显示：上千之后缩写成 1.2k、3.4万。 */
export const formatReactionCount = compactNumber;

interface PendingState {
  /** `公告 id:emoji` → 这次操作想要的结果（true 回应，false 取消） */
  pending: Record<string, boolean>;
  begin: (key: string, on: boolean) => void;
  end: (key: string) => void;
}

const usePendingReactions = create<PendingState>((set) => ({
  pending: {},
  begin: (key, on) => set((state) => ({ pending: { ...state.pending, [key]: on } })),
  end: (key) => set((state) => {
    const pending = { ...state.pending };
    delete pending[key];
    return { pending };
  })
}));

function pendingKey(announcementId: number, emoji: string): string {
  return `${announcementId}:${emoji}`;
}

/** 把「我」的一个回应加上 / 拿掉之后，列表应该是什么样。已经是那个状态时原样返回。 */
function withMyReaction(reactions: AnnouncementReaction[], emoji: string, on: boolean): AnnouncementReaction[] {
  const existing = reactions.find((reaction) => reaction.emoji === emoji);
  if (on) {
    if (!existing) {
      return [...reactions, { emoji, count: 1, reacted_by_me: true }];
    }
    return existing.reacted_by_me ? reactions : reactions.map((reaction) => (reaction === existing ? { ...reaction, count: reaction.count + 1, reacted_by_me: true } : reaction));
  }
  if (!existing?.reacted_by_me) {
    return reactions;
  }
  return existing.count <= 1 ? reactions.filter((reaction) => reaction !== existing) : reactions.map((reaction) => (reaction === existing ? { ...reaction, count: reaction.count - 1, reacted_by_me: false } : reaction));
}

function withPending(reactions: AnnouncementReaction[], announcementId: number, pending: Record<string, boolean>): AnnouncementReaction[] {
  const prefix = `${announcementId}:`;
  let next = reactions;
  for (const key of Object.keys(pending)) {
    if (key.startsWith(prefix)) {
      next = withMyReaction(next, key.slice(prefix.length), pending[key]);
    }
  }
  return next;
}

/** 改写缓存里某条公告的回应。列表和「最新一条」是两份缓存，都要改；那条公告不在缓存里时什么都不做。 */
export function patchAnnouncementReactions(queryClient: QueryClient, announcementId: number, updater: (reactions: AnnouncementReaction[]) => AnnouncementReaction[]): void {
  const patch = (announcement: Announcement): Announcement => (announcement.id === announcementId ? { ...announcement, reactions: updater(announcement.reactions ?? []) } : announcement);
  queryClient.setQueryData<Announcement[] | undefined>(['announcement', 'list'], (current) => (Array.isArray(current) ? current.map(patch) : current));
  queryClient.setQueryData<Announcement | null | undefined>(['announcement', 'latest'], (current) => (current ? patch(current) : current));
}

/**
 * 把 `announcement.reaction.updated` 推送修补进缓存。
 * 事件里只有数量和顺序，没有「我回应过哪些」，本地已知的那一份原样保留。
 */
export function applyAnnouncementReactionEvent(queryClient: QueryClient, data: unknown): void {
  if (!isRecord(data) || typeof data.id !== 'number' || !Array.isArray(data.reactions)) {
    return;
  }
  const counts: Array<{ emoji: string; count: number }> = [];
  for (const item of data.reactions) {
    if (isRecord(item) && typeof item.emoji === 'string' && typeof item.count === 'number' && item.count > 0) {
      counts.push({ emoji: item.emoji, count: item.count });
    }
  }
  patchAnnouncementReactions(queryClient, data.id, (current) => {
    const mine = new Set(current.filter((reaction) => reaction.reacted_by_me).map((reaction) => reaction.emoji));
    return counts.map((item) => ({ ...item, reacted_by_me: mine.has(item.emoji) }));
  });
}

function errorCode(error: ApiError): string | null {
  if (!isRecord(error.detail)) {
    return null;
  }
  const detail = isRecord(error.detail.detail) ? error.detail.detail : error.detail;
  return typeof detail.code === 'string' ? detail.code : null;
}

/** 回应失败时给用户看的那句话。上限、频率、禁言这些服务端带了说明的，原样用它的。 */
export function describeAnnouncementReactionError(error: unknown): string {
  if (error instanceof ApiError) {
    const code = errorCode(error);
    if (code) {
      return error.message;
    }
    // 没有业务错误码的 404 / 405 是路由本身不存在：服务端还没上这个功能
    if (error.status === 404 || error.status === 405) {
      return '服务器暂不支持公告回应';
    }
    if (error.status === 422) {
      return '这个表情不能用来回应';
    }
  }
  if (error instanceof NetworkError) {
    return '网络不通，回应没有发出去';
  }
  return '回应失败，请稍后重试';
}

export function useAnnouncementReactionOptions(): AnnouncementReactionOptions {
  const query = useQuery({ queryKey: ['announcement-reaction-options'], queryFn: getAnnouncementReactionOptions, staleTime: 10 * 60_000, retry: false });
  return query.data ?? DEFAULT_ANNOUNCEMENT_REACTION_OPTIONS;
}

export interface AnnouncementReactionsModel {
  /** 要显示的回应（已经叠上了还在路上的操作） */
  reactions: AnnouncementReaction[];
  /** 还没出现在回应里的快捷 emoji */
  quick: string[];
  /** 这条公告还能不能再出现新的 emoji（到了每条公告的种类上限就不能了） */
  canAddNew: boolean;
  /** 最近一次失败的说明，几秒后自己消失 */
  notice: string;
  /** 点一下：没回应过就回应，回应过就取消 */
  toggle: (emoji: string) => void;
}

const NOTICE_DURATION_MS = 4000;

export function useAnnouncementReactions(announcement: Announcement): AnnouncementReactionsModel {
  const queryClient = useQueryClient();
  const options = useAnnouncementReactionOptions();
  const pending = usePendingReactions((state) => state.pending);
  const [notice, setNotice] = useState('');
  const announcementId = announcement.id;
  const source = announcement.reactions;

  const reactions = useMemo(() => withPending((source ?? []).filter((reaction) => reaction.count > 0), announcementId, pending), [source, announcementId, pending]);
  const quick = useMemo(() => options.quick.filter((emoji) => !reactions.some((reaction) => reaction.emoji === emoji)), [options.quick, reactions]);

  useEffect(() => {
    if (!notice) {
      return undefined;
    }
    const timer = window.setTimeout(() => setNotice(''), NOTICE_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const mutation = useMutation({
    // 取消走 DELETE：它不是开关，本地状态万一和服务端对不上，也不会把「取消」变成「回应」
    mutationFn: ({ id, emoji, on }: { id: number; emoji: string; on: boolean }) => (!on && canRemoveAnnouncementReactionByPath(emoji) ? removeAnnouncementReaction(id, emoji) : toggleAnnouncementReaction(id, emoji)),
    onMutate: ({ id, emoji, on }) => {
      setNotice('');
      usePendingReactions.getState().begin(pendingKey(id, emoji), on);
    },
    onSuccess: (state, { id, emoji }) => {
      // 自己的操作以接口返回为准，整份换掉
      patchAnnouncementReactions(queryClient, id, () => state.reactions);
      usePendingReactions.getState().end(pendingKey(id, emoji));
    },
    onError: (error, { id, emoji }) => {
      // 拿掉这次操作，显示就回到了服务端的状态
      usePendingReactions.getState().end(pendingKey(id, emoji));
      absorbMuteError(error);
      setNotice(describeAnnouncementReactionError(error));
      if (error instanceof ApiError && errorCode(error) === 'announcement_not_found') {
        // 公告已经下线了，列表也该跟着变
        void queryClient.invalidateQueries({ queryKey: ['announcement'] });
      }
    }
  });

  function toggle(emoji: string): void {
    // 同一个 emoji 上一次操作还没回来就不再发，免得连点两下互相抵消
    if (pendingKey(announcementId, emoji) in pending) {
      return;
    }
    const reacted = reactions.some((reaction) => reaction.emoji === emoji && reaction.reacted_by_me);
    mutation.mutate({ id: announcementId, emoji, on: !reacted });
  }

  return { reactions, quick, canAddNew: reactions.length < options.per_announcement, notice, toggle };
}
