import { useState } from 'react';
import { createPortal } from 'react-dom';
import { getDesktopPortalRoot, Modal } from '@/components/ui/desktop/Modal';
import type { JuryOpinion } from '@/types/jury';

const DETAILS_MAX = 500;
/** 选「其他」时补充说明至少要写几个字（docs/jury-v2.md 1.6 的 invalid_reason） */
const OTHER_DETAILS_MIN = 5;
const OTHER_REASON = '其他';

/** 举报一条观点：选理由，可以补充说明。举报进管理员队列，被举报的人不会知道是谁举报的。 */
export function ReportOpinionModal({ opinion, reasons, pending, error, onSubmit, onClose }: { opinion: JuryOpinion; reasons: string[]; pending: boolean; error: string | null; onSubmit: (reason: string, details: string) => void; onClose: () => void }): JSX.Element {
  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState('');
  const needDetails = reason === OTHER_REASON;
  const valid = reason !== null && (!needDetails || details.trim().length >= OTHER_DETAILS_MIN);

  // 风纪页的外层是容器查询的基准，会把 position: fixed 的后代圈在里面，所以对话框要挂到窗口根上
  return createPortal(
    <Modal
      title="举报这条观点"
      subtitle={opinion.alias}
      className="kmd-modal--sm"
      dismissOnBackdrop={!details.trim()}
      onClose={onClose}
      onSubmit={() => {
        if (valid && !pending && reason) {
          onSubmit(reason, details.trim());
        }
      }}
      footer={(
        <>
          <button type="button" className="kui-btn kui-btn--ghost" disabled={pending} onClick={onClose}>取消</button>
          <button type="submit" className="kui-btn kui-btn--primary" data-action="submit-report" disabled={!valid || pending}>{pending ? '提交中…' : '提交举报'}</button>
        </>
      )}
    >
      <div className="kjr-report">
        <blockquote className="kjr-quote">{opinion.content}</blockquote>
        <div className="kjr-report-reasons" role="radiogroup" aria-label="举报理由">
          {reasons.map((item) => (
            <label key={item} className="kjr-report-reason">
              <input type="radio" name="jury-opinion-report" checked={reason === item} onChange={() => setReason(item)} />
              <span>{item}</span>
            </label>
          ))}
        </div>
        <textarea className="kui-textarea kui-scroll" rows={3} value={details} aria-label="补充说明" onChange={(event) => setDetails(event.target.value.slice(0, DETAILS_MAX))} placeholder={needDetails ? `请说明具体情况（至少 ${OTHER_DETAILS_MIN} 个字）` : '补充说明（选填）'} />
        {error ? <p className="kui-note kui-note--danger" role="alert">{error}</p> : null}
        <p className="kjr-meta">举报交给管理员处理。同一条观点被多位委员举报后会先折叠起来。</p>
      </div>
    </Modal>,
    getDesktopPortalRoot()
  );
}
