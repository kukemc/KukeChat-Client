import { useState } from 'react';
import { LevelNotificationIcon, isLevelNotification } from '@/components/level/LevelNotificationIcon';
import { PenaltyCenterModal } from '@/components/moderation/PenaltyCenter';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { useKukeStore } from '@/store/kukeStore';
import type { UnifiedNotification } from '@/types/api';
import { NOTIFICATION_CATEGORY_LABELS, formatNotificationTime, notificationAvatarSource, notificationTarget, type NotificationFilter, type NotificationTarget } from '../contactsShared';
import type { ContactsData } from '../useContactsData';
import { Pane } from './Pane';

const FILTERS: NotificationFilter[] = ['all', 'friend', 'group', 'post', 'interact', 'system'];

/** 通知中心：好友、群聊、动态、互动和系统通知汇在一处，申请类的可以直接处理。 */
export function NotificationsPane({ data }: { data: ContactsData }): JSX.Element {
  const [filter, setFilter] = useState<NotificationFilter>('all');
  const [showPenalties, setShowPenalties] = useState(false);
  const { notificationsQuery, notifications, notificationCount, pendingCount, requestBusy } = data;
  const counts = notificationsQuery.data?.counts;
  const visible = filter === 'all' ? notifications : notifications.filter((item) => item.category === filter);

  function open(target: NotificationTarget): void {
    if (target.kind === 'penalty') {
      setShowPenalties(true);
    } else if (target.kind === 'reports') {
      // 举报人复议的结果：去设置里的「举报记录」
      useKukeStore.getState().openSettingsTab('reports');
    } else if (target.kind === 'level') {
      useKukeStore.getState().openLevel('me');
    } else if (target.kind === 'post') {
      data.openPost(target.id);
    } else if (target.kind === 'teamup') {
      useKukeStore.getState().openTeamupProfile(target.id);
    } else if (target.kind === 'bot') {
      useKukeStore.getState().openBot(target.id);
    } else {
      data.openConversation(target.id);
    }
  }

  return (
    <Pane
      title="通知中心"
      meta={notificationsQuery.isLoading ? undefined : <>{notificationCount} 条通知{pendingCount ? <> · <b>{pendingCount} 条待处理</b></> : null}</>}
      aside={(
        <div className="kui-segment" role="radiogroup" aria-label="通知分类">
          {FILTERS.map((category) => (
            <button key={category} type="button" role="radio" aria-checked={filter === category} className={filter === category ? 'is-active' : undefined} onClick={() => setFilter(category)}>
              {NOTIFICATION_CATEGORY_LABELS[category]}{counts?.[category] ? <span>{counts[category]}</span> : null}
            </button>
          ))}
        </div>
      )}
    >
      <div className="kcc-card">
        {notificationsQuery.isLoading ? <p className="kui-empty">正在加载通知…</p> : null}
        {!notificationsQuery.isLoading && visible.length === 0 ? <p className="kui-empty"><Icon name="bell" />{filter === 'all' ? '这里暂时没有通知' : `没有${NOTIFICATION_CATEGORY_LABELS[filter]}通知`}</p> : null}
        {visible.map((notification) => (
          <NotificationItem
            key={notification.id}
            notification={notification}
            busy={requestBusy}
            onOpen={open}
            onAcceptFriend={(id) => data.acceptMutation.mutate(id)}
            onRejectFriend={(id) => data.rejectMutation.mutate(id)}
            onAcceptGroup={(id) => data.acceptGroupRequestMutation.mutate(id)}
            onRejectGroup={(id) => data.rejectGroupRequestMutation.mutate(id)}
          />
        ))}
      </div>
      {showPenalties ? <PenaltyCenterModal onClose={() => setShowPenalties(false)} /> : null}
    </Pane>
  );
}

interface NotificationItemProps {
  notification: UnifiedNotification;
  busy: boolean;
  onOpen: (target: NotificationTarget) => void;
  onAcceptFriend: (requestId: number) => void;
  onRejectFriend: (requestId: number) => void;
  onAcceptGroup: (requestId: number) => void;
  onRejectGroup: (requestId: number) => void;
}

function NotificationItem({ notification, busy, onOpen, onAcceptFriend, onRejectFriend, onAcceptGroup, onRejectGroup }: NotificationItemProps): JSX.Element {
  const source = notificationAvatarSource(notification);
  const target = notificationTarget(notification);
  const friendRequestId = notification.action === 'friend_request' ? notification.friend_request_id : null;
  const groupRequestId = notification.action === 'group_join_request' ? notification.group_join_request_id : null;
  const meta = [NOTIFICATION_CATEGORY_LABELS[notification.category], notification.conversation_title, formatNotificationTime(notification.time)].filter(Boolean).join(' · ');

  // 整行可点，但行里还有「接受 / 拒绝」按钮，所以用 div 而不是 button 套 button
  const linkProps = target ? {
    role: 'button',
    tabIndex: 0,
    onClick: () => onOpen(target),
    onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        onOpen(target);
      }
    }
  } : {};

  return (
    <div className={`kcc-row kcc-row--top${target ? ' is-link' : ''}${notification.pending ? ' is-pending' : ''}${notification.unread || notification.pending ? ' is-unread' : ''}`} {...linkProps}>
      {isLevelNotification(notification)
        ? <LevelNotificationIcon notification={notification} />
        : <Avatar user={source.user} label={source.label} avatarUrl={source.avatarUrl} toneKey={source.user ? undefined : notification.conversation_id} />}
      <div className="kcc-row-main">
        <div className="kcc-row-head">
          <span className="kcc-row-title">{notification.title}</span>
          {notification.pending ? <span className="kui-tag kui-tag--accent">待处理</span> : null}
          {notification.unread && !notification.pending ? <span className="kui-dot" aria-label="未读" /> : null}
        </div>
        {notification.body ? <p className="kcc-row-body">{notification.body}</p> : null}
        <p className="kcc-row-sub">{meta}</p>
      </div>
      {friendRequestId ? (
        <div className="kcc-row-actions" onClick={(event) => event.stopPropagation()}>
          <button type="button" className="kui-btn kui-btn--sm kui-btn--primary" disabled={busy} onClick={() => onAcceptFriend(friendRequestId)}>接受</button>
          <button type="button" className="kui-btn kui-btn--sm" disabled={busy} onClick={() => onRejectFriend(friendRequestId)}>拒绝</button>
        </div>
      ) : groupRequestId ? (
        <div className="kcc-row-actions" onClick={(event) => event.stopPropagation()}>
          <button type="button" className="kui-btn kui-btn--sm kui-btn--primary" disabled={busy} onClick={() => onAcceptGroup(groupRequestId)}>通过</button>
          <button type="button" className="kui-btn kui-btn--sm" disabled={busy} onClick={() => onRejectGroup(groupRequestId)}>拒绝</button>
        </div>
      ) : null}
      {target ? <Icon name="chevron" className="kcc-row-arrow" /> : null}
    </div>
  );
}
