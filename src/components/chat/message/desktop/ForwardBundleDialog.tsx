import { useState } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { ImageViewer, type ImageViewerState } from '@/components/ui/ImageViewer';
import { Modal, ModalStatus } from '@/components/ui/desktop/Modal';
import type { Message } from '@/types/api';
import { MessageView } from '../MessageView';
import { formatMessageTime, parseForwardBundle, snapshotToMessage } from '../messageMeta';

/**
 * 桌面端的合并转发详情：像聊天记录一样逐条列出快照，每条走统一的 MessageView（所有类型都能正常显示）。
 * 嵌套的转发：浅层在原地展开，到深度上限只给卡片，点它在本对话框里「进入」那一条自己的详情（栈），左上角返回箭头退一层。
 */
export function ForwardBundleDialog({ message, onClose }: { message: Message; onClose: () => void }): JSX.Element {
  const [stack, setStack] = useState<Message[]>([message]);
  const current = stack[stack.length - 1];
  const bundle = parseForwardBundle(current);
  const [imageViewer, setImageViewer] = useState<ImageViewerState | null>(null);

  return (
    <>
      <Modal
        title={bundle.title}
        subtitle={`共 ${bundle.count || bundle.snapshots.length} 条`}
        className="kmd-modal--md kmd-modal--tall"
        bodyClassName="kmd-well kmd-bundle"
        raised
        onBack={stack.length > 1 ? () => setStack((items) => items.slice(0, -1)) : undefined}
        onClose={onClose}
      >
        {bundle.note ? <p className="kui-note">备注：{bundle.note}</p> : null}
        {bundle.snapshots.length === 0 ? <ModalStatus>这条转发消息没有可展示的快照。</ModalStatus> : null}
        {bundle.snapshots.map((snapshot, index) => (
          <article key={`${snapshot.id ?? index}-${snapshot.senderName}-${index}`} className="kmd-bundle-row">
            <Avatar user={null} label={snapshot.senderName} avatarUrl={snapshot.senderAvatarUrl} size="sm" />
            <div>
              <header><span>{snapshot.senderName}</span><time>{formatMessageTime(snapshot.createdAt)}</time></header>
              <div className="kmd-bundle-bubble">
                <MessageView
                  message={snapshotToMessage(snapshot, current.conversation_id, index)}
                  depth={stack.length}
                  variant="full"
                  onOpenImages={(images, at) => setImageViewer({ images, index: at })}
                  onOpenBundle={(nested) => setStack((items) => [...items, nested])}
                />
              </div>
            </div>
          </article>
        ))}
      </Modal>
      {imageViewer ? <ImageViewer viewer={imageViewer} onClose={() => setImageViewer(null)} onNavigate={(at) => setImageViewer((value) => value ? { ...value, index: at } : value)} /> : null}
    </>
  );
}
