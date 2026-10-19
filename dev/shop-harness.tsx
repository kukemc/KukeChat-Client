/**
 * 商店和气泡皮肤的本地预览：不连后端，用假数据（dev/mocks/shop.ts）驱动真实组件。
 *
 *   npx vite --port 5185 --strictPort --host 127.0.0.1   →   http://127.0.0.1:5185/dev/shop-harness.html
 *
 * 初始状态可以写在地址里，方便截图：
 *   view=shop|chat|gallery|frames|settings|app  layout=desktop|mobile       theme=dark
 *     （app 是整个主界面 ChatDashboard：看导航栏里的入口、移动端「空间」页里的入口、从设置直达商店这些接线）
 *   backend=ok|missing|error             bound=0                      donated=520  spent=240  level=23
 *   neverVerified=1（绑定后从没核实过）   noDonateUrl=1（服务端没配置官方作品）
 *   stale=1                              purchaseError=item_not_found|item_unavailable|already_owned|ccw_not_bound|item_locked|insufficient_coins|verification_unavailable|server
 *   refreshError=refresh_too_fast|ccw_not_bound|server                equipFails=1
 *   equipped=bubble.starry|none          owned=bubble.snow,bubble.sunny                        records=45
 *   frame=frame.cat|none（装备的头像框）
 *   others=0（不显示别人的皮肤）           perf=1（性能优先）            preset=sakura  wallpaper=chat|window  font=0..4
 *   w=980 h=680（桌面预览的尺寸）
 *
 * 红包（假后端在 dev/mocks/redPackets.ts）：view=chat 的群里有各种状态的红包，输入区工具栏上有「发红包」，商店页有「红包记录」。
 *   conv=2（进和阿夸的私聊：只能发普通红包、个数固定 1，自己发的自己不能领）
 *   rpBackend=ok|disabled|missing        rpSendError=…  rpClaimError=…（取值见控制条上的两个下拉框）
 *   rpPendingBackend=missing（有红包、但没有 GET /red-packets/pending 的旧后端：聊天区右上角的「N 个红包未领」不出现）
 *   聊天区右上角的「N 个红包未领」：群里默认有三个能领的（最早的那个要往上翻），点一下跳到最早的，再点跳下一个；控制条上的抢、过期、撤回、别人发都会让它跟着变。
 *   rpMany=30（群里再塞 30 个红包，数请求数用）
 *   rpOpen=1（打开页面就点开最新的那个红包）  rpSend=1（打开页面就弹出发红包）  rpRecords=1（打开红包记录）
 *   接龙 / 专属红包：群里末尾有接龙红包（领过的人自动发出的口令带「接龙」标记）、给我的专属红包、给别人的专属红包、专属 + 接龙。
 *   rpFeatures=none（还没有接龙 / 专属的旧后端：发红包面板里不出现新选项）  rpGroupMuted=1（我在群里被禁言：领接龙红包得到 muted_in_group）
 *   rpOpenId=<红包 id>（打开页面就点开这个红包）
 * B 站视频卡片：群里有几条带 B 站链接的消息（BV、av、m.bilibili.com、b23.tv、拿不到的、不是视频的），假接口在这里的 installFetch。
 * 控制条上「红包」那一组按钮模拟别人发、别人抢、过期、撤回（都会发 red_packet.updated 事件；过期、撤回还会发 shop.balance.changed）。
 * 会话列表上的「[有红包]」在 view=app 里看（桌面是左边的列表，layout=mobile 是会话页）：别人发一个 → 置上；抢掉 / 过期 / 撤回到一个不剩 → 摘掉。
 * 假后端返回会话列表时按当时的红包状态带上 red_packet_pending。
 * 「[有人@我]」「[@全体成员]」同样在 view=app 里看：「@」那一组按钮让别人在没开着的那个会话里 @我 / @全体，「读掉」把它标成已读。
 *
 * view=gallery 是「皮肤图鉴」：每个纹样、每个角饰、每种动效单独一格，再加几件组合起来的示例皮肤，
 * 每格旁边有文字和底色的对比度读数（低于 4.5 标红）。
 * view=frames 是「头像框图鉴」：默认上架的八件在各档头像尺寸、浅色和深色下的样子，每个装饰、每个位置、每种动效，以及不合法的样式。
 * view=chat 里的群友各带各的头像框；控制条上的「阿夸换头像框」模拟 user.cosmetics.updated，已经显示出来的消息头像应该跟着变。
 *
 * 限时商品（假后端同 dev/mocks/shop.ts）：头像框里的「天使」120 币 / 30 天、「小恶魔」50 币 / 30 天。
 *   expiring=frame.angel:2（我已经拥有并装备着「天使」，还剩 2 天；冒号后面是天数，可以是小数）
 *   控制条「限时」那一组：让「天使」还剩 2 天 / 10 秒后到期、发 shop.item.expiring、现在就到期（发 shop.item.expired 和 user.cosmetics.updated）
 *
 * 礼物（假后端在 dev/mocks/gifts.ts）和生日（dev/mocks/birthday.ts）：
 *   view=gifts（图鉴页：十二个礼物图形 + 兜底礼盒、各种礼物卡片、礼物墙（别人的 / 自己的 / 空的）、资料卡、好友生日提示、心意榜、生日设置）
 *   giftBackend=ok|disabled|missing     giftSendError=…（取值见控制条上的下拉框）   giftExtra=1（目录里加上六个备用图形和一个不认识的图形）
 *   charmLabel=人气值（改名，看界面上是不是处处跟着变）                giftSend=1（打开页面就弹出送礼面板）  giftRecords=1（打开礼物记录）
 *   giftFx=2|3|castle（打开页面就播一段 tier 2 / tier 3 动效，方便截图）
 *   birthday=today|none|2008-05-07      birthdayShowYear=1     birthdayBackend=missing
 *   birthdaySaveError=invalid_birthday|server                          friendBirthday=0（阿夸今天不过生日；默认过）
 *   celebrate=1（生日是今天、今年还没播过：打开页面就播庆生动画；配 perf=1 看静态贺卡）
 * view=chat 的群里有几张礼物卡片（礼物 ×N、带留言、送头像框、送气泡、送给我的）；输入区工具栏上有「送礼物」，消息头像的右键菜单里也有。
 * 控制条「礼物」那一组模拟别人送我 / 送别人（会发 message.created 那一套和 gift.received），「动效」那几个直接把动效排进队列。
 *
 * 脚本测试用 window.__shop：scenario / state（直接改拥有、装备）/ requests / store / queryClient / emit(type, data)，
 * 以及红包的 redPacket：{ scenario, state, requests }、礼物的 gift：{ scenario, state, requests, ui }、生日的 birthday：{ scenario, state, requests }。
 * 只用于开发时看界面，不会进入任何构建产物。
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@/styles/tailwind.css';
import { featureMocks } from './mocks';
import { birthdayRequests, birthdayScenario, birthdayState } from './mocks/birthday';
import { giftRequests, giftScenario, giftState, type GiftScenario } from './mocks/gifts';
import { redPacketRequests, redPacketScenario, redPacketState, type RedPacketScenario } from './mocks/redPackets';
import { FRAMES, SKINS, shopRequests, shopScenario, shopState, type ShopScenario } from './mocks/shop';
import { ChatDashboard } from '@/components/chat/ChatDashboard';
import { DesktopChatPanel } from '@/components/chat/desktop/DesktopChatPanel';
import { MessagePanel } from '@/components/chat/MessagePanel';
import { AppearanceSection } from '@/components/settings/desktop/PreferenceSections';
import { NavRail } from '@/components/shell/NavRail';
import { BubbleStage, tryOnSamples, type SampleMessage } from '@/components/shop/BubbleSample';
import { BirthdayToday, FriendBirthdayBanner } from '@/components/birthday/BirthdayBits';
import { BirthdayCelebration, forgetBirthdayPlayed } from '@/components/birthday/BirthdayCelebration';
import { BirthdaySetting } from '@/components/birthday/BirthdaySetting';
import { CharmLeaderboard } from '@/components/gifts/CharmLeaderboard';
import { handleGiftEvent } from '@/components/gifts/data';
import { GiftCard } from '@/components/gifts/GiftCard';
import { SendGiftButton } from '@/components/gifts/GiftEntry';
import { GIFT_ICON_NAMES, GiftGlyph } from '@/components/gifts/GiftGlyph';
import { GiftEffectsHost, GiftSendHost } from '@/components/gifts/GiftHosts';
import { GiftRecords } from '@/components/gifts/GiftRecords';
import { GiftToasts } from '@/components/gifts/GiftToasts';
import { GiftWall } from '@/components/gifts/GiftWall';
import { UserLevelCard } from '@/components/level/UserLevelCard';
import { noteGiftArrival, useGiftUi } from '@/components/gifts/ui';
import { UserCardDesktop } from '@/components/ui/desktop/UserCardDesktop';
import { giftOf } from '@/utils/gift';
import { handleRedPacketEvent, noteRedPacketMessage } from '@/components/redpacket/data';
import { RedPacketRecords } from '@/components/redpacket/RedPacketRecords';
import { SendRedPacketDialog } from '@/components/redpacket/SendRedPacketDialog';
import { useRedPacketUi } from '@/components/redpacket/ui';
import { handleShopEvent, useShopAvailable } from '@/components/shop/data';
import { ShopPage } from '@/components/shop/desktop/ShopPage';
import { MobileShopPage } from '@/components/shop/mobile/MobileShopPage';
import { ShopGrantToasts } from '@/components/shop/ShopGrantToasts';
import { parseAvatarFrame } from '@/components/shop/skin/avatarFrame';
import { parseBubbleSkin } from '@/components/shop/skin/bubbleSkin';
import { FRAME_ONLY_ORNAMENT_KEYS, FRAME_POSITIONS, FrameOrnamentGlyph } from '@/components/shop/skin/frameOrnaments';
import { Ornament, ORNAMENT_KEYS } from '@/components/shop/skin/ornaments';
import { PATTERN_KEYS } from '@/components/shop/skin/patterns';
import { Avatar } from '@/components/ui/Avatar';
import { CoinIcon } from '@/components/ui/CoinIcon';
import { Icon } from '@/components/ui/Icon';
import { applyCreatedMessageToConversations, upsertMessageIntoFirstPage, type MessagesInfiniteData } from '@/realtime/cache';
import { emitRealtimeEvent } from '@/realtime/events';
import { useKukeStore, type UiFontScale } from '@/store/kukeStore';
import { useShopPrefs } from '@/store/shopPrefs';
import { ThemeEffects } from '@/theme/ThemeEffects';
import { DEFAULT_THEME_SETTINGS, getThemePreset } from '@/theme/themes';
import { useThemeStore } from '@/theme/themeStore';
import { useThemeRootProps } from '@/theme/useTheme';
import type { Conversation, ConversationMember, Message, User } from '@/types/api';
import { markConversationReadLocally } from '@/store/readMarks';
import { messageMentionKind } from '@/utils/mentions';
import { redPacketOf } from '@/utils/redPacket';

const params = new URLSearchParams(window.location.search);
type View = 'shop' | 'chat' | 'gallery' | 'frames' | 'gifts' | 'settings' | 'app';
const VIEWS: View[] = ['shop', 'chat', 'gallery', 'frames', 'gifts', 'settings', 'app'];
const isGallery = (view: View): view is 'gallery' | 'frames' | 'gifts' => view === 'gallery' || view === 'frames' || view === 'gifts';

/* ───────── 聊天预览的假数据：群友各穿各的皮肤、各带各的头像框 ───────── */

const me = { id: 1, username: 'kuke', nickname: '酷可mc', ccw_student_oid: '6650a1b2c3d4e5f6a7b8c9d0', ccw_name: '酷可mc' } as User;
const wearing = (style: unknown, sku: string, frame?: keyof typeof FRAMES): User['cosmetics'] => ({ ...(style ? { bubble: { sku, style } } : {}), ...(frame ? { frame: { sku: `frame.${frame}`, style: FRAMES[frame] } } : {}) });
const people: User[] = [
  me,
  { id: 2, username: 'aqua', nickname: '阿夸', cosmetics: wearing(SKINS.starry, 'bubble.starry', 'starring') } as User,
  { id: 3, username: 'mint', nickname: '薄荷糖', cosmetics: wearing(SKINS.sakura, 'bubble.sakura', 'sakura') } as User,
  { id: 4, username: 'robot', nickname: '任务小助手', is_bot: true, cosmetics: wearing(null, '', 'halo') } as User,
  { id: 5, username: 'long', nickname: '一个名字特别特别长的群友用来测试截断', cosmetics: wearing(SKINS.pixel, 'bubble.pixel', 'cat') } as User,
  { id: 6, username: 'plain', nickname: '没装扮的路人', cosmetics: {} } as User,
  // 只有头像框、没有气泡皮肤
  { id: 7, username: 'old', nickname: '旧后端的用户' } as User,
  // 气泡和头像框的数据都是坏的：两样都应该按没装备处理
  { id: 8, username: 'bad', nickname: '皮肤数据坏了的人', cosmetics: { ...wearing({ version: 1, background: 'url(https://evil.example/x.png)', text: '#fff' }, 'bubble.bad'), frame: { sku: 'frame.bad', style: { version: 1, ring: { background: 'url(https://evil.example/x.png)', width: 3 } } } } } as User,
  { id: 9, username: 'aurora', nickname: '极光君', cosmetics: wearing(SKINS.aurora, 'bubble.aurora', 'aurora') } as User,
  { id: 10, username: 'candy', nickname: '糖糖', cosmetics: wearing(SKINS.candy, 'bubble.candy', 'crowned') } as User,
  { id: 11, username: 'angel', nickname: '只带头像框的人', cosmetics: wearing(null, '', 'angel') } as User
];
const members = people.map((user, index) => ({ id: index + 1, conversation_id: 1, user_id: user.id, role: index === 0 ? 'owner' : index === 1 ? 'admin' : 'member', user, joined_at: '2026-01-01T00:00:00Z' }) as ConversationMember);
const conversations = [
  { id: 1, type: 'group', title: 'Scratch 创作交流群', display_title: 'Scratch 创作交流群', member_count: 128, unread_count: 0, updated_at: new Date().toISOString(), my_role: 'owner' },
  // 和阿夸的私聊：看私聊里的红包（只有普通红包、个数固定 1、自己发的自己不能领）
  { id: 2, type: 'direct', title: '阿夸', display_title: '阿夸', direct_user: people[1], member_count: 2, unread_count: 0, updated_at: new Date().toISOString() }
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
  }
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob ? URL.createObjectURL(blob) : ''), 'image/png'));
}

/** 一秒钟的静音 WAV，给语音消息当音频 */
function silence(): string {
  const samples = 8000;
  const buffer = new ArrayBuffer(44 + samples);
  const view = new DataView(buffer);
  const text = (offset: number, value: string): void => Array.from(value).forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples, true);
  text(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true);
  view.setUint32(28, 8000, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  text(36, 'data');
  view.setUint32(40, samples, true);
  new Uint8Array(buffer, 44).fill(128);
  return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
}

async function buildHistory(): Promise<Message[]> {
  const [wide, square] = await Promise.all([picture(640, 360, 200), picture(480, 480, 320)]);
  const voice = silence();
  const start = Date.now() - 40 * 60_000;
  let id = 1000;
  let minute = 0;
  const messages: Message[] = [];
  const say = (sender: User, content: string, extra: Partial<Message> = {}): Message => {
    id += 1;
    minute += 1;
    const message = { id, conversation_id: 1, sender_id: sender.id, sender, type: 'text', content, created_at: new Date(start + minute * 45_000).toISOString(), sender_level: ((sender.id * 7) % 30) + 1, ...extra } as Message;
    messages.push(message);
    return message;
  };
  const [, aqua, mint, bot, long, plain, old, bad, aurora, candy, angel] = people;

  say(aqua, '早');
  say(aqua, '有人在吗，我刚把克隆体的碰撞检测改好了');
  const idea = say(aqua, '说一下思路：先把所有角色的坐标存进列表，每帧只更新移动过的那几个，然后用「碰到颜色」做粗筛，命中了再做精确判断。这样三百个克隆体也不会掉帧。');
  say(me, '好耶');
  say(me, '这个可以，等会发个链接 https://www.ccw.site/detail/6650a1b2c3d4e5f6a7b8c9d0 大家看看');
  say(mint, '哈哈哈哈哈 😂😂😂', { reactions: [{ emoji: '😂', count: 3, reacted_by_me: true }, { emoji: '👍', count: 1, reacted_by_me: false }] } as Partial<Message>);
  say(mint, '@酷可mc 周五晚上的接龙谁来开头', { metadata: { mentions: [{ user_id: 1, name: '酷可mc' }] } } as Partial<Message>);
  say(me, '我来吧', { metadata: { quote: { message_id: idea.id, sender_name: '阿夸', preview: idea.content.slice(0, 60), type: 'text' } } } as Partial<Message>);
  say(long, 'PRESS START');
  say(long, '多行消息\n第二行\n第三行，稍微长一点点用来看换行的表现', { featured: true } as Partial<Message>);
  say(long, '带两张图的消息', { metadata: { images: [wide, square] } } as Partial<Message>);
  say(plain, '我没有装扮，气泡应该是主题默认的');
  say(old, '我的用户对象上没有 cosmetics 字段（旧后端）');
  say(bad, '我的皮肤数据不合法（背景里带了 url），应该按没装备处理');
  say(aurora, '极光会缓缓流动', { bookmarked_by_me: true } as Partial<Message>);
  say(aurora, '回复一下', { metadata: { quote: { message_id: idea.id, sender_name: '阿夸', preview: '说一下思路：先把所有角色的坐标存进列表', type: 'text' } } } as Partial<Message>);
  say(candy, '给你一颗糖 🍬');
  say(candy, '👍');
  say(angel, '我只有头像框，气泡是主题默认的');
  say(bot, '**机器人的 Markdown 消息** 不穿皮肤\n\n| 列 | 值 |\n| --- | --- |\n| a | 1 |', { metadata: { format: 'markdown' } } as Partial<Message>);
  say(aqua, '', { type: 'image', content: wide });
  say(aqua, '', { type: 'voice', content: voice, metadata: { voice: { duration_ms: 4200 } } } as Partial<Message>);
  say(me, '', { type: 'voice', content: voice, metadata: { voice: { duration_ms: 2600 } } } as Partial<Message>);
  say(mint, '[投票] 周五玩什么', { type: 'poll', metadata: { poll: { id: 1, title: '周五玩什么', options: [{ id: 1, text: '接龙', votes: 5 }, { id: 2, text: '速通', votes: 2 }], multiple: false, anonymous: false, closes_at: null, closed: false, closed_at: null, total_voters: 7, my_option_ids: [1] } } } as Partial<Message>);
  say(mint, '薄荷糖 加入了群聊', { type: 'system' });
  say(aqua, '这条被撤回了', { recalled_at: new Date().toISOString() } as Partial<Message>);
  say(me, '学到了。周五晚上的接龙我来开头，大家记得带上自己的角色，规则还是老样子：每人接一段，不许删别人的积木。', { bookmarked_by_me: true, featured: true } as Partial<Message>);
  say(me, '嗯');
  say(aqua, '晚安，好梦', { bookmarked_by_me: true } as Partial<Message>);
  say(mint, '一起去看樱花吧');
  // B 站视频链接：两个能拿到的（封面是 B 站图床上的真图，看防盗链）、一个短链、一个拿不到的（502，不画卡片）、一个不是视频的
  say(aqua, '这首歌循环一天了 https://www.bilibili.com/video/BV1GJ411x7h7?spm_id_from=333.337 ，好听');
  say(long, 'm.bilibili.com/video/av170001 老视频了，弹幕很多');
  say(mint, '短链也行 https://b23.tv/kuke123 。还有个打不开的 https://www.bilibili.com/video/BV1xx411c7mD');
  say(candy, 'UP 主主页不是视频：https://space.bilibili.com/2');

  // 红包：每种状态一个。seed 只造数据、不扣币；消息对象由假后端给（type、metadata.red_packet、兜底的 content）
  const packet = (options: Parameters<typeof redPacketState.seed>[0]): void => {
    id += 1;
    minute += 1;
    messages.push({ ...redPacketState.seed({ ...options, messageId: id }), created_at: new Date(start + minute * 45_000).toISOString() });
  };
  packet({ senderId: candy.id, conversationId: 1, kind: 'lucky', amount: 66, count: 5, greeting: '已经被抢完的拼手气', claimedBy: [aqua.id, mint.id, long.id, plain.id, aurora.id], minutesAgo: 30 });
  packet({ senderId: aurora.id, conversationId: 1, kind: 'lucky', amount: 88, count: 6, greeting: '我已经领过的这个', claimedBy: [aqua.id, me.id, mint.id], minutesAgo: 25 });
  packet({ senderId: long.id, conversationId: 1, kind: 'normal', amount: 5, count: 4, greeting: '过期了的红包', claimedBy: [aqua.id], status: 'expired', minutesAgo: 60 * 30 });
  packet({ senderId: mint.id, conversationId: 1, kind: 'normal', amount: 10, count: 3, greeting: '被撤回的红包', status: 'revoked', minutesAgo: 20 });
  packet({ senderId: me.id, conversationId: 1, kind: 'lucky', amount: 100, count: 8, greeting: '我发的，还没领完', claimedBy: [aqua.id, mint.id], minutesAgo: 12 });
  packet({ senderId: mint.id, conversationId: 1, kind: 'normal', amount: 8, count: 10, greeting: '普通红包，每人 8 币', claimedBy: [aqua.id, long.id], minutesAgo: 6 });
  say(aqua, '发个红包庆祝一下新版本');
  packet({ senderId: aqua.id, conversationId: 1, kind: 'lucky', amount: 120, count: 10, greeting: '新版本上线，大家辛苦啦，祝福语写得特别特别长看看两行截断', claimedBy: [mint.id, long.id, candy.id], minutesAgo: 2 });
  // 接龙、专属（docs/red-packets.md 3.6）。接龙红包被领过的那几句话由假后端给，接在红包后面
  const chained = (options: Parameters<typeof redPacketState.seed>[0]): void => {
    packet(options);
    redPacketState.seedChain().forEach((message) => {
      id += 1;
      minute += 1;
      messages.push({ ...message, id, created_at: new Date(start + minute * 45_000).toISOString() });
    });
  };
  chained({ senderId: aqua.id, conversationId: 1, kind: 'lucky', amount: 60, count: 6, greeting: '接龙红包，领了自动发口令', chainText: '谢谢阿夸老板', claimedBy: [mint.id, long.id], minutesAgo: 2 });
  packet({ senderId: mint.id, conversationId: 1, kind: 'normal', amount: 18, count: 1, greeting: '生日快乐呀', targetUserId: me.id, minutesAgo: 2 });
  packet({ senderId: aqua.id, conversationId: 1, kind: 'normal', amount: 10, count: 1, greeting: '上次的积木教程，谢啦', targetUserId: long.id, minutesAgo: 1 });
  chained({ senderId: candy.id, conversationId: 1, kind: 'normal', amount: 6, count: 1, greeting: '专属的接龙红包', chainText: '收到，谢谢糖糖', targetUserId: me.id, minutesAgo: 1 });
  packet({ senderId: me.id, conversationId: 1, kind: 'normal', amount: 20, count: 1, greeting: '我发给阿夸的专属红包', targetUserId: aqua.id, minutesAgo: 1 });
  // 语音红包：短口令、写满 30 字的长口令（正面要缩字号才放得下，不能压到话筒底下）；再一个写满 30 字的祝福语
  packet({ senderId: mint.id, conversationId: 1, kind: 'lucky', amount: 30, count: 5, greeting: '念对了就能领', voiceText: '芝麻开门', minutesAgo: 1 });
  packet({ senderId: aqua.id, conversationId: 1, kind: 'lucky', amount: 50, count: 5, greeting: '新版本上线啦，祝福语也写得长一点看看一行截断', voiceText: '酷可聊天新版本上线了大家一起来念这句很长很长的口令吧', minutesAgo: 1 });
  packet({ senderId: candy.id, conversationId: 1, kind: 'normal', amount: 5, count: 3, greeting: '祝福语写满三十个字看看封口上能不能放下不压到开字', minutesAgo: 1 });
  // 礼物：礼物 ×N、带留言、送头像框（限时）、送气泡（永久）、送给我的。seed 只造数据、不扣币
  const present = (options: Parameters<typeof giftState.seed>[0]): void => {
    id += 1;
    minute += 1;
    const message = giftState.seed({ ...options, conversationId: 1, messageId: id });
    if (message) {
      messages.push({ ...message, created_at: new Date(start + minute * 45_000).toISOString() });
    }
  };
  present({ fromId: mint.id, toId: aqua.id, conversationId: 1, giftKey: 'flower', count: 9, minutesAgo: 9 });
  present({ fromId: candy.id, toId: long.id, conversationId: 1, giftKey: 'cake', count: 3, message: '生日快乐！祝你的作品都上首页，留言写得长一点看看卡片里是怎么折行和截断的', minutesAgo: 8 });
  present({ fromId: aqua.id, toId: mint.id, conversationId: 1, itemSku: 'frame.angel', message: '这个头像框很适合你', minutesAgo: 7 });
  present({ fromId: me.id, toId: aqua.id, conversationId: 1, giftKey: 'rocket', count: 1, message: '冲！', minutesAgo: 6 });
  present({ fromId: aurora.id, toId: me.id, conversationId: 1, itemSku: 'bubble.starry', message: '送你一片星空', minutesAgo: 5 });
  present({ fromId: mint.id, toId: me.id, conversationId: 1, giftKey: 'lollipop', count: 1, minutesAgo: 4 });
  for (let index = 0; index < (Number(params.get('rpMany')) || 0); index += 1) {
    packet({ senderId: people[2 + (index % 8)].id, conversationId: 1, kind: index % 2 ? 'lucky' : 'normal', amount: index % 2 ? 30 : 3, count: 5, greeting: `第 ${index + 1} 个`, minutesAgo: 1 });
  }

  // 私聊（会话 2）
  const direct = (sender: User, content: string): void => {
    id += 1;
    minute += 1;
    messages.push({ id, conversation_id: 2, sender_id: sender.id, sender, type: 'text', content, created_at: new Date(start + minute * 45_000).toISOString() } as Message);
  };
  const directPacket = (options: Parameters<typeof redPacketState.seed>[0]): void => {
    id += 1;
    minute += 1;
    messages.push({ ...redPacketState.seed({ ...options, conversationId: 2, messageId: id }), created_at: new Date(start + minute * 45_000).toISOString() });
  };
  direct(aqua, '在吗');
  directPacket({ senderId: aqua.id, conversationId: 2, kind: 'normal', amount: 20, count: 1, greeting: '请你喝奶茶', minutesAgo: 9 });
  direct(me, '谢谢！回你一个');
  directPacket({ senderId: me.id, conversationId: 2, kind: 'normal', amount: 15, count: 1, greeting: '我发的，等对方领', minutesAgo: 5 });
  directPacket({ senderId: me.id, conversationId: 2, kind: 'normal', amount: 6, count: 1, greeting: '对方已经领了', claimedBy: [aqua.id], minutesAgo: 4 });
  return messages;
}

/** B 站视频卡片的假数据。封面用 B 站图床上的真图：看不带 Referer 能不能显示出来 */
const BILIBILI_VIDEOS = [
  { match: /BV1GJ411x7h7|av80433022/i, data: { bvid: 'BV1GJ411x7h7', aid: 80433022, title: '【官方 MV】Never Gonna Give You Up - Rick Astley', cover: 'https://i1.hdslb.com/bfs/archive/5242750857121e05146d5d5b13a47a2a6dd36e98.jpg', owner_name: '索尼音乐中国', duration: 213, views: 91234567, danmaku: 132000, url: 'https://www.bilibili.com/video/BV1GJ411x7h7' } },
  { match: /av170001/i, data: { bvid: 'BV17x411w7KC', aid: 170001, title: '【MV】保加利亚妖王AZIS视频合辑，标题写得长一点看看两行之后是怎么截断的', cover: 'https://i2.hdslb.com/bfs/archive/1ada8c32a9d168e4b2ee3e010f24789ba3353785.jpg', owner_name: '冰封.虾子', duration: 772, views: 66021, danmaku: 9821, url: 'https://www.bilibili.com/video/BV17x411w7KC' } },
  // 短链：封面拿不到（看占位）
  { match: /b23\.tv\/kuke123/i, data: { bvid: 'BV1uv411q7Mv', aid: null, title: 'Scratch 三百个克隆体不掉帧的碰撞检测', cover: 'https://i0.hdslb.com/bfs/archive/not-a-real-cover-for-kukechat-preview.jpg', owner_name: '一个名字特别特别长的 UP 主用来测试截断', duration: 3725, views: 1234, danmaku: 12, url: 'https://www.bilibili.com/video/BV1uv411q7Mv' } }
];

/** 发过哪些 B 站卡片请求（给脚本核对「同一个链接只问一次」） */
const bilibiliRequests: string[] = [];

/** 两个会话的消息都在这一个数组里，按 conversation_id 分 */
const harnessHistory: Message[] = [];

/** 假后端记的未读：每个会话几条没读、里面有没有 @我。「读掉」和标记已读的请求会清掉 */
const harnessUnread: Record<number, { count: number; mention: 'me' | 'all' | null }> = {};

/** 会话列表现在该是什么样：带上假后端算出来的 red_packet_pending，以及每个会话的最后一条消息 */
function conversationsNow(): Conversation[] {
  return conversations.map((conversation) => {
    const last = [...harnessHistory].reverse().find((message) => message.conversation_id === conversation.id);
    const unread = harnessUnread[conversation.id];
    return { ...conversation, last_message: last, updated_at: last?.created_at ?? conversation.updated_at, unread_count: unread?.count ?? 0, mention_pending: unread?.mention ?? null, red_packet_pending: redPacketState.pending(conversation.id) };
  });
}

function installFetch(history: Message[]): void {
  const realFetch = window.fetch.bind(window);
  let nextId = 5000;
  window.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, window.location.origin);
    if (!url.pathname.includes('/api/v1/')) {
      return realFetch(input, init);
    }
    const path = url.pathname.replace(/^.*\/api\/v1/, '');
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
    const respond = (data: unknown): Response => new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (/^\/conversations\/\d+\/messages$/.test(path)) {
      if (method === 'GET') {
        const beforeId = Number(url.searchParams.get('before_id') ?? 0);
        const conversationId = Number(path.split('/')[2]);
        const pool = history.filter((message) => message.conversation_id === conversationId && (!beforeId || message.id < beforeId));
        return respond(pool.slice(-Number(url.searchParams.get('limit') ?? 50)));
      }
      nextId += 1;
      const draft = (body ?? {}) as { content?: string; type?: Message['type']; metadata?: Message['metadata'] };
      const message = { id: nextId, conversation_id: Number(path.split('/')[2]), sender_id: me.id, sender: useKukeStore.getState().currentUser ?? me, type: draft.type ?? 'text', content: draft.content ?? '', metadata: draft.metadata, created_at: new Date().toISOString() } as Message;
      history.push(message);
      return respond(message);
    }
    if (/^\/conversations\/\d+\/read$/.test(path)) {
      delete harnessUnread[Number(path.split('/')[2])];
      return respond({});
    }
    if (path === '/conversations') {
      return respond(conversationsNow());
    }
    // 群成员（发专属红包时选人）：第一页，和按名字搜
    const memberList = path.match(/^\/conversations\/(\d+)\/members(\/search)?$/);
    if (memberList && method === 'GET') {
      const pool = Number(memberList[1]) === 2 ? members.slice(0, 2) : members;
      const needle = (url.searchParams.get('q') ?? url.searchParams.get('search') ?? '').trim().toLowerCase();
      const found = needle ? pool.filter((member) => [member.user?.nickname ?? '', member.user?.username ?? ''].some((value) => value.toLowerCase().includes(needle))) : pool;
      return memberList[2] ? respond(found) : respond({ items: found, total: found.length, limit: 50, offset: 0, has_more: false });
    }
    // B 站视频卡片（GET /link-preview/bilibili?url=…）：两个能拿到的、一个短链，其余 422 / 502
    if (path === '/link-preview/bilibili' && method === 'GET') {
      await new Promise((resolve) => window.setTimeout(resolve, 320));
      bilibiliRequests.push(url.searchParams.get('url') ?? '');
      const target = url.searchParams.get('url') ?? '';
      const fail = (status: number, code: string, message: string): Response => new Response(JSON.stringify({ detail: { code, message } }), { status, headers: { 'Content-Type': 'application/json' } });
      const video = BILIBILI_VIDEOS.find((item) => item.match.test(target));
      if (video) {
        return respond(video.data);
      }
      if (/BV1xx411c7mD/.test(target)) {
        return fail(502, 'preview_unavailable', '暂时拿不到这个视频的信息');
      }
      return fail(422, 'unsupported_link', '不是 B 站视频链接');
    }
    // 个人空间、资料卡取资料：带上心意值和生日
    const profileMatch = path.match(/^\/users\/(\d+)$/);
    if (profileMatch && method === 'GET') {
      return respond(giftState.user(Number(profileMatch[1])));
    }
    if (path === '/friends' && method === 'GET') {
      return respond(friendsNow());
    }
    // 预览页绝不把请求放到真实后端去：不认识的接口一律返回空
    return respond([]);
  };
}

/** 好友列表：群里的前几个人都是我的好友，带着心意值和生日 */
function friendsNow(): unknown[] {
  return people.slice(1, 7).map((user, index) => ({ id: 900 + index, user_id: me.id, friend_id: user.id, user: giftState.user(me.id), friend: giftState.user(user.id), created_at: '2026-03-01T00:00:00Z' }));
}

/* ───────── 皮肤图鉴 ───────── */

function luminance(hex: string): number {
  const value = hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex;
  const channel = (offset: number): number => {
    const part = parseInt(value.slice(offset, offset + 2), 16) / 255;
    return part <= 0.03928 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** 文字和底色（渐变里的每个色标）之间最差的对比度。WCAG 正文要 4.5。 */
function worstContrast(text: string, background: string): number {
  const stops = background.match(/#[0-9a-f]{3,8}/gi) ?? [];
  const textLuminance = luminance(text);
  return Math.min(...stops.map((stop) => {
    const other = luminance(stop);
    return (Math.max(textLuminance, other) + 0.05) / (Math.min(textLuminance, other) + 0.05);
  }));
}

const SHORT: SampleMessage[] = [{ mine: false, text: '今天也要开心呀' }, { mine: true, text: '好' }];
const LONG: SampleMessage[] = [{ mine: false, text: '说一下思路：先把所有角色的坐标存进列表，每帧只更新移动过的那几个，命中了再做精确判断。' }, { mine: true, text: '学到了。\n周五晚上的接龙我来开头，大家记得带上自己的角色。' }];

const LIGHT_BASE = { version: 1, background: '#ffffff', text: '#1f2430', border: { color: '#1f243014', width: 1 }, dark: { background: '#262a33', text: '#eef0f4', border: { color: '#ffffff1f', width: 1 } } };
const DEEP_BASE = { version: 1, background: 'linear-gradient(135deg, #3b4bd8 0%, #6a3fd0 100%)', text: '#ffffff' };

function Cell({ title, style, layout, messages = SHORT, wide = false }: { title: string; style: unknown; layout: 'desktop' | 'mobile'; messages?: SampleMessage[]; wide?: boolean }): JSX.Element {
  const skin = parseBubbleSkin(style);
  const light = skin ? worstContrast(skin.light.text, skin.light.background) : 0;
  const dark = skin ? worstContrast(skin.dark.text, skin.dark.background) : 0;
  const ratio = (value: number): JSX.Element => <b style={{ color: value < 4.5 ? '#e0383e' : 'inherit' }}>{value.toFixed(1)}</b>;
  return (
    <div data-gallery={title} style={{ gridColumn: wide ? 'span 2' : undefined, minWidth: 0, borderRadius: 10, background: 'var(--kc-chat)', boxShadow: 'inset 0 0 0 1px var(--kc-border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '8px 12px 0', color: 'var(--kc-muted)', fontSize: 12 }}>
        <span style={{ fontWeight: 700, color: 'var(--kc-text)' }}>{title}</span>
        {skin ? <span title="文字与底色最差的对比度：浅色 / 深色">对比度 {ratio(light)} / {ratio(dark)}</span> : <span style={{ color: '#e0383e' }}>不是合法的皮肤</span>}
      </div>
      <BubbleStage style={style} messages={messages} layout={layout} avatars={wide} />
    </div>
  );
}

function Gallery({ layout }: { layout: 'desktop' | 'mobile' }): JSX.Element {
  const heading: CSSProperties = { margin: '22px 0 10px', fontSize: 15, fontWeight: 700 };
  const grid: CSSProperties = { display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${layout === 'mobile' ? 200 : 250}px, 1fr))`, gap: 12 };
  return (
    <div className="kui-scroll" data-harness="gallery" style={{ height: '100%', padding: '4px 24px 32px', background: 'var(--kc-chat)', color: 'var(--kc-text)' }}>
      <h2 style={heading}>组合示例</h2>
      <div style={grid}>
        {(['starry', 'sakura', 'pixel', 'aurora', 'sunny', 'candy', 'mint', 'kitty', 'royal', 'snow', 'thunder', 'ink'] as const).map((key) => <Cell key={key} title={key} style={SKINS[key]} layout={layout} messages={tryOnSamples('今天也要开心呀').slice(0, 5)} wide />)}
      </div>
      <h2 style={heading}>纹样（pattern）· 浅底 / 深底</h2>
      <div style={grid}>
        {PATTERN_KEYS.flatMap((key) => [
          <Cell key={`${key}-light`} title={`${key} · 浅底`} style={{ ...LIGHT_BASE, pattern: { key, color: '#3b6fe0', opacity: 0.22, scale: 1 }, dark: { ...LIGHT_BASE.dark, pattern: { key, color: '#9db8ff', opacity: 0.2, scale: 1 } } }} layout={layout} messages={[SHORT[0], LONG[1]]} />,
          <Cell key={`${key}-deep`} title={`${key} · 深底`} style={{ ...DEEP_BASE, pattern: { key, color: '#ffffff', opacity: 0.2, scale: 1 } }} layout={layout} messages={[LONG[0], SHORT[1]]} />
        ])}
      </div>
      <h2 style={heading}>纹样的不透明度和缩放（stars）</h2>
      <div style={grid}>
        {[[0.1, 0.5], [0.3, 1], [0.6, 1], [0.3, 2]].map(([opacity, scale]) => <Cell key={`${opacity}-${scale}`} title={`opacity ${opacity} · scale ${scale}`} style={{ ...DEEP_BASE, pattern: { key: 'stars', color: '#ffffff', opacity, scale } }} layout={layout} messages={LONG} />)}
      </div>
      <h2 style={heading}>角饰一览（放大到 56 像素看画得怎么样）</h2>
      <div style={{ display: 'grid', gap: 8 }}>
        {[['#ffffff', '#f59f00'], ['#2c2a72', '#ffe9a8'], ['#ffd2e0', '#ff5c8a'], ['#1d2333', '#a6f7b7']].map(([background, color]) => (
          <div key={background} data-gallery-strip={background} style={{ display: 'flex', flexWrap: 'wrap', gap: 14, padding: '14px 16px', borderRadius: 10, background }}>
            {ORNAMENT_KEYS.map((key) => (
              <span key={key} title={key} style={{ position: 'relative', width: 56, height: 56, margin: '48px 0 0 22px', isolation: 'isolate' }}>
                <Ornament spec={{ key, corner: 'tl', color, size: 56, animated: false }} motion={false} delay={0} />
              </span>
            ))}
          </div>
        ))}
      </div>
      <h2 style={heading}>角饰（ornaments）· 四个角、三种大小</h2>
      <div style={grid}>
        {ORNAMENT_KEYS.map((key) => (
          <Cell key={key} title={key} style={{ ...LIGHT_BASE, ornaments: [{ key, corner: 'tr', color: '#f59f00', size: 20, animated: true }, { key, corner: 'bl', color: '#f06595', size: 14, animated: true }] }} layout={layout} messages={[SHORT[0], LONG[1]]} />
        ))}
        {ORNAMENT_KEYS.map((key) => (
          <Cell key={`${key}-big`} title={`${key} · 28 / 10 · 深底`} style={{ ...DEEP_BASE, ornaments: [{ key, corner: 'tl', color: '#ffe9a8', size: 28 }, { key, corner: 'br', color: '#ffffff', size: 10 }] }} layout={layout} messages={[LONG[0], SHORT[1]]} />
        ))}
      </div>
      <h2 style={heading}>动效（animation）</h2>
      <div style={grid}>
        {(['none', 'flow', 'shimmer', 'breathe'] as const).map((animation) => <Cell key={animation} title={animation} style={{ ...DEEP_BASE, animation, shadow: '0 2px 10px #5a45d466' }} layout={layout} messages={LONG} />)}
        {(['shimmer', 'breathe'] as const).map((animation) => <Cell key={`${animation}-light`} title={`${animation} · 浅底`} style={{ ...LIGHT_BASE, animation, shadow: '0 2px 10px #3b6fe055' }} layout={layout} messages={LONG} />)}
      </div>
      <h2 style={heading}>不合法的皮肤（都应该按没装备处理，或者只丢掉坏的那一项）</h2>
      <div style={grid}>
        <Cell title="背景带 url()" style={{ version: 1, background: 'url(https://evil.example/x.png)', text: '#fff' }} layout={layout} />
        <Cell title="version 2" style={SKINS.future} layout={layout} />
        <Cell title="多了不认识的字段" style={{ ...DEEP_BASE, glitter: true }} layout={layout} />
        <Cell title="纹样 key 不认识（跳过纹样）" style={{ ...DEEP_BASE, pattern: { key: 'zebra', color: '#ffffff', opacity: 0.3, scale: 1 } }} layout={layout} />
        <Cell title="角饰一个不认识、一个正常" style={{ ...DEEP_BASE, ornaments: [{ key: 'dragon', corner: 'tr', color: '#ffffff', size: 18 }, { key: 'star', corner: 'bl', color: '#ffe9a8', size: 18 }] }} layout={layout} />
        <Cell title="阴影写了 inset / 超大（丢掉阴影）" style={{ ...DEEP_BASE, shadow: 'inset 0 0 999px #000000' }} layout={layout} />
      </div>
    </div>
  );
}

/* ───────── 头像框图鉴 ───────── */

/** 一张当头像用的小图（渐变底 + 一个圆脸），看头像框套在真图片上的样子。头像地址只认 blob: 和服务器上的路径，所以给 blob */
function portrait(hue: number): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 160;
  const context = canvas.getContext('2d');
  if (!context) {
    return Promise.resolve('');
  }
  const gradient = context.createLinearGradient(0, 0, 160, 160);
  gradient.addColorStop(0, `hsl(${hue} 78% 72%)`);
  gradient.addColorStop(1, `hsl(${(hue + 60) % 360} 70% 54%)`);
  context.fillStyle = gradient;
  context.fillRect(0, 0, 160, 160);
  context.fillStyle = 'rgba(255, 255, 255, 0.92)';
  context.beginPath();
  context.arc(80, 70, 30, 0, Math.PI * 2);
  context.fill();
  context.beginPath();
  context.ellipse(80, 150, 52, 40, 0, 0, Math.PI * 2);
  context.fill();
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob ? URL.createObjectURL(blob) : ''), 'image/png'));
}

const FRAME_SIZES = ['xl', 'lg', 'md', 'message', 'sm'] as const;
const FRAME_SIZE_PX: Record<(typeof FRAME_SIZES)[number], number> = { xl: 80, lg: 56, md: 40, message: 36, sm: 32 };
const DEFAULT_FRAMES: Array<[keyof typeof FRAMES, string]> = [['mint', '薄荷'], ['sakura', '樱花'], ['seasalt', '海盐'], ['cat', '猫耳'], ['starring', '星环'], ['aurora', '极光'], ['halo', '光环 · Lv4'], ['crowned', '加冕 · Lv16']];
const EXTRA_FRAMES: Array<[keyof typeof FRAMES, string]> = [['angel', '天使（翅膀 + 光环）'], ['imp', '小恶魔（角）'], ['ribbon', '蝴蝶结（纯色环）']];
const PLAIN_RING = { background: 'linear-gradient(160deg, #9db8ff 0%, #5b7fe8 100%)', width: 3, gap: 1 };

/** 一块固定深浅色的底：里面的头像框按这一块的 data-theme 取浅色 / 深色那一组值，和外面的主题无关 */
function Swatch({ scheme, children, square = false }: { scheme: 'light' | 'dark'; children: React.ReactNode; square?: boolean }): JSX.Element {
  return (
    <div data-theme={scheme} data-layout="desktop" data-frame-swatch={scheme} style={{ display: 'flex', minWidth: 0, flex: 1, flexWrap: 'wrap', alignItems: 'center', gap: 30, padding: '30px 34px', borderRadius: 10, background: scheme === 'dark' ? '#1b1d24' : '#f3f4f8', color: scheme === 'dark' ? '#eef0f4' : '#1f2430', ...(square ? { '--kc-avatar-radius': '28%' } as CSSProperties : {}) }}>
      {children}
    </div>
  );
}

function FrameRow({ title, style, user }: { title: string; style: unknown; user: User }): JSX.Element {
  const valid = parseAvatarFrame(style) !== null;
  const sizes = FRAME_SIZES.map((size) => <Avatar key={size} user={user} size={size} frameStyle={style} />);
  return (
    <div data-frame-row={title} style={{ display: 'grid', gridTemplateColumns: '120px minmax(0, 1fr)', alignItems: 'center', gap: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 700 }}>{title}{valid ? null : <div style={{ color: '#e0383e', fontSize: 12, fontWeight: 400 }}>不是合法的头像框</div>}</div>
      <div style={{ display: 'flex', minWidth: 0, flexWrap: 'wrap', gap: 10 }}>
        <Swatch scheme="light">{sizes}</Swatch>
        <Swatch scheme="dark">{sizes}</Swatch>
      </div>
    </div>
  );
}

function FrameCell({ title, style, user, size = 'lg', square = false }: { title: string; style: unknown; user: User; size?: (typeof FRAME_SIZES)[number]; square?: boolean }): JSX.Element {
  const valid = parseAvatarFrame(style) !== null;
  return (
    <figure data-frame-cell={title} style={{ display: 'grid', justifyItems: 'center', gap: 4, margin: 0, padding: '26px 8px 10px', borderRadius: 10, background: 'var(--kc-chat)', boxShadow: 'inset 0 0 0 1px var(--kc-border)', ...(square ? { '--kc-avatar-radius': '28%' } as CSSProperties : {}) }}>
      <Avatar user={user} size={size} frameStyle={style} />
      <figcaption style={{ marginTop: 22, color: valid ? 'var(--kc-muted)' : '#e0383e', fontSize: 12, textAlign: 'center' }}>{title}{valid ? '' : ' · 不合法'}</figcaption>
    </figure>
  );
}

function FrameGallery(): JSX.Element {
  const [picture, setPicture] = useState('');
  useEffect(() => {
    void portrait(205).then(setPicture);
  }, []);
  const pictured = useMemo(() => ({ id: 21, username: 'pic', nickname: '有头像的人', avatar_url: picture || undefined }) as User, [picture]);
  const plain = useMemo(() => ({ id: 22, username: 'tone', nickname: '酷可' }) as User, []);
  const heading: CSSProperties = { margin: '26px 0 12px', fontSize: 15, fontWeight: 700 };
  const grid: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 };
  const note: CSSProperties = { margin: '-6px 0 12px', color: 'var(--kc-muted)', fontSize: 12.5 };
  return (
    <div className="kui-scroll" data-harness="frames" style={{ height: '100%', padding: '4px 24px 40px', background: 'var(--kc-chat)', color: 'var(--kc-text)' }}>
      <h2 style={heading}>默认上架的八件（80 / 56 / 40 / 36 / 32 像素，浅色 · 深色）</h2>
      <p style={note}>样式是照着名字先拟的（dev/mocks/shop.ts 的 FRAMES），以后以后端的为准。上面一排是图片头像，下面一排是没传头像时的占位。</p>
      <div style={{ display: 'grid', gap: 10 }}>
        {DEFAULT_FRAMES.map(([key, name]) => <FrameRow key={key} title={name} style={FRAMES[key]} user={pictured} />)}
        {DEFAULT_FRAMES.map(([key, name]) => <FrameRow key={`${key}-plain`} title={`${name} · 占位头像`} style={FRAMES[key]} user={plain} />)}
      </div>
      <h2 style={heading}>另外几件（把头像框专用的装饰都看一遍）</h2>
      <div style={{ display: 'grid', gap: 10 }}>
        {EXTRA_FRAMES.map(([key, name]) => <FrameRow key={key} title={name} style={FRAMES[key]} user={pictured} />)}
      </div>
      <h2 style={heading}>装饰一览（放大到 56 像素看画得怎么样；成对的只画右边那一片）</h2>
      <div style={{ display: 'grid', gap: 8 }}>
        {[['#ffffff', '#f59f00'], ['#2c2a72', '#ffe9a8'], ['#ffd2e0', '#ff5c8a'], ['#1d2333', '#a6f7b7']].map(([background, color]) => (
          <div key={background} data-frame-strip={background} style={{ display: 'flex', flexWrap: 'wrap', gap: 22, padding: '16px 18px', borderRadius: 10, background }}>
            {FRAME_ONLY_ORNAMENT_KEYS.map((key) => <span key={key} title={key}><FrameOrnamentGlyph ornament={key} color={color} size={56} /></span>)}
          </div>
        ))}
      </div>
      <h2 style={heading}>头像框专用的装饰 · 三种大小（10 / 18 / 28）</h2>
      <div style={grid}>
        {FRAME_ONLY_ORNAMENT_KEYS.flatMap((key) => [10, 18, 28].map((size) => (
          <FrameCell key={`${key}-${size}`} title={`${key} · ${size}`} user={pictured} style={{ version: 1, ring: PLAIN_RING, ornaments: [{ key, position: key === 'laurel' ? 'bottom' : key === 'wings' ? 'right' : 'top', color: key === 'wings' ? '#f4f8ff' : '#f5a742', size, animated: true }] }} />
        )))}
      </div>
      <h2 style={heading}>八个位置（star · 16，以及会跟着位置转的 crown / bow / laurel / cat_ears）</h2>
      <div style={grid}>
        {FRAME_POSITIONS.map((position) => <FrameCell key={position} title={`star · ${position}`} user={plain} style={{ version: 1, ring: PLAIN_RING, ornaments: [{ key: 'star', position, color: '#ffc93c', size: 16 }] }} />)}
        {(['crown', 'bow', 'laurel', 'cat_ears', 'wings'] as const).flatMap((key) => (['top', 'tr', 'right', 'bottom', 'tl'] as const).map((position) => (
          <FrameCell key={`${key}-${position}`} title={`${key} · ${position}`} user={pictured} style={{ version: 1, ring: PLAIN_RING, ornaments: [{ key, position, color: '#f5a742', size: 18 }] }} />
        )))}
      </div>
      <h2 style={heading}>气泡的十三个角饰贴在环上（tr · 16）</h2>
      <div style={grid}>
        {ORNAMENT_KEYS.map((key) => <FrameCell key={key} title={key} user={plain} style={{ version: 1, ring: PLAIN_RING, ornaments: [{ key, position: 'tr', color: '#f59f00', size: 16, animated: true }] }} />)}
      </div>
      <h2 style={heading}>环：宽度 2–6、留白 0–3、纯色 / 线性 / 径向 / 锥形</h2>
      <div style={grid}>
        {[[2, 0], [3, 1], [4, 2], [6, 3], [6, 0]].map(([width, gap]) => <FrameCell key={`${width}-${gap}`} title={`width ${width} · gap ${gap}`} user={pictured} style={{ version: 1, ring: { ...PLAIN_RING, width, gap } }} />)}
        <FrameCell title="纯色" user={pictured} style={{ version: 1, ring: { background: '#3b6fe0', width: 3, gap: 1 } }} />
        <FrameCell title="linear" user={pictured} style={{ version: 1, ring: { background: 'linear-gradient(90deg, #ff8a5c, #ffd76a)', width: 3, gap: 1 } }} />
        <FrameCell title="radial" user={pictured} style={{ version: 1, ring: { background: 'radial-gradient(#ffffff 55%, #ff5c8a 100%)', width: 4, gap: 1 } }} />
        <FrameCell title="conic" user={pictured} style={{ version: 1, ring: { background: 'conic-gradient(from 0deg, #7F7FD5, #91EAE4, #7F7FD5)', width: 3, gap: 1 } }} />
        <FrameCell title="conic · 色标带角度" user={pictured} style={{ version: 1, ring: { background: 'conic-gradient(from 45deg, #ff5c8a 0deg, #ffd76a 120deg, #5bd1ff 240deg, #ff5c8a 360deg)', width: 3, gap: 1 } }} />
      </div>
      <h2 style={heading}>动效（animation）和外发光（glow）</h2>
      <div style={grid}>
        {(['none', 'spin', 'pulse', 'shimmer'] as const).map((animation) => <FrameCell key={animation} title={animation} user={pictured} style={{ version: 1, ring: { background: 'conic-gradient(from 0deg, #7f7fd5, #91eae4, #ffe9a8, #7f7fd5)', width: 4, gap: 1 }, glow: { color: '#7f7fd588', blur: 8 }, animation }} />)}
        <FrameCell title="spin · 纯色（不转）" user={pictured} style={{ version: 1, ring: { background: '#3b6fe0', width: 3, gap: 1 }, animation: 'spin' }} />
        <FrameCell title="pulse · 没写 glow" user={pictured} style={{ version: 1, ring: PLAIN_RING, animation: 'pulse' }} />
        {[4, 8, 16].map((blur) => <FrameCell key={blur} title={`glow blur ${blur}`} user={pictured} style={{ version: 1, ring: PLAIN_RING, glow: { color: '#5b7fe899', blur } }} />)}
        <FrameCell title="深色覆盖（切深色看）" user={pictured} style={{ version: 1, ring: PLAIN_RING, glow: { color: '#5b7fe866', blur: 6 }, dark: { ring: { background: 'linear-gradient(160deg, #ffd76a, #ff8a5c)' }, glow: { color: '#ffb84d99', blur: 10 } } }} />
      </div>
      <h2 style={heading}>圆角方形头像的主题（--kc-avatar-radius: 28%）</h2>
      <div style={grid}>
        {DEFAULT_FRAMES.map(([key, name]) => <FrameCell key={key} title={name} user={pictured} style={FRAMES[key]} square />)}
      </div>
      <h2 style={heading}>不合法的头像框（整件按没装备处理，或者只丢掉坏的那一项）</h2>
      <div style={grid}>
        <FrameCell title="底色带 url()" user={plain} style={{ version: 1, ring: { background: 'url(https://evil.example/x.png)', width: 3 } }} />
        <FrameCell title="conic 里套了函数" user={plain} style={{ version: 1, ring: { background: 'conic-gradient(from 0deg, var(--x), #fff)', width: 3 } }} />
        <FrameCell title="version 2" user={plain} style={FRAMES.future} />
        <FrameCell title="多了不认识的字段" user={plain} style={{ version: 1, ring: PLAIN_RING, sticker: 'x' }} />
        <FrameCell title="没有 ring" user={plain} style={{ version: 1, glow: { color: '#ff000088', blur: 8 } }} />
        <FrameCell title="宽度 9（超范围）" user={plain} style={{ version: 1, ring: { ...PLAIN_RING, width: 9 } }} />
        <FrameCell title="装饰一个不认识、一个正常" user={plain} style={{ version: 1, ring: PLAIN_RING, ornaments: [{ key: 'dragon', position: 'top', color: '#ffffff', size: 18 }, { key: 'star', position: 'tr', color: '#ffc93c', size: 16 }] }} />
        <FrameCell title="position 不认识（跳过）" user={plain} style={{ version: 1, ring: PLAIN_RING, ornaments: [{ key: 'star', position: 'center', color: '#ffc93c', size: 16 }] }} />
        <FrameCell title="glow 颜色不合法（丢掉光）" user={plain} style={{ version: 1, ring: PLAIN_RING, glow: { color: 'red', blur: 8 } }} />
        <FrameCell title="四个装饰（全丢）" user={plain} style={{ version: 1, ring: PLAIN_RING, ornaments: ['top', 'tr', 'right', 'br'].map((position) => ({ key: 'star', position, color: '#ffc93c', size: 14 })) }} />
        <FrameCell title="dark 里的底色不合法（深色沿用浅色）" user={plain} style={{ version: 1, ring: PLAIN_RING, dark: { ring: { background: 'expression(alert(1))' } } }} />
      </div>
    </div>
  );
}

/* ───────── 外框 ───────── */

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });

function emit(rawType: string, data: unknown): void {
  // 和 src/realtime/client.ts 收到事件时做的事一样：先让缓存跟上，再分发给订阅者
  handleShopEvent(queryClient, rawType, data);
  if (rawType === 'red_packet.updated') {
    handleRedPacketEvent(queryClient, data);
  }
  if (rawType === 'gift.received') {
    handleGiftEvent(queryClient, data);
  }
  emitRealtimeEvent({ type: 'unknown', rawType, data, receivedAt: new Date().toISOString() });
}

function DesktopDashboard({ view }: { view: View }): JSX.Element {
  const workspaceView = useKukeStore((state) => state.workspaceView);
  const setWorkspaceView = useKukeStore((state) => state.setWorkspaceView);
  const currentUser = useKukeStore((state) => state.currentUser) ?? me;
  const shopAvailable = useShopAvailable();
  const activeConversationId = useKukeStore((state) => state.activeConversationId);
  const showing = isGallery(view) ? view : workspaceView;
  if (view === 'app') {
    return <ChatDashboard currentUser={currentUser} />;
  }
  return (
    <div className="kc-pc-dashboard" style={{ position: 'relative', display: 'grid', height: '100%', minHeight: 0, gridTemplateColumns: '56px minmax(0, 1fr)', overflow: 'hidden', background: 'var(--kc-window)', color: 'var(--kc-text)' }}>
      <NavRail view={workspaceView} unreadCount={3} hasUnseenAnnouncement={false} shopAvailable={shopAvailable} onNavigate={setWorkspaceView} onCreateGroup={() => undefined} onOpenAnnouncement={() => undefined} onOpenSettings={() => setWorkspaceView('settings')} />
      <main data-kc-surface="page" style={{ minWidth: 0, minHeight: 0, overflow: 'hidden', background: 'var(--kc-chat)' }}>
        {showing === 'gallery' ? <Gallery layout="desktop" />
          : showing === 'frames' ? <FrameGallery />
          : showing === 'gifts' ? <GiftGallery layout="desktop" />
          : showing === 'shop' ? <ShopPage />
          : showing === 'chat' ? <DesktopChatPanel conversations={conversations} currentUser={currentUser} currentRole="owner" members={activeConversationId === 2 ? members.slice(0, 2) : members} />
          : showing === 'settings' ? <div className="scroll-soft" style={{ height: '100%', overflowY: 'auto', padding: '24px 20px' }}><AppearanceSection /></div>
          : <p data-harness="other-view" style={{ padding: 32, color: 'var(--kc-muted)' }}>这里是「{workspaceView}」工作区的占位。</p>}
      </main>
      <ShopGrantToasts />
      <GiftToasts />
      <GiftSendHost />
      <GiftEffectsHost />
      <BirthdayCelebration user={currentUser} />
    </div>
  );
}

function MobileScreen({ view }: { view: View }): JSX.Element {
  const currentUser = useKukeStore((state) => state.currentUser) ?? me;
  const [note, setNote] = useState('');
  return (
    <div className="kc-native-app" style={{ position: 'relative', height: '100%', width: '100%', overflow: 'hidden', background: 'var(--kc-mobile-bg)' }}>
      {view === 'app' ? <ChatDashboard currentUser={currentUser} />
        : view === 'gallery' ? <Gallery layout="mobile" />
        : view === 'frames' ? <FrameGallery />
        : view === 'gifts' ? <GiftGallery layout="mobile" />
        : view === 'chat' ? <MessagePanel conversations={conversations} currentUser={currentUser} currentRole="owner" members={members} friends={[]} isMobile onBack={() => setNote('点了返回')} />
        : <MobileShopPage onMobileBack={() => setNote('点了返回')} onOpenCcwBinding={() => setNote('要去设置里的「CCW 账号」')} />}
      {note ? <p data-harness="mobile-note" style={{ position: 'absolute', zIndex: 99, right: 8, bottom: 8, left: 8, padding: '6px 10px', borderRadius: 8, background: '#111827', color: '#fff', font: '12px sans-serif' }} onClick={() => setNote('')}>{note}</p> : null}
      <ShopGrantToasts />
      <GiftToasts />
      <GiftSendHost />
      <GiftEffectsHost />
      <BirthdayCelebration user={currentUser} />
    </div>
  );
}

const RED_PACKET_SELECTS: Array<{ key: 'backend' | 'pendingBackend' | 'sendError' | 'claimError' | 'features'; label: string; options: string[] }> = [
  { key: 'backend', label: '红包后端', options: ['ok', 'disabled', 'missing'] },
  { key: 'pendingBackend', label: '待领接口', options: ['ok', 'missing'] },
  { key: 'sendError', label: '发', options: ['none', 'disabled', 'not_member', 'muted', 'ccw_not_bound', 'invalid_amount', 'invalid_count', 'invalid_kind', 'greeting_rejected', 'chain_text_rejected', 'invalid_target', 'insufficient_balance', 'daily_limit', 'verification_unavailable', 'server'] },
  { key: 'claimError', label: '抢', options: ['none', 'not_member', 'muted', 'not_target', 'own_packet', 'muted_in_group', 'already_claimed', 'finished', 'expired', 'revoked', 'server'] },
  { key: 'features', label: '新玩法', options: ['all', 'none'] }
];

/** 别人发来一个红包：和真的一样，消息进历史、进缓存 */
function receiveRedPacket(conversationId: number): void {
  const group = conversationId === 1;
  const message = redPacketState.receive({ senderId: group ? people[2].id : people[1].id, conversationId, kind: group ? 'lucky' : 'normal', amount: group ? 50 : 12, count: group ? 4 : 1, greeting: group ? '手快有手慢无' : '给你的' });
  harnessHistory.push(message);
  deliverMessage(message);
}

/** 一条别人发来的消息到了：和 src/realtime/client.ts 收到 message.created 时做的事一样（会话列表、消息缓存、@ 提示、有红包） */
function deliverMessage(message: Message): void {
  const visible = useKukeStore.getState().visibleConversationId;
  const mention = messageMentionKind(message, me.id);
  if (visible !== message.conversation_id) {
    const unread = harnessUnread[message.conversation_id] ?? { count: 0, mention: null };
    harnessUnread[message.conversation_id] = { count: unread.count + 1, mention: unread.mention === 'me' ? 'me' : mention ?? unread.mention };
  }
  queryClient.setQueryData<Conversation[] | undefined>(['conversations'], (current) => applyCreatedMessageToConversations(current, message, visible, false, mention));
  queryClient.setQueryData<MessagesInfiniteData | undefined>(['messages', message.conversation_id], (current) => upsertMessageIntoFirstPage(current, message));
  noteRedPacketMessage(queryClient, message);
  noteGiftArrival(message);
}

/** 别人送出一份礼物：消息进历史、进缓存（和真的一样），送给我的再发 gift.received；送的是商品还会让我的商店数据变 */
function receiveGift(options: Parameters<typeof giftState.receive>[0]): void {
  const result = giftState.receive(options);
  if (result.message) {
    harnessHistory.push(result.message);
    deliverMessage(result.message);
  }
  if (result.event) {
    emit('gift.received', result.event);
  }
}

/** 限时商品到期了：把该发的事件发出去（shop.item.expired，以及我的装扮变了的 user.cosmetics.updated） */
function flushExpired(): void {
  const expired = shopState.takeExpired();
  if (expired.length === 0) {
    return;
  }
  emit('user.cosmetics.updated', { user_id: me.id, cosmetics: shopState.cosmetics() });
  expired.forEach((item) => emit('shop.item.expired', { item }));
}

const GIFT_SELECTS: Array<{ key: 'backend' | 'sendError'; label: string; options: string[] }> = [
  { key: 'backend', label: '礼物后端', options: ['ok', 'disabled', 'missing'] },
  { key: 'sendError', label: '送', options: ['none', 'disabled', 'not_member', 'muted', 'ccw_not_bound', 'blocked', 'invalid_target', 'invalid_gift', 'invalid_count', 'not_giftable', 'message_rejected', 'recipient_owns', 'insufficient_balance', 'daily_limit', 'verification_unavailable', 'server'] }
];

let effectId = 50_000;

/** 直接把一段动效排进队列（不经过消息）：看 tier 2 / 3 的画面、排队、跳过 */
function playEffect(tier: 2 | 3, icon: string, name: string, count = 1): void {
  effectId += 1;
  useGiftUi.getState().enqueue({ id: effectId, conversationId: useKukeStore.getState().visibleConversationId ?? useKukeStore.getState().activeConversationId ?? 1, tier, icon, name, count, fromName: '阿夸', toName: '酷可mc' });
}

/* ───────── 礼物图鉴 ───────── */

function GiftGallery({ layout }: { layout: 'desktop' | 'mobile' }): JSX.Element {
  const [card, setCard] = useState(false);
  const heading: CSSProperties = { margin: '26px 0 12px', fontSize: 15, fontWeight: 700 };
  const note: CSSProperties = { margin: '-6px 0 12px', color: 'var(--kc-muted)', fontSize: 12.5 };
  const samples = harnessHistory.filter((message) => message.conversation_id === 1 && giftOf(message));
  const aqua = giftState.user(2);
  const mint = giftState.user(3);
  const plain = giftState.user(6);
  const self = giftState.user(me.id);
  const column: CSSProperties = { display: 'grid', alignContent: 'start', gap: 10, minWidth: 0, padding: 14, borderRadius: 12, background: 'var(--kc-panel)', boxShadow: 'inset 0 0 0 1px var(--kc-border)' };
  const wallFrame = (wall: JSX.Element, charm: JSX.Element | null): JSX.Element => <div><div className="kgf-wall-title"><b>礼物墙</b>{charm}</div>{wall}</div>;
  return (
    <div className="kui kui-scroll" data-harness="gifts" style={{ position: 'relative', height: '100%', padding: '4px 24px 40px', background: 'var(--kc-chat)', color: 'var(--kc-text)' }}>
      <h2 style={heading}>图标（红包、礼物和工具栏里的邻居并排；金币彩色 / 线条各 12 / 14 / 16 / 20 / 24 / 32 / 40 像素；浅色 · 深色）</h2>
      <div style={{ display: 'grid', gap: 8 }} data-harness="icons">
        {(['light', 'dark'] as const).map((scheme) => (
          <div key={scheme} data-theme={scheme} data-icon-strip={scheme} style={{ display: 'grid', gap: 14, padding: '16px 18px', borderRadius: 10, background: scheme === 'dark' ? '#1b1d24' : '#f3f4f8', color: scheme === 'dark' ? '#eef0f4' : '#1f2430' }}>
            {[18, 24].map((px) => (
              <div key={px} style={{ display: 'flex', alignItems: 'center', gap: px === 18 ? 14 : 18 }}>
                {(['emoji', 'image', 'mic', 'atSign', 'poll', 'redPacket', 'gift'] as const).map((name) => <span key={name} title={name} style={{ display: 'grid', width: px, height: px }}><Icon name={name} className="h-full w-full" /></span>)}
                <span style={{ fontSize: 11, opacity: 0.7 }}>{px} 像素：表情 图片 语音 @ 投票 · 红包 礼物</span>
              </div>
            ))}
            {(['color', 'line'] as const).map((variant) => (
              <div key={variant} style={{ display: 'flex', alignItems: 'flex-end', gap: 14 }}>
                {[12, 14, 16, 20, 24, 32, 40].map((px) => <CoinIcon key={px} variant={variant} size={px} />)}
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, fontVariantNumeric: 'tabular-nums' }}><CoinIcon variant={variant} size={14} />1,280</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12, opacity: variant === 'line' ? 0.65 : 1, fontVariantNumeric: 'tabular-nums' }}><CoinIcon variant={variant} size={12} />66</span>
                <span style={{ fontSize: 11, opacity: 0.7 }}>{variant === 'color' ? '彩色' : '线条（跟文字颜色）'}</span>
              </div>
            ))}
          </div>
        ))}
      </div>

      <h2 style={heading}>礼物图形（24 / 40 / 64 像素，浅色 · 深色；最后一个是不认识的名字，画成通用礼盒）</h2>
      <div style={{ display: 'grid', gap: 8 }}>
        {(['light', 'dark'] as const).map((scheme) => (
          <div key={scheme} data-theme={scheme} data-glyph-strip={scheme} style={{ display: 'flex', flexWrap: 'wrap', gap: 18, padding: '16px 18px', borderRadius: 10, background: scheme === 'dark' ? '#1b1d24' : '#f3f4f8', color: scheme === 'dark' ? '#eef0f4' : '#1f2430' }}>
            {[...GIFT_ICON_NAMES, 'ufo'].map((icon) => (
              <figure key={icon} style={{ display: 'grid', justifyItems: 'center', gap: 6, margin: 0, fontSize: 11 }}>
                <span style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}><GiftGlyph icon={icon} size={24} /><GiftGlyph icon={icon} size={40} /><GiftGlyph icon={icon} size={64} /></span>
                <figcaption style={{ opacity: 0.7 }}>{icon}</figcaption>
              </figure>
            ))}
          </div>
        ))}
      </div>

      <h2 style={heading}>礼物卡片（聊天里的样子在 view=chat；这里并排看各种内容）</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 14 }} data-harness="gift-cards">
        {samples.map((message) => {
          const meta = giftOf(message);
          return meta ? <GiftCard key={message.id} message={message} meta={meta} mine={message.sender_id === me.id} /> : null;
        })}
      </div>

      <h2 style={heading}>礼物墙</h2>
      <p style={note}>点一格展开送礼记录。留言只有本人看自己的墙、或者是自己送的那条才有。</p>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${layout === 'mobile' ? 280 : 300}px, 1fr))`, gap: 12 }}>
        <div style={column} data-harness="wall-other"><b>阿夸的（别人的）</b><GiftWall user={aqua} isSelf={false} frame={wallFrame} /></div>
        <div style={column} data-harness="wall-self"><b>我的</b><GiftWall user={self} isSelf frame={wallFrame} /></div>
        <div style={column} data-harness="wall-empty"><b>没收到过礼物的人</b><GiftWall user={plain} isSelf={false} frame={wallFrame} /></div>
      </div>

      <h2 style={heading}>心意值（资料卡统计行里的一项）、今天生日、送礼入口、好友生日提示</h2>
      <div style={{ maxWidth: 320 }}><UserLevelCard user={aqua} charm /></div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }} data-harness="gift-bits">
        <BirthdayToday user={aqua} gift />
        <SendGiftButton user={mint} className="kui-btn" />
        <button type="button" className="kui-btn" data-harness="open-card" onClick={() => setCard(true)}>打开阿夸的资料卡</button>
      </div>
      <div style={{ maxWidth: 320, marginTop: 12, borderRadius: 12, background: 'var(--kc-list, var(--kc-panel))', padding: '6px 0' }}>
        <FriendBirthdayBanner users={[aqua, mint, plain]} variant={layout} />
      </div>

      <h2 style={heading}>心意榜（正式界面里在「排行榜」页的「心意榜」页签）</h2>
      <div className={layout === 'mobile' ? 'klv-m' : undefined} style={{ maxWidth: 720 }}><CharmLeaderboard layout={layout} /></div>

      <h2 style={heading}>设置里的生日</h2>
      <div style={{ maxWidth: layout === 'mobile' ? 390 : 560 }}><BirthdaySetting variant={layout} /></div>

      {card ? <UserCardDesktop user={aqua} label="阿夸" onClose={() => setCard(false)} /> : null}
    </div>
  );
}

let mentionMessageId = 8000;

/** 别人在某个会话里发一条 @我 / @全体 / 普通的消息 */
function receiveText(conversationId: number, kind: 'me' | 'all' | 'plain'): void {
  mentionMessageId += 1;
  const sender = conversationId === 1 ? people[2] : people[1];
  const message = {
    id: mentionMessageId,
    conversation_id: conversationId,
    sender_id: sender.id,
    sender,
    type: 'text',
    content: kind === 'me' ? '@酷可mc 来看一下这个' : kind === 'all' ? '@全体成员 今晚八点开会' : '一条普通的新消息，写得长一点看看前缀后面的正文是怎么截断的',
    metadata: kind === 'me' ? { mentions: [{ user_id: me.id, name: '酷可mc' }] } : kind === 'all' ? { mention_all: true } : undefined,
    created_at: new Date().toISOString()
  } as Message;
  harnessHistory.push(message);
  deliverMessage(message);
}

const SELECTS: Array<{ key: keyof ShopScenario; label: string; options: string[] }> = [
  { key: 'backend', label: '后端', options: ['ok', 'missing', 'error'] },
  { key: 'purchaseError', label: '购买', options: ['none', 'item_not_found', 'item_unavailable', 'already_owned', 'ccw_not_bound', 'item_locked', 'insufficient_coins', 'verification_unavailable', 'server'] },
  { key: 'refreshError', label: '刷新', options: ['none', 'refresh_too_fast', 'ccw_not_bound', 'server'] }
];

function Harness(): JSX.Element {
  const [, rerender] = useState(0);
  const [theme, setTheme] = useState<'light' | 'dark'>(params.get('theme') === 'dark' ? 'dark' : 'light');
  const [view, setView] = useState<View>(VIEWS.includes(params.get('view') as View) ? params.get('view') as View : 'shop');
  const layout = useKukeStore((state) => state.layoutMode);
  const fontScale = useKukeStore((state) => state.uiFontScale);
  const showOthers = useShopPrefs((state) => state.showOthersSkins);
  const performance = useThemeStore((state) => state.performance);
  const themeRoot = useThemeRootProps(theme);
  const frameStep = useRef(0);
  // 「@」那一组按钮作用在哪个会话上；默认是私聊（view=app 默认开着群聊，开着的会话不会出前缀）
  const [atTarget, setAtTarget] = useState(params.get('conv') === '2' ? 1 : 2);
  const conversationId = useKukeStore((state) => state.activeConversationId) ?? 1;
  const [extra, setExtra] = useState<'send' | 'records' | 'gift-records' | null>(params.get('rpSend') === '1' ? 'send' : params.get('rpRecords') === '1' ? 'records' : params.get('giftRecords') === '1' ? 'gift-records' : null);
  const reloadGifts = (): void => {
    void queryClient.resetQueries({ queryKey: ['gifts'] });
    rerender((value) => value + 1);
  };
  const reloadBirthday = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['birthday'] });
    void queryClient.invalidateQueries({ queryKey: ['gifts', 'wall'] });
    rerender((value) => value + 1);
  };
  /** 送礼面板：在当前会话里送（群里先选人，私聊就是阿夸） */
  const openGiftPanel = (): void => useGiftUi.getState().openSend({ toUser: conversationId === 1 ? null : giftState.user(2), candidates: conversationId === 1 ? members : null, conversationId });
  // 限时商品到点了：假后端读取时才结算，这里每秒看一眼，把该发的事件发出去
  useEffect(() => {
    const timer = window.setInterval(flushExpired, 1000);
    return () => window.clearInterval(timer);
  }, []);
  const reloadRedPackets = (): void => {
    void queryClient.resetQueries({ queryKey: ['red-packets'] });
    rerender((value) => value + 1);
  };
  /** 对最新那个还能领的红包做点什么，并把该发的事件发出去 */
  const withLatest = (action: (id: number) => Record<string, unknown> | null): void => {
    const id = redPacketState.latestActive(conversationId);
    const update = id === null ? null : action(id);
    if (update) {
      emit('red_packet.updated', update);
      if (update.status === 'expired' || update.status === 'revoked') {
        // 没领完的退回给发的人；是我发的话余额就变了
        emit('shop.balance.changed', { reason: 'red_packet_refund' });
      }
    }
    rerender((value) => value + 1);
  };
  const button: CSSProperties = { padding: '2px 8px', border: '1px solid #9aa1b1', borderRadius: 6, background: '#fff', color: '#12141a', font: '12px sans-serif', cursor: 'pointer' };
  const label: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, font: '12px sans-serif', color: '#12141a' };
  const reload = (): void => {
    void queryClient.resetQueries({ queryKey: ['shop'] });
    rerender((value) => value + 1);
  };
  const go = (next: View): void => {
    setView(next);
    if (!isGallery(next) && next !== 'app') {
      useKukeStore.getState().setWorkspaceView(next);
    }
  };
  const width = Number(params.get('w')) || 0;
  const height = Number(params.get('h')) || 0;

  return (
    <div style={{ display: 'flex', height: '100%', flexDirection: 'column' }}>
      <div data-harness="controls" style={{ display: 'flex', flex: 'none', flexWrap: 'wrap', alignItems: 'center', gap: 6, padding: 6, background: '#e3e6ee' }}>
        {VIEWS.map((item) => <button key={item} type="button" style={{ ...button, fontWeight: view === item ? 700 : 400 }} data-harness={`view-${item}`} onClick={() => go(item)}>{item}</button>)}
        <button type="button" style={button} data-harness="layout" onClick={() => useKukeStore.setState({ layoutMode: layout === 'desktop' ? 'mobile' : 'desktop' })}>布局：{layout === 'desktop' ? '桌面' : '移动'}</button>
        <button type="button" style={button} data-harness="theme" onClick={() => {
          const next = theme === 'light' ? 'dark' : 'light';
          setTheme(next);
          useKukeStore.setState({ themeMode: next });
        }}>深浅色</button>
        {SELECTS.map(({ key, label: text, options }) => (
          <label key={key} style={label}>{text}
            <select data-harness={key} value={String(shopScenario[key])} style={{ font: '12px sans-serif' }} onChange={(event) => {
              Object.assign(shopScenario, { [key]: event.target.value });
              if (key === 'backend') {
                reload();
              } else {
                rerender((value) => value + 1);
              }
            }}>
              {options.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
        ))}
        <label style={label}><input type="checkbox" data-harness="bound" checked={shopScenario.bound} onChange={(event) => {
          shopScenario.bound = event.target.checked;
          reload();
        }} />已绑定</label>
        <label style={label}><input type="checkbox" data-harness="stale" checked={shopScenario.stale} onChange={(event) => {
          shopScenario.stale = event.target.checked;
          reload();
        }} />核实失败</label>
        <label style={label}><input type="checkbox" data-harness="equip-fails" checked={shopScenario.equipFails} onChange={(event) => {
          shopScenario.equipFails = event.target.checked;
          rerender((value) => value + 1);
        }} />装备失败</label>
        <label style={label}>等级<input type="number" data-harness="level" value={shopScenario.level} style={{ width: 48, font: '12px sans-serif' }} onChange={(event) => {
          shopScenario.level = Number(event.target.value) || 0;
          reload();
        }} /></label>
        <label style={label}>余额<input type="number" data-harness="balance" value={shopScenario.donated - shopScenario.spent} style={{ width: 60, font: '12px sans-serif' }} onChange={(event) => {
          shopScenario.donated = shopScenario.spent + (Number(event.target.value) || 0);
          reload();
        }} /></label>
        <button type="button" style={button} data-harness="donate" onClick={() => {
          shopScenario.pendingDonation += 200;
          rerender((value) => value + 1);
        }}>模拟在 CCW 投了 200 币{shopScenario.pendingDonation ? `（待刷新 ${shopScenario.pendingDonation}）` : ''}</button>
        <button type="button" style={button} data-harness="event-changed" onClick={() => {
          shopState.delist('bubble.ink');
          emit('shop.changed', {});
        }}>模拟 shop.changed（下架「墨」）</button>
        <button type="button" style={button} data-harness="event-granted" onClick={() => {
          const item = shopState.grant('bubble.thunder', 'grant');
          if (item) emit('shop.item.granted', { item, source: 'grant' });
        }}>模拟被赠送「雷霆」</button>
        <button type="button" style={button} data-harness="event-level" onClick={() => {
          const item = shopState.grant('bubble.kitty', 'level');
          if (item) emit('shop.item.granted', { item, source: 'level' });
        }}>模拟升级解锁「猫爪」</button>
        <button type="button" style={button} data-harness="event-frame-granted" onClick={() => {
          const item = shopState.grant('frame.cat', 'grant');
          if (item) emit('shop.item.granted', { item, source: 'grant' });
        }}>模拟被赠送头像框「猫耳」</button>
        <button type="button" style={button} data-harness="event-frame" onClick={() => {
          // 阿夸（id 2）轮着换头像框：消息里他的头像应该立刻跟着变，气泡不变
          const order: Array<keyof typeof FRAMES | null> = ['cat', 'crowned', 'angel', null, 'starring'];
          const next = order[frameStep.current % order.length];
          frameStep.current += 1;
          emit('user.cosmetics.updated', { user_id: 2, cosmetics: wearing(SKINS.starry, 'bubble.starry', next ?? undefined) });
        }}>阿夸换头像框</button>
        <label style={label}><input type="checkbox" data-harness="others" checked={showOthers} onChange={(event) => useShopPrefs.getState().setShowOthersSkins(event.target.checked)} />显示别人的皮肤</label>
        <label style={label}><input type="checkbox" data-harness="perf" checked={performance} onChange={(event) => useThemeStore.getState().setPerformance(event.target.checked)} />性能优先</label>
        <button type="button" style={button} data-harness="wallpaper" onClick={() => useKukeStore.getState().updateThemeSettings({ presetId: 'sakura', accent: null, bubbleStyle: null, wallpaper: getThemePreset('sakura').wallpaper ?? 'none', wallpaperScope: 'chat', wallpaperDim: 20 })}>樱花主题 + 聊天背景图</button>
        <button type="button" style={button} data-harness="preset-reset" onClick={() => useKukeStore.getState().resetThemeSettings()}>默认主题</button>
        <span style={{ ...label, fontWeight: 700, color: '#c0392b' }}>@</span>
        <label style={label}>目标会话<select data-harness="at-target" value={atTarget} style={{ font: '12px sans-serif' }} onChange={(event) => setAtTarget(Number(event.target.value))}><option value={1}>群聊</option><option value={2}>私聊</option></select></label>
        <button type="button" style={button} data-harness="at-me" onClick={() => receiveText(atTarget, 'me')}>别人 @我</button>
        <button type="button" style={button} data-harness="at-all" onClick={() => receiveText(atTarget, 'all')}>别人 @全体</button>
        <button type="button" style={button} data-harness="at-plain" onClick={() => receiveText(atTarget, 'plain')}>别人发一条普通的</button>
        <button type="button" style={button} data-harness="at-red-packet" onClick={() => receiveRedPacket(atTarget)}>别人在那边发红包</button>
        <button type="button" style={button} data-harness="at-read" onClick={() => markConversationReadLocally(queryClient, atTarget)}>读掉</button>
        <span style={{ ...label, fontWeight: 700, color: '#c0392b' }}>红包</span>
        {RED_PACKET_SELECTS.map(({ key, label: text, options }) => (
          <label key={key} style={label}>{text}
            <select data-harness={`rp-${key}`} value={redPacketScenario[key]} style={{ font: '12px sans-serif' }} onChange={(event) => {
              Object.assign(redPacketScenario, { [key]: event.target.value });
              if (key === 'backend' || key === 'pendingBackend' || key === 'features') {
                reloadRedPackets();
              } else {
                rerender((value) => value + 1);
              }
            }}>
              {options.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
        ))}
        <button type="button" style={button} data-harness="rp-conversation" onClick={() => useKukeStore.setState({ activeConversationId: conversationId === 1 ? 2 : 1 })}>会话：{conversationId === 1 ? '群聊' : '私聊'}</button>
        <button type="button" style={button} data-harness="rp-receive" onClick={() => receiveRedPacket(conversationId)}>别人发一个</button>
        <button type="button" style={button} data-harness="rp-other-claim" onClick={() => withLatest((id) => redPacketState.claimByOther(id))}>别人抢最新的</button>
        <button type="button" style={button} data-harness="rp-expire" onClick={() => withLatest((id) => redPacketState.expire(id))}>最新的过期</button>
        <button type="button" style={button} data-harness="rp-expire-soon" onClick={() => {
          // 不发事件：卡片要靠自己的时钟到点变成「已过期」（要先重取一次才知道新的过期时间）
          const id = redPacketState.latestActive(conversationId);
          if (id !== null) {
            redPacketState.expireIn(id, 5);
            void queryClient.invalidateQueries({ queryKey: ['red-packets', 'detail', String(id)] });
          }
        }}>最新的 5 秒后过期</button>
        <button type="button" style={button} data-harness="rp-revoke" onClick={() => withLatest((id) => redPacketState.revoke(id))}>最新的被撤回</button>
        <button type="button" style={button} data-harness="rp-group-muted" onClick={() => {
          redPacketScenario.groupMuted = !redPacketScenario.groupMuted;
          rerender((value) => value + 1);
        }}>群内禁言：{redPacketScenario.groupMuted ? '开' : '关'}</button>
        <label style={label}>今天已发<input type="number" data-harness="rp-sent-today" value={redPacketScenario.sentToday} style={{ width: 44, font: '12px sans-serif' }} onChange={(event) => {
          redPacketScenario.sentToday = Number(event.target.value) || 0;
          reloadRedPackets();
        }} /></label>
        <button type="button" style={button} data-harness="rp-send" onClick={() => setExtra('send')}>发红包弹窗</button>
        <button type="button" style={button} data-harness="rp-records" onClick={() => setExtra('records')}>红包记录</button>
        <span data-harness="rp-requests" style={label}>红包请求 {redPacketRequests.length}</span>
        <span style={{ ...label, fontWeight: 700, color: '#c0392b' }}>限时</span>
        <button type="button" style={button} data-harness="exp-soon" onClick={() => {
          shopState.setExpiry('frame.angel', 2);
          shopState.setEquipped('frame.angel');
          emit('user.cosmetics.updated', { user_id: me.id, cosmetics: shopState.cosmetics() });
          reload();
        }}>「天使」装备着、还剩 2 天</button>
        <button type="button" style={button} data-harness="exp-event" onClick={() => {
          const result = shopState.setExpiry('frame.angel', 2.6);
          if (result) emit('shop.item.expiring', result);
        }}>发 shop.item.expiring</button>
        <button type="button" style={button} data-harness="exp-10s" onClick={() => {
          shopState.setExpiry('frame.angel', 10 / 86400);
          shopState.setEquipped('frame.angel');
          emit('user.cosmetics.updated', { user_id: me.id, cosmetics: shopState.cosmetics() });
          reload();
        }}>「天使」10 秒后到期</button>
        <button type="button" style={button} data-harness="exp-now" onClick={() => {
          shopState.setExpiry('frame.angel', -1 / 86400);
          flushExpired();
        }}>「天使」现在到期</button>
        <span style={{ ...label, fontWeight: 700, color: '#c0392b' }}>礼物</span>
        {GIFT_SELECTS.map(({ key, label: text, options }) => (
          <label key={key} style={label}>{text}
            <select data-harness={`gift-${key}`} value={giftScenario[key]} style={{ font: '12px sans-serif' }} onChange={(event) => {
              Object.assign(giftScenario, { [key]: event.target.value });
              if (key === 'backend') {
                reloadGifts();
              } else {
                rerender((value) => value + 1);
              }
            }}>
              {options.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
        ))}
        <button type="button" style={button} data-harness="gift-send" onClick={openGiftPanel}>送礼面板</button>
        <button type="button" style={button} data-harness="gift-records" onClick={() => setExtra('gift-records')}>礼物记录</button>
        <button type="button" style={button} data-harness="gift-in-flower" onClick={() => receiveGift({ fromId: 3, toId: me.id, conversationId, giftKey: 'flower', count: 3, message: '送你小花' })}>别人送我小花（tier 1）</button>
        <button type="button" style={button} data-harness="gift-in-cake" onClick={() => receiveGift({ fromId: 2, toId: me.id, conversationId, giftKey: 'cake', count: 2, message: '请你吃蛋糕' })}>送我蛋糕（tier 2）</button>
        <button type="button" style={button} data-harness="gift-in-rocket" onClick={() => receiveGift({ fromId: 2, toId: me.id, conversationId, giftKey: 'rocket', count: 1 })}>送我火箭（tier 3）</button>
        <button type="button" style={button} data-harness="gift-in-item" onClick={() => receiveGift({ fromId: 9, toId: me.id, conversationId, itemSku: 'frame.devil', message: '这个框送你' })}>送我头像框「小恶魔」</button>
        <button type="button" style={button} data-harness="gift-in-profile" onClick={() => receiveGift({ fromId: 10, toId: me.id, conversationId: null, giftKey: 'trophy', count: 1, message: '从你的主页送的' })}>从主页送我（不落消息）</button>
        <button type="button" style={button} data-harness="gift-in-other" onClick={() => receiveGift({ fromId: 3, toId: 2, conversationId: 1, giftKey: 'castle', count: 1, message: '送给阿夸的' })}>别人在群里送阿夸城堡</button>
        <button type="button" style={button} data-harness="gift-in-elsewhere" onClick={() => receiveGift({ fromId: 2, toId: me.id, conversationId: atTarget, giftKey: 'cake', count: 1, message: '在另一个会话里送的' })}>在「目标会话」里送我</button>
        <span style={{ ...label, fontWeight: 700, color: '#c0392b' }}>动效</span>
        <button type="button" style={button} data-harness="fx-2" onClick={() => playEffect(2, 'cake', '蛋糕', 3)}>tier 2</button>
        <button type="button" style={button} data-harness="fx-rocket" onClick={() => playEffect(3, 'rocket', '火箭')}>tier 3 火箭</button>
        <button type="button" style={button} data-harness="fx-castle" onClick={() => playEffect(3, 'castle', '城堡')}>tier 3 城堡</button>
        <button type="button" style={button} data-harness="fx-generic" onClick={() => playEffect(3, 'crown', '皇冠', 5)}>tier 3 通用</button>
        <button type="button" style={button} data-harness="fx-queue" onClick={() => {
          playEffect(2, 'trophy', '奖杯');
          playEffect(3, 'rocket', '火箭');
          playEffect(2, 'cake', '蛋糕', 5);
        }}>连着三个（排队）</button>
        <span style={{ ...label, fontWeight: 700, color: '#c0392b' }}>生日</span>
        <button type="button" style={button} data-harness="bd-today" onClick={() => {
          birthdayState.setMine('today', { celebrated: false });
          forgetBirthdayPlayed();
          useKukeStore.setState({ currentUser: giftState.user(me.id) });
          reloadBirthday();
        }}>今天是我的生日（播庆生动画）</button>
        <button type="button" style={button} data-harness="bd-none" onClick={() => {
          birthdayState.setMine(null);
          useKukeStore.setState({ currentUser: giftState.user(me.id) });
          reloadBirthday();
        }}>我没填生日</button>
        <label style={label}>保存<select data-harness="bd-save-error" value={birthdayScenario.saveError} style={{ font: '12px sans-serif' }} onChange={(event) => {
          Object.assign(birthdayScenario, { saveError: event.target.value });
          rerender((value) => value + 1);
        }}>{['none', 'invalid_birthday', 'server'].map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
        <button type="button" style={button} data-harness="bd-friend" onClick={() => {
          // 阿夸的生日在今天 / 不在今天，来回切：好友列表、资料卡、个人空间上的标识跟着变（这里直接改缓存，等于收到了新的资料）
          const on = !birthdayState.isBirthdayToday(2, me.id);
          birthdayState.setOther(2, on ? 'today' : { year: 2009, month: 1, day: 2 }, true);
          void queryClient.invalidateQueries({ queryKey: ['friends'] });
          void queryClient.invalidateQueries({ queryKey: ['users', 2] });
          void queryClient.invalidateQueries({ queryKey: ['user-profile', 2] });
          rerender((value) => value + 1);
        }}>阿夸今天生日：{birthdayState.isBirthdayToday(2, me.id) ? '是' : '否'}</button>
        <span data-harness="gift-requests" style={label}>礼物请求 {giftRequests.length} · 生日请求 {birthdayRequests.length}</span>
      </div>
      <div style={{ position: 'relative', display: 'grid', minHeight: 0, flex: 1, placeItems: layout === 'mobile' || width ? 'center' : 'stretch', background: '#cfd3dd' }}>
        {layout === 'mobile' ? (
          <main data-theme={theme} data-layout="mobile" data-font-scale={fontScale} data-harness="phone" style={{ position: 'relative', width: 390, height: 'min(100%, 800px)', overflow: 'hidden', transform: 'translateZ(0)', color: 'var(--kc-mobile-text)' }}>
            <MobileScreen view={view} />
            {extra === 'send' ? <SendRedPacketDialog conversationId={conversationId} isGroup={conversationId === 1} onClose={() => setExtra(null)} /> : extra === 'records' ? <RedPacketRecords onClose={() => setExtra(null)} /> : extra === 'gift-records' ? <GiftRecords onClose={() => setExtra(null)} /> : null}
          </main>
        ) : (
          <main data-theme={theme} data-layout="desktop" data-font-scale={fontScale} data-kc-wallpaper={themeRoot['data-kc-wallpaper']} style={{ ...themeRoot.style, position: 'relative', display: 'flex', width: width || '100%', height: height || '100%', minHeight: 0, flexDirection: 'column', overflow: 'hidden' }} className="kc-desktop-app">
            <ThemeEffects scheme={theme} />
            <div className="kc-desktop-content" style={{ position: 'relative', zIndex: 0, minHeight: 0, flex: 1, overflow: 'hidden' }}><DesktopDashboard view={view} /></div>
            {extra === 'send' ? <SendRedPacketDialog conversationId={conversationId} isGroup={conversationId === 1} onClose={() => setExtra(null)} /> : extra === 'records' ? <RedPacketRecords onClose={() => setExtra(null)} /> : extra === 'gift-records' ? <GiftRecords onClose={() => setExtra(null)} /> : null}
          </main>
        )}
      </div>
    </div>
  );
}

async function start(): Promise<void> {
  const flag = (name: string): boolean => params.get(name) === '1';
  const pick = <Key extends keyof ShopScenario>(key: Key, options: string[]): void => {
    const value = params.get(key);
    if (value && options.includes(value)) {
      Object.assign(shopScenario, { [key]: value });
    }
  };
  SELECTS.forEach(({ key, options }) => pick(key, options));
  if (params.get('bound') === '0') shopScenario.bound = false;
  shopScenario.stale = flag('stale');
  shopScenario.equipFails = flag('equipFails');
  shopScenario.neverVerified = flag('neverVerified');
  shopScenario.noDonateUrl = flag('noDonateUrl');
  for (const key of ['donated', 'spent', 'level'] as const) {
    if (params.get(key) !== null) shopScenario[key] = Number(params.get(key)) || 0;
  }
  if (params.get('owned') !== null) shopState.setOwned((params.get('owned') ?? '').split(',').filter(Boolean));
  if (params.get('equipped') !== null) shopState.setEquipped(params.get('equipped') === 'none' ? null : params.get('equipped'));
  if (params.get('frame') !== null) shopState.setEquipped(params.get('frame') === 'none' ? null : params.get('frame'), 'frame');
  if (params.get('records')) shopState.fillRecords(Number(params.get('records')) || 0);

  const pickRedPacket = <Key extends keyof RedPacketScenario>(key: Key, param: string, options: string[]): void => {
    const value = params.get(param);
    if (value && options.includes(value)) {
      Object.assign(redPacketScenario, { [key]: value });
    }
  };
  RED_PACKET_SELECTS.forEach(({ key, options }) => pickRedPacket(key, `rp${key[0].toUpperCase()}${key.slice(1)}`, options));
  redPacketState.setup({ me: me.id, people, direct: [2], onMessage: (message) => harnessHistory.push(message), onLive: (message) => deliverMessage(message) });
  redPacketScenario.groupMuted = flag('rpGroupMuted');

  // 限时商品：expiring=frame.angel:2 表示我拥有并装备着「天使」，还剩 2 天
  const expiring = params.get('expiring');
  if (expiring) {
    const [sku, days] = expiring.split(':');
    shopState.setExpiry(sku, Number(days) || 2);
    shopState.setEquipped(sku);
  }

  // 礼物和生日
  const pickGift = <Key extends keyof GiftScenario>(key: Key, param: string, options: string[]): void => {
    const value = params.get(param);
    if (value && options.includes(value)) {
      Object.assign(giftScenario, { [key]: value });
    }
  };
  GIFT_SELECTS.forEach(({ key, options }) => pickGift(key, `gift${key[0].toUpperCase()}${key.slice(1)}`, options));
  giftScenario.extra = flag('giftExtra');
  if (params.get('charmLabel')) giftScenario.charmLabel = params.get('charmLabel') ?? '心意值';
  if (params.get('birthdayBackend') === 'missing') birthdayScenario.backend = 'missing';
  if (['invalid_birthday', 'server'].includes(params.get('birthdaySaveError') ?? '')) Object.assign(birthdayScenario, { saveError: params.get('birthdaySaveError') });
  const birthdayParam = params.get('birthday');
  const birthdayParts = (birthdayParam ?? '').split('-').map(Number);
  const celebrate = flag('celebrate');
  if (celebrate || birthdayParam === 'today') {
    birthdayState.setMine('today', { showYear: flag('birthdayShowYear'), celebrated: !celebrate });
  } else if (birthdayParam && birthdayParam !== 'none' && birthdayParts.length === 3) {
    birthdayState.setMine({ year: birthdayParts[0], month: birthdayParts[1], day: birthdayParts[2] }, { showYear: flag('birthdayShowYear'), celebrated: true });
  }
  if (celebrate) {
    forgetBirthdayPlayed();
  }
  // 群友的生日：阿夸今天过（friendBirthday=0 关掉），薄荷糖公开了年份，其余没填
  if (params.get('friendBirthday') !== '0') birthdayState.setOther(2, 'today', true);
  birthdayState.setOther(3, { year: 2010, month: 12, day: 24 }, true);
  birthdayState.setOther(5, { year: 2007, month: 2, day: 29 });
  giftState.setup({ me: me.id, people, direct: [2], onMessage: (message) => harnessHistory.push(message) });
  // 阿夸身上装备着的两件算他永久拥有的：送礼面板里应该提前置灰
  giftState.setOwnedBy(2, ['bubble.starry', 'frame.starring']);
  // 礼物墙上摆一些：阿夸收到的多、种类全（含一件装扮），我收到几样，「没装扮的路人」一件都没有
  const wallGifts: Array<[number, number, string, number, string?]> = [[3, 2, 'flower', 12], [5, 2, 'flower', 30, '加油'], [1, 2, 'lollipop', 4, '我送的这条有留言'], [9, 2, 'cake', 2, '生日快乐'], [10, 2, 'trophy', 1], [3, 2, 'rocket', 1, '冲'], [5, 2, 'castle', 1], [2, 1, 'flower', 5, '谢谢你的教程'], [3, 1, 'cake', 1], [9, 1, 'trophy', 2, '厉害'], [2, 3, 'lollipop', 9], [1, 3, 'cake', 1], [2, 9, 'rocket', 2], [3, 10, 'flower', 40], [2, 5, 'trophy', 1]];
  wallGifts.forEach(([fromId, toId, giftKey, count, message], index) => giftState.seed({ fromId, toId, conversationId: null, giftKey, count, message, minutesAgo: (index + 1) * 60 * 7, onBirthday: index === 3 }));
  giftState.seed({ fromId: 9, toId: 2, conversationId: null, itemSku: 'frame.crowned', message: '', minutesAgo: 60 * 50 });
  giftState.seed({ fromId: 10, toId: 1, conversationId: null, itemSku: 'bubble.sakura', message: '春天的气泡', minutesAgo: 60 * 30 });
  if (params.get('giftFill')) giftState.fill(Number(params.get('giftFill')) || 0);
  harnessHistory.push(...await buildHistory());
  installFetch(harnessHistory);
  // 和真实应用同源：换存储键，免得把开发时真实的登录状态、主题、偏好冲掉
  useKukeStore.persist.setOptions({ name: 'kukechat-shop-harness' });
  useShopPrefs.persist.setOptions({ name: 'kukechat-shop-harness-prefs' });
  useThemeStore.persist.setOptions({ name: 'kukechat-shop-harness-theme' });
  const preset = params.get('preset');
  const wallpaper = params.get('wallpaper');
  const font = Number(params.get('font') ?? 1);
  const view = VIEWS.includes(params.get('view') as View) ? params.get('view') as View : 'shop';
  useKukeStore.setState({
    token: 'harness',
    // 当前用户对象上的装扮和假后端里「装备着的」保持一致，就像刚从 /auth/me 拿回来
    currentUser: { ...giftState.user(me.id), cosmetics: shopState.cosmetics() },
    activeConversationId: params.get('conv') === '2' ? 2 : 1,
    layoutMode: params.get('layout') === 'mobile' ? 'mobile' : 'desktop',
    themeMode: params.get('theme') === 'dark' ? 'dark' : 'light',
    uiFontScale: (font >= 0 && font <= 4 ? font : 1) as UiFontScale,
    isOpen: true,
    workspaceView: isGallery(view) ? 'shop' : view === 'app' ? 'chat' : view,
    pendingShop: false,
    themeSettings: { ...DEFAULT_THEME_SETTINGS, ...(preset ? { presetId: preset, wallpaper: getThemePreset(preset).wallpaper ?? 'none' } : {}), ...(wallpaper === 'window' || wallpaper === 'chat' ? { wallpaperScope: wallpaper, wallpaperDim: 20 } : {}) }
  });
  useShopPrefs.setState({ showOthersSkins: params.get('others') !== '0' });
  useThemeStore.setState({ performance: flag('perf') });
  queryClient.setQueryData(['conversations'], conversationsNow());
  Object.assign(window, { __shop: { scenario: shopScenario, state: shopState, requests: shopRequests, store: useKukeStore, prefs: useShopPrefs, queryClient, emit, redPacket: { scenario: redPacketScenario, state: redPacketState, requests: redPacketRequests, ui: useRedPacketUi }, bilibiliRequests, gift: { scenario: giftScenario, state: giftState, requests: giftRequests, ui: useGiftUi, receive: receiveGift, play: playEffect }, birthday: { scenario: birthdayScenario, state: birthdayState, requests: birthdayRequests } } });
  if (params.get('giftSend') === '1') {
    const conversationId = params.get('conv') === '2' ? 2 : 1;
    useGiftUi.getState().openSend({ toUser: params.get('giftTo') ? giftState.user(Number(params.get('giftTo'))) : conversationId === 1 ? null : giftState.user(2), candidates: conversationId === 1 ? members : null, conversationId: params.get('giftProfile') === '1' ? null : conversationId, itemSku: params.get('giftItem') ?? undefined });
  }
  const giftFx = params.get('giftFx');
  if (giftFx) {
    // 等聊天面板挂上来（visibleConversationId 有值）再排进队列
    window.setTimeout(() => (giftFx === '2' ? playEffect(2, 'cake', '蛋糕', 3) : giftFx === 'castle' ? playEffect(3, 'castle', '城堡') : giftFx === 'generic' ? playEffect(3, 'crown', '皇冠', 5) : playEffect(3, 'rocket', '火箭')), 900);
  }
  const openId = Number(params.get('rpOpenId'));
  if (openId) {
    const found = harnessHistory.find((message) => redPacketOf(message)?.id === openId);
    const meta = redPacketOf(found);
    if (found && meta) {
      useRedPacketUi.getState().open({ meta, conversationId: found.conversation_id, sender: found.sender ?? null });
    }
  }
  if (params.get('rpOpen') === '1') {
    // 点开当前会话里最新的那个红包（和点卡片是同一个入口）
    const conversationId = params.get('conv') === '2' ? 2 : 1;
    const latest = [...harnessHistory].reverse().find((message) => message.conversation_id === conversationId && redPacketOf(message));
    const meta = redPacketOf(latest);
    if (latest && meta) {
      useRedPacketUi.getState().open({ meta, conversationId, sender: latest.sender ?? null });
    }
  }
  createRoot(document.getElementById('root') as HTMLElement).render(
    <QueryClientProvider client={queryClient}>
      <Harness />
    </QueryClientProvider>
  );
}

void start();
