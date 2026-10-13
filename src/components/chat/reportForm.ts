import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ApiError } from '@/api/client';
import { uploadMessageImage } from '@/api/messages';
import { getReportOptions, getReportQuota } from '@/api/moderation';
import { isRecord } from '@/api/normalizers';
import type { CreateReportPayload, Message, ReportTargetType } from '@/types/api';
import type { ReportOptions } from '@/types/moderation';

export interface ReportModalProps {
  targetType: ReportTargetType;
  targetId: number;
  targetLabel: string;
  conversationId?: number;
  messageId?: number;
  reportedUserId?: number;
  /** 举报用户时可以勾选的证据：被举报人在这个会话里发过的消息，新的在前。 */
  evidenceCandidates?: Message[];
  isPending?: boolean;
  error?: unknown;
  onSubmit: (payload: CreateReportPayload) => void;
  onClose: () => void;
}

/** 举报选项以服务端下发的为准；这份只在选项接口拿不到时兜底，保证弹窗还能用。 */
const FALLBACK_OPTIONS: ReportOptions = {
  reasons: ['垃圾广告', '辱骂骚扰', '色情低俗', '违法违规', '诈骗或钓鱼'].map((reason) => ({ reason, details_required: false })).concat({ reason: '其他', details_required: true }),
  details_min_length: 10,
  max_evidence_messages: 10,
  max_attachments: 6
};

/** 服务端拒绝举报时的 detail.code（already_reviewed …），没有就是 null */
function reportErrorCode(error: unknown): string | null {
  if (!(error instanceof ApiError) || !isRecord(error.detail)) {
    return null;
  }
  const detail = isRecord(error.detail.detail) ? error.detail.detail : error.detail;
  return typeof detail.code === 'string' ? detail.code : null;
}

export const MAX_DESCRIPTION_LENGTH = 300;
const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;
const MAX_COMPRESSIBLE_ATTACHMENT_ORIGINAL_BYTES = 12 * 1024 * 1024;

export function evidencePreview(message: Message): string {
  if (message.type === 'image') return '[图片]';
  if (message.type === 'voice') return '[语音]';
  return message.content?.trim() || `[${message.type}]`;
}

export type ReportForm = ReturnType<typeof useReportForm>;

/** 举报表单的全部状态和校验。两种布局的弹窗共用，各自只管怎么画。 */
export function useReportForm({ targetType, targetId, targetLabel, conversationId, messageId, reportedUserId, evidenceCandidates, isPending = false, error, onSubmit, onClose }: ReportModalProps) {
  const optionsQuery = useQuery({ queryKey: ['report-options'], queryFn: getReportOptions, staleTime: 10 * 60_000, retry: 1 });
  const quotaQuery = useQuery({ queryKey: ['report-quota'], queryFn: getReportQuota, staleTime: 0, retry: false });
  const options = optionsQuery.data ?? FALLBACK_OPTIONS;
  const MAX_ATTACHMENTS = options.max_attachments;
  const [pickedReason, setPickedReason] = useState<string | null>(null);
  const reason = pickedReason && options.reasons.some((item) => item.reason === pickedReason) ? pickedReason : options.reasons[0]?.reason ?? '';
  const [description, setDescription] = useState('');
  const [attachments, setAttachments] = useState<string[]>([]);
  const [evidenceIds, setEvidenceIds] = useState<number[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const cleanDescription = description.trim();
  const detailsRequired = options.reasons.find((item) => item.reason === reason)?.details_required ?? false;
  const hasEnoughDetails = cleanDescription.length >= options.details_min_length;
  // 举报用户或群聊没有固定的「那一条内容」，必须自己给出依据：证据消息、截图或文字说明，至少一样
  const needsEvidence = targetType === 'user' || targetType === 'conversation';
  const candidates = targetType === 'user' ? evidenceCandidates ?? [] : [];
  const missingDetails = detailsRequired && !hasEnoughDetails;
  const missingEvidence = needsEvidence && evidenceIds.length === 0 && attachments.length === 0 && !hasEnoughDetails;
  const quota = quotaQuery.data;
  const outOfQuota = quota ? quota.remaining_today <= 0 : false;
  const blocker = outOfQuota ? '今天的举报次数已经用完，明天再来吧。'
    : missingDetails ? `选择「${reason}」时请写明具体情况，至少 ${options.details_min_length} 个字。`
    : missingEvidence ? `请${candidates.length > 0 ? '勾选证据消息、' : ''}上传截图，或写至少 ${options.details_min_length} 个字的说明。`
    : '';
  const canSubmit = reason.length > 0 && !blocker && reportErrorCode(error) !== 'already_reviewed' && cleanDescription.length <= MAX_DESCRIPTION_LENGTH && !isPending && !uploading;
  // 这条内容近期已经评审过、认定不违规（409 already_reviewed）：再点提交也没用，界面改成说明 + 关闭
  const alreadyReviewed = reportErrorCode(error) === 'already_reviewed';
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

  function submit(event?: React.FormEvent<HTMLFormElement>): void {
    event?.preventDefault();
    if (!canSubmit) {
      return;
    }

    onSubmit({
      target_type: targetType,
      target_id: targetId,
      reason,
      description: cleanDescription || undefined,
      details: cleanDescription || undefined,
      attachments,
      evidence_message_ids: evidenceIds.length > 0 ? evidenceIds : undefined,
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
    const oversized = files.filter((file) => file.size > (
      /^(image\/jpeg|image\/png|image\/webp)$/i.test(file.type)
        ? MAX_COMPRESSIBLE_ATTACHMENT_ORIGINAL_BYTES
        : MAX_ATTACHMENT_BYTES
    ));
    const validFiles = files.filter((file) => !oversized.includes(file));
    if (oversized.length > 0) {
      setUploadError('JPEG/PNG/WEBP 原图不能超过 12MB，GIF 及其他图片原图不能超过 3MB；压缩后不能超过 3MB。过大的图片已忽略。');
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

  return {
    title, targetLabel, quota, options, MAX_ATTACHMENTS,
    reason, setPickedReason,
    description, setDescription, cleanDescription, detailsRequired,
    candidates, evidenceIds, setEvidenceIds,
    attachments, setAttachments, uploading, uploadError, chooseAttachments,
    blocker, error, alreadyReviewed, canSubmit, isPending, submit, onClose
  };
}
