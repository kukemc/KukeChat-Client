import { Icon } from '@/components/ui/Icon';
import type { JuryCaseView } from '@/types/jury';
import { KIND_LABEL, reasonsText } from '../labels';

/** 机器来源的案件，reasons 里唯一的一项是「机器筛查 · 辱骂骚扰」这样的写法：取后半截当作机器怀疑的类别 */
const MACHINE_PREFIX = /^机器筛查\s*[·・:：-]?\s*/;

type OriginCarrier = Pick<JuryCaseView, 'case_origin'>;

export function isMachineCase(view: OriginCarrier): boolean {
  return view.case_origin === 'machine';
}

/**
 * 这个案件有没有举报人（公示栏用）。以 case_origin 为准；后端还没有这个字段时，退回按「举报人数为 0」推断。
 */
export function hasNoReporter(view: OriginCarrier & Pick<JuryCaseView, 'report_count'>): boolean {
  return view.case_origin ? isMachineCase(view) : view.report_count === 0;
}

/**
 * 「未作处理」结案（docs/jury-v2.md 3.7.1）：没人举报的机器案件，超时或无共识、又没有合议可用时，
 * 服务端给的是 outcome = clean、source = auto —— 但这不是「认定不违规」，只是没有人给出结论。
 * 案件详情带 case_origin，直接按它判断；「我的评审」的列表项不带，就再看「这一票不计一致率」（agreed 为空）。
 */
export function isUnhandledMachineCase(item: { case_origin?: string | null; outcome?: string | null; source?: string | null; agreed?: boolean | null }): boolean {
  if (item.outcome !== 'clean' || item.source !== 'auto') {
    return false;
  }
  return item.case_origin ? item.case_origin === 'machine' : item.agreed === null || item.agreed === undefined;
}

/** 列表和详情里代替「不违规」的那个标签 */
export function UnhandledTag(): JSX.Element {
  return <span className="kui-tag" data-unhandled="1" title="机器筛查的案件没有人给出结论，不是认定不违规">未作处理</span>;
}

export function UnhandledNote(): JSX.Element {
  return (
    <p className="kui-note" data-notice="unhandled">
      <b>无人评审，未作处理。</b>这个案件来自机器筛查、没有举报人，在时限内没有凑够票或没有形成共识，也没有资深合议可以接手，所以按「未作处理」结案 —— 不是认定不违规。
      不处罚、不进公示栏；你的这一票不计入一致率。
    </p>
  );
}

/** 一句话的来历：「群聊消息 · 辱骂骚扰 ×2 · 2 人举报」；机器来源的案件没有举报人。 */
export function caseSourceText(view: OriginCarrier & Pick<JuryCaseView, 'kind' | 'reasons' | 'report_count'>): string {
  return isMachineCase(view) ? `${KIND_LABEL[view.kind]} · ${reasonsText(view.reasons)} · 没有举报人` : `${KIND_LABEL[view.kind]} · ${reasonsText(view.reasons)} · ${view.report_count} 人举报`;
}

/** 案件头部的来源标记：用户举报 / 机器筛查。后端还没有这个字段（三期之前）时不显示。 */
export function CaseOriginTag({ view }: { view: OriginCarrier }): JSX.Element | null {
  if (!view.case_origin) {
    return null;
  }
  return isMachineCase(view)
    ? <span className="kui-tag kui-tag--accent kjr-origin-tag" data-origin="machine"><Icon name="bot" className="h-3 w-3" />机器筛查</span>
    : <span className="kui-tag kjr-origin-tag" data-origin="report">用户举报</span>;
}

/**
 * 机器来源的案件没有举报人，表决面板里「举报理由」那一块换成这一段：
 * 说明它是机器拿不准才送来的，以及机器的怀疑不是证据。
 */
export function MachineOriginBlock({ view }: { view: Pick<JuryCaseView, 'kind' | 'reasons'> }): JSX.Element {
  const suspected = view.reasons[0]?.reason.replace(MACHINE_PREFIX, '') ?? '';
  return (
    <section className="kjr-vote-block" data-origin="machine">
      <h3 className="kjr-h">案件来源<span>{KIND_LABEL[view.kind]} · 没有举报人</span></h3>
      <p className="kjr-origin-machine"><Icon name="bot" className="h-4 w-4" />机器审核拿不准，请人工判断</p>
      <p className="kjr-quiet">
        这条内容没有人举报。机器审核觉得它{suspected ? <>可能属于「{suspected}」</> : '可能有问题'}，但把握不大，所以交给委员来看。
        机器的怀疑不是证据：请和普通案件一样只看内容本身。认定不违规，内容原样保留，对任何人都没有影响。
      </p>
    </section>
  );
}
