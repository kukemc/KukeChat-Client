import { getDisplayName } from '@/components/ui/Avatar';
import type { Conversation, ConversationMember, GroupLeaderboardPeriod, GroupLeaderboardType, JoinMode, MemberRole, MessageMetadata, User } from '@/types/api';
import { parseApiDate } from '@/utils/dateTime';

/** 聊天资料页（移动端旧实现与桌面端侧栏）共用的常量和纯函数。 */

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
}

export const slowModeOptions: SelectOption[] = [
  { value: '0', label: '未开启' },
  { value: '10', label: '每分钟10条' },
  { value: '5', label: '每分钟5条' }
];

export const joinModeOptions: Array<SelectOption<JoinMode>> = [
  { value: 'approval', label: '需要审核' },
  { value: 'question', label: '回答问题' },
  { value: 'invite_only', label: '仅邀请' },
  { value: 'open', label: '自由加入' }
];

export const groupCategoryOptions: SelectOption[] = [
  { value: '', label: '未设置' },
  { value: '同学', label: '同学' },
  { value: '同事', label: '同事' },
  { value: '亲友', label: '亲友' },
  { value: '家校', label: '家校' },
  { value: '游戏', label: '游戏' },
  { value: '二次元', label: '二次元' },
  { value: '更多兴趣', label: '更多兴趣' }
];

export const leaderboardTypeOptions: Array<SelectOption<GroupLeaderboardType>> = [
  { value: 'activity', label: '活跃榜' },
  { value: 'level', label: '等级榜' },
  { value: 'checkin_streak', label: '连签榜' },
  { value: 'checkin_total', label: '累签榜' },
  { value: 'message', label: '发言榜' }
];

export const leaderboardPeriodOptions: Array<SelectOption<GroupLeaderboardPeriod>> = [
  { value: 'today', label: '今日' },
  { value: 'week', label: '近7天' },
  { value: 'month', label: '近30天' },
  { value: 'all', label: '全部' }
];

export function roleLabel(role: MemberRole): string {
  if (role === 'owner') {
    return '群主';
  }
  if (role === 'admin') {
    return '管理员';
  }
  return '成员';
}

export function memberRoleRank(role: MemberRole): number {
  if (role === 'owner') return 0;
  if (role === 'admin') return 1;
  return 2;
}

export function memberMuted(member: ConversationMember): boolean {
  if (!member.muted) {
    return false;
  }
  const until = parseApiDate(member.muted_until);
  return !member.muted_until || !until || until.getTime() > Date.now();
}

/** 不带成员数的会话标题。消息面板标题栏用的是 messageMeta 里带「(人数)」的那个。 */
export function conversationPlainTitle(conversation: Conversation, currentUser: User): string {
  const displayTitle = conversation.display_title?.trim();
  if (conversation.type === 'group') {
    return displayTitle || conversation.title || '未命名群聊';
  }
  if (displayTitle) {
    return displayTitle;
  }
  const directMember = conversation.members?.find((member) => member.user_id !== currentUser.id)?.user;
  return getDisplayName(conversation.direct_user ?? directMember, conversation.title || '私聊');
}

export function userShareMetadata(user: User): MessageMetadata {
  const name = getDisplayName(user, `用户 ${user.id}`);
  return {
    share_card: {
      type: 'user',
      user_id: user.id,
      name,
      username: user.username,
      avatar_url: user.avatar_url,
      bio: user.bio,
      profile_title: user.profile_title,
      profile_tagline: user.profile_tagline,
      profile_status: user.profile_status,
      ccw_name: user.ccw_name,
      ccw_avatar_url: user.ccw_avatar_url,
      ccw_student_oid: user.ccw_student_oid
    }
  };
}

export function normalizeCreationOid(value: string): string {
  const trimmed = value.trim();
  // 支持直接粘贴作品链接，自动抽出其中的 24 位十六进制 ID
  const fromUrl = trimmed.match(/[0-9a-fA-F]{24}/);
  return (fromUrl ? fromUrl[0] : trimmed).toLowerCase();
}

function fallbackCopyText(value: string): boolean {
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.append(textarea);
  textarea.select();
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } finally {
    textarea.remove();
  }
  return copied;
}

/** 复制文本并告知是否成功；chatDom 里的 copyText 不回报结果。 */
export async function copyText(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    return fallbackCopyText(value);
  }

  return fallbackCopyText(value);
}
