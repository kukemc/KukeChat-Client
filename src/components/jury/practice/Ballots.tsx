import { cx } from '@/components/chat/desktop/runtime';
import { Icon } from '@/components/ui/Icon';
import type { JuryVoteOption } from '@/types/jury';
import type { JuryBallot, JuryQuestionContent, JuryStandardAnswer } from '@/types/juryGrowth';
import { answerBallot, ballotOutcome } from '../growth/labels';
import { KIND_LABEL, levelText, OUTCOME_LABEL } from '../labels';

// 考试和练习场共用的两块：四个判断选项，和一道题的标准结论。

/** 题目上方的那一段：这是什么类型的内容、被举报的理由。没有举报人数 —— 题目不是进行中的案件。 */
export function QuestionReasons({ question }: { question: JuryQuestionContent }): JSX.Element {
  return (
    <section className="kjr-vote-block">
      <h3 className="kjr-h">举报理由<span>{KIND_LABEL[question.kind] ?? question.kind}</span></h3>
      <ul className="kjr-pq-reasons">
        {question.reasons.length === 0 ? <li>未注明</li> : question.reasons.map((item) => <li key={item.reason}>{item.reason}{item.count > 1 ? <b>×{item.count}</b> : null}</li>)}
      </ul>
    </section>
  );
}

/**
 * 四个判断选项（不违规 / 轻微 / 一般 / 严重），外观和评审台的选项是同一套。
 * reveal 给了标准结论之后进入「对答案」的样子：选中的那项标出对错，标准结论对应的那项标出来，不能再改。
 */
export function BallotList({ options, value, disabled = false, reveal, onPick }: {
  options: JuryVoteOption[];
  value: JuryBallot | null;
  disabled?: boolean;
  reveal?: JuryStandardAnswer | null;
  onPick: (vote: JuryBallot) => void;
}): JSX.Element {
  const standard = reveal ? answerBallot(reveal) : null;
  return (
    <div className="kjr-opts" role="radiogroup" aria-label="你的判断">
      {options.map((option, index) => {
        const vote = option.value as JuryBallot;
        const selected = value === vote;
        // 只按「违规 / 不违规」算对错：选了违规但等级不同，仍然算对
        const right = reveal ? ballotOutcome(vote) === reveal.outcome : null;
        return (
          <button key={option.value} type="button" role="radio" aria-checked={selected} data-ballot={option.value} disabled={disabled || Boolean(reveal)}
            className={cx('kjr-opt', `is-${option.kind}`, selected && 'is-selected', reveal && 'is-revealed', reveal && selected && (right ? 'is-right' : 'is-wrong'), reveal && standard === option.value && 'is-standard')}
            onClick={() => onPick(vote)}>
            <kbd className="kjr-key">{index + 1}</kbd>
            <span className="kjr-opt-main">
              <span className="kjr-opt-top">
                <span className="kjr-opt-label">{option.label}</span>
                {reveal ? (
                  <span className="kjr-opt-marks">
                    {selected ? <span className={cx('kui-tag', right ? 'kui-tag--ok' : 'kui-tag--danger')}><Icon name={right ? 'check' : 'close'} className="h-3 w-3" />你的判断</span> : null}
                    {standard === option.value ? <span className="kui-tag kui-tag--accent">标准结论</span> : null}
                  </span>
                ) : null}
              </span>
              {option.hint ? <span className="kjr-opt-hint">{option.hint}</span> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** 一道题的标准结论：结论、等级、类别，下面是讲解（没有讲解就不显示，不放占位的话）。 */
export function StandardAnswer({ answer, compact = false }: { answer: JuryStandardAnswer; compact?: boolean }): JSX.Element {
  return (
    <div className={cx('kjr-answer', compact && 'is-compact')}>
      <p className="kjr-answer-line">
        <span className={cx('kui-tag', answer.outcome === 'violation' ? 'kui-tag--danger' : 'kui-tag--ok')}>{OUTCOME_LABEL[answer.outcome]}</span>
        {answer.outcome === 'violation' && answer.level ? <span className="kjr-answer-fact">{levelText(answer.level)}</span> : null}
        {answer.category_label ? <span className="kjr-answer-fact">{answer.category_label}</span> : null}
      </p>
      {answer.explanation ? <Explanation text={answer.explanation} /> : null}
    </div>
  );
}

/** 题库里的讲解。质控题的投后反馈、练习场、考试结果用的是同一个来源，所以长得一样。 */
export function Explanation({ text }: { text: string }): JSX.Element {
  return (
    <div className="kjr-explain">
      <span className="kjr-explain-title">讲解</span>
      <p>{text}</p>
    </div>
  );
}
