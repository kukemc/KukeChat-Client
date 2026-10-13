import { useMemo } from 'react';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { CcwCreationCard } from '@/components/ui/CcwCreationCard';
import type { CcwCreationPreview, User } from '@/types/api';
import { resolveAssetUrl, resolveThumbnailUrl } from '@/utils/assetUrl';
import { type OpenUserSpace, type RepostTarget, formatTime, hasActiveTextSelection, tokenizePostText } from '../postModel';

export type OpenImages = (images: string[], index: number) => void;

/** 正文：链接、@ 好友、# 话题可以点。没给 onSelectTopic 时话题只着色，不能点。 */
export function PostText({ content, mentionUsers, onOpenUserSpace, onSelectTopic }: { content: string; mentionUsers: User[]; onOpenUserSpace: OpenUserSpace; onSelectTopic?: (topic: string) => void }): JSX.Element {
  const tokens = useMemo(() => tokenizePostText(content, mentionUsers), [content, mentionUsers]);
  return (
    <p className="kpo-text">
      {tokens.map((token, index) => {
        if (token.type === 'text') {
          return token.text;
        }
        if (token.type === 'url') {
          return <a key={index} href={token.url} target="_blank" rel="noreferrer">{token.url}</a>;
        }
        if (token.type === 'topic') {
          return <button key={index} type="button" disabled={!onSelectTopic} onClick={() => onSelectTopic?.(token.name)}>#{token.name}</button>;
        }
        return (
          <button key={index} type="button" onClick={() => {
            if (token.user) {
              onOpenUserSpace(token.user, token.user.id);
            } else if (token.userId !== undefined) {
              onOpenUserSpace(null, token.userId);
            }
          }}>@{token.name}</button>
        );
      })}
    </p>
  );
}

/** 图片宫格。传不出地址的图片（外站、已失效）直接不显示。 */
export function PostImages({ images, onOpen }: { images: string[]; onOpen?: OpenImages }): JSX.Element | null {
  const valid = images.filter((url) => resolveAssetUrl(url) && resolveThumbnailUrl(url));
  if (valid.length === 0) {
    return null;
  }
  return (
    <div className="kpo-images" data-count={valid.length}>
      {valid.map((url, index) => (
        <button key={`${url}-${index}`} type="button" className="kpo-image" onClick={(event) => {
          event.stopPropagation();
          onOpen?.(valid, index);
        }}>
          <img src={resolveThumbnailUrl(url)} alt={`动态图片 ${index + 1}`} loading="lazy" decoding="async" draggable={false} />
        </button>
      ))}
    </div>
  );
}

export function CreationCards({ previews = [] }: { previews?: CcwCreationPreview[] }): JSX.Element | null {
  if (previews.length === 0) {
    return null;
  }
  return (
    <div className="kpo-ccw">
      {previews.map((preview) => <CcwCreationCard key={`${preview.oid}:${preview.access_key ?? ''}`} oid={preview.oid} accessKey={preview.access_key ?? undefined} preview={preview} />)}
    </div>
  );
}

/** 被转发的原动态。给了 onOpenPost 才能点进去。 */
export function RepostQuote({ post, onOpenPost, onOpenImage }: { post: RepostTarget | null | undefined; onOpenPost?: (postId: number) => void; onOpenImage?: OpenImages }): JSX.Element {
  if (!post) {
    return <div className="kpo-quote is-gone">原动态不可见或已删除</div>;
  }
  const open = onOpenPost ? (): void => onOpenPost(post.id) : undefined;
  return (
    <div
      className="kpo-quote"
      role={open ? 'button' : undefined}
      tabIndex={open ? 0 : undefined}
      onClick={() => {
        // 拖选原文里的字不算点击
        if (!hasActiveTextSelection()) {
          open?.();
        }
      }}
      onKeyDown={(event) => {
        if (open && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          open();
        }
      }}
    >
      <div className="kpo-quote-head">
        <span className="kpo-avatar-xs"><Avatar user={post.author} size="sm" /></span>
        <strong>{getDisplayName(post.author, `用户 ${post.author_id}`)}</strong>
        <time>{formatTime(post.created_at)}</time>
      </div>
      {post.content ? <p className="kpo-text">{post.content}</p> : null}
      {post.content ? <CreationCards previews={post.ccw_creations} /> : null}
      <PostImages images={post.image_urls ?? []} onOpen={onOpenImage} />
    </div>
  );
}
