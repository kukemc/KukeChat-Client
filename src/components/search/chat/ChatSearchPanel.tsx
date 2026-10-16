import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { groupFileMetaOf } from '@/api/groupPlus';
import { resolveMessageImagePreviewUrl } from '@/components/chat/message/messageMeta';
import { PlusTierTag } from '@/components/groupPlus/PlusBadge';
import { effectiveTier, formatFileSize } from '@/components/groupPlus/tier';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { useKukeStore } from '@/store/kukeStore';
import type { ChatSearchCategory, ChatSearchConversation, ChatSearchHit } from '@/types/groupPlus';
import { formatClockTime } from '@/utils/dateTime';
import { isQueryRequired, useSenderChoices, type ChatSearchState } from './useChatSearch';
import { chatSearchTitle, chinaDate, chinaDateAgo, dayLabel, groupByDay, splitByRanges } from './util';

/**
 * 聊天记录搜索的正文（QQ 式）：搜索框 + 分类页签 + 结果列表 + 筛选。桌面弹窗和移动整页共用，
 * 差别只有两处：筛选在桌面是右侧可开关的面板、在移动是底部抽屉；外壳（标题栏、返回键）由 ChatSearchHost 给。
 * 样式前缀 kcs-，在 styles/chat-search.css。
 */

const CATEGORIES: ReadonlyArray<readonly [ChatSearchCategory, string]> = [
  ['all', '全部'],
  ['media', '图片视频'],
  ['sticker', '表情'],
  ['file', '文件'],
  ['link', '链接']
];

/** 命中高亮的文字。节点由字符串切片构造，不经过任何 HTML 解析。 */
function Highlighted({ text, ranges }: { text: string; ranges: ReadonlyArray<readonly [number, number]> }): JSX.Element {
  return (
    <>
      {splitByRanges(text, ranges).map((segment, index) => (segment.hit ? <mark key={index}>{segment.text}</mark> : <span key={index}>{segment.text}</span>))}
    </>
  );
}

function ConversationAvatar({ conversation }: { conversation: ChatSearchConversation }): JSX.Element {
  const title = chatSearchTitle(conversation);
  if (conversation.type === 'group') {
    return <Avatar avatarUrl={conversation.avatar_url} label={title} toneKey={conversation.id} size="message" plusTier={effectiveTier(conversation.plus_tier, conversation.plus_expires_at)} />;
  }
  return <Avatar user={conversation.direct_user} label={title} size="message" />;
}

function HitBody({ hit }: { hit: ChatSearchHit }): JSX.Element {
  const { message } = hit;
  if (hit.category === 'media' || hit.category === 'sticker') {
    const images = Array.isArray(message.metadata?.images) ? message.metadata.images.filter((item): item is string => typeof item === 'string') : [];
    const src = resolveMessageImagePreviewUrl(message.type === 'image' ? message.content : images[0]);
    return src
      ? <img src={src} alt={hit.category === 'sticker' ? '表情' : '图片'} className={hit.category === 'sticker' ? 'kcs-thumb kcs-thumb--sticker' : 'kcs-thumb'} loading="lazy" draggable={false} />
      : <span className="kcs-plain">[{hit.category === 'sticker' ? '表情' : '图片'}]</span>;
  }
  if (hit.category === 'file') {
    const file = groupFileMetaOf(message);
    // 文件名就是命中的那段文字：snippet 和文件名一致时才套高亮，不一致（snippet 带了「[文件]」前缀）就只显示文件名
    const name = file?.name ?? hit.snippet;
    const ranges = name === hit.snippet ? hit.snippet_highlights : [];
    return (
      <span className="kcs-file">
        <Icon name="folder" className="h-4 w-4" />
        <span className="kcs-file-name"><Highlighted text={name} ranges={ranges} /></span>
        {file ? <span className="kcs-file-size">{formatFileSize(file.size)}</span> : null}
      </span>
    );
  }
  return <span className="kcs-snippet"><Highlighted text={hit.snippet || message.content} ranges={hit.snippet_highlights} /></span>;
}

function HitRow({ hit, active, showConversation, onOpen, onHover }: { hit: ChatSearchHit; active: boolean; showConversation: boolean; onOpen: () => void; onHover: () => void }): JSX.Element {
  const { message } = hit;
  const name = message.sender_display_name || getDisplayName(message.sender, message.sender_id ? `用户 ${message.sender_id}` : '用户');
  return (
    <button type="button" className={active ? 'kcs-hit is-active' : 'kcs-hit'} data-message-id={message.id} onClick={onOpen} onMouseMove={onHover}>
      <Avatar user={message.sender} label={name} size="message" />
      <span className="kcs-hit-main">
        <span className="kcs-hit-head">
          <span className="kcs-hit-name">{name}</span>
          {showConversation ? <span className="kcs-hit-from">{chatSearchTitle(hit.conversation)}</span> : null}
          <time>{formatClockTime(message.created_at)}</time>
        </span>
        <HitBody hit={hit} />
      </span>
    </button>
  );
}

function Skeleton(): JSX.Element {
  return (
    <div className="kcs-skeleton" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((index) => <div key={index} className="kcs-skeleton-row"><span /><i /></div>)}
    </div>
  );
}

function Notice({ tone = 'muted', icon, title, children, action }: { tone?: 'muted' | 'error'; icon: 'search' | 'alert'; title: string; children?: ReactNode; action?: ReactNode }): JSX.Element {
  return (
    <div className={tone === 'error' ? 'kcs-notice is-error' : 'kcs-notice'} role={tone === 'error' ? 'alert' : undefined}>
      <Icon name={icon} className="h-6 w-6" />
      <strong>{title}</strong>
      {children ? <span>{children}</span> : null}
      {action}
    </div>
  );
}

/** 筛选：发送日期 + 发送人。桌面是右侧面板，移动是底部抽屉里的同一份内容。 */
function FilterBody({ state }: { state: ChatSearchState }): JSX.Element {
  const [senderQuery, setSenderQuery] = useState('');
  const isGroup = state.conversation?.type !== 'direct';
  const senders = useSenderChoices(state.conversation, state.scopeId, senderQuery, state.me, state.scopeId !== null);
  const today = chinaDate(Date.now());
  const quick: ReadonlyArray<readonly [string, string, string]> = [
    ['今天', today, today],
    ['近 7 天', chinaDateAgo(6), today],
    ['近 30 天', chinaDateAgo(29), today]
  ];
  return (
    <div className="kcs-filter-body">
      <section>
        <h4>发送日期</h4>
        <div className="kcs-quick">
          {quick.map(([label, from, to]) => (
            <button key={label} type="button" className={state.dateFrom === from && state.dateTo === to ? 'is-active' : undefined} onClick={() => { state.setDateFrom(from); state.setDateTo(to); }}>{label}</button>
          ))}
        </div>
        <div className="kcs-dates">
          <label><span>从</span><input type="date" value={state.dateFrom} max={state.dateTo || undefined} onChange={(event) => state.setDateFrom(event.target.value)} /></label>
          <label><span>到</span><input type="date" value={state.dateTo} min={state.dateFrom || undefined} onChange={(event) => state.setDateTo(event.target.value)} /></label>
        </div>
        {state.dateInvalid ? <p className="kcs-field-error" role="alert">开始日期不能晚于结束日期。</p> : null}
      </section>
      <section>
        <h4>发送人</h4>
        {state.scopeId === null ? <p className="kcs-field-hint">先点进一个会话，才能按发送人筛选。</p> : (
          <>
            {isGroup ? <label className="kcs-sender-search"><Icon name="search" className="h-3.5 w-3.5" /><input value={senderQuery} placeholder="搜索群成员" onChange={(event) => setSenderQuery(event.target.value)} /></label> : null}
            <div className="kcs-senders">
              {state.sender ? (
                <button type="button" className="is-active" onClick={() => state.setSender(null)}><span>{state.sender.name}</span><Icon name="close" className="h-3.5 w-3.5" /></button>
              ) : null}
              {senders.loading ? <p className="kcs-field-hint">正在加载成员…</p> : null}
              {senders.error ? <p className="kcs-field-error">成员列表加载失败。</p> : null}
              {senders.choices.filter((choice) => choice.id !== state.sender?.id).map((choice) => (
                <button key={choice.id} type="button" onClick={() => state.setSender(choice)}>{choice.name}</button>
              ))}
              {!senders.loading && !senders.error && senders.choices.length === 0 ? <p className="kcs-field-hint">没有找到成员。</p> : null}
            </div>
          </>
        )}
      </section>
      <button type="button" className="kcs-clear" disabled={state.filterCount === 0 && state.category === 'all'} onClick={state.clearFilters}>清除全部筛选</button>
    </div>
  );
}

interface ChatSearchPanelProps {
  state: ChatSearchState;
  mobile: boolean;
  onClose: () => void;
}

export function ChatSearchPanel({ state, mobile, onClose }: ChatSearchPanelProps): JSX.Element {
  const requestJump = useKukeStore((store) => store.requestJumpToMessage);
  const [filterOpen, setFilterOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { messages, hits, summary } = state;
  const inSummary = state.scopeId === null;
  const queryRequired = isQueryRequired(messages.error) || isQueryRequired(summary.error);

  // 换了条件，键盘选中的那条就不作数了
  useEffect(() => setActiveIndex(-1), [state.keyword, state.category, state.dateFrom, state.dateTo, state.sender?.id, state.scopeId]);

  // 滚到底自动加载下一页；按钮兜底（没有 IntersectionObserver 的环境、或者哨兵一直在视口里没触发）
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = messages;
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasNextPage || typeof IntersectionObserver === 'undefined') {
      return undefined;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting) && !isFetchingNextPage) {
        void fetchNextPage();
      }
    }, { root: scrollRef.current, rootMargin: '160px' });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, hits.length]);

  function open(hit: ChatSearchHit): void {
    // 跳转由主界面接住（切到那个会话并定位）；先关面板，免得盖在聊天上
    onClose();
    requestJump(hit.conversation.id || hit.message.conversation_id, hit.message.id);
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (event.nativeEvent.isComposing || inSummary) {
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      const next = Math.max(0, Math.min(hits.length - 1, activeIndex + step));
      setActiveIndex(next);
      window.requestAnimationFrame(() => scrollRef.current?.querySelector('.kcs-hit.is-active')?.scrollIntoView({ block: 'nearest' }));
    } else if (event.key === 'Enter' && event.target instanceof HTMLInputElement && hits.length > 0) {
      event.preventDefault();
      open(hits[activeIndex >= 0 ? activeIndex : 0]);
    }
  }

  const groups = groupByDay(hits, (hit) => hit.message.created_at);
  let flatIndex = -1;
  const totalText = state.totalCapped ? '10000+' : String(state.total);

  function renderResults(): JSX.Element {
    if (inSummary) {
      if (state.dateInvalid) {
        return <Notice icon="alert" tone="error" title="日期范围不对">开始日期不能晚于结束日期。</Notice>;
      }
      if (!state.keyword) {
        return <Notice icon="search" title="输入关键词，搜索所有会话的聊天记录">先按会话列出命中数，再点进某个会话看详情。只会搜你自己的会话。</Notice>;
      }
      if (summary.isLoading) {
        return <Skeleton />;
      }
      if (summary.error && !queryRequired) {
        return <Notice icon="alert" tone="error" title="聊天记录搜索失败" action={<button type="button" className="kcs-retry" onClick={() => void summary.refetch()}>重试</button>}>请检查网络后再试一次。</Notice>;
      }
      const items = summary.data?.items ?? [];
      if (items.length === 0) {
        return <Notice icon="search" title="没有找到匹配的聊天记录">换个关键词，或者清除筛选再试试。</Notice>;
      }
      return (
        <ul className="kcs-summary">
          {items.map((item) => {
            const title = chatSearchTitle(item.conversation);
            return (
              <li key={item.conversation.id}>
                <button type="button" onClick={() => state.enterConversation(item.conversation.id, title)}>
                  <ConversationAvatar conversation={item.conversation} />
                  <span className="kcs-summary-text">
                    <span className="kcs-summary-title">
                      <span className="kcs-summary-name">{title}</span>
                      {item.conversation.type === 'group' ? <PlusTierTag tier={effectiveTier(item.conversation.plus_tier, item.conversation.plus_expires_at)} /> : null}
                    </span>
                    <span className="kcs-summary-sub">{item.count} 条相关聊天记录</span>
                  </span>
                  <Icon name="chevron" className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      );
    }

    if (!state.ready) {
      return state.dateInvalid
        ? <Notice icon="alert" tone="error" title="日期范围不对">开始日期不能晚于结束日期。</Notice>
        : <Notice icon="search" title="输入关键词，或者选一个分类 / 日期">例如搜「图片视频」看这个会话里发过的所有图片。</Notice>;
    }
    if (messages.isLoading) {
      return <Skeleton />;
    }
    if (messages.error) {
      if (queryRequired) {
        return <Notice icon="search" title="输入关键词，或者选一个分类 / 日期" />;
      }
      return <Notice icon="alert" tone="error" title="聊天记录搜索失败" action={<button type="button" className="kcs-retry" onClick={() => void messages.refetch()}>重试</button>}>请检查网络后再试一次。</Notice>;
    }
    if (hits.length === 0) {
      return <Notice icon="search" title="没有找到匹配的聊天记录">换个关键词，或者清除筛选再试试。</Notice>;
    }
    return (
      <>
        {groups.map((group) => (
          <section key={group.day} className="kcs-day">
            <h3>{dayLabel(group.day)}</h3>
            {group.items.map((hit) => {
              flatIndex += 1;
              const index = flatIndex;
              return <HitRow key={`${hit.conversation.id}-${hit.message.id}`} hit={hit} active={index === activeIndex} showConversation={false} onOpen={() => open(hit)} onHover={() => setActiveIndex(index)} />;
            })}
          </section>
        ))}
        {hasNextPage ? (
          <>
            <div ref={sentinelRef} className="kcs-sentinel" aria-hidden="true" />
            <button type="button" className="kcs-more" disabled={isFetchingNextPage} onClick={() => void fetchNextPage()}>{isFetchingNextPage ? '加载中…' : '加载更多'}</button>
          </>
        ) : <p className="kcs-end">已经到底了</p>}
      </>
    );
  }

  const chips: Array<{ key: string; label: string; remove: () => void }> = [];
  if (state.dateFrom || state.dateTo) {
    chips.push({ key: 'date', label: `${state.dateFrom || '最早'} ~ ${state.dateTo || '今天'}`, remove: () => { state.setDateFrom(''); state.setDateTo(''); } });
  }
  if (state.sender) {
    chips.push({ key: 'sender', label: `发送人：${state.sender.name}`, remove: () => state.setSender(null) });
  }

  const filterButton = (
    <button type="button" className={filterOpen || state.filterCount > 0 ? 'kcs-filter-btn is-active' : 'kcs-filter-btn'} aria-expanded={filterOpen} onClick={() => setFilterOpen((value) => !value)}>
      <Icon name="filter" className="h-4 w-4" />
      <span>筛选</span>
      {state.filterCount > 0 ? <b>{state.filterCount}</b> : null}
    </button>
  );

  return (
    <div className={mobile ? 'kcs kcs--mobile' : 'kcs'} onKeyDown={handleKeyDown}>
      <div className="kcs-main">
        <div className="kcs-bar">
          <label className="kcs-input">
            <Icon name="search" className="h-4 w-4" />
            <input ref={inputRef} value={state.input} placeholder={inSummary ? '搜索所有会话的聊天记录' : '搜索聊天内容'} aria-label="搜索关键词" autoFocus onChange={(event) => state.setInput(event.target.value)} />
            {state.input ? <button type="button" aria-label="清空关键词" onClick={() => { state.setInput(''); inputRef.current?.focus(); }}><Icon name="close" className="h-3.5 w-3.5" /></button> : null}
          </label>
          {filterButton}
        </div>

        <nav className="kcs-tabs" role="tablist" aria-label="消息类型">
          {CATEGORIES.map(([value, label]) => (
            <button key={value} type="button" role="tab" aria-selected={state.category === value} className={state.category === value ? 'is-active' : undefined} onClick={() => state.setCategory(value)}>{label}</button>
          ))}
        </nav>

        {chips.length > 0 || (!inSummary && state.scopeId !== null && state.ready && !state.messages.isLoading && hits.length > 0) ? (
          <div className="kcs-meta">
            {chips.map((chip) => <button key={chip.key} type="button" className="kcs-chip" onClick={chip.remove}>{chip.label}<Icon name="close" className="h-3 w-3" /></button>)}
            {!inSummary && hits.length > 0 ? <span className="kcs-total">共 {totalText} 条</span> : null}
          </div>
        ) : null}

        <div ref={scrollRef} className="kcs-results kui-scroll" aria-live="polite">{renderResults()}</div>
      </div>

      {filterOpen && !mobile ? (
        <aside className="kcs-aside" aria-label="筛选">
          <header><strong>筛选</strong><button type="button" className="kui-icon-btn" aria-label="收起筛选" onClick={() => setFilterOpen(false)}><Icon name="close" className="h-4 w-4" /></button></header>
          <FilterBody state={state} />
        </aside>
      ) : null}

      {filterOpen && mobile ? (
        <div className="kcs-sheet-backdrop" onClick={() => setFilterOpen(false)}>
          <section className="kcs-sheet" role="dialog" aria-label="筛选" onClick={(event) => event.stopPropagation()}>
            <header><strong>筛选</strong><button type="button" className="kcs-sheet-done" onClick={() => setFilterOpen(false)}>完成</button></header>
            <FilterBody state={state} />
          </section>
        </div>
      ) : null}
    </div>
  );
}
