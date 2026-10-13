import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { describePenaltyCode } from '@/api/moderation';
import { cx } from '@/components/chat/desktop/runtime';
import type { JuryCaseView, JuryVote, JuryVoteOption } from '@/types/jury';
import type { JuryCategory } from '@/types/juryGrowth';
import type { ModerationRules } from '@/types/moderation';
import { VOTE_NOTE_MAX } from '../data/defaults';
import { slotResetText } from '../growth/labels';
import { KIND_LABEL } from '../labels';
import { isMachineCase, MachineOriginBlock } from '../senior/caseOrigin';
import { useRestoreFocus } from '../widgets/focus';

/** 这一版界面认识的选项种类。配置里出现别的种类时先不显示，等对应的界面做出来。 */
const KNOWN_KINDS = ['clean', 'violation', 'abstain', 'recuse'];
const VERDICT_KINDS = ['clean', 'violation'];
/** 「上下文不足」的 kind 也是 abstain，靠取值区分 */
const NEED_CONTEXT = 'need_context';

export function usableVoteOptions(options: JuryVoteOption[]): JuryVoteOption[] {
  return options.filter((option) => KNOWN_KINDS.includes(option.kind));
}

/** 二期两个新选项要用到的规则数字，都来自 /jury/me 和 /jury/config */
export interface VoteExtras {
  /** 投违规票时可选的类别；没有（一期后端）就不出现「违规类别」 */
  categories: JuryCategory[];
  /** 现在还能主动回避几次（/jury/me.recuse_left_today，按最近 24 小时滚动计算，不是自然日）；后端没给时为 null */
  recuseLeft: number | null;
  recuseLimit: number | null;
  /** 回避次数下一个名额释放的时间（/jury/me.recuse_resets_at）；后端没给时为空 */
  recuseResetsAt?: string | null;
  /** 同一案件累计几张「上下文不足」后转出 */
  needContextVotes: number | null;
  /** 转出后去哪：有资深合议时是合议，否则是管理员 */
  escalatesTo: string;
  /** 回避之后案件去哪。不给就是普通评审的说法「改派给别的委员」；合议里人手不够时会转管理员，由调用方给出说法 */
  recuseGoesTo?: string;
}

/** 这个选项在规则里意味着什么：违规等级对应的记分和基础处置。规则没拉到时只显示选项自带的说明。 */
function consequence(option: JuryVoteOption, rules: ModerationRules | undefined, extras: VoteExtras): string | null {
  if (option.kind === 'clean') return '举报不成立，内容保留';
  if (option.kind === 'recuse') {
    if (extras.recuseLeft === null) return '案件改派给别人';
    if (extras.recuseLeft > 0) return `24 小时内还可回避 ${extras.recuseLeft} 次`;
    // 用完了：后端给了恢复时间就写出来（「今天 14:32 恢复一个名额」），没给就只说用完了
    const reset = slotResetText(extras.recuseResetsAt);
    return reset ? `回避次数已用完，${reset}` : '回避次数已用完';
  }
  if (option.value === NEED_CONTEXT) return extras.needContextVotes ? `累计 ${extras.needContextVotes} 票后转${extras.escalatesTo}` : '不计入表决';
  if (option.kind === 'abstain') return '这一票不算数，案件交给别的委员';
  const level = rules?.levels.find((item) => item.level === option.level);
  return level ? `L${level.level} · 记 ${level.points} 分 · ${describePenaltyCode(level.penalty)}` : option.level ? `L${option.level}` : null;
}

/** 选中「上下文不足」「主动回避」时，在选项下面把含义和后果讲清楚：这两项不是「随便点一下」的选项。 */
function specialDetail(option: JuryVoteOption, extras: VoteExtras): string[] | null {
  if (option.kind === 'recuse') {
    return [
      '认识当事人、或者和这件事有利害关系时选这一项。系统已经自动回避了它查得到的关系，这里是留给它查不到的情况。',
      `${extras.recuseGoesTo ?? '案件会改派给别的委员'}：不占席位，不计入评审数和总票数，也不影响一致率。`,
      `回避之后你不能再查看这个案件和它的观点区，页面会直接进入下一件。${extras.recuseLimit ? `24 小时内最多回避 ${extras.recuseLimit} 次${extras.recuseLeft !== null ? `，现在还剩 ${extras.recuseLeft} 次` : ''}（滚动计算，不在零点清零）。` : ''}`
    ];
  }
  if (option.value === NEED_CONTEXT) {
    return [
      '先把左边折叠的上下文全部展开看完；看完之后仍然判断不了，再选这一项。它和「内容本身看不懂」的拿不准不是一回事。',
      `这一票不计入表决${extras.needContextVotes ? `；同一个案件累计 ${extras.needContextVotes} 张这样的票，就会转给${extras.escalatesTo}处理` : ''}。`,
      '和「拿不准」一样，它计入你的弃权率。'
    ];
  }
  return null;
}

export interface VotePanelHandle {
  /** 数字键：选第几个选项（从 1 开始） */
  pick: (index: number) => void;
  /** Ctrl+Enter：第一次进入确认态，第二次真正提交 */
  advance: () => void;
  /** Esc：退出确认态。返回是否真的退出了什么 */
  cancel: () => boolean;
  /** C / Shift+C：选了违规选项时，换下一个 / 上一个违规类别。返回是否真的换了 */
  cycleCategory: (step: 1 | -1) => boolean;
}

interface VotePanelProps {
  view: JuryCaseView;
  options: JuryVoteOption[];
  rules: ModerationRules | undefined;
  extras: VoteExtras;
  /** 备注会进观点区（新后端）还是只给管理员看（旧后端） */
  noteIsOpinion: boolean;
  pending: boolean;
  error: string | null;
  onSubmit: (vote: JuryVote, note: string, category: string | null) => void;
}

/**
 * 表决面板：举报理由、选项、违规类别、备注、提交。
 *
 * 选项按种类分三组：「你的判断」（不违规 / 三档违规）、「无法判断」（拿不准 / 上下文不足）、「需要回避」。
 * 数字键按配置里的顺序对应每一个选项。提交分两步：先进入确认态，再确认 —— 防误触，但不弹窗。
 */
export const VotePanel = forwardRef<VotePanelHandle, VotePanelProps>(function VotePanel({ view, options, rules, extras, noteIsOpinion, pending, error, onSubmit }, ref) {
  const { categories } = extras;
  const [choice, setChoice] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [armed, setArmed] = useState(false);
  // 违规类别默认按举报理由映射；委员可以改
  const [category, setCategory] = useState<string | null>(() => (categories.some((item) => item.key === view.suggested_category) ? view.suggested_category ?? null : null));
  const selected = options.find((option) => option.value === choice) ?? null;
  const maxCount = Math.max(...view.reasons.map((item) => item.count), 1);
  const recusing = selected?.kind === 'recuse';
  const pickingCategory = selected?.kind === 'violation' && categories.length > 0;
  const blocked = (option: JuryVoteOption): boolean => option.kind === 'recuse' && extras.recuseLeft !== null && extras.recuseLeft <= 0;

  const pick = (value: string): void => {
    const option = options.find((item) => item.value === value);
    if (!pending && option && !blocked(option)) {
      setChoice(value);
      setArmed(false);
    }
  };
  const submit = (): void => {
    if (selected && !pending) {
      // 只带当前列表里还有的类别：配置更新后原来选的那一项可能已经不在了（服务端会回 422 invalid_category）
      onSubmit(selected.value as JuryVote, recusing ? '' : note.trim(), pickingCategory && categories.some((item) => item.key === category) ? category : null);
    }
  };

  useImperativeHandle(ref, () => ({
    pick: (index) => {
      const option = options[index - 1];
      if (option) {
        pick(option.value);
      }
    },
    advance: () => {
      if (!selected || pending) return;
      if (armed) submit();
      else setArmed(true);
    },
    cancel: () => {
      if (!armed) return false;
      setArmed(false);
      return true;
    },
    cycleCategory: (step) => {
      if (!pickingCategory || pending) return false;
      const current = categories.findIndex((item) => item.key === category);
      setCategory(categories[(current + step + categories.length) % categories.length].key);
      setArmed(false);
      return true;
    }
  }));

  const groups = [
    { title: '你的判断', verdict: true, items: options.filter((option) => VERDICT_KINDS.includes(option.kind)) },
    { title: '无法判断', verdict: false, items: options.filter((option) => option.kind === 'abstain') },
    { title: '需要回避', verdict: false, items: options.filter((option) => option.kind === 'recuse') }
  ].filter((group) => group.items.length > 0);
  const detail = selected ? specialDetail(selected, extras) : null;

  // 选项多了之后面板要滚动：选中某一项后跟出来的说明 / 违规类别可能在视野外，把它带进来
  const followRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    followRef.current?.scrollIntoView({ block: 'nearest' });
  }, [choice]);

  // 「提交」和「返回修改」点完就被换掉，焦点会掉到 body 上，接下来的 Ctrl+Enter / Esc 就没人接了：把焦点留在面板上
  const panelRef = useRef<HTMLElement>(null);
  useRestoreFocus(panelRef, armed);

  return (
    <aside ref={panelRef} tabIndex={-1} className="kjr-vote" aria-label="表决">
      <div className="kjr-vote-scroll kui-scroll">
        {/* 三期：机器来源的案件没有举报人，这一块换成来源说明 */}
        {isMachineCase(view) ? <MachineOriginBlock view={view} /> : (
        <section className="kjr-vote-block">
          <h3 className="kjr-h">举报理由<span>{KIND_LABEL[view.kind]} · {view.report_count} 人举报</span></h3>
          <ul className="kjr-reasons">
            {view.reasons.map((item) => (
              <li key={item.reason}>
                <span>{item.reason}</span>
                <span className="kjr-reasons-bar"><i style={{ width: `${(item.count / maxCount) * 100}%` }} /></span>
                <b>{item.count}</b>
              </li>
            ))}
          </ul>
        </section>
        )}

        {groups.map((group) => (
          <section key={group.title} className="kjr-vote-block">
            <h3 className="kjr-h">{group.title}</h3>
            <div className="kjr-opts" role="radiogroup" aria-label={group.title}>
              {group.items.map((option) => {
                const index = options.indexOf(option) + 1;
                const effect = consequence(option, rules, extras);
                const special = option.kind === 'recuse' ? 'is-recuse' : option.value === NEED_CONTEXT ? 'is-context' : null;
                return (
                  <button key={option.value} type="button" role="radio" aria-checked={choice === option.value} data-vote={option.value} disabled={pending || blocked(option)} className={cx('kjr-opt', `is-${option.kind}`, special, choice === option.value && 'is-selected')} onClick={() => pick(option.value)}>
                    <kbd className="kjr-key">{index}</kbd>
                    <span className="kjr-opt-main">
                      <span className="kjr-opt-top"><span className="kjr-opt-label">{option.label}</span>{effect ? <span className="kjr-opt-effect">{effect}</span> : null}</span>
                      {/* 「判断」以外的选项平时只占一行，选中了才把说明展开，七个选项才不会把面板撑得太长 */}
                      {option.hint && (group.verdict || (choice === option.value && !detail)) ? <span className="kjr-opt-hint">{option.hint}</span> : null}
                    </span>
                  </button>
                );
              })}
            </div>
            {detail && selected && group.items.includes(selected) ? (
              <ul ref={(node) => { followRef.current = node; }} className="kjr-opt-detail" data-detail={selected.value}>{detail.map((line) => <li key={line}>{line}</li>)}</ul>
            ) : null}
            {/* 违规类别紧跟在等级后面：选了哪一档违规，接着就选它属于哪一类 */}
            {group.verdict && pickingCategory ? (
              <div ref={(node) => { followRef.current = node; }} className="kjr-cats-block">
                <h3 className="kjr-h">违规类别<span>{view.suggested_category ? '已按举报理由预选，可以改' : '选一个最贴切的'}</span></h3>
                <div className="kjr-cats" role="radiogroup" aria-label="违规类别">
                  {categories.map((item) => (
                    <button key={item.key} type="button" role="radio" aria-checked={category === item.key} data-category={item.key} disabled={pending} className={cx('kjr-cat', category === item.key && 'is-selected')} onClick={() => {
                      setCategory(item.key);
                      setArmed(false);
                    }}>{item.label}{item.key === view.suggested_category ? <small>举报理由</small> : null}</button>
                  ))}
                </div>
                <p className="kjr-quiet">最终类别取违规票里的多数。类别只影响记录和公示的归类，记分和处置由上面选的等级决定。</p>
              </div>
            ) : null}
          </section>
        ))}

        {recusing ? null : (
          <section className="kjr-vote-block">
            <h3 className="kjr-h">判断理由<span>选填 · {note.length}/{VOTE_NOTE_MAX}</span></h3>
            <textarea className="kui-textarea kui-scroll" rows={3} value={note} disabled={pending} aria-label="判断理由" onChange={(event) => setNote(event.target.value.slice(0, VOTE_NOTE_MAX))} placeholder={selected?.value === NEED_CONTEXT ? '缺的是什么：比如看不出两个人之前在说什么、图片里的内容需要前文才能理解。' : noteIsOpinion ? '写下你的理由。提交后它会成为你在本案观点区的第一条观点，只有同样投过票的委员能看到。' : '补充说明，仅管理员可见。'} />
          </section>
        )}
      </div>

      <footer className="kjr-vote-foot">
        {error ? <p className="kui-note kui-note--danger" role="alert">{error}</p> : null}
        {armed && selected ? (
          <div className="kjr-confirm" role="alertdialog" aria-label="确认提交">
            {recusing
              ? <p>确认回避这个案件？<span>回避后不能再查看它，{extras.recuseGoesTo ?? '案件会改派给别的委员'}。</span></p>
              : <p>确认提交「<b>{selected.label}</b>」？<span>{pickingCategory && category ? `类别：${categories.find((item) => item.key === category)?.label ?? category}。` : ''}提交后不能修改，并且会真实生效。</span></p>}
            <div className="kjr-btn-row">
              <button type="button" className="kui-btn" disabled={pending} onClick={() => setArmed(false)}>返回修改<kbd className="kjr-key">Esc</kbd></button>
              <button type="button" className="kui-btn kui-btn--primary" data-action="confirm-vote" disabled={pending} onClick={submit}>{pending ? '提交中…' : recusing ? '确认回避' : '确认提交'}{pending ? null : <kbd className="kjr-key">Ctrl ↵</kbd>}</button>
            </div>
          </div>
        ) : (
          <button type="button" className="kui-btn kui-btn--primary kui-btn--block" data-action="submit-vote" disabled={!selected || pending} onClick={() => setArmed(true)}>
            {selected ? (recusing ? '回避这个案件' : `提交：${selected.label}`) : '请先选择一个选项'}{selected ? <kbd className="kjr-key">Ctrl ↵</kbd> : null}
          </button>
        )}
        <p className="kjr-vote-keys"><kbd className="kjr-key">1</kbd>–<kbd className="kjr-key">{options.length}</kbd> 选择{categories.length > 0 ? <><i /><kbd className="kjr-key">C</kbd> 换类别</> : null}<i />两次 <kbd className="kjr-key">Ctrl ↵</kbd> 提交<i /><kbd className="kjr-key">Esc</kbd> 取消</p>
      </footer>
    </aside>
  );
});
