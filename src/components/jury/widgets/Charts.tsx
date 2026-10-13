import type { ReactNode } from 'react';
import { cx } from '@/components/chat/desktop/runtime';

// 风纪页用到的几种小图。全部自己用 SVG / CSS 画，颜色取主题令牌；数值始终另有文字，不靠颜色单独表达。

/** 一个数字：标签在上，数字放大，下面可以带一句说明或一张小图。 */
export function Stat({ label, value, unit, hint, children, className }: { label: string; value: ReactNode; unit?: string; hint?: ReactNode; children?: ReactNode; className?: string }): JSX.Element {
  return (
    <div className={cx('kjr-stat', className)}>
      <span className="kjr-stat-label">{label}</span>
      <strong className="kjr-stat-value">{value}{unit ? <small>{unit}</small> : null}</strong>
      {hint ? <span className="kjr-stat-hint">{hint}</span> : null}
      {children}
    </div>
  );
}

export interface DayBar {
  /** 悬停时显示的完整说明 */
  title: string;
  value: number;
  /** 叠在同一根柱子里的子集（比如「其中已结且一致」），画成实色，其余画成浅色 */
  part?: number;
}

/** 按天的小柱图。柱子很细，悬停看具体数字；首尾日期标在下面。 */
export function DayBars({ bars, label, startLabel, endLabel, legend }: { bars: DayBar[]; label: string; startLabel?: string; endLabel?: string; legend?: Array<{ tone: 'full' | 'part'; text: string }> }): JSX.Element {
  const max = Math.max(...bars.map((bar) => bar.value), 1);
  return (
    <figure className="kjr-bars" aria-label={label}>
      <div className="kjr-bars-plot">
        {bars.map((bar, index) => (
          <span key={index} className="kjr-bars-col" title={bar.title}>
            <span className={cx('kjr-bars-bar', bar.value === 0 && 'is-zero')} style={{ height: `${bar.value === 0 ? 0 : Math.max(8, (bar.value / max) * 100)}%` }}>
              {bar.part ? <span className="kjr-bars-part" style={{ height: `${Math.min(100, (bar.part / bar.value) * 100)}%` }} /> : null}
            </span>
          </span>
        ))}
      </div>
      <figcaption className="kjr-bars-axis">
        <span>{startLabel}</span>
        {legend ? <span className="kjr-bars-legend">{legend.map((item) => <span key={item.text}><i className={item.tone === 'part' ? 'is-part' : ''} />{item.text}</span>)}</span> : null}
        <span>{endLabel}</span>
      </figcaption>
    </figure>
  );
}

/** 进度环：一个 0–1 的比率。没有值时只画底环，中间是一道横线。 */
export function Ring({ value, size = 56, children }: { value: number | null | undefined; size?: number; children?: ReactNode }): JSX.Element {
  const stroke = 5;
  const radius = (size - stroke) / 2;
  const length = 2 * Math.PI * radius;
  const ratio = value === null || value === undefined || !Number.isFinite(value) ? null : Math.min(1, Math.max(0, value));
  return (
    <span className="kjr-ring" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden="true">
        <circle className="kjr-ring-track" cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} />
        {ratio !== null && ratio > 0 ? <circle className="kjr-ring-value" cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} strokeDasharray={`${ratio * length} ${length}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} /> : null}
      </svg>
      <span className="kjr-ring-label">{children ?? (ratio === null ? '—' : `${Math.round(ratio * 100)}%`)}</span>
    </span>
  );
}

/** 一条横向进度：今日已评 / 上限 之类。 */
export function Meter({ value, max, label }: { value: number; max: number; label: string }): JSX.Element {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return <span className="kjr-meter" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}><span style={{ width: `${ratio * 100}%` }} /></span>;
}

export interface SplitPart {
  key: string;
  label: string;
  value: number;
  /** 对应 CSS 里的 .kjr-split-seg.is-<tone> */
  tone: string;
}

/** 一条按比例分段的横条 + 图例（标签和件数都是文字）。分段之间留 2px 的缝。 */
export function SplitBar({ parts, label, compact = false, emptyText = '还没有数据' }: { parts: SplitPart[]; label: string; compact?: boolean; emptyText?: string }): JSX.Element {
  const total = parts.reduce((sum, part) => sum + part.value, 0);
  const shown = parts.filter((part) => part.value > 0);
  return (
    <div className={cx('kjr-split', compact && 'is-compact')} role="img" aria-label={`${label}：${total === 0 ? emptyText : parts.map((part) => `${part.label} ${part.value}`).join('，')}`}>
      <div className="kjr-split-bar">
        {shown.length === 0 ? <span className="kjr-split-seg is-empty" style={{ flexGrow: 1 }} /> : shown.map((part) => <span key={part.key} className={`kjr-split-seg is-${part.tone}`} style={{ flexGrow: part.value }} title={`${part.label} ${part.value}`} />)}
      </div>
      {compact ? null : (
        <ul className="kjr-split-legend">
          {parts.map((part) => <li key={part.key} className={part.value === 0 ? 'is-zero' : undefined}><i className={`kjr-split-seg is-${part.tone}`} />{part.label}<b>{part.value}</b></li>)}
        </ul>
      )}
    </div>
  );
}
