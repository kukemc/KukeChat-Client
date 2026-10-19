import { useRef, useState, type ReactNode } from 'react';
import { Icon } from '@/components/ui/Icon';
import type { SelectOption } from '../../info/shared';
import { cx } from '../runtime';
import { useInfo } from './infoContext';

/** 侧栏里的一个区块：标题可省，右上角可以放一个文字链接。 */
export function Section({ title, action, children }: { title?: string; action?: ReactNode; children: ReactNode }): JSX.Element {
  return (
    <section className="kui-group">
      {title ? <div className="kui-group-title"><span>{title}</span>{action}</div> : null}
      {children}
    </section>
  );
}

export function SwitchRow({ label, hint, checked, disabled = false, onChange }: { label: string; hint?: string; checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void }): JSX.Element {
  return (
    <label className="kui-row">
      <span className="kui-row-label">{label}{hint ? <span className="kui-row-hint">{hint}</span> : null}</span>
      <input type="checkbox" role="switch" className="kui-switch" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

export function SelectRow<T extends string>({ label, value, options, disabled = false, onChange }: { label: string; value: T; options: Array<SelectOption<T>>; disabled?: boolean; onChange: (value: T) => void }): JSX.Element {
  return (
    <label className="kui-row">
      <span className="kui-row-label">{label}</span>
      <select className="kui-select kci-select" value={value} disabled={disabled} onChange={(event) => {
        const next = options.find((option) => option.value === event.target.value);
        if (next) {
          onChange(next.value);
        }
      }}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

export function SegmentRow<T extends string>({ label, hint, value, options, disabled = false, onChange }: { label: string; hint?: string; value: T; options: Array<SelectOption<T>>; disabled?: boolean; onChange: (value: T) => void }): JSX.Element {
  return (
    <div className="kui-row">
      <span className="kui-row-label">{label}{hint ? <span className="kui-row-hint">{hint}</span> : null}</span>
      <Segment value={value} options={options} disabled={disabled} onChange={onChange} />
    </div>
  );
}

export function Segment<T extends string>({ value, options, disabled = false, onChange }: { value: T; options: Array<SelectOption<T>>; disabled?: boolean; onChange: (value: T) => void }): JSX.Element {
  return (
    <div className="kui-segment" role="radiogroup">
      {options.map((option) => (
        <button key={option.value} type="button" role="radio" aria-checked={option.value === value} disabled={disabled} className={option.value === value ? 'is-active' : undefined} onClick={() => onChange(option.value)}>{option.label}</button>
      ))}
    </div>
  );
}

/** 点了会打开别处（弹窗、子页面）或直接执行的行。danger 行不带箭头，文字标红。 */
export function ActionRow({ label, value, danger = false, disabled = false, onClick }: { label: string; value?: ReactNode; danger?: boolean; disabled?: boolean; onClick: () => void }): JSX.Element {
  return (
    <button type="button" className={cx('kui-row', danger && 'kci-row--danger')} disabled={disabled} onClick={onClick}>
      <span className="kui-row-label">{label}</span>
      {value ? <span className="kui-row-value"><span className="kci-clip">{value}</span></span> : null}
      {danger ? null : <Icon name="chevron" className="kci-row-arrow" />}
    </button>
  );
}

/** 行内编辑：平时是一行文字，点一下变成输入框，回车或失焦保存，Esc 放弃。 */
export function EditableRow({ label, value, placeholder = '未设置', maxLength, disabled = false, onSave }: { label: string; value: string; placeholder?: string; maxLength?: number; disabled?: boolean; onSave: (value: string) => void }): JSX.Element {
  const [draft, setDraft] = useState<string | null>(null);
  // 回车保存后输入框被卸载，有的浏览器还会补发一次 blur；用它挡掉重复提交
  const settledRef = useRef(false);

  function finish(save: boolean): void {
    if (settledRef.current || draft === null) {
      return;
    }
    settledRef.current = true;
    setDraft(null);
    const next = draft.trim();
    if (save && next !== value) {
      onSave(next);
    }
  }

  if (draft === null) {
    return (
      <button type="button" className="kui-row" disabled={disabled} title="点击修改" onClick={() => {
        settledRef.current = false;
        setDraft(value);
      }}>
        <span className="kui-row-label">{label}</span>
        <span className={cx('kui-row-value', !value && 'kci-row-placeholder')}><span className="kci-clip">{value || placeholder}</span></span>
      </button>
    );
  }

  return (
    <div className="kui-row">
      <span className="kui-row-label">{label}</span>
      <input
        className="kui-input kci-row-input"
        value={draft}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-label={label}
        autoFocus
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => finish(true)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            finish(true);
          } else if (event.key === 'Escape') {
            // 这里的 Esc 只退出编辑，不让它冒到侧栏把整个面板关掉
            event.stopPropagation();
            finish(false);
          }
        }}
      />
    </div>
  );
}

/** 侧栏里弹出的对话框。失败提示会被对话框盖住，所以错误在框内再显示一份。 */
export function Dialog({ title, footer, onClose, children }: { title: string; footer?: ReactNode; onClose: () => void; children: ReactNode }): JSX.Element {
  const { notice } = useInfo();
  return (
    <div className="kui-backdrop" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} className="kui-dialog" onMouseDown={(event) => event.stopPropagation()}>
        <header className="kui-dialog-header">
          <span>{title}</span>
          <button type="button" className="kui-icon-btn" aria-label="关闭" onClick={onClose}><Icon name="close" className="h-4 w-4" /></button>
        </header>
        <div className="kui-dialog-body kci-dialog-body kui-scroll">
          {notice?.tone === 'error' ? <p className="kui-note kui-note--danger" role="alert">{notice.text}</p> : null}
          {children}
        </div>
        {footer ? <footer className="kui-dialog-footer">{footer}</footer> : null}
      </div>
    </div>
  );
}

/** 对话框里的可滚动列表。 */
export function DialogList({ empty, children }: { empty?: string | null; children?: ReactNode }): JSX.Element {
  return (
    <div className="kci-list kui-scroll">
      {empty ? <p className="kci-hint">{empty}</p> : null}
      {children}
    </div>
  );
}
