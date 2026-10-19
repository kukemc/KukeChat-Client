import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cx } from '@/components/chat/desktop/runtime';
import { UserLevelIcons } from '@/components/level/LevelIcons';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { DeviceAvatar } from '@/components/selfChat/DeviceAvatar';
import { Icon } from '@/components/ui/Icon';
import { useEscapeLayer } from '@/components/ui/desktop/Modal';
import { PlusTierTag } from '@/components/groupPlus/PlusBadge';
import { conversationTier, effectiveTier } from '@/components/groupPlus/tier';
import type { ChatSearchConversation } from '@/types/groupPlus';
import { chatSearchTitle } from '../chat/util';
import { CHAT_SUMMARY_PREVIEW, SEARCH_TABS, groupTitle, useGlobalSearch, type GlobalSearchModalProps } from '../globalSearch';

/** 把命中的关键词标出来。关键词按原样匹配，不分大小写。 */
function highlight(text: string, keyword: string): ReactNode {
  if (!keyword) {
    return text;
  }
  const lowerText = text.toLowerCase();
  const lowerKeyword = keyword.toLowerCase();
  const parts: ReactNode[] = [];
  let from = 0;
  for (let at = lowerText.indexOf(lowerKeyword); at >= 0; at = lowerText.indexOf(lowerKeyword, from)) {
    parts.push(text.slice(from, at), <mark key={at}>{text.slice(at, at + keyword.length)}</mark>);
    from = at + keyword.length;
  }
  parts.push(text.slice(from));
  return parts;
}

/** 聚合行里的会话头像：群聊带档位角标，私聊是对方的头像。 */
function SummaryAvatar({ conversation }: { conversation: ChatSearchConversation }): JSX.Element {
  const title = chatSearchTitle(conversation);
  if (conversation.type === 'self') {
    return <DeviceAvatar kind="phone" size="message" />;
  }
  if (conversation.type === 'group') {
    return <Avatar avatarUrl={conversation.avatar_url} label={title} toneKey={conversation.id} size="message" plusTier={effectiveTier(conversation.plus_tier, conversation.plus_expires_at)} />;
  }
  return <Avatar user={conversation.direct_user} label={title} size="message" />;
}

/**
 * 桌面端的全局搜索：顶部弹出的搜索面板。
 * 回车提交关键词；↑↓ 在结果里移动，再按回车执行那一行的操作（跳到消息 / 加好友 / 加群）。
 */
export function GlobalSearchDesktop({ currentUser, friends, initialKeyword, onOpenConversation, onClose }: GlobalSearchModalProps): JSX.Element {
  const search = useGlobalSearch({ currentUser, friends, initialKeyword, onOpenConversation, onClose });
  const { tab, cleanKeyword, showingRecommendations, usersQuery, groupsQuery, messagesQuery, users, groups, chatKeyword, chatConversations, chatTotal } = search;
  // 键盘选中的是第几行；-1 表示焦点还在输入框上，回车是提交搜索
  const [activeIndex, setActiveIndex] = useState(-1);
  const listRef = useRef<HTMLDivElement>(null);
  const dirty = search.inputValue.trim() !== cleanKeyword;
  useEscapeLayer(onClose);

  // 换了关键词或分类，原来选中的那一行就不作数了
  useEffect(() => setActiveIndex(-1), [cleanKeyword, tab]);

  useEffect(() => {
    listRef.current?.querySelector('.kmd-search-row.is-active')?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  // 所有能用键盘选中的行按显示顺序排成一列，下标就是 activeIndex。渲染每一行时顺手登记它的回车操作
  const runners: Array<(() => void) | null> = [];
  function rowProps(run: (() => void) | null): { className: string; onMouseMove: () => void } {
    const index = runners.length;
    runners.push(run);
    return {
      className: cx('kmd-search-row', index === activeIndex && 'is-active'),
      // 用 mousemove 而不是 mouseenter：键盘滚动列表时鼠标底下换了行，不该把选中抢走
      onMouseMove: () => setActiveIndex(index)
    };
  }

  function submit(): void {
    search.submitSearch();
    setActiveIndex(-1);
  }

  // 挂在整个面板上：点过分类或按钮之后焦点不在输入框里，方向键也照样能用
  function handleKeyDown(event: React.KeyboardEvent): void {
    if (event.nativeEvent.isComposing) {
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((current) => Math.max(-1, Math.min(runners.length - 1, current + step)));
    } else if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
      event.preventDefault();
      if (dirty || activeIndex < 0) {
        submit();
      } else {
        runners[activeIndex]?.();
      }
    }
  }

  const showMessages = (tab === 'all' && chatKeyword.length > 0) || tab === 'messages';
  const shownChats = tab === 'all' ? chatConversations.slice(0, CHAT_SUMMARY_PREVIEW) : chatConversations;
  const showUsers = tab === 'all' || tab === 'users';
  const showGroups = tab === 'all' || tab === 'groups';

  const messageNote = chatKeyword.length === 0 ? '输入关键词可搜索所有会话的历史聊天记录。'
    : messagesQuery.isLoading ? '正在搜索聊天记录…'
    : messagesQuery.error ? '聊天记录搜索失败，请稍后重试。'
    : chatConversations.length === 0 ? '没有找到匹配聊天记录。' : null;
  const userNote = usersQuery.isLoading ? '正在加载用户…'
    : usersQuery.error ? '用户搜索失败，请稍后重试。'
    : users.length === 0 ? (showingRecommendations ? '暂无推荐用户。' : '没有找到匹配用户。') : null;
  const groupNote = groupsQuery.isLoading ? '正在加载群聊…'
    : groupsQuery.error ? '群聊搜索失败，请稍后重试。'
    : groups.length === 0 ? (showingRecommendations ? '暂无推荐群聊。' : '没有找到匹配群聊。') : null;

  return (
    <div className="kui-backdrop kmd-search-backdrop" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label="搜索" className="kmd-search" onMouseDown={(event) => event.stopPropagation()} onKeyDown={handleKeyDown}>
        <div className="kmd-search-bar">
          <Icon name="search" className="kmd-search-bar-icon" />
          <input
            value={search.inputValue}
            placeholder="搜索聊天记录、用户、邮箱、ID 或公开群号"
            aria-label="搜索关键词"
            autoFocus
            spellCheck={false}
            onChange={(event) => search.setInputValue(event.target.value)}
          />
          {dirty ? <button type="button" className="kmd-search-submit" onClick={submit}>搜索<kbd>Enter</kbd></button> : null}
          <button type="button" className="kui-icon-btn" aria-label="关闭全局搜索" onClick={onClose}><Icon name="close" className="h-4 w-4" /></button>
        </div>

        <div className="kmd-search-tabs">
          {/* 点分类不抢焦点，接着就能继续打字 */}
          <nav role="tablist" onMouseDown={(event) => event.preventDefault()}>
            {SEARCH_TABS.map(([value, label]) => (
              <button key={value} type="button" role="tab" aria-selected={tab === value} className={tab === value ? 'is-active' : undefined} onClick={() => search.setTab(value)}>{label}</button>
            ))}
          </nav>
          <span className="kmd-search-scope">{showingRecommendations ? '为你推荐' : <>“<b>{cleanKeyword}</b>” 的搜索结果</>}</span>
        </div>

        <div ref={listRef} className="kmd-search-results kui-scroll">
          {showMessages ? (
            <section>
              <h3 className="kmd-search-heading"><span>聊天记录</span>{chatTotal > 0 ? <span>{chatTotal} 条</span> : null}</h3>
              {messageNote ? <p className={cx('kmd-search-note', messagesQuery.error && chatKeyword.length > 0 && 'is-error')}>{messageNote}</p> : null}
              {messageNote ? null : shownChats.map((item) => {
                const title = chatSearchTitle(item.conversation);
                return (
                  // 点一个会话：打开聊天记录搜索，直接看这个会话里的命中
                  <button key={item.conversation.id} type="button" {...rowProps(() => search.openChatHistory(item.conversation.id))} onClick={() => search.openChatHistory(item.conversation.id)}>
                    <SummaryAvatar conversation={item.conversation} />
                    <span className="kmd-search-text">
                      <span className="kmd-search-line">
                        <span className="kmd-search-name">{title}</span>
                        {item.conversation.type === 'group' ? <PlusTierTag tier={conversationTier({ type: 'group', plus_tier: item.conversation.plus_tier, plus_expires_at: item.conversation.plus_expires_at })} /> : null}
                      </span>
                      <span className="kmd-search-sub">{item.count} 条相关聊天记录</span>
                    </span>
                  </button>
                );
              })}
              {!messageNote && chatConversations.length > shownChats.length ? (
                <button type="button" {...rowProps(() => search.openChatHistory(null))} onClick={() => search.openChatHistory(null)}>
                  <span className="kmd-search-more">查看全部 {chatConversations.length} 个会话的聊天记录</span>
                </button>
              ) : null}
            </section>
          ) : null}

          {showUsers ? (
            <section>
              <h3 className="kmd-search-heading"><span>{showingRecommendations ? '推荐用户' : '用户'}</span>{users.length > 0 ? <span>{users.length}</span> : null}</h3>
              {userNote ? <p className={cx('kmd-search-note', usersQuery.error && 'is-error')}>{userNote}</p> : users.map((user) => {
                const row = search.userRowState(user);
                return (
                  <div key={user.id} {...rowProps(row.actionDisabled ? null : () => search.sendFriendRequest(user.id))}>
                    <Avatar user={user} size="message" />
                    <span className="kmd-search-text">
                      <span className="kmd-search-line">
                        <span className="kmd-search-name">{highlight(getDisplayName(user, `用户 ${user.id}`), cleanKeyword)}</span>
                        <UserLevelIcons user={user} passive />
                        {row.isSelf ? <span className="kui-tag">我</span> : null}
                        {user.is_bot ? <span className="kui-tag kui-tag--accent">机器人</span> : null}
                      </span>
                      <span className="kmd-search-sub">{user.username ? `@${user.username}` : '用户'}{user.email ? ` · ${user.email}` : ''} · ID {user.id}</span>
                      {row.result ? <span className={cx('kmd-search-result', !row.result.ok && 'is-error')}>{row.result.text}</span> : null}
                    </span>
                    {row.isSelf ? null : row.settled ? <span className="kmd-search-state">{row.actionLabel}</span> : <button type="button" className="kui-btn kui-btn--sm" disabled={row.actionDisabled} onClick={() => search.sendFriendRequest(user.id)}>{row.actionLabel}</button>}
                  </div>
                );
              })}
            </section>
          ) : null}

          {showGroups ? (
            <section>
              <h3 className="kmd-search-heading"><span>{showingRecommendations ? '推荐群聊' : '群聊'}</span>{groups.length > 0 ? <span>{groups.length}</span> : null}</h3>
              {groupNote ? <p className={cx('kmd-search-note', groupsQuery.error && 'is-error')}>{groupNote}</p> : groups.map((group) => {
                const row = search.groupRowState(group);
                return (
                  // 已加入的群这一行（和回车）是「进入群聊」；申请中的只显示状态，不能再点
                  <div key={group.id} {...rowProps(row.joined ? () => search.openGroup(group) : row.actionDisabled ? null : () => search.requestJoinGroup(group))}>
                    <Avatar avatarUrl={group.avatar_url} label={groupTitle(group)} toneKey={group.id} size="message" plusTier={conversationTier(group)} />
                    <span className="kmd-search-text">
                      <span className="kmd-search-line">
                        <span className="kmd-search-name">{highlight(groupTitle(group), cleanKeyword)}</span>
                        <PlusTierTag tier={conversationTier(group)} />
                      </span>
                      <span className="kmd-search-sub">群号 {group.id} · {group.member_count ?? 0} 人 · {group.category?.trim() || '未设置'}</span>
                      {group.description?.trim() ? <span className="kmd-search-desc">{group.description}</span> : null}
                      {row.result ? <span className={cx('kmd-search-result', !row.result.ok && 'is-error')}>{row.result.text}</span> : null}
                    </span>
                    {row.joined ? <button type="button" className="kui-btn kui-btn--sm" data-action="open-group" onClick={() => search.openGroup(group)}>进入群聊</button>
                      : row.pending ? <span className="kmd-search-state">等待审核</span>
                      : <button type="button" className="kui-btn kui-btn--sm" disabled={row.actionDisabled} onClick={() => search.requestJoinGroup(group)}>{row.actionLabel}</button>}
                  </div>
                );
              })}
            </section>
          ) : null}
        </div>

        <footer className="kmd-search-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd>选择</span>
          <span><kbd>Enter</kbd>{dirty || activeIndex < 0 ? '搜索' : '执行选中项'}</span>
          <span><kbd>Esc</kbd>关闭</span>
        </footer>
      </div>
    </div>
  );
}
