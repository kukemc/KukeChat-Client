import { useState } from 'react';
import { ImageViewer, type ImageViewerState } from '@/components/ui/ImageViewer';
import { Modal } from '@/components/ui/desktop/Modal';
import type { FeaturedMessagesModalProps } from '../FeaturedMessagesModal';
import { FeaturedMessagesList } from '../FeaturedMessagesList';

/** 桌面端的群精华消息列表。群主和管理员可以把消息移出精华；原消息还在时可以跳转。 */
export function FeaturedMessagesDialog({ conversationId, canManage, isToggling, onToggleFeature, onOpenForwardBundle, onClose }: FeaturedMessagesModalProps): JSX.Element {
  const [imageViewer, setImageViewer] = useState<ImageViewerState | null>(null);
  return (
    <>
      <Modal title="群精华消息" className="kmd-modal--lg kmd-modal--tall" bodyClassName="kmd-pane" onClose={onClose}>
        <FeaturedMessagesList
          conversationId={conversationId}
          canManage={canManage}
          isToggling={isToggling}
          onToggleFeature={onToggleFeature}
          onOpenForwardBundle={onOpenForwardBundle}
          onOpenImages={(images, index) => setImageViewer({ images, index })}
          onJumped={onClose}
        />
      </Modal>
      {imageViewer ? <ImageViewer viewer={imageViewer} portal onClose={() => setImageViewer(null)} onNavigate={(index) => setImageViewer((current) => current ? { ...current, index } : current)} /> : null}
    </>
  );
}
