/**
 * 机器人中心两端（桌面 / 移动）共用的纯函数：名字、日期、数字怎么显示，分享名片带什么。
 * 不放任何界面和请求。
 */
import type { Bot, BotShareCardMetadata, Conversation, MessageMetadata, User } from '@/types/api';
import { parseApiDate } from '@/utils/dateTime';

/** 机器人自己的账号。列表接口不一定带 user，缺的时候用机器人资料拼一个，头像和取色才对得上。 */
export function botUser(bot: Bot): User {
  return bot.user ?? { id: bot.user_id, username: bot.name, nickname: bot.name, avatar_url: bot.avatar_url, is_bot: true };
}

export function botOwner(bot: Bot): User {
  return bot.owner ?? { id: bot.owner_id, username: `用户 ${bot.owner_id}`, nickname: `用户 ${bot.owner_id}`, is_bot: false };
}

export function userName(user?: User | null): string {
  return user?.nickname || user?.username || (user?.id ? `用户 ${user.id}` : '用户');
}

export function groupTitle(conversation: Conversation): string {
  return conversation.display_title?.trim() || conversation.title?.trim() || `群聊 ${conversation.id}`;
}

/** 会话在「分享到」列表里的名字：群聊用群名，私聊用对方的名字。 */
export function conversationTitle(conversation: Conversation, currentUser?: User | null): string {
  if (conversation.type === 'group') {
    return groupTitle(conversation);
  }
  const other = conversation.direct_user ?? conversation.members?.find((member) => member.user_id !== currentUser?.id)?.user;
  return conversation.display_title?.trim() || other?.nickname || other?.username || conversation.title || '私聊';
}

/** 能往里加机器人的群：自己是群主或管理员的。 */
export function manageableGroups(conversations: Conversation[]): Conversation[] {
  return conversations.filter((conversation) => conversation.type === 'group' && (conversation.my_role === 'owner' || conversation.my_role === 'admin'));
}

export function nonEmptyLines(value?: string | null): string[] {
  return (value ?? '').split('\n').map((line) => line.trim()).filter(Boolean);
}

/** 年月日；解析不出来返回空串，由调用方决定要不要显示。 */
export function formatBotDate(value?: string | null): string {
  if (!value) {
    return '';
  }
  const date = parseApiDate(value);
  return !date ? '' : date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

export function formatCount(value?: number | null): string {
  const count = value ?? 0;
  if (count >= 10000) {
    return `${(count / 10000).toFixed(count >= 100000 ? 0 : 1)}万`;
  }
  return count.toLocaleString('zh-CN');
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '请求失败，请稍后再试';
}

export function clampRating(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(5, value)) : 0;
}

/** 评分支持半星：整数不带小数，半星带一位。 */
export function ratingLabel(value: number): string {
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
}

/** 分享到会话的那条消息的正文（不支持名片的旧客户端看到的就是它） */
export function botShareText(bot: Bot): string {
  return `[机器人] ${bot.name}：${bot.description?.trim() || '这个机器人还没有写介绍'}`.slice(0, 500);
}

export function botShareMetadata(bot: Bot): MessageMetadata {
  const card: BotShareCardMetadata = {
    type: 'bot',
    bot_id: bot.id,
    user_id: bot.user_id,
    name: bot.name,
    avatar_url: bot.avatar_url ?? null,
    description: bot.description ?? null,
    commands: bot.commands ?? null,
    rating_average: bot.rating_average ?? null,
    review_count: bot.review_count ?? 0,
    install_count: bot.install_count ?? 0,
    online: Boolean(bot.online)
  };
  return { share_card: card };
}
