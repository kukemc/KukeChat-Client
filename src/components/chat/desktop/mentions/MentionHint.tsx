import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import type { UnreadMention } from './useUnreadMentions';

export interface MentionHintProps {
  /** 还没看过的 @我 / @全体，最早的在前（useUnreadMentions） */
  items: UnreadMention[];
  /** 跳到那条消息（MessageList 的 jumpToMessage） */
  onJump: (messageId: number) => Promise<void> | void;
  /** 跳过去的那条算看过 */
  onSeen: (messageIds: number[]) => void;
}

/** 列表最多显示到 99，再多说「99+」 */
const COUNT_LIMIT = 99;
/**
 * 新出现的 @ 等这么久才浮出来：停在底部时新来的那条 @ 一进来就在视口里，马上会被认成「看过」，
 * 不等一下的话提示会闪一下又消失。
 */
const SHOW_DELAY_MS = 600;

/**
 * 聊天区右上角的「有人@我」/「N 条@我」，和「N 个红包未领」同一种浮起的墨色字胶囊（直接借 .krp-pending 的样式，只换图标颜色）。
 * 点一下跳到最早的那条，跳过去它就算看过；再点就是下一条。都看过了（跳过去、或者自己滚到那里）就消失。
 */
export function MentionHint({ items, onJump, onSeen }: MentionHintProps): JSX.Element | null {
  const hasItems = items.length > 0;
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!hasItems) {
      setReady(false);
      return undefined;
    }
    const timer = window.setTimeout(() => setReady(true), SHOW_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [hasItems]);

  const [busy, setBusy] = useState(false);
  // 消失时保留上一次的文案，淡出的那一下不会变成「0 条」
  const lastRef = useRef<{ count: number; kind: UnreadMention['kind'] } | null>(null);
  const visible = hasItems && ready;
  if (visible) {
    lastRef.current = { count: items.length, kind: items.some((item) => item.kind === 'me') ? 'me' : 'all' };
  }
  const shown = lastRef.current;
  if (!shown) {
    return null;
  }

  function jump(): void {
    if (busy || items.length === 0) {
      return;
    }
    const target = items[0].messageId;
    setBusy(true);
    void Promise.resolve(onJump(target)).finally(() => {
      // 跳过去了就算看过（拉上下文失败也算，不然点不动的那条会一直挂着）
      onSeen([target]);
      setBusy(false);
    });
  }

  const label = shown.count > 1
    ? <><b>{shown.count > COUNT_LIMIT ? `${COUNT_LIMIT}+` : shown.count}</b> 条@我</>
    : shown.kind === 'me' ? '有人@我' : '@全体成员';
  const plain = shown.count > 1 ? `${shown.count} 条@我` : shown.kind === 'me' ? '有人@我' : '有人@全体成员';
  const hint = items.length > 1 ? '跳到最早的那条，再点跳到下一条' : '跳到这条消息';
  return (
    <button
      type="button"
      className={visible ? 'krp-pending kcd-atme-hint is-visible' : 'krp-pending kcd-atme-hint'}
      onClick={jump}
      disabled={busy}
      tabIndex={visible ? 0 : -1}
      aria-hidden={!visible}
      title={hint}
      aria-label={`${plain}，${hint}`}
      data-mention-pending={visible ? items.length : 0}
    >
      <Icon name="atSign" className="kcd-atme-hint-icon" />
      <span className="krp-pending-text">{label}</span>
      <span className="krp-pending-arrow" aria-hidden="true" />
    </button>
  );
}
