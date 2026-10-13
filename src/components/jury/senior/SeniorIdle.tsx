import type { UseQueryResult } from '@tanstack/react-query';
import { useJury } from '../context';
import { errorCode, errorText, useJuryOverview } from '../data/queries';
import { appealRules, panelRules } from '../data/senior';
import { formatDateTime } from '../labels';
import { LoadError, StateBlock } from '../widgets/Frame';

export type SeniorIdleReason = 'not_senior' | 'restricted' | 'empty' | 'error';

/** 队列现在为什么没有东西可看。有案件时返回 null。受限和不够资深先于请求结果判断：这两种情况根本不该去领案件。 */
export function seniorIdleReason(query: Pick<UseQueryResult<unknown>, 'error' | 'isFetching' | 'data'>, identity: { isSenior: boolean; restricted: boolean }): SeniorIdleReason | null {
  const code = errorCode(query.error);
  if (!identity.isSenior || code === 'not_senior' || code === 'not_juror') return 'not_senior';
  if (identity.restricted || code === 'juror_restricted') return 'restricted';
  if (query.error) return 'error';
  return !query.isFetching && !query.data ? 'empty' : null;
}

/** 资深工作台的队列没有东西时的画面：不够资深、受处罚、队列为空、出错。 */
export function SeniorIdle({ reason, queue, error, onRetry }: { reason: SeniorIdleReason; queue: 'panel' | 'appeal'; error?: unknown; onRetry: () => void }): JSX.Element {
  const { identity, config, nav, openPenalties } = useJury();
  const overview = useJuryOverview(config.has('overview') && reason === 'empty').data;
  const panel = panelRules(config.config);
  const appeals = appealRules(config.config);
  const what = queue === 'panel' ? '合议' : '复审';

  if (reason === 'error') {
    return <LoadError message={errorText(error, `${what}队列加载失败，请稍后再试。`)} onRetry={onRetry} />;
  }
  if (reason === 'not_senior') {
    return (
      <StateBlock icon="shieldCheck" title="资深工作台只对在任的资深委员开放" actions={<button type="button" className="kui-btn kui-btn--primary" onClick={() => nav.goSection('overview')}>查看我的层级</button>}>
        合议和复审处理的是普通评审定不下来的案件和对处罚的申诉，需要足够多的评审经验。层级随已结案件数和一致率自动晋升，进度在「总览」里。
      </StateBlock>
    );
  }
  if (reason === 'restricted') {
    const restriction = identity.restriction;
    return (
      <StateBlock icon="lock" title={`受处罚期间不能参加${what}`} actions={<button type="button" className="kui-btn" onClick={openPenalties}>处罚与申诉</button>}>
        {restriction?.message ?? '你的账号目前有生效中的处罚。'}
        {restriction?.until ? ` 预计 ${formatDateTime(restriction.until)} 解除，之后资格自动恢复。` : ' 处罚结束后资格自动恢复。'}
        分给你的案件会让给其他资深委员，不会卡住。
      </StateBlock>
    );
  }

  // 队列为空。资深委员不够凑一桌时，这个队列根本不会有东西进来 —— 这要说出来，不然只会觉得「一直没案件」
  const seniors = overview?.jurors.senior;
  const seats = queue === 'panel' ? panel.seats : appeals.seats;
  const short = typeof seniors === 'number' && seniors < seats;
  return (
    <StateBlock icon="scale" title={queue === 'panel' ? '现在没有等你合议的案件' : '现在没有等你复审的申诉'} actions={<button type="button" className="kui-btn" data-action="refresh-queue" onClick={onRetry}>再看一眼</button>}>
      {queue === 'panel'
        ? `普通评审没有共识、多位委员认为上下文不足、或者超时没凑够票的案件会来到这里，由 ${panel.seats} 位资深委员合议。和你有关联的、你在原审里投过票的案件不会分给你。`
        : `符合条件的申诉会先由 ${appeals.seats} 位资深委员复审，再把结果通知申诉人。原审里你投过票的处罚不会分给你。`}
      {short ? <p className="kui-note kui-note--warn kjr-senior-short" data-short="1">目前在任的资深委员只有 {seniors} 位，不够 {seats} 位。凑不齐人的时候，这类案件会直接转给管理员，不会进{what}。</p> : null}
      <p>有新的{what}时，导航上的「资深工作台」会出现数字。</p>
    </StateBlock>
  );
}
