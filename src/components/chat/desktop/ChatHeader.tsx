import type { ReactNode } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { Icon, type IconName } from '@/components/ui/Icon';
import { useTypingStore } from '@/store/typingStore';
import type { Conversation, User } from '@/types/api';
import { isConversationBlocked, isConversationMuted } from '@/utils/notifications';

interface ChatHeaderProps {
  conversation: Conversation;
  /** 不带成员数的会话名：人数放在第二行。 */
  name: string;
  directUser: User | null;
  onOpenInfo: () => void;
  /** 右侧的操作按钮，按用途分成几个 .kcd-header-group。 */
  children: ReactNode;
}

interface HeaderFlag {
  icon: IconName;
  text: string;
  warn?: boolean;
}

/** 群聊第二行里成员数后面的小状态：只列和「我现在能不能说话、会不会被提醒」有关的。 */
function groupFlags(conversation: Conversation): HeaderFlag[] {
  const flags: HeaderFlag[] = [];
  if (conversation.all_muted) {
    flags.push({ icon: 'muted', text: '全员禁言', warn: true });
  }
  const rateLimit = conversation.message_rate_limit_per_minute ?? 0;
  if (rateLimit > 0) {
    flags.push({ icon: 'clock', text: `每分钟 ${rateLimit} 条` });
  }
  if (isConversationBlocked(conversation)) {
    flags.push({ icon: 'close', text: '已屏蔽消息' });
  } else if (isConversationMuted(conversation)) {
    flags.push({ icon: 'bellOff', text: '免打扰' });
  }
  return flags;
}

/**
 * 私聊的第二行。对方在输入时换成提示；平时是对方自己写的状态或签名。
 * 这里不显示「在线 / 离线」：用户资料里的 presence_status 只是对方选的状态，真正在不在线要另外请求。
 */
function DirectStatus({ conversationId, user }: { conversationId: number; user: User | null }): JSX.Element {
  const typing = useTypingStore((state) => Boolean(state.byConversation[conversationId]));
  if (typing) {
    return <span className="kcd-header-sub is-typing">对方正在输入…</span>;
  }
  const text = user?.presence_text?.trim() || user?.bio?.trim() || (user?.username ? `@${user.username}` : '私聊');
  return <span className="kcd-header-sub"><span className="kcd-header-clip">{text}</span></span>;
}

/** 聊天面板的头部：左边是会话的头像、名称和一行状态（整块点开聊天资料），右边是调用方给的操作按钮。 */
export function ChatHeader({ conversation, name, directUser, onOpenInfo, children }: ChatHeaderProps): JSX.Element {
  const isGroup = conversation.type === 'group';
  return (
    <header className="kcd-header">
      <button type="button" className="kcd-header-id" title={isGroup ? '查看群聊资料' : '查看聊天资料'} onClick={onOpenInfo}>
        {isGroup ? <Avatar avatarUrl={conversation.avatar_url} label={name} size="sm" toneKey={conversation.id} /> : <Avatar user={directUser} label={name} size="sm" />}
        <span className="kcd-header-text">
          <span className="kcd-header-title">
            <span className="kcd-header-name" role="heading" aria-level={3}>{name}</span>
            {directUser?.is_bot ? <span className="kcd-tag kcd-tag--admin"><Icon name="bot" className="h-3 w-3" />机器人</span> : null}
            {!isGroup && conversation.is_temporary ? <span className="kcd-tag">临时会话</span> : null}
          </span>
          {isGroup ? (
            <span className="kcd-header-sub">
              <span>{conversation.member_count ?? 0} 名成员</span>
              {groupFlags(conversation).map((flag) => (
                <span key={flag.icon} className={flag.warn ? 'kcd-header-flag is-warn' : 'kcd-header-flag'}><Icon name={flag.icon} className="h-3 w-3" />{flag.text}</span>
              ))}
            </span>
          ) : <DirectStatus conversationId={conversation.id} user={directUser} />}
        </span>
      </button>
      <div className="kcd-header-actions">{children}</div>
    </header>
  );
}
