import { type FeaturedMessageItem } from '@/api/messages';
import { isRecord } from '@/api/normalizers';
import type { BotShareCardMetadata, Conversation, ConversationMember, CcwCreationPreview, Friendship, GroupShareCardMetadata, MemberRole, Message, MessageComponentState, MessageMentionMetadata, MessageMetadata, MessageQuoteMetadata, MessageReactionSummary, MessageType, PostShareCardMetadata, TaskEventCardMetadata, TaskShareCardMetadata, TeamupShareCardMetadata, TeamupSkill, User, UserShareCardMetadata } from '@/types/api';
import { getDisplayName } from '@/components/ui/Avatar';
import { resolveAssetUrl, resolveThumbnailUrl } from '@/utils/assetUrl';
import { formatMessageDateTime, parseApiDate } from '@/utils/dateTime';
import type { ForwardBundleSnapshot, ForwardBundleData } from './types';
import { REPEAT_MAX_LENGTH } from './constants';

export function formatBytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

export function senderOf(message: Message): User | null | undefined {
  return message.sender;
}

export function memberUserId(member: ConversationMember): number | null {
  return member.user_id ?? member.user?.id ?? null;
}

export function friendshipUser(friendship: Friendship): User | null | undefined {
  return friendship.friend ?? friendship.user;
}

export function resolveKnownUser(user: User | null | undefined, userId: number | null | undefined, friends: Friendship[]): User | null {
  if (user?.id) {
    return user;
  }
  if (!userId) {
    return null;
  }
  const friend = friends.map(friendshipUser).find((item) => item?.id === userId);
  return friend ?? { id: userId, username: `user-${userId}` };
}

export function roleBadgeLabel(role: MemberRole): string | null {
  if (role === 'owner') {
    return '群主';
  }
  if (role === 'admin') {
    return '管理员';
  }
  return null;
}

export function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

export function knownMessageType(value: unknown): MessageType {
  return value === 'image' || value === 'voice' || value === 'forward_bundle' || value === 'system' ? value : 'text';
}

export function finiteNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function formatVoiceDuration(durationMs?: number | null): string {
  const totalSeconds = Math.max(0, Math.round(finiteNumber(durationMs, 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function voiceMetadataOf(message: Message | ForwardBundleSnapshot): { durationMs?: number; contentType?: string; size?: number; waveform?: number[] } {
  const metadata = isRecord(message.metadata) ? message.metadata : null;
  const voice = isRecord(metadata?.voice) ? metadata.voice : null;
  const waveform = Array.isArray(voice?.waveform)
    ? voice.waveform.map((item) => finiteNumber(item, 0)).filter((item) => item >= 0 && item <= 1).slice(0, 40)
    : undefined;
  return {
    durationMs: asNumber(voice?.duration_ms),
    contentType: asString(voice?.content_type),
    size: asNumber(voice?.size),
    waveform
  };
}

export function voicePreviewLabel(message: Message | ForwardBundleSnapshot): string {
  const durationMs = voiceMetadataOf(message).durationMs;
  return durationMs ? `[语音] ${formatVoiceDuration(durationMs)}` : '[语音]';
}

export function metadataImages(value: unknown): string[] {
  if (!isRecord(value)) {
    return [];
  }
  const images = Array.isArray(value.images) ? value.images.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
  const elementImages = messageElements(value)
    .filter((element) => element.type === 'img' || element.type === 'image')
    .map((element) => asString(element.attrs?.src) ?? asString(element.attrs?.url) ?? asString(element.content))
    .filter((item): item is string => Boolean(item?.trim()));

  return Array.from(new Set([...images, ...elementImages]));
}

export function messageImageUrls(message: Message): string[] {
  return message.type === 'image' ? [message.content] : metadataImages(message.metadata);
}

export function isGifAssetUrl(value?: string | null): boolean {
  if (!value) {
    return false;
  }
  try {
    return new URL(value, 'https://kukechat.local').pathname.toLowerCase().endsWith('.gif');
  } catch {
    return value.split('?')[0].split('#')[0].trim().toLowerCase().endsWith('.gif');
  }
}

export function resolveMessageImagePreviewUrl(value?: string | null): string | undefined {
  const original = resolveAssetUrl(value);
  if (!original) {
    return undefined;
  }
  return isGifAssetUrl(value) ? original : resolveThumbnailUrl(value);
}

export function isStickerMessage(message: Message): boolean {
  const metadata = metadataOf(message);
  const content = message.type === 'image' ? message.content : '';
  const hasStickerElement = messageElements(metadata).some((element) => element.type === 'sticker' || element.type === 'face');
  return metadata?.sticker === true || hasStickerElement || /\/uploads\/stickers\//.test(content) || /\/stickers\//.test(content);
}

export function metadataOf(message: Message): Record<string, unknown> | null {
  if (isRecord(message.metadata)) {
    return message.metadata;
  }

  if (message.type !== 'forward_bundle' || !message.content.trim().startsWith('{')) {
    return null;
  }

  try {
    const parsed = JSON.parse(message.content) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function quoteMetadataOf(message: Message): MessageQuoteMetadata | null {
  const metadata = metadataOf(message);
  const quote = metadata?.quote;
  const quoteElement = messageElements(metadata).find((element) => element.type === 'quote');
  if (quoteElement?.attrs) {
    const senderName = asString(quoteElement.attrs.sender_name) ?? asString(quoteElement.attrs.senderName) ?? asString(quoteElement.attrs.name) ?? '未知用户';
    const preview = asString(quoteElement.attrs.preview) ?? asString(quoteElement.attrs.content) ?? '';
    if (preview) {
      return {
        message_id: asNumber(quoteElement.attrs.id) ?? asNumber(quoteElement.attrs.message_id) ?? asNumber(quoteElement.attrs.messageId),
        sender_id: asNumber(quoteElement.attrs.sender_id) ?? asNumber(quoteElement.attrs.senderId),
        sender_name: senderName,
        preview,
        type: knownMessageType(quoteElement.attrs.type),
        content: asString(quoteElement.attrs.content),
        created_at: asString(quoteElement.attrs.created_at) ?? asString(quoteElement.attrs.createdAt)
      };
    }
  }
  if (!isRecord(quote)) {
    return null;
  }

  const senderName = asString(quote.sender_name) ?? asString(quote.senderName) ?? '未知用户';
  const preview = asString(quote.preview) ?? asString(quote.content) ?? '';
  if (!preview) {
    return null;
  }

  return {
    message_id: asNumber(quote.message_id) ?? asNumber(quote.messageId),
    sender_id: asNumber(quote.sender_id) ?? asNumber(quote.senderId),
    sender_name: senderName,
    preview,
    type: knownMessageType(quote.type),
    content: asString(quote.content),
    created_at: asString(quote.created_at) ?? asString(quote.createdAt)
  };
}

export function mentionMetadataOf(message: Message): { mentions: MessageMentionMetadata[]; mentionAll: boolean } {
  const metadata = metadataOf(message);
  const mentions = Array.isArray(metadata?.mentions)
    ? metadata.mentions.map((item) => {
      if (!isRecord(item)) {
        return null;
      }
      const userId = asNumber(item.user_id) ?? asNumber(item.userId) ?? asNumber(item.id);
      const name = asString(item.name) ?? asString(item.nickname) ?? asString(item.username);
      return userId && name ? { user_id: userId, name } : null;
    }).filter((item): item is MessageMentionMetadata => item !== null)
    : [];
  const elementMentions = messageElements(metadata).map((element) => {
    if (element.type !== 'at' && element.type !== 'mention') {
      return null;
    }
    const userId = asNumber(element.attrs?.id) ?? asNumber(element.attrs?.user_id) ?? asNumber(element.attrs?.userId);
    const name = asString(element.attrs?.name) ?? asString(element.attrs?.nickname) ?? asString(element.attrs?.username) ?? (userId ? `用户 ${userId}` : undefined);
    return userId && name ? { user_id: userId, name } : null;
  }).filter((item): item is MessageMentionMetadata => item !== null);
  const deduped = [...mentions, ...elementMentions].filter((mention, index, list) => list.findIndex((item) => item.user_id === mention.user_id) === index);

  return { mentions: deduped, mentionAll: metadata?.mention_all === true || metadata?.mentionAll === true || messageElements(metadata).some((element) => element.type === 'at_all' || element.type === 'mention_all') };
}

export function memberMentionName(member: ConversationMember | null, fallback: string): string {
  if (!member) {
    return fallback;
  }
  const userId = memberUserId(member);
  return member.nickname?.trim() || getDisplayName(member.user, userId ? `用户 ${userId}` : fallback);
}

export function messageElements(metadata: Record<string, unknown> | null | undefined): Array<{ type: string; attrs?: Record<string, unknown>; content?: string }> {
  const rawElements = isRecord(metadata) && Array.isArray(metadata.elements) ? metadata.elements : [];
  const elements: Array<{ type: string; attrs?: Record<string, unknown>; content?: string }> = [];
  rawElements.forEach((item) => {
    if (!isRecord(item)) {
      return;
    }
    const type = asString(item.type) ?? asString(item.name);
    if (!type) {
      return;
    }
    elements.push({
      type: type.toLowerCase().replace(/-/g, '_'),
      attrs: isRecord(item.attrs) ? item.attrs : undefined,
      content: asString(item.content)
    });
  });
  return elements;
}

export function featuredItemMessage(item: FeaturedMessageItem): Message | null {
  if (isRecord(item) && isRecord(item.message)) {
    return item.message as unknown as Message;
  }
  return isRecord(item) && typeof item.id === 'number' && typeof item.content === 'string' ? item as unknown as Message : null;
}

export function displayNameFromValue(value: unknown): string | null {
  if (typeof value === 'string') {
    return value.trim() || null;
  }
  if (isRecord(value)) {
    return asString(value.nickname)?.trim() || asString(value.username)?.trim() || asString(value.name)?.trim() || null;
  }
  return null;
}

export function groupShareCardOf(message: Message): GroupShareCardMetadata | null {
  const metadata = metadataOf(message);
  const card = metadata?.share_card;
  if (!isRecord(card) || card.type !== 'group' || typeof card.conversation_id !== 'number' || typeof card.title !== 'string') {
    return null;
  }
  return {
    type: 'group',
    conversation_id: card.conversation_id,
    title: card.title,
    avatar_url: typeof card.avatar_url === 'string' ? card.avatar_url : null,
    description: typeof card.description === 'string' ? card.description : null,
    category: typeof card.category === 'string' ? card.category : null,
    member_count: typeof card.member_count === 'number' ? card.member_count : undefined,
    join_mode: card.join_mode === 'approval' || card.join_mode === 'invite_only' || card.join_mode === 'open' ? card.join_mode : null,
    auto_approve: typeof card.auto_approve === 'boolean' ? card.auto_approve : undefined,
    invite_token: typeof card.invite_token === 'string' ? card.invite_token : undefined,
    invite_url: typeof card.invite_url === 'string' ? card.invite_url : undefined
  };
}

export function postShareCardOf(message: Message): PostShareCardMetadata | null {
  const metadata = metadataOf(message);
  const card = metadata?.share_card;
  if (!isRecord(card) || card.type !== 'post' || typeof card.post_id !== 'number' || typeof card.author_id !== 'number' || typeof card.author_name !== 'string') {
    return null;
  }
  return {
    type: 'post',
    post_id: card.post_id,
    author_id: card.author_id,
    author_name: card.author_name,
    author_avatar_url: typeof card.author_avatar_url === 'string' ? card.author_avatar_url : null,
    content: typeof card.content === 'string' ? card.content : null,
    image_urls: Array.isArray(card.image_urls) ? card.image_urls.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [],
    ccw_creations: Array.isArray(card.ccw_creations) ? card.ccw_creations.filter((item): item is CcwCreationPreview => isRecord(item) && typeof item.oid === 'string' && typeof item.title === 'string' && typeof item.url === 'string') : [],
    created_at: typeof card.created_at === 'string' ? card.created_at : undefined
  };
}

export function botShareCardOf(message: Message): BotShareCardMetadata | null {
  const metadata = metadataOf(message);
  const card = metadata?.share_card;
  if (!isRecord(card) || card.type !== 'bot' || typeof card.bot_id !== 'number' || typeof card.user_id !== 'number' || typeof card.name !== 'string') {
    return null;
  }
  return {
    type: 'bot',
    bot_id: card.bot_id,
    user_id: card.user_id,
    name: card.name,
    avatar_url: typeof card.avatar_url === 'string' ? card.avatar_url : null,
    description: typeof card.description === 'string' ? card.description : null,
    commands: typeof card.commands === 'string' ? card.commands : null,
    rating_average: typeof card.rating_average === 'number' ? card.rating_average : null,
    review_count: typeof card.review_count === 'number' ? card.review_count : undefined,
    install_count: typeof card.install_count === 'number' ? card.install_count : undefined,
    online: typeof card.online === 'boolean' ? card.online : undefined
  };
}

export function userShareCardOf(message: Message): UserShareCardMetadata | null {
  const metadata = metadataOf(message);
  const card = metadata?.share_card;
  if (!isRecord(card) || card.type !== 'user' || typeof card.user_id !== 'number' || typeof card.name !== 'string') {
    return null;
  }
  return {
    type: 'user',
    user_id: card.user_id,
    name: card.name,
    username: typeof card.username === 'string' ? card.username : null,
    avatar_url: typeof card.avatar_url === 'string' ? card.avatar_url : null,
    bio: typeof card.bio === 'string' ? card.bio : null,
    profile_title: typeof card.profile_title === 'string' ? card.profile_title : null,
    profile_tagline: typeof card.profile_tagline === 'string' ? card.profile_tagline : null,
    profile_status: typeof card.profile_status === 'string' ? card.profile_status : null,
    ccw_name: typeof card.ccw_name === 'string' ? card.ccw_name : null,
    ccw_avatar_url: typeof card.ccw_avatar_url === 'string' ? card.ccw_avatar_url : null,
    ccw_student_oid: typeof card.ccw_student_oid === 'string' ? card.ccw_student_oid : null
  };
}

export function teamupShareCardOf(message: Message): TeamupShareCardMetadata | null {
  const metadata = metadataOf(message);
  const card = metadata?.share_card;
  if (!isRecord(card) || card.type !== 'teamup' || typeof card.profile_id !== 'number' || typeof card.user_id !== 'number' || typeof card.name !== 'string') {
    return null;
  }
  const skills = Array.isArray(card.skills) ? card.skills.filter((item): item is TeamupSkill => typeof item === 'string') : [];
  const lookingFor = Array.isArray(card.looking_for) ? card.looking_for.filter((item): item is TeamupSkill => typeof item === 'string') : [];
  return {
    type: 'teamup',
    profile_id: card.profile_id,
    user_id: card.user_id,
    name: card.name,
    avatar_url: typeof card.avatar_url === 'string' ? card.avatar_url : null,
    headline: typeof card.headline === 'string' ? card.headline : null,
    status: card.status === 'recruiting' || card.status === 'closed' ? card.status : null,
    skills,
    looking_for: lookingFor,
    creation_count: typeof card.creation_count === 'number' ? card.creation_count : 0,
    cover_url: typeof card.cover_url === 'string' ? card.cover_url : null
  };
}

export function taskShareCardOf(message: Message): TaskShareCardMetadata | null {
  const metadata = metadataOf(message);
  const card = metadata?.share_card;
  if (!isRecord(card) || card.type !== 'task' || typeof card.task_id !== 'number' || typeof card.title !== 'string') {
    return null;
  }
  return card as unknown as TaskShareCardMetadata;
}

export function taskEventCardOf(message: Message): TaskEventCardMetadata | null {
  const metadata = metadataOf(message);
  const event = metadata?.task_event;
  if (!isRecord(event) || typeof event.task_id !== 'number' || typeof event.title !== 'string') {
    return null;
  }
  return event as unknown as TaskEventCardMetadata;
}

export function reactionUserNames(reaction: MessageReactionSummary): string[] {
  if (Array.isArray(reaction.users)) {
    return reaction.users.map((user) => getDisplayName(user, `用户 ${user.id}`)).filter(Boolean);
  }
  if (Array.isArray(reaction.names)) {
    return reaction.names.map(displayNameFromValue).filter((name): name is string => Boolean(name));
  }
  if (Array.isArray(reaction.user_names)) {
    return reaction.user_names.map(displayNameFromValue).filter((name): name is string => Boolean(name));
  }
  return [];
}

export function pickSnapshotArray(metadata: Record<string, unknown> | null): unknown[] {
  if (!metadata) {
    return [];
  }

  for (const key of ['snapshots', 'messages', 'items', 'forwarded_messages']) {
    const value = metadata[key];
    if (Array.isArray(value)) {
      return value;
    }
  }

  return [];
}

export function snapshotSenderName(snapshot: Record<string, unknown>): string {
  const sender = isRecord(snapshot.sender) ? snapshot.sender : null;
  const senderId = asNumber(snapshot.sender_id) ?? asNumber(snapshot.user_id);
  return asString(snapshot.sender_name)
    ?? asString(snapshot.sender_display_name)
    ?? asString(snapshot.author_name)
    ?? (sender ? asString(sender.nickname) ?? asString(sender.username) : undefined)
    ?? (senderId ? `用户 ${senderId}` : '未知用户');
}

export function parseForwardSnapshot(value: unknown): ForwardBundleSnapshot | null {
  if (!isRecord(value)) {
    return null;
  }
  const sender = isRecord(value.sender) ? value.sender : null;

  return {
    id: asNumber(value.id) ?? asNumber(value.message_id),
    senderId: asNumber(value.sender_id) ?? asNumber(value.user_id),
    senderName: snapshotSenderName(value),
    senderAvatarUrl: resolveAssetUrl(asString(value.sender_avatar_url) ?? asString(value.senderAvatarUrl) ?? asString(value.avatar_url) ?? (sender ? asString(sender.avatar_url) : undefined)),
    type: knownMessageType(value.type),
    content: asString(value.content) ?? asString(value.text) ?? asString(value.url) ?? '',
    createdAt: asString(value.created_at) ?? asString(value.time),
    metadata: isRecord(value.metadata) ? value.metadata : null
  };
}

export function parseForwardBundle(message: Message): ForwardBundleData {
  const metadata = metadataOf(message);
  const snapshots = pickSnapshotArray(metadata).map(parseForwardSnapshot).filter((snapshot): snapshot is ForwardBundleSnapshot => snapshot !== null);
  const sourceType = asString(metadata?.source_conversation_type) ?? asString(metadata?.conversation_type);
  const title = asString(metadata?.title) ?? asString(metadata?.source_title) ?? asString(metadata?.sourceTitle) ?? (sourceType === 'direct' ? '聊天记录' : '群聊的聊天记录');
  const count = asNumber(metadata?.count) ?? asNumber(metadata?.message_count) ?? asNumber(metadata?.total) ?? snapshots.length;
  const note = asString(metadata?.note);

  return {
    title,
    note,
    count: count > 0 ? count : snapshots.length,
    snapshots
  };
}

export function formatMessageTime(value?: string | null): string {
  return formatMessageDateTime(value);
}

export function shouldShowTimeDivider(current: Message, previous?: Message): boolean {
  const currentDate = parseApiDate(current.created_at);
  if (!currentDate) {
    return false;
  }
  const previousDate = previous ? parseApiDate(previous.created_at) : null;
  return !previousDate || currentDate.getTime() - previousDate.getTime() >= 15 * 60 * 1000;
}

export function truncateText(value: string, maxLength = 120): string {
  const cleanValue = value.replace(/\s+/g, ' ').trim();
  return cleanValue.length > maxLength ? `${cleanValue.slice(0, maxLength)}...` : cleanValue;
}

export function isBotMarkdownMessage(message: Message): boolean {
  if (!message.sender?.is_bot || message.type !== 'text') {
    return false;
  }
  if (message.metadata?.markdown === true) {
    return true;
  }
  return messageElements(message.metadata).some((element) => element.type === 'markdown' || element.type === 'md');
}

export function botMarkdownContent(message: Message): string {
  const markdownElements = messageElements(message.metadata).filter((element) => element.type === 'markdown' || element.type === 'md');
  if (markdownElements.length > 0) {
    return markdownElements.map((element) => element.content ?? '').filter(Boolean).join('\n');
  }
  return message.content;
}

export function isBotRenderableElementType(type: string): boolean {
  return type === 'text' || type === 'plain' || type === 'at' || type === 'mention' || type === 'at_all' || type === 'mention_all' || type === 'markdown' || type === 'md' || type === 'br' || type === 'button' || type === 'btn' || type === 'link';
}

export function hasBotRenderableElements(message: Message): boolean {
  return Boolean(message.sender?.is_bot && message.type === 'text' && messageElements(message.metadata).some((element) => isBotRenderableElementType(element.type)));
}

export function botComponentState(message: Message | undefined, componentId?: string): MessageComponentState | undefined {
  if (!message || !componentId) {
    return undefined;
  }
  return message.metadata?.component_state?.[componentId];
}

export function snapshotPreview(snapshot: ForwardBundleSnapshot): string {
  if (snapshot.type === 'image') {
    return `[图片]${snapshot.content ? ` ${snapshot.content}` : ''}`;
  }
  if (snapshot.type === 'voice') {
    return voicePreviewLabel(snapshot);
  }
  if (snapshot.type === 'forward_bundle') {
    return '[转发消息]';
  }
  const images = metadataImages(snapshot.metadata);
  if (images.length > 0) {
    const prefix = images.length > 1 ? `[图片] ${images.length}张图片` : '[图片]';
    return snapshot.content ? `${prefix} ${snapshot.content}` : prefix;
  }
  return snapshot.content || '[空消息]';
}

export function messagePreview(message: Message): string {
  if (message.recalled_at) {
    return '消息已撤回';
  }
  if (message.type === 'system') {
    return message.content || '系统消息';
  }
  if (message.type === 'image') {
    return '[图片]';
  }
  if (message.type === 'voice') {
    return voicePreviewLabel(message);
  }
  if (message.type === 'forward_bundle') {
    const bundle = parseForwardBundle(message);
    return `[转发消息] ${bundle.title}${bundle.count ? `（${bundle.count}条）` : ''}`;
  }
  if (postShareCardOf(message)) {
    return '[动态卡片]';
  }
  if (userShareCardOf(message)) {
    return '[个人名片]';
  }
  if (teamupShareCardOf(message)) {
    return '[组队名片]';
  }
  const images = messageImageUrls(message);
  if (images.length > 0) {
    const prefix = images.length > 1 ? `[图片] ${images.length}张图片` : '[图片]';
    return message.content ? `${prefix} ${message.content}` : prefix;
  }
  return message.content || '[空消息]';
}

export function messageSenderLabel(message: Message): string {
  const displayName = message.sender_display_name?.trim();
  if (displayName) {
    return displayName;
  }
  const senderId = message.sender_id ?? message.sender?.id;
  return getDisplayName(message.sender, senderId ? `用户 ${senderId}` : '未知用户');
}

export function forwardBundleCopyText(message: Message): string {
  const bundle = parseForwardBundle(message);
  const lines = [bundle.title];
  if (bundle.note) {
    lines.push(`备注：${bundle.note}`);
  }
  if (bundle.snapshots.length > 0) {
    lines.push(...bundle.snapshots.map((snapshot) => `${snapshot.senderName}：${snapshotPreview(snapshot)}`));
  } else if (message.content) {
    lines.push(message.content);
  }
  return lines.join('\n');
}

export function messageCopyText(message: Message): string {
  if (message.type === 'forward_bundle') {
    return forwardBundleCopyText(message);
  }
  if (message.type === 'image') {
    return message.content;
  }
  if (message.type === 'voice') {
    return message.content;
  }
  const images = messageImageUrls(message);
  if (images.length === 0) {
    return message.content;
  }
  const parts = [message.content.trim(), ...images].filter(Boolean);
  return parts.join('\n');
}

export function messageReadableLine(message: Message): string {
  const time = formatMessageTime(message.created_at);
  const prefix = time ? `${messageSenderLabel(message)} ${time}` : messageSenderLabel(message);
  return `${prefix}：${messagePreview(message)}`;
}

/** 一条消息能不能被「+1」复读出去；不能则返回 null。 */
export function repeatableContentOf(message: Message | undefined | null): string | null {
  if (!message || message.type !== 'text' || message.recalled_at) {
    return null;
  }
  // 机器人的 Markdown / 交互元素复读出去只剩一堆标签，没有意义
  if (hasBotRenderableElements(message) || isBotMarkdownMessage(message)) {
    return null;
  }
  const text = (message.content ?? '').trim();
  if (!text || text.length > REPEAT_MAX_LENGTH) {
    return null;
  }
  return text;
}

export function conversationDisplayTitle(conversation: Conversation, currentUser: User): string {
  const displayTitle = conversation.display_title?.trim();
  if (conversation.type === 'group') {
    const title = displayTitle || conversation.title || '未命名群聊';
    return `${title} (${conversation.member_count ?? 0})`;
  }

  if (displayTitle) {
    return displayTitle;
  }

  const directMember = conversation.members?.find((member) => member.user_id !== currentUser.id)?.user;
  return getDisplayName(conversation.direct_user ?? directMember, conversation.title || '私聊');
}

export function conversationMobileTitleParts(conversation: Conversation, currentUser: User): { name: string; suffix: string } {
  if (conversation.type === 'group') {
    const name = conversation.display_title?.trim() || conversation.title?.trim() || '未命名群聊';
    return { name, suffix: `(${conversation.member_count ?? 0})` };
  }
  return { name: conversationDisplayTitle(conversation, currentUser), suffix: '' };
}

export function ccwCreationPreviewsFromMetadata(metadata?: MessageMetadata | Record<string, unknown> | null): CcwCreationPreview[] {
  const items = metadata?.ccw_creations;
  return Array.isArray(items) ? items.filter((item): item is CcwCreationPreview => isRecord(item) && typeof item.oid === 'string' && typeof item.title === 'string' && typeof item.url === 'string') : [];
}

export function normalizeVoiceDuration(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 && value < 60 * 60 ? value : fallback;
}

export function defaultVoiceWaveform(count = 28): number[] {
  return Array.from({ length: count }, (_, index) => 0.24 + Math.abs(Math.sin(index * 0.72)) * 0.58);
}

export function messageListPreviewText(message: Message): string {
  if (message.type === 'image') {
    return '[图片]';
  }
  if (message.type === 'voice') {
    return voicePreviewLabel(message);
  }
  if (message.type === 'forward_bundle') {
    return messagePreview(message);
  }
  return truncateText(message.content || '[空消息]', 90);
}

export function fieldText(value?: string | null): string {
  return value?.trim().toLowerCase() ?? '';
}

export function matchesMember(member: ConversationMember, keyword: string): boolean {
  const user = member.user;
  const userId = memberUserId(member);
  const label = userId ? `用户 ${userId}` : '成员';
  return [
    member.nickname,
    member.remark,
    getDisplayName(user, label),
    user?.username,
    user?.nickname,
    user?.bio,
    user?.email
  ].map(fieldText).join(' ').includes(keyword);
}
