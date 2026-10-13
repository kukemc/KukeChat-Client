import { useState } from 'react';
import { cx } from '@/components/chat/desktop/runtime';
import type { JuryExamState } from '@/types/juryGrowth';
import { parseApiDate } from '@/utils/dateTime';
import { useJury } from '../context';
import { formatDateTime, formatRemaining } from '../labels';
import { Card } from '../widgets/Frame';
import { examNow } from './clock';
import { APPLY_OUTLOOK_TEXT, applyOutlook } from './outlook';

export type ExamAvailability = 'passed' | 'ineligible' | 'unavailable' | 'exhausted' | 'cooldown' | 'ready';

/** 现在能不能考。顺序有讲究：先说「你」的情况（已通过、不满足条件），再说题库和次数。 */
export function examAvailability(exam: Pick<JuryExamState, 'passed' | 'available' | 'attempts_used' | 'attempts_max' | 'next_attempt_at'> & { eligible?: boolean }): ExamAvailability {
  if (exam.passed) return 'passed';
  if (exam.eligible === false) return 'ineligible';
  if (!exam.available) return 'unavailable';
  if (exam.attempts_used >= exam.attempts_max) return 'exhausted';
  const next = parseApiDate(exam.next_attempt_at)?.getTime() ?? NaN;
  if (Number.isFinite(next) && next > examNow()) return 'cooldown';
  return 'ready';
}

const HEADLINE: Record<ExamAvailability, string> = {
  passed: '你已经通过入门考试',
  ineligible: '满足申请条件后才能参加考试',
  unavailable: '题库还在准备，暂时不能考试',
  exhausted: '这一轮的考试机会用完了',
  cooldown: '还要等一会儿才能重考',
  ready: '准备好了就可以开始'
};

/** 入门考试的说明页：现在是什么状态、能做什么，考试的规则，上一次的成绩。数字全部来自接口和配置。 */
export function ExamHome({ exam, closed, starting, startError, onStart }: { exam: JuryExamState; /** 上一场是怎么结束的：超时作废 / 场次不存在；正常情况为 null */ closed: 'closed' | 'elsewhere' | 'missing' | null; starting: boolean; startError: string | null; onStart: () => void }): JSX.Element {
  const { status, identity, config, nav } = useJury();
  const [armed, setArmed] = useState(false);
  const state = examAvailability(exam);
  const rules = config.config.exam;
  const required = Boolean(status?.exam_required);
  const autoAppoint = config.config.switches.auto_appoint;
  const practiceOpen = config.has('practice');
  const left = Math.max(0, exam.attempts_max - exam.attempts_used);
  const wait = formatRemaining(exam.next_attempt_at);
  const passedAt = parseApiDate(exam.passed_at);
  const validUntil = passedAt && rules?.valid_days ? new Date(passedAt.getTime() + rules.valid_days * 86_400_000).toISOString() : null;

  const text = state === 'passed'
    ? `通过时间 ${formatDateTime(exam.passed_at)}${validUntil ? `，成绩有效期到 ${formatDateTime(validUntil)}` : ''}。${identity.isJuror ? '你已经是在任委员。' : identity.membership === 'applied' ? '你的申请正在等待管理员审批。' : identity.canApply ? `考试通过不会自动提交申请，下一步是去提交申请：${APPLY_OUTLOOK_TEXT[applyOutlook(identity.membership, autoAppoint, true)]}。` : ''}`
    : state === 'ineligible' ? '入门考试面向满足风纪委员申请条件的用户。还差哪些条件，可以在「总览」里看到。'
    : state === 'unavailable' ? `考试的题目来自已经核对过结论的真实案例。风纪委员会刚成立，核对过的题目还不够组成一套 ${exam.total} 题的试卷，所以考试暂时开不了；题库够了之后这里会直接变成可以开始。${required ? '考试开放之前暂时无法提交申请。' : '在这之前不影响申请：现在申请不需要先通过考试。'}`
    : state === 'exhausted' ? `${exam.window_days} 天内最多可以考 ${exam.attempts_max} 次，你已经用完了。${exam.next_attempt_at ? `${formatDateTime(exam.next_attempt_at)} 之后可以再考。` : '过一段时间次数会恢复。'}`
    : state === 'cooldown' ? `上一次没有通过。${wait ? `${wait}后` : '稍后'}可以重考（${formatDateTime(exam.next_attempt_at)}），还剩 ${left} 次机会。${practiceOpen ? '这段时间可以去练习场找找感觉。' : ''}`
    : `${exam.total} 道题，判断每条内容「违规 / 不违规」，答对 ${exam.pass_score} 题通过，限时 ${exam.time_limit_minutes} 分钟。建议先读一遍规则手册${practiceOpen ? '，在练习场做几题热热身' : ''}。`;

  return (
    <>
      <Card title="入门考试" aside={<span className={cx('kui-tag', state === 'passed' ? 'kui-tag--ok' : state === 'ready' ? 'kui-tag--accent' : state === 'ineligible' || state === 'unavailable' ? '' : 'kui-tag--warn')}>{state === 'passed' ? '已通过' : state === 'ready' ? '可以开始' : state === 'unavailable' ? '暂未开放' : state === 'ineligible' ? '条件未满足' : state === 'cooldown' ? '等待重考' : '次数已用完'}</span>} className="kjr-me kjr-exam-home">
        <div data-exam-state={state}>
          <p className="kjr-me-headline">{HEADLINE[state]}</p>
          <p className="kjr-me-text">{text}</p>
        </div>
        {closed === 'closed' ? <p className="kui-note kui-note--warn" role="status" data-exam-ended="closed">上一场考试已经结束：超过时间没有交卷，按未通过记了一次。</p> : null}
        {closed === 'elsewhere' ? <p className="kui-note kui-note--warn" role="status" data-exam-ended="elsewhere">这一场考试已经在别处交过卷了（比如另一个窗口或另一台设备），这里存的答案没有再提交。成绩以这一页显示的为准。</p> : null}
        {closed === 'missing' ? <p className="kui-note kui-note--warn" role="status" data-exam-ended="missing">刚才那一场考试在服务端找不到了（可能换过账号，或者这一场已被清除），这台设备上存的答案已经清掉。考试次数以上面显示的为准，需要的话可以重新开始。</p> : null}
        <dl className="kjr-facts">
          <div><dt>题数</dt><dd>{exam.total} 题</dd></div>
          <div><dt>通过线</dt><dd>答对 {exam.pass_score} 题</dd></div>
          <div><dt>限时</dt><dd>{exam.time_limit_minutes} 分钟</dd></div>
          <div><dt>考试机会</dt><dd>已用 {exam.attempts_used} / {exam.attempts_max} 次<small>{exam.window_days} 天内</small></dd></div>
        </dl>
        {startError ? <p className="kui-note kui-note--danger" role="alert">{startError}</p> : null}
        <div className="kjr-card-actions">
          {state === 'ready' && armed ? (
            <>
              <span className="kjr-meta">开始后立刻计时 {exam.time_limit_minutes} 分钟，中途不能暂停，会用掉 1 次机会（还剩 {left} 次）。</span>
              <span className="kjr-btn-row">
                <button type="button" className="kui-btn" disabled={starting} onClick={() => setArmed(false)}>再准备一下</button>
                <button type="button" className="kui-btn kui-btn--primary" data-action="exam-start-confirm" disabled={starting} onClick={onStart}>{starting ? '正在出题…' : '开始计时'}</button>
              </span>
            </>
          ) : (
            <>
              <span className="kjr-meta">
                {state === 'ready' ? `还剩 ${left} 次机会。没通过的话 ${rules?.retry_hours ?? 24} 小时后可以重考。`
                  : state === 'passed' ? '考试只需要通过一次。'
                  : state === 'unavailable' ? '练习场的题目不受这个限制，随时可以练。'
                  : ''}
              </span>
              <span className="kjr-btn-row">
                {practiceOpen && state !== 'ineligible' ? <button type="button" className="kui-btn" data-action="exam-to-practice" onClick={() => nav.goSection('practice')}>去练习场</button> : null}
                {state === 'ready' ? <button type="button" className="kui-btn kui-btn--primary" data-action="exam-start" onClick={() => setArmed(true)}>开始考试</button> : null}
                {state === 'ineligible' ? <button type="button" className="kui-btn kui-btn--primary" onClick={() => nav.goSection('overview')}>查看申请条件</button> : null}
                {(state === 'passed' && identity.canApply) || (state === 'unavailable' && identity.canApply && !required) ? <button type="button" className="kui-btn kui-btn--primary" data-action="exam-to-apply" onClick={() => nav.goSection('overview')}>{state === 'passed' ? '继续提交申请' : '直接去申请'}</button> : null}
              </span>
            </>
          )}
        </div>
      </Card>

      {exam.last_result ? (
        <Card title="上一次的成绩" aside={<span className="kjr-meta">{formatDateTime(exam.last_result.submitted_at)}</span>}>
          <p className="kjr-exam-last" data-exam-last={exam.last_result.score}>
            <strong>{exam.last_result.score}<small>/ {exam.total}</small></strong>
            <span className={cx('kui-tag', exam.last_result.passed ? 'kui-tag--ok' : 'kui-tag--danger')}>{exam.last_result.passed ? '通过' : '未通过'}</span>
            <span className="kjr-meta">通过线 {exam.pass_score} 题。逐题的标准结论只在交卷当时展示。</span>
          </p>
        </Card>
      ) : null}

      <Card title="考试规则">
        <dl className="kjr-guide">
          <div><dt>题目</dt><dd>从题库里抽 {exam.total} 道已经核对过结论的真实案例，内容和评审台里一样做了匿名处理。公示栏里看得到内容的案件不会出成考题。</dd></div>
          <div><dt>计分</dt><dd>只看「违规 / 不违规」判断得对不对，答对 {exam.pass_score} 题及以上通过。违规等级不计分，交卷后会给出标准等级和讲解供你对照。</dd></div>
          <div><dt>时间</dt><dd>限时 {exam.time_limit_minutes} 分钟，开始后不能暂停，离开页面也照样计时。剩 5 分钟、1 分钟时会提醒；到时间自动交卷，没作答的题按答错算。</dd></div>
          <div><dt>作答</dt><dd>一次性交卷，交卷前可以回头改任何一题。选过的答案只存在这台设备上，中途离开再回来能接着答；换一台设备不会带过去。</dd></div>
          <div><dt>没通过</dt><dd>{rules ? `${rules.retry_hours} 小时后可以重考，` : ''}{exam.window_days} 天内最多考 {exam.attempts_max} 次。超时没交卷也算一次。</dd></div>
          <div><dt>通过之后</dt><dd>{rules?.valid_days ? `成绩 ${rules.valid_days} 天内有效，期间没有被任命的话需要重考。` : ''}通过不会自动提交申请：{autoAppoint ? '去「总览」提交申请——第一次申请的会直接任命为见习委员；之前被拒绝过、卸任过的仍由管理员审批。' : '去「总览」提交申请，由管理员审批，申请里会附上你的成绩。'}{required ? '现在申请成为委员必须先通过考试。' : '考试目前不是申请的硬条件 —— 不考也可以申请，只是申请里会标注「未考试」。'}</dd></div>
        </dl>
      </Card>
    </>
  );
}
