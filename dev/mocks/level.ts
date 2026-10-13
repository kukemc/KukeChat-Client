import type { User } from '@/types/api';
import { json, type MockHandler } from './types';

/*
 * 账号等级接口（docs/account-level.md）的假实现，状态只存在内存里，刷新页面就没了。
 * 场景写在 levelScenario 上，预览页（dev/level-harness.tsx）的控制条和地址参数改的就是它。
 * 规则里的数值照契约的默认值填；等级和活跃天数之间按契约的公式（N² + 4N）互相换算。
 */

export interface LevelScenario {
  /** ok 正常；missing 服务端没有账号等级（404）；error 服务端出错（500） */
  backend: 'ok' | 'missing' | 'error';
  /** 我的等级。活跃天数由它算出来，再加上 extraDays */
  level: number;
  /** 在当前等级的门槛之上又攒了多少天 */
  extraDays: number;
  streak: number;
  /** 全站名次；null 模拟「还没有名次」 */
  rank: number | null;
  registeredDays: number;
  onlineMinutes: number;
  messages: number;
  checkin: boolean;
  ccwBound: boolean;
  jury: boolean;
  /** GET /levels/me 出错 */
  meFails: boolean;
  /** 排行榜上有多少人 */
  boardSize: number;
  /** 近 30 天全是 0 */
  emptyHistory: boolean;
  delay: number;
}

export const levelScenario: LevelScenario = {
  backend: 'ok',
  level: 23,
  extraDays: 10.5,
  streak: 12,
  rank: 37,
  registeredDays: 151,
  onlineMinutes: 95,
  messages: 12,
  checkin: true,
  ccwBound: true,
  jury: false,
  meFails: false,
  boardSize: 132,
  emptyHistory: false,
  delay: 180
};

export const MAX_LEVEL = 256;
/** 预览页要看的那几个边界等级 */
export const BOUNDARY_LEVELS = [0, 1, 3, 4, 15, 16, 23, 63, 64, 255, 256];

export const LEVEL_RULES = {
  max_level: MAX_LEVEL,
  formula: 'N² + 4N',
  icons: [
    { key: 'crown', label: '皇冠', levels: 64 },
    { key: 'sun', label: '太阳', levels: 16 },
    { key: 'moon', label: '月亮', levels: 4 },
    { key: 'star', label: '星星', levels: 1 }
  ],
  daily_cap: 2.0,
  online: [{ minutes: 120, days: 1.0 }, { minutes: 30, days: 0.5 }],
  bonuses: [
    { key: 'messages', label: '当天发言满 20 条', days: 0.3, target: 20 },
    { key: 'checkin', label: '当天在任意群签到', days: 0.1 },
    { key: 'ccw_bound', label: '已绑定 CCW 账号', days: 0.1 },
    { key: 'jury', label: '风纪委员当天参与评审', days: 0.2 },
    { key: 'streak_7', label: '连续活跃 7 天', days: 0.1, target: 7 },
    { key: 'streak_30', label: '连续活跃 30 天', days: 0.3, target: 30 }
  ],
  milestones: [{ level: 4, days: 32 }, { level: 16, days: 320 }, { level: 64, days: 4352 }]
};

export function daysForLevel(level: number): number {
  return level * level + 4 * level;
}

export function iconsOf(level: number): Record<string, number> {
  let rest = level;
  const counts: Record<string, number> = {};
  for (const rule of LEVEL_RULES.icons) {
    counts[rule.key] = Math.floor(rest / rule.levels);
    rest -= counts[rule.key] * rule.levels;
  }
  return counts;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function myActiveDays(): number {
  const level = Math.min(MAX_LEVEL, Math.max(0, levelScenario.level));
  if (level >= MAX_LEVEL) {
    return daysForLevel(level) + levelScenario.extraDays;
  }
  // 不超过下一级的门槛，否则等级就对不上了
  const room = daysForLevel(level + 1) - daysForLevel(level);
  return round1(daysForLevel(level) + Math.min(levelScenario.extraDays, room - 0.5));
}

function card(level: number, activeDays: number, extra: Record<string, unknown>): Record<string, unknown> {
  const maxed = level >= MAX_LEVEL;
  return {
    level,
    active_days: activeDays,
    icons: iconsOf(level),
    next_level_days: maxed ? null : daysForLevel(level + 1),
    days_to_next: maxed ? null : round1(daysForLevel(level + 1) - activeDays),
    ...extra
  };
}

function today(): Record<string, unknown> {
  const scenario = levelScenario;
  const base = scenario.onlineMinutes >= 120 ? 1.0 : scenario.onlineMinutes >= 30 ? 0.5 : 0;
  const on = base > 0;
  const bonuses = [
    { key: 'messages', earned: on && scenario.messages >= 20, days: 0.3, current: scenario.messages, target: 20 },
    { key: 'checkin', earned: on && scenario.checkin, days: 0.1 },
    { key: 'ccw_bound', earned: on && scenario.ccwBound, days: 0.1 },
    { key: 'jury', earned: on && scenario.jury, days: 0.2 },
    // 连续 30 天替代连续 7 天
    { key: 'streak_7', earned: on && scenario.streak >= 7 && scenario.streak < 30, days: 0.1, current: scenario.streak, target: 7 },
    { key: 'streak_30', earned: on && scenario.streak >= 30, days: 0.3, current: scenario.streak, target: 30 }
  ];
  const earned = Math.min(2.0, base + bonuses.reduce((sum, bonus) => sum + (bonus.earned ? bonus.days : 0), 0));
  return { date: new Date().toISOString().slice(0, 10), online_minutes: scenario.onlineMinutes, base, bonuses, earned: round1(earned), cap: 2.0 };
}

/** 榜上的人：昵称各不相同，等级从高到低 */
const NAMES = ['阿夸', '薄荷糖', '极光君', '糖糖', '星野', '小蓝鲸', '橘子汽水', '一个名字特别特别长的群友用来测试截断', '白夜', '柚子茶', '北极熊', '码农小明', '晚风', '栗子', '云朵工坊', '脆脆鲨', '青柠', '南瓜灯', '松果', '海盐'];

function boardUser(index: number, level: number): User {
  return { id: 1000 + index, username: `user${index}`, nickname: `${NAMES[index % NAMES.length]}${index >= NAMES.length ? ` ${Math.floor(index / NAMES.length) + 1}` : ''}`, account_level: level } as User;
}

interface BoardRow {
  user: User;
  level: number;
  active_days: number;
  gained: number;
}

function boardRows(me: User | null): BoardRow[] {
  const rows: BoardRow[] = [];
  for (let index = 0; index < levelScenario.boardSize; index += 1) {
    // 头几名等级很高（看皇冠、太阳在榜上的样子），往后慢慢降
    const level = index === 0 ? 131 : index === 1 ? 64 : index === 2 ? 47 : Math.max(1, Math.round(42 - index * 0.32));
    rows.push({ user: boardUser(index, level), level, active_days: round1(daysForLevel(level) + ((index * 7) % 9) + 0.5), gained: round1(Math.max(0.5, 58 - ((index * 13) % 51))) });
  }
  if (me && levelScenario.rank !== null) {
    const position = Math.min(rows.length, Math.max(0, levelScenario.rank - 1));
    rows.splice(position, 0, { user: me, level: levelScenario.level, active_days: myActiveDays(), gained: 28 });
  }
  return rows;
}

function history(days: number): Array<Record<string, unknown>> {
  const items: Array<Record<string, unknown>> = [];
  const now = Date.now();
  for (let index = days - 1; index >= 0; index -= 1) {
    const date = new Date(now - index * 86400_000).toISOString().slice(0, 10);
    const seed = (index * 37 + 11) % 17;
    const minutes = levelScenario.emptyHistory ? 0 : index === 0 ? levelScenario.onlineMinutes : seed < 3 ? 0 : seed < 6 ? 30 + seed * 9 : 120 + seed * 14;
    const base = minutes >= 120 ? 1.0 : minutes >= 30 ? 0.5 : 0;
    const bonus = base > 0 ? round1(Math.min(1.0, ((seed * 3) % 11) / 10)) : 0;
    items.push({ date, online_minutes: minutes, base, bonus, earned: round1(base + bonus) });
  }
  return items;
}

/** 假后端认识的其他用户：预览页把聊天里的人登记进来，查他们的等级卡时才有数据 */
const knownUsers = new Map<number, User>();
/** 「我」是谁：排行榜里要把这个用户对象放进去 */
let meUser: User | null = null;

export const levelState = {
  register(users: User[]): void {
    users.forEach((user) => knownUsers.set(user.id, user));
  },
  setMe(user: User): void {
    meUser = user;
  },
  activeDays: myActiveDays
};

/** 发过哪些等级请求，给自动化脚本核对用（消息行不应该发任何请求） */
export const levelRequests: Array<{ method: string; path: string }> = [];

export const levelMock: MockHandler = async ({ path, url, method }) => {
  const userLevel = path.match(/^\/users\/(\d+)\/level$/);
  if (!path.startsWith('/levels') && !userLevel) {
    return undefined;
  }
  levelRequests.push({ method, path });
  await new Promise((resolve) => window.setTimeout(resolve, levelScenario.delay));
  if (levelScenario.backend === 'missing') {
    return json({ detail: 'Not Found' }, 404);
  }
  if (levelScenario.backend === 'error') {
    return json({ detail: 'Internal Server Error' }, 500);
  }
  if (path === '/levels/rules') {
    return json(LEVEL_RULES);
  }
  if (path === '/levels/me') {
    if (levelScenario.meFails) {
      return json({ detail: 'Internal Server Error' }, 500);
    }
    const level = Math.min(MAX_LEVEL, Math.max(0, levelScenario.level));
    return json(card(level, myActiveDays(), {
      level_days: daysForLevel(level),
      next_level: level >= MAX_LEVEL ? null : level + 1,
      streak: levelScenario.streak,
      rank: levelScenario.rank,
      today: today(),
      registered_days: levelScenario.registeredDays
    }));
  }
  if (userLevel) {
    const userId = Number(userLevel[1]);
    if (meUser && userId === meUser.id) {
      return json(card(levelScenario.level, myActiveDays(), { user_id: userId, streak: levelScenario.streak, rank: levelScenario.rank, registered_days: levelScenario.registeredDays }));
    }
    const user = knownUsers.get(userId);
    if (!user) {
      return json({ detail: { code: 'user_not_found', message: '用户不存在' } }, 404);
    }
    const level = Math.min(MAX_LEVEL, Math.max(0, Number(user.account_level ?? 0)));
    // 0 级的人：有一点活跃天但还没到 1 级，刚上榜、名次还没算出来
    return json(card(level, round1(daysForLevel(level) + (userId % 5) + 0.5), { user_id: userId, streak: (userId * 3) % 40, rank: level === 0 ? null : 5 + ((userId * 17) % 900), registered_days: 30 + ((userId * 53) % 700) }));
  }
  if (path === '/levels/leaderboard') {
    const period = url.searchParams.get('period') === 'month' ? 'month' : 'all';
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? 50)));
    const offset = Math.max(0, Number(url.searchParams.get('offset') ?? 0));
    let rows = boardRows(meUser);
    if (period === 'month') {
      rows = rows.slice().sort((left, right) => right.gained - left.gained);
    }
    const ranked = rows.map((row, index) => ({ rank: index + 1, ...row }));
    const mine = meUser ? ranked.find((row) => row.user.id === meUser?.id) ?? null : null;
    return json({ period, items: ranked.slice(offset, offset + limit), total: ranked.length, me: mine, generated_at: new Date(Date.now() - 20_000).toISOString() });
  }
  if (path === '/levels/history') {
    return json({ items: history(Math.min(90, Math.max(1, Number(url.searchParams.get('days') ?? 30)))) });
  }
  return json({ detail: 'Not Found' }, 404);
};
