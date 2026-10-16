import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import type { Message } from '@/types/api';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { ImageViewer, type ImageViewerState } from '@/components/ui/ImageViewer';
import { registerNativeBackHandler } from '@/native/back';
import { ForwardBundleDialog } from './desktop/ForwardBundleDialog';
import { parseForwardBundle, formatMessageTime, snapshotToMessage } from './messageMeta';
import { MessageView } from './MessageView';

export interface ForwardBundleDetailModalProps {
  message: Message;
  mobile?: boolean;
  onClose: () => void;
}

/** 合并转发的详情：逐条列出被转发的消息快照。桌面布局是对话框，手机布局是整页。 */
export function ForwardBundleDetailModal({ message, mobile = false, onClose }: ForwardBundleDetailModalProps): JSX.Element {
  return mobile ? <MobileForwardBundleDetail message={message} onClose={onClose} /> : <ForwardBundleDialog message={message} onClose={onClose} />;
}

function MobileForwardBundleDetail({ message, onClose }: Omit<ForwardBundleDetailModalProps, 'mobile'>): JSX.Element {
  // 嵌套转发：点进去把那一条压栈，返回只退一层（统一渲染器 MessageView 限制了原地展开的深度）
  const [stack, setStack] = useState<Message[]>([message]);
  const current = stack[stack.length - 1];
  const bundle = parseForwardBundle(current);
  const [imageViewer, setImageViewer] = useState<ImageViewerState | null>(null);
  const openSnapshotImage = (images: string[], index: number): void => setImageViewer({ images, index });
  const goBack = (): void => {
    if (stack.length > 1) {
      setStack((items) => items.slice(0, -1));
    } else {
      onClose();
    }
  };

  useEffect(() => registerNativeBackHandler(() => {
    if (imageViewer) {
      setImageViewer(null);
      return true;
    }
    goBack();
    return true;
  }, 120));

  return createPortal(
    <>
      <div className="fixed inset-0 z-[2147483646] flex w-screen max-w-[100vw] flex-col overflow-hidden bg-[#f2f2f4] text-[#111827] [background-color:#f2f2f4]" style={{ overflowX: 'hidden', maxWidth: '100vw' }}>
        <div onMouseDown={(event) => event.stopPropagation()} className="flex h-full min-h-0 w-full max-w-full flex-col overflow-hidden bg-[#f2f2f4] text-[#111827] [background-color:#f2f2f4]" style={{ overflowX: 'hidden', maxWidth: '100%' }}>
          <header className="flex min-h-[calc(max(44px,env(safe-area-inset-top))+56px)] shrink-0 items-end justify-between gap-3 bg-[#f2f2f4] px-4 pb-3 pt-[max(44px,env(safe-area-inset-top))] [background-color:#f2f2f4]">
            <button type="button" onClick={goBack} className="grid h-9 w-9 place-items-center rounded-full [color:var(--kc-text)]" aria-label={stack.length > 1 ? '返回上一层' : '返回聊天'}><Icon name="chevronLeft" className="h-6 w-6" /></button>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-[18px] font-bold">{bundle.title}</h2>
              <p className="mt-1 text-xs [color:var(--kc-muted)]">共 {bundle.count || bundle.snapshots.length} 条转发消息</p>
              {bundle.note ? <p className="mt-2 rounded-xl px-3 py-2 text-xs [background:var(--kc-panel-muted)] [color:var(--kc-muted)]">备注：{bundle.note}</p> : null}
            </div>
            <span className="h-9 w-9" />
          </header>
          <main className="scroll-soft min-h-0 max-w-full flex-1 overflow-x-hidden overflow-y-auto bg-[#f2f2f4] p-4 [background-color:#f2f2f4] [overscroll-behavior-x:none]" style={{ overflowX: 'hidden', maxWidth: '100%', touchAction: 'pan-y' }}>
            {bundle.snapshots.length === 0 ? <p className="max-w-full overflow-hidden rounded-2xl p-4 text-sm [background:var(--kc-panel)] [color:var(--kc-muted)]">这条转发消息没有可展示的快照。</p> : null}
            <div className="grid min-w-0 max-w-full gap-5 overflow-x-hidden">
              {bundle.snapshots.map((snapshot, index) => {
                return (
                  <article key={`${snapshot.id ?? index}-${snapshot.senderName}`} className="flex min-w-0 max-w-full items-start gap-3 overflow-hidden">
                    <Avatar user={null} label={snapshot.senderName} avatarUrl={snapshot.senderAvatarUrl} size="message" />
                    <div className="flex min-w-0 max-w-[calc(100%-52px)] flex-1 flex-col items-start gap-1 overflow-hidden">
                      <div className="flex max-w-full flex-wrap items-center gap-2 overflow-hidden px-1 text-[11px] [color:var(--kc-muted)]">
                        <span className="min-w-0 max-w-full truncate font-semibold">{snapshot.senderName}</span>
                        <span className="shrink-0">{formatMessageTime(snapshot.createdAt)}</span>
                      </div>
                      <div className="w-fit min-w-0 max-w-full overflow-hidden rounded-xl rounded-tl-sm px-3.5 py-2.5 shadow-none [background:var(--kc-bubble-in)] [color:var(--kc-text)]">
                        <MessageView message={snapshotToMessage(snapshot, current.conversation_id, index)} depth={stack.length} variant="full" onOpenImages={openSnapshotImage} onOpenBundle={(nested) => setStack((items) => [...items, nested])} />
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </main>
        </div>
      </div>
      {imageViewer ? <ImageViewer viewer={imageViewer} mobile portal onClose={() => setImageViewer(null)} onNavigate={(index) => setImageViewer((current) => current ? { ...current, index } : current)} /> : null}
    </>,
    document.body
  );
}
