import { useId } from 'react';
import { cx } from '@/components/chat/desktop/runtime';
import type { SparkLevelKey } from '@/types/spark';

/** 每一级的配色：外焰渐变（上 → 下）、内焰。越高越炫；这是界面里唯一的彩色点缀。 */
const PALETTE: Record<SparkLevelKey, { top: string; bottom: string; core: string }> = {
  ember: { top: '#fbbf24', bottom: '#f59e0b', core: '#fff3c4' },
  spark: { top: '#fb923c', bottom: '#f97316', core: '#ffe7b3' },
  flame: { top: '#f97316', bottom: '#ef4444', core: '#ffd27a' },
  blaze: { top: '#f43f5e', bottom: '#dc2626', core: '#ffc46b' },
  inferno: { top: '#ec4899', bottom: '#e11d48', core: '#ffd36e' },
  eternal: { top: '#8b5cf6', bottom: '#3b82f6', core: '#c7f9ff' }
};

const OUTER = 'M12 1.8c.7 3.3-1.1 5.3-2.8 7.1C7.6 10.6 5.8 12.5 5.8 15.4a6.2 6.2 0 0 0 12.4 0c0-2.6-1.2-4.6-2.5-6.1-.3 1.5-1 2.6-2.2 3.2.5-3.8-.5-7.9-1.5-10.7z';
const CORE = 'M12 12.6c-1 1.2-2.2 2.3-2.2 4a2.2 2.2 0 0 0 4.4 0c0-1.4-1-2.6-2.2-4z';
const STAR = 'M19.2 2.6l.55 1.45 1.45.55-1.45.55-.55 1.45-.55-1.45-1.45-.55 1.45-.55z';

/**
 * 火花图标（SVG）。level 为 null 或 out = 熄灭的灰色轮廓；dim = 快熄灭（变暗，样式在 spark.css）。
 * 高两级（烈焰、永恒之火）有很轻的呼吸 / 闪烁动效，系统「减少动态效果」时不播。
 */
export function SparkGlyph({ level, size = 16, out = false, dim = false, title, className }: { level: SparkLevelKey | null; size?: number; out?: boolean; dim?: boolean; title?: string; className?: string }): JSX.Element {
  const id = useId().replace(/:/g, '');
  const colors = level && !out ? PALETTE[level] : null;
  return (
    <svg
      className={cx('ksk-glyph', colors ? `is-${level}` : 'is-out', dim && 'is-dim', className)}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {title ? <title>{title}</title> : null}
      {colors ? (
        <>
          <defs>
            <linearGradient id={`ksk-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={colors.top} />
              <stop offset="1" stopColor={colors.bottom} />
            </linearGradient>
          </defs>
          <g className="ksk-flame">
            <path d={OUTER} fill={`url(#ksk-${id})`} />
            <path d={CORE} fill={colors.core} opacity={level === 'ember' ? 0.75 : 0.95} />
          </g>
          {level === 'eternal' ? <path className="ksk-star" d={STAR} fill={colors.core} /> : null}
        </>
      ) : (
        <path d={OUTER} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" opacity="0.55" />
      )}
    </svg>
  );
}
