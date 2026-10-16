import { useState } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { conversationTier } from '@/components/groupPlus/tier';
import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/desktop/Modal';
import type { Conversation } from '@/types/api';
import { filterForwardTargets, type ForwardTargetModalProps } from '../forwardTargets';
import { conversationDisplayTitle } from '../messageMeta';

function TargetAvatar({ conversation, title }: { conversation: Conversation; title: string }): JSX.Element {
  return conversation.type === 'group'
    ? <Avatar avatarUrl={conversation.avatar_url} label={title} toneKey={conversation.id} size="sm" plusTier={conversationTier(conversation)} />
    : <Avatar user={conversation.direct_user} label={title} size="sm" />;
}

/** 桌面端的转发对话框：左边选会话，右边确认发送对象、写附言。 */
export function ForwardTargetDialog({ conversations, currentUser, activeConversationId, messageIds, isPending, onConfirm, onClose }: ForwardTargetModalProps): JSX.Element {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const matches = filterForwardTargets(conversations, currentUser, query);
  const selected = conversations.find((conversation) => conversation.id === selectedId) ?? null;
  const selectedTitle = selected ? conversationDisplayTitle(selected, currentUser) : '';

  return (
    <Modal
      title="转发聊天记录"
      subtitle={`已选 ${messageIds.length} 条消息，合并转发`}
      className="kmd-modal--lg kmd-modal--tall"
      bodyClassName="kmd-forward"
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="kui-btn" onClick={onClose}>取消</button>
          <button type="button" className="kui-btn kui-btn--primary" disabled={!selected || isPending} onClick={() => selected ? onConfirm(selected.id, note) : undefined}>{isPending ? '转发中…' : '确认转发'}</button>
        </>
      )}
    >
      <section className="kmd-forward-pick">
        <div className="kmd-toolbar">
          <label className="kui-field">
            <Icon name="search" className="h-3.5 w-3.5" />
            <input value={query} placeholder="搜索会话" aria-label="搜索会话" autoFocus onChange={(event) => setQuery(event.target.value)} />
          </label>
        </div>
        <div className="kmd-options kui-scroll" role="listbox" aria-label="选择会话">
          {matches.length === 0 ? <p className="kui-empty">没有找到匹配会话。</p> : matches.map((conversation) => {
            const title = conversationDisplayTitle(conversation, currentUser);
            const active = conversation.id === selectedId;
            return (
              <button key={conversation.id} type="button" role="option" aria-selected={active} className={active ? 'kmd-option is-selected' : 'kmd-option'} onClick={() => setSelectedId(conversation.id)}>
                <TargetAvatar conversation={conversation} title={title} />
                <span className="kmd-option-text">
                  <span>{title}{conversation.id === activeConversationId ? <span className="kui-tag">当前</span> : null}</span>
                  <span>{conversation.type === 'group' ? `群聊 · ${conversation.member_count ?? 0} 人` : '私聊'}</span>
                </span>
                <span className="kmd-radio" />
              </button>
            );
          })}
        </div>
      </section>
      <section className="kmd-forward-send">
        <h3 className="kmd-label">发送给</h3>
        {selected ? (
          <div className="kmd-forward-target">
            <TargetAvatar conversation={selected} title={selectedTitle} />
            <span className="kmd-option-text">
              <span>{selectedTitle}</span>
              <span>{selected.type === 'group' ? '群聊' : '私聊'}</span>
            </span>
          </div>
        ) : <p className="kmd-forward-target is-empty">请从左侧选择一个会话</p>}
        <label className="kmd-label" htmlFor="kmd-forward-note">附言</label>
        <textarea id="kmd-forward-note" className="kui-textarea kui-scroll" value={note} rows={5} placeholder="可选，添加一段说明" onChange={(event) => setNote(event.target.value)} />
      </section>
    </Modal>
  );
}
