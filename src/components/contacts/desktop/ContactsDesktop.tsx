import { useState } from 'react';
import { getDisplayName } from '@/components/ui/Avatar';
import type { Conversation, Friendship, User } from '@/types/api';
import { friendUser } from '../contactsShared';
import { useContactsData } from '../useContactsData';
import { BlocksPane, SearchPane } from './ListPanes';
import { NotificationsPane } from './NotificationsPane';
import { FriendProfile, GroupProfile } from './ProfilePanes';
import { ContactsSidebar } from './ContactsSidebar';

interface ContactsDesktopProps {
  friends: Friendship[];
  conversations: Conversation[];
  isLoading: boolean;
  currentUser: User;
  onOpenGlobalSearch?: (keyword?: string) => void;
  onOpenConversation?: (conversationId: number) => void;
  onOpenPost?: (postId: number) => void;
}

/** 右边内容区正在看什么。好友和群按 id 记，列表刷新后选中的还是同一个。 */
export type ContactsView =
  | { kind: 'notifications' }
  | { kind: 'blocks' }
  | { kind: 'search' }
  | { kind: 'friend'; id: number }
  | { kind: 'group'; id: number };

/** 桌面端的联系人页：左边是入口和好友 / 群聊列表，右边是通知、名单或选中对象的资料。 */
export function ContactsDesktop({ friends, conversations, isLoading, currentUser, onOpenGlobalSearch, onOpenConversation, onOpenPost }: ContactsDesktopProps): JSX.Element {
  const [view, setView] = useState<ContactsView>({ kind: 'notifications' });
  const [query, setQuery] = useState('');
  const data = useContactsData({ friends, conversations, currentUser, query, onOpenConversation, onOpenPost });

  // 资料从完整名单里取，不受搜索筛选影响；对象已经不在了（刚删掉好友、退了群）就退回通知中心
  const selectedFriend = view.kind === 'friend' ? friends.find((friendship) => friendUser(friendship)?.id === view.id) : undefined;
  const selectedGroup = view.kind === 'group' ? conversations.find((conversation) => conversation.type === 'group' && conversation.id === view.id) : undefined;
  const shownView: ContactsView = (view.kind === 'friend' && !selectedFriend) || (view.kind === 'group' && !selectedGroup) ? { kind: 'notifications' } : view;

  const startChat = (userId: number): void => data.directMutation.mutate({ user_id: userId });
  const removeFriend = (user: User): void => {
    if (window.confirm(`确定要删除好友「${getDisplayName(user, '好友')}」吗？`)) {
      data.deleteMutation.mutate(user.id);
    }
  };

  return (
    <section className="kcc">
      <ContactsSidebar
        view={shownView}
        query={query}
        friends={data.filteredFriends}
        friendTotal={friends.length}
        friendsLoading={isLoading}
        groups={data.groupConversations}
        pendingCount={data.pendingCount}
        blockCount={data.temporaryBlocks.length}
        onViewChange={setView}
        onQueryChange={setQuery}
        onOpenGlobalSearch={onOpenGlobalSearch}
        onStartChat={startChat}
        onRemoveFriend={removeFriend}
        onOpenConversation={data.openConversation}
      />
      <div className="kcc-main">
        {shownView.kind === 'notifications' ? <NotificationsPane data={data} /> : null}
        {shownView.kind === 'blocks' ? <BlocksPane data={data} /> : null}
        {shownView.kind === 'search' ? <SearchPane data={data} currentUser={currentUser} /> : null}
        {selectedFriend ? <FriendProfile friendship={selectedFriend} chatPending={data.directMutation.isPending} deletePending={data.deleteMutation.isPending} onStartChat={startChat} onRemove={removeFriend} /> : null}
        {selectedGroup ? <GroupProfile conversation={selectedGroup} onOpen={data.openConversation} /> : null}
      </div>
    </section>
  );
}
