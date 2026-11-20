// 我在共创世界上的关系：自己的 oid、关注列表（带是否互关）。动态合并和互关邀请都要用。
// /students/self/detail 里有实名、身份证等敏感字段，只取 oid，别的一律不留。
import { post } from '../core/api.js';

let selfOid = null;
let follows = null;

export function mySelfOid() {
  if (!selfOid) {
    selfOid = post('/students/self/detail', {})
      .then((d) => (d && (d.studentOid || d.oid)) || null)
      .catch(() => null);
  }
  return selfOid;
}

/** [{ oid, name, avatar, mutual }]，最多 500 个（服务端 ccw_oids 上限） */
export function myFollowings() {
  if (!follows) {
    follows = (async () => {
      const oid = await mySelfOid();
      if (!oid) return [];
      const out = [];
      for (let page = 1; page <= 5; page++) {
        const body = await post(`/student/following/page?page=${page}&perPage=100&sortType=DESC`, { studentOid: oid });
        const data = (body && body.data) || [];
        data.forEach((u) => {
          if (u.followingOid) out.push({ oid: u.followingOid, name: u.name, avatar: u.avatar, mutual: u.operatorFollowingStatus === 'BOTH_FOLLOWED' });
        });
        if (!body || page >= (body.totalPages || 1) || !data.length) break;
      }
      return out;
    })().catch(() => { follows = null; return []; });
  }
  return follows;
}
