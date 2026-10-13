import { createContext, useContext } from 'react';
import type { Conversation, ConversationMember, Friendship, GroupLeaderboardType, MemberRole, User } from '@/types/api';
import type { MemberActions } from './useMemberActions';

export type InfoDialog =
  | { kind: 'profile' }
  | { kind: 'announcements' }
  | { kind: 'joinRequests' }
  | { kind: 'invite' }
  | { kind: 'remove' }
  | { kind: 'leaderboard'; type: GroupLeaderboardType }
  | { kind: 'share' }
  | { kind: 'levelTitles' }
  | { kind: 'groupEmojis' }
  | { kind: 'forward'; card: 'group' | 'user' };

export interface InfoNotice {
  text: string;
  tone: 'info' | 'error';
}

/** 侧栏各区块共享的会话数据与浮层入口。区块自己的请求和状态留在区块里。 */
export interface InfoContextValue {
  conversation: Conversation;
  currentUser: User;
  /** 已按「群主 → 管理员 → 成员」再按入群时间排好 */
  members: ConversationMember[];
  membersLoading: boolean;
  friends: Friendship[];
  conversations: Conversation[];
  currentRole: MemberRole;
  currentMember: ConversationMember | null;
  directUser: User | null;
  isGroup: boolean;
  canManage: boolean;
  isOwner: boolean;
  memberCount: number;
  memberActions: MemberActions;
  notice: InfoNotice | null;
  /** 传空串清掉当前提示 */
  notify: (text: string, tone?: InfoNotice['tone']) => void;
  openDialog: (dialog: InfoDialog) => void;
  closeDialog: () => void;
  showMembers: () => void;
  openUser: (element: HTMLElement, user: User | null | undefined, label: string) => void;
  openMemberMenu: (event: React.MouseEvent<HTMLElement>, member: ConversationMember) => void;
  reportConversation?: (conversation: Conversation) => void;
  close: () => void;
}

export const InfoContext = createContext<InfoContextValue | null>(null);

export function useInfo(): InfoContextValue {
  const value = useContext(InfoContext);
  if (!value) {
    throw new Error('InfoContext is missing');
  }
  return value;
}
