import { forwardRef, useEffect, useRef, type ReactNode } from 'react';
import { useEvent } from '@/components/chat/desktop/runtime';
import { useEscapeLayer } from './desktop/Modal';
import { Icon, type IconName } from './Icon';

export interface ContextMenuItemProps {
  label: string;
  icon?: IconName;
  danger?: boolean;
  disabled?: boolean;
  selected?: boolean;
  suffix?: string;
  onClick?: () => void;
  onMouseEnter?: () => void;
}

type SurfaceProps = Pick<React.HTMLAttributes<HTMLDivElement>, 'children' | 'className' | 'style' | 'onMouseDown' | 'onMouseEnter' | 'onMouseLeave'>;

/** 菜单的外壳。定位（absolute + left/top）由调用方通过 className / style 决定。 */
export const ContextMenuSurface = forwardRef<HTMLDivElement, SurfaceProps>(function ContextMenuSurface({ children, className = '', ...rest }, ref): JSX.Element {
  return <div ref={ref} role="menu" {...rest} className={`kui-menu ${className}`}>{children}</div>;
});

/**
 * 菜单的外层：铺满所在的定位容器，菜单本体（和它的子菜单）作为 children 自己定位。
 *
 * 这一层自己不接鼠标（.kui-menu-layer），所以点菜单外面的那一下会照常落到下面的按钮上，同时把菜单关掉 ——
 * 以前这里是一块接住点击的透明遮罩，点一下只是关菜单，想点的按钮还得再点一次。
 * 按 Esc 也关；和对话框共用一个 Esc 栈，叠着的时候只关最上面那层。
 */
export function MenuLayer({ onClose, className = 'absolute inset-0 z-40', children }: { onClose: () => void; className?: string; children: ReactNode }): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const close = useEvent(onClose);
  useEscapeLayer(onClose);

  useEffect(() => {
    function onPointerDown(event: MouseEvent): void {
      const layer = ref.current;
      if (!layer) {
        return;
      }
      // 界面在 Shadow DOM 里，event.target 会被改写成宿主节点，要看完整的路径。点在菜单本体 / 子菜单里不算「外面」
      const inside = event.composedPath().some((node) => node instanceof Node && node !== layer && layer.contains(node));
      if (!inside) {
        close();
      }
    }
    // 捕获阶段：下面的元素自己拦掉 mousedown 时也收得到
    document.addEventListener('mousedown', onPointerDown, true);
    return () => document.removeEventListener('mousedown', onPointerDown, true);
  }, [close]);

  return <div ref={ref} className={`kui-menu-layer ${className}`}>{children}</div>;
}

export function ContextMenuItem({ label, icon, danger = false, disabled = false, selected = false, suffix, onClick, onMouseEnter }: ContextMenuItemProps): JSX.Element {
  return (
    <button type="button" role="menuitem" disabled={disabled} onClick={onClick} onMouseEnter={onMouseEnter} className={`kui-menu-item ${danger ? 'is-danger' : ''} ${selected ? 'is-selected' : ''}`}>
      <Icon name={selected ? 'check' : icon ?? 'check'} className={selected || icon ? '' : 'invisible'} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {suffix ? <span className="kui-menu-suffix">{suffix}</span> : null}
    </button>
  );
}

export function ContextMenuSeparator(): JSX.Element {
  return <div className="kui-menu-sep" role="separator" />;
}
