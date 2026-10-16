import { CharmLeaderboard } from '@/components/gifts/CharmLeaderboard';
import { IntimacyLeaderboard } from '@/components/intimacy/IntimacyLeaderboard';
import { LevelLeaderboard } from '@/components/level/LevelLeaderboard';
import type { RankingBoard } from '@/store/kukeStore';
import { JuryLeaderboard } from './JuryLeaderboard';

/**
 * 排行榜页的正文：选中的那个榜。桌面和移动两套外框（desktop/RankingPage、mobile/MobileRankingPage）里放的是同一个。
 * 三个榜的行、前三名的圆牌、钉在底部的「我的位置」是同一套（kjr-table / klv-table），各自只定自己的列和周期。
 * key 用榜的 id：换了榜就是一个新的组件，周期页签回到默认。
 */
export function RankingBody({ board, layout, pinnedSlot }: { board: RankingBoard; layout: 'desktop' | 'mobile'; /** 移动端：「我的位置」那一行放到这个页脚里 */ pinnedSlot?: HTMLElement | null }): JSX.Element {
  if (board === 'charm') {
    return <CharmLeaderboard key="charm" layout={layout} pinnedSlot={pinnedSlot} />;
  }
  if (board === 'intimacy') {
    return <IntimacyLeaderboard key="intimacy" layout={layout} />;
  }
  if (board === 'jury') {
    return <JuryLeaderboard key="jury" layout={layout} pinnedSlot={pinnedSlot} />;
  }
  return <LevelLeaderboard key="level" layout={layout} pinnedSlot={pinnedSlot} />;
}
