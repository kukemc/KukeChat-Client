import { isRecord } from '@/api/normalizers';
import type { Message, User } from '@/types/api';
import { birthdayState } from './birthday';
import { shopScenario, shopState } from './shop';
import { json, type MockHandler } from './types';

/*
 * 礼物接口（前缀 /gifts，以及 /users/{id}/gifts）的假实现，照着契约草案（礼物一节）写，状态只存在内存里，刷新页面就没了。
 * 余额和商店的假后端是同一份：送礼物 / 送商品记在 shopScenario.spent 上（真消耗，对方不得币），GET /shop 的余额跟着变。
 * 送商品给「我」时，商店的假后端里我就多了一件（限时商品按 duration_days 计期 / 续期）。
 * 场景写在 giftScenario 上，预览页（dev/shop-harness.tsx）的控制条和地址参数改的就是它。
 *
 * 和契约对齐的几处：留言只有送的人和收的人看得到（recordView 的 viewer）；从个人空间送（conversation_id 为 null）不落消息；
 * 对方已永久拥有的商品 409 recipient_owns；价格为 0、已下架的商品 422 not_giftable；心意值 = 花掉的币。
 */

export interface GiftScenario {
  /** ok 正常；disabled 接口在但开关关着（enabled: false）；missing 旧后端，没有这些接口（404） */
  backend: 'ok' | 'disabled' | 'missing';
  /** 送礼时强制返回的错误；none 表示按真实规则来 */
  sendError: 'none' | 'disabled' | 'not_member' | 'muted' | 'ccw_not_bound' | 'blocked' | 'invalid_target' | 'invalid_gift' | 'invalid_count' | 'not_giftable' | 'message_rejected' | 'recipient_owns' | 'insufficient_balance' | 'daily_limit' | 'verification_unavailable' | 'server';
  limits: { message_max: number; count_max: number; daily_send_limit: number };
  /** 「心意值」现在叫什么（改了看界面上是不是处处跟着变） */
  charmLabel: string;
  /** 目录里多放几个：六个备用图形，外加一个这个版本不认识的图形（应该画成通用礼盒） */
  extra: boolean;
  sentToday: number;
  delay: number;
}

export const giftScenario: GiftScenario = {
  backend: 'ok',
  sendError: 'none',
  limits: { message_max: 60, count_max: 99, daily_send_limit: 200 },
  charmLabel: '心意值',
  extra: false,
  sentToday: 0,
  delay: 240
};

interface MockGift {
  key: string;
  name: string;
  price: number;
  icon: string;
  tier: 1 | 2 | 3;
  is_active: boolean;
  sort: number;
}

const GIFTS: MockGift[] = [
  { key: 'flower', name: '小花', price: 1, icon: 'flower', tier: 1, is_active: true, sort: 10 },
  { key: 'lollipop', name: '棒棒糖', price: 5, icon: 'lollipop', tier: 1, is_active: true, sort: 20 },
  { key: 'cake', name: '蛋糕', price: 20, icon: 'cake', tier: 2, is_active: true, sort: 30 },
  { key: 'trophy', name: '奖杯', price: 50, icon: 'trophy', tier: 2, is_active: true, sort: 40 },
  { key: 'rocket', name: '火箭', price: 100, icon: 'rocket', tier: 3, is_active: true, sort: 50 },
  { key: 'castle', name: '城堡', price: 300, icon: 'castle', tier: 3, is_active: true, sort: 60 },
  // 下架的：不应该出现在面板里
  { key: 'retired', name: '下架的礼物', price: 9, icon: 'star', tier: 1, is_active: false, sort: 65 }
];

/** 备用的六个图形，外加一个不认识的：giftScenario.extra 打开时才进目录 */
const EXTRA_GIFTS: MockGift[] = [
  { key: 'star', name: '星星', price: 2, icon: 'star', tier: 1, is_active: true, sort: 70 },
  { key: 'heart', name: '爱心', price: 3, icon: 'heart', tier: 1, is_active: true, sort: 71 },
  { key: 'balloon', name: '气球', price: 8, icon: 'balloon', tier: 1, is_active: true, sort: 72 },
  { key: 'crown', name: '皇冠', price: 88, icon: 'crown', tier: 3, is_active: true, sort: 73 },
  { key: 'cat', name: '猫猫', price: 15, icon: 'cat', tier: 2, is_active: true, sort: 74 },
  { key: 'icecream', name: '冰淇淋', price: 6, icon: 'icecream', tier: 1, is_active: true, sort: 75 },
  { key: 'ufo', name: '神秘礼物', price: 12, icon: 'ufo', tier: 1, is_active: true, sort: 76 }
];

function catalog(): MockGift[] {
  return giftScenario.extra ? [...GIFTS, ...EXTRA_GIFTS] : GIFTS;
}

interface MockRecord {
  id: number;
  kind: 'gift' | 'item';
  giftKey: string | null;
  itemSku: string | null;
  count: number;
  amount: number;
  fromId: number;
  toId: number;
  conversation_id: number | null;
  message_id: number | null;
  message: string;
  /** 是不是在私聊里送的（后台接口要对留言脱敏，这里只是记着） */
  on_birthday: boolean;
  created_at: string;
}

const records: MockRecord[] = [];
const users = new Map<number, User>();
const charm = new Map<number, number>();
/** 别人永久拥有的商品（只有「永久拥有」才会挡住送礼） */
const ownedByOthers = new Map<number, Set<string>>();
const directConversations = new Set<number>();
let meId = 1;
let nextRecordId = 300;
let nextMessageId = 12000;
/** 新的礼物消息交给谁（预览页把它放进会话的历史里） */
let deliver: (message: Message) => void = () => undefined;

/** 发过哪些礼物请求，给自动化脚本核对用 */
export const giftRequests: Array<{ method: string; path: string; body: unknown }> = [];

function fail(status: number, code: string, message: string, extra: Record<string, unknown> = {}): Response {
  return json({ detail: { code, message, ...extra } }, status);
}

function currentBalance(): number {
  return shopScenario.bound ? shopScenario.donated - shopScenario.spent : 0;
}

function balancePayload(): unknown {
  return { bound: shopScenario.bound, donated: shopScenario.donated, spent: shopScenario.spent, balance: currentBalance(), verified_at: new Date().toISOString(), stale: false };
}

/** 公开资料：带上心意值和生日（契约里 UserPublic 新增的三个字段） */
export function giftUser(id: number): User {
  const base = users.get(id) ?? ({ id, username: `user${id}`, nickname: `用户 ${id}` } as User);
  return { ...base, charm: charm.get(id) ?? 0, ...birthdayState.publicFields(id, meId) };
}

function giftRef(key: string | null): Record<string, unknown> | null {
  const gift = [...GIFTS, ...EXTRA_GIFTS].find((item) => item.key === key);
  return gift ? { key: gift.key, name: gift.name, icon: gift.icon, price: gift.price, tier: gift.tier } : null;
}

function itemRef(sku: string | null): Record<string, unknown> | null {
  const item = sku ? shopState.find(sku) : undefined;
  return item ? { sku: item.sku, name: item.name, category: item.category, style: item.style, duration_days: item.duration_days ?? null } : null;
}

/** 一条记录给某个人看是什么样：留言只有送的人和收的人能看到 */
function recordView(record: MockRecord, viewerId = meId): Record<string, unknown> {
  const canSeeMessage = viewerId === record.fromId || viewerId === record.toId;
  return {
    id: record.id,
    kind: record.kind,
    gift: giftRef(record.giftKey),
    item: itemRef(record.itemSku),
    count: record.count,
    amount: record.amount,
    from_user: giftUser(record.fromId),
    to_user: giftUser(record.toId),
    conversation_id: record.conversation_id,
    message_id: record.message_id,
    message: canSeeMessage && record.message ? record.message : null,
    on_birthday: record.on_birthday,
    created_at: record.created_at
  };
}

function messageOf(record: MockRecord): Message {
  const to = giftUser(record.toId);
  const toName = to.nickname || to.username;
  const gift = giftRef(record.giftKey);
  const item = itemRef(record.itemSku);
  const thing = item ? `「${String(item.name)}」` : `${String(gift?.name ?? '礼物')}${record.count > 1 ? ` ×${record.count}` : ''}`;
  return {
    id: record.message_id ?? 0,
    conversation_id: record.conversation_id ?? 0,
    sender_id: record.fromId,
    sender: giftUser(record.fromId),
    type: 'gift',
    // 给旧客户端的兜底文字
    content: `[礼物] 送给 ${toName} ${thing}`,
    metadata: { gift: { id: record.id, kind: record.kind, gift, item, count: record.count, to_user: { id: to.id, display_name: toName, avatar_url: to.avatar_url ?? null }, message: record.message } },
    created_at: record.created_at,
    sender_level: ((record.fromId * 7) % 30) + 1
  } as unknown as Message;
}

interface CreateOptions {
  fromId: number;
  toId: number;
  /** null：从个人空间 / 资料卡送，不落消息 */
  conversationId: number | null;
  giftKey?: string;
  itemSku?: string;
  count?: number;
  message?: string;
  minutesAgo?: number;
  messageId?: number;
  onBirthday?: boolean;
}

function create(options: CreateOptions): MockRecord {
  const gift = options.giftKey ? [...GIFTS, ...EXTRA_GIFTS].find((item) => item.key === options.giftKey) : undefined;
  const item = options.itemSku ? shopState.find(options.itemSku) : undefined;
  const count = item ? 1 : Math.max(1, options.count ?? 1);
  const amount = item ? item.price : (gift?.price ?? 0) * count;
  nextRecordId += 1;
  if (options.conversationId !== null && options.messageId === undefined) {
    nextMessageId += 1;
  }
  const record: MockRecord = {
    id: nextRecordId,
    kind: item ? 'item' : 'gift',
    giftKey: item ? null : gift?.key ?? null,
    itemSku: item?.sku ?? null,
    count,
    amount,
    fromId: options.fromId,
    toId: options.toId,
    conversation_id: options.conversationId,
    message_id: options.conversationId === null ? null : options.messageId ?? nextMessageId,
    message: options.message?.trim() ?? '',
    on_birthday: options.onBirthday ?? birthdayState.isBirthdayToday(options.toId, meId),
    created_at: new Date(Date.now() - (options.minutesAgo ?? 0) * 60_000).toISOString()
  };
  records.push(record);
  charm.set(record.toId, (charm.get(record.toId) ?? 0) + amount);
  return record;
}

/** 预览页用：直接摆布礼物的状态 */
export const giftState = {
  setup(options: { me: number; people: User[]; direct: number[]; onMessage: (message: Message) => void }): void {
    meId = options.me;
    options.people.forEach((user) => users.set(user.id, user));
    options.direct.forEach((id) => directConversations.add(id));
    deliver = options.onMessage;
  },
  /** 造一条送礼记录（不扣币），在会话里的返回它的消息对象，放进历史里；不落消息的返回 null */
  seed(options: CreateOptions): Message | null {
    const record = create(options);
    return record.conversation_id === null ? null : messageOf(record);
  },
  /**
   * 别人送出一份礼物（送给我或者送给别人）。送给我的是商品时，商店的假后端里我就多了一件。
   * 返回消息（没落消息是 null）和 gift.received 事件的 data（不是送给我的是 null），预览页拿去推缓存、发事件。
   */
  receive(options: CreateOptions): { message: Message | null; event: { record: Record<string, unknown> } | null; itemSku: string | null } {
    const record = create(options);
    if (record.toId === meId && record.itemSku) {
      shopState.giveMe(record.itemSku);
    }
    return { message: record.conversation_id === null ? null : messageOf(record), event: record.toId === meId ? { record: recordView(record) } : null, itemSku: record.toId === meId ? record.itemSku : null };
  },
  /** 让某个人永久拥有一件商品（看「对方已拥有」的置灰和 409） */
  setOwnedBy(userId: number, skus: string[]): void {
    ownedByOthers.set(userId, new Set(skus));
  },
  setCharm(userId: number, value: number): void {
    charm.set(userId, value);
  },
  charmOf(userId: number): number {
    return charm.get(userId) ?? 0;
  },
  /** 往记录里塞很多条，看分页 */
  fill(count: number, toId = meId): void {
    const givers = [...users.keys()].filter((id) => id !== toId);
    for (let index = 0; index < count; index += 1) {
      const gift = GIFTS[index % 6];
      create({ fromId: givers[index % givers.length], toId, conversationId: index % 3 === 0 ? null : 1, giftKey: gift.key, count: (index % 4) + 1, message: index % 2 ? '' : `第 ${index + 1} 份礼物`, minutesAgo: (index + 1) * 90, messageId: 0 });
    }
  },
  user: giftUser
};

function send(body: unknown): Response {
  const forced = giftScenario.sendError;
  if (forced === 'server') {
    return json({ detail: 'Internal Server Error' }, 500);
  }
  const source = isRecord(body) ? body : {};
  const toId = typeof source.to_user_id === 'number' ? source.to_user_id : 0;
  const conversationId = typeof source.conversation_id === 'number' ? source.conversation_id : null;
  const kind = source.kind === 'item' ? 'item' : source.kind === 'gift' ? 'gift' : null;
  const count = typeof source.count === 'number' ? source.count : NaN;
  const message = typeof source.message === 'string' ? source.message : '';

  if (forced === 'disabled' || giftScenario.backend === 'disabled') {
    return fail(403, 'disabled', '礼物功能未开放');
  }
  if (forced === 'invalid_target' || toId === meId || !users.has(toId)) {
    return fail(422, 'invalid_target', '不能送给这个人');
  }
  if (forced === 'not_member' || (conversationId !== null && directConversations.has(conversationId) && toId !== 2)) {
    return fail(403, 'not_member', '你或对方不在这个会话里');
  }
  if (forced === 'muted') {
    return fail(403, 'muted', '你已被禁言');
  }
  if (forced === 'blocked') {
    return fail(403, 'blocked', '对方把你拉黑了');
  }
  if (forced === 'ccw_not_bound' || !shopScenario.bound) {
    shopScenario.bound = false;
    return fail(403, 'ccw_not_bound', '还没有绑定 CCW 账号');
  }
  const gift = kind === 'gift' ? catalog().find((item) => item.key === source.gift_key && item.is_active) : undefined;
  const item = kind === 'item' && typeof source.item_sku === 'string' ? shopState.find(source.item_sku) : undefined;
  if (forced === 'invalid_gift' || kind === null || (kind === 'gift' && !gift)) {
    return fail(422, 'invalid_gift', '没有这个礼物');
  }
  if (forced === 'invalid_count' || !Number.isInteger(count) || count < 1 || count > giftScenario.limits.count_max || (kind === 'item' && count !== 1)) {
    return fail(422, 'invalid_count', '数量不对');
  }
  if (forced === 'not_giftable' || (kind === 'item' && (!item || item.price <= 0 || !item.is_active || (item.available_until !== null && new Date(item.available_until).getTime() <= Date.now())))) {
    return fail(422, 'not_giftable', '这件商品不能送');
  }
  if (forced === 'message_rejected' || message.length > giftScenario.limits.message_max || /违规/.test(message)) {
    return fail(422, 'message_rejected', '留言没有通过审核');
  }
  if (forced === 'recipient_owns' || (item && !item.duration_days && ownedByOthers.get(toId)?.has(item.sku))) {
    if (item) {
      ownedByOthers.set(toId, new Set([...(ownedByOthers.get(toId) ?? []), item.sku]));
    }
    return fail(409, 'recipient_owns', '对方已经永久拥有这件商品');
  }
  if (forced === 'daily_limit' || giftScenario.sentToday >= giftScenario.limits.daily_send_limit) {
    return fail(429, 'daily_limit', '今天送礼物的次数用完了');
  }
  if (forced === 'verification_unavailable' || shopScenario.noDonateUrl) {
    return fail(503, 'verification_unavailable', 'CCW 接口暂时不通，稍后再试');
  }
  const total = item ? item.price : (gift?.price ?? 0) * count;
  const balance = currentBalance();
  if (forced === 'insufficient_balance' || balance < total) {
    // 强制「余额不够」时模拟的是：服务端重新核实后发现币比客户端以为的少
    const actual = forced === 'insufficient_balance' ? Math.min(balance, Math.max(0, total - 30)) : balance;
    if (forced === 'insufficient_balance') {
      shopScenario.donated -= balance - actual;
    }
    return fail(402, 'insufficient_balance', '金币不够', { balance: actual, shortfall: total - actual });
  }
  const record = create({ fromId: meId, toId, conversationId, giftKey: gift?.key, itemSku: item?.sku, count, message });
  shopScenario.spent += total;
  giftScenario.sentToday += 1;
  if (item && !item.duration_days) {
    ownedByOthers.set(toId, new Set([...(ownedByOthers.get(toId) ?? []), item.sku]));
  }
  const chat = record.conversation_id === null ? null : messageOf(record);
  if (chat) {
    deliver(chat);
  }
  return json({ record: recordView(record), message: chat, balance: balancePayload() });
}

function wall(userId: number): Record<string, unknown> {
  const mine = records.filter((record) => record.toId === userId);
  const groups = new Map<string, { record: MockRecord; count: number; last: string }>();
  for (const record of mine) {
    const key = record.kind === 'item' ? `item:${record.itemSku}` : `gift:${record.giftKey}`;
    const group = groups.get(key);
    if (group) {
      group.count += record.count;
      group.last = record.created_at > group.last ? record.created_at : group.last;
    } else {
      groups.set(key, { record, count: record.count, last: record.created_at });
    }
  }
  const summary = [...groups.values()].sort((left, right) => right.record.amount / right.record.count - left.record.amount / left.record.count).map((group) => ({ kind: group.record.kind, gift: giftRef(group.record.giftKey), item: itemRef(group.record.itemSku), count: group.count, last_at: group.last }));
  return { charm: charm.get(userId) ?? 0, total_count: mine.reduce((sum, record) => sum + record.count, 0), summary };
}

function page(list: MockRecord[], url: URL, viewerId = meId): { items: unknown[]; total: number } {
  const limit = Number(url.searchParams.get('limit') ?? 20);
  const offset = Number(url.searchParams.get('offset') ?? 0);
  const sorted = [...list].sort((left, right) => (left.created_at < right.created_at ? 1 : -1));
  return { items: sorted.slice(offset, offset + limit).map((record) => recordView(record, viewerId)), total: sorted.length };
}

export const giftsMock: MockHandler = async ({ path, url, method, body }) => {
  const wallMatch = path.match(/^\/users\/(\d+)\/gifts(\/records)?$/);
  if (!path.startsWith('/gifts') && !wallMatch) {
    return undefined;
  }
  giftRequests.push({ method, path, body });
  await new Promise((resolve) => window.setTimeout(resolve, giftScenario.delay));
  if (giftScenario.backend === 'missing') {
    return json({ detail: 'Not Found' }, 404);
  }
  if (path === '/gifts/catalog' && method === 'GET') {
    return json({ enabled: giftScenario.backend === 'ok', charm_label: giftScenario.charmLabel, gifts: catalog(), limits: giftScenario.limits });
  }
  if (path === '/gifts' && method === 'POST') {
    return send(body);
  }
  if (path === '/gifts/mine' && method === 'GET') {
    const sent = url.searchParams.get('direction') === 'sent';
    const list = records.filter((record) => (sent ? record.fromId === meId : record.toId === meId));
    return json({ ...page(list, url), sum: list.reduce((sum, record) => sum + record.amount, 0) });
  }
  if (path === '/gifts/leaderboard' && method === 'GET') {
    const month = url.searchParams.get('period') === 'month';
    const limit = Number(url.searchParams.get('limit') ?? 50);
    // 本月的榜：只算三十天内的记录
    const since = Date.now() - 30 * 86400_000;
    const totals = new Map<number, number>();
    if (month) {
      records.filter((record) => new Date(record.created_at).getTime() >= since).forEach((record) => totals.set(record.toId, (totals.get(record.toId) ?? 0) + record.amount));
    } else {
      charm.forEach((value, id) => totals.set(id, value));
    }
    const ranked = [...totals.entries()].filter(([, value]) => value > 0).sort((left, right) => right[1] - left[1]).map(([id, value], index) => ({ rank: index + 1, user: giftUser(id), charm: value }));
    const me = ranked.find((row) => row.user.id === meId);
    return json({ items: ranked.slice(0, limit), me: { rank: me?.rank ?? null, charm: me?.charm ?? 0 } });
  }
  if (wallMatch && method === 'GET') {
    const userId = Number(wallMatch[1]);
    if (!wallMatch[2]) {
      return json(wall(userId));
    }
    const giftKey = url.searchParams.get('gift_key');
    const itemSku = url.searchParams.get('item_sku');
    return json(page(records.filter((record) => record.toId === userId && (!giftKey || record.giftKey === giftKey) && (!itemSku || record.itemSku === itemSku)), url));
  }
  return json({ detail: 'Not Found' }, 404);
};
