import { formatBytes } from './updateFormat';

/** 下载进度：一根细线 + 已下载 / 总大小 + 百分比。total 未知时是来回走的不定进度。 */
export function UpdateProgress({ downloaded, total }: { downloaded: number; total: number | null }): JSX.Element {
  const percent = total ? Math.min(100, Math.floor((downloaded / total) * 100)) : null;
  return (
    <div className="kup-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent ?? undefined}>
      <div className="kup-progress-track">
        <div className={`kup-progress-fill ${percent === null ? 'is-unknown' : ''}`} style={percent === null ? undefined : { width: `${percent}%` }} />
      </div>
      <div className="kup-progress-label">
        <span>{downloaded > 0 ? formatBytes(downloaded) : '准备下载'}{total ? ` / ${formatBytes(total)}` : ''}</span>
        <span>{percent === null ? '下载中…' : `${percent}%`}</span>
      </div>
    </div>
  );
}
