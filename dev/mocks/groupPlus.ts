import type { Conversation, Message, User } from '@/types/api';
import { shopScenario } from './shop';
import { json, type MockHandler } from './types';

/*
 * 群升级 / 群文件 / 群待办 / 永久精华 / 聊天记录搜索（KukeChat-Server/docs/group-plus.md）的假实现，状态只存在内存里。
 *
 * 余额和商店是同一份：购买记在 shopScenario.spent 上，GET /shop 的余额跟着变（和礼物、红包一个做法）；
 * 想看「余额不足 / 未绑定」直接改 shopScenario.donated / bound。
 * 这些路径只在预览页调过 initGroupPlusMock 之后才响应（plusState.ready），别的预览页不受影响。
 * 场景写在 plusScenario 上，预览页（dev/group-plus-harness.tsx）的控制条和地址参数改的就是它。
 */

export interface PlusScenario {
  /** ok 正常；disabled 接口在但总开关关着（只禁购买）；missing 旧后端，没有这些接口（404） */
  backend: 'ok' | 'disabled' | 'missing';
  /** 我是不是群主（false 时是普通成员：看得到档位信息，买不了、设不了待办） */
  staff: boolean;
  /** 购买 / 报价时强制返回的错误；none 按真实规则来 */
  purchaseError: 'none' | 'insufficient_balance' | 'ccw_not_bound' | 'verification_unavailable' | 'plan_changed' | 'price_changed' | 'server';
  /** 上传时强制返回的错误 */
  uploadError: 'none' | 'quota_exceeded' | 'file_too_large' | 'muted' | 'rate_limited' | 'server';
  /** 设精华时强制返回「已达上限」 */
  featuredFull: boolean;
  /** 模拟还没有文件夹功能的旧后端：列表不带 folders 等字段 */
  legacyFolders: boolean;
  delay: number;
}

export const plusScenario: PlusScenario = { backend: 'ok', staff: true, purchaseError: 'none', uploadError: 'none', featuredFull: false, legacyFolders: false, delay: 200 };

type Tier = 'free' | 'pro' | 'pro_plus' | 'max';

interface Plan {
  key: Tier;
  name: string;
  rank: number;
  member_limit: number;
  message_limit: number;
  file_enabled: boolean;
  file_quota_bytes: number | null;
  file_temp_max_bytes: number | null;
  featured_limit: number;
  price_month: number;
}

const MB = 1024 * 1024;
const DAY = 86_400_000;
const PLANS: Plan[] = [
  { key: 'free', name: '免费', rank: 0, member_limit: 200, message_limit: 1000, file_enabled: false, file_quota_bytes: null, file_temp_max_bytes: null, featured_limit: 100, price_month: 0 },
  { key: 'pro', name: 'Pro', rank: 1, member_limit: 500, message_limit: 5000, file_enabled: true, file_quota_bytes: 0, file_temp_max_bytes: 10 * MB, featured_limit: 300, price_month: 80 },
  { key: 'pro_plus', name: 'Pro+', rank: 2, member_limit: 1000, message_limit: 20000, file_enabled: true, file_quota_bytes: 200 * MB, file_temp_max_bytes: 30 * MB, featured_limit: 800, price_month: 200 },
  { key: 'max', name: 'MAX', rank: 3, member_limit: 3000, message_limit: 50000, file_enabled: true, file_quota_bytes: 1024 * MB, file_temp_max_bytes: 100 * MB, featured_limit: 3000, price_month: 500 }
];
const FILE_MAX = 100 * MB;
const GRACE_DAYS = 30;
const FOLDER_LIMIT = 50;
const DONATE_URL = 'https://www.ccw.site/detail/6650a1b2c3d4e5f6a7b8c9d0';

const planOf = (tier: Tier): Plan => PLANS.find((plan) => plan.key === tier) ?? PLANS[0];

/* ───────── 人和会话 ───────── */

export const plusMe = { id: 1, username: 'kuke', nickname: '酷可mc' } as User;
export const plusPeople: User[] = [
  plusMe,
  { id: 2, username: 'aqua', nickname: '阿夸' } as User,
  { id: 3, username: 'mint', nickname: '薄荷糖' } as User,
  { id: 4, username: 'robot', nickname: '任务小助手', is_bot: true } as User,
  { id: 5, username: 'long', nickname: '一个名字特别特别长的群友用来测试截断' } as User
];

interface FileRow {
  id: number;
  name: string;
  size: number;
  content_type: string;
  uploader_id: number;
  created_at: number;
  expires_at: number | null;
  message_id: number | null;
  /** 空间不够时存的 24 小时临时文件，不占空间 */
  temporary?: boolean;
  /** 所在的文件夹（5.5），根目录为 null / 不填 */
  folder_id?: number | null;
}

interface FolderRow {
  id: number;
  name: string;
  created_by: number;
  created_at: number;
  updated_at: number;
}

interface RecordRow {
  id: number;
  source: 'purchase' | 'grant' | 'revoke';
  action: string;
  tier: Tier;
  period: 'month' | 'year' | null;
  days: number;
  amount: number;
  prev_tier: Tier;
  prev_expires_at: number | null;
  new_tier: Tier;
  new_expires_at: number | null;
  forfeited_days: number;
  created_at: number;
}

interface TodoRow {
  message_id: number;
  set_by: number;
  set_at: number;
  snapshot: { type: string; content: string; metadata: Record<string, unknown> | null; sender_id: number; created_at: string };
}

interface FeaturedRow {
  id: number;
  message_id: number | null;
  set_by: number;
  created_at: number;
  message: Message;
  message_exists: boolean;
  recalled: boolean;
  snapshot_missing: boolean;
}

interface GroupState {
  id: number;
  title: string;
  members: number;
  /** 记录的档位和到期时间（可以是已经过期的：和真实服务端不同，这里故意留着过期的，看客户端自己判断） */
  tier: Tier;
  expires: number | null;
  /** 群文件空间曾经按哪一档算（过期降级后进入宽限期用） */
  filesTier: Tier | null;
  filesGraceUntil: number | null;
  ttl: number;
  files: FileRow[];
  /** 群文件夹（Pro+ / MAX，一层） */
  folders: FolderRow[];
  records: RecordRow[];
  todo: TodoRow | null;
  featured: FeaturedRow[];
}

interface PlusState {
  ready: boolean;
  groups: Map<number, GroupState>;
  history: Map<number, Message[]>;
  nextId: number;
  nextFileId: number;
  nextFolderId: number;
  nextRecordId: number;
  nextFeaturedId: number;
  pictures: string[];
}

export const plusState: PlusState = {
  ready: false,
  groups: new Map(),
  history: new Map(),
  nextId: 900_000,
  nextFileId: 100,
  nextFolderId: 20,
  nextRecordId: 10,
  nextFeaturedId: 10,
  pictures: []
};

/** 会话 id：每个档位一个群，外加一个私聊、一个过期的 Pro 群、一个文件宽限期的群 */
export const PLUS_GROUP_IDS = { free: 11, pro: 12, pro_plus: 13, max: 14, expiredPro: 15, grace: 16, direct: 17 } as const;

function iso(time: number): string {
  return new Date(time).toISOString();
}

function effective(group: GroupState, now = Date.now()): Tier {
  return group.tier !== 'free' && group.expires !== null && group.expires > now ? group.tier : 'free';
}

function newMessageId(): number {
  plusState.nextId += 1;
  return plusState.nextId;
}

/* ───────── 假消息 ───────── */

function senderFields(user: User): Pick<Message, 'sender_id' | 'sender'> {
  return { sender_id: user.id, sender: user };
}

function buildHistory(cid: number, pictures: string[]): Message[] {
  const now = Date.now();
  const base = cid * 1000;
  const at = (minutesAgo: number): string => iso(now - minutesAgo * 60_000);
  const [, aqua, mint, bot, long] = plusPeople;
  const list: Message[] = [];
  const add = (offset: number, user: User, minutesAgo: number, type: Message['type'], content: string, metadata?: Message['metadata'], extra?: Partial<Message>): Message => {
    const message = { id: base + offset, conversation_id: cid, ...senderFields(user), type, content, metadata, created_at: at(minutesAgo), ...extra } as Message;
    list.push(message);
    return message;
  };
  add(1, aqua, 2900, 'text', '早，今天下午三点开会，别忘了');
  add(2, mint, 2880, 'text', '收到，我会带上最新的作品链接 https://www.ccw.site/detail/abc123');
  add(3, long, 2700, 'text', '我刚把克隆体的碰撞检测改好了，原来是广播顺序的问题');
  add(4, aqua, 2600, 'image', pictures[0] ?? '');
  add(5, mint, 2590, 'image', pictures[2] ?? '', { sticker: true });
  add(6, plusMe, 1900, 'text', '周六晚上八点开会，请大家准时参加，议题是下个版本的作品征集');
  add(7, aqua, 1500, 'text', '文档整理好了，大家看看', { file: { id: 1, name: '设计稿.zip', size: 3 * MB, content_type: 'application/zip', expires_at: iso(now + 3 * 3_600_000), permanent: false } }, { content: '[文件] 设计稿.zip（3.0 MB）' });
  add(8, mint, 1400, 'text', '好的 开会前我先过一遍');
  add(9, aqua, 1200, 'voice', pictures[3] ?? 'https://example.invalid/voice.webm', { voice: { duration_ms: 6400, content_type: 'audio/webm', size: 20480 } });
  add(10, bot, 1000, 'text', '## 本周任务\n- **完成** 开会纪要\n- 更新作品链接\n\n> 来自任务小助手', { markdown: true });
  add(11, long, 900, 'poll', '投票：周末活动选哪个', {
    poll: { id: 1, title: '周末活动选哪个', options: [{ id: 1, text: '创作接龙', votes: 8 }, { id: 2, text: '联机游戏', votes: 5 }], multiple: false, anonymous: false, closes_at: null, closed: false, closed_at: null, total_voters: 13, my_option_ids: [] }
  });
  add(12, mint, 800, 'red_packet', '[红包] 恭喜发财', { red_packet: { id: 1, kind: 'lucky', greeting: '恭喜发财', count: 5 } });
  add(13, aqua, 700, 'gift', '[礼物] 送给 酷可mc 蛋糕 ×1', { gift: { id: 1, kind: 'gift', gift: { key: 'cake', name: '蛋糕', icon: 'cake', price: 20, tier: 2 }, item: null, count: 1, to_user: { id: 1, display_name: '酷可mc', avatar_url: null }, message: '生日快乐' } });
  add(14, mint, 600, 'text', '这是我推荐的朋友', { share_card: { type: 'user', user_id: 2, name: '阿夸', username: 'aqua', avatar_url: null, bio: '在做一个三百个克隆体也不掉帧的弹幕游戏' } });
  add(15, long, 500, 'text', '同意，就这么定了', { quote: { message_id: base + 6, sender_name: '酷可mc', preview: '周六晚上八点开会，请大家准时参加', type: 'text' } });
  add(16, aqua, 400, 'text', '这条被撤回了', undefined, { recalled_at: at(399) });
  const inner = {
    title: '群聊的聊天记录', count: 2, source_conversation_type: 'group',
    snapshots: [
      { id: 1, sender_id: 2, sender_name: '阿夸', type: 'text', content: '里面这层的第一条', created_at: at(3000) },
      { id: 2, sender_id: 3, sender_name: '薄荷糖', type: 'image', content: pictures[1] ?? '', created_at: at(2990) }
    ]
  };
  add(17, mint, 300, 'forward_bundle', '[聊天记录]', {
    title: '群聊的聊天记录', count: 3, source_conversation_type: 'group', note: '嵌套的合并转发',
    snapshots: [
      { id: 11, sender_id: 2, sender_name: '阿夸', type: 'text', content: '外层第一条：下面还有一层', created_at: at(3100) },
      { id: 12, sender_id: 3, sender_name: '薄荷糖', type: 'forward_bundle', content: '[聊天记录]', metadata: inner, created_at: at(3095) },
      { id: 13, sender_id: 5, sender_name: '长名字', type: 'text', content: '外层最后一条', created_at: at(3090) }
    ]
  });
  add(18, plusMe, 200, 'text', '#开会 请大家看一下群文件里的安排，另外把作品链接发在群里');
  add(19, long, 120, 'text', '好的，我整理一下发给大家 https://www.ccw.site/detail/xyz789');
  add(20, aqua, 60, 'text', '开会时间改到四点了，注意看群待办');
  return list;
}

function snapshotOf(message: Message): TodoRow['snapshot'] {
  return { type: message.type, content: message.content, metadata: (message.metadata as Record<string, unknown> | null | undefined) ?? null, sender_id: message.sender_id ?? 0, created_at: message.created_at };
}

function userBrief(userId: number): { id: number; display_name: string; avatar_url: null; title?: string | null } {
  const user = plusPeople.find((item) => item.id === userId) ?? plusMe;
  return { id: user.id, display_name: user.nickname ?? user.username, avatar_url: null };
}

function todoView(group: GroupState): Record<string, unknown> | null {
  const todo = group.todo;
  if (!todo) {
    return null;
  }
  const messages = plusState.history.get(group.id) ?? [];
  const original = messages.find((message) => message.id === todo.message_id);
  const recalled = Boolean(original?.recalled_at);
  const exists = Boolean(original) && !recalled;
  const text = todo.snapshot.type === 'image' ? '[图片]' : todo.snapshot.content;
  return {
    conversation_id: group.id,
    message_id: todo.message_id,
    message_exists: exists,
    recalled,
    summary: recalled ? '[消息已撤回]' : text.slice(0, 60),
    snapshot: recalled ? null : { type: todo.snapshot.type, content: todo.snapshot.content, metadata: todo.snapshot.metadata, sender: { ...userBrief(todo.snapshot.sender_id), title: '管理员' }, created_at: todo.snapshot.created_at },
    set_by: userBrief(todo.set_by),
    set_at: iso(todo.set_at)
  };
}

function lastMessageOf(cid: number): Message | null {
  const list = plusState.history.get(cid) ?? [];
  return list[list.length - 1] ?? null;
}

function conversationView(group: GroupState): Conversation {
  const last = lastMessageOf(group.id);
  return {
    id: group.id, type: 'group', title: group.title, display_title: group.title, member_count: group.members, unread_count: 0,
    my_role: plusScenario.staff ? 'owner' : 'member', updated_at: iso(Date.now() - group.id * 60_000), last_message: last,
    plus_tier: group.tier, plus_expires_at: group.expires === null ? null : iso(group.expires),
    file_default_ttl_hours: group.ttl, group_todo: todoView(group)
  } as unknown as Conversation;
}

function directView(): Conversation {
  return {
    id: PLUS_GROUP_IDS.direct, type: 'direct', title: '阿夸', display_title: '阿夸', unread_count: 0, direct_user: plusPeople[1],
    updated_at: iso(Date.now() - 8 * 60_000), last_message: lastMessageOf(PLUS_GROUP_IDS.direct), plus_tier: 'free', plus_expires_at: null
  } as unknown as Conversation;
}

export function plusConversations(): Conversation[] {
  return [...plusState.groups.values()].map(conversationView).concat(directView());
}

/* ───────── 初始化 ───────── */

function seedFeatured(group: GroupState, pictures: string[]): void {
  const messages = plusState.history.get(group.id) ?? [];
  const pick = (offset: number): Message | undefined => messages.find((message) => message.id === group.id * 1000 + offset);
  const rows: FeaturedRow[] = [];
  let order = 0;
  const push = (message: Message | undefined, patch: Partial<FeaturedRow> = {}): void => {
    if (!message) {
      return;
    }
    plusState.nextFeaturedId += 1;
    order += 1;
    rows.push({ id: plusState.nextFeaturedId, message_id: message.id, set_by: 2, created_at: Date.now() - order * 3_600_000, message: { ...message, featured: true }, message_exists: true, recalled: false, snapshot_missing: false, ...patch });
  };
  [6, 4, 5, 9, 10, 11, 12, 13, 14, 15, 7, 17].forEach((offset) => push(pick(offset)));
  // 原消息被修剪：快照还在，不能跳转
  push({ id: group.id * 1000 - 5, conversation_id: group.id, ...senderFields(plusPeople[2]), type: 'text', content: '很久以前的一条精华，原消息已经被修剪掉了，但快照里还有完整的文字：每周五晚上有创作接龙，欢迎参加。', created_at: iso(Date.now() - 40 * DAY) } as Message, { message_exists: false });
  // 撤回的精华：内容隐藏
  push({ id: group.id * 1000 - 6, conversation_id: group.id, ...senderFields(plusPeople[1]), type: 'text', content: '', metadata: null, created_at: iso(Date.now() - 20 * DAY), recalled_at: iso(Date.now() - 19 * DAY) } as Message, { message_exists: false, recalled: true });
  // 升级前就已经没了的老精华：只有空壳
  push({ id: group.id * 1000 - 7, conversation_id: group.id, ...senderFields(plusPeople[2]), type: 'text', content: '', created_at: iso(Date.now() - 90 * DAY) } as Message, { message_exists: false, snapshot_missing: true });
  if (group.id === PLUS_GROUP_IDS.max) {
    // 多放几页，看分页和「已用 / 上限」
    for (let index = 0; index < 60; index += 1) {
      push({ id: group.id * 1000 - 100 - index, conversation_id: group.id, ...senderFields(plusPeople[1 + (index % 3)]), type: 'text', content: `第 ${index + 1} 条精华：${'这是用来凑页数的内容，'.repeat(1 + (index % 3))}`, created_at: iso(Date.now() - (50 + index) * DAY / 10) } as Message, { message_exists: index % 4 !== 0 });
    }
  }
  if (pictures.length === 0) {
    // 没有图片时不放需要图片的精华，免得显示破图
    group.featured = rows.filter((row) => row.message.type !== 'image');
    return;
  }
  group.featured = rows;
}

function seedFiles(group: GroupState): void {
  const now = Date.now();
  const files: FileRow[] = [
    { id: 1, name: '设计稿.zip', size: 3 * MB, content_type: 'application/zip', uploader_id: 2, created_at: now - 21 * 3_600_000, expires_at: now + 3 * 3_600_000, message_id: group.id * 1000 + 7 },
    { id: 2, name: '活动方案-最终版-v3-改了又改-真的是最终版.docx', size: 580 * 1024, content_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', uploader_id: 3, created_at: now - 2 * DAY, expires_at: now + 5 * DAY, message_id: null },
    { id: 3, name: '成员名单.xlsx', size: 92 * 1024, content_type: 'application/vnd.ms-excel', uploader_id: 1, created_at: now - 10 * DAY, expires_at: null, message_id: null },
    { id: 4, name: '演示录屏.mp4', size: 48 * MB, content_type: 'video/mp4', uploader_id: 5, created_at: now - 3 * DAY, expires_at: now + 27 * DAY, message_id: null },
    // 已过期：列表默认不返回
    { id: 5, name: '过期的文件.pdf', size: 1 * MB, content_type: 'application/pdf', uploader_id: 2, created_at: now - 5 * DAY, expires_at: now - DAY, message_id: null }
  ];
  group.files = files;
  // 有群空间的档位（Pro+ / MAX，以及从 Pro+ 掉进宽限期的群）摆几个文件夹，放进去几份文件；再加一个临时文件看「不能移进文件夹」
  if ((planOf(group.tier).file_quota_bytes ?? 0) > 0) {
    group.folders = [
      { id: 1, name: '设计稿', created_by: 1, created_at: now - 9 * DAY, updated_at: now - 9 * DAY },
      { id: 2, name: '会议纪要', created_by: 2, created_at: now - 6 * DAY, updated_at: now - 6 * DAY },
      { id: 3, name: '一个名字比较长的文件夹用来看截断效果的', created_by: 1, created_at: now - 2 * DAY, updated_at: now - 2 * DAY }
    ];
    files[0].folder_id = 1;
    files.push(
      { id: 6, name: '首页-深色.fig', size: 12 * MB, content_type: 'application/octet-stream', uploader_id: 1, created_at: now - 4 * DAY, expires_at: null, message_id: null, folder_id: 1 },
      { id: 7, name: '图标规范.pdf', size: 2_400_000, content_type: 'application/pdf', uploader_id: 3, created_at: now - 3 * DAY, expires_at: now + 4 * DAY, message_id: null, folder_id: 1 },
      { id: 8, name: '10 月例会纪要.md', size: 18 * 1024, content_type: 'text/markdown', uploader_id: 2, created_at: now - 6 * DAY, expires_at: null, message_id: null, folder_id: 2 },
      { id: 9, name: '临时-截图打包.zip', size: 6 * MB, content_type: 'application/zip', uploader_id: 5, created_at: now - 2 * 3_600_000, expires_at: now + 22 * 3_600_000, message_id: null, temporary: true }
    );
  } else {
    group.folders = [];
  }
}

function makeGroup(id: number, title: string, tier: Tier, expires: number | null, members: number): GroupState {
  return { id, title, members, tier, expires, filesTier: null, filesGraceUntil: null, ttl: 24, files: [], folders: [], records: [], todo: null, featured: [] };
}

/** 摆好一整套假数据。预览页启动时调一次，pictures 是画好的图片地址（blob: 或 data:）。 */
export function initGroupPlusMock(pictures: string[]): void {
  const now = Date.now();
  plusState.pictures = pictures;
  plusState.groups.clear();
  plusState.history.clear();
  const groups: GroupState[] = [
    makeGroup(PLUS_GROUP_IDS.free, '免费群 · Scratch 创作交流群', 'free', null, 198),
    makeGroup(PLUS_GROUP_IDS.pro, 'Pro 群 · PICO PARK', 'pro', now + 12 * DAY, 312),
    makeGroup(PLUS_GROUP_IDS.pro_plus, 'Pro+ 群 · KukeChat 官方交流群', 'pro_plus', now + 20 * DAY, 640),
    makeGroup(PLUS_GROUP_IDS.max, 'MAX 群 · 灵域 AI', 'max', now + 200 * DAY, 2100),
    // 记录里是 pro、但已经过了到期时间：客户端要自己判断成免费
    makeGroup(PLUS_GROUP_IDS.expiredPro, '过期的 Pro 群', 'pro', now - 2 * DAY, 120),
    makeGroup(PLUS_GROUP_IDS.grace, '文件宽限期的群', 'pro_plus', now - 5 * DAY, 88)
  ];
  for (const group of groups) {
    plusState.groups.set(group.id, group);
    plusState.history.set(group.id, buildHistory(group.id, pictures));
  }
  plusState.history.set(PLUS_GROUP_IDS.direct, buildHistory(PLUS_GROUP_IDS.direct, pictures).slice(0, 8).map((message) => ({ ...message, conversation_id: PLUS_GROUP_IDS.direct })));
  for (const group of groups) {
    seedFeatured(group, pictures);
  }
  const plus = plusState.groups.get(PLUS_GROUP_IDS.pro_plus);
  const max = plusState.groups.get(PLUS_GROUP_IDS.max);
  const grace = plusState.groups.get(PLUS_GROUP_IDS.grace);
  for (const group of [plus, max, grace]) {
    if (group) {
      seedFiles(group);
      group.filesTier = group.tier;
    }
  }
  if (grace) {
    grace.filesGraceUntil = (grace.expires ?? now) + GRACE_DAYS * DAY;
  }
  if (plus) {
    plus.records = [
      { id: 2, source: 'purchase', action: 'upgrade', tier: 'pro_plus', period: 'month', days: 30, amount: 800, prev_tier: 'pro', prev_expires_at: now - 10 * DAY, new_tier: 'pro_plus', new_expires_at: now + 20 * DAY, forfeited_days: 6, created_at: now - 10 * DAY },
      { id: 1, source: 'purchase', action: 'new', tier: 'pro', period: 'month', days: 30, amount: 300, prev_tier: 'free', prev_expires_at: null, new_tier: 'pro', new_expires_at: now - 10 * DAY + 6 * DAY, forfeited_days: 0, created_at: now - 24 * DAY }
    ];
  }
  // 一条群待办：指向精华里也有的那条文字消息
  const proPlusHistory = plusState.history.get(PLUS_GROUP_IDS.pro_plus) ?? [];
  const todoSource = proPlusHistory.find((message) => message.id === PLUS_GROUP_IDS.pro_plus * 1000 + 6);
  if (plus && todoSource) {
    plus.todo = { message_id: todoSource.id, set_by: 1, set_at: now - 20 * 3_600_000, snapshot: snapshotOf(todoSource) };
  }
  plusState.ready = true;
}

/** 重置某个群的档位（预览页的控制条用）。tier 为 free 时清掉到期时间。 */
export function setGroupTier(id: number, tier: Tier | 'expired'): void {
  const group = plusState.groups.get(id);
  if (!group) {
    return;
  }
  const now = Date.now();
  if (tier === 'free') {
    group.tier = 'free';
    group.expires = null;
  } else if (tier === 'expired') {
    group.tier = 'pro';
    group.expires = now - 2 * DAY;
  } else {
    group.tier = tier;
    group.expires = now + (tier === 'max' ? 200 : 12) * DAY;
    if (planOf(tier).file_enabled) {
      group.filesTier = tier;
      if (group.files.length === 0) {
        seedFiles(group);
      }
    }
  }
}

export function setGroupTodoState(id: number, messageId: number | null): Record<string, unknown> | null {
  const group = plusState.groups.get(id);
  if (!group) {
    return null;
  }
  if (messageId === null) {
    group.todo = null;
    return null;
  }
  const original = (plusState.history.get(id) ?? []).find((message) => message.id === messageId);
  if (original) {
    group.todo = { message_id: original.id, set_by: 1, set_at: Date.now(), snapshot: snapshotOf(original) };
  }
  return todoView(group);
}

/** 模拟「别人传了一个文件」：给预览页的实时事件按钮用 */
export function addRemoteFile(id: number): void {
  const group = plusState.groups.get(id);
  if (!group) {
    return;
  }
  plusState.nextFileId += 1;
  const now = Date.now();
  group.files.unshift({ id: plusState.nextFileId, name: `新上传的文件-${plusState.nextFileId}.png`, size: 1_572_864, content_type: 'image/png', uploader_id: 2, created_at: now, expires_at: now + group.ttl * 3_600_000, message_id: null });
}

/** 模拟「别的管理员新建了一个文件夹」：返回新文件夹的 id（预览页的实时事件按钮用） */
export function addRemoteFolder(id: number): number | null {
  const group = plusState.groups.get(id);
  if (!group) {
    return null;
  }
  plusState.nextFolderId += 1;
  const now = Date.now();
  group.folders.push({ id: plusState.nextFolderId, name: `别人建的文件夹 ${plusState.nextFolderId}`, created_by: 2, created_at: now, updated_at: now });
  return plusState.nextFolderId;
}

/** 模拟「别的管理员删了一个文件夹」：删最后一个（或指定的），里面的文件回根目录。返回 { folderId, moved } */
export function removeRemoteFolder(id: number, folderId?: number): { folderId: number; moved: number } | null {
  const group = plusState.groups.get(id);
  const target = folderId ? group?.folders.find((item) => item.id === folderId) : group?.folders[group.folders.length - 1];
  if (!group || !target) {
    return null;
  }
  return { folderId: target.id, moved: dropFolder(group, target.id) };
}

function dropFolder(group: GroupState, folderId: number): number {
  group.folders = group.folders.filter((item) => item.id !== folderId);
  let moved = 0;
  for (const file of group.files) {
    if (file.folder_id === folderId) {
      file.folder_id = null;
      moved += 1;
    }
  }
  return moved;
}

export function todoOf(id: number): Record<string, unknown> | null {
  const group = plusState.groups.get(id);
  return group ? todoView(group) : null;
}

export function groupTierOf(id: number): Tier | 'expired' {
  const group = plusState.groups.get(id);
  if (!group) {
    return 'free';
  }
  if (group.tier !== 'free' && effective(group) === 'free') {
    return 'expired';
  }
  return group.tier;
}

/* ───────── 响应拼装 ───────── */

function balanceObject(): Record<string, unknown> {
  const bound = shopScenario.bound;
  const spent = shopScenario.spent;
  return { bound, donated: bound ? shopScenario.donated : 0, spent, balance: bound ? shopScenario.donated - spent : 0, verified_at: bound ? iso(Date.now() - 60_000) : null, stale: false, group_plus_spent: groupPlusSpent };
}

let groupPlusSpent = 0;

function detail(code: string, message: string, extra: Record<string, unknown> = {}, status = 400): Response {
  return json({ detail: { code, message, ...extra } }, status);
}

function filesQuota(group: GroupState): Record<string, unknown> {
  const now = Date.now();
  const eff = effective(group, now);
  const plan = planOf(eff);
  const live = group.files.filter((file) => file.expires_at === null || file.expires_at > now);
  const used = live.filter((file) => !file.temporary).reduce((sum, file) => sum + file.size, 0);
  let state: 'locked' | 'active' | 'grace' = 'locked';
  let tier: Tier | null = null;
  let quota = 0;
  let graceUntil: string | null = null;
  if (plan.file_enabled) {
    state = 'active';
    tier = eff;
    quota = plan.file_quota_bytes ?? 0;
  } else if (group.filesTier && group.filesGraceUntil !== null && group.filesGraceUntil > now) {
    state = 'grace';
    tier = group.filesTier;
    quota = planOf(group.filesTier).file_quota_bytes ?? 0;
    graceUntil = iso(group.filesGraceUntil);
  }
  const free = Math.max(0, quota - used);
  const tempMax = tier ? planOf(tier).file_temp_max_bytes ?? 0 : 0;
  return {
    state, tier, grace_until: graceUntil, quota_bytes: quota, used_bytes: used, file_count: live.length, default_ttl_hours: group.ttl,
    max_file_bytes: state === 'active' ? Math.max(free, tempMax) : 0, free_bytes: free, temp_max_bytes: tier ? tempMax : null, temp_ttl_hours: 24,
    folders_enabled: state === 'active' && (eff === 'pro_plus' || eff === 'max')
  };
}

/** 文件夹（5.5）：档位够不够（有效档位 Pro+ / MAX） */
function foldersEnabled(group: GroupState): boolean {
  return filesQuota(group).folders_enabled === true;
}

function folderView(group: GroupState, folder: FolderRow): Record<string, unknown> {
  const now = Date.now();
  const inside = group.files.filter((file) => file.folder_id === folder.id && (file.expires_at === null || file.expires_at > now));
  return {
    id: folder.id, conversation_id: group.id, name: folder.name, file_count: inside.length, total_size: inside.reduce((sum, file) => sum + file.size, 0),
    created_by: plusPeople.find((user) => user.id === folder.created_by) ?? null, created_by_id: folder.created_by, created_at: iso(folder.created_at), updated_at: iso(folder.updated_at)
  };
}

/** 控制字符、换行、零宽等不可见格式字符 */
function invisible(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  return code < 0x20 || (code >= 0x7f && code <= 0x9f) || (code >= 0x200b && code <= 0x200f) || (code >= 0x2028 && code <= 0x202e) || (code >= 0x2060 && code <= 0x2064) || code === 0xfeff;
}

/** 和服务端同一套名字规则：去首尾空白 1–40 个字，不能有换行 / 控制 / 不可见字符、/、\；同群不区分大小写不重名 */
function folderNameError(group: GroupState, raw: unknown, selfId: number | null): Response | string {
  const name = typeof raw === 'string' ? raw.trim() : '';
  // 换行、控制字符、零宽等不可见字符
  if (!name || [...name].length > 40 || /[\\/]/.test(name) || [...name].some(invisible)) {
    return detail('invalid_folder_name', '文件夹名字不合法。', {}, 422);
  }
  const key = name.normalize('NFKC').toLowerCase();
  if (group.folders.some((item) => item.id !== selfId && item.name.normalize('NFKC').toLowerCase() === key)) {
    return detail('folder_name_taken', '已经有同名的文件夹了。', {}, 409);
  }
  return name;
}

function plusInfo(group: GroupState): Record<string, unknown> {
  const eff = effective(group);
  const plan = planOf(eff);
  const quota = filesQuota(group);
  return {
    conversation_id: group.id, tier: eff, tier_name: plan.name, expires_at: eff === 'free' ? null : iso(group.expires ?? 0),
    limits: { member_limit: plan.member_limit, message_limit: plan.message_limit, file_enabled: plan.file_enabled, file_quota_bytes: plan.file_quota_bytes, featured_limit: plan.featured_limit },
    usage: { member_count: group.members, featured_count: group.featured.length, file_bytes_used: quota.used_bytes, file_count: quota.file_count },
    files: quota,
    can_purchase: plusScenario.staff
  };
}

function fileView(group: GroupState, file: FileRow): Record<string, unknown> {
  const uploader = plusPeople.find((user) => user.id === file.uploader_id) ?? null;
  const expired = file.expires_at !== null && file.expires_at <= Date.now();
  return {
    id: file.id, conversation_id: group.id, name: file.name, size: file.size, content_type: file.content_type, uploader, uploader_id: file.uploader_id,
    created_at: iso(file.created_at), expires_at: file.expires_at === null ? null : iso(file.expires_at), permanent: file.expires_at === null, temporary: file.temporary === true, expired,
    message_id: file.message_id, download_path: `/api/v1/conversations/${group.id}/files/${file.id}/download`,
    folder_id: file.folder_id ?? null, folder_name: group.folders.find((item) => item.id === file.folder_id)?.name ?? null
  };
}

interface QuoteResult {
  action: 'new' | 'renew' | 'upgrade';
  body: Record<string, unknown>;
  price: number;
  newExpires: number;
  forfeitedDays: number;
  enough: boolean;
  days: number;
}

function quote(group: GroupState, tier: Tier, period: 'month' | 'year'): QuoteResult | Response {
  const now = Date.now();
  const eff = effective(group, now);
  const current = planOf(eff);
  const target = planOf(tier);
  if (target.rank < current.rank) {
    return detail('downgrade_not_allowed', '当前档位还没到期，不能买更低的档位。', { current_tier: eff, current_expires_at: group.expires === null ? null : iso(group.expires) }, 422);
  }
  const days = period === 'year' ? 365 : 30;
  const price = period === 'year' ? target.price_month * 10 : target.price_month;
  let action: 'new' | 'renew' | 'upgrade' = 'new';
  let newExpires = now + days * DAY;
  let forfeitedSeconds = 0;
  if (eff !== 'free' && target.rank === current.rank) {
    action = 'renew';
    newExpires = (group.expires ?? now) + days * DAY;
  } else if (eff !== 'free') {
    action = 'upgrade';
    forfeitedSeconds = Math.max(0, Math.floor(((group.expires ?? now) - now) / 1000));
  }
  const forfeitedDays = Math.floor(forfeitedSeconds / 86_400);
  const balance = shopScenario.bound ? shopScenario.donated - shopScenario.spent : 0;
  const enough = balance >= price;
  const body = {
    conversation_id: group.id, action, tier, period, days, price, current_tier: eff, current_expires_at: eff === 'free' ? null : iso(group.expires ?? 0),
    new_expires_at: iso(newExpires), forfeited_seconds: forfeitedSeconds, forfeited_days: forfeitedDays,
    forfeit_notice: forfeitedSeconds > 0 ? `升级后原来 ${current.name} 剩余的 ${forfeitedDays} 天将作废` : null, balance, enough
  };
  return { action, body, price, newExpires, forfeitedDays, enough, days };
}

function isStaff(): boolean {
  return plusScenario.staff;
}

/* ───────── 搜索 ───────── */

type Category = 'text' | 'media' | 'sticker' | 'file' | 'link';

function categoryOf(message: Message): Category | null {
  if (message.recalled_at || message.type === 'system' || message.type === 'voice' || message.type === 'red_packet' || message.type === 'gift') {
    return null;
  }
  const metadata = (message.metadata ?? {}) as Record<string, unknown>;
  if (message.type === 'image') {
    return metadata.sticker === true ? 'sticker' : 'media';
  }
  if (metadata.file) {
    return 'file';
  }
  return /https?:\/\//.test(message.content) ? 'link' : 'text';
}

function searchableText(message: Message): string {
  const metadata = (message.metadata ?? {}) as Record<string, unknown>;
  const parts = [message.type === 'image' ? '' : message.content];
  const poll = metadata.poll as { title?: string; options?: Array<{ text?: string }> } | undefined;
  if (poll) {
    parts.push(poll.title ?? '', ...(poll.options ?? []).map((option) => option.text ?? ''));
  }
  const snapshots = metadata.snapshots;
  if (Array.isArray(snapshots)) {
    for (const item of snapshots) {
      if (item && typeof item === 'object' && typeof (item as { content?: unknown }).content === 'string') {
        parts.push((item as { content: string }).content);
      }
    }
  }
  return parts.join(' ');
}

/** 北京时间的日期（YYYY-MM-DD）。搜索的日期筛选按 UTC+8 的整天。 */
function chinaDate(time: number): string {
  return new Date(time + 8 * 3_600_000).toISOString().slice(0, 10);
}

function rangesOf(text: string, terms: string[]): Array<[number, number]> {
  const lower = text.toLowerCase();
  const ranges: Array<[number, number]> = [];
  for (const term of terms) {
    let from = 0;
    for (;;) {
      const index = lower.indexOf(term, from);
      if (index < 0) {
        break;
      }
      ranges.push([index, index + term.length]);
      from = index + term.length;
    }
  }
  ranges.sort((left, right) => left[0] - right[0]);
  // 合并相邻 / 重叠的区间，前端高亮就不会切出空片段
  const merged: Array<[number, number]> = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range[0] <= last[1]) {
      last[1] = Math.max(last[1], range[1]);
    } else {
      merged.push([range[0], range[1]]);
    }
  }
  return merged;
}

function conversationBrief(cid: number): Record<string, unknown> {
  const group = plusState.groups.get(cid);
  if (!group) {
    return { id: cid, type: 'direct', title: null, display_title: '阿夸', avatar_url: null, plus_tier: 'free', plus_expires_at: null, direct_user: plusPeople[1] };
  }
  return { id: cid, type: 'group', title: group.title, display_title: group.title, avatar_url: null, plus_tier: effective(group), plus_expires_at: effective(group) === 'free' ? null : iso(group.expires ?? 0), direct_user: null };
}

interface Hit {
  message: Message;
  category: Category;
  text: string;
}

function runSearch(url: URL): { hits: Hit[]; terms: string[] } | Response {
  const q = (url.searchParams.get('q') ?? '').trim().toLowerCase();
  const cid = Number(url.searchParams.get('conversation_id') ?? 0) || null;
  const senderId = Number(url.searchParams.get('sender_id') ?? 0) || null;
  const category = url.searchParams.get('category') ?? 'all';
  const from = url.searchParams.get('date_from');
  const to = url.searchParams.get('date_to');
  if (!q && !cid && !senderId && category === 'all' && !from && !to) {
    return detail('query_required', '请输入关键词，或者选一个筛选条件。', {}, 422);
  }
  if (cid && !plusState.history.has(cid)) {
    return json({ detail: '会话不存在' }, 404);
  }
  const terms = q ? q.split(/\s+/).filter(Boolean) : [];
  const hits: Hit[] = [];
  for (const [id, list] of plusState.history) {
    if (cid && id !== cid) {
      continue;
    }
    for (const message of list) {
      const kind = categoryOf(message);
      if (!kind) {
        continue;
      }
      if (category !== 'all' && category !== kind) {
        continue;
      }
      if (senderId && message.sender_id !== senderId) {
        continue;
      }
      const day = chinaDate(new Date(message.created_at).getTime());
      if (from && day < from.slice(0, 10)) {
        continue;
      }
      if (to && day > to.slice(0, 10)) {
        continue;
      }
      const text = searchableText(message);
      if (terms.length > 0 && !terms.every((term) => text.toLowerCase().includes(term))) {
        continue;
      }
      hits.push({ message, category: kind, text });
    }
  }
  hits.sort((left, right) => right.message.id - left.message.id);
  return { hits, terms };
}

function snippetOf(text: string, terms: string[]): { snippet: string; highlights: Array<[number, number]> } {
  const marks = rangesOf(text, terms);
  if (marks.length === 0) {
    return { snippet: text.slice(0, 72), highlights: [] };
  }
  const start = Math.max(0, marks[0][0] - 36);
  const end = Math.min(text.length, marks[0][0] + 36 + (marks[0][1] - marks[0][0]));
  const prefix = start > 0 ? '…' : '';
  const snippet = `${prefix}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
  const shift = prefix.length - start;
  const highlights = marks.filter((mark) => mark[0] >= start && mark[1] <= end).map((mark) => [mark[0] + shift, mark[1] + shift] as [number, number]);
  return { snippet, highlights };
}

/* ───────── 上传（给假 XMLHttpRequest 用） ───────── */

/** 处理 POST /conversations/{id}/files：返回状态码和 JSON 体。预览页的假 XHR 在分块「上传」完成后调它。 */
export function handleGroupFileUpload(path: string, form: FormData): { status: number; body: unknown } | null {
  const match = path.match(/\/conversations\/(\d+)\/files$/);
  const group = match ? plusState.groups.get(Number(match[1])) : undefined;
  if (!match || !group) {
    return null;
  }
  const file = form.get('file');
  const err = (status: number, code: string, message: string, extra: Record<string, unknown> = {}): { status: number; body: unknown } => ({ status, body: { detail: { code, message, ...extra } } });
  if (!(file instanceof File)) {
    return err(422, 'empty_file', '没有收到文件。');
  }
  const forced = plusScenario.uploadError;
  if (forced === 'server') {
    return { status: 500, body: { detail: 'Internal Server Error' } };
  }
  if (forced === 'muted') {
    return err(403, 'muted', '你正在被禁言，不能上传文件。', { muted_until: iso(Date.now() + 3_600_000) });
  }
  const quota = filesQuota(group);
  if (quota.state === 'locked') {
    return err(403, 'files_locked', '这个群还没有解锁群文件，需要 Pro 档位。');
  }
  if (quota.state === 'grace') {
    return err(403, 'files_locked', '群文件正在宽限期内，只能查看、下载和删除，不能上传。', { state: 'grace', grace_until: quota.grace_until });
  }
  if (file.size === 0) {
    return err(422, 'empty_file', '不能上传空文件。');
  }
  // 放得进剩余空间就是普通文件；放不下但不超过临时上限就存成 24 小时临时文件（docs/group-plus.md 第 5 节）
  const fits = file.size <= (quota.free_bytes as number) && forced !== 'quota_exceeded';
  const temporary = !fits;
  if (forced === 'file_too_large' || (!fits && file.size > (quota.temp_max_bytes as number))) {
    return err(413, 'file_too_large', '文件太大了，不能上传。', { max_file_bytes: quota.max_file_bytes, temp_max_bytes: quota.temp_max_bytes, free_bytes: quota.free_bytes });
  }
  if (forced === 'rate_limited') {
    return err(429, 'rate_limited', '发言太频繁了，文件没有保存，稍后再试。');
  }
  const permanent = !temporary && form.get('permanent') === 'true' && isStaff();
  const announce = form.get('announce') !== 'false';
  // 传进文件夹（5.5）：先查档位和文件夹；变成临时文件的放根目录、不报错
  const folderParam = Number(form.get('folder_id') ?? 0);
  if (folderParam) {
    if (!foldersEnabled(group)) {
      return err(403, 'folders_require_plus', '文件夹需要 Pro+ 或 MAX。', { tier: effective(group) });
    }
    if (!group.folders.some((item) => item.id === folderParam)) {
      return err(404, 'folder_not_found', '文件夹不存在。');
    }
  }
  plusState.nextFileId += 1;
  const now = Date.now();
  const row: FileRow = { id: plusState.nextFileId, name: file.name.slice(0, 120) || 'file', size: file.size, content_type: file.type || 'application/octet-stream', uploader_id: 1, created_at: now, expires_at: permanent ? null : now + (temporary ? 24 : group.ttl) * 3_600_000, message_id: null, temporary, folder_id: folderParam && !temporary ? folderParam : null };
  let message: Message | null = null;
  if (announce) {
    const sizeText = file.size >= MB ? `${(file.size / MB).toFixed(1)} MB` : `${Math.max(1, Math.round(file.size / 1024))} KB`;
    message = {
      id: newMessageId(), conversation_id: group.id, ...senderFields(plusMe), type: 'text', content: `[文件] ${row.name}（${sizeText}）`,
      metadata: { file: { id: row.id, name: row.name, size: row.size, content_type: row.content_type, expires_at: row.expires_at === null ? null : iso(row.expires_at), permanent, temporary } },
      created_at: iso(now)
    } as Message;
    row.message_id = message.id;
    plusState.history.get(group.id)?.push(message);
  }
  group.files.unshift(row);
  return { status: 201, body: { file: fileView(group, row), message } };
}

/* ───────── 假接口 ───────── */

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function parseId(value: string | undefined): number {
  return Number(value ?? 0);
}

export const groupPlusMock: MockHandler = async ({ path, url, method, body }) => {
  if (!plusState.ready) {
    return undefined;
  }
  const isPlusPath = /^\/(group-plus|search)\b/.test(path)
    || /^\/conversations(\/|$)/.test(path);
  if (!isPlusPath) {
    return undefined;
  }
  // 会话列表和消息本身是预览页自己的「后端」，不受 missing 场景影响
  const source = (body ?? {}) as Record<string, unknown>;

  if (path === '/conversations' && method === 'GET') {
    return json(plusConversations());
  }

  const messagesMatch = path.match(/^\/conversations\/(\d+)\/messages$/);
  if (messagesMatch) {
    const cid = parseId(messagesMatch[1]);
    const list = plusState.history.get(cid);
    if (!list) {
      return undefined;
    }
    if (method === 'GET') {
      const beforeId = Number(url.searchParams.get('before_id') ?? 0);
      const limit = Number(url.searchParams.get('limit') ?? 50);
      const pool = beforeId ? list.filter((message) => message.id < beforeId) : list;
      return json(pool.slice(-limit));
    }
    const message = {
      id: newMessageId(), conversation_id: cid, ...senderFields(plusMe), type: (source.type as Message['type']) ?? 'text',
      content: typeof source.content === 'string' ? source.content : '', metadata: source.metadata as Message['metadata'], created_at: new Date().toISOString()
    } as Message;
    list.push(message);
    return json(message);
  }
  const contextMatch = path.match(/^\/conversations\/(\d+)\/messages\/(\d+)\/context$/);
  if (contextMatch) {
    const list = plusState.history.get(parseId(contextMatch[1])) ?? [];
    const position = list.findIndex((message) => message.id === parseId(contextMatch[2]));
    const before = Number(url.searchParams.get('before') ?? 25);
    const after = Number(url.searchParams.get('after') ?? 25);
    return json(position < 0 ? [] : list.slice(Math.max(0, position - before), position + after + 1));
  }
  if (/^\/conversations\/\d+\/messages\/\d+\/reactions$/.test(path)) {
    return json([]);
  }

  // 下面都是新接口：旧后端场景下一律 404
  const modern = /^\/group-plus\//.test(path) || /^\/search\//.test(path) || /^\/conversations\/\d+\/(plus|files|todo|featured-messages|settings)/.test(path) || /^\/conversations\/\d+\/messages\/\d+\/feature$/.test(path);
  if (!modern) {
    return undefined;
  }
  await sleep(plusScenario.delay);
  if (plusScenario.backend === 'missing') {
    return json({ detail: 'Not Found' }, 404);
  }

  if (path === '/group-plus/plans' && method === 'GET') {
    return json({
      enabled: plusScenario.backend === 'ok', year_months_paid: 10, month_days: 30, year_days: 365, file_max_bytes: FILE_MAX, file_ttl_options_hours: [24, 168, 720], file_grace_days: GRACE_DAYS,
      tiers: PLANS.map((plan) => ({ ...plan, price_year: plan.price_month * 10 }))
    });
  }

  // ── 搜索 ──
  if (path === '/search/messages' && method === 'GET') {
    const result = runSearch(url);
    if (result instanceof Response) {
      return result;
    }
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') ?? 20)));
    const beforeId = Number(url.searchParams.get('before_id') ?? 0);
    const offset = beforeId ? 0 : Number(url.searchParams.get('offset') ?? 0);
    const pool = beforeId ? result.hits.filter((hit) => hit.message.id < beforeId) : result.hits;
    const page = pool.slice(offset, offset + limit);
    const items = page.map((hit) => {
      const { snippet, highlights } = snippetOf(hit.text || hit.message.content, result.terms);
      return { message: hit.message, conversation: conversationBrief(hit.message.conversation_id), category: hit.category, snippet, snippet_highlights: highlights, highlights: rangesOf(hit.message.content, result.terms) };
    });
    const hasMore = offset + limit < pool.length;
    return json({ items, total: result.hits.length, total_capped: false, limit, offset, has_more: hasMore, next_before_id: page.length > 0 ? page[page.length - 1].message.id : null });
  }
  if (path === '/search/messages/summary' && method === 'GET') {
    if (!(url.searchParams.get('q') ?? '').trim()) {
      return detail('query_required', '请输入关键词。', {}, 422);
    }
    const result = runSearch(url);
    if (result instanceof Response) {
      return result;
    }
    const byConversation = new Map<number, Hit[]>();
    for (const hit of result.hits) {
      byConversation.set(hit.message.conversation_id, [...(byConversation.get(hit.message.conversation_id) ?? []), hit]);
    }
    const items = [...byConversation.entries()].map(([cid, hits]) => ({ conversation: conversationBrief(cid), count: hits.length, latest_message_id: hits[0].message.id, latest_at: hits[0].message.created_at }))
      .sort((left, right) => right.latest_message_id - left.latest_message_id);
    return json({ total: result.hits.length, items });
  }

  const conv = path.match(/^\/conversations\/(\d+)(\/.*)?$/);
  if (!conv) {
    return undefined;
  }
  const cid = parseId(conv[1]);
  const rest = conv[2] ?? '';
  const group = plusState.groups.get(cid);
  if (!group) {
    return cid === PLUS_GROUP_IDS.direct && rest.startsWith('/plus') ? detail('not_group', '私聊不能升级。', {}, 400) : json({ detail: '会话不存在' }, 404);
  }

  // ── 群设置：只处理文件默认保留时长 ──
  if (rest === '/settings' && method === 'PATCH') {
    if (typeof source.file_default_ttl_hours === 'number') {
      if (!isStaff()) {
        return detail('not_group_staff', '只有群主或管理员可以修改。', {}, 403);
      }
      if (![24, 168, 720].includes(source.file_default_ttl_hours)) {
        return detail('invalid_file_ttl', '保留时长只能是 1 天、7 天或 30 天。', {}, 422);
      }
      group.ttl = source.file_default_ttl_hours;
    }
    return json(conversationView(group));
  }

  // ── 档位 ──
  if (rest === '/plus' && method === 'GET') {
    return json(plusInfo(group));
  }
  if (rest === '/plus/records' && method === 'GET') {
    if (!isStaff()) {
      return detail('not_group_staff', '只有群主或管理员可以查看。', {}, 403);
    }
    const limit = Number(url.searchParams.get('limit') ?? 20);
    const offset = Number(url.searchParams.get('offset') ?? 0);
    const items = group.records.slice(offset, offset + limit).map((record) => ({
      id: record.id, conversation_id: group.id, source: record.source, action: record.action, tier: record.tier, period: record.period, days: record.days, amount: record.amount,
      prev_tier: record.prev_tier, prev_expires_at: record.prev_expires_at === null ? null : iso(record.prev_expires_at), new_tier: record.new_tier,
      new_expires_at: record.new_expires_at === null ? null : iso(record.new_expires_at), forfeited_days: record.forfeited_days, user: plusMe, note: null, created_at: iso(record.created_at)
    }));
    return json({ items, total: group.records.length });
  }
  if ((rest === '/plus/quote' || rest === '/plus/purchase') && method === 'POST') {
    const purchase = rest === '/plus/purchase';
    const tier = source.tier as Tier;
    const period = source.period as 'month' | 'year';
    if (plusScenario.backend === 'disabled' && purchase) {
      return detail('disabled', '群升级暂时关闭购买。', {}, 403);
    }
    if (!isStaff()) {
      return detail('not_group_staff', '只有群主或管理员可以升级。', {}, 403);
    }
    if (tier !== 'pro' && tier !== 'pro_plus' && tier !== 'max') {
      return detail('invalid_tier', '档位不对。', {}, 422);
    }
    if (period !== 'month' && period !== 'year') {
      return detail('invalid_period', '周期不对。', {}, 422);
    }
    const result = quote(group, tier, period);
    if (result instanceof Response) {
      return result;
    }
    if (!purchase) {
      return json(result.body);
    }
    if (plusScenario.purchaseError === 'server') {
      return json({ detail: 'Internal Server Error' }, 500);
    }
    if (result.action === 'upgrade' && result.forfeitedDays > 0 && source.confirm_forfeit !== true) {
      return detail('forfeit_not_confirmed', '升级会作废原档位的剩余时间，请确认。', result.body, 409);
    }
    if (plusScenario.purchaseError === 'price_changed' || (typeof source.expected_price === 'number' && source.expected_price !== result.price)) {
      return detail('price_changed', '价格刚刚变了，请重新确认。', { price: result.price }, 409);
    }
    if (plusScenario.purchaseError === 'plan_changed') {
      return detail('plan_changed', '这个群的档位刚刚发生了变化，请重新报价后再提交。', {}, 409);
    }
    if (plusScenario.purchaseError === 'ccw_not_bound' || !shopScenario.bound) {
      return detail('ccw_not_bound', '还没有绑定 CCW 账号，绑定后才能购买。', {}, 403);
    }
    if (plusScenario.purchaseError === 'verification_unavailable') {
      return detail('verification_unavailable', '现在连不上 CCW，没法核实你的余额，稍后再试。这次没有扣币。', {}, 503);
    }
    const balance = shopScenario.donated - shopScenario.spent;
    if (plusScenario.purchaseError === 'insufficient_balance' || balance < result.price) {
      const shortfall = Math.max(1, result.price - balance);
      return detail('insufficient_balance', `金币不够，还差 ${shortfall} 个。`, { balance, total: result.price, shortfall, donate_url: DONATE_URL }, 402);
    }
    shopScenario.spent += result.price;
    groupPlusSpent += result.price;
    const before = effective(group);
    const prevExpires = group.expires;
    group.tier = tier;
    group.expires = result.newExpires;
    if (planOf(tier).file_enabled) {
      group.filesTier = tier;
      group.filesGraceUntil = null;
      if (group.files.length === 0) {
        seedFiles(group);
      }
    }
    plusState.nextRecordId += 1;
    const record: RecordRow = {
      id: plusState.nextRecordId, source: 'purchase', action: result.action, tier, period, days: result.days, amount: result.price, prev_tier: before,
      prev_expires_at: before === 'free' ? null : prevExpires, new_tier: tier, new_expires_at: result.newExpires, forfeited_days: result.forfeitedDays, created_at: Date.now()
    };
    group.records.unshift(record);
    return json({
      record: {
        id: record.id, conversation_id: group.id, source: 'purchase', action: record.action, tier, period, days: record.days, amount: record.amount, prev_tier: record.prev_tier,
        prev_expires_at: record.prev_expires_at === null ? null : iso(record.prev_expires_at), new_tier: tier, new_expires_at: iso(result.newExpires), forfeited_days: record.forfeited_days, user: plusMe, note: null, created_at: iso(record.created_at)
      },
      conversation: { conversation_id: group.id, plus_tier: tier, plus_expires_at: iso(result.newExpires) },
      plus: plusInfo(group),
      balance: balanceObject()
    });
  }

  // ── 群文件 ──
  if (rest === '/files/usage' && method === 'GET') {
    return json(filesQuota(group));
  }
  if (rest === '/files' && method === 'GET') {
    const quota = filesQuota(group);
    const q = (url.searchParams.get('q') ?? '').toLowerCase();
    const uploader = Number(url.searchParams.get('uploader_id') ?? 0);
    const limit = Number(url.searchParams.get('limit') ?? 30);
    const offset = Number(url.searchParams.get('offset') ?? 0);
    const search = Boolean(q || uploader);
    // 带了 q / uploader_id 是跨文件夹搜索，folder_id 被忽略；否则不带是根目录，带了是这个文件夹
    const folderId = search ? 0 : Number(url.searchParams.get('folder_id') ?? 0);
    const folder = folderId ? group.folders.find((item) => item.id === folderId) : null;
    if (folderId && !folder) {
      return detail('folder_not_found', '文件夹不存在。', {}, 404);
    }
    const now = Date.now();
    // locked 且没有历史文件时返回空；过期的文件默认不返回
    const pool = (quota.state === 'locked' ? [] : group.files)
      .filter((file) => file.expires_at === null || file.expires_at > now)
      .filter((file) => search || (file.folder_id ?? null) === (folder ? folder.id : null))
      .filter((file) => !q || file.name.toLowerCase().includes(q))
      .filter((file) => !uploader || file.uploader_id === uploader);
    const folderExtras = plusScenario.legacyFolders ? {} : {
      folder_id: folder ? folder.id : null, folder: folder ? folderView(group, folder) : null, folders: group.folders.map((item) => folderView(group, item)),
      folder_limit: FOLDER_LIMIT, search, can_manage_folders: isStaff() && quota.folders_enabled === true, can_tidy_folders: isStaff()
    };
    return json({ items: pool.slice(offset, offset + limit).map((file) => fileView(group, file)), total: pool.length, quota, ...folderExtras });
  }

  // ── 群文件夹（5.5） ──
  if (rest === '/files/folders') {
    if (method === 'GET') {
      return json({ items: group.folders.map((item) => folderView(group, item)), limit: FOLDER_LIMIT, can_manage_folders: isStaff() && foldersEnabled(group), can_tidy_folders: isStaff() });
    }
    if (method === 'POST') {
      if (!isStaff()) {
        return detail('not_group_staff', '只有群主或管理员可以新建文件夹。', {}, 403);
      }
      if (!foldersEnabled(group)) {
        return detail('folders_require_plus', '文件夹需要 Pro+ 或 MAX。', { tier: effective(group) }, 403);
      }
      if (group.folders.length >= FOLDER_LIMIT) {
        return detail('folder_limit', '文件夹数量已达上限。', { limit: FOLDER_LIMIT }, 409);
      }
      const name = folderNameError(group, source.name, null);
      if (name instanceof Response) {
        return name;
      }
      plusState.nextFolderId += 1;
      const now = Date.now();
      const folder: FolderRow = { id: plusState.nextFolderId, name, created_by: 1, created_at: now, updated_at: now };
      group.folders.push(folder);
      return json(folderView(group, folder), 201);
    }
  }
  const folderMatch = rest.match(/^\/files\/folders\/(\d+)$/);
  if (folderMatch) {
    const folder = group.folders.find((item) => item.id === parseId(folderMatch[1]));
    if (!isStaff()) {
      return detail('not_group_staff', '只有群主或管理员可以整理文件夹。', {}, 403);
    }
    if (method === 'PATCH' && !foldersEnabled(group)) {
      return detail('folders_require_plus', '文件夹需要 Pro+ 或 MAX。', { tier: effective(group) }, 403);
    }
    if (!folder) {
      return detail('folder_not_found', '文件夹不存在。', {}, 404);
    }
    if (method === 'PATCH') {
      const name = folderNameError(group, source.name, folder.id);
      if (name instanceof Response) {
        return name;
      }
      folder.name = name;
      folder.updated_at = Date.now();
      return json(folderView(group, folder));
    }
    if (method === 'DELETE') {
      return json({ folder_id: folder.id, moved_to_root: dropFolder(group, folder.id) });
    }
  }
  if (rest === '/files/move' && method === 'POST') {
    if (!isStaff()) {
      return detail('not_group_staff', '只有群主或管理员可以移动文件。', {}, 403);
    }
    const ids = Array.isArray(source.file_ids) ? [...new Set(source.file_ids.filter((item): item is number => typeof item === 'number'))] : [];
    if (ids.length === 0 || ids.length > 100) {
      return json({ detail: [{ msg: 'file_ids 要 1–100 个' }] }, 422);
    }
    const target = typeof source.folder_id === 'number' ? source.folder_id : null;
    if (target !== null) {
      if (!foldersEnabled(group)) {
        return detail('folders_require_plus', '文件夹需要 Pro+ 或 MAX。', { tier: effective(group) }, 403);
      }
      if (!group.folders.some((item) => item.id === target)) {
        return detail('folder_not_found', '文件夹不存在。', {}, 404);
      }
    }
    const rows = ids.map((id) => group.files.find((file) => file.id === id));
    const missing = ids.filter((_id, index) => !rows[index]);
    if (missing.length > 0) {
      return detail('file_not_found', '有文件不存在。', { file_ids: missing }, 404);
    }
    const now = Date.now();
    if (target !== null) {
      const temporaryIds = rows.filter((file) => file?.temporary).map((file) => file?.id);
      const expiredIds = rows.filter((file) => file && file.expires_at !== null && file.expires_at <= now).map((file) => file?.id);
      if (temporaryIds.length > 0 || expiredIds.length > 0) {
        return detail('file_not_movable', '临时文件和已过期的文件不能放进文件夹。', { temporary_ids: temporaryIds, expired_ids: expiredIds }, 422);
      }
    }
    for (const file of rows) {
      if (file) {
        file.folder_id = target;
      }
    }
    return json({ folder_id: target, moved: rows.length, items: rows.map((file) => (file ? fileView(group, file) : null)) });
  }
  const fileMatch = rest.match(/^\/files\/(\d+)(\/download)?$/);
  if (fileMatch) {
    const file = group.files.find((item) => item.id === parseId(fileMatch[1]));
    if (!file) {
      return detail('file_not_found', '文件不存在。', {}, 404);
    }
    if (fileMatch[2] && method === 'GET') {
      if (file.expires_at !== null && file.expires_at <= Date.now()) {
        return detail('file_expired', '这个文件已经过期了。', {}, 410);
      }
      return new Response(new Blob([`这是预览页里 ${file.name} 的假内容。\n`], { type: 'application/octet-stream' }), { status: 200, headers: { 'Content-Type': 'application/octet-stream' } });
    }
    if (method === 'DELETE') {
      if (file.uploader_id !== 1 && !isStaff()) {
        return detail('not_group_staff', '只有上传人、群主或管理员可以删除。', {}, 403);
      }
      group.files = group.files.filter((item) => item.id !== file.id);
      return new Response(null, { status: 204 });
    }
    if (method === 'PATCH') {
      if (!isStaff()) {
        return detail('not_group_staff', '只有群主或管理员可以修改。', {}, 403);
      }
      file.expires_at = source.permanent === true ? null : Date.now() + group.ttl * 3_600_000;
      return json(fileView(group, file));
    }
  }

  // ── 群待办 ──
  if (rest === '/todo') {
    if (method === 'GET') {
      return json({ todo: todoView(group) });
    }
    if (!isStaff()) {
      return detail('not_group_staff', '只有群主或管理员可以设置群待办。', {}, 403);
    }
    if (method === 'DELETE') {
      if (!group.todo) {
        return detail('todo_not_found', '本来就没有群待办。', {}, 404);
      }
      group.todo = null;
      return new Response(null, { status: 204 });
    }
    if (method === 'PUT') {
      const original = (plusState.history.get(cid) ?? []).find((message) => message.id === source.message_id);
      if (!original) {
        return json({ detail: '消息不存在' }, 404);
      }
      if (original.recalled_at || original.type === 'system' || original.type === 'red_packet' || original.type === 'gift') {
        return detail('not_todoable', '这种消息不能设为群待办。', {}, 422);
      }
      group.todo = { message_id: original.id, set_by: 1, set_at: Date.now(), snapshot: snapshotOf(original) };
      const view = todoView(group);
      const reminder = {
        id: newMessageId(), conversation_id: cid, ...senderFields(plusMe), type: 'text', content: `[群待办] ${String(view?.summary ?? '')}`,
        metadata: { mention_all: true, group_todo: { message_id: original.id } }, created_at: new Date().toISOString()
      } as Message;
      plusState.history.get(cid)?.push(reminder);
      return json({ todo: view, message: reminder });
    }
  }

  // ── 精华 ──
  if (rest === '/featured-messages' && method === 'GET') {
    const limit = Number(url.searchParams.get('limit') ?? 50);
    const offset = Number(url.searchParams.get('offset') ?? 0);
    const rows = group.featured.slice(offset, offset + limit).map((row) => ({
      id: row.id, conversation_id: cid, message_id: row.message_id, set_by_id: row.set_by, set_by: plusPeople.find((user) => user.id === row.set_by) ?? null,
      created_at: iso(row.created_at), message: row.message, message_exists: row.message_exists, recalled: row.recalled, snapshot_missing: row.snapshot_missing
    }));
    return new Response(JSON.stringify(rows), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'X-Total-Count': String(group.featured.length), 'X-Has-More': String(offset + limit < group.featured.length) }
    });
  }
  const featuredDelete = rest.match(/^\/featured-messages\/(\d+)$/);
  if (featuredDelete && method === 'DELETE') {
    if (!isStaff()) {
      return detail('not_group_staff', '只有群主或管理员可以取消精华。', {}, 403);
    }
    group.featured = group.featured.filter((row) => row.id !== parseId(featuredDelete[1]));
    return json({ featured: false });
  }
  const featureToggle = rest.match(/^\/messages\/(\d+)\/feature$/);
  if (featureToggle && method === 'POST') {
    if (!isStaff()) {
      return detail('not_group_staff', '只有群主或管理员可以设置精华。', {}, 403);
    }
    const messageId = parseId(featureToggle[1]);
    const existing = group.featured.find((row) => row.message_id === messageId);
    if (existing) {
      group.featured = group.featured.filter((row) => row !== existing);
      return json({ featured: false });
    }
    const limit = planOf(effective(group)).featured_limit;
    if (plusScenario.featuredFull || group.featured.length >= limit) {
      return detail('featured_limit', `精华消息已经达到 ${limit} 条的上限。`, { limit, used: plusScenario.featuredFull ? limit : group.featured.length, tier: effective(group) }, 409);
    }
    const original = (plusState.history.get(cid) ?? []).find((message) => message.id === messageId);
    if (!original) {
      return json({ detail: '消息不存在' }, 404);
    }
    plusState.nextFeaturedId += 1;
    group.featured.unshift({ id: plusState.nextFeaturedId, message_id: messageId, set_by: 1, created_at: Date.now(), message: { ...original, featured: true }, message_exists: true, recalled: false, snapshot_missing: false });
    return json({ featured: true });
  }

  return undefined;
};
