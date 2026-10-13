import { useState } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { ImageViewer, type ImageViewerState } from '@/components/ui/ImageViewer';
import { Modal, ModalStatus } from '@/components/ui/desktop/Modal';
import type { Message } from '@/types/api';
import { renderSnapshotContent } from '../messageContent';
import { formatMessageTime, parseForwardBundle } from '../messageMeta';

/** 桌面端的合并转发详情：像聊天记录一样逐条列出快照，图片可以点开看。 */
export function ForwardBundleDialog({ message, onClose }: { message: Message; onClose: () => void }): JSX.Element {
  const bundle = parseForwardBundle(message);
  const [imageViewer, setImageViewer] = useState<ImageViewerState | null>(null);

  return (
    <>
      <Modal title={bundle.title} subtitle={`共 ${bundle.count || bundle.snapshots.length} 条`} className="kmd-modal--md kmd-modal--tall" bodyClassName="kmd-well kmd-bundle" raised onClose={onClose}>
        {bundle.note ? <p className="kui-note">备注：{bundle.note}</p> : null}
        {bundle.snapshots.length === 0 ? <ModalStatus>这条转发消息没有可展示的快照。</ModalStatus> : null}
        {bundle.snapshots.map((snapshot, index) => (
          <article key={`${snapshot.id ?? index}-${snapshot.senderName}`} className="kmd-bundle-row">
            <Avatar user={null} label={snapshot.senderName} avatarUrl={snapshot.senderAvatarUrl} size="sm" />
            <div>
              <header><span>{snapshot.senderName}</span><time>{formatMessageTime(snapshot.createdAt)}</time></header>
              <div className="kmd-bundle-bubble">{renderSnapshotContent(snapshot, (images, at) => setImageViewer({ images, index: at }))}</div>
            </div>
          </article>
        ))}
      </Modal>
      {imageViewer ? <ImageViewer viewer={imageViewer} onClose={() => setImageViewer(null)} onNavigate={(at) => setImageViewer((current) => current ? { ...current, index: at } : current)} /> : null}
    </>
  );
}
