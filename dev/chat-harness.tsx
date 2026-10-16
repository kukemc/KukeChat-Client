/**
 * 桌面聊天面板的本地预览页：不连后端，用假数据驱动真实组件。
 *
 *   npm run dev:desktop   →   http://localhost:1420/dev/chat-harness.html
 *
 * 只用于开发时看界面和滚动表现，不会进入任何构建产物。
 */
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import '@/styles/tailwind.css';
import { featureMocks } from './mocks';
import { attachPokeMock, receivePoke } from './mocks/poke';
import { redPacketState } from './mocks/redPackets';
import { getConversations } from '@/api/conversations';
import { DesktopChatPanel } from '@/components/chat/desktop/DesktopChatPanel';
import { ConversationPane } from '@/components/shell/ConversationPane';
import { NavRail } from '@/components/shell/NavRail';
import { AppearanceSection } from '@/components/settings/desktop/PreferenceSections';
import { PenaltyCenter } from '@/components/moderation/PenaltyCenter';
import { useModerationStore } from '@/store/moderationStore';
import { ThemeEffects } from '@/theme/ThemeEffects';
import { useThemeStore } from '@/theme/themeStore';
import { useThemeRootProps } from '@/theme/useTheme';
import { upsertMessageIntoFirstPage, type MessagesInfiniteData } from '@/realtime/cache';
import { useKukeStore } from '@/store/kukeStore';
import type { Conversation, ConversationMember, Message, User } from '@/types/api';

const me ={ id: 1, username: 'kuke', nickname: '酷可mc' } as User;
const people: User[] = [
  me,
  { id: 2, username: 'aqua', nickname: '阿夸', bio: '在做一个三百个克隆体也不掉帧的弹幕游戏，有空一起测' } as User,
  { id: 3, username: 'mint', nickname: '薄荷糖' } as User,
  { id: 4, username: 'robot', nickname: '任务小助手', is_bot: true } as User,
  { id: 5, username: 'long', nickname: '一个名字特别特别长的群友用来测试截断' } as User
];
const members = people.map((user, index) => ({ id: index + 1, conversation_id: 1, user_id: user.id, role: index === 0 ? 'owner' : index === 1 ? 'admin' : 'member', user, joined_at: `2026-01-0${index + 1}T00:00:00Z`, activity_score: 1280 - index * 173 }) as ConversationMember);
const now = Date.now();
const preview = (id: number, content: string, sender = people[1]): Message => ({ id, conversation_id: 0, sender_id: sender.id, sender, type: 'text', content, created_at: new Date(now).toISOString() }) as Message;
const conversations = [
  { id: 1, type: 'group', title: 'Scratch 创作交流群', display_title: 'Scratch 创作交流群', member_count: 128, unread_count: 6, my_pinned: true, updated_at: new Date(now - 60_000).toISOString(), last_message: preview(1899, '周五晚上的接龙谁来开头'), announcement: '欢迎加入！发作品请带上链接 https://www.ccw.site ，禁止刷屏。\n每周五晚上有创作接龙。', my_role: 'owner', tasks_enabled: true, level_titles_enabled: true, level_titles: [{ min_level: 1, title: '萌新' }, { min_level: 11, title: '活跃' }, { min_level: 21, title: '熟面孔' }, { min_level: 31, title: '骨干' }, { min_level: 46, title: '元老' }, { min_level: 61, title: '传说' }, { min_level: 81, title: '殿堂' }] },
  { id: 2, type: 'direct', title: '阿夸', display_title: '阿夸', unread_count: 0, direct_user: people[1], updated_at: new Date(now - 9 * 60_000).toISOString(), last_message: preview(40, '好，晚点发你') },
  { id: 3, type: 'group', title: 'PICO PARK', display_title: 'PICO PARK', member_count: 227, unread_count: 300, my_last_read_message_id: 1299, my_do_not_disturb: true, all_muted: true, message_rate_limit_per_minute: 5, updated_at: new Date(now - 30 * 60_000).toISOString(), last_message: preview(1, '喵喵喵喵喵喵喵喵喵喵喵喵喵喵喵喵', people[2]) },
  { id: 4, type: 'group', title: 'KukeChat 官方交流群', display_title: 'KukeChat 官方交流群', member_count: 412, unread_count: 3, pending_join_request_count: 2, announcement: '【1.3.3 更新说明】桌面端自动更新重写了，1.3.1 / 1.3.2 的包收不到自动更新，请到 https://www.ccw.site/detail/kukechat-download-page-with-a-very-long-path 手动下载。\n\n反馈问题请带上版本号和截图。\nAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\n禁止刷屏、禁止广告，违规会被机器审核直接处罚。\n每周五晚上有创作接龙，欢迎参加。', updated_at: new Date(now - 2 * 3600_000).toISOString(), last_message: preview(2, '@酷可mc 这个版本什么时候发', people[4]) },
  { id: 5, type: 'direct', title: '薄荷糖', display_title: '薄荷糖', unread_count: 2, direct_user: people[2], updated_at: new Date(now - 5 * 3600_000).toISOString(), last_message: preview(3, '🙏🙏🙏', people[2]) },
  { id: 6, type: 'group', title: '灵域 AI v0.6', display_title: '灵域 AI v0.6', member_count: 36, unread_count: 0, updated_at: new Date(now - 26 * 3600_000).toISOString(), last_message: preview(4, '因 key 调动，导致机器人崩溃，正在修', people[3]) },
  { id: 7, type: 'group', title: '跨年之夜 - 灯火阑珊处', display_title: '跨年之夜 - 灯火阑珊处', member_count: 58, unread_count: 0, my_message_setting: 'ignore', updated_at: new Date(now - 50 * 3600_000).toISOString(), last_message: { ...preview(5, 'Maxkore 退出了群聊'), type: 'system' } },
  // 头部的两种特殊形态：临时会话（加好友 / 关闭 / 屏蔽那一组按钮）、和机器人的私聊
  { id: 8, type: 'direct', title: people[4].nickname, display_title: people[4].nickname, unread_count: 0, is_temporary: true, direct_user: people[4], updated_at: new Date(now - 60 * 3600_000).toISOString(), last_message: preview(6, '在吗，想问个积木的问题', people[4]) },
  { id: 9, type: 'direct', title: '任务小助手', display_title: '任务小助手', unread_count: 0, is_friend: true, direct_user: people[3], updated_at: new Date(now - 70 * 3600_000).toISOString(), last_message: preview(7, '你有 2 个任务今天到期', people[3]) }
] as Conversation[];

function picture(width: number, height: number, hue: number): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (context) {
    const gradient = context.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, `hsl(${hue} 80% 68%)`);
    gradient.addColorStop(1, `hsl(${(hue + 70) % 360} 78% 52%)`);
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
    context.fillStyle = 'rgba(255,255,255,.85)';
    context.font = '600 28px sans-serif';
    context.fillText(`${width}×${height}`, 20, 44);
  }
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob ? URL.createObjectURL(blob) : ''), 'image/png'));
}

const lines = [
  '早', '有人在吗', '我刚把克隆体的碰撞检测改好了，原来是广播顺序的问题', '哈哈哈哈哈', '+1',
  '这个可以，等会发个链接', '说一下思路：先把所有角色的坐标存进列表，每帧只更新移动过的那几个，然后用「碰到颜色」做粗筛，命中了再做精确判断。这样 300 个克隆体也不会掉帧。',
  '好耶', '？', '已经修了', '周五晚上的接龙谁来开头', '我来吧', '收到', 'https://www.ccw.site/detail/abc 看看这个',
  '多行消息\n第二行\n第三行，稍微长一点点用来看换行的表现'
];

async function buildHistory(conversationId: number, count: number): Promise<Message[]> {
  const pictures = await Promise.all([picture(640, 360, 200), picture(360, 640, 320), picture(480, 480, 40), picture(900, 300, 130)]);
  const start = Date.now() - count * 95_000;
  const messages: Message[] = [];
  let senderIndex = 1;
  for (let index = 0; index < count; index += 1) {
    if (index % 3 !== 1) {
      senderIndex = (senderIndex + 1 + (index % 4)) % people.length;
    }
    const sender = people[senderIndex];
    // 每隔一段拉开一次时间差，触发时间分隔
    const createdAt = new Date(start + index * 95_000 - (index % 40 < 20 ? 0 : 30 * 60_000)).toISOString();
    const base = { id: 1000 + index, conversation_id: conversationId, sender_id: sender.id, sender, created_at: createdAt, sender_level: ((sender.id * 7) % 30) + 1, sender_title: sender.id === 3 ? '碰撞大师' : null };
    if (index % 37 === 5) {
      messages.push({ ...base, type: 'system', content: `${sender.nickname} 加入了群聊` } as Message);
    } else if (index % 11 === 7) {
      messages.push({ ...base, type: 'image', content: pictures[index % pictures.length] } as Message);
    } else if (index % 29 === 3) {
      messages.push({ ...base, type: 'text', content: '带两张图的消息', metadata: { images: [pictures[0], pictures[2]] } } as Message);
    } else if (index % 23 === 9) {
      messages.push({ ...base, type: 'text', content: '这条被撤回了', recalled_at: createdAt } as Message);
    } else {
      const quoted = index % 13 === 4 ? messages[messages.length - 3] : undefined;
      messages.push({
        ...base,
        type: 'text',
        content: lines[(index * 7) % lines.length],
        metadata: quoted ? { quote: { message_id: quoted.id, sender_name: quoted.sender?.nickname ?? '', preview: quoted.content.slice(0, 60), type: quoted.type } } : undefined,
        reactions: index % 17 === 2 ? [{ emoji: '😂', count: 3, reacted_by_me: true }, { emoji: '👍', count: 1, reacted_by_me: false }] : undefined,
        featured: index % 53 === 10,
        bookmarked_by_me: index % 47 === 6
      } as Message);
    }
  }
  return messages;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

async function start(): Promise<void> {
  // 3 号群（PICO PARK）模拟大量未读：600 条历史，最后 300 条没读（last_read_message_id = 1299），
  // 进去落在最底部、第一条未读不在已加载范围里，右上角应出现「↑ 300 条新消息」；末尾放一个没领的红包，看两个提示上下排开
  const history: Record<number, Message[]> = { 1: await buildHistory(1, 900), 2: await buildHistory(2, 40), 3: await buildHistory(3, 600) };
  history[3][590] = { ...redPacketState.seed({ senderId: 2, conversationId: 3, kind: 'lucky', amount: 88, count: 5, greeting: '未读测试红包', messageId: 1590 }), created_at: history[3][590].created_at };
  let nextId = 5000;
  // 戳一戳：给群友补上各自的设置，并在历史末尾放几条记录
  attachPokeMock(history, people, () => (nextId += 1));
  let mutedUntil: string | null = null;
  // 风纪页有自己的预览页：dev/jury-harness.html
  const juryActive = false;
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, window.location.origin);
    if (!url.pathname.includes('/api/v1/')) {
      return realFetch(input, init);
    }
    const path = url.pathname.replace(/^.*\/api\/v1/, '');
    await new Promise((resolve) => window.setTimeout(resolve, 180));
    // 各功能自己的假接口（dev/mocks/），先于下面的通用规则
    const method = (init?.method ?? 'GET').toUpperCase();
    let body: unknown;
    try {
      body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    } catch {
      body = undefined;
    }
    for (const mock of featureMocks) {
      const mocked = await mock({ path, url, method, body });
      if (mocked) {
        return mocked;
      }
    }
    const listMatch = path.match(/^\/conversations\/(\d+)\/messages$/);
    if (listMatch && (init?.method ?? 'GET') === 'GET') {
      const all = history[Number(listMatch[1])] ?? [];
      const beforeId = Number(url.searchParams.get('before_id') ?? 0);
      const limit = Number(url.searchParams.get('limit') ?? 50);
      const pool = beforeId ? all.filter((message) => message.id < beforeId) : all;
      return json(pool.slice(-limit));
    }
    if (listMatch) {
      const body = JSON.parse(String(init?.body ?? '{}')) as { content?: string; type?: Message['type']; metadata?: Message['metadata'] };
      nextId += 1;
      const message = { id: nextId, conversation_id: Number(listMatch[1]), sender_id: me.id, sender: me, type: body.type ?? 'text', content: body.content ?? '', metadata: body.metadata, created_at: new Date().toISOString() } as Message;
      history[message.conversation_id].push(message);
      return json(message);
    }
    const contextMatch = path.match(/^\/conversations\/(\d+)\/messages\/(\d+)\/context$/);
    if (contextMatch) {
      const all = history[Number(contextMatch[1])] ?? [];
      const position = all.findIndex((message) => message.id === Number(contextMatch[2]));
      const before = Number(url.searchParams.get('before') ?? 25);
      const after = Number(url.searchParams.get('after') ?? 25);
      return json(position < 0 ? [] : all.slice(Math.max(0, position - before), position + after + 1));
    }
    if (/\/members\/\d+$/.test(path)) {
      return json(members.find((member) => path.endsWith(`/${member.user_id}`)) ?? members[0]);
    }
    if (path === '/conversations') {
      return json(conversations);
    }
    if (/^\/bots\/conversations\/\d+\/bots$/.test(path)) {
      const bot = (id: number, name: string, commands: string) => ({ id, bot_id: id, conversation_id: 1, enabled: true, receive_messages: true, receive_member_events: false, created_at: '', updated_at: '', bot: { id, user_id: 100 + id, owner_id: 1, name, description: `${name}，本群的小帮手`, commands, is_public: true, status: 'active', created_at: '', updated_at: '', online: true } });
      return json([
        bot(1, '任务小助手', '/help 帮助菜单总列表\n/task 新建一个任务\n/todo 查看我的待办\n/done 把任务标记为完成'),
        bot(2, 'Scratch 百科', '/wiki 查询积木用法\n/search 搜索社区作品\n/random 随机推荐一个作品\n/rank 本周热门作品榜')
      ]);
    }
    if (/\/checkin\/(status|me)$|\/checkin-status$/.test(path)) {
      return json({ conversation_id: 1, checked_in_today: false, total_checkins: 23, current_streak: 4, best_streak: 9, level: 8, level_exp: 812, next_level_exp: 64 });
    }
    // 审核相关接口的假数据：禁言状态、举报选项、风纪委员
    if (path === '/moderation/me') {
      return json({
        points: 9, point_window_days: 90, muted_until: mutedUntil, mute_reason: mutedUntil ? '辱骂骚扰（L2，90 天内累计 9 分）' : null, next_threshold: 12, next_penalty: 'ban:168', ban: null,
        violations: [
          { id: 12, category: 'harassment', category_label: '辱骂骚扰', level: 2, points: 3, points_total: 9, source: 'report', target_type: 'message', target_id: 1, conversation_id: 1, summary: '你是不是有病啊，这都不会', status: 'active', penalty_kind: 'mute', penalty_ends_at: mutedUntil, penalty_permanent: false, under_review: false, appeal_status: 'none', can_appeal: true, created_at: new Date(Date.now() - 3600_000).toISOString(), expires_at: new Date(Date.now() + 89 * 86400_000).toISOString() },
          { id: 9, category: 'spam', category_label: '垃圾广告', level: 1, points: 1, points_total: 6, source: 'auto', target_type: 'post', target_id: 3, summary: '加群领福利 xxxx', status: 'revoked', penalty_kind: 'notice', appeal_status: 'accepted', can_appeal: false, created_at: new Date(Date.now() - 20 * 86400_000).toISOString() }
        ]
      });
    }
    if (/^\/moderation\/violations\/\d+\/appeal$/.test(path)) {
      return json({ id: 12, category: 'harassment', category_label: '辱骂骚扰', level: 2, points: 3, points_total: 9, source: 'report', target_type: 'message', summary: '你是不是有病啊，这都不会', status: 'active', penalty_kind: 'mute', penalty_ends_at: mutedUntil, appeal_status: 'pending', can_appeal: false, created_at: new Date(Date.now() - 3600_000).toISOString() });
    }
    if (path === '/reports/options') {
      return json({ reasons: [...['垃圾广告', '辱骂骚扰', '色情低俗', '违法违规', '诈骗或钓鱼', '未成年人不宜'].map((reason) => ({ reason, details_required: false })), { reason: '其他', details_required: true }], details_min_length: 10, max_evidence_messages: 10, max_attachments: 6 });
    }
    if (path === '/reports/quota') {
      return json({ score: 0, daily_quota: 10, used_today: 3, remaining_today: 7 });
    }
    if (path === '/reports' && init?.method === 'POST') {
      return json({ detail: { code: 'already_reported', message: '你已经举报过这个目标了，请等待处理结果' } }, 409);
    }
    if (path === '/jury/me') {
      return json(juryActive
        ? { status: 'active', eligible: true, requirements: [], term_ends_at: new Date(Date.now() + 20 * 86400_000).toISOString(), review_note: null, stats: { votes_total: 42, votes_settled: 36, votes_agreed: 31, agreement_rate: 0.861, golden_total: 5, golden_correct: 5 }, daily_limit: 30, voted_today: 4 }
        : { status: 'none', eligible: false, requirements: [{ key: 'account_age', ok: true, text: '注册满 30 天', detail: '已注册 86 天' }, { key: 'ccw_bound', ok: true, text: '已绑定 CCW 账号', detail: '已绑定' }, { key: 'clean_record', ok: true, text: '近 90 天没有违规记录', detail: '无违规' }, { key: 'activity', ok: false, text: '近 30 天发言不少于 30 条', detail: '已发言 12 条' }], term_ends_at: null, review_note: null, stats: null, daily_limit: 30, voted_today: 0 });
    }
    if (path === '/jury/cases/next') {
      return json({ case: { case_id: 42, kind: 'message', reasons: [{ reason: '辱骂骚扰', count: 2 }], report_count: 2, post: null, messages: [
        { speaker: '成员A', is_target: false, type: 'text', content: '这个积木怎么拼啊', images: [], created_at: new Date(Date.now() - 600_000).toISOString() },
        { speaker: '成员B', is_target: false, type: 'text', content: null, images: [], created_at: new Date(Date.now() - 560_000).toISOString() },
        { speaker: '被举报人', is_target: true, type: 'text', content: '这都不会？回去重读小学吧', images: [], created_at: new Date(Date.now() - 500_000).toISOString() },
        { speaker: '成员A', is_target: false, type: 'text', content: '好好说话行不行', images: [], created_at: new Date(Date.now() - 450_000).toISOString() }
      ] } });
    }
    if (/^\/jury\/cases\/\d+\/vote$/.test(path)) {
      return json({ case_id: 42, settled: false });
    }
    if (path === '/jury/history') {
      return json([{ case_id: 40, kind: 'message', vote: 'l2', voted_at: new Date(Date.now() - 86400_000).toISOString(), agreed: true, outcome: 'violation' }, { case_id: 39, kind: 'post', vote: 'none', voted_at: new Date(Date.now() - 2 * 86400_000).toISOString(), agreed: null, outcome: null }]);
    }
    if (/\/reactions/.test(path)) {
      return json([{ emoji: '😂', count: 1, reacted_by_me: true }]);
    }
    return json([]);
  };

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, staleTime: Infinity } } });
  queryClient.setQueryData(['conversations'], conversations);
  useKukeStore.setState({ token: 'harness', currentUser: me, activeConversationId: Number(new URLSearchParams(window.location.search).get('c')) || 1, layoutMode: 'desktop', themeMode: 'light' });
  // 给自动化脚本用：直接改主题状态，不用一下下点设置界面
  Object.assign(window, { __harness: { store: useKukeStore, themeStore: useThemeStore } });

  function receive(count: number): void {
    for (let index = 0; index < count; index += 1) {
      nextId += 1;
      const sender = people[1 + (nextId % 4)];
      const message = { id: nextId, conversation_id: 1, sender_id: sender.id, sender, type: 'text', content: lines[nextId % lines.length], created_at: new Date().toISOString() } as Message;
      history[1].push(message);
      queryClient.setQueryData<MessagesInfiniteData | undefined>(['messages', 1], (current) => upsertMessageIntoFirstPage(current, message));
    }
  }

  function Harness(): JSX.Element {
    const [theme, setTheme] = useState<'light' | 'dark'>('light');
    const [view, setView] = useState<'chat' | 'appearance' | 'penalties'>('chat');
    const themeRoot = useThemeRootProps(theme);
    const activeConversationId = useKukeStore((state) => state.activeConversationId);
    const liveConversations = useQuery({ queryKey: ['conversations'], queryFn: getConversations, enabled: false }).data ?? conversations;
    const controlClass = 'rounded-lg border px-3 py-2 text-left [border-color:var(--kc-border-strong)] hover:[background:var(--kc-hover)]';
    return (
      <main data-theme={theme} data-layout="desktop" data-font-scale={1} data-kc-wallpaper={themeRoot['data-kc-wallpaper']} style={themeRoot.style} className="flex h-full min-h-0 [background:var(--kc-window)] [color:var(--kc-text)]">
        <ThemeEffects scheme={theme} />
        <aside data-harness="controls" className="flex w-[168px] shrink-0 flex-col gap-2 border-r p-3 text-sm [background:var(--kc-list)] [border-color:var(--kc-border)]">
          <strong>预览控制</strong>
          <button type="button" data-harness="receive-1" className={controlClass} onClick={() => receive(1)}>收到 1 条新消息</button>
          <button type="button" data-harness="receive-8" className={controlClass} onClick={() => receive(8)}>收到 8 条新消息</button>
          <button type="button" data-harness="jump" className={controlClass} onClick={() => useKukeStore.setState({ pendingJumpMessage: { conversationId: 1, messageId: 1100 } })}>跳到一条很早的消息</button>
          <button type="button" data-harness="theme" className={controlClass} onClick={() => {
            const next = theme === 'light' ? 'dark' : 'light';
            setTheme(next);
            useKukeStore.setState({ themeMode: next });
          }}>切换深浅色</button>
          <button type="button" data-harness="view" className={controlClass} onClick={() => setView((value) => (value === 'chat' ? 'appearance' : 'chat'))}>{view === 'chat' ? '打开外观设置' : '回到聊天'}</button>
          <button type="button" data-harness="poke" className={controlClass} onClick={() => receivePoke(queryClient)}>被戳一下</button>
          <button type="button" data-harness="mute" className={controlClass} onClick={() => {
            mutedUntil = mutedUntil ? null : new Date(Date.now() + 3 * 86400_000).toISOString();
            useModerationStore.getState().setMute(mutedUntil, mutedUntil ? '辱骂骚扰（L2，90 天内累计 9 分）' : null);
            void queryClient.invalidateQueries({ queryKey: ['moderation'] });
          }}>切换禁言状态</button>
          <button type="button" data-harness="penalties" className={controlClass} onClick={() => setView('penalties')}>处罚与申诉</button>
        </aside>
        <NavRail view="chat" unreadCount={liveConversations.reduce((sum, item) => sum + (item.my_do_not_disturb ? 0 : item.unread_count ?? 0), 0)} hasUnseenAnnouncement onNavigate={() => undefined} onCreateGroup={() => undefined} onOpenAnnouncement={() => undefined} onOpenSettings={() => setView('appearance')} />
        <div style={{ display: 'grid', width: 268, flex: 'none' }}><ConversationPane conversations={liveConversations} isLoading={false} currentUser={me} onCreateGroup={() => undefined} onOpenGlobalSearch={() => undefined} /></div>
        {/* data-kc-surface="page" 相当于主界面里包着每个页面的 .kc-pc-view：聊天以外的页面在整窗背景 + 毛玻璃下整块垫模糊的背景 */}
        <div className="min-w-0 flex-1" data-kc-surface="page">
          {view === 'chat'
            ? <DesktopChatPanel conversations={liveConversations} currentUser={me} currentRole="owner" members={activeConversationId === 1 ? members : members.slice(0, 2)} />
            : <div className="scroll-soft h-full overflow-y-auto px-5 py-6 [background:var(--kc-chat)]"><div className="mx-auto max-w-[760px]">{view === 'appearance' ? <AppearanceSection /> : <PenaltyCenter />}</div></div>}
        </div>
      </main>
    );
  }

  createRoot(document.getElementById('root') as HTMLElement).render(
    <QueryClientProvider client={queryClient}>
      <Harness />
    </QueryClientProvider>
  );
}

void start();
