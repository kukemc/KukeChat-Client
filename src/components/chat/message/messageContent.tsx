import type { Message } from '@/types/api';
import type { ForwardBundleSnapshot } from './types';
import { MessageView } from './MessageView';
import { snapshotToMessage } from './messageMeta';

/**
 * 旧的两个入口，保持导出名不变：内部统一走 MessageView（精华、收藏、合并转发、搜索共用的只读渲染器）。
 * 新代码请直接用 MessageView，这里只是让还没改的调用方不用跟着动。
 */

export function renderSnapshotContent(snapshot: ForwardBundleSnapshot, onOpenImage?: (images: string[], index: number) => void): JSX.Element {
  return <MessageView message={snapshotToMessage(snapshot)} variant="full" onOpenImages={onOpenImage} />;
}

export function renderMessageContentPreview(message: Message, onOpenForwardBundle: (message: Message) => void, onOpenImage?: (images: string[], index: number) => void): JSX.Element {
  return <MessageView message={message} variant="compact" onOpenImages={onOpenImage} onOpenBundle={onOpenForwardBundle} />;
}
