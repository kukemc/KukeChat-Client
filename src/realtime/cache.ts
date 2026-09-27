import type { InfiniteData } from '@tanstack/react-query';
import type { Conversation, ConversationMember, Message, PresenceStatus, User } from '@/types/api';
import { conversationActivityTime, isConversationPinnedForMe } from '@/utils/conversations';

export type MessagesInfiniteData = InfiniteData<Message[], number | undefined>;
export type ConversationMembersPageData = InfiniteData<{ items: ConversationMember[] }, number | undefined>;

/** Only actual WS deliveries participate in notification/unread deduplication.
 * HTTP-loaded message pages are independent of the conversation's unread snapshot. */
export function recordReceivedMessage(received: Set<string>, conversationId: number, messageId: number, limit = 1024): boolean {
  const key = `${conversationId}:${messageId}`;
  if (received.has(key)) return false;
  received.add(key);
  if (received.size > limit) {
    const oldest = received.values().next().value;
    if (oldest !== undefined) received.delete(oldest);
  }
  return true;
}

/** Cache presence does not establish delivery; the read watermark gates alerts. */
export function shouldAlertIncomingMessage(firstDelivery: boolean, message: Message, currentUserId: number | null, lastReadMessageId: number): boolean {
  return firstDelivery && message.sender_id !== currentUserId && message.id > lastReadMessageId;
}

function replacePageItem<T>(pages: T[][], pageIndex: number, itemIndex: number, item: T): T[][] {
  const page = pages[pageIndex].slice();
  page[itemIndex] = item;
  const result = pages.slice();
  result[pageIndex] = page;
  return result;
}

function messageIndex(page: Message[], id: number): number {
  let low = 0;
  let high = page.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (page[mid].id < id) low = mid + 1;
    else high = mid;
  }
  return low < page.length && page[low].id === id ? low : -1;
}

export function hasMessageInPages(data: MessagesInfiniteData | undefined, messageId: number): boolean {
  if (!data) return false;
  return data.pages.some((page) => page.length > 0 && messageId >= page[0].id && messageId <= page[page.length - 1].id && messageIndex(page, messageId) >= 0);
}

export function patchMessageInPages(data: MessagesInfiniteData | undefined, messageId: number, updater: (message: Message) => Message): MessagesInfiniteData | undefined {
  if (!data) return data;
  for (let pageIndex = 0; pageIndex < data.pages.length; pageIndex += 1) {
    const page = data.pages[pageIndex];
    if (page.length && (messageId < page[0].id || messageId > page[page.length - 1].id)) continue;
    const itemIndex = messageIndex(page, messageId);
    if (itemIndex < 0) continue;
    const next = updater(page[itemIndex]);
    return next === page[itemIndex] ? data : { ...data, pages: replacePageItem(data.pages, pageIndex, itemIndex, next) };
  }
  return data;
}

export function upsertMessageIntoFirstPage(data: MessagesInfiniteData | undefined, message: Message): MessagesInfiniteData | undefined {
  if (!data?.pages.length) return data;
  const first = data.pages[0];
  // Late events inside the loaded window belong to the matching historical page,
  // not the newest page. Gaps between pages attach to the older page.
  if (first.length && message.id < first[0].id) {
    for (let index = 1; index < data.pages.length; index += 1) {
      const page = data.pages[index];
      if (!page.length || message.id < page[0].id) continue;
      const found = messageIndex(page, message.id);
      if (found >= 0) return { ...data, pages: replacePageItem(data.pages, index, found, { ...page[found], ...message }) };
      const next = page.slice();
      let low = 0;
      let high = next.length;
      while (low < high) {
        const mid = (low + high) >>> 1;
        if (next[mid].id < message.id) low = mid + 1;
        else high = mid;
      }
      next.splice(low, 0, message);
      const pages = data.pages.slice();
      pages[index] = next;
      return { ...data, pages };
    }
    // Older than all cached history: do not put a stale message in the newest page.
    return data;
  }
  const existing = messageIndex(first, message.id);
  if (existing >= 0) return { ...data, pages: replacePageItem(data.pages, 0, existing, { ...first[existing], ...message }) };
  let low = 0;
  let high = first.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (first[mid].id < message.id) low = mid + 1;
    else high = mid;
  }
  const nextFirst = first.slice();
  nextFirst.splice(low, 0, message);
  return { ...data, pages: [nextFirst, ...data.pages.slice(1)] };
}

function compareConversation(left: Conversation, right: Conversation): number {
  const pinned = Number(isConversationPinnedForMe(right)) - Number(isConversationPinnedForMe(left));
  return pinned || conversationActivityTime(right) - conversationActivityTime(left) || right.id - left.id;
}

export function applyCreatedMessageToConversations(current: Conversation[] | undefined, message: Message, visibleConversationId: number | null, isDuplicate = false): Conversation[] | undefined {
  if (!current) return current;
  const index = current.findIndex((item) => item.id === message.conversation_id);
  if (index < 0) return current;
  const previous = current[index];
  const currentMessage = previous.last_message;
  const isLatest = !currentMessage || message.id >= currentMessage.id;
  const unreadCount = visibleConversationId === previous.id ? 0 : isDuplicate ? previous.unread_count : (previous.unread_count ?? 0) + 1;
  if (!isLatest && previous.unread_count === unreadCount) return current;
  const next: Conversation = {
    ...previous,
    last_message: isLatest ? (currentMessage?.id === message.id ? { ...currentMessage, ...message } : message) : currentMessage,
    unread_count: unreadCount,
    updated_at: isLatest ? message.created_at || previous.updated_at : previous.updated_at
  };
  const result = current.slice();
  result[index] = next;
  // A sorted list needs only one insertion; do not sort/copy every conversation on every message.
  if (isLatest && index > 0 && compareConversation(next, result[index - 1]) < 0) {
    let target = index;
    while (target > 0 && compareConversation(next, result[target - 1]) < 0) target -= 1;
    result.splice(index, 1);
    result.splice(target, 0, next);
  }
  return result;
}

export function patchConversation(current: Conversation[] | undefined, conversationId: number, updater: (item: Conversation) => Conversation): Conversation[] | undefined {
  if (!current) return current;
  const index = current.findIndex((item) => item.id === conversationId);
  if (index < 0) return current;
  const next = updater(current[index]);
  if (next === current[index]) return current;
  const result = current.slice();
  result[index] = next;
  return result;
}

function presenceFields(user: User, online: boolean, data: Record<string, unknown>): User {
  const presence_status = online ? (typeof data.presence_status === 'string' ? data.presence_status as PresenceStatus : user.presence_status) : null;
  const presence_text = online ? (typeof data.presence_text === 'string' ? data.presence_text : null) : null;
  const presence_updated_at = typeof data.presence_updated_at === 'string' ? data.presence_updated_at : user.presence_updated_at;
  if (user.presence_status === presence_status && user.presence_text === presence_text && user.presence_updated_at === presence_updated_at) return user;
  return { ...user, presence_status, presence_text, presence_updated_at };
}

export function patchUserPresence(user: User, userId: number, online: boolean, data: Record<string, unknown>): User {
  return user.id === userId ? presenceFields(user, online, data) : user;
}

export function patchMemberPresence(member: ConversationMember, userId: number, online: boolean, data: Record<string, unknown>): ConversationMember {
  if ((member.user_id !== userId && member.user?.id !== userId) || !member.user) return member;
  const user = presenceFields(member.user, online, data);
  return user === member.user ? member : { ...member, user };
}

export function patchMembers<T>(items: T[], updater: (item: T) => T): T[] {
  let result: T[] | null = null;
  for (let index = 0; index < items.length; index += 1) {
    const next = updater(items[index]);
    if (next !== items[index]) {
      if (!result) result = items.slice();
      result[index] = next;
    }
  }
  return result ?? items;
}

export function patchMemberPages(data: ConversationMembersPageData | undefined, updater: (member: ConversationMember) => ConversationMember): ConversationMembersPageData | undefined {
  if (!data) return data;
  let pages: typeof data.pages | null = null;
  for (let index = 0; index < data.pages.length; index += 1) {
    const page = data.pages[index];
    const items = patchMembers(page.items, updater);
    if (items !== page.items) {
      if (!pages) pages = data.pages.slice();
      pages[index] = { ...page, items };
    }
  }
  return pages ? { ...data, pages } : data;
}
