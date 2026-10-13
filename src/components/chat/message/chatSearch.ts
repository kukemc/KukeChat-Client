import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { searchConversationMessages } from '@/api/messages';
import { MESSAGE_PAGE_SIZE } from './constants';

/** 在一个会话里搜聊天记录：输入框里的字提交之后才发请求，结果按页往更早的翻。 */
export function useChatSearch(conversationId: number) {
  const [inputValue, setInputValue] = useState('');
  const [submittedKeyword, setSubmittedKeyword] = useState('');
  const cleanKeyword = submittedKeyword.trim();
  const searchQuery = useInfiniteQuery({
    queryKey: ['messages-search', conversationId, cleanKeyword],
    queryFn: ({ pageParam }) => searchConversationMessages(conversationId, { query: cleanKeyword, category: 'all', beforeId: pageParam, limit: MESSAGE_PAGE_SIZE }),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) => lastPage.has_more ? lastPage.next_before_id ?? undefined : undefined,
    enabled: cleanKeyword.length > 0
  });
  const results = searchQuery.data?.pages.flatMap((page) => page.items.map((item) => item.message)) ?? [];

  function submitSearch(event?: React.FormEvent<HTMLFormElement>): void {
    event?.preventDefault();
    setSubmittedKeyword(inputValue.trim());
  }

  return { inputValue, setInputValue, cleanKeyword, searchQuery, results, submitSearch };
}
