import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { create } from 'zustand';
import { updateMyConversationSettings } from '@/api/conversations';
import {
  announcementCardOf, confirmAnnouncement, createGroupAnnouncement, deleteGroupAnnouncement, getAnnouncementConfirmations, getGroupAnnouncement,
  isAnnouncementGone, listAnnouncementPopups, listGroupAnnouncements, markAnnouncementSeen, normalizeAnnouncement, updateGroupAnnouncement
} from '@/api/groupAnnouncements';
import { isRecord } from '@/api/normalizers';
import { invalidateConversationData, patchNicknameCache } from '@/components/chat/desktop/info/infoData';
import type { MessagesInfiniteData } from '@/components/chat/message/types';
import { useKukeStore } from '@/store/kukeStore';
import type { Conversation } from '@/types/api';
import type { AnnouncementConfirmStatus, GroupAnnouncement, GroupAnnouncementPayload } from '@/types/groupAnnouncement';
import { parseApiDate } from '@/utils/dateTime';

/**
 * 群公告 v2 的数据层：缓存 key、查询、写操作之后怎么就地改缓存、实时事件怎么处理（契约 KukeChat-Server/docs/group-announcements.md）。
 *
 * 一条公告在三处缓存里：群的公告列表、单条详情、进群弹窗队列。改一条要三处一起改（patchAnnouncement）。
 * my_seen / my_confirmed 是「我」的状态，实时事件里恒为 false，所以从事件来的数据要保留本地值。
 */
export const announcementKeys = {
  /** 列表沿用 v1 的 key：realtime/client.ts 收到公告事件时按它整表失效 */
  list: (conversationId: number) => ['group-announcements', conversationId] as const,
  detail: (conversationId: number, announcementId: number) => ['group-announcement', conversationId, announcementId] as const,
  popups: (conversationId: number) => ['group-announcement-popups', conversationId] as const,
  confirmationsOf: (conversationId: number, announcementId: number) => ['group-announcement-confirmations', conversationId, announcementId] as const,
  confirmations: (conversationId: number, announcementId: number, status: AnnouncementConfirmStatus) => ['group-announcement-confirmations', conversationId, announcementId, status] as const
};

// ───────── 界面状态：从聊天卡片打开详情、已删除的公告 ─────────

interface AnnouncementUiState {
  /** 聊天里点了公告卡片：由 GroupAnnouncementHost 打开这条的详情 */
  target: { conversationId: number; announcementId: number } | null;
  open: (conversationId: number, announcementId: number) => void;
  close: () => void;
  /** 这次运行里知道已经被删了的公告（实时事件、打开时 404）。卡片据此变成「该公告已删除」 */
  deleted: Record<number, true>;
  markDeleted: (announcementId: number) => void;
}

export const useAnnouncementUi = create<AnnouncementUiState>((set) => ({
  target: null,
  open: (conversationId, announcementId) => set({ target: { conversationId, announcementId } }),
  close: () => set({ target: null }),
  deleted: {},
  markDeleted: (announcementId) => set((state) => (state.deleted[announcementId] ? state : { deleted: { ...state.deleted, [announcementId]: true } }))
}));

export function openAnnouncementDetail(conversationId: number, announcementId: number): void {
  useAnnouncementUi.getState().open(conversationId, announcementId);
}

// ───────── 排序与缓存 ─────────

function time(value: string | null): number {
  return parseApiDate(value)?.getTime() ?? 0;
}

/** 置顶的在前（按置顶时间从新到旧），其余按发布时间从新到旧。服务端已经排好，本地插入、改动后照同样的规则再排一次。 */
export function sortAnnouncements(items: GroupAnnouncement[]): GroupAnnouncement[] {
  return [...items].sort((left, right) => {
    if (left.pinned !== right.pinned) {
      return left.pinned ? -1 : 1;
    }
    if (left.pinned) {
      const pinnedDiff = time(right.pinned_at) - time(left.pinned_at);
      if (pinnedDiff !== 0) {
        return pinnedDiff;
      }
    }
    return time(right.created_at) - time(left.created_at) || right.id - left.id;
  });
}

function findCached(queryClient: QueryClient, conversationId: number, announcementId: number): GroupAnnouncement | undefined {
  return queryClient.getQueryData<GroupAnnouncement>(announcementKeys.detail(conversationId, announcementId))
    ?? queryClient.getQueryData<GroupAnnouncement[]>(announcementKeys.list(conversationId))?.find((item) => item.id === announcementId);
}

/**
 * 放进一条完整的公告（发布、修改、确认的回包，实时事件）。
 * keepMine：数据来自实时事件，my_seen / my_confirmed 不可信，沿用本地已有的值。
 * 「发送给新成员」全群只能有一条：这条开了，列表里其它的就地关掉（服务端也是这么做的）。
 */
export function upsertAnnouncement(queryClient: QueryClient, next: GroupAnnouncement, keepMine = false): void {
  const { conversation_id: conversationId, id } = next;
  const previous = findCached(queryClient, conversationId, id);
  const merged = keepMine ? { ...next, my_seen: previous?.my_seen ?? next.my_seen, my_confirmed: previous?.my_confirmed ?? next.my_confirmed } : next;
  queryClient.setQueryData<GroupAnnouncement[] | undefined>(announcementKeys.list(conversationId), (current) => {
    if (!current) {
      return current;
    }
    const others = current.filter((item) => item.id !== id).map((item) => (merged.send_to_new_members && item.send_to_new_members ? { ...item, send_to_new_members: false } : item));
    return sortAnnouncements([...others, merged]);
  });
  queryClient.setQueryData<GroupAnnouncement>(announcementKeys.detail(conversationId, id), merged);
  queryClient.setQueryData<GroupAnnouncement[] | undefined>(announcementKeys.popups(conversationId), (current) => current?.map((item) => (item.id === id ? { ...merged } : item)));
}

/** 只改几个字段（看过、确认人数），三处缓存一起改。 */
export function patchAnnouncement(queryClient: QueryClient, conversationId: number, announcementId: number, patch: Partial<GroupAnnouncement>): void {
  const apply = (item: GroupAnnouncement): GroupAnnouncement => (item.id === announcementId ? { ...item, ...patch } : item);
  queryClient.setQueryData<GroupAnnouncement[] | undefined>(announcementKeys.list(conversationId), (current) => current?.map(apply));
  queryClient.setQueryData<GroupAnnouncement | undefined>(announcementKeys.detail(conversationId, announcementId), (current) => (current ? apply(current) : current));
  queryClient.setQueryData<GroupAnnouncement[] | undefined>(announcementKeys.popups(conversationId), (current) => current?.map(apply));
}

/** 已加载的聊天记录里，这条公告的卡片都标成已删除（之后拉历史服务端给的就是删除态）。 */
function markCardsDeleted(queryClient: QueryClient, conversationId: number, announcementId: number, cardMessageIds: ReadonlySet<number>): void {
  queryClient.setQueryData<MessagesInfiniteData | undefined>(['messages', conversationId], (current) => {
    if (!current) {
      return current;
    }
    let changed = false;
    const pages = current.pages.map((page) => page.map((message) => {
      const card = announcementCardOf(message);
      if (!card || card.deleted || (card.announcementId !== announcementId && !cardMessageIds.has(message.id))) {
        return message;
      }
      changed = true;
      return { ...message, metadata: { ...(message.metadata ?? {}), deleted: true } };
    }));
    return changed ? { ...current, pages } : current;
  });
}

/** 公告没了（删除事件、自己删的、打开时 404）：列表、详情、弹窗里拿掉，卡片变成删除态。 */
export function removeAnnouncement(queryClient: QueryClient, conversationId: number, announcementId: number, cardMessageIds: ReadonlySet<number> = new Set()): void {
  useAnnouncementUi.getState().markDeleted(announcementId);
  queryClient.setQueryData<GroupAnnouncement[] | undefined>(announcementKeys.list(conversationId), (current) => current?.filter((item) => item.id !== announcementId));
  queryClient.setQueryData<GroupAnnouncement[] | undefined>(announcementKeys.popups(conversationId), (current) => current?.filter((item) => item.id !== announcementId));
  queryClient.removeQueries({ queryKey: announcementKeys.detail(conversationId, announcementId), exact: true });
  queryClient.removeQueries({ queryKey: announcementKeys.confirmationsOf(conversationId, announcementId) });
  markCardsDeleted(queryClient, conversationId, announcementId, cardMessageIds);
}

// ───────── 查询 ─────────

export function useAnnouncementList(conversationId: number, enabled = true) {
  return useQuery({
    queryKey: announcementKeys.list(conversationId),
    queryFn: async () => sortAnnouncements(await listGroupAnnouncements(conversationId)),
    enabled
  });
}

export function useAnnouncementDetail(conversationId: number, announcementId: number, enabled = true) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: announcementKeys.detail(conversationId, announcementId),
    queryFn: async () => {
      try {
        return await getGroupAnnouncement(conversationId, announcementId);
      } catch (error) {
        if (isAnnouncementGone(error)) {
          // 已经被删了：卡片、列表跟着变（removeAnnouncement 会顺手清掉这条查询，所以放到下一拍）
          queueMicrotask(() => removeAnnouncement(queryClient, conversationId, announcementId));
        }
        throw error;
      }
    },
    // 列表里已经有这条：先拿它画出来，后台再拉最新的
    placeholderData: () => queryClient.getQueryData<GroupAnnouncement[]>(announcementKeys.list(conversationId))?.find((item) => item.id === announcementId),
    retry: (count, error) => !isAnnouncementGone(error) && count < 2,
    enabled
  });
}

/** 我在这个群里该弹出的公告（第 4 节）。进群时拉一次；收到 popup 公告的事件时失效重拉。 */
export function useAnnouncementPopups(conversationId: number | null) {
  return useQuery({
    queryKey: announcementKeys.popups(conversationId ?? 0),
    queryFn: () => listAnnouncementPopups(conversationId ?? 0),
    enabled: conversationId !== null,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    retry: false
  });
}

const CONFIRMATION_PAGE_SIZE = 50;

export function useAnnouncementConfirmations(conversationId: number, announcementId: number, status: AnnouncementConfirmStatus) {
  return useInfiniteQuery({
    queryKey: announcementKeys.confirmations(conversationId, announcementId, status),
    queryFn: ({ pageParam }) => getAnnouncementConfirmations(conversationId, announcementId, status, pageParam, CONFIRMATION_PAGE_SIZE),
    initialPageParam: 0,
    getNextPageParam: (last) => (last.has_more ? last.offset + last.items.length : undefined)
  });
}

// ───────── 写操作 ─────────

function afterContentChange(queryClient: QueryClient, conversationId: number): void {
  // 会话上的 announcement（旧的单条公告文本，侧栏摘要在用）跟着最新一条走
  void queryClient.invalidateQueries({ queryKey: ['conversations'] });
  void queryClient.invalidateQueries({ queryKey: announcementKeys.list(conversationId) });
}

export function useSaveAnnouncement(conversationId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: number | null; payload: GroupAnnouncementPayload }) => (
      id === null ? createGroupAnnouncement(conversationId, payload) : updateGroupAnnouncement(conversationId, id, payload)
    ),
    onSuccess: (announcement) => {
      upsertAnnouncement(queryClient, announcement);
      afterContentChange(queryClient, conversationId);
    }
  });
}

export function useDeleteAnnouncement(conversationId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (announcementId: number) => deleteGroupAnnouncement(conversationId, announcementId),
    onSuccess: (_result, announcementId) => {
      removeAnnouncement(queryClient, conversationId, announcementId);
      afterContentChange(queryClient, conversationId);
    }
  });
}

export function useConfirmAnnouncement(conversationId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (announcementId: number) => confirmAnnouncement(conversationId, announcementId),
    onSuccess: (announcement) => {
      upsertAnnouncement(queryClient, { ...announcement, my_seen: true, my_confirmed: true });
      void queryClient.invalidateQueries({ queryKey: announcementKeys.confirmationsOf(conversationId, announcement.id) });
    }
  });
}

/** 标记看过（打开详情、关掉弹窗）。失败不提示：下次打开会再标一次。 */
export function markSeen(queryClient: QueryClient, conversationId: number, announcementId: number): void {
  patchAnnouncement(queryClient, conversationId, announcementId, { my_seen: true });
  markAnnouncementSeen(conversationId, announcementId).catch(() => undefined);
}

/** 公告里「修改群昵称」：和群资料页「我的本群昵称」同一个接口、同样的缓存更新。 */
export function useChangeMyNickname(conversationId: number) {
  const queryClient = useQueryClient();
  const currentUserId = useKukeStore((state) => state.currentUser?.id ?? 0);
  return useMutation({
    mutationFn: (nickname: string) => updateMyConversationSettings(conversationId, { nickname }),
    onSuccess: (member) => {
      patchNicknameCache(queryClient, conversationId, currentUserId, member.nickname ?? null);
      queryClient.setQueryData<Conversation[]>(['conversations'], (current) => current?.map((item) => (item.id === conversationId ? { ...item, my_nickname: member.nickname } : item)) ?? current);
      invalidateConversationData(queryClient, conversationId);
    }
  });
}

// ───────── 实时事件（第 6 节） ─────────

export function handleGroupAnnouncementEvent(queryClient: QueryClient, rawType: string, data: unknown): void {
  if (rawType === 'group.announcement.created' || rawType === 'group.announcement.updated') {
    const announcement = normalizeAnnouncement(data);
    if (!announcement) {
      return;
    }
    upsertAnnouncement(queryClient, announcement, true);
    if (announcement.popup || announcement.send_to_new_members) {
      // 只有正开着这个群（弹窗查询在用）时才会真的重拉；没开着的等下次进群
      void queryClient.invalidateQueries({ queryKey: announcementKeys.popups(announcement.conversation_id) });
    }
    return;
  }
  if (!isRecord(data) || typeof data.conversation_id !== 'number' || typeof data.announcement_id !== 'number') {
    return;
  }
  const conversationId = data.conversation_id;
  const announcementId = data.announcement_id;
  if (rawType === 'group.announcement.deleted') {
    // card_message_ids：服务端标成删除态的卡片消息；按 announcement_id 也能匹配到，两个都认
    const cardMessageIds = new Set(Array.isArray(data.card_message_ids) ? data.card_message_ids.filter((id): id is number => typeof id === 'number') : []);
    removeAnnouncement(queryClient, conversationId, announcementId, cardMessageIds);
    return;
  }
  if (rawType === 'group.announcement.confirmations') {
    const patch: Partial<GroupAnnouncement> = {};
    if (typeof data.confirmed_count === 'number') {
      patch.confirmed_count = data.confirmed_count;
    }
    if (typeof data.member_count === 'number') {
      patch.member_count = data.member_count;
    }
    patchAnnouncement(queryClient, conversationId, announcementId, patch);
    void queryClient.invalidateQueries({ queryKey: announcementKeys.confirmationsOf(conversationId, announcementId) });
  }
}
