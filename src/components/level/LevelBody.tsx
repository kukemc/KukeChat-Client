import { Icon } from '@/components/ui/Icon';
import type { LevelRules, LevelTab } from '@/types/level';
import { useMyLevel } from './data';
import { LevelLeaderboard } from './LevelLeaderboard';
import { LevelBoardEntry, LevelHero, LevelHistoryCard, LevelRewardsCard, LevelRulesCard, LevelTodayCard } from './LevelSections';

/**
 * 等级页的内容：「我的等级」和「排行榜」两个页签。桌面和移动两套外框（desktop/LevelPage、mobile/MobileLevelPage）里放的是同一个。
 * 规则已经拿到了才会渲染到这里（外框负责「还没开放 / 出错 / 加载中」）。
 */
export function LevelBody({ rules, tab, layout, onTab, pinnedSlot }: { rules: LevelRules; tab: LevelTab; layout: 'desktop' | 'mobile'; onTab: (tab: LevelTab) => void; /** 移动端：排行榜里「我的位置」那一行放到这个页脚里 */ pinnedSlot?: HTMLElement | null }): JSX.Element {
  // 页面开着的时候每分钟重拉一次：今天的在线时长、加成是实时累计的
  const query = useMyLevel(true, tab === 'me');
  const me = query.data;

  if (tab === 'board') {
    return <LevelLeaderboard layout={layout} pinnedSlot={pinnedSlot} />;
  }
  if (!me) {
    return query.error ? (
      <div className="klv-card klv-fail" role="alert" data-level="me-error">
        <p className="kui-note kui-note--danger">你的等级没有加载出来：{query.error.message}</p>
        <button type="button" className="kui-btn kui-btn--sm" onClick={() => void query.refetch()}><Icon name="refresh" className="h-3.5 w-3.5" />重试</button>
      </div>
    ) : (
      <div className="klv-grid" role="status" aria-label="正在加载等级">
        <span className="kcr-bone klv-bone" />
        <span className="kcr-bone klv-bone" />
      </div>
    );
  }
  return (
    <>
      <div className="klv-grid">
        <div className="klv-col">
          <LevelHero me={me} rules={rules} onOpenBoard={() => onTab('board')} />
          <LevelBoardEntry me={me} onOpenBoard={() => onTab('board')} />
          <LevelHistoryCard />
        </div>
        <div className="klv-col">
          <LevelTodayCard me={me} rules={rules} />
        </div>
      </div>
      <div className="klv-grid">
        <div className="klv-col"><LevelRulesCard rules={rules} me={me} /></div>
        <div className="klv-col"><LevelRewardsCard level={me.level} layout={layout} /></div>
      </div>
    </>
  );
}
