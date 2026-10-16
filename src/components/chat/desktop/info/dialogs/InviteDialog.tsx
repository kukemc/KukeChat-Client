import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { addConversationMembers } from '@/api/conversations';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { groupPlusErrorCode } from '@/components/groupPlus/data';
import { useGroupPlusUi } from '@/components/groupPlus/ui';
import { Icon } from '@/components/ui/Icon';
import type { User } from '@/types/api';
import { friendshipUser, memberUserId } from '../../../message/messageMeta';
import { cx } from '../../runtime';
import { Dialog, DialogList } from '../controls';
import { useInfo } from '../infoContext';
import { invalidateConversationData } from '../infoData';

/** 邀请好友入群：列出还不在群里的好友，可多选。 */
export function InviteDialog(): JSX.Element {
  const { conversation, currentUser, members, friends, notify, closeDialog, canManage } = useInfo();
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  // 409 group_full：群满员了，提示后面带「去升级」（群主 / 管理员）
  const [fullText, setFullText] = useState<string | null>(null);

  const inviteMutation = useMutation({
    mutationFn: (memberIds: number[]) => addConversationMembers(conversation.id, memberIds),
    onSuccess: () => {
      closeDialog();
      notify('');
      invalidateConversationData(queryClient, conversation.id);
    },
    onError: (error) => {
      if (groupPlusErrorCode(error) === 'group_full') {
        setFullText(error.message || '群人数已经达到上限，不能再邀请新成员了。');
        return;
      }
      notify('邀请失败，请稍后重试。', 'error');
    }
  });

  const memberIds = new Set(members.map(memberUserId));
  const candidates: User[] = [];
  const seenIds = new Set<number>();
  for (const friendship of friends) {
    const user = friendshipUser(friendship);
    if (!user?.id || user.id === currentUser.id || memberIds.has(user.id) || seenIds.has(user.id)) {
      continue;
    }
    seenIds.add(user.id);
    candidates.push(user);
  }

  return (
    <Dialog title="邀请好友" onClose={closeDialog} footer={(
      <>
        <button type="button" className="kui-btn" onClick={closeDialog}>取消</button>
        <button type="button" className="kui-btn kui-btn--primary" disabled={selectedIds.length === 0 || inviteMutation.isPending} onClick={() => inviteMutation.mutate(selectedIds)}>
          {inviteMutation.isPending ? '邀请中…' : selectedIds.length > 0 ? `邀请 ${selectedIds.length} 人` : '邀请'}
        </button>
      </>
    )}>
      {fullText ? (
        <p className="kui-note kui-note--warn" role="alert" data-plus="group-full">
          {fullText}
          {canManage ? <button type="button" className="kgp-upsell" onClick={() => {
            closeDialog();
            useGroupPlusUi.getState().openUpgrade({ conversationId: conversation.id, reason: 'members' });
          }}><Icon name="sparkles" className="h-3.5 w-3.5" />去升级</button> : null}
        </p>
      ) : null}
      <DialogList empty={candidates.length === 0 ? '暂无可邀请的好友。' : null}>
        {candidates.map((friend) => {
          const selected = selectedIds.includes(friend.id);
          return (
            <button key={friend.id} type="button" aria-pressed={selected} className={cx('kci-item', selected && 'is-selected')} onClick={() => setSelectedIds((current) => (selected ? current.filter((id) => id !== friend.id) : [...current, friend.id]))}>
              <Avatar user={friend} size="sm" />
              <span className="kci-item-text">
                <span>{getDisplayName(friend, `用户 ${friend.id}`)}</span>
                <span>{friend.email || friend.username}</span>
              </span>
              <span className="kci-check">{selected ? <Icon name="check" className="h-3 w-3" /> : null}</span>
            </button>
          );
        })}
      </DialogList>
    </Dialog>
  );
}
