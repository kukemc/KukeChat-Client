import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { useIsDesktopLayout } from '@/components/ui/desktop/Modal';
import { ForwardTargetDialog } from './desktop/ForwardTargetDialog';
import { filterForwardTargets, type ForwardTargetModalProps } from './forwardTargets';
import { conversationDisplayTitle } from './messageMeta';
import { ConversationAvatar } from './messageText';

export type { ForwardTargetModalProps };

/** 选一个会话，把选中的消息合并转发过去。 */
export function ForwardTargetModal(props: ForwardTargetModalProps): JSX.Element {
  return useIsDesktopLayout() ? <ForwardTargetDialog {...props} /> : <MobileForwardTargetModal {...props} />;
}

/** 手机布局下的版本：外观由 kc-mobile-overlay / kc-mobile-dialog 的样式接管。 */
function MobileForwardTargetModal({ conversations, currentUser, activeConversationId, messageIds, isPending, onConfirm, onClose }: ForwardTargetModalProps): JSX.Element {
  const [query, setQuery] = useState('');
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const filteredConversations = filterForwardTargets(conversations, currentUser, query);
  const selectedConversation = conversations.find((conversation) => conversation.id === selectedConversationId) ?? null;

  return (
    <div className="kc-mobile-overlay fixed inset-0 z-[2147483646] grid place-items-center p-4 [background:rgba(15,23,42,0.24)]" onMouseDown={onClose}>
      <div onMouseDown={(event) => event.stopPropagation()} className="kc-mobile-dialog flex h-[min(640px,88vh)] w-full max-w-[760px] flex-col overflow-hidden rounded-[26px] border shadow-float [background:var(--kc-panel)] [border-color:var(--kc-border)] [color:var(--kc-text)]">
        <header className="flex items-center justify-between gap-3 border-b p-4 [border-color:var(--kc-border)]">
          <div>
            <h2 className="text-base font-semibold">转发聊天记录</h2>
            <p className="mt-1 text-xs [color:var(--kc-muted)]">已选择 {messageIds.length} 条消息，选择一个会话发送合并转发。</p>
          </div>
          <button type="button" onClick={onClose} className="kc-icon-button h-8 w-8" aria-label="关闭转发">
            <Icon name="close" className="h-4 w-4" />
          </button>
        </header>
        <main className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(0,1fr)_280px]">
          <section className="flex min-h-0 flex-col border-r [border-color:var(--kc-border)]">
            <div className="p-3">
              <label className="flex h-10 items-center gap-2 rounded-2xl border px-3 [background:var(--kc-panel-muted)] [border-color:var(--kc-border)] focus-within:[border-color:var(--kc-accent)]">
                <Icon name="search" className="h-4 w-4 shrink-0 [color:var(--kc-muted)]" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索会话" className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none [color:var(--kc-text)] placeholder:[color:var(--kc-muted)]" autoFocus />
              </label>
            </div>
            <div className="scroll-soft min-h-0 flex-1 overflow-y-auto px-2 pb-3">
              {filteredConversations.length === 0 ? <p className="rounded-2xl p-4 text-sm [background:var(--kc-panel-muted)] [color:var(--kc-muted)]">没有找到匹配会话。</p> : null}
              <div className="grid gap-1">
                {filteredConversations.map((conversation) => {
                  const title = conversationDisplayTitle(conversation, currentUser);
                  const active = conversation.id === selectedConversationId;
                  const current = conversation.id === activeConversationId;
                  return (
                    <button key={conversation.id} type="button" onClick={() => setSelectedConversationId(conversation.id)} className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition ${active ? '[background:var(--kc-active)]' : 'hover:[background:var(--kc-hover)]'}`}>
                      <ConversationAvatar conversation={conversation} title={title} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{title}{current ? '（当前）' : ''}</span>
                        <span className="mt-0.5 block truncate text-xs [color:var(--kc-muted)]">{conversation.type === 'group' ? `群聊 · ${conversation.member_count ?? 0} 人` : '私聊'}</span>
                      </span>
                      {active ? <Icon name="check" className="h-4 w-4 shrink-0 [color:var(--kc-accent)]" /> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>
          <section className="flex min-h-0 flex-col p-4">
            <h3 className="text-sm font-semibold">发送给</h3>
            <div className="mt-3 rounded-2xl border p-3 [border-color:var(--kc-border)] [background:var(--kc-panel-muted)]">
              {selectedConversation ? (
                <div className="flex items-center gap-3">
                  <ConversationAvatar conversation={selectedConversation} title={conversationDisplayTitle(selectedConversation, currentUser)} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{conversationDisplayTitle(selectedConversation, currentUser)}</p>
                    <p className="text-xs [color:var(--kc-muted)]">{selectedConversation.type === 'group' ? '群聊' : '私聊'}</p>
                  </div>
                </div>
              ) : <p className="text-sm [color:var(--kc-muted)]">请从左侧选择一个会话</p>}
            </div>
            <label className="mt-4 block text-sm font-semibold" htmlFor="forward-note">附言</label>
            <textarea id="forward-note" value={note} onChange={(event) => setNote(event.target.value)} rows={4} placeholder="可选，添加一段说明" className="scroll-soft mt-2 resize-none rounded-2xl border bg-transparent p-3 text-sm outline-none [border-color:var(--kc-border)] [color:var(--kc-text)] placeholder:[color:var(--kc-muted)] focus:[border-color:var(--kc-accent)]" />
            <div className="mt-auto flex items-center justify-end gap-2 pt-4">
              <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-semibold transition hover:[background:var(--kc-hover)]">取消</button>
              <button type="button" disabled={!selectedConversationId || isPending} onClick={() => selectedConversationId ? onConfirm(selectedConversationId, note) : undefined} className="liquid-button rounded-xl px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-45">
                {isPending ? '转发中...' : '确认转发'}
              </button>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
