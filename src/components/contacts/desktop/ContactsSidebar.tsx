import { useEffect, useRef, useState } from 'react';
import { UserLevelIcons } from '@/components/level/LevelIcons';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { ContextMenuItem, ContextMenuSeparator, ContextMenuSurface, MenuLayer } from '@/components/ui/ContextMenu';
import { Icon, type IconName } from '@/components/ui/Icon';
import type { Conversation, Friendship, User } from '@/types/api';
import { conversationTitle, friendUser } from '../contactsShared';
import type { ContactsView } from './ContactsDesktop';

interface ContactsSidebarProps {
  view: ContactsView;
  query: string;
  /** 已按搜索词筛过、排好序的好友 */
  friends: Friendship[];
  /** 没筛之前的好友总数，用来区分「还没有好友」和「没搜到」 */
  friendTotal: number;
  friendsLoading: boolean;
  groups: Conversation[];
  pendingCount: number;
  blockCount: number;
  onViewChange: (view: ContactsView) => void;
  onQueryChange: (query: string) => void;
  onOpenGlobalSearch?: (keyword?: string) => void;
  onStartChat: (userId: number) => void;
  onRemoveFriend: (user: User) => void;
  onOpenConversation: (conversationId: number) => void;
}

type ListTab = 'friends' | 'groups';
type MenuTarget = { kind: 'friend'; user: User } | { kind: 'group'; conversation: Conversation };

interface MenuState {
  target: MenuTarget;
  left: number;
  top: number;
}

const MENU_WIDTH = 160;
const MENU_HEIGHT = 108;
const ENTRIES: Array<{ kind: 'notifications' | 'blocks' | 'search'; label: string; icon: IconName }> = [
  { kind: 'notifications', label: '通知中心', icon: 'bell' },
  { kind: 'blocks', label: '临时会话屏蔽', icon: 'shield' },
  { kind: 'search', label: '找人', icon: 'userPlus' }
];

/** 联系人页的列表栏：搜索、三个入口，以及好友 / 群聊列表和它们的右键菜单。 */
export function ContactsSidebar({ view, query, friends, friendTotal, friendsLoading, groups, pendingCount, blockCount, onViewChange, onQueryChange, onOpenGlobalSearch, onStartChat, onRemoveFriend, onOpenConversation }: ContactsSidebarProps): JSX.Element {
  const [tab, setTab] = useState<ListTab>('friends');
  const [menu, setMenu] = useState<MenuState | null>(null);
  const rootRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const filtering = query.trim().length > 0;

  useEffect(() => {
    if (!menu) {
      return;
    }
    const close = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setMenu(null);
      }
    };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [menu]);

  function openMenu(event: React.MouseEvent<HTMLElement>, target: MenuTarget): void {
    event.preventDefault();
    const bounds = rootRef.current?.getBoundingClientRect();
    if (!bounds) {
      return;
    }
    // 菜单相对列表栏定位；纵向别超出栏底
    setMenu({ target, left: Math.max(4, Math.min(event.clientX - bounds.left, bounds.width - 12)), top: Math.max(4, Math.min(event.clientY - bounds.top, bounds.height - MENU_HEIGHT - 4)) });
  }

  function runMenu(action: () => void): void {
    setMenu(null);
    action();
  }

  return (
    <aside ref={rootRef} className="kcc-side">
      <div className="kcc-side-header">
        <label className="kui-field">
          <Icon name="search" className="h-4 w-4 shrink-0" />
          <input
            ref={searchRef}
            value={query}
            placeholder="搜索好友、群聊或用户"
            onFocus={() => onViewChange({ kind: 'search' })}
            onChange={(event) => {
              onQueryChange(event.target.value);
              onViewChange({ kind: 'search' });
            }}
          />
        </label>
        {onOpenGlobalSearch ? <button type="button" className="kui-icon-btn" title="加好友 / 加群" onClick={() => onOpenGlobalSearch(query.trim())}><Icon name="plus" className="h-4 w-4" /></button> : null}
      </div>

      <nav className="kcc-nav">
        {ENTRIES.map((entry) => (
          <button key={entry.kind} type="button" className={view.kind === entry.kind ? 'kcc-entry is-active' : 'kcc-entry'} onClick={() => {
            onViewChange({ kind: entry.kind });
            if (entry.kind === 'search') {
              searchRef.current?.focus();
            }
          }}>
            <Icon name={entry.icon} />
            <span className="kcc-entry-label">{entry.label}</span>
            {entry.kind === 'notifications' && pendingCount ? <span className="kui-badge">{pendingCount > 99 ? '99+' : pendingCount}</span> : null}
            {entry.kind === 'blocks' && blockCount ? <span className="kcc-entry-count">{blockCount}</span> : null}
          </button>
        ))}
      </nav>

      <div className="kcc-tabs">
        <div className="kui-segment" role="radiogroup">
          <button type="button" role="radio" aria-checked={tab === 'friends'} className={tab === 'friends' ? 'is-active' : undefined} onClick={() => setTab('friends')}>好友<span>{friends.length}</span></button>
          <button type="button" role="radio" aria-checked={tab === 'groups'} className={tab === 'groups' ? 'is-active' : undefined} onClick={() => setTab('groups')}>群聊<span>{groups.length}</span></button>
        </div>
      </div>

      <div className="kui-scroll kcc-list">
        {tab === 'friends' ? (
          <>
            {friendsLoading ? <p className="kui-empty">正在加载好友…</p> : null}
            {!friendsLoading && friendTotal === 0 ? <p className="kui-empty">还没有好友<br />去「找人」发一个好友申请</p> : null}
            {!friendsLoading && friendTotal > 0 && friends.length === 0 ? <p className="kui-empty">没有匹配的好友</p> : null}
            {friends.map((friendship) => {
              const user = friendUser(friendship);
              if (!user?.id) {
                return null;
              }
              return (
                <button
                  key={friendship.id ?? user.id}
                  type="button"
                  className={view.kind === 'friend' && view.id === user.id ? 'kcc-item is-active' : 'kcc-item'}
                  onClick={() => onViewChange({ kind: 'friend', id: user.id })}
                  onDoubleClick={() => onStartChat(user.id)}
                  onContextMenu={(event) => openMenu(event, { kind: 'friend', user })}
                >
                  <Avatar user={user} size="message" />
                  <span className="kcc-item-main">
                    <span className="kcc-item-title">{getDisplayName(user, `用户 ${user.id}`)} <UserLevelIcons user={user} passive /></span>
                    <span className="kcc-item-sub">{user.bio || user.email || '这个人很神秘，还没有简介'}</span>
                  </span>
                </button>
              );
            })}
          </>
        ) : (
          <>
            {groups.length === 0 ? <p className="kui-empty">{filtering ? '没有匹配的群聊' : '还没有加入群聊'}</p> : null}
            {groups.map((conversation) => {
              const title = conversationTitle(conversation);
              const announcement = conversation.announcement?.trim();
              return (
                <button
                  key={conversation.id}
                  type="button"
                  className={view.kind === 'group' && view.id === conversation.id ? 'kcc-item is-active' : 'kcc-item'}
                  onClick={() => onViewChange({ kind: 'group', id: conversation.id })}
                  onDoubleClick={() => onOpenConversation(conversation.id)}
                  onContextMenu={(event) => openMenu(event, { kind: 'group', conversation })}
                >
                  <Avatar avatarUrl={conversation.avatar_url} label={title} size="message" toneKey={conversation.id} />
                  <span className="kcc-item-main">
                    <span className="kcc-item-title">{title}</span>
                    <span className="kcc-item-sub">{conversation.member_count ?? conversation.members?.length ?? 0} 名成员{announcement ? ` · ${announcement}` : ''}</span>
                  </span>
                </button>
              );
            })}
          </>
        )}
      </div>

      {menu ? (
        <MenuLayer onClose={() => setMenu(null)} className="kcc-menu-layer">
          <ContextMenuSurface style={{ left: Math.min(menu.left, (rootRef.current?.clientWidth ?? MENU_WIDTH) - 8), top: menu.top, width: MENU_WIDTH }} onMouseDown={(event) => event.stopPropagation()}>
            {menu.target.kind === 'friend' ? (
              <FriendMenu user={menu.target.user} run={runMenu} onViewChange={onViewChange} onStartChat={onStartChat} onRemoveFriend={onRemoveFriend} />
            ) : (
              <GroupMenu conversation={menu.target.conversation} run={runMenu} onViewChange={onViewChange} onOpenConversation={onOpenConversation} />
            )}
          </ContextMenuSurface>
        </MenuLayer>
      ) : null}
    </aside>
  );
}

function FriendMenu({ user, run, onViewChange, onStartChat, onRemoveFriend }: { user: User; run: (action: () => void) => void } & Pick<ContactsSidebarProps, 'onViewChange' | 'onStartChat' | 'onRemoveFriend'>): JSX.Element {
  return (
    <>
      <ContextMenuItem icon="message" label="发消息" onClick={() => run(() => onStartChat(user.id))} />
      <ContextMenuItem icon="profile" label="查看资料" onClick={() => run(() => onViewChange({ kind: 'friend', id: user.id }))} />
      <ContextMenuSeparator />
      <ContextMenuItem icon="trash" label="删除好友" danger onClick={() => run(() => onRemoveFriend(user))} />
    </>
  );
}

function GroupMenu({ conversation, run, onViewChange, onOpenConversation }: { conversation: Conversation; run: (action: () => void) => void } & Pick<ContactsSidebarProps, 'onViewChange' | 'onOpenConversation'>): JSX.Element {
  return (
    <>
      <ContextMenuItem icon="message" label="发消息" onClick={() => run(() => onOpenConversation(conversation.id))} />
      <ContextMenuItem icon="info" label="查看资料" onClick={() => run(() => onViewChange({ kind: 'group', id: conversation.id }))} />
    </>
  );
}
