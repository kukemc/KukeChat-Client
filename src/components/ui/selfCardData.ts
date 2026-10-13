import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { getUserPostStats, getUserPosts } from '@/api/posts';
import { getUserOnlineStatus } from '@/api/users';
import { useLevelAvailable, useMyLevel } from '@/components/level/data';
import { levelOfUser } from '@/components/level/LevelIcons';
import { PAGE_SIZE } from '@/components/posts/postModel';
import { useShop } from '@/components/shop/data';
import { bubbleSkinOf, type BubbleSkin } from '@/components/shop/skin/bubbleSkin';
import { ccwStudentProfileUrl } from '@/config';
import type { User } from '@/types/api';
import { resolveAssetUrl, resolveThumbnailUrl } from '@/utils/assetUrl';
import { userPresenceLabel } from '@/utils/presence';
import { getDisplayName } from './Avatar';

/**
 * 「我的资料卡」（点标题栏上自己的头像弹出的那张，ui/desktop/SelfCardDesktop.tsx）要用的数据。
 *
 * 资料本身（昵称、头像、签名、等级、装扮、CCW 绑定）直接读传进来的当前用户对象：它在 kukeStore 里，
 * 改资料、换装扮、升级时各处都会把它改掉，所以卡片每次打开看到的就是最新的，这里不为它再发请求。
 * 需要另外请求的只有三样，而且都只在卡片挂着（开着）的时候才请求：
 *   · 在线状态      GET /users/{id}/online，和别人的资料卡共用缓存
 *   · 等级明细      GET /levels/me，和等级页共用缓存（服务端没有账号等级时不请求）
 *   · 最近的动态    GET /posts/users/{id} 的第一页 + 动态条数
 * 头部右侧「我收到的赞」和点开之后的「谁赞了我」不在这里，数据在 components/likes/data.ts（同样只在卡片开着时请求）。
 */

/** 资料卡「动态」那一行最多放几张图 */
export const SELF_CARD_IMAGE_LIMIT = 4;

export interface SelfCardPosts {
  /** 最近动态里的图片（缩略图地址），最多 SELF_CARD_IMAGE_LIMIT 张 */
  images: string[];
  /** 动态条数。拿不到统计时是第一页的条数 */
  count: number;
  /** count 只是第一页的条数，实际可能更多 */
  countIsFloor: boolean;
}

async function fetchSelfCardPosts(userId: number): Promise<SelfCardPosts> {
  // 统计拿不到不算失败：条数退回第一页的条数
  const [posts, stats] = await Promise.all([
    getUserPosts(userId, { sort: 'latest', limit: PAGE_SIZE }),
    getUserPostStats(userId).catch(() => null)
  ]);
  const images: string[] = [];
  for (const post of posts) {
    // 没过审的动态别人看不到，它的图不拿来当门面
    if (post.moderation_status === 'rejected' || !Array.isArray(post.image_urls)) {
      continue;
    }
    for (const url of post.image_urls) {
      const thumbnail = resolveAssetUrl(url) ? resolveThumbnailUrl(url) : undefined;
      if (thumbnail && !images.includes(thumbnail)) {
        images.push(thumbnail);
      }
      if (images.length >= SELF_CARD_IMAGE_LIMIT) {
        break;
      }
    }
    if (images.length >= SELF_CARD_IMAGE_LIMIT) {
      break;
    }
  }
  const total = typeof stats?.post_count === 'number' && Number.isFinite(stats.post_count) ? Math.max(0, stats.post_count) : null;
  return { images, count: total ?? posts.length, countIsFloor: total === null && posts.length >= PAGE_SIZE };
}

/**
 * 最近的动态。key 挂在 ['posts'] 下面：发了、删了动态（invalidatePosts）之后它跟着过期，下次打开卡片时重取。
 * 一分钟内重复打开不重新请求；关掉卡片之后结果再留十分钟，这期间再打开先显示上次的，不闪骨架。
 */
export function useSelfCardPosts(userId: number): UseQueryResult<SelfCardPosts> {
  return useQuery({
    queryKey: ['posts', 'user', userId, 'self-card'],
    queryFn: () => fetchSelfCardPosts(userId),
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    retry: false
  });
}

export interface SelfCardSkin {
  skin: BubbleSkin;
  /** 皮肤的名字。商店的目录还没拿到、或者目录里找不到这件时是 null */
  name: string | null;
  /** 当前连接的服务端有商店，点了可以过去 */
  shopAvailable: boolean;
}

export function useSelfCardData(user: User) {
  const onlineQuery = useQuery({
    queryKey: ['user-online', user.id],
    queryFn: () => getUserOnlineStatus(user.id),
    staleTime: 15_000,
    retry: false
  });

  const levelAvailable = useLevelAvailable();
  const levelQuery = useMyLevel(levelAvailable);
  // 等级以用户对象上的为准（升级时它是第一个变的），明细里的更高就用明细里的
  const level = Math.max(levelOfUser(user), levelQuery.data?.level ?? 0);

  // 商店的目录只读缓存、不发请求：它由主界面负责拉取，这里只是借它查皮肤叫什么
  const shop = useShop(false).data;
  const bubbleSku = user.cosmetics?.bubble?.sku;
  const parsedSkin = bubbleSkinOf(user);
  const skin: SelfCardSkin | null = parsedSkin && bubbleSku
    ? { skin: parsedSkin, name: shop?.items.find((item) => item.sku === bubbleSku)?.name?.trim() || null, shopAvailable: Boolean(shop) }
    : null;

  return {
    name: getDisplayName(user, '用户'),
    // 自己正开着客户端：状态还没取回来之前先当作在线，免得状态点先灰一下再变绿
    online: onlineQuery.data?.online ?? true,
    statusLabel: userPresenceLabel(user, onlineQuery.data),
    levelAvailable,
    level,
    /** 累计活跃天；还没取到、取不到都是 null */
    activeDays: levelQuery.data?.active_days ?? null,
    levelLoading: levelAvailable && levelQuery.isPending,
    skin,
    ccwProfileUrl: user.ccw_student_oid ? ccwStudentProfileUrl(user.ccw_student_oid) : null,
    ccwAvatarUrl: resolveThumbnailUrl(user.ccw_avatar_url)
  };
}
