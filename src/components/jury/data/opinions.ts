import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { deleteJuryOpinion, postJuryOpinion, reportJuryOpinion, setJuryOpinionLike } from '@/api/jury';
import type { JuryOpinion, JuryOpinionList, JuryOpinionState } from '@/types/jury';
import { juryKeys } from './queries';

function mapOpinions(list: JuryOpinionList | undefined, opinionId: number, change: (opinion: JuryOpinion) => JuryOpinion): JuryOpinionList | undefined {
  if (!list) {
    return list;
  }
  return {
    ...list,
    items: list.items.map((root) => (root.id === opinionId ? change(root) : { ...root, replies: (root.replies ?? []).map((reply) => (reply.id === opinionId ? change(reply) : reply)) }))
  };
}

function insertOpinion(list: JuryOpinionList | undefined, opinion: JuryOpinion): JuryOpinionList | undefined {
  if (!list) {
    return list;
  }
  if (opinion.parent_id === null) {
    return { items: [...list.items, { ...opinion, replies: opinion.replies ?? [] }], total: list.total + 1 };
  }
  // 回复挂在根观点下面：parent_id 可能指向根，也可能指向同一棵下面的另一条回复
  return {
    total: list.total + 1,
    items: list.items.map((root) => (root.id === opinion.parent_id || (root.replies ?? []).some((reply) => reply.id === opinion.parent_id) ? { ...root, replies: [...(root.replies ?? []), opinion] } : root))
  };
}

/**
 * 删除之后列表该是什么样，和服务端下次返回的保持一致：已删除的回复直接消失；
 * 已删除的根观点只在下面还有回复时留一个占位（state: deleted、content: null），没有回复了就整条消失。
 * total 是未删除的观点数（含回复、含被折叠的）。
 */
function removeOpinion(list: JuryOpinionList | undefined, opinionId: number): JuryOpinionList | undefined {
  if (!list) {
    return list;
  }
  const items: JuryOpinion[] = [];
  let removed = 0;
  for (const root of list.items) {
    const replies = (root.replies ?? []).filter((reply) => reply.id !== opinionId);
    removed += (root.replies ?? []).length - replies.length;
    const deleting = root.id === opinionId && root.state !== 'deleted';
    removed += deleting ? 1 : 0;
    const deleted = deleting || root.state === 'deleted';
    if (deleted && replies.length === 0) {
      continue;
    }
    items.push(deleted ? { ...root, state: 'deleted', content: null, replies } : { ...root, replies });
  }
  return { items, total: Math.max(0, list.total - removed) };
}

export interface OpinionActions {
  post: UseMutationResult<JuryOpinion, Error, { content: string; parentId?: number | null }>;
  remove: UseMutationResult<{ id: number; state: JuryOpinionState }, Error, number>;
  like: UseMutationResult<{ id: number; like_count: number; liked: boolean }, Error, { opinionId: number; liked: boolean }, { previous: JuryOpinionList | undefined }>;
  report: UseMutationResult<{ id: number; state: JuryOpinionState }, Error, { opinionId: number; reason: string; details?: string }>;
}

/** 观点区的写操作。成功后直接改缓存里的列表（列表很小，一次返回全部），不整份重拉。 */
export function useOpinionActions(caseId: number): OpinionActions {
  const queryClient = useQueryClient();
  const key = juryKeys.opinions(caseId);
  const update = (change: (list: JuryOpinionList | undefined) => JuryOpinionList | undefined): void => {
    queryClient.setQueryData<JuryOpinionList | undefined>(key, change);
  };

  const post = useMutation({
    mutationFn: ({ content, parentId }: { content: string; parentId?: number | null }) => postJuryOpinion(caseId, content, parentId),
    onSuccess: (opinion) => {
      update((list) => insertOpinion(list, opinion));
      void queryClient.invalidateQueries({ queryKey: juryKeys.stats });
      // 「我的评审」列表里每行的观点数
      void queryClient.invalidateQueries({ queryKey: juryKeys.votes });
    }
  });

  const remove = useMutation({
    mutationFn: (opinionId: number) => deleteJuryOpinion(opinionId),
    onSuccess: (result) => {
      update((list) => removeOpinion(list, result.id));
      void queryClient.invalidateQueries({ queryKey: juryKeys.stats });
      void queryClient.invalidateQueries({ queryKey: juryKeys.votes });
    }
  });

  // 点赞先改界面再发请求，失败了退回去
  const like = useMutation({
    mutationFn: ({ opinionId, liked }: { opinionId: number; liked: boolean }) => setJuryOpinionLike(opinionId, liked),
    onMutate: ({ opinionId, liked }) => {
      const previous = queryClient.getQueryData<JuryOpinionList>(key);
      update((list) => mapOpinions(list, opinionId, (opinion) => (opinion.liked === liked ? opinion : { ...opinion, liked, like_count: Math.max(0, opinion.like_count + (liked ? 1 : -1)) })));
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(key, context.previous);
      }
    },
    onSuccess: (result) => update((list) => mapOpinions(list, result.id, (opinion) => ({ ...opinion, liked: result.liked, like_count: result.like_count })))
  });

  const report = useMutation({
    mutationFn: ({ opinionId, reason, details }: { opinionId: number; reason: string; details?: string }) => reportJuryOpinion(opinionId, reason, details),
    onSuccess: (result) => update((list) => mapOpinions(list, result.id, (opinion) => ({ ...opinion, reported: true, state: result.state, content: result.state === 'visible' ? opinion.content : null })))
  });

  return { post, remove, like, report };
}
