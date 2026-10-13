/**
 * 任务预览页（tasks-harness）的假后端：内存里放一份任务数据，接口的增删改都落在这份数据上，
 * 所以勾选、改负责人、拖看板、发评论之后界面会像连着真后端一样刷新。
 */
import type { Conversation, ConversationMember, Message, Task, TaskActivity, TaskComment, TaskGroup, User } from '@/types/api';

export const me = { id: 1, username: 'kuke', nickname: '酷可mc' } as User;
export const people: User[] = [
  me,
  { id: 2, username: 'aqua', nickname: '阿夸' } as User,
  { id: 3, username: 'mint', nickname: '薄荷糖' } as User,
  { id: 4, username: 'task_assistant', nickname: '任务小助手', is_bot: true } as User,
  { id: 5, username: 'long', nickname: '一个名字特别特别长的群友用来测试截断' } as User,
  { id: 6, username: 'yuzu', nickname: '柚子' } as User
];
const [, aqua, mint, assistant, longName, yuzu] = people;

const HOUR = 3600_000;
const DAY = 24 * HOUR;
const now = Date.now();
const iso = (offset: number): string => new Date(now + offset).toISOString();
/** 某一天的整点（本地时间），用来造「今天 18:00」「明天」这类截止时间。hour 为 0 就是只有日期。 */
function dayAt(dayOffset: number, hour = 0, minute = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + dayOffset);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

export const conversations = [
  { id: 1, type: 'group', title: 'Scratch 创作交流群', display_title: 'Scratch 创作交流群', member_count: 128, unread_count: 0, updated_at: iso(-60_000), my_role: 'owner', tasks_enabled: true },
  { id: 2, type: 'direct', title: '阿夸', display_title: '阿夸', unread_count: 0, direct_user: aqua, updated_at: iso(-9 * 60_000) },
  { id: 3, type: 'group', title: 'KukeChat 官方交流群（公告、反馈、内测都在这里）', display_title: 'KukeChat 官方交流群（公告、反馈、内测都在这里）', member_count: 412, unread_count: 3, updated_at: iso(-2 * HOUR), tasks_enabled: true },
  { id: 5, type: 'direct', title: '薄荷糖', display_title: '薄荷糖', unread_count: 0, direct_user: mint, updated_at: iso(-5 * HOUR) }
] as Conversation[];

export const members = people.map((user, index) => ({ id: index + 1, conversation_id: 1, user_id: user.id, role: index === 0 ? 'owner' : index === 1 ? 'admin' : 'member', user, joined_at: iso(-30 * DAY) }) as ConversationMember);

interface Scenario {
  /** 'empty'：一条任务都没有；'slow'：每个任务接口都拖 60 秒，用来看加载中 */
  data: 'normal' | 'empty' | 'slow';
  /** 关掉后会话列表里没有开启任务功能的群，任务中心不该出现「新建任务」 */
  canCreate: boolean;
}
export const scenario: Scenario = { data: 'normal', canCreate: true };

let nextId = 100;
const groups: TaskGroup[] = [
  { id: 1, name: '1.4 版本' },
  { id: 2, name: '一个名字很长很长的分组用来看标题怎么截断' }
];

function task(id: number, title: string, patch: Partial<Task> = {}): Task {
  return {
    id, conversation_id: 1, conversation_title: conversations[0].title, creator_id: me.id, creator: me, group_id: null, parent_id: null, title, description: '',
    status: 'pending', priority: 'normal', start_at: null, due_at: null, remind_at: null, assignees: [me], watchers: [], subtask_total: 0, subtask_done: 0,
    created_at: iso(-3 * DAY - id * HOUR), updated_at: iso(-id * HOUR), is_creator: true, is_assignee: true, can_edit: true, ...patch
  };
}

let tasks: Task[] = [
  task(12, '重写桌面端任务中心的界面', { priority: 'urgent', due_at: dayAt(1, 18), remind_at: new Date(new Date(dayAt(1, 18)).getTime() - HOUR).toISOString(), assignees: [me, aqua, mint], watchers: [yuzu], subtask_total: 3, subtask_done: 1, status: 'in_progress', description: '按 kui 的规范重写：\n1. 左侧范围导航\n2. 列表 / 看板 / 仪表盘\n3. 详情停在右侧\n\n旧界面的功能一个都不能少。' }),
  task(13, '梳理旧页面上能做的每件事', { parent_id: 12, status: 'completed', completed_at: iso(-DAY) }),
  task(14, '列表、看板、仪表盘三种视图', { parent_id: 12, assignees: [aqua], is_assignee: false }),
  task(15, '深色与主题预设下逐页截图自查', { parent_id: 12, due_at: dayAt(2) }),
  task(16, '修复克隆体碰撞检测在 300 个以上时掉帧的问题，顺便把广播顺序相关的几处竞态一起查一遍（这是一条特别长的标题，用来看截断和换行）', { priority: 'high', due_at: dayAt(-2, 20), assignees: [me, longName], start_at: dayAt(-5) }),
  task(17, '周五创作接龙：定主题、发公告', { due_at: dayAt(0, 20), assignees: [me, mint, yuzu, aqua, longName], group_id: 1, subtask_total: 2, subtask_done: 2 }),
  task(18, '确定接龙主题', { parent_id: 17, status: 'completed' }),
  task(19, '写公告', { parent_id: 17, status: 'completed' }),
  task(20, '整理新人常见问题', { priority: 'low', group_id: 1, assignees: [me], creator_id: aqua.id, creator: aqua, is_creator: false }),
  task(21, '1.4 发版前回归：登录、收发消息、撤回、图片', { priority: 'high', group_id: 1, due_at: dayAt(5), start_at: dayAt(1), assignees: [me, aqua], conversation_id: 3, conversation_title: conversations[2].title }),
  task(22, '给群任务加个置顶入口', { group_id: 2, due_at: dayAt(12, 10), creator_id: longName.id, creator: longName, is_creator: false, can_edit: false, assignees: [me], watchers: [aqua, mint], description: '别人建的任务，我只是负责人，没有编辑权限——详情里应该是只读的。' }),
  task(23, '更新扩展商店的截图', { status: 'completed', completed_at: iso(-2 * DAY), due_at: dayAt(-3), priority: 'low' }),
  task(24, '回复 #128 的反馈', { status: 'completed', completed_at: iso(-5 * HOUR), group_id: 1 }),
  task(25, '（只关注）看一下深海主题的对比度', { assignees: [mint], watchers: [me], is_assignee: false, is_watcher: true, creator_id: mint.id, creator: mint, is_creator: false, can_edit: false, due_at: dayAt(3) }),
  task(26, '备份上周的群公告', { status: 'cancelled' })
];

let comments: TaskComment[] = [
  { id: 1, task_id: 12, author: aqua, content: '看板那一列我来', created_at: iso(-20 * HOUR) },
  { id: 2, task_id: 12, author: longName, content: '提个醒：详情里的日期选择器在对话框里别被裁掉。\n另外超长的评论要能正常换行换行换行换行换行换行换行换行换行换行换行换行换行 https://www.ccw.site/detail/0123456789abcdef0123456789abcdef', created_at: iso(-3 * HOUR) }
];

let activities: TaskActivity[] = [
  { id: 1, task_id: 12, task_title: '重写桌面端任务中心的界面', actor: me, type: 'created', created_at: iso(-3 * DAY) },
  { id: 2, task_id: 12, task_title: '重写桌面端任务中心的界面', actor: me, type: 'assignee_added', created_at: iso(-3 * DAY + 60_000) },
  { id: 3, task_id: 12, task_title: '重写桌面端任务中心的界面', actor: aqua, type: 'subtask_completed', created_at: iso(-DAY) },
  { id: 4, task_id: 16, task_title: '修复克隆体碰撞检测在 300 个以上时掉帧的问题，顺便把广播顺序相关的几处竞态一起查一遍', actor: longName, type: 'due_changed', payload: { due_at: dayAt(-2, 20) }, created_at: iso(-26 * HOUR) },
  { id: 5, task_id: 24, task_title: '回复 #128 的反馈', actor: me, type: 'completed', created_at: iso(-5 * HOUR) },
  { id: 6, task_id: 17, task_title: '周五创作接龙：定主题、发公告', actor: mint, type: 'updated', created_at: iso(-2 * HOUR) },
  { id: 7, task_id: 21, task_title: '1.4 发版前回归：登录、收发消息、撤回、图片', actor: assistant, type: 'status_changed', created_at: iso(-40 * 60_000) }
];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function usersOf(ids: unknown): User[] {
  return Array.isArray(ids) ? people.filter((user) => ids.includes(user.id)) : [];
}

function log(taskId: number, type: string, payload?: Record<string, unknown>): void {
  const target = tasks.find((item) => item.id === taskId);
  nextId += 1;
  activities = [...activities, { id: nextId, task_id: taskId, task_title: target?.title, actor: me, type, payload, created_at: new Date().toISOString() }];
}

/** 父任务上的子任务计数是服务端算的，这里每次改完重算一遍。 */
function recount(): void {
  tasks = tasks.map((item) => {
    const children = tasks.filter((child) => child.parent_id === item.id);
    return { ...item, subtask_total: children.length, subtask_done: children.filter((child) => child.status === 'completed').length };
  });
}

function patchTask(id: number, patch: Partial<Task>): Task | undefined {
  tasks = tasks.map((item) => (item.id === id ? { ...item, ...patch, updated_at: new Date().toISOString() } : item));
  recount();
  return tasks.find((item) => item.id === id);
}

/** 认得的任务接口返回响应；不认得返回 undefined，交给预览页的通用规则。 */
export async function tasksMock({ path, url, method, body }: { path: string; url: URL; method: string; body: unknown }): Promise<Response | undefined> {
  const data = (body ?? {}) as Record<string, unknown>;
  if (path === '/conversations') {
    return json(scenario.canCreate ? conversations : conversations.map((item) => ({ ...item, tasks_enabled: false })));
  }
  if (/^\/conversations\/\d+\/members$/.test(path)) {
    return json(members);
  }
  if (path === '/friends') {
    return json([aqua, mint, longName, yuzu].map((friend, index) => ({ id: index + 1, user: me, friend })));
  }
  if (!path.startsWith('/tasks')) {
    return undefined;
  }
  if (scenario.data === 'slow') {
    await new Promise((resolve) => window.setTimeout(resolve, 60_000));
  }
  const pool = scenario.data === 'empty' ? [] : tasks;

  if (path === '/tasks' && method === 'GET') {
    const scope = url.searchParams.get('scope') ?? 'assigned';
    const conversationId = Number(url.searchParams.get('conversation_id') ?? 0);
    const includeCompleted = url.searchParams.get('include_completed') === 'true';
    return json(pool.filter((item) => {
      if (conversationId && item.conversation_id !== conversationId) return false;
      if (!includeCompleted && (item.status === 'completed' || item.status === 'cancelled')) return false;
      if (scope === 'assigned') return item.assignees.some((user) => user.id === me.id);
      if (scope === 'watching') return item.watchers.some((user) => user.id === me.id);
      if (scope === 'created') return item.creator_id === me.id;
      return true;
    }));
  }
  if (path === '/tasks' && method === 'POST') {
    nextId += 1;
    const created = task(nextId, String(data.title ?? ''), {
      conversation_id: Number(data.conversation_id), conversation_title: conversations.find((item) => item.id === Number(data.conversation_id))?.title ?? null,
      description: typeof data.description === 'string' ? data.description : '', group_id: typeof data.group_id === 'number' ? data.group_id : null, parent_id: typeof data.parent_id === 'number' ? data.parent_id : null,
      priority: (data.priority as Task['priority']) ?? 'normal', due_at: (data.due_at as string | null) ?? null, remind_at: (data.remind_at as string | null) ?? null,
      assignees: usersOf(data.assignee_ids), watchers: usersOf(data.watcher_ids), created_at: new Date().toISOString(), updated_at: new Date().toISOString()
    });
    tasks = [...tasks, created];
    recount();
    log(created.id, 'created');
    return json(created);
  }
  if (path === '/tasks/dashboard') {
    const top = pool.filter((item) => !item.parent_id);
    const open = top.filter((item) => item.status !== 'completed' && item.status !== 'cancelled');
    const dueIn = (item: Task): number => (item.due_at ? new Date(item.due_at).getTime() - Date.now() : Number.NaN);
    return json({
      total: top.length, pending: top.filter((item) => item.status === 'pending').length, in_progress: top.filter((item) => item.status === 'in_progress').length, completed: top.filter((item) => item.status === 'completed').length,
      overdue: open.filter((item) => dueIn(item) < 0).length, due_today: open.filter((item) => dueIn(item) >= 0 && dueIn(item) < DAY).length, due_soon: open.filter((item) => dueIn(item) >= DAY && dueIn(item) < 3 * DAY).length
    });
  }
  if (path === '/tasks/activities') {
    return json(scenario.data === 'empty' ? [] : [...activities].sort((a, b) => b.created_at.localeCompare(a.created_at)));
  }
  if (path === '/tasks/groups' && method === 'GET') {
    return json(groups);
  }
  if (path === '/tasks/groups' && method === 'POST') {
    nextId += 1;
    const group = { id: nextId, name: String(data.name ?? '') };
    groups.push(group);
    return json(group);
  }
  const groupMatch = path.match(/^\/tasks\/groups\/(\d+)$/);
  if (groupMatch) {
    const index = groups.findIndex((item) => item.id === Number(groupMatch[1]));
    if (method === 'DELETE') {
      groups.splice(index, 1);
      tasks = tasks.map((item) => (item.group_id === Number(groupMatch[1]) ? { ...item, group_id: null } : item));
      return json({});
    }
    groups[index] = { ...groups[index], name: String(data.name ?? groups[index].name) };
    return json(groups[index]);
  }

  const match = path.match(/^\/tasks\/(\d+)(?:\/(\w+))?$/);
  if (!match) {
    return undefined;
  }
  const id = Number(match[1]);
  const current = pool.find((item) => item.id === id);
  if (!current) {
    return json({ detail: '任务不存在或已删除' }, 404);
  }
  switch (match[2]) {
    case undefined:
      if (method === 'DELETE') {
        tasks = tasks.filter((item) => item.id !== id && item.parent_id !== id);
        recount();
        return json({});
      }
      if (method === 'PUT') {
        if (data.title === '报错') {
          return json({ detail: '标题里有不能用的词（这是预览页故意返回的错误）' }, 400);
        }
        const patch: Partial<Task> = {};
        if (typeof data.title === 'string') patch.title = data.title;
        if (typeof data.description === 'string') patch.description = data.description;
        if (typeof data.priority === 'string') patch.priority = data.priority as Task['priority'];
        if (Array.isArray(data.assignee_ids)) patch.assignees = usersOf(data.assignee_ids);
        if (Array.isArray(data.watcher_ids)) patch.watchers = usersOf(data.watcher_ids);
        if (typeof data.due_at === 'string') patch.due_at = data.due_at;
        if (typeof data.remind_at === 'string') patch.remind_at = data.remind_at;
        if (data.clear_due_at) patch.due_at = null;
        if (data.clear_remind_at) patch.remind_at = null;
        if (patch.assignees) log(id, 'assignee_added');
        if ('due_at' in patch) log(id, 'due_changed', { due_at: patch.due_at });
        return json(patchTask(id, patch));
      }
      return json(current);
    case 'complete': {
      const completed = Boolean(data.completed);
      log(id, current.parent_id ? (completed ? 'subtask_completed' : 'subtask_reopened') : completed ? 'completed' : 'reopened');
      return json(patchTask(id, { status: completed ? 'completed' : 'pending', completed_at: completed ? new Date().toISOString() : null }));
    }
    case 'group':
      patchTask(id, { group_id: typeof data.group_id === 'number' ? data.group_id : null });
      return json({});
    case 'activities':
      return json(activities.filter((item) => item.task_id === id || tasks.some((child) => child.id === item.task_id && child.parent_id === id)));
    case 'comments':
      if (method === 'POST') {
        nextId += 1;
        const comment = { id: nextId, task_id: id, author: me, content: String(data.content ?? ''), created_at: new Date().toISOString() };
        comments = [...comments, comment];
        return json(comment);
      }
      return json(comments.filter((item) => item.task_id === id));
    default:
      return undefined;
  }
}

/** 聊天预览里的消息：两侧各有一张任务卡片和一条小助手通知，夹在普通气泡中间。 */
export function chatMessages(): Message[] {
  const base = (id: number, sender: User, minutesAgo: number): Pick<Message, 'id' | 'conversation_id' | 'sender_id' | 'sender' | 'created_at'> => ({ id, conversation_id: 1, sender_id: sender.id, sender, created_at: iso(-minutesAgo * 60_000) });
  const text = (id: number, sender: User, minutesAgo: number, content: string): Message => ({ ...base(id, sender, minutesAgo), type: 'text', content }) as Message;
  const card = (id: number, sender: User, minutesAgo: number, source: Task): Message => ({
    ...base(id, sender, minutesAgo), type: 'text', content: `[任务] ${source.title}`,
    metadata: { share_card: { type: 'task', task_id: source.id, conversation_id: 1, title: source.title, status: source.status, priority: source.priority, due_at: source.due_at, assignees: source.assignees.map((user) => ({ id: user.id, name: user.nickname ?? '', avatar_url: null })) } }
  }) as Message;
  const event = (id: number, minutesAgo: number, type: string, source: Task, actor: User): Message => ({
    ...base(id, assistant, minutesAgo), type: 'text', content: `[任务通知] ${source.title}`,
    metadata: { task_event: { type, task_id: source.id, conversation_id: 1, title: source.title, due_at: source.due_at, actor_name: actor.nickname } }
  }) as Message;
  const find = (id: number): Task => tasks.find((item) => item.id === id) as Task;
  return [
    text(9001, aqua, 58, '周五的接龙谁来牵头？'),
    card(9002, aqua, 55, find(17)),
    text(9003, me, 50, '我来，顺便把任务中心的重写也挂上来'),
    card(9004, me, 49, find(12)),
    event(9005, 40, 'assigned', find(12), me),
    card(9006, longName, 30, find(16)),
    event(9007, 20, 'due_soon', find(17), mint),
    text(9008, mint, 12, '收到，已经在看了'),
    card(9009, me, 8, find(23)),
    event(9010, 3, 'due_changed', find(21), aqua),
    // 任务已经被删掉的卡片：详情拉不到，只能用消息里固化的那份
    { ...card(9011, mint, 1, find(20)), metadata: { share_card: { type: 'task', task_id: 9999, title: '一条已经被删除的任务（卡片只剩消息里固化的数据）', status: 'pending', priority: 'low', assignees: [] } } } as Message
  ];
}
