import { useEffect, useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createGroupJoinRequest, getOutgoingGroupJoinRequests, getRecommendedGroups, joinGroup, searchGroups } from '@/api/conversations';
import { getOutgoingFriendRequests, sendFriendRequest } from '@/api/friends';
import { searchConversationsMessages } from '@/api/messages';
import { getRecommendedUsers, searchUsers } from '@/api/users';
import { useKukeStore } from '@/store/kukeStore';
import type { Conversation, Friendship, GroupJoinRequest, Message, User } from '@/types/api';
import { ApiError } from '@/api/client';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { resolveThumbnailUrl } from '@/utils/assetUrl';
import { formatMessageDateTime } from '@/utils/dateTime';
import { registerNativeBackHandler } from '@/native/back';

type SearchTab = 'all' | 'messages' | 'users' | 'groups';

interface GlobalSearchModalProps {
  currentUser: User;
  friends: Friendship[];
  initialKeyword?: string;
  onOpenConversation?: (conversationId: number) => void;
  mobile?: boolean;
  onClose: () => void;
}

const MESSAGE_SEARCH_PAGE_SIZE = 50;

function friendUser(friendship: Friendship): User | null | undefined {
  return friendship.friend ?? friendship.user;
}

function groupTitle(conversation: Conversation): string {
  return conversation.display_title?.trim() || conversation.title?.trim() || `群聊 ${conversation.id}`;
}

function conversationTitle(conversation?: Conversation | null): string {
  if (!conversation) {
    return '聊天记录';
  }
  return conversation.display_title?.trim() || conversation.title?.trim() || conversation.direct_user?.nickname?.trim() || conversation.direct_user?.username?.trim() || `会话 ${conversation.id}`;
}

function messageConversation(message: Message): Conversation | null {
  const value = message.conversation;
  return value && typeof value === 'object' && 'id' in value ? value as Conversation : null;
}

function messagePreview(message: Message): string {
  if (message.recalled_at) {
    return '消息已撤回';
  }
  if (message.type === 'image') {
    return message.content ? `${message.content} [图片]` : '[图片]';
  }
  if (message.type === 'voice') {
    return '[语音]';
  }
  if (message.type === 'forward_bundle') {
    return '[聊天记录]';
  }
  if (message.type === 'system') {
    return message.content || '系统消息';
  }
  const images = Array.isArray(message.metadata?.images) ? message.metadata.images.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
  const suffix = images.length > 0 ? ` ${images.length > 1 ? `[图片] ${images.length}张图片` : '[图片]'}` : '';
  return `${message.content || '[空消息]'}${suffix}`;
}

function groupJoinButtonLabel(group: Conversation, statusText?: string): string {
  if (statusText === '已加入群聊') {
    return '已加入';
  }
  if (statusText === '已提交加群申请') {
    return '待审核';
  }
  if ((group.join_mode === 'approval' || group.join_mode === 'question') && !group.auto_approve) {
    return '申请加入';
  }
  return '加入';
}

function renderGroupAvatar(conversation: Conversation): JSX.Element {
  const title = groupTitle(conversation);
  const avatarUrl = resolveThumbnailUrl(conversation.avatar_url);
  if (avatarUrl) {
    return <img src={avatarUrl} alt={title} className="h-11 w-11 rounded-2xl border object-cover [border-color:var(--kc-border)]" />;
  }

  return <Avatar label={title} />;
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  return fallback;
}

export function GlobalSearchModal({ currentUser, friends, initialKeyword = '', onOpenConversation, mobile = false, onClose }: GlobalSearchModalProps): JSX.Element {
  const [tab, setTab] = useState<SearchTab>('all');
  const [inputValue, setInputValue] = useState(initialKeyword);
  const [submittedKeyword, setSubmittedKeyword] = useState(initialKeyword.trim());
  const [friendResultText, setFriendResultText] = useState<Record<number, string>>({});
  const [groupResultText, setGroupResultText] = useState<Record<number, string>>({});
  const queryClient = useQueryClient();
  const requestJumpToMessage = useKukeStore((state) => state.requestJumpToMessage);
  const conversationIds = useKukeStore((state) => state.searchableConversationIds);
  const cleanKeyword = submittedKeyword.trim();
  const showingRecommendations = cleanKeyword.length === 0;

  useEffect(() => {
    setInputValue(initialKeyword);
    setSubmittedKeyword(initialKeyword.trim());
  }, [initialKeyword]);

  useEffect(() => {
    if (!mobile) {
      return undefined;
    }
    return registerNativeBackHandler(() => {
      onClose();
      return true;
    }, 160);
  }, [mobile, onClose]);

  const outgoingQuery = useQuery({ queryKey: ['friend-requests', 'outgoing'], queryFn: getOutgoingFriendRequests });
  const outgoingGroupRequestsQuery = useQuery({ queryKey: ['group-join-requests', 'outgoing'], queryFn: getOutgoingGroupJoinRequests });
  const usersQuery = useQuery({
    queryKey: ['global-search', 'users', cleanKeyword],
    queryFn: () => (showingRecommendations ? getRecommendedUsers() : searchUsers(cleanKeyword)),
    enabled: tab === 'all' || tab === 'users'
  });
  const groupsQuery = useQuery({
    queryKey: ['global-search', 'groups', cleanKeyword],
    queryFn: () => (showingRecommendations ? getRecommendedGroups() : searchGroups(cleanKeyword)),
    enabled: tab === 'all' || tab === 'groups'
  });
  const messagesQuery = useInfiniteQuery({
    queryKey: ['global-search', 'messages', cleanKeyword, conversationIds.join(',')],
    queryFn: ({ pageParam }) => searchConversationsMessages(conversationIds, { query: cleanKeyword, category: 'all', beforeId: pageParam, limit: MESSAGE_SEARCH_PAGE_SIZE }),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) => lastPage.has_more ? lastPage.next_before_id ?? undefined : undefined,
    enabled: cleanKeyword.length > 0 && conversationIds.length > 0 && (tab === 'all' || tab === 'messages')
  });

  const friendIds = new Set(friends.map((friendship) => friendUser(friendship)?.id).filter((id): id is number => typeof id === 'number'));
  const pendingOutgoingIds = new Set((outgoingQuery.data ?? []).filter((request) => request.status === 'pending').map((request) => request.receiver_id));
  const pendingOutgoingGroupIds = new Set((outgoingGroupRequestsQuery.data ?? []).filter((request: GroupJoinRequest) => request.status === 'pending').map((request) => request.conversation_id));
  const users = usersQuery.data ?? [];
  const groups = (groupsQuery.data ?? []).filter((group) => group.join_mode !== 'invite_only');
  const messages = messagesQuery.data?.pages.flatMap((page) => page.items.map((item) => item.message)) ?? [];

  const friendMutation = useMutation({
    mutationFn: sendFriendRequest,
    onSuccess: (_request, userId) => {
      setFriendResultText((current) => ({ ...current, [userId]: '好友申请已发送' }));
      void queryClient.invalidateQueries({ queryKey: ['friends'] });
      void queryClient.invalidateQueries({ queryKey: ['friend-requests'] });
    },
    onError: (error, userId) => setFriendResultText((current) => ({ ...current, [userId]: errorMessage(error, '好友申请发送失败') }))
  });

  const joinMutation = useMutation({
    mutationFn: joinGroup,
    onSuccess: (_conversation, conversationId) => {
      setGroupResultText((current) => ({ ...current, [conversationId]: '已加入群聊' }));
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      void queryClient.invalidateQueries({ queryKey: ['global-search', 'groups'] });
    },
    onError: (error, conversationId) => setGroupResultText((current) => ({ ...current, [conversationId]: errorMessage(error, '加群失败，请稍后重试') }))
  });

  const joinRequestMutation = useMutation({
    mutationFn: ({ conversationId, message, answer }: { conversationId: number; message?: string; answer?: string }) => createGroupJoinRequest(conversationId, { message, answer }),
    onSuccess: (_request, variables) => {
      setGroupResultText((current) => ({ ...current, [variables.conversationId]: '已提交加群申请' }));
      void queryClient.invalidateQueries({ queryKey: ['group-join-requests'] });
      void queryClient.invalidateQueries({ queryKey: ['global-search', 'groups'] });
    },
    onError: (error, variables) => setGroupResultText((current) => ({ ...current, [variables.conversationId]: errorMessage(error, '加群申请发送失败') }))
  });

  function submitSearch(event?: React.FormEvent<HTMLFormElement>): void {
    event?.preventDefault();
    setSubmittedKeyword(inputValue.trim());
    setFriendResultText({});
    setGroupResultText({});
  }

  function openMessageResult(message: Message): void {
    const conversationId = message.conversation_id;
    requestJumpToMessage(conversationId, message.id);
    onOpenConversation?.(conversationId);
    onClose();
  }

  function renderMessageRows(): JSX.Element {
    if (showingRecommendations) {
      return <p className="rounded-2xl p-4 text-sm [background:var(--kc-panel-muted)] [color:var(--kc-muted)]">输入关键词可搜索所有会话的历史聊天记录。</p>;
    }
    if (messagesQuery.isLoading) {
      return <p className="rounded-2xl p-4 text-sm [background:var(--kc-panel-muted)] [color:var(--kc-muted)]">正在搜索聊天记录...</p>;
    }
    if (messagesQuery.error) {
      return <p className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-500">聊天记录搜索失败，请稍后重试。</p>;
    }
    if (messages.length === 0) {
      return <p className="rounded-2xl p-4 text-sm [background:var(--kc-panel-muted)] [color:var(--kc-muted)]">没有找到匹配聊天记录。</p>;
    }
    return (
      <div className="grid min-w-0 max-w-full gap-2 overflow-hidden">
        {messages.map((message) => {
          const conversation = messageConversation(message);
          return (
            <button key={`${message.conversation_id}-${message.id}`} type="button" onClick={() => openMessageResult(message)} className="block w-full min-w-0 max-w-full overflow-hidden rounded-2xl border p-3 text-left transition hover:[background:var(--kc-hover)] [background:var(--kc-panel)] [border-color:var(--kc-border)]">
              <div className="mb-1 flex min-w-0 max-w-full items-center justify-between gap-3 text-xs [color:var(--kc-muted)]">
                <span className="min-w-0 max-w-full truncate font-semibold [color:var(--kc-text)]">{conversationTitle(conversation)}</span>
                <span className="shrink-0">{formatMessageDateTime(message.created_at)}</span>
              </div>
              <p className="min-w-0 max-w-full truncate text-xs [color:var(--kc-muted)]">{message.sender_display_name || getDisplayName(message.sender, `用户 ${message.sender_id}`)}</p>
              <p className="mt-1 min-w-0 max-w-full whitespace-normal break-words text-sm leading-6 [color:var(--kc-text)] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] [overflow:hidden] [overflow-wrap:anywhere]">{messagePreview(message)}</p>
            </button>
          );
        })}
        {messagesQuery.hasNextPage ? (
          <button type="button" disabled={messagesQuery.isFetchingNextPage} onClick={() => void messagesQuery.fetchNextPage()} className="mt-2 rounded-2xl border px-4 py-3 text-sm font-semibold transition hover:[background:var(--kc-hover)] disabled:cursor-not-allowed disabled:opacity-45 [border-color:var(--kc-border)]">
            {messagesQuery.isFetchingNextPage ? '加载中...' : '加载更多历史记录'}
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
          const isSelf = user.id === currentUser.id;
          const isFriend = friendIds.has(user.id);
          const isPending = pendingOutgoingIds.has(user.id) || friendResultText[user.id] === '好友申请已发送';
          const disabled = isSelf || isFriend || isPending || friendMutation.isPending;
          return (
            <div key={user.id} className="flex min-w-0 max-w-full items-center gap-3 overflow-hidden rounded-2xl px-3 py-3 transition hover:[background:var(--kc-hover)]">
              <Avatar user={user} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{getDisplayName(user, `用户 ${user.id}`)}{isSelf ? '（我）' : ''}</p>
                <p className="truncate text-xs [color:var(--kc-muted)]">{user.username ? `@${user.username}` : '用户'}{user.email ? ` · ${user.email}` : ''} · ID {user.id}</p>
                {friendResultText[user.id] ? <p className={`mt-1 text-xs ${friendResultText[user.id] === '好友申请已发送' ? '[color:var(--kc-accent)]' : 'text-red-500'}`}>{friendResultText[user.id]}</p> : null}
              </div>
              {!isSelf ? (
                <button type="button" onClick={() => friendMutation.mutate(user.id)} disabled={disabled} className="liquid-button shrink-0 rounded-xl px-3 py-2 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-45">
                  {isFriend ? '已是好友' : isPending ? '已申请' : '加好友'}
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
          const statusText = groupResultText[group.id];
          const joined = group.joined === true || statusText === '已加入群聊';
          const pending = statusText === '已提交加群申请' || pendingOutgoingGroupIds.has(group.id) || group.join_request_status === 'pending';
          const needApproval = (group.join_mode === 'approval' || group.join_mode === 'question') && !group.auto_approve;
          const disabled = joined || pending || joinMutation.isPending || joinRequestMutation.isPending;
          return (
            <div key={group.id} className="flex min-w-0 max-w-full items-center gap-3 overflow-hidden rounded-2xl px-3 py-3 transition hover:[background:var(--kc-hover)]">
              {renderGroupAvatar(group)}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{groupTitle(group)}</p>
                <p className="truncate text-xs [color:var(--kc-muted)]">群号 {group.id} · {group.member_count ?? 0} 人 · {group.category?.trim() || '未设置'}</p>
                {group.description?.trim() ? <p className="mt-1 line-clamp-2 text-xs leading-5 [color:var(--kc-muted)]">{group.description}</p> : null}
                {statusText ? <p className={`mt-1 text-xs ${(joined || pending) ? '[color:var(--kc-accent)]' : 'text-red-500'}`}>{statusText}</p> : null}
              </div>
              <button type="button" onClick={() => {
                if (needApproval) {
                  const answer = group.join_mode === 'question' ? window.prompt(group.join_question?.trim() || '请输入加群问题答案') : undefined;
                  if (group.join_mode === 'question' && answer === null) {
                    return;
                  }
                  joinRequestMutation.mutate({ conversationId: group.id, message: undefined, answer: answer?.trim() || undefined });
                  return;
                }
                joinMutation.mutate(group.id);
              }} disabled={disabled} className="liquid-button shrink-0 rounded-xl px-3 py-2 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-45">
                {groupJoinButtonLabel(group, pending ? '已提交加群申请' : statusText)}
              </button>
            </div>
          );
        })}
      </div>
    );
  }

  const panelContent = (
    <>
      <header className={`${mobile ? 'min-w-0 max-w-full shrink-0 overflow-hidden px-4 pb-3 pt-[max(44px,env(safe-area-inset-top))] [background:var(--kc-mobile-chat)]' : 'border-b p-4 [background:var(--kc-panel)] [border-color:var(--kc-border)]'}`}>
        <div className="mb-4 flex items-center justify-between gap-3">
          {mobile ? (
            <button type="button" onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-full [color:var(--kc-text)] active:[background:var(--kc-hover)]" aria-label="返回">
              <Icon name="chevronLeft" className="h-6 w-6" />
            </button>
          ) : null}
          <div className="min-w-0 flex-1 text-left">
            <h2 className={`${mobile ? 'text-[22px] font-black' : 'text-base font-semibold'}`}>搜索</h2>
            <p className="mt-1 text-xs [color:var(--kc-muted)]">搜索历史聊天记录、账号、邮箱、用户 ID 或公开群号。</p>
          </div>
          {mobile ? <span className="h-10 w-10 shrink-0" /> : (
            <button type="button" onClick={onClose} className="kc-icon-button h-8 w-8" aria-label="关闭全局搜索">
              <Icon name="close" className="h-4 w-4" />
            </button>
          )}
        </div>
        <form onSubmit={submitSearch} className="flex min-w-0 max-w-full items-center gap-2 overflow-hidden">
          <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-2xl border px-3 [background:var(--kc-panel-muted)] [border-color:var(--kc-border)] focus-within:[border-color:var(--kc-accent)]">
            <Icon name="search" className="h-4 w-4 shrink-0 [color:var(--kc-muted)]" />
            <input value={inputValue} onChange={(event) => setInputValue(event.target.value)} className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none [color:var(--kc-text)] placeholder:[color:var(--kc-muted)]" placeholder="输入关键词或 ID" autoFocus />
          </label>
          <button type="submit" className="liquid-button h-11 rounded-2xl px-5 text-sm font-semibold">搜索</button>
        </form>
        <nav className="mt-4 flex gap-2 overflow-x-auto">
          {([
            ['all', '全部'],
            ['messages', '聊天记录'],
            ['users', '用户'],
            ['groups', '群聊']
          ] as const).map(([value, label]) => (
            <button key={value} type="button" onClick={() => setTab(value)} className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold transition ${tab === value ? '[background:var(--kc-accent)] text-white' : '[background:var(--kc-panel-muted)] [color:var(--kc-muted)] hover:[color:var(--kc-text)]'}`}>
              {label}
            </button>
          ))}
        </nav>
      </header>

      <main className={`scroll-soft min-h-0 min-w-0 max-w-full flex-1 overflow-y-auto overflow-x-hidden p-4 [touch-action:pan-y] ${mobile ? '[background:var(--kc-mobile-chat)] pb-[max(24px,env(safe-area-inset-bottom))]' : ''}`}>
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
    </>
  );

  if (mobile) {
    return (
      <div className="fixed inset-0 z-[2147483646] flex min-h-0 w-screen max-w-[100vw] flex-col overflow-hidden overscroll-x-none [background:var(--kc-mobile-chat)] [color:var(--kc-text)]">
        {panelContent}
      </div>
    );
  }

  return (
    <div className="kc-mobile-overlay fixed inset-0 z-[2147483646] grid place-items-center p-4 [background:rgba(15,23,42,0.24)]" onMouseDown={onClose}>
      <div onMouseDown={(event) => event.stopPropagation()} className="kc-mobile-dialog flex h-[min(720px,88vh)] w-full max-w-[720px] flex-col overflow-hidden rounded-[26px] border shadow-float [background:var(--kc-panel)] [border-color:var(--kc-border)] [color:var(--kc-text)]">
        {panelContent}
      </div>
    </div>
  );
}
