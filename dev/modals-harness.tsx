/**
 * 桌面端弹窗与浮层的本地预览页：不连后端，用假数据驱动真实组件。
 *
 *   http://127.0.0.1:5180/dev/modals-harness.html
 *
 * 左边一排按钮逐个打开：全局搜索、公告中心、群公告、聊天记录搜索、精华消息、转发、合并转发详情、
 * 资料卡、看图、创建群聊、推荐加群、邀请、举报。背后垫着真实的聊天面板，也可以从面板里正常点开它们。
 * 只用于开发时看界面，不会进入任何构建产物。
 */
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@/styles/tailwind.css';
import { featureMocks } from './mocks';
import { announcementReactionScenario, simulateAnnouncementReactions, withAnnouncementReactions } from './mocks/announcementReactions';
import { AnnouncementModal as SystemAnnouncementModal } from '@/components/announcements/AnnouncementModal';
import { applyAnnouncementReactionEvent } from '@/components/announcements/announcementReactions';
import { AnnouncementModal as GroupAnnouncementModal } from '@/components/chat/AnnouncementModal';
import { ReportModal } from '@/components/chat/ReportModal';
import { DesktopChatPanel } from '@/components/chat/desktop/DesktopChatPanel';
import { ChatSearchHost } from '@/components/search/chat/ChatSearchHost';
import { useGroupPlusUi } from '@/components/groupPlus/ui';
import { FeaturedMessagesModal } from '@/components/chat/message/FeaturedMessagesModal';
import { ForwardBundleDetailModal } from '@/components/chat/message/ForwardBundleDetailModal';
import { ForwardTargetModal } from '@/components/chat/message/ForwardTargetModal';
import { CreateGroupModal } from '@/components/groups/CreateGroupModal';
import { RecommendedGroupJoinModal } from '@/components/groups/RecommendedGroupJoinModal';
import { InviteModal } from '@/components/invites/InviteModal';
import { GlobalSearchModal } from '@/components/search/GlobalSearchModal';
import { ConversationPane } from '@/components/shell/ConversationPane';
import { NavRail } from '@/components/shell/NavRail';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { ImageViewer, type ImageViewerState } from '@/components/ui/ImageViewer';
import { UserCard } from '@/components/ui/UserCard';
import { subscribeRealtimeEvents } from '@/realtime/events';
import { useKukeStore } from '@/store/kukeStore';
import { ThemeEffects } from '@/theme/ThemeEffects';
import { useThemeRootProps } from '@/theme/useTheme';
import type { Announcement, Conversation, ConversationMember, Friendship, Message, User } from '@/types/api';
import type { GroupAnnouncement } from '@/types/groupAnnouncement';

/** 聊天记录搜索现在由全局宿主（ChatSearchHost）渲染：这里只负责「打开它」。 */
function ChatSearchOpener(): JSX.Element {
  useEffect(() => {
    useGroupPlusUi.getState().openChatSearch({ conversationId: 1, title: 'Scratch 创作交流群 (128)' });
    return () => useGroupPlusUi.getState().closeChatSearch();
  }, []);
  return <ChatSearchHost />;
}

const LONG_NAME = '一个名字特别特别长的群友用来测试截断到底会发生在什么位置';
const LONG_TEXT = '说一下思路：先把所有角色的坐标存进列表，每帧只更新移动过的那几个，然后用「碰到颜色」做粗筛，命中了再做精确判断。这样 300 个克隆体也不会掉帧，实测在低配的平板上也能稳定 30 帧以上。另外广播的顺序要注意，先广播「准备」再广播「开始」，不然克隆体会比本体早一帧动起来。';

const me = { id: 1, username: 'kuke', nickname: '酷可mc', email: 'kuke@example.com' } as User;
const people: User[] = [
  me,
  { id: 2, username: 'aqua', nickname: '阿夸', email: 'aqua@example.com', bio: '做游戏的，偶尔画画。', profile_tagline: 'Scratch 八年老玩家', profile_status: '正在赶稿', profile_accent_color: '#12b886', ccw_student_oid: 'oid-aqua', ccw_name: 'Aqua_', ccw_follower_count: 12840, ccw_like_count: 356000 } as User,
  { id: 3, username: 'mint', nickname: '薄荷糖', bio: '' } as User,
  { id: 4, username: 'robot', nickname: '任务小助手', is_bot: true, bio: '发 /help 看我能做什么。' } as User,
  { id: 5, username: 'a_very_long_username_for_truncation_test', nickname: LONG_NAME, email: 'someone.with.a.long.address@example-domain.com', bio: LONG_TEXT, profile_tagline: '一条非常非常长的个性签名用来看标签会不会把卡片撑破', profile_status: '请勿打扰，正在专心写一个很长的状态' } as User,
  { id: 6, username: 'neo', nickname: 'Neo' } as User
];
const friends: Friendship[] = [people[1], people[2], people[4]].map((user, index) => ({ id: index + 1, user: me, friend: user }));
const members = people.map((user, index) => ({ id: index + 1, conversation_id: 1, user_id: user.id, role: index === 0 ? 'owner' : index === 1 ? 'admin' : 'member', user, joined_at: `2026-01-0${index + 1}T00:00:00Z` }) as ConversationMember);
const now = Date.now();
const ago = (minutes: number): string => new Date(now - minutes * 60_000).toISOString();
const text = (id: number, sender: User, content: string, minutes: number, extra: Partial<Message> = {}): Message => ({ id, conversation_id: 1, sender_id: sender.id, sender, type: 'text', content, created_at: ago(minutes), ...extra }) as Message;

const conversations = [
  { id: 1, type: 'group', title: 'Scratch 创作交流群', display_title: 'Scratch 创作交流群', member_count: 128, unread_count: 0, my_role: 'owner', updated_at: ago(1), last_message: text(1, people[1], '周五晚上的接龙谁来开头', 1), announcement: '欢迎加入！发作品请带上链接。' },
  { id: 2, type: 'direct', title: '阿夸', display_title: '阿夸', unread_count: 0, direct_user: people[1], updated_at: ago(9), last_message: text(2, people[1], '好，晚点发你', 9) },
  { id: 3, type: 'group', title: `${LONG_NAME}的群`, display_title: `${LONG_NAME}的群`, member_count: 2270, unread_count: 12, updated_at: ago(30), last_message: text(3, people[2], '喵喵喵', 30) },
  { id: 4, type: 'group', title: 'KukeChat 官方交流群', display_title: 'KukeChat 官方交流群', member_count: 412, unread_count: 3, updated_at: ago(120), last_message: text(4, people[4], '这个版本什么时候发', 120) },
  { id: 5, type: 'direct', title: '薄荷糖', display_title: '薄荷糖', unread_count: 2, direct_user: people[2], updated_at: ago(300), last_message: text(5, people[2], '🙏', 300) }
] as Conversation[];

const searchGroups = [
  { id: 101, type: 'group', title: '像素画研究所', member_count: 356, category: '美术', join_mode: 'open', description: '每周一次像素画接龙，新手友好。' },
  { id: 102, type: 'group', title: '物理引擎交流', member_count: 89, category: '编程', join_mode: 'approval', description: LONG_TEXT },
  { id: 103, type: 'group', title: `${LONG_NAME}的作品讨论群`, member_count: 1204, category: '', join_mode: 'question', join_question: '你最喜欢的积木是哪一块？' },
  { id: 104, type: 'group', title: '已经加入的群', member_count: 12, category: '闲聊', join_mode: 'open', joined: true },
  { id: 105, type: 'group', title: '申请还在审核的群', member_count: 40, category: '音乐', join_mode: 'approval', join_request_status: 'pending' }
] as Conversation[];

function picture(width: number, height: number, hue: number): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (context) {
    const gradient = context.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, `hsl(${hue} 70% 62%)`);
    gradient.addColorStop(1, `hsl(${(hue + 60) % 360} 72% 44%)`);
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
    context.fillStyle = 'rgba(255,255,255,.9)';
    context.font = '600 30px sans-serif';
    context.fillText(`${width}×${height}`, 24, 50);
  }
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob ? URL.createObjectURL(blob) : ''), 'image/png'));
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** 预览页上可以切换的几种数据状态。 */
const scenario = { empty: false, slow: false };
/**
 * 公告列表的加载情形：hang 一直不返回（看骨架屏），fail 返回 500（看失败和重试），
 * cover 把第一条的封面换成一个永远解析不了的地址：直接看就是「封面加载失败」；
 * 要看封面的占位和淡入，用浏览器自动化把这个地址拦下来，拖一会儿再喂一张图。
 */
const announcementLoad: { mode: 'normal' | 'hang' | 'fail' | 'cover'; release: Array<() => void> } = { mode: 'normal', release: [] };
const UNREACHABLE_COVER_URL = 'https://kukechat-harness.invalid/announcement-cover.png';

type View =
  | { kind: 'globalSearch'; keyword: string }
  | { kind: 'systemAnnouncements' }
  | { kind: 'groupAnnouncements'; canPublish: boolean }
  | { kind: 'chatSearch' }
  | { kind: 'featured' }
  | { kind: 'forward' }
  | { kind: 'bundle' }
  | { kind: 'card'; user: User; action: 'message' | 'add' | 'pending' | 'none' }
  | { kind: 'viewer'; state: ImageViewerState }
  | { kind: 'createGroup' }
  | { kind: 'recommend'; groupId: number }
  | { kind: 'invite'; token: string }
  | { kind: 'report'; target: 'message' | 'user' };

async function start(): Promise<void> {
  const pictures = await Promise.all([picture(1280, 720, 210), picture(720, 1280, 330), picture(640, 640, 40), picture(2400, 600, 130), picture(320, 200, 270)]);
  const bundle = { ...text(900, people[1], '[聊天记录]', 40), type: 'forward_bundle', metadata: { title: '阿夸和薄荷糖的聊天记录', count: 5, note: '看看这段，碰撞检测的思路讲得很清楚', snapshots: [
    { id: 1, sender_name: '阿夸', type: 'text', content: '克隆体的碰撞检测你是怎么做的', created_at: ago(600) },
    { id: 2, sender_name: '薄荷糖', type: 'text', content: LONG_TEXT, created_at: ago(598) },
    { id: 3, sender_name: '薄荷糖', type: 'image', content: pictures[0], created_at: ago(597) },
    { id: 4, sender_name: LONG_NAME, type: 'text', content: '学到了', created_at: ago(590) },
    { id: 5, sender_name: '阿夸', type: 'text', content: '带两张图', metadata: { images: [pictures[2], pictures[1]] }, created_at: ago(580) }
  ] } } as unknown as Message;
  const history: Message[] = [
    text(801, people[1], '早', 200),
    text(802, people[2], '我刚把克隆体的碰撞检测改好了，原来是广播顺序的问题', 190),
    { ...text(803, people[4], pictures[0], 180), type: 'image' } as Message,
    text(804, people[4], LONG_TEXT, 170, { featured: true } as Partial<Message>),
    bundle,
    text(806, people[3], '已为你创建任务：周五接龙', 30),
    text(807, me, '周五晚上的接龙谁来开头', 20),
    text(808, people[1], '带两张图的消息', 10, { metadata: { images: [pictures[2], pictures[3]] } } as Partial<Message>),
    text(809, people[2], '碰撞这块可以看 https://www.ccw.site/detail/abc', 2)
  ];
  const featured = [history[3], history[2], bundle];
  const systemAnnouncements: Announcement[] = [
    { id: 3, title: '1.4.0 更新内容', pinned: true, cover_url: pictures[3], author: me, created_at: ago(60 * 24), updated_at: ago(60 * 24), content: `# 这次更新了什么\n\n1.4.0 更新内容包括：\n\n- 桌面端界面整体重做，更紧凑也更清楚\n- 群聊支持投票和自定义表情\n- 修复了滚动消息时偶尔回弹的问题\n\n## 需要注意\n\n> 1.3.1 / 1.3.2 的桌面端收不到自动更新，请到官网手动下载。\n\n![更新长图 1240x7526](/uploads/announcements/long.png)\n\n下载地址：[kuke.ink](https://kuke.ink)\n\n![第二张长图](/uploads/announcements/long.png)\n\n\`\`\`\nnpm run build\n\`\`\`\n\n| 平台 | 版本 |\n| --- | --- |\n| 桌面端 | 1.4.0 |\n| 安卓 | 1.2.6 |\n` },
    { id: 2, title: `${LONG_NAME}——一条标题很长的公告`, author: people[1], created_at: ago(60 * 24 * 9), updated_at: ago(60 * 24 * 9), content: LONG_TEXT.repeat(6) },
    { id: 1, title: '社区公约', created_at: ago(60 * 24 * 40), updated_at: ago(60 * 24 * 40), content: '请友善交流，不要刷屏。' },
    // 回应的假数据在 mocks/announcementReactions.ts：3 号数量跨量级，2 号种类很多，4 号种类到了上限，1 号还没人回应
    { id: 4, title: '回应种类到上限的公告', created_at: ago(60 * 24 * 60), updated_at: ago(60 * 24 * 60), content: '这条公告下面的回应已经有 30 种了，不能再出现新的。' }
  ];
  // 群公告 v2（KukeChat-Server/docs/group-announcements.md）
  const noticeBase = { conversation_id: 1, author_display_name: null, images: [], pinned: false, pinned_at: null, popup: false, require_confirm: false, send_to_new_members: false, guide_nickname: false, edited_at: null, confirmed_count: 0, member_count: 128, my_seen: true, my_confirmed: false };
  let groupAnnouncements: GroupAnnouncement[] = [
    { ...noticeBase, id: 1, author_id: 1, author: me, author_display_name: '群主小明', pinned: true, pinned_at: ago(60), require_confirm: true, confirmed_count: 37, guide_nickname: true, images: [{ url: pictures[0] }, { url: pictures[1] }, { url: pictures[2] }], content: '欢迎加入！发作品请带上链接 https://www.ccw.site ，禁止刷屏。\n每周五晚上有创作接龙。', created_at: ago(60 * 24 * 3), updated_at: ago(60 * 24 * 3) },
    { ...noticeBase, id: 2, author_id: 2, author: people[1], popup: true, my_seen: false, edited_at: ago(30), content: LONG_TEXT.repeat(3), created_at: ago(60 * 24), updated_at: ago(30) },
    { ...noticeBase, id: 3, author_id: null, author: null, content: '这条公告的发布者已经注销了。', created_at: ago(60 * 24 * 30), updated_at: ago(60 * 24 * 30) }
  ];

  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, window.location.origin);
    if (!url.pathname.includes('/api/v1/')) {
      return realFetch(input, init);
    }
    const path = url.pathname.replace(/^.*\/api\/v1/, '');
    const method = (init?.method ?? 'GET').toUpperCase();
    let body: Record<string, unknown> = {};
    try {
      body = typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : {};
    } catch {
      body = {};
    }
    await new Promise((resolve) => window.setTimeout(resolve, scenario.slow ? 4000 : 200));
    for (const mock of featureMocks) {
      const mocked = await mock({ path, url, method, body });
      if (mocked) {
        return mocked;
      }
    }
    const keyword = (url.searchParams.get('q') ?? '').toLowerCase();
    const nothing = scenario.empty || keyword.includes('zzz');

    if (path === '/users/recommended' || path === '/users/search') {
      return json(nothing ? [] : people);
    }
    if (/^\/users\/\d+\/online$/.test(path)) {
      const userId = Number(path.split('/')[2]);
      return json({ user_id: userId, online: userId % 2 === 0, presence_status: userId === 2 ? 'creating' : 'online', presence_text: userId === 5 ? '一条很长很长的自定义在线状态文案用来测试截断' : null });
    }
    if (path === '/conversations/groups/recommended') {
      return json(nothing ? [] : searchGroups);
    }
    if (path === '/conversations/groups/search') {
      // 推荐加群弹窗是拿群号来搜的
      const byId = searchGroups.filter((group) => String(group.id) === keyword);
      return json(nothing ? [] : byId.length > 0 ? byId : /^\d+$/.test(keyword) ? [] : searchGroups);
    }
    if (path === '/friends/requests/outgoing') {
      return json([{ id: 1, requester_id: 1, receiver_id: 6, status: 'pending' }]);
    }
    if (path === '/friends/requests' && method === 'POST') {
      return body.receiver_id === 4 || body.user_id === 4 ? json({ detail: '不能添加机器人为好友' }, 400) : json({ id: 9, requester_id: 1, receiver_id: 3, status: 'pending' });
    }
    if (path === '/conversations/join-requests/outgoing') {
      return json([]);
    }
    if (/^\/conversations\/\d+\/join$/.test(path)) {
      return json(searchGroups[0]);
    }
    if (/^\/conversations\/\d+\/join-requests$/.test(path)) {
      return json({ id: 1, conversation_id: Number(path.split('/')[2]), requester_id: 1, status: 'pending' });
    }
    if (/^\/conversations\/\d+\/messages\/search$/.test(path)) {
      const conversationId = Number(path.split('/')[2]);
      const beforeId = Number(url.searchParams.get('before_id') ?? 0);
      const pool = nothing ? [] : history.map((message) => ({ ...message, conversation_id: conversationId, conversation: conversations.find((item) => item.id === conversationId) }));
      // 第一页之后再给一页，看「加载更多」
      const items = (beforeId ? pool.slice(0, 3).map((message) => ({ ...message, id: message.id - 500 })) : pool).map((message) => ({ message, match_type: message.type, snippet: message.content }));
      return json({ items, total: items.length, limit: 50, has_more: !beforeId && !nothing && conversationId === 1, next_before_id: beforeId ? null : 700 });
    }
    if (/^\/conversations\/\d+\/messages$/.test(path) && method === 'GET') {
      return json(url.searchParams.get('before_id') ? [] : history);
    }
    if (/^\/conversations\/\d+\/featured-messages$/.test(path)) {
      return json(scenario.empty ? [] : featured.map((message, index) => ({ id: index + 1, conversation_id: message.conversation_id, message_id: message.id, set_by_id: null, set_by: null, created_at: message.created_at, message, message_exists: true, recalled: false, snapshot_missing: false })));
    }
    if (path === '/announcements') {
      if (announcementLoad.mode === 'hang') {
        // 切到别的情形时放行
        await new Promise<void>((resolve) => announcementLoad.release.push(resolve));
      }
      if (announcementLoad.mode === 'fail') {
        return json({ detail: 'Internal Server Error' }, 500);
      }
      const announcements = announcementLoad.mode === 'cover' ? systemAnnouncements.map((item) => (item.cover_url ? { ...item, cover_url: UNREACHABLE_COVER_URL } : item)) : systemAnnouncements;
      return json(scenario.empty ? [] : withAnnouncementReactions(announcements));
    }
    if (/^\/conversations\/\d+\/announcements\/popups$/.test(path)) {
      return json(groupAnnouncements.filter((item) => item.popup && !item.my_seen));
    }
    const noticeAction = path.match(/^\/conversations\/\d+\/announcements\/(\d+)\/(seen|confirm|confirmations)$/);
    if (noticeAction) {
      const id = Number(noticeAction[1]);
      if (noticeAction[2] === 'confirmations') {
        const status = url.searchParams.get('status') === 'confirmed' ? 'confirmed' : 'unconfirmed';
        const items = people.map((user, index) => ({ user, nickname: index === 0 ? '群主小明' : null, role: index === 0 ? 'owner' : 'member', confirmed_at: status === 'confirmed' ? ago(index * 7) : null }));
        return json({ announcement_id: id, status, member_count: 128, confirmed_count: 37, unconfirmed_count: 91, items, limit: 50, offset: 0, has_more: false });
      }
      const confirming = noticeAction[2] === 'confirm';
      groupAnnouncements = groupAnnouncements.map((item) => (item.id === id ? { ...item, my_seen: true, my_confirmed: item.my_confirmed || confirming, confirmed_count: item.confirmed_count + (confirming && !item.my_confirmed ? 1 : 0) } : item));
      return json(groupAnnouncements.find((item) => item.id === id) ?? {});
    }
    const noticeMatch = path.match(/^\/conversations\/\d+\/announcements(?:\/(\d+))?$/);
    if (noticeMatch) {
      const id = Number(noticeMatch[1]);
      const options = { pinned: Boolean(body.pinned), popup: Boolean(body.popup), require_confirm: Boolean(body.require_confirm), send_to_new_members: Boolean(body.send_to_new_members), guide_nickname: Boolean(body.guide_nickname) };
      const images = Array.isArray(body.images) ? body.images.map((item: unknown) => ({ url: String(item) })) : [];
      if (method === 'GET') {
        if (noticeMatch[1]) {
          const found = groupAnnouncements.find((item) => item.id === id);
          return found ? json(found) : json({ detail: { code: 'announcement_not_found', message: '公告不存在或已删除' } }, 404);
        }
        return json(scenario.empty ? [] : groupAnnouncements);
      }
      if (method === 'POST') {
        const created: GroupAnnouncement = { ...noticeBase, ...options, images, id: Date.now(), author_id: 1, author: me, pinned_at: options.pinned ? new Date().toISOString() : null, content: String(body.content ?? ''), created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
        groupAnnouncements = [created, ...groupAnnouncements];
        return json(created, 201);
      }
      if (method === 'DELETE') {
        groupAnnouncements = groupAnnouncements.filter((item) => item.id !== id);
        return json({});
      }
      groupAnnouncements = groupAnnouncements.map((item) => (item.id === id ? { ...item, ...options, images, content: String(body.content ?? item.content), edited_at: new Date().toISOString() } : item));
      return json(groupAnnouncements.find((item) => item.id === id) ?? {});
    }
    if (path === '/conversations/groups' && method === 'POST') {
      return json({ detail: '创建群聊太频繁，请稍后再试' }, 429);
    }
    const inviteMatch = path.match(/^\/invites\/([^/]+)(\/accept)?$/);
    if (inviteMatch) {
      if (inviteMatch[1] === 'bad') {
        return json({ detail: '邀请不存在' }, 404);
      }
      if (inviteMatch[2]) {
        return json({ target_type: 'group', target_id: 101, conversation_id: 1, status: 'joined' });
      }
      return json(inviteMatch[1] === 'user'
        ? { token: 'user', target_type: 'user', target_id: 5, user: people[4] }
        : { token: 'group', target_type: 'group', target_id: 102, group: searchGroups[1] });
    }
    if (path === '/reports/options') {
      return json({ reasons: [...['垃圾广告', '辱骂骚扰', '色情低俗', '违法违规', '诈骗或钓鱼', '未成年人不宜'].map((reason) => ({ reason, details_required: false })), { reason: '其他', details_required: true }], details_min_length: 10, max_evidence_messages: 3, max_attachments: 6 });
    }
    if (path === '/reports/quota') {
      return json({ score: 0, daily_quota: 10, used_today: 3, remaining_today: 7 });
    }
    if (path === '/uploads/message-image') {
      return json({ url: pictures[Math.floor(Math.random() * pictures.length)] });
    }
    if (path === '/conversations') {
      return json(conversations);
    }
    if (/\/members\/\d+$/.test(path)) {
      return json(members.find((member) => path.endsWith(`/${member.user_id}`)) ?? members[0]);
    }
    return json([]);
  };

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
  queryClient.setQueryData(['conversations'], conversations);
  useKukeStore.setState({ token: 'harness', currentUser: me, activeConversationId: 1, layoutMode: 'desktop', themeMode: 'light', searchableConversationIds: [1, 2] });

  const groups: Array<{ title: string; items: Array<{ id: string; label: string; open: View; before?: () => void }> }> = [
    { title: '全局搜索', items: [
      { id: 'search', label: '推荐', open: { kind: 'globalSearch', keyword: '' } },
      { id: 'search-kw', label: '关键词', open: { kind: 'globalSearch', keyword: '碰撞' } },
      { id: 'search-none', label: '无结果', open: { kind: 'globalSearch', keyword: 'zzz' } }
    ] },
    { title: '公告', items: [
      { id: 'ann', label: '公告中心', open: { kind: 'systemAnnouncements' } },
      { id: 'notice', label: '群公告·管理员', open: { kind: 'groupAnnouncements', canPublish: true } },
      { id: 'notice-ro', label: '群公告·成员', open: { kind: 'groupAnnouncements', canPublish: false } }
    ] },
    { title: '消息', items: [
      { id: 'chat-search', label: '聊天记录搜索', open: { kind: 'chatSearch' } },
      { id: 'featured', label: '精华消息', open: { kind: 'featured' } },
      { id: 'forward', label: '转发', open: { kind: 'forward' } },
      { id: 'bundle', label: '合并转发详情', open: { kind: 'bundle' } }
    ] },
    { title: '资料卡', items: [
      { id: 'card-friend', label: '好友', open: { kind: 'card', user: people[1], action: 'message' } },
      { id: 'card-stranger', label: '陌生人', open: { kind: 'card', user: people[5], action: 'add' } },
      { id: 'card-long', label: '长文本·已申请', open: { kind: 'card', user: people[4], action: 'pending' } },
      { id: 'card-bot', label: '机器人', open: { kind: 'card', user: people[3], action: 'none' } }
    ] },
    { title: '看图', items: [
      { id: 'viewer', label: '多张', open: { kind: 'viewer', state: { images: pictures, index: 1 } } },
      { id: 'viewer-one', label: '单张·小图', open: { kind: 'viewer', state: { images: [pictures[4]], index: 0 } } }
    ] },
    { title: '加群 / 邀请', items: [
      { id: 'create', label: '创建群聊', open: { kind: 'createGroup' } },
      { id: 'recommend', label: '推荐·直接加入', open: { kind: 'recommend', groupId: 101 } },
      { id: 'recommend-q', label: '推荐·要回答', open: { kind: 'recommend', groupId: 103 } },
      { id: 'recommend-404', label: '推荐·找不到', open: { kind: 'recommend', groupId: 999 } },
      { id: 'invite', label: '邀请·群', open: { kind: 'invite', token: 'group' } },
      { id: 'invite-user', label: '邀请·好友', open: { kind: 'invite', token: 'user' } },
      { id: 'invite-bad', label: '邀请·失效', open: { kind: 'invite', token: 'bad' } }
    ] },
    { title: '举报', items: [
      { id: 'report', label: '举报消息', open: { kind: 'report', target: 'message' } },
      { id: 'report-user', label: '举报用户', open: { kind: 'report', target: 'user' } }
    ] }
  ];

  function Harness(): JSX.Element {
    const [theme, setTheme] = useState<'light' | 'dark'>('light');
    const [preset, setPreset] = useState(false);
    const [empty, setEmpty] = useState(false);
    const [slow, setSlow] = useState(false);
    // 手机布局：只为了确认旧界面那一支还照常渲染，不是这个预览页的重点
    const [mobile, setMobile] = useState(false);
    const [view, setView] = useState<View | null>(null);
    const [serial, setSerial] = useState(0);
    const [reactionMode, setReactionMode] = useState(announcementReactionScenario.mode);
    const [annLoad, setAnnLoad] = useState(announcementLoad.mode);
    // 正式界面里这一段在 ChatDashboard；预览页没有它，自己接一下实时事件
    useEffect(() => subscribeRealtimeEvents((event) => {
      if (event.rawType === 'announcement.reaction.updated') {
        applyAnnouncementReactionEvent(queryClient, event.data);
      }
    }), []);
    const cardHostRef = useRef<HTMLDivElement>(null);
    const themeRoot = useThemeRootProps(theme);
    const close = (): void => setView(null);
    const buttonStyle = { padding: '5px 8px', border: '1px solid var(--kc-border-strong)', borderRadius: 6, textAlign: 'left' as const, fontSize: 12 };

    return (
      <main data-theme={theme} data-layout={mobile ? 'mobile' : 'desktop'} data-font-scale={1} data-kc-wallpaper={themeRoot['data-kc-wallpaper']} style={{ ...themeRoot.style, display: 'flex', height: '100%', minHeight: 0, color: 'var(--kc-text)' }} className="kc-desktop-app">
        <aside data-harness="controls" style={{ display: 'flex', width: 176, flex: 'none', flexDirection: 'column', gap: 4, overflowY: 'auto', padding: 10, borderRight: '1px solid var(--kc-border)', background: 'var(--kc-list)', fontSize: 12 }}>
          <strong>预览控制</strong>
          <button type="button" data-harness="theme" style={buttonStyle} onClick={() => {
            const next = theme === 'light' ? 'dark' : 'light';
            setTheme(next);
            useKukeStore.setState({ themeMode: next });
          }}>切换深浅色（{theme}）</button>
          <button type="button" data-harness="preset" style={buttonStyle} onClick={() => {
            useKukeStore.getState().updateThemeSettings(preset ? { presetId: 'classic', wallpaper: 'none', wallpaperScope: 'chat' } : { presetId: 'sakura', wallpaper: 'blossom', wallpaperScope: 'window' });
            setPreset(!preset);
          }}>{preset ? '回到经典主题' : '樱花 + 整窗背景'}</button>
          <button type="button" data-harness="empty" style={buttonStyle} onClick={() => {
            scenario.empty = !empty;
            setEmpty(!empty);
            void queryClient.invalidateQueries();
          }}>数据：{empty ? '全部为空' : '正常'}</button>
          <button type="button" data-harness="slow" style={buttonStyle} onClick={() => {
            scenario.slow = !slow;
            setSlow(!slow);
          }}>接口：{slow ? '慢（4 秒）' : '正常'}</button>
          <button type="button" data-harness="layout" style={buttonStyle} onClick={() => {
            useKukeStore.setState({ layoutMode: mobile ? 'desktop' : 'mobile' });
            setMobile(!mobile);
            setView(null);
          }}>布局：{mobile ? '手机（旧界面）' : '桌面'}</button>
          <button type="button" data-harness="ann-load" style={buttonStyle} onClick={() => {
            // 「一直加载」排在最后：再点一下回到正常并放行，正好看骨架换成内容
            const modes = ['normal', 'fail', 'cover', 'hang'] as const;
            const next = modes[(modes.indexOf(annLoad) + 1) % modes.length];
            announcementLoad.mode = next;
            announcementLoad.release.splice(0).forEach((release) => release());
            setAnnLoad(next);
            // 丢掉没在用的缓存，下次打开公告中心从头加载；开着的那一份不动，留着点「重试」
            queryClient.removeQueries({ queryKey: ['announcement'], type: 'inactive' });
          }}>公告加载：{{ normal: '正常', hang: '一直加载', fail: '失败', cover: '封面地址不通' }[annLoad]}</button>
          <button type="button" data-harness="reaction-mode" style={buttonStyle} onClick={() => {
            const modes = ['normal', 'muted', 'rate', 'offline', 'unsupported'] as const;
            const next = modes[(modes.indexOf(reactionMode) + 1) % modes.length];
            announcementReactionScenario.mode = next;
            setReactionMode(next);
            // 「不支持」会连公告里的 reactions 字段和 reaction-options 一起变，重新拉一遍
            void queryClient.invalidateQueries({ queryKey: ['announcement'] });
            void queryClient.invalidateQueries({ queryKey: ['announcement-reaction-options'] });
          }}>公告回应：{{ normal: '正常', muted: '被禁言', rate: '操作太快', offline: '公告已下线', unsupported: '服务端不支持' }[reactionMode]}</button>
          <button type="button" data-harness="reaction-push" style={buttonStyle} onClick={() => [1, 2, 3, 4].forEach(simulateAnnouncementReactions)}>公告回应：别人来一轮</button>
          {groups.map((group) => (
            <div key={group.title} style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
              <span style={{ color: 'var(--kc-muted)', fontWeight: 700 }}>{group.title}</span>
              {group.items.map((item) => (
                <button key={item.id} type="button" data-harness={item.id} style={buttonStyle} onClick={() => {
                  queryClient.removeQueries({ queryKey: ['global-search'] });
                  setSerial((value) => value + 1);
                  setView(item.open);
                }}>{item.label}</button>
              ))}
            </div>
          ))}
        </aside>
        {mobile ? null : <ThemeEffects scheme={theme} />}
        {mobile ? null : <NavRail view="chat" unreadCount={17} hasUnseenAnnouncement onNavigate={() => undefined} onCreateGroup={() => setView({ kind: 'createGroup' })} onOpenAnnouncement={() => setView({ kind: 'systemAnnouncements' })} onOpenSettings={() => undefined} />}
        {mobile ? null : <div style={{ display: 'grid', width: 268, flex: 'none' }}><ConversationPane conversations={conversations} isLoading={false} currentUser={me} onCreateGroup={() => setView({ kind: 'createGroup' })} onOpenGlobalSearch={() => setView({ kind: 'globalSearch', keyword: '' })} /></div>}
        <div ref={cardHostRef} style={{ position: 'relative', minWidth: 0, flex: 1 }}>
          {/* 聊天面板只是垫在后面的背景；别人正在改它的时候可能报错，不让它把整页带崩 */}
          {mobile ? null : <ErrorBoundary><DesktopChatPanel conversations={conversations} currentUser={me} currentRole="owner" members={members} friends={friends} /></ErrorBoundary>}
          {view?.kind === 'card' ? (
            <UserCard
              key={serial}
              user={view.user}
              anchor={{ left: 96, top: 120 }}
              containerRef={cardHostRef}
              action={view.action === 'message' ? { label: '发消息', onClick: close } : view.action === 'add' ? { label: '添加好友', onClick: close } : view.action === 'pending' ? { label: '已申请', disabled: true, tone: 'muted', helperText: '好友申请已发送，等待对方通过' } : undefined}
              onClose={close}
            />
          ) : null}
          {view?.kind === 'groupAnnouncements' ? <GroupAnnouncementModal key={serial} conversation={conversations[0]} canPublish={view.canPublish} mobile={mobile} onClose={close} /> : null}
        </div>

        {view?.kind === 'globalSearch' ? <GlobalSearchModal key={serial} currentUser={me} friends={friends} initialKeyword={view.keyword} mobile={mobile} onClose={close} /> : null}
        {view?.kind === 'systemAnnouncements' ? <SystemAnnouncementModal key={serial} initialId={3} mobile={mobile} onClose={close} /> : null}
        {view?.kind === 'chatSearch' ? <ChatSearchOpener key={serial} /> : null}
        {view?.kind === 'featured' ? <FeaturedMessagesModal key={serial} mobile={mobile} conversationId={conversations[0].id} canManage isToggling={false} onToggleFeature={() => undefined} onOpenForwardBundle={() => setView({ kind: 'bundle' })} onClose={close} /> : null}
        {view?.kind === 'forward' ? <ForwardTargetModal key={serial} conversations={empty ? [] : conversations} currentUser={me} activeConversationId={1} messageIds={[801, 802, 803]} isPending={false} onConfirm={close} onClose={close} /> : null}
        {view?.kind === 'bundle' ? <ForwardBundleDetailModal key={serial} message={empty ? { ...bundle, metadata: { title: '空的聊天记录' } } as unknown as Message : bundle} mobile={mobile} onClose={close} /> : null}
        {view?.kind === 'viewer' ? <ImageViewer viewer={view.state} mobile={mobile} onClose={close} onNavigate={(index) => setView({ kind: 'viewer', state: { ...view.state, index } })} /> : null}
        {view?.kind === 'createGroup' ? <CreateGroupModal key={serial} mobile={mobile} friends={empty ? [] : [...friends, ...friends.map((item, index) => ({ ...item, id: 10 + index, friend: { ...item.friend, id: 20 + index, nickname: `${item.friend?.nickname ?? ''} 二号` } as User }))]} onClose={close} /> : null}
        {view?.kind === 'recommend' ? <RecommendedGroupJoinHost key={serial} groupId={view.groupId} onClosed={close} /> : null}
        {view?.kind === 'invite' ? <InviteModal key={serial} token={view.token} onClose={close} /> : null}
        {view?.kind === 'report' ? (
          <ReportModal
            key={serial}
            targetType={view.target}
            targetId={view.target === 'message' ? 804 : 5}
            targetLabel={view.target === 'message' ? `消息：${LONG_TEXT.slice(0, 48)}` : `用户：${LONG_NAME}`}
            conversationId={1}
            reportedUserId={5}
            evidenceCandidates={view.target === 'user' ? [history[3], history[2], history[7], history[1], history[0]] : undefined}
            error={null}
            onSubmit={close}
            onClose={close}
          />
        ) : null}
      </main>
    );
  }

  /** 推荐加群的弹窗读写的是全局状态里的那一条请求，这里代为放进去、关掉后清掉。 */
  function RecommendedGroupJoinHost({ groupId, onClosed }: { groupId: number; onClosed: () => void }): JSX.Element | null {
    const request = useKukeStore((state) => state.recommendedGroupJoinRequest);
    const [opened, setOpened] = useState(false);
    useEffect(() => {
      useKukeStore.getState().openRecommendedGroupJoinRequest(groupId, groupId === 103 ? '来看看我们的新作品吧！\n每周都有活动。' : '');
      setOpened(true);
      return () => useKukeStore.getState().closeRecommendedGroupJoinRequest();
    }, [groupId]);
    useEffect(() => {
      if (opened && !request) {
        onClosed();
      }
    }, [onClosed, opened, request]);
    return request ? <RecommendedGroupJoinModal request={request} conversations={conversations} /> : null;
  }

  createRoot(document.getElementById('root') as HTMLElement).render(
    <QueryClientProvider client={queryClient}>
      <Harness />
    </QueryClientProvider>
  );
}

void start();
