import type { TaskCreationPermission } from '@/types/api';
import type { SelectOption } from '../../info/shared';
import { Section, SegmentRow, SwitchRow } from './controls';
import { useInfo } from './infoContext';
import { useDraft, useGroupSettings } from './infoData';

const permissionOptions: Array<SelectOption<TaskCreationPermission>> = [
  { value: 'members', label: '全部成员' },
  { value: 'admins', label: '仅管理员' }
];

/** 群任务：功能开关，以及谁可以创建任务。 */
export function TasksSection(): JSX.Element {
  const { conversation } = useInfo();
  const settings = useGroupSettings();
  const serverEnabled = Boolean(conversation.tasks_enabled);
  const serverPermission = conversation.task_creation_permission ?? 'members';
  const [enabled, setEnabled] = useDraft(serverEnabled);
  const [permission, setPermission] = useDraft(serverPermission);

  return (
    <Section title="任务">
      <SwitchRow label="开启任务功能" checked={enabled} disabled={settings.pending} onChange={(next) => {
        setEnabled(next);
        settings.save({ tasks_enabled: next }, () => setEnabled(serverEnabled));
      }} />
      {enabled ? (
        <SegmentRow label="谁可以创建任务" value={permission} options={permissionOptions} disabled={settings.pending} onChange={(next) => {
          setPermission(next);
          settings.save({ task_creation_permission: next }, () => setPermission(serverPermission));
        }} />
      ) : null}
    </Section>
  );
}
