import { useMutation, useQueryClient } from '@tanstack/react-query';
import { blockTemporaryConversation, closeTemporaryConversation, createDirectConversation, pokeMember } from '@/api/conversations';
import { pokeOptionsQuery } from '@/api/users';
import { sendFriendRequest } from '@/api/friends';
import { addFavoriteSticker, deleteMessageLocal, forwardMessageBundle, recallMessage, toggleMessageBookmark, toggleMessageFeature, toggleMessageReaction } from '@/api/messages';
import { createReport } from '@/api/reports';
import { toast } from '@/components/ui/toast';
import { patchMessageInPages, upsertMessageIntoFirstPage } from '@/realtime/cache';
import { useKukeStore } from '@/store/kukeStore';
import { forwardErrorText } from '@/components/redpacket/data';
import { absorbMuteError } from '@/store/moderationStore';
import type { Conversation, CreateReportPayload, Message, MessageMetadata } from '@/types/api';
import { applyLatestMessageToConversations } from '@/utils/conversations';
import { apiErrorCode, describePokeError } from '@/utils/poke';
import { reportFeaturedLimit } from '../message/featuredLimit';
import type { MessagesInfiniteData, SendMessageVariables } from '../message/types';

interface ChatMutationOptions {
  conversationId: number;
  setError: (message: string) => void;
  onFriendRequested: (userId: number) => void;
  /** 戳一戳成功、消息写进缓存之前调用 */
  onPoked: () => void;
}

/** 聊天面板里所有会改动服务端数据的操作。成功后直接修补缓存，不整页重拉。提示都走全站统一的 toast。 */
export function useChatMutations({ conversationId, setError, onFriendRequested, onPoked }: ChatMutationOptions) {
  const queryClient = useQueryClient();
  const setActiveConversationId = useKukeStore((state) => state.setActiveConversationId);

  const patchMessage = (targetConversationId: number, messageId: number, updater: (message: Message) => Message): void => {
    queryClient.setQueryData<MessagesInfiniteData | undefined>(['messages', targetConversationId], (current) => patchMessageInPages(current, messageId, updater));
  };

  const upsertMessage = (message: Message): void => {
    queryClient.setQueryData<MessagesInfiniteData | undefined>(['messages', message.conversation_id], (current) => upsertMessageIntoFirstPage(current, message));
    queryClient.setQueryData<Conversation[] | undefined>(['conversations'], (current) => applyLatestMessageToConversations(current, message, { visibleConversationId: conversationId }));
  };

  const poke = useMutation({
    mutationFn: ({ userId, action }: { userId: number; action?: string }) => pokeMember(conversationId, userId, action),
    onSuccess: (message) => {
      setError('');
      // 和发普通消息一样直接写进缓存，不等实时事件。先回到最新：列表贴着底，新的一行才会跟着露出来
      onPoked();
      upsertMessage(message);
    },
    onError: (error) => {
      // 平台禁言：顺手把输入框也换成锁定状态
      absorbMuteError(error);
      if (apiErrorCode(error) === 'invalid_poke_action') {
        void queryClient.invalidateQueries({ queryKey: pokeOptionsQuery.queryKey });
      }
      toast.error(describePokeError(error));
    }
  });

  const recall = useMutation({
    mutationFn: (messageId: number) => recallMessage(conversationId, messageId),
    onSuccess: (message) => {
      patchMessage(conversationId, message.id, (current) => ({ ...current, ...message }));
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: () => setError('撤回失败，请稍后重试。')
  });

  const deleteLocal = useMutation({
    mutationFn: (messageId: number) => deleteMessageLocal(conversationId, messageId),
    onSuccess: (_result, messageId) => {
      setError('');
      // 只从缓存里摘掉这一条，列表位置不动
      queryClient.setQueryData<MessagesInfiniteData | undefined>(['messages', conversationId], (current) => current ? {
        ...current,
        pages: current.pages.map((page) => (page.some((message) => message.id === messageId) ? page.filter((message) => message.id !== messageId) : page))
      } : current);
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: () => setError('删除本地消息失败，请稍后重试。')
  });

  const bookmark = useMutation({
    mutationFn: (messageId: number) => toggleMessageBookmark(conversationId, messageId),
    onSuccess: (result, messageId) => {
      setError('');
      patchMessage(conversationId, messageId, (message) => ({ ...message, bookmarked_by_me: result.bookmarked }));
      void queryClient.invalidateQueries({ queryKey: ['bookmarks-all'] });
      toast.info(result.bookmarked ? '已收藏' : '已取消收藏');
    },
    onError: () => setError('收藏状态更新失败，请稍后重试。')
  });

  const feature = useMutation({
    mutationFn: (messageId: number) => toggleMessageFeature(conversationId, messageId),
    onSuccess: (result, messageId) => {
      setError('');
      patchMessage(conversationId, messageId, (message) => ({ ...message, featured: result.featured }));
      void queryClient.invalidateQueries({ queryKey: ['featured-messages', conversationId] });
      toast.info(result.featured ? '已设为群精华' : '已取消精华');
    },
    // 只有群主 / 管理员能设精华，所以超限时一定可以给「去升级」
    onError: (error) => {
      if (!reportFeaturedLimit(error, conversationId, true)) {
        setError(error instanceof Error && error.message ? error.message : '精华状态更新失败，请稍后重试。');
      }
    }
  });

  const forward = useMutation({
    mutationFn: ({ targetConversationId, messageIds, note }: { targetConversationId: number; messageIds: number[]; note?: string }) => forwardMessageBundle(targetConversationId, conversationId, messageIds, note),
    onSuccess: (message) => {
      setError('');
      upsertMessage(message);
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast.info('已转发');
    },
    onError: (error) => setError(absorbMuteError(error) && error instanceof Error ? error.message : forwardErrorText(error))
  });

  const reaction = useMutation({
    mutationFn: ({ messageId, emoji }: { messageId: number; emoji: string }) => toggleMessageReaction(conversationId, messageId, emoji),
    onSuccess: (summary, { messageId }) => {
      setError('');
      patchMessage(conversationId, messageId, (message) => ({ ...message, reactions: summary }));
    },
    onError: () => setError('表情回应失败，请稍后重试。')
  });

  const favoriteSticker = useMutation({
    mutationFn: (sourceUrl: string) => addFavoriteSticker(sourceUrl),
    onSuccess: () => {
      setError('');
      void queryClient.invalidateQueries({ queryKey: ['favorite-stickers'] });
      toast.info('已添加到收藏表情');
    },
    onError: (error) => setError((error instanceof Error && error.message) || '添加收藏表情失败，请稍后重试。')
  });

  const direct = useMutation({
    mutationFn: createDirectConversation,
    onSuccess: (conversation) => {
      setError('');
      setActiveConversationId(conversation.id);
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: () => setError('发起私聊失败，请稍后重试。')
  });

  const closeTemporary = useMutation({
    mutationFn: () => closeTemporaryConversation(conversationId),
    onSuccess: () => {
      setActiveConversationId(null);
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: () => setError('关闭临时会话失败，请稍后重试。')
  });

  const blockTemporary = useMutation({
    mutationFn: () => blockTemporaryConversation(conversationId),
    onSuccess: () => {
      setActiveConversationId(null);
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: () => setError('屏蔽临时会话失败，请稍后重试。')
  });

  const friendRequest = useMutation({
    mutationFn: sendFriendRequest,
    onSuccess: (request, receiverId) => {
      setError('');
      onFriendRequested(request.receiver_id ?? receiverId);
      // 用户截图里那条：正文 + 第二行小字。文案一个字都没动，只是换成新的提示组件
      toast.success('好友申请已发送', { subtitle: '等待对方通过' });
      void queryClient.invalidateQueries({ queryKey: ['friend-requests'] });
    },
    onError: () => toast.error('好友申请发送失败，可能已是好友或已有待处理申请。')
  });

  const report = useMutation({
    mutationFn: (payload: CreateReportPayload) => createReport(payload),
    onSuccess: () => {
      setError('');
      toast.success('举报已提交，处理结果会通知你');
      void queryClient.invalidateQueries({ queryKey: ['report-quota'] });
      void queryClient.invalidateQueries({ queryKey: ['my-reports'] });
    }
  });

  return { poke, recall, deleteLocal, bookmark, feature, forward, reaction, favoriteSticker, direct, closeTemporary, blockTemporary, friendRequest, report };
}
