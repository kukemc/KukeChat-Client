import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from '@/components/ui/Icon';
import { isHexColor } from '@/theme/themes';

/** 外观设置里各节共用的小控件。样式在 src/styles/desktop-theme.css（kth-）。 */

/**
 * `onCommit` 在松手（或键盘每调一格）时触发一次，拖动途中不触发。
 * `bare` 不显示左边的标签（标签由外面那一行给出），只留给读屏。
 */
export function Slider({ label, value, min, max, step = 1, unit = '', format, disabled, bare, onChange, onCommit }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; format?: (value: number) => string; disabled?: boolean; bare?: boolean; onChange: (value: number) => void; onCommit?: (value: number) => void }): JSX.Element {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;
  // React 的 onChange 对应的是原生 input 事件（拖动途中一直触发）；「松手」是原生的 change 事件，只能自己挂
  useEffect(() => {
    const input = inputRef.current;
    if (!input) {
      return undefined;
    }
    const commit = (): void => commitRef.current?.(Number(input.value));
    input.addEventListener('change', commit);
    return () => input.removeEventListener('change', commit);
  }, []);
  return (
    <label className={`kth-slider ${disabled ? 'is-disabled' : ''}`}>
      {bare ? null : <span className="kth-slider-label">{label}</span>}
      <input ref={inputRef} type="range" min={min} max={max} step={step} value={value} disabled={disabled} aria-label={bare ? label : undefined} onChange={(event) => onChange(Number(event.target.value))} />
      <span className="kth-slider-value">{format ? format(value) : `${value}${unit}`}</span>
    </label>
  );
}

/** 左边标题和说明，右边一个控件。 */
export function Option({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }): JSX.Element {
  return (
    <div className="kth-option">
      <div className="kth-option-text">
        <p>{title}</p>
        {description ? <p className="kth-option-hint">{description}</p> : null}
      </div>
      {children}
    </div>
  );
}

export function SectionReset({ onClick }: { onClick: () => void }): JSX.Element {
  return <button type="button" className="kth-reset" onClick={onClick}><Icon name="refresh" className="h-3.5 w-3.5" />恢复本节</button>;
}

/** 一个取色格：点开系统的取色器。value 为 null 时显示成「还没选」的彩虹环。 */
export function ColorWell({ value, label, onChange }: { value: string | null; label: string; onChange: (color: string) => void }): JSX.Element {
  return (
    <label className={`kth-well ${value ? 'is-set' : ''}`} title={label} style={value ? { background: value } : undefined}>
      <input type="color" value={value ?? '#1f6bff'} aria-label={label} onChange={(event) => {
        if (isHexColor(event.target.value)) {
          onChange(event.target.value.toLowerCase());
        }
      }} />
    </label>
  );
}
