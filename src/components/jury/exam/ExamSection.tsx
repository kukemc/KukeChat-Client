import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { startJuryExam } from '@/api/juryGrowth';
import type { JuryExamAttempt, JuryExamQuestion, JuryExamResult, JuryExamState } from '@/types/juryGrowth';
import { useJury } from '../context';
import { growthKeys, useJuryExam } from '../data/growth';
import { errorText, isUnavailable, juryKeys } from '../data/queries';
import { Loading, LoadError, NotOpenYet } from '../widgets/Frame';
import { syncExamClock } from './clock';
import { clearExamDraft } from './draft';
import { ExamHome } from './ExamHome';
import { ExamResultView } from './ExamResultView';
import { ExamRunner } from './ExamRunner';

/** 交卷的宽限期（过了 expires_at 之后服务端还接受多久）读 config.exam.grace_seconds；配置里没有这个字段时按这个数算 */
const FALLBACK_GRACE_SECONDS = 30;

/**
 * 入门考试（规则手册里的一个页签）。三种画面：
 *   · 说明页：现在能不能考、规则、上次的成绩 —— 套在规则手册的外框里（frame）；
 *   · 进行中：占满整个板块的答题界面，自己带外框和倒计时；
 *   · 刚交卷：分数和逐题对照，同样套在规则手册的外框里。
 * 进行中的那一场由这里攥着：实时事件让缓存失效、重拉 /jury/exam 时不会把正在答的题换掉。
 */
export function ExamSection({ frame }: { frame: (content: ReactNode) => JSX.Element }): JSX.Element {
  const { config, nav } = useJury();
  const queryClient = useQueryClient();
  const query = useJuryExam(true);
  const [attempt, setAttempt] = useState<JuryExamAttempt | null>(null);
  const [outcome, setOutcome] = useState<{ result: JuryExamResult; questions: JuryExamQuestion[]; auto: boolean } | null>(null);
  // 上一场是怎么没的：closed = 超时作废或在别处交过卷；missing = 场次不存在或不属于当前账号
  const [closed, setClosed] = useState<'closed' | 'elsewhere' | 'missing' | null>(null);
  // 服务端已经说「这一场不算了」的场次：就算缓存里的 active 还指着它，也不再接回来
  const endedAttemptRef = useRef<number | null>(null);
  const exam = query.data;

  // 考试时钟的校正在 useJuryExam 的 queryFn 里做（响应到达的那一刻）。这里不能拿缓存里的 server_time 再校一次：
  // 它是旧的，会把时钟往回拨，倒计时就比实际多出「缓存放了多久」那么长

  // 回来时接上进行中的那一场（题目来自服务端，答案来自本机草稿）
  const active = exam?.active ?? null;
  useEffect(() => {
    if (active && !outcome && active.attempt_id !== endedAttemptRef.current) {
      setAttempt((current) => current ?? active);
    }
  }, [active, outcome]);

  const refreshAll = useCallback(() => {
    for (const key of [growthKeys.exam, juryKeys.me, juryKeys.overview, growthKeys.points, growthKeys.achievements]) {
      void queryClient.invalidateQueries({ queryKey: key });
    }
  }, [queryClient]);

  const start = useMutation({
    mutationFn: startJuryExam,
    onSuccess: (started) => {
      syncExamClock(started.server_time);
      setClosed(null);
      setOutcome(null);
      queryClient.setQueryData<JuryExamState | undefined>(growthKeys.exam, (current) => (current ? { ...current, active: started } : current));
      setAttempt(started);
    },
    // 开考被拒（冷却、次数用完、题库不足）：状态多半已经变了，重拉一次让说明页跟上
    onError: () => void queryClient.invalidateQueries({ queryKey: growthKeys.exam })
  });

  const handleSubmitted = useCallback((result: JuryExamResult, finished: JuryExamAttempt, auto: boolean) => {
    clearExamDraft();
    queryClient.setQueryData<JuryExamState | undefined>(growthKeys.exam, (current) => (current ? { ...current, active: null } : current));
    queryClient.setQueryData(juryKeys.me, result.status);
    setOutcome({ result, questions: finished.questions, auto });
    setAttempt(null);
    refreshAll();
  }, [queryClient, refreshAll]);

  const handleClosed = useCallback((reason: 'closed' | 'elsewhere' | 'missing') => {
    // 两种情况本机存的答案都没用了：清掉，回到说明页，再重拉一次考试状态
    clearExamDraft();
    queryClient.setQueryData<JuryExamState | undefined>(growthKeys.exam, (current) => (current ? { ...current, active: null } : current));
    setAttempt((current) => {
      endedAttemptRef.current = current?.attempt_id ?? endedAttemptRef.current;
      return null;
    });
    setClosed(reason);
    refreshAll();
  }, [queryClient, refreshAll]);

  if (attempt) {
    return <ExamRunner key={attempt.attempt_id} attempt={attempt} graceSeconds={config.config.exam?.grace_seconds ?? FALLBACK_GRACE_SECONDS} onSubmitted={handleSubmitted} onClosed={handleClosed} onLeave={() => nav.patch({ tab: 'rules' })} />;
  }
  if (outcome) {
    return frame(<ExamResultView result={outcome.result} questions={outcome.questions} auto={outcome.auto} onDone={() => setOutcome(null)} />);
  }
  if (query.isLoading) {
    return frame(<Loading />);
  }
  if (!exam) {
    return frame(isUnavailable(query.error) ? <NotOpenYet what="入门考试" /> : <LoadError message={errorText(query.error, '考试信息加载失败，请稍后再试。')} onRetry={() => void query.refetch()} />);
  }
  return frame(<ExamHome exam={exam} closed={closed} starting={start.isPending} startError={start.error ? errorText(start.error, '考试没有开始，请稍后再试。') : null} onStart={() => start.mutate()} />);
}
