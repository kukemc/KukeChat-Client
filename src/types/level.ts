import type { User } from './api';

/**
 * 账号等级（契约：KukeChat-Server 的 docs/account-level.md）。
 *
 * 等级由累计活跃天数决定，图标是四进制的星星 / 月亮 / 太阳 / 皇冠。和群等级（Message.sender_level）是两套东西。
 * 没有值的可选键（target、current）在接口里是「不出现」而不是 null，所以这里都写成可选。
 */

/** 客户端内置的四种图标。服务端给了别的 key 时那一档画不出来，按没有处理。 */
export type LevelIconKey = 'crown' | 'sun' | 'moon' | 'star';

/** 一种图标顶多少级。rules.icons 从大到小排。 */
export interface LevelIconRule {
  key: string;
  label: string;
  levels: number;
}

/** 每种图标各几个：{ crown: 0, sun: 1, moon: 1, star: 3 } */
export type LevelIconCounts = Record<string, number>;

export interface LevelOnlineTier {
  minutes: number;
  days: number;
}

export interface LevelBonusRule {
  key: string;
  label: string;
  days: number;
  target?: number;
}

export interface LevelMilestone {
  level: number;
  days: number;
}

/** GET /levels/rules */
export interface LevelRules {
  max_level: number;
  /** 给人看的公式（「N² + 4N」） */
  formula: string;
  icons: LevelIconRule[];
  daily_cap: number;
  /** 在线时长换基础活跃天，从高到低 */
  online: LevelOnlineTier[];
  bonuses: LevelBonusRule[];
  milestones: LevelMilestone[];
}

export interface LevelBonusState {
  key: string;
  earned: boolean;
  days: number;
  current?: number;
  target?: number;
}

export interface LevelToday {
  date: string;
  online_minutes: number;
  /** 今天已拿到的基础活跃天 */
  base: number;
  bonuses: LevelBonusState[];
  /** 今天已记入的活跃天 */
  earned: number;
  cap: number;
}

/** 别人也看得到的那部分。GET /users/{id}/level */
export interface UserLevelCard {
  user_id: number | null;
  level: number;
  /** 累计活跃天，一位小数 */
  active_days: number;
  icons: LevelIconCounts | null;
  /** 满级时为 null */
  next_level_days: number | null;
  days_to_next: number | null;
  /** 连续活跃天数 */
  streak: number;
  /** 全站名次；没有活跃天、或刚上榜的 60 秒内为 null */
  rank: number | null;
  /** 注册到今天的自然日数，注册当天算第 1 天 */
  registered_days: number;
}

/** GET /levels/me */
export interface LevelMe extends UserLevelCard {
  /** 当前等级需要的累计天数 */
  level_days: number;
  /** 满级时为 null */
  next_level: number | null;
  today: LevelToday | null;
}

export type LevelLeaderboardPeriod = 'all' | 'month';

export interface LevelLeaderboardItem {
  rank: number;
  user: User | null;
  level: number;
  active_days: number;
  /** 本月新增的活跃天（period=all 时也给） */
  gained: number;
}

/** GET /levels/leaderboard */
export interface LevelLeaderboard {
  period: LevelLeaderboardPeriod;
  items: LevelLeaderboardItem[];
  /** 上榜人数 */
  total: number;
  /** 我的名次；没上榜时为 null */
  me: LevelLeaderboardItem | null;
  generated_at: string | null;
}

export interface LevelHistoryDay {
  date: string;
  online_minutes: number;
  base: number;
  bonus: number;
  earned: number;
}

/** 实时事件 account.level.up 的 data */
export interface LevelUpEvent {
  level: number;
  icons: LevelIconCounts | null;
  active_days: number | null;
}

/** 从别处直达等级页时去哪个页签。 */
export type LevelTab = 'me' | 'board';
