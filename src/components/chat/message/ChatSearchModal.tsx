import { useEffect } from 'react';
import type { Message } from '@/types/api';
import { Icon } from '@/components/ui/Icon';
import { registerNativeBackHandler } from '@/native/back';
import { useChatSearch } from './chatSearch';
import { ChatSearchDialog } from './desktop/ChatSearchDialog';
import { formatMessageTime, messageSenderLabel } from './messageMeta';
import { renderMessageContentPreview } from './messageContent';

export interface ChatSearchModalProps {
  conversationId: number;
  title: string;
  mobile?: boolean;
  onOpenForwardBundle: (message: Message) => void;
  onOpenImage: (images: string[], index: number) => void;
  onJump: (messageId: number) => void;
  onClose: () => void;
}

/** 搜索当前会话的聊天记录。桌面布局是对话框，手机布局是整页。 */
export function ChatSearchModal(props: ChatSearchModalProps): JSX.Element {
  return props.mobile ? <MobileChatSearch {...props} /> : <ChatSearchDialog {...props} />;
}

function MobileChatSearch({ conversationId, title, onOpenForwardBundle, onOpenImage, onJump, onClose }: ChatSearchModalProps): JSX.Element {
  const { inputValue, setInputValue, cleanKeyword, searchQuery, results, submitSearch } = useChatSearch(conversationId);

  useEffect(() => registerNativeBackHandler(() => {
    onClose();
    return true;
  }, 170), [onClose]);

  return (
    <div className="fixed inset-0 z-[2147483646] flex min-h-0 w-screen max-w-[100vw] flex-col overflow-hidden [background:var(--kc-mobile-chat)] [color:var(--kc-text)]">
      <header className="shrink-0 px-4 pb-3 pt-[max(44px,env(safe-area-inset-top))] [background:var(--kc-mobile-chat)]">
        <div className="flex min-h-[58px] items-end justify-between gap-3">
          <button type="button" onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-full [color:var(--kc-text)] active:[background:var(--kc-hover)]" aria-label="返回聊天">
            <Icon name="chevronLeft" className="h-6 w-6" />
          </button>
          <div className="min-w-0 flex-1 text-center">
            <h2 className="truncate text-[18px] font-black">搜索聊天记录</h2>
            <p className="mt-1 truncate text-[12px] font-medium [color:var(--kc-muted)]">{title} · 覆盖完整历史记录</p>
          </div>
          <span className="h-10 w-10 shrink-0" />
        </div>
        <form onSubmit={submitSearch} className="mt-3 flex items-center gap-2">
          <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-[18px] border px-3 [background:var(--kc-panel)] [border-color:var(--kc-border)] focus-within:[border-color:var(--kc-accent)]">
            <Icon name="search" className="h-4 w-4 shrink-0 [color:var(--kc-muted)]" />
            <input value={inputValue} onChange={(event) => setInputValue(event.target.value)} className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none [color:var(--kc-text)] placeholder:[color:var(--kc-muted)]" placeholder="搜索聊天内容、发送者" autoFocus />
          </label>
          <button type="submit" disabled={!inputValue.trim()} className="liquid-button h-11 shrink-0 rounded-[18px] px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-45">搜索</button>
        </form>
      </header>
      <main className="scroll-soft min-h-0 flex-1 overflow-y-auto p-4 [background:var(--kc-mobile-chat)]">
        {!cleanKeyword ? <p className="rounded-2xl p-4 text-sm [background:var(--kc-panel)] [color:var(--kc-muted)]">输入关键词后可搜索当前会话的完整历史消息。</p> : null}
        {searchQuery.isLoading ? <p className="rounded-2xl p-4 text-sm [background:var(--kc-panel)] [color:var(--kc-muted)]">正在搜索聊天记录...</p> : null}
        {searchQuery.error ? <p className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-500">聊天记录搜索失败，请稍后重试。</p> : null}
        {cleanKeyword && !searchQuery.isLoading && !searchQuery.error && results.length === 0 ? <p className="rounded-2xl p-4 text-sm [background:var(--kc-panel)] [color:var(--kc-muted)]">没有找到匹配聊天记录。</p> : null}
        <div className="grid gap-3">
          {results.map((message) => (
            <button key={message.id} type="button" onClick={() => {
              onJump(message.id);
              onClose();
            }} className="rounded-2xl border p-3 text-left transition active:[background:var(--kc-hover)] [background:var(--kc-panel)] [border-color:var(--kc-border)]">
              <div className="mb-2 flex items-center justify-between gap-3 text-xs [color:var(--kc-muted)]">
                <span className="min-w-0 truncate font-semibold [color:var(--kc-text)]">{messageSenderLabel(message)}</span>
                <span className="shrink-0">{formatMessageTime(message.created_at)}</span>
              </div>
              <div>{renderMessageContentPreview(message, onOpenForwardBundle, onOpenImage)}</div>
            </button>
          ))}
        </div>
        {searchQuery.hasNextPage ? (
          <button type="button" disabled={searchQuery.isFetchingNextPage} onClick={() => void searchQuery.fetchNextPage()} className="mt-4 w-full rounded-2xl border px-4 py-3 text-sm font-semibold transition active:[background:var(--kc-hover)] disabled:cursor-not-allowed disabled:opacity-45 [border-color:var(--kc-border)]">
            {searchQuery.isFetchingNextPage ? '加载中...' : '加载更多历史结果'}
          </button>
        ) : null}
      </main>
    </div>
  );
}
