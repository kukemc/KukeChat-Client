import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { cx } from '@/components/chat/desktop/runtime';
import { formatCoins } from '@/components/shop/labels';
import { getDisplayName } from '@/components/ui/Avatar';
import { useKukeStore } from '@/store/kukeStore';
import type { Message, User } from '@/types/api';
import type { RedPacket, RedPacketMeta } from '@/types/redPacket';
import { parseApiDate } from '@/utils/dateTime';
import { isRedPacketExpired, recheckRedPacketPending, useRedPacket } from './data';
import { useRedPacketUi } from './ui';

/** 专属红包的目标怎么称呼：消息上的快照 > 红包状态里的；都没有就是「Ta」 */
export function redPacketTargetName(meta: Pick<RedPacketMeta, 'target'> | null | undefined, packet?: Pick<RedPacket, 'target'> | null): string {
  const target: User | null | undefined = meta?.target ?? packet?.target;
  return getDisplayName(target, 'Ta');
}

function stop(event: SyntheticEvent): void {
  event.stopPropagation();
}

/** 进过视口没有。进过一次就一直算进过：红包的状态取到之后靠事件更新，不需要再判断。 */
function useSeen<T extends Element>(): [React.RefObject<T>, boolean] {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(() => typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    const element = ref.current;
    if (seen || !element) {
      return undefined;
    }
    // 提前一点取：快滚到的时候就开始，露出来时多半已经有了
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setSeen(true);
      }
    }, { rootMargin: '160px 0px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, [seen]);
  return [ref, seen];
}

/** 现在过没过有效期。到点那一下自己刷新一次：服务端不会为过期推事件。 */
export function useRedPacketExpired(packet: RedPacket | undefined): boolean {
  const [now, setNow] = useState(() => Date.now());
  const expiresAt = packet && packet.status === 'active' ? parseApiDate(packet.expires_at)?.getTime() ?? null : null;
  useEffect(() => {
    if (expiresAt === null) {
      return undefined;
    }
    const wait = expiresAt - Date.now();
    if (wait <= 0) {
      setNow(Date.now());
      return undefined;
    }
    // setTimeout 的延时上限约 24.8 天，红包的有效期远小于它
    const timer = window.setTimeout(() => setNow(Date.now()), Math.min(wait + 50, 2_000_000_000));
    return () => window.clearTimeout(timer);
  }, [expiresAt]);
  return packet ? isRedPacketExpired(packet, now) : false;
}

type CardState = 'open' | 'waiting' | 'reserved' | 'claimed' | 'finished' | 'expired' | 'revoked';

const STATE_TEXT: Record<Exclude<CardState, 'claimed' | 'reserved'>, string> = {
  open: '领取红包',
  waiting: '等待对方领取',
  finished: '已被领完',
  expired: '已过期',
  revoked: '已撤回'
};

function cardState(packet: RedPacket | undefined, expired: boolean, mine: boolean, isGroup: boolean, forOther: boolean): CardState {
  if (!packet) {
    return forOther ? 'reserved' : mine && !isGroup ? 'waiting' : 'open';
  }
  if (packet.my_claim) {
    return 'claimed';
  }
  if (packet.status === 'revoked') {
    return 'revoked';
  }
  if (packet.status === 'finished') {
    return 'finished';
  }
  if (expired) {
    return 'expired';
  }
  // 给别人的专属红包：还在等那个人领（发的人自己也领不了）
  if (forOther) {
    return 'reserved';
  }
  // 私聊里自己发的红包自己不能领
  return mine && !isGroup ? 'waiting' : 'open';
}

/**
 * 聊天里的一张红包卡片，桌面和移动的消息列表共用。
 * 不变的部分（祝福语、种类、个数、接龙口令、专属给谁）来自消息上的 `metadata.red_packet`；状态（可领 / 我已领 / 已抢完 / 已过期 / 已撤回）
 * 来自按 id 缓存的 GET /red-packets/{id}，进入视口才取第一次，之后由 red_packet.updated 事件更新（见 data.ts）。
 * 点开交给 RedPacketHost 画弹层。
 */
export function RedPacketCard({ message, meta, mine, isGroup }: { message: Message; meta: RedPacketMeta; mine: boolean; isGroup: boolean }): JSX.Element {
  const [ref, seen] = useSeen<HTMLButtonElement>();
  const query = useRedPacket(meta.id, seen);
  const packet = query.data;
  const expired = useRedPacketExpired(packet);
  const open = useRedPacketUi((state) => state.open);
  const queryClient = useQueryClient();
  // 眼看着它到点过期的那一下（挂上来时就已经过期的不算）：会话列表上的「[有红包]」可能该摘了
  const wasLiveRef = useRef(false);
  const conversationId = message.conversation_id;
  useEffect(() => {
    if (packet && packet.status === 'active' && !expired) {
      wasLiveRef.current = true;
    } else if (expired && wasLiveRef.current) {
      wasLiveRef.current = false;
      recheckRedPacketPending(queryClient, conversationId);
    }
  }, [conversationId, expired, packet, queryClient]);
  const meId = useKukeStore((state) => state.currentUser?.id ?? null);
  const targetId = meta.target_user_id ?? packet?.target_user_id ?? null;
  const forMe = targetId !== null && targetId === meId;
  const forOther = targetId !== null && !forMe;
  const targetName = redPacketTargetName(meta, packet);
  const chainText = meta.chain_text ?? packet?.chain_text ?? null;
  const state = cardState(packet, expired, mine, isGroup, forOther);
  const dim = state === 'claimed' || state === 'finished' || state === 'expired' || state === 'revoked';
  const count = packet?.count ?? meta.count;
  const stateText = state === 'claimed' ? `已领取 ${formatCoins(packet?.my_claim?.amount ?? 0)} 币`
    : state === 'reserved' ? `仅 ${targetName} 可领`
    : state === 'finished' && count === 1 ? (targetId !== null ? `${targetName} 已领取` : '已被领取')
    : STATE_TEXT[state];
  const kindText = targetId !== null ? (forMe ? '给你的专属红包' : `给 ${targetName} 的专属红包`) : isGroup ? (meta.kind === 'lucky' ? '拼手气红包' : '普通红包') : '红包';

  return (
    <button
      ref={ref}
      type="button"
      className={cx('krp-card', dim && 'is-dim', `is-${state}`)}
      data-red-packet={String(meta.id)}
      data-state={state}
      data-chain={chainText ? '' : undefined}
      data-exclusive={targetId !== null ? (forMe ? 'me' : 'other') : undefined}
      aria-label={`${kindText}：${meta.greeting}${chainText ? `，接龙口令「${chainText}」` : ''}，${stateText}`}
      onClick={(event) => {
        event.stopPropagation();
        open({ meta, conversationId: message.conversation_id, sender: message.sender ?? null });
      }}
      // 行上的双击是「引用」，连点红包不该触发它
      onDoubleClick={stop}
    >
      <span className="krp-card-body">
        <span className="krp-seal" aria-hidden="true"><i>福</i></span>
        <span className="krp-card-text">
          <span className="krp-card-greeting">{meta.greeting}</span>
          {chainText ? <span className="krp-card-chain" title="领取时会自动发出这句话"><b>接龙</b><span>{chainText}</span></span> : null}
          <span className="krp-card-state">{stateText}</span>
        </span>
      </span>
      <span className="krp-card-foot">
        <span className="krp-card-kind">{kindText}</span>
        {packet && count > 1 ? <span className="krp-card-progress">{Math.min(packet.claimed_count, count)}/{count}</span> : null}
      </span>
    </button>
  );
}
