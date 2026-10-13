import { useCallback, useMemo, type ComponentType } from 'react';
import { cx } from '@/components/chat/desktop/runtime';
import { Icon } from '@/components/ui/Icon';
import { useKukeStore, type JurySection } from '@/store/kukeStore';
import { BulletinSection } from './bulletin/BulletinSection';
import { COMING_SOON, ComingSoonSection } from './ComingSoon';
import { JuryContext, type JuryContextValue } from './context';
import { useJuryConfig, useJuryStatus } from './data/queries';
import { DeskSection } from './desk/DeskSection';
import { GrowthToasts } from './growth/GrowthToasts';
import { HallSection } from './hall/HallSection';
import { HandbookSection } from './handbook/HandbookSection';
import { deriveJuryIdentity, seniorQueueCount } from './identity';
import { MEMBERSHIP_LABEL, MEMBERSHIP_TONE, TIER_LABEL } from './labels';
import { LeaderboardSection } from './leaderboard/LeaderboardSection';
import { MineSection } from './mine/MineSection';
import { OverviewSection } from './overview/OverviewSection';
import { PracticeSection } from './practice/PracticeSection';
import { useJuryNavigation } from './route';
import { getJurySection, JURY_GROUPS, JURY_SECTIONS, type JurySectionDef } from './sections';
import { SeniorSection } from './senior/SeniorSection';
import { Loading, SectionFrame } from './widgets/Frame';

/** 已经做出来的板块。没登记在这里的板块显示「即将开放」（文案在 ComingSoon.tsx）。 */
const SECTION_VIEWS: Partial<Record<JurySection, ComponentType>> = {
  senior: SeniorSection,
  forum: HallSection,
  overview: OverviewSection,
  desk: DeskSection,
  mine: MineSection,
  bulletin: BulletinSection,
  handbook: HandbookSection,
  practice: PracticeSection,
  ranking: LeaderboardSection
};

const SOON_COPY: Partial<Record<JurySection, keyof typeof COMING_SOON>> = { practice: 'practice', ranking: 'ranking', forum: 'forum', senior: 'senior', bulletin: 'bulletin' };

/**
 * 风纪：桌面端的一级页面。左边是板块导航，右边是当前板块。
 * 板块登记在 sections.ts，身份判断在 identity.ts，数据层在 data/，目录约定见同目录的 README.md。
 */
export function JuryPage(): JSX.Element {
  const nav = useJuryNavigation();
  const statusQuery = useJuryStatus();
  const config = useJuryConfig();
  const openSettingsTab = useKukeStore((state) => state.openSettingsTab);
  const status = statusQuery.data;
  const identity = useMemo(() => deriveJuryIdentity(status, statusQuery.isLoading), [status, statusQuery.isLoading]);
  const refetchStatus = statusQuery.refetch;
  const openPenalties = useCallback(() => openSettingsTab('penalties'), [openSettingsTab]);

  const context = useMemo<JuryContextValue>(() => ({
    nav, status, statusError: statusQuery.error, refetchStatus: () => void refetchStatus(), identity, config, openPenalties
  }), [config, identity, nav, openPenalties, refetchStatus, status, statusQuery.error]);

  const isReady = (section: JurySectionDef): boolean => Boolean(SECTION_VIEWS[section.id]) && (!section.capability || config.has(section.capability));
  const requested = getJurySection(nav.route.section);
  // 身份还没拿到时先不判断「看不看得到」，免得刚进来就被弹回总览
  const active = requested.visible(identity) || identity.loading ? requested : getJurySection('overview');
  const View = SECTION_VIEWS[active.id];
  const waiting = (identity.loading && !active.visible(identity)) || (Boolean(active.capability) && config.loading);
  const soon = SOON_COPY[active.id];

  return (
    <JuryContext.Provider value={context}>
      <section className="kjr-root" aria-label="风纪">
        <div className="kjr">
          <aside className="kjr-side">
            <header className="kjr-side-head">
              <h2>风纪</h2>
              {status ? <span className={cx('kui-tag', MEMBERSHIP_TONE[status.status])}>{identity.isJuror && identity.tier ? `${TIER_LABEL[identity.tier]}委员` : MEMBERSHIP_LABEL[status.status]}</span> : null}
            </header>
            <nav className="kjr-nav kui-scroll" aria-label="风纪板块">
              {JURY_GROUPS.map((group) => {
                const items = JURY_SECTIONS.filter((section) => section.group === group.id && section.visible(identity));
                if (items.length === 0) {
                  return null;
                }
                return (
                  <div key={group.id} className="kjr-nav-group">
                    {group.label ? <p className="kjr-nav-title">{group.label}</p> : null}
                    {items.map((section) => {
                      const count = section.id === 'desk' ? status?.available_cases ?? 0 : section.id === 'senior' ? seniorQueueCount(status) : 0;
                      return (
                        // title：浮窗很窄时导航收成一列图标（见 desktop-jury.css 末尾），悬停要能看到名字
                        <button key={section.id} type="button" data-section={section.id} title={!config.loading && !isReady(section) ? `${section.label}（即将开放）` : section.label} className={cx('kjr-nav-item', active.id === section.id && 'is-active')} aria-current={active.id === section.id ? 'page' : undefined} onClick={() => nav.goSection(section.id)}>
                          <Icon name={section.icon} className="h-4 w-4" />
                          <span className="kjr-nav-label">{section.label}</span>
                          {count > 0 ? <span className="kui-badge">{count > 99 ? '99+' : count}</span> : !config.loading && !isReady(section) ? <span className="kjr-nav-soon">即将开放</span> : null}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </nav>
            <footer className="kjr-side-foot">
              <button type="button" className="kjr-nav-item" data-action="penalties" title="处罚与申诉" onClick={openPenalties}>
                <Icon name="shield" className="h-4 w-4" />
                <span className="kjr-nav-label">处罚与申诉</span>
                <Icon name="chevron" className="h-3.5 w-3.5" />
              </button>
            </footer>
          </aside>
          {waiting ? <SectionFrame title={active.label}><Loading /></SectionFrame>
            : View && isReady(active) ? <View key={active.id} />
            : soon ? <ComingSoonSection copy={COMING_SOON[soon]} note={active.phase === 1 ? '当前连接的服务端还没有开放这个板块，开放后会自动出现。' : undefined} />
            : <SectionFrame title={active.label}><Loading /></SectionFrame>}
          <GrowthToasts />
        </div>
      </section>
    </JuryContext.Provider>
  );
}
