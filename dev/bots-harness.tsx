/**
 * 桌面端机器人中心的本地预览页：不连后端，用假数据驱动真实组件。
 *
 *   http://127.0.0.1:5180/dev/bots-harness.html
 *
 * 初始状态可以用地址参数指定，方便截图：
 *   ?theme=dark            深色
 *   ?preset=sakura         主题预设（见 src/theme/themes.ts）
 *   ?wallpaper=window      预设自带的背景铺满整窗（chat = 只铺聊天区，对这一页没有效果）
 *   ?scene=empty|loading|error   接口返回空列表 / 一直不返回 / 报错
 *   ?guest=1               当前用户不是任何机器人的创建者，也没有可管理的群
 *   ?layout=mobile         看移动端那一份（确认没被改坏）；再加 &bot=1 看移动端的详情页
 *
 * 只用于开发时看界面，不会进入任何构建产物。
 */
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@/styles/tailwind.css';
import { BotCenterPanel } from '@/components/bots/BotCenterPanel';
import { BotDetailPanel } from '@/components/bots/BotDetailPanel';
import { NavRail } from '@/components/shell/NavRail';
import { useKukeStore } from '@/store/kukeStore';
import { DEFAULT_THEME_SETTINGS, THEME_PRESETS, getThemePreset } from '@/theme/themes';
import { ThemeEffects } from '@/theme/ThemeEffects';
import { useThemeRootProps } from '@/theme/useTheme';
import type { Bot, BotDashboard, BotReview, BotReviewReply, Conversation, User } from '@/types/api';

const params = new URLSearchParams(window.location.search);
const scene = params.get('scene') ?? 'normal';
const guest = params.get('guest') === '1';
const mobileBotId = Number(params.get('bot') ?? 0);

const me = { id: 1, username: 'kuke', nickname: '酷可mc' } as User;
const people: User[] = [
  me,
  { id: 2, username: 'aqua', nickname: '阿夸' } as User,
  { id: 3, username: 'mint', nickname: '薄荷糖' } as User,
  { id: 5, username: 'long', nickname: '一个名字特别特别长的群友用来测试截断到底会发生什么' } as User,
  { id: 6, username: 'studio', nickname: '灵域工作室' } as User
];

const conversations = [
  { id: 1, type: 'group', title: 'Scratch 创作交流群', display_title: 'Scratch 创作交流群', member_count: 128, my_role: 'owner' },
  { id: 2, type: 'direct', title: '阿夸', display_title: '阿夸', direct_user: people[1] },
  { id: 3, type: 'group', title: 'PICO PARK', display_title: 'PICO PARK', member_count: 227, my_role: 'member' },
  { id: 4, type: 'group', title: 'KukeChat 官方交流群', display_title: 'KukeChat 官方交流群', member_count: 412, my_role: 'admin' },
  { id: 5, type: 'direct', title: '薄荷糖', display_title: '薄荷糖', direct_user: people[2] },
  { id: 6, type: 'group', title: '一个群名特别特别长的群聊用来看看选择列表里截断得对不对 · 第二分群', display_title: '一个群名特别特别长的群聊用来看看选择列表里截断得对不对 · 第二分群', member_count: 36, my_role: 'owner' }
].map((item) => (guest && item.type === 'group' ? { ...item, my_role: 'member' } : item)) as Conversation[];

const day = 86400_000;
const iso = (offsetDays: number): string => new Date(Date.now() - offsetDays * day).toISOString();

function makeBot(id: number, name: string, patch: Partial<Bot> = {}): Bot {
  const owner = patch.owner ?? people[1 + (id % (people.length - 1))];
  return {
    id,
    user_id: 100 + id,
    owner_id: owner.id,
    owner,
    name,
    description: `${name}，本群的小帮手`,
    functions: null,
    commands: null,
    is_public: true,
    status: 'active',
    created_at: iso(120 + id),
    updated_at: iso(id % 40),
    online: id % 3 !== 0,
    rating_average: id % 5 === 0 ? null : 3.2 + ((id * 7) % 18) / 10,
    review_count: id % 5 === 0 ? 0 : (id * 13) % 240,
    install_count: (id * 37) % 1500,
    ...patch
  } as Bot;
}

const featured: Bot[] = [
  makeBot(1, '任务小助手', {
    owner: guest ? people[4] : me,
    description: '帮群里管理待办和任务：新建、指派、催办，到期自动提醒。\n支持每周汇总，周五晚上把本周完成情况发到群里。',
    functions: '新建任务并指派给群成员\n到期前一天和当天各提醒一次\n每周五 20:00 自动发本周汇总\n群主可以设置谁能新建任务',
    commands: '/help 帮助菜单总列表\n/task <标题:任务叫什么> [负责人:@ 一个群成员] 新建一个任务\n/todo 查看我的待办\n/done <编号> 把任务标记为完成\n/remind <编号> <时间:例如 明天 18:00> 给任务加一次提醒\n/summary [范围:week 或 month] 查看本周或本月的完成情况，默认是本周',
    online: true,
    rating_average: 4.6,
    review_count: 128,
    install_count: 1362
  }),
  makeBot(2, 'Scratch 百科', {
    owner: people[4],
    description: '查积木用法、搜社区作品。直接 @ 它问问题也行。',
    functions: '查询任意积木的用法和示例\n按关键词搜索共创世界的作品\n每天早上推荐一个冷门好作品',
    commands: '/wiki <积木名> 查询积木用法\n/search <关键词> [数量] 搜索社区作品\n/random 随机推荐一个作品\n/rank 本周热门作品榜',
    online: true,
    rating_average: 4.9,
    review_count: 2315,
    install_count: 18240
  }),
  makeBot(3, '一个名字起得特别特别长的机器人看看列表和头部会不会被撑坏', {
    owner: people[3],
    description: '这段介绍故意写得很长很长，用来确认列表里是单行截断、详情页里是完整换行显示的。'.repeat(4) + 'https://www.ccw.site/a/very/long/url/without/any/break/opportunity/at/all/0123456789012345678901234567890123456789',
    functions: '一条特别长的功能说明，长到一定会换行，用来看列表项目符号和换行之后的缩进对不对，以及右边有没有溢出卡片的边界。\n短的一条',
    commands: '这是旧版本留下来的自由文本，不是「/指令 说明」的格式。\n发送“签到”即可签到，发送“排行”查看排行榜。',
    online: false,
    rating_average: 2.5,
    review_count: 3,
    install_count: 7
  }),
  makeBot(4, '灵域 AI', { owner: people[4], description: '群里的 AI 陪聊，@ 它就会回你。', commands: '/ask <问题> 问一个问题\n/reset 清空上下文', status: 'disabled', online: false, rating_average: 3.8, review_count: 46, install_count: 233 }),
  makeBot(5, '签到姬', { owner: people[2], description: '', commands: '', functions: '', rating_average: null, review_count: 0, install_count: 0, online: true })
];
const filler = ['天气播报', '点歌台', '猜数字', '成语接龙', '复读机', '抽奖机', '投票助手', '翻译官', '每日一题', '表情包库', '入群欢迎', '违禁词卫士', '更新播报', '倒计时', '骰子', '塔罗牌', '番茄钟', '闹钟', '记账本', '汇率查询'];
const squareBots: Bot[] = scene === 'empty' ? [] : [...featured, ...Array.from({ length: 62 }, (_, index) => makeBot(10 + index, `${filler[index % filler.length]}${index >= filler.length ? ` ${Math.floor(index / filler.length) + 1} 号` : ''}`))];
let myBots: Bot[] = scene === 'empty' || guest ? [] : [
  featured[0],
  makeBot(6, '内测机器人', { owner: me, is_public: false, description: '还在调试，先不公开。', commands: '/ping 看看它活着没', online: false, rating_average: null, review_count: 0, install_count: 1 }),
  makeBot(7, '停用的旧机器人', { owner: me, status: 'disabled', online: false, description: '被管理员停用了。', rating_average: 4.1, review_count: 12, install_count: 40 })
];

function reply(id: number, user: User, content: string, patch: Partial<BotReviewReply> = {}): BotReviewReply {
  return { id, review_id: 1, user_id: user.id, user, content, created_at: iso(2), updated_at: iso(2), like_count: id % 4, liked_by_me: id % 3 === 0, ...patch } as BotReviewReply;
}

const reviews: BotReview[] = [
  { id: 1, bot_id: 1, user_id: 3, user: people[2], rating: 5, content: '装了两周，群里的接龙终于有人记得交了。周五的汇总很好用。', created_at: iso(9), updated_at: iso(9), like_count: 12, liked_by_me: true, replies: [
    reply(11, me, '谢谢！下个版本会加上按人筛选。'),
    reply(12, people[2], '期待', { parent_id: 11, parent_author: me }),
    reply(13, people[3], '同问，什么时候能支持子任务？我们群里一个任务经常要拆成好几步，现在只能建好几个。', { parent_id: 11, parent_author: me, moderation_status: 'pending' }),
    reply(14, people[1], '+1')
  ] },
  { id: 2, bot_id: 1, user_id: 5, user: people[3], rating: 3.5, content: '功能不错，但是提醒有时候会晚几分钟。\n另外希望 /remind 能支持「每周」这种重复提醒，现在只能一次一次加，比较麻烦。写这么长是为了看看多行评价的换行和行高。', created_at: iso(20), updated_at: iso(18), like_count: 3, liked_by_me: false, replies: [] },
  { id: 3, bot_id: 1, user_id: 2, user: people[1], rating: 4, content: null, created_at: iso(31), updated_at: iso(31), like_count: 0, liked_by_me: false, replies: [] },
  { id: 4, bot_id: 1, user_id: 6, user: people[4], rating: 1, content: '加群领福利 xxxx', moderation_status: 'rejected', created_at: iso(40), updated_at: iso(40), like_count: 0, liked_by_me: false, replies: [] }
] as BotReview[];

function dashboardOf(bot: Bot): BotDashboard {
  const quiet = bot.id !== 1;
  return {
    bot,
    metrics: quiet
      ? { total_sent_messages: 0, total_received_messages: 0, today_sent_messages: 0, today_received_messages: 0, active_installs: 0, disabled_installs: 0, installed_groups: 0, total_members_reached: 0, review_count: 0, rating_average: null, reaction_count: 0 }
      : { total_sent_messages: 18432, total_received_messages: 126540, today_sent_messages: 212, today_received_messages: 1840, active_installs: 1298, disabled_installs: 64, installed_groups: 1362, total_members_reached: 86400, review_count: 128, rating_average: 4.6, reaction_count: 943 },
    trend: Array.from({ length: 7 }, (_, index) => ({ date: iso(6 - index).slice(0, 10), sent: quiet ? 0 : [180, 240, 96, 310, 205, 0, 212][index], received: quiet ? 0 : [1500, 2210, 640, 2480, 1730, 1120, 1840][index] })),
    rating_distribution: [5, 4.5, 4, 3.5, 3, 2.5, 2, 1.5, 1, 0.5].map((rating, index) => ({ rating, count: quiet ? 0 : [61, 28, 19, 8, 6, 2, 2, 0, 2, 0][index] })),
    installations: quiet ? [] : [
      { conversation_id: 1, title: 'Scratch 创作交流群', enabled: true, receive_messages: true, receive_member_events: true, installed_at: iso(60), updated_at: iso(0), sent_messages: 2304, received_messages: 18120, member_count: 128 },
      { conversation_id: 4, title: 'KukeChat 官方交流群', enabled: true, receive_messages: true, receive_member_events: false, installed_at: iso(44), updated_at: iso(1), sent_messages: 986, received_messages: 31044, member_count: 412 },
      { conversation_id: 6, title: '一个群名特别特别长的群聊用来看看表格里截断得对不对 · 第二分群', enabled: false, receive_messages: false, receive_member_events: false, installed_at: iso(30), updated_at: iso(12), sent_messages: 14, received_messages: 220, member_count: 36 },
      { conversation_id: 9, title: '跨年之夜 - 灯火阑珊处', enabled: true, receive_messages: true, receive_member_events: true, installed_at: iso(20), updated_at: iso(3), sent_messages: 120450, received_messages: 1204500, member_count: 12050 }
    ]
  } as BotDashboard;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function findBot(id: number): Bot | undefined {
  return [...myBots, ...squareBots].find((bot) => bot.id === id);
}

function installMockApi(): void {
  const realFetch = window.fetch.bind(window);
  let nextId = 900;
  window.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, window.location.origin);
    if (!url.pathname.includes('/api/v1/')) {
      return realFetch(input, init);
    }
    const path = url.pathname.replace(/^.*\/api\/v1/, '');
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : {};
    await new Promise((resolve) => window.setTimeout(resolve, 220));
    if (scene === 'loading' && method === 'GET') {
      return new Promise<Response>(() => undefined);
    }
    if (scene === 'error') {
      return json({ detail: '服务器开小差了，请稍后再试（这是预览页模拟的错误，文字故意写长一点看看换行）' }, 500);
    }

    if (path === '/bots/square') {
      const keyword = (url.searchParams.get('q') ?? '').toLowerCase();
      const offset = Number(url.searchParams.get('offset') ?? 0);
      const limit = Number(url.searchParams.get('limit') ?? 30);
      const matched = squareBots.filter((bot) => !keyword || [bot.name, bot.description, bot.commands].some((field) => field?.toLowerCase().includes(keyword)));
      return json({ items: matched.slice(offset, offset + limit), total: matched.length, limit, offset, has_more: offset + limit < matched.length, stats: { total_bots: squareBots.length, online_bots: squareBots.filter((bot) => bot.online).length, installed_groups: scene === 'empty' ? 0 : 12840, total_installs: scene === 'empty' ? 0 : 136200, total_reviews: scene === 'empty' ? 0 : 4521 } });
    }
    if (path === '/bots/mine') {
      return json(myBots);
    }
    if (path === '/bots' && method === 'POST') {
      nextId += 1;
      const created = makeBot(nextId, String(body.name ?? '新机器人'), { ...(body as Partial<Bot>), owner: me, online: false, rating_average: null, review_count: 0, install_count: 0 });
      myBots = [created, ...myBots];
      return json({ bot: created, key: 'kcb_live_7f3a9c21d4e84b6fa0c5b1e2d3f4a5b6c7d8e9f00112233445566778899aabbcc' });
    }
    if (path === '/uploads/avatar') {
      return json({ url: '' });
    }
    if (path === '/conversations/direct') {
      return json({ id: 77, type: 'direct', title: '机器人', display_title: '机器人' });
    }
    if (/^\/conversations\/\d+\/messages$/.test(path)) {
      return json({ id: 1, conversation_id: 1, sender_id: me.id, type: 'text', content: '', created_at: iso(0) });
    }

    const match = path.match(/^\/bots\/(\d+)(\/.*)?$/);
    if (!match) {
      return json([]);
    }
    const bot = findBot(Number(match[1]));
    const rest = match[2] ?? '';
    if (!bot) {
      return json({ detail: '机器人不存在或已被删除' }, 404);
    }
    if (rest === '' && method === 'GET') {
      return json({ ...bot, my_review: bot.id === 2 ? { id: 50, bot_id: 2, user_id: me.id, rating: 4.5, content: '查积木很方便。', created_at: iso(5), updated_at: iso(5), like_count: 0, liked_by_me: false, replies: [] } : null });
    }
    if (rest === '' && method === 'PATCH') {
      Object.assign(bot, body, { updated_at: iso(0) });
      return json(bot);
    }
    if (rest === '' && method === 'DELETE') {
      myBots = myBots.filter((item) => item.id !== bot.id);
      return json({ ok: true });
    }
    if (rest === '/reviews') {
      return json(bot.id === 1 || bot.id === 2 ? reviews : []);
    }
    if (rest === '/reviews/me') {
      return bot.id === 3 ? json({ detail: '评价里有不合适的内容，请修改后再提交' }, 400) : json(reviews[0]);
    }
    if (rest === '/dashboard') {
      return json(dashboardOf(bot));
    }
    if (rest === '/rotate-key') {
      return json({ bot_id: bot.id, key: 'kcb_live_0a1b2c3d4e5f60718293a4b5c6d7e8f900112233445566778899aabbccddeeff', key_prefix: 'kcb_live_0a1b' });
    }
    if (rest === '/install') {
      return body.conversation_id === 6 ? json({ detail: '这个群已经添加过这个机器人了' }, 409) : json({ id: 1, bot_id: bot.id, conversation_id: body.conversation_id, enabled: true });
    }
    if (/\/like$/.test(rest)) {
      const target = /replies\/(\d+)\/like$/.exec(rest);
      const item = target ? reviews.flatMap((review) => review.replies).find((entry) => entry.id === Number(target[1])) : reviews.find((review) => rest.startsWith(`/reviews/${review.id}/`));
      if (item) {
        item.liked_by_me = !item.liked_by_me;
        item.like_count += item.liked_by_me ? 1 : -1;
      }
      return json({ liked: Boolean(item?.liked_by_me), like_count: item?.like_count ?? 0 });
    }
    const replyMatch = /^\/reviews\/(\d+)\/replies$/.exec(rest);
    if (replyMatch) {
      const review = reviews.find((item) => item.id === Number(replyMatch[1]));
      nextId += 1;
      review?.replies.push(reply(nextId, me, String(body.content ?? ''), { parent_id: body.parent_id as number | null, parent_author: review.replies.find((item) => item.id === body.parent_id)?.user ?? null, like_count: 0, liked_by_me: false, created_at: iso(0), updated_at: iso(0) }));
      return json(review);
    }
    return json([]);
  };
}

function Harness(): JSX.Element {
  const [theme, setTheme] = useState<'light' | 'dark'>(params.get('theme') === 'dark' ? 'dark' : 'light');
  const [mobile, setMobile] = useState(params.get('layout') === 'mobile');
  const themeSettings = useKukeStore((state) => state.themeSettings);
  const themeRoot = useThemeRootProps(theme);
  const control: React.CSSProperties = { padding: '7px 10px', border: '1px solid var(--kc-border-strong)', borderRadius: 8, textAlign: 'left', font: 'inherit', color: 'inherit', background: 'transparent', cursor: 'pointer' };

  function cyclePreset(): void {
    const next = THEME_PRESETS[(THEME_PRESETS.findIndex((preset) => preset.id === themeSettings.presetId) + 1) % THEME_PRESETS.length];
    useKukeStore.getState().updateThemeSettings({ presetId: next.id, wallpaper: next.wallpaper ?? 'none' });
  }

  return (
    <main data-theme={theme} data-layout={mobile ? 'mobile' : 'desktop'} data-font-scale={1} data-kc-wallpaper={themeRoot['data-kc-wallpaper']} style={{ ...themeRoot.style, display: 'flex', height: '100%', minHeight: 0, background: 'var(--kc-window)', color: 'var(--kc-text)' }}>
      <aside data-harness="controls" style={{ display: 'flex', width: 156, flex: 'none', flexDirection: 'column', gap: 8, padding: 12, fontSize: 13, borderRight: '1px solid var(--kc-border)', background: 'var(--kc-list)' }}>
        <strong>预览控制</strong>
        <button type="button" data-harness="theme" style={control} onClick={() => {
          const next = theme === 'light' ? 'dark' : 'light';
          setTheme(next);
          useKukeStore.setState({ themeMode: next });
        }}>切换深浅色</button>
        <button type="button" data-harness="preset" style={control} onClick={cyclePreset}>主题：{getThemePreset(themeSettings.presetId).name}</button>
        <button type="button" data-harness="wallpaper" style={control} onClick={() => useKukeStore.getState().updateThemeSettings({ wallpaperScope: themeSettings.wallpaperScope === 'window' ? 'chat' : 'window' })}>背景范围：{themeSettings.wallpaperScope === 'window' ? '整窗' : '聊天区'}</button>
        <button type="button" data-harness="layout" style={control} onClick={() => {
          setMobile((value) => !value);
          useKukeStore.setState({ layoutMode: mobile ? 'desktop' : 'mobile' });
        }}>布局：{mobile ? '移动' : '桌面'}</button>
        <span style={{ color: 'var(--kc-muted)', fontSize: 12, lineHeight: 1.6 }}>场景：{scene}{guest ? ' · 访客' : ''}<br />换场景改地址参数，见文件头部的说明。</span>
      </aside>
      {mobile ? null : <ThemeEffects scheme={theme} />}
      {mobile ? null : <NavRail view="bots" unreadCount={5} hasUnseenAnnouncement={false} onNavigate={() => undefined} onCreateGroup={() => undefined} onOpenAnnouncement={() => undefined} onOpenSettings={() => undefined} />}
      <div data-kc-surface={mobile ? undefined : 'page'} style={mobile ? { width: 390, flex: 'none', minHeight: 0, borderRight: '1px solid var(--kc-border)' } : { minWidth: 0, flex: 1, minHeight: 0 }}>
        {mobile && mobileBotId
          ? <BotDetailPanel botId={mobileBotId} conversations={conversations} isMobile onBack={() => undefined} onEdit={() => undefined} />
          : <BotCenterPanel conversations={conversations} isMobile={mobile} onMobileBack={() => undefined} onOpenBotDetail={() => undefined} onOpenMobileBotEditor={() => undefined} />}
      </div>
    </main>
  );
}

installMockApi();
// 主题设置是持久化的，几个预览页共用同一个源：每次进来都按地址参数重置，不继承别的预览页留下的状态
const preset = getThemePreset(params.get('preset') ?? 'classic');
const wallpaperScope = params.get('wallpaper');
useKukeStore.setState({
  token: 'harness',
  currentUser: me,
  layoutMode: params.get('layout') === 'mobile' ? 'mobile' : 'desktop',
  themeMode: params.get('theme') === 'dark' ? 'dark' : 'light',
  themeSettings: { ...DEFAULT_THEME_SETTINGS, presetId: preset.id, wallpaper: wallpaperScope ? preset.wallpaper ?? 'blossom' : 'none', wallpaperScope: wallpaperScope === 'window' ? 'window' : 'chat' }
});

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
createRoot(document.getElementById('root') as HTMLElement).render(
  <QueryClientProvider client={queryClient}>
    <Harness />
  </QueryClientProvider>
);
