import type { JuryStatus } from '@/types/jury';
import type { JuryExamSummary } from '@/types/juryGrowth';
import { useJury } from '../context';
import { formatDateTime, formatRemaining } from '../labels';
import { examAvailability } from './ExamHome';
import { APPLY_OUTLOOK_TEXT, applyOutlook } from './outlook';

/** 申请流程里要不要出现「入门考试」这一步：后端有考试、/jury/me 带了考试摘要；续任时只有考试是硬条件才出现。 */
export function examStepFor(status: JuryStatus, hasExam: boolean, renewing: boolean): JuryExamSummary | null {
  if (!hasExam || !status.exam) {
    return null;
  }
  return renewing && !status.exam_required && !status.exam.passed ? null : status.exam;
}

/** 这一步算不算完成：通过了，或者考试不是硬条件（此时这一步只是建议，不挡后面的提交）。 */
export function examStepBlocks(status: JuryStatus, exam: JuryExamSummary | null): boolean {
  return Boolean(exam && status.exam_required && !exam.passed);
}

/**
 * 申请流程里的「入门考试」一步：只说现在的状态，考试本身在「规则手册 · 入门考试」里进行。
 * 考试默认不是硬条件（exam_required 为 false）：不考也能提交申请，这一步如实写成「建议」。
 */
export function ExamStep({ status, exam }: { status: JuryStatus; exam: JuryExamSummary }): JSX.Element {
  const { config, nav, identity } = useJury();
  const required = Boolean(status.exam_required);
  const autoAppoint = config.config.switches.auto_appoint;
  // 通过之后再申请会怎样：自动任命只对没有成员记录的人生效，有过记录的仍进审批队列
  const outlook = applyOutlook(identity.membership, autoAppoint, true);
  const state = examAvailability({ ...exam, eligible: status.eligible });
  const left = Math.max(0, exam.attempts_max - exam.attempts_used);
  const wait = formatRemaining(exam.next_attempt_at);
  const openExam = (): void => nav.goSection('handbook', { tab: 'exam' });

  return (
    <div className="kjr-exam-step-body" data-exam-step={state}>
      <p className="kjr-meta">
        {state === 'passed' ? `已通过${exam.last_score !== null ? ` · ${exam.last_score} / ${exam.total}` : ''}${exam.passed_at ? ` · ${formatDateTime(exam.passed_at)}` : ''}。${outlook === 'review' ? '申请里会附上这次的成绩。' : `${APPLY_OUTLOOK_TEXT[outlook]}。`}`
          : state === 'ineligible' ? '满足上面的条件后可以参加考试。'
          : state === 'unavailable' ? `题库还在准备，暂时不能考试。${required ? '考试开放后才能提交申请。' : '不影响申请，可以直接进行下一步。'}`
          : state === 'exhausted' ? `考试机会已经用完${exam.next_attempt_at ? `，${formatDateTime(exam.next_attempt_at)} 之后可以再考` : ''}。${required ? '' : '不影响申请，可以直接进行下一步。'}`
          : state === 'cooldown' ? `上次答对 ${exam.last_score ?? 0} / ${exam.total}，没有通过。${wait ? `${wait}后` : '稍后'}可以重考，还剩 ${left} 次。${required ? '' : '不影响申请，可以直接进行下一步。'}`
          : `${exam.total} 道题，答对 ${exam.pass_score} 题通过。${required ? '通过后才能提交申请。' : outlook === 'appoint' ? '不是必须的；通过后再申请可以直接任命为见习委员，不考则由管理员审批。' : '不是必须的；通过后申请里会附上成绩，没考的会标注「未考试」。'}`}
      </p>
      {state === 'passed' || state === 'ineligible' ? null : (
        <button type="button" className="kui-btn kui-btn--sm" data-action="open-exam" onClick={openExam}>{state === 'ready' ? '去考试' : '查看考试说明'}</button>
      )}
    </div>
  );
}
