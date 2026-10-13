import { ConversationAvatar } from '@/components/chat/message/messageText';
import { Icon } from '@/components/ui/Icon';
import type { User } from '@/types/api';
import { shareTargetTitle } from '../teamupModel';
import type { TeamupDetailState } from '../useTeamupDetail';

/** 分享名片：先选「转发到会话」还是「复制链接」，转发再选一个会话。 */
export function TeamupShareDialog({ detail, currentUser }: { detail: TeamupDetailState; currentUser: User }): JSX.Element {
  const { shareMode, shareTargetId, shareDone, linkCopied, shareMutation, conversations, conversationsQuery } = detail;
  const forwarding = shareMode === 'forward';

  return (
    <div className="kui-backdrop" onMouseDown={detail.closeShare}>
      <div role="dialog" aria-modal="true" aria-label="分享组队名片" className="kui-dialog ktu-share" onMouseDown={(event) => event.stopPropagation()}>
        <header className="kui-dialog-header">
          <span>分享组队名片</span>
          <button type="button" className="kui-icon-btn" aria-label="关闭" onClick={() => detail.setShareOpen(false)}><Icon name="close" className="h-4 w-4" /></button>
        </header>
        <div className="kui-dialog-body ktu-share-body">
          <p className="kui-muted">{forwarding ? '选择一个群聊或好友，发送这张求组队名片。对方点击即可打开详情页。' : '转发名片到联系人或群聊，也可以复制带文案的分享链接。'}</p>
          {detail.actionError ? <p className="kui-note kui-note--danger" role="alert">{detail.actionError}</p> : null}
          {forwarding ? (
            <div className="ktu-options kui-scroll">
              {conversationsQuery.isLoading ? <p className="kui-empty">加载会话中…</p> : null}
              {!conversationsQuery.isLoading && conversations.length === 0 ? <p className="kui-empty">暂无可分享的会话</p> : null}
              {conversations.map((conversation) => {
                const active = conversation.id === shareTargetId;
                const title = shareTargetTitle(conversation, currentUser);
                return (
                  <button key={conversation.id} type="button" role="option" aria-selected={active} className={`ktu-option ${active ? 'is-selected' : ''}`} onClick={() => detail.setShareTargetId(conversation.id)}>
                    <ConversationAvatar conversation={conversation} title={title} size="sm" />
                    <span className="ktu-option-text">
                      <span>{title}</span>
                      <span>{conversation.type === 'group' ? `群聊 · ${conversation.member_count ?? 0} 人` : '好友/私聊'}</span>
                    </span>
                    {active ? <Icon name="check" className="ktu-option-check" /> : null}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="ktu-options">
              <button type="button" className="ktu-option" onClick={() => detail.setShareMode('forward')}>
                <Icon name="send" className="ktu-option-icon" />
                <span className="ktu-option-text">
                  <span>转发组队名片</span>
                  <span>选择一个群或联系人发送可点开的名片卡片。</span>
                </span>
                <Icon name="chevron" className="ktu-option-arrow" />
              </button>
              <button type="button" className="ktu-option" onClick={() => void detail.copyShareLink()}>
                <Icon name={linkCopied ? 'check' : 'copy'} className="ktu-option-icon" />
                <span className="ktu-option-text">
                  <span>{linkCopied ? '已复制到剪贴板' : '复制链接'}</span>
                  <span>复制带文案的分享链接，发到任意地方。</span>
                </span>
              </button>
            </div>
          )}
        </div>
        {forwarding ? (
          <footer className="kui-dialog-footer">
            <button type="button" className="kui-btn" onClick={() => detail.setShareMode('menu')}>返回</button>
            <button type="button" className="kui-btn kui-btn--primary" disabled={!shareTargetId || shareMutation.isPending || shareDone} onClick={() => shareMutation.mutate()}>
              {shareDone ? <><Icon name="check" className="h-3.5 w-3.5" />已发送</> : shareMutation.isPending ? '发送中…' : '发送名片'}
            </button>
          </footer>
        ) : null}
      </div>
    </div>
  );
}
