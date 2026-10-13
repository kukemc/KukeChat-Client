import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { reconsiderReport } from '@/api/jurySenior';
import { errorStatus, errorText, useJuryConfig } from '@/components/jury/data/queries';
import { reconsiderRules } from '@/components/jury/data/senior';
import type { ReportRead } from '@/types/api';

const TEXT_MAX = 500;

const STATUS_TEXT: Record<string, { tone: string; text: string }> = {
  // 资深委员凑不齐或超时会转给管理员，转过去之后结果出来前状态一直是 pending，所以不说死是谁在看
  pending: { tone: 'kui-tag--warn', text: '已申请复议，正在复审（资深风纪委员，或者转给管理员）。有结果会通知你。' },
  upheld: { tone: '', text: '复议结果：维持原结论，仍然认定不违规。一个案件只能复议一次。' },
  overturned: { tone: 'kui-tag--danger', text: '复议结果：改判为违规，已经按规则处理。' }
};
const STATUS_LABEL: Record<string, string> = { pending: '复议中', upheld: '复议维持', overturned: '复议改判' };

/**
 * 举报记录里一条举报的「复议」：对风纪委员认定「不违规」的结论，举报人可以申请一次复议（docs/jury-v2.md 3.7）。
 * 只有后端下发了 reconsider 能力时才出现；能不能申请由服务端的 can_reconsider 决定。
 */
export function ReportReconsider({ report }: { report: ReportRead }): JSX.Element | null {
  // 旧后端的举报记录里没有这两个字段：这时连风纪配置都不去问
  return report.can_reconsider === undefined && report.reconsider_status === undefined ? null : <Reconsider report={report} />;
}

function Reconsider({ report }: { report: ReportRead }): JSX.Element | null {
  const config = useJuryConfig();
  const queryClient = useQueryClient();
  const [writing, setWriting] = useState(false);
  const [text, setText] = useState('');
  const rules = reconsiderRules(config.config);
  const submit = useMutation({
    mutationFn: () => reconsiderReport(report.id, text.trim()),
    onSuccess: (updated) => {
      queryClient.setQueryData<ReportRead[] | undefined>(['my-reports'], (current) => current?.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
      setWriting(false);
    },
    onError: (error) => {
      // 409：已经不能申请了（别的举报人先申请了，或者过了期限）。重新拉一遍，让入口按最新的状态显示
      if (errorStatus(error) === 409) {
        void queryClient.invalidateQueries({ queryKey: ['my-reports'] });
      }
    }
  });

  if (!config.has('reconsider')) {
    return null;
  }
  const status = report.reconsider_status && report.reconsider_status !== 'none' ? STATUS_TEXT[report.reconsider_status] : null;
  const length = text.trim().length;

  if (status) {
    return <p className="kui-note kst-reconsider" data-reconsider={report.reconsider_status ?? ''}><span className={`kui-tag ${status.tone}`}>{STATUS_LABEL[report.reconsider_status ?? ''] ?? '复议'}</span>{status.text}</p>;
  }
  if (!report.can_reconsider) {
    // 刚被服务端拒绝（409）的那一次：入口已经没了，但要把原因留给用户看
    return submit.error ? <p className="kui-note kui-note--danger kst-reconsider" role="alert">{errorText(submit.error, '现在不能申请复议。')}</p> : null;
  }
  if (!writing) {
    return (
      <div className="kst-reconsider" data-reconsider="available">
        <p className="kui-muted">对这个结论有异议？定案后 {rules.window_days} 天内可以申请一次复议，由另外几位资深风纪委员重新看（人手不够时转给管理员）。</p>
        <button type="button" className="kui-btn kui-btn--sm" data-action="reconsider" onClick={() => setWriting(true)}>申请复议</button>
      </div>
    );
  }
  return (
    <form className="kst-reconsider is-writing" onSubmit={(event) => {
      event.preventDefault();
      if (length >= rules.text_min && !submit.isPending) {
        submit.mutate();
      }
    }}>
      <textarea className="kui-textarea kui-scroll" rows={4} value={text} autoFocus aria-label="复议理由" placeholder="说明你认为结论有误的理由：原来的评审漏看了什么、哪一点判断得不对。复审的委员看到的是匿名的内容和你写的这段话。" onChange={(event) => setText(event.target.value.slice(0, TEXT_MAX))} />
      {submit.error ? <p className="kui-note kui-note--danger" role="alert">{errorText(submit.error, '复议申请提交失败，请稍后再试。')}</p> : null}
      <div className="kst-reconsider-foot">
        <span className="kui-muted">{length}/{TEXT_MAX}，至少 {rules.text_min} 个字。一个案件只能复议一次，提交后不能修改。</span>
        <span className="kst-reconsider-btns">
          <button type="button" className="kui-btn kui-btn--ghost kui-btn--sm" disabled={submit.isPending} onClick={() => setWriting(false)}>取消</button>
          <button type="submit" className="kui-btn kui-btn--primary kui-btn--sm" data-action="submit-reconsider" disabled={length < rules.text_min || submit.isPending}>{submit.isPending ? '提交中…' : '提交复议'}</button>
        </span>
      </div>
    </form>
  );
}
