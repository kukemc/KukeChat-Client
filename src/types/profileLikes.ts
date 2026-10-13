import type { User } from './api';

/** 资料点赞（KukeChat-Server 的 docs/chat-features.md 第 6 节）。 */

/** GET /users/likes/options */
export interface ProfileLikeOptions {
  /** 每人每天最多给多少个不同的人点赞 */
  targets_per_day: number;
}

/** GET / POST /users/{id}/likes：我和这个人之间的点赞状态。 */
export interface ProfileLikeState {
  user_id: number;
  /** 累计收到的赞 */
  like_count: number;
  /** 今天（UTC+8 自然日）收到的 */
  today_count: number;
  /** 我今天给他点过没有；看自己时恒为 false */
  liked_today: boolean;
  /** 我现在能不能点 */
  can_like: boolean;
  /** 我今天还能给多少个不同的人点赞；服务端没给（或这份状态是从实时事件拼出来的）时是 null */
  left_today: number | null;
  /** 不能点的原因：self / bot / muted / liked_today / limit；能点、或服务端没给时没有这个字段 */
  reason?: string | null;
}

export interface ProfileLikeReceivedItem {
  user: User;
  created_at: string;
  /** 是不是今天（UTC+8）点的，由服务端判断 */
  today: boolean;
}

/** GET /users/me/likes/received 的一页。 */
export interface ProfileLikesReceived {
  items: ProfileLikeReceivedItem[];
  total: number;
  today_count: number;
}

/** 实时事件 user.profile.liked 的 data，只发给被赞的人本人。3 秒内的多次点赞合并成一条，from_user 是最后一个。 */
export interface ProfileLikedEvent {
  from_user: User | null;
  like_count: number;
  today_count: number;
}
