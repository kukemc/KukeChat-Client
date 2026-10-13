import { MAX_GROUP_EMOJIS } from '@/api/groupEmojis';
import { useGroupEmojis } from '../emojis/useGroupEmojis';
import { ActionRow, Section } from './controls';
import { useInfo } from './infoContext';

/** 群表情：全体成员都能点开看，群主和管理员在里面维护。 */
export function GroupEmojiSection(): JSX.Element {
  const { conversation, canManage, openDialog } = useInfo();
  const emojis = useGroupEmojis(conversation.id).data;

  return (
    <Section title="群表情">
      <ActionRow label={canManage ? '管理表情' : '查看表情'} value={emojis ? `${emojis.length} / ${MAX_GROUP_EMOJIS}` : undefined} onClick={() => openDialog({ kind: 'groupEmojis' })} />
    </Section>
  );
}
