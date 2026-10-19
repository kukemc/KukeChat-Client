import type { Message, User, VoiceMessageMetadata } from './api';

/**
 * 红包（前缀 /api/v1/red-packets）。用金币余额发、抢；余额的算法见 KukeChat-Server 的 docs/shop.md 第 1 节：
 * 余额 = CCW 核实的累计投币 − 商店花掉的 − 发出的红包 + 抢到的 + 退回的。发的时候立刻扣整包金额。
 */

/** normal 每个一样多；lucky 拼手气，总额随机分 */
export type RedPacketKind = 'normal' | 'lucky';
export type RedPacketStatus = 'active' | 'finished' | 'expired' | 'revoked';
export type RedPacketId = number;

/** 消息上带的红包信息：`message.metadata.red_packet`。只有不会变的字段，状态要另取。 */
export interface RedPacketMeta {
  id: RedPacketId;
  kind: RedPacketKind;
  greeting: string;
  count: number;
  /** 接龙口令：领取时自动以领取人的身份发出这句话（3.6.1）。不是接龙红包没有这一项 */
  chain_text?: string | null;
  /** 专属红包给谁（3.6.2）。只有目标本人能领 */
  target_user_id?: number | null;
  /** 语音红包（消息上标了 voice 或者带了口令）。不是语音红包没有这一项 */
  voice?: boolean;
  /** 语音红包：要念出来的口令。消息上不一定带（以红包状态里的为准）；不是语音红包没有这一项 */
  voice_text?: string | null;
  /** 专属红包的目标，发的时候的快照 */
  target?: User | null;
}

/** 服务端支持的玩法（GET /red-packets/config 的 features）。旧服务端没有这个字段，当成空列表 */
export type RedPacketFeature = 'chain' | 'exclusive' | 'voice';

export interface RedPacketClaim {
  user: User;
  amount: number;
  created_at: string;
  is_luckiest: boolean;
}

/** GET /red-packets/{id} */
export interface RedPacket {
  id: RedPacketId;
  kind: RedPacketKind;
  greeting: string;
  sender: User | null;
  /** 接龙口令；不是接龙红包为 null */
  chain_text: string | null;
  /** 是不是语音红包：领的时候要现场录音念出 voice_text */
  voice: boolean;
  /** 语音红包要念的口令；不是语音红包为 null */
  voice_text: string | null;
  /** 专属红包给谁；不是专属红包为 null */
  target_user_id: number | null;
  target: User | null;
  conversation_id: number;
  message_id: number;
  /** 总金额。只有我已领、我是发的人、或红包已不是 active 时才有，否则为 null（claimed_amount、claims 同理） */
  total: number | null;
  count: number;
  claimed_count: number;
  claimed_amount: number | null;
  /** 结束时退回发送者的部分（进行中、抢完的是 0）。可见性和 total 一样，看不到时是 null */
  refunded_amount: number | null;
  status: RedPacketStatus;
  my_claim: { amount: number; created_at: string } | null;
  expires_at: string | null;
  created_at: string;
  finished_at: string | null;
  claims: RedPacketClaim[] | null;
}

export interface RedPacketLimits {
  /** 一个红包的总额上限 */
  max_total: number;
  /** 一个红包最多分成几个 */
  max_count: number;
  /** 每个至少多少币 */
  min_each: number;
  /** 每人每天最多发几个 */
  daily_send_limit: number;
  /** 多少小时没领完就过期，剩下的退回 */
  expire_hours: number;
}

/** GET /red-packets/config */
export interface RedPacketConfig {
  enabled: boolean;
  limits: RedPacketLimits;
  sent_today: number;
  /** 服务端支持的玩法；旧服务端没有这个字段时是空列表，界面上不出现新选项 */
  features: RedPacketFeature[];
}

/** POST /red-packets 的请求体。normal 的 amount 是单个金额，lucky 的 amount 是总额。 */
export interface SendRedPacketPayload {
  conversation_id: number;
  kind: RedPacketKind;
  amount: number;
  count: number;
  greeting: string;
  /** 接龙口令（1–30 字，不能换行）。不是接龙红包就不带 */
  chain_text?: string;
  /** 专属红包的目标。只能在群里用，kind 必须是 normal、count 为 1 */
  target_user_id?: number;
  /** 语音红包的口令（1–30 字，不能换行），和 chain_text 互斥。不是语音红包就不带 */
  voice_text?: string;
}

/** 领语音红包时的请求体：录音先传到 /uploads/message-voice，再把 url 和平时语音消息 metadata.voice 里的那些字段一起交上去 */
export interface ClaimRedPacketVoice {
  voice_url: string;
  voice_metadata: VoiceMessageMetadata;
}

/**
 * 接口回包里的 balance：发、抢之后的余额，商店那种余额对象（docs/shop.md 3.1）。
 * 只留读得出来的那几项，合并进手头的余额；读不出来是 null。
 */
export type RedPacketBalance = Partial<import('./shop').ShopBalance> | null;

/** POST /red-packets */
export interface SendRedPacketResult {
  red_packet: RedPacket | null;
  message: Message | null;
  balance: RedPacketBalance;
}

/** POST /red-packets/{id}/claim */
export interface ClaimRedPacketResult {
  amount: number;
  red_packet: RedPacket | null;
  balance: RedPacketBalance;
  /** 接龙红包 / 语音红包：领取时以我的身份发出的那条消息（接龙是口令文字，语音是我的录音）；其它红包为 null。同一条还会从 message.created 推过来，按 id 去重 */
  message: Message | null;
}

export type RedPacketDirection = 'sent' | 'received';

/** 红包记录里的一行。sent 时 amount 是这个红包的总额，received 时是我抢到的。 */
export interface RedPacketRecord {
  key: string;
  id: RedPacketId;
  conversation_id: number;
  kind: RedPacketKind;
  greeting: string;
  amount: number;
  created_at: string;
  sender: User | null;
  count: number;
  claimed_count: number;
  /** 状态；回包里没有就是 null */
  status: RedPacketStatus | null;
  /** 发出的红包没领完退回了多少（过期、撤回）；没退过是 0。这个列表里的红包对象不带领取明细（claims 恒为 null），要看明细点开再取 */
  refunded_amount: number;
}

/** GET /red-packets/mine */
export interface RedPacketRecordPage {
  items: RedPacketRecord[];
  total: number;
  /** 这个方向上的合计金币 */
  sum: number;
}

/** 实时事件 red_packet.updated 的 data（不带金额） */
export interface RedPacketUpdate {
  id: RedPacketId;
  conversation_id: number;
  message_id: number;
  claimed_count: number;
  count: number;
  status: RedPacketStatus;
}

/** GET /red-packets/pending?conversation_id=… 的一项：这个会话里我还能领的红包（不带金额）。列表新的在前，最多 20 个。 */
export interface PendingRedPacket {
  id: RedPacketId;
  message_id: number;
  sender_id: number | null;
  kind: RedPacketKind;
  greeting: string;
  count: number;
  claimed_count: number;
  expires_at: string | null;
  created_at: string;
  chain_text: string | null;
  target_user_id: number | null;
  /** 语音红包的口令；不是语音红包、或者旧服务端没给是 null */
  voice_text: string | null;
}
