import { Component, forwardRef, memo, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { getMessageContext, getMessages } from '@/api/messages';
import { subscribePoke } from '@/realtime/poke';
import { toast } from '@/components/ui/toast';
import { useKukeStore } from '@/store/kukeStore';
import { markConversationReadLocally } from '@/store/readMarks';
import type { Conversation, Message } from '@/types/api';
import { parseApiDate } from '@/utils/dateTime';
import { MESSAGE_PAGE_SIZE } from '../message/constants';
import { repeatableContentOf, senderOf, shouldShowTimeDivider } from '../message/messageMeta';
import type { MessagesInfiniteData } from '../message/types';
import { messageRowKey, usePendingEntries } from '../message/pendingSend';
import { useChatUploadMessages } from '../message/chatUploads';
import { MessageRow } from './MessageRow';
import { cx } from './runtime';
import { TypingIndicator } from './typing/TypingIndicator';
import { paintRange, toastSelectionLimit } from './selection';
import { RedPacketPendingHint } from '@/components/redpacket/RedPacketPendingHint';

/*
 * 消息列表。
 *
 * 这里故意不做虚拟滚动。虚拟列表要在滚动途中用脚本改 scrollTop 来补偿行高误差，而脚本滚动会
 * 打断滚轮的平滑动画，表现出来就是「回弹」和「抖动」。改为把已加载的消息都渲染成普通 DOM，
 * 位置保持交给浏览器原生的滚动锚定（scroll anchoring）：上方插入更早的消息、图片加载撑高，
 * 浏览器都会自己补偿，不打断正在进行的滚动。
 *
 * 代价是 DOM 行数不能无限涨，所以对已加载的数据设了上限（MAX_ROWS）：往上翻得太远就丢掉最新的
 * 一段、往下翻回来再丢掉最旧的一段。丢掉的都在视口之外，看不出来。
 */

export interface MessageListHandle {
  /** 跳到指定消息并高亮；不在已加载范围内时会先拉取它附近的上下文。 */
  jumpToMessage: (messageId: number) => Promise<void>;
  /** 回到最新消息并保持贴底。 */
  scrollToLatest: () => void;
  getMessages: () => Message[];
}

interface MessageListProps {
  conversation: Conversation;
  currentUserId: number;
  selectMode: boolean;
  selectedIds: ReadonlySet<number>;
  /** 拖动刷选时给出整份新的选中集合；lastId 是刷到的最后一条，作为下一次范围选择的锚点 */
  onBrush: (next: ReadonlySet<number>, lastId: number) => void;
}

/** 同一个人在这个时间窗内连续发言时合并头像和昵称。 */
const GROUP_WINDOW_MS = 3 * 60 * 1000;
/** 距离底部多近算「贴底」。贴底时新消息和图片撑高都会自动跟到底。 */
const STICK_THRESHOLD_PX = 96;
/** 离顶部或底部还有这么远就开始加载下一页，尽量在用户滚到头之前把数据备好。 */
const LOAD_AHEAD_PX = 1200;
/** 同时保留在 DOM 里的消息行上限（往上翻历史时）。 */
const MAX_ROWS = 400;
/**
 * 停在底部聊天时只留最近这么多条：超过 BOTTOM_TRIM_AT 就裁到 BOTTOM_KEEP。
 * 群里聊久了不裁的话 DOM 会一直涨、越聊越卡；裁掉的都在视口上方很远，往上翻会重新从服务端加载。
 */
const BOTTOM_TRIM_AT = 200;
const BOTTOM_KEEP = 150;
/** 进入会话时未读至少这么多条，才在右上角给「↑ N 条新消息」 */
const UNREAD_HINT_MIN = 10;
/** 跳到第一条未读时，它那一行的顶边离视口顶部留这么多 */
const UNREAD_TOP_OFFSET_PX = 12;
/** 没有已读位置、只能按未读数往前数时，最多往前拉这么多页（再早的就跳到能拿到的最早一条） */
const UNREAD_FETCH_MAX_PAGES = 20;
const USER_SCROLL_EVENTS = ['wheel', 'touchmove', 'keydown', 'pointerdown', 'pointerup'] as const;
/** 按下后移动超过这么多才算拖动刷选；没到就是一次普通点击 */
const BRUSH_START_PX = 4;
/** 拖到离列表上下边缘这么近就开始自动滚动，越靠外滚得越快 */
const BRUSH_EDGE_PX = 56;
const BRUSH_MAX_SPEED_PX = 22;
/** 这些地方按下不起刷：按钮、链接、气泡内容各有自己的点击 */
const BRUSH_EXCLUDE = 'button, a, input, textarea, select, [contenteditable="true"], .kcd-content, .kcd-reactions';

interface BrushState {
  pointerId: number;
  startId: number;
  startY: number;
  /** 刷过的消息统一设成这个状态：按下的那条原来没选就是 true */
  value: boolean;
  /** 起刷那一刻的选中集合；范围缩回来时，退出范围的消息恢复成这里的状态 */
  base: ReadonlySet<number>;
  active: boolean;
  clientY: number;
  lastKey: string;
  toasted: boolean;
  frame: number | null;
}

function isBubbleMessage(message: Message): boolean {
  return message.type !== 'system' && !message.recalled_at;
}

function senderIdOf(message: Message): number | null {
  return message.sender_id ?? senderOf(message)?.id ?? null;
}

function singlePage(messages: Message[]): MessagesInfiniteData {
  return { pages: [messages], pageParams: [undefined] };
}

interface AnchorSnapshot {
  element: HTMLElement;
  top: number;
}

interface AnchorKeeperProps {
  scrollerRef: React.RefObject<HTMLDivElement>;
  revision: unknown;
  disabled: () => boolean;
  children: ReactNode;
}

/**
 * 滚动锚定的兜底。
 *
 * 浏览器原生锚定在两种情况下不工作：滚动位置正好在最顶（规范如此），以及不支持
 * overflow-anchor 的浏览器（Safari）。这里在每次列表内容变化的提交前后各量一次「视口里第一条
 * 消息」的位置，如果它动了，说明原生锚定没补上，再手动把差值补回去。原生锚定生效时差值为 0，
 * 这里什么都不做。只能用类组件：getSnapshotBeforeUpdate 是唯一能在 DOM 变更前同步读布局的时机。
 */
class AnchorKeeper extends Component<AnchorKeeperProps, Record<string, never>, AnchorSnapshot | null> {
  getSnapshotBeforeUpdate(previous: Readonly<AnchorKeeperProps>): AnchorSnapshot | null {
    const scroller = this.props.scrollerRef.current;
    if (!scroller || previous.revision === this.props.revision || this.props.disabled()) {
      return null;
    }
    const viewportTop = scroller.getBoundingClientRect().top;
    const rows = scroller.querySelectorAll<HTMLElement>('.kcd-item');
    // 行是按文档顺序排的，二分找第一条底边在视口内的
    let low = 0;
    let high = rows.length - 1;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (rows[middle].getBoundingClientRect().bottom <= viewportTop) low = middle + 1;
      else high = middle;
    }
    const element = rows[low];
    return element ? { element, top: element.getBoundingClientRect().top - viewportTop } : null;
  }

  componentDidUpdate(_previous: Readonly<AnchorKeeperProps>, _state: unknown, snapshot: AnchorSnapshot | null): void {
    const scroller = this.props.scrollerRef.current;
    if (!snapshot || !scroller || !snapshot.element.isConnected) {
      return;
    }
    const drift = snapshot.element.getBoundingClientRect().top - scroller.getBoundingClientRect().top - snapshot.top;
    if (Math.abs(drift) >= 1) {
      scroller.scrollTop += drift;
    }
  }

  render(): ReactNode {
    return this.props.children;
  }
}

const MessageListInner = forwardRef<MessageListHandle, MessageListProps>(function MessageList({ conversation, currentUserId, selectMode, selectedIds, onBrush }, ref) {
  const conversationId = conversation.id;
  const queryClient = useQueryClient();
  const visibleConversationId = useKukeStore((state) => state.visibleConversationId);
  const pendingJumpMessage = useKukeStore((state) => state.pendingJumpMessage);
  const clearPendingJumpMessage = useKukeStore((state) => state.clearPendingJumpMessage);

  const messagesQuery = useInfiniteQuery({
    queryKey: ['messages', conversationId],
    queryFn: ({ pageParam }) => getMessages(conversationId, { beforeId: pageParam, limit: MESSAGE_PAGE_SIZE }),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) => lastPage.length < MESSAGE_PAGE_SIZE ? undefined : lastPage[0]?.id
  });
  const pages = messagesQuery.data?.pages;
  const loadedMessages = useMemo(() => pages ? [...pages].reverse().flat() : [], [pages]);
  const newestLoadedId = loadedMessages.length > 0 ? loadedMessages[loadedMessages.length - 1].id : null;

  // 「上下文模式」：列表只是历史中的一段（从搜索/引用跳过来，或者往上翻太远后丢掉了最新的部分）。
  // 这时实时推送进缓存的新消息和这一段之间有空洞，所以只显示到 contextEdgeId 为止，
  // 向下滚动逐页补齐，补到最新后再退出该模式。
  const [contextEdgeId, setContextEdgeId] = useState<number | null>(null);
  const [loadingNewer, setLoadingNewer] = useState(false);
  const loadingNewerRef = useRef(false);
  // 乐观发送的本地消息（还没确认、或者确认了但真消息还没进缓存的）接在最新一条后面；看历史片段时不接
  const pendingEntries = usePendingEntries(conversationId);
  const loadedIds = useMemo(() => new Set(loadedMessages.map((message) => message.id)), [loadedMessages]);
  // 聊天里发的文件：上传期间的卡片也是本地消息，接在同一个位置
  const uploadMessages = useChatUploadMessages(conversationId, loadedIds);
  const messages = useMemo(() => {
    if (contextEdgeId === null) {
      if (pendingEntries.length === 0 && uploadMessages.length === 0) {
        return loadedMessages;
      }
      const pending = pendingEntries.filter((entry) => entry.serverId === null || !loadedIds.has(entry.serverId)).map((entry) => entry.message);
      if (uploadMessages.length > 0) {
        pending.push(...uploadMessages);
        // 两种本地消息按点发送的先后排（ISO 时间串直接比）
        pending.sort((left, right) => (left.created_at ?? '').localeCompare(right.created_at ?? ''));
      }
      return pending.length > 0 ? [...loadedMessages, ...pending] : loadedMessages;
    }
    // 边界消息还没进缓存（状态先于数据提交的那一帧）就先不过滤，免得列表闪空
    if (!loadedMessages.some((message) => message.id === contextEdgeId)) {
      return loadedMessages;
    }
    return loadedMessages.filter((message) => message.id <= contextEdgeId);
  }, [contextEdgeId, loadedIds, loadedMessages, pendingEntries, uploadMessages]);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const contextModeRef = useRef(false);
  contextModeRef.current = contextEdgeId !== null;

  const [highlightId, setHighlightId] = useState<number | null>(null);
  const highlightTimerRef = useRef<number | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [newCount, setNewCount] = useState(0);
  const [pokedUserIds, setPokedUserIds] = useState<number[]>([]);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const userScrollUntilRef = useRef(0);
  /** 下一次内容提交后要居中显示的消息（跳转用）。 */
  const pendingCenterRef = useRef<number | null>(null);
  /** 上面那条跳转是要把目标（连同它上方的分隔线）放到视口顶部，而不是居中（跳到第一条未读用） */
  const pendingAlignTopRef = useRef(false);
  /** 刚跳转完的一小段时间里，目标附近的图片陆续加载会把它挤走，这期间持续把它对回中间。 */
  const centerLockRef = useRef<{ messageId: number; until: number; top?: boolean } | null>(null);
  /** 列表从空变为有内容时落到最底部（首次进入、回到最新）。 */
  const needsInitialBottomRef = useRef(true);
  /** 最近一次翻页的方向，决定超出上限时丢哪一头。 */
  const growthRef = useRef<'older' | 'newer' | null>(null);

  // 进入会话时的未读数和已读位置只取一次（之后读掉了也不变），用来在首条未读消息前画「以下是新消息」。
  // 有 last_read_message_id 时按它精确定位；拿不到就退回按未读数从末尾往前数。
  const unreadRef = useRef<{ count: number; lastReadId: number | null; resolved: boolean; knownId: number | null } | null>(null);
  if (unreadRef.current === null) {
    const lastReadId = conversation.my_last_read_message_id ?? conversation.members?.find((member) => member.user_id === currentUserId)?.last_read_message_id ?? null;
    unreadRef.current = { count: Math.max(0, conversation.unread_count ?? 0), lastReadId, resolved: false, knownId: null };
  }
  const unreadEntry = unreadRef.current;
  if (!unreadEntry.resolved && messages.length > 0) {
    unreadEntry.resolved = true;
    if (unreadEntry.lastReadId === null && unreadEntry.count > 0 && unreadEntry.count < messages.length) {
      unreadEntry.knownId = messages[messages.length - unreadEntry.count].id;
    }
  }
  const firstUnreadId = useMemo(() => {
    if (unreadEntry.count <= 0 || messages.length === 0) {
      return null;
    }
    if (unreadEntry.knownId !== null) {
      return messages.some((message) => message.id === unreadEntry.knownId) ? unreadEntry.knownId : null;
    }
    const lastReadId = unreadEntry.lastReadId;
    // 最早一条已加载的都比已读位置新，说明第一条未读还在更上面，没加载到
    if (lastReadId === null || messages[0].id > lastReadId) {
      return null;
    }
    return messages.find((message) => message.id > lastReadId)?.id ?? null;
    // unreadEntry 的字段只在跳转前改，跳转一定会换一份 messages
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);
  const firstUnreadIdRef = useRef(firstUnreadId);
  firstUnreadIdRef.current = firstUnreadId;
  // 「↑ N 条新消息」：未读够多、分隔线还没进过视口时显示；跳过去或自己滚到分隔线后就不再出现
  const [unreadHintDone, setUnreadHintDone] = useState(() => unreadEntry.count < UNREAD_HINT_MIN);
  const [unreadJumping, setUnreadJumping] = useState(false);
  const unreadHintDoneRef = useRef(unreadHintDone);
  unreadHintDoneRef.current = unreadHintDone;

  const rowMeta = useMemo(() => messages.map((message, position) => {
    const previous = messages[position - 1];
    const showTime = shouldShowTimeDivider(message, previous);
    const unreadBefore = message.id === firstUnreadId;
    let grouped = false;
    if (previous && !showTime && !unreadBefore && isBubbleMessage(message) && isBubbleMessage(previous) && senderIdOf(message) !== null && senderIdOf(message) === senderIdOf(previous)) {
      const current = parseApiDate(message.created_at);
      const before = parseApiDate(previous.created_at);
      grouped = Boolean(current && before && current.getTime() - before.getTime() < GROUP_WINDOW_MS);
    }
    return { showTime, grouped, unreadBefore };
  }), [firstUnreadId, messages]);

  // 连续相同的文本才算「复读」，而且只挂在整个列表的最后一条上：
  // 复读是「跟一句当下的话」，一旦有新消息把这串顶下去就没意义了。
  const repeatText = useMemo(() => {
    if (contextEdgeId !== null || messages.length < 2) {
      return null;
    }
    const text = repeatableContentOf(messages[messages.length - 1]);
    return text !== null && repeatableContentOf(messages[messages.length - 2]) === text ? text : null;
  }, [contextEdgeId, messages]);

  const highlight = useCallback((messageId: number) => {
    if (highlightTimerRef.current !== null) {
      window.clearTimeout(highlightTimerRef.current);
    }
    setHighlightId(messageId);
    highlightTimerRef.current = window.setTimeout(() => {
      setHighlightId((current) => (current === messageId ? null : current));
      highlightTimerRef.current = null;
    }, 1600);
  }, []);

  useEffect(() => () => {
    if (highlightTimerRef.current !== null) {
      window.clearTimeout(highlightTimerRef.current);
    }
  }, []);

  const pinToBottom = useCallback(() => {
    const scroller = scrollerRef.current;
    if (scroller) {
      scroller.scrollTop = scroller.scrollHeight;
    }
  }, []);

  /**
   * 把一条消息滚到视口中间；top 为 true 时改成把它所在的整行（含上方的分隔线）放到视口顶部附近。
   * 自己算位置而不用 scrollIntoView：后者会连带滚动扩展所在的宿主页面。
   */
  const centerOn = useCallback((messageId: number, top = false): void => {
    const scroller = scrollerRef.current;
    const row = scroller?.querySelector<HTMLElement>(`[data-message-id="${messageId}"]`);
    const target = top ? row?.closest<HTMLElement>('.kcd-item') ?? row : row;
    if (!scroller || !target) {
      return;
    }
    const scrollerRect = scroller.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    scroller.scrollTop += top
      ? targetRect.top - scrollerRect.top - UNREAD_TOP_OFFSET_PX
      : targetRect.top - scrollerRect.top - (scroller.clientHeight - targetRect.height) / 2;
  }, []);

  const fetchingOlderRef = useRef(false);
  fetchingOlderRef.current = messagesQuery.isFetchingNextPage;

  const loadOlder = (): void => {
    if (messagesQuery.hasNextPage && !messagesQuery.isFetchingNextPage) {
      growthRef.current = 'older';
      void messagesQuery.fetchNextPage();
    }
  };

  const loadNewerContext = async (): Promise<void> => {
    if (contextEdgeId === null || loadingNewerRef.current) {
      return;
    }
    const afterId = contextEdgeId;
    loadingNewerRef.current = true;
    setLoadingNewer(true);
    try {
      const contextMessages = await getMessageContext(conversationId, afterId, { before: 0, after: MESSAGE_PAGE_SIZE });
      const newer = contextMessages.filter((message) => message.id > afterId);
      if (newer.length > 0) {
        growthRef.current = 'newer';
        // 以当前显示的这一段为基础往后接。缓存里超出边界的实时消息先不要：它们和这一页之间可能还有空洞，
        // 等接到最新那一页时服务端会把它们一并返回。
        const merged = new Map(messagesRef.current.map((message) => [message.id, message]));
        newer.forEach((message) => merged.set(message.id, message));
        queryClient.setQueryData<MessagesInfiniteData>(['messages', conversationId], singlePage(Array.from(merged.values()).sort((left, right) => left.id - right.id)));
      }
      // 不足一页说明已经接上最新消息，退出上下文模式
      setContextEdgeId(newer.length < MESSAGE_PAGE_SIZE ? null : newer[newer.length - 1].id);
    } catch {
      toast.error('加载更新消息失败，请稍后重试。');
    } finally {
      loadingNewerRef.current = false;
      setLoadingNewer(false);
    }
  };

  // 每次渲染刷新，供滚动事件里调用最新的加载逻辑
  const loadersRef = useRef({ loadOlder, loadNewerContext });
  loadersRef.current = { loadOlder, loadNewerContext };

  const handleScroll = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) {
      return;
    }
    const distance = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
    if (distance < STICK_THRESHOLD_PX) {
      stickRef.current = true;
      // 往上翻过历史、又自己滚回了底部：那次「往上加载」已经结束，不能再挡着贴底裁剪，
      // 否则翻过一次历史之后 DOM 里就一直留着几百行，之后每来一条消息都要排版这几百行
      if (growthRef.current === 'older' && !fetchingOlderRef.current && performance.now() < userScrollUntilRef.current) {
        growthRef.current = null;
      }
    } else if (performance.now() < userScrollUntilRef.current) {
      // 只有用户自己滚开才解除贴底；内容变高不算
      stickRef.current = false;
    }
    setAtBottom(distance < STICK_THRESHOLD_PX);
    if (scroller.scrollTop < LOAD_AHEAD_PX) {
      loadersRef.current.loadOlder();
    }
    if (contextModeRef.current && distance < LOAD_AHEAD_PX) {
      void loadersRef.current.loadNewerContext();
    }
    if (!unreadHintDoneRef.current) {
      // 用户自己滚到了分隔线那里（它进过视口），胶囊就不用再提醒了
      const divider = scroller.querySelector<HTMLElement>('.kcd-unread-divider');
      if (divider) {
        const rect = divider.getBoundingClientRect();
        const box = scroller.getBoundingClientRect();
        if (rect.bottom > box.top && rect.top < box.bottom) {
          unreadHintDoneRef.current = true;
          setUnreadHintDone(true);
        }
      }
    }
  }, []);

  /** 记一笔「用户正在操作滚动」。滚轮、触摸、键盘和拖滚动条都会走到这里。 */
  const markUserScroll = useCallback((event: Event) => {
    centerLockRef.current = null;
    userScrollUntilRef.current = event.type === 'pointerdown' ? Number.POSITIVE_INFINITY : performance.now() + (event.type === 'pointerup' ? 200 : 400);
  }, []);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) {
      return;
    }
    USER_SCROLL_EVENTS.forEach((type) => scroller.addEventListener(type, markUserScroll, { passive: true }));
    return () => USER_SCROLL_EVENTS.forEach((type) => scroller.removeEventListener(type, markUserScroll));
  }, [markUserScroll]);

  // 贴底时内容变高（来了新消息、图片加载完）要立刻跟到底。ResizeObserver 在布局之后、绘制之前触发，
  // 用户看不到「先露出一截空白再跳下去」的那一帧。
  useEffect(() => {
    const content = contentRef.current;
    if (!content || typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(() => {
      const lock = centerLockRef.current;
      if (lock && performance.now() < lock.until) {
        centerOn(lock.messageId, lock.top);
        return;
      }
      // 上下文模式下列表底部不是真正的「最新」，不能自动跟到底，否则会一路连锁加载到头
      if (stickRef.current && !contextModeRef.current) {
        pinToBottom();
      }
    });
    observer.observe(content);
    // 列表本身变矮（输入框随内容长高）时也一样：贴底的话最后一条不能被输入框盖住
    if (scrollerRef.current) {
      observer.observe(scrollerRef.current);
    }
    return () => observer.disconnect();
  }, [centerOn, pinToBottom]);

  // 视口外的行打上 data-kc-offscreen，样式表据此让行里皮肤、头像框的无限动画停下（shop.css「看不见的时候不动」）。
  // 列表不是虚拟的，贴底时 DOM 里有上百行，不停的话屏幕外的几百个动效也一直在跑。上下各留一段余量，滚进来之前就已经在动了。
  useEffect(() => {
    const scroller = scrollerRef.current;
    const content = contentRef.current;
    if (!scroller || !content || typeof IntersectionObserver === 'undefined') {
      return;
    }
    const visibility = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.removeAttribute('data-kc-offscreen');
        } else {
          entry.target.setAttribute('data-kc-offscreen', '');
        }
      }
    }, { root: scroller, rootMargin: '240px 0px' });
    const observeRows = (nodes: Iterable<Node>): void => {
      for (const node of nodes) {
        if (node instanceof HTMLElement) {
          visibility.observe(node);
        }
      }
    };
    observeRows(content.children);
    const rows = new MutationObserver((records) => {
      for (const record of records) {
        observeRows(record.addedNodes);
        record.removedNodes.forEach((node) => node instanceof HTMLElement && visibility.unobserve(node));
      }
    });
    rows.observe(content, { childList: true });
    return () => {
      rows.disconnect();
      visibility.disconnect();
    };
  }, []);

  // 内容提交后的定位：首次出现内容落到底部；跳转则把目标消息居中
  useLayoutEffect(() => {
    if (messages.length === 0) {
      needsInitialBottomRef.current = true;
      return;
    }
    const target = pendingCenterRef.current;
    if (target !== null && messages.some((message) => message.id === target)) {
      const top = pendingAlignTopRef.current;
      pendingCenterRef.current = null;
      pendingAlignTopRef.current = false;
      needsInitialBottomRef.current = false;
      stickRef.current = false;
      centerOn(target, top);
      centerLockRef.current = { messageId: target, until: performance.now() + 1200, top };
      highlight(target);
      return;
    }
    if (needsInitialBottomRef.current) {
      needsInitialBottomRef.current = false;
      stickRef.current = true;
      pinToBottom();
    }
  }, [centerOn, highlight, messages, pinToBottom]);

  // 行数超出上限时丢掉离视口远的那一头
  useEffect(() => {
    if (stickRef.current && !contextModeRef.current && growthRef.current !== 'older' && messages.length > BOTTOM_TRIM_AT) {
      growthRef.current = null;
      queryClient.setQueryData<MessagesInfiniteData>(['messages', conversationId], singlePage(loadedMessages.slice(-BOTTOM_KEEP)));
      return;
    }
    if (messages.length <= MAX_ROWS) {
      return;
    }
    const growth = growthRef.current;
    if (growth === 'older' && !stickRef.current) {
      const kept = messages.slice(0, MAX_ROWS);
      growthRef.current = null;
      setContextEdgeId(kept[kept.length - 1].id);
      queryClient.setQueryData<MessagesInfiniteData>(['messages', conversationId], singlePage(kept));
    } else if (growth === 'newer' || stickRef.current) {
      growthRef.current = null;
      const source = contextModeRef.current ? messages : loadedMessages;
      queryClient.setQueryData<MessagesInfiniteData>(['messages', conversationId], singlePage(source.slice(-Math.floor(MAX_ROWS * 0.75))));
    }
  }, [conversationId, loadedMessages, messages, queryClient]);

  // 内容不满一屏或刚好停在边缘时不会有滚动事件，数据变化后主动补一次检查
  useEffect(() => {
    handleScroll();
  }, [handleScroll, messages]);

  const scrollToLatest = useCallback(() => {
    stickRef.current = true;
    setNewCount(0);
    if (contextEdgeId !== null) {
      // 当前只是历史中的一段，直接回到最新一页
      needsInitialBottomRef.current = true;
      pendingCenterRef.current = null;
      growthRef.current = null;
      setContextEdgeId(null);
      void queryClient.resetQueries({ queryKey: ['messages', conversationId], exact: true });
      return;
    }
    pinToBottom();
  }, [contextEdgeId, conversationId, pinToBottom, queryClient]);

  const jumpToMessage = useCallback(async (messageId: number) => {
    pendingAlignTopRef.current = false;
    if (messagesRef.current.some((message) => message.id === messageId)) {
      stickRef.current = false;
      centerOn(messageId);
      centerLockRef.current = { messageId, until: performance.now() + 1200 };
      highlight(messageId);
      return;
    }
    let contextMessages: Message[];
    try {
      contextMessages = await getMessageContext(conversationId, messageId, { before: 25, after: 25 });
    } catch {
      toast.error('已找到该消息，但无法加载它所在的上下文窗口。');
      return;
    }
    if (!contextMessages.some((message) => message.id === messageId)) {
      toast.error('已找到该消息，但该消息对当前账号不可见或已被清除。');
      return;
    }
    const contextPage = Array.from(new Map(contextMessages.map((message) => [message.id, message])).values()).sort((left, right) => left.id - right.id);
    stickRef.current = false;
    pendingCenterRef.current = messageId;
    growthRef.current = null;
    setContextEdgeId(contextPage[contextPage.length - 1].id);
    queryClient.setQueryData<MessagesInfiniteData>(['messages', conversationId], singlePage(contextPage));
  }, [centerOn, conversationId, highlight, queryClient]);

  useImperativeHandle(ref, () => ({ jumpToMessage, scrollToLatest, getMessages: () => messagesRef.current }), [jumpToMessage, scrollToLatest]);

  /** 用一份上下文替换列表，并在提交后把 targetId 放到视口顶部、高亮（跳到第一条未读用）。 */
  const showContextAtTop = useCallback((contextMessages: Message[], targetId: number) => {
    const contextPage = Array.from(new Map(contextMessages.map((message) => [message.id, message])).values()).sort((left, right) => left.id - right.id);
    stickRef.current = false;
    pendingCenterRef.current = targetId;
    pendingAlignTopRef.current = true;
    growthRef.current = null;
    setContextEdgeId(contextPage[contextPage.length - 1].id);
    queryClient.setQueryData<MessagesInfiniteData>(['messages', conversationId], singlePage(contextPage));
  }, [conversationId, queryClient]);

  /** 点「↑ N 条新消息」：跳到第一条未读，分隔线停在视口顶部附近。 */
  const jumpToFirstUnread = useCallback(async () => {
    if (unreadJumping) {
      return;
    }
    const loadedId = firstUnreadIdRef.current;
    if (loadedId !== null) {
      setUnreadHintDone(true);
      stickRef.current = false;
      centerOn(loadedId, true);
      centerLockRef.current = { messageId: loadedId, until: performance.now() + 1200, top: true };
      highlight(loadedId);
      return;
    }
    const entry = unreadRef.current;
    if (!entry) {
      return;
    }
    setUnreadJumping(true);
    try {
      if (entry.lastReadId !== null) {
        // 跳到已读位置附近：往前带几条作为上文，往后一页，分隔线自然画在两者之间
        const lastReadId = entry.lastReadId;
        const contextMessages = await getMessageContext(conversationId, lastReadId, { before: 6, after: MESSAGE_PAGE_SIZE });
        const first = contextMessages.filter((message) => message.id > lastReadId).sort((left, right) => left.id - right.id)[0];
        if (!first) {
          toast.error('没找到第一条未读消息，可能已被撤回或清除。');
          return;
        }
        setUnreadHintDone(true);
        showContextAtTop(contextMessages, first.id);
        return;
      }
      // 没有已读位置：从最新往前按页拉，数够未读条数，拿到能拿到的最早一条未读
      let pool: Message[] = contextModeRef.current ? [] : messagesRef.current.filter((message) => message.id > 0);
      let more = true;
      for (let page = 0; more && pool.length < entry.count && page < UNREAD_FETCH_MAX_PAGES; page += 1) {
        const older = await getMessages(conversationId, { beforeId: pool[0]?.id, limit: MESSAGE_PAGE_SIZE });
        more = older.length >= MESSAGE_PAGE_SIZE;
        pool = [...older.filter((message) => !pool.some((item) => item.id === message.id)), ...pool].sort((left, right) => left.id - right.id);
        if (older.length === 0) {
          break;
        }
      }
      const first = pool[Math.max(0, pool.length - entry.count)];
      if (!first) {
        return;
      }
      entry.knownId = first.id;
      const position = pool.indexOf(first);
      setUnreadHintDone(true);
      showContextAtTop(pool.slice(Math.max(0, position - 6), position + MESSAGE_PAGE_SIZE), first.id);
    } catch {
      toast.error('加载未读消息失败，请稍后重试。');
    } finally {
      setUnreadJumping(false);
    }
  }, [centerOn, conversationId, highlight, showContextAtTop, unreadJumping]);

  // 不在底部时累计新消息数，显示在「回到最新」按钮上
  const seenNewestIdRef = useRef<number | null>(null);
  useEffect(() => {
    const previous = seenNewestIdRef.current;
    seenNewestIdRef.current = newestLoadedId;
    if (previous === null || newestLoadedId === null || newestLoadedId <= previous || stickRef.current || contextModeRef.current) {
      return;
    }
    const incoming = loadedMessages.filter((message) => message.id > previous && isBubbleMessage(message) && senderIdOf(message) !== currentUserId).length;
    if (incoming > 0) {
      setNewCount((count) => count + incoming);
    }
  }, [currentUserId, loadedMessages, newestLoadedId]);

  useEffect(() => {
    if (atBottom) {
      setNewCount(0);
    }
  }, [atBottom]);

  useEffect(() => {
    if (visibleConversationId === conversationId) {
      markConversationReadLocally(queryClient, conversationId, newestLoadedId);
    }
  }, [conversationId, newestLoadedId, queryClient, visibleConversationId]);

  // 被戳的人头像抖一下。聊天里的那行字是一条系统消息，走 message.created，不在这里处理
  useEffect(() => {
    const timers: number[] = [];
    const unsubscribe = subscribePoke((event) => {
      if (event.conversationId !== conversationId) {
        return;
      }
      setPokedUserIds((current) => (current.includes(event.userId) ? current : [...current, event.userId]));
      timers.push(window.setTimeout(() => {
        setPokedUserIds((current) => current.filter((id) => id !== event.userId));
      }, 700));
    });
    return () => {
      unsubscribe();
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [conversationId]);

  const messagesLoading = messagesQuery.isLoading;
  useEffect(() => {
    if (!pendingJumpMessage || pendingJumpMessage.conversationId !== conversationId || messagesLoading) {
      return;
    }
    const messageId = pendingJumpMessage.messageId;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void jumpToMessage(messageId).finally(() => {
        if (!cancelled) {
          clearPendingJumpMessage(messageId);
        }
      });
    }, 80);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [clearPendingJumpMessage, conversationId, jumpToMessage, messagesLoading, pendingJumpMessage]);

  // ---- 多选模式下的拖动刷选 ----
  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;
  const brushRef = useRef<BrushState | null>(null);
  const [brushing, setBrushing] = useState(false);

  /** 指针所在高度对应的那条消息（夹在列表可视区内，拖出列表外也按最上 / 最下一条算）。 */
  const messageIdAtY = useCallback((clientY: number): number | null => {
    const scroller = scrollerRef.current;
    const content = contentRef.current;
    if (!scroller || !content) {
      return null;
    }
    const rect = scroller.getBoundingClientRect();
    const y = Math.min(Math.max(clientY, rect.top + 1), rect.bottom - 1);
    const items = content.querySelectorAll<HTMLElement>('.kcd-item');
    if (items.length === 0) {
      return null;
    }
    let low = 0;
    let high = items.length - 1;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (items[middle].getBoundingClientRect().bottom <= y) low = middle + 1;
      else high = middle;
    }
    const id = Number(items[low].querySelector<HTMLElement>('[data-message-id]')?.dataset.messageId);
    return Number.isFinite(id) ? id : null;
  }, []);

  const paintBrush = useCallback((brush: BrushState): void => {
    const currentId = messageIdAtY(brush.clientY);
    const list = messagesRef.current;
    const from = list.findIndex((message) => message.id === brush.startId);
    const to = currentId === null ? -1 : list.findIndex((message) => message.id === currentId);
    if (from < 0 || to < 0) {
      return;
    }
    // 用 id 而不是下标做去重键：往上刷到顶加载了更早的消息，下标会整体后移
    const key = `${brush.startId}:${currentId}:${list.length}`;
    if (key === brush.lastKey) {
      return;
    }
    brush.lastKey = key;
    const { next, truncated } = paintRange(brush.base, list, from, to, brush.value);
    if (truncated && !brush.toasted) {
      brush.toasted = true;
      toastSelectionLimit();
    }
    onBrush(next, list[to].id);
  }, [messageIdAtY, onBrush]);

  /** 每帧：靠近边缘就滚一点，然后按指针当前位置重新算一遍范围。 */
  const brushTick = useCallback((): void => {
    const brush = brushRef.current;
    const scroller = scrollerRef.current;
    if (!brush || !brush.active || !scroller) {
      return;
    }
    const rect = scroller.getBoundingClientRect();
    let speed = 0;
    if (brush.clientY < rect.top + BRUSH_EDGE_PX) {
      speed = -Math.min(1, (rect.top + BRUSH_EDGE_PX - brush.clientY) / BRUSH_EDGE_PX);
    } else if (brush.clientY > rect.bottom - BRUSH_EDGE_PX) {
      speed = Math.min(1, (brush.clientY - (rect.bottom - BRUSH_EDGE_PX)) / BRUSH_EDGE_PX);
    }
    if (speed !== 0) {
      scroller.scrollTop += Math.round(speed * BRUSH_MAX_SPEED_PX) || Math.sign(speed);
    }
    paintBrush(brush);
    brush.frame = window.requestAnimationFrame(brushTick);
  }, [paintBrush]);

  const endBrush = useCallback((): void => {
    const brush = brushRef.current;
    brushRef.current = null;
    if (!brush) {
      return;
    }
    if (brush.frame !== null) {
      window.cancelAnimationFrame(brush.frame);
    }
    if (brush.active) {
      setBrushing(false);
      // 刷完松手会紧跟一个 click，落在起点那一行上就会把它又切回去，吞掉这一次
      const swallow = (event: MouseEvent): void => {
        event.stopPropagation();
        event.preventDefault();
      };
      window.addEventListener('click', swallow, { capture: true, once: true });
      window.setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
    }
  }, []);

  useEffect(() => {
    if (!selectMode) {
      endBrush();
      return;
    }
    const onMove = (event: PointerEvent): void => {
      const brush = brushRef.current;
      if (!brush || event.pointerId !== brush.pointerId) {
        return;
      }
      brush.clientY = event.clientY;
      if (!brush.active) {
        if (Math.abs(event.clientY - brush.startY) < BRUSH_START_PX) {
          return;
        }
        brush.active = true;
        setBrushing(true);
        window.getSelection()?.removeAllRanges();
        brush.frame = window.requestAnimationFrame(brushTick);
      }
    };
    const onUp = (event: PointerEvent): void => {
      if (brushRef.current && event.pointerId === brushRef.current.pointerId) {
        endBrush();
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('blur', endBrush);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('blur', endBrush);
      endBrush();
    };
  }, [brushTick, endBrush, selectMode]);

  const handleBrushStart = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (!selectMode || event.button !== 0 || event.shiftKey || event.pointerType === 'touch') {
      return;
    }
    const target = event.target as HTMLElement;
    // 勾选框那一列、行里的空白处才起刷；勾选框是 span，不在排除列表里
    if (target.closest(BRUSH_EXCLUDE)) {
      return;
    }
    const row = target.closest('.kcd-item')?.querySelector<HTMLElement>('.kcd-row[data-message-id]');
    const startId = Number(row?.dataset.messageId);
    if (!row || !Number.isFinite(startId)) {
      return;
    }
    // 不让这次按下开始选文字；click 照常触发，没拖动时还是一次普通点选
    event.preventDefault();
    brushRef.current = {
      pointerId: event.pointerId,
      startId,
      startY: event.clientY,
      value: !selectedIdsRef.current.has(startId),
      base: selectedIdsRef.current,
      active: false,
      clientY: event.clientY,
      lastKey: '',
      toasted: false,
      frame: null
    };
  };

  const showJumpToLatest = !atBottom || contextEdgeId !== null;
  const lastPosition = messages.length - 1;
  // 刷选途中不出「选到这里」，免得按钮在指针下面一闪一闪
  const canPickRange = selectMode && selectedIds.size > 0 && !brushing;
  const state = messagesLoading ? 'loading' : messagesQuery.isError && messages.length === 0 ? 'error' : messages.length === 0 ? 'empty' : 'ready';
  const showUnreadHint = !unreadHintDone && state === 'ready';

  return (
    <div className="kcd-list">
      <div ref={scrollerRef} className={cx('kcd-scroller', brushing && 'is-brushing')} onScroll={handleScroll} onPointerDown={handleBrushStart}>
        {state === 'loading' ? <div className="kcd-list-state"><span className="kcd-spinner" aria-hidden="true" />正在加载消息…</div> : null}
        {state === 'error' ? (
          <div className="kcd-list-state">
            消息加载失败
            <button type="button" className="kcd-link-button" onClick={() => void messagesQuery.refetch()}>重试</button>
          </div>
        ) : null}
        {state === 'empty' ? <div className="kcd-list-state">还没有消息，发一句打个招呼吧</div> : null}
        {/* 顶部提示占固定高度：文字出现和消失都不会把下面的消息顶动 */}
        <div className="kcd-list-edge kcd-list-edge--top" hidden={state !== 'ready'}>
          {messagesQuery.isFetchingNextPage ? <span>正在加载更早的消息…</span> : !messagesQuery.hasNextPage ? <span>没有更早的消息了</span> : null}
        </div>
        <AnchorKeeper scrollerRef={scrollerRef} revision={messages} disabled={() => stickRef.current && !contextModeRef.current}>
          <div ref={contentRef} className="kcd-list-content">
            {messages.map((message, position) => {
              const meta = rowMeta[position];
              const senderId = senderIdOf(message);
              return (
                <MessageRow
                  key={messageRowKey(message)}
                  message={message}
                  showTime={meta.showTime}
                  grouped={meta.grouped}
                  unreadBefore={meta.unreadBefore}
                  selected={selectedIds.has(message.id)}
                  selectMode={selectMode}
                  canPickRange={canPickRange}
                  highlighted={highlightId === message.id}
                  poked={senderId !== null && pokedUserIds.includes(senderId)}
                  repeatText={position === lastPosition ? repeatText : null}
                  repeatDisabled={false}
                />
              );
            })}
          </div>
        </AnchorKeeper>
        <div className="kcd-list-edge kcd-list-edge--bottom" hidden={state !== 'ready'}>
          {loadingNewer ? <span>正在加载更新的消息…</span> : null}
        </div>
      </div>
      <TypingIndicator conversationId={conversationId} />
      {/* 右上角的浮动提示，上下排：「↑ N 条新消息」在上，「N 个红包未领」在下（都在滚动容器外面，不随消息滚动） */}
      <div className="kcd-float-hints">
        {unreadEntry.count >= UNREAD_HINT_MIN ? (
          <button
            type="button"
            className={cx('kcd-unread-hint', showUnreadHint && 'is-visible')}
            onClick={() => void jumpToFirstUnread()}
            disabled={unreadJumping}
            tabIndex={showUnreadHint ? 0 : -1}
            aria-hidden={!showUnreadHint}
            title="跳到第一条未读消息"
          >
            <span className="kcd-unread-hint-arrow" aria-hidden="true" />
            <span><b>{unreadEntry.count > 999 ? '999+' : unreadEntry.count}</b> 条新消息</span>
          </button>
        ) : null}
        <RedPacketPendingHint conversationId={conversationId} onJump={jumpToMessage} />
      </div>
      <button type="button" className={cx('kcd-jump-latest', showJumpToLatest && 'is-visible', newCount > 0 && 'has-new')} onClick={scrollToLatest} tabIndex={showJumpToLatest ? 0 : -1} aria-hidden={!showJumpToLatest}>
        <span className="kcd-jump-latest-arrow" aria-hidden="true" />
        {newCount > 0 ? <><span className="kui-badge">{newCount > 99 ? '99+' : newCount}</span>条新消息</> : '回到最新'}
      </button>
    </div>
  );
});

export const MessageList = memo(MessageListInner);
