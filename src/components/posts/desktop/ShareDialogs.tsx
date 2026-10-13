import { useState } from 'react';
import { ConversationAvatar } from '@/components/chat/message/messageText';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { ImageViewer, type ImageViewerState } from '@/components/ui/ImageViewer';
import type { Post, User } from '@/types/api';
import { type RepostMode, useConversationPicker, useRepostForm, useUserCardShare } from '../postForms';
import { POST_MAX_LENGTH, visibilityLabel, visibilityOptions } from '../postModel';
import { RepostQuote } from './PostBody';
import { PostDialog } from './PostDialog';

const repostModes: Array<{ value: RepostMode; label: string }> = [
  { value: 'zone', label: '转发到动态' },
  { value: 'chat', label: '发送到聊天' }
];

/** 选一个群聊或私聊：搜索框加一列会话。 */
function ConversationPicker({ picker }: { picker: ReturnType<typeof useConversationPicker> }): JSX.Element {
  return (
    <div>
      <label className="kui-field">
        <Icon name="search" className="h-3.5 w-3.5" />
        <input value={picker.query} onChange={(event) => picker.setQuery(event.target.value)} placeholder="搜索群聊或私聊" />
      </label>
      <div className="kpo-pick-list kui-scroll">
        {picker.isLoading ? <p className="kpo-suggest-note">正在加载会话…</p> : null}
        {!picker.isLoading && picker.items.length === 0 ? <p className="kpo-suggest-note">没有找到匹配会话</p> : null}
        {picker.items.map(({ conversation, title }) => {
          const active = picker.targetId === conversation.id;
          return (
            <button key={conversation.id} type="button" aria-pressed={active} className={`kpo-line ${active ? 'is-active' : ''}`} onClick={() => picker.setTargetId(conversation.id)}>
              <ConversationAvatar conversation={conversation} title={title} size="sm" />
              <span className="kpo-line-text">
                <strong>{title}</strong>
                <small>{conversation.type === 'group' ? `群聊 · ${conversation.member_count ?? 0} 人` : '私聊'}</small>
              </span>
              {active ? <Icon name="check" /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** 「分享」：转发成自己的一条动态，或者把动态卡片发到某个聊天里。 */
export function RepostDialog({ post, currentUser, onClose }: { post: Post; currentUser: User; onClose: () => void }): JSX.Element {
  const { content, setContent, visibility, setVisibility, mode, setMode, error, picker, previewPost, isPending, canSubmit, submit } = useRepostForm({ post, currentUser, onClose });
  const [viewer, setViewer] = useState<ImageViewerState | null>(null);

  return (
    <PostDialog title="转发动态" onClose={onClose} footerSplit footer={(
      <>
        {mode === 'zone' ? (
          <div className="kui-segment" role="radiogroup" aria-label="可见范围">
            {visibilityOptions.map((item) => <button key={item} type="button" role="radio" aria-checked={visibility === item} className={visibility === item ? 'is-active' : undefined} onClick={() => setVisibility(item)}>{visibilityLabel(item)}</button>)}
          </div>
        ) : <span className="kpo-share-target">{picker.selectedTitle ? <>发送给 <b>{picker.selectedTitle}</b></> : '选择一个群聊或好友'}</span>}
        <button type="button" className="kui-btn kui-btn--primary" disabled={!canSubmit} onClick={submit}>{isPending ? '转发中…' : '转发'}</button>
      </>
    )}>
      <div className="kui-segment" role="radiogroup" aria-label="转发方式">
        {repostModes.map((item) => <button key={item.value} type="button" role="radio" aria-checked={mode === item.value} className={mode === item.value ? 'is-active' : undefined} onClick={() => setMode(item.value)}>{item.label}</button>)}
      </div>
      <textarea className="kui-textarea kui-scroll" rows={3} value={content} onChange={(event) => setContent(event.target.value)} maxLength={POST_MAX_LENGTH} placeholder={mode === 'chat' ? '可选，给动态卡片加一句附言…' : '说说转发理由…'} />
      {mode === 'chat' ? <ConversationPicker picker={picker} /> : null}
      <RepostQuote post={previewPost} onOpenImage={(images, index) => setViewer({ images, index })} />
      {error ? <p className="kui-note kui-note--danger" role="alert">{error}</p> : null}
      {viewer ? <ImageViewer viewer={viewer} mobile={false} onClose={() => setViewer(null)} onNavigate={(index) => setViewer((current) => (current ? { ...current, index } : current))} /> : null}
    </PostDialog>
  );
}

/** 把某个人的名片发到聊天里。 */
export function UserCardShareDialog({ user, currentUser, onClose }: { user: User; currentUser: User; onClose: () => void }): JSX.Element {
  const { note, setNote, error, picker, isPending, canSubmit, submit } = useUserCardShare({ user, currentUser, onClose });

  return (
    <PostDialog title="发送个人名片" onClose={onClose} footerSplit footer={(
      <>
        <span className="kpo-share-target">{picker.selectedTitle ? <>发送给 <b>{picker.selectedTitle}</b></> : '选择一个群聊或好友'}</span>
        <button type="button" className="kui-btn kui-btn--primary" disabled={!canSubmit} onClick={submit}>{isPending ? '发送中…' : '发送'}</button>
      </>
    )}>
      <div className="kpo-line">
        <Avatar user={user} size="md" />
        <span className="kpo-line-text">
          <strong>{getDisplayName(user, `用户 ${user.id}`)}</strong>
          <small>个人名片 · {user.profile_title?.trim() || user.username || `ID ${user.id}`}</small>
        </span>
      </div>
      <textarea className="kui-textarea kui-scroll" rows={2} value={note} onChange={(event) => setNote(event.target.value)} maxLength={120} placeholder="可选，给名片加一句附言…" />
      <ConversationPicker picker={picker} />
      {error ? <p className="kui-note kui-note--danger" role="alert">{error}</p> : null}
    </PostDialog>
  );
}
