import { useRef } from 'react';
import { Icon } from '@/components/ui/Icon';
import type { Post, User } from '@/types/api';
import { resolveThumbnailUrl } from '@/utils/assetUrl';
import { usePostComposer } from '../postForms';
import { MAX_IMAGES, POST_IMAGE_ACCEPT, POST_MAX_LENGTH, visibilityLabel, visibilityOptions } from '../postModel';
import { MentionInput } from './MentionInput';
import { PostDialog } from './PostDialog';

/** 发表 / 编辑动态。草稿（文字和可见范围）在关掉后保留，下次打开接着写。 */
export function ComposerDialog({ currentUser, editingPost, onClose }: { currentUser: User; editingPost?: Post | null; onClose: () => void }): JSX.Element {
  const composer = usePostComposer({ currentUser, editingPost, onClose });
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <PostDialog title={composer.title} size="wide" onClose={onClose} footerSplit footer={(
      <>
        <div className="kpo-footer-tools">
          <button type="button" className="kui-btn" disabled={!composer.canAddImage} onClick={() => fileInputRef.current?.click()}>
            <Icon name="image" className="h-3.5 w-3.5" />图片 {composer.imageCount}/{MAX_IMAGES}
          </button>
          <div className="kui-segment" role="radiogroup" aria-label="可见范围">
            {visibilityOptions.map((item) => <button key={item} type="button" role="radio" aria-checked={composer.visibility === item} className={composer.visibility === item ? 'is-active' : undefined} onClick={() => composer.setVisibility(item)}>{visibilityLabel(item)}</button>)}
          </div>
        </div>
        <button type="button" className="kui-btn kui-btn--primary" disabled={!composer.canSubmit} onClick={composer.submit}>
          {composer.isPending ? (composer.isEditing ? '保存中…' : '发布中…') : (composer.isEditing ? '保存' : '发布')}
        </button>
      </>
    )}>
      <MentionInput value={composer.content} onChange={composer.setContent} onPaste={composer.handlePaste} friends={composer.friendUsers} topics={composer.topicOptions} multiline autoFocus maxLength={POST_MAX_LENGTH} placeholder="这一刻的想法…" className="kpo-composer-text" />
      {composer.imageCount > 0 ? (
        <div className="kpo-thumbs">
          {composer.existingImageUrls.map((url) => (
            <div key={url} className="kpo-thumb">
              <img src={resolveThumbnailUrl(url)} alt="已上传图片" />
              <button type="button" aria-label="移除图片" onClick={() => composer.removeExistingImage(url)}><Icon name="close" /></button>
            </div>
          ))}
          {composer.images.map((image) => (
            <div key={image.id} className="kpo-thumb">
              <img src={image.previewUrl} alt="待发布图片" />
              <button type="button" aria-label="移除图片" onClick={() => composer.removeImage(image.id)}><Icon name="close" /></button>
            </div>
          ))}
        </div>
      ) : null}
      <p className="kpo-hint">输入 # 添加话题，输入 @ 提醒好友；图片可以直接粘贴。发布后会先进入审核。</p>
      {composer.error ? <p className="kui-note kui-note--danger" role="alert">{composer.error}</p> : null}
      <input ref={fileInputRef} type="file" accept={POST_IMAGE_ACCEPT} multiple hidden onChange={composer.handleFileInput} />
    </PostDialog>
  );
}
