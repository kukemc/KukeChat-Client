import { EditableRow, Section, SwitchRow } from './controls';
import { useInfo } from './infoContext';
import { useDraft, useMySettings } from './infoData';

/** 只影响我自己的会话设置：置顶、免打扰；私聊里还有好友备注。 */
export function MySettingsSection(): JSX.Element {
  const { conversation, currentMember, isGroup } = useInfo();
  const settings = useMySettings();
  const serverPinned = Boolean(currentMember?.pinned);
  const serverMuted = Boolean(currentMember?.do_not_disturb);
  const [pinned, setPinned] = useDraft(serverPinned);
  const [muted, setMuted] = useDraft(serverMuted);

  return (
    <Section title={isGroup ? '我的设置' : undefined}>
      {isGroup ? null : conversation.is_friend
        ? <EditableRow label="好友备注" value={currentMember?.remark ?? ''} onSave={(remark) => settings.save({ remark })} />
        : <p className="kci-hint">你们还不是好友。可以在临时会话顶部或资料卡里发送好友申请。</p>}
      <SwitchRow label="设为置顶" checked={pinned} disabled={settings.pending} onChange={(next) => {
        setPinned(next);
        settings.save({ pinned: next }, () => setPinned(serverPinned));
      }} />
      <SwitchRow label="消息免打扰" checked={muted} disabled={settings.pending} onChange={(next) => {
        setMuted(next);
        settings.save({ do_not_disturb: next, message_setting: next ? 'silent' : 'notify' }, () => setMuted(serverMuted));
      }} />
    </Section>
  );
}
