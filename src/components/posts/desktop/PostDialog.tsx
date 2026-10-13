import { createContext, type ReactNode, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Modal, getDesktopPortalRoot } from '@/components/ui/desktop/Modal';

/** 当前对话框所在的那一层。@ 和 # 的候选列表挂到它上面，才不会被对话框的滚动区裁掉。 */
export const DialogLayerContext = createContext<HTMLElement | null>(null);

const sizeClass = { narrow: 'kmd-modal--sm', normal: '', wide: 'kmd-modal--md' };

interface PostDialogProps {
  title: string;
  /** 标题右边的一小句说明，比如人数 */
  note?: string;
  size?: keyof typeof sizeClass;
  /** 整块内容是列表时，行自己带留白 */
  list?: boolean;
  headerExtra?: ReactNode;
  footer?: ReactNode;
  /** 底栏左边另有一组工具时，两组分居两端 */
  footerSplit?: boolean;
  onClose: () => void;
  children: ReactNode;
}

/** 动态页的对话框：通用的 Modal 外面套一层，负责挂到窗口上，并给输入框的候选列表留一个落脚的地方。 */
export function PostDialog({ title, note, size = 'normal', list = false, headerExtra, footer, footerSplit = false, onClose, children }: PostDialogProps): JSX.Element {
  const [layer, setLayer] = useState<HTMLElement | null>(null);

  return createPortal(
    <div ref={setLayer} className="kpo-layer">
      <Modal title={title} subtitle={note} className={sizeClass[size]} bodyClassName={`kpo-dialog-body ${list ? 'is-list' : ''}`} actions={headerExtra} footer={footer && footerSplit ? <div className="kpo-footer-split">{footer}</div> : footer} onClose={onClose}>
        <DialogLayerContext.Provider value={layer}>{children}</DialogLayerContext.Provider>
      </Modal>
    </div>,
    getDesktopPortalRoot()
  );
}

/** 菜单这类浮出来的小东西：点到外面或按 Esc 就收起。返回的 ref 挂在「里面」的那个容器上。 */
export function useDismiss<T extends HTMLElement>(open: boolean, onDismiss: () => void): React.RefObject<T> {
  const ref = useRef<T>(null);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    function onPointerDown(event: MouseEvent): void {
      // 扩展里整个界面在 Shadow DOM 中，event.target 会被改写成宿主节点，要看完整的路径
      if (ref.current && !event.composedPath().includes(ref.current)) {
        dismissRef.current();
      }
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        dismissRef.current();
      }
    }
    document.addEventListener('mousedown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return ref;
}
