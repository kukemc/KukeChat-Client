import type { JuryWarning } from '@/types/juryGrowth';
import { warningFacts } from './labels';

/** 服务端给的一条预警：一句话，下面一行是它判断时用的数（当前值、界线、样本）。数字是服务端的，这里不估算。 */
export function WarningNote({ warning }: { warning: JuryWarning }): JSX.Element {
  const facts = warningFacts(warning);
  return (
    <p className="kui-note kui-note--warn kjr-warning" role="status" data-notice={warning.code}>
      {warning.message}
      {facts ? <span className="kjr-warning-facts" data-warning-facts>{facts}</span> : null}
    </p>
  );
}
