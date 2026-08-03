import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { acceptFriendRequest, getIncomingFriendRequests, getOutgoingFriendRequests, rejectFriendRequest } from '@/api/friends';
import type { FriendRequest } from '@/types/api';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';

function RequestCard({ request, type }: { request: FriendRequest; type: 'incoming' | 'outgoing' }): JSX.Element {
  const queryClient = useQueryClient();
  const acceptMutation = useMutation({
    mutationFn: acceptFriendRequest,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['friends'] });
      void queryClient.invalidateQueries({ queryKey: ['friend-requests'] });
    }
  });
  const rejectMutation = useMutation({
    mutationFn: rejectFriendRequest,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['friend-requests'] })
  });
  const user = type === 'incoming' ? request.requester : request.receiver;

  return (
    <div className="glass-card flex items-center gap-3 rounded-2xl p-3">
      <Avatar user={user} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{getDisplayName(user, `用户 ${type === 'incoming' ? request.requester_id : request.receiver_id}`)}</p>
        <p className="truncate text-xs [color:var(--kc-muted)]">状态：{request.status}</p>
      </div>
      {type === 'incoming' && request.status === 'pending' ? (
        <div className="flex gap-2">
          <button type="button" onClick={() => acceptMutation.mutate(request.id)} className="liquid-button rounded-2xl px-3 py-2 text-xs font-bold transition">接受</button>
          <button type="button" onClick={() => rejectMutation.mutate(request.id)} className="rounded-2xl border bg-transparent px-3 py-2 text-xs font-bold transition [border-color:var(--kc-border)] [color:var(--kc-muted)] hover:[background:var(--kc-hover)] hover:[color:var(--kc-text)]">拒绝</button>
        </div>
      ) : null}
    </div>
  );
}

export function FriendRequestsPanel(): JSX.Element {
  const incomingQuery = useQuery({ queryKey: ['friend-requests', 'incoming'], queryFn: getIncomingFriendRequests });
  const outgoingQuery = useQuery({ queryKey: ['friend-requests', 'outgoing'], queryFn: getOutgoingFriendRequests });
  const incoming = incomingQuery.data ?? [];
  const outgoing = outgoingQuery.data ?? [];

  return (
    <section className="scroll-soft h-full overflow-y-auto p-4 [background:var(--kc-chat)] [color:var(--kc-text)] sm:p-6">
      <div className="mb-5">
        <h3 className="text-2xl font-semibold">好友申请</h3>
        <p className="mt-1 text-sm [color:var(--kc-muted)]">处理收到的申请，查看已发送的请求。</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="glass-panel rounded-[30px] p-4">
          <h4 className="mb-3 text-sm font-semibold">收到的申请</h4>
          {incomingQuery.isLoading ? <p className="glass-card-quiet rounded-2xl p-4 text-sm [color:var(--kc-muted)]">正在加载...</p> : null}
          {!incomingQuery.isLoading && incoming.length === 0 ? <p className="glass-card-quiet rounded-2xl p-4 text-sm [color:var(--kc-muted)]">暂无收到的申请。</p> : null}
          <div className="grid gap-2">{incoming.map((request) => <RequestCard key={request.id} request={request} type="incoming" />)}</div>
        </div>

        <div className="glass-panel rounded-[30px] p-4">
          <h4 className="mb-3 text-sm font-semibold">发出的申请</h4>
          {outgoingQuery.isLoading ? <p className="glass-card-quiet rounded-2xl p-4 text-sm [color:var(--kc-muted)]">正在加载...</p> : null}
          {!outgoingQuery.isLoading && outgoing.length === 0 ? <p className="glass-card-quiet rounded-2xl p-4 text-sm [color:var(--kc-muted)]">暂无发出的申请。</p> : null}
          <div className="grid gap-2">{outgoing.map((request) => <RequestCard key={request.id} request={request} type="outgoing" />)}</div>
        </div>
      </div>
    </section>
  );
}
