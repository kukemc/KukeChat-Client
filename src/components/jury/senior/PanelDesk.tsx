import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { votePanelCase } from '@/api/jurySenior';
import type { JuryConfig, JuryStatus, JuryVoteOption } from '@/types/jury';
import type { PanelCaseView, PanelVote, PanelVoteBody, PanelVoteResult } from '@/types/jurySenior';
import { useJury } from '../context';
import { JURY_MAX_BAN_DAYS } from '../data/defaults';
import { errorCode, errorText, juryKeys, useModerationRules } from '../data/queries';
import { panelRules, seniorKeys, useNextPanelCase } from '../data/senior';
import { VotePanel, type VoteExtras, type VotePanelHandle } from '../desk/VotePanel';
import { CaseDetail, type CaseFallback } from '../detail/CaseDetail';
import { consensusRuleText, formatRemaining, reasonsText, voteLabel } from '../labels';
import { CaseEvidence } from '../widgets/Evidence';
import { Card, Loading } from '../widgets/Frame';
import { KindTag, TallyBar } from '../widgets/Tags';
import { CaseOriginTag, isMachineCase } from './caseOrigin';
import { panelReasonLabel } from './labels';
import { OriginOpinions, SeatDots } from './OriginReview';
import { SeniorIdle, seniorIdleReason } from './SeniorIdle';
import { useVoteKeys } from './useVoteKeys';

/** 配置里没有「主动回避」（二期的投票选项还没上线）时用的兜底：合议本身就允许回避（docs/jury-v2.md 3.1） */
const RECUSE_FALLBACK: JuryVoteOption = { value: 'recuse', kind: 'recuse', label: '主动回避', hint: '我可能认识当事人，或者和这件事有利害关系' };

/** 合议只能给出判断或回避，不能弃权 */
function panelOptions(votes: JuryVoteOption[]): JuryVoteOption[] {
  return [...votes.filter((option) => option.kind === 'clean' || option.kind === 'violation'), votes.find((option) => option.kind === 'recuse') ?? RECUSE_FALLBACK];
}

/**
 * 表决面板要的那几个数字。合议里的回避和普通评审共用同一份次数（按最近 24 小时滚动），所以照样把剩余次数给它；
 * 合议没有「上下文不足」，那一项用不到。
 */
function panelExtras(config: JuryConfig, status: JuryStatus | undefined): VoteExtras {
  return {
    categories: config.categories ?? [],
    recuseLeft: status?.recuse_left_today ?? null,
    recuseLimit: config.recuse?.daily_limit ?? null,
    recuseResetsAt: status?.recuse_resets_at ?? null,
    needContextVotes: null,
    escalatesTo: '管理员',
    // 合议要凑齐席位：没有别的资深委员可以顶上时，回避会让案件直接转给管理员（docs/jury-v2.md 3.1）
    recuseGoesTo: '案件会改派给别的资深委员，没有人可以顶上时转给管理员'
  };
}

/** 这一件已经不在手上了（409 already_voted / already_recused）：说明原因，然后去领下一件 */
const PANEL_GONE_TEXT: Record<string, string> = {
  already_voted: '你已经对这个案件投过合议票了，这次没有重复记票。',
  already_recused: '你已经回避过这个案件，不能再对它投票。'
};

/** 为什么来到合议：原因、原审的票数分布、合议的席位和规则。 */
function WhyHere({ view }: { view: PanelCaseView }): JSX.Element {
  const { config } = useJury();
  const rules = config.config.rules;
  const panel = panelRules(config.config);
  const reason = view.origin.reason;
  return (
    <Card className="kjr-panel-why" title={panelReasonLabel(reason)} aside={<><SeatDots cast={view.panel.votes_cast} total={view.panel.seats} label="合议席位" /><span className="kjr-meta">合议 {view.panel.seats} 席 · 已投 {view.panel.votes_cast}</span></>}>
      <p className="kjr-text" data-reason={reason}>
        {reason === 'need_context' ? `原审里有${rules.need_context_votes ? ` ${rules.need_context_votes} 位` : '多位'}委员认为现有的上下文不足以判断。你看到的是同一份内容：快照之外的消息已经取不到了，请在这个前提下给出判断。`
          : reason === 'timeout' ? `这个案件在委员队列里超过 ${rules.timeout_hours} 小时没有凑够票，多半是因为能评它的委员太少。原审留下的票不多，主要靠合议来定。`
          : `原审没有形成共识（普通评审的规则：${consensusRuleText(rules, true)}）分歧在哪，看下面的票数分布和每位委员写的理由。`}
        {isMachineCase(view) ? ' 这个案件来自机器筛查，没有举报人。' : ''}
      </p>
      {view.origin.tally ? <><p className="kjr-sub">原审票数分布</p><TallyBar tally={view.origin.tally} /></> : null}
      <p className="kjr-quiet kjr-panel-rule">
        合议 {panel.seats} 席，{panel.consensus_votes} 票一致即定案，不能弃权；{panel.timeout_hours} 小时内没有定案会转给管理员。合议给出的封禁同样不超过 {JURY_MAX_BAN_DAYS} 天。
        请写明理由：它会留在这个案件的观点区，原审委员和其他合议委员都看得到。
      </p>
    </Card>
  );
}

interface PanelAfter extends CaseFallback {
  reward: PanelVoteResult['reward'];
}

/**
 * 资深合议：一次一件。左边先交代「为什么来到合议」和原审的分歧，再是匿名证据和原审观点；右边是表决面板（和评审台同一个，去掉弃权）。
 * 投完进入这个案件的投后视图（和评审台、我的评审是同一个组件），可以在观点区继续讨论。
 */
export function PanelDesk(): JSX.Element {
  const { identity, config, status } = useJury();
  const queryClient = useQueryClient();
  const moderation = useModerationRules().data;
  const panelRef = useRef<VotePanelHandle>(null);
  const keys = useVoteKeys(panelRef);
  const [after, setAfter] = useState<PanelAfter | null>(null);
  const [recused, setRecused] = useState<number | null>(null);
  const [gone, setGone] = useState<string | null>(null);
  const reviewing = after === null;
  const caseQuery = useNextPanelCase(reviewing && identity.isSenior && !identity.restricted);
  const view = caseQuery.data ?? null;
  const panel = panelRules(config.config);

  const vote = useMutation({
    mutationFn: ({ caseId, body }: { caseId: number; body: PanelVoteBody }) => votePanelCase(caseId, body),
    onSuccess: (result, variables) => {
      if (result.case) {
        queryClient.setQueryData(juryKeys.case(variables.caseId), result.case);
      }
      releasedRef.current = variables.caseId;
      queryClient.removeQueries({ queryKey: seniorKeys.panelNext });
      for (const key of [juryKeys.me, juryKeys.history, juryKeys.votes, juryKeys.stats, juryKeys.overview]) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
      // 回避的人不能再看这个案件：没有投后视图，直接领下一件
      if (variables.body.vote === 'recuse' || result.case === null) {
        setRecused(variables.caseId);
        return;
      }
      setRecused(null);
      setGone(null);
      setAfter({ caseId: variables.caseId, vote: variables.body.vote, note: variables.body.note ?? null, settled: result.settled, reward: result.reward });
    },
    onError: (error, variables) => {
      const text = PANEL_GONE_TEXT[errorCode(error) ?? ''];
      if (text) {
        setRecused(null);
        setGone(`合议 #${variables.caseId}：${text}`);
        releasedRef.current = variables.caseId;
        queryClient.removeQueries({ queryKey: seniorKeys.panelNext });
        void queryClient.invalidateQueries({ queryKey: juryKeys.me });
      }
    }
  });

  const caseId = view?.case_id ?? null;
  // 手里这一件不是我自己交出去的（投票 / 回避 / 409），却换成了别的或者没了：实时事件 jury.queue.changed 会重拉队列，
  // 别的合议委员先定了案、或者案件到期转出时就会这样。要说一声，不能悄悄把正在看的案件换掉
  const heldRef = useRef<number | null>(null);
  const releasedRef = useRef<number | null>(null);
  useEffect(() => {
    const held = heldRef.current;
    heldRef.current = caseId;
    if (held !== null && held !== caseId && releasedRef.current !== held) {
      setRecused(null);
      setGone(`合议 #${held} 已经不在你手上了：其他合议委员已经定案，或者案件已经转出。${caseId !== null ? '下面是下一件。' : ''}`);
    }
  }, [caseId]);
  const focusRoot = keys.rootRef;
  useEffect(() => {
    focusRoot.current?.focus({ preventScroll: true });
  }, [caseId, focusRoot, reviewing]);

  const next = (): void => {
    vote.reset();
    setAfter(null);
  };

  if (after) {
    return (
      <div className="kjr-body kui-scroll" data-phase="after">
        <div className="kjr-wrap">
          <div className="kjr-senior-done" role="status">
            <p>
              <b>合议 #{after.caseId} · 你的判断已提交：{voteLabel(after.vote)}</b>
              <span>{after.settled ? `已有 ${panel.consensus_votes} 票一致，案件定案。` : `还差其他合议委员的票，${panel.consensus_votes} 票一致即定案。`}{after.reward && after.reward.points > 0 ? ` 风纪值 +${after.reward.points}。` : ''}下面的观点区对原审委员和合议委员开放。</span>
            </p>
            <button type="button" className="kui-btn kui-btn--primary" data-action="next-panel" onClick={next}>下一件</button>
          </div>
          <CaseDetail caseId={after.caseId} fallback={after} voteStage="panel" />
        </div>
      </div>
    );
  }

  const idle = seniorIdleReason(caseQuery, identity);
  return (
    <div ref={keys.rootRef} className="kjr-keyscope kjr-senior-scope" tabIndex={-1} data-phase={idle ?? (view ? 'review' : 'loading')} onKeyDown={keys.onKeyDown}>
      {recused !== null ? <p className="kjr-flash" role="status">已回避合议 #{recused}。有别的资深委员可以顶上时会改派给他；凑不齐 {panel.seats} 位时，案件转给管理员。</p> : null}
      {gone ? <p className="kjr-flash kjr-flash--plain" role="status" data-gone="1">{gone}</p> : null}
      {idle ? (
        <div className="kjr-body kui-scroll"><div className="kjr-wrap"><SeniorIdle reason={idle} queue="panel" error={caseQuery.error} onRetry={() => void caseQuery.refetch()} /></div></div>
      ) : !view ? <div className="kjr-body"><Loading label="正在领取合议案件…" /></div> : (
        <div className="kjr-desk">
          <div className="kjr-desk-evidence kui-scroll">
            <header className="kjr-case-head">
              <h2>合议 #{view.case_id}</h2>
              <KindTag kind={view.kind} />
              <CaseOriginTag view={view} />
              {formatRemaining(view.panel.expires_at) ? <span className="kjr-meta">合议还剩 {formatRemaining(view.panel.expires_at)}，到期没有定案会转给管理员</span> : null}
            </header>
            <WhyHere view={view} />
            <Card title="案件内容" aside={<span className="kjr-meta">{isMachineCase(view) ? '机器筛查，没有举报人' : `${reasonsText(view.reasons)} · ${view.report_count} 人举报`}</span>}>
              <p className="kjr-quiet kjr-panel-anon">发言人都用代称，看不到是谁、也看不到是哪个群。请只根据内容本身判断。</p>
              <CaseEvidence view={view} contextNear={config.config.rules.context_near} onViewerOpenChange={keys.onViewerOpenChange} />
            </Card>
            <Card title={<>原审观点<span className="kjr-count">{view.origin.opinions.reduce((sum, root) => sum + 1 + (root.replies?.length ?? 0), 0)}</span></>} aside={<span className="kjr-meta">只读 · 原审委员在本案里的匿名代号</span>}>
              <OriginOpinions opinions={view.origin.opinions} />
            </Card>
          </div>
          <VotePanel key={view.case_id} ref={panelRef} view={view} options={panelOptions(config.config.votes)} rules={moderation} extras={panelExtras(config.config, status)} noteIsOpinion pending={vote.isPending} error={vote.error ? errorText(vote.error, '合议票提交失败，请稍后重试。') : null}
            onSubmit={(value, note, category) => vote.mutate({ caseId: view.case_id, body: { vote: value as PanelVote, ...(note ? { note } : {}), ...(category ? { category } : {}) } })} />
        </div>
      )}
    </div>
  );
}
