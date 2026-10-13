import { useEffect, useMemo, useRef, useState } from 'react';
import { cx } from '@/components/chat/desktop/runtime';
import { Icon } from '@/components/ui/Icon';
import { ImageViewer, type ImageViewerState } from '@/components/ui/ImageViewer';
import type { JuryCaseMessage, JuryCaseView } from '@/types/jury';
import { resolveAssetUrl } from '@/utils/assetUrl';
import { formatClockTime } from '@/utils/dateTime';
import { formatDateTime } from '../labels';
import { useRestoreFocus } from './focus';

/**
 * 匿名的案件证据：群聊消息是一段对话记录，公开动态是一篇正文。
 *
 * 内容已经由服务端匿名化。这里只按原样展示 —— 不显示、不推断、不补全任何身份信息：
 * 发言人只有「被举报人」「成员A」这类代称，没有头像，图片地址不解析出处。
 */

function Thumbs({ images, onOpen }: { images: string[]; onOpen: (images: string[], index: number) => void }): JSX.Element | null {
  const resolved = images.map((url) => resolveAssetUrl(url)).filter((url): url is string => Boolean(url));
  if (resolved.length === 0) {
    return images.length > 0 ? <p className="kjr-msg-note">图片不可用</p> : null;
  }
  return (
    <div className="kjr-thumbs">
      {resolved.map((src, index) => (
        <button key={`${src}-${index}`} type="button" className="kjr-thumb" aria-label={`查看图片 ${index + 1}`} onClick={() => onOpen(resolved, index)}>
          <img src={src} alt="案件图片" loading="lazy" />
        </button>
      ))}
    </div>
  );
}

function messageImages(message: JuryCaseMessage): string[] {
  return [...(message.type === 'image' && message.content ? [message.content] : []), ...(message.images ?? [])];
}

function MessageRow({ message, onOpen }: { message: JuryCaseMessage; onOpen: (images: string[], index: number) => void }): JSX.Element {
  const images = messageImages(message);
  return (
    <li className={cx('kjr-msg', message.is_target && 'is-target', message.content === null && 'is-recalled')}>
      <div className="kjr-msg-who">
        <span>{message.speaker}</span>
        <time>{formatClockTime(message.created_at)}</time>
      </div>
      <div className="kjr-msg-body">
        {message.is_target ? <span className="kjr-msg-flag">被举报的消息</span> : null}
        {message.content === null ? <p className="kjr-msg-note">这条消息已被撤回</p> : message.type === 'image' ? null : <p>{message.content}</p>}
        <Thumbs images={images} onOpen={onOpen} />
      </div>
    </li>
  );
}

function FoldButton({ count, where, onClick }: { count: number; where: 'before' | 'after'; onClick: () => void }): JSX.Element {
  return (
    <li className="kjr-fold">
      <button type="button" className="kui-btn kui-btn--ghost kui-btn--sm" onClick={onClick}>
        <Icon name="more" className="h-3.5 w-3.5" />
        展开{where === 'before' ? '更早' : '之后'}的 {count} 条
      </button>
    </li>
  );
}

function Transcript({ messages, near, onOpen }: { messages: JuryCaseMessage[]; near: number; onOpen: (images: string[], index: number) => void }): JSX.Element {
  const [showBefore, setShowBefore] = useState(false);
  const [showAfter, setShowAfter] = useState(false);
  // 旧后端不带 offset：按目标消息的位置自己算
  const withOffset = useMemo(() => {
    const targetIndex = Math.max(0, messages.findIndex((message) => message.is_target));
    return messages.map((message, index) => ({ message, offset: message.offset ?? index - targetIndex }));
  }, [messages]);
  const hiddenBefore = showBefore ? 0 : withOffset.filter((item) => item.offset < -near).length;
  const hiddenAfter = showAfter ? 0 : withOffset.filter((item) => item.offset > near).length;
  const visible = withOffset.filter((item) => (item.offset >= -near || showBefore) && (item.offset <= near || showAfter));
  // 「展开」按钮点完就没了，焦点会掉到 body 上，评审台的数字键跟着失灵：把焦点留在这段对话上
  const listRef = useRef<HTMLOListElement>(null);
  useRestoreFocus(listRef, `${showBefore}-${showAfter}`);

  return (
    <ol ref={listRef} tabIndex={-1} className="kjr-ts" aria-label="匿名对话记录">
      {hiddenBefore > 0 ? <FoldButton count={hiddenBefore} where="before" onClick={() => setShowBefore(true)} /> : null}
      {visible.map((item, index) => <MessageRow key={`${item.offset}-${index}`} message={item.message} onOpen={onOpen} />)}
      {hiddenAfter > 0 ? <FoldButton count={hiddenAfter} where="after" onClick={() => setShowAfter(true)} /> : null}
    </ol>
  );
}

export function CaseEvidence({ view, contextNear, onViewerOpenChange }: {
  view: Pick<JuryCaseView, 'kind' | 'messages' | 'post' | 'case_id'>;
  /** 默认展示目标消息前后各几条，其余折叠 */
  contextNear: number;
  /** 看图浮层开着的时候，评审台要停掉数字快捷键 */
  onViewerOpenChange?: (open: boolean) => void;
}): JSX.Element {
  const [viewer, setViewer] = useState<ImageViewerState | null>(null);
  const open = viewer !== null;
  useEffect(() => {
    onViewerOpenChange?.(open);
  }, [onViewerOpenChange, open]);
  const openImages = (images: string[], index: number): void => setViewer({ images, index });

  return (
    <>
      {view.kind === 'post' ? (
        <article className="kjr-post" aria-label="被举报的动态">
          <header><span className="kjr-msg-flag">被举报的动态</span><time>{view.post ? formatDateTime(view.post.created_at) : ''}</time></header>
          {view.post?.content ? <p>{view.post.content}</p> : <p className="kjr-msg-note">{view.post ? '这篇动态没有文字' : '这篇动态已被删除'}</p>}
          <Thumbs images={view.post?.image_urls ?? []} onOpen={openImages} />
        </article>
      ) : view.messages.length === 0 ? <p className="kjr-msg-note">没有可以展示的消息</p> : <Transcript key={view.case_id} messages={view.messages} near={contextNear} onOpen={openImages} />}
      {viewer ? <ImageViewer viewer={viewer} onClose={() => setViewer(null)} onNavigate={(index) => setViewer((current) => (current ? { ...current, index } : current))} /> : null}
    </>
  );
}
