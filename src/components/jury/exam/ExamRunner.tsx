import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { submitJuryExam } from '@/api/juryGrowth';
import { cx } from '@/components/chat/desktop/runtime';
import { Icon } from '@/components/ui/Icon';
import type { JuryBallot, JuryExamAttempt, JuryExamClosedReason, JuryExamResult } from '@/types/juryGrowth';
import { parseApiDate } from '@/utils/dateTime';
import { useJury } from '../context';
import { errorField } from '../data/growth';
import { errorCode, errorText } from '../data/queries';
import { ballotOptions, formatCountdown } from '../growth/labels';
import { KIND_LABEL } from '../labels';
import { BallotList, QuestionReasons } from '../practice/Ballots';
import { CaseEvidence } from '../widgets/Evidence';
import { SectionFrame } from '../widgets/Frame';
import { examNow, useExamNow } from './clock';
import { draftToAnswers, readExamDraft, writeExamDraft, type ExamDraft } from './draft';
import { modKeyLabel } from '@/utils/platform';

/**
 * 到时间怎么办（docs/jury-v2.md 2.3）：没答完也可以交，没作答的题按答错算；过了 expires_at 还有一小段宽限。
 * 所以在到点之前就把已有的答案自动交上去 —— 留出一次网络往返的余量，宽限期只当保险。
 * 自动交卷前先给一段看得见的倒数，不让人觉得被偷偷交了卷。要改策略只动这几个数。
 */
const AUTO_SUBMIT = {
  /** 离 expires_at 还有多久时自动交卷（网络往返的余量） */
  leadMs: 8_000,
  /** 自动交卷前，倒数显示多久 */
  noticeMs: 30_000
};
const WARN_MS = 5 * 60_000;
const LAST_MS = 60_000;

/** 考试进行中：左边是当前这道题的匿名内容，右边是题号、判断和交卷。倒计时在标题栏，快到时间时整条横幅提醒。 */
export function ExamRunner({ attempt, graceSeconds, onSubmitted, onClosed, onLeave }: {
  attempt: JuryExamAttempt;
  graceSeconds: number;
  /** auto：是到时间自动交的卷，不是用户自己点的 */
  onSubmitted: (result: JuryExamResult, attempt: JuryExamAttempt, auto: boolean) => void;
  /** 这一场已经结束：closed 是超时作废或在别处交过卷，missing 是场次不存在或不属于当前账号 */
  onClosed: (reason: 'closed' | 'elsewhere' | 'missing') => void;
  onLeave: () => void;
}): JSX.Element {
  const { config } = useJury();
  const rootRef = useRef<HTMLDivElement>(null);
  const viewerOpenRef = useRef(false);
  // 自动交卷只触发一次：定时器走到点、页面从后台回到前台，两个入口共用这一个闸
  const autoFiredRef = useRef(false);
  const pendingRef = useRef(false);
  const [answers, setAnswers] = useState<ExamDraft>(() => readExamDraft(attempt.attempt_id));
  const [index, setIndex] = useState(() => {
    const draft = readExamDraft(attempt.attempt_id);
    const firstOpen = attempt.questions.findIndex((item) => !draft[item.question]);
    return firstOpen < 0 ? 0 : firstOpen;
  });
  const [armed, setArmed] = useState(false);
  const [auto, setAuto] = useState(false);
  const options = ballotOptions(config.config);
  const total = attempt.questions.length;
  const question = attempt.questions[Math.min(index, total - 1)];
  const answeredCount = attempt.questions.filter((item) => answers[item.question]).length;
  const missing = total - answeredCount;

  const now = useExamNow(true);
  // 解析不了时按「刚好到点」算（NaN 会让倒计时和自动交卷都失灵）
  const expiresAt = parseApiDate(attempt.expires_at)?.getTime() ?? null;
  const remaining = (expiresAt ?? now) - now;
  const autoIn = remaining - AUTO_SUBMIT.leadMs;
  const pastGrace = remaining < -graceSeconds * 1000;

  const submit = useMutation({
    mutationFn: () => submitJuryExam(attempt.attempt_id, draftToAnswers(answers)),
    onSuccess: (result) => onSubmitted(result, attempt, autoFiredRef.current),
    onError: (error) => {
      const code = errorCode(error);
      if (code === 'exam_closed') {
        // exam_closed 有两种来历：超时作废，或者这一场已经在别处（另一个窗口 / 设备）交过卷。
        // 服务端在 detail.reason 里说明是哪一种；早期的后端没有这个字段，那时按考试时钟判断：
        // 时间还没到就只可能是后者，不能说成「超时没交卷」
        const reason = errorField(error, 'reason') as JuryExamClosedReason | null;
        onClosed(reason === 'submitted' ? 'elsewhere' : reason === 'expired' ? 'closed' : examNow() >= (expiresAt ?? 0) ? 'closed' : 'elsewhere');
      } else if (code === 'exam_not_found') {
        // 这一场不存在或不是当前账号的（换过账号、服务端清过数据）：本机存的答案也没用了
        onClosed('missing');
      }
    }
  });
  const pending = submit.isPending;
  const mutate = submit.mutate;
  pendingRef.current = pending;

  // 到点前自动交卷：只触发一次，用户自己的交卷正在路上时也不再发。失败了（断网）留给用户手动重试，宽限期过了就按作废处理
  const autoSubmit = useCallback(() => {
    if (autoFiredRef.current || pendingRef.current) {
      return;
    }
    autoFiredRef.current = true;
    setAuto(true);
    setArmed(false);
    mutate();
  }, [mutate]);

  useEffect(() => {
    if (autoIn <= 0) {
      autoSubmit();
    }
  }, [autoIn, autoSubmit]);

  // 页面在后台时浏览器会把定时器压到很慢（隐藏超过 5 分钟后每分钟才走一次），上面那个到点检查可能迟到。
  // 所以从后台回到前台的那一刻就按校准过的考试时钟现算一次：已经过了自动交卷点就立刻交，不等下一次定时器 ——
  // 只要还在服务端的宽限期内，这一场就还算数。时间还充裕时什么都不做；切到后台本身也不触发任何事。
  useEffect(() => {
    const handleVisibility = (): void => {
      if (!document.hidden && expiresAt !== null && expiresAt - examNow() - AUTO_SUBMIT.leadMs <= 0) {
        autoSubmit();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [autoSubmit, expiresAt]);

  const failed = Boolean(submit.error) && !pending;
  useEffect(() => {
    if (pastGrace && failed) {
      onClosed('closed');
    }
  }, [failed, onClosed, pastGrace]);

  const locked = pending || auto;
  const pick = (vote: JuryBallot): void => {
    if (locked) {
      return;
    }
    const next = { ...answers, [question.question]: vote };
    setAnswers(next);
    writeExamDraft(attempt.attempt_id, next);
    setArmed(false);
  };
  const go = useCallback((target: number) => {
    setIndex(Math.min(total - 1, Math.max(0, target)));
    setArmed(false);
  }, [total]);

  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true });
  }, [index]);

  const handleViewerOpenChange = useCallback((open: boolean) => {
    viewerOpenRef.current = open;
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.defaultPrevented || event.nativeEvent.isComposing || viewerOpenRef.current || !rootRef.current?.contains(event.target as Node)) {
      return;
    }
    const plain = !event.ctrlKey && !event.metaKey && !event.altKey;
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      if (locked) return;
      if (armed) mutate();
      else setArmed(true);
    } else if (event.key === 'Escape') {
      if (armed) {
        event.preventDefault();
        setArmed(false);
      }
    } else if (plain && /^[1-9]$/.test(event.key)) {
      const option = options[Number(event.key) - 1];
      if (option) {
        event.preventDefault();
        pick(option.value as JuryBallot);
      }
    } else if (plain && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) {
      event.preventDefault();
      go(index + (event.key === 'ArrowRight' ? 1 : -1));
    }
  }

  const tone = remaining <= LAST_MS ? 'is-danger' : remaining <= WARN_MS ? 'is-warn' : '';
  const banner = auto && pending ? { tone: 'is-danger', text: '时间到，正在自动交卷…' }
    : auto ? null
    : autoIn <= AUTO_SUBMIT.noticeMs ? { tone: 'is-danger', text: `${Math.max(0, Math.ceil(autoIn / 1000))} 秒后自动交卷。已答 ${answeredCount} / ${total} 题${missing > 0 ? '，没作答的题按答错算' : ''}。` }
    : remaining <= LAST_MS ? { tone: 'is-danger', text: `只剩不到 1 分钟。时间到会自动交卷，已答 ${answeredCount} / ${total} 题。` }
    : remaining <= WARN_MS ? { tone: 'is-warn', text: `还剩不到 5 分钟。时间到会自动交卷${missing > 0 ? `，还有 ${missing} 题没答` : '，你已经全部答完，可以现在交卷'}。` }
    : null;
  const submitError = failed && !['exam_closed', 'exam_not_found'].includes(errorCode(submit.error) ?? '') ? errorText(submit.error, '交卷没有成功，请重试。') : null;

  return (
    <div ref={rootRef} className="kjr-keyscope" tabIndex={-1} data-phase="exam" data-exam-question={question.question} data-exam-answered={answeredCount} data-exam-remaining={Math.max(0, Math.ceil(remaining / 1000))} onKeyDown={handleKeyDown}>
      <SectionFrame flush title="入门考试" subtitle={`第 ${index + 1} / ${total} 题 · 已答 ${answeredCount} 题`} onBack={onLeave} actions={(
        <span className={cx('kjr-exam-timer', tone)} role="timer" aria-label="剩余时间" title="离开这个页面不会暂停计时">
          <Icon name="clock" className="h-3.5 w-3.5" />{formatCountdown(remaining)}
        </span>
      )}>
        {banner ? <p className={cx('kjr-exam-banner', banner.tone)} role="alert" data-exam-banner={banner.tone}>{banner.text}</p> : null}
        <div className="kjr-desk">
          <div className="kjr-desk-evidence kui-scroll">
            <header className="kjr-case-head">
              <h2>第 {question.question} 题</h2>
              <span className="kui-tag">{KIND_LABEL[question.kind] ?? question.kind}</span>
              <span className="kjr-meta">判断这条内容有没有违规。只按「违规 / 不违规」计分</span>
            </header>
            <p className="kui-note">题目是已经有结论的真实案例，内容做了匿名处理。考试期间可以翻规则手册，但离开这个页面不会暂停计时；选过的答案会留在这台设备上。</p>
            <CaseEvidence key={question.question} view={{ ...question, case_id: question.question }} contextNear={config.config.rules.context_near} onViewerOpenChange={handleViewerOpenChange} />
          </div>
          <aside className="kjr-vote" aria-label="作答">
            <div className="kjr-vote-scroll kui-scroll">
              <section className="kjr-vote-block">
                <h3 className="kjr-h">题号<span>已答 {answeredCount} / {total}</span></h3>
                <div className="kjr-exam-nav" role="tablist" aria-label="题号">
                  {attempt.questions.map((item, position) => (
                    <button key={item.question} type="button" role="tab" aria-selected={position === index} data-exam-nav={item.question} className={cx(position === index && 'is-current', answers[item.question] && 'is-answered')} title={answers[item.question] ? `第 ${item.question} 题 · 已作答` : `第 ${item.question} 题 · 未作答`} onClick={() => go(position)}>{item.question}</button>
                  ))}
                </div>
              </section>
              <QuestionReasons question={question} />
              <section className="kjr-vote-block">
                <h3 className="kjr-h">你的判断<span>可以随时改，交卷前都算数</span></h3>
                <BallotList options={options} value={answers[question.question] ?? null} disabled={locked} onPick={pick} />
                <div className="kjr-exam-step">
                  <button type="button" className="kui-btn kui-btn--sm" disabled={index === 0} onClick={() => go(index - 1)}><Icon name="chevronLeft" className="h-3.5 w-3.5" />上一题</button>
                  <button type="button" className="kui-btn kui-btn--sm" data-action="exam-next" disabled={index >= total - 1} onClick={() => go(index + 1)}>下一题<Icon name="chevron" className="h-3.5 w-3.5" /></button>
                </div>
              </section>
            </div>
            <footer className="kjr-vote-foot">
              {submitError ? <p className="kui-note kui-note--danger" role="alert">{submitError}</p> : null}
              {auto ? (
                <button type="button" className="kui-btn kui-btn--primary kui-btn--block" data-action="exam-retry" disabled={pending} onClick={() => mutate()}>{pending ? '正在交卷…' : '重试交卷'}</button>
              ) : armed ? (
                <div className="kjr-confirm" role="alertdialog" aria-label="确认交卷">
                  <p>确认交卷？<span>{missing > 0 ? `还有 ${missing} 题没作答，没作答的题按答错算。` : `${total} 题都已作答。`}交卷后不能修改。</span></p>
                  <div className="kjr-btn-row">
                    <button type="button" className="kui-btn" disabled={pending} onClick={() => setArmed(false)}>继续作答<kbd className="kjr-key">Esc</kbd></button>
                    <button type="button" className="kui-btn kui-btn--primary" data-action="exam-confirm" disabled={pending} onClick={() => mutate()}>{pending ? '交卷中…' : '确认交卷'}{pending ? null : <kbd className="kjr-key">{modKeyLabel()} ↵</kbd>}</button>
                  </div>
                </div>
              ) : (
                <button type="button" className="kui-btn kui-btn--primary kui-btn--block" data-action="exam-submit" disabled={pending || answeredCount === 0} onClick={() => setArmed(true)}>
                  {answeredCount === 0 ? '还没有作答' : missing > 0 ? `交卷（已答 ${answeredCount} / ${total}）` : '交卷'}{answeredCount > 0 ? <kbd className="kjr-key">{modKeyLabel()} ↵</kbd> : null}
                </button>
              )}
              <p className="kjr-vote-keys"><kbd className="kjr-key">1</kbd>–<kbd className="kjr-key">{options.length}</kbd> 选择<i /><kbd className="kjr-key">←</kbd><kbd className="kjr-key">→</kbd> 换题<i />两次 <kbd className="kjr-key">{modKeyLabel()} ↵</kbd> 交卷</p>
            </footer>
          </aside>
        </div>
      </SectionFrame>
    </div>
  );
}
