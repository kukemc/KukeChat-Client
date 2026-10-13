import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { answerJuryPractice } from '@/api/juryGrowth';
import { cx } from '@/components/chat/desktop/runtime';
import { Icon } from '@/components/ui/Icon';
import type { JuryBallot, JuryPracticeAnswer, JuryPracticeQuestion, JuryPracticeStats } from '@/types/juryGrowth';
import { useJury } from '../context';
import { errorField, growthKeys, useJuryPracticeNext } from '../data/growth';
import { errorCode, errorText, isUnavailable } from '../data/queries';
import { ballotOptions, restrictionReason, restrictionUntil, ROLLING_HINT, slotResetText } from '../growth/labels';
import { formatRate, KIND_LABEL } from '../labels';
import { Meter } from '../widgets/Charts';
import { CaseEvidence } from '../widgets/Evidence';
import { Loading, SectionFrame } from '../widgets/Frame';
import { BallotList, QuestionReasons, StandardAnswer } from './Ballots';
import { PracticeIdle, type PracticeIdleReason } from './PracticeIdle';

interface PracticeMeta {
  left: number;
  limit: number;
  /** 下一个练习名额释放的时间；后端没给时为 null */
  resetsAt: string | null;
  stats: JuryPracticeStats | null;
  /** 题库里我能练的题数，和其中做过的（不重复计）。早期的后端没有 */
  round: { total: number; done: number } | null;
}

/** 这一轮做完了：题库里能练的题都做过一遍，之后出的都是重做的题 */
function roundFinished(round: PracticeMeta['round']): boolean {
  return round !== null && round.total > 0 && round.done >= round.total;
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.isContentEditable);
}

/** 答完之后右栏的反馈：对没对、标准结论和讲解、这一轮的成绩。 */
function Feedback({ result, session }: { result: JuryPracticeAnswer; session: { answered: number; correct: number } }): JSX.Element {
  return (
    <section className={cx('kjr-pq-feedback', result.correct ? 'is-right' : 'is-wrong')} data-result={result.correct ? 'right' : 'wrong'} role="status">
      <p className="kjr-pq-verdict">
        <span className="kjr-pq-verdict-icon"><Icon name={result.correct ? 'check' : 'close'} className="h-4 w-4" /></span>
        {result.correct ? '判断正确' : '和标准结论不一致'}
      </p>
      <p className="kjr-quiet">{result.correct ? '「违规 / 不违规」判断对了就算对；等级和类别可以对照下面的标准结论。' : '不要紧，这正是练习的用处。对照下面的标准结论和讲解，再看一遍左边的内容。'}</p>
      <h3 className="kjr-h">标准结论</h3>
      <StandardAnswer answer={result.answer} />
      <p className="kjr-pq-session">这次练习做了 <b>{session.answered}</b> 题，对 <b>{session.correct}</b> 题</p>
    </section>
  );
}

/**
 * 练习场：用已经有结论的案例练手。流程和评审台一样（左边匿名证据，右边判断），
 * 但只有四个判断、一步提交，答完立刻给标准结论。不计入一致率，不给风纪值，不对任何人产生处罚。
 *
 * 委员会刚成立时真实案件很少，所以这里是大多数人最先、最常用到的地方：未任命但满足资格的用户也能用。
 */
export function PracticeSection(): JSX.Element {
  const { identity, config } = useJury();
  const queryClient = useQueryClient();
  const rootRef = useRef<HTMLDivElement>(null);
  const viewerOpenRef = useRef(false);
  // 题目拿到手就由页面攥着，答完点「下一题」才换：实时事件让缓存整棵失效时，正在看的题不能被换掉
  const [held, setHeld] = useState<JuryPracticeQuestion | null>(null);
  const [choice, setChoice] = useState<JuryBallot | null>(null);
  const [result, setResult] = useState<JuryPracticeAnswer | null>(null);
  const [meta, setMeta] = useState<PracticeMeta | null>(null);
  const [session, setSession] = useState({ answered: 0, correct: 0 });
  // 这一轮做完之后先停一下，说清楚「之后都是重做的题」；用户点了「再练一轮」才接着出题
  const [repeatOk, setRepeatOk] = useState(false);
  const allowed = identity.canPractice;
  const query = useJuryPracticeNext(allowed && !identity.loading && held === null);
  const options = ballotOptions(config.config);

  const data = query.data;
  const settled = !query.isFetching;
  useEffect(() => {
    if (!data || !settled) {
      return;
    }
    const round = data.round ?? null;
    setMeta({ left: data.left_today, limit: data.daily_limit, resetsAt: data.resets_at ?? null, stats: data.stats ?? null, round });
    const pauseForRound = roundFinished(round) && Boolean(data.question?.answered_before) && !repeatOk;
    if (data.question && data.left_today > 0 && !pauseForRound) {
      setHeld((current) => current ?? data.question);
    }
  }, [data, repeatOk, settled]);

  const answer = useMutation({
    mutationFn: ({ questionId, vote }: { questionId: number; vote: JuryBallot }) => answerJuryPractice(questionId, vote),
    onSuccess: (response) => {
      setResult(response);
      // 答题响应里没有 round：这道题以前没做过的话，本轮进度自己往前走一格，下一次取题时以服务端的为准
      const fresh = held !== null && !held.answered_before;
      setMeta((current) => ({
        left: response.left_today,
        limit: current?.limit ?? config.config.practice?.daily_limit ?? response.left_today,
        // 答题响应里没带（早期的后端）就留着取题时拿到的
        resetsAt: response.resets_at !== undefined ? response.resets_at : current?.resetsAt ?? null,
        stats: response.stats,
        round: current?.round ? { total: current.round.total, done: Math.min(current.round.total, current.round.done + (fresh ? 1 : 0)) } : null
      }));
      setSession((current) => ({ answered: current.answered + 1, correct: current.correct + (response.correct ? 1 : 0) }));
    }
  });

  const submit = useCallback(() => {
    if (held && choice && !result && !answer.isPending) {
      answer.mutate({ questionId: held.question_id, vote: choice });
    }
  }, [answer, choice, held, result]);

  const next = useCallback(() => {
    queryClient.removeQueries({ queryKey: growthKeys.practice });
    answer.reset();
    setHeld(null);
    setChoice(null);
    setResult(null);
  }, [answer, queryClient]);

  const questionId = held?.question_id ?? null;
  const answered = result !== null;
  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true });
  }, [questionId, answered]);

  const handleViewerOpenChange = useCallback((open: boolean) => {
    viewerOpenRef.current = open;
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.defaultPrevented || event.nativeEvent.isComposing || viewerOpenRef.current || !held || isTyping(event.target) || !rootRef.current?.contains(event.target as Node)) {
      return;
    }
    const plain = !event.ctrlKey && !event.metaKey && !event.altKey;
    // 焦点停在某个选项上（刚用鼠标点过）时，回车仍然是「提交」，不是再点一次那个选项
    const onControl = event.target instanceof HTMLElement && event.target.closest('button:not([data-ballot]), a, select') !== null;
    if (result) {
      if (plain && !onControl && (event.key === 'Enter' || event.key.toLowerCase() === 'n')) {
        event.preventDefault();
        next();
      }
      return;
    }
    if (plain && /^[1-9]$/.test(event.key)) {
      const option = options[Number(event.key) - 1];
      if (option && !answer.isPending) {
        event.preventDefault();
        setChoice(option.value as JuryBallot);
      }
    } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey || !onControl)) {
      event.preventDefault();
      submit();
    }
  }

  const code = errorCode(query.error) ?? errorCode(answer.error);
  const limitReached = code === 'practice_daily_limit' || (meta !== null && meta.left <= 0 && (held === null || result !== null));
  // 下一个练习名额什么时候释放：取题 / 答题被拒（429）时错误里带着，否则用最近一次响应里的
  const limitResetsAt = (code === 'practice_daily_limit' ? errorField(query.error, 'resets_at') ?? errorField(answer.error, 'resets_at') : null) ?? meta?.resetsAt ?? null;
  const idle: PracticeIdleReason | null = held ? null
    : identity.loading ? null
    : !allowed || code === 'jury_not_eligible' ? 'not_eligible'
    : code === 'juror_restricted' ? 'restricted'
    : limitReached ? 'limit'
    : query.error && isUnavailable(query.error) ? 'unavailable'
    : query.error ? 'error'
    : settled && data && !data.question ? 'empty'
    : settled && data?.question && roundFinished(data.round ?? null) && data.question.answered_before && !repeatOk ? 'round_done'
    : null;

  const accuracy = meta?.stats && meta.stats.answered > 0 ? meta.stats.correct / meta.stats.answered : null;
  const used = meta ? Math.max(0, meta.limit - meta.left) : 0;
  const round = meta?.round ?? null;
  const actions = meta && allowed ? (
    <>
      {meta.stats ? <span className="kjr-pq-total" data-practice-stats={`${meta.stats.correct}/${meta.stats.answered}`}>累计 {meta.stats.answered} 题{accuracy !== null ? ` · 正确率 ${formatRate(accuracy)}` : ''}</span> : null}
      {round && round.total > 0 ? <span className="kjr-progress" data-practice-round={`${round.done}/${round.total}`} title="练习场现在能出的题里，你做过多少道（重做的不重复算）">本轮 {round.done} / {round.total}<Meter value={round.done} max={round.total} label="本轮练习进度" /></span> : null}
      <span className="kjr-progress" data-practice-left={meta.left} title={ROLLING_HINT}>24 小时内 {used} / {meta.limit}<Meter value={used} max={meta.limit} label="最近 24 小时的练习数" /></span>
    </>
  ) : undefined;

  return (
    <div ref={rootRef} className="kjr-keyscope" tabIndex={-1} data-phase={idle ?? (!held ? 'loading' : result ? 'feedback' : 'question')} onKeyDown={handleKeyDown}>
      <SectionFrame flush title="练习场" subtitle="已有结论的案例，答完立刻对答案" actions={actions}>
        {identity.restriction && held ? (
          <p className="kjr-flash kjr-flash--warn" role="status">{restrictionReason(identity.restriction)}，评审资格暂时受限（{restrictionUntil(identity.restriction)}）。练习不受影响。</p>
        ) : null}
        {idle ? (
          <div className="kjr-body kui-scroll"><div className="kjr-wrap"><PracticeIdle reason={idle} resetsAt={limitResetsAt} stats={meta?.stats ?? null} limit={meta?.limit ?? config.config.practice?.daily_limit ?? null} session={session} round={round} message={idle === 'error' ? errorText(query.error, '练习题没有加载出来，请稍后再试。') : undefined} onRetry={() => void query.refetch()} onRepeat={() => setRepeatOk(true)} /></div></div>
        ) : !held ? <div className="kjr-body"><Loading label="正在取题…" /></div> : (
          <div className="kjr-desk">
            <div className="kjr-desk-evidence kui-scroll">
              <header className="kjr-case-head">
                <h2>练习题</h2>
                <span className="kui-tag kui-tag--accent">练习 · 不计入一致率</span>
                <span className="kui-tag">{KIND_LABEL[held.kind] ?? held.kind}</span>
                {held.answered_before ? <span className="kui-tag" data-practice-repeat title="这道题你以前做过。题库里的题都做过一遍之后，会按最久没做的顺序重出">再练一次</span> : null}
                {held.verified ? null : <span className="kui-tag kui-tag--warn" title="这道题的标准结论还没有经过管理员核对，只用于练习，不会出现在考试和质控里">结论未核对</span>}
              </header>
              <p className="kui-note">这是一个已经有结论的真实案例，内容同样做了匿名处理。你在这里的判断不会影响任何人，也不计入一致率和风纪值，放心按自己的理解来。</p>
              <CaseEvidence view={{ ...held, case_id: held.question_id }} contextNear={config.config.rules.context_near} onViewerOpenChange={handleViewerOpenChange} />
            </div>
            <aside className="kjr-vote" aria-label="练习作答">
              <div className="kjr-vote-scroll kui-scroll">
                <QuestionReasons question={held} />
                <section className="kjr-vote-block">
                  <h3 className="kjr-h">你的判断{result ? null : <span>只判断，不需要写理由</span>}</h3>
                  <BallotList options={options} value={choice} disabled={answer.isPending} reveal={result?.answer ?? null} onPick={setChoice} />
                </section>
                {result ? <Feedback result={result} session={session} /> : null}
              </div>
              <footer className="kjr-vote-foot">
                {answer.error && !result ? <p className="kui-note kui-note--danger" role="alert">{errorText(answer.error, '提交失败，请稍后重试。')}{errorCode(answer.error) === 'practice_daily_limit' && slotResetText(limitResetsAt) ? `（${slotResetText(limitResetsAt)}）` : ''}</p> : null}
                {result ? (
                  limitReached
                    ? <button type="button" className="kui-btn kui-btn--primary kui-btn--block" data-action="practice-finish" onClick={next}>练习额度用完了，看看成绩</button>
                    : <button type="button" className="kui-btn kui-btn--primary kui-btn--block" data-action="practice-next" onClick={next}>下一题<kbd className="kjr-key">N</kbd></button>
                ) : (
                  <button type="button" className="kui-btn kui-btn--primary kui-btn--block" data-action="practice-submit" disabled={!choice || answer.isPending} onClick={submit}>
                    {answer.isPending ? '提交中…' : choice ? '提交判断' : '请先选择一个判断'}{choice && !answer.isPending ? <kbd className="kjr-key">↵</kbd> : null}
                  </button>
                )}
                <p className="kjr-vote-keys">
                  {result ? <><kbd className="kjr-key">N</kbd> 下一题</> : <><kbd className="kjr-key">1</kbd>–<kbd className="kjr-key">{options.length}</kbd> 选择<i /><kbd className="kjr-key">↵</kbd> 提交</>}
                </p>
              </footer>
            </aside>
          </div>
        )}
      </SectionFrame>
    </div>
  );
}
