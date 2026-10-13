import { Avatar } from '@/components/ui/Avatar';
import { Modal } from '@/components/ui/desktop/Modal';
import { useRecommendedGroupJoin, type RecommendedGroupJoinModalProps } from '../recommendedGroupJoin';

/** 桌面端的推荐加群确认框。 */
export function RecommendedGroupJoinDialog(props: RecommendedGroupJoinModalProps): JSX.Element {
  const { request } = props;
  const { close, group, title, lookupFailed, notFound, needsAnswer, isInviteOnly, answer, setAnswer, resultText, canJoin, primaryLabel, isJoining, join } = useRecommendedGroupJoin(props);

  return (
    <Modal
      title="肝酱推荐添加群聊"
      subtitle="来自作品积木的群聊推荐"
      className="kmd-modal--sm"
      bodyClassName="kmd-form"
      onClose={close}
      footer={(
        <>
          {resultText ? <p className="kmd-foot-note">{resultText}</p> : null}
          <button type="button" className="kui-btn" onClick={close}>取消</button>
          <button type="button" className="kui-btn kui-btn--primary" disabled={!canJoin || isJoining} onClick={join}>{isJoining ? '处理中…' : primaryLabel}</button>
        </>
      )}
    >
      <div className="kmd-identity">
        <Avatar avatarUrl={group?.avatar_url} label={title} toneKey={request.groupId} size="lg" />
        <div>
          <strong>{title}</strong>
          <span>群号 {request.groupId}{group ? ` · ${group.member_count ?? 0} 人 · ${group.category?.trim() || '未设置分类'}` : ''}</span>
        </div>
        {group?.description?.trim() ? <p>{group.description}</p> : null}
      </div>
      {lookupFailed ? <p className="kui-note kui-note--danger" role="alert">无法获取该群聊信息，请确认群号是否存在或群聊是否公开。</p> : null}
      {notFound ? <p className="kui-note">未找到可加入的公开群聊。</p> : null}
      {isInviteOnly ? <p className="kui-note kui-note--warn">该群聊当前仅可邀请加入，无法通过推荐弹窗直接加入。</p> : null}

      {request.extraMessage ? (
        <div className="kmd-field">
          <span className="kmd-label">附加消息</span>
          <p className="kmd-quote">{request.extraMessage}</p>
        </div>
      ) : null}

      {needsAnswer ? (
        <label className="kmd-field">
          <span className="kmd-label">加群问题</span>
          <p className="kmd-question">{group?.join_question?.trim() || '请回答管理员设置的问题'}</p>
          <textarea className="kui-textarea kui-scroll" value={answer} rows={3} maxLength={500} placeholder="输入你的答案，管理员审核时会看到" onChange={(event) => setAnswer(event.target.value)} />
        </label>
      ) : null}
    </Modal>
  );
}
