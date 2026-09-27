import type { Conversation, Message } from '@/types/api';

/** One pass over the list per committed query update; message patches may replace the list often. */
export interface ConversationDashboardProjection {
  ids: number[];
  byId: Map<number, Conversation>;
  unread: number;
  unreadById: Map<number, number>;
  changedIds: number[];
}

export function projectDashboardConversations(conversations: Conversation[], previous?: ConversationDashboardProjection): ConversationDashboardProjection {
  // Most WebSocket updates patch a single immutable conversation. Reuse the
  // membership/index and unread contributions instead of rebuilding every map.
  const sameSize = previous?.ids.length === conversations.length;
  let ids = previous?.ids ?? [];
  let byId = previous?.byId ?? new Map<number, Conversation>();
  let unreadById = previous?.unreadById ?? new Map<number, number>();
  let unread = previous?.unread ?? 0;
  let idsChanged = !previous;
  const changedIds: number[] = [];
  for (let index = 0; index < conversations.length; index += 1) {
    const conversation = conversations[index];
    const old = previous?.byId.get(conversation.id);
    if (!sameSize || previous.ids[index] !== conversation.id) idsChanged = true;
    if (old === conversation) continue;
    changedIds.push(conversation.id);
    byId.set(conversation.id, conversation);
    const contribution = conversation.my_do_not_disturb || conversation.my_message_setting === 'silent' || conversation.my_message_setting === 'ignore'
      ? 0 : Math.max(0, conversation.unread_count ?? 0);
    unread += contribution - (unreadById.get(conversation.id) ?? 0);
    unreadById.set(conversation.id, contribution);
  }
  if (idsChanged) {
    ids = conversations.map((conversation) => conversation.id);
    if (previous) {
      const nextIds = new Set(ids);
      for (const id of previous.ids) {
        if (!nextIds.has(id)) {
          byId.delete(id);
          unread -= unreadById.get(id) ?? 0;
          unreadById.delete(id);
        }
      }
    }
  }
  return { ids, byId, unread, unreadById, changedIds };
}

/** Activity sorting does not alter membership, while a same-size replacement does. */
export function sameConversationMembership(previous: readonly number[], next: readonly number[]): boolean {
  if (previous === next) return true;
  if (previous.length !== next.length) return false;
  let index = 0;
  while (index < previous.length && previous[index] === next[index]) index += 1;
  if (index === previous.length) return true;
  const known = new Set(previous);
  return known.size === next.length && next.every((id) => known.has(id));
}

export type NativeConversationChange = 'none' | 'metadata' | 'urgent';

/** Only fields actually sent by native/backgroundRealtime.ts matter to background notifications. */
export function nativeConversationChange(previous: Map<number, Conversation> | null, next: Map<number, Conversation>, changedIds?: readonly number[]): NativeConversationChange {
  if (!previous || previous.size !== next.size) return 'urgent';
  let metadataChanged = false;
  for (const id of changedIds ?? next.keys()) {
    const current = next.get(id);
    const old = previous.get(id);
    if (!old || !current || old.type !== current.type || (old.my_message_setting ?? 'notify') !== (current.my_message_setting ?? 'notify') || Boolean(old.my_do_not_disturb) !== Boolean(current.my_do_not_disturb)) {
      return 'urgent';
    }
    if (old.title !== current.title || old.display_title !== current.display_title || old.avatar_url !== current.avatar_url) {
      metadataChanged = true;
    }
  }
  return metadataChanged ? 'metadata' : 'none';
}


export function isConversationPinnedForMe(conversation: Conversation): boolean {
  return Boolean(conversation.my_pinned);
}

export function conversationActivityTime(conversation: Conversation): number {
  const value = conversation.last_message?.created_at ?? conversation.updated_at ?? conversation.created_at ?? '';
  const time = Date.parse(value);
  return Number.isNaN(time) ? 0 : time;
}

export function sortConversationsByActivity(conversations: Conversation[]): Conversation[] {
  return [...conversations].sort((left, right) => {
    const pinnedDiff = Number(isConversationPinnedForMe(right)) - Number(isConversationPinnedForMe(left));
    if (pinnedDiff !== 0) return pinnedDiff;
    const timeDiff = conversationActivityTime(right) - conversationActivityTime(left);
    if (timeDiff !== 0) return timeDiff;
    return right.id - left.id;
  });
}

export function applyLatestMessageToConversations(
  conversations: Conversation[] | undefined,
  message: Message,
  options: { visibleConversationId?: number | null; incrementUnread?: boolean } = {}
): Conversation[] | undefined {
  if (!conversations) return conversations;
  let found = false;
  const updated = conversations.map((conversation) => {
    if (conversation.id !== message.conversation_id) {
      return conversation;
    }
    found = true;
    const visible = options.visibleConversationId === conversation.id;
    return {
      ...conversation,
      last_message: message,
      unread_count: visible ? 0 : options.incrementUnread ? (conversation.unread_count ?? 0) + 1 : conversation.unread_count,
      updated_at: message.created_at || conversation.updated_at
    };
  });
  return found ? sortConversationsByActivity(updated) : conversations;
}
