import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createGroupInvite } from '@/api/invites';
import { sendMessage, shareUserToConversation } from '@/api/messages';
import { getDisplayName } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import type { MessageMetadata } from '@/types/api';
import { conversationPlainTitle, copyText, userShareMetadata } from '../../../info/shared';
import { ConversationAvatar } from '../../../message/messageText';
import { cx } from '../../runtime';
import { Dialog, DialogList } from '../controls';
import { useInfo } from '../infoContext';

/** 分享群聊的两条路：把群名片转发到别的会话，或复制邀请链接。 */
export function ShareActionsDialog(): JSX.Element {
  const { conversation, notify, openDialog, closeDialog } = useInfo();

  function copyInviteLink(): void {
    void createGroupInvite(conversation.id).then((link) => copyText(link.url)).then((copied) => {
      if (!copied) {
        notify('复制失败，请手动复制。', 'error');
        return;
      }
      notify('群聊链接已复制。');
      closeDialog();
    }).catch((error: unknown) => notify(error instanceof Error ? error.message : '生成邀请链接失败', 'error'));
  }

  return (
    <Dialog title="分享群聊" onClose={closeDialog}>
      <div className="kci-list">
        <button type="button" className="kci-item" onClick={() => openDialog({ kind: 'forward', card: 'group' })}>
          <Icon name="send" className="kci-item-icon" />
          <span className="kci-item-text">
            <span>转发群聊名片</span>
            <span>选择一个群或联系人，发送可加入的卡片</span>
          </span>
          <Icon name="chevron" className="kci-row-arrow" />
        </button>
        <button type="button" className="kci-item" onClick={copyInviteLink}>
          <Icon name="copy" className="kci-item-icon" />
          <span className="kci-item-text">
            <span>复制邀请链接</span>
            <span>复制群邀请链接，发到任意地方</span>
          </span>
        </button>
      </div>
    </Dialog>
  );
}

/** 选一个会话，把群名片或对方的个人名片发过去。 */
export function ShareForwardDialog({ card }: { card: 'group' | 'user' }): JSX.Element {
  const { conversation, conversations, currentUser, directUser, memberCount, notify, openDialog, closeDialog } = useInfo();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [targetId, setTargetId] = useState<number | null>(null);
  const [note, setNote] = useState('');

  const forwardMutation = useMutation({
    mutationFn: async (targetConversationId: number) => {
      const cleanNote = note.trim();
      if (card === 'user') {
        if (!directUser?.id) {
          throw new Error('未找到要分享的用户');
        }
        const content = [cleanNote, `[个人名片] ${getDisplayName(directUser, `用户 ${directUser.id}`)}`].filter(Boolean).join('\n');
        return shareUserToConversation(targetConversationId, content, userShareMetadata(directUser));
      }
      const link = await createGroupInvite(conversation.id);
      const metadata: MessageMetadata = {
        share_card: {
          type: 'group',
          conversation_id: conversation.id,
          title: conversation.title?.trim() || '未命名群聊',
          avatar_url: conversation.avatar_url,
          description: conversation.description,
          category: conversation.category,
          member_count: memberCount,
          join_mode: conversation.join_mode,
          auto_approve: conversation.auto_approve,
          invite_token: link.token,
          invite_url: link.url
        }
      };
      return sendMessage(targetConversationId, [cleanNote, link.url].filter(Boolean).join('\n'), 'text', metadata);
    },
    onSuccess: (_message, targetConversationId) => {
      closeDialog();
      notify(card === 'user' ? '个人名片已发送。' : '群聊名片已发送。');
      void queryClient.invalidateQueries({ queryKey: ['messages', targetConversationId] });
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: (error) => notify(error instanceof Error ? error.message : '发送名片失败，请稍后重试。', 'error')
  });

  const keyword = query.trim().toLowerCase();
  const targets = conversations.filter((item) => item.id !== conversation.id && (!keyword || conversationPlainTitle(item, currentUser).toLowerCase().includes(keyword) || String(item.id).includes(keyword)));
  // 群名片是从「分享群聊」那一步进来的，取消时退回去；个人名片没有上一步
  const back = (): void => (card === 'group' ? openDialog({ kind: 'share' }) : closeDialog());

  return (
    <Dialog title={card === 'user' ? '发送个人名片' : '转发群聊名片'} onClose={closeDialog} footer={(
      <>
        <button type="button" className="kui-btn" onClick={back}>{card === 'group' ? '返回' : '取消'}</button>
        <button type="button" className="kui-btn kui-btn--primary" disabled={targetId === null || forwardMutation.isPending} onClick={() => {
          if (targetId !== null) {
            forwardMutation.mutate(targetId);
          }
        }}>{forwardMutation.isPending ? '发送中…' : '发送'}</button>
      </>
    )}>
      <label className="kui-field">
        <Icon name="search" className="h-3.5 w-3.5" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索会话" autoFocus />
      </label>
      <DialogList empty={targets.length === 0 ? '没有找到可发送的会话。' : null}>
        {targets.map((target) => {
          const title = conversationPlainTitle(target, currentUser);
          const selected = target.id === targetId;
          return (
            <button key={target.id} type="button" aria-pressed={selected} className={cx('kci-item', selected && 'is-selected')} onClick={() => setTargetId(target.id)}>
              <ConversationAvatar conversation={target} title={title} size="sm" />
              <span className="kci-item-text">
                <span>{title}</span>
                <span>{target.type === 'group' ? `群聊 · ${target.member_count ?? 0} 人` : '联系人'}</span>
              </span>
              {selected ? <Icon name="check" className="kci-item-check" /> : null}
            </button>
          );
        })}
      </DialogList>
      <textarea className="kui-textarea kui-scroll" value={note} maxLength={120} rows={2} placeholder="可选，添加一句附言" onChange={(event) => setNote(event.target.value)} />
    </Dialog>
  );
}
