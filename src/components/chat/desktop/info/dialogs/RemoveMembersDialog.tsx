import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { roleLabel } from '../../../info/shared';
import { memberUserId } from '../../../message/messageMeta';
import { Dialog, DialogList } from '../controls';
import { useInfo } from '../infoContext';

/** 移除成员：只列出我有权移出的人，逐个确认。 */
export function RemoveMembersDialog(): JSX.Element {
  const { members, memberActions, closeDialog } = useInfo();
  const removable = members.filter(memberActions.canRemove);

  return (
    <Dialog title="移除成员" onClose={closeDialog}>
      <DialogList empty={removable.length === 0 ? '暂无可移除的成员。' : null}>
        {removable.map((member) => {
          const userId = memberUserId(member);
          const name = member.nickname?.trim() || getDisplayName(member.user, userId ? `用户 ${userId}` : '成员');
          return (
            <div key={member.id} className="kci-item">
              <Avatar user={member.user} label={name} size="sm" />
              <span className="kci-item-text">
                <span>{name}</span>
                <span>{roleLabel(member.role)}</span>
              </span>
              <button type="button" className="kui-btn kui-btn--sm kui-btn--danger" disabled={memberActions.busy.remove} onClick={() => memberActions.remove(member)}>移除</button>
            </div>
          );
        })}
      </DialogList>
    </Dialog>
  );
}
