import { useState } from 'react';
import type { Message } from '@/types/api';
import { Icon } from '@/components/ui/Icon';
import { TaskEventCard } from '@/components/tasks/TaskEventCard';
import { TaskShareCard } from '@/components/tasks/TaskShareCard';
import { GroupFileCard } from '@/components/groupPlus/files/GroupFileCard';
import { groupFileMetaOf } from '@/api/groupPlus';
import { resolveAssetUrl } from '@/utils/assetUrl';
import { giftOf, giftThingLabel } from '@/utils/gift';
import { pokeInfoOf } from '@/utils/poke';
import { redPacketOf } from '@/utils/redPacket';
import { PokeNotice } from '../desktop/poke/PokeNotice';
import { AnnouncementCard, announcementCardOf } from '@/components/groupAnnouncement/AnnouncementCard';
import { pollOf } from '../desktop/polls/pollCache';
import { renderBotElementContent, renderSafeBotMarkdown } from './botMarkdown';
import {
  botMarkdownContent, botShareCardOf, ccwCreationPreviewsFromMetadata, formatVoiceDuration, groupShareCardOf, hasBotRenderableElements, isBotMarkdownMessage,
  isStickerMessage, mentionMetadataOf, messageImageUrls, messagePreview, parseForwardBundle, postShareCardOf, quoteMetadataOf, resolveMessageImagePreviewUrl,
  snapshotPreview, snapshotToMessage, taskEventCardOf, taskShareCardOf, teamupShareCardOf, userShareCardOf, voiceMetadataOf
} from './messageMeta';
import { CcwCreationCards, renderMentionedText, renderQuoteBlock, UnavailableImageLabel } from './messageText';
import { BotShareCardPreview, GroupShareCardPreview, PostShareCardPreview, TeamupShareCardPreview, UserShareCardPreview } from './shareCards';

/**
 * 精华、收藏、合并转发详情、聊天记录搜索共用的「只读」消息渲染器。
 *
 * 为什么单独一套：聊天行里的渲染（desktop/MessageRow、移动的 MessagePanel）依赖行上下文（成员表、操作回调、虚拟列表），
 * 而这几处都不在聊天行里；以前各写各的、只认文字和图片，别的类型（投票、红包、礼物、名片、文件、嵌套转发……）渲染不对。
 * 这里一处覆盖所有类型，只读：不能投票、不能领红包、没有动效。拿不准的类型一律降级成一行文字摘要，不能崩。
 */

export const DEFAULT_MAX_BUNDLE_DEPTH = 3;

export interface MessageViewProps {
  message: Message;
  /** 嵌套合并转发的当前深度，顶层是 0 */
  depth?: number;
  /** compact：列表里用，文字限行、图片缩略；full：详情里用，完整显示 */
  variant?: 'full' | 'compact';
  conversationId?: number;
  onOpenImages?: (images: string[], index: number) => void;
  /** 点合并转发卡片：进入该条转发自己的详情 */
  onOpenBundle?: (message: Message) => void;
  /** 点机器人名片：打开机器人详情。不给就只展示、不能点（调用方负责先关掉自己所在的弹窗 / 页面） */
  onOpenBot?: (botId: number) => void;
  /** 嵌套合并转发最多在原地展开几层，超过的只给卡片 + 「查看完整聊天记录」 */
  maxDepth?: number;
}

function Chip({ icon, children }: { icon?: 'mic' | 'redPacket' | 'gift' | 'poll' | 'message'; children: React.ReactNode }): JSX.Element {
  return <span className="kmv-chip">{icon ? <Icon name={icon} className="h-4 w-4 shrink-0" /> : null}<span className="kmv-chip-text">{children}</span></span>;
}

function PollSummary({ message }: { message: Message }): JSX.Element {
  const poll = pollOf(message);
  if (!poll || !Array.isArray(poll.options)) {
    return <Chip icon="poll">[投票]</Chip>;
  }
  const total = poll.options.reduce((sum, option) => sum + (typeof option.votes === 'number' ? option.votes : 0), 0);
  return (
    <div className="kmv-card">
      <p className="kmv-card-title"><Icon name="poll" className="h-4 w-4 shrink-0" />{poll.title}</p>
      <ul className="kmv-poll">
        {poll.options.slice(0, 8).map((option) => {
          const percent = total > 0 ? Math.round((option.votes / total) * 100) : 0;
          return (
            <li key={option.id}>
              <span className="kmv-poll-bar" style={{ width: `${percent}%` }} aria-hidden="true" />
              <span className="kmv-poll-text">{option.text}</span>
              <span className="kmv-poll-votes">{option.votes} 票</span>
            </li>
          );
        })}
      </ul>
      <p className="kmv-card-foot">{poll.multiple ? '多选' : '单选'} · {poll.total_voters} 人参与{poll.closed ? ' · 已结束' : ''}</p>
    </div>
  );
}

function RedPacketSummary({ message }: { message: Message }): JSX.Element {
  const meta = redPacketOf(message);
  if (!meta) {
    return <Chip icon="redPacket">[红包]</Chip>;
  }
  return (
    <div className="kmv-card kmv-card--red">
      <p className="kmv-card-title"><Icon name="redPacket" className="h-4 w-4 shrink-0" />{meta.greeting}</p>
      <p className="kmv-card-foot">{meta.kind === 'lucky' ? '拼手气红包' : '普通红包'} · 共 {meta.count} 个</p>
    </div>
  );
}

function GiftSummary({ message }: { message: Message }): JSX.Element {
  const meta = giftOf(message);
  if (!meta) {
    return <Chip icon="gift">[礼物]</Chip>;
  }
  return (
    <div className="kmv-card kmv-card--gift">
      <p className="kmv-card-title"><Icon name="gift" className="h-4 w-4 shrink-0" />送给 {meta.to_user.display_name}：{giftThingLabel(meta)}</p>
      {meta.message ? <p className="kmv-card-foot">{meta.message}</p> : null}
    </div>
  );
}

/**
 * 嵌套的合并转发：折叠成一张卡片（标题、条数、前 3 条摘要）。
 * 深度没到上限且在详情里（full）时可以原地展开子消息；到了上限只给「查看完整聊天记录」，点它进入这一条自己的详情，
 * 详情里再遇到嵌套还是同样处理，所以能一层层进去、一层层退回，渲染深度始终有界。
 */
function NestedBundle({ message, depth, maxDepth, variant, conversationId, onOpenImages, onOpenBundle, onOpenBot }: Required<Pick<MessageViewProps, 'depth' | 'maxDepth' | 'variant'>> & Pick<MessageViewProps, 'message' | 'conversationId' | 'onOpenImages' | 'onOpenBundle' | 'onOpenBot'> & { message: Message }): JSX.Element {
  const bundle = parseForwardBundle(message);
  const [expanded, setExpanded] = useState(false);
  const canExpand = variant === 'full' && depth < maxDepth && bundle.snapshots.length > 0;
  const total = bundle.count || bundle.snapshots.length;
  return (
    <div className="kmv-bundle">
      <button type="button" className="kmv-bundle-head" disabled={!onOpenBundle} onClick={(event) => { event.stopPropagation(); onOpenBundle?.(message); }}>
        <Icon name="message" className="h-4 w-4 shrink-0" />
        <span className="kmv-bundle-title">{bundle.title}</span>
        <span className="kmv-bundle-count">{total} 条</span>
      </button>
      {bundle.note ? <p className="kmv-bundle-note">备注：{bundle.note}</p> : null}
      {!expanded ? (
        <ul className="kmv-bundle-preview">
          {bundle.snapshots.slice(0, 3).map((snapshot, index) => (
            <li key={`${snapshot.id ?? index}-${snapshot.senderName}`}><b>{snapshot.senderName}：</b>{snapshotPreview(snapshot)}</li>
          ))}
          {bundle.snapshots.length === 0 ? <li>暂无可预览内容</li> : null}
        </ul>
      ) : (
        <div className="kmv-bundle-children">
          {bundle.snapshots.map((snapshot, index) => (
            <div key={`${snapshot.id ?? index}-${snapshot.senderName}`} className="kmv-bundle-child">
              <span className="kmv-bundle-sender">{snapshot.senderName}</span>
              <MessageView message={snapshotToMessage(snapshot, conversationId ?? message.conversation_id, index)} depth={depth + 1} variant="full" conversationId={conversationId} onOpenImages={onOpenImages} onOpenBundle={onOpenBundle} onOpenBot={onOpenBot} maxDepth={maxDepth} />
            </div>
          ))}
        </div>
      )}
      <div className="kmv-bundle-foot">
        {canExpand ? <button type="button" className="kmv-link" onClick={(event) => { event.stopPropagation(); setExpanded((value) => !value); }}>{expanded ? '收起' : '展开'}</button> : null}
        {onOpenBundle ? <button type="button" className="kmv-link" onClick={(event) => { event.stopPropagation(); onOpenBundle(message); }}>{depth >= maxDepth ? '点击查看完整聊天记录' : '查看完整记录'}</button> : null}
      </div>
    </div>
  );
}

export function MessageView({ message, depth = 0, variant = 'full', conversationId, onOpenImages, onOpenBundle, onOpenBot, maxDepth = DEFAULT_MAX_BUNDLE_DEPTH }: MessageViewProps): JSX.Element {
  const compact = variant === 'compact';
  const cid = conversationId ?? message.conversation_id;
  const root = `kmv${compact ? ' kmv--compact' : ''}`;

  if (message.recalled_at) {
    return <div className={root}><span className="kmv-notice">消息已撤回</span></div>;
  }
  const announcementCard = announcementCardOf(message);
  if (announcementCard) {
    return <div className={root}><AnnouncementCard message={message} card={announcementCard} readonly /></div>;
  }
  if (message.type === 'system') {
    const poke = pokeInfoOf(message);
    return <div className={root}><span className="kmv-notice">{poke ? <PokeNotice info={poke} /> : message.content || '系统消息'}</span></div>;
  }

  const quote = quoteMetadataOf(message);
  const quoteNode = quote ? renderQuoteBlock(quote, true) : null;

  let body: JSX.Element;
  const poll = message.type === 'poll' ? <PollSummary message={message} /> : null;
  const images = messageImageUrls(message);
  const groupCard = groupShareCardOf(message);
  const postCard = postShareCardOf(message);
  const botCard = botShareCardOf(message);
  const userCard = userShareCardOf(message);
  const teamupCard = teamupShareCardOf(message);
  const taskCard = taskShareCardOf(message);
  const taskEvent = taskEventCardOf(message);
  const fileMeta = message.type === 'text' ? groupFileMetaOf(message) : null;

  if (message.type === 'image') {
    const src = resolveMessageImagePreviewUrl(message.content);
    const original = resolveAssetUrl(message.content);
    const sticker = isStickerMessage(message);
    body = src && original ? (
      <button type="button" className={`kmv-image${sticker ? ' kmv-image--sticker' : ''}`} onClick={(event) => { event.stopPropagation(); onOpenImages?.([message.content], 0); }}>
        <img src={src} alt={sticker ? '表情包' : '聊天图片'} loading="lazy" decoding="async" draggable={false} />
      </button>
    ) : <UnavailableImageLabel />;
  } else if (message.type === 'voice') {
    const duration = voiceMetadataOf(message).durationMs;
    body = <Chip icon="mic">语音{duration ? ` ${formatVoiceDuration(duration)}` : ''}</Chip>;
  } else if (poll) {
    body = poll;
  } else if (message.type === 'red_packet') {
    body = <RedPacketSummary message={message} />;
  } else if (message.type === 'gift') {
    body = <GiftSummary message={message} />;
  } else if (message.type === 'forward_bundle') {
    body = <NestedBundle message={message} depth={depth} maxDepth={maxDepth} variant={variant} conversationId={cid} onOpenImages={onOpenImages} onOpenBundle={onOpenBundle} onOpenBot={onOpenBot} />;
  } else if (fileMeta) {
    body = <GroupFileCard meta={fileMeta} conversationId={cid} compact={compact} />;
  } else if (groupCard) {
    body = <GroupShareCardPreview card={groupCard} />;
  } else if (postCard) {
    body = <PostShareCardPreview card={postCard} />;
  } else if (botCard) {
    body = onOpenBot ? (
      <button type="button" title="查看机器人" onClick={(event) => { event.stopPropagation(); onOpenBot(botCard.bot_id); }} className="block max-w-full cursor-pointer rounded-[22px] text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-200">
        <BotShareCardPreview card={botCard} />
      </button>
    ) : <BotShareCardPreview card={botCard} />;
  } else if (userCard) {
    body = <UserShareCardPreview card={userCard} />;
  } else if (teamupCard) {
    body = <TeamupShareCardPreview card={teamupCard} />;
  } else if (taskCard) {
    body = <TaskShareCard card={taskCard} />;
  } else if (taskEvent) {
    body = <TaskEventCard event={taskEvent} />;
  } else {
    const mentionData = mentionMetadataOf(message);
    const todoReminder = typeof message.metadata === 'object' && message.metadata !== null && 'group_todo' in message.metadata && message.metadata.group_todo !== undefined;
    let text: React.ReactNode;
    if (hasBotRenderableElements(message)) {
      text = renderBotElementContent(message, mentionData);
    } else if (isBotMarkdownMessage(message)) {
      text = renderSafeBotMarkdown(botMarkdownContent(message), undefined, message);
    } else if (message.content || images.length === 0) {
      // 内容是「[群待办] xxx」时标签已经在文字里，不重复画
      text = renderMentionedText(message.content || '[空消息]', mentionData);
    } else {
      text = null;
    }
    body = (
      <>
        {todoReminder && !message.content.startsWith('[群待办]') ? <span className="kmv-todo-tag">群待办</span> : null}
        {text !== null ? <div className="kmv-text">{text}</div> : null}
        {message.content ? <CcwCreationCards previews={ccwCreationPreviewsFromMetadata(message.metadata)} compact={compact} /> : null}
        {images.length > 0 ? (
          <div className={`kmv-grid${images.length === 1 ? ' kmv-grid--single' : ''}`}>
            {images.map((imageUrl, index) => {
              const src = resolveMessageImagePreviewUrl(imageUrl);
              return src ? (
                <button key={`${imageUrl}-${index}`} type="button" className="kmv-image" onClick={(event) => { event.stopPropagation(); onOpenImages?.(images, index); }}>
                  <img src={src} alt="聊天图片" loading="lazy" decoding="async" draggable={false} />
                </button>
              ) : <UnavailableImageLabel key={`${imageUrl}-${index}`} />;
            })}
          </div>
        ) : null}
      </>
    );
  }

  // 未知类型兜底：上面都没接住、又不是文字时，给一行摘要而不是空白
  if (!['text', 'image', 'voice', 'poll', 'red_packet', 'gift', 'forward_bundle', 'sticker'].includes(message.type)) {
    body = <Chip>{messagePreview(message)}</Chip>;
  }

  return <div className={root}>{quoteNode}{body}</div>;
}
