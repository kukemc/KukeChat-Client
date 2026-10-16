import { createContext, useCallback, useContext, useRef } from 'react';
import type { ConversationMember, LevelTitleTier, MemberRole, Message, MessageQuoteMetadata, User } from '@/types/api';
import type { BotInteraction } from '../message/types';

/** 身份恒定、永远调用最新闭包的回调。传给 memo 过的消息行不会引发重渲染。 */
export function useEvent<Args extends unknown[], Result>(handler: (...args: Args) => Result): (...args: Args) => Result {
  const ref = useRef(handler);
  ref.current = handler;
  return useCallback((...args: Args) => ref.current(...args), []);
}

/** 消息行能触发的全部动作。对象身份在面板生命周期内不变。 */
export interface ChatRowActions {
  openMessageMenu: (event: React.MouseEvent<HTMLElement>, message: Message, clickedImageUrl?: string) => void;
  openMessageMenuAt: (element: HTMLElement, message: Message) => void;
  openMemberMenu: (event: React.MouseEvent<HTMLElement>, message: Message) => void;
  avatarTap: (element: HTMLElement, message: Message) => void;
  /** 在某个元素旁边打开一个人的名片；name 是查不到资料时显示的名字 */
  openUser: (element: HTMLElement, userId: number, name: string) => void;
  quote: (message: Message) => void;
  forward: (message: Message) => void;
  toggleSelected: (message: Message) => void;
  /** 多选模式下把锚点（最近点选的那条）到这条之间能选的都选上：Shift + 点选和「选到这里」 */
  selectRange: (message: Message) => void;
  toggleReaction: (message: Message, emoji: string) => void;
  openReactionPicker: (event: React.MouseEvent<HTMLElement>, message: Message) => void;
  openImages: (images: string[], index: number) => void;
  openForwardBundle: (message: Message) => void;
  jumpToQuote: (quote: MessageQuoteMetadata) => void;
  botInteract: (message: Message, interaction: BotInteraction) => void;
  repeat: (content: string) => void;
  openPost?: (postId: number) => void;
  setError: (message: string) => void;
}

/** 消息行共享的低频数据。变化时可见行会整体重渲染，所以只放很少变的东西。 */
export interface ChatRowContextValue {
  currentUser: User;
  currentRole: MemberRole;
  isGroup: boolean;
  memberByUserId: ReadonlyMap<number, ConversationMember>;
  /** 本群的等级头衔分档；没开启时为 null */
  levelTitles: readonly LevelTitleTier[] | null;
  actions: ChatRowActions;
}

export const ChatRowContext = createContext<ChatRowContextValue | null>(null);

export function useChatRow(): ChatRowContextValue {
  const value = useContext(ChatRowContext);
  if (!value) {
    throw new Error('ChatRowContext is missing');
  }
  return value;
}

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/** 读写一个数字型的本地偏好（面板宽高之类），存储不可用时退回默认值。 */
export function readNumberPreference(key: string, fallback: number): number {
  try {
    const raw = window.localStorage.getItem(key);
    const value = raw === null ? NaN : Number(raw);
    return Number.isFinite(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

export function writePreference(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // 隐私模式或宿主页面禁用了存储，偏好只在本次会话内生效。
  }
}

export function readPreference(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
