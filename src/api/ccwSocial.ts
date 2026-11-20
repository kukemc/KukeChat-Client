// 在共创世界上：好友「正在玩 / 正在创作」（后端 docs/ccw-social.md）。
// 上报由油猴脚本 KukeChat for CCW 负责，客户端只读和显示。
import { apiRequest } from './client';
import { asList } from './normalizers';

export type CcwActivityKind = 'play' | 'create' | 'read';

export interface CcwActivity {
  kind: CcwActivityKind;
  ccw_oid: string | null;
  title: string;
  cover_url: string | null;
  started_at: string;
  updated_at: string;
  /** 过了这个时间还没收到新的推送，就当它已经结束 */
  expires_at: string;
}

export interface UserCcwActivity {
  user_id: number;
  activity: CcwActivity | null;
}

export async function getFriendActivities(): Promise<UserCcwActivity[]> {
  return asList<UserCcwActivity>(await apiRequest<unknown>('/ccw/activity/friends'));
}
