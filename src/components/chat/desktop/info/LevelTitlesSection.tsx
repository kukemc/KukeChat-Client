import { ActionRow, Section, SwitchRow } from './controls';
import { useInfo } from './infoContext';
import { useDraft, useGroupSettings } from './infoData';

/** 等级头衔：开关，以及各等级段叫什么。只有群主和管理员能看到这一块。 */
export function LevelTitlesSection(): JSX.Element {
  const { conversation, openDialog } = useInfo();
  const settings = useGroupSettings();
  const serverEnabled = Boolean(conversation.level_titles_enabled);
  const [enabled, setEnabled] = useDraft(serverEnabled);
  const tiers = conversation.level_titles ?? [];

  return (
    <Section title="等级头衔">
      <SwitchRow label="显示等级头衔" hint="开启后，成员昵称旁会显示所在等级段的头衔，比如「LV8 萌新」。" checked={enabled} disabled={settings.pending} onChange={(next) => {
        setEnabled(next);
        settings.save({ level_titles_enabled: next }, () => setEnabled(serverEnabled));
      }} />
      <ActionRow label="头衔分档" value={tiers.length > 0 ? tiers.map((tier) => tier.title).join(' · ') : '未设置'} onClick={() => openDialog({ kind: 'levelTitles' })} />
    </Section>
  );
}
