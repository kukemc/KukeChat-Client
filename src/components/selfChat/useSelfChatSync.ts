import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getMessages } from '@/api/messages';
import { patchConversation } from '@/realtime/cache';
import { useKukeStore } from '@/store/kukeStore';
import { applySelfRecount, bindSelfChatUser, initSelfBaseline, markSelfSeen, noteSelfConversationId, selfChatSnapshot, useSelfChatStore } from '@/store/selfChatStore';
import type { Conversation } from '@/types/api';
import { isOtherDeviceMessage } from '@/utils/selfChat';

/** 补数时拉的那一页：离线期间另一台设备发的超过这么多条，角标就停在这个数 */
const RECOUNT_PAGE = 50;

/**
 * 「我的设备」会话的本地未读跟上（self-chat.md 3.3），挂在聊天主界面上：
 * - 会话列表里它的最后一条比本机数过的新（离线期间、重连后另一台设备发了东西）：拉一页，把「本机上次看到的」之后另一类设备发的数出来
 * - 本机算的未读变了：写回会话缓存里的 unread_count，列表角标、导航总数都按它画
 */
export function useSelfChatSync(conversations: Conversation[], currentUserId: number): void {
  const queryClient = useQueryClient();
  const self = conversations.find((conversation) => conversation.type === 'self') ?? null;
  const selfId = self?.id ?? null;
  const lastId = self?.last_message?.id ?? 0;
  const unread = useSelfChatStore((state) => state.unread);
  const storeUserId = useSelfChatStore((state) => state.userId);
  const visible = useKukeStore((state) => selfId !== null && state.visibleConversationId === selfId);

  useEffect(() => {
    bindSelfChatUser(currentUserId);
  }, [currentUserId]);

  useEffect(() => {
    if (selfId === null || storeUserId !== currentUserId) {
      return;
    }
    noteSelfConversationId(selfId);
    const state = selfChatSnapshot();
    if (state.lastSeenId === 0 && state.countedUpTo === 0) {
      // 本机第一次见到这个会话：以前的不算未读
      initSelfBaseline(lastId);
      return;
    }
    if (lastId <= state.countedUpTo) {
      return;
    }
    if (visible) {
      markSelfSeen(lastId);
      return;
    }
    let cancelled = false;
    void getMessages(selfId, { limit: RECOUNT_PAGE }).then((messages) => {
      if (cancelled || messages.length === 0) {
        return;
      }
      const { lastSeenId } = selfChatSnapshot();
      const count = messages.filter((message) => message.id > lastSeenId && !message.recalled_at && message.type !== 'system' && isOtherDeviceMessage(message)).length;
      applySelfRecount(count, Math.max(...messages.map((message) => message.id)));
    }).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [currentUserId, lastId, selfId, storeUserId, visible]);

  useEffect(() => {
    if (selfId === null) {
      return;
    }
    const shown = visible ? 0 : unread;
    queryClient.setQueryData<Conversation[] | undefined>(['conversations'], (current) => patchConversation(current, selfId, (conversation) => (
      (conversation.unread_count ?? 0) === shown ? conversation : { ...conversation, unread_count: shown }
    )));
  }, [queryClient, selfId, unread, visible]);
}
