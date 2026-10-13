import type { User } from '@/types/api';
import { json, type MockHandler } from './types';

/*
 * 资料点赞接口的假实现（契约见后端 docs/chat-features.md 第 6 节），状态只存在内存里，刷新页面就没了。
 * 场景写在 likeScenario 上，预览页（dev/likes-harness.tsx）的控制条和地址参数改的就是它。
 *
 * 只认登记过的用户（likeState.register）：别的预览页没登记，查谁都是 404 user_not_found，点赞界面不会冒出来。
 */

export type LikeFailure = 'none' | 'already' | 'limit' | 'muted' | 'notfound' | 'server' | 'network' | 'gone';

export interface LikeScenario {
  /** ok 正常；missing 服务端还没有资料点赞（所有接口 404）；error GET /users/likes/options 出错（500） */
  backend: 'ok' | 'missing' | 'error';
  /** 用户对象上带不带 profile_like_count（false：模拟只部署了一半的后端） */
  field: boolean;
  /**
   * 点赞时强行返回的错误，不管实际状态如何（看按钮怎么回滚、提示怎么写）：
   *   already 409 已经点过   limit 429 到上限   muted 403 被禁言   notfound 404 用户不存在
   *   server 500   network 请求发不出去   gone 404 且没有错误码（接口没了）
   */
  fail: LikeFailure;
  /** 我被平台禁言：can_like 是 false，点了是 403 */
  muted: boolean;
  /** GET /users/{id}/likes 出错（500） */
  stateFails: boolean;
  /** GET /users/me/likes/received 出错（500） */
  receivedFails: boolean;
  targetsPerDay: number;
  /** 我今天已经给多少个不同的人点过赞 */
  usedToday: number;
  delay: number;
}

export const likeScenario: LikeScenario = {
  backend: 'ok',
  field: true,
  fail: 'none',
  muted: false,
  stateFails: false,
  receivedFails: false,
  targetsPerDay: 50,
  usedToday: 13,
  delay: 220
};

interface LikeRecord {
  user: User;
  count: number;
  today: number;
  /** 我今天给他点过没有 */
  liked: boolean;
}

interface ReceivedRow {
  user: User;
  created_at: string;
  today: boolean;
}

const records = new Map<number, LikeRecord>();
let meId = 0;
let received: ReceivedRow[] = [];

const NAMES = ['阿夸', '薄荷糖', '极光君', '糖糖', '星野', '小蓝鲸', '橘子汽水', '一个名字特别特别长的群友用来测试名单里的截断', '白夜', '柚子茶', '北极熊', '码农小明', '晚风', '栗子', '云朵工坊', '脆脆鲨', '青柠', '南瓜灯', '松果', '海盐'];

/** 「谁赞了我」里那些人的 id 从这里起 */
const FAN_ID_BASE = 3000;

/** 名单里的人：预览页要打开他们的主页时，用这个取资料。不是名单里的 id 返回 null。 */
export function likeFan(userId: number): User | null {
  return userId >= FAN_ID_BASE && userId < FAN_ID_BASE + 2000 ? fan(userId - FAN_ID_BASE) : null;
}

function fan(index: number): User {
  return { id: FAN_ID_BASE + index, username: `fan${index}`, nickname: `${NAMES[index % NAMES.length]}${index >= NAMES.length ? ` ${Math.floor(index / NAMES.length) + 1}` : ''}`, account_level: 1 + ((index * 7) % 40), ...(likeScenario.field ? { profile_like_count: (index * 37) % 900 } : {}) } as User;
}

function writeField(record: LikeRecord): void {
  // 和真服务端一样：再去取这个人的资料时，赞数是新的
  if (likeScenario.field) {
    record.user.profile_like_count = record.count;
  } else {
    delete record.user.profile_like_count;
  }
}

/** 造一份「谁赞了我」：前 today 条是今天的（几分钟到几小时前），后面的一天比一天早。 */
function buildReceived(total: number, today: number): ReceivedRow[] {
  const now = Date.now();
  const rows: ReceivedRow[] = [];
  for (let index = 0; index < total; index += 1) {
    const isToday = index < today;
    const minutes = isToday ? 3 + index * 17 : 24 * 60 + (index - today) * 7 * 60 + ((index * 53) % 240);
    rows.push({ user: fan(index), created_at: new Date(now - minutes * 60_000).toISOString(), today: isToday });
  }
  return rows;
}

export const likeState = {
  /** 登记一个人和他现在的赞数。me 标出「我」是谁（看自己时 liked_today 恒为 false、不能点）。 */
  register(user: User, count: number, extra: { today?: number; liked?: boolean; me?: boolean } = {}): void {
    const record: LikeRecord = { user, count, today: extra.today ?? 0, liked: extra.liked ?? false };
    records.set(user.id, record);
    writeField(record);
    if (extra.me) {
      meId = user.id;
      // 名单的条数不等于累计赞数（同一个人每天一条，很早的也翻得到）：这里造 57 条，够翻三页
      received = buildReceived(Math.min(count, 57), record.today);
    }
  },
  /** 场景里 field 变了之后，把每个人对象上的字段重写一遍 */
  syncField(): void {
    records.forEach(writeField);
  },
  /** 清空「谁赞了我」（看空名单） */
  clearReceived(): void {
    received = [];
    const mine = records.get(meId);
    if (mine) {
      mine.count = 0;
      mine.today = 0;
      writeField(mine);
    }
  },
  /**
   * 模拟「别人赞了我」：times 个人连着点（真实的服务端会把 3 秒内的合并成一条事件）。
   * 返回要推的那一条事件的 data —— 预览页拿去喂给 handleProfileLikeEvent 和 emitRealtimeEvent。
   */
  receive(times = 1): { from_user: User; like_count: number; today_count: number } | null {
    const mine = records.get(meId);
    if (!mine) {
      return null;
    }
    let from = fan(0);
    for (let index = 0; index < times; index += 1) {
      from = fan(100 + received.length + index);
      received.unshift({ user: from, created_at: new Date().toISOString(), today: true });
      mine.count += 1;
      mine.today += 1;
    }
    writeField(mine);
    return { from_user: from, like_count: mine.count, today_count: mine.today };
  },
  get(userId: number): LikeRecord | undefined {
    return records.get(userId);
  }
};

/** 发过哪些点赞请求，给自动化脚本核对用 */
export const likeRequests: Array<{ method: string; path: string }> = [];

function fail(status: number, code: string, message: string, extra: Record<string, unknown> = {}): Response {
  return json({ detail: { code, message, ...extra } }, status);
}

function tomorrowMidnightChina(): string {
  // UTC+8 的明天 0 点
  const shifted = new Date(Date.now() + 8 * 3600_000);
  shifted.setUTCHours(24, 0, 0, 0);
  return new Date(shifted.getTime() - 8 * 3600_000).toISOString();
}

function mutedError(): Response {
  return fail(403, 'account_muted', '你已被禁言，期间不能点赞', { muted_until: new Date(Date.now() + 2 * 3600_000).toISOString(), reason: '预览页模拟的禁言' });
}

function limitError(): Response {
  return fail(429, 'like_limit', '今天点赞的人数到上限了', { resets_at: tomorrowMidnightChina() });
}

function stateOf(record: LikeRecord): Record<string, unknown> {
  const self = record.user.id === meId;
  const left = Math.max(0, likeScenario.targetsPerDay - likeScenario.usedToday);
  return {
    user_id: record.user.id,
    like_count: record.count,
    today_count: record.today,
    liked_today: self ? false : record.liked,
    can_like: !self && !record.user.is_bot && !record.liked && left > 0 && !likeScenario.muted,
    left_today: left
  };
}

export const profileLikesMock: MockHandler = async ({ path, url, method }) => {
  const options = path === '/users/likes/options';
  const receivedList = path === '/users/me/likes/received';
  const target = path.match(/^\/users\/(\d+)\/likes$/);
  if (!options && !receivedList && !target) {
    return undefined;
  }
  likeRequests.push({ method, path });
  await new Promise((resolve) => window.setTimeout(resolve, likeScenario.delay));
  if (likeScenario.backend === 'missing') {
    // 旧后端：/users/likes/options 和 /users/me/likes/received 没有路由；/users/{id}/likes 也没有
    return json({ detail: 'Not Found' }, 404);
  }
  if (options) {
    return likeScenario.backend === 'error' ? json({ detail: 'Internal Server Error' }, 500) : json({ targets_per_day: likeScenario.targetsPerDay });
  }
  if (receivedList) {
    if (likeScenario.receivedFails) {
      return json({ detail: 'Internal Server Error' }, 500);
    }
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') ?? 20)));
    const offset = Math.max(0, Number(url.searchParams.get('offset') ?? 0));
    return json({ items: received.slice(offset, offset + limit), total: received.length, today_count: records.get(meId)?.today ?? 0 });
  }
  const targetId = Number(target?.[1]);
  // 名单里的人没有事先登记：有人点进他们的主页时现登记一份，这样也能给他们点赞
  const fanUser = records.has(targetId) ? null : likeFan(targetId);
  if (fanUser) {
    records.set(targetId, { user: fanUser, count: ((targetId - FAN_ID_BASE) * 37) % 900, today: 0, liked: false });
  }
  const record = records.get(targetId);
  if (method === 'GET') {
    if (likeScenario.stateFails) {
      return json({ detail: 'Internal Server Error' }, 500);
    }
    return record ? json(stateOf(record)) : fail(404, 'user_not_found', '用户不存在');
  }
  if (method !== 'POST') {
    return json({ detail: 'Method Not Allowed' }, 405);
  }
  // 强行指定的失败：不管实际状态如何
  switch (likeScenario.fail) {
    case 'already': return fail(409, 'already_liked_today', '今天已经给 Ta 点过赞了，明天再来吧');
    case 'limit': return limitError();
    case 'muted': return mutedError();
    case 'notfound': return fail(404, 'user_not_found', '用户不存在');
    case 'server': return json({ detail: 'Internal Server Error' }, 500);
    case 'gone': return json({ detail: 'Not Found' }, 404);
    case 'network': throw new TypeError('Failed to fetch');
    default: break;
  }
  if (!record) {
    return fail(404, 'user_not_found', '用户不存在');
  }
  if (record.user.id === meId) {
    return fail(400, 'cannot_like_self', '不能给自己点赞');
  }
  if (record.user.is_bot) {
    return fail(400, 'cannot_like_bot', '不能给机器人点赞');
  }
  if (likeScenario.muted) {
    return mutedError();
  }
  if (record.liked) {
    return fail(409, 'already_liked_today', '今天已经给 Ta 点过赞了，明天再来吧');
  }
  if (likeScenario.usedToday >= likeScenario.targetsPerDay) {
    return limitError();
  }
  record.liked = true;
  record.count += 1;
  record.today += 1;
  likeScenario.usedToday += 1;
  writeField(record);
  return json(stateOf(record));
};
