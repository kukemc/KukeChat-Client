import { cx } from '@/components/chat/desktop/runtime';
import { Icon } from '@/components/ui/Icon';
import type { HallBallot, HallPost, HallVoteState } from '@/types/juryHall';
import { useJury } from '../context';
import { formatDateTime, formatRate, formatRemaining } from '../labels';
import { Meter } from '../widgets/Charts';
import { Card } from '../widgets/Frame';
import { passLine, proposalMath, proposalSummary, statusTag } from './labels';

/**
 * 赞成 / 反对的比例条，上面压一条「通过线」。颜色不单独表意：旁边一定有数字。
 * 还没人投票时只有空轨道和通过线。
 */
export function ProposalBar({ vote, mini = false }: { vote: HallVoteState; mini?: boolean }): JSX.Element {
  const cast = vote.yes + vote.no;
  const pass = passLine(vote);
  const line = pass.ratio * 100;
  return (
    <span className={cx('kjr-hall-bar', mini && 'is-mini')} role="img" aria-label={`赞成 ${vote.yes} 票，反对 ${vote.no} 票，通过线 ${pass.text}`}>
      <span className="kjr-hall-bar-track">
        {cast > 0 ? (
          <>
            {vote.yes > 0 ? <i className="is-yes" style={{ flexGrow: vote.yes }} /> : null}
            {vote.no > 0 ? <i className="is-no" style={{ flexGrow: vote.no }} /> : null}
          </>
        ) : null}
      </span>
      <span className="kjr-hall-bar-line" style={{ left: `${line}%` }} />
    </span>
  );
}

/** 列表行右侧的表决缩略：票数、比例条、还剩多久（或结果）。 */
export function ProposalMini({ post, vote }: { post: HallPost; vote: HallVoteState }): JSX.Element {
  const math = proposalMath(vote, post.status);
  const remaining = formatRemaining(vote.ends_at);
  const tail = post.status !== 'open' ? (post.status === 'rejected' ? (math.quorumMet ? '赞成不足' : '参与不足') : statusTag(post)?.text ?? '')
    : math.ended || !remaining ? '等待结算'
    : `还剩 ${remaining}`;
  return (
    <span className="kjr-hall-mini" data-status={post.status}>
      <span className="kjr-hall-mini-top"><b>赞成 {vote.yes}</b><span>反对 {vote.no}</span>{vote.my_vote ? <em>我投了{vote.my_vote === 'yes' ? '赞成' : '反对'}</em> : null}</span>
      <ProposalBar vote={vote} mini />
      <span className="kjr-hall-mini-foot"><span className={math.quorumMet ? undefined : 'is-short'}>参与 {math.cast} / {vote.quorum}</span><span>{tail}</span></span>
    </span>
  );
}

type StepState = 'done' | 'current' | 'fail' | 'off' | 'todo';

function steps(post: HallPost, ended: boolean): Array<{ label: string; note: string; state: StepState }> {
  const status = post.status;
  const voting: StepState = status === 'open' && !ended ? 'current' : 'done';
  const passed = status === 'passed' || status === 'adopted' || status === 'declined';
  const result: StepState = passed ? 'done' : status === 'rejected' ? 'fail' : status === 'open' && ended ? 'current' : status === 'closed' ? 'off' : 'todo';
  const admin: StepState = status === 'adopted' ? 'done' : status === 'declined' ? 'fail' : status === 'passed' ? 'current' : status === 'rejected' || status === 'closed' ? 'off' : 'todo';
  return [
    { label: '委员表决', note: voting === 'current' ? '进行中' : '已结束', state: voting },
    { label: '表决结果', note: passed ? '通过' : status === 'rejected' ? '未通过' : status === 'open' && ended ? '结算中' : '—', state: result },
    { label: '管理员采纳', note: status === 'adopted' ? '已采纳' : status === 'declined' ? '未采纳' : status === 'passed' ? '待决定' : '—', state: admin }
  ];
}

/**
 * 提案的表决面板：走到哪一步、赞成率和通过线、参与人数和门槛、还剩多久，以及投票。
 * 能不能投以服务端给的 vote.can_vote 为准；不能投时按身份说明原因。
 */
export function ProposalPanel({ post, vote, pending, error, onVote }: { post: HallPost; vote: HallVoteState; pending: HallBallot | null; error: string | null; onVote: (ballot: HallBallot) => void }): JSX.Element {
  const { identity, nav } = useJury();
  const math = proposalMath(vote, post.status);
  const tag = statusTag(post);
  const remaining = formatRemaining(vote.ends_at);
  const open = post.status === 'open' && !math.ended;
  const canVote = open && vote.can_vote && !identity.restricted;

  return (
    <Card title="表决" aside={tag ? <span className={cx('kui-tag', tag.tone)}>{tag.text}</span> : undefined} className="kjr-hall-vote">
      <ol className="kjr-hall-steps" aria-label="提案进度">
        {steps(post, math.ended).map((step, index) => (
          <li key={step.label} className={`is-${step.state}`} aria-current={step.state === 'current' ? 'step' : undefined}>
            <i>{step.state === 'done' ? <Icon name="check" className="h-3 w-3" /> : step.state === 'fail' ? <Icon name="close" className="h-3 w-3" /> : index + 1}</i>
            <span>{step.label}</span>
            <small>{step.note}</small>
          </li>
        ))}
      </ol>

      <section className="kjr-hall-vote-block">
        <p className="kjr-hall-ratio">
          <strong data-role="ratio">{formatRate(math.ratio)}</strong>
          <span>赞成率<small>通过线 {passLine(vote).text}</small></span>
        </p>
        <ProposalBar vote={vote} />
        <p className="kjr-hall-legend">
          <span><i className="is-yes" />赞成 <b data-role="yes">{vote.yes}</b></span>
          <span><i className="is-no" />反对 <b data-role="no">{vote.no}</b></span>
          <span className="kjr-hall-legend-line"><i />通过线</span>
        </p>
      </section>

      <section className="kjr-hall-vote-block">
        <dl className="kjr-dl">
          <div>
            <dt>参与人数</dt>
            <dd className={math.quorumMet ? 'kjr-yes' : undefined}><b data-role="cast">{math.cast}</b> / 需要 {vote.quorum} 人{math.quorumMet ? ' · 已达到' : ''}</dd>
          </div>
        </dl>
        <Meter value={Math.min(math.cast, vote.quorum)} max={vote.quorum} label="参与人数" />
        <dl className="kjr-dl">
          <div>
            <dt>{open ? '剩余时间' : '表决截止'}</dt>
            <dd>{open && remaining ? <>还剩 <b>{remaining}</b></> : formatDateTime(vote.ends_at)}</dd>
          </div>
          {open ? <div><dt>截止</dt><dd>{formatDateTime(vote.ends_at)}</dd></div> : null}
        </dl>
        <p className="kjr-hall-vote-summary" data-role="summary">{proposalSummary(post, vote)}</p>
      </section>

      {post.admin_note ? (
        <section className="kjr-hall-vote-block">
          <h3 className="kjr-h">管理员说明</h3>
          <blockquote className="kjr-quote">{post.admin_note}</blockquote>
        </section>
      ) : null}

      {open ? (
        <section className="kjr-hall-vote-block">
          <h3 className="kjr-h">我的一票<span>{vote.my_vote ? '结束前可以改票' : '还没投'}</span></h3>
          {canVote ? (
            <div className="kjr-hall-ballots" role="radiogroup" aria-label="我的一票">
              {(['yes', 'no'] as HallBallot[]).map((ballot) => (
                <button key={ballot} type="button" role="radio" aria-checked={vote.my_vote === ballot} data-ballot={ballot} disabled={pending !== null} className={cx('kjr-hall-ballot', `is-${ballot}`, vote.my_vote === ballot && 'is-selected')} onClick={() => {
                  if (vote.my_vote !== ballot) {
                    onVote(ballot);
                  }
                }}>
                  <Icon name={ballot === 'yes' ? 'check' : 'close'} className="h-4 w-4" />
                  {pending === ballot ? '提交中…' : ballot === 'yes' ? '赞成' : '反对'}
                </button>
              ))}
            </div>
          ) : identity.restricted ? (
            <p className="kui-note kui-note--warn">受处罚期间不能表决{identity.restriction?.until ? `，${formatDateTime(identity.restriction.until)} 恢复` : ''}。</p>
          ) : !identity.isJuror ? (
            <p className="kui-note">提案由在任的风纪委员表决，你现在可以阅读和围观。<button type="button" className="kui-link" onClick={() => nav.goSection('overview')}>了解怎样成为委员</button></p>
          ) : (
            <p className="kui-note">你现在不能对这个提案表决。</p>
          )}
        </section>
      ) : vote.my_vote ? (
        <section className="kjr-hall-vote-block">
          <p className="kjr-meta">你投的是「{vote.my_vote === 'yes' ? '赞成' : '反对'}」。</p>
        </section>
      ) : null}
      {/* 放在最外面：表决刚好在你点的时候结束（409 vote_closed），上面的投票区会跟着消失，这句话还得留着 */}
      {error ? <p className="kui-note kui-note--danger kjr-hall-vote-error" role="alert">{error}</p> : null}
    </Card>
  );
}
