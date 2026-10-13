import { useMutation, useQueryClient } from '@tanstack/react-query';
import { acceptGroupJoinRequest, rejectGroupJoinRequest } from '@/api/conversations';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import type { GroupJoinRequest } from '@/types/api';
import { parseApiDate } from '@/utils/dateTime';
import { Dialog, DialogList } from '../controls';
import { useInfo } from '../infoContext';
import { invalidateConversationData, useJoinRequests } from '../infoData';

function statusText(request: GroupJoinRequest): string {
  const status = request.status === 'pending' ? '等待审核' : request.status === 'accepted' ? '已通过' : '已拒绝';
  return request.created_at ? `${status} · ${parseApiDate(request.created_at)?.toLocaleString('zh-CN') ?? ''}` : status;
}

/** 入群申请：看附言和入群问题的回答，通过或拒绝。 */
export function JoinRequestsDialog(): JSX.Element {
  const { conversation, notify, closeDialog } = useInfo();
  const queryClient = useQueryClient();
  const { requests, loading } = useJoinRequests();

  const reviewed = (): void => {
    notify('');
    void queryClient.invalidateQueries({ queryKey: ['group-join-requests'] });
    invalidateConversationData(queryClient, conversation.id);
  };
  const acceptMutation = useMutation({
    mutationFn: (requestId: number) => acceptGroupJoinRequest(requestId),
    onSuccess: reviewed,
    onError: () => notify('通过入群申请失败，请稍后重试。', 'error')
  });
  const rejectMutation = useMutation({
    mutationFn: (requestId: number) => rejectGroupJoinRequest(requestId),
    onSuccess: reviewed,
    onError: () => notify('拒绝入群申请失败，请稍后重试。', 'error')
  });
  const reviewing = acceptMutation.isPending || rejectMutation.isPending;

  return (
    <Dialog title="入群申请" onClose={closeDialog}>
      <DialogList empty={loading ? '正在加载入群申请…' : requests.length === 0 ? '暂无入群申请。' : null}>
        {requests.map((request) => {
          const name = getDisplayName(request.requester, `用户 ${request.requester_id}`);
          return (
            <div key={request.id} className="kci-item kci-item--top">
              <Avatar user={request.requester} label={name} size="sm" />
              <div className="kci-item-text">
                <span>{name}</span>
                <span>{statusText(request)}</span>
                {request.message?.trim() ? <p className="kci-item-quote">附言：{request.message}</p> : null}
                {request.answer?.trim() ? <p className="kci-item-quote">回答：{request.answer}</p> : null}
              </div>
              {request.status === 'pending' ? (
                <div className="kci-item-actions">
                  <button type="button" className="kui-btn kui-btn--sm" disabled={reviewing} onClick={() => rejectMutation.mutate(request.id)}>拒绝</button>
                  <button type="button" className="kui-btn kui-btn--sm kui-btn--primary" disabled={reviewing} onClick={() => acceptMutation.mutate(request.id)}>通过</button>
                </div>
              ) : null}
            </div>
          );
        })}
      </DialogList>
    </Dialog>
  );
}
