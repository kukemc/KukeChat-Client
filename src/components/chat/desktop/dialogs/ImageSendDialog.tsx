import { useLayoutEffect, useRef, useState, type SyntheticEvent } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/desktop/Modal';
import { MAX_MESSAGE_CONTENT_LENGTH } from '../../message/constants';
import type { StagedImage } from '../../message/types';

/** 一条消息最多带几张图（和安卓一致；后端本身不限） */
export const MAX_IMAGES_PER_MESSAGE = 9;

function stop(event: SyntheticEvent): void {
  event.stopPropagation();
}

interface ImageSendDialogProps {
  images: StagedImage[];
  /** 选图 / 拖拽 / 粘贴时被忽略的那几张的说明（太大、超过张数） */
  notice: string;
  onAdd: (files: File[]) => void;
  onRemove: (id: string) => void;
  onCancel: () => void;
  onSend: (caption: string) => void;
}

/**
 * 发图前的确认框（QQ / 微信的习惯）：缩略图网格，每张可以去掉，可以继续添加，可以写一句说明。
 * 「发送」后图文合成一条消息（metadata.images + content），立刻按乐观发送显示在列表里。
 *
 * 触发它的地方在输入框表单里：挂到聊天面板的根上，并且不让提交、粘贴、双击这些事件沿 React 树冒回输入框。
 */
export function ImageSendDialog({ images, notice, onAdd, onRemove, onCancel, onSend }: ImageSendDialogProps): JSX.Element {
  const markerRef = useRef<HTMLSpanElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [host, setHost] = useState<Element | null>(null);
  const [caption, setCaption] = useState('');
  useLayoutEffect(() => setHost(markerRef.current?.closest('.kcd') ?? null), []);

  const count = images.length;
  const full = count >= MAX_IMAGES_PER_MESSAGE;
  const tooLong = caption.trim().length > MAX_MESSAGE_CONTENT_LENGTH;
  const submit = (): void => {
    if (count > 0 && !tooLong) {
      onSend(caption.trim());
    }
  };

  const dialog = (
    <div
      className="kcd-imgsend-layer"
      onClick={stop}
      onDoubleClick={stop}
      onContextMenu={stop}
      onSubmit={stop}
      onKeyDown={stop}
      onPaste={(event) => {
        event.stopPropagation();
        const files = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith('image/'));
        if (files.length > 0) {
          event.preventDefault();
          onAdd(files);
        }
      }}
    >
      <Modal
        title="发送图片"
        subtitle={`${count} / ${MAX_IMAGES_PER_MESSAGE} 张`}
        className="kmd-modal--md kcd-imgsend"
        dismissOnBackdrop={false}
        onSubmit={submit}
        onClose={onCancel}
        footer={(
          <>
            {notice ? <p className="kcd-imgsend-note" role="status">{notice}</p> : null}
            <button type="button" className="kui-btn kcd-imgsend-pill" onClick={onCancel}>取消</button>
            <button type="submit" className="kui-btn kui-btn--primary kcd-imgsend-pill" data-action="send-images" disabled={count === 0 || tooLong}>发送（{count}）</button>
          </>
        )}
      >
        <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={(event) => {
          if (event.target.files) {
            onAdd(Array.from(event.target.files));
          }
          event.target.value = '';
        }} />
        <div className="kcd-imgsend-grid">
          {images.map((image) => (
            <div key={image.id} className="kcd-imgsend-cell">
              <img src={image.previewUrl} alt={image.file.name || '待发送图片'} draggable={false} />
              <button type="button" className="kcd-imgsend-remove" aria-label="去掉这张" onClick={() => onRemove(image.id)}><Icon name="close" className="h-3 w-3" /></button>
            </div>
          ))}
          {full ? null : (
            <button type="button" className="kcd-imgsend-add" aria-label="继续添加图片" onClick={() => inputRef.current?.click()}>
              <Icon name="plus" className="h-5 w-5" />
              <span>添加</span>
            </button>
          )}
        </div>
        <input
          className="kui-input kcd-imgsend-caption"
          value={caption}
          placeholder="添加说明（可选），回车发送"
          aria-label="图片说明"
          maxLength={MAX_MESSAGE_CONTENT_LENGTH + 50}
          autoFocus
          onChange={(event) => setCaption(event.target.value)}
        />
        {tooLong ? <p className="kcd-imgsend-note is-error" role="alert">说明不能超过 {MAX_MESSAGE_CONTENT_LENGTH} 字。</p> : null}
      </Modal>
    </div>
  );

  return (
    <>
      <span ref={markerRef} hidden />
      {host ? createPortal(dialog, host) : null}
    </>
  );
}
