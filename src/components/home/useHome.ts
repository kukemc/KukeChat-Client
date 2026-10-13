import { useEffect, useRef, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/api/client';
import { createGroupJoinRequest, joinGroup } from '@/api/conversations';
import { getHome } from '@/api/home';
import type { Conversation, HomeGroup } from '@/types/api';
import { groupNeedsRequest } from './homeModel';

function randomSeed(): number {
  return Math.floor(Math.random() * 2_147_483_647);
}

/**
 * 主页的数据和加群流程，桌面版和移动版共用。
 * 推荐的群按 seed 抽样，换一个 seed 就是「换一批」；换的过程中先留着上一批，不闪白。
 */
export function useHome(conversations: Conversation[], onOpenConversation: (conversationId: number, conversation?: Conversation) => void) {
  const queryClient = useQueryClient();
  const [seed, setSeed] = useState(randomSeed);
  const [joinTarget, setJoinTarget] = useState<HomeGroup | null>(null);
  const [joinError, setJoinError] = useState('');
  const [joinErrorGroupId, setJoinErrorGroupId] = useState<number | null>(null);
  const [creatorsOpen, setCreatorsOpen] = useState(false);
  const query = useQuery({ queryKey: ['home', seed], queryFn: () => getHome(seed), placeholderData: keepPreviousData, staleTime: 60_000 });

  const joinMutation = useMutation({
    mutationFn: (group: HomeGroup) => joinGroup(group.id),
    onSuccess: (conversation) => {
      setJoinError('');
      setJoinErrorGroupId(null);
      queryClient.setQueryData<Conversation[] | undefined>(['conversations'], (current) => current?.some((item) => item.id === conversation.id) ? current : [...(current ?? []), conversation]);
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      void queryClient.invalidateQueries({ queryKey: ['home'] });
      onOpenConversation(conversation.id, conversation);
    },
    onError: (error, group) => {
      setJoinErrorGroupId(group.id);
      setJoinError(error instanceof ApiError ? error.message : '加入群聊失败，请稍后重试。');
    }
  });
  const requestMutation = useMutation({
    mutationFn: ({ group, answer }: { group: HomeGroup; answer: string }) => createGroupJoinRequest(group.id, { message: group.join_mode === 'question' ? undefined : answer || undefined, answer: group.join_mode === 'question' ? answer : undefined }),
    onSuccess: () => {
      setJoinTarget(null);
      setJoinError('');
      void queryClient.invalidateQueries({ queryKey: ['home'] });
      void queryClient.invalidateQueries({ queryKey: ['group-join-requests'] });
    },
    onError: (error) => setJoinError(error instanceof ApiError ? error.message : '加群申请提交失败，请稍后重试。')
  });

  /** 点群右边的按钮：已加入的直接进，要审核的弹申请框，其余的当场加入。 */
  function openGroup(group: HomeGroup): void {
    setJoinError('');
    setJoinErrorGroupId(null);
    if (group.joined) {
      const known = conversations.find((item) => item.id === group.id) ?? group;
      onOpenConversation(group.id, known);
      return;
    }
    if (group.join_request_status === 'pending') return;
    if (groupNeedsRequest(group)) {
      setJoinTarget(group);
      return;
    }
    joinMutation.mutate(group);
  }

  function closeJoinDialog(): void {
    setJoinTarget(null);
    setJoinError('');
    setJoinErrorGroupId(null);
  }

  return {
    query, data: query.data,
    reshuffle: () => setSeed(randomSeed()),
    creatorsOpen, setCreatorsOpen,
    joinTarget, joinError, joinErrorGroupId, joinMutation, requestMutation,
    openGroup, closeJoinDialog
  };
}

export type HomeState = ReturnType<typeof useHome>;

/** 加群申请框里的那点状态：打开就聚焦输入框，Esc 关闭（提交途中不让关）。 */
export function useJoinRequestForm(group: HomeGroup, pending: boolean, onClose: () => void) {
  const [answer, setAnswer] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // 设了入群问题的群必须作答；只是审核制的，申请说明可以不填
  const needsAnswer = group.join_mode === 'question' && !group.auto_approve;
  useEffect(() => {
    inputRef.current?.focus();
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape' && !pending) onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, pending]);
  return { answer, setAnswer, inputRef, needsAnswer };
}
