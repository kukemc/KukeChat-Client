import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { memberUserId } from '../../message/messageMeta';
import { Section } from './controls';
import { useInfo } from './infoContext';

const GRID_COLUMNS = 5;
const GRID_ROWS = 3;

/** 成员头像网格：只露前几位，完整名单在「查看全部」里。 */
export function MembersSection(): JSX.Element {
  const { members, membersLoading, memberCount, currentUser, canManage, showMembers, openDialog, openUser, openMemberMenu } = useInfo();
  // 管理员多出「邀请」「移除」两格，成员头像相应少放两个，凑满整行
  const visibleMembers = members.slice(0, GRID_COLUMNS * GRID_ROWS - (canManage ? 2 : 0));

  return (
    <Section title="群成员" action={<button type="button" className="kui-link" onClick={showMembers}>查看全部 {memberCount} 人</button>}>
      {membersLoading ? <p className="kci-hint">正在加载成员…</p> : (
        <div className="kci-members">
          {visibleMembers.map((member) => {
            const userId = memberUserId(member);
            const label = userId ? `用户 ${userId}` : '成员';
            const name = member.nickname?.trim() || getDisplayName(member.user, label);
            return (
              <button key={member.id} type="button" className="kci-member" title={name} onClick={(event) => openUser(event.currentTarget, member.user, label)} onContextMenu={(event) => openMemberMenu(event, member)}>
                <Avatar user={member.user} label={name} size="message" />
                <span className="kci-member-name">{userId === currentUser.id ? '我' : name}</span>
              </button>
            );
          })}
          {canManage ? (
            <>
              <button type="button" className="kci-member" onClick={() => openDialog({ kind: 'invite' })}>
                <span className="kci-member-slot"><Icon name="plus" className="h-4 w-4" /></span>
                <span className="kci-member-name">邀请</span>
              </button>
              <button type="button" className="kci-member" onClick={() => openDialog({ kind: 'remove' })}>
                <span className="kci-member-slot"><Icon name="minus" className="h-4 w-4" /></span>
                <span className="kci-member-name">移除</span>
              </button>
            </>
          ) : null}
        </div>
      )}
    </Section>
  );
}
