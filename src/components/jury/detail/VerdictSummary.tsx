import { cx } from '@/components/chat/desktop/runtime';
import { Icon } from '@/components/ui/Icon';
import type { JuryCaseDetail } from '@/types/jury';
import { useJury } from '../context';
import { signed } from '../growth/labels';
import { consensusRuleText, formatDateTime, formatHours, levelText, publicCaseNo, SOURCE_LABEL, STAGE_LABEL } from '../labels';
import { Explanation } from '../practice/Ballots';
import { CasePrecedent } from '../precedents/PrecedentLinks';
import { isUnhandledMachineCase, UnhandledNote, UnhandledTag } from '../senior/caseOrigin';
import { PanelTally } from '../senior/OriginReview';
import { Card } from '../widgets/Frame';
import { AgreeTag, OutcomeTag, TallyBar, VoteTag } from '../widgets/Tags';

/** 已经收到几张有效票：几个座位里亮了几个。定案前只有这个数字，没有分布。 */
function Seats({ cast, total }: { cast: number; total: number }): JSX.Element {
  return (
    <span className="kjr-seats" role="img" aria-label={`已有 ${cast} 张有效票，最多 ${total} 张`}>
      {Array.from({ length: Math.max(total, cast) }, (_, index) => <i key={index} className={index < cast ? 'is-on' : undefined} />)}
    </span>
  );
}

function MyVote({ detail, voteStage }: { detail: JuryCaseDetail; voteStage?: 'jury' | 'panel' }): JSX.Element {
  const { config } = useJury();
  const mine = detail.my_vote;
  // 三期：合议票的结算分值和普通票不一样（panel_agreed / panel_disagreed）
  const panelVote = (mine.stage ?? voteStage) === 'panel';
  // 二期：这一票的风纪值。已经结算的显示数字；还没定案的说明什么时候结算
  const table = config.has('points') ? config.config.points : undefined;
  const verdictVote = ['none', 'l1', 'l2', 'l3'].includes(mine.vote);
  const earned = mine.points ?? 0;
  return (
    <section className="kjr-vs-block">
      <h3 className="kjr-h">我的判断</h3>
      <p className="kjr-vs-line"><VoteTag vote={mine.vote} /><AgreeTag agreed={mine.agreed} /></p>
      {/* 二期：投违规票时我选的类别。认不出的 key（配置变过）原样显示 */}
      {mine.category ? <p className="kjr-meta" data-my-category={mine.category}>我选的类别：{config.config.categories?.find((item) => item.key === mine.category)?.label ?? mine.category}</p> : null}
      {mine.note ? <blockquote className="kjr-quote">{mine.note}</blockquote> : null}
      <p className="kjr-meta">{formatDateTime(mine.voted_at)} 提交{mine.alias ? ` · 在本案的代号是「${mine.alias}」` : ''}</p>
      {table ? (
        <p className="kjr-vs-points" data-vote-points={earned}>
          <span>这一票的风纪值</span>
          {earned !== 0 ? <b className={earned < 0 ? 'kjr-no' : undefined}>{signed(earned)}</b>
            : !verdictVote ? <small>弃权不计分</small>
            : detail.stage === 'closed' ? <b>0</b>
            : panelVote && table.panel_agreed ? <small data-points-kind="panel">合议定案后结算：一致 {signed(table.panel_agreed)}{table.panel_disagreed ? `，不一致 ${signed(table.panel_disagreed)}` : ''}</small>
            : <small>定案后结算{table.vote_agreed ? `：一致 ${signed(table.vote_agreed)}` : ''}{table.vote_disagreed ? `，不一致 ${signed(table.vote_disagreed)}` : ''}</small>}
        </p>
      ) : null}
    </section>
  );
}

/** 案件详情右侧的摘要：我的票，案件的进展和结论。 */
export function VerdictSummary({ detail, voteStage }: { detail: JuryCaseDetail; /** 调用方知道这一票是合议票时传进来（资深工作台的投后视图） */ voteStage?: 'jury' | 'panel' }): JSX.Element {
  const { config, nav } = useJury();
  const rules = config.config.rules;
  const verdict = detail.verdict;
  const publicId = detail.is_quality_check ? null : detail.public_case_id ?? null;
  // 三期：没人举报的机器案件「未作处理」结案（outcome 是 clean、source 是 auto）。不能显示成「认定不违规」
  const unhandled = isUnhandledMachineCase({ case_origin: detail.case_origin, outcome: verdict?.outcome, source: verdict?.source });
  return (
    <Card className="kjr-vs">
      <MyVote detail={detail} voteStage={voteStage} />
      {detail.is_quality_check ? null : (
        <section className="kjr-vs-block">
          <h3 className="kjr-h">案件进展<span>{STAGE_LABEL[detail.stage] ?? detail.stage}</span></h3>
          {verdict ? (
            <>
              <p className="kjr-vs-line">{unhandled ? <UnhandledTag /> : <OutcomeTag outcome={verdict.outcome} level={verdict.level} overturned={verdict.overturned} />}</p>
              {unhandled ? <UnhandledNote /> : null}
              {/* 改判后 outcome / 类别 / 等级是新结论，来源和票数分布仍是原审的：分开标明，不让票数去「解释」现在的结论 */}
              {verdict.overturned ? <p className="kui-note kui-note--warn" data-notice="overturned">原审的结论在定案后被改判，上面是改判后的结论。{verdict.overturn_note ? `改判说明：${verdict.overturn_note}` : ''}</p> : null}
              <dl className="kjr-dl">
                {verdict.category_label ? <div><dt>类别</dt><dd>{verdict.category_label}{verdict.level ? ` · ${levelText(verdict.level)}` : ''}</dd></div> : null}
                <div><dt>{verdict.overturned ? '原审来源' : '结论来源'}</dt><dd>{SOURCE_LABEL[verdict.source] ?? verdict.source}</dd></div>
                <div><dt>{verdict.overturned ? '原审定案' : '定案时间'}</dt><dd>{formatDateTime(verdict.closed_at)}</dd></div>
                <div><dt>{verdict.overturned ? '原审用时' : '用时'}</dt><dd>{formatHours(verdict.hours)}</dd></div>
              </dl>
              {verdict.explanation ? <Explanation text={verdict.explanation} /> : null}
              {detail.tally ? (
                <>
                  <p className="kjr-sub">{verdict.overturned ? '原审的票数分布' : '票数分布'}</p>
                  <TallyBar tally={detail.tally} />
                  {verdict.overturned ? <p className="kjr-meta" data-note="tally-original">这是改判之前委员们投的票，和现在的结论不对应。</p>
                    : verdict.source === 'admin' ? <p className="kjr-meta" data-note="tally-admin">结论由管理员裁定。这是案件转给管理员之前委员们已经投出的票，不是结论的依据。</p>
                    : null}
                </>
              ) : null}
              {/* 三期：经过资深合议的案件，合议的票另列一条 */}
              <PanelTally tally={detail.tally} />
            </>
          ) : (
            <>
              <p className="kjr-vs-line"><Seats cast={detail.votes_cast} total={rules.seats_per_case} /><b>已有 {detail.votes_cast} 张有效票</b></p>
              <p className="kjr-meta">
                {detail.stage === 'jury' ? `${consensusRuleText(rules, config.has('panel'))}${rules.severe_min_votes ? `按现有的票会定为严重违规时，至少要 ${rules.severe_min_votes} 张有效票。` : ''}${detail.case_origin === 'machine' && detail.report_count === 0 ? '这个案件来自机器筛查、没有举报人：转不进合议时不会交给管理员，而是按「未作处理」结案。' : ''}定案前不显示票数分布，免得影响还没投票的委员。`
                  // 转出的原因接口没有单独给：没有共识、超时，二期起还有「累计几张上下文不足」，三种都要说到
                  : `${rules.need_context_votes ? `委员之间没有形成共识、有 ${rules.need_context_votes} 位委员认为上下文不足、或者已经超时` : '委员之间没有形成共识或已超时'}，案件交给${detail.stage === 'panel' ? '资深委员合议' : '管理员处理'}。`}
              </p>
            </>
          )}
        </section>
      )}
      {/* 去公示栏只能用 public_case_id：委员侧的 case_id 是评审编号，拿它去请求公示接口会指到别的案件 */}
      {typeof publicId === 'number' && config.has('public_cases') ? (
        <section className="kjr-vs-block" data-block="public-link">
          <h3 className="kjr-h">公示</h3>
          <p className="kjr-meta">这个案件已经在公示栏公开，公开编号是「{publicCaseNo(publicId)}」。评审编号只有你自己看得到，和公开编号不通用。</p>
          <div><button type="button" className="kui-btn kui-btn--sm" data-action="open-public-case" onClick={() => nav.goSection('bulletin', { caseId: publicId })}>在公示栏查看</button></div>
        </section>
      ) : null}
      {/* 三期：本案是判例时指过去；资深委员可以把自己投过票的已定案件标为判例 */}
      <CasePrecedent detail={detail} />
    </Card>
  );
}

/** 质控题的培训反馈：你的判断和标准结论并排放。质控题没有票数、没有观点区。 */
export function QualityCheckFeedback({ detail }: { detail: JuryCaseDetail }): JSX.Element {
  const agreed = detail.my_vote.agreed;
  const verdict = detail.verdict;
  return (
    <Card className={cx('kjr-qc', agreed === true && 'is-ok', agreed === false && 'is-miss')} title="这是一道质控题" aside={<span className="kui-tag kui-tag--accent">培训反馈</span>}>
      <p className="kjr-text">质控题是已经有标准结论的案例，混在真实案件里，用来帮每位委员校准尺度。它不会对任何人产生处罚，你写的理由只有管理员能看到。</p>
      <div className="kjr-qc-compare">
        <div><span className="kjr-sub">你的判断</span><VoteTag vote={detail.my_vote.vote} /></div>
        <Icon name={agreed === true ? 'check' : agreed === false ? 'close' : 'minus'} className="h-4 w-4" />
        <div><span className="kjr-sub">标准结论</span>{verdict ? <span><OutcomeTag outcome={verdict.outcome} level={verdict.level} /></span> : <span className="kjr-meta">暂无</span>}</div>
      </div>
      <p className="kjr-qc-result">
        {agreed === true ? '判断一致。' : agreed === false ? '这次和标准结论不一致。可以对照规则手册里的违规类别和等级，再看一遍上面的内容。' : '你选择了弃权，这道题不计入质控成绩。'}
        {verdict?.category_label ? ` 标准结论认定的类别是「${verdict.category_label}」。` : ''}
      </p>
      {verdict?.explanation ? <Explanation text={verdict.explanation} /> : null}
    </Card>
  );
}
