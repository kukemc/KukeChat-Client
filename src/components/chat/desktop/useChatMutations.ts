import { useMutation, useQueryClient } from '@tanstack/react-query';
import { blockTemporaryConversation, closeTemporaryConversation, createDirectConversation, pokeMember } from '@/api/conversations';
import { pokeOptionsQuery } from '@/api/users';
import { sendFriendRequest } from '@/api/friends';
import { addFavoriteSticker, deleteMessageLocal, forwardMessageBundle, recallMessage, sendMessage, toggleMessageBookmark, toggleMessageFeature, toggleMessageReaction, uploadMessageImage, uploadMessageVoice } from '@/api/messages';
import { createReport } from '@/api/reports';
import { patchMessageInPages, upsertMessageIntoFirstPage } from '@/realtime/cache';
import { useKukeStore } from '@/store/kukeStore';
import { absorbMuteError } from '@/store/moderationStore';
import type { Conversation, CreateReportPayload, Message, MessageMetadata } from '@/types/api';
import { applyLatestMessageToConversations } from '@/utils/conversations';
import { apiErrorCode, describePokeError } from '@/utils/poke';
import type { MessagesInfiniteData, SendMessageVariables } from '../message/types';
import type { ShowToast } from './runtime';

function describeSendError(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (/20 messages|per minute|429/i.test(message)) {
    return '发送太频繁了，每分钟最多发送 20 条消息。';
  }
  if (/3MB|413|too large/i.test(message)) {
    return /voice|语音/i.test(message) ? '语音不能超过 2MB。' : '图片压缩后不能超过 3MB（GIF 保留原图，原图不能超过 3MB）。';
  }
  return message || '发送失败，请稍后重试。';
}

interface ChatMutationOptions {
  conversationId: number;
  setError: (message: string) => void;
  showToast: ShowToast;
  onFriendRequested: (userId: number) => void;
  /** 戳一戳成功、消息写进缓存之前调用 */
  onPoked: () => void;
}

/** 聊天面板里所有会改动服务端数据的操作。成功后直接修补缓存，不整页重拉。 */
export function useChatMutations({ conversationId, setError, showToast, onFriendRequested, onPoked }: ChatMutationOptions) {
  const queryClient = useQueryClient();
  const setActiveConversationId = useKukeStore((state) => state.setActiveConversationId);

  const patchMessage = (targetConversationId: number, messageId: number, updater: (message: Message) => Message): void => {
    queryClient.setQueryData<MessagesInfiniteData | undefined>(['messages', targetConversationId], (current) => patchMessageInPages(current, messageId, updater));
  };

  const upsertMessage = (message: Message): void => {
    queryClient.setQueryData<MessagesInfiniteData | undefined>(['messages', message.conversation_id], (current) => upsertMessageIntoFirstPage(current, message));
    queryClient.setQueryData<Conversation[] | undefined>(['conversations'], (current) => applyLatestMessageToConversations(current, message, { visibleConversationId: conversationId }));
  };

  const send = useMutation({
    mutationFn: async ({ content, type, metadata, files, voiceFile, voiceDurationMs, voiceWaveform }: SendMessageVariables) => {
      if (type === 'voice' && voiceFile) {
        const uploaded = await uploadMessageVoice(voiceFile);
        return sendMessage(conversationId, uploaded.url, 'voice', {
          ...(metadata ?? {}),
          voice: { duration_ms: voiceDurationMs, content_type: uploaded.content_type ?? voiceFile.type, size: voiceFile.size, waveform: voiceWaveform }
        });
      }
      const uploadedImages = await Promise.all((files ?? []).map(async (file) => (await uploadMessageImage(file)).url));
      if (uploadedImages.length === 1 && !content.trim() && type === 'image') {
        return sendMessage(conversationId, uploadedImages[0], 'image', metadata);
      }
      const nextMetadata: MessageMetadata | undefined = uploadedImages.length > 0 ? { ...(metadata ?? {}), images: uploadedImages } : metadata;
      return sendMessage(conversationId, content, type, nextMetadata);
    },
    onSuccess: upsertMessage,
    // 被禁言时输入框会换成锁定提示，不再额外弹错误条
    onError: (error) => setError(absorbMuteError(error) ? '' : describeSendError(error))
  });

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
      showToast(describePokeError(error), 'error');
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
      showToast(result.bookmarked ? '已收藏' : '已取消收藏');
    },
    onError: () => setError('收藏状态更新失败，请稍后重试。')
  });

  const feature = useMutation({
    mutationFn: (messageId: number) => toggleMessageFeature(conversationId, messageId),
    onSuccess: (result, messageId) => {
      setError('');
      patchMessage(conversationId, messageId, (message) => ({ ...message, featured: result.featured }));
      void queryClient.invalidateQueries({ queryKey: ['featured-messages', conversationId] });
      showToast(result.featured ? '已设为群精华' : '已取消精华');
    },
    onError: () => setError('精华状态更新失败，请稍后重试。')
  });

  const forward = useMutation({
    mutationFn: ({ targetConversationId, messageIds, note }: { targetConversationId: number; messageIds: number[]; note?: string }) => forwardMessageBundle(targetConversationId, conversationId, messageIds, note),
    onSuccess: (message) => {
      setError('');
      upsertMessage(message);
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      showToast('已转发');
    },
    onError: (error) => setError(absorbMuteError(error) && error instanceof Error ? error.message : '转发失败，请稍后重试。')
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
      showToast('已添加到收藏表情');
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
      showToast('好友申请已发送，等待对方通过');
      void queryClient.invalidateQueries({ queryKey: ['friend-requests'] });
    },
    onError: () => showToast('好友申请发送失败，可能已是好友或已有待处理申请。', 'error')
  });

  const report = useMutation({
    mutationFn: (payload: CreateReportPayload) => createReport(payload),
    onSuccess: () => {
      setError('');
      showToast('举报已提交，处理结果会通知你');
      void queryClient.invalidateQueries({ queryKey: ['report-quota'] });
      void queryClient.invalidateQueries({ queryKey: ['my-reports'] });
    }
  });

  return { send, poke, recall, deleteLocal, bookmark, feature, forward, reaction, favoriteSticker, direct, closeTemporary, blockTemporary, friendRequest, report };
}
