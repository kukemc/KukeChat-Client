/**
 * 动态的数据层：查询、变更，以及它们各自要刷新哪些缓存。
 * 移动端和桌面端共用；实时事件（realtime/client.ts）按同一批 key 做失效，改 key 要两边一起改。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { type QueryClient, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getFriends } from '@/api/friends';
import { createPostComment, deletePost, getPostFeed, getPostLikes, getPostNotifications, getTrendingPostTopics, getUserPostStats, getUserPosts, markPostNotificationRead, markPostNotificationsRead, pinPost, togglePostCommentLike, togglePostLike, unpinPost } from '@/api/posts';
import { createReport } from '@/api/reports';
import type { CreateReportPayload, Post, PostFeedScope, PostFeedSort, User } from '@/types/api';
import { PAGE_SIZE, emptyPostStats, extractMentionUserIds, legacyMentionToPlain } from './postModel';

export function invalidatePosts(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ['posts'] });
}

/** 评论、评论点赞变了以后：这条动态的详情、评论列表和所有帖子流都要重取。 */
function invalidatePostDiscussion(queryClient: QueryClient, postId: number): void {
  void queryClient.invalidateQueries({ queryKey: ['posts', 'detail', postId] });
  void queryClient.invalidateQueries({ queryKey: ['posts', 'comments', postId] });
  invalidatePosts(queryClient);
}

function nextPostPage(lastPage: Post[]): number | undefined {
  return lastPage.length < PAGE_SIZE ? undefined : lastPage[lastPage.length - 1]?.id;
}

export function usePostFeed(scope: PostFeedScope, topic: string | null, sort: PostFeedSort) {
  return useInfiniteQuery({
    queryKey: ['posts', 'feed', scope, topic, sort],
    queryFn: ({ pageParam }) => getPostFeed({ scope, topic, sort, beforeId: pageParam, limit: PAGE_SIZE }),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: nextPostPage
  });
}

export function useUserPosts(userId: number, sort: PostFeedSort) {
  return useInfiniteQuery({
    queryKey: ['posts', 'user', userId, sort],
    queryFn: ({ pageParam }) => getUserPosts(userId, { sort, beforeId: pageParam, limit: PAGE_SIZE }),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: nextPostPage
  });
}

export function useUserPostStats(userId: number) {
  const query = useQuery({ queryKey: ['posts', 'user', userId, 'stats'], queryFn: () => getUserPostStats(userId) });
  return query.data ?? emptyPostStats;
}

export function useTrendingPostTopics() {
  return useQuery({ queryKey: ['post-topics'], queryFn: () => getTrendingPostTopics(5) });
}

/** 互动通知。角标只要最近 10 条里的未读数，列表页取 50 条；两处共用一个 key，所以实时事件一次就能都刷新。 */
export function usePostNotifications(limit: number) {
  return useQuery({ queryKey: ['post-notifications'], queryFn: () => getPostNotifications(limit) });
}

export function usePostNotificationActions() {
  const queryClient = useQueryClient();
  const refresh = (): void => void queryClient.invalidateQueries({ queryKey: ['post-notifications'] });
  const readAll = useMutation({ mutationFn: markPostNotificationsRead, onSuccess: refresh });
  const readOne = useMutation({ mutationFn: markPostNotificationRead, onSuccess: refresh });
  return { readAll, readOne };
}

/** 可以 @ 的人：好友列表里去掉自己。 */
export function useFriendUsers(currentUserId: number): User[] {
  const friendsQuery = useQuery({ queryKey: ['friends'], queryFn: getFriends });
  return useMemo(
    () => (friendsQuery.data ?? []).map((friend) => friend.friend ?? friend.user).filter((user): user is User => Boolean(user) && user.id !== currentUserId),
    [currentUserId, friendsQuery.data]
  );
}

export function usePostLikes(postId: number) {
  return useQuery({ queryKey: ['posts', 'likes', postId], queryFn: () => getPostLikes(postId) });
}

/** 一条动态上的操作：点赞、删除、置顶 / 取消置顶。 */
export function usePostActions(post: Post) {
  const queryClient = useQueryClient();
  const refresh = (): void => invalidatePosts(queryClient);
  const like = useMutation({ mutationFn: () => togglePostLike(post.id), onSuccess: refresh });
  const remove = useMutation({ mutationFn: () => deletePost(post.id), onSuccess: refresh });
  const pin = useMutation({ mutationFn: () => (post.pinned_at ? unpinPost(post.id) : pinPost(post.id)), onSuccess: refresh });
  return { like, remove, pin };
}

/** 发评论或回复。parentId 为空是直接评论动态。 */
export function useCreatePostComment(postId: number, friendUsers: User[]) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ content, parentId }: { content: string; parentId: number | null }) => createPostComment(postId, { content: legacyMentionToPlain(content), parent_id: parentId, mention_user_ids: extractMentionUserIds(content, friendUsers) }),
    onSuccess: () => invalidatePostDiscussion(queryClient, postId)
  });
}

export function useTogglePostCommentLike(postId: number, commentId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => togglePostCommentLike(postId, commentId),
    onSuccess: () => invalidatePostDiscussion(queryClient, postId)
  });
}

export function useReportMutation(onDone: () => void) {
  return useMutation({ mutationFn: (payload: CreateReportPayload) => createReport(payload), onSuccess: onDone });
}

/**
 * 帖子流页面的状态：分区、排序、话题筛选、被单独拎出来的那条动态，以及「滚到某条并高亮」。
 * 排序和话题互斥——选话题时回到「最新」，点排序时清掉话题。
 */
export function usePostFeedState() {
  const [scope, setScope] = useState<PostFeedScope>('friends');
  const [feedSort, setFeedSort] = useState<PostFeedSort>('latest');
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [pinnedPost, setPinnedPost] = useState<Post | null>(null);
  const [focusedPostId, setFocusedPostId] = useState<number | null>(null);
  const [openPostError, setOpenPostError] = useState<string | null>(null);
  const postRefs = useRef(new Map<number, HTMLElement>());
  const feedQuery = usePostFeed(scope, selectedTopic, feedSort);
  const feedPosts = useMemo(() => feedQuery.data?.pages.flat() ?? [], [feedQuery.data]);
  // 从通知、聊天里的分享卡片点进来的动态不一定在当前这页里，取回来以后顶在最前面
  const posts = useMemo(() => (pinnedPost && !feedPosts.some((post) => post.id === pinnedPost.id) ? [pinnedPost, ...feedPosts] : feedPosts), [feedPosts, pinnedPost]);

  useEffect(() => {
    if (focusedPostId === null) {
      return undefined;
    }
    const timeout = window.setTimeout(() => {
      postRefs.current.get(focusedPostId)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
    return () => window.clearTimeout(timeout);
  }, [focusedPostId, posts]);

  function setPostRef(postId: number, node: HTMLElement | null): void {
    if (node) {
      postRefs.current.set(postId, node);
      return;
    }
    postRefs.current.delete(postId);
  }

  function selectScope(next: PostFeedScope): void {
    setScope(next);
    setFeedSort('latest');
  }

  function selectSort(next: PostFeedSort): void {
    setFeedSort(next);
    setSelectedTopic(null);
  }

  function selectTopic(topic: string | null): void {
    setSelectedTopic(topic);
    setFeedSort('latest');
    setPinnedPost(null);
    setFocusedPostId(null);
  }

  function focusPost(postId: number): void {
    setFocusedPostId(postId);
    window.setTimeout(() => setFocusedPostId((current) => (current === postId ? null : current)), 2200);
  }

  function clearOpenPostError(): void {
    setOpenPostError(null);
  }

  function showOpenPostError(): void {
    setOpenPostError('原动态不可见或已删除');
    window.setTimeout(() => setOpenPostError(null), 2600);
  }

  return { scope, feedSort, selectedTopic, pinnedPost, focusedPostId, openPostError, feedQuery, posts, setPostRef, selectScope, selectSort, selectTopic, setPinnedPost, focusPost, clearOpenPostError, showOpenPostError };
}
