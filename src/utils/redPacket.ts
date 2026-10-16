import type { Message, User } from '@/types/api';
import type { RedPacketId, RedPacketMeta } from '@/types/redPacket';

/**
 * 「这条消息是不是红包」以及它在各种摘要里怎么写。纯函数，不依赖接口层：
 * 会话列表、通知、搜索、引用预览、消息卡片都从这里判断。
 */

export const DEFAULT_RED_PACKET_GREETING = '恭喜发财';
export const RED_PACKET_GREETING_MAX = 30;
/** 接龙口令最长几个字（docs/red-packets.md 3.6.1） */
export const RED_PACKET_CHAIN_MAX = 30;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isRedPacketId(value: unknown): value is RedPacketId {
  return typeof value === 'number' && Number.isInteger(value);
}

/** 消息上的 `metadata.red_packet`。形状不对返回 null，那条消息按普通文字（content 里的兜底文字）显示。 */
export function normalizeRedPacketMeta(value: unknown): RedPacketMeta | null {
  if (!isRecord(value) || !isRedPacketId(value.id)) {
    return null;
  }
  const count = typeof value.count === 'number' && Number.isFinite(value.count) ? Math.max(1, Math.floor(value.count)) : 1;
  const greeting = typeof value.greeting === 'string' ? value.greeting.trim() : '';
  const meta: RedPacketMeta = { id: value.id, kind: value.kind === 'lucky' ? 'lucky' : 'normal', greeting: greeting || DEFAULT_RED_PACKET_GREETING, count };
  // 接龙、专属的那几项只在是的时候才有（普通红包的 metadata 和以前一样）
  const chainText = typeof value.chain_text === 'string' ? value.chain_text.trim() : '';
  if (chainText) {
    meta.chain_text = chainText;
  }
  if (typeof value.target_user_id === 'number' && Number.isInteger(value.target_user_id) && value.target_user_id > 0) {
    meta.target_user_id = value.target_user_id;
    meta.target = isRecord(value.target) && typeof value.target.id === 'number' ? value.target as unknown as User : null;
  }
  return meta;
}

/** 这是不是给别人的专属红包（我领不了）。不是专属红包、或者就是给我的，都是 false。 */
export function isExclusiveForOther(meta: Pick<RedPacketMeta, 'target_user_id'> | null | undefined, meId: number | null | undefined): boolean {
  const target = meta?.target_user_id ?? null;
  return target !== null && target !== meId;
}

/** 领取接龙红包时自动发出的那条消息指向的红包 id；不是这种消息是 null。 */
export function redPacketChainOf(message: Pick<Message, 'type' | 'metadata'> | null | undefined): RedPacketId | null {
  const chain = message?.type === 'text' ? message.metadata?.red_packet_chain : null;
  return isRecord(chain) && isRedPacketId(chain.red_packet_id) ? chain.red_packet_id : null;
}

export function isRedPacketMessage(message: Pick<Message, 'type'> | null | undefined): boolean {
  return message?.type === 'red_packet';
}

/** 一条消息带的红包；不是红包消息、已撤回、或者数据读不出来都是 null。 */
export function redPacketOf(message: Message | null | undefined): RedPacketMeta | null {
  if (!message || message.type !== 'red_packet' || message.recalled_at) {
    return null;
  }
  return normalizeRedPacketMeta(message.metadata?.red_packet);
}

/** 红包消息的祝福语；不是红包消息返回 null。会话列表前面已经有「[有红包]」时只接祝福语，不再重复一个「[红包]」。 */
export function redPacketGreeting(message: Message | null | undefined): string | null {
  if (!message || message.type !== 'red_packet') {
    return null;
  }
  return normalizeRedPacketMeta(message.metadata?.red_packet)?.greeting ?? DEFAULT_RED_PACKET_GREETING;
}

/** 撤回红包消息 = 撤销红包（没领的退回）。撤回之前问一句。mine：是不是我自己发的。 */
export function redPacketRecallConfirmText(mine: boolean): string {
  return mine
    ? '撤回这个红包吗？没领完的金币会退回你的余额，已经被领走的不受影响。'
    : '撤回这个红包吗？没领完的金币会退回给发红包的人，已经被领走的不受影响。';
}

/** 摘要里的写法：「[红包] 祝福语」。不是红包消息返回 null。 */
export function redPacketPreview(message: Message | null | undefined): string | null {
  if (!message || message.type !== 'red_packet') {
    return null;
  }
  const meta = normalizeRedPacketMeta(message.metadata?.red_packet);
  const greeting = meta?.greeting ?? DEFAULT_RED_PACKET_GREETING;
  const label = meta?.target_user_id ? (meta.chain_text ? '专属接龙红包' : '专属红包') : meta?.chain_text ? '接龙红包' : '红包';
  return `[${label}] ${greeting}`;
}
