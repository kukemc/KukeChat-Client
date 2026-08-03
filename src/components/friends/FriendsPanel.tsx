import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createDirectConversation } from '@/api/conversations';
import { deleteFriend, sendFriendRequest } from '@/api/friends';
import { searchUsers } from '@/api/users';
import { useKukeStore } from '@/store/kukeStore';
import type { Friendship, User } from '@/types/api';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';

interface FriendsPanelProps {
  friends: Friendship[];
  isLoading: boolean;
}

function friendUser(friendship: Friendship): User | null | undefined {
  return friendship.friend ?? friendship.user;
}

export function FriendsPanel({ friends, isLoading }: FriendsPanelProps): JSX.Element {
  const [query, setQuery] = useState('');
  const queryClient = useQueryClient();
  const setActiveConversationId = useKukeStore((state) => state.setActiveConversationId);

  const usersQuery = useQuery({
    queryKey: ['users-search', query],
    queryFn: () => searchUsers(query),
    enabled: query.trim().length >= 2
  });

  const sendRequestMutation = useMutation({
    mutationFn: sendFriendRequest,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['friend-requests'] })
  });

  const directMutation = useMutation({
    mutationFn: createDirectConversation,
    onSuccess: (conversation) => {
      setActiveConversationId(conversation.id);
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: deleteFriend,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['friends'] })
  });

  return (
    <section className="scroll-soft h-full overflow-y-auto p-4 [background:var(--kc-chat)] [color:var(--kc-text)] sm:p-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-2xl font-semibold">好友</h3>
          <p className="mt-1 text-sm [color:var(--kc-muted)]">搜索用户、发起好友申请或开始私聊。</p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="glass-panel rounded-[30px] p-4">
          <h4 className="mb-3 text-sm font-semibold">我的好友</h4>
          {isLoading ? <p className="glass-card-quiet rounded-2xl p-4 text-sm [color:var(--kc-muted)]">正在加载好友...</p> : null}
          {!isLoading && friends.length === 0 ? <p className="glass-card-quiet rounded-2xl p-4 text-sm [color:var(--kc-muted)]">还没有好友，试试右侧搜索。</p> : null}
          <div className="grid gap-2">
            {friends.map((friendship) => {
              const user = friendUser(friendship);
              const friendId = user?.id;
              if (!friendId) {
                return null;
              }
              return (
                <div key={friendship.id ?? friendId} className="glass-card flex items-center gap-3 rounded-2xl p-3 transition hover:[background:var(--kc-hover)]">
                  <Avatar user={user} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{getDisplayName(user, `用户 ${friendId}`)}</p>
                    <p className="truncate text-xs [color:var(--kc-muted)]">{user?.email || '好友'}</p>
                  </div>
                  <button type="button" onClick={() => directMutation.mutate({ user_id: friendId })} className="liquid-button rounded-2xl px-3 py-2 text-xs font-bold transition">聊天</button>
                  <button type="button" onClick={() => deleteMutation.mutate(friendId)} className="rounded-2xl border bg-transparent px-3 py-2 text-xs font-bold transition [border-color:var(--kc-border)] [color:var(--kc-muted)] hover:[background:var(--kc-hover)] hover:[color:var(--kc-text)]">删除</button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="glass-panel rounded-[30px] p-4">
          <label className="block">
            <span className="mb-2 block text-sm font-semibold">搜索用户</span>
            <div className="flex items-center gap-2 rounded-2xl px-3 py-2 transition [background:var(--kc-panel-muted)] focus-within:outline focus-within:outline-1 focus-within:[outline-color:var(--kc-accent)]">
              <Icon name="search" className="h-4 w-4 [color:var(--kc-muted)]" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none [color:var(--kc-text)] placeholder:[color:var(--kc-muted)]" placeholder="输入用户名或邮箱" />
            </div>
          </label>
          <div className="mt-4 grid gap-2">
            {usersQuery.data?.map((user) => (
              <div key={user.id} className="glass-card flex items-center gap-3 rounded-2xl p-3 transition hover:[background:var(--kc-hover)]">
                <Avatar user={user} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{getDisplayName(user)}</p>
                  <p className="truncate text-xs [color:var(--kc-muted)]">{user.email}</p>
                </div>
                <button type="button" onClick={() => sendRequestMutation.mutate(user.id)} className="liquid-button rounded-2xl px-3 py-2 text-xs font-bold transition">申请</button>
              </div>
            ))}
            {query.trim().length > 0 && query.trim().length < 2 ? <p className="glass-card-quiet rounded-2xl p-3 text-xs [color:var(--kc-muted)]">至少输入 2 个字符。</p> : null}
          </div>
        </div>
      </div>
    </section>
  );
}
