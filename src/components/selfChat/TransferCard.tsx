import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { fileIconName } from '@/components/groupPlus/files/fileUtils';
import { formatFileSize } from '@/components/groupPlus/tier';
import { Icon } from '@/components/ui/Icon';
import { toast } from '@/components/ui/toast';
import type { SelfTransferMeta } from '@/types/api';
import { isTransferExpired, middleEllipsis, transferRemainingText } from '@/utils/selfChat';
import { downloadSelfTransfer, isTransferGoneError, transferDownloadErrorText } from './download';
import { cancelSelfTransfer, dismissSelfTransfer, retrySelfTransfer, selfTransferKeys, useSelfTransfers } from './transfers';

/** 只在已经过期的文件里记一下（点下载拿到 410 的）：同一个文件在别处（收藏、搜索）再画也是过期 */
const goneTransfers = new Set<number>();

/** 每 30 秒走一次的时钟：剩余时间只精确到分钟 */
function useMinuteClock(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) {
      return undefined;
    }
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

/**
 * 「我的设备」里的临时文件消息（metadata.transfer，self-chat.md 5.3）：文件图标、名字（太长砍中间、留扩展名）、大小、
 * 剩余有效期（自己按 expires_at 倒数，过期时服务端不推事件），点一下下载。过期了置灰、不能点。
 * 样子沿用群文件卡片（kgp-file-card，黑白灰阶），差别在 styles/self-chat.css。
 */
export function SelfTransferCard({ meta, conversationId, compact = false, nameUnits }: { meta: SelfTransferMeta; conversationId: number; compact?: boolean; /** 名字一行放多少格（汉字两格），手机布局卡片窄要少一点 */ nameUnits?: number }): JSX.Element {
  const [gone, setGone] = useState(() => goneTransfers.has(meta.id));
  const [busy, setBusy] = useState(false);
  const now = useMinuteClock(!gone && !meta.expired);
  const expired = gone || isTransferExpired(meta, now);
  const remaining = expired ? null : transferRemainingText(meta.expires_at, now);
  const soon = remaining !== null && remaining.includes('分钟');

  function download(event: React.MouseEvent): void {
    // 卡片常在可点击的行里（搜索结果、收藏条目）：点下载不算「打开这一行」
    event.stopPropagation();
    if (busy || expired) {
      return;
    }
    setBusy(true);
    downloadSelfTransfer(conversationId, meta.id, meta.name).catch((error: unknown) => {
      if (isTransferGoneError(error)) {
        goneTransfers.add(meta.id);
        setGone(true);
        toast.info('文件已过期', { subtitle: '临时文件只保留 24 小时' });
        return;
      }
      toast.error(transferDownloadErrorText(error));
    }).finally(() => setBusy(false));
  }

  return (
    <button
      type="button"
      className={`kgp-file-card kself-file${compact ? ' is-compact' : ''}${expired ? ' is-expired' : ''}`}
      data-transfer-id={meta.id}
      disabled={expired}
      title={expired ? `${meta.name}（已过期）` : `下载 ${meta.name}`}
      onClick={download}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <span className="kgp-file-icon"><Icon name={expired ? 'hourglass' : fileIconName(meta.content_type, meta.name)} className="h-5 w-5" /></span>
      <span className="kgp-file-main">
        <span className="kgp-file-name">{middleEllipsis(meta.name, nameUnits ?? (compact ? 20 : 24))}</span>
        <span className="kgp-file-sub">
          <span>{formatFileSize(meta.size)}</span>
          <span className={`kself-file-ttl${soon ? ' is-soon' : ''}${expired ? ' is-expired' : ''}`}>{expired ? '已过期' : remaining ?? '24 小时内有效'}</span>
        </span>
      </span>
      {expired ? null : <span className="kgp-file-action" aria-hidden="true"><Icon name={busy ? 'refresh' : 'download'} className={`h-4 w-4${busy ? ' kgp-file-spin' : ''}`} /></span>}
    </button>
  );
}

/**
 * 正在发的临时文件（components/selfChat/transfers.ts 放进列表的本地消息）：同一张卡片，多一条进度线和取消；
 * 失败了说原因，可以重试或删掉。complete 回来的文件消息会原地换掉它。进度只有这张卡片订阅。
 */
export function SelfTransferUploadCard({ taskId }: { taskId: number }): JSX.Element | null {
  const queryClient = useQueryClient();
  const task = useSelfTransfers((state) => state.tasks.find((item) => item.id === taskId));
  if (!task) {
    return null;
  }
  const ratio = task.size > 0 ? Math.min(1, task.loaded / task.size) : 0;
  const percent = Math.round(ratio * 100);
  const failed = task.status === 'failed';
  const finishing = task.status === 'finishing' || (task.status === 'uploading' && ratio >= 1);
  const sub = failed
    ? '发送失败'
    : task.status === 'done'
      ? `${formatFileSize(task.size)} · 已发送`
      : finishing
        ? `${formatFileSize(task.size)} · 处理中…`
        : task.loaded === 0
          ? `${formatFileSize(task.size)} · 准备上传…`
          : `${formatFileSize(task.loaded)} / ${formatFileSize(task.size)} · ${percent}%`;

  return (
    <div className={`kgp-file-card kgp-file-upload kself-file is-${task.status}`} onDoubleClick={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
      <span className="kgp-file-icon"><Icon name={failed ? 'alertCircle' : fileIconName(task.contentType, task.name)} className="h-5 w-5" /></span>
      <span className="kgp-file-main">
        <span className="kgp-file-name" title={task.name}>{middleEllipsis(task.name, 22)}</span>
        <span className="kgp-file-sub">{sub}</span>
        {failed && task.error ? <span className="kgp-file-error" role="alert">{task.error}</span> : null}
        {failed ? null : (
          <span className="kgp-file-progress" role="progressbar" aria-label={`正在发送 ${task.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
            <span className={finishing ? 'kgp-file-progress-fill is-finishing' : 'kgp-file-progress-fill'} style={{ transform: `scaleX(${task.status === 'done' || finishing ? 1 : ratio})` }} />
          </span>
        )}
      </span>
      {task.status === 'uploading' || task.status === 'finishing' ? (
        // 字节发完、正在落消息时取消不掉了，按钮置灰
        <button type="button" className="kgp-file-dl kgp-file-upload-btn" title={finishing ? '正在完成，不能取消了' : '取消发送'} aria-label={`取消发送 ${task.name}`} disabled={finishing} onClick={() => cancelSelfTransfer(task.id)}>
          <Icon name="close" className="h-4 w-4" />
        </button>
      ) : null}
      {failed ? (
        <span className="kgp-file-upload-actions">
          <button type="button" className="kgp-file-upload-retry" onClick={() => retrySelfTransfer(queryClient, task.id)}>重试</button>
          <button type="button" className="kgp-file-dl kgp-file-upload-btn" title="删除" aria-label={`删除 ${task.name}`} onClick={() => {
            dismissSelfTransfer(task.id);
            void queryClient.invalidateQueries({ queryKey: selfTransferKeys.list(task.conversationId) });
          }}>
            <Icon name="trash" className="h-4 w-4" />
          </button>
        </span>
      ) : null}
    </div>
  );
}
