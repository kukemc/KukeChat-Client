import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getNextJuryCase, voteJuryCase } from '@/api/jury';
import { readPreference, writePreference } from '@/components/chat/desktop/runtime';
import type { JuryCaseView, JuryVote } from '@/types/jury';
import type { JuryReward } from '@/types/juryGrowth';
import { useJury } from '../context';
import { errorField, growthKeys } from '../data/growth';
import { errorCode, errorText, juryKeys, useModerationRules } from '../data/queries';
import { CaseDetail, type CaseFallback } from '../detail/CaseDetail';
import { normalizeWarnings, ROLLING_HINT, signed, slotResetText, warningFacts } from '../growth/labels';
import { RewardNote } from '../growth/RewardNote';
import { formatRemaining, KIND_LABEL, reviewNo, voteLabel } from '../labels';
import { CaseOriginTag } from '../senior/caseOrigin';
import { Meter } from '../widgets/Charts';
import { CaseEvidence } from '../widgets/Evidence';
import { Loading, SectionFrame } from '../widgets/Frame';
import { DeskIdle, type DeskIdleReason } from './DeskIdle';
import { usableVoteOptions, VotePanel, type VoteExtras, type VotePanelHandle } from './VotePanel';

const CONTINUOUS_KEY = 'kukechat:jury-continuous';

function isTyping(target: EventTarget | null): boolean {
  // 开关（「连续评审」）也是 input，但它不收文字：焦点停在它上面时数字键仍然是选选项
  if (target instanceof HTMLInputElement) {
    return target.type !== 'checkbox' && target.type !== 'radio';
  }
  return target instanceof HTMLElement && (target.tagName === 'TEXTAREA' || target.isContentEditable);
}

/** 焦点在按钮、输入框或对话框里：回车和字母键是给它们用的，不当作评审台的快捷键。 */
function isInteractive(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.closest('button, a, input, textarea, select, [contenteditable], [role="dialog"]') !== null;
}

function inDialog(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.closest('[role="dialog"]') !== null;
}

function Review({ view, error, pending, onSubmit, onViewerOpenChange, panelRef }: { view: JuryCaseView; error: string | null; pending: boolean; onSubmit: (vote: JuryVote, note: string, category: string | null) => void; onViewerOpenChange: (open: boolean) => void; panelRef: React.RefObject<VotePanelHandle> }): JSX.Element {
  const { config, status } = useJury();
  const rules = useModerationRules().data;
  const expires = formatRemaining(view.expires_at);
  // 二期的选项用到的规则数字。后端没有 votes_v2 时配置里没有这两个选项，这些值用不上
  const extras: VoteExtras = {
    categories: config.has('votes_v2') ? config.config.categories ?? [] : [],
    recuseLeft: status?.recuse_left_today ?? null,
    recuseResetsAt: status?.recuse_resets_at ?? null,
    recuseLimit: config.config.recuse?.daily_limit ?? null,
    needContextVotes: config.config.rules.need_context_votes ?? null,
    escalatesTo: config.has('panel') ? '资深合议' : '管理员'
  };
  return (
    <div className="kjr-desk">
      <div className="kjr-desk-evidence kui-scroll">
        <header className="kjr-case-head">
          <h2>{reviewNo(view.case_id)}</h2>
          <span className="kui-tag">{KIND_LABEL[view.kind]}</span>
          <CaseOriginTag view={view} />
          {expires ?<span className="kjr-meta">请在 {expires}内完成，超时会让给其他委员</span> : null}
        </header>
        <p className="kui-note">案件里的发言人都用代称，看不到是谁、也看不到是哪个群。请只根据内容本身判断，不要猜测或打听当事人。</p>
        <CaseEvidence view={view} contextNear={config.config.rules.context_near} onViewerOpenChange={onViewerOpenChange} />
      </div>
      <VotePanel key={view.case_id} ref={panelRef} view={view} options={usableVoteOptions(config.config.votes)} rules={rules} extras={extras} noteIsOpinion={config.has('opinions')} pending={pending} error={error} onSubmit={onSubmit} />
    </div>
  );
}

/**
 * 评审台：一次一件。左边是匿名证据，右边是表决面板；投完进入这个案件的投后视图，再点「下一件」。
 * 打开「连续评审」后，投完直接发下一件（质控题除外：它的反馈一定会给你看）。
 *
 * 快捷键只在焦点位于评审台内部时生效：扩展是嵌在别人的页面里的，不能去抢整个页面的按键。
 */
export function DeskSection(): JSX.Element {
  const { status, identity } = useJury();
  const queryClient = useQueryClient();
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<VotePanelHandle>(null);
  const viewerOpenRef = useRef(false);
  const [after, setAfter] = useState<CaseFallback | null>(null);
  const [lastVoted, setLastVoted] = useState<CaseFallback | null>(null);
  // 二期：这一票当场结算的风纪值（质控题、今日首票）。没有就是 null
  const [lastReward, setLastReward] = useState<JuryReward | null>(null);
  const [continuous, setContinuous] = useState(() => readPreference(CONTINUOUS_KEY) === '1');
  const reviewing = after === null;
  // 受处罚、或弃权过多被暂停发案时不去领案件：直接显示对应的状态，不等服务端拒绝
  const blocked = identity.restricted || identity.cooldownUntil !== null;

  const caseQuery = useQuery({ queryKey: juryKeys.next, queryFn: getNextJuryCase, enabled: reviewing && identity.isJuror && !blocked, retry: false, staleTime: Infinity, gcTime: 0 });
  const view = caseQuery.data ?? null;

  const vote = useMutation({
    mutationFn: ({ caseId, value, note, category }: { caseId: number; value: JuryVote; note: string; category: string | null }) => voteJuryCase(caseId, value, note || undefined, category),
    onSuccess: (result, variables) => {
      const voted: CaseFallback = { caseId: variables.caseId, vote: variables.value, note: variables.note || null, settled: result.settled };
      if (result.case) {
        queryClient.setQueryData(juryKeys.case(variables.caseId), result.case);
      }
      queryClient.removeQueries({ queryKey: juryKeys.next });
      for (const key of [juryKeys.me, juryKeys.history, juryKeys.votes, juryKeys.stats, juryKeys.overview, growthKeys.points, growthKeys.achievements]) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
      setLastVoted(voted);
      setLastReward(result.reward && (result.reward.points !== 0 || result.reward.items.length > 0) ? result.reward : null);
      // 主动回避的人不能再看这个案件：没有投后视图，直接发下一件。
      // 质控题的反馈是培训的一部分，连续评审时也要停下来看
      if (variables.value !== 'recuse' && (!continuous || result.case?.is_quality_check)) {
        setAfter(voted);
      }
    },
    // 回避次数用完、受限、被暂停发案：/jury/me 里的数字已经过时了，重拉让界面换到对应的状态
    onError: (error) => {
      if (['recuse_limit', 'juror_restricted', 'jury_cooldown'].includes(errorCode(error) ?? '')) {
        void queryClient.invalidateQueries({ queryKey: juryKeys.me });
      }
      // 带的违规类别不在服务端的列表里（配置变过）：重拉配置，面板上的类别跟着换
      if (errorCode(error) === 'invalid_category') {
        void queryClient.invalidateQueries({ queryKey: juryKeys.config });
      }
    }
  });
  // 评审 / 回避额度用完（429）时，错误里带着下一个名额释放的时间：接在服务端那句话后面
  const voteLimitReset = ['jury_daily_limit', 'recuse_limit'].includes(errorCode(vote.error) ?? '') ? slotResetText(errorField(vote.error, 'resets_at')) : null;
  const voteError = !vote.error ? null
    : errorCode(vote.error) === 'invalid_category' ? '选的违规类别已经不在可选范围里了。类别列表刚刚更新过，请重新选一个再提交。'
    : `${errorText(vote.error, '投票提交失败，请稍后重试。')}${voteLimitReset ? `（${voteLimitReset}）` : ''}`;

  const next = useCallback(() => {
    vote.reset();
    setAfter(null);
  }, [vote]);

  // 案件换了、或者在评审 / 投后之间切换时，把焦点收回评审台，快捷键才接得住
  const caseId = view?.case_id ?? null;
  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true });
  }, [caseId, reviewing]);

  const handleViewerOpenChange = useCallback((open: boolean) => {
    viewerOpenRef.current = open;
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    // 看图浮层、举报对话框是挂在别处的浮层，它们里面的按键不归评审台管
    if (event.defaultPrevented || event.nativeEvent.isComposing || viewerOpenRef.current || inDialog(event.target) || !rootRef.current?.contains(event.target as Node)) {
      return;
    }
    const typing = isTyping(event.target);
    const submitKey = event.key === 'Enter' && (event.ctrlKey || event.metaKey);
    if (!reviewing) {
      if (!isInteractive(event.target) && !event.ctrlKey && !event.metaKey && !event.altKey && (event.key === 'Enter' || event.key.toLowerCase() === 'n')) {
        event.preventDefault();
        next();
      }
      return;
    }
    if (!view) {
      return;
    }
    if (submitKey) {
      event.preventDefault();
      panelRef.current?.advance();
    } else if (event.key === 'Escape') {
      if (panelRef.current?.cancel()) {
        event.preventDefault();
      }
    } else if (!typing && !event.ctrlKey && !event.metaKey && !event.altKey && /^[1-9]$/.test(event.key)) {
      event.preventDefault();
      panelRef.current?.pick(Number(event.key));
    } else if (!typing && !event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === 'c') {
      // 二期：选了违规选项时换违规类别（Shift 往回）。没在选类别时什么都不做，按键照常冒泡
      if (panelRef.current?.cycleCategory(event.shiftKey ? -1 : 1)) {
        event.preventDefault();
      }
    }
  }

  const code = errorCode(caseQuery.error);
  const reachedLimit = code === 'jury_daily_limit' || Boolean(status && !view && status.voted_today >= status.daily_limit);
  // 下一个评审名额什么时候释放：领案件被拒（429）时错误里带着，否则看 /jury/me。后端还没下发时两处都没有
  const limitResetsAt = (code === 'jury_daily_limit' ? errorField(caseQuery.error, 'resets_at') : null) ?? status?.daily_resets_at ?? null;
  const cooldownUntil = identity.cooldownUntil ?? (code === 'jury_cooldown' ? errorField(caseQuery.error, 'until') ?? '' : null);
  const idle: DeskIdleReason | null = !identity.isJuror || code === 'not_juror' ? 'not_juror'
    : identity.restricted || code === 'juror_restricted' ? 'restricted'
    : cooldownUntil !== null ? 'cooldown'
    : reachedLimit ? 'limit'
    : caseQuery.error ? 'error'
    : !caseQuery.isFetching && !view ? 'empty'
    : null;

  const progress = status ? (
    // 评审上限按最近 24 小时滚动计算，不在零点清零，所以不写「今日」
    <span className="kjr-progress" data-voted={status.voted_today} title={ROLLING_HINT}>24 小时内 {status.voted_today} / {status.daily_limit}<Meter value={status.voted_today} max={status.daily_limit} label="最近 24 小时的评审数" /></span>
  ) : null;

  return (
    <div ref={rootRef} className="kjr-keyscope" tabIndex={-1} data-phase={after ? 'after' : idle ?? (view ? 'review' : 'loading')} onKeyDown={handleKeyDown}>
      {after ? (
        <SectionFrame title="评审台" subtitle={<>{reviewNo(after.caseId)} · 你的判断已提交</>} actions={<>{progress}<button type="button" className="kui-btn kui-btn--primary" data-action="next-case" onClick={next}>下一件<kbd className="kjr-key">N</kbd></button></>}>
          {lastReward && lastVoted?.caseId === after.caseId ? <RewardNote reward={lastReward} /> : null}
          <CaseDetail caseId={after.caseId} fallback={after} />
        </SectionFrame>
      ) : (
        <SectionFrame flush title="评审台" subtitle={view ? '一次一件，投票后才发下一件' : undefined} actions={(
          <>
            {progress}
            <label className="kjr-toggle" title="投完直接发下一件，不停在投后视图">
              <input type="checkbox" className="kui-switch" role="switch" data-action="continuous" checked={continuous} onChange={(event) => {
                setContinuous(event.target.checked);
                writePreference(CONTINUOUS_KEY, event.target.checked ? '1' : '0');
              }} />
              连续评审
            </label>
          </>
        )}>
          {reviewing && lastVoted?.vote === 'recuse' ? (
            <p className="kjr-flash" role="status" data-flash="recuse">
              已回避{reviewNo(lastVoted.caseId)}，这个案件会改派给别的委员，不计入你的评审数。{typeof status?.recuse_left_today === 'number' ? `24 小时内还可以回避 ${status.recuse_left_today} 次。` : ''}
            </p>
          ) : reviewing && lastVoted && continuous ? (
            <p className="kjr-flash" role="status" data-flash="voted">
              {reviewNo(lastVoted.caseId)} 已提交：{voteLabel(lastVoted.vote)}。{lastVoted.settled ? '这一票让案件有了结论。' : ''}{lastReward ? <b className="kjr-flash-points">{signed(lastReward.points)} 风纪值</b> : null}
              <button type="button" className="kui-link" onClick={() => setAfter(lastVoted)}>查看这个案件</button>
            </p>
          ) : null}
          {!idle && view ? normalizeWarnings(status?.warnings).map((warning) => {
            const facts = warningFacts(warning);
            return (
              <p key={warning.code} className="kjr-flash kjr-flash--warn" role="status" data-warning={warning.code}>
                {warning.message}{facts ? <span className="kjr-warning-facts" data-warning-facts>{facts}</span> : null}
              </p>
            );
          }) : null}
          {idle ? (
            <div className="kjr-body kui-scroll"><div className="kjr-wrap"><DeskIdle reason={idle} until={cooldownUntil} resetsAt={limitResetsAt} message={idle === 'error' ? errorText(caseQuery.error, '案件领取失败，请稍后再试。') : undefined} onRetry={() => void caseQuery.refetch()} /></div></div>
          ) : !view ? <div className="kjr-body"><Loading label="正在领取案件…" /></div> : (
            <Review view={view} panelRef={panelRef} pending={vote.isPending} error={voteError} onViewerOpenChange={handleViewerOpenChange}
              onSubmit={(value, note, category) => vote.mutate({ caseId: view.case_id, value, note, category })} />
          )}
        </SectionFrame>
      )}
    </div>
  );
}
