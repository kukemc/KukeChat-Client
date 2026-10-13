import { slowModeOptions } from '../../info/shared';
import { Section, SelectRow, SwitchRow } from './controls';
import { useInfo } from './infoContext';
import { useDraft, useGroupSettings } from './infoData';

/** 发言权限：全员禁言和发言限频。 */
export function SpeechSection(): JSX.Element {
  const { conversation } = useInfo();
  const settings = useGroupSettings();
  const serverAllMuted = Boolean(conversation.all_muted);
  const serverRateLimit = String(conversation.message_rate_limit_per_minute ?? 0);
  const [allMuted, setAllMuted] = useDraft(serverAllMuted);
  const [rateLimit, setRateLimit] = useDraft(serverRateLimit);

  return (
    <Section title="发言权限">
      <SwitchRow label="全员禁言" checked={allMuted} disabled={settings.pending} onChange={(next) => {
        setAllMuted(next);
        settings.save({ all_muted: next }, () => setAllMuted(serverAllMuted));
      }} />
      <SelectRow label="发言限频" value={rateLimit} options={slowModeOptions} disabled={settings.pending} onChange={(next) => {
        setRateLimit(next);
        settings.save({ message_rate_limit_per_minute: Number(next) }, () => setRateLimit(serverRateLimit));
      }} />
    </Section>
  );
}
