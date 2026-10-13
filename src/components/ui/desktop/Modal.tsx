import { useEffect, type FormEvent, type ReactNode } from 'react';
import { cx, useEvent } from '@/components/chat/desktop/runtime';
import { Icon } from '@/components/ui/Icon';
import { useKukeStore } from '@/store/kukeStore';

/** 当前是不是桌面布局。没有 mobile 参数的弹窗靠它决定用哪一套界面。 */
export function useIsDesktopLayout(): boolean {
  return useKukeStore((state) => state.layoutMode === 'desktop');
}

/** 桌面弹窗、资料卡、看图浮层挂到哪：要落在带 data-layout 的根里面，主题变量才取得到。 */
export function getDesktopPortalRoot(): Element {
  const host = document.getElementById('kukechat-shadow-host');
  return host?.shadowRoot?.querySelector('.kc-window-frame:not(.kc-window-minimized)')
    ?? document.querySelector('.kc-window-frame:not(.kc-window-minimized)')
    ?? document.querySelector('.kc-desktop-app')
    ?? host?.shadowRoot?.getElementById('kukechat-root')
    ?? document.getElementById('kukechat-root')
    ?? document.body;
}

// 叠在一起的浮层共用一个 Esc 监听，只有最上面那层响应：
// 在搜索结果里点开合并转发、再点开图片，按三次 Esc 才一层层退回去。
const escapeLayers: Array<() => void> = [];

function handleEscapeKey(event: KeyboardEvent): void {
  // 输入法组词时的 Esc 是取消候选，不是关浮层
  if (event.key !== 'Escape' || event.isComposing || escapeLayers.length === 0) {
    return;
  }
  // 标记成已处理：群资料侧栏自己也监听 Esc，看到这个标记就不会跟着一起关
  event.preventDefault();
  escapeLayers[escapeLayers.length - 1]();
}

/** 把一个浮层登记到 Esc 栈里。传 null 表示这一层暂时不响应 Esc（比如正在写的草稿不想被一键丢掉）。 */
export function useEscapeLayer(onEscape: (() => void) | null): void {
  const handler = useEvent(() => onEscape?.());
  const active = onEscape !== null;
  useEffect(() => {
    if (!active) {
      return undefined;
    }
    escapeLayers.push(handler);
    if (escapeLayers.length === 1) {
      // 捕获阶段：赶在其他挂在 window 上的 Esc 监听之前
      window.addEventListener('keydown', handleEscapeKey, true);
    }
    return () => {
      escapeLayers.splice(escapeLayers.indexOf(handler), 1);
      if (escapeLayers.length === 0) {
        window.removeEventListener('keydown', handleEscapeKey, true);
      }
    };
  }, [active, handler]);
}

interface ModalProps {
  title: string;
  /** 标题后面的一小段说明，放不下时截断 */
  subtitle?: ReactNode;
  /** 尺寸（kmd-modal--*）等 */
  className?: string;
  bodyClassName?: string;
  /** 标题栏右侧、关闭按钮之前的操作 */
  actions?: ReactNode;
  footer?: ReactNode;
  /** 给了就在标题前出现返回箭头（对话框内的二级页面） */
  onBack?: () => void;
  /** 给了就把整个对话框渲染成表单，回车提交 */
  onSubmit?: () => void;
  /** 点遮罩是否关闭。填了内容的表单关掉它，免得手滑丢内容 */
  dismissOnBackdrop?: boolean;
  /** Esc 是否关闭 */
  dismissOnEscape?: boolean;
  /** 会从别的对话框里再打开的那种（合并转发详情），层级抬高一档，免得被先开的那个盖住 */
  raised?: boolean;
  onClose: () => void;
  children: ReactNode;
}

/** 桌面端对话框的外壳：遮罩、标题栏、可滚动的正文、底栏。骨架样式在 kui.css。 */
export function Modal({ title, subtitle, className, bodyClassName, actions, footer, onBack, onSubmit, dismissOnBackdrop = true, dismissOnEscape = true, raised = false, onClose, children }: ModalProps): JSX.Element {
  useEscapeLayer(dismissOnEscape ? onBack ?? onClose : null);

  const content = (
    <>
      <header className={cx('kui-dialog-header', onBack && 'kmd-modal-header--back')}>
        {onBack ? <button type="button" className="kui-icon-btn" aria-label="返回" onClick={onBack}><Icon name="chevronLeft" className="h-4 w-4" /></button> : null}
        <h2 className="kmd-modal-title"><span>{title}</span>{subtitle ? <small>{subtitle}</small> : null}</h2>
        {actions}
        <button type="button" className="kui-icon-btn" aria-label={`关闭${title}`} onClick={onClose}><Icon name="close" className="h-4 w-4" /></button>
      </header>
      <div className={cx('kui-dialog-body kui-scroll', bodyClassName)}>{children}</div>
      {footer ? <footer className="kui-dialog-footer">{footer}</footer> : null}
    </>
  );
  const dialogProps = {
    role: 'dialog',
    'aria-modal': true,
    'aria-label': title,
    className: cx('kui-dialog kmd-modal', className),
    onMouseDown: (event: React.MouseEvent) => event.stopPropagation()
  } as const;

  return (
    <div className={cx('kui-backdrop', raised && 'kmd-backdrop--raised')} onMouseDown={dismissOnBackdrop ? onClose : undefined}>
      {onSubmit ? (
        <form {...dialogProps} onSubmit={(event: FormEvent) => {
          event.preventDefault();
          onSubmit();
        }}>{content}</form>
      ) : <div {...dialogProps}>{content}</div>}
    </div>
  );
}

/** 列表类弹窗里的「加载中 / 失败 / 没有内容」。 */
export function ModalStatus({ tone = 'muted', children }: { tone?: 'muted' | 'error'; children: ReactNode }): JSX.Element {
  return <p className={cx('kui-empty', tone === 'error' && 'kmd-status--error')} role={tone === 'error' ? 'alert' : undefined}>{children}</p>;
}
