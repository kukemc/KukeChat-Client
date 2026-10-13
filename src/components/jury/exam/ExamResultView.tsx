import { useState } from 'react';
import { cx } from '@/components/chat/desktop/runtime';
import { Icon } from '@/components/ui/Icon';
import type { JuryExamQuestion, JuryExamResult } from '@/types/juryGrowth';
import { useJury } from '../context';
import { formatDateTime, formatRemaining, voteLabel } from '../labels';
import { StandardAnswer } from '../practice/Ballots';
import { Ring } from '../widgets/Charts';
import { CaseEvidence } from '../widgets/Evidence';
import { Card } from '../widgets/Frame';
import { APPLY_OUTLOOK_TEXT, applyOutlook } from './outlook';

/** 一道题的对照：你的判断、对没对、标准结论和讲解；可以展开再看一遍题目。 */
function ReviewItem({ result, question }: { result: JuryExamResult['results'][number]; question: JuryExamQuestion | undefined }): JSX.Element {
  const { config } = useJury();
  const [open, setOpen] = useState(false);
  return (
    <li className={cx('kjr-exam-review', result.correct ? 'is-right' : 'is-wrong')} data-exam-result={result.question} data-correct={result.correct}>
      <span className="kjr-exam-review-no">{result.question}</span>
      <div className="kjr-exam-review-main">
        <p className="kjr-exam-review-line">
          <span className={cx('kjr-exam-review-mark', result.correct ? 'is-right' : 'is-wrong')}><Icon name={result.correct ? 'check' : 'close'} className="h-3.5 w-3.5" />{result.correct ? '答对' : '答错'}</span>
          <span className="kjr-meta">你的判断</span>
          {result.your_vote ? <span className="kui-tag">{voteLabel(result.your_vote)}</span> : <span className="kui-tag kui-tag--warn">未作答</span>}
          {question ? <button type="button" className="kui-link" aria-expanded={open} onClick={() => setOpen((value) => !value)}>{open ? '收起题目' : '再看一遍题目'}</button> : null}
        </p>
        <div className="kjr-exam-review-answer"><span className="kjr-meta">标准结论</span><StandardAnswer answer={result.answer} compact /></div>
        {open && question ? <div className="kjr-exam-review-content"><CaseEvidence view={{ ...question, case_id: question.question }} contextNear={config.config.rules.context_near} /></div> : null}
      </div>
    </li>
  );
}

/**
 * 交卷之后：分数、过没过、接下来做什么，然后逐题对照标准结论和讲解。
 * 题目内容只在刚交卷的这一次看得到（服务端不再给），所以离开前提醒一句。
 */
export function ExamResultView({ result, questions, auto = false, onDone }: { result: JuryExamResult; questions: JuryExamQuestion[]; /** 到时间自动交的卷 */ auto?: boolean; onDone: () => void }): JSX.Element {
  const { config, nav, identity } = useJury();
  const appointed = result.passed && result.status.status === 'active';
  const applied = result.status.status === 'applied';
  const wait = formatRemaining(result.next_attempt_at);
  const wrong = result.results.filter((item) => !item.correct).length;

  return (
    <>
      <Card className={cx('kjr-exam-score', result.passed ? 'is-pass' : 'is-fail')}>
        <div className="kjr-exam-score-main" data-exam-passed={result.passed}>
          <Ring value={result.total > 0 ? result.score / result.total : 0} size={84}><b>{result.score}</b><small>/ {result.total}</small></Ring>
          <div>
            <p className="kjr-me-headline">{result.passed ? '通过了入门考试' : '这次没有通过'}</p>
            <p className="kjr-me-text">
              {result.passed
                ? appointed ? `答对 ${result.score} 题，达到通过线（${result.pass_score} 题）。你已经成为见习委员，可以开始评审了。`
                  : applied ? `答对 ${result.score} 题，达到通过线（${result.pass_score} 题）。你的申请正在等待管理员审批，成绩会附在申请里。`
                  : `答对 ${result.score} 题，达到通过线（${result.pass_score} 题）。考试通过不会自动提交申请 —— 下一步是去提交申请：${APPLY_OUTLOOK_TEXT[applyOutlook(result.status.status, config.config.switches.auto_appoint, true)]}。`
                : `答对 ${result.score} 题，通过线是 ${result.pass_score} 题。${result.attempts_left > 0 ? `还可以再考 ${result.attempts_left} 次${wait ? `，${wait}后可以重考（${formatDateTime(result.next_attempt_at)}）` : ''}。` : `这一轮的考试机会已经用完${result.next_attempt_at ? `，${formatDateTime(result.next_attempt_at)} 之后可以再考` : ''}。`}`}
            </p>
          </div>
        </div>
        {auto ? <p className="kui-note kui-note--warn kjr-exam-auto" data-exam-auto>考试时间到了，系统自动提交了你当时已有的答案；没来得及作答的题按答错算。</p> : null}
        <div className="kjr-card-actions">
          <span className="kjr-meta">{wrong > 0 ? `下面是 ${wrong} 道答错的题和全部标准结论。题目内容只在这一次能回看。` : '全部答对。下面是每道题的标准结论。'}</span>
          <span className="kjr-btn-row">
            <button type="button" className="kui-btn" data-action="exam-done" onClick={onDone}>返回考试说明</button>
            {appointed ? <button type="button" className="kui-btn kui-btn--primary" data-action="exam-to-desk" onClick={() => nav.goSection('desk')}>进入评审台</button>
              : result.passed && identity.canApply ? <button type="button" className="kui-btn kui-btn--primary" data-action="exam-to-apply" onClick={() => nav.goSection('overview')}>继续提交申请</button>
              : !result.passed && config.has('practice') ? <button type="button" className="kui-btn kui-btn--primary" data-action="exam-to-practice" onClick={() => nav.goSection('practice')}>去练习场练练</button>
              : null}
          </span>
        </div>
      </Card>
      <Card title="逐题对照" aside={<span className="kjr-meta">只按「违规 / 不违规」计分；等级和类别供对照</span>}>
        <ol className="kjr-exam-reviews">
          {result.results.map((item) => <ReviewItem key={item.question} result={item} question={questions.find((entry) => entry.question === item.question)} />)}
        </ol>
      </Card>
    </>
  );
}
