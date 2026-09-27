import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { WS_URL } from '@/config';
import { useKukeStore } from '@/store/kukeStore';
import { emitRealtimeEvent, parseRealtimePayload } from './events';
import { emitPoke } from './poke';
import { pickNumber } from '@/api/normalizers';
import type { AccountSuspension, Conversation, ConversationMember, Message, MessageComponentState, OnlineUsersRead } from '@/types/api';
import { requestDesktopAttention } from '@/utils/desktopAttention';
import { applyCreatedMessageToConversations, recordReceivedMessage, shouldAlertIncomingMessage, patchConversation, patchMemberPages, patchMemberPresence, patchMembers, patchMessageInPages, patchUserPresence, upsertMessageIntoFirstPage } from './cache';
import type { MessagesInfiniteData, ConversationMembersPageData } from './cache';
import { canAlertConversation, isConversationBlocked, notifyConnectionReady, notifyIncomingMessage, notifyMemberJoined, notifyMemberLeft } from '@/utils/notifications';

const HEARTBEAT_INTERVAL_MS = 25_000;
const PONG_TIMEOUT_MS = 10_000;
const RECONNECT_BASE_DELAY_MS = 1_000;
const RECONNECT_MAX_DELAY_MS = 30_000;
const RECONNECT_JITTER_MS = 500;
const AUTH_CLOSE_CODES = new Set([1008]);

const MEMBER_REFRESH_DEBOUNCE_MS = 150;

function patchMessageComponentState(message: Message, componentId: string, state: MessageComponentState): Message {
  return {
    ...message,
    metadata: {
      ...(message.metadata ?? {}),
      component_state: {
        ...(message.metadata?.component_state ?? {}),
        [componentId]: {
          ...(message.metadata?.component_state?.[componentId] ?? {}),
          ...state
        }
      }
    }
  };
}

function resolveWsUrl(): string {
  if (import.meta.env.DEV) {
    return window.__KukeChatPreviewConfig?.wsUrl ?? WS_URL;
  }
  return WS_URL;
}

function buildSocketUrl(wsUrl: string, token: string): string {
  const url = new URL(wsUrl);
  url.searchParams.set('token', token);
  return url.toString();
}

export function useRealtime(enabled: boolean): void {
  const token = useKukeStore((state) => state.token);
  const currentUser = useKukeStore((state) => state.currentUser);
  const activeConversationId = useKukeStore((state) => state.activeConversationId);
  const visibleConversationId = useKukeStore((state) => state.visibleConversationId);
  const setActiveConversationId = useKukeStore((state) => state.setActiveConversationId);
  const setOnlineCount = useKukeStore((state) => state.setOnlineCount);
  const queryClient = useQueryClient();

  const activeConversationIdRef = useRef(activeConversationId);
  const visibleConversationIdRef = useRef(visibleConversationId);

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  useEffect(() => {
    visibleConversationIdRef.current = visibleConversationId;
  }, [visibleConversationId]);

  useEffect(() => {
    if (!enabled || !token) {
      return undefined;
    }

    const authToken = token;
    let socket: WebSocket | null = null;
    let pingId: number | null = null;
    let pongTimeoutId: number | null = null;
    let reconnectTimerId: number | null = null;
    let reconnectAttempt = 0;
    let closedByEffect = false;
    const memberRefreshTimers = new Map<number, number>();
    let conversationRefreshTimer: number | null = null;
    const recentlyReceivedMessages = new Set<string>();
    const lastReadMessageIds = new Map<number, number>();

    const scheduleConversationRefresh = (): void => {
      if (conversationRefreshTimer !== null) return;
      conversationRefreshTimer = window.setTimeout(() => {
        conversationRefreshTimer = null;
        if (!closedByEffect) void queryClient.invalidateQueries({ queryKey: ['conversations'], exact: true });
      }, MEMBER_REFRESH_DEBOUNCE_MS);
    };

    const scheduleMemberRefresh = (conversationId: number): void => {
      if (memberRefreshTimers.has(conversationId)) return;
      memberRefreshTimers.set(conversationId, window.setTimeout(() => {
        memberRefreshTimers.delete(conversationId);
        if (closedByEffect) return;
        void queryClient.invalidateQueries({ queryKey: ['conversation-members', conversationId] });
        void queryClient.invalidateQueries({ queryKey: ['conversation-members-page', conversationId] });
      }, MEMBER_REFRESH_DEBOUNCE_MS));
    };

    const clearPendingRefreshes = (): void => {
      if (conversationRefreshTimer !== null) window.clearTimeout(conversationRefreshTimer);
      conversationRefreshTimer = null;
      for (const timer of memberRefreshTimers.values()) window.clearTimeout(timer);
      memberRefreshTimers.clear();
    };

    const clearHeartbeat = (): void => {
      if (pingId !== null) {
        window.clearInterval(pingId);
        pingId = null;
      }
      if (pongTimeoutId !== null) {
        window.clearTimeout(pongTimeoutId);
        pongTimeoutId = null;
      }
    };

    const refreshAfterReconnect = (): void => {
      // Full reconciliation remains mandatory after disconnects, including cross-worker Redis delivery gaps.
      clearPendingRefreshes();
      recentlyReceivedMessages.clear();
      lastReadMessageIds.clear();
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      void queryClient.invalidateQueries({ queryKey: ['friend-requests'] });
      void queryClient.invalidateQueries({ queryKey: ['group-join-requests'] });
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      const conversationId = activeConversationIdRef.current;
      if (conversationId !== null) {
        void queryClient.resetQueries({ queryKey: ['messages', conversationId], exact: true });
      }
    };

    const scheduleReconnect = (event?: CloseEvent): void => {
      if (closedByEffect || (event && AUTH_CLOSE_CODES.has(event.code)) || reconnectTimerId !== null) {
        return;
      }
      const delay = Math.min(RECONNECT_BASE_DELAY_MS * 2 ** reconnectAttempt, RECONNECT_MAX_DELAY_MS) + Math.floor(Math.random() * RECONNECT_JITTER_MS);
      reconnectAttempt += 1;
      reconnectTimerId = window.setTimeout(() => {
        reconnectTimerId = null;
        connect();
      }, delay);
    };

    const startHeartbeat = (): void => {
      clearHeartbeat();
      pingId = window.setInterval(() => {
        if (socket?.readyState !== WebSocket.OPEN) {
          return;
        }
        try {
          socket.send('ping');
        } catch {
          socket.close();
          return;
        }
        if (pongTimeoutId !== null) {
          window.clearTimeout(pongTimeoutId);
        }
        pongTimeoutId = window.setTimeout(() => {
          pongTimeoutId = null;
          socket?.close();
        }, PONG_TIMEOUT_MS);
      }, HEARTBEAT_INTERVAL_MS);
    };

    function connect(): void {
      if (closedByEffect || socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) {
        return;
      }

      socket = new WebSocket(buildSocketUrl(resolveWsUrl(), authToken));

      socket.addEventListener('open', () => {
        const wasReconnect = reconnectAttempt > 0;
        reconnectAttempt = 0;
        notifyConnectionReady();
        startHeartbeat();
        if (wasReconnect) {
          refreshAfterReconnect();
        }
      });

      socket.addEventListener('message', (message) => {
        if (typeof message.data !== 'string') {
          return;
        }
        if (message.data === 'pong') {
          if (pongTimeoutId !== null) {
            window.clearTimeout(pongTimeoutId);
            pongTimeoutId = null;
          }
          return;
        }

        const event = parseRealtimePayload(message.data);
        if (!event || event.rawType === 'pong') {
          return;
        }

        if (event.type === 'account.suspended') {
          const data = event.data as Partial<AccountSuspension>;
          useKukeStore.getState().setAccountSuspension({
            code: 'account_suspended',
            reason: typeof data.reason === 'string' ? data.reason : null,
            banned_until: typeof data.banned_until === 'string' ? data.banned_until : null,
            permanent: data.permanent === true || data.banned_until === null
          });
          return;
        }

        if (event.type === 'message.created' || event.type === 'message.recalled' || event.type === 'message.reaction.updated' || event.type === 'message.featured.updated' || event.type === 'message.component.updated') {
          const conversationId = pickNumber(event.data, 'conversation_id');
          const currentVisibleConversationId = visibleConversationIdRef.current;
          if (event.type === 'message.created' && conversationId !== null) {
            const message = event.data as Message;
            const conversations = queryClient.getQueryData<Conversation[]>(['conversations']);
            const currentConversation = conversations?.find((conversation) => conversation.id === conversationId);
            if (isConversationBlocked(currentConversation)) {
              return;
            }
            if (!currentConversation) scheduleConversationRefresh();
            // The messages HTTP query may finish before this WS event while the
            // conversations query still holds an old unread snapshot. Never use
            // message-page cache hits to suppress a first WS unread/notification.
            const firstDelivery = recordReceivedMessage(recentlyReceivedMessages, conversationId, message.id);
            // The server also echoes our own messages: never count those as unread.
            const shouldNotify = shouldAlertIncomingMessage(firstDelivery, message, currentUser?.id ?? null, lastReadMessageIds.get(conversationId) ?? 0);
            // A conversations HTTP response can already include this WS message,
            // including its unread count, even when the message page did not load yet.
            const shouldIncrementUnread = shouldNotify && currentConversation?.last_message?.id !== message.id;
            if (shouldIncrementUnread) {
              notifyIncomingMessage(message, currentConversation);
              if (canAlertConversation(currentConversation)) void requestDesktopAttention();
            }
            queryClient.setQueryData<Conversation[] | undefined>(['conversations'], (current) => applyCreatedMessageToConversations(current, message, currentVisibleConversationId, !shouldIncrementUnread));
            queryClient.setQueryData<MessagesInfiniteData | undefined>(['messages', conversationId], (current) => upsertMessageIntoFirstPage(current, message));
          }
          if (event.type === 'message.recalled' && conversationId !== null) {
            const message = event.data as Message;
            const messageId = pickNumber(event.data, 'message_id') ?? pickNumber(event.data, 'id');
            if (messageId === null) {
              return;
            }
            queryClient.setQueryData<Conversation[] | undefined>(['conversations'], (current) => patchConversation(current, conversationId, (conversation) => {
              if (conversation.last_message?.id !== messageId) return conversation;
              return { ...conversation, last_message: { ...conversation.last_message, ...message } };
            }));
            queryClient.setQueryData<MessagesInfiniteData | undefined>(['messages', conversationId], (current) => patchMessageInPages(current, messageId, (item) => ({ ...item, ...message })));
          }
          if (event.type === 'message.reaction.updated' && conversationId !== null) {
            const messageId = pickNumber(event.data, 'message_id');
            const reactions = (event.data as { reactions?: Message['reactions'] }).reactions;
            if (messageId !== null && Array.isArray(reactions)) {
              const currentUserId = currentUser?.id ?? null;
              const personalizedReactions = currentUserId === null ? reactions : reactions.map((reaction) => ({
                ...reaction,
                reacted_by_me: Boolean(reaction.users?.some((user) => user.id === currentUserId))
              }));
              queryClient.setQueryData<MessagesInfiniteData | undefined>(['messages', conversationId], (current) => patchMessageInPages(current, messageId, (item) => ({ ...item, reactions: personalizedReactions })));
            }
          }
          if (event.type === 'message.featured.updated' && conversationId !== null) {
            const messageId = pickNumber(event.data, 'message_id');
            const featured = (event.data as { featured?: unknown }).featured;
            if (messageId !== null && typeof featured === 'boolean') {
              queryClient.setQueryData<MessagesInfiniteData | undefined>(['messages', conversationId], (current) => patchMessageInPages(current, messageId, (item) => item.featured === featured ? item : { ...item, featured }));
            }
          }
          if (event.type === 'message.component.updated' && conversationId !== null) {
            const messageId = pickNumber(event.data, 'message_id');
            const data = event.data as { component_id?: unknown; state?: unknown };
            if (messageId !== null && typeof data.component_id === 'string' && data.state && typeof data.state === 'object' && !Array.isArray(data.state)) {
              queryClient.setQueryData<MessagesInfiniteData | undefined>(['messages', conversationId], (current) => patchMessageInPages(current, messageId, (item) => patchMessageComponentState(item, data.component_id as string, data.state as MessageComponentState)));
              queryClient.setQueryData<Conversation[] | undefined>(['conversations'], (current) => patchConversation(current, conversationId, (conversation) => {
                if (conversation.last_message?.id !== messageId) return conversation;
                return { ...conversation, last_message: patchMessageComponentState(conversation.last_message, data.component_id as string, data.state as MessageComponentState) };
              }));
            }
          }
          if (conversationId !== null) {
            if (event.type === 'message.featured.updated') {
              void queryClient.invalidateQueries({ queryKey: ['featured-messages', conversationId] });
            }
          }
        }

        if (
          event.type === 'friend.request.created' ||
          event.type === 'friend.request.accepted' ||
          event.type === 'friend.request.rejected' ||
          event.type === 'friendship.deleted'
        ) {
          void queryClient.invalidateQueries({ queryKey: ['friends'] });
          void queryClient.invalidateQueries({ queryKey: ['friend-requests'] });
          void queryClient.invalidateQueries({ queryKey: ['notifications'] });
        }

        if (
          event.type === 'conversation.read' ||
          event.type === 'conversation.updated' ||
          event.type === 'conversation.deleted' ||
          event.type === 'conversation.temporary.closed' ||
          event.type === 'conversation.temporary.blocked' ||
          event.type === 'group.announcement.created' ||
          event.type === 'group.announcement.updated' ||
          event.type === 'group.announcement.deleted' ||
          event.type === 'group.join_request.created' ||
          event.type === 'group.join_request.accepted' ||
          event.type === 'group.join_request.rejected' ||
          event.type === 'group.member.joined' ||
          event.type === 'group.member.invited' ||
          event.type === 'group.member.role_updated' ||
          event.type === 'group.member.mute_updated' ||
          event.type === 'group.member.title_updated' ||
          event.type === 'group.checkin.created' ||
          event.type === 'group.member.level_updated' ||
          event.type === 'group.member.left' ||
          event.type === 'group.member.removed'
        ) {
          const conversationId = pickNumber(event.data, 'conversation_id');
          const currentActiveConversationId = activeConversationIdRef.current;
          if ((event.type === 'conversation.deleted' || event.type === 'conversation.temporary.closed' || event.type === 'conversation.temporary.blocked') && conversationId !== null) {
            // Membership/temporary-chat revocation must not leave readable private cache data.
            if (conversationId === currentActiveConversationId) setActiveConversationId(null);
            queryClient.setQueryData<Conversation[] | undefined>(['conversations'], (current) => current?.filter((item) => item.id !== conversationId));
            queryClient.removeQueries({ queryKey: ['messages', conversationId], exact: true });
            queryClient.removeQueries({ queryKey: ['conversation-members', conversationId] });
            queryClient.removeQueries({ queryKey: ['conversation-members-page', conversationId] });
            scheduleConversationRefresh();
          }
          if (event.type === 'conversation.updated' && conversationId !== null) {
            const patch = event.data as Partial<Conversation>;
            const previous = queryClient.getQueryData<Conversation[]>(['conversations']);
            if (!previous?.some((conversation) => conversation.id === conversationId)) scheduleConversationRefresh();
            queryClient.setQueryData<Conversation[] | undefined>(['conversations'], (current) => patchConversation(current, conversationId, (conversation) => ({ ...conversation, ...patch, id: conversation.id })));
          }
          if (event.type === 'conversation.read' && conversationId !== null && pickNumber(event.data, 'user_id') === currentUser?.id) {
            // A delayed receipt may precede a newer WS message; do not roll unread back.
            const readId = pickNumber(event.data, 'last_read_message_id');
            const previousReadId = lastReadMessageIds.get(conversationId) ?? 0;
            if (readId !== null && readId >= previousReadId) {
              lastReadMessageIds.set(conversationId, readId);
              queryClient.setQueryData<Conversation[] | undefined>(['conversations'], (current) => patchConversation(current, conversationId, (conversation) => {
                if (!conversation.unread_count || (conversation.last_message?.id ?? 0) > readId) return conversation;
                return { ...conversation, unread_count: 0 };
              }));
            }
          }
          if (event.type === 'group.join_request.created' || event.type === 'group.join_request.accepted' || event.type === 'group.join_request.rejected') {
            void queryClient.invalidateQueries({ queryKey: ['group-join-requests'] });
            scheduleConversationRefresh();
            void queryClient.invalidateQueries({ queryKey: ['notifications'] });
          }
          if (conversationId !== null) {
            const conversations = queryClient.getQueryData<Conversation[]>(['conversations']);
            const currentConversation = conversations?.find((conversation) => conversation.id === conversationId);
            if (event.type === 'group.member.joined' || event.type === 'group.member.invited') {
              notifyMemberJoined(currentConversation);
            }
            if (event.type === 'group.member.left' || event.type === 'group.member.removed') {
              notifyMemberLeft(currentConversation);
            }
            if (event.type === 'group.announcement.created' || event.type === 'group.announcement.updated' || event.type === 'group.announcement.deleted') {
              void queryClient.invalidateQueries({ queryKey: ['group-announcements', conversationId] });
            }
            if (
              event.type === 'group.member.joined' ||
              event.type === 'group.member.invited' ||
              event.type === 'group.member.role_updated' ||
              event.type === 'group.member.mute_updated' ||
              event.type === 'group.member.title_updated' ||
              event.type === 'group.member.level_updated' ||
              event.type === 'group.member.left' ||
              event.type === 'group.member.removed'
            ) {
              scheduleMemberRefresh(conversationId);
              if (event.type === 'group.member.joined' || event.type === 'group.member.invited' || event.type === 'group.member.left' || event.type === 'group.member.removed') {
                scheduleConversationRefresh();
              }
            }
            if (event.type === 'group.checkin.created') {
              void queryClient.invalidateQueries({ queryKey: ['group-checkin-status', conversationId] });
              void queryClient.invalidateQueries({ queryKey: ['group-leaderboard', conversationId] });
            }
          }
        }

        if (event.type === 'conversation.member.poked') {
          const data = event.data as Record<string, unknown>;
          const conversationId = pickNumber(data, 'conversation_id');
          const actorId = pickNumber(data, 'actor_id');
          const userId = pickNumber(data, 'user_id');
          if (conversationId !== null && actorId !== null && userId !== null) {
            emitPoke({
              conversationId,
              actorId,
              userId,
              actorName: typeof data.actor_name === 'string' ? data.actor_name : `用户 ${actorId}`,
              userName: typeof data.user_name === 'string' ? data.user_name : `用户 ${userId}`
            });
          }
        }

        if (event.type === 'presence.updated') {
          const onlineCount = pickNumber(event.data, 'online_count');
          const userId = pickNumber(event.data, 'user_id');
          const online = Boolean((event.data as { online?: unknown }).online);
          if (onlineCount !== null) {
            setOnlineCount(onlineCount);
          }
          if (userId !== null) {
            const presenceData = event.data as Record<string, unknown>;
            queryClient.setQueriesData<ConversationMember[] | undefined>({ queryKey: ['conversation-members'] }, (current) => current && patchMembers(current, (member) => patchMemberPresence(member, userId, online, presenceData)));
            queryClient.setQueriesData<ConversationMembersPageData | undefined>({ queryKey: ['conversation-members-page'] }, (current) => patchMemberPages(current, (member) => patchMemberPresence(member, userId, online, presenceData)));
            queryClient.setQueryData<OnlineUsersRead | undefined>(['online-users'], (current) => {
              if (!current) {
                return current;
              }
              const users = online
                ? patchMembers(current.users, (user) => patchUserPresence(user, userId, online, presenceData))
                : current.users.some((user) => user.id === userId) ? current.users.filter((user) => user.id !== userId) : current.users;
              const count = onlineCount ?? current.online_count;
              return users === current.users && count === current.online_count ? current : { ...current, online_count: count, users };
            });
            queryClient.setQueriesData<{ online?: boolean; presence_status?: string; presence_text?: string | null; presence_updated_at?: string | null } | undefined>({ queryKey: ['user-online', userId] }, (current) => current ? {
              ...current,
              online,
              presence_status: online ? (typeof presenceData.presence_status === 'string' ? presenceData.presence_status : current.presence_status) : 'offline',
              presence_text: online ? (typeof presenceData.presence_text === 'string' ? presenceData.presence_text : null) : null,
              presence_updated_at: typeof presenceData.presence_updated_at === 'string' ? presenceData.presence_updated_at : current.presence_updated_at
            } : current);
          }
        }

        if (
          event.type === 'post.created' ||
          event.type === 'post.updated' ||
          event.type === 'post.deleted' ||
          event.type === 'post.like.updated' ||
          event.type === 'post.comment.created' ||
          event.type === 'post.comment.like.updated' ||
          event.type === 'post.comment.deleted' ||
          event.type === 'post.notification.created' ||
          event.type === 'post.notification.updated'
        ) {
          const postId = pickNumber(event.data, 'post_id');
          void queryClient.invalidateQueries({ queryKey: ['posts'] });
          void queryClient.invalidateQueries({ queryKey: ['post-topics'] });
          if (event.type === 'post.notification.created' || event.type === 'post.notification.updated') {
            void queryClient.invalidateQueries({ queryKey: ['post-notifications'] });
            void queryClient.invalidateQueries({ queryKey: ['notifications'] });
          }
          if (postId !== null) {
            void queryClient.invalidateQueries({ queryKey: ['posts', 'detail', postId] });
            void queryClient.invalidateQueries({ queryKey: ['posts', 'comments', postId] });
            void queryClient.invalidateQueries({ queryKey: ['posts', 'likes', postId] });
          }
        }

        emitRealtimeEvent(event);
      });

      socket.addEventListener('error', () => {
        socket?.close();
      });

      socket.addEventListener('close', (event) => {
        clearHeartbeat();
        socket = null;
        scheduleReconnect(event);
      });
    }

    const handleOnline = (): void => {
      if (reconnectTimerId !== null) {
        window.clearTimeout(reconnectTimerId);
        reconnectTimerId = null;
      }
      connect();
    };

    const handleVisibilityChange = (): void => {
      if (document.visibilityState === 'visible' && socket?.readyState !== WebSocket.OPEN && socket?.readyState !== WebSocket.CONNECTING) {
        handleOnline();
      }
    };

    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    connect();

    return () => {
      closedByEffect = true;
      clearPendingRefreshes();
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (reconnectTimerId !== null) {
        window.clearTimeout(reconnectTimerId);
      }
      clearHeartbeat();
      socket?.close();
      socket = null;
    };
  }, [currentUser?.id, enabled, queryClient, setActiveConversationId, setOnlineCount, token]);
}
