/**
 * 桌面联系人页的本地预览页：不连后端，用假数据驱动真实组件。
 *
 *   http://localhost:5180/dev/contacts-harness.html
 *
 * 初始状态可以用地址栏参数给，方便截图：
 *   ?theme=dark            深色
 *   ?preset=sakura         主题预设；再加 &wallpaper=window 是整窗背景
 *   ?data=empty | loading  空数据 / 一直加载
 *   ?controls=0            隐藏左边的控制栏
 *
 * 只用于开发时看界面，不会进入任何构建产物。
 */
import { useState, type CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import '@/styles/tailwind.css';
import { getConversations } from '@/api/conversations';
import { getFriends } from '@/api/friends';
import { ContactsPanel } from '@/components/contacts/ContactsPanel';
import { NavRail } from '@/components/shell/NavRail';
import { useKukeStore } from '@/store/kukeStore';
import { ThemeEffects } from '@/theme/ThemeEffects';
import { BUILTIN_WALLPAPERS, DEFAULT_THEME_SETTINGS, THEME_PRESETS, themeVariables, wallpaperMode, type ThemeSettings } from '@/theme/themes';
import type { Conversation, FriendRequest, Friendship, GroupJoinRequest, TemporaryConversationBlock, UnifiedNotification, User } from '@/types/api';

type DataMode = 'full' | 'empty' | 'loading';

const params = new URLSearchParams(window.location.search);
const me = { id: 1, username: 'kuke', nickname: '酷可mc', email: 'kuke@example.com' } as User;
const person = (id: number, username: string, nickname: string, extra: Partial<User> = {}): User => ({ id, username, nickname, ...extra }) as User;
const people: User[] = [
  person(2, 'aqua', '阿夸', { bio: '今天也在写克隆体', email: 'aqua@example.com' }),
  person(3, 'mint', '薄荷糖', { bio: '碰撞检测爱好者。\n周末在线，工作日随缘回消息。' }),
  person(4, 'long_name_user_for_truncation_test', '一个名字特别特别长的好友用来测试列表和资料页的截断与换行表现', { bio: '这是一段很长很长的个人简介，用来看多行文字在资料卡片里的换行、行高和最大行数限制：Scratch、TurboWarp、Gandi IDE 都在用，偶尔写写扩展，喜欢研究渲染和物理引擎，欢迎一起交流作品和思路，也欢迎来我的主页看看最近做的平台跳跃游戏。', email: 'a.very.long.email.address.for.testing.overflow@subdomain.example-domain.com' }),
  person(5, 'bob', 'Bob', { email: 'bob@example.com' }),
  person(6, 'carol', 'Carol 的小号'),
  person(7, 'xingchen', '星尘', { bio: '画画的' }),
  person(8, 'zero', '零', { bio: '0' }),
  person(9, 'maple', '枫糖浆', { bio: '音乐 / 音效，可约稿' }),
  person(10, 'echo', 'Echo', { bio: 'ECHO echo echo…' }),
  person(11, 'niuniu', '牛牛冲冲冲'),
  person(12, 'wanfeng', '晚风', { bio: '夜猫子' }),
  person(13, 'dmo', '大毛', { email: 'dmo@example.com' }),
  person(14, 'qiqi', '七七', { bio: '测试、找 bug、写文档' })
];
const strangers: User[] = [
  person(21, 'kuku', '酷酷的陌生人', { bio: '想认识会写扩展的朋友' }),
  person(22, 'kumo', 'Kumo', { email: 'kumo@example.com' }),
  person(23, 'kukemc_fan', '酷可的粉丝后援会会长兼首席测试员兼文档翻译', { bio: '名字很长的搜索结果，用来看截断' }),
  person(24, 'kk', 'kk')
];

const hoursAgo = (hours: number): string => new Date(Date.now() - hours * 3600_000).toISOString();
const group = (id: number, title: string, memberCount: number, extra: Partial<Conversation> = {}): Conversation => ({ id, type: 'group', title, display_title: title, member_count: memberCount, unread_count: 0, updated_at: hoursAgo(id), ...extra }) as Conversation;

function seed(mode: DataMode) {
  const empty = mode === 'empty';
  const friends: Friendship[] = empty ? [] : people.map((user, index) => ({ id: 100 + index, user_id: me.id, friend_id: user.id, created_at: hoursAgo(24 * (index * 9 + 3)), user: me, friend: user }));
  const conversations: Conversation[] = empty ? [] : [
    group(31, 'Scratch 创作交流群', 128, { category: '创作交流', description: '聊 Scratch、TurboWarp 和 Gandi 的地方。发作品请带上链接，提问请说清楚环境和复现步骤。', announcement: '欢迎加入！发作品请带上链接 https://www.ccw.site ，禁止刷屏。\n每周五晚上有创作接龙。' }),
    group(32, 'KukeChat 官方交流群', 412, { announcement: '1.3.3 已发布，旧版本请手动下载更新。' }),
    group(33, 'PICO PARK', 227),
    group(34, '跨年之夜 - 灯火阑珊处 · 一个名字特别长的群用来测试群名在列表里的截断和在资料页里的换行', 58, { description: '名字很长的群。' }),
    group(35, '灵域 AI v0.6', 36),
    { id: 40, type: 'direct', title: '阿夸', display_title: '阿夸', direct_user: people[0], unread_count: 0, updated_at: hoursAgo(1) } as Conversation
  ];
  const incoming: FriendRequest[] = empty ? [] : [
    { id: 501, requester_id: 21, receiver_id: me.id, status: 'pending', created_at: hoursAgo(0.2), requester: strangers[0], receiver: me },
    { id: 502, requester_id: 22, receiver_id: me.id, status: 'pending', created_at: hoursAgo(5), requester: strangers[1], receiver: me }
  ];
  const outgoing: FriendRequest[] = empty ? [] : [{ id: 503, requester_id: me.id, receiver_id: 24, status: 'pending', created_at: hoursAgo(30), requester: me, receiver: strangers[3] }];
  const groupIncoming: GroupJoinRequest[] = empty ? [] : [{ id: 601, conversation_id: 31, conversation_title: 'Scratch 创作交流群', requester_id: 23, status: 'pending', message: '想进群交流扩展开发', created_at: hoursAgo(1), updated_at: hoursAgo(1), requester: strangers[2] }];
  const blocks: TemporaryConversationBlock[] = empty ? [] : [
    { id: 701, blocked_user_id: 22, blocked_user: strangers[1], created_at: hoursAgo(72) },
    { id: 702, blocked_user_id: 23, blocked_user: strangers[2], created_at: hoursAgo(24 * 40) }
  ];
  const notice = (id: string, fields: Partial<UnifiedNotification>): UnifiedNotification => ({ id, category: 'system', type: 'generic', title: '', time: hoursAgo(1), unread: false, pending: false, action: 'none', ...fields });
  const notifications: UnifiedNotification[] = empty ? [] : [
    notice('n1', { category: 'friend', type: 'friend_request', title: '酷酷的陌生人 请求添加你为好友', body: '我是在 Scratch 创作交流群里看到你的，想请教一下扩展开发。', time: hoursAgo(0.2), unread: true, pending: true, actor: strangers[0], friend_request_id: 501, action: 'friend_request' }),
    notice('n2', { category: 'group', type: 'group_join_request', title: '酷可的粉丝后援会会长兼首席测试员兼文档翻译 申请加入群聊', body: '附言：想进群交流扩展开发', time: hoursAgo(1), unread: true, pending: true, actor: strangers[2], conversation_id: 31, conversation_title: 'Scratch 创作交流群', group_join_request_id: 601, action: 'group_join_request' }),
    notice('n3', { category: 'friend', type: 'friend_request', title: 'Kumo 请求添加你为好友', time: hoursAgo(5), pending: true, actor: strangers[1], friend_request_id: 502, action: 'friend_request' }),
    notice('n4', { category: 'system', type: 'moderation_penalty', title: '你的一条消息被判定为违规', body: '辱骂骚扰（L2，记 3 分）。处理结果：禁言 3 天。如果你认为判定有误，可以在处罚详情里申诉。', time: hoursAgo(3), unread: true }),
    // 风纪 v2 三期：申诉结果点开是处罚详情，举报人复议的结果点开去设置里的「举报记录」
    notice('n13', { category: 'system', type: 'jury', title: '你的申诉有结果了', body: '资深委员复审后决定减轻处罚：违规记录保留，禁言已解除。', time: hoursAgo(4), unread: true, payload: { kind: 'appeal_result' } }),
    notice('n14', { category: 'system', type: 'jury', title: '你申请的复议有结果了', body: '资深委员复审后维持原结论：暂未发现违规。', time: hoursAgo(6), unread: true, payload: { kind: 'reconsider_result' } }),
    notice('n15', { category: 'system', type: 'jury', title: '你已晋升为正式委员', body: '继续保持。', time: hoursAgo(30), payload: { kind: 'tier_changed' } }),
    notice('n5', { category: 'post', type: 'post_comment', title: '薄荷糖 评论了你的动态', body: '这个碰撞检测的思路太妙了！我照着改了一下，300 个克隆体也不掉帧。不过有个小问题想问：如果角色的造型中心不在正中间，粗筛那一步的包围盒要怎么算？我试了几种都不太对。', time: hoursAgo(8), unread: true, actor: people[1], post_id: 88, action: 'open_post' }),
    notice('n6', { category: 'interact', type: 'post_like', title: '星尘 等 12 人赞了你的动态', time: hoursAgo(20), actor: people[5], post_id: 88, action: 'open_post' }),
    notice('n7', { category: 'group', type: 'group_member_joined', title: '枫糖浆 加入了群聊', time: hoursAgo(26), actor: people[7], conversation_id: 32, conversation_title: 'KukeChat 官方交流群', action: 'open_conversation' }),
    notice('n8', { category: 'interact', type: 'teamup_comment', title: 'Echo 回复了你的组队名片', body: '还缺美术吗？', time: hoursAgo(50), actor: people[8], action: 'open_teamup', payload: { profile_id: 7 } }),
    notice('n9', { category: 'system', type: 'bot_review', title: '你的机器人「任务小助手」已通过审核', time: hoursAgo(72), action: 'open_bot', payload: { bot_id: 3 } }),
    notice('n10', { category: 'group', type: 'group_role_changed', title: '你被设为管理员', body: '群主把你设为了本群的管理员。', time: hoursAgo(24 * 6), conversation_id: 33, conversation_title: 'PICO PARK', action: 'open_conversation' }),
    notice('n11', { category: 'friend', type: 'friend_accepted', title: '七七 通过了你的好友申请', time: hoursAgo(24 * 9), actor: people[12] }),
    notice('n12', { category: 'system', type: 'announcement', title: '系统维护通知', body: '今晚 23:00–23:30 进行例行维护，期间可能无法发送图片。', time: hoursAgo(24 * 14) })
  ];
  return { friends, conversations, incoming, outgoing, groupIncoming, blocks, notifications };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function start(): void {
  let mode: DataMode = params.get('data') === 'empty' ? 'empty' : params.get('data') === 'loading' ? 'loading' : 'full';
  let db = seed(mode);
  const realFetch = window.fetch.bind(window);

  window.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, window.location.origin);
    if (!url.pathname.includes('/api/v1/')) {
      return realFetch(input, init);
    }
    const path = url.pathname.replace(/^.*\/api\/v1/, '');
    const method = (init?.method ?? 'GET').toUpperCase();
    if (mode === 'loading' && method === 'GET') {
      return new Promise<Response>(() => undefined);
    }
    await new Promise((resolve) => window.setTimeout(resolve, 220));
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string, number> : {};
    const settle = (kind: 'friend_request_id' | 'group_join_request_id', id: number): void => {
      db.notifications = db.notifications.filter((item) => item[kind] !== id);
    };

    if (path === '/friends') return json(db.friends);
    if (path === '/conversations') return json(db.conversations);
    if (path === '/notifications') {
      const counts: Record<string, number> = { all: db.notifications.length };
      db.notifications.forEach((item) => { counts[item.category] = (counts[item.category] ?? 0) + 1; });
      return json({ items: db.notifications, unread_count: db.notifications.filter((item) => item.unread).length, pending_count: db.notifications.filter((item) => item.pending).length, counts });
    }
    if (path === '/friends/requests/incoming') return json(db.incoming);
    if (path === '/friends/requests/outgoing') return json(db.outgoing);
    if (path === '/friends/requests' && method === 'POST') {
      const receiver = strangers.find((user) => user.id === body.receiver_id);
      const request: FriendRequest = { id: Date.now(), requester_id: me.id, receiver_id: body.receiver_id, status: 'pending', requester: me, receiver };
      db.outgoing = [...db.outgoing, request];
      return json(request);
    }
    const friendDecision = path.match(/^\/friends\/requests\/(\d+)\/(accept|reject)$/);
    if (friendDecision) {
      const request = db.incoming.find((item) => item.id === Number(friendDecision[1]));
      if (!request) return json({ detail: '申请不存在' }, 404);
      request.status = friendDecision[2] === 'accept' ? 'accepted' : 'rejected';
      if (friendDecision[2] === 'accept' && request.requester) {
        db.friends = [...db.friends, { id: Date.now(), user_id: me.id, friend_id: request.requester_id, created_at: new Date().toISOString(), user: me, friend: request.requester }];
      }
      settle('friend_request_id', request.id);
      return json(request);
    }
    if (path === '/friends/temporary-blocks') return json(db.blocks);
    const unblock = path.match(/^\/friends\/temporary-blocks\/(\d+)$/);
    if (unblock && method === 'DELETE') {
      db.blocks = db.blocks.filter((item) => item.id !== Number(unblock[1]));
      return json({});
    }
    const removeFriend = path.match(/^\/friends\/(\d+)$/);
    if (removeFriend && method === 'DELETE') {
      db.friends = db.friends.filter((item) => item.friend?.id !== Number(removeFriend[1]));
      return json({});
    }
    if (path === '/conversations/join-requests/incoming') return json(db.groupIncoming);
    if (path === '/conversations/join-requests/outgoing') return json([]);
    const groupDecision = path.match(/^\/conversations\/join-requests\/(\d+)\/(accept|reject)$/);
    if (groupDecision) {
      const request = db.groupIncoming.find((item) => item.id === Number(groupDecision[1]));
      if (!request) return json({ detail: '申请不存在' }, 404);
      request.status = groupDecision[2] === 'accept' ? 'accepted' : 'rejected';
      settle('group_join_request_id', request.id);
      return json(request);
    }
    if (path === '/users/search') {
      const keyword = (url.searchParams.get('q') ?? '').toLowerCase();
      if (keyword === 'error') return json({ detail: '搜索服务暂时不可用' }, 500);
      return json([me, ...people, ...strangers].filter((user) => `${user.username} ${user.nickname ?? ''} ${user.email ?? ''}`.toLowerCase().includes(keyword)));
    }
    if (path === '/conversations/direct' && method === 'POST') {
      const peer = [...people, ...strangers].find((user) => user.id === body.user_id);
      return json({ id: 900 + body.user_id, type: 'direct', title: peer?.nickname ?? '私聊', display_title: peer?.nickname, direct_user: peer, unread_count: 0, updated_at: new Date().toISOString() });
    }
    if (path === '/moderation/me') {
      return json({ points: 3, point_window_days: 90, muted_until: null, mute_reason: null, next_threshold: 6, next_penalty: 'mute:72', ban: null, violations: [{ id: 12, category: 'harassment', category_label: '辱骂骚扰', level: 2, points: 3, points_total: 3, source: 'report', target_type: 'message', target_id: 1, conversation_id: 31, summary: '你是不是有病啊，这都不会', status: 'active', penalty_kind: 'mute', penalty_ends_at: null, penalty_permanent: false, under_review: false, appeal_status: 'none', can_appeal: true, created_at: hoursAgo(3), expires_at: hoursAgo(-24 * 89) }] });
    }
    return json([]);
  };

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, staleTime: Infinity } } });
  useKukeStore.setState({ token: 'harness', currentUser: me, activeConversationId: null, workspaceView: 'contacts', layoutMode: 'desktop', themeMode: params.get('theme') === 'dark' ? 'dark' : 'light' });

  function Harness(): JSX.Element {
    const [theme, setTheme] = useState<'light' | 'dark'>(params.get('theme') === 'dark' ? 'dark' : 'light');
    const [presetId, setPresetId] = useState(params.get('preset') ?? 'classic');
    const [windowWallpaper, setWindowWallpaper] = useState(params.get('wallpaper') === 'window');
    const [fontScale, setFontScale] = useState(Number(params.get('font')) || 1);
    const [dataMode, setDataMode] = useState<DataMode>(mode);
    const [globalSearch, setGlobalSearch] = useState<string | null>(null);
    const friendsQuery = useQuery({ queryKey: ['friends'], queryFn: getFriends });
    const conversationsQuery = useQuery({ queryKey: ['conversations'], queryFn: getConversations });
    // 页面里「发消息」「打开动态」之类的动作会改这几个全局状态，预览页没有别的工作区，就把它们显示出来
    const workspaceView = useKukeStore((state) => state.workspaceView);
    const activeConversationId = useKukeStore((state) => state.activeConversationId);

    const preset = THEME_PRESETS.find((item) => item.id === presetId) ?? THEME_PRESETS[0];
    // 主题不走全局 store：几个预览页同源，写进去会互相影响
    const settings: ThemeSettings = { ...DEFAULT_THEME_SETTINGS, presetId: preset.id, wallpaper: windowWallpaper ? preset.wallpaper ?? BUILTIN_WALLPAPERS[0].id : 'none', wallpaperScope: 'window', wallpaperDim: 35 };
    const rootStyle = { ...themeVariables(settings, theme, null), '--kc-font-multiplier': String(fontScale), display: 'flex', height: '100%', minHeight: 0, background: 'var(--kc-window)', color: 'var(--kc-text)' } as CSSProperties;
    const controlStyle: CSSProperties = { padding: '7px 10px', border: '1px solid var(--kc-border-strong)', borderRadius: 7, textAlign: 'left', fontSize: 13 };

    function switchData(next: DataMode): void {
      mode = next;
      db = seed(next);
      setDataMode(next);
      void queryClient.resetQueries();
    }

    // 移动端走的是旧代码，这里只用来确认拆分之后它还照常工作
    if (params.get('mobile') === '1') {
      return (
        <main data-theme={theme} data-layout="mobile" data-font-scale={1} style={{ width: 390, height: '100%', margin: '0 auto', overflow: 'hidden', background: 'var(--kc-mobile-bg)', color: 'var(--kc-mobile-text)' }}>
          <ContactsPanel friends={friendsQuery.data ?? []} conversations={conversationsQuery.data ?? []} isLoading={friendsQuery.isLoading} currentUser={me} isMobile onOpenGlobalSearch={(keyword = '') => setGlobalSearch(keyword)} onOpenConversation={(conversationId) => useKukeStore.setState({ activeConversationId: conversationId })} />
        </main>
      );
    }

    return (
      <main data-theme={theme} data-layout="desktop" data-font-scale={fontScale} data-kc-wallpaper={wallpaperMode(settings, theme, null)} style={rootStyle}>
        {params.get('controls') === '0' ? null : (
          <aside data-harness="controls" style={{ display: 'flex', width: 168, flex: 'none', flexDirection: 'column', gap: 8, padding: 12, borderRight: '1px solid var(--kc-border)', background: 'var(--kc-list)', fontSize: 13 }}>
            <strong>预览控制</strong>
            <button type="button" data-harness="theme" style={controlStyle} onClick={() => {
              const next = theme === 'light' ? 'dark' : 'light';
              setTheme(next);
              useKukeStore.setState({ themeMode: next });
            }}>切换深浅色</button>
            <button type="button" data-harness="preset" style={controlStyle} onClick={() => setPresetId(THEME_PRESETS[(THEME_PRESETS.indexOf(preset) + 1) % THEME_PRESETS.length].id)}>主题：{preset.name}</button>
            <button type="button" data-harness="wallpaper" style={controlStyle} onClick={() => setWindowWallpaper((value) => !value)}>整窗背景：{windowWallpaper ? '开' : '关'}</button>
            <button type="button" data-harness="font" style={controlStyle} onClick={() => setFontScale((value) => (value === 1 ? 1.15 : 1))}>字号：{fontScale}</button>
            <button type="button" data-harness="data-full" style={controlStyle} onClick={() => switchData('full')}>数据：完整{dataMode === 'full' ? ' ✓' : ''}</button>
            <button type="button" data-harness="data-empty" style={controlStyle} onClick={() => switchData('empty')}>数据：空{dataMode === 'empty' ? ' ✓' : ''}</button>
            <button type="button" data-harness="data-loading" style={controlStyle} onClick={() => switchData('loading')}>数据：加载中{dataMode === 'loading' ? ' ✓' : ''}</button>
            <p data-harness="state" style={{ color: 'var(--kc-muted)', fontSize: 12, lineHeight: 1.6 }}>工作区：{workspaceView}<br />当前会话：{activeConversationId ?? '无'}<br />全局搜索：{globalSearch === null ? '未打开' : `「${globalSearch}」`}<br />搜索「error」看搜索失败</p>
            {workspaceView !== 'contacts' ? <button type="button" data-harness="back" style={controlStyle} onClick={() => useKukeStore.setState({ workspaceView: 'contacts', activeConversationId: null })}>回到联系人</button> : null}
          </aside>
        )}
        <ThemeEffects scheme={theme} settings={settings} />
        <div style={{ display: 'grid', width: 56, flex: 'none' }}>
          <NavRail view="contacts" unreadCount={5} hasUnseenAnnouncement={false} onNavigate={() => undefined} onCreateGroup={() => undefined} onOpenAnnouncement={() => undefined} onOpenSettings={() => undefined} />
        </div>
        <div data-kc-surface="page" style={{ minWidth: 0, flex: 1, background: 'var(--kc-chat)' }}>
          <ContactsPanel friends={friendsQuery.data ?? []} conversations={conversationsQuery.data ?? []} isLoading={friendsQuery.isLoading} currentUser={me} isMobile={false} onOpenGlobalSearch={(keyword = '') => setGlobalSearch(keyword)} />
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

start();
