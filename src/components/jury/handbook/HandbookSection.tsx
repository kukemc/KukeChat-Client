import type { ReactNode } from 'react';
import { COMING_SOON, ComingSoonBody } from '../ComingSoon';
import { useJury } from '../context';
import { ExamSection } from '../exam/ExamSection';
import { PrecedentDetailPage } from '../precedents/PrecedentDetail';
import { PrecedentsTab } from '../precedents/PrecedentsTab';
import { Loading, SectionFrame } from '../widgets/Frame';
import { JurorGuide } from './JurorGuide';
import { RulesChapter } from './RulesChapter';

/**
 * 规则手册的页签。判例（三期）和入门考试（二期）先占位：做出来之后把 soon 去掉、换成组件即可。
 * 从外面直达某个页签：openJury({ section: 'handbook', tab: 'guide' })。
 */
const TABS: Array<{ id: string; label: string; soon?: keyof typeof COMING_SOON }> = [
  { id: 'rules', label: '处罚规则' },
  { id: 'guide', label: '委员须知' },
  { id: 'precedents', label: '判例', soon: 'precedents' },
  { id: 'exam', label: '入门考试', soon: 'exam' }
];

/** 规则手册：处罚规则（来自 /moderation/rules）和委员须知。所有登录用户可读。 */
export function HandbookSection(): JSX.Element {
  const { nav, config } = useJury();
  const tab = TABS.find((item) => item.id === nav.route.tab) ?? TABS[0];
  const frame = (content: ReactNode): JSX.Element => (
    <SectionFrame title="规则手册" subtitle="什么算违规、怎么处置，以及风纪委员按什么规矩评审" actions={(
      <div className="kui-segment" role="tablist" aria-label="手册章节">
        {TABS.map((item) => <button key={item.id} type="button" role="tab" data-tab={item.id} aria-selected={tab.id === item.id} className={tab.id === item.id ? 'is-active' : undefined} onClick={() => nav.patch({ tab: item.id })}>{item.label}</button>)}
      </div>
    )}>
      {content}
    </SectionFrame>
  );
  // 三期：判例库。后端有这项能力时换成真的；打开某个判例时是一个带返回的二级页面
  if (tab.id === 'precedents' && config.has('precedents')) {
    const precedentId = nav.route.itemId ?? null;
    return precedentId !== null ? <PrecedentDetailPage key={precedentId} precedentId={precedentId} onBack={() => nav.patch({ itemId: null })} /> : frame(<PrecedentsTab />);
  }
  if (tab.id === 'precedents' && config.loading) {
    return frame(<Loading />);
  }
  // 二期：入门考试。后端有这项能力时换成真的；进行中的考试要占满整个板块，所以外框交给它自己决定套不套
  if (tab.id === 'exam' && config.has('exam')) {
    return <ExamSection frame={frame} />;
  }
  if (tab.id === 'exam' && config.loading) {
    return frame(<Loading />);
  }
  return frame(tab.soon ? <ComingSoonBody copy={COMING_SOON[tab.soon]} /> : tab.id === 'guide' ? <JurorGuide /> : <RulesChapter />);
}
