import { useCharmBoardLabel, useGiftsEnabled } from '@/components/gifts/data';
import { useIntimacyEnabled } from '@/components/intimacy/data';
import { useJuryConfig } from '@/components/jury/data/queries';
import { useLevelAvailable, useLevelRules } from '@/components/level/data';
import type { IconName } from '@/components/ui/Icon';
import type { RankingBoard } from '@/store/kukeStore';

/**
 * 排行榜页上有哪些榜。全站范围的榜都收在这一个页面里，用页签切换：
 *   · 活跃榜   账号等级（GET /levels/leaderboard）       服务端有账号等级时出现
 *   · 心意榜   收到的礼物（GET /gifts/leaderboard）       礼物功能开着时出现（名字跟着「心意值」改名）
 *   · 亲密榜   我自己的好友按亲密度排（GET /intimacy/friends）  好友亲密度开着时出现；只有自己看得到
 *   · 风纪榜   风纪值（GET /jury/leaderboard）            风纪的 config 里有 leaderboard 能力时出现
 * 某个功能关着（接口 404 / enabled=false / 没有这项能力）时那个页签不出现；一个都没有时导航栏里的入口也不出现。
 * 群排行榜不在这里：它是某一个群里的榜，入口留在群资料里。
 */
export interface RankingBoardDef {
  id: RankingBoard;
  label: string;
  icon: IconName;
}

export function useRankingBoards(): RankingBoardDef[] {
  // 等级的探测结果在 levelStore 里；这里也挂一个规则查询，排行榜是第一个打开的页面时也能探到
  useLevelRules();
  const level = useLevelAvailable();
  const gifts = useGiftsEnabled();
  const charmBoard = useCharmBoardLabel();
  const intimacy = useIntimacyEnabled();
  const jury = useJuryConfig();
  const boards: RankingBoardDef[] = [];
  if (level) {
    boards.push({ id: 'level', label: '活跃榜', icon: 'star' });
  }
  if (gifts) {
    boards.push({ id: 'charm', label: charmBoard, icon: 'heart' });
  }
  if (intimacy) {
    boards.push({ id: 'intimacy', label: '亲密榜', icon: 'users' });
  }
  if (jury.has('leaderboard')) {
    boards.push({ id: 'jury', label: '风纪榜', icon: 'scale' });
  }
  return boards;
}

/** 想看的那个榜现在不在（功能关了、还没探到）：退回第一个有的。 */
export function pickBoard(boards: RankingBoardDef[], wanted: RankingBoard): RankingBoardDef | null {
  return boards.find((board) => board.id === wanted) ?? boards[0] ?? null;
}
