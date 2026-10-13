import { useMemo, useState } from 'react';
import type { ImageViewerState } from '@/components/ui/ImageViewer';
import type { BookmarkedMessageRead, Conversation, User } from '@/types/api';
import { conversationDisplayTitle, messageSenderLabel } from './messageMeta';

export type FavoriteFilter = 'all' | 'direct' | 'group';

export const FAVORITE_FILTERS: Array<{ key: FavoriteFilter; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'direct', label: '私聊' },
  { key: 'group', label: '群聊' }
];

export interface FavoriteEntry {
  item: BookmarkedMessageRead;
  /** 收藏所在的会话。已经退出的群拿不到，这时是 null */
  conversation: Conversation | null;
  title: string;
}

/** 收藏页的筛选、搜索和看图状态，桌面版和移动版共用。收藏列表本身由外面查好传进来。 */
export function useFavorites(items: BookmarkedMessageRead[], conversations: Conversation[], currentUser: User) {
  const [filter, setFilter] = useState<FavoriteFilter>('all');
  const [search, setSearch] = useState('');
  const [imageViewer, setImageViewer] = useState<ImageViewerState | null>(null);

  const entries = useMemo<FavoriteEntry[]>(() => {
    const conversationById = new Map(conversations.map((conversation) => [conversation.id, conversation]));
    return items.map((item) => {
      const conversation = item.conversation ?? conversationById.get(item.conversation_id) ?? null;
      return { item, conversation, title: conversation ? conversationDisplayTitle(conversation, currentUser) : `会话 ${item.conversation_id}` };
    });
  }, [conversations, currentUser, items]);

  // 找不到会话的收藏算作私聊
  const groupCount = entries.filter((entry) => entry.conversation?.type === 'group').length;
  const counts: Record<FavoriteFilter, number> = { all: entries.length, direct: entries.length - groupCount, group: groupCount };

  const keyword = search.trim().toLowerCase();
  const visible = entries.filter(({ item, conversation, title }) => {
    if (filter !== 'all' && (conversation?.type === 'group') !== (filter === 'group')) {
      return false;
    }
    if (!keyword) {
      return true;
    }
    const sender = item.message.sender;
    return [title, item.message.content, messageSenderLabel(item.message), sender?.username, sender?.nickname, sender?.email].join(' ').toLowerCase().includes(keyword);
  });

  return {
    filter, setFilter, search, setSearch, counts, visible,
    imageViewer, setImageViewer,
    openImage: (images: string[], index: number) => setImageViewer({ images, index }),
    navigateImage: (index: number) => setImageViewer((current) => (current ? { ...current, index } : current))
  };
}
