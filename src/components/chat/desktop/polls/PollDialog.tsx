import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type SyntheticEvent } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/components/ui/Icon';
import { useEvent } from '../runtime';

function stop(event: SyntheticEvent): void {
  event.stopPropagation();
}

/**
 * 投票用的对话框外壳。
 *
 * 触发它的地方在消息行和输入框表单里面：消息行自成一个层叠上下文，留在里面会被后面的行盖住；
 * 输入框表单会接走粘贴。所以挂到聊天面板的根上，并且不让这里的事件沿 React 树冒回去
 * （否则在对话框里双击、右键、粘贴，会触发消息行的引用、菜单和输入框的粘贴处理）。
 */
export function PollDialog({ title, footer, onClose, children }: { title: string; footer?: ReactNode; onClose: () => void; children: ReactNode }): JSX.Element {
  const markerRef = useRef<HTMLSpanElement>(null);
  const [host, setHost] = useState<Element | null>(null);
  const close = useEvent(onClose);

  useLayoutEffect(() => setHost(markerRef.current?.closest('.kcd') ?? null), []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      // 输入法组词时的 Esc 是取消候选，不是关对话框
      if (event.key === 'Escape' && !event.isComposing) {
        close();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [close]);

  return (
    <>
      <span ref={markerRef} hidden />
      {host ? createPortal(
        <div className="kui-backdrop" onMouseDown={close} onClick={stop} onDoubleClick={stop} onContextMenu={stop} onPaste={stop}>
          <div role="dialog" aria-modal="true" aria-label={title} className="kui-dialog kcp-dialog" onMouseDown={stop}>
            <header className="kui-dialog-header">
              <span className="kcp-dialog-title">{title}</span>
              <button type="button" className="kui-icon-btn" aria-label="关闭" onClick={close}><Icon name="close" className="h-4 w-4" /></button>
            </header>
            <div className="kui-dialog-body kui-scroll">{children}</div>
            {footer ? <footer className="kui-dialog-footer">{footer}</footer> : null}
          </div>
        </div>,
        host
      ) : null}
    </>
  );
}
