import { Icon } from '@/components/ui/Icon';
import { Modal, ModalStatus } from '@/components/ui/desktop/Modal';
import { useChatSearch } from '../chatSearch';
import type { ChatSearchModalProps } from '../ChatSearchModal';
import { renderMessageContentPreview } from '../messageContent';
import { MessageEntry } from './MessageEntry';

/** 桌面端的聊天记录搜索。点一条结果后怎么跳转、要不要关掉，由调用方决定。 */
export function ChatSearchDialog({ conversationId, title, onOpenForwardBundle, onOpenImage, onJump, onClose }: ChatSearchModalProps): JSX.Element {
  const { inputValue, setInputValue, cleanKeyword, searchQuery, results, submitSearch } = useChatSearch(conversationId);

  return (
    <Modal title="搜索聊天记录" subtitle={title} className="kmd-modal--lg kmd-modal--tall" bodyClassName="kmd-split" onClose={onClose}>
      <form className="kmd-toolbar" onSubmit={submitSearch}>
        <label className="kui-field">
          <Icon name="search" className="h-3.5 w-3.5" />
          <input value={inputValue} placeholder="搜索聊天内容、发送者" aria-label="搜索关键词" autoFocus onChange={(event) => setInputValue(event.target.value)} />
        </label>
        <button type="submit" className="kui-btn kui-btn--primary" disabled={!inputValue.trim()}>搜索</button>
      </form>
      <div className="kmd-pane kui-scroll">
        {!cleanKeyword ? <ModalStatus>输入关键词后可搜索当前会话的完整历史消息。</ModalStatus>
          : searchQuery.isLoading ? <ModalStatus>正在搜索聊天记录…</ModalStatus>
          : searchQuery.error ? <ModalStatus tone="error">聊天记录搜索失败，请稍后重试。</ModalStatus>
          : results.length === 0 ? <ModalStatus>没有找到匹配聊天记录。</ModalStatus>
          : results.map((message) => (
            <MessageEntry key={message.id} message={message} onOpen={() => onJump(message.id)}>
              {renderMessageContentPreview(message, onOpenForwardBundle, onOpenImage)}
            </MessageEntry>
          ))}
        {searchQuery.hasNextPage ? (
          <button type="button" className="kui-btn kui-btn--ghost kui-btn--block kmd-more" disabled={searchQuery.isFetchingNextPage} onClick={() => void searchQuery.fetchNextPage()}>
            {searchQuery.isFetchingNextPage ? '加载中…' : '加载更多历史结果'}
          </button>
        ) : null}
      </div>
    </Modal>
  );
}
