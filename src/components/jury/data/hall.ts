import { useMemo } from 'react';
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData, type UseInfiniteQueryResult, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query';
import { createHallComment, createHallPost, deleteHallComment, deleteHallPost, getHallComments, getHallPost, getHallPosts, reportHallContent, updateHallPost, voteHallPost } from '@/api/juryHall';
import type { HallBallot, HallComment, HallCommentsPage, HallDeleteResult, HallPost, HallPostDraft, HallPostsPage, HallPostsQuery, HallReportBody, HallReportResult, JuryHallRules } from '@/types/juryHall';
import { useJury } from '../context';
import { errorCode } from './queries';

/**
 * 议事厅的查询和写操作。缓存 key 全部挂在 ['jury', 'hall'] 下：实时事件 jury.hall.changed 会整棵失效（src/realtime/client.ts）。
 * 这些接口只在后端下发了 hall 能力时才会被调到 —— 议事厅板块在那之前显示的是「即将开放」。
 */
export const hallKeys = {
  root: ['jury', 'hall'] as const,
  posts: ['jury', 'hall', 'posts'] as const,
  postsPage: (params: HallPostsQuery) => ['jury', 'hall', 'posts', params] as const,
  post: (postId: number) => ['jury', 'hall', 'post', postId] as const,
  comments: (postId: number) => ['jury', 'hall', 'comments', postId] as const
};

/** config.hall 里缺了哪一项时的兜底值（docs/jury-v2.md 3.5 写明的默认值）。以接口下发的为准。 */
const HALL_DEFAULTS: JuryHallRules = {
  title_max: 60, content_max: 5000, comment_max: 1000, posts_per_day: 3, comments_per_day: 50,
  vote_days: 7, quorum_ratio: 0.3, quorum_min: 3, pass_num: 2, pass_den: 3, pass_ratio: 0.6667, auto_hide_reports: 3,
  guidelines: '', report_reasons: ['人身攻击', '讨论未结案件', '泄露身份或隐私', '与风纪无关', '其他']
};

export function useHallRules(): JuryHallRules {
  const hall = useJury().config.config.hall;
  return useMemo(() => {
    const given = Object.fromEntries(Object.entries(hall ?? {}).filter(([, value]) => value !== null && value !== undefined)) as Partial<JuryHallRules>;
    return { ...HALL_DEFAULTS, ...given };
  }, [hall]);
}

export function useHallPosts(params: HallPostsQuery): UseQueryResult<HallPostsPage> {
  return useQuery({ queryKey: hallKeys.postsPage(params), queryFn: () => getHallPosts(params), retry: false, staleTime: 30_000, placeholderData: keepPreviousData });
}

export function useHallPost(postId: number | null): UseQueryResult<HallPost> {
  return useQuery({ queryKey: hallKeys.post(postId ?? 0), queryFn: () => getHallPost(postId ?? 0), enabled: postId !== null, retry: false, staleTime: 30_000 });
}

export const HALL_COMMENTS_PAGE = 30;

type CommentPages = InfiniteData<HallCommentsPage, number>;

/** 评论是平铺的、按时间正序分页：一页一页往后要（「加载更多」），根评论一定比它的回复先到。 */
export function useHallComments(postId: number): UseInfiniteQueryResult<CommentPages> {
  return useInfiniteQuery({
    queryKey: hallKeys.comments(postId),
    queryFn: ({ pageParam }) => getHallComments(postId, { limit: HALL_COMMENTS_PAGE, offset: pageParam }),
    initialPageParam: 0,
    // 按页数算偏移，不按已有条数算：自己刚发的评论会先插进缓存，按条数算会跳过一条
    getNextPageParam: (lastPage, pages) => (pages.length * HALL_COMMENTS_PAGE < lastPage.total ? pages.length * HALL_COMMENTS_PAGE : undefined),
    retry: false,
    staleTime: 30_000
  });
}

/** 把分页拼成一份，按 id 去重（自己刚发的那条可能在后面的页里再出现一次）。 */
export function flattenComments(data: CommentPages | undefined): { items: HallComment[]; total: number } {
  const seen = new Set<number>();
  const items: HallComment[] = [];
  for (const page of data?.pages ?? []) {
    for (const item of page.items) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        items.push(item);
      }
    }
  }
  return { items, total: data?.pages[data.pages.length - 1]?.total ?? 0 };
}

export interface HallPostActions {
  create: UseMutationResult<HallPost, Error, HallPostDraft>;
  update: UseMutationResult<HallPost, Error, { postId: number; title: string; content: string }>;
  remove: UseMutationResult<HallDeleteResult, Error, number>;
  vote: UseMutationResult<HallPost, Error, { postId: number; vote: HallBallot }>;
}

/** 帖子的状态在别处变了（刚出结果、刚被折叠或关闭）时服务端给的拒绝：这时把帖子重新拉一遍，界面跟上最新的 can_edit / can_delete / can_comment */
const STALE_POST_CODES = ['post_locked', 'post_closed', 'vote_closed'];

/** 帖子的写操作。成功后把返回的帖子写进详情缓存，列表整份失效（排序和计数都可能变）。 */
export function useHallPostActions(): HallPostActions {
  const queryClient = useQueryClient();
  const store = (post: HallPost): void => {
    // 详情缓存里只放全文：万一返回的是截断过的内容，就留着原来的全文，再去拉一遍
    queryClient.setQueryData<HallPost | undefined>(hallKeys.post(post.id), (current) => (post.content_truncated ? (current ? { ...post, content: current.content, content_truncated: current.content_truncated } : current) : post));
    if (post.content_truncated) {
      void queryClient.invalidateQueries({ queryKey: hallKeys.post(post.id) });
    }
    void queryClient.invalidateQueries({ queryKey: hallKeys.posts });
  };
  const refetchIfStale = (error: unknown, postId: number): void => {
    if (STALE_POST_CODES.includes(errorCode(error) ?? '')) {
      void queryClient.invalidateQueries({ queryKey: hallKeys.post(postId) });
      void queryClient.invalidateQueries({ queryKey: hallKeys.posts });
    }
  };
  const create = useMutation({ mutationFn: (draft: HallPostDraft) => createHallPost(draft), onSuccess: store });
  const update = useMutation({ mutationFn: ({ postId, title, content }: { postId: number; title: string; content: string }) => updateHallPost(postId, { title, content }), onSuccess: store, onError: (error, variables) => refetchIfStale(error, variables.postId) });
  const remove = useMutation({
    mutationFn: (postId: number) => deleteHallPost(postId),
    onSuccess: (_result, postId) => {
      queryClient.removeQueries({ queryKey: hallKeys.post(postId) });
      queryClient.removeQueries({ queryKey: hallKeys.comments(postId) });
      void queryClient.invalidateQueries({ queryKey: hallKeys.posts });
    },
    onError: (error, postId) => refetchIfStale(error, postId)
  });
  const vote = useMutation({ mutationFn: ({ postId, vote: ballot }: { postId: number; vote: HallBallot }) => voteHallPost(postId, ballot), onSuccess: store, onError: (error, variables) => refetchIfStale(error, variables.postId) });
  return { create, update, remove, vote };
}

export interface HallCommentActions {
  post: UseMutationResult<HallComment, Error, { content: string; parentId?: number | null }>;
  remove: UseMutationResult<HallDeleteResult, Error, number>;
}

/** 缓存里的评论，按 id 改一条 */
function mapComments(data: CommentPages | undefined, commentId: number, change: (item: HallComment) => HallComment): CommentPages | undefined {
  return data ? { ...data, pages: data.pages.map((page) => ({ ...page, items: page.items.map((item) => (item.id === commentId ? change(item) : item)) })) } : data;
}

/** 服务端说这条内容现在是什么状态，就照着改：不是 visible 的没有正文 */
function withState<T extends { state?: string; content: string | null }>(item: T, state: string): T {
  return state === 'visible' ? item : { ...item, state, content: null } as T;
}

/** 评论的写操作。成功后直接改缓存：新评论接在已加载的最后一页后面，删除的原地变成「已删除」。 */
export function useHallCommentActions(postId: number): HallCommentActions {
  const queryClient = useQueryClient();
  const key = hallKeys.comments(postId);
  const bumpCount = (delta: number): void => {
    queryClient.setQueryData<HallPost | undefined>(hallKeys.post(postId), (current) => (current ? { ...current, comment_count: Math.max(0, current.comment_count + delta) } : current));
    void queryClient.invalidateQueries({ queryKey: hallKeys.posts });
  };

  const post = useMutation({
    mutationFn: ({ content, parentId }: { content: string; parentId?: number | null }) => createHallComment(postId, content, parentId),
    onSuccess: (comment) => {
      queryClient.setQueryData<CommentPages | undefined>(key, (current) => {
        if (!current || current.pages.length === 0) {
          return current;
        }
        const pages = current.pages.map((page, index) => ({ items: index === current.pages.length - 1 ? [...page.items, comment] : page.items, total: page.total + 1 }));
        return { ...current, pages };
      });
      bumpCount(1);
    },
    onError: (error) => {
      // 帖子刚被关闭或折叠：重新拉一遍，评论框会按最新的 can_comment 收起来
      if (errorCode(error) === 'post_closed') {
        void queryClient.invalidateQueries({ queryKey: hallKeys.post(postId) });
      }
    }
  });

  const remove = useMutation({
    mutationFn: (commentId: number) => deleteHallComment(commentId),
    onSuccess: (result, commentId) => {
      queryClient.setQueryData<CommentPages | undefined>(key, (current) => mapComments(current, commentId, (item) => withState(item, result?.state ?? 'deleted') as HallComment));
    }
  });

  return { post, remove };
}

export function useHallReport(): UseMutationResult<HallReportResult, Error, HallReportBody> {
  const queryClient = useQueryClient();
  // 举报成功（或服务端说早就举报过）后，把缓存里的那一条标成已举报：离开再回来不用等重拉，按钮就是「已举报」。
  // 举报还可能当场让它被折叠（够了自动折叠的人数）：返回的 state 不是 visible 时，本地也跟着折叠
  const mark = (body: HallReportBody, state = 'visible'): void => {
    if (body.target_type === 'post') {
      queryClient.setQueryData<HallPost | undefined>(hallKeys.post(body.target_id), (post) => (post ? withState({ ...post, reported: true }, state) : post));
      if (state !== 'visible') {
        void queryClient.invalidateQueries({ queryKey: hallKeys.post(body.target_id) });
        void queryClient.invalidateQueries({ queryKey: hallKeys.posts });
      }
      return;
    }
    queryClient.setQueriesData<CommentPages | undefined>({ queryKey: [...hallKeys.root, 'comments'] }, (data) => mapComments(data, body.target_id, (item) => withState({ ...item, reported: true }, state) as HallComment));
  };
  return useMutation({
    mutationFn: (body: HallReportBody) => reportHallContent(body),
    onSuccess: (result, body) => mark(body, result?.state),
    onError: (error, body) => {
      if (errorCode(error) === 'already_reported') {
        mark(body);
      }
    }
  });
}
