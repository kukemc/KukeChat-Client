import type { JoinMode } from '@/types/api';
import { joinModeOptions } from '../../info/shared';
import { EditableRow, Section, SelectRow, SwitchRow } from './controls';
import { useInfo } from './infoContext';
import { useDraft, useGroupSettings } from './infoData';

/** 加群设置：加群方式、入群问题、自动审批。 */
export function JoinSection(): JSX.Element {
  const { conversation, notify } = useInfo();
  const settings = useGroupSettings();
  const serverMode: JoinMode = conversation.join_mode ?? 'approval';
  const serverAutoApprove = Boolean(conversation.auto_approve);
  const [mode, setMode] = useDraft(serverMode);
  const [autoApprove, setAutoApprove] = useDraft(serverAutoApprove);
  // 问题可以先填好再切到「回答问题」，所以没切过去之前只留在本地
  const [question, setQuestion] = useDraft(conversation.join_question ?? '');
  const byQuestion = mode === 'question';

  function changeMode(next: JoinMode): void {
    const cleanQuestion = question.trim();
    if (next === 'question' && !cleanQuestion) {
      notify('请先填写加群问题。', 'error');
      return;
    }
    setMode(next);
    if (next === 'question') {
      setAutoApprove(false);
    }
    // 「回答问题」与自动审批互斥，切过去时一并关掉；切走时把问题清空
    settings.save({ join_mode: next, join_question: next === 'question' ? cleanQuestion : null, auto_approve: next === 'question' ? false : autoApprove }, () => {
      setMode(serverMode);
      setAutoApprove(serverAutoApprove);
    });
  }

  return (
    <Section title="加群设置">
      <SelectRow label="加群方式" value={mode} options={joinModeOptions} disabled={settings.pending} onChange={changeMode} />
      <EditableRow label="加群问题" value={question} placeholder="例如：你的班级/暗号？" disabled={settings.pending} onSave={(next) => {
        setQuestion(next);
        if (byQuestion) {
          settings.save({ join_question: next });
        }
      }} />
      <SwitchRow label="加群自动审批" hint={byQuestion ? '「回答问题」方式下不可用' : undefined} checked={byQuestion ? false : autoApprove} disabled={settings.pending || byQuestion} onChange={(next) => {
        setAutoApprove(next);
        settings.save({ auto_approve: next }, () => setAutoApprove(serverAutoApprove));
      }} />
    </Section>
  );
}
