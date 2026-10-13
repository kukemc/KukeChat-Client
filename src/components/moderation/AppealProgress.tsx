import type { ViolationRead } from '@/types/moderation';

type StepState = 'done' | 'current' | 'todo';

const RESULT_TEXT: Record<string, { label: string; text: string }> = {
  upheld: { label: '维持原处罚', text: '申诉没有通过，违规记录、记分和处罚都保持不变。' },
  reduced: { label: '已减轻', text: '违规记录和记分保留，这条处罚带来的禁言 / 封禁已经解除。' },
  revoked: { label: '已撤销', text: '这条处罚和它的记分已经撤销。' }
};

const DECIDER: Record<string, string> = { senior: '资深委员复审', admin: '管理员' };

/**
 * 一条处罚的申诉走到了哪一步：已提交 → 资深委员复审 / 管理员处理 → 结果，以及是谁裁决的（docs/jury-v2.md 3.2）。
 * 旧后端没有 appeal_stage / appeal_result / appeal_decided_by 这三个字段，这时什么都不显示，界面和以前一样。
 */
export function AppealProgress({ violation }: { violation: ViolationRead }): JSX.Element | null {
  const { appeal_status: status, appeal_stage: stage, appeal_result: result, appeal_decided_by: decidedBy } = violation;
  if (status === 'none' || (stage === undefined && result === undefined && decidedBy === undefined)) {
    return null;
  }
  const outcome = result ? RESULT_TEXT[result] ?? { label: result, text: '' } : null;
  // 中间那一步是谁：出了结果看是谁裁决的，没出结果看现在在谁手上
  const handler = (outcome ? decidedBy : stage) === 'senior' ? 'senior' : 'admin';
  const steps: Array<{ key: string; label: string; state: StepState }> = [
    { key: 'submitted', label: '已提交', state: 'done' },
    { key: handler, label: handler === 'senior' ? (outcome ? '资深委员复审' : '资深委员复审中') : outcome ? '管理员处理' : '已转管理员', state: outcome ? 'done' : 'current' },
    { key: 'result', label: outcome ? outcome.label : '结果', state: outcome ? 'done' : 'todo' }
  ];

  return (
    <div className="kcm-appeal" data-appeal-stage={outcome ? 'decided' : stage ?? 'pending'} data-appeal-result={result ?? ''}>
      <ol className="kcm-appeal-steps" aria-label="申诉进度">
        {steps.map((step) => <li key={step.key} className={`is-${step.state}`} aria-current={step.state === 'current' ? 'step' : undefined}><i aria-hidden="true" /><span>{step.label}</span></li>)}
      </ol>
      <p className="kcm-meta">
        {outcome ? <>由<b>{DECIDER[decidedBy ?? ''] ?? '管理员'}</b>裁决：{outcome.label}。{outcome.text}{decidedBy === 'senior' ? '管理员仍然可以复核这个结果。' : ''}</>
          : stage === 'senior' ? '你的申诉先由几位资深风纪委员复审：他们看到的是匿名的内容和你写的理由，不知道你是谁。出结果后会通知你，管理员仍然可以复核。'
          // appeal_stage 变成 admin：这类处罚本来就由管理员处理，或者资深复审没能在时限内出结果（凑不齐人、超时）转了过来
          : '你的申诉已转给管理员处理：有些处罚只由管理员复核，资深委员没能在时限内给出结果的也会转过来。有结果会通知你。'}
      </p>
      {violation.appeal_note ? <p className="kcm-quote">{violation.appeal_note}</p> : null}
    </div>
  );
}
