import { useState } from 'react';
import { cx } from '@/components/chat/desktop/runtime';
import { Icon } from '@/components/ui/Icon';
import type { JuryOpinion } from '@/types/jury';
import { aliasMark, formatDateTime } from '../labels';
import { TierTag, VoteTag } from '../widgets/Tags';

export interface OpinionHandlers {
  /** 当前用户能不能发表、回复、点赞、举报（在任委员） */
  canAct: boolean;
  replyingTo: number | null;
  onReply: (opinion: JuryOpinion) => void;
  onLike: (opinion: JuryOpinion) => void;
  onDelete: (opinion: JuryOpinion) => void;
  onReport: (opinion: JuryOpinion) => void;
  deletingId: number | null;
}

/**
 * 观点区里的一条观点（或一条回复）。
 * 发言人只有案件内的匿名代号：前面那个方块是代号里的字母，不是头像，也不对应任何账号。
 */
export function OpinionItem({ opinion, handlers, reply = false }: { opinion: JuryOpinion; handlers: OpinionHandlers; reply?: boolean }): JSX.Element {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const gone = opinion.state !== 'visible';
  const deleting = handlers.deletingId === opinion.id;

  return (
    <li className={cx('kjr-op', reply && 'is-reply', gone && 'is-gone', opinion.mine && 'is-mine')} data-opinion={opinion.id}>
      <span className="kjr-op-mark" aria-hidden="true">{aliasMark(opinion.alias)}</span>
      <div className="kjr-op-main">
        <p className="kjr-op-head">
          <b>{opinion.alias}</b>
          {opinion.mine ? <span className="kui-tag kui-tag--accent">我</span> : null}
          {gone ? null : <TierTag tier={opinion.tier} />}
          {!gone && opinion.vote ? <VoteTag vote={opinion.vote} short /> : null}
          {!gone && opinion.is_note ? <span className="kui-tag">投票理由</span> : null}
          <time>{formatDateTime(opinion.created_at)}</time>
        </p>
        {gone ? (
          <p className="kjr-op-gone">{opinion.state === 'deleted' ? '这条观点已删除' : '这条观点被多位委员举报，已折叠，等待管理员处理'}</p>
        ) : (
          <p className="kjr-op-body">{reply && opinion.reply_to_alias ? <span className="kjr-op-to">回复 {opinion.reply_to_alias}：</span> : null}{opinion.content}</p>
        )}
        {gone ? null : (
          <p className="kjr-op-actions">
            <button type="button" className={cx('kjr-op-btn', opinion.liked && 'is-on')} aria-pressed={opinion.liked} data-action="like" disabled={!handlers.canAct || opinion.mine} title={opinion.mine ? '不能给自己的观点点赞' : undefined} onClick={() => handlers.onLike(opinion)}>
              <Icon name="like" className="h-3.5 w-3.5" />{opinion.like_count > 0 ? opinion.like_count : '赞同'}
            </button>
            {handlers.canAct ? <button type="button" className={cx('kjr-op-btn', handlers.replyingTo === opinion.id && 'is-on')} data-action="reply" onClick={() => handlers.onReply(opinion)}>回复</button> : null}
            {opinion.mine ? (
              confirmingDelete ? (
                <>
                  <button type="button" className="kjr-op-btn is-danger" data-action="confirm-delete" disabled={deleting} onClick={() => handlers.onDelete(opinion)}>{deleting ? '删除中…' : '确认删除'}</button>
                  <button type="button" className="kjr-op-btn" disabled={deleting} onClick={() => setConfirmingDelete(false)}>取消</button>
                </>
              ) : <button type="button" className="kjr-op-btn" data-action="delete" onClick={() => setConfirmingDelete(true)}>删除</button>
            ) : handlers.canAct ? (
              <button type="button" className="kjr-op-btn" data-action="report" disabled={opinion.reported} onClick={() => handlers.onReport(opinion)}>{opinion.reported ? '已举报' : '举报'}</button>
            ) : null}
          </p>
        )}
      </div>
    </li>
  );
}
