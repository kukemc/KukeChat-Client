import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { acceptInvite, resolveInvite } from '@/api/invites';
import { useKukeStore } from '@/store/kukeStore';

export interface InviteModalProps {
  token: string;
  onClose: () => void;
}

/** 解析一条邀请链接（加群或加好友），以及接受它。接受后切到对应的会话并关掉弹窗。 */
export function useInvite({ token, onClose }: InviteModalProps) {
  const queryClient = useQueryClient();
  const setActiveConversationId = useKukeStore((state) => state.setActiveConversationId);
  const inviteQuery = useQuery({ queryKey: ['invite', token], queryFn: () => resolveInvite(token) });
  const acceptMutation = useMutation({
    mutationFn: () => acceptInvite(token),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      void queryClient.invalidateQueries({ queryKey: ['friends'] });
      if (result.conversation_id) {
        setActiveConversationId(result.conversation_id);
      }
      onClose();
    }
  });
  const invite = inviteQuery.data;
  const isGroup = invite?.target_type === 'group';

  return {
    isLoading: inviteQuery.isLoading,
    failed: Boolean(inviteQuery.error),
    title: isGroup ? '邀请你加入群聊' : '邀请你添加好友',
    group: invite?.group ?? null,
    user: invite?.user ?? null,
    acceptLabel: invite?.already_joined ? '已加入' : invite?.already_friends ? '已是好友' : acceptMutation.isPending ? '处理中...' : isGroup ? '加入群聊' : '添加好友',
    acceptDisabled: !invite || acceptMutation.isPending || Boolean(invite.already_joined) || Boolean(invite.already_friends),
    accept: () => acceptMutation.mutate()
  };
}
