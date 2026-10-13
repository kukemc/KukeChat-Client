/** 「大佬入住」名单的数据：分页查询和几个文案函数，移动端和桌面端共用。 */
import { useInfiniteQuery } from '@tanstack/react-query';
import { getCcwCreators } from '@/api/users';
import { getDisplayName } from '@/components/ui/Avatar';
import type { CcwCreator, User } from '@/types/api';

const PAGE_SIZE = 30;

/**
 * 一个数按多大的单位缩写：除数、保留几位小数、后缀。
 * 数字滚动时全程套用终值的这一组，单位和位数才不会在中途跳来跳去。
 */
export function compactNumberScale(value: number): { divisor: number; digits: number; suffix: string } {
  if (value >= 100000000) return { divisor: 100000000, digits: value >= 1000000000 ? 0 : 1, suffix: '亿' };
  if (value >= 10000) return { divisor: 10000, digits: value >= 100000 ? 0 : 1, suffix: '万' };
  if (value >= 1000) return { divisor: 1000, digits: 1, suffix: 'k' };
  return { divisor: 1, digits: 0, suffix: '' };
}

export function compactNumber(value?: number | null): string {
  const count = value ?? 0;
  const { divisor, digits, suffix } = compactNumberScale(count);
  return divisor === 1 ? String(count) : `${(count / divisor).toFixed(digits)}${suffix}`;
}

/** 名单里的条目只带了 User 的一部分字段，够头像和个人空间用。 */
export function creatorAsUser(creator: CcwCreator): User {
  return creator as User;
}

export function creatorName(creator: CcwCreator): string {
  return creator.ccw_name || getDisplayName(creatorAsUser(creator));
}

const HTML_ENTITIES: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'" };

/**
 * 把别处同步来的签名收成纯文本：去掉 HTML 标签（包括被截断、没有闭合的那种），还原常见的转义。
 * 签名只当文字显示，绝不当 HTML 渲染；这里做的是「别把标签原样露给人看」。
 */
export function plainSignature(value?: string | null): string {
  const raw = (value ?? '').trim();
  if (!raw || !/[<&]/.test(raw)) {
    return raw;
  }
  return raw
    .replace(/<\/?[a-zA-Z!][^>]*>?/g, ' ')
    .replace(/&(nbsp|amp|lt|gt|quot|apos|#39);/g, (_match, name: string) => HTML_ENTITIES[name])
    .replace(/\s+/g, ' ')
    .trim();
}

/** 卡片上的一句介绍：主页标签、主页标题、简介、CCW 简介里第一条有内容的。 */
export function creatorIntroduction(creator: CcwCreator): string {
  for (const candidate of [creator.profile_tagline, creator.profile_title, creator.bio, creator.ccw_bio]) {
    const text = plainSignature(candidate);
    if (text) {
      return text;
    }
  }
  return '在 KukeChat 遇见这位优秀的 CCW 创作者。';
}

export function creatorCover(creator: CcwCreator): string | null {
  return creator.profile_cover_url || creator.ccw_homepage_cover_url || null;
}

export type CreatorSortKey = 'followers' | 'likes' | 'works';

export const creatorSortOptions: Array<{ value: CreatorSortKey; label: string }> = [
  { value: 'followers', label: '粉丝' },
  { value: 'likes', label: '获赞' },
  { value: 'works', label: '作品' }
];

function sortValue(creator: CcwCreator, key: CreatorSortKey): number {
  return (key === 'followers' ? creator.ccw_follower_count : key === 'likes' ? creator.ccw_like_count : creator.ccw_creation_count) ?? 0;
}

/** 在已经取回来的人里重新排座次。接口本身只按粉丝数给，所以默认的顺序原样不动。 */
export function rankCreators(creators: CcwCreator[], key: CreatorSortKey): CcwCreator[] {
  if (key === 'followers') {
    return creators;
  }
  return creators
    .map((creator, index) => ({ creator, index }))
    .sort((a, b) => sortValue(b.creator, key) - sortValue(a.creator, key) || a.index - b.index)
    .map((item) => item.creator);
}

export function useCcwCreators() {
  const query = useInfiniteQuery({
    queryKey: ['ccw-creators'],
    queryFn: ({ pageParam }) => getCcwCreators(PAGE_SIZE, pageParam),
    initialPageParam: 0,
    getNextPageParam: (page) => (page.has_more ? page.offset + page.items.length : undefined)
  });
  return {
    creators: query.data?.pages.flatMap((page) => page.items) ?? [],
    total: query.data?.pages[0]?.total ?? 0,
    isLoading: query.isLoading,
    isError: query.isError,
    hasMore: query.hasNextPage,
    loadingMore: query.isFetchingNextPage,
    loadMore: () => void query.fetchNextPage(),
    retry: () => void query.refetch()
  };
}
