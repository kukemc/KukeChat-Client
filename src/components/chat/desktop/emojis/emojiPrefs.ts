import { isRecord } from '@/api/normalizers';
import type { SendMessageVariables } from '../../message/types';
import { readPreference, writePreference } from '../runtime';

/** 表情面板记在本机的东西：上次停在哪个分类、最近用过什么。 */

export type EmojiTab = 'search' | 'recent' | 'emoji' | 'favorites' | 'group';

/** 一张能当表情发出去的图片。收藏表情带 assetId，群表情带 groupEmojiId 和名称。 */
export interface StickerItem {
  url: string;
  name?: string;
  assetId?: number;
  groupEmojiId?: number;
}

export interface RecentEmojis {
  emojis: string[];
  stickers: StickerItem[];
}

export const MAX_RECENT_EMOJIS = 30;
export const MAX_RECENT_STICKERS = 24;

const TAB_KEY = 'kukechat.desktop.emojiTab';
const REMEMBERED_TABS: EmojiTab[] = ['recent', 'emoji', 'favorites', 'group'];

// 最近使用里有收藏表情的地址，按账号分开存，换号登录看不到上一个人的
function recentKey(userId: number): string {
  return `kukechat.desktop.emojiRecent.${userId}`;
}

/** 表情图片都是一条带 sticker 标记的图片消息，来源 id 原样带上。 */
export function stickerMessage(item: StickerItem): SendMessageVariables {
  return {
    content: item.url,
    type: 'image',
    metadata: {
      sticker: true,
      ...(item.assetId ? { sticker_asset_id: item.assetId } : {}),
      ...(item.groupEmojiId ? { group_emoji_id: item.groupEmojiId } : {})
    }
  };
}

export function readLastTab(): EmojiTab | null {
  const stored = readPreference(TAB_KEY) as EmojiTab | null;
  return stored && REMEMBERED_TABS.includes(stored) ? stored : null;
}

/** 搜索不记：下次打开停在一个空的搜索框上没有意义。 */
export function writeLastTab(tab: EmojiTab): void {
  if (REMEMBERED_TABS.includes(tab)) {
    writePreference(TAB_KEY, tab);
  }
}

function toSticker(value: unknown): StickerItem | null {
  if (!isRecord(value) || typeof value.url !== 'string' || !value.url) {
    return null;
  }
  return {
    url: value.url,
    name: typeof value.name === 'string' ? value.name : undefined,
    assetId: typeof value.assetId === 'number' ? value.assetId : undefined,
    groupEmojiId: typeof value.groupEmojiId === 'number' ? value.groupEmojiId : undefined
  };
}

export function readRecents(userId: number): RecentEmojis {
  try {
    const parsed: unknown = JSON.parse(readPreference(recentKey(userId)) ?? 'null');
    if (!isRecord(parsed)) {
      return { emojis: [], stickers: [] };
    }
    return {
      emojis: (Array.isArray(parsed.emojis) ? parsed.emojis : []).filter((item): item is string => typeof item === 'string' && item.length > 0).slice(0, MAX_RECENT_EMOJIS),
      stickers: (Array.isArray(parsed.stickers) ? parsed.stickers : []).map(toSticker).filter((item): item is StickerItem => item !== null).slice(0, MAX_RECENT_STICKERS)
    };
  } catch {
    // 存的内容坏了就当没有，下次写入会盖掉
    return { emojis: [], stickers: [] };
  }
}

function writeRecents(userId: number, recents: RecentEmojis): RecentEmojis {
  writePreference(recentKey(userId), JSON.stringify(recents));
  return recents;
}

export function pushRecentEmoji(userId: number, glyph: string): void {
  const recents = readRecents(userId);
  writeRecents(userId, { ...recents, emojis: [glyph, ...recents.emojis.filter((item) => item !== glyph)].slice(0, MAX_RECENT_EMOJIS) });
}

export function pushRecentSticker(userId: number, sticker: StickerItem): void {
  const recents = readRecents(userId);
  writeRecents(userId, { ...recents, stickers: [sticker, ...recents.stickers.filter((item) => item.url !== sticker.url)].slice(0, MAX_RECENT_STICKERS) });
}

export function removeRecentSticker(userId: number, url: string): RecentEmojis {
  const recents = readRecents(userId);
  return recents.stickers.some((item) => item.url === url)
    ? writeRecents(userId, { ...recents, stickers: recents.stickers.filter((item) => item.url !== url) })
    : recents;
}

export function clearRecents(userId: number): RecentEmojis {
  return writeRecents(userId, { emojis: [], stickers: [] });
}
