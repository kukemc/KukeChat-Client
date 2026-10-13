import { memo, useRef, type ReactNode } from 'react';
import { useTypingStore, type TypingUser } from '@/store/typingStore';

const NOBODY: readonly TypingUser[] = [];
/** 超过这么多人就不再逐个列名字。 */
const MAX_NAMES = 3;

/** 名字和「正在输入」拆成两段：放不下时只截名字，后半句始终完整。 */
function typingParts(users: readonly TypingUser[]): [names: string, tail: string] {
  return users.length > MAX_NAMES
    ? [users.slice(0, 2).map((user) => user.name).join('、'), ` 等 ${users.length} 人正在输入`]
    : [users.map((user) => user.name).join('、'), ' 正在输入'];
}

/** 聊天区的提示条。自己订阅 store，有人开始或停止输入时消息列表不跟着重渲染。 */
export const TypingIndicator = memo(function TypingIndicator({ conversationId }: { conversationId: number }): JSX.Element {
  const users = useTypingStore((state) => state.byConversation[conversationId] ?? NOBODY);
  // 淡出期间继续显示刚才的名字，不然文字会抢在透明度之前消失
  const shownRef = useRef(users);
  if (users.length > 0) {
    shownRef.current = users;
  }
  const [names, tail] = typingParts(shownRef.current);
  return (
    <div className={users.length > 0 ? 'kct-bar is-visible' : 'kct-bar'} role="status" aria-hidden={users.length === 0}>
      <span className="kct-names">{names}</span>
      <span className="kct-tail">{tail}</span>
      <span className="kct-dots" aria-hidden="true"><span /><span /><span /></span>
    </div>
  );
});

/** 会话列表的预览：有人在输入就换成提示，过期后露出原来的预览（children）。 */
export function TypingPreview({ conversationId, direct, children }: { conversationId: number; direct: boolean; children: ReactNode }): JSX.Element {
  const users = useTypingStore((state) => state.byConversation[conversationId]);
  if (!users) {
    return <>{children}</>;
  }
  const [names, tail] = direct ? ['对方', '正在输入'] : typingParts(users);
  return (
    <span className="kct-preview">
      <span className="kct-names">{names}</span>
      <span className="kct-tail">{tail}…</span>
    </span>
  );
}
