import { useMutation, useQueryClient } from '@tanstack/react-query';
import { clearConversationHistory, dissolveConversation, leaveConversation } from '@/api/conversations';
import { deleteFriend } from '@/api/friends';
import { createReport } from '@/api/reports';
import { getDisplayName } from '@/components/ui/Avatar';
import { useKukeStore } from '@/store/kukeStore';
import { ActionRow, Section } from './controls';
import { useInfo } from './infoContext';
import { invalidateConversationData } from './infoData';

/** 收尾的一组：清空记录、举报，以及退群 / 解散 / 删好友这些回不了头的操作。 */
export function DangerSection(): JSX.Element {
  const { conversation, directUser, isGroup, isOwner, notify, reportConversation, close } = useInfo();
  const queryClient = useQueryClient();
  const setActiveConversationId = useKukeStore((state) => state.setActiveConversationId);
  const conversationId = conversation.id;

  const clearMutation = useMutation({
    mutationFn: () => clearConversationHistory(conversationId),
    onSuccess: () => {
      notify('');
      invalidateConversationData(queryClient, conversationId);
      void queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
    },
    onError: () => notify('删除聊天记录失败，请稍后重试。', 'error')
  });

  // 上层没接举报弹窗时的兜底：按固定理由直接提交
  const reportMutation = useMutation({
    mutationFn: () => createReport({ target_type: 'conversation', target_id: conversationId, conversation_id: conversationId, reason: '群聊违规', description: '从群聊资料页提交。' }),
    onSuccess: () => notify('举报已提交，管理员会保留当前群聊证据进行审核。'),
    onError: () => notify('举报提交失败，请稍后重试。', 'error')
  });

  function leaveSucceeded(): void {
    notify('');
    setActiveConversationId(null);
    invalidateConversationData(queryClient, conversationId);
    close();
  }

  const leaveMutation = useMutation({
    mutationFn: () => leaveConversation(conversationId),
    onSuccess: leaveSucceeded,
    onError: () => notify('退出群聊失败，请稍后重试。', 'error')
  });

  const dissolveMutation = useMutation({
    mutationFn: () => dissolveConversation(conversationId),
    onSuccess: leaveSucceeded,
    onError: () => notify('解散群聊失败，请稍后重试。', 'error')
  });

  const deleteFriendMutation = useMutation({
    mutationFn: deleteFriend,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['friends'] });
      invalidateConversationData(queryClient, conversationId);
      close();
    },
    onError: () => notify('删除好友失败，请稍后重试。', 'error')
  });

  const clearRow = (
    <ActionRow label="清空聊天记录" danger disabled={clearMutation.isPending} onClick={() => {
      if (window.confirm('确定删除本会话的聊天记录吗？此操作不会影响其他成员。')) {
        clearMutation.mutate();
      }
    }} />
  );

  if (!isGroup) {
    const friendId = conversation.is_friend ? directUser?.id : undefined;
    return (
      <Section>
        {clearRow}
        {friendId ? (
          <ActionRow label="删除好友" danger disabled={deleteFriendMutation.isPending} onClick={() => {
            if (window.confirm(`确定要删除好友「${getDisplayName(directUser, '好友')}」吗？`)) {
              deleteFriendMutation.mutate(friendId);
            }
          }} />
        ) : null}
      </Section>
    );
  }

  return (
    <Section>
      {clearRow}
      <ActionRow label="举报群聊" danger disabled={reportMutation.isPending} onClick={() => {
        if (reportConversation) {
          reportConversation(conversation);
        } else {
          reportMutation.mutate();
        }
      }} />
      {isOwner ? (
        <ActionRow label="解散群聊" danger disabled={dissolveMutation.isPending} onClick={() => {
          if (window.confirm('确定解散该群聊吗？解散后群成员、聊天记录、公告、加群申请等数据都会被彻底删除，且无法恢复。')) {
            dissolveMutation.mutate();
          }
        }} />
      ) : (
        <ActionRow label="退出群聊" danger disabled={leaveMutation.isPending} onClick={() => {
          if (window.confirm('确定退出该群聊吗？')) {
            leaveMutation.mutate();
          }
        }} />
      )}
    </Section>
  );
}
