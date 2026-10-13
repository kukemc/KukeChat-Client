/**
 * 风纪预览页 · 三期的控制条和地址参数（场景的取值见 jury-mock-senior.ts 的 SeniorScenario、jury-mock-hall.ts 的 HallScenario）。
 *
 *   ?phase3=on|off   panel=no_consensus|need_context|timeout|machine|empty   panelAfter=open|closed
 *   appeal=jury|machine|post|reconsider|empty   appealAfter=open|settled   appealsSwitch=on|off   seniors=enough|few
 *   caseOrigin=report|machine   precedents=many|empty   penalties=none|stages   reconsider=on|off   report=ok|reviewed   restricted=no|muted
 *   view=settings&settingsTab=penalties|reports   reportDialog=1
 *
 * 脚本测试用 window.__jury3：{ senior, hall } 是两份场景对象，改完调 __jury.queryClient.resetQueries()。
 */
import { useState, type CSSProperties } from 'react';
import { useMutation } from '@tanstack/react-query';
import { createReport } from '@/api/reports';
import { ReportModal } from '@/components/chat/ReportModal';
import { HALL_LABELS, HALL_OPTIONS, hallScenario } from './jury-mock-hall';
import { SENIOR_LABELS, SENIOR_OPTIONS, seniorScenario } from './jury-mock-senior';

type Bag = Record<string, string>;

const GROUPS: Array<{ state: Bag; options: Record<string, string[]>; labels: Record<string, string> }> = [
  { state: seniorScenario as unknown as Bag, options: SENIOR_OPTIONS, labels: SENIOR_LABELS },
  { state: hallScenario as unknown as Bag, options: HALL_OPTIONS as Record<string, string[]>, labels: HALL_LABELS }
];

export function readPhase3Params(params: URLSearchParams): void {
  for (const group of GROUPS) {
    for (const [key, values] of Object.entries(group.options)) {
      const value = params.get(key);
      if (value && values.includes(value)) {
        group.state[key] = value;
      }
    }
  }
  (window as unknown as { __jury3: unknown }).__jury3 = { senior: seniorScenario, hall: hallScenario };
}

/** 举报弹窗不在风纪页里，预览页给它一个入口：提交走真实的 createReport，假接口按「再次举报」场景返回 409。 */
function ReportDialogProbe({ onClose }: { onClose: () => void }): JSX.Element {
  const [done, setDone] = useState(false);
  const report = useMutation({ mutationFn: createReport, onSuccess: () => setDone(true) });
  if (done) {
    return <p data-harness="report-done" style={{ font: '12px sans-serif', color: '#0d8f69' }}>举报已提交 <button type="button" onClick={onClose}>关</button></p>;
  }
  return <ReportModal targetType="message" targetId={9002} targetLabel="成员A 的消息：来玩我的新作品……" conversationId={1} messageId={9002} isPending={report.isPending} error={report.error} onSubmit={(payload) => report.mutate(payload)} onClose={onClose} />;
}

export function Phase3Controls({ onChange, initialReportDialog = false }: { onChange: () => void; initialReportDialog?: boolean }): JSX.Element {
  const [reporting, setReporting] = useState(initialReportDialog);
  const label: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, font: '12px sans-serif', color: '#12141a' };
  return (
    <>
      {GROUPS.flatMap((group) => Object.entries(group.options).map(([key, values]) => (
        <label key={key} style={label}>{group.labels[key]}
          <select data-harness={key} value={group.state[key]} style={{ font: '12px sans-serif' }} onChange={(event) => {
            group.state[key] = event.target.value;
            onChange();
          }}>
            {values.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
      )))}
      <button type="button" data-harness="report-dialog" style={{ padding: '2px 8px', border: '1px solid #9aa1b1', borderRadius: 6, background: '#fff', color: '#12141a', font: '12px sans-serif', cursor: 'pointer' }} onClick={() => setReporting(true)}>举报弹窗</button>
      {reporting ? <ReportDialogProbe onClose={() => setReporting(false)} /> : null}
    </>
  );
}
