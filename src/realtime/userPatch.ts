import type { QueryClient } from '@tanstack/react-query';
import { useKukeStore } from '@/store/kukeStore';
import type { Conversation, ConversationMember, Friendship, Message, OnlineUsersRead, User } from '@/types/api';
import { patchMemberPages, patchMembers, type ConversationMembersPageData, type MessagesInfiniteData } from './cache';

/**
 * 「某个用户的公开资料变了一两个字段」时，把本地缓存里这个人的所有副本一起改掉，不重新请求。
 * 用在装扮变化（user.cosmetics.updated，docs/shop.md 2.3）、本人升级（account.level.up，docs/account-level.md）
 * 和资料赞数变化（点赞成功、user.profile.liked，docs/chat-features.md 第 6 节）上。
 *
 * 用户对象在缓存里是散着的：每条消息带一份发送者，成员列表、会话列表、好友、在线名单各有各的。这里逐个缓存去改，
 * 而且只给真正变了的那几项换新对象 —— 消息行是按对象身份记忆的，没变的行不会跟着重渲染。
 * 收到的字段和手头的一样时什么都不动（事件是广播给所有在线用户的，大多数时候和我正在看的东西无关）。
 */

type UserFields = Partial<Pick<User, 'cosmetics' | 'account_level' | 'profile_like_count'>>;

function sameValue(left: unknown, right: unknown): boolean {
  if (left === right) {
    return true;
  }
  if (typeof left !== 'object' || typeof right !== 'object' || left === null || right === null) {
    return false;
  }
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 体量小、形状不固定的缓存（群精华、收藏、找人的结果）：往下找几层，把里面这个人的对象换掉。 */
function patchLoose(value: unknown, patchUser: <T extends User | null | undefined>(user: T) => T, userId: number, depth: number): unknown {
  if (depth < 0 || typeof value !== 'object' || value === null) {
    return value;
  }
  if (Array.isArray(value)) {
    return patchMembers(value as unknown[], (item) => patchLoose(item, patchUser, userId, depth - 1));
  }
  const record = value as Record<string, unknown>;
  if (record.id === userId && typeof record.username === 'string') {
    return patchUser(record as unknown as User);
  }
  let next: Record<string, unknown> | null = null;
  for (const key of ['sender', 'user', 'message', 'items', 'users', 'friend']) {
    const child = record[key];
    if (typeof child !== 'object' || child === null) {
      continue;
    }
    const patched = patchLoose(child, patchUser, userId, depth - 1);
    if (patched !== child) {
      next = next ?? { ...record };
      next[key] = patched;
    }
  }
  return next ?? value;
}

export function patchUserInCaches(queryClient: QueryClient, userId: number, fields: UserFields): void {
  const keys = Object.keys(fields) as Array<keyof UserFields>;
  if (keys.length === 0) {
    return;
  }
  const patchUser = <T extends User | null | undefined>(user: T): T => {
    if (!user || user.id !== userId || keys.every((key) => sameValue(user[key], fields[key]))) {
      return user;
    }
    return { ...user, ...fields };
  };
  const patchMessage = (message: Message): Message => {
    const sender = patchUser(message.sender);
    return sender === message.sender ? message : { ...message, sender };
  };
  const patchMember = (member: ConversationMember): ConversationMember => {
    const user = patchUser(member.user);
    return user === member.user ? member : { ...member, user };
  };

  // 当前用户：聊天里自己的消息、自己的头像读的都是它
  const store = useKukeStore.getState();
  const me = patchUser(store.currentUser);
  if (me && me !== store.currentUser) {
    store.setCurrentUser(me);
  }
  queryClient.setQueriesData<User | undefined>({ queryKey: ['me'] }, (current) => (isObject(current) ? patchUser(current) : current));
  queryClient.setQueriesData<User | undefined>({ queryKey: ['user-profile', userId] }, (current) => (isObject(current) ? patchUser(current) : current));
  // 个人空间（桌面和移动两套界面）取资料用的那一份
  queryClient.setQueriesData<User | undefined>({ queryKey: ['users', userId] }, (current) => (isObject(current) ? patchUser(current) : current));

  // 消息：每一页里只换这个人发的那几条
  queryClient.setQueriesData<MessagesInfiniteData | undefined>({ queryKey: ['messages'] }, (current) => {
    if (!current || !Array.isArray(current.pages)) {
      return current;
    }
    const pages = patchMembers(current.pages, (page) => (Array.isArray(page) ? patchMembers(page, patchMessage) : page));
    return pages === current.pages ? current : { ...current, pages };
  });

  // 会话列表：最后一条消息的发送者、私聊的对方、会话自带的成员
  queryClient.setQueryData<Conversation[] | undefined>(['conversations'], (current) => {
    if (!Array.isArray(current)) {
      return current;
    }
    return patchMembers(current, (conversation) => {
      const lastMessage = conversation.last_message ? patchMessage(conversation.last_message) : conversation.last_message;
      const directUser = patchUser(conversation.direct_user);
      const members = Array.isArray(conversation.members) ? patchMembers(conversation.members, patchMember) : conversation.members;
      if (lastMessage === conversation.last_message && directUser === conversation.direct_user && members === conversation.members) {
        return conversation;
      }
      return { ...conversation, last_message: lastMessage, direct_user: directUser, members };
    });
  });

  // 成员列表（整份的和分页的）
  queryClient.setQueriesData<ConversationMember[] | undefined>({ queryKey: ['conversation-members'] }, (current) => (Array.isArray(current) ? patchMembers(current, patchMember) : current));
  queryClient.setQueriesData<ConversationMembersPageData | undefined>({ queryKey: ['conversation-members-page'] }, (current) => (current && Array.isArray(current.pages) ? patchMemberPages(current, patchMember) : current));

  queryClient.setQueryData<OnlineUsersRead | undefined>(['online-users'], (current) => {
    if (!current || !Array.isArray(current.users)) {
      return current;
    }
    const users = patchMembers(current.users, patchUser);
    return users === current.users ? current : { ...current, users };
  });

  queryClient.setQueryData<Friendship[] | undefined>(['friends'], (current) => {
    if (!Array.isArray(current)) {
      return current;
    }
    return patchMembers(current, (friendship) => {
      const user = patchUser(friendship.user);
      const friend = patchUser(friendship.friend);
      return user === friendship.user && friend === friendship.friend ? friendship : { ...friendship, user, friend };
    });
  });

  for (const key of ['featured-messages', 'bookmarks-all', 'users-search']) {
    queryClient.setQueriesData<unknown>({ queryKey: [key] }, (current: unknown) => patchLoose(current, patchUser, userId, 4));
  }
}

/** 实时事件 user.cosmetics.updated：{ user_id, cosmetics }。cosmetics 里的 style 仍然是不可信的，用之前照旧要过 parseBubbleSkin。 */
export function handleCosmeticsEvent(queryClient: QueryClient, data: unknown): void {
  if (!isObject(data) || typeof data.user_id !== 'number' || !Number.isFinite(data.user_id)) {
    return;
  }
  // 没装备是 {}；形状不对（不是对象）就当成没装备，免得把一份坏数据写进每条消息里
  const cosmetics = isObject(data.cosmetics) ? data.cosmetics as User['cosmetics'] : {};
  patchUserInCaches(queryClient, data.user_id, { cosmetics });
}
