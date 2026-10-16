import { useEffect } from 'react';
import type { Conversation } from '@/types/api';
import { UserLevelIcons } from '@/components/level/LevelIcons';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { resolveThumbnailUrl } from '@/utils/assetUrl';
import { PlusTierTag } from '@/components/groupPlus/PlusBadge';
import { conversationTier, effectiveTier } from '@/components/groupPlus/tier';
import { chatSearchTitle } from './chat/util';
import { registerNativeBackHandler } from '@/native/back';
import { GlobalSearchDesktop } from './desktop/GlobalSearchDesktop';
import { CHAT_SUMMARY_PREVIEW, SEARCH_TABS, groupTitle, useGlobalSearch, type GlobalSearchModalProps } from './globalSearch';

function renderGroupAvatar(conversation: Conversation): JSX.Element {
  const title = groupTitle(conversation);
  const avatarUrl = resolveThumbnailUrl(conversation.avatar_url);
  const tier = conversationTier(conversation);
  if (avatarUrl) {
    // 有档位的群：交给 Avatar 画（它会套容器、画角标）；没有档位保持原来的圆角方图
    return tier === 'free'
      ? <img src={avatarUrl} alt={title} className="h-11 w-11 rounded-2xl border object-cover [border-color:var(--kc-border)]" />
      : <Avatar avatarUrl={conversation.avatar_url} label={title} toneKey={conversation.id} plusTier={tier} />;
  }

  return <Avatar label={title} toneKey={conversation.id} plusTier={tier} />;
}

/** 全局搜索。桌面布局是顶部弹出的搜索面板，手机布局是整页。 */
export function GlobalSearchModal(props: GlobalSearchModalProps): JSX.Element {
  return props.mobile ? <MobileGlobalSearch {...props} /> : <GlobalSearchDesktop {...props} />;
}

function MobileGlobalSearch({ currentUser, friends, initialKeyword, onOpenConversation, onClose }: GlobalSearchModalProps): JSX.Element {
  const { tab, setTab, inputValue, setInputValue, cleanKeyword, showingRecommendations, usersQuery, groupsQuery, messagesQuery, chatKeyword, chatConversations, chatTotal, users, groups, submitSearch, openChatHistory, userRowState, groupRowState, sendFriendRequest, requestJoinGroup } = useGlobalSearch({ currentUser, friends, initialKeyword, onOpenConversation, onClose });

  useEffect(() => registerNativeBackHandler(() => {
    onClose();
    return true;
  }, 160), [onClose]);

  function renderMessageRows(): JSX.Element {
    if (chatKeyword.length === 0) {
      return <p className="rounded-2xl p-4 text-sm [background:var(--kc-panel-muted)] [color:var(--kc-muted)]">输入关键词可搜索所有会话的历史聊天记录。</p>;
    }
    if (messagesQuery.isLoading) {
      return <p className="rounded-2xl p-4 text-sm [background:var(--kc-panel-muted)] [color:var(--kc-muted)]">正在搜索聊天记录...</p>;
    }
    if (messagesQuery.error) {
      return (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-500">
          <span>聊天记录搜索失败，请稍后重试。</span>
          <button type="button" onClick={() => void messagesQuery.refetch()} className="shrink-0 rounded-xl border border-red-500/40 px-3 py-1.5 text-xs font-semibold">重试</button>
        </div>
      );
    }
    if (chatConversations.length === 0) {
      return <p className="rounded-2xl p-4 text-sm [background:var(--kc-panel-muted)] [color:var(--kc-muted)]">没有找到匹配聊天记录。</p>;
    }
    const shown = tab === 'all' ? chatConversations.slice(0, CHAT_SUMMARY_PREVIEW) : chatConversations;
    return (
      <div className="grid min-w-0 max-w-full gap-2 overflow-hidden">
        {shown.map((item) => {
          const title = chatSearchTitle(item.conversation);
          const group = item.conversation.type === 'group';
          return (
            // 点一个会话：打开聊天记录搜索，直接看这个会话里的命中
            <button key={item.conversation.id} type="button" onClick={() => openChatHistory(item.conversation.id)} className="flex w-full min-w-0 max-w-full items-center gap-3 overflow-hidden rounded-2xl border p-3 text-left transition active:[background:var(--kc-hover)] [background:var(--kc-panel)] [border-color:var(--kc-border)]">
              {group
                ? <Avatar avatarUrl={item.conversation.avatar_url} label={title} toneKey={item.conversation.id} plusTier={effectiveTier(item.conversation.plus_tier, item.conversation.plus_expires_at)} />
                : <Avatar user={item.conversation.direct_user} label={title} />}
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center"><span className="truncate text-sm font-semibold [color:var(--kc-text)]">{title}</span>{group ? <PlusTierTag tier={conversationTier({ type: 'group', plus_tier: item.conversation.plus_tier, plus_expires_at: item.conversation.plus_expires_at })} /> : null}</span>
                <span className="mt-0.5 block text-xs [color:var(--kc-muted)]">{item.count} 条相关聊天记录</span>
              </span>
              <Icon name="chevron" className="h-4 w-4 shrink-0 [color:var(--kc-muted)]" />
            </button>
          );
        })}
        {chatConversations.length > shown.length ? (
          <button type="button" onClick={() => openChatHistory(null)} className="mt-1 rounded-2xl border px-4 py-3 text-sm font-semibold transition active:[background:var(--kc-hover)] [border-color:var(--kc-border)]">
            查看全部 {chatConversations.length} 个会话（共 {chatTotal} 条）
          </button>
        ) : null}
      </div>
    );
  }

  function renderUserRows(): JSX.Element {
    if (usersQuery.isLoading) {
      return <p className="rounded-2xl p-4 text-sm [background:var(--kc-panel-muted)] [color:var(--kc-muted)]">正在加载用户...</p>;
    }
    if (usersQuery.error) {
      return <p className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-500">用户搜索失败，请稍后重试。</p>;
    }
    if (users.length === 0) {
      return <p className="rounded-2xl p-4 text-sm [background:var(--kc-panel-muted)] [color:var(--kc-muted)]">{showingRecommendations ? '暂无推荐用户。' : '没有找到匹配用户。'}</p>;
    }

    return (
      <div className="grid min-w-0 max-w-full gap-1 overflow-hidden">
        {users.map((user) => {
          const row = userRowState(user);
          return (
            <div key={user.id} className="flex min-w-0 max-w-full items-center gap-3 overflow-hidden rounded-2xl px-3 py-3 transition hover:[background:var(--kc-hover)]">
              <Avatar user={user} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{getDisplayName(user, `用户 ${user.id}`)}{row.isSelf ? '（我）' : ''} <UserLevelIcons user={user} self={row.isSelf} /></p>
                <p className="truncate text-xs [color:var(--kc-muted)]">{user.username ? `@${user.username}` : '用户'}{user.email ? ` · ${user.email}` : ''} · ID {user.id}</p>
                {row.result ? <p className={`mt-1 text-xs ${row.result.ok ? '[color:var(--kc-accent)]' : 'text-red-500'}`}>{row.result.text}</p> : null}
              </div>
              {!row.isSelf ? (
                <button type="button" onClick={() => sendFriendRequest(user.id)} disabled={row.actionDisabled} className="liquid-button shrink-0 rounded-xl px-3 py-2 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-45">
                  {row.actionLabel}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  }

  function renderGroupRows(): JSX.Element {
    if (groupsQuery.isLoading) {
      return <p className="rounded-2xl p-4 text-sm [background:var(--kc-panel-muted)] [color:var(--kc-muted)]">正在加载群聊...</p>;
    }
    if (groupsQuery.error) {
      return <p className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-500">群聊搜索失败，请稍后重试。</p>;
    }
    if (groups.length === 0) {
      return <p className="rounded-2xl p-4 text-sm [background:var(--kc-panel-muted)] [color:var(--kc-muted)]">{showingRecommendations ? '暂无推荐群聊。' : '没有找到匹配群聊。'}</p>;
    }

    return (
      <div className="grid min-w-0 max-w-full gap-1 overflow-hidden">
        {groups.map((group) => {
          const row = groupRowState(group);
          return (
            <div key={group.id} className="flex min-w-0 max-w-full items-center gap-3 overflow-hidden rounded-2xl px-3 py-3 transition hover:[background:var(--kc-hover)]">
              {renderGroupAvatar(group)}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{groupTitle(group)}<PlusTierTag tier={conversationTier(group)} /></p>
                <p className="truncate text-xs [color:var(--kc-muted)]">群号 {group.id} · {group.member_count ?? 0} 人 · {group.category?.trim() || '未设置'}</p>
                {group.description?.trim() ? <p className="mt-1 line-clamp-2 text-xs leading-5 [color:var(--kc-muted)]">{group.description}</p> : null}
                {row.result ? <p className={`mt-1 text-xs ${row.result.ok ? '[color:var(--kc-accent)]' : 'text-red-500'}`}>{row.result.text}</p> : null}
              </div>
              <button type="button" onClick={() => requestJoinGroup(group)} disabled={row.actionDisabled} className="liquid-button shrink-0 rounded-xl px-3 py-2 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-45">
                {row.actionLabel}
              </button>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[2147483646] flex min-h-0 w-screen max-w-[100vw] flex-col overflow-hidden overscroll-x-none [background:var(--kc-mobile-chat)] [color:var(--kc-text)]">
      <header className="min-w-0 max-w-full shrink-0 overflow-hidden px-4 pb-3 pt-[max(44px,env(safe-area-inset-top))] [background:var(--kc-mobile-chat)]">
        <div className="mb-4 flex items-center justify-between gap-3">
          <button type="button" onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-full [color:var(--kc-text)] active:[background:var(--kc-hover)]" aria-label="返回">
            <Icon name="chevronLeft" className="h-6 w-6" />
          </button>
          <div className="min-w-0 flex-1 text-left">
            <h2 className="text-[22px] font-black">搜索</h2>
            <p className="mt-1 text-xs [color:var(--kc-muted)]">搜索历史聊天记录、账号、邮箱、用户 ID 或公开群号。</p>
          </div>
          <span className="h-10 w-10 shrink-0" />
        </div>
        <form onSubmit={submitSearch} className="flex min-w-0 max-w-full items-center gap-2 overflow-hidden">
          <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-2xl border px-3 [background:var(--kc-panel-muted)] [border-color:var(--kc-border)] focus-within:[border-color:var(--kc-accent)]">
            <Icon name="search" className="h-4 w-4 shrink-0 [color:var(--kc-muted)]" />
            <input value={inputValue} onChange={(event) => setInputValue(event.target.value)} className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none [color:var(--kc-text)] placeholder:[color:var(--kc-muted)]" placeholder="输入关键词或 ID" autoFocus />
          </label>
          <button type="submit" className="liquid-button h-11 rounded-2xl px-5 text-sm font-semibold">搜索</button>
        </form>
        <nav className="mt-4 flex gap-2 overflow-x-auto">
          {SEARCH_TABS.map(([value, label]) => (
            <button key={value} type="button" onClick={() => setTab(value)} className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold transition ${tab === value ? '[background:var(--kc-accent)] text-white' : '[background:var(--kc-panel-muted)] [color:var(--kc-muted)] hover:[color:var(--kc-text)]'}`}>
              {label}
            </button>
          ))}
        </nav>
      </header>

      <main className="scroll-soft min-h-0 min-w-0 max-w-full flex-1 overflow-y-auto overflow-x-hidden p-4 [touch-action:pan-y] [background:var(--kc-mobile-chat)] pb-[max(24px,env(safe-area-inset-bottom))]">
        {showingRecommendations ? <p className="mb-3 text-xs [color:var(--kc-muted)]">推荐用户和公开群聊；输入关键词后会同时搜索历史聊天记录。</p> : <p className="mb-3 text-xs [color:var(--kc-muted)]">搜索 “{cleanKeyword}” 的结果</p>}
        {(tab === 'all' || tab === 'messages') ? (
          <section className="mb-5 min-w-0 max-w-full overflow-hidden">
            <h3 className="mb-2 px-1 text-sm font-semibold">聊天记录</h3>
            {renderMessageRows()}
          </section>
        ) : null}
        {(tab === 'all' || tab === 'users') ? (
          <section className="mb-5 min-w-0 max-w-full overflow-hidden">
            <h3 className="mb-2 px-1 text-sm font-semibold">用户</h3>
            {renderUserRows()}
          </section>
        ) : null}
        {(tab === 'all' || tab === 'groups') ? (
          <section className="min-w-0 max-w-full overflow-hidden">
            <h3 className="mb-2 px-1 text-sm font-semibold">群聊</h3>
            {renderGroupRows()}
          </section>
        ) : null}
      </main>
    </div>
  );
}
