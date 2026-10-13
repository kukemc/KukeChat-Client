import type { Message } from '@/types/api';
import { Icon } from '@/components/ui/Icon';
import { resolveAssetUrl } from '@/utils/assetUrl';
import type { ForwardBundleSnapshot } from './types';
import { voicePreviewLabel, metadataImages, messageImageUrls, resolveMessageImagePreviewUrl, quoteMetadataOf, mentionMetadataOf, groupShareCardOf, postShareCardOf, botShareCardOf, userShareCardOf, teamupShareCardOf, parseForwardBundle, messagePreview, ccwCreationPreviewsFromMetadata } from './messageMeta';
import { renderQuoteBlock, renderMentionedText, CcwCreationCards, UnavailableImageLabel } from './messageText';
import { GroupShareCardPreview, PostShareCardPreview, BotShareCardPreview, UserShareCardPreview, TeamupShareCardPreview } from './shareCards';

export function renderSnapshotContent(snapshot: ForwardBundleSnapshot, onOpenImage?: (images: string[], index: number) => void): JSX.Element {
  const quote = snapshot.metadata ? quoteMetadataOf({ id: snapshot.id ?? -1, conversation_id: 0, type: snapshot.type, content: snapshot.content, metadata: snapshot.metadata, created_at: snapshot.createdAt ?? '', sender_id: snapshot.senderId, sender: null }) : null;
  const images = metadataImages(snapshot.metadata);
  if (snapshot.type === 'image') {
    const src = resolveMessageImagePreviewUrl(snapshot.content);
    return (
      <div className="min-w-0 max-w-full overflow-hidden">
        {quote ? renderQuoteBlock(quote, true) : null}
        {src ? <button type="button" className="block max-w-full overflow-hidden rounded-xl border [border-color:var(--kc-border)]" onClick={(event) => { event.stopPropagation(); onOpenImage?.([snapshot.content], 0); }}><img src={src} alt="转发图片" className="max-h-36 max-w-full object-contain" /></button> : <UnavailableImageLabel />}
      </div>
    );
  }

  if (snapshot.type === 'voice') {
    const href = resolveAssetUrl(snapshot.content);
    return (
      <div className="min-w-0 max-w-full overflow-hidden">
        {quote ? renderQuoteBlock(quote, true) : null}
        {href ? <a href={href} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-2 rounded-2xl border px-3 py-2 text-xs font-semibold [background:var(--kc-panel-muted)] [border-color:var(--kc-border)] [color:var(--kc-text)]" onClick={(event) => event.stopPropagation()}><Icon name="mic" className="h-4 w-4 shrink-0" /><span className="min-w-0 truncate">{voicePreviewLabel(snapshot)}</span></a> : <span className="inline-flex max-w-full rounded-xl border px-3 py-2 text-xs font-semibold [border-color:var(--kc-border)] [background:var(--kc-panel-muted)] [color:var(--kc-muted)]">语音不可用</span>}
      </div>
    );
  }

  if (snapshot.type === 'forward_bundle') {
    return <div className="min-w-0 max-w-full overflow-hidden">{quote ? renderQuoteBlock(quote, true) : null}<p className="rounded-xl px-3 py-2 text-xs [background:var(--kc-panel-muted)] [color:var(--kc-muted)]">[转发消息]</p></div>;
  }

  if (images.length > 0) {
    return (
      <div className="min-w-0 max-w-full space-y-2 overflow-hidden">
        {quote ? renderQuoteBlock(quote, true) : null}
        {snapshot.content ? <><p className="whitespace-pre-wrap break-words text-sm leading-6 [color:var(--kc-text)] [overflow-wrap:anywhere]">{snapshot.content}</p><CcwCreationCards previews={ccwCreationPreviewsFromMetadata(snapshot.metadata)} compact /></> : null}
        <div className={`grid min-w-0 max-w-full gap-2 overflow-hidden ${images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {images.map((imageUrl, index) => {
            const src = resolveMessageImagePreviewUrl(imageUrl);
            return src ? <button key={`${imageUrl}-${index}`} type="button" className="block min-w-0 max-w-full overflow-hidden rounded-xl border [border-color:var(--kc-border)]" onClick={(event) => { event.stopPropagation(); onOpenImage?.(images, index); }}><img src={src} alt="转发图片" className="max-h-36 w-full max-w-full object-cover" /></button> : <UnavailableImageLabel key={`${imageUrl}-${index}`} />;
          })}
        </div>
      </div>
    );
  }

  return <div className="min-w-0 max-w-full overflow-hidden">{quote ? renderQuoteBlock(quote, true) : null}<p className="whitespace-pre-wrap break-words text-sm leading-6 [color:var(--kc-text)] [overflow-wrap:anywhere]">{snapshot.content || '[空消息]'}</p>{snapshot.content ? <CcwCreationCards previews={ccwCreationPreviewsFromMetadata(snapshot.metadata)} compact /> : null}</div>;
}

export function renderMessageContentPreview(message: Message, onOpenForwardBundle: (message: Message) => void, onOpenImage?: (images: string[], index: number) => void): JSX.Element {
  if (message.recalled_at) {
    return <div className="inline-flex select-none rounded-full px-3 py-1.5 text-xs leading-none [background:var(--kc-panel-muted)] [color:var(--kc-muted)]">消息已撤回</div>;
  }
  const quote = quoteMetadataOf(message);
  const mentionData = mentionMetadataOf(message);
  const images = messageImageUrls(message);
  const groupShareCard = groupShareCardOf(message);
  const postShareCard = postShareCardOf(message);
  const botShareCard = botShareCardOf(message);
  const userShareCard = userShareCardOf(message);
  const teamupShareCard = teamupShareCardOf(message);
  if (message.type === 'system') {
    return <div className="inline-flex rounded-full px-3 py-1.5 text-xs [background:var(--kc-panel-muted)] [color:var(--kc-muted)]">{message.content || '系统消息'}</div>;
  }
  if (message.type === 'image') {
    const originalSrc = resolveAssetUrl(message.content);
    const src = resolveMessageImagePreviewUrl(message.content);
    return (
      <div>
        {quote ? renderQuoteBlock(quote, true) : null}
        {originalSrc && src ? <button type="button" onClick={() => onOpenImage?.([message.content], 0)} className="block w-fit overflow-hidden rounded-xl border text-left [border-color:var(--kc-border)]"><img src={src} alt="聊天图片" className="max-h-40 max-w-full object-contain" /></button> : <UnavailableImageLabel />}
      </div>
    );
  }
  if (message.type === 'voice') {
    return (
      <div>
        {quote ? renderQuoteBlock(quote, true) : null}
        <div className="inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-xs font-semibold [background:var(--kc-panel-muted)] [border-color:var(--kc-border)] [color:var(--kc-text)]">
          <Icon name="mic" className="h-4 w-4" />
          {voicePreviewLabel(message)}
        </div>
      </div>
    );
  }
  if (message.type === 'forward_bundle') {
    return (
      <button type="button" onClick={() => onOpenForwardBundle(message)} className="w-full rounded-xl border px-3 py-2 text-left transition hover:[background:var(--kc-hover)] [border-color:var(--kc-border)]">
        {quote ? renderQuoteBlock(quote, true) : null}
        <p className="text-sm font-semibold [color:var(--kc-text)]">{parseForwardBundle(message).title}</p>
        <p className="mt-1 text-xs [color:var(--kc-muted)]">{messagePreview(message)}</p>
      </button>
    );
  }
  if (groupShareCard) {
    return (
      <div>
        {quote ? renderQuoteBlock(quote, true) : null}
        <GroupShareCardPreview card={groupShareCard} />
      </div>
    );
  }
  if (postShareCard) {
    return (
      <div>
        {quote ? renderQuoteBlock(quote, true) : null}
        <PostShareCardPreview card={postShareCard} />
      </div>
    );
  }
  if (botShareCard) {
    return (
      <div>
        {quote ? renderQuoteBlock(quote, true) : null}
        <BotShareCardPreview card={botShareCard} />
      </div>
    );
  }
  if (userShareCard) {
    return (
      <div>
        {quote ? renderQuoteBlock(quote, true) : null}
        <UserShareCardPreview card={userShareCard} />
      </div>
    );
  }
  if (teamupShareCard) {
    return (
      <div>
        {quote ? renderQuoteBlock(quote, true) : null}
        <TeamupShareCardPreview card={teamupShareCard} />
      </div>
    );
  }
  if (images.length > 0) {
    return (
      <div className="space-y-2">
        {quote ? renderQuoteBlock(quote, true) : null}
        {message.content ? <><div className="whitespace-pre-wrap break-words text-sm leading-6 [color:var(--kc-text)]">{renderMentionedText(message.content, mentionData)}</div><CcwCreationCards previews={ccwCreationPreviewsFromMetadata(message.metadata)} /></> : null}
        <div className={`grid gap-2 ${images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {images.map((imageUrl, index) => {
            const originalSrc = resolveAssetUrl(imageUrl);
            const src = resolveMessageImagePreviewUrl(imageUrl);
            return originalSrc && src ? <button key={`${imageUrl}-${index}`} type="button" onClick={() => onOpenImage?.(images, index)} className="block overflow-hidden rounded-xl border text-left [border-color:var(--kc-border)]"><img src={src} alt="聊天图片" className="max-h-40 w-full object-cover" /></button> : <UnavailableImageLabel key={`${imageUrl}-${index}`} />;
          })}
        </div>
      </div>
    );
  }
  return (
    <div className="whitespace-pre-wrap break-words text-sm leading-6 [color:var(--kc-text)]">
      {quote ? renderQuoteBlock(quote, true) : null}
      {renderMentionedText(message.content || '[空消息]', mentionData)}
      {message.content ? <CcwCreationCards previews={ccwCreationPreviewsFromMetadata(message.metadata)} /> : null}
    </div>
  );
}
