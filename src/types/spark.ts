/** 好友火花（KukeChat-Server/docs/sparks.md）。 */

export type SparkStatus = 'none' | 'lit' | 'pending' | 'dying' | 'out';
export type SparkLevelKey = 'ember' | 'spark' | 'flame' | 'blaze' | 'inferno' | 'eternal';
export type SparkRelightBlock = 'not_out' | 'expired' | 'cooldown';

/** 一对好友的火花，按看的人的视角（第 2 节）。 */
export interface Spark {
  /** none 还没有 / lit 今天已续 / pending 今天还没续 / dying 快熄灭 / out 已熄灭 */
  status: SparkStatus;
  days: number;
  level: number;
  level_name: string | null;
  level_key: SparkLevelKey | null;
  today_lit: boolean;
  i_spoke_today: boolean;
  friend_spoke_today: boolean;
  dying: boolean;
  best_days: number;
  next_level: number | null;
  next_level_name: string | null;
  next_level_days: number | null;
  days_to_next: number | null;
  lit_on: string | null;
  extinguished_at: string | null;
  /** 熄灭前的天数（能恢复的）；没有为 0 */
  lost_days: number;
  lost_level_key: SparkLevelKey | null;
  can_relight: boolean;
  relight_block: SparkRelightBlock | null;
  relight_cost: number;
  relight_deadline: string | null;
  relight_cooldown_until: string | null;
  relit_at: string | null;
}

export interface SparkLevelRule {
  level: number;
  name: string;
  key: SparkLevelKey;
  min_days: number;
}

export interface SparkRules {
  timezone: string;
  levels: SparkLevelRule[];
  grace_missed_days: number;
  relight_cost: number;
  relight_window_days: number;
  relight_cooldown_days: number;
  rules: string[];
}

export interface SparkDetail {
  friend_id: number;
  conversation_id: number | null;
  spark: Spark;
  rules: SparkRules;
}

/** 实时事件 spark.updated（第 4 节） */
export interface SparkUpdatedEvent {
  friend_id: number;
  conversation_id: number | null;
  reason: 'spoke' | 'lit' | 'recalled' | 'extinguished' | 'relit' | string;
  actor_id: number | null;
  spark: Spark;
}
