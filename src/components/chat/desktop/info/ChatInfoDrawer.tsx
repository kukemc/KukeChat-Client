import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { UserCard } from '@/components/ui/UserCard';
import type { Conversation, ConversationMember, Friendship, MemberRole, User } from '@/types/api';
import { AnnouncementModal } from '../../AnnouncementModal';
import { memberRoleRank } from '../../info/shared';
import { elementAnchorInContainer, pointInContainer } from '../../message/chatDom';
import { memberUserId } from '../../message/messageMeta';
import type { CardState } from '../../message/types';
import { GroupEmojiDialog } from '../emojis/GroupEmojiDialog';
import { cx, useEvent } from '../runtime';
import { BotsSection } from './BotsSection';
import { DangerSection } from './DangerSection';
import { GameModeSection } from './GameModeSection';
import { GroupEmojiSection } from './GroupEmojiSection';
import { GrowthSection } from './GrowthSection';
import { LevelTitlesSection } from './LevelTitlesSection';
import { InfoHeader } from './InfoHeader';
import { JoinSection } from './JoinSection';
import { MemberContextMenu, memberMenuEntries, type MemberMenuTarget } from './MemberContextMenu';
import { MembersSection } from './MembersSection';
import { MembersView } from './MembersView';
import { MySettingsSection } from './MySettingsSection';
import { ProfileSection } from './ProfileSection';
import { SpeechSection } from './SpeechSection';
import { TasksSection } from './TasksSection';
import { GroupProfileDialog } from './dialogs/GroupProfileDialog';
import { InviteDialog } from './dialogs/InviteDialog';
import { JoinRequestsDialog } from './dialogs/JoinRequestsDialog';
import { LevelTitlesDialog } from './dialogs/LevelTitlesDialog';
import { LeaderboardDialog } from './dialogs/LeaderboardDialog';
import { RemoveMembersDialog } from './dialogs/RemoveMembersDialog';
import { ShareActionsDialog, ShareForwardDialog } from './dialogs/ShareDialogs';
import { InfoContext, useInfo, type InfoContextValue, type InfoDialog, type InfoNotice } from './infoContext';
import { useMemberActions } from './useMemberActions';

interface ChatInfoDrawerProps {
  conversation: Conversation;
  currentUser: User;
  members: ConversationMember[];
  friends?: Friendship[];
  membersLoading?: boolean;
  currentRole?: MemberRole;
  conversations?: Conversation[];
  onReportConversation?: (conversation: Conversation) => void;
  onClose: () => void;
}

const EMPTY_FRIENDS: Friendship[] = [];
const EMPTY_CONVERSATIONS: Conversation[] = [];
const INFO_NOTICE_MS = 3200;

function DialogHost({ dialog }: { dialog: InfoDialog }): JSX.Element {
  const { conversation, canManage, closeDialog } = useInfo();
  switch (dialog.kind) {
    case 'profile':
      return <GroupProfileDialog />;
    case 'announcements':
      // 公告弹窗自带的层级比侧栏低，垫一层把它抬到侧栏上面
      return <div className="kci-layer"><AnnouncementModal conversation={conversation} canPublish={canManage} onClose={closeDialog} /></div>;
    case 'joinRequests':
      return <JoinRequestsDialog />;
    case 'levelTitles':
      return <LevelTitlesDialog />;
    case 'groupEmojis':
      return <GroupEmojiDialog conversationId={conversation.id} canManage={canManage} onClose={closeDialog} />;
    case 'invite':
      return <InviteDialog />;
    case 'remove':
      return <RemoveMembersDialog />;
    case 'leaderboard':
      return <LeaderboardDialog initialType={dialog.type} />;
    case 'share':
      return <ShareActionsDialog />;
    case 'forward':
      return <ShareForwardDialog card={dialog.card} />;
  }
}

/**
 * 聊天资料侧栏（桌面端）：群聊资料 / 私聊资料。
 * 聊天面板按会话 id 重挂，所以这里的状态不需要在切换会话时手动复位。
 */
export function ChatInfoDrawer({ conversation, currentUser, members, friends = EMPTY_FRIENDS, membersLoading = false, currentRole = 'member', conversations = EMPTY_CONVERSATIONS, onReportConversation, onClose }: ChatInfoDrawerProps): JSX.Element {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState<'main' | 'members'>('main');
  const [dialog, setDialog] = useState<InfoDialog | null>(null);
  const [notice, setNotice] = useState<InfoNotice | null>(null);
  const [userCard, setUserCard] = useState<CardState | null>(null);
  const [memberMenu, setMemberMenu] = useState<MemberMenuTarget | null>(null);

  const isGroup = conversation.type === 'group';
  const canManage = isGroup && (currentRole === 'owner' || currentRole === 'admin');
  const isOwner = isGroup && currentRole === 'owner';
  const memberCount = conversation.member_count ?? members.length;
  const sortedMembers = useMemo(() => [...members].sort((left, right) => memberRoleRank(left.role) - memberRoleRank(right.role) || (left.joined_at ?? '').localeCompare(right.joined_at ?? '')), [members]);
  const currentMember = members.find((member) => memberUserId(member) === currentUser.id) ?? null;
  const directUser = conversation.direct_user ?? members.find((member) => memberUserId(member) !== currentUser.id)?.user ?? null;

  const notify = useCallback((text: string, tone: InfoNotice['tone'] = 'info') => setNotice(text ? { text, tone } : null), []);
  const closeDialog = useCallback(() => setDialog(null), []);
  const dismissOverlays = useCallback(() => {
    setMemberMenu(null);
    setUserCard(null);
  }, []);
  const memberActions = useMemberActions({ conversation, currentUser, currentRole, friends, notify, dismissOverlays, closeDialog });

  // 成功提示看一眼就够了；失败提示留着，等用户自己关掉或被下一条顶掉
  useEffect(() => {
    if (notice?.tone !== 'info') {
      return undefined;
    }
    const timer = window.setTimeout(() => setNotice(null), INFO_NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);

  // Esc 一次只退一层：菜单 → 资料卡 → 对话框 → 成员名单 → 侧栏本身
  const handleEscape = useEvent(() => {
    if (memberMenu) {
      setMemberMenu(null);
    } else if (userCard) {
      setUserCard(null);
    } else if (dialog) {
      // 公告弹窗里可能正在写公告，Esc 直接关掉会丢草稿，交给它自己的关闭按钮
      if (dialog.kind !== 'announcements') {
        setDialog(null);
      }
    } else if (view === 'members') {
      setView('main');
    } else {
      onClose();
    }
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        handleEscape();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleEscape]);

  const value: InfoContextValue = {
    conversation,
    currentUser,
    members: sortedMembers,
    membersLoading,
    friends,
    conversations,
    currentRole,
    currentMember,
    directUser,
    isGroup,
    canManage,
    isOwner,
    memberCount,
    memberActions,
    notice,
    notify,
    openDialog: (next) => {
      // 上一条失败提示和新打开的对话框无关，留着会被对话框当成自己的错误显示出来
      setNotice((current) => (current?.tone === 'error' ? null : current));
      setDialog(next);
    },
    closeDialog,
    showMembers: () => setView('members'),
    openUser: (element, user, label) => {
      setMemberMenu(null);
      setUserCard({ user, label, anchor: elementAnchorInContainer(element, rootRef.current) });
    },
    openMemberMenu: (event, member) => {
      event.preventDefault();
      const userId = memberUserId(member);
      if (!userId || userId === currentUser.id || memberMenuEntries(member, memberActions).length === 0) {
        return;
      }
      event.stopPropagation();
      setUserCard(null);
      setMemberMenu({ member, ...pointInContainer(event.clientX, event.clientY, rootRef.current) });
    },
    reportConversation: onReportConversation,
    close: onClose
  };

  const showingMembers = view === 'members';

  return (
    <InfoContext.Provider value={value}>
      <div ref={rootRef} className="kci">
        <div className="kui-drawer-backdrop" aria-hidden="true" onClick={onClose} />
        <aside className="kui-drawer" aria-label={isGroup ? '群聊资料' : '聊天资料'}>
          <header className={cx('kci-bar', showingMembers && 'has-back')}>
            {showingMembers ? <button type="button" className="kui-icon-btn" aria-label="返回群聊资料" onClick={() => setView('main')}><Icon name="chevronLeft" className="h-4 w-4" /></button> : null}
            <h2>{showingMembers ? `群成员（${memberCount}）` : isGroup ? '群聊资料' : '聊天资料'}</h2>
            <button type="button" className="kui-icon-btn" aria-label="关闭聊天资料" onClick={onClose}><Icon name="close" className="h-4 w-4" /></button>
          </header>

          {notice ? (
            <div className={cx('kci-notice', notice.tone === 'error' && 'is-error')} role={notice.tone === 'error' ? 'alert' : 'status'}>
              <span>{notice.text}</span>
              <button type="button" aria-label="关闭提示" onClick={() => setNotice(null)}><Icon name="close" className="h-3 w-3" /></button>
            </div>
          ) : null}

          {showingMembers ? <MembersView /> : (
            <div className="kci-body kui-scroll">
              <InfoHeader />
              {isGroup ? (
                <>
                  <GrowthSection />
                  {canManage ? <LevelTitlesSection /> : null}
                  <BotsSection />
                  <MembersSection />
                  <ProfileSection />
                  <GroupEmojiSection />
                  {canManage ? <SpeechSection /> : null}
                  {canManage ? <JoinSection /> : null}
                  {isOwner ? <GameModeSection /> : null}
                  {canManage ? <TasksSection /> : null}
                </>
              ) : null}
              <MySettingsSection />
              <DangerSection />
            </div>
          )}
        </aside>

        {dialog ? <DialogHost dialog={dialog} /> : null}
        {memberMenu ? <MemberContextMenu target={memberMenu} actions={memberActions} overlayRoot={rootRef.current} onClose={() => setMemberMenu(null)} /> : null}
        {userCard ? <UserCard user={userCard.user} label={userCard.label} anchor={userCard.anchor} containerRef={rootRef} action={memberActions.profileAction(userCard.user)} onClose={() => setUserCard(null)} /> : null}
      </div>
    </InfoContext.Provider>
  );
}
