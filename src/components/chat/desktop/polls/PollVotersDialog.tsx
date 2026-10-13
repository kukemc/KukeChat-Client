import { useInfiniteQuery } from '@tanstack/react-query';
import { getPollVoters } from '@/api/polls';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import type { PollOption } from '@/types/polls';
import { PollDialog } from './PollDialog';

const PAGE_SIZE = 50;

/** 某个选项的投票人名单，分页加载。只有非匿名投票才会打开它。 */
export function PollVotersDialog({ conversationId, pollId, option, onClose }: { conversationId: number; pollId: number; option: PollOption; onClose: () => void }): JSX.Element {
  const votersQuery = useInfiniteQuery({
    queryKey: ['poll-voters', conversationId, pollId, option.id],
    queryFn: ({ pageParam }) => getPollVoters(conversationId, pollId, option.id, pageParam, PAGE_SIZE),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) => {
      const loaded = pages.reduce((sum, page) => sum + page.items.length, 0);
      return lastPage.items.length > 0 && loaded < lastPage.total ? loaded : undefined;
    },
    // 名单随时在变：每次打开都重新拉，关掉就不留
    staleTime: 0,
    gcTime: 0
  });
  const pages = votersQuery.data?.pages ?? [];
  const voters = pages.flatMap((page) => page.items);
  const total = pages.length > 0 ? pages[pages.length - 1].total : 0;

  return (
    <PollDialog title={`「${option.text}」的投票人`} onClose={onClose}>
      {votersQuery.isLoading ? <p className="kui-empty">正在加载…</p> : null}
      {votersQuery.error ? <p className="kui-note kui-note--danger" role="alert">{votersQuery.error.message}</p> : null}
      {votersQuery.isSuccess && voters.length === 0 ? <p className="kui-empty">还没有人投这一项</p> : null}
      {voters.length > 0 ? (
        <>
          <p className="kcp-voters-total">共 {total} 人</p>
          <ul>
            {voters.map((user) => (
              <li key={user.id} className="kcp-voter">
                <Avatar user={user} size="sm" />
                <span className="kcp-voter-name">{getDisplayName(user, `用户 ${user.id}`)}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {votersQuery.hasNextPage ? (
        <button type="button" className="kui-btn kui-btn--block kcp-voters-more" disabled={votersQuery.isFetchingNextPage} onClick={() => void votersQuery.fetchNextPage()}>
          {votersQuery.isFetchingNextPage ? '正在加载…' : `加载更多（${voters.length}/${total}）`}
        </button>
      ) : null}
    </PollDialog>
  );
}
