import { useQueryClient } from '@tanstack/react-query';
import { Icon } from '@/components/ui/Icon';
import { formatFileSize } from '../tier';
import { useGroupFileUploads } from '../uploads';
import { fileIconName } from './fileUtils';

/**
 * 聊天里正在上传的文件（components/chat/message/chatUploads.ts 放进列表的本地消息）：
 * 和文件消息卡片同一个样子，多一条进度和取消；失败了显示原因，可以重试或删掉。
 * 传完服务端落的文件消息会原地换掉它。进度只有这张卡片订阅，消息列表不跟着重渲染。
 */
export function UploadingFileCard({ taskId }: { taskId: number }): JSX.Element | null {
  const queryClient = useQueryClient();
  const task = useGroupFileUploads((state) => state.tasks.find((item) => item.id === taskId));
  const cancel = useGroupFileUploads((state) => state.cancel);
  const dismiss = useGroupFileUploads((state) => state.dismiss);
  const retry = useGroupFileUploads((state) => state.retry);
  if (!task) {
    return null;
  }
  const ratio = task.size > 0 ? Math.min(1, task.loaded / task.size) : 0;
  const percent = Math.round(ratio * 100);
  const uploading = task.status === 'uploading';
  const failed = task.status === 'failed';
  // 字节都发完了还没回来：直传要再通知一次后端，后端要落消息，这段时间说「处理中」
  const finishing = uploading && ratio >= 1;
  const sub = failed
    ? '上传失败'
    : task.status === 'done'
      ? `${formatFileSize(task.size)} · 已上传`
      : finishing
        ? `${formatFileSize(task.size)} · 处理中…`
        : `${formatFileSize(task.loaded)} / ${formatFileSize(task.size)} · ${percent}%`;

  return (
    <div
      className={`kgp-file-card kgp-file-upload is-${task.status}`}
      onDoubleClick={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <span className="kgp-file-icon"><Icon name={failed ? 'alertCircle' : fileIconName(task.contentType, task.name)} className="h-5 w-5" /></span>
      <span className="kgp-file-main">
        <span className="kgp-file-name" title={task.name}>{task.name}</span>
        <span className="kgp-file-sub">{sub}</span>
        {failed && task.error ? <span className="kgp-file-error" role="alert">{task.error}</span> : null}
        {failed ? null : (
          <span className="kgp-file-progress" role="progressbar" aria-label={`正在上传 ${task.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
            <span className={finishing ? 'kgp-file-progress-fill is-finishing' : 'kgp-file-progress-fill'} style={{ transform: `scaleX(${task.status === 'done' ? 1 : ratio})` }} />
          </span>
        )}
      </span>
      {uploading ? (
        // 字节发完后取消不掉了（服务端已经在落消息），按钮置灰
        <button type="button" className="kgp-file-dl kgp-file-upload-btn" title={finishing ? '正在完成，不能取消了' : '取消上传'} aria-label={`取消上传 ${task.name}`} disabled={finishing} onClick={() => {
          cancel(task.id);
          dismiss(task.id);
        }}>
          <Icon name="close" className="h-4 w-4" />
        </button>
      ) : null}
      {failed ? (
        <span className="kgp-file-upload-actions">
          <button type="button" className="kgp-file-upload-retry" onClick={() => retry(queryClient, task.id)}>重试</button>
          <button type="button" className="kgp-file-dl kgp-file-upload-btn" title="删除" aria-label={`删除 ${task.name}`} onClick={() => dismiss(task.id)}>
            <Icon name="trash" className="h-4 w-4" />
          </button>
        </span>
      ) : null}
    </div>
  );
}
