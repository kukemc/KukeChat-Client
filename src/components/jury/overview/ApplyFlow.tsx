import { useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { applyForJury } from '@/api/jury';
import { cx } from '@/components/chat/desktop/runtime';
import { Icon } from '@/components/ui/Icon';
import type { JuryStatus } from '@/types/jury';
import { useJury } from '../context';
import { APPLY_STATEMENT_MAX } from '../data/defaults';
import { errorText, juryKeys } from '../data/queries';
import { ExamStep, examStepBlocks, examStepFor } from '../exam/ExamStep';
import { APPLY_OUTLOOK_TEXT, applyOutlook } from '../exam/outlook';

interface ApplyStep {
  key: string;
  title: string;
  done: boolean;
  /** 没完成也不挡后面的步骤（不是硬条件的入门考试） */
  optional?: boolean;
  body: ReactNode;
}

function Requirements({ status }: { status: JuryStatus }): JSX.Element {
  return (
    <ul className="kjr-reqs">
      {status.requirements.map((item) => (
        <li key={item.key} className={item.ok ? 'is-ok' : 'is-missing'}>
          <Icon name={item.ok ? 'check' : 'close'} className="h-3.5 w-3.5" />
          <span>{item.text}</span>
          {item.detail ? <small>{item.detail}</small> : null}
        </li>
      ))}
    </ul>
  );
}

/**
 * 申请成为委员（或任期届满后续任）。
 *
 * 做成一串步骤：满足条件 →（后端有考试时）入门考试 → 提交。考试本身在「规则手册 · 入门考试」里进行，
 * 这里只显示它的状态；提交按钮的可用条件是「前面的硬性步骤都完成」。
 */
export function ApplyFlow({ status }: { status: JuryStatus }): JSX.Element {
  const { identity, config } = useJury();
  const queryClient = useQueryClient();
  const [statement, setStatement] = useState('');
  const apply = useMutation({
    mutationFn: () => applyForJury(identity.renewing ? undefined : statement.trim() || undefined),
    onSuccess: (next) => {
      queryClient.setQueryData(juryKeys.me, next);
      setStatement('');
      void queryClient.invalidateQueries({ queryKey: juryKeys.overview });
    }
  });
  const missing = status.requirements.filter((item) => !item.ok).length;
  const termDays = config.config.rules.term_days;

  const steps: ApplyStep[] = [
    { key: 'requirements', title: identity.renewing ? '续任条件' : '满足申请条件', done: status.eligible, body: <Requirements status={status} /> }
  ];
  // 二期：入门考试。默认不是硬条件（exam_required 为 false），这时它只是一步建议，不挡后面的提交
  const exam = examStepFor(status, config.has('exam'), identity.renewing);
  const examBlocks = examStepBlocks(status, exam);
  // 提交之后会怎样只是提示（自动任命只对没有成员记录的人生效）；提交完显示什么，以接口返回的状态为准
  const outlook = applyOutlook(identity.membership, config.config.switches.auto_appoint, Boolean(exam?.passed));
  if (exam) {
    steps.push({ key: 'exam', title: status.exam_required ? '通过入门考试' : '入门考试（建议）', done: exam.passed, optional: !status.exam_required, body: <ExamStep status={status} exam={exam} /> });
  }
  const ready = steps.every((step) => step.done || step.optional);
  steps.push({
    key: 'submit',
    title: identity.renewing ? '续任' : '提交申请',
    done: false,
    body: (
      <>
        {identity.renewing ? null : (
          <textarea className="kui-textarea kui-scroll" rows={3} value={statement} disabled={!ready} aria-label="申请陈述" onChange={(event) => setStatement(event.target.value.slice(0, APPLY_STATEMENT_MAX))} placeholder={`说说你为什么想当风纪委员（选填，最多 ${APPLY_STATEMENT_MAX} 字）`} />
        )}
        {apply.error ? <p className="kui-note kui-note--danger" role="alert">{errorText(apply.error, '申请提交失败，请稍后重试。')}</p> : null}
        <div className="kjr-apply-actions">
          <span className="kjr-meta">
            {missing > 0 ? `还有 ${missing} 项条件没满足，暂时不能申请。`
              : examBlocks ? '通过入门考试后才能提交申请。'
              : identity.renewing ? '条件仍然满足，续任后立即生效。'
              : outlook === 'appoint' ? `你已通过入门考试，${APPLY_OUTLOOK_TEXT.appoint}，任期 ${termDays} 天。`
              : outlook === 'review_record' ? `${APPLY_OUTLOOK_TEXT.review_record}，通过后任期 ${termDays} 天。`
              : `提交后由管理员审批，通过后任期 ${termDays} 天。`}
          </span>
          <button type="button" className="kui-btn kui-btn--primary" data-action="apply" disabled={!ready || apply.isPending} onClick={() => apply.mutate()}>{apply.isPending ? '提交中…' : identity.renewing ? '续任' : '申请加入'}</button>
        </div>
      </>
    )
  });

  return (
    <ol className="kjr-flow">
      {steps.map((step, index) => (
        <li key={step.key} className={cx(step.done && 'is-done')}>
          <span className="kjr-flow-mark">{step.done ? <Icon name="check" className="h-3 w-3" /> : index + 1}</span>
          <div className="kjr-flow-main">
            <p className="kjr-flow-title">{step.title}</p>
            {step.body}
          </div>
        </li>
      ))}
    </ol>
  );
}
