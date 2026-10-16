import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { toast } from '@/components/ui/toast';
import { useRedPacketMotion } from '@/components/redpacket/ui';
import type { Conversation } from '@/types/api';
import type { GroupTodo } from '@/types/groupPlus';
import { formatMessageDateTime } from '@/utils/dateTime';
import { groupPlusErrorDetail, useClearGroupTodo, useGroupTodo } from '../data';
import { useGroupPlusUi } from '../ui';

const STORAGE_PREFIX = 'kukechat-todo-collapsed-';

/** 收起状态按会话记在本地：只是个人偏好，读写失败（隐私模式 / 被禁用）时界面照常工作。 */
function readCollapsed(conversationId: number): boolean {
  try {
    return window.localStorage.getItem(`${STORAGE_PREFIX}${conversationId}`) === '1';
  } catch {
    return false;
  }
}

function writeCollapsed(conversationId: number, collapsed: boolean): void {
  try {
    if (collapsed) {
      window.localStorage.setItem(`${STORAGE_PREFIX}${conversationId}`, '1');
    } else {
      window.localStorage.removeItem(`${STORAGE_PREFIX}${conversationId}`);
    }
  } catch {
    // 记不住就算了
  }
}

interface GroupTodoBarProps {
  conversation: Conversation;
  /** 群主 / 管理员：可以取消待办 */
  canManage: boolean;
  /** 跳到原消息（原消息还在时） */
  onJump: (messageId: number) => void;
  variant?: 'desktop' | 'mobile';
}

/**
 * 聊天顶部的群待办条，放在头部和消息列表之间（在滚动容器外面，不挡消息）。
 * 每群最多一条，画成一张浮在消息区顶上的卡片。收起时只有一行；展开显示设置人、发送人、摘要和操作。
 * 点主体：原消息还在就跳转，不在了就打开「查看全文」（用设置时固化的快照），被撤回的不可点。
 * 待办换成另一条（message_id 变了）时自动展开一次，让没看到提醒的人注意到。
 */
export function GroupTodoBar({ conversation, canManage, onJump, variant = 'desktop' }: GroupTodoBarProps): JSX.Element | null {
  const todo = useGroupTodo(conversation);
  if (conversation.type !== 'group' || !todo) {
    return null;
  }
  return <TodoBarBody key={conversation.id} conversationId={conversation.id} todo={todo} canManage={canManage} onJump={onJump} variant={variant} />;
}

function TodoBarBody({ conversationId, todo, canManage, onJump, variant }: { conversationId: number; todo: GroupTodo; canManage: boolean; onJump: (messageId: number) => void; variant: 'desktop' | 'mobile' }): JSX.Element {
  const motion = useRedPacketMotion();
  const [collapsed, setCollapsed] = useState(() => readCollapsed(conversationId));
  const [confirming, setConfirming] = useState(false);
  const [fresh, setFresh] = useState(false);
  const clear = useClearGroupTodo(conversationId);
  const lastMessageId = useRef(todo.message_id);

  useEffect(() => {
    if (lastMessageId.current === todo.message_id) {
      return undefined;
    }
    lastMessageId.current = todo.message_id;
    setCollapsed(false);
    writeCollapsed(conversationId, false);
    setFresh(true);
    const timer = window.setTimeout(() => setFresh(false), 600);
    return () => window.clearTimeout(timer);
  }, [conversationId, todo.message_id]);

  const toggle = (): void => {
    const next = !collapsed;
    writeCollapsed(conversationId, next);
    setCollapsed(next);
    setConfirming(false);
  };

  const jumpable = todo.message_exists && !todo.recalled;
  const body = todo.recalled ? '原消息已被撤回' : todo.summary || '[消息]';
  const sender = todo.snapshot?.sender ?? null;
  const open = (): void => {
    if (todo.recalled) {
      return;
    }
    if (jumpable) {
      onJump(todo.message_id);
    } else {
      useGroupPlusUi.getState().openTodoDetail(todo);
    }
  };
  const cancel = (): void => {
    clear.mutate(undefined, {
      onSuccess: () => toast.info('已取消群待办'),
      onError: (error) => {
        const detail = groupPlusErrorDetail(error);
        toast.error(typeof detail.message === 'string' && detail.message ? detail.message : '取消失败，稍后再试。');
      }
    });
  };

  const meta = `${todo.set_by?.display_name ? `${todo.set_by.display_name} 设置` : '已设置'}${todo.set_at ? ` · ${formatMessageDateTime(todo.set_at)}` : ''}`;
  return (
    <section className={`kgt kgt--${variant}${collapsed ? ' is-collapsed' : ''}${fresh && motion ? ' is-fresh' : ''}${todo.recalled ? ' is-recalled' : ''}`} aria-label="群待办" data-group-todo="">
      {collapsed ? (
        <button type="button" className="kgt-line" onClick={toggle} aria-expanded={false} title="展开群待办">
          <span className="kgt-icon kgt-icon--sm" aria-hidden="true"><Icon name="checkSquare" className="h-3.5 w-3.5" /></span>
          <strong>群待办</strong>
          <span className="kgt-line-text">{sender && !todo.recalled ? `${sender.display_name}：` : ''}{body}</span>
          <Icon name="chevron" className="kgt-caret h-4 w-4" />
        </button>
      ) : (
        <div className="kgt-main">
          <span className="kgt-icon" aria-hidden="true"><Icon name="checkSquare" className="h-4 w-4" /></span>
          <div className="kgt-head">
            <strong>群待办</strong>
            <span className="kgt-meta" title={meta}>{meta}</span>
          </div>
          <div className="kgt-actions">
            {canManage && confirming ? (
              <span className="kgt-confirm">
                <span>确定取消群待办？</span>
                <button type="button" className="kgt-btn kgt-btn--danger" disabled={clear.isPending} onClick={cancel}>{clear.isPending ? '取消中…' : '确定'}</button>
                <button type="button" className="kgt-btn" disabled={clear.isPending} onClick={() => setConfirming(false)}>再想想</button>
              </span>
            ) : (
              <>
                {todo.recalled ? null : <button type="button" className="kgt-btn kgt-btn--primary" onClick={open}>{jumpable ? '跳转到原消息' : '查看全文'}</button>}
                {canManage ? <button type="button" className="kgt-btn kgt-btn--quiet" onClick={() => setConfirming(true)}>取消待办</button> : null}
              </>
            )}
          </div>
          <button type="button" className="kgt-fold" onClick={toggle} aria-expanded title="收起" aria-label="收起群待办"><Icon name="chevron" className="kgt-caret is-open h-4 w-4" /></button>
          <button type="button" className="kgt-body" onClick={open} disabled={todo.recalled} title={jumpable ? '跳转到原消息' : todo.recalled ? undefined : '查看全文'}>
            <span className="kgt-text">{sender && !todo.recalled ? <span className="kgt-sender">{sender.display_name}：</span> : null}{body}</span>
          </button>
        </div>
      )}
    </section>
  );
}
