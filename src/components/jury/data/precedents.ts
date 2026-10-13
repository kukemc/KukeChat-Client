import { keepPreviousData, useMutation, useQuery, useQueryClient, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query';
import { createPrecedent, deletePrecedent, getPrecedent, getPrecedents, updatePrecedent } from '@/api/jurySenior';
import type { Precedent, PrecedentDetail, PrecedentPage, PrecedentQuery } from '@/types/jurySenior';
import { juryKeys } from './queries';

/** 判例的查询和写操作（docs/jury-v2.md 3.4）。 */
export const precedentKeys = {
  root: ['jury', 'precedents'] as const,
  page: (params: PrecedentQuery) => ['jury', 'precedents', params] as const,
  detail: (precedentId: number) => ['jury', 'precedent', precedentId] as const
};

/** 裁判要旨和标题的长度上限（契约里是定值，配置里没有） */
export const PRECEDENT_TITLE_MAX = 60;
export const PRECEDENT_SUMMARY_MAX = 1000;

export function usePrecedents(params: PrecedentQuery, enabled: boolean): UseQueryResult<PrecedentPage> {
  return useQuery({ queryKey: precedentKeys.page(params), queryFn: () => getPrecedents(params), enabled, retry: false, staleTime: 60_000, placeholderData: keepPreviousData });
}

export function usePrecedent(precedentId: number | null): UseQueryResult<PrecedentDetail> {
  return useQuery({ queryKey: precedentKeys.detail(precedentId ?? 0), queryFn: () => getPrecedent(precedentId ?? 0), enabled: precedentId !== null, retry: false, staleTime: 60_000 });
}

export interface PrecedentDraft {
  title: string;
  summary: string;
}

export interface PrecedentActions {
  /** 标为判例（caseId：委员侧的评审编号，不是公开编号）或修改已有的判例（precedentId） */
  save: UseMutationResult<Precedent, Error, PrecedentDraft & { caseId?: number; precedentId?: number }>;
  /** publicCaseId 是判例对象里的 case_id（案件的公开编号），只用来让公示栏的那一条重新拉取 */
  remove: UseMutationResult<{ id: number; status: string }, Error, { precedentId: number; publicCaseId: number }>;
}

/** 判例变了之后，三处要跟着变：判例库、这个案件的详情（上面有「本案是判例」）、公示栏的判例标记。 */
export function usePrecedentActions(): PrecedentActions {
  const queryClient = useQueryClient();
  // publicCaseId 是判例里的 case_id，也就是案件的公开编号；委员侧的案件详情按评审编号缓存，
  // 两套编号对不上，所以案件详情整类失效（量很小），不拿公开编号去拼它的 key
  const refresh = (publicCaseId: number, precedentId?: number): void => {
    void queryClient.invalidateQueries({ queryKey: precedentKeys.root });
    void queryClient.invalidateQueries({ queryKey: ['jury', 'case'] });
    void queryClient.invalidateQueries({ queryKey: juryKeys.publicCases });
    void queryClient.invalidateQueries({ queryKey: juryKeys.publicCase(publicCaseId) });
    if (precedentId !== undefined) {
      void queryClient.invalidateQueries({ queryKey: precedentKeys.detail(precedentId) });
    }
  };

  const save = useMutation({
    mutationFn: (draft: PrecedentDraft & { caseId?: number; precedentId?: number }) => (draft.precedentId !== undefined ? updatePrecedent(draft.precedentId, draft.title, draft.summary) : createPrecedent(draft.caseId ?? 0, draft.title, draft.summary)),
    onSuccess: (precedent) => refresh(precedent.case_id, precedent.id)
  });

  const remove = useMutation({
    mutationFn: ({ precedentId }: { precedentId: number; publicCaseId: number }) => deletePrecedent(precedentId),
    onSuccess: (_result, variables) => {
      queryClient.removeQueries({ queryKey: precedentKeys.detail(variables.precedentId) });
      refresh(variables.publicCaseId);
    }
  });

  return { save, remove };
}
