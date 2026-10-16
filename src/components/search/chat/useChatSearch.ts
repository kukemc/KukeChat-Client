import { useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/api/client';
import { getConversationMembersPage } from '@/api/conversations';
import { hasSearchCondition, searchChatMessages, searchChatSummary } from '@/api/messageSearch';
import type { ChatSearchTarget } from '@/components/groupPlus/ui';
import { useKukeStore } from '@/store/kukeStore';
import type { Conversation, ConversationMember, User } from '@/types/api';
import type { ChatSearchCategory, ChatSearchParams } from '@/types/groupPlus';

/**
 * 聊天记录搜索的状态：关键词（防抖）、分类、日期、发送人，以及当前是「按会话聚合」还是「某个会话里的明细」。
 *
 * 为什么不用「回车提交」：搜索要像 QQ 一样边打边出结果，所以输入防抖 250ms 后自动查；
 * 每次条件变化都是新的 queryKey，react-query 把 signal 传给请求，旧请求会被取消，不会覆盖新结果。
 * 结果只放在内存缓存里（短 gcTime），不落任何持久存储：这是别人说过的话，关掉面板就该散。
 */

const DEBOUNCE_MS = 250;
const PAGE_SIZE = 20;

export interface SenderChoice {
  id: number;
  name: string;
}

export function useDebounced<T>(value: T, delay = DEBOUNCE_MS): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function useChatSearch(target: ChatSearchTarget) {
  const queryClient = useQueryClient();
  const me = useKukeStore((state) => state.currentUser);
  const [input, setInput] = useState(target.keyword ?? '');
  const [category, setCategory] = useState<ChatSearchCategory>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sender, setSender] = useState<SenderChoice | null>(null);
  // 限定的会话：从某个会话里打开就一直是它；全局模式下点进聚合列表里的某个会话才有
  const [scopeId, setScopeId] = useState<number | null>(target.conversationId);
  const [scopeTitle, setScopeTitle] = useState(target.title ?? '');
  const keyword = useDebounced(input.trim());

  const conversation = useMemo(
    () => (scopeId === null ? null : queryClient.getQueryData<Conversation[]>(['conversations'])?.find((item) => item.id === scopeId) ?? null),
    [queryClient, scopeId]
  );

  // 换了会话范围，发送人筛选就不作数了
  useEffect(() => setSender(null), [scopeId]);

  const dateInvalid = Boolean(dateFrom && dateTo && dateFrom > dateTo);
  const params: ChatSearchParams = {
    q: keyword,
    conversationId: scopeId,
    senderId: sender?.id ?? null,
    category,
    dateFrom: dateFrom || null,
    dateTo: dateTo || null,
    limit: PAGE_SIZE
  };
  const ready = !dateInvalid && hasSearchCondition(params);

  const messages = useInfiniteQuery({
    queryKey: ['chat-search', 'messages', scopeId, keyword, category, dateFrom, dateTo, sender?.id ?? null],
    queryFn: ({ pageParam, signal }) => searchChatMessages({ ...params, beforeId: pageParam }, signal),
    initialPageParam: null as number | null,
    getNextPageParam: (last) => (last.has_more ? last.next_before_id : undefined),
    enabled: scopeId !== null && ready,
    retry: false,
    staleTime: 15_000,
    gcTime: 60_000
  });

  // 聚合：契约要求 q 必填，没有关键词时不查
  const summary = useQuery({
    queryKey: ['chat-search', 'summary', keyword, category, dateFrom, dateTo, sender?.id ?? null],
    queryFn: ({ signal }) => searchChatSummary({ q: keyword, category, senderId: sender?.id ?? null, dateFrom: dateFrom || null, dateTo: dateTo || null, limit: 50 }, signal),
    enabled: scopeId === null && keyword.length > 0 && !dateInvalid,
    retry: false,
    staleTime: 15_000,
    gcTime: 60_000
  });

  const hits = messages.data?.pages.flatMap((page) => page.items) ?? [];
  const firstPage = messages.data?.pages[0];

  function enterConversation(id: number, title: string): void {
    setScopeId(id);
    setScopeTitle(title);
  }

  function backToSummary(): void {
    setScopeId(null);
    setScopeTitle('');
  }

  function clearFilters(): void {
    setCategory('all');
    setDateFrom('');
    setDateTo('');
    setSender(null);
  }

  const filterCount = (dateFrom || dateTo ? 1 : 0) + (sender ? 1 : 0);

  return {
    me,
    input, setInput, keyword,
    category, setCategory,
    dateFrom, setDateFrom, dateTo, setDateTo, dateInvalid,
    sender, setSender,
    scopeId, scopeTitle, conversation,
    enterConversation, backToSummary, clearFilters, filterCount,
    ready,
    messages, hits,
    total: firstPage?.total ?? 0,
    totalCapped: firstPage?.total_capped ?? false,
    summary
  };
}

export type ChatSearchState = ReturnType<typeof useChatSearch>;

/** 服务端对「没有任何条件」返回 422 query_required：当成没有结果、给提示，不当成故障。 */
export function isQueryRequired(error: unknown): boolean {
  if (!(error instanceof ApiError) || error.status !== 422) {
    return false;
  }
  const detail = error.detail;
  const inner = typeof detail === 'object' && detail !== null && 'detail' in detail ? (detail as { detail?: unknown }).detail : detail;
  return typeof inner === 'object' && inner !== null && (inner as { code?: unknown }).code === 'query_required';
}

/** 发送人候选：私聊只有我和对方；群聊按关键词搜成员（接口分页，取前 20 个）。 */
export function useSenderChoices(conversation: Conversation | null, scopeId: number | null, query: string, me: User | null, enabled: boolean) {
  const isGroup = conversation?.type !== 'direct';
  const debounced = useDebounced(query.trim());
  const members = useQuery({
    queryKey: ['chat-search', 'senders', scopeId, debounced],
    queryFn: () => getConversationMembersPage(scopeId ?? 0, { limit: 20, search: debounced }),
    enabled: enabled && scopeId !== null && isGroup,
    retry: false,
    staleTime: 30_000,
    gcTime: 60_000
  });
  if (!isGroup) {
    const choices: SenderChoice[] = [];
    const peer = conversation?.direct_user;
    if (peer) {
      choices.push({ id: peer.id, name: peer.nickname || peer.username });
    }
    if (me) {
      choices.push({ id: me.id, name: `${me.nickname || me.username}（我）` });
    }
    return { choices, loading: false, error: false };
  }
  const items: ConversationMember[] = members.data?.items ?? [];
  const choices = items.map((member) => ({
    id: member.user_id,
    name: member.nickname?.trim() || member.user?.nickname || member.user?.username || `用户 ${member.user_id}`
  }));
  return { choices, loading: members.isLoading, error: members.isError };
}
