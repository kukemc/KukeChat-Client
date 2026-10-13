import type { ReactNode } from 'react';

/** 标签在上的表单项。有错误时错误顶替说明文字。 */
export function AuthField({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactNode }): JSX.Element {
  return (
    <label className="kau-field">
      <span className="kau-label">{label}</span>
      {children}
      {error ? <span className="kau-hint is-error">{error}</span> : hint ? <span className="kau-hint">{hint}</span> : null}
    </label>
  );
}
