import { readPreference, writePreference } from '../runtime';
import { MAX_RECENT_REACTIONS } from './reactionEmojis';

/**
 * 表情回应的「最近使用」，记在本机。只是一串 emoji，不涉及隐私，不按账号分开。
 * 安卓端对应 ReactionRecents（feature/chat/ReactionPicker.kt），同样最多记 16 个。
 */
const KEY = 'kukechat.desktop.reactionRecent';

export function readRecentReactions(): string[] {
  try {
    const parsed: unknown = JSON.parse(readPreference(KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string' && item.length > 0).slice(0, MAX_RECENT_REACTIONS) : [];
  } catch {
    return [];
  }
}

/** 用过的表情挪到最前面。 */
export function rememberReaction(emoji: string): void {
  const next = [emoji, ...readRecentReactions().filter((item) => item !== emoji)].slice(0, MAX_RECENT_REACTIONS);
  writePreference(KEY, JSON.stringify(next));
}
