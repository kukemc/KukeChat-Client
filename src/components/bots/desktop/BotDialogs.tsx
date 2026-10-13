import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { copyText } from '@/components/chat/message/chatDom';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import type { Bot, Conversation, User } from '@/types/api';
import { useDeleteBot, useInstallBot, useShareBot } from '../botQueries';
import { conversationTitle, errorMessage, groupTitle, manageableGroups } from '../botShared';
import { cx } from './botUi';

interface DialogProps {
  title: string;
  /** 不传就不能点遮罩或按 Esc 关掉，只能走底栏的按钮 */
  onClose?: () => void;
  footer?: ReactNode;
  error?: unknown;
  className?: string;
  /** 内容区自己排版（文档弹窗的目录 + 正文），不套默认的内边距和滚动 */
  bare?: boolean;
  children: ReactNode;
}

/** 机器人中心的对话框外壳。请求失败的提示显示在框内，不然会被遮罩盖住。 */
export function Dialog({ title, onClose, footer, error, className, bare = false, children }: DialogProps): JSX.Element {
  useEffect(() => {
    if (!onClose) {
      return undefined;
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="kui-backdrop" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} className={cx('kui-dialog', className)} onMouseDown={(event) => event.stopPropagation()}>
        <header className="kui-dialog-header">
          <span>{title}</span>
          {onClose ? <button type="button" className="kui-icon-btn" aria-label="关闭" onClick={onClose}><Icon name="close" className="h-4 w-4" /></button> : null}
        </header>
        {bare ? children : (
          <div className="kui-dialog-body kcb-dialog-body kui-scroll">
            {children}
            {error ? <p className="kui-note kui-note--danger" role="alert">{errorMessage(error)}</p> : null}
          </div>
        )}
        {footer ? <footer className="kui-dialog-footer">{footer}</footer> : null}
      </div>
    </div>
  );
}

/** 单选列表里的一行：头像、名字、可选的副标题，选中的那行右边打勾。 */
function PickRow({ selected, avatar, title, sub, onSelect }: { selected: boolean; avatar: ReactNode; title: string; sub?: string; onSelect: () => void }): JSX.Element {
  return (
    <button type="button" role="radio" aria-checked={selected} className={cx('kcb-pick', selected && 'is-selected')} onClick={onSelect}>
      {avatar}
      <span className="kcb-pick-text"><span>{title}</span>{sub ? <span>{sub}</span> : null}</span>
      {selected ? <Icon name="check" className="kcb-pick-check" /> : null}
    </button>
  );
}

/** 把机器人加进自己管理的一个群。 */
export function InstallDialog({ bot, conversations, onClose }: { bot: Bot; conversations: Conversation[]; onClose: () => void }): JSX.Element {
  const groups = useMemo(() => manageableGroups(conversations), [conversations]);
  const [groupId, setGroupId] = useState(groups[0]?.id ?? 0);
  const install = useInstallBot();

  return (
    <Dialog
      title="添加到群聊"
      onClose={onClose}
      error={install.error}
      footer={(
        <>
          <button type="button" className="kui-btn" onClick={onClose}>取消</button>
          <button type="button" className="kui-btn kui-btn--primary" disabled={!groupId || install.isPending} onClick={() => install.mutate({ botId: bot.id, conversationId: groupId }, { onSuccess: onClose })}>{install.isPending ? '添加中…' : '添加'}</button>
        </>
      )}
    >
      {groups.length > 0 ? (
        <>
          <p className="kcb-dialog-hint">选一个你管理的群，把「{bot.name}」加进去。</p>
          <div className="kcb-pick-list kui-scroll" role="radiogroup" aria-label="选择群聊">
            {groups.map((group) => (
              <PickRow key={group.id} selected={group.id === groupId} avatar={<Avatar label={groupTitle(group)} avatarUrl={group.avatar_url} toneKey={group.id} size="sm" />} title={groupTitle(group)} sub={group.member_count ? `${group.member_count} 人` : undefined} onSelect={() => setGroupId(group.id)} />
            ))}
          </div>
        </>
      ) : <p className="kui-empty">没有可以添加的群聊<br />只有你是群主或管理员的群才能添加机器人</p>}
    </Dialog>
  );
}

/** 把机器人名片发到一个会话，对方点名片就能打开详情。 */
export function ShareDialog({ bot, conversations, currentUser, onClose }: { bot: Bot; conversations: Conversation[]; currentUser: User | null; onClose: () => void }): JSX.Element {
  const [targetId, setTargetId] = useState(conversations[0]?.id ?? 0);
  const share = useShareBot();

  return (
    <Dialog
      title="分享机器人"
      onClose={onClose}
      error={share.error}
      footer={(
        <>
          <button type="button" className="kui-btn" onClick={onClose}>取消</button>
          <button type="button" className="kui-btn kui-btn--primary" disabled={!targetId || share.isPending} onClick={() => share.mutate({ bot, conversationId: targetId }, { onSuccess: onClose })}>{share.isPending ? '发送中…' : '发送名片'}</button>
        </>
      )}
    >
      {conversations.length > 0 ? (
        <>
          <p className="kcb-dialog-hint">把「{bot.name}」的名片发给一个群或好友，对方点名片就能打开详情。</p>
          <div className="kcb-pick-list kui-scroll" role="radiogroup" aria-label="选择会话">
            {conversations.map((conversation) => {
              const title = conversationTitle(conversation, currentUser);
              const group = conversation.type === 'group';
              return (
                <PickRow
                  key={conversation.id}
                  selected={conversation.id === targetId}
                  avatar={group ? <Avatar label={title} avatarUrl={conversation.avatar_url} toneKey={conversation.id} size="sm" /> : <Avatar user={conversation.direct_user} label={title} size="sm" />}
                  title={title}
                  sub={group ? `群聊 · ${conversation.member_count ?? 0} 人` : '私聊'}
                  onSelect={() => setTargetId(conversation.id)}
                />
              );
            })}
          </div>
        </>
      ) : <p className="kui-empty">还没有可以分享的会话</p>}
    </Dialog>
  );
}

export function DeleteDialog({ bot, onClose, onDeleted }: { bot: Bot; onClose: () => void; onDeleted: () => void }): JSX.Element {
  const remove = useDeleteBot();
  return (
    <Dialog
      title="删除机器人"
      onClose={onClose}
      error={remove.error}
      className="kcb-dialog--narrow"
      footer={(
        <>
          <button type="button" className="kui-btn" onClick={onClose}>取消</button>
          <button type="button" className="kui-btn kui-btn--danger" disabled={remove.isPending} onClick={() => remove.mutate(bot.id, { onSuccess: onDeleted })}>{remove.isPending ? '删除中…' : '删除'}</button>
        </>
      )}
    >
      <p>确定删除「{bot.name}」吗？</p>
      <p className="kcb-dialog-hint">它的 Key 会立即失效，安装记录会被清掉，并从所有群聊里移出。历史消息会保留。删除后无法恢复。</p>
    </Dialog>
  );
}

/** 新建或重置之后展示完整的 Key。它只出现这一次，所以不能点遮罩关掉，免得手滑。 */
export function KeyDialog({ botKey, onClose }: { botKey: string; onClose: () => void }): JSX.Element {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return undefined;
    }
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  return (
    <Dialog
      title="保存机器人 Key"
      footer={(
        <>
          <button type="button" className="kui-btn" onClick={() => {
            copyText(botKey);
            setCopied(true);
          }}>{copied ? '已复制' : '复制 Key'}</button>
          <button type="button" className="kui-btn kui-btn--primary" onClick={onClose}>完成</button>
        </>
      )}
    >
      <p className="kui-note kui-note--warn">完整的 Key 只显示这一次，关掉之前请复制保存。以后只能重置，重置后旧 Key 立即失效。</p>
      <code className="kcb-key">{botKey}</code>
      <p className="kcb-dialog-hint">不要把 Key 放进公开的作品或代码里；万一泄露了，马上回来重置。</p>
    </Dialog>
  );
}
