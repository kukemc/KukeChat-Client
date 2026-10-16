import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import type { PendingRedPacket } from '@/types/redPacket';
import { parseApiDate } from '@/utils/dateTime';
import { usePendingRedPackets } from './data';

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
 * 点一下跳到最早的那个没领的；不领、接着点，就往新的一个个跳，跳到最新的之后再回到最早的。
 * 列表一变（领掉一个、来了新的），下一次又从最早的开始 —— 领完一个再点，正好是下一个最早的。
 */
export function RedPacketPendingHint({ conversationId, onJump }: RedPacketPendingHintProps): JSX.Element | null {
  const query = usePendingRedPackets(conversationId);
  const [now, setNow] = useState(() => Date.now());

  // 还没过期的，最早的在前（接口给的是新的在前）
  const items = useMemo(() => (query.data ?? [])
    .filter((item) => {
      const expiresAt = expiresAtOf(item);
      return expiresAt === null || expiresAt > now;
    })
    .slice()
    .reverse(), [now, query.data]);

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

  const signature = items.map((item) => item.id).join(',');
  const cursorRef = useRef(0);
  useEffect(() => {
    cursorRef.current = 0;
  }, [signature]);

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
    const index = cursorRef.current % items.length;
    cursorRef.current = index + 1;
    setBusy(true);
    void Promise.resolve(onJump(items[index].message_id)).finally(() => setBusy(false));
  }

  const hint = items.length > 1 ? '点一下跳到最早的那个，再点依次跳到下一个' : '跳到这个红包';
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
