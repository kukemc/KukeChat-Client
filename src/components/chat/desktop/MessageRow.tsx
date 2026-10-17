import { memo, useState } from 'react';
import { prewarmReactionPicker } from './reactions/ReactionPickerPanel';
import { FriendBadgeMark } from '@/components/intimacy/FriendBadgeMark';
import { useQuery } from '@tanstack/react-query';
import { getConversations } from '@/api/conversations';
import type { Conversation, ConversationMember, GroupShareCardMetadata, LevelTitleTier, Message, MessageQuoteMetadata } from '@/types/api';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { JuryBadge } from '@/components/jury/growth/JuryBadge';
import { TaskShareCard } from '@/components/tasks/TaskShareCard';
import { TaskEventCard } from '@/components/tasks/TaskEventCard';
import { GiftCard } from '@/components/gifts/GiftCard';
import { RedPacketCard } from '@/components/redpacket/RedPacketCard';
import { GroupFileCard } from '@/components/groupPlus/files/GroupFileCard';
import { groupFileMetaOf } from '@/api/groupPlus';
import { bubbleSkinClass, type BubbleSkin } from '@/components/shop/skin/bubbleSkin';
import { SkinDecor, messageSkin, useSkinSettings } from '@/components/shop/skin/SkinDecor';
import { resolveAssetUrl } from '@/utils/assetUrl';
import { formatClockTime, formatMessageDateTime, formatMessageDividerTime, parseApiDate } from '@/utils/dateTime';
import { pokeActionLabel, pokeInfoOf } from '@/utils/poke';
import { giftOf, isGiftMessage } from '@/utils/gift';
import { isRedPacketMessage, redPacketChainOf, redPacketOf } from '@/utils/redPacket';
import {
  botMarkdownContent,
  botShareCardOf,
  ccwCreationPreviewsFromMetadata,
  groupShareCardOf,
  hasBotRenderableElements,
  isBotMarkdownMessage,
  isStickerMessage,
  memberMentionName,
  mentionMetadataOf,
  messageImageUrls,
  messageSenderLabel,
  postShareCardOf,
  quoteMetadataOf,
  reactionUserNames,
  resolveMessageImagePreviewUrl,
  senderOf,
  taskEventCardOf,
  taskShareCardOf,
  teamupShareCardOf,
  userShareCardOf
} from '../message/messageMeta';
import { BilibiliVideoCards } from '../message/BilibiliVideoCard';
import { CcwCreationCards, renderMentionedText } from '../message/messageText';
import { renderBotElementContent, renderSafeBotMarkdown } from '../message/botMarkdown';
import { VoiceMessageBubble } from '../message/VoiceMessage';
import { BotShareCard, ForwardBundleCard, GroupShareCard, PostShareCard, TeamupShareCard, UserShareCard } from '../message/shareCards';
import type { BotInteraction } from '../message/types';
import { PollCard } from './polls/PollCard';
import { pollOf } from './polls/pollCache';
import { PokeNotice } from './poke/PokeNotice';
import { cx, useChatRow, type ChatRowActions, type ChatRowContextValue } from './runtime';
import { PendingImageSpinner, PendingSideStatus } from './PendingMessage';
import { isLocalMessage, localPreviewFor } from '../message/pendingSend';
import { isSelectableMessage } from './selection';

export interface MessageRowProps {
  message: Message;
  /** 与上一条间隔较久，行首显示时间分隔 */
  showTime: boolean;
  /** 与上一条是同一个人连发，省略头像和昵称 */
  grouped: boolean;
  /** 首条未读消息，行首显示「以下是新消息」 */
  unreadBefore: boolean;
  selected: boolean;
  selectMode: boolean;
  /** 多选模式下已经选了至少一条：没选中的行悬停时出现「选到这里」 */
  canPickRange: boolean;
  highlighted: boolean;
  poked: boolean;
  /** 非空时在气泡外侧显示「+1」复读按钮 */
  repeatText: string | null;
  repeatDisabled: boolean;
}

/** 图片的自然尺寸缓存。行被虚拟列表卸载后再挂载时，可以先按比例占位，避免加载完成后撑开布局。 */
const imageSizeCache = new Map<string, { width: number; height: number }>();
const EMPTY_CONVERSATIONS: Conversation[] = [];

/** 按 CSS 里的最大边长等比缩小，给出图片要占的宽度和宽高比。高度交给比例去算：气泡变窄时宽度被压缩，高度要跟着缩。 */
function fittedSize(size: { width: number; height: number }, maxEdge: number): { width: number; aspectRatio: string } {
  const scale = Math.min(1, maxEdge / size.width, maxEdge / size.height);
  return { width: Math.round(size.width * scale), aspectRatio: `${size.width} / ${size.height}` };
}

function ChatImage({ src, alt, variant }: { src: string; alt: string; variant: 'single' | 'sticker' | 'grid' }): JSX.Element {
  const [size, setSize] = useState(() => imageSizeCache.get(src) ?? null);
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      draggable={false}
      className={cx('kcd-image', `kcd-image--${variant}`, !size && 'is-loading')}
      style={size && variant !== 'grid' ? fittedSize(size, variant === 'sticker' ? 132 : 320) : undefined}
      onLoad={(event) => {
        const { naturalWidth, naturalHeight } = event.currentTarget;
        if (naturalWidth > 0 && naturalHeight > 0) {
          const next = { width: naturalWidth, height: naturalHeight };
          imageSizeCache.set(src, next);
          setSize(next);
        }
      }}
    />
  );
}

/** 群名片要知道「我是否已在群里」。自己订阅会话缓存，免得会话列表一变就连带重渲染所有消息行。 */
function JoinedAwareGroupCard({ card, actions }: { card: GroupShareCardMetadata; actions: ChatRowActions }): JSX.Element {
  // 只订阅缓存，不主动请求。queryFn 仍然要给：观察者的选项会成为这条查询的选项，缺了它别处触发的刷新会失败
  const { data } = useQuery({ queryKey: ['conversations'], queryFn: getConversations, enabled: false });
  return <GroupShareCard card={card} conversations={data ?? EMPTY_CONVERSATIONS} onError={actions.setError} />;
}

function QuoteBlock({ quote, onJump }: { quote: MessageQuoteMetadata; onJump: (quote: MessageQuoteMetadata) => void }): JSX.Element {
  return (
    <button
      type="button"
      className="kcd-quote"
      onClick={(event) => {
        event.stopPropagation();
        onJump(quote);
      }}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <span className="kcd-quote-name">{quote.sender_name}</span>
      <span className="kcd-quote-text">{quote.preview}</span>
    </button>
  );
}

function resolveMentionData(message: Message, memberByUserId: ReadonlyMap<number, ConversationMember>): ReturnType<typeof mentionMetadataOf> {
  const raw = mentionMetadataOf(message);
  if (raw.mentions.length === 0) {
    return raw;
  }
  return {
    mentionAll: raw.mentionAll,
    // 历史消息里可能只存了「用户 123」这样的占位名，能查到成员时换成真实昵称
    mentions: raw.mentions.map((mention) => {
      const fallback = /^用户\s*\d+$/.test(mention.name.trim()) ? memberMentionName(memberByUserId.get(mention.user_id) ?? null, mention.name) : mention.name;
      return fallback === mention.name ? mention : { ...mention, name: fallback };
    })
  };
}

function renderTextContent(message: Message, context: ChatRowContextValue): React.ReactNode {
  const interact = (interaction: BotInteraction): void => context.actions.botInteract(message, interaction);
  if (hasBotRenderableElements(message)) {
    return renderBotElementContent(message, resolveMentionData(message, context.memberByUserId), interact);
  }
  if (isBotMarkdownMessage(message)) {
    return renderSafeBotMarkdown(botMarkdownContent(message), interact, message);
  }
  return renderMentionedText(message.content, resolveMentionData(message, context.memberByUserId));
}

/** 返回消息主体，以及它是否自带外框（图片、语音、卡片不套气泡）。皮肤只交给语音：它不套气泡，但自己就是一个气泡。 */
function renderBody(message: Message, mine: boolean, context: ChatRowContextValue, skin: BubbleSkin | null, skinMotion: boolean): { node: React.ReactNode; bare: boolean } {
  const { actions } = context;

  if (message.type === 'image') {
    const original = resolveAssetUrl(message.content);
    // 刚发出去的图继续用本地那份（不重新下载、不闪）
    const preview = localPreviewFor(message.content) ?? resolveMessageImagePreviewUrl(message.content);
    const sticker = isStickerMessage(message);
    if (!original || !preview) {
      return { node: <span className="kcd-image-missing">图片不可用</span>, bare: false };
    }
    return {
      bare: true,
      node: (
        <button
          type="button"
          className={cx('kcd-media', sticker && 'kcd-media--sticker')}
          onClick={() => actions.openImages([message.content], 0)}
          onContextMenu={(event) => actions.openMessageMenu(event, message, message.content)}
        >
          <ChatImage src={preview} alt={sticker ? '表情包' : '聊天图片'} variant={sticker ? 'sticker' : 'single'} />
          {isLocalMessage(message) ? <PendingImageSpinner message={message} /> : null}
        </button>
      )
    };
  }
  if (message.type === 'voice') {
    return { bare: true, node: <VoiceMessageBubble message={message} mine={mine} skin={skin} skinMotion={skinMotion} onContextMenu={actions.openMessageMenu} /> };
  }
  if (message.type === 'forward_bundle') {
    return { bare: true, node: <ForwardBundleCard message={message} onOpen={() => actions.openForwardBundle(message)} /> };
  }
  const poll = pollOf(message);
  if (poll) {
    return { bare: true, node: <PollCard message={message} poll={poll} /> };
  }
  // 红包数据读不出来（形状不对）时落到最下面，按普通文字显示 content 里的兜底文字
  const redPacket = redPacketOf(message);
  if (redPacket) {
    return { bare: true, node: <RedPacketCard message={message} meta={redPacket} mine={mine} isGroup={context.isGroup} /> };
  }
  // 礼物同理：数据读不出来时按普通文字显示 content 里的兜底文字
  const gift = giftOf(message);
  if (gift) {
    return { bare: true, node: <GiftCard message={message} meta={gift} mine={mine} /> };
  }

  // 群文件消息：type 仍是 text（旧客户端只看到「[文件] 名」），新客户端按 metadata.file 画卡片
  const fileMeta = groupFileMetaOf(message);
  if (fileMeta) {
    return { bare: true, node: <GroupFileCard meta={fileMeta} conversationId={message.conversation_id} /> };
  }

  const groupCard = groupShareCardOf(message);
  if (groupCard) {
    return { bare: true, node: <JoinedAwareGroupCard card={groupCard} actions={actions} /> };
  }
  const postCard = postShareCardOf(message);
  if (postCard) {
    return { bare: true, node: <PostShareCard card={postCard} onOpenPost={actions.openPost} /> };
  }
  const botCard = botShareCardOf(message);
  if (botCard) {
    return { bare: true, node: <BotShareCard card={botCard} /> };
  }
  const userCard = userShareCardOf(message);
  if (userCard) {
    return { bare: true, node: <UserShareCard card={userCard} /> };
  }
  const teamupCard = teamupShareCardOf(message);
  if (teamupCard) {
    return { bare: true, node: <TeamupShareCard card={teamupCard} /> };
  }
  const taskCard = taskShareCardOf(message);
  if (taskCard) {
    return { bare: true, node: <TaskShareCard card={taskCard} /> };
  }
  const taskEvent = taskEventCardOf(message);
  if (taskEvent) {
    return { bare: true, node: <TaskEventCard event={taskEvent} /> };
  }

  const images = messageImageUrls(message);
  const structured = isBotMarkdownMessage(message) || hasBotRenderableElements(message);
  if (images.length > 0) {
    return {
      bare: false,
      node: (
        <>
          {message.content || hasBotRenderableElements(message) ? (
            <>
              <div className={cx('kcd-text', !structured && 'kcd-text--pre')}>{renderTextContent(message, context)}</div>
              <CcwCreationCards previews={ccwCreationPreviewsFromMetadata(message.metadata)} />
              {message.type === 'text' ? <BilibiliVideoCards text={message.content} /> : null}
            </>
          ) : null}
          <div className={cx('kcd-image-grid', images.length === 1 && 'kcd-image-grid--single')}>
            {images.map((imageUrl, index) => {
              const original = resolveAssetUrl(imageUrl);
              const preview = localPreviewFor(imageUrl) ?? resolveMessageImagePreviewUrl(imageUrl);
              return original && preview ? (
                <button
                  key={`${imageUrl}-${index}`}
                  type="button"
                  className="kcd-media"
                  onClick={() => actions.openImages(images, index)}
                  onContextMenu={(event) => actions.openMessageMenu(event, message, imageUrl)}
                >
                  <ChatImage src={preview} alt="聊天图片" variant="grid" />
                  {isLocalMessage(message) ? <PendingImageSpinner message={message} /> : null}
                </button>
              ) : <span key={`${imageUrl}-${index}`} className="kcd-image-missing">图片不可用</span>;
            })}
          </div>
        </>
      )
    };
  }

  return {
    bare: false,
    node: (
      <>
        <div className="kcd-text kcd-text--pre">{renderTextContent(message, context)}</div>
        {message.content ? <CcwCreationCards previews={ccwCreationPreviewsFromMetadata(message.metadata)} /> : null}
        {message.type === 'text' && message.content ? <BilibiliVideoCards text={message.content} /> : null}
      </>
    )
  };
}

/** 某个等级对应的等级头衔：起始等级不超过它的最后一档。 */
function levelTitleOf(level: number | null | undefined, tiers: readonly LevelTitleTier[] | null): string {
  if (!level || !tiers) {
    return '';
  }
  let title = '';
  for (const tier of tiers) {
    if (tier.min_level > level) break;
    title = tier.title;
  }
  return title;
}

/**
 * 昵称前的身份标签，等级和头衔合在一起显示，例如「LV8 萌新」「LV100 管理员」。
 * 头衔的优先级：成员专属头衔 > 群主/管理员 > 等级头衔。
 */
function identityTag(message: Message, context: ChatRowContextValue): { text: string; tone: 'owner' | 'admin' | 'plain' } | null {
  if (!context.isGroup) {
    return null;
  }
  const senderId = message.sender_id ?? senderOf(message)?.id ?? null;
  const role = (senderId ? context.memberByUserId.get(senderId)?.role : undefined) ?? (senderId === context.currentUser.id ? context.currentRole : undefined);
  const label = message.sender_title?.trim() || (role === 'owner' ? '群主' : role === 'admin' ? '管理员' : levelTitleOf(message.sender_level, context.levelTitles));
  const text = [message.sender_level ? `LV${message.sender_level}` : '', label].filter(Boolean).join(' ');
  return text ? { text, tone: role === 'owner' ? 'owner' : role === 'admin' ? 'admin' : 'plain' } : null;
}

function SenderMeta({ message, context, mine }: { message: Message; context: ChatRowContextValue; mine: boolean }): JSX.Element {
  const sender = senderOf(message);
  const isBot = Boolean(sender?.is_bot);
  const identity = isBot ? null : identityTag(message, context);
  return (
    <div className="kcd-meta">
      {identity ? <span className={`kcd-tag kcd-tag--${identity.tone}`}>{identity.text}</span> : null}
      {isBot ? <span className="kcd-tag kcd-tag--admin"><Icon name="bot" className="h-3 w-3" />机器人</span> : null}
      {/* 公开身份的在任风纪委员（本人选择展示时用户对象上才有 jury_badge） */}
      {isBot ? null : <JuryBadge tier={sender?.jury_badge} />}
      <span className="kcd-meta-name">{messageSenderLabel(message)}</span>
      {/* 发言人是我的好友、我们之间解锁过好友徽章：名字后面挂我选的那一枚（不是好友什么都不画） */}
      {isBot || mine ? null : <FriendBadgeMark userId={sender?.id} size={14} openable />}
      <time className="kcd-meta-time" title={formatMessageDateTime(message.created_at)}>{formatClockTime(message.created_at)}</time>
    </div>
  );
}

function Reactions({ message, actions }: { message: Message; actions: ChatRowActions }): JSX.Element | null {
  const reactions = (message.reactions ?? []).filter((reaction) => reaction.count > 0);
  if (reactions.length === 0) {
    return null;
  }
  return (
    <div className="kcd-reactions">
      {reactions.map((reaction) => {
        const names = reactionUserNames(reaction);
        return (
          <button
            key={reaction.emoji}
            type="button"
            className={cx('kcd-reaction', reaction.reacted_by_me && 'is-mine')}
            title={names.length > 0 ? names.join('、') : `${reaction.count} 人回应`}
            onClick={() => actions.toggleReaction(message, reaction.emoji)}
            onDoubleClick={(event) => event.stopPropagation()}
          >
            <span className="kcd-reaction-emoji">{reaction.emoji}</span>
            <span>{reaction.count}</span>
          </button>
        );
      })}
      <button type="button" className="kcd-reaction kcd-reaction--add" aria-label="添加回应" onPointerEnter={() => prewarmReactionPicker()} onClick={(event) => actions.openReactionPicker(event, message)} onDoubleClick={(event) => event.stopPropagation()}>
        <Icon name="plus" className="h-3 w-3" />
      </button>
    </div>
  );
}

function Dividers({ message, showTime, unreadBefore }: { message: Message; showTime: boolean; unreadBefore: boolean }): JSX.Element | null {
  const label = showTime ? formatMessageDividerTime(message.created_at) : '';
  if (!label && !unreadBefore) {
    return null;
  }
  return (
    <>
      {unreadBefore ? <div className="kcd-unread-divider"><span>以下是新消息</span></div> : null}
      {label ? <div className="kcd-time-divider"><span>{label}</span></div> : null}
    </>
  );
}

function MessageRowInner({ message, showTime, grouped, unreadBefore, selected, selectMode, canPickRange, highlighted, poked, repeatText, repeatDisabled }: MessageRowProps): JSX.Element {
  const context = useChatRow();
  const { actions, currentUser } = context;
  const skinSettings = useSkinSettings();
  // 只有刚收发的消息才播入场动画；翻历史时重新挂载的旧消息不播
  const [fresh] = useState(() => {
    const createdAt = parseApiDate(message.created_at);
    return Boolean(createdAt && Math.abs(Date.now() - createdAt.getTime()) < 4000);
  });

  if (message.type === 'system' || message.recalled_at) {
    // 戳一戳用结构化字段自己拼；字段不全的旧消息退回显示服务端拼好的 content
    const poke = message.recalled_at ? null : pokeInfoOf(message);
    return (
      <div className="kcd-item">
        <Dividers message={message} showTime={showTime} unreadBefore={unreadBefore} />
        <div data-message-id={message.id} className={cx('kcd-notice', highlighted && 'is-highlighted')} onContextMenu={(event) => actions.openMessageMenu(event, message)}>
          <span>{message.recalled_at ? '消息已撤回' : poke ? <PokeNotice info={poke} /> : message.content || '系统消息'}</span>
        </div>
      </div>
    );
  }

  const sender = senderOf(message);
  const mine = (message.sender_id ?? sender?.id) === currentUser.id;
  const quote = quoteMetadataOf(message);
  // 气泡皮肤（docs/shop.md 2.2）：自己的消息用自己装备的，别人的用发送者对象上带的。
  // 机器人的 Markdown / 组件消息里有按钮、表格、代码块这些自带底色的东西，不穿皮肤
  const skin = isBotMarkdownMessage(message) || hasBotRenderableElements(message) ? null : messageSkin(sender, mine, currentUser, skinSettings.showOthers);
  const body = renderBody(message, mine, context, skin, skinSettings.motion);
  // 图片、卡片、投票这些不套气泡的内容不染色
  const bubbleSkin = body.bare ? null : skin;
  const bookmarked = Boolean(message.bookmarked_by_me);
  const featured = Boolean(message.featured);
  // 乐观发送的本地消息（还没确认）：不出操作条，旁边显示发送状态
  const local = isLocalMessage(message);
  // 领接龙红包时自动发出的那句话：气泡旁边标一个小小的「接龙」
  const chained = redPacketChainOf(message) !== null;

  return (
    <div className={cx('kcd-item', grouped && 'kcd-item--grouped')}>
      <Dividers message={message} showTime={showTime} unreadBefore={unreadBefore} />
      <div
        data-message-id={message.id}
        className={cx('kcd-row', mine && 'is-mine', grouped && 'is-grouped', fresh && 'is-fresh', selectMode && 'is-selecting', selected && 'is-selected', highlighted && 'is-highlighted')}
        onContextMenu={(event) => actions.openMessageMenu(event, message)}
        onDoubleClick={selectMode ? undefined : () => actions.quote(message)}
        onClick={selectMode ? (event) => (event.shiftKey ? actions.selectRange(message) : actions.toggleSelected(message)) : undefined}
        // Shift + 点选是范围选择，别让浏览器顺手把中间的文字也选上
        onMouseDown={selectMode ? (event) => {
          if (event.shiftKey) {
            event.preventDefault();
          }
        } : undefined}
      >
        {selectMode ? <span className="kcd-check" role="checkbox" aria-checked={selected} aria-label="选择消息">{selected ? <Icon name="check" className="h-3 w-3" /> : null}</span> : null}
        {selectMode && canPickRange && !selected && isSelectableMessage(message) ? (
          <button type="button" className="kcd-range-pick" title="从上次点选的消息一直选到这条（Shift + 点选同效）" onClick={(event) => {
            event.stopPropagation();
            actions.selectRange(message);
          }}>
            选到这里
          </button>
        ) : null}
        <div className="kcd-avatar-slot">
          {grouped ? (
            <time className="kcd-gutter-time">{formatClockTime(message.created_at)}</time>
          ) : (
            <button
              type="button"
              className={cx('kcd-avatar', poked && 'kc-poke-shake')}
              title={mine ? undefined : `双击${pokeActionLabel(sender?.poke_action)}`}
              onClick={(event) => {
                event.stopPropagation();
                actions.avatarTap(event.currentTarget, message);
              }}
              // 行自身的双击是「引用」，这里只拦冒泡；戳一戳由 avatarTap 自己数点击
              onDoubleClick={(event) => event.stopPropagation()}
              onContextMenu={(event) => actions.openMemberMenu(event, message)}
            >
              <Avatar user={mine ? currentUser : sender} size="message" frame />
            </button>
          )}
        </div>
        <div className="kcd-main">
          {grouped ? null : <SenderMeta message={message} context={context} mine={mine} />}
          <div className="kcd-line">
            <div className={cx('kcd-content', body.bare ? 'kcd-content--bare' : 'kcd-bubble', bubbleSkin && bubbleSkinClass(bubbleSkin, mine))} style={bubbleSkin?.vars}>
              {bubbleSkin ? <SkinDecor skin={bubbleSkin} motion={skinSettings.motion} seed={message.id} /> : null}
              {quote ? <QuoteBlock quote={quote} onJump={actions.jumpToQuote} /> : null}
              {body.node}
              {bookmarked || featured ? (
                <span className="kcd-flags">
                  {featured ? <span className="kcd-flag kcd-flag--featured" title="群精华"><Icon name="sparkles" className="h-3 w-3" /></span> : null}
                  {bookmarked ? <span className="kcd-flag kcd-flag--bookmark" title="已收藏"><Icon name="star" className="h-3 w-3" /></span> : null}
                </span>
              ) : null}
            </div>
            <div className="kcd-side" onDoubleClick={(event) => event.stopPropagation()}>
              {local ? <PendingSideStatus message={message} /> : null}
              {chained ? <span className="kcd-chain-mark" title="领取接龙红包时自动发出">接龙</span> : null}
              {repeatText ? (
                <button type="button" className="kcd-plus-one" title="跟着复读一句" disabled={repeatDisabled} onClick={(event) => {
                  event.stopPropagation();
                  actions.repeat(repeatText);
                }}>
                  +1
                </button>
              ) : null}
            </div>
            {selectMode || local ? null : (
              <div className="kcd-toolbar" role="toolbar" aria-label="消息操作" onDoubleClick={(event) => event.stopPropagation()}>
                <button type="button" title="表情回应" onPointerEnter={() => prewarmReactionPicker()} onClick={(event) => actions.openReactionPicker(event, message)}><Icon name="emoji" className="h-4 w-4" /></button>
                <button type="button" title="引用" onClick={() => actions.quote(message)}><Icon name="quote" className="h-4 w-4" /></button>
                {/* 红包、礼物不能转发 */}
                {isRedPacketMessage(message) || isGiftMessage(message) || groupFileMetaOf(message) ? null : <button type="button" title="转发" onClick={() => actions.forward(message)}><Icon name="share" className="h-4 w-4" /></button>}
                <button type="button" title="更多" onClick={(event) => actions.openMessageMenuAt(event.currentTarget, message)}><Icon name="more" className="h-4 w-4" /></button>
              </div>
            )}
          </div>
          <Reactions message={message} actions={actions} />
        </div>
      </div>
    </div>
  );
}

export const MessageRow = memo(MessageRowInner);
