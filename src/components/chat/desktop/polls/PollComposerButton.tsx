import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { useMuteStatus } from '@/store/moderationStore';
import { CreatePollDialog } from './CreatePollDialog';

/** 输入框工具栏上的「发起投票」。被禁言时不能发起（但仍然可以给别人的投票投票）。 */
export function PollComposerButton({ conversationId, onCreated }: { conversationId: number; onCreated?: () => void }): JSX.Element {
  const { muted } = useMuteStatus();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="kcd-tool" title="发起投票" aria-label="发起投票" disabled={muted} onClick={() => setOpen(true)}><Icon name="poll" className="h-[18px] w-[18px]" /></button>
      {open ? <CreatePollDialog conversationId={conversationId} onCreated={onCreated} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
