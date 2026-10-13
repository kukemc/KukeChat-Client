import { useEffect, useState, type SyntheticEvent } from 'react';
import { Icon } from '@/components/ui/Icon';
import type { Message } from '@/types/api';
import type { Poll, PollOption } from '@/types/polls';
import { formatMessageDateTime, parseApiDate } from '@/utils/dateTime';
import { cx, useChatRow } from '../runtime';
import { PollVotersDialog } from './PollVotersDialog';
import { usePollActions } from './usePollActions';

/**
 * 当前时间，在截止前每分钟刷新一次、到点那一下再刷新一次。
 * 到了截止时间服务端不会推事件，卡片要靠它自己切成「已结束」；剩余时间的文案也靠它往前走。
 */
function useDeadlineClock(deadline: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (deadline === null || deadline <= now) {
      return;
    }
    const timer = window.setTimeout(() => setNow(Date.now()), Math.min(deadline - now, 60_000));
    return () => window.clearTimeout(timer);
  }, [deadline, now]);
  return now;
}

function remainingLabel(remainingMs: number): string {
  const minutes = Math.round(remainingMs / 60_000);
  if (minutes < 1) {
    return '即将截止';
  }
  if (minutes < 60) {
    return `${minutes} 分钟后截止`;
  }
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} 小时后截止` : `${Math.round(hours / 24)} 天后截止`;
}

function sameChoice(left: number[], right: number[]): boolean {
  return left.length === right.length && left.every((id) => right.includes(id));
}

function stop(event: SyntheticEvent): void {
  event.stopPropagation();
}

/** 聊天里的一张投票卡。数据全部来自消息缓存里的 `metadata.poll`，自己只管还没提交的勾选。 */
export function PollCard({ message, poll }: { message: Message; poll: Poll }): JSX.Element {
  const { currentUser, currentRole, isGroup, actions } = useChatRow();
  const { vote, close } = usePollActions(message, poll, actions.showToast);
  const closesAt = parseApiDate(poll.closes_at)?.getTime() ?? null;
  const now = useDeadlineClock(poll.closed ? null : closesAt);
  const closed = poll.closed || (closesAt !== null && closesAt <= now);
  // 多选时还没提交的勾选；null 表示和已提交的一致
  const [draft, setDraft] = useState<number[] | null>(null);
  const [confirmingClose, setConfirmingClose] = useState(false);
  const [votersOption, setVotersOption] = useState<PollOption | null>(null);

  const mine = poll.my_option_ids;
  const voted = mine.length > 0;
  // 没投之前不给看各项票数，免得跟风
  const showResults = voted || closed;
  const picked = closed ? mine : draft ?? mine;
  const dirty = !closed && draft !== null && !sameChoice(draft, mine);
  const canClose = !closed && (message.sender_id === currentUser.id || (isGroup && currentRole !== 'member'));
  const topVotes = Math.max(...poll.options.map((option) => option.votes));

  function pick(optionId: number): void {
    if (vote.isPending) {
      return;
    }
    const chosen = picked.includes(optionId);
    if (poll.multiple) {
      setDraft(chosen ? picked.filter((id) => id !== optionId) : [...picked, optionId]);
    } else {
      // 单选点一下就投；再点自己选的那项是撤票
      vote.mutate(chosen ? [] : [optionId]);
    }
  }

  return (
    // 行上的双击是「引用」，在卡片里连点选项不该触发它
    <div className={cx('kcp-card', closed && 'is-closed', voted && 'is-voted')} onDoubleClick={stop}>
      <div className="kcp-head">
        <Icon name="poll" className="kcp-head-icon" />
        <p className="kcp-title">{poll.title}</p>
      </div>
      <div className="kcp-tags">
        <span className="kui-tag">{poll.multiple ? '多选' : '单选'}</span>
        <span className="kui-tag">{poll.anonymous ? '匿名' : '实名'}</span>
      </div>

      <div className="kcp-options" role={poll.multiple ? 'group' : 'radiogroup'} aria-label={poll.title}>
        {poll.options.map((option) => {
          const selected = picked.includes(option.id);
          const percent = poll.total_voters > 0 ? Math.round((option.votes / poll.total_voters) * 100) : 0;
          const count = <>{option.votes} 票<span className="kcp-option-percent">{percent}%</span></>;
          return (
            <div key={option.id} className={cx('kcp-option', selected && 'is-selected', closed && topVotes > 0 && option.votes === topVotes && 'is-leading')}>
              {showResults ? <span className="kcp-option-fill" style={{ width: `${percent}%` }} /> : null}
              <button type="button" className="kcp-option-main" role={poll.multiple ? 'checkbox' : 'radio'} aria-checked={selected} disabled={closed} title={selected && !poll.multiple && !closed ? '再点一次撤回' : undefined} onClick={() => pick(option.id)}>
                <span className={cx('kcp-mark', poll.multiple && 'kcp-mark--multi')}>{selected ? <Icon name="check" className="h-3 w-3" /> : null}</span>
                <span className="kcp-option-text">{option.text}</span>
              </button>
              {!showResults ? null : poll.anonymous || option.votes === 0
                ? <span className="kcp-option-count">{count}</span>
                : <button type="button" className="kcp-option-count" title="查看投票人" onClick={() => setVotersOption(option)}>{count}</button>}
            </div>
          );
        })}
      </div>

      <div className="kcp-foot">
        {confirmingClose && canClose ? (
          <>
            <span className="kcp-foot-text">结束后不能再投票，确定结束？</span>
            <button type="button" className="kui-btn kui-btn--sm" onClick={() => setConfirmingClose(false)}>取消</button>
            <button type="button" className="kui-btn kui-btn--sm kui-btn--danger" disabled={close.isPending} onClick={() => close.mutate(undefined, { onSettled: () => setConfirmingClose(false) })}>结束</button>
          </>
        ) : (
          <>
            <span className="kcp-foot-text">
              <span className="kcp-foot-number">{poll.total_voters}</span> 人参与
              {closed ? ' · 已结束' : closesAt !== null ? <> · <time title={`${formatMessageDateTime(poll.closes_at)} 截止`}>{remainingLabel(closesAt - now)}</time></> : null}
            </span>
            {canClose ? <button type="button" className="kui-btn kui-btn--ghost kui-btn--sm" onClick={() => setConfirmingClose(true)}>结束投票</button> : null}
            {poll.multiple && !closed && (!voted || dirty) ? (
              <button type="button" className="kui-btn kui-btn--primary kui-btn--sm" disabled={!dirty || vote.isPending} onClick={() => vote.mutate(picked, { onSuccess: () => setDraft(null) })}>
                {!voted ? '投票' : picked.length === 0 ? '撤回投票' : '修改投票'}
              </button>
            ) : null}
          </>
        )}
      </div>

      {votersOption ? <PollVotersDialog conversationId={message.conversation_id} pollId={poll.id} option={votersOption} onClose={() => setVotersOption(null)} /> : null}
    </div>
  );
}
