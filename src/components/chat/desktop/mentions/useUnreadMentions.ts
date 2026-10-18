import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError } from '@/api/client';
import { getUnreadMentions, type UnreadMentionItem } from '@/api/messages';
import type { Message } from '@/types/api';
import { mentionMetadataOf, senderOf } from '../../message/messageMeta';

/*
 * 聊天区右上角「有人@我」/「N 条@我」的数据：进会话时还没读的、以及待在会话里这段时间新来的 @我 / @全体成员。
 *
 * 两路合在一起：
 *   · 服务端 GET /conversations/{cid}/mentions/unread：已读位置之后的全部（没加载到的那些也在里面）。
 *     旧后端没有这个接口（404 / 405 / 422 / 501）、我不在会话里（403）就当没有，只靠下面那路；
 *   · 本地：已加载的消息、实时推进来的消息里，比进会话时的已读位置新、metadata 里点了我或者 @全体 的 —— 不用等接口，来了就有。
 * 看过就不算：那一行在视口里露过脸（MessageList 报上来），或者点提示跳过去了。
 */

export type MentionKind = 'me' | 'all';

export interface UnreadMention {
  messageId: number;
  kind: MentionKind;
}

/** 等接口回来最多等这么久（标已读要等它，见 MessageList） */
const REMOTE_GATE_MS = 1500;

/** 这条消息 @ 了谁：点名我是 'me'，@全体成员是 'all'，都不是 null。自己发的、撤回的、系统消息不算。 */
export function mentionKindOf(message: Message, currentUserId: number): MentionKind | null {
  if (message.id <= 0 || message.type === 'system' || message.recalled_at) {
    return null;
  }
  if ((message.sender_id ?? senderOf(message)?.id) === currentUserId) {
    return null;
  }
  const { mentions, mentionAll } = mentionMetadataOf(message);
  if (mentions.some((mention) => mention.user_id === currentUserId)) {
    return 'me';
  }
  return mentionAll ? 'all' : null;
}

function isMissingEndpoint(error: unknown): boolean {
  return error instanceof ApiError && [403, 404, 405, 422, 501].includes(error.status);
}

export interface UseUnreadMentionsOptions {
  conversationId: number;
  currentUserId: number;
  /** 列表里已加载的消息（含实时推进来的） */
  messages: Message[];
  /** 进会话时有没有未读（没有就不用去问服务端） */
  hasUnread: boolean;
  /** 进会话那一刻的已读位置；比它新的才算。拿不到时为 null，由 fallbackBaseline 兜底 */
  baselineId: number | null;
}

export interface UnreadMentionsState {
  /** 还没看过的，最早的在前 */
  items: UnreadMention[];
  /** 这几行看过了 */
  noteSeen: (messageIds: Iterable<number>) => void;
  /** 进会话时去问服务端的那个请求（最多等 REMOTE_GATE_MS）；不用问时是 null。标已读要等它落定，免得服务端先把已读位置挪走 */
  remoteGateRef: React.MutableRefObject<Promise<unknown> | null>;
}

export function useUnreadMentions({ conversationId, currentUserId, messages, hasUnread, baselineId }: UseUnreadMentionsOptions): UnreadMentionsState {
  const [remote, setRemote] = useState<UnreadMentionItem[]>([]);
  const [seen, setSeen] = useState<ReadonlySet<number>>(() => new Set());
  const remoteGateRef = useRef<Promise<unknown> | null>(null);

  // 没有已读位置时的兜底：第一次拿到消息时最早那条之前都算读过（进会话时没未读就从最新那条之后算）
  const fallbackRef = useRef<number | null>(null);
  if (fallbackRef.current === null && baselineId === null && messages.length > 0) {
    const real = messages.filter((message) => message.id > 0);
    if (real.length > 0) {
      fallbackRef.current = hasUnread ? real[0].id - 1 : real[real.length - 1].id;
    }
  }
  const baseline = baselineId ?? fallbackRef.current;

  // 进会话问一次服务端。和 MessageList 的「标已读」是同一轮 effect，这个声明在前、先跑
  const requestedRef = useRef(false);
  useEffect(() => {
    if (requestedRef.current || !hasUnread) {
      return;
    }
    // 只问一次（StrictMode 下 effect 会跑两遍）；回来时组件已经卸了的话 setState 什么也不做
    requestedRef.current = true;
    const request = getUnreadMentions(conversationId, baselineId).then((items) => {
      setRemote(items);
    }).catch((error: unknown) => {
      // 接口不在、网络出错都只是少了没加载到的那些，本地那路照常
      if (!isMissingEndpoint(error) && import.meta.env.DEV) {
        console.warn('[mentions] 拉取未读 @ 失败', error);
      }
    });
    remoteGateRef.current = Promise.race([request, new Promise((resolve) => window.setTimeout(resolve, REMOTE_GATE_MS))]);
    // 只在进会话时问一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const items = useMemo(() => {
    const byId = new Map<number, MentionKind>();
    const loaded = new Map<number, Message>();
    for (const message of messages) {
      loaded.set(message.id, message);
    }
    for (const item of remote) {
      // 已加载的以本地为准：撤回了、其实没 @ 我（服务端口径变了）就不算
      const message = loaded.get(item.message_id);
      if (message) {
        const kind = mentionKindOf(message, currentUserId);
        if (kind) {
          byId.set(item.message_id, kind);
        }
      } else {
        byId.set(item.message_id, item.kind);
      }
    }
    if (baseline !== null) {
      for (const message of messages) {
        if (message.id > baseline && !byId.has(message.id)) {
          const kind = mentionKindOf(message, currentUserId);
          if (kind) {
            byId.set(message.id, kind);
          }
        }
      }
    }
    return Array.from(byId, ([messageId, kind]) => ({ messageId, kind }))
      .filter((item) => !seen.has(item.messageId))
      .sort((left, right) => left.messageId - right.messageId);
  }, [baseline, currentUserId, messages, remote, seen]);

  const itemsRef = useRef(items);
  itemsRef.current = items;
  const noteSeen = useCallback((messageIds: Iterable<number>) => {
    const pending = new Set(itemsRef.current.map((item) => item.messageId));
    const hits = Array.from(messageIds).filter((id) => pending.has(id));
    if (hits.length === 0) {
      return;
    }
    setSeen((current) => {
      const next = new Set(current);
      hits.forEach((id) => next.add(id));
      return next;
    });
  }, []);

  return { items, noteSeen, remoteGateRef };
}
