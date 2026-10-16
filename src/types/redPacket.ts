import type { Message, User } from './api';

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
}

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
}

/** POST /red-packets 的请求体。normal 的 amount 是单个金额，lucky 的 amount 是总额。 */
export interface SendRedPacketPayload {
  conversation_id: number;
  kind: RedPacketKind;
  amount: number;
  count: number;
  greeting: string;
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
