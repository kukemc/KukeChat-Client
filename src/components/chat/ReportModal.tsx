import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { uploadMessageImage } from '@/api/messages';
import type { CreateReportPayload, ReportTargetType } from '@/types/api';
import { Icon } from '@/components/ui/Icon';
import { resolveAssetUrl } from '@/utils/assetUrl';

interface ReportModalProps {
  targetType: ReportTargetType;
  targetId: number;
  targetLabel: string;
  conversationId?: number;
  messageId?: number;
  reportedUserId?: number;
  isPending?: boolean;
  error?: unknown;
  onSubmit: (payload: CreateReportPayload) => void;
  onClose: () => void;
}

const REPORT_REASONS = [
  '垃圾广告',
  '辱骂骚扰',
  '色情低俗',
  '违法违规',
  '诈骗或钓鱼',
  '其他'
] as const;

const MAX_DESCRIPTION_LENGTH = 300;
const MAX_ATTACHMENTS = 6;
const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;

function getKukePortalRoot(): Element {
  const host = document.getElementById('kukechat-shadow-host');
  return host?.shadowRoot?.querySelector('.kc-window-frame:not(.kc-window-minimized)')
    ?? document.querySelector('.kc-window-frame:not(.kc-window-minimized)')
    ?? document.querySelector('.kc-desktop-app')
    ?? host?.shadowRoot?.getElementById('kukechat-root')
    ?? document.getElementById('kukechat-root')
    ?? document.body;
}

export function ReportModal({ targetType, targetId, targetLabel, conversationId, messageId, reportedUserId, isPending = false, error, onSubmit, onClose }: ReportModalProps): JSX.Element {
  const [reason, setReason] = useState<(typeof REPORT_REASONS)[number]>('垃圾广告');
  const [description, setDescription] = useState('');
  const [attachments, setAttachments] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const cleanDescription = description.trim();
  const canSubmit = reason.length > 0 && cleanDescription.length <= MAX_DESCRIPTION_LENGTH && !isPending && !uploading;
  const title = targetType === 'message' ? '举报消息' : targetType === 'conversation' ? '举报群聊' : targetType === 'post' ? '举报动态' : '举报用户';

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape' && !isPending && !uploading) {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPending, onClose, uploading]);

  function submit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }

    onSubmit({
      target_type: targetType,
      target_id: targetId,
      reason,
      description: cleanDescription || undefined,
      attachments,
      conversation_id: conversationId,
      message_id: messageId,
      reported_user_id: reportedUserId
    });
  }

  async function chooseAttachments(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const files = Array.from(event.target.files ?? []).slice(0, MAX_ATTACHMENTS - attachments.length);
    event.target.value = '';
    if (files.length === 0) {
      return;
    }
    const oversized = files.filter((file) => file.size > MAX_ATTACHMENT_BYTES);
    const validFiles = files.filter((file) => file.size <= MAX_ATTACHMENT_BYTES);
    if (oversized.length > 0) {
      setUploadError('图片不能超过 3MB，过大的图片已忽略。');
    }
    if (validFiles.length === 0) {
      return;
    }
    setUploading(true);
    if (oversized.length === 0) {
      setUploadError(null);
    }
    try {
      const uploaded = await Promise.all(validFiles.map((file) => uploadMessageImage(file)));
      setAttachments((current) => [...current, ...uploaded.map((item) => item.url)].slice(0, MAX_ATTACHMENTS));
    } catch {
      setUploadError('凭证图片上传失败，请稍后重试。');
    } finally {
      setUploading(false);
    }
  }

  const modal = (
    <div className="pointer-events-auto fixed inset-0 z-[2147483647] grid place-items-center overflow-hidden p-4 backdrop-blur-sm [background:rgba(15,23,42,0.32)]" onMouseDown={() => !isPending && !uploading && onClose()}>
      <form onSubmit={submit} onMouseDown={(event) => event.stopPropagation()} className="flex max-h-[calc(100%-32px)] w-full max-w-[520px] min-h-0 flex-col overflow-hidden rounded-[24px] border shadow-float [background:var(--kc-window)] [border-color:var(--kc-border-strong)] [color:var(--kc-text)]">
        <header className="flex h-12 shrink-0 items-center justify-between border-b px-4 [background:var(--kc-titlebar)] [border-color:var(--kc-border)]">
          <h3 className="text-sm font-semibold">{title}</h3>
          <button type="button" onClick={onClose} className="kc-icon-button h-8 w-9 hover:bg-red-500 hover:text-white" aria-label={`关闭${title}`}>
            <Icon name="close" className="h-4 w-4" />
          </button>
        </header>

        <div className="scroll-soft min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-5 [background:var(--kc-panel)]">
          <div className="flex items-start gap-3 rounded-[18px] border p-3 [background:var(--kc-panel-muted)] [border-color:var(--kc-border)]">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full [background:var(--kc-accent-soft)] [color:var(--kc-accent)]">
              <Icon name="flag" className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold">{targetLabel}</p>
              <p className="mt-1 text-xs leading-5 [color:var(--kc-muted)]">请选择举报原因。提交后管理员会结合举报时保存的内容证据进行处理。</p>
            </div>
          </div>

          <fieldset className="grid grid-cols-2 gap-2">
            <legend className="sr-only">举报原因</legend>
            {REPORT_REASONS.map((item) => (
              <label key={item} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${reason === item ? '[background:var(--kc-accent-soft)] [border-color:var(--kc-accent)] [color:var(--kc-accent)]' : '[background:var(--kc-panel)] [border-color:var(--kc-border)] hover:[background:var(--kc-hover)]'}`}>
                <input type="radio" name="report-reason" checked={reason === item} onChange={() => setReason(item)} className="h-3.5 w-3.5 accent-[var(--kc-accent)]" />
                <span>{item}</span>
              </label>
            ))}
          </fieldset>

          <div>
            <label htmlFor="report-description" className="mb-2 block text-xs font-medium [color:var(--kc-muted)]">补充说明（选填）</label>
            <textarea
              id="report-description"
              value={description}
              onChange={(event) => setDescription(event.target.value.slice(0, MAX_DESCRIPTION_LENGTH))}
              rows={5}
              placeholder="可填写更多证据或说明，最多300字"
              className="scroll-soft w-full resize-none rounded-[18px] border px-4 py-3 text-sm leading-6 outline-none transition [background:var(--kc-panel-muted)] [border-color:var(--kc-border)] [color:var(--kc-text)] placeholder:[color:var(--kc-muted)] focus:[border-color:var(--kc-accent)]"
            />
            <div className="mt-2 flex items-center justify-between gap-3 text-xs [color:var(--kc-muted)]">
              <span>举报内容会包含必要的目标定位和证据快照。</span>
              <span>{cleanDescription.length}/{MAX_DESCRIPTION_LENGTH}</span>
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-xs font-medium [color:var(--kc-muted)]">凭证图片（选填）</span>
              <label className={`cursor-pointer rounded-xl border px-3 py-1.5 text-xs font-bold transition [border-color:var(--kc-border)] ${attachments.length >= MAX_ATTACHMENTS || uploading ? 'pointer-events-none opacity-50' : 'hover:[background:var(--kc-hover)]'}`}>
                {uploading ? '上传中...' : '上传图片'}
                <input type="file" accept="image/*" multiple onChange={(event) => void chooseAttachments(event)} className="hidden" />
              </label>
            </div>
            {attachments.length > 0 ? (
              <div className="grid grid-cols-3 gap-2">
                {attachments.map((url, index) => {
                  const imageUrl = resolveAssetUrl(url);
                  return imageUrl ? (
                    <div key={`${url}-${index}`} className="group relative overflow-hidden rounded-2xl border [border-color:var(--kc-border)] [background:var(--kc-panel-muted)]">
                      <img src={imageUrl} alt={`举报凭证 ${index + 1}`} className="h-20 w-full object-cover" />
                      <button type="button" onClick={() => setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/55 text-white opacity-0 transition group-hover:opacity-100" aria-label="移除凭证图片">
                        <Icon name="close" className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : null;
                })}
              </div>
            ) : (
              <p className="rounded-2xl border border-dashed px-3 py-3 text-xs [border-color:var(--kc-border)] [color:var(--kc-muted)]">可以上传聊天截图、动态截图等补充证据，最多 {MAX_ATTACHMENTS} 张。</p>
            )}
            {uploadError ? <p className="mt-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-500">{uploadError}</p> : null}
          </div>

          {error ? <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-500">举报提交失败，请稍后重试。</p> : null}
        </div>

        <div className="flex shrink-0 justify-end gap-3 border-t px-5 py-4 [background:var(--kc-panel)] [border-color:var(--kc-border)]">
          <button type="button" onClick={onClose} className="rounded-xl border px-5 py-2 text-sm font-semibold transition [border-color:var(--kc-border-strong)] [color:var(--kc-text)] hover:[background:var(--kc-hover)]">取消</button>
          <button type="submit" disabled={!canSubmit} className="liquid-button rounded-xl px-6 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-45">
            {isPending ? '提交中...' : '提交举报'}
          </button>
        </div>
      </form>
    </div>
  );
  return createPortal(modal, getKukePortalRoot());
}
