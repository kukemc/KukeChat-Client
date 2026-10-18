import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import type { PendingRedPacket } from '@/types/redPacket';
import { parseApiDate } from '@/utils/dateTime';
import { usePendingRedPackets } from './data';
import { isRedPacketSeen, markRedPacketsSeen, useSeenRedPacketsVersion } from './seenPackets';

export interface RedPacketPendingHintProps {
  conversationId: number;
  /** 跳到那条红包消息（MessageList 的 jumpToMessage：不在已加载范围里会拉上下文，跳过去居中、高亮） */
  onJump: (messageId: number) => Promise<void> | void;
}

/** 列表最多 20 个；正好 20 个时说「20+」 */
const LIST_LIMIT = 20;
/** setTimeout 的上限大约 24.8 天，再长就分几次等 */
const MAX_TIMER_MS = 2_000_000_000;

function expiresAtOf(item: PendingRedPacket): number | null {
  return parseApiDate(item.expires_at)?.getTime() ?? null;
}

/**
 * 聊天区右上角的「N 个红包未领」。数据见 data.ts 的 usePendingRedPackets，领完、抢完、过期、撤回后自己消失。
 *
 * 看过的不算（seenPackets.ts）：点提示跳过去的那个、卡片在视口里露过脸的那些 —— 有的红包就是不想领，看过就别一直催。
 * 所以点一下总是跳到「最早的、还没看过的」那个，跳过去它就算看过了；再点就是下一个。都看过了提示就消失。
 */
export function RedPacketPendingHint({ conversationId, onJump }: RedPacketPendingHintProps): JSX.Element | null {
  const query = usePendingRedPackets(conversationId);
  const [now, setNow] = useState(() => Date.now());
  const seenVersion = useSeenRedPacketsVersion();

  // 还没过期、还没看过的，最早的在前（接口给的是新的在前）
  const items = useMemo(() => (query.data ?? [])
    .filter((item) => {
      const expiresAt = expiresAtOf(item);
      return (expiresAt === null || expiresAt > now) && !isRedPacketSeen(item.message_id);
    })
    .slice()
    .reverse(), [now, query.data, seenVersion]);

  // 到下一个过期的点再算一次
  useEffect(() => {
    const next = (query.data ?? []).map(expiresAtOf).filter((value): value is number => value !== null && value > now);
    if (next.length === 0) {
      return undefined;
    }
    const wait = Math.min(Math.max(0, Math.min(...next) - Date.now()) + 50, MAX_TIMER_MS);
    const timer = window.setTimeout(() => setNow(Date.now()), wait);
    return () => window.clearTimeout(timer);
  }, [now, query.data]);

  const [busy, setBusy] = useState(false);
  // 消失时保留上一次的数字，淡出的那一下不会变成「0 个」
  const lastCountRef = useRef(0);
  const visible = items.length > 0;
  if (visible) {
    lastCountRef.current = items.length;
  }
  const shown = lastCountRef.current;
  if (shown === 0) {
    return null;
  }
  const countText = shown >= LIST_LIMIT ? `${LIST_LIMIT}+` : String(shown);

  function jump(): void {
    if (busy || items.length === 0) {
      return;
    }
    const target = items[0].message_id;
    setBusy(true);
    void Promise.resolve(onJump(target)).finally(() => {
      // 跳过去了就算看过（跳的时候拉上下文失败也算：不想让它一直挂着）
      markRedPacketsSeen([target]);
      setBusy(false);
    });
  }

  const hint = items.length > 1 ? '跳到最早的那个没看过的红包，再点跳到下一个' : '跳到这个红包';
  return (
    <button
      type="button"
      className={visible ? 'krp-pending is-visible' : 'krp-pending'}
      onClick={jump}
      disabled={busy}
      tabIndex={visible ? 0 : -1}
      aria-hidden={!visible}
      title={hint}
      aria-label={`${countText} 个红包未领，${hint}`}
      data-red-packet-pending={visible ? items.length : 0}
    >
      <Icon name="redPacket" className="krp-pending-icon" />
      <span className="krp-pending-text"><b>{countText}</b> 个红包未领</span>
      <span className="krp-pending-arrow" aria-hidden="true" />
    </button>
  );
}
