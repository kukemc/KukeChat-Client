import { useState } from 'react';
import { createPortal } from 'react-dom';
import { getDesktopPortalRoot, Modal } from '@/components/ui/desktop/Modal';

const DETAILS_MAX = 500;
/** 选「其他」时至少要写几个字，和观点区的举报一个规矩 */
const OTHER_DETAILS_MIN = 5;
const OTHER_REASON = '其他';

export interface HallReportTarget {
  type: 'post' | 'comment';
  id: number;
  /** 被举报的是谁、原话是什么，给举报人确认用 */
  author: string;
  quote: string;
}

/** 举报议事厅里的一个帖子或一条评论：选理由（config.hall.report_reasons），可以补充说明。交给管理员处理。 */
export function HallReportModal({ target, reasons, pending, error, onSubmit, onClose }: { target: HallReportTarget; reasons: string[]; pending: boolean; error: string | null; onSubmit: (reason: string, details: string) => void; onClose: () => void }): JSX.Element {
  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState('');
  const needDetails = reason === OTHER_REASON;
  const valid = reason !== null && (!needDetails || details.trim().length >= OTHER_DETAILS_MIN);

  // 风纪页的外层会把 position: fixed 的后代圈在里面，对话框要挂到窗口根上
  return createPortal(
    <Modal
      title={target.type === 'post' ? '举报这个帖子' : '举报这条评论'}
      subtitle={target.author}
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
          <button type="submit" className="kui-btn kui-btn--primary" data-action="submit-hall-report" disabled={!valid || pending}>{pending ? '提交中…' : '提交举报'}</button>
        </>
      )}
    >
      <div className="kjr-report">
        <blockquote className="kjr-quote">{target.quote}</blockquote>
        <div className="kjr-report-reasons" role="radiogroup" aria-label="举报理由">
          {reasons.map((item) => (
            <label key={item} className="kjr-report-reason">
              <input type="radio" name="jury-hall-report" checked={reason === item} onChange={() => setReason(item)} />
              <span>{item}</span>
            </label>
          ))}
        </div>
        <textarea className="kui-textarea kui-scroll" rows={3} value={details} aria-label="补充说明" onChange={(event) => setDetails(event.target.value.slice(0, DETAILS_MAX))} placeholder={needDetails ? `请说明具体情况（至少 ${OTHER_DETAILS_MIN} 个字）` : '补充说明（选填）'} />
        {error ? <p className="kui-note kui-note--danger" role="alert">{error}</p> : null}
        <p className="kjr-meta">举报交给管理员处理，被举报的人不会知道是谁举报的。</p>
      </div>
    </Modal>,
    getDesktopPortalRoot()
  );
}
