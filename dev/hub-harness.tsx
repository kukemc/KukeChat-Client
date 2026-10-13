/**
 * 「组队」「主页」「收藏」三个桌面页面的本地预览页：不连后端，用假数据驱动真实组件。
 *
 *   http://127.0.0.1:5180/dev/hub-harness.html
 *
 * 左边的按钮切换页面、深浅色、主题和数据状态（正常 / 空 / 加载中 / 出错）。
 * 地址后面加 ?mobile=1 会改用移动布局渲染同样三个页面，用来确认拆分之后移动端的界面没有跟着变。
 * 只用于开发时看界面，不会进入任何构建产物。
 */
import { useState, type CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@/styles/tailwind.css';
import { FavoritesPanel } from '@/components/chat/message/FavoritesPanel';
import { HomePanel } from '@/components/home/HomePanel';
import { NavRail } from '@/components/shell/NavRail';
import { TeamupCenterPanel } from '@/components/teamup/TeamupCenterPanel';
import { useKukeStore } from '@/store/kukeStore';
import { DEFAULT_THEME_SETTINGS } from '@/theme/themes';
import { ThemeEffects } from '@/theme/ThemeEffects';
import { useThemeRootProps } from '@/theme/useTheme';
import type { BookmarkedMessageRead, CcwCreationPreview, CcwCreator, Conversation, HomeData, HomeGroup, Message, TeamupComment, TeamupEvent, TeamupProfile, TeamupSkill, TeamupSkillLevel, User } from '@/types/api';

type Page = 'teamup' | 'home' | 'favorites';
type Scenario = 'normal' | 'empty' | 'loading' | 'error';

const HOUR = 3600_000;
const now = Date.now();
const ago = (ms: number): string => new Date(now - ms).toISOString();

const me = { id: 1, username: 'kuke', nickname: '酷可mc' } as User;
const people: User[] = [
  me,
  { id: 2, username: 'aqua', nickname: '阿夸', ccw_student_oid: '610b508176415b2f27e0f851', ccw_name: '阿夸Aqua', ccw_bio: '做了三年的平台跳跃游戏，最近在研究程序化生成关卡。合作请先看置顶。', ccw_following_count: 86, ccw_follower_count: 12840, ccw_like_count: 96500, ccw_creation_count: 47, ccw_favorite_count: 30210, ccw_view_count: 1284000 },
  { id: 3, username: 'mint', nickname: '薄荷糖' },
  { id: 4, username: 'pixel_fox', nickname: '像素狐' },
  { id: 5, username: 'long', nickname: '一个名字特别特别长的群友用来测试截断效果到底会不会把布局撑爆' },
  { id: 6, username: 'luna', nickname: 'Luna', ccw_student_oid: '6173f57f48cf8f4796fc860e', ccw_name: 'Luna_月', ccw_following_count: 12, ccw_follower_count: 3400, ccw_like_count: 8800, ccw_creation_count: 9, ccw_favorite_count: 2100, ccw_view_count: 76000 },
  { id: 7, username: 'drum', nickname: '鼓点' },
  { id: 8, username: 'ink', nickname: '墨水瓶' },
  { id: 9, username: 'qa', nickname: '找茬小队长' },
  { id: 10, username: 'tofu', nickname: '豆腐' },
  { id: 11, username: 'nova', nickname: 'Nova' },
  { id: 12, username: 'sora', nickname: '空' }
] as User[];

const headlines = [
  '寻找擅长像素美术的搭档，一起做 Roguelike',
  '程序一枚，想找策划和音乐，目标是 14 天做完一个能通关的小品',
  '美术',
  '会写剧情、会配音，缺一个靠谱的主程，题材想做悬疑解谜，周末两天全天在线，工作日晚上八点以后也可以，时区是东八区',
  '音乐音效都能做，风格偏 chiptune',
  '第一次参加 GameJam，求带',
  '测试 + 关卡设计，擅长把游戏玩坏'
];
const intros = [
  '## 关于我\n做过 **3 个**完整的小游戏，最擅长的是碰撞和物理手感。\n\n- 每天能投入 3 小时\n- 习惯用 Git 协作\n- 想做的方向：*平台跳跃* 或 Roguelike\n\n> 不接受只出点子不干活的队友。\n\n代表作 https://www.ccw.site/detail/64a1b2c3d4e5f60718293a4b 可以先玩玩看。',
  '画风偏可爱，角色和 UI 都能画。',
  '',
  '没有废话，直接上作品。希望找到能长期合作的小伙伴，这次 Jam 只是开始。Supercalifragilisticexpialidocious_AVeryLongUnbrokenTokenToTestWrapping_0123456789',
  '擅长 `8-bit` 风格的配乐，也可以做环境音。'
];
const skillKeys: TeamupSkill[] = ['program', 'art', 'design', 'music', 'writing', 'test', 'other'];
const levels: TeamupSkillLevel[] = ['beginner', 'skilled', 'expert'];

function picture(width: number, height: number, hue: number, label: string): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (context) {
    context.fillStyle = `hsl(${hue} 46% 58%)`;
    context.fillRect(0, 0, width, height);
    context.fillStyle = `hsl(${(hue + 40) % 360} 52% 44%)`;
    for (let index = 0; index < 7; index += 1) {
      context.fillRect(((index * 97 + hue) % width) - 30, ((index * 61 + hue * 2) % height) - 20, 90, 60);
    }
    context.fillStyle = 'rgba(255,255,255,.9)';
    context.font = '600 22px sans-serif';
    context.fillText(label, 16, 34);
  }
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob ? URL.createObjectURL(blob) : ''), 'image/png'));
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

async function start(): Promise<void> {
  const pictures = await Promise.all([
    picture(640, 360, 210, '关卡截图'), picture(480, 480, 330, '角色立绘'), picture(360, 640, 40, '竖版 UI'),
    picture(900, 300, 150, '横幅'), picture(640, 480, 265, '像素场景'), picture(640, 360, 15, '战斗演示')
  ]);
  const cover = (index: number): string => pictures[index % pictures.length];

  const creation = (index: number): CcwCreationPreview => ({
    oid: `64a1b2c3d4e5f60718293a${(40 + index).toString(16)}`,
    url: `https://www.ccw.site/detail/64a1b2c3d4e5f60718293a${(40 + index).toString(16)}`,
    title: ['像素地牢：无尽回廊', '一个标题很长很长很长很长很长很长很长的平台跳跃作品合集', '节奏方块'][index % 3],
    description: '用 300 个克隆体实现的弹幕系统，支持手柄。',
    cover_url: cover(index + 3),
    author_name: people[(index % 5) + 1].nickname ?? '',
    view_count: 12800 + index * 3210,
    like_count: 860 + index * 97,
    comment_count: 42 + index,
    version: '1.2'
  }) as CcwCreationPreview;

  function buildProfile(index: number): TeamupProfile {
    const author = people[(index % (people.length - 1)) + 1];
    const skillCount = index % 6;
    return {
      id: 1000 - index,
      user_id: author.id,
      author,
      headline: headlines[index % headlines.length],
      intro: intros[index % intros.length],
      skills: Array.from({ length: skillCount }, (_unused, offset) => ({ skill: skillKeys[(index + offset) % skillKeys.length], level: levels[(index + offset) % 3] })),
      looking_for: index % 4 === 3 ? [] : [skillKeys[(index + 3) % skillKeys.length], skillKeys[(index + 5) % skillKeys.length]],
      image_urls: index % 3 === 0 ? [cover(index), cover(index + 1), cover(index + 2), cover(index + 4)].slice(0, 1 + (index % 4)) : [],
      background_url: index % 5 === 1 ? cover(index + 3) : null,
      ccw_creations: index % 4 === 0 ? [creation(index), creation(index + 1)] : [],
      contact_note: index % 2 === 0 ? '优先加好友私聊，晚上 8 点后在线。' : null,
      status: index % 6 === 4 ? 'closed' : 'recruiting',
      moderation_status: 'approved',
      view_count: (index * 137) % 2300,
      created_at: ago(index * 5 * HOUR),
      updated_at: ago(index * 5 * HOUR),
      comment_count: index % 9,
      is_friend: index % 7 === 2,
      is_self: false
    } as TeamupProfile;
  }

  const profiles = Array.from({ length: 73 }, (_unused, index) => buildProfile(index));
  let myProfile: TeamupProfile | null = { ...buildProfile(4), id: 2001, user_id: me.id, author: me, is_self: true, is_friend: false, moderation_status: 'pending', status: 'recruiting', headline: '程序 + 关卡，想找美术和音乐', background_url: cover(3), image_urls: [cover(0), cover(4)], ccw_creations: [creation(0)] };
  const event: TeamupEvent = { id: 1, title: 'KukeChat 夏季 GameJam 2026', theme: '主题：「只有一次」——围绕不可重来的选择做一个 14 天的小游戏。', cover_url: cover(3), is_active: true, seconds_remaining: 3 * 86400 + 4 * 3600, profile_count: 64, recruiting_count: 28, total_profile_count: 312, total_recruiting_count: 97 } as TeamupEvent;

  const comments = new Map<number, TeamupComment[]>();
  let commentId = 500;
  function commentsOf(profileId: number): TeamupComment[] {
    if (!comments.has(profileId)) {
      const comment = (author: User, content: string, parent?: TeamupComment): TeamupComment => {
        commentId += 1;
        return { id: commentId, profile_id: profileId, author_id: author.id, author, parent_id: parent?.id ?? null, parent_author: parent?.author ?? null, content, moderation_status: 'approved', created_at: ago((600 - commentId) * 60_000 + 90 * 60_000), like_count: commentId % 4, liked_by_me: commentId % 5 === 0 };
      };
      const first = comment(people[2], '看了你的代表作，手感很好！想问一下碰撞是怎么做的？');
      const replies = [comment(people[1], '用列表存坐标，每帧只更新移动过的。', first), comment(people[4], '同问，蹲一个教程', first)];
      replies.push(comment(people[2], '学到了，谢谢', replies[0]), comment(me, '我这条在审核', first));
      replies[replies.length - 1].moderation_status = 'pending';
      const second = comment(people[6], '我可以做音乐，已经发了组队申请～一段很长很长的留言用来测试换行：' + '哈'.repeat(120));
      comments.set(profileId, profileId % 3 === 0 ? [] : [first, ...replies, second]);
    }
    return comments.get(profileId) ?? [];
  }

  const conversations = [
    { id: 1, type: 'group', title: 'Scratch 创作交流群', display_title: 'Scratch 创作交流群', member_count: 128 },
    { id: 2, type: 'direct', title: '阿夸', display_title: '阿夸', direct_user: people[1] },
    { id: 3, type: 'group', title: '一个群名特别特别长的群聊用来测试截断效果到底行不行', display_title: '一个群名特别特别长的群聊用来测试截断效果到底行不行', member_count: 2048 },
    { id: 5, type: 'direct', title: '薄荷糖', display_title: '薄荷糖', direct_user: people[2] }
  ] as Conversation[];

  const groups: HomeGroup[] = [
    { id: 1, title: 'Scratch 创作交流群', category: '创作', description: '分享作品、互相试玩、每周五晚上有创作接龙。', member_count: 12800, recent_message_count: 5320, heat_score: 9860, joined: true },
    { id: 21, title: '像素美术研究所', category: '美术', description: '', announcement: '新人请先看群公告，发图请打码。', member_count: 2304, recent_message_count: 1280, heat_score: 4210, join_mode: 'open' },
    { id: 22, title: '一个群名特别特别长的公开群聊用来测试标题截断以及按钮会不会被挤出去', category: '综合闲聊水群', description: '这是一段很长很长的群简介，用来测试单行截断。这是一段很长很长的群简介，用来测试单行截断。这是一段很长很长的群简介。', member_count: 986, recent_message_count: 15400, heat_score: 3999, join_mode: 'approval', auto_approve: false },
    { id: 23, title: 'GameJam 组队大厅', category: null, description: '找队友、发名片、约时间。', member_count: 640, recent_message_count: 860, heat_score: 2100, join_mode: 'question', join_question: '你最喜欢的一个社区作品是什么？为什么？', auto_approve: false },
    { id: 24, title: '音乐与音效', category: '音乐', description: 'chiptune / 环境音 / 配音', member_count: 318, recent_message_count: 77, heat_score: 640, join_mode: 'approval', auto_approve: false, join_request_status: 'pending' },
    { id: 25, title: '满员测试群', category: '测试', description: '点加入会失败，用来看错误提示。', member_count: 500, recent_message_count: 12, heat_score: 80, join_mode: 'open' }
  ].map((group) => ({ type: 'group', display_title: group.title, ...group })) as HomeGroup[];
  const creators = people.slice(1, 7).map((user, index) => ({ ...user, ccw_student_oid: user.ccw_student_oid ?? `oid-${user.id}`, ccw_name: user.ccw_name ?? (index === 3 ? null : `${user.nickname}_CCW`), ccw_follower_count: user.ccw_follower_count ?? 1000 + index * 2345, ccw_like_count: user.ccw_like_count ?? 800 * (index + 1) })) as CcwCreator[];
  const homeData = (seed: number): HomeData => ({
    stats: { registered_users: 28460, messages: 1864200, messages_last_7_days: 86400, groups: 1284, public_groups: 312, public_posts: 9640, friendships: 42100, post_likes: 128800 },
    groups: seed % 2 === 0 ? groups : [...groups].reverse(),
    creators,
    creator_total: 128,
    recommendation_seed: seed
  });

  let messageId = 9000;
  const message = (conversationId: number, sender: User, patch: Partial<Message>): Message => {
    messageId += 1;
    return { id: messageId, conversation_id: conversationId, sender_id: sender.id, sender, type: 'text', content: '', created_at: ago((messageId - 9000) * 7 * HOUR), ...patch } as Message;
  };
  const bookmark = (conversationId: number, item: Message): BookmarkedMessageRead => ({ conversation_id: conversationId, message: item, created_at: item.created_at });
  const bookmarks: BookmarkedMessageRead[] = [
    bookmark(1, message(1, people[1], { content: '说一下思路：先把所有角色的坐标存进列表，每帧只更新移动过的那几个，然后用「碰到颜色」做粗筛，命中了再做精确判断。这样 300 个克隆体也不会掉帧。\nhttps://www.ccw.site/detail/64a1b2c3d4e5f60718293a4b' })),
    bookmark(2, message(2, people[1], { type: 'image', content: pictures[0] })),
    bookmark(1, message(1, people[4], { content: '带三张图的消息', metadata: { images: [pictures[1], pictures[4], pictures[5]] } })),
    bookmark(3, message(3, people[2], { type: 'forward_bundle', content: '[聊天记录]', metadata: { title: 'Scratch 创作交流群的聊天记录', count: 3, snapshots: [{ id: 1, sender_name: '阿夸', type: 'text', content: '周五晚上的接龙谁来开头' }, { id: 2, sender_name: '薄荷糖', type: 'text', content: '我来吧' }, { id: 3, sender_name: '像素狐', type: 'text', content: '收到' }] } })),
    bookmark(5, message(5, people[2], { content: '[群聊名片] 像素美术研究所', metadata: { share_card: { type: 'group', conversation_id: 21, title: '像素美术研究所', description: '新人请先看群公告，发图请打码。', category: '美术', member_count: 2304, join_mode: 'open' } } })),
    bookmark(1, message(1, people[5], { content: '[组队名片] Luna', metadata: { share_card: { type: 'teamup', profile_id: 998, user_id: 6, name: 'Luna', headline: '会写剧情、会配音，缺一个靠谱的主程', status: 'recruiting', skills: ['writing', 'music'], looking_for: ['program'], creation_count: 2 } } })),
    bookmark(2, message(2, me, { content: '回复一下上面那条', metadata: { quote: { message_id: 40, sender_name: '阿夸', preview: '好，晚点发你', type: 'text' } } })),
    bookmark(1, message(1, people[6], { type: 'voice', content: 'voice.webm', metadata: { voice: { duration_ms: 8200 } } })),
    bookmark(99, message(99, people[7], { content: '这条消息所在的群已经退出了，会话信息拿不到。' })),
    bookmark(3, message(3, people[3], { content: '这条被撤回了', recalled_at: ago(HOUR) })),
    bookmark(1, message(1, people[4], { content: 'Supercalifragilisticexpialidocious_AVeryLongUnbrokenTokenToTestWrapping_0123456789_0123456789_0123456789_0123456789_0123456789' }))
  ];

  let scenario: Scenario = 'normal';
  // 线上没有进行中的赛季时 /teamup/event/current 返回 null；统计接口单独坏掉时概览要显示占位
  let noEvent = false;
  let statsDown = false;
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, window.location.origin);
    if (!url.pathname.includes('/api/v1/')) {
      return realFetch(input, init);
    }
    const path = url.pathname.replace(/^.*\/api\/v1/, '');
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : {};
    await new Promise((resolve) => window.setTimeout(resolve, 200));
    if (method === 'GET' && scenario === 'loading') {
      await new Promise(() => undefined);
    }
    if (method === 'GET' && scenario === 'error') {
      return json({ detail: '服务器开小差了，请稍后再试' }, 500);
    }
    const empty = scenario === 'empty';

    if (path === '/teamup/event/current') return json(empty || noEvent ? null : event);
    // 数字故意和「首屏已加载的名片」（最新 12 + 最热 12）、和赛季上的 total_* 都对不上，一眼能看出概览用的是这个接口
    if (path === '/teamup/stats') {
      if (statsDown) return json({ detail: '统计暂时不可用' }, 500);
      return json(empty
        ? { profile_count: 0, recruiting_count: 0, total_profile_count: 0, total_recruiting_count: 0, total_view_count: 0, total_comment_count: 0 }
        : { profile_count: 160, recruiting_count: 148, total_profile_count: 412, total_recruiting_count: 265, total_view_count: 1699, total_comment_count: 308 });
    }
    if (path === '/teamup/skills') return json(empty ? [] : [{ skill: 'program', count: 88 }, { skill: 'art', count: 41 }, { skill: 'design', count: 27 }, { skill: 'music', count: 12 }, { skill: 'writing', count: 9 }, { skill: 'test', count: 3 }, { skill: 'other', count: 6 }]);
    if (path === '/teamup/profiles/me') {
      if (method === 'PUT') {
        myProfile = { ...(myProfile ?? { ...buildProfile(0), id: 2001, user_id: me.id, author: me, is_self: true, is_friend: false, ccw_creations: [] }), ...(body as Partial<TeamupProfile>), moderation_status: 'pending', updated_at: new Date().toISOString() };
        return json(myProfile);
      }
      if (method === 'DELETE') {
        myProfile = null;
        return json({});
      }
      return json(empty ? null : myProfile);
    }
    if (path === '/teamup/profiles/me/close' || path === '/teamup/profiles/me/reopen') {
      if (myProfile) myProfile = { ...myProfile, status: path.endsWith('close') ? 'closed' : 'recruiting' };
      return json(myProfile);
    }
    if (path === '/teamup/profiles') {
      if (empty) return json([]);
      if (url.searchParams.get('scope') === 'mine') return json(myProfile ? [myProfile] : []);
      const skill = url.searchParams.get('skill');
      const search = url.searchParams.get('search')?.toLowerCase() ?? '';
      const beforeId = Number(url.searchParams.get('before_id') ?? 0);
      const limit = Number(url.searchParams.get('limit') ?? 40);
      let pool = profiles.filter((profile) => (!skill || profile.skills.some((item) => item.skill === skill)) && (!search || `${profile.headline}${profile.intro}`.toLowerCase().includes(search)));
      if (url.searchParams.get('sort') === 'hot' && limit <= 12) pool = [...pool].sort((a, b) => b.view_count - a.view_count);
      if (beforeId) pool = pool.filter((profile) => profile.id < beforeId);
      return json(pool.slice(0, limit));
    }
    const profileMatch = path.match(/^\/teamup\/profiles\/(\d+)$/);
    if (profileMatch) {
      const id = Number(profileMatch[1]);
      const found = id === myProfile?.id ? myProfile : profiles.find((profile) => profile.id === id);
      return found ? json({ ...found, comment_count: commentsOf(id).length }) : json({ detail: '名片不存在或已下架' }, 404);
    }
    const commentsMatch = path.match(/^\/teamup\/profiles\/(\d+)\/comments(?:\/(\d+))?(\/like)?$/);
    if (commentsMatch) {
      const list = commentsOf(Number(commentsMatch[1]));
      const target = list.find((item) => item.id === Number(commentsMatch[2]));
      if (commentsMatch[3] && target) {
        target.liked_by_me = !target.liked_by_me;
        target.like_count += target.liked_by_me ? 1 : -1;
        return json({ liked: target.liked_by_me, like_count: target.like_count });
      }
      if (method === 'DELETE' && target) {
        list.splice(list.indexOf(target), 1);
        return json({});
      }
      if (method === 'POST') {
        commentId += 1;
        const parent = list.find((item) => item.id === body.parent_id);
        const created: TeamupComment = { id: commentId, profile_id: Number(commentsMatch[1]), author_id: me.id, author: me, parent_id: parent?.id ?? null, parent_author: parent?.author ?? null, content: String(body.content ?? ''), moderation_status: 'pending', created_at: new Date().toISOString(), like_count: 0, liked_by_me: false };
        list.push(created);
        return json(created);
      }
      return json(list);
    }
    if (path === '/uploads/teamup-image') return json({ url: cover(Math.floor(Math.random() * pictures.length)) });
    if (path.startsWith('/ccw/creations/')) return path.endsWith('ffffffffffffffffffffffff') ? json({ detail: '作品不存在' }, 404) : json({ ...creation(path.length % 3), oid: path.split('/').pop() });
    if (path === '/friends/requests/outgoing') return json(empty ? [] : [{ id: 31, requester_id: me.id, receiver_id: 4, status: 'pending' }]);
    if (path === '/friends/requests/incoming') return json(empty ? [] : [{ id: 32, requester_id: 3, receiver_id: me.id, status: 'pending' }]);
    if (path === '/friends/requests') return body.receiver_id === 8 ? json({ detail: '对方不接受陌生人的好友申请' }, 403) : json({ id: 40, requester_id: me.id, receiver_id: body.receiver_id, status: 'pending' });
    if (/^\/friends\/requests\/\d+\/accept$/.test(path)) return json({ id: 32, status: 'accepted' });
    if (path === '/conversations') return json(empty ? [] : conversations);
    if (/^\/conversations\/\d+\/messages$/.test(path)) return json(message(1, me, { content: String(body.content ?? '') }));
    if (path === '/home') return json(empty ? { ...homeData(1), groups: [], creators: [], creator_total: 0 } : homeData(Number(url.searchParams.get('seed') ?? 0)));
    if (path === '/conversations/25/join') return json({ detail: '群成员已满，暂时无法加入。' }, 403);
    if (/^\/conversations\/\d+\/join$/.test(path)) return json(conversations[0]);
    if (/^\/conversations\/\d+\/join-requests$/.test(path)) return body.answer === '报错' ? json({ detail: '答案不符合要求，请重新填写。' }, 400) : json({ id: 1, status: 'pending' });
    if (path === '/users/ccw-creators') return json({ items: creators, total: 128, limit: 24, offset: 0, has_more: false });
    return json([]);
  };

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
  useKukeStore.setState({ token: 'harness', currentUser: me, layoutMode: 'desktop', themeMode: 'light' });
  const friends = [{ id: 1, user_id: me.id, friend_id: 2, friend: people[1], status: 'accepted' }] as never[];

  const query = new URLSearchParams(window.location.search);
  const mobile = query.has('mobile');
  if (mobile) {
    useKukeStore.setState({ layoutMode: 'mobile' });
  }

  function Harness(): JSX.Element {
    const [theme, setTheme] = useState<'light' | 'dark'>('light');
    const [page, setPage] = useState<Page>((query.get('page') as Page | null) ?? 'teamup');
    const [state, setState] = useState<Scenario>('normal');
    const [themed, setThemed] = useState(false);
    const [scale, setScale] = useState(1);
    const [log, setLog] = useState('');
    const themeRoot = useThemeRootProps(theme);
    const button: CSSProperties = { padding: '7px 10px', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--kc-border-strong)', borderRadius: 7, textAlign: 'left', fontSize: 13 };
    const active: CSSProperties = { ...button, borderColor: 'var(--kc-accent)', color: 'var(--kc-accent)', fontWeight: 600 };

    function applyScenario(next: Scenario): void {
      scenario = next;
      setState(next);
      // 整个缓存清掉重新取，才能看到「加载中」「出错」的首屏
      void queryClient.resetQueries();
    }

    const empty = state === 'empty';
    return (
      <main data-theme={theme} data-layout={mobile ? 'mobile' : 'desktop'} data-font-scale={scale} data-kc-wallpaper={themeRoot['data-kc-wallpaper']} style={{ ...themeRoot.style, display: 'flex', height: '100%', minHeight: 0, background: 'var(--kc-window)', color: 'var(--kc-text)' }}>
        <aside data-harness="controls" style={{ display: 'flex', width: 152, flex: 'none', flexDirection: 'column', gap: 6, padding: 10, borderRight: '1px solid var(--kc-border)', background: 'var(--kc-list)', overflowY: 'auto' }}>
          <strong style={{ fontSize: 13 }}>页面</strong>
          {(['teamup', 'home', 'favorites'] as Page[]).map((item) => <button key={item} type="button" data-harness={`page-${item}`} style={page === item ? active : button} onClick={() => setPage(item)}>{item === 'teamup' ? '组队' : item === 'home' ? '主页' : '收藏'}</button>)}
          <strong style={{ marginTop: 8, fontSize: 13 }}>外观</strong>
          <button type="button" data-harness="theme" style={button} onClick={() => {
            const next = theme === 'light' ? 'dark' : 'light';
            setTheme(next);
            useKukeStore.setState({ themeMode: next });
          }}>切换深浅色</button>
          <button type="button" data-harness="preset" style={themed ? active : button} onClick={() => {
            useKukeStore.setState({ themeSettings: themed ? DEFAULT_THEME_SETTINGS : { ...DEFAULT_THEME_SETTINGS, presetId: 'sakura', wallpaper: 'blossom', wallpaperScope: 'window' } });
            setThemed(!themed);
          }}>樱花 + 整窗背景</button>
          <button type="button" data-harness="scale" style={scale === 1 ? button : active} onClick={() => setScale(scale === 1 ? 3 : 1)}>大字号</button>
          <strong style={{ marginTop: 8, fontSize: 13 }}>数据</strong>
          {(['normal', 'empty', 'loading', 'error'] as Scenario[]).map((item) => <button key={item} type="button" data-harness={`data-${item}`} style={state === item ? active : button} onClick={() => applyScenario(item)}>{item === 'normal' ? '正常' : item === 'empty' ? '空' : item === 'loading' ? '加载中' : '出错'}</button>)}
          <strong style={{ marginTop: 8, fontSize: 13 }}>组队</strong>
          <button type="button" data-harness="open-profile" style={button} onClick={() => useKukeStore.setState({ pendingTeamupProfileId: 1000 })}>打开一张名片</button>
          <button type="button" data-harness="open-mine" style={button} onClick={() => useKukeStore.setState({ pendingTeamupProfileId: 2001 })}>打开我的名片</button>
          <button type="button" data-harness="open-missing" style={button} onClick={() => useKukeStore.setState({ pendingTeamupProfileId: 404 })}>打开不存在的名片</button>
          <button type="button" data-harness="drop-mine" style={button} onClick={() => {
            myProfile = null;
            void queryClient.invalidateQueries({ queryKey: ['teamup'] });
          }}>删掉我的名片</button>
          <button type="button" data-harness="toggle-event" style={button} onClick={() => {
            noEvent = !noEvent;
            setLog(noEvent ? '现在没有赛季' : '现在有赛季');
            void queryClient.invalidateQueries({ queryKey: ['teamup'] });
          }}>有 / 没有赛季</button>
          <button type="button" data-harness="toggle-stats" style={button} onClick={() => {
            statsDown = !statsDown;
            setLog(statsDown ? '统计接口返回 500' : '统计接口正常');
            // 只失效的话旧数字还留着，要清掉才看得到「没取到」的样子
            void queryClient.resetQueries({ queryKey: ['teamup', 'stats'] });
          }}>统计接口好 / 坏</button>
          <p data-harness="log" style={{ marginTop: 8, color: 'var(--kc-muted)', fontSize: 12, overflowWrap: 'anywhere' }}>{log}</p>
        </aside>
        {mobile ? null : <ThemeEffects scheme={theme} />}
        {mobile ? null : <NavRail view={page} unreadCount={5} hasUnseenAnnouncement={false} onNavigate={(view) => (view === 'teamup' || view === 'home' || view === 'favorites' ? setPage(view) : setLog(`导航到 ${view}`))} onCreateGroup={() => undefined} onOpenAnnouncement={() => undefined} onOpenSettings={() => undefined} />}
        <div className={mobile ? 'kc-native-app' : undefined} data-kc-surface={mobile ? undefined : 'page'} data-layout={mobile ? 'mobile' : undefined} style={mobile ? { position: 'relative', width: 390, height: '100%', flex: 'none', overflow: 'hidden', transform: 'translateZ(0)' } : { minWidth: 0, minHeight: 0, flex: 1, overflow: 'hidden', background: 'var(--kc-chat)' }}>
          {page === 'teamup' ? <TeamupCenterPanel key={state} currentUser={me} friends={friends} isMobile={mobile} onMobileBack={mobile ? () => setLog('返回空间') : undefined} /> : null}
          {page === 'home' ? <HomePanel currentUser={me} conversations={conversations} isMobile={mobile} onMobileBack={mobile ? () => setLog('返回空间') : undefined} onOpenConversation={(id) => setLog(`打开会话 ${id}`)} onOpenUserProfile={(_user, id) => setLog(`打开用户 ${id}`)} /> : null}
          {page === 'favorites' ? <FavoritesPanel conversations={conversations} currentUser={me} items={empty || state !== 'normal' ? [] : bookmarks} isLoading={state === 'loading'} error={state === 'error' ? new Error('boom') : null} isMobile={mobile} onMobileBack={mobile ? () => setLog('返回空间') : undefined} onOpenForwardBundle={(item) => setLog(`打开转发记录 ${item.id}`)} /> : null}
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
