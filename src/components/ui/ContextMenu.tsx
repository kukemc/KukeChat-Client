import { forwardRef } from 'react';
import { Icon, type IconName } from './Icon';

export interface ContextMenuItemProps {
  label: string;
  icon?: IconName;
  danger?: boolean;
  disabled?: boolean;
  selected?: boolean;
  pillSuffix?: boolean;
  suffix?: string;
  onClick?: () => void;
  onMouseEnter?: () => void;
}

export const ContextMenuSurface = forwardRef<HTMLDivElement, { children: React.ReactNode; className?: string; style?: React.CSSProperties; onMouseDown?: React.MouseEventHandler<HTMLDivElement>; onMouseEnter?: React.MouseEventHandler<HTMLDivElement>; onMouseLeave?: React.MouseEventHandler<HTMLDivElement> }>(function ContextMenuSurface({ children, className = '', style, onMouseDown, onMouseEnter, onMouseLeave }, ref): JSX.Element {
  return (
    <div ref={ref} onMouseDown={onMouseDown} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} style={style} className={`kc-context-menu-surface select-none overflow-hidden rounded-[22px] border text-xs shadow-float [background:var(--kc-panel)] [border-color:var(--kc-border)] [color:var(--kc-text)] ${className}`}>
      {children}
    </div>
  );
});

export function ContextMenuItem({ label, icon, danger = false, disabled = false, selected = false, pillSuffix = false, suffix, onClick, onMouseEnter }: ContextMenuItemProps): JSX.Element {
  return (
    <button type="button" disabled={disabled} onClick={onClick} onMouseEnter={onMouseEnter} className={`flex w-full select-none items-center gap-2 px-3 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${selected ? 'bg-[#cfefff] font-medium text-[#1285ff] dark:bg-[#153a55] dark:text-[#73bdff]' : danger ? 'text-red-500 hover:bg-red-500/10' : 'hover:[background:var(--kc-hover)]'}`}>
      {selected ? <Icon name="check" className="h-4 w-4 shrink-0 text-[#1285ff] dark:text-[#73bdff]" /> : icon ? <Icon name={icon} className="h-4 w-4 shrink-0 [color:var(--kc-muted)]" /> : <span className="h-4 w-4 shrink-0" />}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {suffix ? <span className={`shrink-0 ${pillSuffix ? 'rounded-full px-3 py-1 text-[11px] [background:var(--kc-panel-muted)] [color:var(--kc-muted)]' : '[color:var(--kc-muted)]'}`}>{suffix}</span> : null}
    </button>
  );
}
