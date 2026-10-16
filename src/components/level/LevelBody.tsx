import { Icon } from '@/components/ui/Icon';
import { useKukeStore } from '@/store/kukeStore';
import type { LevelRules } from '@/types/level';
import { useMyLevel } from './data';
import { LevelBoardEntry, LevelHero, LevelHistoryCard, LevelRewardsCard, LevelRulesCard, LevelTodayCard } from './LevelSections';

/**
 * 等级页的内容：当前等级、今天、近 30 天、规则、等级解锁的装扮。桌面和移动两套外框（desktop/LevelPage、mobile/MobileLevelPage）里放的是同一个。
 * 活跃榜不在这里了：它和心意榜、风纪榜一起收进了排行榜页（components/ranking），这里的入口跳过去，停在「活跃榜」上。
 * 规则已经拿到了才会渲染到这里（外框负责「还没开放 / 出错 / 加载中」）。
 */
export function LevelBody({ rules, layout }: { rules: LevelRules; layout: 'desktop' | 'mobile' }): JSX.Element {
  // 页面开着的时候每分钟重拉一次：今天的在线时长、加成是实时累计的
  const query = useMyLevel(true, true);
  const me = query.data;
  const openRanking = useKukeStore((state) => state.openRanking);
  const openBoard = (): void => openRanking('level');

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
          <LevelHero me={me} rules={rules} onOpenBoard={openBoard} />
          <LevelBoardEntry me={me} onOpenBoard={openBoard} />
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
