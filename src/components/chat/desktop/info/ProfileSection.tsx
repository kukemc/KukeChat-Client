import { truncateText } from '../../message/messageMeta';
import { ActionRow, EditableRow, Section } from './controls';
import { useInfo } from './infoContext';
import { useJoinRequests, useMySettings } from './infoData';

/** 群资料相关的入口：群资料设置、公告、入群申请（后两项仅管理员），以及我在本群的昵称和备注。 */
export function ProfileSection(): JSX.Element {
  const { conversation, currentMember, canManage, openDialog } = useInfo();
  const mySettings = useMySettings();
  const joinRequests = useJoinRequests();
  const announcement = conversation.announcement?.trim();

  return (
    <Section title={canManage ? '资料管理' : undefined}>
      {canManage ? <ActionRow label="群资料设置" onClick={() => openDialog({ kind: 'profile' })} /> : null}
      <ActionRow label="群公告" value={announcement ? truncateText(announcement, 40) : '暂无'} onClick={() => openDialog({ kind: 'announcements' })} />
      {canManage ? <ActionRow label="入群申请" value={joinRequests.pendingCount > 0 ? <span className="kui-badge">{joinRequests.pendingCount}</span> : '暂无待处理'} onClick={() => openDialog({ kind: 'joinRequests' })} /> : null}
      <EditableRow label="我的本群昵称" value={currentMember?.nickname ?? ''} onSave={(nickname) => mySettings.save({ nickname })} />
      <EditableRow label="群聊备注" value={currentMember?.remark ?? ''} onSave={(remark) => mySettings.save({ remark })} />
    </Section>
  );
}
