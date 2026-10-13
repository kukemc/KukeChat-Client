import { Icon } from '@/components/ui/Icon';
import { Modal, ModalStatus } from '@/components/ui/desktop/Modal';
import type { Message } from '@/types/api';
import type { FeaturedMessagesModalProps } from '../FeaturedMessagesModal';
import { renderMessageContentPreview } from '../messageContent';
import { featuredItemMessage } from '../messageMeta';
import { MessageEntry } from './MessageEntry';

/** 桌面端的群精华消息列表。群主和管理员可以把消息移出精华。 */
export function FeaturedMessagesDialog({ items, isLoading, error, canManage, isToggling, onToggleFeature, onOpenForwardBundle, onClose }: FeaturedMessagesModalProps): JSX.Element {
  const messages = items.map(featuredItemMessage).filter((message): message is Message => message !== null);

  return (
    <Modal title="群精华消息" subtitle={messages.length > 0 ? `${messages.length} 条` : null} className="kmd-modal--lg kmd-modal--tall" bodyClassName="kmd-pane" onClose={onClose}>
      {isLoading ? <ModalStatus>正在加载精华消息…</ModalStatus> : null}
      {error ? <ModalStatus tone="error">精华消息加载失败，请稍后重试。</ModalStatus> : null}
      {!isLoading && !error && messages.length === 0 ? (
        <div className="kui-empty kmd-empty">
          <Icon name="star" className="h-7 w-7" />
          <strong>暂无精华消息</strong>
          <span>群主或管理员设为精华的消息会集中显示在这里。</span>
        </div>
      ) : null}
      {messages.map((message) => (
        <MessageEntry
          key={message.id}
          message={message}
          action={canManage ? <button type="button" className="kui-btn kui-btn--ghost kui-btn--sm kmd-danger" disabled={isToggling} onClick={() => onToggleFeature(message)}>移出精华</button> : null}
        >
          {renderMessageContentPreview(message, onOpenForwardBundle)}
        </MessageEntry>
      ))}
    </Modal>
  );
}
