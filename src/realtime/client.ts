import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';
import { WS_URL } from '@/config';
import { useKukeStore } from '@/store/kukeStore';
import { emitRealtimeEvent, parseRealtimePayload } from './events';
import { pickNumber } from '@/api/normalizers';
import type { AccountSuspension, Conversation, ConversationMember, Message, MessageComponentState, OnlineUsersRead, PresenceStatus, User } from '@/types/api';
import { requestDesktopAttention } from '@/utils/desktopAttention';
import { applyLatestMessageToConversations, sortConversationsByActivity } from '@/utils/conversations';
import { canAlertConversation, isConversationBlocked, notifyConnectionReady, notifyIncomingMessage, notifyMemberJoined, notifyMemberLeft } from '@/utils/notifications';

const HEARTBEAT_INTERVAL_MS = 25_000;
const PONG_TIMEOUT_MS = 10_000;
const RECONNECT_BASE_DELAY_MS = 1_000;
const RECONNECT_MAX_DELAY_MS = 30_000;
const RECONNECT_JITTER_MS = 500;
const AUTH_CLOSE_CODES = new Set([1008]);

type MessagesInfiniteData = InfiniteData<Message[], number | undefined>;
type ConversationMembersPageData = InfiniteData<{ items: ConversationMember[] }, number | undefined>;

const RECONNECT_REFRESH_COOLDOWN_MS = 30_000;

function patchMessageInPages(data: MessagesInfiniteData | undefined, messageId: number, updater: (message: Message) => Message): MessagesInfiniteData | undefined {
  if (!data) {
    return data;
  }

  let changed = false;
  const pages = data.pages.map((page) => page.map((message) => {
    if (message.id !== messageId) {
      return message;
    }
    changed = true;
    return updater(message);
  }));
  return changed ? { ...data, pages } : data;
}

function upsertMessageIntoFirstPage(data: MessagesInfiniteData | undefined, message: Message): MessagesInfiniteData | undefined {
  if (!data || data.pages.length === 0) {
    return data;
  }

  let exists = false;
  const pages = data.pages.map((page) => page.map((item) => {
    if (item.id !== message.id) {
      return item;
    }
    exists = true;
    return { ...item, ...message };
  }));

  if (exists) {
    return { ...data, pages };
  }

  return {
    ...data,
    pages: [[...data.pages[0], message].sort((a, b) => a.id - b.id), ...data.pages.slice(1)]
  };
}

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

function patchMemberPresence(member: ConversationMember, userId: number, online: boolean, data: Record<string, unknown>): ConversationMember {
  if (member.user_id !== userId && member.user?.id !== userId) {
    return member;
  }
  return {
    ...member,
    user: member.user ? {
      ...member.user,
      presence_status: online ? (typeof data.presence_status === 'string' ? data.presence_status as PresenceStatus : member.user.presence_status) : null,
      presence_text: online ? (typeof data.presence_text === 'string' ? data.presence_text : null) : null,
      presence_updated_at: typeof data.presence_updated_at === 'string' ? data.presence_updated_at : member.user.presence_updated_at
    } : member.user
  };
}

function patchUserPresence(user: User, userId: number, online: boolean, data: Record<string, unknown>): User {
  if (user.id !== userId) {
    return user;
  }
  return {
    ...user,
    presence_status: online ? (typeof data.presence_status === 'string' ? data.presence_status as PresenceStatus : user.presence_status) : null,
    presence_text: online ? (typeof data.presence_text === 'string' ? data.presence_text : null) : null,
    presence_updated_at: typeof data.presence_updated_at === 'string' ? data.presence_updated_at : user.presence_updated_at
  };
}

function patchMemberPages(data: ConversationMembersPageData | undefined, updater: (member: ConversationMember) => ConversationMember): ConversationMembersPageData | undefined {
  if (!data) {
    return data;
  }
  return {
    ...data,
    pages: data.pages.map((page) => ({ ...page, items: page.items.map(updater) }))
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
    let lastReconnectRefreshAt = 0;
    let closedByEffect = false;

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
      const now = Date.now();
      if (now - lastReconnectRefreshAt < RECONNECT_REFRESH_COOLDOWN_MS) {
        return;
      }
      lastReconnectRefreshAt = now;
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
            notifyIncomingMessage(message, currentConversation);
            if (message.sender_id !== currentUser?.id && canAlertConversation(currentConversation)) {
              void requestDesktopAttention();
            }
            if (!currentConversation) {
              void queryClient.invalidateQueries({ queryKey: ['conversations'] });
            }
            queryClient.setQueryData<Conversation[] | undefined>(['conversations'], (current) => applyLatestMessageToConversations(current, message, { visibleConversationId: currentVisibleConversationId, incrementUnread: true }));
            queryClient.setQueryData<MessagesInfiniteData | undefined>(['messages', conversationId], (current) => upsertMessageIntoFirstPage(current, message));
          }
          if (event.type === 'message.recalled' && conversationId !== null) {
            const message = event.data as Message;
            const messageId = pickNumber(event.data, 'message_id') ?? pickNumber(event.data, 'id');
            if (messageId === null) {
              return;
            }
            queryClient.setQueryData<Conversation[] | undefined>(['conversations'], (current) => current ? sortConversationsByActivity(current.map((conversation) => {
              if (conversation.id !== conversationId || conversation.last_message?.id !== messageId) {
                return conversation;
              }
              return {
                ...conversation,
                last_message: { ...conversation.last_message, ...message },
                updated_at: typeof message.recalled_at === 'string' ? message.recalled_at : conversation.updated_at
              };
            })) : current);
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
              queryClient.setQueryData<MessagesInfiniteData | undefined>(['messages', conversationId], (current) => patchMessageInPages(current, messageId, (item) => ({ ...item, featured })));
            }
          }
          if (event.type === 'message.component.updated' && conversationId !== null) {
            const messageId = pickNumber(event.data, 'message_id');
            const data = event.data as { component_id?: unknown; state?: unknown };
            if (messageId !== null && typeof data.component_id === 'string' && data.state && typeof data.state === 'object' && !Array.isArray(data.state)) {
              queryClient.setQueryData<MessagesInfiniteData | undefined>(['messages', conversationId], (current) => patchMessageInPages(current, messageId, (item) => patchMessageComponentState(item, data.component_id as string, data.state as MessageComponentState)));
              queryClient.setQueryData<Conversation[] | undefined>(['conversations'], (current) => current?.map((conversation) => {
                if (conversation.id !== conversationId || conversation.last_message?.id !== messageId) {
                  return conversation;
                }
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
          if (
            (event.type === 'conversation.deleted' || event.type === 'conversation.temporary.closed' || event.type === 'conversation.temporary.blocked') &&
            conversationId !== null &&
            conversationId === currentActiveConversationId
          ) {
            setActiveConversationId(null);
          }
          if (event.type === 'conversation.updated' && conversationId !== null) {
            const patch = event.data as Partial<Conversation>;
            queryClient.setQueryData<Conversation[] | undefined>(['conversations'], (current) => current?.map((conversation) => {
              if (conversation.id !== conversationId) {
                return conversation;
              }
              return { ...conversation, ...patch, id: conversation.id };
            }));
          }
          if (event.type === 'group.join_request.created' || event.type === 'group.join_request.accepted' || event.type === 'group.join_request.rejected') {
            void queryClient.invalidateQueries({ queryKey: ['group-join-requests'] });
            void queryClient.invalidateQueries({ queryKey: ['conversations'] });
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
              void queryClient.invalidateQueries({ queryKey: ['conversation-members', conversationId] });
              void queryClient.invalidateQueries({ queryKey: ['conversation-members-page', conversationId] });
            }
            if (event.type === 'group.checkin.created') {
              void queryClient.invalidateQueries({ queryKey: ['group-checkin-status', conversationId] });
              void queryClient.invalidateQueries({ queryKey: ['group-leaderboard', conversationId] });
            }
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
            queryClient.setQueriesData<ConversationMember[] | undefined>({ queryKey: ['conversation-members'] }, (current) => current?.map((member) => patchMemberPresence(member, userId, online, presenceData)));
            queryClient.setQueriesData<ConversationMembersPageData | undefined>({ queryKey: ['conversation-members-page'] }, (current) => patchMemberPages(current, (member) => patchMemberPresence(member, userId, online, presenceData)));
            queryClient.setQueryData<OnlineUsersRead | undefined>(['online-users'], (current) => {
              if (!current) {
                return current;
              }
              const users = online
                ? current.users.map((user) => patchUserPresence(user, userId, online, presenceData))
                : current.users.filter((user) => user.id !== userId);
              return { ...current, online_count: onlineCount ?? current.online_count, users };
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
