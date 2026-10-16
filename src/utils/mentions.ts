import type { Message, MessageMentionMetadata } from '@/types/api';

/** 一条消息对我来说算哪种提醒：me 点名 @ 了我；all 是 @全体成员；都不是为 null。点名优先。 */
export type MentionKind = 'me' | 'all';

/**
 * 「这条消息有没有 @我」只在这里判断：通知音（utils/notifications.ts）和会话列表上的「[有人@我]」（realtime/cache.ts）都用它。
 * 不看是谁发的 —— 自己发的消息不算提醒，由调用方在外面排除。
 */
export function messageMentionKind(message: Message, currentUserId: number | null | undefined): MentionKind | null {
  const metadata = message.metadata;
  if (!metadata || currentUserId === null || currentUserId === undefined) {
    return null;
  }
  const mentions = Array.isArray(metadata.mentions) ? metadata.mentions : [];
  if (mentions.some((mention: MessageMentionMetadata) => mention.user_id === currentUserId)) {
    return 'me';
  }
  return metadata.mention_all === true ? 'all' : null;
}
