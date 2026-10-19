import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import type { GroupFileMeta } from '@/types/groupPlus';
import { formatFileSize, formatRemaining } from '../tier';
import { useGroupPlusUi } from '../ui';
import { downloadAndSave, downloadErrorText, fileIconName, isExpiredAt, isPlayableVideo } from './fileUtils';

/**
 * 聊天里的文件卡片（桌面、移动、精华、收藏、合并转发共用，样式在 styles/group-files.css，前缀 kgp-file-）。
 * 文件消息本身是普通文本消息（旧客户端只看到「[文件] 名（大小）」），新客户端按 metadata.file 画这张卡。
 * 过期用卡片里的 expires_at 自己算，不等服务端事件；已被删除的文件点开会得到 404，提示「文件已不存在」。
 * 视频（mp4 / webm / mov / mkv …）：点卡片在应用里播放（VideoPlayer），右边的下载按钮单独下载。
 */
export function GroupFileCard({ meta, conversationId, compact = false }: { meta: GroupFileMeta; conversationId: number; compact?: boolean }): JSX.Element {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const timerRef = useRef<number | null>(null);
  const expired = isExpiredAt(meta.expires_at) || gone;
  const remaining = meta.permanent ? null : formatRemaining(meta.expires_at);
  const video = isPlayableVideo(meta.content_type, meta.name);
  const openVideo = useGroupPlusUi((state) => state.openVideo);

  useEffect(() => () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
  }, []);

  function download(event: React.MouseEvent): void {
    // 卡片常在可点击的行里（搜索结果、精华条目）：点下载不算「打开这一行」
    event.stopPropagation();
    if (busy || expired) {
      return;
    }
    setBusy(true);
    setError(null);
    downloadAndSave(conversationId, meta.id, meta.name).catch((reason: unknown) => {
      const text = downloadErrorText(reason);
      if (text === '文件已过期' || text === '文件已不存在') {
        setGone(true);
      }
      setError(text);
      timerRef.current = window.setTimeout(() => setError(null), 4000);
    }).finally(() => setBusy(false));
  }

  function play(event: React.MouseEvent): void {
    event.stopPropagation();
    if (expired) {
      return;
    }
    setError(null);
    openVideo({
      conversationId,
      fileId: meta.id,
      name: meta.name,
      size: meta.size,
      onUnavailable: () => setGone(true)
    });
  }

  const state = expired ? '文件已过期' : meta.permanent ? '永久保存' : remaining ? `还剩 ${remaining}` : '';
  if (video) {
    // 两个按钮并排（播放、下载），外层不能再是 <button>
    return (
      <div
        className={`kgp-file-card is-video${compact ? ' is-compact' : ''}${expired ? ' is-expired' : ''}`}
        data-file-id={meta.id}
        onDoubleClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="kgp-file-open" disabled={expired} title={expired ? '文件已过期' : `播放 ${meta.name}`} onClick={play}>
          <span className="kgp-file-icon kgp-file-play"><Icon name={expired ? 'video' : 'play'} className="h-5 w-5" /></span>
          <span className="kgp-file-main">
            <span className="kgp-file-name">{meta.name}</span>
            <span className="kgp-file-sub">{formatFileSize(meta.size)}{state ? ` · ${state}` : ''}</span>
            {error ? <span className="kgp-file-error" role="alert">{error}</span> : null}
          </span>
        </button>
        {expired ? null : (
          <button type="button" className="kgp-file-action kgp-file-dl" title={`下载 ${meta.name}`} aria-label={`下载 ${meta.name}`} disabled={busy} onClick={download}>
            <Icon name={busy ? 'refresh' : 'download'} className={`h-4 w-4${busy ? ' kgp-file-spin' : ''}`} />
          </button>
        )}
      </div>
    );
  }
  return (
    <button
      type="button"
      className={`kgp-file-card${compact ? ' is-compact' : ''}${expired ? ' is-expired' : ''}`}
      data-file-id={meta.id}
      disabled={expired}
      title={expired ? '文件已过期' : `下载 ${meta.name}`}
      onClick={download}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <span className="kgp-file-icon"><Icon name={fileIconName(meta.content_type, meta.name)} className="h-5 w-5" /></span>
      <span className="kgp-file-main">
        <span className="kgp-file-name">{meta.name}</span>
        <span className="kgp-file-sub">{formatFileSize(meta.size)}{state ? ` · ${state}` : ''}</span>
        {error ? <span className="kgp-file-error" role="alert">{error}</span> : null}
      </span>
      <span className="kgp-file-action" aria-hidden="true"><Icon name={busy ? 'refresh' : 'download'} className={`h-4 w-4${busy ? ' kgp-file-spin' : ''}`} /></span>
    </button>
  );
}
