import type { Conversation, CcwCreationPreview, MessageMentionMetadata, MessageQuoteMetadata } from '@/types/api';
import { DeviceAvatar } from '@/components/selfChat/DeviceAvatar';
import { Avatar } from '@/components/ui/Avatar';
import { PlusCornerBadge } from '@/components/groupPlus/PlusBadge';
import { conversationTier } from '@/components/groupPlus/tier';
import { CcwCreationCard } from '@/components/ui/CcwCreationCard';
import { resolveThumbnailUrl } from '@/utils/assetUrl';
import { formatMessageDividerTime } from '@/utils/dateTime';
import { URL_PATTERN, WRAP_ANYWHERE_CLASS } from './constants';

export function MessageTimeDivider({ value }: { value?: string | null }): JSX.Element | null {
  const label = formatMessageDividerTime(value);
  if (!label) {
    return null;
  }

  return (
    <div className="mb-4 mt-1 flex justify-center">
      <span className="select-none rounded-full px-3 py-1 text-xs font-medium [background:var(--kc-panel-muted)] [color:var(--kc-muted)]">
        {label}
      </span>
    </div>
  );
}

export function ConversationAvatar({ conversation, title, size = 'md' }: { conversation: Conversation | null | undefined; title: string; size?: 'sm' | 'md' }): JSX.Element {
  const sizeClass = size === 'sm' ? 'h-8 w-8 text-xs' : 'h-10 w-10 text-sm';
  if (conversation?.type === 'self') {
    return <DeviceAvatar kind="phone" size={size} />;
  }
  if (conversation?.type === 'group') {
    const avatarUrl = resolveThumbnailUrl(conversation.avatar_url);
    if (avatarUrl) {
      const tier = conversationTier(conversation);
      const image = <img src={avatarUrl} alt={title} className={`${sizeClass} shrink-0 rounded-full border object-cover [border-color:var(--kc-border)]`} />;
      // 付费群才多套一层放角标，免费群的结构和原来一样
      return tier === 'free' ? image : <span className="kgp-avatar kgp-avatar--sm inline-block shrink-0">{image}<PlusCornerBadge tier={tier} /></span>;
    }
    const initial = title.trim().slice(0, 1).toUpperCase() || '群';
    return <div className={`${sizeClass} grid shrink-0 place-items-center rounded-full border font-semibold [background:var(--kc-panel-muted)] [border-color:var(--kc-border)] [color:var(--kc-text)]`}>{initial}</div>;
  }

  return <Avatar user={conversation?.direct_user} label={title} size={size} />;
}

export function renderQuoteBlock(quote: MessageQuoteMetadata, compact = false, onJump?: (quote: MessageQuoteMetadata) => void): JSX.Element {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onJump?.(quote);
      }}
      className={`mb-2 block w-full min-w-0 max-w-full overflow-hidden border-l-2 pl-2 text-left [border-color:var(--kc-accent)] ${compact ? 'text-xs' : 'text-[13px]'} ${onJump ? 'cursor-pointer transition hover:opacity-85' : 'cursor-default'}`}
    >
      <p className="min-w-0 max-w-full truncate font-semibold [color:var(--kc-accent)]">{quote.sender_name}</p>
      <p className="mt-0.5 min-w-0 max-w-full whitespace-pre-wrap break-words [overflow-wrap:anywhere] [color:var(--kc-muted)]">{quote.preview}</p>
    </button>
  );
}

export function renderMentionedText(text: string, metadata?: { mentions: MessageMentionMetadata[]; mentionAll: boolean }): Array<string | JSX.Element> {
  if (!metadata || (!metadata.mentionAll && metadata.mentions.length === 0)) {
    return renderLinkedPreview(text);
  }

  const mentionNames = metadata.mentions.map((mention) => mention.name).filter(Boolean);
  if (metadata.mentionAll) {
    mentionNames.unshift('全体成员');
  }
  if (mentionNames.length === 0) {
    return renderLinkedPreview(text);
  }

  const pattern = new RegExp(`@(${mentionNames.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');
  const parts: Array<string | JSX.Element> = [];
  let lastIndex = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      parts.push(...renderLinkedPreview(text.slice(lastIndex, index)));
    }
    const value = match[0];
    parts.push(<span key={`${value}-${index}`} className="font-semibold [color:var(--kc-accent)]">{value}</span>);
    lastIndex = index + value.length;
  }
  if (lastIndex < text.length) {
    parts.push(...renderLinkedPreview(text.slice(lastIndex)));
  }
  return parts;
}

export function CcwCreationCards({ previews = [], compact = false }: { previews?: CcwCreationPreview[]; compact?: boolean }): JSX.Element | null {
  if (previews.length === 0) {
    return null;
  }
  return <div className="space-y-2">{previews.map((preview) => <CcwCreationCard key={`${preview.oid}:${preview.access_key ?? ''}`} oid={preview.oid} accessKey={preview.access_key ?? undefined} preview={preview} compact={compact} />)}</div>;
}

export function UnavailableImageLabel(): JSX.Element {
  return <span className="inline-flex rounded-xl border px-3 py-2 text-xs font-semibold [border-color:var(--kc-border)] [background:var(--kc-panel-muted)] [color:var(--kc-muted)]">图片不可用</span>;
}

export function renderLinkedPreview(text: string): Array<string | JSX.Element> {
  return text.split(URL_PATTERN).map((part, index) => {
    if (!URL_PATTERN.test(part)) {
      URL_PATTERN.lastIndex = 0;
      return part;
    }
    URL_PATTERN.lastIndex = 0;
    return (
      <a key={`${part}-${index}`} href={part} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()} className={`[color:var(--kc-accent)] hover:underline ${WRAP_ANYWHERE_CLASS}`}>
        {part}
      </a>
    );
  });
}
