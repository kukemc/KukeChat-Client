import type { ReactNode, SyntheticEvent } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import type { Message } from '@/types/api';
import { formatMessageTime, messageSenderLabel } from '../messageMeta';

/** 行里的图片、合并转发卡片有自己的点击，点它们不算「打开这一行」。 */
function isInnerControl(event: SyntheticEvent): boolean {
  return event.target instanceof Element && event.target.closest('button, a') !== null;
}

/** 弹窗里的一条消息：头像、发送者、时间，下面是内容预览。搜索结果和精华消息共用。 */
export function MessageEntry({ message, action, onOpen, children }: { message: Message; action?: ReactNode; onOpen?: () => void; children: ReactNode }): JSX.Element {
  const name = messageSenderLabel(message);
  return (
    <article
      className={onOpen ? 'kmd-entry is-clickable' : 'kmd-entry'}
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen ? (event) => {
        if (!isInnerControl(event)) {
          onOpen();
        }
      } : undefined}
      onKeyDown={onOpen ? (event) => {
        if (event.key === 'Enter' && !isInnerControl(event)) {
          onOpen();
        }
      } : undefined}
    >
      <Avatar user={message.sender} label={name} size="sm" />
      <div className="kmd-entry-main">
        <header>
          <span>{name}</span>
          <time>{formatMessageTime(message.created_at)}</time>
          {action}
        </header>
        <div className="kmd-entry-content">{children}</div>
      </div>
    </article>
  );
}
