import { forwardRef, useImperativeHandle, useState } from 'react';
import { describePenaltyCode } from '@/api/moderation';
import { cx } from '@/components/chat/desktop/runtime';
import type { JuryCategory } from '@/types/juryGrowth';
import type { AppealReviewView, AppealVote, AppealVoteBody, JuryPanelRules } from '@/types/jurySenior';
import type { ModerationRules } from '@/types/moderation';
import { VOTE_NOTE_MAX } from '../data/defaults';
import { LEVEL_NAME } from '../labels';
import { hasRestriction } from './labels';
import { SeatDots } from './OriginReview';
import type { VoteKeyTarget } from './useVoteKeys';
import { modKeyLabel } from '@/utils/platform';

interface ReviewOption {
  value: AppealVote;
  label: string;
  /** 一眼能看到的后果 */
  effect: string;
  /** 这一票意味着什么 */
  hint: string;
}

/** 三个选项各自的后果（docs/jury-v2.md 3.2）；举报人复议只有两个（3.7）。 */
function reviewOptions(review: AppealReviewView): ReviewOption[] {
  if (review.type === 'reconsider') {
    return [
      { value: 'uphold', label: '维持原结论', effect: '举报仍不成立', hint: '原审认定不违规没有问题。内容保留；一个案件只能复议一次，这就是最后的结论。' },
      { value: 'overturn', label: '改判为违规', effect: '案件改判', hint: '原结论有误。案件按改判处理：内容撤回，并按你选的等级记分和处置。' }
    ];
  }
  const restricting = hasRestriction(review.penalty);
  const what = review.penalty?.kind === 'ban' ? '封禁' : '禁言';
  return [
    { value: 'uphold', label: '维持', effect: '申诉驳回', hint: '违规成立，处罚也合适。违规记录、记分和处罚都保持不变。' },
    {
      value: 'reduce', label: '减轻', effect: restricting ? `解除${what}，保留记录` : '保留记录',
      hint: restricting ? `违规成立，但处罚偏重。保留违规记录和记分，解除这条处罚带来的${what}。` : '违规成立，但处置偏重。这条处罚没有禁言或封禁，所以「减轻」不会带来实际变化，只表明你的态度。'
    },
    {
      value: 'revoke', label: '撤销', effect: '撤销处罚和记分',
      hint: review.source === 'machine' ? '不该处罚。撤销这条处罚和记分，能恢复的内容会恢复。' : '不该处罚。撤销处罚和记分；原案件按改判处理，参与原审的委员「是否与结论一致」也会跟着变。'
    }
  ];
}

interface AppealVotePanelProps {
  review: AppealReviewView;
  rules: JuryPanelRules;
  /** 改判为违规时：各等级对应的记分和处置 */
  moderation: ModerationRules | undefined;
  /** 改判为违规时可选的类别；没有就不出现 */
  categories: JuryCategory[];
  pending: boolean;
  error: string | null;
  onSubmit: (body: AppealVoteBody) => void;
}

/**
 * 复审的表决面板：席位、选项和各自的后果、理由、两步提交。结构和评审台的表决面板一致，选项不同。
 * 举报人复议选「改判为违规」时，还要定一个等级。
 */
export const AppealVotePanel = forwardRef<VoteKeyTarget, AppealVotePanelProps>(function AppealVotePanel({ review, rules, moderation, categories, pending, error, onSubmit }, ref) {
  const options = reviewOptions(review);
  const [choice, setChoice] = useState<AppealVote | null>(null);
  const [level, setLevel] = useState<number | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [armed, setArmed] = useState(false);
  const selected = options.find((option) => option.value === choice) ?? null;
  const overturning = choice === 'overturn';
  const ready = selected !== null && (!overturning || level !== null);
  // 改判最高到 L3：更重的只能由管理员给
  const levels = (moderation?.levels ?? [1, 2, 3].map((value) => ({ level: value, points: 0, penalty: '' }))).filter((item) => item.level >= 1 && item.level <= 3);

  const pick = (value: AppealVote): void => {
    if (!pending) {
      setChoice(value);
      setArmed(false);
    }
  };
  const submit = (): void => {
    if (ready && selected && !pending) {
      onSubmit({ vote: selected.value, ...(note.trim() ? { note: note.trim() } : {}), ...(overturning && level ? { level } : {}), ...(overturning && category ? { category } : {}) });
    }
  };

  useImperativeHandle(ref, () => ({
    pick: (index) => {
      const option = options[index - 1];
      if (option) pick(option.value);
    },
    advance: () => {
      if (!ready || pending) return;
      if (armed) submit();
      else setArmed(true);
    },
    cancel: () => {
      if (!armed) return false;
      setArmed(false);
      return true;
    }
  }));

  return (
    <aside className="kjr-vote" aria-label="复审表决">
      <div className="kjr-vote-scroll kui-scroll">
        <section className="kjr-vote-block">
          <h3 className="kjr-h">复审席位<span>{review.seats} 席 · 已投 {review.votes_cast}</span></h3>
          <p className="kjr-vs-line"><SeatDots cast={review.votes_cast} total={review.seats} label="复审席位" /><span className="kjr-meta">{rules.consensus_votes} 票相同即出结果{review.type === 'reconsider' ? '' : '，三票各不相同按「减轻」处理'}</span></p>
          <p className="kjr-quiet">出结果之前看不到别人投了什么。{rules.timeout_hours} 小时没有结果会转给管理员；管理员也可以改掉复审的结论。</p>
        </section>

        <section className="kjr-vote-block">
          <h3 className="kjr-h">你的意见</h3>
          <div className="kjr-opts" role="radiogroup" aria-label="复审意见">
            {options.map((option, index) => (
              <button key={option.value} type="button" role="radio" aria-checked={choice === option.value} data-vote={option.value} disabled={pending} className={cx('kjr-opt', choice === option.value && 'is-selected')} onClick={() => pick(option.value)}>
                <kbd className="kjr-key">{index + 1}</kbd>
                <span className="kjr-opt-main">
                  <span className="kjr-opt-top"><span className="kjr-opt-label">{option.label}</span><span className="kjr-opt-effect">{option.effect}</span></span>
                  <span className="kjr-opt-hint">{option.hint}</span>
                </span>
              </button>
            ))}
          </div>
        </section>

        {overturning ? (
          <section className="kjr-vote-block" data-block="overturn-level">
            <h3 className="kjr-h">改判的等级<span>必选</span></h3>
            <div className="kjr-opts" role="radiogroup" aria-label="改判的等级">
              {levels.map((item) => (
                <button key={item.level} type="button" role="radio" aria-checked={level === item.level} data-level={item.level} disabled={pending} className={cx('kjr-opt kjr-opt--plain', level === item.level && 'is-selected')} onClick={() => {
                  setLevel(item.level);
                  setArmed(false);
                }}>
                  <span className="kjr-opt-main">
                    <span className="kjr-opt-top"><span className="kjr-opt-label">L{item.level} {LEVEL_NAME[item.level] ?? ''}</span>{item.penalty ? <span className="kjr-opt-effect">记 {item.points} 分 · {describePenaltyCode(item.penalty)}</span> : null}</span>
                  </span>
                </button>
              ))}
            </div>
            {categories.length > 0 ? (
              <>
                <p className="kjr-sub kjr-review-sub">违规类别（选填）</p>
                {/* 和评审台表决面板里的「违规类别」用同一组样式类 */}
                <div className="kjr-cats" role="radiogroup" aria-label="违规类别">
                  {categories.map((item) => <button key={item.key} type="button" role="radio" aria-checked={category === item.key} data-category={item.key} disabled={pending} className={cx('kjr-cat', category === item.key && 'is-selected')} onClick={() => setCategory(category === item.key ? null : item.key)}>{item.label}</button>)}
                </div>
              </>
            ) : null}
            <p className="kjr-quiet">最终等级取改判票里偏低的中位数。</p>
          </section>
        ) : null}

        <section className="kjr-vote-block">
          <h3 className="kjr-h">理由<span>选填 · {note.length}/{VOTE_NOTE_MAX}</span></h3>
          <textarea className="kui-textarea kui-scroll" rows={3} value={note} disabled={pending} aria-label="复审理由" onChange={(event) => setNote(event.target.value.slice(0, VOTE_NOTE_MAX))} placeholder={review.type === 'reconsider' ? '为什么维持或改判。理由留给管理员和其他复审委员参考。' : '为什么这么判断：申诉理由里哪一点成立、哪一点不成立。理由留给管理员和其他复审委员参考。'} />
        </section>
      </div>

      <footer className="kjr-vote-foot">
        {error ? <p className="kui-note kui-note--danger" role="alert">{error}</p> : null}
        {armed && selected ? (
          <div className="kjr-confirm" role="alertdialog" aria-label="确认提交">
            <p>确认提交「<b>{selected.label}</b>」？<span>{overturning && level ? `等级：L${level} ${LEVEL_NAME[level] ?? ''}。` : ''}提交后不能修改，结果会真实生效并通知{review.type === 'reconsider' ? '举报人' : '申诉人'}。</span></p>
            <div className="kjr-btn-row">
              <button type="button" className="kui-btn" disabled={pending} onClick={() => setArmed(false)}>返回修改<kbd className="kjr-key">Esc</kbd></button>
              <button type="button" className="kui-btn kui-btn--primary" data-action="confirm-vote" disabled={pending} onClick={submit}>{pending ? '提交中…' : '确认提交'}{pending ? null : <kbd className="kjr-key">{modKeyLabel()} ↵</kbd>}</button>
            </div>
          </div>
        ) : (
          <button type="button" className="kui-btn kui-btn--primary kui-btn--block" data-action="submit-vote" disabled={!ready || pending} onClick={() => setArmed(true)}>
            {!selected ? '请先选择一项' : !ready ? '请选择改判的等级' : `提交：${selected.label}`}{ready ? <kbd className="kjr-key">{modKeyLabel()} ↵</kbd> : null}
          </button>
        )}
        <p className="kjr-vote-keys"><kbd className="kjr-key">1</kbd>–<kbd className="kjr-key">{options.length}</kbd> 选择<i />两次 <kbd className="kjr-key">{modKeyLabel()} ↵</kbd> 提交<i /><kbd className="kjr-key">Esc</kbd> 取消</p>
      </footer>
    </aside>
  );
});
