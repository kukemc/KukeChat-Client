import type { JuryOpinion, JuryTally, JuryVote } from '@/types/jury';
import { OpinionItem, type OpinionHandlers } from '../detail/OpinionItem';
import { voteLabel } from '../labels';
import { SplitBar } from '../widgets/Charts';
import { StateBlock } from '../widgets/Frame';
import { VoteTag } from '../widgets/Tags';

const noop = (): void => undefined;
/** 原审的观点对合议 / 复审委员是只读的：不能赞、不能回、不能举报 */
const READ_ONLY: OpinionHandlers = { canAct: false, replyingTo: null, deletingId: null, onReply: noop, onLike: noop, onDelete: noop, onReport: noop };

const GROUP_ORDER = ['none', 'l1', 'l2', 'l3', 'need_context', 'abstain'];

/** 已有几张票：几个座位里亮了几个。只表示数量，不透露别人投了什么。 */
export function SeatDots({ cast, total, label }: { cast: number; total: number; label: string }): JSX.Element {
  return (
    <span className="kjr-seats" role="img" aria-label={`${label}：${total} 席，已有 ${cast} 票`}>
      {Array.from({ length: Math.max(total, cast) }, (_, index) => <i key={index} className={index < cast ? 'is-on' : undefined} />)}
    </span>
  );
}

const PANEL_VOTES = ['none', 'l1', 'l2', 'l3'] as const;

/** 经过资深合议的案件：合议的票数另列一条（合议不能弃权，所以只有四项）。没有合议票时不出现。 */
export function PanelTally({ tally }: { tally: JuryTally | null | undefined }): JSX.Element | null {
  const panel = tally?.panel;
  if (!panel) {
    return null;
  }
  return (
    <div data-block="panel-tally">
      <p className="kjr-sub">合议票数</p>
      <SplitBar label="合议票数" emptyText="没有票" parts={PANEL_VOTES.map((vote) => ({ key: vote, label: voteLabel(vote, true), value: panel[vote] ?? 0, tone: vote }))} />
    </div>
  );
}

/**
 * 原审委员留下的观点，按他们投的票分组排开 —— 合议 / 复审委员要看的就是「分歧在哪」：
 * 认为不违规的人怎么说、认为违规的人怎么说。回复跟着它所属的那条观点走。
 */
export function OriginOpinions({ opinions }: { opinions: JuryOpinion[] }): JSX.Element {
  if (opinions.length === 0) {
    return <StateBlock icon="message" title="原审委员没有留下理由" compact>只能根据票数分布和内容本身来判断。</StateBlock>;
  }
  const known = GROUP_ORDER.map((vote) => ({ vote, items: opinions.filter((opinion) => opinion.vote === vote) }));
  const rest = opinions.filter((opinion) => !opinion.vote || !GROUP_ORDER.includes(opinion.vote));
  const groups = [...known, { vote: '', items: rest }].filter((group) => group.items.length > 0);
  return (
    <div className="kjr-origin-ops">
      {groups.map((group) => (
        <section key={group.vote || 'other'} className="kjr-origin-group" data-vote={group.vote || 'other'}>
          <h4>{group.vote ? <VoteTag vote={group.vote as JuryVote} /> : <span className="kui-tag">没有标明</span>}<span>{group.items.length} 条观点</span></h4>
          <ul className="kjr-ops">
            {group.items.map((root) => (
              <li key={root.id} className="kjr-thread">
                <ul>
                  <OpinionItem opinion={root} handlers={READ_ONLY} />
                  {(root.replies ?? []).map((reply) => <OpinionItem key={reply.id} opinion={reply} handlers={READ_ONLY} reply />)}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
