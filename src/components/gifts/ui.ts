import { create } from 'zustand';
import { useRedPacketMotion } from '@/components/redpacket/ui';
import { useKukeStore } from '@/store/kukeStore';
import { useThemeStore } from '@/theme/themeStore';
import type { ConversationMember, Message, User } from '@/types/api';
import type { GiftMeta } from '@/types/gift';
import { giftOf, giftTierOf } from '@/utils/gift';

/**
 * 礼物的界面状态：正开着的送礼面板、排队等着播的动效、哪些礼物卡片是「刚到的」。
 *
 * 送礼面板只有一个，由主界面上的 GiftSendHost 画 —— 入口散在输入区工具栏、成员菜单、资料卡、个人空间、生日提示上，
 * 它们只管把「送给谁、在哪个会话里」交出来。
 *
 * 动效只在消息新到达、而且那个会话正开着的时候播一次（翻历史不播）：收到 message.created（或者自己送成功）时调
 * noteGiftArrival。tier 1 是卡片里的小动画，卡片自己看 fresh 表；tier 2 / 3 进队列，一次只播一个，播完才轮到下一个。
 * 系统开了「减少动态效果」或者外观里开了「性能优先」时什么都不播。
 */

export interface GiftSendTarget {
  /** 送给谁。群里从工具栏进来时还没定，是 null，面板先让人选 */
  toUser: User | null;
  /** 群里可以选的人（从工具栏进来时给）；已经定了收礼人就不用 */
  candidates: ConversationMember[] | null;
  /** 在哪个会话里送；null 表示从个人空间 / 资料卡送，不落聊天消息 */
  conversationId: number | null;
  /** 打开时先停在「装扮」页签上的这一件 */
  itemSku?: string;
  /** 送成功、而且落了聊天消息之后调用（让消息列表回到最新） */
  onSent?: () => void;
}

export interface GiftEffect {
  /** 礼物记录的 id，去重用 */
  id: number;
  conversationId: number;
  tier: 2 | 3;
  icon: string;
  name: string;
  count: number;
  fromName: string;
  toName: string;
}

interface GiftUiState {
  sendTarget: GiftSendTarget | null;
  openSend: (target: GiftSendTarget) => void;
  closeSend: () => void;
  /** 等着播的动效，queue[0] 是正在播的那个 */
  queue: GiftEffect[];
  enqueue: (effect: GiftEffect) => void;
  finish: (id: number) => void;
  /** 刚到的礼物：礼物 id → 到达的时刻。卡片挂上来时在里面、而且没过多久，就播一次小动画 */
  fresh: Record<number, number>;
  markFresh: (id: number) => void;
}

/** 队列里最多攒这么多个：群里连着刷礼物时不至于排到几分钟以后去 */
const QUEUE_MAX = 6;
/** 卡片的小动画只在到达后的这段时间内播（之后再滚回来就是普通的卡片了） */
export const GIFT_FRESH_MS = 4_000;

export const useGiftUi = create<GiftUiState>((set) => ({
  sendTarget: null,
  openSend: (target) => set({ sendTarget: target }),
  closeSend: () => set({ sendTarget: null }),
  queue: [],
  enqueue: (effect) => set((state) => (state.queue.length >= QUEUE_MAX || state.queue.some((item) => item.id === effect.id) ? state : { queue: [...state.queue, effect] })),
  finish: (id) => set((state) => (state.queue.some((item) => item.id === id) ? { queue: state.queue.filter((item) => item.id !== id) } : state)),
  fresh: {},
  markFresh: (id) => set((state) => {
    const now = Date.now();
    // 顺手把早就不新鲜的清掉，表不会越攒越大
    const fresh = Object.fromEntries(Object.entries(state.fresh).filter(([, at]) => now - at < GIFT_FRESH_MS * 4));
    return { fresh: { ...fresh, [id]: now } };
  })
}));

/** 礼物的动效播不播：系统开了「减少动态效果」、或者外观里开了「性能优先」就不播。和红包是同一个判断 */
export const useGiftMotion = useRedPacketMotion;

/** 不在组件里的时候问「现在播不播动效」。 */
export function giftMotionAllowed(): boolean {
  const reduced = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return !reduced && !useThemeStore.getState().performance;
}

// 已经处理过的礼物：同一条消息会从两条路过来（自己送成功的回包、紧接着的 message.created），只算一次
const seen = new Set<number>();

function senderName(message: Message): string {
  return message.sender_display_name || message.sender?.nickname || message.sender?.username || '有人';
}

/**
 * 一条礼物消息刚到（实时事件，或者自己送成功）。只有它所在的会话正开着才算数：标成「刚到的」，tier 2 / 3 的排进动效队列。
 * 返回这条消息带的礼物（不是礼物消息返回 null），调用方不用再解析一遍。
 */
export function noteGiftArrival(message: Message): GiftMeta | null {
  const meta = giftOf(message);
  if (!meta || seen.has(meta.id)) {
    return meta;
  }
  seen.add(meta.id);
  if (useKukeStore.getState().visibleConversationId !== message.conversation_id || !giftMotionAllowed()) {
    return meta;
  }
  const ui = useGiftUi.getState();
  ui.markFresh(meta.id);
  const tier = giftTierOf(meta);
  if (tier !== 1 && meta.gift) {
    ui.enqueue({ id: meta.id, conversationId: message.conversation_id, tier, icon: meta.gift.icon, name: meta.gift.name, count: meta.count, fromName: senderName(message), toName: meta.to_user.display_name });
  }
  return meta;
}

/** 礼物卡片上的收礼人只有 id、名字、头像：凑成一个能交给头像组件的用户对象。 */
export function recipientAsUser(recipient: GiftMeta['to_user']): User {
  return { id: recipient.id, username: '', nickname: recipient.display_name, avatar_url: recipient.avatar_url };
}
