import { useEffect, useState } from 'react';
import type { Message } from '@/types/api';
import { Icon } from '@/components/ui/Icon';
import { ImageViewer, type ImageViewerState } from '@/components/ui/ImageViewer';
import { registerNativeBackHandler } from '@/native/back';
import { FeaturedMessagesDialog } from './desktop/FeaturedMessagesDialog';
import { FeaturedMessagesList } from './FeaturedMessagesList';

export interface FeaturedMessagesModalProps {
  conversationId: number;
  canManage: boolean;
  isToggling: boolean;
  onToggleFeature: (message: Message) => void;
  onOpenForwardBundle: (message: Message) => void;
  onClose: () => void;
}

/** 群精华消息。桌面布局是对话框，手机布局是整页。数据由列表组件自己取（永久精华，分页）。 */
export function FeaturedMessagesModal({ mobile = false, ...props }: FeaturedMessagesModalProps & { mobile?: boolean }): JSX.Element {
  return mobile ? <MobileFeaturedMessages {...props} /> : <FeaturedMessagesDialog {...props} />;
}

function MobileFeaturedMessages({ conversationId, canManage, isToggling, onToggleFeature, onOpenForwardBundle, onClose }: FeaturedMessagesModalProps): JSX.Element {
  const [imageViewer, setImageViewer] = useState<ImageViewerState | null>(null);

  useEffect(() => registerNativeBackHandler(() => {
    if (imageViewer) {
      setImageViewer(null);
      return true;
    }
    onClose();
    return true;
  }, 170), [imageViewer, onClose]);

  return (
    <div className="fixed inset-0 z-[2147483646] flex min-h-0 w-screen max-w-[100vw] flex-col overflow-hidden [background:var(--kc-mobile-chat)] [color:var(--kc-text)]">
      <header className="flex min-h-[calc(max(44px,env(safe-area-inset-top))+58px)] shrink-0 items-end justify-between gap-3 px-4 pb-3 pt-[max(44px,env(safe-area-inset-top))] [background:var(--kc-mobile-chat)]">
        <button type="button" onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-full [color:var(--kc-text)] active:[background:var(--kc-hover)]" aria-label="返回聊天">
          <Icon name="chevronLeft" className="h-6 w-6" />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <h2 className="truncate text-[18px] font-black">群精华消息</h2>
          <p className="mt-1 truncate text-[12px] font-medium [color:var(--kc-muted)]">群主或管理员设为精华的消息，永久保存。</p>
        </div>
        <span className="h-10 w-10 shrink-0" />
      </header>
      <main className="scroll-soft min-h-0 flex-1 overflow-y-auto p-4 [background:var(--kc-mobile-chat)]">
        <FeaturedMessagesList
          mobile
          conversationId={conversationId}
          canManage={canManage}
          isToggling={isToggling}
          onToggleFeature={onToggleFeature}
          onOpenForwardBundle={onOpenForwardBundle}
          onOpenImages={(images, index) => setImageViewer({ images, index })}
          onJumped={onClose}
        />
      </main>
      {imageViewer ? <ImageViewer viewer={imageViewer} mobile portal onClose={() => setImageViewer(null)} onNavigate={(index) => setImageViewer((current) => current ? { ...current, index } : current)} /> : null}
    </div>
  );
}
