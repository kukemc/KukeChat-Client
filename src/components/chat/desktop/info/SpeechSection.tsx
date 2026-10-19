import { slowModeOptions } from '../../info/shared';
import type { TypingIndicatorMode } from '@/types/api';
import { typingIndicatorHint, typingIndicatorMode, typingIndicatorOptions } from '../../info/typingIndicator';
import { Section, SegmentRow, SelectRow, SwitchRow } from './controls';
import { useInfo } from './infoContext';
import { useDraft, useGroupSettings } from './infoData';

/** 发言权限：全员禁言、发言限频，以及群里显不显示「正在输入」。 */
export function SpeechSection(): JSX.Element {
  const { conversation, memberCount } = useInfo();
  const settings = useGroupSettings();
  const serverAllMuted = Boolean(conversation.all_muted);
  const serverRateLimit = String(conversation.message_rate_limit_per_minute ?? 0);
  const [allMuted, setAllMuted] = useDraft(serverAllMuted);
  const [rateLimit, setRateLimit] = useDraft(serverRateLimit);
  const serverTyping = typingIndicatorMode(conversation);
  const [typing, setTyping] = useDraft<TypingIndicatorMode>(serverTyping);

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
      <SegmentRow label="显示正在输入" hint={typingIndicatorHint(typing, memberCount)} value={typing} options={typingIndicatorOptions} disabled={settings.pending} onChange={(next) => {
        setTyping(next);
        settings.save({ typing_indicator: next }, () => setTyping(serverTyping));
      }} />
    </Section>
  );
}
