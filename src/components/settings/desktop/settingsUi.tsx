import type { ReactNode } from 'react';
import { Icon, type IconName } from '@/components/ui/Icon';
import { parseApiDate } from '@/utils/dateTime';

export const btn = {
  base: 'inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl px-3.5 text-[13px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50',
  get primary(): string { return `${this.base} text-white [background:var(--kc-accent)] hover:brightness-110`; },
  get secondary(): string { return `${this.base} border [border-color:var(--kc-border)] [background:var(--kc-panel)] [color:var(--kc-text)] hover:[background:var(--kc-hover)]`; },
  get ghost(): string { return `${this.base} [color:var(--kc-muted)] hover:[background:var(--kc-hover)] hover:[color:var(--kc-text)]`; },
  get danger(): string { return `${this.base} border text-red-500 [border-color:rgba(239,68,68,.3)] hover:bg-red-500/10`; }
};

export const inputClass = 'h-10 w-full rounded-xl border px-3 text-sm outline-none transition [background:var(--kc-panel)] [border-color:var(--kc-border)] [color:var(--kc-text)] placeholder:[color:var(--kc-muted)] focus:[border-color:var(--kc-accent)] focus:[box-shadow:0_0_0_3px_var(--kc-accent-soft)]';
export const textareaClass = `${inputClass} h-auto resize-none py-2.5 leading-6 scroll-soft`;

export function SettingsPage({ title, description, children, wide }: { title: string; description?: string; children: ReactNode; wide?: boolean }): JSX.Element {
  return (
    <div className={`mx-auto w-full ${wide ? 'max-w-[1040px]' : 'max-w-[760px]'}`}>
      <header className="mb-5">
        <h2 className="text-xl font-semibold [color:var(--kc-text)]">{title}</h2>
        {description ? <p className="mt-1 text-[13px] [color:var(--kc-muted)]">{description}</p> : null}
      </header>
      <div className="grid gap-4">{children}</div>
    </div>
  );
}

export function Card({ title, description, action, children, padded = false }: { title?: string; description?: ReactNode; action?: ReactNode; children: ReactNode; padded?: boolean }): JSX.Element {
  return (
    <section className="overflow-hidden rounded-2xl border [background:var(--kc-panel)] [border-color:var(--kc-border)]">
      {title ? (
        <div className="flex items-start justify-between gap-3 px-4 pb-1 pt-4">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold [color:var(--kc-text)]">{title}</h3>
            {description ? <p className="mt-0.5 text-xs leading-5 [color:var(--kc-muted)]">{description}</p> : null}
          </div>
          {action}
        </div>
      ) : null}
      <div className={padded ? 'p-4' : ''}>{children}</div>
    </section>
  );
}

/**
 * A labelled setting with its control on the right; rows inside a Card are separated by hairlines.
 * `wrap` is for rows whose control is wide (several buttons, a slider): it drops below the text when the window is narrow.
 */
export function Row({ icon, title, description, children, onClick, wrap }: { icon?: IconName; title: ReactNode; description?: ReactNode; children?: ReactNode; onClick?: () => void; wrap?: boolean }): JSX.Element {
  const content = (
    <>
      {icon ? <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl [background:var(--kc-panel-muted)] [color:var(--kc-muted)]"><Icon name={icon} className="h-[18px] w-[18px]" /></span> : null}
      <span className={wrap ? 'min-w-[180px] flex-1' : 'min-w-0 flex-1'}>
        <span className="block text-sm font-medium [color:var(--kc-text)]">{title}</span>
        {description ? <span className="mt-0.5 block text-xs leading-5 [color:var(--kc-muted)]">{description}</span> : null}
      </span>
      {children}
    </>
  );
  const className = `flex w-full items-center gap-3 border-t px-4 py-3 text-left first:border-t-0 [border-color:var(--kc-border)] ${wrap ? 'flex-wrap' : ''}`;
  return onClick
    ? <button type="button" onClick={onClick} className={`${className} transition hover:[background:var(--kc-hover)]`}>{content}</button>
    : <div className={className}>{content}</div>;
}

export function Toggle({ checked, onChange, disabled, label }: { checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean; label: string }): JSX.Element {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:cursor-not-allowed disabled:opacity-50 ${checked ? '[background:var(--kc-accent)]' : '[background:var(--kc-border)]'}`}>
      <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : ''}`} />
    </button>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }): JSX.Element {
  return (
    <label className="grid min-w-0 gap-1.5">
      <span className="text-xs font-semibold [color:var(--kc-muted)]">{label}</span>
      {children}
      {hint ? <span className="text-xs [color:var(--kc-muted)]">{hint}</span> : null}
    </label>
  );
}

export function Notice({ tone, children }: { tone: 'error' | 'warning' | 'success' | 'info'; children: ReactNode }): JSX.Element {
  const styles = {
    error: 'border-red-500/25 bg-red-500/10 text-red-500',
    warning: 'border-amber-500/25 bg-amber-500/10 text-amber-600',
    success: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-600',
    info: '[border-color:var(--kc-border)] [background:var(--kc-panel-muted)] [color:var(--kc-muted)]'
  }[tone];
  return <p className={`rounded-xl border px-3 py-2 text-[13px] leading-5 ${styles}`}>{children}</p>;
}

export function Choice<T extends string | number>({ value, options, onChange }: { value: T; options: Array<{ value: T; label: string }>; onChange: (value: T) => void }): JSX.Element {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-xl p-1 [background:var(--kc-panel-muted)]" role="radiogroup">
      {options.map((option) => (
        <button key={String(option.value)} type="button" role="radio" aria-checked={value === option.value} onClick={() => onChange(option.value)}
          className={`h-8 rounded-lg px-3 text-[13px] font-semibold transition ${value === option.value ? 'shadow-sm [background:var(--kc-panel)] [color:var(--kc-text)]' : '[color:var(--kc-muted)] hover:[color:var(--kc-text)]'}`}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Confirmation rendered in place (no portal: portals are unreliable inside the extension shadow root). */
export function ConfirmLayer({ title, message, confirmText, danger, pending, onConfirm, onCancel }: { title: string; message: ReactNode; confirmText: string; danger?: boolean; pending?: boolean; onConfirm: () => void; onCancel: () => void }): JSX.Element {
  return (
    <div className="fixed inset-0 z-[2147483000] grid place-items-center bg-black/30 p-4" onMouseDown={() => { if (!pending) onCancel(); }}>
      <div role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()} className="w-full max-w-sm rounded-2xl border p-5 shadow-[0_24px_64px_rgba(15,23,42,.25)] [background:var(--kc-panel)] [border-color:var(--kc-border)]">
        <h3 className="text-base font-semibold [color:var(--kc-text)]">{title}</h3>
        <div className="mt-2 text-[13px] leading-6 [color:var(--kc-muted)]">{message}</div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className={btn.secondary} disabled={pending} onClick={onCancel}>取消</button>
          <button type="button" className={danger ? `${btn.base} bg-red-500 text-white hover:bg-red-600` : btn.primary} disabled={pending} onClick={onConfirm}>{pending ? '处理中…' : confirmText}</button>
        </div>
      </div>
    </div>
  );
}

export function formatChinaDateTime(value?: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', dateStyle: 'medium', timeStyle: 'short' }).format(parseApiDate(value) ?? new Date(value));
}
