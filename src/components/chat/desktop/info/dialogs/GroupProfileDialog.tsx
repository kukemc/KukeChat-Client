import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateConversationProfile, uploadConversationAvatar } from '@/api/conversations';
import { Avatar } from '@/components/ui/Avatar';
import type { Conversation, UpdateConversationProfilePayload } from '@/types/api';
import { groupCategoryOptions } from '../../../info/shared';
import { Dialog } from '../controls';
import { useInfo } from '../infoContext';
import { invalidateConversationData } from '../infoData';

/** 群资料设置：头像、名称、简介、分类。 */
export function GroupProfileDialog(): JSX.Element {
  const { conversation, notify, closeDialog } = useInfo();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [title, setTitle] = useState(conversation.title ?? '');
  const [avatarUrl, setAvatarUrl] = useState(conversation.avatar_url ?? '');
  const [description, setDescription] = useState(conversation.description ?? '');
  const [category, setCategory] = useState(conversation.category ?? '');

  const avatarMutation = useMutation({
    mutationFn: uploadConversationAvatar,
    onSuccess: (response) => setAvatarUrl(response.url)
  });

  const saveMutation = useMutation({
    mutationFn: (payload: UpdateConversationProfilePayload) => updateConversationProfile(conversation.id, payload),
    onSuccess: (updated) => {
      queryClient.setQueryData<Conversation[]>(['conversations'], (current) => current?.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)) ?? current);
      closeDialog();
      notify('');
      invalidateConversationData(queryClient, conversation.id);
    },
    onError: () => notify('群资料保存失败，请稍后重试。', 'error')
  });

  const cleanTitle = title.trim();
  const formId = `kci-profile-${conversation.id}`;

  return (
    <Dialog title="群资料设置" onClose={closeDialog} footer={(
      <>
        <button type="button" className="kui-btn" onClick={closeDialog}>取消</button>
        <button type="submit" form={formId} className="kui-btn kui-btn--primary" disabled={!cleanTitle || saveMutation.isPending}>{saveMutation.isPending ? '保存中…' : '保存'}</button>
      </>
    )}>
      <form id={formId} className="kci-form" onSubmit={(event) => {
        event.preventDefault();
        if (cleanTitle) {
          saveMutation.mutate({ title: cleanTitle, avatar_url: avatarUrl.trim(), description: description.trim(), category: category || null });
        }
      }}>
        <div className="kci-form-avatar">
          <Avatar avatarUrl={avatarUrl} label={cleanTitle || '群'} size="lg" toneKey={conversation.id} />
          <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              avatarMutation.mutate(file);
            }
            // 清空后再选同一张图也能触发 change
            event.target.value = '';
          }} />
          <button type="button" className="kui-btn kui-btn--sm" disabled={avatarMutation.isPending} onClick={() => fileInputRef.current?.click()}>{avatarMutation.isPending ? '上传中…' : '更换头像'}</button>
          {avatarMutation.error ? <span className="kci-form-error">群头像上传失败。</span> : null}
        </div>
        <label className="kci-field">
          <span>群名称</span>
          <input className="kui-input" value={title} required placeholder="输入群名称" onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label className="kci-field">
          <span>群简介</span>
          <textarea className="kui-textarea kui-scroll" value={description} rows={3} placeholder="介绍这个群聊" onChange={(event) => setDescription(event.target.value)} />
        </label>
        <label className="kci-field">
          <span>群分类</span>
          <select className="kui-select" value={category} onChange={(event) => setCategory(event.target.value)}>
            {groupCategoryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
      </form>
    </Dialog>
  );
}
