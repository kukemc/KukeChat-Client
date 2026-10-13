import { useJury } from '../context';
import { panelRules } from '../data/senior';
import { NotOpenYet, SectionFrame } from '../widgets/Frame';
import { AppealDesk } from './AppealDesk';
import { AppealHistory } from './AppealHistory';
import { PanelDesk } from './PanelDesk';

type SeniorTab = 'panel' | 'appeals' | 'history';

const TABS: Array<{ id: SeniorTab; label: string; subtitle: (seats: number) => string }> = [
  { id: 'panel', label: '合议', subtitle: (seats) => `普通评审定不下来的案件，由 ${seats} 位资深委员合议` },
  { id: 'appeals', label: '申诉复审', subtitle: () => '对处罚的申诉、举报人的复议，先由资深委员复审' },
  { id: 'history', label: '复审记录', subtitle: () => '你参与过的申诉复审和举报复议' }
];

/**
 * 资深工作台：合议和申诉复审两个队列，加上我的复审记录。只有在任的资深委员看得到这个板块（sections.ts）。
 * 从别处直达某个队列：openJury({ section: 'senior', tab: 'appeals' })。
 */
export function SeniorSection(): JSX.Element {
  const { nav, status, config } = useJury();
  const tab = TABS.find((item) => item.id === nav.route.tab) ?? TABS[0];
  const counts: Partial<Record<SeniorTab, number>> = { panel: status?.senior?.panel ?? 0, appeals: status?.senior?.appeals ?? 0 };
  const reviewOpen = config.has('appeal_review');

  return (
    <SectionFrame flush title="资深工作台" subtitle={tab.subtitle(panelRules(config.config).seats)} actions={(
      <div className="kui-segment" role="tablist" aria-label="资深工作台的队列">
        {TABS.map((item) => (
          <button key={item.id} type="button" role="tab" data-tab={item.id} aria-selected={tab.id === item.id} className={tab.id === item.id ? 'is-active' : undefined} onClick={() => nav.patch({ tab: item.id })}>
            {item.label}{counts[item.id] ? <span className="kjr-senior-count" data-count={counts[item.id]}>{counts[item.id]}</span> : null}
          </button>
        ))}
      </div>
    )}>
      {tab.id === 'panel' ? <PanelDesk />
        : !reviewOpen ? <div className="kjr-body kui-scroll"><div className="kjr-wrap"><NotOpenYet what="申诉复审" /></div></div>
        : tab.id === 'appeals' ? <AppealDesk onHistory={() => nav.patch({ tab: 'history' })} />
        : <AppealHistory />}
    </SectionFrame>
  );
}
