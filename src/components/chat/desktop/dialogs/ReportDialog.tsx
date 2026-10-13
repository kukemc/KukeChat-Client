import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/desktop/Modal';
import { resolveAssetUrl } from '@/utils/assetUrl';
import { formatMessageDateTime } from '@/utils/dateTime';
import { MAX_DESCRIPTION_LENGTH, evidencePreview, type ReportForm } from '../../reportForm';

/** 桌面端的举报对话框。只负责界面，状态和校验都在 useReportForm 里。 */
export function ReportDialog({ form }: { form: ReportForm }): JSX.Element {
  const { title, targetLabel, quota, options, MAX_ATTACHMENTS, reason, setPickedReason, description, setDescription, cleanDescription, detailsRequired, candidates, evidenceIds, setEvidenceIds, attachments, setAttachments, uploading, uploadError, chooseAttachments, blocker, error, alreadyReviewed, canSubmit, isPending, submit, onClose } = form;
  const busy = isPending || uploading;

  return (
    <Modal
      title={title}
      className="kmd-modal--md"
      bodyClassName="kmd-form"
      // 提交和上传途中不让遮罩把弹窗关掉；Esc 由表单自己按同样的条件处理
      dismissOnBackdrop={!busy}
      dismissOnEscape={false}
      onSubmit={submit}
      onClose={onClose}
      footer={(
        <>
          {quota ? <p className="kmd-foot-note">今天还可以举报 <b>{Math.max(0, quota.remaining_today)}</b> 次</p> : null}
          {alreadyReviewed ? <button type="button" className="kui-btn kui-btn--primary" data-action="report-acknowledge" onClick={onClose}>知道了</button> : (
            <>
              <button type="button" className="kui-btn" onClick={onClose}>取消</button>
              <button type="submit" className="kui-btn kui-btn--primary" disabled={!canSubmit}>{isPending ? '提交中…' : '提交举报'}</button>
            </>
          )}
        </>
      )}
    >
      <div className="kmd-report-target">
        <Icon name="flag" className="h-4 w-4" />
        <div>
          <strong>{targetLabel}</strong>
          <span>请选择举报原因。提交后会结合举报时保存的内容证据进行处理，处理结果会通知你。</span>
        </div>
      </div>

      <fieldset className="kmd-field">
        <legend className="kmd-label">举报原因</legend>
        <div className="kmd-choices">
          {options.reasons.map(({ reason: item }) => (
            <label key={item} className={reason === item ? 'is-selected' : undefined}>
              <input type="radio" name="report-reason" checked={reason === item} onChange={() => setPickedReason(item)} />
              {item}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="kmd-field">
        <label className="kmd-label" htmlFor="kmd-report-description">
          {detailsRequired ? `具体说明（必填，至少 ${options.details_min_length} 个字）` : '补充说明（选填）'}
          <span>{cleanDescription.length}/{MAX_DESCRIPTION_LENGTH}</span>
        </label>
        <textarea id="kmd-report-description" className="kui-textarea kui-scroll" value={description} rows={4} placeholder={`可填写更多证据或说明，最多 ${MAX_DESCRIPTION_LENGTH} 字`} onChange={(event) => setDescription(event.target.value.slice(0, MAX_DESCRIPTION_LENGTH))} />
        <p className="kmd-hint">举报内容会包含必要的目标定位和证据快照。</p>
      </div>

      {candidates.length > 0 ? (
        <div className="kmd-field">
          <span className="kmd-label">证据消息（勾选对方发过的违规消息）<span>{evidenceIds.length}/{options.max_evidence_messages}</span></span>
          <div className="kmd-options kmd-options--boxed kmd-evidence kui-scroll">
            {candidates.map((message) => {
              const checked = evidenceIds.includes(message.id);
              const full = !checked && evidenceIds.length >= options.max_evidence_messages;
              return (
                <label key={message.id} className={`kmd-option${checked ? ' is-selected' : ''}${full ? ' is-disabled' : ''}`}>
                  <input type="checkbox" className="sr-only" checked={checked} disabled={full} onChange={() => setEvidenceIds((current) => (checked ? current.filter((id) => id !== message.id) : [...current, message.id]))} />
                  <span className="kmd-checkbox">{checked ? <Icon name="check" className="h-3 w-3" /> : null}</span>
                  <span className="kmd-option-text">
                    <span>{evidencePreview(message)}</span>
                    <span>{formatMessageDateTime(message.created_at)}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="kmd-field">
        <span className="kmd-label">凭证图片（选填）<span>{attachments.length}/{MAX_ATTACHMENTS}</span></span>
        <div className="kmd-shots">
          {attachments.map((url, index) => {
            const imageUrl = resolveAssetUrl(url);
            return imageUrl ? (
              <div key={`${url}-${index}`} className="kmd-shot">
                <img src={imageUrl} alt={`举报凭证 ${index + 1}`} />
                <button type="button" aria-label="移除凭证图片" title="移除" onClick={() => setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Icon name="close" className="h-3 w-3" /></button>
              </div>
            ) : null;
          })}
          {attachments.length < MAX_ATTACHMENTS ? (
            <label className={uploading ? 'kmd-shot-add is-disabled' : 'kmd-shot-add'}>
              <Icon name={uploading ? 'refresh' : 'plus'} className="h-4 w-4" />
              {uploading ? '上传中…' : '上传图片'}
              <input type="file" accept="image/*" multiple hidden disabled={uploading} onChange={(event) => void chooseAttachments(event)} />
            </label>
          ) : null}
        </div>
        {attachments.length === 0 ? <p className="kmd-hint">可以上传聊天截图、动态截图等补充证据，最多 {MAX_ATTACHMENTS} 张。</p> : null}
        {uploadError ? <p className="kui-note kui-note--danger" role="alert">{uploadError}</p> : null}
      </div>

      {blocker ? <p className="kui-note kui-note--warn">{blocker}</p> : null}
      {alreadyReviewed ? (
        <p className="kui-note kui-note--warn" role="alert" data-report-error="already_reviewed">
          这条内容最近已经评审过，结论是不违规，所以不能再举报一次。如果对方之后又发了新的违规内容，请举报新的那一条。你之前举报过它、对结论有异议的话，可以到「设置 · 举报记录」里看看能不能申请复议。
        </p>
      ) : error ? <p className="kui-note kui-note--danger" role="alert">{error instanceof Error && error.message ? error.message : '举报提交失败，请稍后重试。'}</p> : null}
    </Modal>
  );
}
