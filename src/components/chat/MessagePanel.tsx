import { createPortal } from 'react-dom';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';
import { blockTemporaryConversation, closeTemporaryConversation, createDirectConversation, getConversationMember, removeConversationMember, searchConversationMembers, updateConversationMemberMute, updateConversationMemberRole, updateConversationMemberTitle } from '@/api/conversations';
import { addFavoriteSticker, deleteMessageLocal, forwardMessageBundle, getFavoriteStickers, getFeaturedMessages, getMessageContext, getMessages, markConversationRead, recallMessage, removeFavoriteSticker, searchConversationMessages, sendMessage, toggleMessageBookmark, toggleMessageFeature, toggleMessageReaction, triggerMessageInteraction, uploadMessageImage, uploadMessageVoice, type FavoriteStickerItem, type FeaturedMessageItem, type MessageInteractionPayload } from '@/api/messages';
import { acceptInvite } from '@/api/invites';
import { isRecord } from '@/api/normalizers';
import { createReport } from '@/api/reports';
import { sendFriendRequest } from '@/api/friends';
import { API_ORIGIN } from '@/config';
import { useKukeStore } from '@/store/kukeStore';
import type { BookmarkedMessageRead, BotShareCardMetadata, Conversation, ConversationMember, CcwCreationPreview, CreateReportPayload, Friendship, GroupShareCardMetadata, MemberRole, Message, MessageComponentState, MessageMentionMetadata, MessageMetadata, MessageQuoteMetadata, MessageReactionSummary, MessageType, PostShareCardMetadata, ReportTargetType, TaskEventCardMetadata, TaskShareCardMetadata, TeamupShareCardMetadata, TeamupSkill, User, UserShareCardMetadata } from '@/types/api';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { Icon, type IconName } from '@/components/ui/Icon';
import { ContextMenuItem, ContextMenuSurface } from '@/components/ui/ContextMenu';
import { UserCard } from '@/components/ui/UserCard';
import { CcwCreationCard } from '@/components/ui/CcwCreationCard';
import { ImageViewer, type ImageViewerState } from '@/components/ui/ImageViewer';
import { MobileUserProfilePage, type ProfileAction } from '@/components/ui/MobileUserProfilePage';
import { TaskShareCard } from '@/components/tasks/TaskShareCard';
import { TaskEventCard } from '@/components/tasks/TaskEventCard';
import { TaskEditorModal } from '@/components/tasks/TaskEditorModal';
import { TaskDetailPanel } from '@/components/tasks/TaskDetailPanel';
import { GroupTasksPanel } from '@/components/tasks/GroupTasksPanel';
import { getUserOnlineStatus } from '@/api/users';
import { getOutgoingFriendRequests } from '@/api/friends';
import { resolveAssetUrl, resolveThumbnailUrl } from '@/utils/assetUrl';
import { applyLatestMessageToConversations } from '@/utils/conversations';
import { hasPendingOutgoingFriendRequest, isFriendUserId } from '@/utils/friendship';
import { formatMessageDateTime, formatMessageDividerTime, parseApiDate } from '@/utils/dateTime';
import { ChatInfoDrawer } from './ChatInfoDrawer';
import { AnnouncementModal } from './AnnouncementModal';
import { ReportModal } from './ReportModal';
import { MobileStatusBar } from '@/components/mobile/MobileChrome';
import { isNativeMobileApp } from '@/utils/appMode';
import { registerNativeBackHandler } from '@/native/back';
import { runNativeRouteTransition } from '@/native/transition';

interface MessagePanelProps {
  conversations: Conversation[];
  currentUser: User;
  currentRole?: MemberRole;
  members?: ConversationMember[];
  friends?: Friendship[];
  membersLoading?: boolean;
  membersHasMore?: boolean;
  membersLoadingMore?: boolean;
  isMobile?: boolean;
  mobileBackUnreadCount?: number;
  onMembersNeeded?: () => void;
  onLoadMoreMembers?: () => void;
  onMemberSearchChange?: (keyword: string) => void;
  onOpenPost?: (postId: number) => void;
  onBack?: () => void;
}

interface MessageMenuState {
  message: Message;
  left: number;
  top: number;
  clickedImageUrl?: string | null;
}

interface MemberMenuState {
  member: ConversationMember;
  left: number;
  top: number;
  loading?: boolean;
}

interface MemberMuteStatus {
  muted: boolean;
  muted_until: string | null;
}

interface ToastState {
  id: number;
  message: string;
  tone?: 'info' | 'error';
  exiting?: boolean;
}

interface BotInteraction {
  kind: 'button' | 'link';
  action: 'callback' | 'input' | 'open';
  componentId?: string;
  label: string;
  actionId?: string;
  value?: string;
  href?: string;
  elementIndex?: number;
  state?: MessageComponentState;
}

interface CardState {
  user?: User | null;
  label?: string;
  anchor: OverlayPosition;
}

interface UserProfilePageState {
  user?: User | null;
  label?: string;
  fallbackUserId?: number;
  member?: ConversationMember | null;
}

interface ForwardTargetState {
  messageIds: number[];
}

interface ReportTargetState {
  targetType: ReportTargetType;
  targetId: number;
  targetLabel: string;
  conversationId?: number;
  messageId?: number;
  reportedUserId?: number;
}

interface ReactionPickerState {
  message: Message;
  left: number;
  top: number;
}

interface MentionPickerState {
  query: string;
  range: Range | null;
  open: boolean;
}

const MAX_IMAGE_UPLOAD_BYTES = 3 * 1024 * 1024;
const MAX_VOICE_UPLOAD_BYTES = 2 * 1024 * 1024;
const MAX_VOICE_RECORDING_MS = 3 * 60 * 1000;
const MOBILE_VOICE_CANCEL_DISTANCE = 56;
const MAX_MESSAGE_CONTENT_LENGTH = 2000;

function formatBytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

interface ForwardBundleSnapshot {
  id?: number;
  senderId?: number;
  senderName: string;
  senderAvatarUrl?: string;
  type: MessageType;
  content: string;
  createdAt?: string;
  metadata?: Record<string, unknown> | null;
}

interface ForwardBundleData {
  title: string;
  note?: string;
  count: number;
  snapshots: ForwardBundleSnapshot[];
}

interface OverlayPosition {
  left: number;
  top: number;
}

interface StagedImage {
  id: string;
  file: File;
  previewUrl: string;
}

interface StagedVoice {
  file: File;
  previewUrl: string;
  durationMs: number;
  contentType: string;
  size: number;
  waveform: number[];
}

type EmojiPickerTab = 'emoji' | 'stickers';

interface SendMessageVariables {
  content: string;
  type: MessageType;
  metadata?: MessageMetadata;
  files?: File[];
  voiceFile?: File;
  voiceDurationMs?: number;
  voiceWaveform?: number[];
}

type MessagesInfiniteData = InfiniteData<Message[], number | undefined>;
type ConversationMembersPageData = InfiniteData<{ items: ConversationMember[] }, number | undefined>;

interface MuteMenuOption {
  label: string;
  minutes?: number;
  custom?: boolean;
}

interface CustomMuteState {
  member: ConversationMember;
  value: string;
  unit: 'minutes' | 'hours' | 'days';
}

interface ChatSearchModalProps {
  conversationId: number;
  title: string;
  mobile?: boolean;
  onOpenForwardBundle: (message: Message) => void;
  onOpenImage: (images: string[], index: number) => void;
  onJump: (messageId: number) => void;
  onClose: () => void;
}

function senderOf(message: Message): User | null | undefined {
  return message.sender;
}

function memberUserId(member: ConversationMember): number | null {
  return member.user_id ?? member.user?.id ?? null;
}

function friendshipUser(friendship: Friendship): User | null | undefined {
  return friendship.friend ?? friendship.user;
}

function resolveKnownUser(user: User | null | undefined, userId: number | null | undefined, friends: Friendship[]): User | null {
  if (user?.id) {
    return user;
  }
  if (!userId) {
    return null;
  }
  const friend = friends.map(friendshipUser).find((item) => item?.id === userId);
  return friend ?? { id: userId, username: `user-${userId}` };
}

function roleBadgeLabel(role: MemberRole): string | null {
  if (role === 'owner') {
    return '群主';
  }
  if (role === 'admin') {
    return '管理员';
  }
  return null;
}

const URL_PATTERN = /(https?:\/\/[^\s]+)/g;
const EMOJIS = ['😀', '😄', '😂', '🤣', '😊', '😍', '😘', '😎', '😭', '😡', '👍', '👎', '👏', '🙏', '💪', '🎉', '✨', '❤️', '💔', '🔥', '⭐', '🌙', '☀️', '🍀', '🐱', '🐶', '🐧', '🍉', '🍜', '🎮', '📷', '💬'];
const QUICK_REACTION_EMOJIS = ['😂', '😘', '❔', '🤔', '😡', '😭'];
const FULL_REACTION_EMOJIS = ['😀', '😃', '😄', '😁', '😂', '🤣', '😊', '😍', '😘', '😎', '😋', '😜', '🤔', '😮', '😢', '😭', '😡', '👍', '👎', '👏', '🙏', '💪', '🎉', '✨', '❤️', '🔥', '⭐', '🌙', '☀️', '🍀', '🐱', '🐶', '🐧', '🍉', '🍜', '🎮', '📷', '💬', '✅', '❌'];
const MESSAGE_MENU_WIDTH = 252;
const MESSAGE_MENU_HEIGHT = 416;
const MEMBER_MENU_WIDTH = 220;
const MEMBER_MENU_HEIGHT = 356;
const REACTION_PICKER_WIDTH = 320;
const REACTION_PICKER_HEIGHT = 320;
const FORWARD_PREVIEW_LIMIT = 3;
const MENTION_ALL_REMAINING = 20;
const WRAP_ANYWHERE_CLASS = '[overflow-wrap:anywhere]';
const MESSAGE_PAGE_SIZE = 50;
const MOBILE_ENTER_LONG_PRESS_MS = 420;
const EDITABLE_BLOCK_TAGS = new Set(['ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DIV', 'DL', 'FIELDSET', 'FIGCAPTION', 'FIGURE', 'FOOTER', 'FORM', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'HR', 'LI', 'MAIN', 'NAV', 'OL', 'P', 'PRE', 'SECTION', 'TABLE', 'UL']);
const EDITABLE_TRAILING_BREAK_TAGS = new Set(['DIV', 'P', 'LI']);
const MUTE_MENU_OPTIONS: MuteMenuOption[] = [
  { label: '10分钟', minutes: 10 },
  { label: '1小时', minutes: 60 },
  { label: '12小时', minutes: 720 },
  { label: '1天', minutes: 1440 },
  { label: '自定义时长', custom: true }
];

function editablePlainText(editor: HTMLElement): string {
  let output = '';
  const rawText = (editor.textContent ?? '').replace(/\u00a0/g, ' ').replace(/\r\n?/g, '\n');

  const appendBreak = (): void => {
    output += '\n';
  };

  const appendNode = (node: ChildNode): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      output += (node.textContent ?? '').replace(/\u00a0/g, ' ').replace(/\r\n?/g, '\n');
      return;
    }
    if (node instanceof HTMLBRElement) {
      appendBreak();
      return;
    }
    if (!(node instanceof HTMLElement)) {
      node.childNodes.forEach(appendNode);
      return;
    }

    const isBlock = EDITABLE_BLOCK_TAGS.has(node.tagName);
    if (isBlock && output && !output.endsWith('\n')) {
      appendBreak();
    }
    node.childNodes.forEach(appendNode);
    if (EDITABLE_TRAILING_BREAK_TAGS.has(node.tagName) && output && !output.endsWith('\n')) {
      appendBreak();
    }
  };

  editor.childNodes.forEach(appendNode);

  let text = output.replace(/\u00a0/g, ' ').replace(/\r\n?/g, '\n');
  if (!rawText.trim() && !text.trim()) {
    return '';
  }
  if (text.endsWith('\n') && !rawText.endsWith('\n')) {
    text = text.slice(0, -1);
  }
  return text;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function knownMessageType(value: unknown): MessageType {
  return value === 'image' || value === 'voice' || value === 'forward_bundle' || value === 'system' ? value : 'text';
}

function finiteNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function formatVoiceDuration(durationMs?: number | null): string {
  const totalSeconds = Math.max(0, Math.round(finiteNumber(durationMs, 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function voiceMetadataOf(message: Message | ForwardBundleSnapshot): { durationMs?: number; contentType?: string; size?: number; waveform?: number[] } {
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

function voicePreviewLabel(message: Message | ForwardBundleSnapshot): string {
  const durationMs = voiceMetadataOf(message).durationMs;
  return durationMs ? `[语音] ${formatVoiceDuration(durationMs)}` : '[语音]';
}

function metadataImages(value: unknown): string[] {
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

function messageImageUrls(message: Message): string[] {
  return message.type === 'image' ? [message.content] : metadataImages(message.metadata);
}

function isGifAssetUrl(value?: string | null): boolean {
  if (!value) {
    return false;
  }
  try {
    return new URL(value, 'https://kukechat.local').pathname.toLowerCase().endsWith('.gif');
  } catch {
    return value.split('?')[0].split('#')[0].trim().toLowerCase().endsWith('.gif');
  }
}

function resolveMessageImagePreviewUrl(value?: string | null): string | undefined {
  const original = resolveAssetUrl(value);
  if (!original) {
    return undefined;
  }
  return isGifAssetUrl(value) ? original : resolveThumbnailUrl(value);
}

function isStickerMessage(message: Message): boolean {
  const metadata = metadataOf(message);
  const content = message.type === 'image' ? message.content : '';
  const hasStickerElement = messageElements(metadata).some((element) => element.type === 'sticker' || element.type === 'face');
  return metadata?.sticker === true || hasStickerElement || /\/uploads\/stickers\//.test(content) || /\/stickers\//.test(content);
}

function metadataOf(message: Message): Record<string, unknown> | null {
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

function quoteMetadataOf(message: Message): MessageQuoteMetadata | null {
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

function mentionMetadataOf(message: Message): { mentions: MessageMentionMetadata[]; mentionAll: boolean } {
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


function memberMentionName(member: ConversationMember | null, fallback: string): string {
  if (!member) {
    return fallback;
  }
  const userId = memberUserId(member);
  return member.nickname?.trim() || getDisplayName(member.user, userId ? `用户 ${userId}` : fallback);
}

function messageElements(metadata: Record<string, unknown> | null | undefined): Array<{ type: string; attrs?: Record<string, unknown>; content?: string }> {
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

function featuredItemMessage(item: FeaturedMessageItem): Message | null {
  if (isRecord(item) && isRecord(item.message)) {
    return item.message as unknown as Message;
  }
  return isRecord(item) && typeof item.id === 'number' && typeof item.content === 'string' ? item as unknown as Message : null;
}

function displayNameFromValue(value: unknown): string | null {
  if (typeof value === 'string') {
    return value.trim() || null;
  }
  if (isRecord(value)) {
    return asString(value.nickname)?.trim() || asString(value.username)?.trim() || asString(value.name)?.trim() || null;
  }
  return null;
}

function groupShareCardOf(message: Message): GroupShareCardMetadata | null {
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

function postShareCardOf(message: Message): PostShareCardMetadata | null {
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


function botShareCardOf(message: Message): BotShareCardMetadata | null {
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

function userShareCardOf(message: Message): UserShareCardMetadata | null {
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

function teamupShareCardOf(message: Message): TeamupShareCardMetadata | null {
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

function taskShareCardOf(message: Message): TaskShareCardMetadata | null {
  const metadata = metadataOf(message);
  const card = metadata?.share_card;
  if (!isRecord(card) || card.type !== 'task' || typeof card.task_id !== 'number' || typeof card.title !== 'string') {
    return null;
  }
  return card as unknown as TaskShareCardMetadata;
}

function taskEventCardOf(message: Message): TaskEventCardMetadata | null {
  const metadata = metadataOf(message);
  const event = metadata?.task_event;
  if (!isRecord(event) || typeof event.task_id !== 'number' || typeof event.title !== 'string') {
    return null;
  }
  return event as unknown as TaskEventCardMetadata;
}

function reactionUserNames(reaction: MessageReactionSummary): string[] {
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

function pickSnapshotArray(metadata: Record<string, unknown> | null): unknown[] {
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

function snapshotSenderName(snapshot: Record<string, unknown>): string {
  const sender = isRecord(snapshot.sender) ? snapshot.sender : null;
  const senderId = asNumber(snapshot.sender_id) ?? asNumber(snapshot.user_id);
  return asString(snapshot.sender_name)
    ?? asString(snapshot.sender_display_name)
    ?? asString(snapshot.author_name)
    ?? (sender ? asString(sender.nickname) ?? asString(sender.username) : undefined)
    ?? (senderId ? `用户 ${senderId}` : '未知用户');
}

function parseForwardSnapshot(value: unknown): ForwardBundleSnapshot | null {
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

function parseForwardBundle(message: Message): ForwardBundleData {
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

function formatMessageTime(value?: string | null): string {
  return formatMessageDateTime(value);
}

function shouldShowTimeDivider(current: Message, previous?: Message): boolean {
  const currentDate = parseApiDate(current.created_at);
  if (!currentDate) {
    return false;
  }
  const previousDate = previous ? parseApiDate(previous.created_at) : null;
  return !previousDate || currentDate.getTime() - previousDate.getTime() >= 15 * 60 * 1000;
}

function MessageTimeDivider({ value }: { value?: string | null }): JSX.Element | null {
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

function truncateText(value: string, maxLength = 120): string {
  const cleanValue = value.replace(/\s+/g, ' ').trim();
  return cleanValue.length > maxLength ? `${cleanValue.slice(0, maxLength)}...` : cleanValue;
}

function isBotMarkdownMessage(message: Message): boolean {
  if (!message.sender?.is_bot || message.type !== 'text') {
    return false;
  }
  if (message.metadata?.markdown === true) {
    return true;
  }
  return messageElements(message.metadata).some((element) => element.type === 'markdown' || element.type === 'md');
}

function botMarkdownContent(message: Message): string {
  const markdownElements = messageElements(message.metadata).filter((element) => element.type === 'markdown' || element.type === 'md');
  if (markdownElements.length > 0) {
    return markdownElements.map((element) => element.content ?? '').filter(Boolean).join('\n');
  }
  return message.content;
}


function isBotRenderableElementType(type: string): boolean {
  return type === 'text' || type === 'plain' || type === 'at' || type === 'mention' || type === 'at_all' || type === 'mention_all' || type === 'markdown' || type === 'md' || type === 'br' || type === 'button' || type === 'btn' || type === 'link';
}


function hasBotRenderableElements(message: Message): boolean {
  return Boolean(message.sender?.is_bot && message.type === 'text' && messageElements(message.metadata).some((element) => isBotRenderableElementType(element.type)));
}


function botComponentState(message: Message | undefined, componentId?: string): MessageComponentState | undefined {
  if (!message || !componentId) {
    return undefined;
  }
  return message.metadata?.component_state?.[componentId];
}

function renderBotElementContent(message: Message, mentionData: { mentions: MessageMentionMetadata[]; mentionAll: boolean }, onInteract?: (interaction: BotInteraction) => void): JSX.Element {
  const elements = messageElements(message.metadata).filter((element) => isBotRenderableElementType(element.type));
  if (elements.length === 0) {
    return isBotMarkdownMessage(message) ? renderSafeBotMarkdown(botMarkdownContent(message), onInteract, message) : <>{renderMentionedText(message.content, mentionData)}</>;
  }
  const nodes: JSX.Element[] = [];
  let interactionGroup: BotInteraction[] = [];

  function flushInteractionGroup(key: string): void {
    if (interactionGroup.length === 0) {
      return;
    }
    nodes.push(renderBotInteractionGroup(interactionGroup, key, onInteract));
    interactionGroup = [];
  }

  elements.forEach((element, index) => {
    if (element.type === 'markdown' || element.type === 'md') {
      flushInteractionGroup(`interactions-before-md-${index}`);
      nodes.push(<div key={`md-${index}`} className="my-1">{renderSafeBotMarkdown(element.content ?? '', onInteract, message)}</div>);
      return;
    }
    if (element.type === 'button' || element.type === 'btn' || element.type === 'link') {
      const interaction = botInteractionFromAttrs(element.type === 'link' ? 'link' : 'button', element.attrs, element.content ?? '', index);
      if (interaction) {
        interactionGroup.push({ ...interaction, state: botComponentState(message, interaction.componentId) });
      }
      return;
    }
    flushInteractionGroup(`interactions-before-${index}`);
    if (element.type === 'br') {
      nodes.push(<br key={`br-${index}`} />);
      return;
    }
    if (element.type === 'at_all' || element.type === 'mention_all') {
      nodes.push(<span key={`all-${index}`} className="font-semibold [color:var(--kc-accent)]">@全体成员</span>);
      return;
    }
    if (element.type === 'at' || element.type === 'mention') {
      const userId = asNumber(element.attrs?.id) ?? asNumber(element.attrs?.user_id) ?? asNumber(element.attrs?.userId);
      const name = asString(element.attrs?.name) ?? asString(element.attrs?.nickname) ?? asString(element.attrs?.username) ?? mentionData.mentions.find((mention) => mention.user_id === userId)?.name ?? (userId ? `用户 ${userId}` : '用户');
      nodes.push(<span key={`at-${index}`} className="font-semibold [color:var(--kc-accent)]">@{name}</span>);
      return;
    }
    nodes.push(<span key={`text-${index}`} className="whitespace-pre-wrap">{renderMentionedText(element.content ?? '', mentionData)}</span>);
  });
  flushInteractionGroup('interactions-end');
  return <div className="space-y-1">{nodes}</div>;
}

function safeMarkdownLinkUrl(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed || /[\u0000-\u001f<>"'`]/.test(trimmed)) {
    return undefined;
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

function safeMarkdownImageUrl(value: string): string | undefined {
  const resolved = resolveAssetUrl(value);
  if (!resolved) {
    return undefined;
  }
  try {
    const parsed = new URL(resolved, typeof window === 'undefined' ? API_ORIGIN : window.location.href);
    if (!/^https?:$/.test(parsed.protocol)) {
      return undefined;
    }
    const pathname = parsed.pathname.toLowerCase();
    if (!/\.(png|jpe?g|webp|gif)$/.test(pathname)) {
      return undefined;
    }
    return resolved;
  } catch {
    return undefined;
  }
}

function botInteractionFromAttrs(kind: 'button' | 'link', attrs: Record<string, unknown> | undefined, content = '', elementIndex?: number): BotInteraction | null {
  const label = (asString(attrs?.label) ?? asString(attrs?.text) ?? asString(attrs?.title) ?? content ?? '').trim() || (kind === 'button' ? '按钮' : '链接');
  const rawAction = (asString(attrs?.action) ?? asString(attrs?.type) ?? asString(attrs?.mode) ?? (kind === 'link' ? 'open' : 'callback')).trim().toLowerCase().replace(/-/g, '_');
  const action = rawAction === 'input' || rawAction === 'insert' || rawAction === 'fill' || rawAction === 'preset' || rawAction === 'text' ? 'input' : rawAction === 'open' ? 'open' : 'callback';
  const componentId = (asString(attrs?.component_id) ?? asString(attrs?.componentId) ?? asString(attrs?.button_id) ?? asString(attrs?.buttonId) ?? asString(attrs?.id))?.trim();
  const actionId = (asString(attrs?.action_id) ?? asString(attrs?.actionId) ?? asString(attrs?.id) ?? asString(attrs?.key))?.trim();
  const value = (asString(attrs?.value) ?? asString(attrs?.input) ?? asString(attrs?.command))?.trim();
  const href = (asString(attrs?.href) ?? asString(attrs?.url))?.trim();
  if (action === 'input' && !value) {
    return null;
  }
  if (action === 'callback' && !actionId) {
    return null;
  }
  if (action === 'open' && (!href || !safeMarkdownLinkUrl(href))) {
    return null;
  }
  return { kind, action, componentId, label: label.slice(0, 80), actionId, value, href, elementIndex };
}

function decodeBotInlineEntity(value: string): string {
  return value.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

function parseBotInlineAttrs(raw: string): Record<string, string | boolean> {
  const attrs: Record<string, string | boolean> = {};
  const pattern = /([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(raw)) !== null) {
    const key = match[1]?.trim();
    if (!key) {
      continue;
    }
    const value = match[2] ?? match[3] ?? match[4];
    attrs[key] = value === undefined ? true : decodeBotInlineEntity(value);
  }
  return attrs;
}

function botInteractionFromMarkdownTag(tag: string, rawAttrs: string, rawContent: string | undefined): BotInteraction | null {
  const kind = tag.toLowerCase() === 'link' ? 'link' : 'button';
  const attrs = parseBotInlineAttrs(rawAttrs);
  const content = decodeBotInlineEntity(rawContent ?? '').trim();
  const label = (asString(attrs.label) ?? asString(attrs.text) ?? asString(attrs.title) ?? content).trim() || (kind === 'button' ? '按钮' : '链接');
  const rawAction = (asString(attrs.action) ?? asString(attrs.type) ?? asString(attrs.mode) ?? (kind === 'link' ? 'open' : 'callback')).trim().toLowerCase().replace(/-/g, '_');
  const action = rawAction === 'input' || rawAction === 'insert' || rawAction === 'fill' || rawAction === 'preset' || rawAction === 'text' ? 'input' : rawAction === 'open' ? 'open' : 'callback';
  const componentId = (asString(attrs.component_id) ?? asString(attrs.componentId) ?? asString(attrs.button_id) ?? asString(attrs.buttonId) ?? asString(attrs.id))?.trim();
  const actionId = (asString(attrs.action_id) ?? asString(attrs.actionId) ?? asString(attrs.id) ?? asString(attrs.key) ?? asString(attrs.value) ?? label)?.trim();
  const value = (asString(attrs.value) ?? asString(attrs.input) ?? asString(attrs.command) ?? label)?.trim();
  const href = (asString(attrs.href) ?? asString(attrs.url))?.trim();
  if (action === 'input' && !value) {
    return null;
  }
  if (action === 'callback' && !actionId) {
    return null;
  }
  if (action === 'open' && (!href || !safeMarkdownLinkUrl(href))) {
    return null;
  }
  return { kind, action, componentId, label: label.slice(0, 80), actionId, value, href };
}

function interactionPayload(interaction: BotInteraction): MessageInteractionPayload {
  return {
    kind: interaction.kind,
    action: interaction.action,
    component_id: interaction.componentId ?? null,
    action_id: interaction.actionId ?? null,
    value: interaction.value ?? null,
    href: interaction.href ?? null,
    label: interaction.label,
    element_index: interaction.elementIndex ?? null
  };
}

function botInteractionDisplay(interaction: BotInteraction): BotInteraction {
  return interaction.state ? { ...interaction, label: interaction.state.label ?? interaction.label } : interaction;
}

function botInteractionStyle(interaction: BotInteraction): CSSProperties | undefined {
  const state = interaction.state;
  if (!state) {
    return undefined;
  }
  const variantColors: Record<string, { borderColor: string; color: string; backgroundColor?: string }> = {
    success: { borderColor: '#22c55e', color: '#16a34a', backgroundColor: 'rgba(34,197,94,0.08)' },
    danger: { borderColor: '#ef4444', color: '#dc2626', backgroundColor: 'rgba(239,68,68,0.08)' },
    warning: { borderColor: '#f59e0b', color: '#d97706', backgroundColor: 'rgba(245,158,11,0.08)' },
    primary: { borderColor: '#0a84ff', color: '#0a84ff', backgroundColor: 'rgba(10,132,255,0.08)' }
  };
  const variant = state.variant && state.variant !== 'default' ? variantColors[state.variant] : undefined;
  return {
    borderColor: state.border_color ?? variant?.borderColor,
    color: state.text_color ?? variant?.color,
    backgroundColor: state.background_color ?? variant?.backgroundColor,
    opacity: state.disabled ? 0.72 : undefined,
    cursor: state.disabled ? 'not-allowed' : undefined
  };
}

function renderBotInteraction(interaction: BotInteraction, key: string, onInteract?: (interaction: BotInteraction) => void): JSX.Element {
  const display = botInteractionDisplay(interaction);
  const style = botInteractionStyle(display);
  if (display.action === 'open' && display.href) {
    return <a key={key} href={display.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg px-1 font-medium [color:var(--kc-accent)] hover:underline" style={style}>{display.label}</a>;
  }
  const buttonClass = display.kind === 'button'
    ? 'my-1 mr-1 inline-flex max-w-full items-center justify-center rounded-xl border px-3 py-1.5 text-sm font-semibold transition hover:-translate-y-0.5 hover:shadow-sm [background:var(--kc-panel)] [border-color:var(--kc-border)] [color:var(--kc-text)]'
    : 'inline-flex items-center rounded-md px-1 font-medium [color:var(--kc-accent)] hover:underline';
  return <button key={key} type="button" className={buttonClass} style={style} disabled={display.state?.disabled} onClick={() => onInteract?.(display)}>{display.label}</button>;
}

function renderBotInteractionButton(interaction: BotInteraction, key: string, onInteract?: (interaction: BotInteraction) => void): JSX.Element {
  const display = botInteractionDisplay(interaction);
  const style = botInteractionStyle(display);
  const buttonClass = `kc-bot-action-button flex min-h-10 min-w-0 flex-1 basis-[var(--kc-bot-action-min-width)] items-center justify-center gap-1 rounded-lg border px-3 py-2 text-center text-sm font-semibold leading-5 shadow-[0_1px_0_rgba(15,23,42,0.03)] transition hover:-translate-y-0.5 hover:shadow-sm active:translate-y-0 disabled:hover:translate-y-0 disabled:hover:shadow-none ${display.kind === 'link' || display.action === 'open' ? '[border-color:rgba(10,132,255,0.55)] [color:var(--kc-accent)] hover:[background:var(--kc-accent-soft)]' : '[background:var(--kc-panel)] [border-color:var(--kc-border-strong)] [color:var(--kc-text)] hover:[border-color:var(--kc-accent)] hover:[color:var(--kc-accent)]'}`;
  if (display.action === 'open' && display.href) {
    return <a key={key} href={display.href} target="_blank" rel="noreferrer" className={buttonClass} style={style}>{display.label}</a>;
  }
  return <button key={key} type="button" className={buttonClass} style={style} disabled={display.state?.disabled} onClick={() => onInteract?.(display)}>{display.label}</button>;
}

function renderBotInteractionGroup(interactions: BotInteraction[], key: string, onInteract?: (interaction: BotInteraction) => void): JSX.Element {
  const longestLabelLength = Math.max(...interactions.map((interaction) => botInteractionDisplay(interaction).label.length), 1);
  const minWidth = Math.max(64, Math.min(160, longestLabelLength * 14 + 36));
  const groupStyle = { '--kc-bot-action-min-width': `${minWidth}px` } as CSSProperties;
  return (
    <div key={key} className="not-prose my-2 flex w-full max-w-[520px] flex-wrap gap-2 whitespace-normal" style={groupStyle}>
      {interactions.map((interaction, index) => renderBotInteractionButton(interaction, `${key}-${index}`, onInteract))}
    </div>
  );
}

function botInteractionsFromMarkdownLine(value: string, message?: Message): BotInteraction[] | null {
  const interactions: BotInteraction[] = [];
  const pattern = /<\s*(button|btn|link)\b([^<>]*?)(?:\/\s*>|>(.*?)<\s*\/\s*\1\s*>)/gi;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value)) !== null) {
    const separator = value.slice(lastIndex, match.index).trim();
    if (separator && !/^[|｜、，,;；/]+$/.test(separator)) {
      return null;
    }
    const interaction = botInteractionFromMarkdownTag(match[1], match[2] ?? '', match[3]);
    if (!interaction) {
      return null;
    }
    interactions.push({ ...interaction, state: botComponentState(message, interaction.componentId) });
    lastIndex = pattern.lastIndex;
  }
  const suffix = value.slice(lastIndex).trim();
  if (suffix && !/^[|｜、，,;；/]+$/.test(suffix)) {
    return null;
  }
  return interactions.length > 0 ? interactions : null;
}

function renderSafeBotMarkdown(content: string, onInteract?: (interaction: BotInteraction) => void, message?: Message): JSX.Element {
  const limited = content.length > 8000 ? `${content.slice(0, 8000)}...` : content;
  const lines = limited.split(/\r?\n/).slice(0, 80);
  const nodes: JSX.Element[] = [];
  let listItems: string[] = [];
  let orderedListItems: string[] = [];
  let codeLines: string[] = [];
  let codeLanguage = '';
  let inCodeBlock = false;

  function flushList(key: string): void {
    if (listItems.length === 0) {
      return;
    }
    nodes.push(<ul key={key} className="my-1 list-disc space-y-0.5 pl-5">{listItems.map((item, index) => <li key={index}>{renderInlineMarkdown(item, onInteract, message)}</li>)}</ul>);
    listItems = [];
  }

  function flushOrderedList(key: string): void {
    if (orderedListItems.length === 0) {
      return;
    }
    nodes.push(<ol key={key} className="my-1 list-decimal space-y-0.5 [padding-inline-start:2.5em]">{orderedListItems.map((item, index) => <li key={index}>{renderInlineMarkdown(item, onInteract, message)}</li>)}</ol>);
    orderedListItems = [];
  }

  function flushLists(key: string): void {
    flushList(`${key}-ul`);
    flushOrderedList(`${key}-ol`);
  }

  function flushCode(key: string): void {
    if (codeLines.length === 0) {
      codeLanguage = '';
      inCodeBlock = false;
      return;
    }
    nodes.push(
      <pre key={key} className="my-1 max-w-full overflow-x-auto rounded-xl bg-black/5 px-3 py-2 text-[12px] leading-5 dark:bg-white/10">
        {codeLanguage ? <span className="mb-1 block select-none text-[10px] uppercase tracking-wide [color:var(--kc-muted)]">{codeLanguage.slice(0, 20)}</span> : null}
        <code className="font-mono">{codeLines.join('\n')}</code>
      </pre>
    );
    codeLines = [];
    codeLanguage = '';
    inCodeBlock = false;
  }

  function tableRowCells(value: string): string[] | null {
    const trimmedRow = value.trim();
    if (!trimmedRow.startsWith('|') || !trimmedRow.endsWith('|')) {
      return null;
    }
    return trimmedRow.slice(1, -1).split('|').slice(0, 6).map((cell) => cell.trim());
  }

  function isTableDivider(value: string): boolean {
    const cells = tableRowCells(value);
    return Boolean(cells?.length && cells.every((cell) => /^:?-{3,}:?$/.test(cell)));
  }

  function collectTable(startIndex: number): { endIndex: number; node?: JSX.Element } | null {
    const header = tableRowCells(lines[startIndex]);
    if (!header || !isTableDivider(lines[startIndex + 1] ?? '')) {
      return null;
    }
    const rows: string[][] = [];
    let cursor = startIndex + 2;
    while (cursor < lines.length && rows.length < 12) {
      const cells = tableRowCells(lines[cursor]);
      if (!cells) {
        break;
      }
      rows.push(cells);
      cursor += 1;
    }
    return {
      endIndex: cursor - 1,
      node: (
        <div key={`table-${startIndex}`} className="scroll-soft my-2 block w-full max-w-full min-w-0 overflow-x-auto overscroll-x-contain rounded-xl border [border-color:var(--kc-border)]">
          <table className="w-max min-w-full max-w-none table-auto border-collapse text-left text-[12px] leading-5">
            <thead className="[background:var(--kc-panel-muted)]">
              <tr>{header.map((cell, cellIndex) => <th key={cellIndex} className="border-b px-3 py-2 font-semibold [border-color:var(--kc-border)]">{renderInlineMarkdown(cell, onInteract, message)}</th>)}</tr>
            </thead>
            <tbody>{rows.map((row, rowIndex) => <tr key={rowIndex} className={rowIndex % 2 ? 'bg-black/[0.02] dark:bg-white/[0.03]' : ''}>{header.map((_cell, cellIndex) => <td key={cellIndex} className="border-t px-3 py-2 align-top [border-color:var(--kc-border)]">{renderInlineMarkdown(row[cellIndex] ?? '', onInteract, message)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )
    };
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    const fence = /^```\s*([\w#+.-]{0,24})\s*$/.exec(trimmed);
    if (fence) {
      if (inCodeBlock) {
        flushCode(`code-${index}`);
      } else {
        flushLists(`list-before-code-${index}`);
        inCodeBlock = true;
        codeLanguage = fence[1] || '';
      }
      continue;
    }
    if (inCodeBlock) {
      if (codeLines.length < 40) {
        codeLines.push(line.slice(0, 500));
      }
      continue;
    }
    const table = collectTable(index);
    if (table?.node) {
      flushLists(`list-before-table-${index}`);
      nodes.push(table.node);
      index = table.endIndex;
      continue;
    }
    const task = /^[-*]\s+\[([ xX])\]\s+(.+)$/.exec(trimmed);
    if (task) {
      flushLists(`list-before-task-${index}`);
      nodes.push(
        <p key={index} className="flex items-start gap-1.5 leading-6">
          <span className={`mt-1 grid h-4 w-4 shrink-0 place-items-center rounded border ${task[1].toLowerCase() === 'x' ? '[background:var(--kc-accent)] [border-color:var(--kc-accent)] text-white' : '[border-color:var(--kc-border)]'}`}>
            {task[1].toLowerCase() === 'x' ? <Icon name="check" className="h-3 w-3" /> : null}
          </span>
          <span>{renderInlineMarkdown(task[2], onInteract, message)}</span>
        </p>
      );
      continue;
    }
    const bullet = /^[-*]\s+(.+)$/.exec(trimmed);
    if (bullet) {
      flushOrderedList(`ol-before-ul-${index}`);
      listItems.push(bullet[1]);
      continue;
    }
    const ordered = /^\d{1,3}\.\s+(.+)$/.exec(trimmed);
    if (ordered) {
      flushList(`ul-before-ol-${index}`);
      orderedListItems.push(ordered[1]);
      continue;
    }
    flushLists(`list-${index}`);
    if (!trimmed) {
      nodes.push(<div key={`br-${index}`} className="h-2" />);
      continue;
    }
    const interactionLine = botInteractionsFromMarkdownLine(trimmed, message);
    if (interactionLine) {
      nodes.push(renderBotInteractionGroup(interactionLine, `interaction-line-${index}`, onInteract));
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      nodes.push(<hr key={`hr-${index}`} className="my-3 border-0 border-t [border-color:var(--kc-border)]" />);
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(trimmed);
    if (heading) {
      const sizeClass = heading[1].length === 1 ? 'text-base' : heading[1].length === 2 ? 'text-[15px]' : 'text-sm';
      nodes.push(<p key={index} className={`${sizeClass} font-semibold leading-6`}>{renderInlineMarkdown(heading[2], onInteract, message)}</p>);
      continue;
    }
    const quote = /^>\s?(.+)$/.exec(trimmed);
    if (quote) {
      nodes.push(<blockquote key={index} className="border-l-2 pl-3 text-[0.95em] [border-color:var(--kc-accent)] [color:var(--kc-muted)]">{renderInlineMarkdown(quote[1], onInteract, message)}</blockquote>);
      continue;
    }
    nodes.push(<p key={index} className="leading-6">{renderInlineMarkdown(line, onInteract, message)}</p>);
  }
  flushList('list-end');
  flushOrderedList('ordered-list-end');
  flushCode('code-end');
  return <div className="kc-bot-markdown min-w-0 max-w-full space-y-1 overflow-hidden break-words text-sm leading-6 [overflow-wrap:anywhere]">{nodes}</div>;
}

function renderInlineMarkdown(value: string, onInteract?: (interaction: BotInteraction) => void, message?: Message): Array<string | JSX.Element> {
  const result: Array<string | JSX.Element> = [];
  const pattern = /(<\s*(button|btn|link)\b([^<>]*?)(?:\/\s*>|>(.*?)<\s*\/\s*\2\s*>))|(<\s*(at|mention|at_all|mention_all)\b([^<>]*?)\/\s*>)|(<\s*(img|image)\b([^<>]*?)(?:\/\s*>|>(.*?)<\s*\/\s*\9\s*>))|(!\[([^\]\n]{0,80})\]\(([^\s)<>]{1,500})\))|(\*\*([^*\n]+)\*\*)|(`([^`\n]+)`)|(\[([^\]\n]{1,80})\]\(([^\s)<>]{1,500})\))/gi;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value)) !== null) {
    if (match.index > lastIndex) {
      result.push(value.slice(lastIndex, match.index));
    }
    if (match[1]) {
      const interaction = botInteractionFromMarkdownTag(match[2], match[3] ?? '', match[4]);
      result.push(interaction ? renderBotInteraction({ ...interaction, state: botComponentState(message, interaction.componentId) }, `tag-${match.index}`, onInteract) : match[1]);
    } else if (match[5]) {
      const tag = match[6].toLowerCase().replace(/-/g, '_');
      if (tag === 'at_all' || tag === 'mention_all') {
        result.push(<span key={`at-all-${match.index}`} className="font-semibold [color:var(--kc-accent)]">@全体成员</span>);
      } else {
        const attrs = parseBotInlineAttrs(match[7] ?? '');
        const userId = Number(attrs.id ?? attrs.user_id ?? attrs.userId ?? 0);
        const name = String(attrs.name ?? attrs.nickname ?? attrs.username ?? '').trim() || message?.metadata?.mentions?.find((mention) => mention.user_id === userId)?.name || (userId > 0 ? `用户 ${userId}` : '用户');
        result.push(<span key={`at-${match.index}`} className="font-semibold [color:var(--kc-accent)]">@{name}</span>);
      }
    } else if (match[8]) {
      const attrs = parseBotInlineAttrs(match[10] ?? '');
      const src = safeMarkdownImageUrl(String(attrs.src ?? attrs.url ?? attrs.href ?? match[11] ?? ''));
      result.push(src ? <img key={`img-tag-${match.index}`} src={src} alt={String(attrs.alt ?? attrs.title ?? 'Markdown 图片')} className="my-1 max-h-48 max-w-full rounded-xl border object-contain [border-color:var(--kc-border)]" loading="lazy" /> : <span key={`bad-img-tag-${match.index}`} className="text-xs [color:var(--kc-muted)]">[图片链接不可用]</span>);
    } else if (match[12]) {
      const src = safeMarkdownImageUrl(match[14]);
      result.push(src ? <img key={`img-${match.index}`} src={src} alt={match[13] || 'Markdown 图片'} className="my-1 max-h-48 max-w-full rounded-xl border object-contain [border-color:var(--kc-border)]" loading="lazy" /> : <span key={`bad-img-${match.index}`} className="text-xs [color:var(--kc-muted)]">[图片链接不可用]</span>);
    } else if (match[16]) {
      result.push(<strong key={`b-${match.index}`} className="font-semibold">{match[16]}</strong>);
    } else if (match[18]) {
      result.push(<code key={`c-${match.index}`} className="rounded bg-black/5 px-1 py-0.5 font-mono text-[0.92em] dark:bg-white/10">{match[18]}</code>);
    } else if (match[20] && match[21]) {
      const href = safeMarkdownLinkUrl(match[21]);
      result.push(href ? <a key={`a-${match.index}`} href={href} target="_blank" rel="noreferrer" className="font-medium [color:var(--kc-accent)] hover:underline">{match[20]}</a> : <span key={`bad-a-${match.index}`}>{match[20]}</span>);
    }
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < value.length) {
    result.push(value.slice(lastIndex));
  }
  return result.length > 0 ? result : [value];
}

function snapshotPreview(snapshot: ForwardBundleSnapshot): string {
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

function messagePreview(message: Message): string {
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

function messageSenderLabel(message: Message): string {
  const displayName = message.sender_display_name?.trim();
  if (displayName) {
    return displayName;
  }
  const senderId = message.sender_id ?? message.sender?.id;
  return getDisplayName(message.sender, senderId ? `用户 ${senderId}` : '未知用户');
}

function forwardBundleCopyText(message: Message): string {
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

function messageCopyText(message: Message): string {
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

function messageReadableLine(message: Message): string {
  const time = formatMessageTime(message.created_at);
  const prefix = time ? `${messageSenderLabel(message)} ${time}` : messageSenderLabel(message);
  return `${prefix}：${messagePreview(message)}`;
}

function conversationDisplayTitle(conversation: Conversation, currentUser: User): string {
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

function conversationMobileTitleParts(conversation: Conversation, currentUser: User): { name: string; suffix: string } {
  if (conversation.type === 'group') {
    const name = conversation.display_title?.trim() || conversation.title?.trim() || '未命名群聊';
    return { name, suffix: `(${conversation.member_count ?? 0})` };
  }
  return { name: conversationDisplayTitle(conversation, currentUser), suffix: '' };
}

function ConversationAvatar({ conversation, title, size = 'md' }: { conversation: Conversation | null | undefined; title: string; size?: 'sm' | 'md' }): JSX.Element {
  const sizeClass = size === 'sm' ? 'h-8 w-8 text-xs' : 'h-10 w-10 text-sm';
  if (conversation?.type === 'group') {
    const avatarUrl = resolveThumbnailUrl(conversation.avatar_url);
    if (avatarUrl) {
      return <img src={avatarUrl} alt={title} className={`${sizeClass} shrink-0 rounded-full border object-cover [border-color:var(--kc-border)]`} />;
    }
    const initial = title.trim().slice(0, 1).toUpperCase() || '群';
    return <div className={`${sizeClass} grid shrink-0 place-items-center rounded-full border font-semibold [background:var(--kc-panel-muted)] [border-color:var(--kc-border)] [color:var(--kc-text)]`}>{initial}</div>;
  }

  return <Avatar user={conversation?.direct_user} label={title} size={size} />;
}

function pointInContainer(x: number, y: number, container: HTMLElement | null): OverlayPosition {
  const rect = container?.getBoundingClientRect();
  return rect ? { left: x - rect.left, top: y - rect.top } : { left: x, top: y };
}

function elementAnchorInContainer(element: HTMLElement, container: HTMLElement | null, xRatio = 0.5, yOffset = 8): OverlayPosition {
  const rect = element.getBoundingClientRect();
  return pointInContainer(rect.left + rect.width * xRatio, rect.bottom + yOffset, container);
}

function clampOverlayPosition(position: OverlayPosition, width: number, height: number, container: HTMLElement | null): OverlayPosition {
  const margin = 8;
  const bounds = container?.getBoundingClientRect();
  const boundsWidth = bounds?.width ?? window.innerWidth;
  const boundsHeight = bounds?.height ?? window.innerHeight;
  const minLeft = margin;
  const minTop = margin;
  const maxLeft = Math.max(minLeft, boundsWidth - width - margin);
  const maxTop = Math.max(minTop, boundsHeight - height - margin);
  return {
    left: Math.min(Math.max(position.left, minLeft), maxLeft),
    top: Math.min(Math.max(position.top, minTop), maxTop)
  };
}

function renderQuoteBlock(quote: MessageQuoteMetadata, compact = false, onJump?: (quote: MessageQuoteMetadata) => void): JSX.Element {
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

function renderMentionedText(text: string, metadata?: { mentions: MessageMentionMetadata[]; mentionAll: boolean }): Array<string | JSX.Element> {
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

function ccwCreationPreviewsFromMetadata(metadata?: MessageMetadata | Record<string, unknown> | null): CcwCreationPreview[] {
  const items = metadata?.ccw_creations;
  return Array.isArray(items) ? items.filter((item): item is CcwCreationPreview => isRecord(item) && typeof item.oid === 'string' && typeof item.title === 'string' && typeof item.url === 'string') : [];
}

function CcwCreationCards({ previews = [], compact = false }: { previews?: CcwCreationPreview[]; compact?: boolean }): JSX.Element | null {
  if (previews.length === 0) {
    return null;
  }
  return <div className="space-y-2">{previews.map((preview) => <CcwCreationCard key={`${preview.oid}:${preview.access_key ?? ''}`} oid={preview.oid} accessKey={preview.access_key ?? undefined} preview={preview} compact={compact} />)}</div>;
}

function renderSnapshotContent(snapshot: ForwardBundleSnapshot, onOpenImage?: (images: string[], index: number) => void): JSX.Element {
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

function normalizeVoiceDuration(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 && value < 60 * 60 ? value : fallback;
}

function defaultVoiceWaveform(count = 28): number[] {
  return Array.from({ length: count }, (_, index) => 0.24 + Math.abs(Math.sin(index * 0.72)) * 0.58);
}

function VoiceWaveform({ waveform, progress, onSeek, label }: { waveform?: number[]; progress: number; onSeek: (ratio: number) => void; label: string }): JSX.Element {
  const bars = waveform && waveform.length >= 8 ? waveform : defaultVoiceWaveform();
  const clampedProgress = Math.min(1, Math.max(0, progress));

  function seekFromEvent(event: React.MouseEvent<HTMLButtonElement>): void {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) {
      return;
    }
    onSeek((event.clientX - rect.left) / rect.width);
  }

  return (
    <button type="button" onClick={seekFromEvent} className="flex h-8 w-full items-center gap-[3px] rounded-lg px-0.5" aria-label={label}>
      {bars.map((level, index) => {
        const ratio = bars.length <= 1 ? 1 : index / (bars.length - 1);
        const active = ratio <= clampedProgress;
        return (
          <span
            key={`${index}-${level}`}
            className={`w-[3px] flex-1 rounded-full transition-colors ${active ? '[background:var(--kc-accent)]' : '[background:rgba(31,41,55,0.24)]'}`}
            style={{ height: `${Math.max(6, Math.round((0.22 + Math.min(1, Math.max(0, level)) * 0.78) * 28))}px` }}
          />
        );
      })}
    </button>
  );
}

function VoiceMessageBubble({ message, mine, onContextMenu }: { message: Message; mine: boolean; onContextMenu: (event: React.MouseEvent<HTMLElement>, message: Message) => void }): JSX.Element {
  const src = resolveAssetUrl(message.content);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const metadata = voiceMetadataOf(message);
  const metadataDuration = finiteNumber(metadata.durationMs, 0) / 1000;
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(metadataDuration);
  const [currentTime, setCurrentTime] = useState(0);
  const [playError, setPlayError] = useState('');

  const effectiveDuration = normalizeVoiceDuration(duration, metadataDuration || 1);
  const progress = effectiveDuration > 0 ? Math.min(1, currentTime / effectiveDuration) : 0;

  async function togglePlayback(): Promise<void> {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    if (audio.paused) {
      try {
        setPlayError('');
        if (audio.readyState === 0) {
          audio.load();
        }
        await audio.play();
        setPlaying(true);
      } catch {
        setPlaying(false);
        setPlayError('播放失败');
      }
      return;
    }
    audio.pause();
    setPlaying(false);
  }

  function seek(value: string): void {
    const audio = audioRef.current;
    const nextTime = Number(value);
    if (!audio || !Number.isFinite(nextTime)) {
      return;
    }
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  }

  function seekRatio(ratio: number): void {
    const audio = audioRef.current;
    if (!audio || effectiveDuration <= 0) {
      return;
    }
    const nextTime = Math.min(effectiveDuration, Math.max(0, ratio) * effectiveDuration);
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  }

  if (!src) {
    return <span className="inline-flex rounded-xl border px-3 py-2 text-xs font-semibold [border-color:var(--kc-border)] [background:var(--kc-panel-muted)] [color:var(--kc-muted)]">语音不可用</span>;
  }

  return (
    <div onContextMenu={(event) => onContextMenu(event, message)} className={`w-[min(260px,68vw)] rounded-[22px] border px-3 py-2 shadow-none ${mine ? 'rounded-tr-sm [background:linear-gradient(135deg,var(--kc-bubble-out),var(--kc-accent-soft))] [border-color:rgba(79,70,229,0.16)]' : 'rounded-tl-sm [background:var(--kc-bubble-in)] [border-color:var(--kc-border)]'} [color:var(--kc-text)]`}>
      <audio ref={audioRef} src={src} preload="metadata" onLoadedMetadata={(event) => setDuration(normalizeVoiceDuration(event.currentTarget.duration, metadataDuration))} onDurationChange={(event) => setDuration(normalizeVoiceDuration(event.currentTarget.duration, metadataDuration))} onTimeUpdate={(event) => setCurrentTime(finiteNumber(event.currentTarget.currentTime, 0))} onPause={() => setPlaying(false)} onPlay={() => setPlaying(true)} onError={() => { setPlaying(false); setPlayError('播放失败'); }} onEnded={() => { setPlaying(false); setCurrentTime(0); }} />
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => void togglePlayback()} className="grid h-9 w-9 shrink-0 place-items-center rounded-full shadow-sm transition hover:-translate-y-0.5 [background:var(--kc-panel)] [color:var(--kc-accent)]" aria-label={playing ? '暂停语音' : '播放语音'}>
          <span className="text-sm font-black">{playing ? 'Ⅱ' : '▶'}</span>
        </button>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center justify-between gap-2 text-xs">
            <span className="font-semibold">语音消息</span>
            <span className="tabular-nums [color:var(--kc-muted)]">{formatVoiceDuration((playing ? currentTime : effectiveDuration) * 1000)}</span>
          </div>
          <VoiceWaveform waveform={metadata.waveform} progress={progress} onSeek={seekRatio} label="语音进度" />
          {playError ? <p className="mt-0.5 text-[10px] text-red-500">{playError}</p> : null}
        </div>
      </div>
    </div>
  );
}

function StagedVoicePreview({ voice, onRemove }: { voice: StagedVoice; onRemove: () => void }): JSX.Element {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const metadataDuration = voice.durationMs / 1000;
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(metadataDuration);
  const [currentTime, setCurrentTime] = useState(0);
  const [playError, setPlayError] = useState('');
  const effectiveDuration = normalizeVoiceDuration(duration, metadataDuration || 1);
  const progress = effectiveDuration > 0 ? Math.min(1, currentTime / effectiveDuration) : 0;

  async function togglePlayback(): Promise<void> {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    if (audio.paused) {
      try {
        setPlayError('');
        if (audio.readyState === 0) {
          audio.load();
        }
        await audio.play();
        setPlaying(true);
      } catch {
        setPlaying(false);
        setPlayError('播放失败');
      }
      return;
    }
    audio.pause();
    setPlaying(false);
  }

  function seek(value: string): void {
    const audio = audioRef.current;
    const nextTime = Number(value);
    if (!audio || !Number.isFinite(nextTime)) {
      return;
    }
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  }

  function seekRatio(ratio: number): void {
    const audio = audioRef.current;
    if (!audio || effectiveDuration <= 0) {
      return;
    }
    const nextTime = Math.min(effectiveDuration, Math.max(0, ratio) * effectiveDuration);
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  }

  return (
    <div className="mb-2 flex w-[min(300px,100%)] items-center gap-3 rounded-[22px] border px-3 py-2 [background:var(--kc-panel-muted)] [border-color:var(--kc-border)]">
      <audio ref={audioRef} src={voice.previewUrl} preload="metadata" onLoadedMetadata={(event) => setDuration(normalizeVoiceDuration(event.currentTarget.duration, metadataDuration))} onDurationChange={(event) => setDuration(normalizeVoiceDuration(event.currentTarget.duration, metadataDuration))} onTimeUpdate={(event) => setCurrentTime(finiteNumber(event.currentTarget.currentTime, 0))} onPause={() => setPlaying(false)} onPlay={() => setPlaying(true)} onError={() => { setPlaying(false); setPlayError('播放失败'); }} onEnded={() => { setPlaying(false); setCurrentTime(0); }} />
      <button type="button" onClick={() => void togglePlayback()} className="grid h-9 w-9 shrink-0 place-items-center rounded-full shadow-sm transition hover:-translate-y-0.5 [background:var(--kc-panel)] [color:var(--kc-accent)]" aria-label={playing ? '暂停待发送语音' : '播放待发送语音'}>
        <span className="text-xs font-black">{playing ? 'Ⅱ' : '▶'}</span>
      </button>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center justify-between gap-2 text-xs">
          <span className="font-semibold">待发送语音</span>
          <span className="tabular-nums [color:var(--kc-muted)]">{formatVoiceDuration((playing ? currentTime : effectiveDuration) * 1000)}</span>
        </div>
        <VoiceWaveform waveform={voice.waveform} progress={progress} onSeek={seekRatio} label="待发送语音进度" />
        {playError ? <p className="mt-0.5 text-[10px] text-red-500">{playError}</p> : null}
      </div>
      <button type="button" onClick={onRemove} className="grid h-8 w-8 shrink-0 place-items-center rounded-full transition hover:[background:var(--kc-hover)]" aria-label="移除语音"><Icon name="close" className="h-3.5 w-3.5" /></button>
    </div>
  );
}

function UnavailableImageLabel(): JSX.Element {
  return <span className="inline-flex rounded-xl border px-3 py-2 text-xs font-semibold [border-color:var(--kc-border)] [background:var(--kc-panel-muted)] [color:var(--kc-muted)]">图片不可用</span>;
}

export function ForwardBundleCard({ message, onOpen }: { message: Message; onOpen: () => void }): JSX.Element {
  const bundle = parseForwardBundle(message);
  const previews = bundle.snapshots.slice(0, FORWARD_PREVIEW_LIMIT);

  return (
    <button type="button" onClick={onOpen} className="block w-72 max-w-full overflow-hidden rounded-2xl border p-0 text-left shadow-none transition hover:-translate-y-0.5 hover:shadow-sm [background:var(--kc-panel)] [border-color:var(--kc-border)]">
      <div className="px-3.5 py-3">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl [background:var(--kc-accent-soft)] [color:var(--kc-accent)]">
            <Icon name="message" className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold [color:var(--kc-text)]">{bundle.title}</p>
            {bundle.note ? <p className="mt-0.5 truncate text-xs [color:var(--kc-muted)]">{bundle.note}</p> : null}
          </div>
        </div>
        <div className="mt-3 grid gap-1.5">
          {previews.length > 0 ? previews.map((snapshot, index) => (
            <p key={`${snapshot.id ?? index}-${snapshot.senderName}`} className="truncate text-xs [color:var(--kc-muted)]">
              <span className="font-semibold [color:var(--kc-text)]">{snapshot.senderName}：</span>{snapshotPreview(snapshot)}
            </p>
          )) : <p className="text-xs [color:var(--kc-muted)]">暂无可预览内容</p>}
        </div>
      </div>
      <div className="flex items-center justify-between border-t px-3.5 py-2 text-xs [border-color:var(--kc-border)] [color:var(--kc-muted)]">
        <span>查看{bundle.count || bundle.snapshots.length}条转发消息</span>
        <Icon name="chevron" className="h-3.5 w-3.5" />
      </div>
    </button>
  );
}

function GroupShareCardPreview({ card }: { card: GroupShareCardMetadata }): JSX.Element {
  return (
    <div className="w-72 max-w-full overflow-hidden rounded-2xl border text-left [background:var(--kc-panel)] [border-color:var(--kc-border)]">
      <div className="flex items-center gap-3 p-3.5">
        <GroupShareAvatar card={card} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold [color:var(--kc-text)]">{card.title}</p>
          <p className="mt-0.5 truncate text-xs [color:var(--kc-muted)]">群号 {card.conversation_id} · {card.member_count ?? 0} 人</p>
        </div>
      </div>
      <div className="border-t px-3.5 py-2 text-xs [border-color:var(--kc-border)] [color:var(--kc-muted)]">群聊名片</div>
    </div>
  );
}

function GroupShareAvatar({ card }: { card: GroupShareCardMetadata }): JSX.Element {
  const avatarSrc = resolveThumbnailUrl(card.avatar_url);
  if (avatarSrc) {
    return <img src={avatarSrc} alt={card.title} className="h-11 w-11 shrink-0 rounded-2xl border object-cover [border-color:var(--kc-border)]" />;
  }
  return <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border text-base font-black [background:var(--kc-accent-soft)] [border-color:var(--kc-border)] [color:var(--kc-accent)]">{card.title.trim().slice(0, 1) || '群'}</div>;
}

function PostShareCardPreview({ card }: { card: PostShareCardMetadata }): JSX.Element {
  const imageUrl = card.image_urls?.[0];
  const imageSrc = resolveThumbnailUrl(imageUrl);
  const hasContent = Boolean(card.content?.trim());
  return (
    <div className="w-[min(300px,72vw)] max-w-full overflow-hidden rounded-[22px] border text-left shadow-none [background:var(--kc-panel)] [border-color:rgba(148,163,184,0.28)]">
      <div className="flex items-center gap-2.5 px-3.5 pb-2 pt-3.5">
        <Avatar user={null} label={card.author_name} avatarUrl={card.author_avatar_url} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold [color:var(--kc-text)]">{card.author_name} 的动态</p>
          <p className="mt-0.5 truncate text-xs [color:var(--kc-muted)]">分享自动态</p>
        </div>
      </div>
      <div className="px-3.5 pb-3">
        <div className="min-w-0 overflow-hidden rounded-2xl px-3 py-2.5 [background:var(--kc-panel-muted)]">
          {hasContent ? <><p className="line-clamp-3 whitespace-pre-wrap break-words text-sm leading-6 [color:var(--kc-text)]">{card.content}</p><CcwCreationCards previews={card.ccw_creations} compact /></> : <p className="text-sm leading-6 [color:var(--kc-muted)]">分享了一条图片动态</p>}
          {imageSrc ? <img src={imageSrc} alt="动态图片" className="mt-2 h-24 w-full rounded-xl object-cover" /> : null}
        </div>
      </div>
      <div className="flex items-center justify-between border-t px-3.5 py-2 text-xs [border-color:rgba(148,163,184,0.22)] [color:var(--kc-muted)]">
        <span>动态空间</span>
        <Icon name="chevron" className="h-4 w-4" />
      </div>
    </div>
  );
}

function PostShareCard({ card, onOpenPost }: { card: PostShareCardMetadata; onOpenPost?: (postId: number) => void }): JSX.Element {
  const openPost = useKukeStore((state) => state.openPost);
  return (
    <button type="button" onClick={() => onOpenPost ? onOpenPost(card.post_id) : openPost(card.post_id)} className="mt-1 block max-w-full cursor-pointer rounded-[22px] text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-200">
      <PostShareCardPreview card={card} />
    </button>
  );
}


function BotShareAvatar({ card }: { card: BotShareCardMetadata }): JSX.Element {
  const avatar = resolveThumbnailUrl(card.avatar_url);
  if (avatar) {
    return <img src={avatar} alt={card.name} className="h-12 w-12 shrink-0 rounded-2xl border object-cover [border-color:var(--kc-border)]" />;
  }
  return <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border text-base font-black [background:var(--kc-accent-soft)] [border-color:var(--kc-border)] [color:var(--kc-accent)]">{card.name.trim().slice(0, 1) || '机'}</span>;
}


function BotShareCardPreview({ card }: { card: BotShareCardMetadata }): JSX.Element {
  const commands = (card.commands ?? '').split('\n').map((item) => item.trim()).filter(Boolean).slice(0, 2);
  return (
    <div className="w-[min(320px,74vw)] max-w-full overflow-hidden rounded-[22px] border text-left shadow-none [background:var(--kc-panel)] [border-color:rgba(148,163,184,0.28)]">
      <div className="flex items-center gap-3 px-3.5 pb-2 pt-3.5">
        <BotShareAvatar card={card} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2"><p className="truncate text-sm font-black [color:var(--kc-text)]">{card.name}</p><span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${card.online ? 'bg-emerald-100 text-emerald-700' : '[background:var(--kc-panel-muted)] [color:var(--kc-muted)]'}`}>{card.online ? '在线' : '离线'}</span></div>
          <p className="mt-0.5 truncate text-xs [color:var(--kc-muted)]">{card.install_count ?? 0} 个群在使用 · {card.rating_average ? `${card.rating_average.toFixed(1)} 分` : '暂无评分'}</p>
        </div>
      </div>
      <div className="px-3.5 pb-3">
        <div className="min-w-0 overflow-hidden rounded-2xl px-3 py-2.5 [background:var(--kc-panel-muted)]">
          <p className="line-clamp-2 break-words text-sm leading-6 [color:var(--kc-text)]">{card.description?.trim() || '这个机器人还没有写介绍'}</p>
          {commands.length ? <div className="mt-2 flex gap-1.5 overflow-hidden">{commands.map((command) => <span key={command} className="max-w-[120px] truncate rounded-full px-2 py-1 font-mono text-[11px] [background:var(--kc-panel)] [color:var(--kc-muted)]">{command}</span>)}</div> : null}
        </div>
      </div>
      <div className="flex items-center justify-between border-t px-3.5 py-2 text-xs [border-color:rgba(148,163,184,0.22)] [color:var(--kc-muted)]">
        <span>机器人名片</span>
        <Icon name="chevron" className="h-4 w-4" />
      </div>
    </div>
  );
}


function BotShareCard({ card }: { card: BotShareCardMetadata }): JSX.Element {
  const openBot = useKukeStore((state) => state.openBot);
  return (
    <button type="button" onClick={() => openBot(card.bot_id)} className="mt-1 block max-w-full cursor-pointer rounded-[22px] text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-200">
      <BotShareCardPreview card={card} />
    </button>
  );
}

function UserShareAvatar({ card }: { card: UserShareCardMetadata }): JSX.Element {
  const avatar = resolveThumbnailUrl(card.avatar_url);
  if (avatar) {
    return <img src={avatar} alt={card.name} className="h-12 w-12 shrink-0 rounded-2xl border object-cover [border-color:var(--kc-border)]" />;
  }
  return <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border text-base font-black [background:var(--kc-accent-soft)] [border-color:var(--kc-border)] [color:var(--kc-accent)]">{card.name.trim().slice(0, 1) || '友'}</span>;
}

function UserShareCardPreview({ card }: { card: UserShareCardMetadata }): JSX.Element {
  const title = card.profile_title?.trim() || '个人主页';
  const tagline = card.profile_tagline?.trim() || card.profile_status?.trim() || card.bio?.trim() || '查看这个用户的主页资料';
  return (
    <div className="w-[min(320px,74vw)] max-w-full overflow-hidden rounded-[22px] border text-left shadow-none [background:var(--kc-panel)] [border-color:rgba(148,163,184,0.28)]">
      <div className="flex items-center gap-3 px-3.5 pb-2 pt-3.5">
        <UserShareAvatar card={card} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-black [color:var(--kc-text)]">{card.name}</p>
            {card.ccw_student_oid ? <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold [background:var(--kc-accent-soft)] [color:var(--kc-accent)]">CCW</span> : null}
          </div>
          <p className="mt-0.5 truncate text-xs [color:var(--kc-muted)]">{card.username ? `@${card.username}` : `用户 ${card.user_id}`}</p>
        </div>
      </div>
      <div className="px-3.5 pb-3">
        <div className="min-w-0 overflow-hidden rounded-2xl px-3 py-2.5 [background:var(--kc-panel-muted)]">
          <p className="truncate text-xs font-bold [color:var(--kc-accent)]">{title}</p>
          <p className="mt-1 line-clamp-2 break-words text-sm leading-6 [color:var(--kc-text)]">{tagline}</p>
          {card.ccw_name?.trim() ? <p className="mt-2 truncate text-[11px] font-semibold [color:var(--kc-muted)]">已绑定 CCW：{card.ccw_name}</p> : null}
        </div>
      </div>
      <div className="flex items-center justify-between border-t px-3.5 py-2 text-xs [border-color:rgba(148,163,184,0.22)] [color:var(--kc-muted)]">
        <span>个人名片</span>
        <Icon name="chevron" className="h-4 w-4" />
      </div>
    </div>
  );
}

function UserShareCard({ card }: { card: UserShareCardMetadata }): JSX.Element {
  const openUserSpace = useKukeStore((state) => state.openUserSpace);
  return (
    <button type="button" onClick={() => openUserSpace(card.user_id)} className="mt-1 block max-w-full cursor-pointer rounded-[22px] text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-200">
      <UserShareCardPreview card={card} />
    </button>
  );
}

const TEAMUP_SHARE_SKILL_LABEL: Record<TeamupSkill, string> = {
  program: '程序',
  art: '美术',
  design: '策划',
  music: '音乐音效',
  writing: '文案剧情',
  test: '测试',
  other: '其他'
};

function TeamupShareAvatar({ card }: { card: TeamupShareCardMetadata }): JSX.Element {
  const avatar = resolveThumbnailUrl(card.avatar_url);
  if (avatar) {
    return <img src={avatar} alt={card.name} className="h-12 w-12 shrink-0 rounded-2xl border object-cover [border-color:var(--kc-border)]" />;
  }
  return <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border text-base font-black [background:var(--kc-accent-soft)] [border-color:var(--kc-border)] [color:var(--kc-accent)]">{card.name.trim().slice(0, 1) || '队'}</span>;
}

function TeamupShareCardPreview({ card }: { card: TeamupShareCardMetadata }): JSX.Element {
  const cover = resolveThumbnailUrl(card.cover_url);
  const skills = (card.skills ?? []).slice(0, 4);
  const lookingFor = (card.looking_for ?? []).slice(0, 3);
  return (
    <div className="w-[min(320px,74vw)] max-w-full overflow-hidden rounded-[22px] border text-left shadow-none [background:var(--kc-panel)] [border-color:rgba(148,163,184,0.28)]">
      {cover ? (
        <div className="relative h-20 w-full overflow-hidden">
          <img src={cover} alt="" className="h-full w-full object-cover" />
          <span className="absolute inset-0 [background:linear-gradient(180deg,transparent_30%,color-mix(in_srgb,var(--kc-panel)_80%,transparent))]" />
        </div>
      ) : (
        <div className="relative h-12 w-full overflow-hidden [background:linear-gradient(120deg,color-mix(in_srgb,var(--kc-accent)_22%,transparent),transparent)]" />
      )}
      <div className="relative z-10 flex items-end gap-3 px-3.5 pb-2 -mt-7">
        <span className="relative z-10 rounded-2xl ring-2 ring-white shadow-[0_4px_12px_rgba(15,23,42,0.18)] dark:ring-[color:var(--kc-panel)]"><TeamupShareAvatar card={card} /></span>
        <div className="min-w-0 flex-1 pb-0.5">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-black [color:var(--kc-text)]">{card.name}</p>
            {card.status === 'recruiting' ? <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700"><span className="h-1 w-1 rounded-full bg-emerald-500" />招募中</span> : null}
          </div>
        </div>
      </div>
      <div className="px-3.5 pb-3">
        {card.headline ? <p className="line-clamp-2 break-words text-sm font-bold leading-5 [color:var(--kc-text)]">{card.headline}</p> : null}
        {skills.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {skills.map((skill) => <span key={skill} className="rounded-md px-1.5 py-0.5 text-[10px] font-bold [background:var(--kc-accent-soft)] [color:var(--kc-accent)]">{TEAMUP_SHARE_SKILL_LABEL[skill] ?? skill}</span>)}
          </div>
        ) : null}
        {lookingFor.length > 0 ? <p className="mt-2 truncate text-[11px] font-semibold [color:var(--kc-muted)]">想找：{lookingFor.map((skill) => TEAMUP_SHARE_SKILL_LABEL[skill] ?? skill).join('、')}</p> : null}
      </div>
      <div className="flex items-center justify-between border-t px-3.5 py-2 text-xs [border-color:rgba(148,163,184,0.22)] [color:var(--kc-muted)]">
        <span className="inline-flex items-center gap-1"><Icon name="users" className="h-3.5 w-3.5" />组队名片{card.creation_count ? ` · ${card.creation_count} 代表作` : ''}</span>
        <Icon name="chevron" className="h-4 w-4" />
      </div>
    </div>
  );
}

function TeamupShareCard({ card }: { card: TeamupShareCardMetadata }): JSX.Element {
  const openTeamupProfile = useKukeStore((state) => state.openTeamupProfile);
  return (
    <button type="button" onClick={() => openTeamupProfile(card.profile_id)} className="mt-1 block max-w-full cursor-pointer rounded-[22px] text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-200">
      <TeamupShareCardPreview card={card} />
    </button>
  );
}


function GroupShareCard({ card, conversations, onToast, onError }: { card: GroupShareCardMetadata; conversations: Conversation[]; onToast: (message: string, tone?: 'info' | 'error') => void; onError: (message: string) => void }): JSX.Element {
  const queryClient = useQueryClient();
  const setActiveConversationId = useKukeStore((state) => state.setActiveConversationId);
  const joinedConversation = conversations.find((item) => item.id === card.conversation_id);
  const acceptMutation = useMutation({
    mutationFn: async () => {
      if (!card.invite_token) {
        throw new Error('这张群名片缺少邀请凭证');
      }
      return acceptInvite(card.invite_token);
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      void queryClient.invalidateQueries({ queryKey: ['group-join-requests'] });
      setActiveConversationId(result.conversation_id ?? card.conversation_id);
      onToast(result.status === 'joined' ? '已加入群聊' : '已处理群邀请');
    },
    onError: (error) => onError(error instanceof Error ? error.message : '加入群聊失败，请稍后重试。')
  });

  const actionLabel = joinedConversation ? '打开群聊' : acceptMutation.isPending ? '加入中...' : '加入群聊';

  return (
    <article className="w-80 max-w-full overflow-hidden rounded-2xl border text-left shadow-none [background:var(--kc-panel)] [border-color:var(--kc-border)]">
      <div className="p-3.5">
        <div className="flex items-center gap-3">
          <GroupShareAvatar card={card} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold [color:var(--kc-text)]">{card.title}</p>
            <p className="mt-0.5 truncate text-xs [color:var(--kc-muted)]">群号 {card.conversation_id} · {card.member_count ?? 0} 人 · {card.category?.trim() || '未设置'}</p>
          </div>
        </div>
        <p className="mt-3 line-clamp-2 rounded-xl px-3 py-2 text-xs leading-5 [background:var(--kc-panel-muted)] [color:var(--kc-muted)]">{card.description?.trim() || '这个群还没有简介。'}</p>
      </div>
      <div className="flex items-center justify-between gap-3 border-t px-3.5 py-2.5 [border-color:var(--kc-border)]">
        <span className="text-xs [color:var(--kc-muted)]">群聊名片</span>
        <button type="button" disabled={acceptMutation.isPending || (!joinedConversation && !card.invite_token)} onClick={() => joinedConversation ? setActiveConversationId(card.conversation_id) : acceptMutation.mutate()} className="rounded-xl px-3 py-1.5 text-xs font-semibold transition [background:var(--kc-accent-soft)] [color:var(--kc-accent)] hover:[background:var(--kc-hover)] disabled:cursor-not-allowed disabled:opacity-45">
          {actionLabel}
        </button>
      </div>
    </article>
  );
}

export function ForwardBundleDetailModal({ message, mobile = false, onClose }: { message: Message; mobile?: boolean; onClose: () => void }): JSX.Element {
  const bundle = parseForwardBundle(message);
  const [imageViewer, setImageViewer] = useState<ImageViewerState | null>(null);
  const openSnapshotImage = (images: string[], index: number): void => setImageViewer({ images, index });

  useEffect(() => {
    if (!mobile) {
      return undefined;
    }
    return registerNativeBackHandler(() => {
      if (imageViewer) {
        setImageViewer(null);
        return true;
      }
      onClose();
      return true;
    }, 120);
  }, [imageViewer, mobile, onClose]);

  const content = (
    <>
      <div className={`${mobile ? 'fixed inset-0 z-[2147483646] flex w-screen max-w-[100vw] flex-col overflow-hidden bg-[#f2f2f4] text-[#111827] [background-color:#f2f2f4]' : 'kc-mobile-overlay fixed inset-0 z-[2147483646] grid place-items-center p-4 [background:rgba(15,23,42,0.24)]'}`} style={mobile ? { overflowX: 'hidden', maxWidth: '100vw' } : undefined} onMouseDown={mobile ? undefined : onClose}>
        <div onMouseDown={(event) => event.stopPropagation()} className={mobile ? 'flex h-full min-h-0 w-full max-w-full flex-col overflow-hidden bg-[#f2f2f4] text-[#111827] [background-color:#f2f2f4]' : 'kc-mobile-dialog flex h-[min(680px,88vh)] w-full max-w-[520px] flex-col overflow-hidden rounded-[26px] border shadow-float [background:var(--kc-panel)] [border-color:var(--kc-border)] [color:var(--kc-text)]'} style={mobile ? { overflowX: 'hidden', maxWidth: '100%' } : undefined}>
          <header className={mobile ? 'flex min-h-[calc(max(44px,env(safe-area-inset-top))+56px)] shrink-0 items-end justify-between gap-3 bg-[#f2f2f4] px-4 pb-3 pt-[max(44px,env(safe-area-inset-top))] [background-color:#f2f2f4]' : 'flex items-start justify-between gap-3 border-b p-4 [border-color:var(--kc-border)]'}>
            {mobile ? <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full [color:var(--kc-text)]" aria-label="返回聊天"><Icon name="chevronLeft" className="h-6 w-6" /></button> : null}
            <div className="min-w-0 flex-1">
              <h2 className={`truncate ${mobile ? 'text-[18px] font-bold' : 'text-base font-semibold'}`}>{bundle.title}</h2>
              <p className="mt-1 text-xs [color:var(--kc-muted)]">共 {bundle.count || bundle.snapshots.length} 条转发消息</p>
              {bundle.note ? <p className="mt-2 rounded-xl px-3 py-2 text-xs [background:var(--kc-panel-muted)] [color:var(--kc-muted)]">备注：{bundle.note}</p> : null}
            </div>
            {mobile ? <span className="h-9 w-9" /> : (
              <button type="button" onClick={onClose} className="kc-icon-button h-8 w-8 shrink-0" aria-label="关闭转发详情">
                <Icon name="close" className="h-4 w-4" />
              </button>
            )}
          </header>
          <main className="scroll-soft min-h-0 max-w-full flex-1 overflow-x-hidden overflow-y-auto bg-[#f2f2f4] p-4 [background-color:#f2f2f4] [overscroll-behavior-x:none]" style={mobile ? { overflowX: 'hidden', maxWidth: '100%', touchAction: 'pan-y' } : undefined}>
            {bundle.snapshots.length === 0 ? <p className="max-w-full overflow-hidden rounded-2xl p-4 text-sm [background:var(--kc-panel)] [color:var(--kc-muted)]">这条转发消息没有可展示的快照。</p> : null}
            <div className="grid min-w-0 max-w-full gap-5 overflow-x-hidden">
              {bundle.snapshots.map((snapshot, index) => {
                return (
                  <article key={`${snapshot.id ?? index}-${snapshot.senderName}`} className="flex min-w-0 max-w-full items-start gap-3 overflow-hidden">
                    <Avatar user={null} label={snapshot.senderName} avatarUrl={snapshot.senderAvatarUrl} size="message" />
                    <div className="flex min-w-0 max-w-[calc(100%-52px)] flex-1 flex-col items-start gap-1 overflow-hidden">
                      <div className="flex max-w-full flex-wrap items-center gap-2 overflow-hidden px-1 text-[11px] [color:var(--kc-muted)]">
                        <span className="min-w-0 max-w-full truncate font-semibold">{snapshot.senderName}</span>
                        <span className="shrink-0">{formatMessageTime(snapshot.createdAt)}</span>
                      </div>
                      <div className="w-fit min-w-0 max-w-full overflow-hidden rounded-xl rounded-tl-sm px-3.5 py-2.5 shadow-none [background:var(--kc-bubble-in)] [color:var(--kc-text)]">
                        {renderSnapshotContent(snapshot, openSnapshotImage)}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </main>
        </div>
      </div>
      {imageViewer ? <ImageViewer viewer={imageViewer} mobile={mobile} portal onClose={() => setImageViewer(null)} onNavigate={(index) => setImageViewer((current) => current ? { ...current, index } : current)} /> : null}
    </>
  );

  return mobile ? createPortal(content, document.body) : content;
}

interface FavoritesPanelProps {
  conversations: Conversation[];
  currentUser: User;
  items: BookmarkedMessageRead[];
  isLoading: boolean;
  error: unknown;
  isMobile?: boolean;
  onOpenForwardBundle: (message: Message) => void;
  onMobileBack?: () => void;
  transitionStyle?: CSSProperties;
}

export function FavoritesPanel({ conversations, currentUser, items, isLoading, error, isMobile = false, onOpenForwardBundle, onMobileBack, transitionStyle }: FavoritesPanelProps): JSX.Element {
  const conversationById = new Map(conversations.map((conversation) => [conversation.id, conversation]));
  const [favoriteFilter, setFavoriteFilter] = useState<'all' | 'direct' | 'group'>('all');
  const [favoriteSearchOpen, setFavoriteSearchOpen] = useState(false);
  const [favoriteSearch, setFavoriteSearch] = useState('');
  const [imageViewer, setImageViewer] = useState<ImageViewerState | null>(null);
  const [favoriteAction, setFavoriteAction] = useState<BookmarkedMessageRead | null>(null);
  const favoriteLongPressTimer = useRef<number | null>(null);
  const favoriteLongPressTriggered = useRef(false);
  const queryClient = useQueryClient();
  const favoriteSearchKeyword = favoriteSearch.trim().toLowerCase();
  const filteredItems = items.filter((item) => {
    const conversation = item.conversation ?? conversationById.get(item.conversation_id) ?? null;
    if (favoriteFilter === 'direct' && conversation?.type === 'group') {
      return false;
    }
    if (favoriteFilter === 'group' && conversation?.type !== 'group') {
      return false;
    }
    if (!favoriteSearchKeyword) {
      return true;
    }
    const text = [
      conversation ? conversationDisplayTitle(conversation, currentUser) : `会话 ${item.conversation_id}`,
      item.message.content,
      messageSenderLabel(item.message),
      item.message.sender?.username,
      item.message.sender?.nickname,
      item.message.sender?.email
    ].join(' ').toLowerCase();
    return text.includes(favoriteSearchKeyword);
  });
  const filterLabel = favoriteFilter === 'direct' ? '私聊' : favoriteFilter === 'group' ? '群聊' : '全部';
  const filterOptions: Array<{ key: 'all' | 'direct' | 'group'; label: string }> = [
    { key: 'all', label: '全部' },
    { key: 'direct', label: '私聊' },
    { key: 'group', label: '群聊' }
  ];
  const openFavoriteImage = (images: string[], index: number): void => setImageViewer({ images, index });
  const clearFavoriteLongPress = (): void => {
    if (favoriteLongPressTimer.current !== null) {
      window.clearTimeout(favoriteLongPressTimer.current);
      favoriteLongPressTimer.current = null;
    }
  };
  const openFavoriteAction = (item: BookmarkedMessageRead): void => {
    clearFavoriteLongPress();
    favoriteLongPressTriggered.current = true;
    setFavoriteAction(item);
  };
  const startFavoriteLongPress = (item: BookmarkedMessageRead): void => {
    clearFavoriteLongPress();
    favoriteLongPressTriggered.current = false;
    favoriteLongPressTimer.current = window.setTimeout(() => openFavoriteAction(item), 520);
  };
  const finishFavoritePress = (): void => {
    clearFavoriteLongPress();
    window.setTimeout(() => { favoriteLongPressTriggered.current = false; }, 0);
  };

  const deleteFavoriteMutation = useMutation({
    mutationFn: ({ conversationId, messageId }: { conversationId: number; messageId: number }) => toggleMessageBookmark(conversationId, messageId),
    onSuccess: (_result, variables) => {
      setFavoriteAction(null);
      queryClient.setQueriesData<BookmarkedMessageRead[]>({ queryKey: ['bookmarks-all'] }, (current) => current?.filter((item) => !(item.conversation_id === variables.conversationId && item.message.id === variables.messageId)) ?? current);
      void queryClient.invalidateQueries({ queryKey: ['bookmarks-all'] });
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    }
  });

  useEffect(() => () => clearFavoriteLongPress(), []);

  useEffect(() => {
    if (!isMobile || !imageViewer) {
      return undefined;
    }
    return registerNativeBackHandler(() => {
      setImageViewer(null);
      return true;
    }, 100);
  }, [imageViewer, isMobile]);

  if (isMobile) {
    const groupBookmarks = items.filter((item) => (item.conversation ?? conversationById.get(item.conversation_id))?.type === 'group').length;
    const directBookmarks = items.length - groupBookmarks;

    return (
      <section className="kc-qq-page flex h-full min-h-0 flex-col overflow-hidden text-[#111827]" style={transitionStyle}>
          <header className="kc-qq-home-header kc-qq-sticky-home-header mx-4 shrink-0">
            {onMobileBack ? <button type="button" onClick={onMobileBack} className="grid h-9 w-9 place-items-center rounded-full bg-white text-[#526070] shadow-sm" aria-label="返回空间"><Icon name="chevronLeft" className="h-5 w-5" /></button> : <span className="h-9 w-9" />}
            <div className="min-w-0 text-center"><h1 className="text-[17px] font-black text-[#151922]">收藏</h1><p className="text-[11px] font-bold text-[#8b95a5]">聊天收藏与重要消息</p></div>
            <button type="button" onClick={() => setFavoriteSearchOpen((open) => !open)} className="grid h-9 w-9 place-items-center rounded-full bg-white text-[#526070] shadow-sm" aria-label="搜索收藏" title="搜索收藏">
              <Icon name="search" className="h-5 w-5" />
            </button>
          </header>
          <div className="kc-qq-scroll kc-mobile-page-transition scroll-soft min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(var(--kc-native-safe-bottom,env(safe-area-inset-bottom))+24px)]">
          <section className="kc-qq-channel-hero mt-2">
            <div className="min-w-0">
              <p className="text-[13px] font-bold text-[#eaf4ff]">我的收藏</p>
              <h2 className="mt-2 text-[30px] font-black leading-none text-white">{items.length}</h2>
              <p className="mt-2 text-[13px] font-medium text-white/80">快速回看聊天里的重点消息和资料卡片。</p>
            </div>
            <span className="grid h-16 w-16 shrink-0 place-items-center rounded-[26px] bg-white/18 text-white backdrop-blur">
              <Icon name="bookmark" className="h-8 w-8" />
            </span>
          </section>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="kc-qq-channel-stat">
              <Icon name="message" className="h-5 w-5 text-[#168bff]" />
              <span>私聊收藏</span>
              <strong>{directBookmarks}</strong>
            </div>
            <div className="kc-qq-channel-stat">
              <Icon name="users" className="h-5 w-5 text-[#34c759]" />
              <span>群聊收藏</span>
              <strong>{groupBookmarks}</strong>
            </div>
          </div>

          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {filterOptions.map((option) => (
              <button key={option.key} type="button" onClick={() => setFavoriteFilter(option.key)} className={`shrink-0 rounded-full px-4 py-2 text-[13px] font-bold transition ${favoriteFilter === option.key ? 'bg-[#168bff] text-white shadow-[0_8px_18px_rgba(22,139,255,0.2)]' : 'bg-white text-[#526070]'}`}>
                {option.label}{option.key === 'direct' ? ` ${directBookmarks}` : option.key === 'group' ? ` ${groupBookmarks}` : ` ${items.length}`}
              </button>
            ))}
          </div>
          {favoriteSearchOpen ? (
            <label className="kc-qq-search-pill mt-3 h-[46px]">
              <Icon name="search" className="h-5 w-5 shrink-0 text-[#a4adba]" />
              <input value={favoriteSearch} onChange={(event) => setFavoriteSearch(event.target.value)} className="min-w-0 flex-1 border-0 bg-transparent text-[15px] font-medium outline-none text-[#111827] placeholder:text-[#a4adba]" placeholder="搜索收藏内容、会话或发送者" autoFocus />
              {favoriteSearch ? <button type="button" onClick={() => setFavoriteSearch('')} className="text-xs font-bold text-[#8b95a5]">清空</button> : null}
            </label>
          ) : null}

          <section className="kc-qq-card mt-3 overflow-hidden p-0">
            <div className="flex items-center justify-between px-4 py-3">
              <h2 className="text-[17px] font-bold text-[#151922]">最近收藏</h2>
              <span className="text-[12px] font-semibold text-[#8b95a5]">{filterLabel}</span>
            </div>
            {isLoading ? <p className="px-4 pb-4 text-[13px] text-[#8b95a5]">正在加载收藏消息...</p> : null}
            {error ? <p className="mx-4 mb-4 rounded-[18px] bg-red-50 p-4 text-[13px] text-red-500">收藏消息加载失败，请稍后重试。</p> : null}
            {!isLoading && !error && items.length === 0 ? <p className="px-4 pb-4 text-[13px] text-[#8b95a5]">暂无收藏消息。长按消息可加入收藏。</p> : null}
            {!isLoading && !error && items.length > 0 && filteredItems.length === 0 ? <p className="px-4 pb-4 text-[13px] text-[#8b95a5]">当前筛选下暂无收藏。</p> : null}
            <div>
              {filteredItems.map((item) => {
                const conversation = item.conversation ?? conversationById.get(item.conversation_id) ?? null;
                const title = conversation ? conversationDisplayTitle(conversation, currentUser) : `会话 ${item.conversation_id}`;
                return (
                  <article
                    key={`${item.conversation_id}-${item.message.id}`}
                    className="kc-qq-favorite-item select-none"
                    onPointerDown={() => startFavoriteLongPress(item)}
                    onPointerUp={finishFavoritePress}
                    onPointerCancel={finishFavoritePress}
                    onPointerLeave={finishFavoritePress}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      openFavoriteAction(item);
                    }}
                  >
                    <ConversationAvatar conversation={conversation} title={title} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center justify-between gap-3">
                        <p className="truncate text-[15px] font-bold text-[#151922]">{title}</p>
                        <span className="shrink-0 text-[11px] font-semibold text-[#b0b6c0]">{formatMessageTime(item.message.created_at)}</span>
                      </div>
                      <p className="mt-1 truncate text-[12px] font-semibold text-[#8b95a5]">{messageSenderLabel(item.message)}</p>
                      <div className="mt-2 line-clamp-2 text-[13px] leading-5 text-[#526070]">{renderMessageContentPreview(item.message, onOpenForwardBundle, openFavoriteImage)}</div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </div>
        {favoriteAction ? (
          <div className="fixed inset-0 z-[2147483647] flex items-end bg-black/35 px-3 pb-[calc(var(--kc-native-safe-bottom,env(safe-area-inset-bottom))+12px)]" onClick={() => setFavoriteAction(null)}>
            <section className="w-full overflow-hidden rounded-[28px] bg-white p-2 shadow-[0_24px_70px_rgba(15,23,42,0.28)]" onClick={(event) => event.stopPropagation()}>
              <div className="px-4 pb-2 pt-3 text-center">
                <p className="text-[15px] font-black text-[#151922]">收藏操作</p>
                <p className="mt-1 truncate text-[12px] font-semibold text-[#8b95a5]">{messageSenderLabel(favoriteAction.message)} · {formatMessageTime(favoriteAction.message.created_at)}</p>
              </div>
              <button
                type="button"
                disabled={deleteFavoriteMutation.isPending}
                onClick={() => deleteFavoriteMutation.mutate({ conversationId: favoriteAction.conversation_id, messageId: favoriteAction.message.id })}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-[18px] text-[15px] font-black text-red-500 disabled:opacity-50"
              >
                <Icon name="trash" className="h-5 w-5" />{deleteFavoriteMutation.isPending ? '删除中...' : '删除收藏'}
              </button>
              {deleteFavoriteMutation.error ? <p className="mx-2 mb-2 rounded-[16px] bg-red-50 px-3 py-2 text-center text-[12px] font-bold text-red-500">删除收藏失败，请稍后重试。</p> : null}
              <button type="button" onClick={() => setFavoriteAction(null)} className="mt-1 h-12 w-full rounded-[18px] bg-[#f4f6fa] text-[15px] font-black text-[#526070]">取消</button>
            </section>
          </div>
        ) : null}
        {imageViewer ? <ImageViewer viewer={imageViewer} mobile portal onClose={() => setImageViewer(null)} onNavigate={(index) => setImageViewer((current) => current ? { ...current, index } : current)} /> : null}
      </section>
    );
  }

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden [background:var(--kc-chat)] [color:var(--kc-text)]">
      <header className="flex h-[52px] shrink-0 items-center justify-between border-b px-5 [background:var(--kc-chat)] [border-color:var(--kc-border)]">
        <div>
          <h2 className="text-base font-semibold">我的收藏</h2>
          <p className="text-xs [color:var(--kc-muted)]">集中查看所有已收藏的消息。</p>
        </div>
      </header>
      <main className="scroll-soft min-h-0 flex-1 overflow-y-auto p-5">
        <div className="mb-4 flex flex-wrap gap-2">
          {filterOptions.map((option) => (
            <button key={option.key} type="button" onClick={() => setFavoriteFilter(option.key)} className={`rounded-full px-4 py-2 text-sm font-semibold transition ${favoriteFilter === option.key ? '[background:var(--kc-accent)] text-white' : '[background:var(--kc-panel-muted)] [color:var(--kc-muted)] hover:[color:var(--kc-text)]'}`}>
              {option.label}
            </button>
          ))}
        </div>
        {isLoading ? <p className="rounded-2xl p-4 text-sm [background:var(--kc-panel)] [color:var(--kc-muted)]">正在加载收藏消息...</p> : null}
        {error ? <p className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-500">收藏消息加载失败，请稍后重试。</p> : null}
        {!isLoading && !error && items.length === 0 ? <p className="rounded-2xl p-4 text-sm [background:var(--kc-panel)] [color:var(--kc-muted)]">暂无收藏消息。</p> : null}
        {!isLoading && !error && items.length > 0 && filteredItems.length === 0 ? <p className="rounded-2xl p-4 text-sm [background:var(--kc-panel)] [color:var(--kc-muted)]">当前筛选下暂无收藏。</p> : null}
        <div className="grid gap-3">
          {filteredItems.map((item) => {
            const conversation = item.conversation ?? conversationById.get(item.conversation_id) ?? null;
            const title = conversation ? conversationDisplayTitle(conversation, currentUser) : `会话 ${item.conversation_id}`;
            return (
              <article key={`${item.conversation_id}-${item.message.id}`} className="rounded-2xl border p-3 [background:var(--kc-panel)] [border-color:var(--kc-border)]">
                <div className="mb-3 flex items-center gap-3 border-b pb-3 [border-color:var(--kc-border)]">
                  <ConversationAvatar conversation={conversation} title={title} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{title}</p>
                    <p className="truncate text-xs [color:var(--kc-muted)]">{conversation?.type === 'group' ? '群聊' : '私聊'} · {formatMessageTime(item.message.created_at)}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Avatar user={item.message.sender} label={messageSenderLabel(item.message)} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs [color:var(--kc-muted)]">
                      <span className="font-semibold [color:var(--kc-text)]">{messageSenderLabel(item.message)}</span>
                    </div>
                    <div className="mt-2">{renderMessageContentPreview(item.message, onOpenForwardBundle, openFavoriteImage)}</div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </main>
      {imageViewer ? <ImageViewer viewer={imageViewer} portal onClose={() => setImageViewer(null)} onNavigate={(index) => setImageViewer((current) => current ? { ...current, index } : current)} /> : null}
    </section>
  );
}

function messageListPreviewText(message: Message): string {
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

function renderMessageContentPreview(message: Message, onOpenForwardBundle: (message: Message) => void, onOpenImage?: (images: string[], index: number) => void): JSX.Element {
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

interface ForwardTargetModalProps {
  conversations: Conversation[];
  currentUser: User;
  activeConversationId: number;
  messageIds: number[];
  isPending: boolean;
  onConfirm: (targetConversationId: number, note?: string) => void;
  onClose: () => void;
}

function ForwardTargetModal({ conversations, currentUser, activeConversationId, messageIds, isPending, onConfirm, onClose }: ForwardTargetModalProps): JSX.Element {
  const [query, setQuery] = useState('');
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const cleanQuery = query.trim().toLowerCase();
  const filteredConversations = conversations.filter((conversation) => {
    const title = conversationDisplayTitle(conversation, currentUser);
    return !cleanQuery || title.toLowerCase().includes(cleanQuery) || String(conversation.id).includes(cleanQuery);
  });
  const selectedConversation = conversations.find((conversation) => conversation.id === selectedConversationId) ?? null;

  return (
    <div className="kc-mobile-overlay fixed inset-0 z-[2147483646] grid place-items-center p-4 [background:rgba(15,23,42,0.24)]" onMouseDown={onClose}>
      <div onMouseDown={(event) => event.stopPropagation()} className="kc-mobile-dialog flex h-[min(640px,88vh)] w-full max-w-[760px] flex-col overflow-hidden rounded-[26px] border shadow-float [background:var(--kc-panel)] [border-color:var(--kc-border)] [color:var(--kc-text)]">
        <header className="flex items-center justify-between gap-3 border-b p-4 [border-color:var(--kc-border)]">
          <div>
            <h2 className="text-base font-semibold">转发聊天记录</h2>
            <p className="mt-1 text-xs [color:var(--kc-muted)]">已选择 {messageIds.length} 条消息，选择一个会话发送合并转发。</p>
          </div>
          <button type="button" onClick={onClose} className="kc-icon-button h-8 w-8" aria-label="关闭转发">
            <Icon name="close" className="h-4 w-4" />
          </button>
        </header>
        <main className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(0,1fr)_280px]">
          <section className="flex min-h-0 flex-col border-r [border-color:var(--kc-border)]">
            <div className="p-3">
              <label className="flex h-10 items-center gap-2 rounded-2xl border px-3 [background:var(--kc-panel-muted)] [border-color:var(--kc-border)] focus-within:[border-color:var(--kc-accent)]">
                <Icon name="search" className="h-4 w-4 shrink-0 [color:var(--kc-muted)]" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索会话" className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none [color:var(--kc-text)] placeholder:[color:var(--kc-muted)]" autoFocus />
              </label>
            </div>
            <div className="scroll-soft min-h-0 flex-1 overflow-y-auto px-2 pb-3">
              {filteredConversations.length === 0 ? <p className="rounded-2xl p-4 text-sm [background:var(--kc-panel-muted)] [color:var(--kc-muted)]">没有找到匹配会话。</p> : null}
              <div className="grid gap-1">
                {filteredConversations.map((conversation) => {
                  const title = conversationDisplayTitle(conversation, currentUser);
                  const active = conversation.id === selectedConversationId;
                  const current = conversation.id === activeConversationId;
                  return (
                    <button key={conversation.id} type="button" onClick={() => setSelectedConversationId(conversation.id)} className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition ${active ? '[background:var(--kc-active)]' : 'hover:[background:var(--kc-hover)]'}`}>
                      <ConversationAvatar conversation={conversation} title={title} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{title}{current ? '（当前）' : ''}</span>
                        <span className="mt-0.5 block truncate text-xs [color:var(--kc-muted)]">{conversation.type === 'group' ? `群聊 · ${conversation.member_count ?? 0} 人` : '私聊'}</span>
                      </span>
                      {active ? <Icon name="check" className="h-4 w-4 shrink-0 [color:var(--kc-accent)]" /> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>
          <section className="flex min-h-0 flex-col p-4">
            <h3 className="text-sm font-semibold">发送给</h3>
            <div className="mt-3 rounded-2xl border p-3 [border-color:var(--kc-border)] [background:var(--kc-panel-muted)]">
              {selectedConversation ? (
                <div className="flex items-center gap-3">
                  <ConversationAvatar conversation={selectedConversation} title={conversationDisplayTitle(selectedConversation, currentUser)} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{conversationDisplayTitle(selectedConversation, currentUser)}</p>
                    <p className="text-xs [color:var(--kc-muted)]">{selectedConversation.type === 'group' ? '群聊' : '私聊'}</p>
                  </div>
                </div>
              ) : <p className="text-sm [color:var(--kc-muted)]">请从左侧选择一个会话</p>}
            </div>
            <label className="mt-4 block text-sm font-semibold" htmlFor="forward-note">附言</label>
            <textarea id="forward-note" value={note} onChange={(event) => setNote(event.target.value)} rows={4} placeholder="可选，添加一段说明" className="scroll-soft mt-2 resize-none rounded-2xl border bg-transparent p-3 text-sm outline-none [border-color:var(--kc-border)] [color:var(--kc-text)] placeholder:[color:var(--kc-muted)] focus:[border-color:var(--kc-accent)]" />
            <div className="mt-auto flex items-center justify-end gap-2 pt-4">
              <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-semibold transition hover:[background:var(--kc-hover)]">取消</button>
              <button type="button" disabled={!selectedConversationId || isPending} onClick={() => selectedConversationId ? onConfirm(selectedConversationId, note) : undefined} className="liquid-button rounded-xl px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-45">
                {isPending ? '转发中...' : '确认转发'}
              </button>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

interface FeaturedMessagesModalProps {
  items: FeaturedMessageItem[];
  isLoading: boolean;
  error: unknown;
  canManage: boolean;
  isToggling: boolean;
  onToggleFeature: (message: Message) => void;
  onOpenForwardBundle: (message: Message) => void;
  onClose: () => void;
}

function FeaturedMessagesModal({ items, isLoading, error, canManage, isToggling, onToggleFeature, onOpenForwardBundle, onClose, mobile = false }: FeaturedMessagesModalProps & { mobile?: boolean }): JSX.Element {
  const messages = items.map(featuredItemMessage).filter((message): message is Message => message !== null);

  useEffect(() => {
    if (!mobile) {
      return undefined;
    }
    return registerNativeBackHandler(() => {
      onClose();
      return true;
    }, 170);
  }, [mobile, onClose]);

  if (mobile) {
    return (
      <div className="fixed inset-0 z-[2147483646] flex min-h-0 w-screen max-w-[100vw] flex-col overflow-hidden [background:var(--kc-mobile-chat)] [color:var(--kc-text)]">
        <header className="flex min-h-[calc(max(44px,env(safe-area-inset-top))+58px)] shrink-0 items-end justify-between gap-3 px-4 pb-3 pt-[max(44px,env(safe-area-inset-top))] [background:var(--kc-mobile-chat)]">
          <button type="button" onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-full [color:var(--kc-text)] active:[background:var(--kc-hover)]" aria-label="返回聊天">
            <Icon name="chevronLeft" className="h-6 w-6" />
          </button>
          <div className="min-w-0 flex-1 text-center">
            <h2 className="truncate text-[18px] font-black">群精华消息</h2>
            <p className="mt-1 truncate text-[12px] font-medium [color:var(--kc-muted)]">集中查看群主或管理员设为精华的消息。</p>
          </div>
          <span className="h-10 w-10 shrink-0" />
        </header>
        <main className="scroll-soft min-h-0 flex-1 overflow-y-auto p-4 [background:var(--kc-mobile-chat)]">
          {isLoading ? <p className="rounded-2xl p-4 text-sm [background:var(--kc-panel)] [color:var(--kc-muted)]">正在加载精华消息...</p> : null}
          {error ? <p className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-500">精华消息加载失败，请稍后重试。</p> : null}
          {!isLoading && !error && messages.length === 0 ? <p className="rounded-2xl p-4 text-sm [background:var(--kc-panel)] [color:var(--kc-muted)]">暂无精华消息。</p> : null}
          <div className="grid gap-3">
            {messages.map((message) => (
              <article key={message.id} className="rounded-2xl border p-3 [background:var(--kc-panel)] [border-color:var(--kc-border)]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs [color:var(--kc-muted)]">
                      <span className="font-semibold [color:var(--kc-text)]">{messageSenderLabel(message)}</span>
                      <span>{formatMessageTime(message.created_at)}</span>
                    </div>
                    <div className="mt-2">{renderMessageContentPreview(message, onOpenForwardBundle)}</div>
                  </div>
                  {canManage ? (
                    <button type="button" disabled={isToggling} onClick={() => onToggleFeature(message)} className="shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold text-red-500 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-45">
                      移出精华
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="kc-mobile-overlay fixed inset-0 z-[2147483646] grid place-items-center p-4 [background:rgba(15,23,42,0.24)]" onMouseDown={onClose}>
      <div onMouseDown={(event) => event.stopPropagation()} className="kc-mobile-dialog flex h-[min(680px,88vh)] w-full max-w-[620px] flex-col overflow-hidden rounded-[26px] border shadow-float [background:var(--kc-panel)] [border-color:var(--kc-border)] [color:var(--kc-text)]">
        <header className="flex items-center justify-between gap-3 border-b p-4 [border-color:var(--kc-border)]">
          <div>
            <h2 className="text-base font-semibold">群精华消息</h2>
            <p className="mt-1 text-xs [color:var(--kc-muted)]">集中查看群主或管理员设为精华的消息。</p>
          </div>
          <button type="button" onClick={onClose} className="kc-icon-button h-8 w-8" aria-label="关闭群精华">
            <Icon name="close" className="h-4 w-4" />
          </button>
        </header>
        <main className="scroll-soft min-h-0 flex-1 overflow-y-auto p-4 [background:var(--kc-chat)]">
          {isLoading ? <p className="rounded-2xl p-4 text-sm [background:var(--kc-panel)] [color:var(--kc-muted)]">正在加载精华消息...</p> : null}
          {error ? <p className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-500">精华消息加载失败，请稍后重试。</p> : null}
          {!isLoading && !error && messages.length === 0 ? <p className="rounded-2xl p-4 text-sm [background:var(--kc-panel)] [color:var(--kc-muted)]">暂无精华消息。</p> : null}
          <div className="grid gap-3">
            {messages.map((message) => (
              <article key={message.id} className="rounded-2xl border p-3 [background:var(--kc-panel)] [border-color:var(--kc-border)]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs [color:var(--kc-muted)]">
                      <span className="font-semibold [color:var(--kc-text)]">{messageSenderLabel(message)}</span>
                      <span>{formatMessageTime(message.created_at)}</span>
                    </div>
                    <div className="mt-2">{renderMessageContentPreview(message, onOpenForwardBundle)}</div>
                  </div>
                  {canManage ? (
                    <button type="button" disabled={isToggling} onClick={() => onToggleFeature(message)} className="shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold text-red-500 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-45">
                      移出精华
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}

function renderLinkedPreview(text: string): Array<string | JSX.Element> {
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

function ChatSearchModal({ conversationId, title, mobile = false, onOpenForwardBundle, onOpenImage, onJump, onClose }: ChatSearchModalProps): JSX.Element {
  const [inputValue, setInputValue] = useState('');
  const [submittedKeyword, setSubmittedKeyword] = useState('');
  const cleanKeyword = submittedKeyword.trim();
  const searchQuery = useInfiniteQuery({
    queryKey: ['messages-search', conversationId, cleanKeyword],
    queryFn: ({ pageParam }) => searchConversationMessages(conversationId, { query: cleanKeyword, category: 'all', beforeId: pageParam, limit: MESSAGE_PAGE_SIZE }),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) => lastPage.has_more ? lastPage.next_before_id ?? undefined : undefined,
    enabled: cleanKeyword.length > 0
  });
  const results = searchQuery.data?.pages.flatMap((page) => page.items.map((item) => item.message)) ?? [];

  function submitSearch(event?: React.FormEvent<HTMLFormElement>): void {
    event?.preventDefault();
    setSubmittedKeyword(inputValue.trim());
  }

  function jumpAndClose(messageId: number): void {
    onJump(messageId);
    if (mobile) {
      onClose();
    }
  }

  useEffect(() => {
    if (!mobile) {
      return undefined;
    }
    return registerNativeBackHandler(() => {
      onClose();
      return true;
    }, 170);
  }, [mobile, onClose]);

  if (mobile) {
    return (
      <div className="fixed inset-0 z-[2147483646] flex min-h-0 w-screen max-w-[100vw] flex-col overflow-hidden [background:var(--kc-mobile-chat)] [color:var(--kc-text)]">
        <header className="shrink-0 px-4 pb-3 pt-[max(44px,env(safe-area-inset-top))] [background:var(--kc-mobile-chat)]">
          <div className="flex min-h-[58px] items-end justify-between gap-3">
            <button type="button" onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-full [color:var(--kc-text)] active:[background:var(--kc-hover)]" aria-label="返回聊天">
              <Icon name="chevronLeft" className="h-6 w-6" />
            </button>
            <div className="min-w-0 flex-1 text-center">
              <h2 className="truncate text-[18px] font-black">搜索聊天记录</h2>
              <p className="mt-1 truncate text-[12px] font-medium [color:var(--kc-muted)]">{title} · 覆盖完整历史记录</p>
            </div>
            <span className="h-10 w-10 shrink-0" />
          </div>
          <form onSubmit={submitSearch} className="mt-3 flex items-center gap-2">
            <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-[18px] border px-3 [background:var(--kc-panel)] [border-color:var(--kc-border)] focus-within:[border-color:var(--kc-accent)]">
              <Icon name="search" className="h-4 w-4 shrink-0 [color:var(--kc-muted)]" />
              <input value={inputValue} onChange={(event) => setInputValue(event.target.value)} className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none [color:var(--kc-text)] placeholder:[color:var(--kc-muted)]" placeholder="搜索聊天内容、发送者" autoFocus />
            </label>
            <button type="submit" disabled={!inputValue.trim()} className="liquid-button h-11 shrink-0 rounded-[18px] px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-45">搜索</button>
          </form>
        </header>
        <main className="scroll-soft min-h-0 flex-1 overflow-y-auto p-4 [background:var(--kc-mobile-chat)]">
          {!cleanKeyword ? <p className="rounded-2xl p-4 text-sm [background:var(--kc-panel)] [color:var(--kc-muted)]">输入关键词后可搜索当前会话的完整历史消息。</p> : null}
          {searchQuery.isLoading ? <p className="rounded-2xl p-4 text-sm [background:var(--kc-panel)] [color:var(--kc-muted)]">正在搜索聊天记录...</p> : null}
          {searchQuery.error ? <p className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-500">聊天记录搜索失败，请稍后重试。</p> : null}
          {cleanKeyword && !searchQuery.isLoading && !searchQuery.error && results.length === 0 ? <p className="rounded-2xl p-4 text-sm [background:var(--kc-panel)] [color:var(--kc-muted)]">没有找到匹配聊天记录。</p> : null}
          <div className="grid gap-3">
            {results.map((message) => (
              <button key={message.id} type="button" onClick={() => jumpAndClose(message.id)} className="rounded-2xl border p-3 text-left transition active:[background:var(--kc-hover)] [background:var(--kc-panel)] [border-color:var(--kc-border)]">
                <div className="mb-2 flex items-center justify-between gap-3 text-xs [color:var(--kc-muted)]">
                  <span className="min-w-0 truncate font-semibold [color:var(--kc-text)]">{messageSenderLabel(message)}</span>
                  <span className="shrink-0">{formatMessageTime(message.created_at)}</span>
                </div>
                <div>{renderMessageContentPreview(message, onOpenForwardBundle, onOpenImage)}</div>
              </button>
            ))}
          </div>
          {searchQuery.hasNextPage ? (
            <button type="button" disabled={searchQuery.isFetchingNextPage} onClick={() => void searchQuery.fetchNextPage()} className="mt-4 w-full rounded-2xl border px-4 py-3 text-sm font-semibold transition active:[background:var(--kc-hover)] disabled:cursor-not-allowed disabled:opacity-45 [border-color:var(--kc-border)]">
              {searchQuery.isFetchingNextPage ? '加载中...' : '加载更多历史结果'}
            </button>
          ) : null}
        </main>
      </div>
    );
  }

  return (
    <div className="kc-mobile-overlay fixed inset-0 z-[2147483646] grid place-items-center p-4 [background:rgba(15,23,42,0.24)]" onMouseDown={onClose}>
      <div onMouseDown={(event) => event.stopPropagation()} className="kc-mobile-dialog flex h-[min(680px,88vh)] w-full max-w-[620px] flex-col overflow-hidden rounded-[26px] border shadow-float [background:var(--kc-panel)] [border-color:var(--kc-border)] [color:var(--kc-text)]">
        <header className="border-b p-4 [background:var(--kc-panel)] [border-color:var(--kc-border)]">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold">搜索聊天记录</h2>
              <p className="mt-1 truncate text-xs [color:var(--kc-muted)]">{title} · 覆盖完整历史记录</p>
            </div>
            <button type="button" onClick={onClose} className="kc-icon-button h-8 w-8" aria-label="关闭聊天记录搜索">
              <Icon name="close" className="h-4 w-4" />
            </button>
          </div>
          <form onSubmit={submitSearch} className="flex items-center gap-2">
            <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-2xl border px-3 [background:var(--kc-panel-muted)] [border-color:var(--kc-border)] focus-within:[border-color:var(--kc-accent)]">
              <Icon name="search" className="h-4 w-4 shrink-0 [color:var(--kc-muted)]" />
              <input value={inputValue} onChange={(event) => setInputValue(event.target.value)} className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none [color:var(--kc-text)] placeholder:[color:var(--kc-muted)]" placeholder="搜索聊天内容、发送者" autoFocus />
            </label>
            <button type="submit" disabled={!inputValue.trim()} className="liquid-button h-11 rounded-2xl px-5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-45">搜索</button>
          </form>
        </header>
        <main className="scroll-soft min-h-0 flex-1 overflow-y-auto p-4">
          {!cleanKeyword ? <p className="rounded-2xl p-4 text-sm [background:var(--kc-panel-muted)] [color:var(--kc-muted)]">输入关键词后可搜索当前会话的完整历史消息。</p> : null}
          {searchQuery.isLoading ? <p className="rounded-2xl p-4 text-sm [background:var(--kc-panel-muted)] [color:var(--kc-muted)]">正在搜索聊天记录...</p> : null}
          {searchQuery.error ? <p className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-500">聊天记录搜索失败，请稍后重试。</p> : null}
          {cleanKeyword && !searchQuery.isLoading && !searchQuery.error && results.length === 0 ? <p className="rounded-2xl p-4 text-sm [background:var(--kc-panel-muted)] [color:var(--kc-muted)]">没有找到匹配聊天记录。</p> : null}
          <div className="grid gap-3">
            {results.map((message) => (
              <button key={message.id} type="button" onClick={() => onJump(message.id)} className="rounded-2xl border p-3 text-left transition hover:[background:var(--kc-hover)] [background:var(--kc-panel)] [border-color:var(--kc-border)]">
                <div className="mb-2 flex items-center justify-between gap-3 text-xs [color:var(--kc-muted)]">
                  <span className="min-w-0 truncate font-semibold [color:var(--kc-text)]">{messageSenderLabel(message)}</span>
                  <span className="shrink-0">{formatMessageTime(message.created_at)}</span>
                </div>
                <div>{renderMessageContentPreview(message, onOpenForwardBundle, onOpenImage)}</div>
              </button>
            ))}
          </div>
          {searchQuery.hasNextPage ? (
            <button type="button" disabled={searchQuery.isFetchingNextPage} onClick={() => void searchQuery.fetchNextPage()} className="mt-4 w-full rounded-2xl border px-4 py-3 text-sm font-semibold transition hover:[background:var(--kc-hover)] disabled:cursor-not-allowed disabled:opacity-45 [border-color:var(--kc-border)]">
              {searchQuery.isFetchingNextPage ? '加载中...' : '加载更多历史结果'}
            </button>
          ) : null}
        </main>
      </div>
    </div>
  );
}

function fieldText(value?: string | null): string {
  return value?.trim().toLowerCase() ?? '';
}

function matchesMember(member: ConversationMember, keyword: string): boolean {
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

function fallbackCopyText(value: string): void {
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.append(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

function copyText(value: string): void {
  if (navigator.clipboard?.writeText) {
    void navigator.clipboard.writeText(value).catch(() => fallbackCopyText(value));
    return;
  }

  fallbackCopyText(value);
}

function isNearBottom(element: HTMLElement | null): boolean {
  if (!element) {
    return true;
  }

  return element.scrollHeight - element.scrollTop - element.clientHeight < 180;
}

function scrollMessagesToBottom(element: HTMLElement | null, behavior: ScrollBehavior = 'auto'): void {
  if (!element) {
    return;
  }

  const top = Math.max(0, element.scrollHeight - element.clientHeight);
  if (behavior === 'auto') {
    element.scrollTop = top;
    return;
  }

  element.scrollTo({ top, behavior });
}

function forceScrollMessagesToBottom(element: HTMLElement | null): void {
  if (!element) {
    return;
  }

  const previousScrollBehavior = element.style.scrollBehavior;
  element.style.scrollBehavior = 'auto';
  scrollMessagesToBottom(element, 'auto');
  element.style.scrollBehavior = previousScrollBehavior;
}

function patchMessageInPages(data: MessagesInfiniteData | undefined, messageId: number, updater: (message: Message) => Message): MessagesInfiniteData | undefined {
  if (!data) {
    return data;
  }

  let changed = false;
  const pages = data.pages.map((page) => page.map((message) => {
    if (message.id !== messageId) {
      return message;
    }
    changed = true;
    return updater(message);
  }));
  return changed ? { ...data, pages } : data;
}

function upsertMessageIntoFirstPage(data: MessagesInfiniteData | undefined, message: Message): MessagesInfiniteData | undefined {
  if (!data || data.pages.length === 0) {
    return data;
  }

  let exists = false;
  const pages = data.pages.map((page) => page.map((item) => {
    if (item.id !== message.id) {
      return item;
    }
    exists = true;
    return { ...item, ...message };
  }));

  if (exists) {
    return { ...data, pages };
  }

  return {
    ...data,
    pages: [[...data.pages[0], message].sort((a, b) => a.id - b.id), ...data.pages.slice(1)]
  };
}

function replaceMessagesWithContextPage(messages: Message[], pageSize: number = MESSAGE_PAGE_SIZE): MessagesInfiniteData {
  const uniqueMessages = Array.from(new Map(messages.map((message) => [message.id, message])).values()).sort((a, b) => a.id - b.id);
  return {
    pages: [uniqueMessages],
    pageParams: [uniqueMessages.length >= pageSize ? uniqueMessages[0]?.id : undefined]
  };
}

function appendNewerMessagesIntoFirstPage(data: MessagesInfiniteData | undefined, messages: Message[]): MessagesInfiniteData | undefined {
  if (!data || data.pages.length === 0 || messages.length === 0) {
    return data;
  }

  const firstPage = data.pages[0] ?? [];
  const mergedFirstPage = Array.from(new Map([...firstPage, ...messages].map((message) => [message.id, message])).values()).sort((a, b) => a.id - b.id);
  return {
    ...data,
    pages: [mergedFirstPage, ...data.pages.slice(1)]
  };
}

export function MessagePanel({ conversations, currentUser, currentRole = 'member', members = [], friends = [], membersLoading = false, membersHasMore = false, membersLoadingMore = false, isMobile = false, mobileBackUnreadCount = 0, onMembersNeeded, onLoadMoreMembers, onMemberSearchChange, onOpenPost, onBack }: MessagePanelProps): JSX.Element {
  const isNativeApp = isNativeMobileApp();
  const [draft, setDraft] = useState('');
  const [stagedImages, setStagedImages] = useState<StagedImage[]>([]);
  const [stagedVoice, setStagedVoice] = useState<StagedVoice | null>(null);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [mobileVoiceMode, setMobileVoiceMode] = useState(false);
  const [mobileVoicePreparing, setMobileVoicePreparing] = useState(false);
  const [mobileVoiceCanceling, setMobileVoiceCanceling] = useState(false);
  const [voiceRecordingMs, setVoiceRecordingMs] = useState(0);
  const [quote, setQuote] = useState<MessageQuoteMetadata | null>(null);
  const [mentions, setMentions] = useState<MessageMentionMetadata[]>([]);
  const [mentionAll, setMentionAll] = useState(false);
  const [mentionPicker, setMentionPicker] = useState<MentionPickerState | null>(null);
  const [messageMenu, setMessageMenu] = useState<MessageMenuState | null>(null);
  const [memberMenu, setMemberMenu] = useState<MemberMenuState | null>(null);
  const [memberMuteStatusByKey, setMemberMuteStatusByKey] = useState<Record<string, MemberMuteStatus>>({});
  const [userCard, setUserCard] = useState<CardState | null>(null);
  const [mobileUserProfile, setMobileUserProfile] = useState<UserProfilePageState | null>(null);
  const [reactionPicker, setReactionPicker] = useState<ReactionPickerState | null>(null);
  const [showInfoDrawer, setShowInfoDrawer] = useState(false);
  const [showAnnouncements, setShowAnnouncements] = useState(false);
  const [showMemberSearch, setShowMemberSearch] = useState(false);
  const [showChatSearch, setShowChatSearch] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [emojiPickerTab, setEmojiPickerTab] = useState<EmojiPickerTab>('emoji');
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<number[]>([]);
  const [forwardTarget, setForwardTarget] = useState<ForwardTargetState | null>(null);
  const [reportTarget, setReportTarget] = useState<ReportTargetState | null>(null);
  const [forwardDetailMessage, setForwardDetailMessage] = useState<Message | null>(null);
  const [imageViewer, setImageViewer] = useState<ImageViewerState | null>(null);
  const [showFeaturedMessages, setShowFeaturedMessages] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [actionError, setActionError] = useState('');
  const [toast, setToast] = useState<ToastState | null>(null);
  const [locallyPendingFriendIds, setLocallyPendingFriendIds] = useState<Set<number>>(() => new Set());
  const [customMute, setCustomMute] = useState<CustomMuteState | null>(null);
  const [showMuteSubmenu, setShowMuteSubmenu] = useState(false);
  const [jumpHighlightMessageId, setJumpHighlightMessageId] = useState<number | null>(null);
  const [jumpContextMessageId, setJumpContextMessageId] = useState<number | null>(null);
  const [isFetchingNewerContext, setIsFetchingNewerContext] = useState(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const overlayRootRef = useRef<HTMLElement | null>(null);
  const lastMessageIdRef = useRef<number | null>(null);
  const lastConversationIdRef = useRef<number | null>(null);
  const stickToBottomRef = useRef(true);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const memberSearchInputRef = useRef<HTMLInputElement | null>(null);
  const composerRef = useRef<HTMLDivElement | null>(null);
  const jumpHighlightTimeoutRef = useRef<number | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);
  const toastRemoveTimeoutRef = useRef<number | null>(null);
  const toastIdRef = useRef(0);
  const muteSubmenuCloseTimeoutRef = useRef<number | null>(null);
  const emojiPickerRef = useRef<HTMLDivElement | null>(null);
  const preserveScrollSnapshotRef = useRef<{ conversationId: number; messageId: number | null; offsetTop: number; height: number; top: number } | null>(null);
  const newerContextFetchRef = useRef(false);
  const reachedLatestInContextRef = useRef(false);
  const contextBottomArmedRef = useRef(false);
  const pendingScrollToLatestRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceStreamRef = useRef<MediaStream | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);
  const voiceRecordStartedAtRef = useRef(0);
  const voiceRecordTimerRef = useRef<number | null>(null);
  const voiceRecordCancelledRef = useRef(false);
  const voiceRecordAutoSendRef = useRef(false);
  const mobileVoicePointerIdRef = useRef<number | null>(null);
  const mobileVoiceStartYRef = useRef(0);
  const mobileVoiceCancelAfterStartRef = useRef(false);
  const mobileEnterKeyDownAtRef = useRef<number | null>(null);
  const mobileEnterSkipNextBeforeInputRef = useRef(false);
  const activeConversationId = useKukeStore((state) => state.activeConversationId);
  const setActiveConversationId = useKukeStore((state) => state.setActiveConversationId);
  const openPost = useKukeStore((state) => state.openPost);
  const visibleConversationId = useKukeStore((state) => state.visibleConversationId);
  const setVisibleConversationId = useKukeStore((state) => state.setVisibleConversationId);
  const pendingJumpMessage = useKukeStore((state) => state.pendingJumpMessage);
  const clearPendingJumpMessage = useKukeStore((state) => state.clearPendingJumpMessage);
  const pendingTaskCreateConversationId = useKukeStore((state) => state.pendingTaskCreateConversationId);
  const clearPendingTaskCreate = useKukeStore((state) => state.clearPendingTaskCreate);
  const openTaskCenter = useKukeStore((state) => state.openTaskCenter);
  const chatTaskDetailId = useKukeStore((state) => state.chatTaskDetailId);
  const openChatTaskDetail = useKukeStore((state) => state.openChatTaskDetail);
  const closeChatTaskDetail = useKukeStore((state) => state.closeChatTaskDetail);
  const queryClient = useQueryClient();
  const activeConversation = conversations.find((conversation) => conversation.id === activeConversationId);
  const [taskComposerOpen, setTaskComposerOpen] = useState(false);
  const [showGroupTasks, setShowGroupTasks] = useState(false);
  const [subtaskParent, setSubtaskParent] = useState<{ conversationId: number; parentId: number } | null>(null);
  const canCreateTask = activeConversation?.type === 'group'
    && Boolean(activeConversation?.tasks_enabled)
    && (activeConversation?.task_creation_permission !== 'admins' || currentRole === 'owner' || currentRole === 'admin');
  const isTaskAssistantChat = activeConversation?.type === 'direct' && activeConversation?.direct_user?.username === 'task_assistant';

  useEffect(() => {
    if (pendingTaskCreateConversationId != null && pendingTaskCreateConversationId === activeConversationId) {
      setTaskComposerOpen(true);
      clearPendingTaskCreate();
    }
  }, [pendingTaskCreateConversationId, activeConversationId, clearPendingTaskCreate]);

  const messagesQuery = useInfiniteQuery({
    queryKey: ['messages', activeConversationId],
    queryFn: ({ pageParam }) => getMessages(activeConversationId ?? 0, { beforeId: pageParam, limit: MESSAGE_PAGE_SIZE }),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) => lastPage.length < MESSAGE_PAGE_SIZE ? undefined : lastPage[0]?.id,
    enabled: Boolean(activeConversationId)
  });
  const messagePages = messagesQuery.data?.pages;
  const latestMessageId = messagePages?.[0]?.[messagePages[0].length - 1]?.id ?? null;
  const messages = messagePages ? [...messagePages].reverse().flat() : [];

  function openInfoDrawer(): void {
    onMembersNeeded?.();
    runNativeRouteTransition('forward', () => setShowInfoDrawer(true), isMobile && isNativeApp);
  }

  function closeInfoDrawer(): void {
    runNativeRouteTransition('back', () => setShowInfoDrawer(false), isMobile && isNativeApp);
  }

  useEffect(() => {
    setVisibleConversationId(activeConversationId ?? null);
    return () => {
      setVisibleConversationId(null);
    };
  }, [activeConversationId, setVisibleConversationId]);

  const featuredMessagesQuery = useQuery({
    queryKey: ['featured-messages', activeConversationId],
    queryFn: () => getFeaturedMessages(activeConversationId ?? 0),
    enabled: Boolean(activeConversationId && activeConversation?.type === 'group' && showFeaturedMessages)
  });

  const favoriteStickersQuery = useQuery({
    queryKey: ['favorite-stickers'],
    queryFn: getFavoriteStickers,
    enabled: showEmojiPicker && emojiPickerTab === 'stickers',
    staleTime: 30_000
  });

  const activeMentionQuery = mentionPicker?.query.trim() ?? '';
  const mentionMembersQuery = useQuery({
    queryKey: ['conversation-members', activeConversationId, 'mention-search', activeMentionQuery],
    queryFn: () => searchConversationMembers(activeConversationId ?? 0, activeMentionQuery, 8),
    enabled: Boolean(activeConversationId && activeConversation?.type === 'group' && mentionPicker),
    staleTime: 15_000
  });

  const outgoingFriendRequestsQuery = useQuery({
    queryKey: ['friend-requests', 'outgoing'],
    queryFn: getOutgoingFriendRequests,
    staleTime: 15_000
  });

  const invalidateMessages = (conversationId = activeConversationId): void => {
    if (conversationId) {
      void queryClient.resetQueries({ queryKey: ['messages', conversationId], exact: true });
      void queryClient.invalidateQueries({ queryKey: ['featured-messages', conversationId] });
    }
    void queryClient.invalidateQueries({ queryKey: ['bookmarks-all'] });
    void queryClient.invalidateQueries({ queryKey: ['conversations'] });
  };

  const patchCachedMessage = (conversationId: number, messageId: number, updater: (message: Message) => Message): void => {
    queryClient.setQueryData<MessagesInfiniteData | undefined>(['messages', conversationId], (current) => patchMessageInPages(current, messageId, updater));
  };

  const upsertCachedMessage = (conversationId: number, message: Message): void => {
    queryClient.setQueryData<MessagesInfiniteData | undefined>(['messages', conversationId], (current) => upsertMessageIntoFirstPage(current, message));
    queryClient.setQueryData<Conversation[] | undefined>(['conversations'], (current) => applyLatestMessageToConversations(current, message, { visibleConversationId: conversationId }));
  };

  const patchMemberTitleCaches = (conversationId: number, userId: number, title: string | null): void => {
    queryClient.setQueryData<ConversationMember[] | undefined>(['conversation-members', conversationId], (current) => current?.map((member) => (
      memberUserId(member) === userId ? { ...member, title } : member
    )));
    queryClient.setQueriesData<ConversationMembersPageData | undefined>({ queryKey: ['conversation-members-page', conversationId] }, (current) => current ? {
      ...current,
      pages: current.pages.map((page) => ({
        ...page,
        items: page.items.map((member) => (memberUserId(member) === userId ? { ...member, title } : member))
      }))
    } : current);
    queryClient.setQueryData<MessagesInfiniteData | undefined>(['messages', conversationId], (current) => current ? {
      ...current,
      pages: current.pages.map((page) => page.map((message) => (
        message.sender_id === userId ? { ...message, sender_title: title } : message
      )))
    } : current);
  };

  const patchMemberMuteCaches = (conversationId: number, userId: number, muted: boolean, mutedUntil: string | null = null): void => {
    const key = `${conversationId}:${userId}`;
    setMemberMuteStatusByKey((current) => ({ ...current, [key]: { muted, muted_until: mutedUntil } }));
    queryClient.setQueryData<ConversationMember[] | undefined>(['conversation-members', conversationId], (current) => current?.map((member) => (
      memberUserId(member) === userId ? { ...member, muted, muted_until: mutedUntil } : member
    )));
    queryClient.setQueriesData<ConversationMembersPageData | undefined>({ queryKey: ['conversation-members-page', conversationId] }, (current) => current ? {
      ...current,
      pages: current.pages.map((page) => ({
        ...page,
        items: page.items.map((member) => (memberUserId(member) === userId ? { ...member, muted, muted_until: mutedUntil } : member))
      }))
    } : current);
  };

  const cachedMemberFromQueries = (conversationId: number, userId: number): ConversationMember | null => {
    const listMember = queryClient.getQueryData<ConversationMember[] | undefined>(['conversation-members', conversationId])?.find((member) => memberUserId(member) === userId);
    if (listMember) {
      return listMember;
    }
    const pageQueries = queryClient.getQueriesData<ConversationMembersPageData>({ queryKey: ['conversation-members-page', conversationId] });
    for (const [, data] of pageQueries) {
      const pageMember = data?.pages.flatMap((page) => page.items).find((member) => memberUserId(member) === userId);
      if (pageMember) {
        return pageMember;
      }
    }
    return null;
  };

  const patchFullMemberCaches = (conversationId: number, updatedMember: ConversationMember): void => {
    const userId = memberUserId(updatedMember);
    if (!userId) {
      return;
    }
    setMemberMuteStatusByKey((current) => ({
      ...current,
      [`${conversationId}:${userId}`]: { muted: Boolean(updatedMember.muted), muted_until: updatedMember.muted_until ?? null }
    }));
    queryClient.setQueryData<ConversationMember[] | undefined>(['conversation-members', conversationId], (current) => current?.map((member) => (
      memberUserId(member) === userId ? { ...member, ...updatedMember } : member
    )));
    queryClient.setQueriesData<ConversationMembersPageData | undefined>({ queryKey: ['conversation-members-page', conversationId] }, (current) => current ? {
      ...current,
      pages: current.pages.map((page) => ({
        ...page,
        items: page.items.map((member) => (memberUserId(member) === userId ? { ...member, ...updatedMember } : member))
      }))
    } : current);
  };

  const openImageViewer = (images: string[], index: number): void => {
    const cleanedImages = images.filter((image) => image.trim().length > 0);
    if (cleanedImages.length === 0) {
      return;
    }
    setImageViewer({ images: cleanedImages, index: Math.min(Math.max(index, 0), cleanedImages.length - 1) });
  };

  useEffect(() => {
    if (!isMobile || !imageViewer) {
      return;
    }
    return registerNativeBackHandler(() => {
      setImageViewer(null);
      return true;
    }, 200);
  }, [imageViewer, isMobile]);

  useEffect(() => {
    if (!isMobile || !isNativeApp) {
      return;
    }
    const root = document.getElementById('kukechat-root');
    if (!root) {
      return;
    }
    let frame = 0;
    let followUntil = 0;
    const keepBottomVisible = (duration = 360): void => {
      if (!stickToBottomRef.current) {
        return;
      }
      followUntil = Math.max(followUntil, performance.now() + duration);
      if (frame) {
        return;
      }
      const followKeyboardFrame = (): void => {
        scrollMessagesToBottom(scrollRef.current);
        if (performance.now() < followUntil && stickToBottomRef.current) {
          frame = requestAnimationFrame(followKeyboardFrame);
          return;
        }
        frame = 0;
      };
      frame = requestAnimationFrame(followKeyboardFrame);
    };
    const observer = new MutationObserver((records) => {
      if (records.some((record) => record.attributeName === 'data-keyboard' || record.attributeName === 'style')) {
        keepBottomVisible(root.dataset.keyboard === 'hiding' ? 180 : 380);
      }
    });
    const handleViewportResize = (): void => keepBottomVisible();
    observer.observe(root, { attributes: true, attributeFilter: ['data-keyboard', 'style'] });
    window.visualViewport?.addEventListener('resize', handleViewportResize);
    window.addEventListener('resize', handleViewportResize);
    keepBottomVisible();
    return () => {
      observer.disconnect();
      window.visualViewport?.removeEventListener('resize', handleViewportResize);
      window.removeEventListener('resize', handleViewportResize);
      if (frame) {
        cancelAnimationFrame(frame);
      }
    };
  }, [isMobile, isNativeApp]);

  const invalidateConversationMembers = (conversationId = activeConversationId): void => {
    if (conversationId) {
      void queryClient.invalidateQueries({ queryKey: ['conversation-members', conversationId] });
      void queryClient.invalidateQueries({ queryKey: ['conversation-members-page', conversationId] });
    }
    void queryClient.invalidateQueries({ queryKey: ['conversations'] });
  };

  const clearComposer = (): void => {
    if (composerRef.current) {
      composerRef.current.innerHTML = '';
    }
    setDraft('');
    setQuote(null);
    setMentions([]);
    setMentionAll(false);
    setMentionPicker(null);
  };

  const clearStagedImages = (): void => {
    setStagedImages((current) => {
      current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      return [];
    });
  };

  const clearStagedVoice = (): void => {
    setStagedVoice((current) => {
      if (current) {
        URL.revokeObjectURL(current.previewUrl);
      }
      return null;
    });
  };

  const clearVoiceRecordingTimer = (): void => {
    if (voiceRecordTimerRef.current !== null) {
      window.clearInterval(voiceRecordTimerRef.current);
      voiceRecordTimerRef.current = null;
    }
  };

  const stopVoiceStream = (): void => {
    voiceStreamRef.current?.getTracks().forEach((track) => track.stop());
    voiceStreamRef.current = null;
  };

  const preferredVoiceMimeType = (): string => {
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg', 'audio/mp4'];
    return candidates.find((candidate) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(candidate)) ?? '';
  };

  const voiceFileExtension = (mimeType: string): string => {
    const cleanType = mimeType.split(';', 1)[0];
    if (cleanType === 'audio/ogg') {
      return 'ogg';
    }
    if (cleanType === 'audio/mp4') {
      return 'm4a';
    }
    return 'webm';
  };

  const analyzeVoiceBlob = async (blob: Blob, barCount = 28): Promise<{ waveform: number[]; rms: number | null; peak: number | null }> => {
    try {
      const audioContextCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!audioContextCtor) {
        return { waveform: defaultVoiceWaveform(barCount), rms: null, peak: null };
      }
      const audioContext = new audioContextCtor();
      const buffer = await audioContext.decodeAudioData(await blob.arrayBuffer());
      await audioContext.close();
      const channelData = buffer.getChannelData(0);
      let squareSum = 0;
      let peak = 0;
      for (let sampleIndex = 0; sampleIndex < channelData.length; sampleIndex += 1) {
        const level = Math.abs(channelData[sampleIndex] ?? 0);
        squareSum += level * level;
        if (level > peak) {
          peak = level;
        }
      }
      const rms = channelData.length > 0 ? Math.sqrt(squareSum / channelData.length) : 0;
      const samplesPerBar = Math.max(1, Math.floor(channelData.length / barCount));
      const peaks = Array.from({ length: barCount }, (_, index) => {
        const start = index * samplesPerBar;
        const end = Math.min(channelData.length, start + samplesPerBar);
        let sum = 0;
        for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
          sum += Math.abs(channelData[sampleIndex] ?? 0);
        }
        return end > start ? sum / (end - start) : 0;
      });
      const max = Math.max(...peaks, 0.01);
      return { waveform: peaks.map((item) => Math.min(1, Math.max(0.08, item / max))), rms, peak };
    } catch {
      return { waveform: defaultVoiceWaveform(barCount), rms: null, peak: null };
    }
  };

  const startVoiceRecording = async (options: { autoSend?: boolean } = {}): Promise<boolean> => {
    if (sendMutation.isPending || isRecordingVoice) {
      return false;
    }
    if (!activeConversationId) {
      setActionError('请先选择会话。');
      return false;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setActionError('当前环境不支持录音。');
      return false;
    }
    if (stagedImages.length > 0) {
      setActionError('语音消息不能和图片一起发送。');
      return false;
    }
    try {
      clearStagedVoice();
      voiceRecordAutoSendRef.current = Boolean(options.autoSend);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: true } });
      const mimeType = preferredVoiceMimeType();
      const recorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 48000 });
      voiceStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      voiceChunksRef.current = [];
      voiceRecordCancelledRef.current = false;
      voiceRecordStartedAtRef.current = Date.now();
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          voiceChunksRef.current.push(event.data);
        }
      };
      recorder.onstop = () => {
        void (async () => {
          const shouldAutoSend = voiceRecordAutoSendRef.current;
          voiceRecordAutoSendRef.current = false;
          clearVoiceRecordingTimer();
          stopVoiceStream();
          setIsRecordingVoice(false);
          setMobileVoicePreparing(false);
          setVoiceRecordingMs(0);
          if (voiceRecordCancelledRef.current) {
            voiceChunksRef.current = [];
            return;
          }
          const durationMs = Date.now() - voiceRecordStartedAtRef.current;
          const type = recorder.mimeType || mimeType || 'audio/webm';
          const blob = new Blob(voiceChunksRef.current, { type });
          voiceChunksRef.current = [];
          if (durationMs < 700 || blob.size === 0) {
            setActionError('录音太短，请重新录制。');
            return;
          }
          if (blob.size > MAX_VOICE_UPLOAD_BYTES) {
            setActionError('语音太长了，请控制在 3 分钟以内。');
            return;
          }
          const analysis = await analyzeVoiceBlob(blob);
          if (analysis.rms !== null && analysis.peak !== null && analysis.rms < 0.003 && analysis.peak < 0.015) {
            setActionError('没有检测到声音，请确认浏览器麦克风权限和系统输入设备后重新录制。');
            return;
          }
          const file = new File([blob], `voice-${Date.now()}.${voiceFileExtension(type)}`, { type });
          if (shouldAutoSend) {
            const metadata: MessageMetadata | undefined = quote ? { quote } : undefined;
            if (quote) {
              setQuote(null);
            }
            setActionError('');
            stickToBottomRef.current = true;
            sendMutation.mutate({ content: '', type: 'voice', metadata, voiceFile: file, voiceDurationMs: durationMs, voiceWaveform: analysis.waveform });
            return;
          }
          setStagedVoice({ file, previewUrl: URL.createObjectURL(blob), durationMs, contentType: type, size: blob.size, waveform: analysis.waveform });
        })();
      };
      recorder.start(1000);
      setActionError('');
      setIsRecordingVoice(true);
      setVoiceRecordingMs(0);
      voiceRecordTimerRef.current = window.setInterval(() => {
        const elapsed = Date.now() - voiceRecordStartedAtRef.current;
        setVoiceRecordingMs(elapsed);
        if (elapsed >= MAX_VOICE_RECORDING_MS) {
          mediaRecorderRef.current?.stop();
        }
      }, 200);
      return true;
    } catch {
      voiceRecordAutoSendRef.current = false;
      clearVoiceRecordingTimer();
      stopVoiceStream();
      setIsRecordingVoice(false);
      setMobileVoicePreparing(false);
      setActionError('无法访问麦克风，请检查浏览器权限。');
      return false;
    }
  };

  const stopVoiceRecording = (): void => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  };

  const cancelVoiceRecording = (): void => {
    voiceRecordAutoSendRef.current = false;
    voiceRecordCancelledRef.current = true;
    setMobileVoicePreparing(false);
    setMobileVoiceCanceling(false);
    mobileVoicePointerIdRef.current = null;
    mobileVoiceStartYRef.current = 0;
    mobileVoiceCancelAfterStartRef.current = false;
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
      return;
    }
    clearVoiceRecordingTimer();
    stopVoiceStream();
    setIsRecordingVoice(false);
    setVoiceRecordingMs(0);
  };

  function releaseMobileVoicePointer(target: EventTarget & Element, pointerId: number): void {
    if ('releasePointerCapture' in target) {
      try {
        target.releasePointerCapture(pointerId);
      } catch {
        // The pointer may already be released by the browser.
      }
    }
  }

  function handleMobileVoicePointerDown(event: React.PointerEvent<HTMLButtonElement>): void {
    if (sendMutation.isPending || isRecordingVoice || mobileVoicePreparing) {
      return;
    }
    event.preventDefault();
    setShowEmojiPicker(false);
    mobileVoicePointerIdRef.current = event.pointerId;
    mobileVoiceStartYRef.current = event.clientY;
    mobileVoiceCancelAfterStartRef.current = false;
    setMobileVoiceCanceling(false);
    if ('setPointerCapture' in event.currentTarget) {
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture is best-effort on older Android WebViews.
      }
    }
    setMobileVoicePreparing(true);
    void startVoiceRecording({ autoSend: true }).then((started) => {
      setMobileVoicePreparing(false);
      if (!started) {
        mobileVoicePointerIdRef.current = null;
        mobileVoiceStartYRef.current = 0;
        mobileVoiceCancelAfterStartRef.current = false;
        setMobileVoiceCanceling(false);
        return;
      }
      if (mobileVoiceCancelAfterStartRef.current) {
        cancelVoiceRecording();
      }
    });
  }

  function handleMobileVoicePointerMove(event: React.PointerEvent<HTMLButtonElement>): void {
    if (mobileVoicePointerIdRef.current !== event.pointerId) {
      return;
    }
    event.preventDefault();
    const shouldCancel = mobileVoiceStartYRef.current - event.clientY >= MOBILE_VOICE_CANCEL_DISTANCE;
    mobileVoiceCancelAfterStartRef.current = shouldCancel;
    setMobileVoiceCanceling(shouldCancel);
  }

  function handleMobileVoicePointerUp(event: React.PointerEvent<HTMLButtonElement>): void {
    if (mobileVoicePointerIdRef.current !== event.pointerId) {
      return;
    }
    event.preventDefault();
    const shouldCancel = mobileVoiceCancelAfterStartRef.current || mobileVoiceStartYRef.current - event.clientY >= MOBILE_VOICE_CANCEL_DISTANCE;
    mobileVoicePointerIdRef.current = null;
    mobileVoiceStartYRef.current = 0;
    releaseMobileVoicePointer(event.currentTarget, event.pointerId);
    if (shouldCancel) {
      cancelVoiceRecording();
      return;
    }
    setMobileVoiceCanceling(false);
    if (mediaRecorderRef.current?.state === 'recording') {
      stopVoiceRecording();
      return;
    }
    mobileVoiceCancelAfterStartRef.current = true;
    setMobileVoicePreparing(false);
  }

  function handleMobileVoicePointerCancel(event: React.PointerEvent<HTMLButtonElement>): void {
    if (mobileVoicePointerIdRef.current !== event.pointerId) {
      return;
    }
    event.preventDefault();
    mobileVoicePointerIdRef.current = null;
    mobileVoiceStartYRef.current = 0;
    releaseMobileVoicePointer(event.currentTarget, event.pointerId);
    if (mediaRecorderRef.current?.state === 'recording') {
      cancelVoiceRecording();
      return;
    }
    mobileVoiceCancelAfterStartRef.current = true;
    setMobileVoicePreparing(false);
    setMobileVoiceCanceling(false);
  }

  function toggleMobileVoiceMode(): void {
    setShowEmojiPicker(false);
    setMobileVoiceMode((value) => !value);
    setActionError('');
  }

  function exitMobileVoiceMode(): void {
    if (isRecordingVoice || mobileVoicePreparing) {
      cancelVoiceRecording();
    }
    setMobileVoiceMode(false);
  }

  const sendMutation = useMutation({
    mutationFn: async ({ content, type, metadata, files, voiceFile, voiceDurationMs, voiceWaveform }: SendMessageVariables) => {
      if (!activeConversationId) {
        throw new Error('No active conversation');
      }
      if (type === 'voice' && voiceFile) {
        const uploaded = await uploadMessageVoice(voiceFile);
        return sendMessage(activeConversationId, uploaded.url, 'voice', {
          ...(metadata ?? {}),
          voice: {
            duration_ms: voiceDurationMs,
            content_type: uploaded.content_type ?? voiceFile.type,
            size: voiceFile.size,
            waveform: voiceWaveform
          }
        });
      }
      const uploadFiles = files ?? [];
      const uploadedImages = uploadFiles.length > 0
        ? await Promise.all(uploadFiles.map(async (file) => {
          const uploaded = await uploadMessageImage(file);
          return uploaded.url;
        }))
        : [];
      if (uploadedImages.length === 1 && !content.trim() && type === 'image') {
        return sendMessage(activeConversationId, uploadedImages[0], 'image', metadata);
      }
      const nextMetadata: MessageMetadata | undefined = uploadedImages.length > 0
        ? { ...(metadata ?? {}), images: uploadedImages }
        : metadata;
      return sendMessage(activeConversationId, content, type, nextMetadata);
    },
    onSuccess: (message) => {
      stickToBottomRef.current = true;
      upsertCachedMessage(message.conversation_id, message);
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : '发送失败，请稍后重试。';
      if (/20 messages|per minute|429/i.test(message)) {
        setActionError('发送太频繁了，每分钟最多发送 20 条消息。');
        return;
      }
      if (/500/.test(message)) {
        setActionError('消息内容不能超过 500 字。');
        return;
      }
      if (/3MB|413|too large/i.test(message)) {
        setActionError(/voice|语音/i.test(message) ? '语音不能超过 2MB。' : '图片不能超过 3MB。');
        return;
      }
      setActionError(message || '发送失败，请稍后重试。');
    }
  });

  const recallMutation = useMutation({
    mutationFn: ({ conversationId, messageId }: { conversationId: number; messageId: number }) => recallMessage(conversationId, messageId),
    onSuccess: (message, variables) => {
      patchCachedMessage(variables.conversationId, message.id, (current) => ({ ...current, ...message }));
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    }
  });

  const deleteLocalMutation = useMutation({
    mutationFn: ({ conversationId, messageId }: { conversationId: number; messageId: number }) => deleteMessageLocal(conversationId, messageId),
    onSuccess: (_result, variables) => {
      setActionError('');
      void queryClient.resetQueries({ queryKey: ['messages', variables.conversationId], exact: true });
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: () => setActionError('删除本地消息失败，请稍后重试。')
  });

  const bookmarkMutation = useMutation({
    mutationFn: ({ conversationId, messageId }: { conversationId: number; messageId: number }) => toggleMessageBookmark(conversationId, messageId),
    onSuccess: (result, variables) => {
      setActionError('');
      patchCachedMessage(variables.conversationId, variables.messageId, (message) => ({ ...message, bookmarked_by_me: result.bookmarked }));
      void queryClient.invalidateQueries({ queryKey: ['bookmarks-all'] });
    },
    onError: () => setActionError('收藏状态更新失败，请稍后重试。')
  });

  const featureMutation = useMutation({
    mutationFn: ({ conversationId, messageId }: { conversationId: number; messageId: number }) => toggleMessageFeature(conversationId, messageId),
    onSuccess: (result, variables) => {
      setActionError('');
      patchCachedMessage(variables.conversationId, variables.messageId, (message) => ({ ...message, featured: result.featured }));
      void queryClient.invalidateQueries({ queryKey: ['featured-messages', variables.conversationId] });
    },
    onError: () => setActionError('精华状态更新失败，请稍后重试。')
  });

  const forwardMutation = useMutation({
    mutationFn: ({ targetConversationId, sourceConversationId, messageIds, note }: { targetConversationId: number; sourceConversationId: number; messageIds: number[]; note?: string }) => forwardMessageBundle(targetConversationId, sourceConversationId, messageIds, note),
    onSuccess: (message, variables) => {
      setActionError('');
      setForwardTarget(null);
      setSelectedMessageIds([]);
      setMultiSelectMode(false);
      upsertCachedMessage(variables.targetConversationId, message);
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: () => setActionError('转发失败，请稍后重试。')
  });

  const reactionMutation = useMutation({
    mutationFn: ({ conversationId, messageId, emoji }: { conversationId: number; messageId: number; emoji: string }) => toggleMessageReaction(conversationId, messageId, emoji),
    onSuccess: (summary, variables) => {
      setActionError('');
      patchCachedMessage(variables.conversationId, variables.messageId, (message) => ({ ...message, reactions: summary }));
    },
    onError: () => setActionError('表情回应失败，请稍后重试。')
  });

  const favoriteStickerMutation = useMutation({
    mutationFn: (sourceUrl: string) => addFavoriteSticker(sourceUrl),
    onSuccess: () => {
      setActionError('');
      setMessageMenu(null);
      void queryClient.invalidateQueries({ queryKey: ['favorite-stickers'] });
      showToast('已添加到收藏表情');
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : '添加收藏表情失败，请稍后重试。';
      setActionError(message || '添加收藏表情失败，请稍后重试。');
    }
  });

  const removeFavoriteStickerMutation = useMutation({
    mutationFn: (assetId: number) => removeFavoriteSticker(assetId),
    onSuccess: () => {
      setActionError('');
      void queryClient.invalidateQueries({ queryKey: ['favorite-stickers'] });
      showToast('已删除收藏表情');
    },
    onError: () => setActionError('删除收藏表情失败，请稍后重试。')
  });

  const directMutation = useMutation({
    mutationFn: createDirectConversation,
    onSuccess: (conversation) => {
      setActionError('');
      setActiveConversationId(conversation.id);
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: () => setActionError('发起私聊失败，请稍后重试。')
  });

  const closeTemporaryMutation = useMutation({
    mutationFn: closeTemporaryConversation,
    onSuccess: (_result, conversationId) => {
      setActionError('');
      if (activeConversationId === conversationId) {
        setActiveConversationId(null);
      }
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      showToast('临时会话已关闭');
    },
    onError: () => setActionError('关闭临时会话失败，请稍后重试。')
  });

  const blockTemporaryMutation = useMutation({
    mutationFn: blockTemporaryConversation,
    onSuccess: (_result, conversationId) => {
      setActionError('');
      if (activeConversationId === conversationId) {
        setActiveConversationId(null);
      }
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      showToast('已屏蔽此人的临时会话');
    },
    onError: () => setActionError('屏蔽临时会话失败，请稍后重试。')
  });

  const friendRequestMutation = useMutation({
    mutationFn: sendFriendRequest,
    onSuccess: (request, receiverId) => {
      setActionError('');
      setMemberMenu(null);
      setUserCard(null);
      setLocallyPendingFriendIds((current) => {
        const next = new Set(current);
        next.add(request.receiver_id ?? receiverId);
        return next;
      });
      showToast('好友申请已发送，等待对方通过');
      void queryClient.invalidateQueries({ queryKey: ['friend-requests'] });
      void queryClient.invalidateQueries({ queryKey: ['friend-requests', 'outgoing'] });
    },
    onError: () => showToast('好友申请发送失败，可能已是好友或已有待处理申请。', 'error')
  });

  const roleMutation = useMutation({
    mutationFn: ({ conversationId, userId, role }: { conversationId: number; userId: number; role: MemberRole }) => updateConversationMemberRole(conversationId, userId, role),
    onSuccess: (_member, variables) => {
      setActionError('');
      invalidateConversationMembers(variables.conversationId);
    },
    onError: () => setActionError('成员角色更新失败，请稍后重试。')
  });

  const muteMutation = useMutation({
    mutationFn: ({ conversationId, userId, muted, mutedUntil }: { conversationId: number; userId: number; muted: boolean; mutedUntil?: string | null }) => updateConversationMemberMute(conversationId, userId, muted, mutedUntil),
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: ['conversation-members', variables.conversationId] });
      await queryClient.cancelQueries({ queryKey: ['conversation-members-page', variables.conversationId] });
      patchMemberMuteCaches(variables.conversationId, variables.userId, variables.muted, variables.mutedUntil ?? null);
      setMemberMenu(null);
    },
    onSuccess: (member, variables) => {
      setActionError('');
      patchMemberMuteCaches(variables.conversationId, variables.userId, Boolean(member.muted), member.muted_until ?? null);
    },
    onError: (_error, variables) => {
      invalidateConversationMembers(variables.conversationId);
      setActionError('成员禁言更新失败，请稍后重试。');
    },
    onSettled: (_data, _error, variables) => {
      if (variables) {
        void queryClient.invalidateQueries({ queryKey: ['conversation-members', variables.conversationId] });
        void queryClient.invalidateQueries({ queryKey: ['conversation-members-page', variables.conversationId] });
      }
    }
  });

  const removeMutation = useMutation({
    mutationFn: ({ conversationId, userId }: { conversationId: number; userId: number }) => removeConversationMember(conversationId, userId),
    onSuccess: (_result, variables) => {
      setActionError('');
      invalidateConversationMembers(variables.conversationId);
    },
    onError: () => setActionError('移除成员失败，请稍后重试。')
  });

  const titleMutation = useMutation({
    mutationFn: ({ conversationId, userId, title }: { conversationId: number; userId: number; title: string | null }) => updateConversationMemberTitle(conversationId, userId, title),
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: ['conversation-members', variables.conversationId] });
      await queryClient.cancelQueries({ queryKey: ['conversation-members-page', variables.conversationId] });
      await queryClient.cancelQueries({ queryKey: ['messages', variables.conversationId] });
      patchMemberTitleCaches(variables.conversationId, variables.userId, variables.title);
      setMemberMenu(null);
    },
    onSuccess: (_member, variables) => {
      setActionError('');
      showToast(variables.title ? '群头衔已更新' : '群头衔已清除');
    },
    onError: (_error, variables) => {
      invalidateConversationMembers(variables.conversationId);
      setActionError('群头衔更新失败，请稍后重试。');
    },
    onSettled: (_data, _error, variables) => {
      if (variables) {
        void queryClient.invalidateQueries({ queryKey: ['conversation-members', variables.conversationId] });
        void queryClient.invalidateQueries({ queryKey: ['conversation-members-page', variables.conversationId] });
      }
    }
  });

  const reportMutation = useMutation({
    mutationFn: (payload: CreateReportPayload) => createReport(payload),
    onSuccess: () => {
      setActionError('');
      setReportTarget(null);
      showToast('举报已提交，感谢反馈');
    }
  });

  useEffect(() => {
    if (!composerRef.current) {
      return;
    }
    composerRef.current.innerHTML = '';
    setDraft('');
    setStagedImages((current) => {
      current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      return [];
    });
    setStagedVoice((current) => {
      if (current) {
        URL.revokeObjectURL(current.previewUrl);
      }
      return null;
    });
  }, [activeConversationId]);

  useEffect(() => {
    if (draft || !composerRef.current) {
      return;
    }
    composerRef.current.innerHTML = '';
  }, [draft]);

  useLayoutEffect(() => {
    const conversationChanged = lastConversationIdRef.current !== activeConversationId;
    const initialLoad = conversationChanged || lastMessageIdRef.current === null;
    const hasNewMessage = latestMessageId !== null && latestMessageId !== lastMessageIdRef.current;
    const pendingLatest = pendingScrollToLatestRef.current && latestMessageId !== null;
    const shouldScroll = jumpContextMessageId === null && (initialLoad || pendingLatest || (hasNewMessage && stickToBottomRef.current));
    lastConversationIdRef.current = activeConversationId ?? null;
    lastMessageIdRef.current = latestMessageId;
    if (shouldScroll) {
      if (initialLoad || pendingLatest) {
        forceScrollMessagesToBottom(scrollRef.current);
      } else {
        scrollMessagesToBottom(scrollRef.current, 'smooth');
      }
      pendingScrollToLatestRef.current = false;
      stickToBottomRef.current = true;
      setShowScrollToBottom(false);
    }
  }, [activeConversationId, jumpContextMessageId, latestMessageId]);

  useLayoutEffect(() => {
    const snapshot = preserveScrollSnapshotRef.current;
    const element = scrollRef.current;
    if (!snapshot || !element || snapshot.conversationId !== activeConversationId) {
      if (snapshot && snapshot.conversationId !== activeConversationId) preserveScrollSnapshotRef.current = null;
      return;
    }

    const previousBehavior = element.style.scrollBehavior;
    element.style.scrollBehavior = 'auto';
    const anchor = snapshot.messageId === null ? null : element.querySelector<HTMLElement>(`[data-message-id="${snapshot.messageId}"]`);
    if (anchor) {
      const rootTop = element.getBoundingClientRect().top;
      element.scrollTop += anchor.getBoundingClientRect().top - rootTop - snapshot.offsetTop;
    } else {
      element.scrollTop = snapshot.top + element.scrollHeight - snapshot.height;
    }
    element.style.scrollBehavior = previousBehavior;
    preserveScrollSnapshotRef.current = null;
  }, [activeConversationId, messagePages]);

  useEffect(() => {
    if (!isMobile || !isNativeApp || import.meta.env.PROD) {
      return;
    }

    const element = scrollRef.current;
    if (!element) {
      return;
    }

    requestAnimationFrame(() => {
      if (element.scrollWidth <= element.clientWidth + 1) {
        return;
      }

      const candidates = Array.from(element.querySelectorAll<HTMLElement>('*'))
        .map((node) => ({
          className: typeof node.className === 'string' ? node.className : String(node.className),
          messageId: node.closest<HTMLElement>('[data-message-id]')?.dataset.messageId,
          scrollWidth: node.scrollWidth,
          clientWidth: node.clientWidth,
          rectWidth: Math.round(node.getBoundingClientRect().width),
          text: node.textContent?.trim().slice(0, 80)
        }))
        .sort((left, right) => Math.max(right.scrollWidth, right.rectWidth) - Math.max(left.scrollWidth, left.rectWidth))
        .slice(0, 8);

      console.warn('[KukeChat] native chat horizontal overflow', {
        conversationId: activeConversationId,
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        candidates
      });
    });
  }, [activeConversationId, isMobile, isNativeApp, messagePages]);

  useEffect(() => {
    setMessageMenu(null);
    setMemberMenu(null);
    setUserCard(null);
    setMobileUserProfile(null);
    setShowInfoDrawer(false);
    setShowAnnouncements(false);
    setShowMemberSearch(false);
    setShowChatSearch(false);
    setShowEmojiPicker(false);
    setReactionPicker(null);
    setMultiSelectMode(false);
    setSelectedMessageIds([]);
    setForwardTarget(null);
    setReportTarget(null);
    setForwardDetailMessage(null);
    setShowFeaturedMessages(false);
    setQuote(null);
    setMentions([]);
    setMentionAll(false);
    setMentionPicker(null);
    setMobileVoiceMode(false);
    setMemberSearch('');
    setActionError('');
    setShowScrollToBottom(false);
    stickToBottomRef.current = true;
    pendingScrollToLatestRef.current = false;
    forceScrollMessagesToBottom(scrollRef.current);
  }, [activeConversationId]);

  useEffect(() => {
    if (showMemberSearch) {
      onMembersNeeded?.();
      memberSearchInputRef.current?.focus();
    }
  }, [onMembersNeeded, showMemberSearch]);

  useEffect(() => {
    if (!showMemberSearch) {
      onMemberSearchChange?.('');
      return;
    }
    const timeout = window.setTimeout(() => {
      onMemberSearchChange?.(memberSearch);
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [memberSearch, onMemberSearchChange, showMemberSearch]);

  useEffect(() => {
    if (!showEmojiPicker) {
      return;
    }

    function handlePointerDown(event: MouseEvent): void {
      const picker = emojiPickerRef.current;
      if (picker && !event.composedPath().includes(picker)) {
        setShowEmojiPicker(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [showEmojiPicker]);

  useEffect(() => {
    return () => {
      if (jumpHighlightTimeoutRef.current !== null) {
        window.clearTimeout(jumpHighlightTimeoutRef.current);
      }
      if (toastTimeoutRef.current !== null) {
        window.clearTimeout(toastTimeoutRef.current);
      }
      if (toastRemoveTimeoutRef.current !== null) {
        window.clearTimeout(toastRemoveTimeoutRef.current);
      }
      if (muteSubmenuCloseTimeoutRef.current !== null) {
        window.clearTimeout(muteSubmenuCloseTimeoutRef.current);
      }
      clearVoiceRecordingTimer();
      stopVoiceStream();
    };
  }, []);

  useEffect(() => {
    return () => {
      stagedImages.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    };
  }, [stagedImages]);

  useEffect(() => {
    return () => {
      if (stagedVoice) {
        URL.revokeObjectURL(stagedVoice.previewUrl);
      }
    };
  }, [stagedVoice]);

  function openMuteSubmenu(): void {
    if (muteSubmenuCloseTimeoutRef.current !== null) {
      window.clearTimeout(muteSubmenuCloseTimeoutRef.current);
      muteSubmenuCloseTimeoutRef.current = null;
    }
    setShowMuteSubmenu(true);
  }

  function closeMuteSubmenuSoon(): void {
    if (muteSubmenuCloseTimeoutRef.current !== null) {
      window.clearTimeout(muteSubmenuCloseTimeoutRef.current);
    }
    muteSubmenuCloseTimeoutRef.current = window.setTimeout(() => {
      setShowMuteSubmenu(false);
      muteSubmenuCloseTimeoutRef.current = null;
    }, 220);
  }

  function closeMuteSubmenuNow(): void {
    if (muteSubmenuCloseTimeoutRef.current !== null) {
      window.clearTimeout(muteSubmenuCloseTimeoutRef.current);
      muteSubmenuCloseTimeoutRef.current = null;
    }
    setShowMuteSubmenu(false);
  }

  function showToast(message: string, tone: ToastState['tone'] = 'info'): void {
    const id = toastIdRef.current + 1;
    toastIdRef.current = id;
    setToast({ id, message, tone, exiting: false });
    if (toastTimeoutRef.current !== null) {
      window.clearTimeout(toastTimeoutRef.current);
    }
    if (toastRemoveTimeoutRef.current !== null) {
      window.clearTimeout(toastRemoveTimeoutRef.current);
    }
    toastTimeoutRef.current = window.setTimeout(() => {
      setToast((current) => (current?.id === id ? { ...current, exiting: true } : current));
      toastRemoveTimeoutRef.current = window.setTimeout(() => {
        setToast((current) => (current?.id === id ? null : current));
        toastRemoveTimeoutRef.current = null;
      }, 260);
      toastTimeoutRef.current = null;
    }, tone === 'error' ? 3600 : 2600);
  }

  useEffect(() => {
    if (!activeConversationId || visibleConversationId !== activeConversationId) {
      return;
    }

    void markConversationRead(activeConversationId, latestMessageId).then(() => {
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    });
  }, [activeConversationId, latestMessageId, queryClient, visibleConversationId]);

  function composerText(): string {
    const editor = composerRef.current;
    if (!editor) {
      return draft;
    }

    return editablePlainText(editor);
  }

  function composerQuoteFromDom(): MessageQuoteMetadata | null {
    return quote;
  }

  function readMentionMetadataFromComposer(): { mentions: MessageMentionMetadata[]; mentionAll: boolean } {
    const editor = composerRef.current;
    if (!editor) {
      return { mentions, mentionAll };
    }

    const seen = new Set<number>();
    const nextMentions: MessageMentionMetadata[] = [];
    let nextMentionAll = false;
    editor.querySelectorAll<HTMLElement>('[data-mention-token]').forEach((node) => {
      if (node.dataset.mentionAll === 'true') {
        nextMentionAll = true;
        return;
      }
      const userId = Number(node.dataset.mentionId);
      const name = node.dataset.mentionName?.trim() || node.textContent?.replace(/^@/, '').trim();
      if (Number.isFinite(userId) && userId > 0 && name && !seen.has(userId)) {
        seen.add(userId);
        nextMentions.push({ user_id: userId, name });
      }
    });
    return { mentions: nextMentions, mentionAll: nextMentionAll };
  }

  function syncComposerState(updatePicker = true): void {
    const text = composerText();
    if (!text.trim() && composerRef.current?.innerHTML === '<br>') {
      composerRef.current.innerHTML = '';
    }
    const nextMentionData = readMentionMetadataFromComposer();
    setDraft(text);
    setMentions(nextMentionData.mentions);
    setMentionAll(nextMentionData.mentionAll);
    if (updatePicker) {
      updateMentionPickerFromComposer();
    }
  }

  function submit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    syncComposerState(false);
    const text = composerText();
    const content = text.trim();
    const files = stagedImages.map((item) => item.file);
    if ((!content && files.length === 0 && !stagedVoice) || !activeConversationId || sendMutation.isPending) {
      refocusMobileComposerAfterSubmit();
      return;
    }
    if (stagedVoice && (content || files.length > 0)) {
      setActionError('语音消息不能和文字或图片一起发送。');
      refocusMobileComposerAfterSubmit();
      return;
    }
    if (content.length > MAX_MESSAGE_CONTENT_LENGTH) {
      setActionError('消息内容不能超过 500 字。');
      refocusMobileComposerAfterSubmit();
      return;
    }
    const mentionData = readMentionMetadataFromComposer();
    const metadata: MessageMetadata = {};
    const quoteData = composerQuoteFromDom() ?? quote;
    if (quoteData) {
      metadata.quote = quoteData;
    }
    if (mentionData.mentions.length > 0) {
      metadata.mentions = mentionData.mentions;
    }
    if (mentionData.mentionAll) {
      metadata.mention_all = true;
    }
    const hasMetadata = Object.keys(metadata).length > 0;
    const type: MessageType = stagedVoice ? 'voice' : files.length === 1 && !content ? 'image' : 'text';
    const variables: SendMessageVariables = stagedVoice
      ? { content: '', type: 'voice', metadata: hasMetadata ? metadata : undefined, voiceFile: stagedVoice.file, voiceDurationMs: stagedVoice.durationMs, voiceWaveform: stagedVoice.waveform }
      : { content: text.trim() ? text.trimEnd() : '', type, metadata: hasMetadata ? metadata : undefined, files };
    clearComposer();
    clearStagedImages();
    clearStagedVoice();
    setActionError('');
    refocusMobileComposerAfterSubmit();
    sendMutation.mutate(variables);
  }

  function composerEndRange(editor: HTMLElement): Range {
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    return range;
  }

  function getComposerSelectionRange(): Range | null {
    const editor = composerRef.current;
    const selection = window.getSelection();
    if (!editor || !selection || selection.rangeCount === 0) {
      return null;
    }
    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;
    return container === editor || editor.contains(container) ? range : null;
  }

  function setComposerSelection(range: Range): void {
    const selection = window.getSelection();
    if (!selection) {
      return;
    }
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function refocusComposerAtEnd(): void {
    const editor = composerRef.current;
    if (!editor) {
      return;
    }

    editor.focus({ preventScroll: true });
    setComposerSelection(composerEndRange(editor));
  }

  function refocusMobileComposerAfterSubmit(): void {
    if (!isMobile || mobileVoiceMode) {
      return;
    }

    refocusComposerAtEnd();
    requestAnimationFrame(refocusComposerAtEnd);
  }

  function preventMobileSendFocusTransfer(event: React.SyntheticEvent<HTMLButtonElement>): void {
    if (mobileVoiceMode || event.currentTarget.disabled) {
      return;
    }

    event.preventDefault();
  }

  function handleMobileSendPointerDown(event: React.PointerEvent<HTMLButtonElement>): void {
    preventMobileSendFocusTransfer(event);
  }

  function handleMobileSendMouseDown(event: React.MouseEvent<HTMLButtonElement>): void {
    preventMobileSendFocusTransfer(event);
  }

  function handleMobileSendTouchStart(event: React.TouchEvent<HTMLButtonElement>): void {
    if ('PointerEvent' in window) {
      return;
    }

    preventMobileSendFocusTransfer(event);
  }

  function handleMobileSendTouchEnd(event: React.TouchEvent<HTMLButtonElement>): void {
    if ('PointerEvent' in window || mobileVoiceMode || event.currentTarget.disabled) {
      return;
    }

    event.preventDefault();
    event.currentTarget.form?.requestSubmit(event.currentTarget);
  }

  function rangeIntersectsReadonlyToken(range: Range): boolean {
    const editor = composerRef.current;
    if (!editor) {
      return false;
    }
    return Array.from(editor.querySelectorAll<HTMLElement>('[data-quote-token], [data-mention-token]')).some((node) => range.intersectsNode(node));
  }

  function lastTextRangeInComposer(): Range | null {
    const editor = composerRef.current;
    if (!editor) {
      return null;
    }
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        const parent = node.parentElement;
        return parent?.closest('[data-quote-token], [data-mention-token]') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      }
    });
    let last: Text | null = null;
    let node = walker.nextNode() as Text | null;
    while (node) {
      last = node;
      node = walker.nextNode() as Text | null;
    }
    if (!last) {
      return null;
    }
    const range = document.createRange();
    range.setStart(last, last.data.length);
    range.collapse(true);
    return range;
  }

  function composerTextSegments(): Array<{ node: Text; start: number; end: number }> {
    const editor = composerRef.current;
    if (!editor) {
      return [];
    }

    const segments: Array<{ node: Text; start: number; end: number }> = [];
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    let offset = 0;
    let current = walker.nextNode() as Text | null;
    while (current) {
      const length = current.data.replace(/\u00a0/g, ' ').length;
      segments.push({ node: current, start: offset, end: offset + length });
      offset += length;
      current = walker.nextNode() as Text | null;
    }
    return segments;
  }

  function textPositionAtOffset(segments: Array<{ node: Text; start: number; end: number }>, offset: number): { node: Text; offset: number } | null {
    if (offset < 0) {
      return null;
    }

    for (const segment of segments) {
      if (offset >= segment.start && offset <= segment.end) {
        return { node: segment.node, offset: Math.min(segment.node.data.length, Math.max(0, offset - segment.start)) };
      }
    }

    const last = segments[segments.length - 1];
    if (!last || offset !== last.end) {
      return null;
    }

    return { node: last.node, offset: last.node.data.length };
  }

  function mentionQueryFromRange(range: Range): string | null {
    const editor = composerRef.current;
    if (!editor) {
      return null;
    }

    const beforeCaretRange = document.createRange();
    beforeCaretRange.selectNodeContents(editor);
    beforeCaretRange.setEnd(range.endContainer, range.endOffset);
    const beforeCaret = beforeCaretRange.toString().replace(/\u00a0/g, ' ');
    const match = beforeCaret.match(/(^|\s)@([^\s@]*)$/);
    return match ? match[2] : null;
  }

  function mentionQueryRange(range: Range): { query: string; range: Range } | null {
    const editor = composerRef.current;
    const query = mentionQueryFromRange(range);
    if (!editor || query === null) {
      return null;
    }

    const beforeCaretRange = document.createRange();
    beforeCaretRange.selectNodeContents(editor);
    beforeCaretRange.setEnd(range.endContainer, range.endOffset);
    const beforeCaret = beforeCaretRange.toString().replace(/\u00a0/g, ' ');

    const caretOffset = beforeCaret.length;
    const replaceLength = query.length + 1;
    const segments = composerTextSegments();
    const start = textPositionAtOffset(segments, caretOffset - replaceLength);
    const end = textPositionAtOffset(segments, caretOffset);
    if (!start || !end) {
      return null;
    }

    const replaceRange = document.createRange();
    replaceRange.setStart(start.node, start.offset);
    replaceRange.setEnd(end.node, end.offset);
    return { query, range: replaceRange };
  }

  function mentionQueryAtComposerEnd(): { query: string; range: Range } | null {
    const editor = composerRef.current;
    if (!editor) {
      return null;
    }

    const text = composerText();
    const match = text.match(/(^|\s)@([^\s@]*)$/);
    if (!match) {
      return null;
    }

    const caretOffset = text.length;
    const replaceLength = match[2].length + 1;
    const segments = composerTextSegments();
    const start = textPositionAtOffset(segments, caretOffset - replaceLength);
    const end = textPositionAtOffset(segments, caretOffset);
    if (!start || !end) {
      return { query: match[2], range: composerEndRange(editor) };
    }

    const replaceRange = document.createRange();
    replaceRange.setStart(start.node, start.offset);
    replaceRange.setEnd(end.node, end.offset);
    return { query: match[2], range: replaceRange };
  }

  function activeMentionFromComposer(): MentionPickerState | null {
    const editor = composerRef.current;
    const fallbackRange = editor && document.activeElement === editor ? composerEndRange(editor) : null;
    const range = getComposerSelectionRange() ?? fallbackRange;
    if (!isGroup || !editor) {
      return null;
    }

    if (range?.collapsed && !rangeIntersectsReadonlyToken(range)) {
      const query = mentionQueryFromRange(range);
      if (query !== null) {
        const nextMention = mentionQueryRange(range);
        return { query, range: nextMention?.range ?? range.cloneRange(), open: true };
      }
    }

    const trailingMention = mentionQueryAtComposerEnd();
    return trailingMention ? { query: trailingMention.query, range: trailingMention.range, open: true } : null;
  }

  function updateMentionPickerFromComposer(): void {
    const nextMention = activeMentionFromComposer();
    if (nextMention) {
      onMembersNeeded?.();
    }
    setMentionPicker(nextMention);
  }

  function insertTextAtCaret(text: string): void {
    const editor = composerRef.current;
    if (!editor) {
      setDraft((current) => `${current}${text}`);
      return;
    }

    const range = getComposerSelectionRange() ?? composerEndRange(editor);
    editor.focus();
    range.deleteContents();
    const textNode = document.createTextNode(text);
    range.insertNode(textNode);
    const nextRange = document.createRange();
    nextRange.setStart(textNode, textNode.data.length);
    nextRange.collapse(true);
    setComposerSelection(nextRange);
    syncComposerState();
  }

  function insertTextAtComposerStart(text: string): void {
    const editor = composerRef.current;
    if (!editor) {
      setDraft((current) => `${text}${current}`);
      return;
    }
    editor.focus({ preventScroll: true });
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(true);
    const textNode = document.createTextNode(text);
    range.insertNode(textNode);
    const nextRange = document.createRange();
    nextRange.setStart(textNode, textNode.data.length);
    nextRange.collapse(true);
    setComposerSelection(nextRange);
    syncComposerState();
  }

  function handleBotInteraction(message: Message, interaction: BotInteraction): void {
    if (interaction.action === 'input') {
      insertTextAtComposerStart(interaction.value ?? '');
      return;
    }
    if (interaction.action === 'callback') {
      triggerMessageInteraction(message.conversation_id, message.id, interactionPayload(interaction))
        .then(() => setActionError(''))
        .catch((error) => setActionError(error instanceof Error ? error.message : '机器人回调发送失败'));
    }
  }

  function insertQuoteToken(quoteData: MessageQuoteMetadata, mentionTarget?: { userId: number; name: string }): void {
    const editor = composerRef.current;
    setQuote(quoteData);
    if (!editor) {
      return;
    }

    if (mentionTarget) {
      insertMentionToken(mentionTarget.name, { userId: mentionTarget.userId, range: composerEndRange(editor), closePicker: true });
    } else if (isGroup && quoteData.sender_name) {
      insertTextAtCaret(`@${quoteData.sender_name} `);
    } else {
      const range = composerEndRange(editor);
      setComposerSelection(range);
      syncComposerState(false);
    }
    requestAnimationFrame(() => editor.focus());
  }

  function insertMentionToken(name: string, options: { userId?: number; mentionAll?: boolean; range?: Range | null; closePicker?: boolean } = {}): void {
    const editor = composerRef.current;
    if (!editor) {
      return;
    }

    let range = options.range ?? activeMentionFromComposer()?.range ?? mentionPicker?.range ?? getComposerSelectionRange() ?? lastTextRangeInComposer() ?? composerEndRange(editor);
    if (rangeIntersectsReadonlyToken(range)) {
      range = lastTextRangeInComposer() ?? composerEndRange(editor);
    }
    editor.focus();
    range.deleteContents();
    const token = document.createElement('span');
    token.contentEditable = 'false';
    token.dataset.mentionToken = 'true';
    token.dataset.mentionName = name;
    if (options.userId) {
      token.dataset.mentionId = String(options.userId);
    }
    if (options.mentionAll) {
      token.dataset.mentionAll = 'true';
    }
    token.className = 'mx-0.5 inline-flex max-w-[160px] select-none items-center rounded-full px-1.5 py-0.5 text-xs font-semibold align-baseline [background:var(--kc-accent-soft)] [color:var(--kc-accent)]';
    token.textContent = `@${name}`;
    const space = document.createTextNode(' ');
    const fragment = document.createDocumentFragment();
    fragment.append(token, space);
    range.insertNode(fragment);
    const nextRange = document.createRange();
    nextRange.setStart(space, space.data.length);
    nextRange.collapse(true);
    setComposerSelection(nextRange);
    syncComposerState(false);
    if (options.closePicker !== false) {
      setMentionPicker(null);
    }
  }

  function handleComposerInput(): void {
    syncComposerState();
  }

  function requestComposerSubmit(editor: HTMLElement): void {
    editor.closest('form')?.requestSubmit();
  }

  function isPlainEnter(event: React.KeyboardEvent<HTMLDivElement>): boolean {
    return event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey;
  }

  function handleMobileComposerBeforeInput(event: React.FormEvent<HTMLDivElement>): void {
    const inputEvent = event.nativeEvent as InputEvent;
    if (inputEvent.isComposing) {
      return;
    }

    if (inputEvent.inputType === 'insertLineBreak') {
      mobileEnterKeyDownAtRef.current = null;
      mobileEnterSkipNextBeforeInputRef.current = false;
      return;
    }

    if (inputEvent.inputType !== 'insertParagraph') {
      return;
    }

    event.preventDefault();
    if (mobileEnterSkipNextBeforeInputRef.current) {
      mobileEnterSkipNextBeforeInputRef.current = false;
      return;
    }
    requestComposerSubmit(event.currentTarget);
  }

  function handleComposerKeyDown(event: React.KeyboardEvent<HTMLDivElement>, mobile: boolean): void {
    if (event.key === 'Escape' && mentionPicker) {
      event.preventDefault();
      setMentionPicker(null);
      return;
    }
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      insertTextAtCaret('\n');
      return;
    }
    if (mobile && isPlainEnter(event)) {
      event.preventDefault();
      if (!event.repeat) {
        mobileEnterKeyDownAtRef.current = event.timeStamp;
      }
      mobileEnterSkipNextBeforeInputRef.current = true;
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey && !mobile) {
      event.preventDefault();
      requestComposerSubmit(event.currentTarget);
      return;
    }
    if (event.key === '@' && isGroup) {
      const editor = composerRef.current;
      const fallbackRange = getComposerSelectionRange() ?? (editor ? composerEndRange(editor) : null);
      if (fallbackRange) {
        setMentionPicker({ query: '', range: fallbackRange.cloneRange(), open: true });
      }
      requestAnimationFrame(() => {
        const nextPicker = activeMentionFromComposer();
        if (nextPicker) {
          setMentionPicker(nextPicker);
        }
      });
      return;
    }
    if (event.key === 'Backspace') {
      const range = getComposerSelectionRange();
      const editor = composerRef.current;
      if (editor && range?.collapsed && range.startContainer === editor) {
        const previous = editor.childNodes.item(range.startOffset - 1);
        if (previous instanceof HTMLElement && previous.dataset.mentionToken === 'true') {
          event.preventDefault();
          previous.remove();
          syncComposerState();
        }
      }
    }
  }

  function handleComposerKeyUp(event: React.KeyboardEvent<HTMLDivElement>, mobile: boolean): void {
    if (mobile && isPlainEnter(event)) {
      event.preventDefault();
      const keyDownAt = mobileEnterKeyDownAtRef.current;
      mobileEnterKeyDownAtRef.current = null;
      mobileEnterSkipNextBeforeInputRef.current = false;
      if (keyDownAt === null) {
        updateMentionPickerFromComposer();
        return;
      }
      if (event.timeStamp - keyDownAt >= MOBILE_ENTER_LONG_PRESS_MS) {
        insertTextAtCaret('\n');
      } else {
        requestComposerSubmit(event.currentTarget);
      }
      return;
    }
    updateMentionPickerFromComposer();
  }

  function insertMention(member: ConversationMember): void {
    const userId = memberUserId(member);
    if (!userId) {
      return;
    }
    const name = member.nickname?.trim() || getDisplayName(member.user, `用户 ${userId}`);
    insertMentionToken(name, { userId });
  }

  function mentionMemberFromMenu(member: ConversationMember): void {
    if (!isGroup) {
      return;
    }
    setMemberMenu(null);
    insertMention(member);
    requestAnimationFrame(() => composerRef.current?.focus());
  }

  function insertMentionAll(): void {
    if (!(currentRole === 'owner' || currentRole === 'admin')) {
      return;
    }
    insertMentionToken('全体成员', { mentionAll: true });
  }

  function showUnavailableAction(): void {
    setActionError('');
    showToast('该功能尚未完成~');
  }

  function stageImageFiles(files: FileList | File[]): void {
    if (stagedVoice || isRecordingVoice) {
      setActionError('语音消息不能和图片一起发送。');
      return;
    }
    const nextFiles = Array.from(files).filter((file) => file.type.startsWith('image/'));
    if (nextFiles.length === 0) {
      return;
    }
    const validFiles = nextFiles.filter((file) => file.size <= MAX_IMAGE_UPLOAD_BYTES);
    const oversizedFiles = nextFiles.filter((file) => file.size > MAX_IMAGE_UPLOAD_BYTES);
    if (oversizedFiles.length > 0) {
      setActionError(`图片不能超过 3MB，已忽略：${oversizedFiles.map((file) => `${file.name} (${formatBytes(file.size)})`).join('、')}`);
    }
    if (validFiles.length === 0) {
      return;
    }
    setActionError('');
    setStagedImages((current) => [
      ...current,
      ...validFiles.map((file, index) => ({
        id: `${Date.now()}-${current.length + index}-${file.name}`,
        file,
        previewUrl: URL.createObjectURL(file)
      }))
    ]);
  }

  function removeStagedImage(id: string): void {
    setStagedImages((current) => {
      const target = current.find((item) => item.id === id);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return current.filter((item) => item.id !== id);
    });
  }

  function chooseImage(event: React.ChangeEvent<HTMLInputElement>): void {
    const files = event.target.files;
    if (files && files.length > 0) {
      stageImageFiles(files);
    }
    event.target.value = '';
  }

  function handlePaste(event: React.ClipboardEvent<HTMLFormElement>): void {
    const imageFiles = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith('image/'));
    if (imageFiles.length === 0) {
      const text = event.clipboardData.getData('text/plain');
      if (text) {
        event.preventDefault();
        insertTextAtCaret(text);
      }
      return;
    }
    event.preventDefault();
    stageImageFiles(imageFiles);
  }

  function visibleMessagesByIds(ids: number[]): Message[] {
    const selectedIds = new Set(ids);
    return messages.filter((message) => selectedIds.has(message.id) && !message.recalled_at);
  }

  async function fetchNewerContextMessages(): Promise<void> {
    if (!activeConversationId || jumpContextMessageId === null || latestMessageId === null || newerContextFetchRef.current || reachedLatestInContextRef.current) {
      return;
    }

    const requestedAfterId = latestMessageId;
    newerContextFetchRef.current = true;
    setIsFetchingNewerContext(true);
    try {
      const contextMessages = await getMessageContext(activeConversationId, requestedAfterId, { before: 0, after: MESSAGE_PAGE_SIZE });
      const newerMessages = contextMessages.filter((message) => message.id > requestedAfterId);
      if (newerMessages.length === 0) {
        reachedLatestInContextRef.current = true;
        setJumpContextMessageId(null);
        return;
      }

      stickToBottomRef.current = false;
      contextBottomArmedRef.current = false;
      queryClient.setQueryData<MessagesInfiniteData | undefined>(['messages', activeConversationId], (current) => appendNewerMessagesIntoFirstPage(current, newerMessages));
      if (newerMessages.length < MESSAGE_PAGE_SIZE) {
        reachedLatestInContextRef.current = true;
        setJumpContextMessageId(null);
      }
      setShowScrollToBottom(true);
    } catch {
      showToast('加载更新消息失败，请稍后重试。', 'error');
    } finally {
      newerContextFetchRef.current = false;
      setIsFetchingNewerContext(false);
    }
  }

  function handleMessagesScroll(): void {
    const element = scrollRef.current;
    const nearBottom = isNearBottom(element);
    stickToBottomRef.current = nearBottom;
    setShowScrollToBottom(!nearBottom);
    if (element && jumpContextMessageId !== null) {
      if (!nearBottom && !newerContextFetchRef.current) {
        contextBottomArmedRef.current = true;
      } else if (contextBottomArmedRef.current) {
        contextBottomArmedRef.current = false;
        void fetchNewerContextMessages();
      }
    }
    if (!element || activeConversationId === null || element.scrollTop >= 120 || !messagesQuery.hasNextPage || messagesQuery.isFetchingNextPage) {
      return;
    }

    const rootTop = element.getBoundingClientRect().top;
    const anchor = Array.from(element.querySelectorAll<HTMLElement>('[data-message-id]')).find((node) => node.getBoundingClientRect().bottom > rootTop + 1) ?? null;
    preserveScrollSnapshotRef.current = {
      conversationId: activeConversationId,
      messageId: anchor ? Number(anchor.dataset.messageId) : null,
      offsetTop: anchor ? anchor.getBoundingClientRect().top - rootTop : 0,
      height: element.scrollHeight,
      top: element.scrollTop
    };
    stickToBottomRef.current = false;
    setShowScrollToBottom(true);
    void messagesQuery.fetchNextPage();
  }

  function scrollToLatestMessage(): void {
    setJumpContextMessageId(null);
    pendingScrollToLatestRef.current = true;
    void queryClient.resetQueries({ queryKey: ['messages', activeConversationId], exact: true });
    stickToBottomRef.current = true;
    setShowScrollToBottom(false);
    forceScrollMessagesToBottom(scrollRef.current);
  }

  function copyMessages(messagesToCopy: Message[]): void {
    if (messagesToCopy.length === 0) {
      return;
    }

    copyText(messagesToCopy.map(messageReadableLine).join('\n'));
  }

  function startMultiSelect(message?: Message): void {
    if (message?.recalled_at) {
      return;
    }
    setMultiSelectMode(true);
    setSelectedMessageIds(message ? [message.id] : []);
    setMessageMenu(null);
  }

  function cancelMultiSelect(): void {
    setMultiSelectMode(false);
    setSelectedMessageIds([]);
  }

  function toggleMessageSelected(message: Message): void {
    if (message.recalled_at) {
      return;
    }
    setSelectedMessageIds((current) => (current.includes(message.id) ? current.filter((id) => id !== message.id) : [...current, message.id]));
  }

  function openForwardModal(messageIds: number[]): void {
    const cleanMessageIds = Array.from(new Set(messageIds)).filter((messageId) => visibleMessagesByIds([messageId]).length > 0);
    if (cleanMessageIds.length === 0) {
      return;
    }
    setForwardTarget({ messageIds: cleanMessageIds });
    setMessageMenu(null);
  }

  function openMessageReport(message: Message): void {
    if (message.recalled_at) {
      return;
    }
    const conversationId = activeConversationId ?? message.conversation_id;
    const senderId = message.sender_id ?? message.sender?.id;
    setReportTarget({
      targetType: 'message',
      targetId: message.id,
      targetLabel: `消息：${truncateText(messagePreview(message), 48) || '空消息'}`,
      conversationId,
      messageId: message.id,
      reportedUserId: senderId
    });
    setMessageMenu(null);
  }

  function openMemberReport(member: ConversationMember): void {
    const userId = memberUserId(member);
    if (!userId) {
      return;
    }
    const name = member.nickname?.trim() || getDisplayName(member.user, `用户 ${userId}`);
    setReportTarget({
      targetType: 'user',
      targetId: userId,
      targetLabel: `用户：${name}`,
      conversationId: activeConversationId ?? activeConversation?.id,
      reportedUserId: userId
    });
    setMemberMenu(null);
    closeMuteSubmenuNow();
  }

  function openConversationReport(targetConversation: Conversation): void {
    setReportTarget({
      targetType: 'conversation',
      targetId: targetConversation.id,
      targetLabel: `群聊：${conversationDisplayTitle(targetConversation, currentUser)}`,
      conversationId: targetConversation.id
    });
  }

  function copySelectedMessages(): void {
    copyMessages(visibleMessagesByIds(selectedMessageIds));
    cancelMultiSelect();
  }

  function quoteMessage(message: Message): void {
    if (message.recalled_at) {
      return;
    }
    const senderId = message.sender_id ?? message.sender?.id;
    const senderName = messageSenderLabel(message);
    const quoteText = truncateText(messagePreview(message), 120);
    const quoteData = {
      message_id: message.id,
      sender_id: senderId,
      sender_name: senderName,
      preview: quoteText,
      type: message.type,
      content: message.content,
      created_at: message.created_at
    };
    setMessageMenu(null);
    const mentionTarget = isGroup && senderId
      ? { userId: senderId as number, name: senderName }
      : undefined;
    insertQuoteToken(quoteData, mentionTarget);
  }

  function insertEmoji(emoji: string): void {
    insertTextAtCaret(emoji);
  }

  function sendFavoriteSticker(sticker: FavoriteStickerItem): void {
    if (!activeConversationId || sendMutation.isPending) {
      return;
    }
    setActionError('');
    setShowEmojiPicker(false);
    stickToBottomRef.current = true;
    sendMutation.mutate({ content: sticker.url, type: 'image', metadata: { sticker: true, sticker_asset_id: sticker.asset_id } });
  }

  function deleteFavoriteSticker(event: React.MouseEvent<HTMLButtonElement>, sticker: FavoriteStickerItem): void {
    event.stopPropagation();
    if (removeFavoriteStickerMutation.isPending) {
      return;
    }
    if (window.confirm('确定要删除这个收藏表情吗？')) {
      removeFavoriteStickerMutation.mutate(sticker.asset_id);
    }
  }

  function favoriteClickedImage(): void {
    const imageUrl = messageMenu?.clickedImageUrl?.trim();
    if (!imageUrl || favoriteStickerMutation.isPending) {
      return;
    }
    favoriteStickerMutation.mutate(imageUrl);
  }

  function openUserCard(event: React.MouseEvent<HTMLElement>, user?: User | null, label?: string, member?: ConversationMember | null): void {
    setMessageMenu(null);
    setMemberMenu(null);
    const resolvedMember = member ?? (isGroup ? memberFromUser(user) : null);
    if (isMobile) {
      setUserCard(null);
      setMobileUserProfile({ user, label, fallbackUserId: user?.id ?? resolvedMember?.user_id ?? resolvedMember?.user?.id, member: resolvedMember });
      return;
    }
    setUserCard({ user, label, anchor: elementAnchorInContainer(event.currentTarget, overlayRootRef.current) });
  }

  function openMessageMenu(event: React.MouseEvent<HTMLElement>, message: Message, clickedImageUrl?: string): void {
    event.preventDefault();
    if (clickedImageUrl) {
      event.stopPropagation();
    }
    setUserCard(null);
    setMemberMenu(null);
    setMessageMenu({ message, clickedImageUrl: clickedImageUrl ?? null, ...pointInContainer(event.clientX, event.clientY, overlayRootRef.current) });
  }

  function findMemberByUserId(userId?: number | null): ConversationMember | null {
    if (!userId) {
      return null;
    }
    const conversationId = activeConversationId ?? activeConversation?.id;
    return (conversationId ? cachedMemberFromQueries(conversationId, userId) : null) ?? members.find((member) => memberUserId(member) === userId) ?? null;
  }

  function memberFromUser(user?: User | null, fallbackRole: MemberRole = 'member'): ConversationMember | null {
    const userId = user?.id;
    if (!userId) {
      return null;
    }
    return findMemberByUserId(userId) ?? { id: -userId, conversation_id: activeConversationId ?? activeConversation?.id ?? 0, user_id: userId, role: fallbackRole, user };
  }

  function memberFromMessage(message: Message, user?: User | null): ConversationMember | null {
    const userId = message.sender_id ?? user?.id;
    if (!userId) {
      return null;
    }
    const cachedMember = findMemberByUserId(userId);
    if (cachedMember) {
      return cachedMember;
    }
    const metadataRoleValue = message.metadata?.sender_role;
    const metadataRole = metadataRoleValue === 'owner' || metadataRoleValue === 'admin' || metadataRoleValue === 'member' ? metadataRoleValue : null;
    return { id: -userId, conversation_id: message.conversation_id, user_id: userId, role: metadataRole ?? (userId === currentUser.id ? currentRole : 'member'), user };
  }

  function openMemberMenu(event: React.MouseEvent<HTMLElement>, member: ConversationMember | null): void {
    if (!member) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const userId = memberUserId(member);
    const conversationId = activeConversationId ?? activeConversation?.id ?? member.conversation_id;
    const cachedMember = userId && conversationId ? cachedMemberFromQueries(conversationId, userId) : null;
    const nextMember = cachedMember ?? member;
    setMessageMenu(null);
    setUserCard(null);
    const position = pointInContainer(event.clientX, event.clientY, overlayRootRef.current);
    setMemberMenu({ member: nextMember, ...position, loading: Boolean(userId && conversationId) });
    if (userId && conversationId) {
      void getConversationMember(conversationId, userId).then((freshMember) => {
        patchFullMemberCaches(conversationId, freshMember);
        setMemberMenu((current) => {
          if (!current || memberUserId(current.member) !== userId) {
            return current;
          }
          return { ...current, member: freshMember, loading: false };
        });
      }).catch(() => {
        setMemberMenu((current) => current && memberUserId(current.member) === userId ? { ...current, loading: false } : current);
      });
    }
  }

  function canChangeMemberRole(member: ConversationMember): boolean {
    const userId = memberUserId(member);
    return Boolean(isGroup && currentRole === 'owner' && member.role !== 'owner' && userId && userId !== currentUser.id);
  }

  function canSetMemberTitle(member: ConversationMember): boolean {
    const userId = memberUserId(member);
    return Boolean(isGroup && currentRole === 'owner' && member.role !== 'owner' && userId && userId !== currentUser.id);
  }

  function canToggleMute(member: ConversationMember): boolean {
    const userId = memberUserId(member);
    if (!isGroup || !userId || userId === currentUser.id || currentRole === 'member') {
      return false;
    }
    return currentRole === 'owner' ? member.role !== 'owner' : member.role === 'member';
  }

  function canRemoveMember(member: ConversationMember): boolean {
    const userId = memberUserId(member);
    if (!isGroup || !userId || userId === currentUser.id || member.role === 'owner' || currentRole === 'member') {
      return false;
    }
    return currentRole === 'owner' || member.role === 'member';
  }

  function openMemberProfile(member: ConversationMember): void {
    const userId = memberUserId(member);
    const label = userId ? `用户 ${userId}` : '成员';
    const user = resolveKnownUser(member.user, userId, friends);
    if (isMobile) {
      setMobileUserProfile({ user, label, fallbackUserId: user?.id ?? member.user_id ?? member.user?.id, member });
      setUserCard(null);
    } else {
      setUserCard({ user, label, anchor: { left: memberMenu?.left ?? 0, top: memberMenu?.top ?? 0 } });
    }
    setMemberMenu(null);
  }

  function startDirectMessage(member: ConversationMember): void {
    const userId = memberUserId(member);
    if (!userId || userId === currentUser.id || directMutation.isPending) {
      return;
    }
    directMutation.mutate({ user_id: userId, temporary: Boolean(isGroup) });
    setMemberMenu(null);
  }

  function startDirectMessageForUser(user?: User | null): void {
    const userId = user?.id;
    if (!userId || userId === currentUser.id || directMutation.isPending) {
      return;
    }
    directMutation.mutate({ user_id: userId, temporary: false });
    setUserCard(null);
    setMobileUserProfile(null);
  }

  function isFriendUser(userId?: number | null): boolean {
    return isFriendUserId(friends, userId, currentUser.id);
  }

  function isPendingFriendRequest(userId?: number | null): boolean {
    return locallyPendingFriendIds.has(userId ?? -1) || hasPendingOutgoingFriendRequest(outgoingFriendRequests, userId);
  }

  function profileActionForUser(user?: User | null): ProfileAction | undefined {
    const userId = user?.id;
    if (!userId || userId === currentUser.id || user?.is_bot) {
      return undefined;
    }
    if (isFriendUser(userId)) {
      return { label: directMutation.isPending ? '打开中...' : '发消息', onClick: startDirectMessageForUser, disabled: directMutation.isPending };
    }
    if (isPendingFriendRequest(userId)) {
      return { label: '已申请', disabled: true, tone: 'muted', helperText: '好友申请已发送，等待对方通过' };
    }
    return { label: friendRequestMutation.isPending ? '发送中...' : '添加好友', onClick: requestFriend, disabled: friendRequestMutation.isPending };
  }

  function canSendFriendRequest(userId?: number | null): boolean {
    return Boolean(userId && userId !== currentUser.id && !isFriendUser(userId) && !isPendingFriendRequest(userId) && !friendRequestMutation.isPending);
  }

  function requestFriend(user?: User | null): void {
    const userId = user?.id;
    if (!canSendFriendRequest(userId)) {
      return;
    }
    friendRequestMutation.mutate(userId as number);
  }

  function requestFriendFromMember(member: ConversationMember): void {
    const userId = memberUserId(member);
    requestFriend(resolveKnownUser(member.user, userId, friends));
  }

  function closeTemporaryCurrent(): void {
    if (!activeConversationId || closeTemporaryMutation.isPending) {
      return;
    }
    closeTemporaryMutation.mutate(activeConversationId);
  }

  function blockTemporaryCurrent(): void {
    if (!activeConversationId || blockTemporaryMutation.isPending) {
      return;
    }
    blockTemporaryMutation.mutate(activeConversationId);
  }

  function changeMemberRole(member: ConversationMember): void {
    const userId = memberUserId(member);
    if (!activeConversationId || !userId || !canChangeMemberRole(member) || roleMutation.isPending) {
      return;
    }
    roleMutation.mutate({ conversationId: activeConversationId, userId, role: member.role === 'admin' ? 'member' : 'admin' });
    setMemberMenu(null);
  }

  function setMemberCustomTitle(member: ConversationMember): void {
    const userId = memberUserId(member);
    if (!activeConversationId || !userId || !canSetMemberTitle(member) || titleMutation.isPending) {
      return;
    }
    const name = getDisplayName(member.user, `用户 ${userId}`);
    const nextTitle = window.prompt(`设置 ${name} 的群头衔（留空清除）`, member.title ?? '');
    if (nextTitle === null) {
      return;
    }
    titleMutation.mutate({ conversationId: activeConversationId, userId, title: nextTitle.trim() || null });
  }

  function memberMuted(member: ConversationMember): boolean {
    const userId = memberUserId(member);
    const conversationId = activeConversationId ?? activeConversation?.id ?? member.conversation_id;
    const status = userId && conversationId ? memberMuteStatusByKey[`${conversationId}:${userId}`] : undefined;
    const muted = status?.muted ?? Boolean(member.muted);
    const mutedUntil = status?.muted_until ?? member.muted_until ?? null;
    if (!muted) {
      return false;
    }
    const until = parseApiDate(mutedUntil);
    return !mutedUntil || !until || until.getTime() > Date.now();
  }

  function toggleMemberMute(member: ConversationMember, minutes?: number): void {
    const userId = memberUserId(member);
    const conversationId = activeConversationId ?? activeConversation?.id ?? member.conversation_id;
    if (!conversationId || !userId || !canToggleMute(member) || muteMutation.isPending) {
      return;
    }
    const isMuted = memberMuted(member);
    const mutedUntil = minutes ? new Date(Date.now() + minutes * 60 * 1000).toISOString() : null;
    muteMutation.mutate({ conversationId, userId, muted: !isMuted, mutedUntil: !isMuted ? mutedUntil : null });
    setMemberMenu(null);
  }

  function setMemberMuteDuration(member: ConversationMember, option: MuteMenuOption): void {
    if (option.custom) {
      setCustomMute({ member, value: '', unit: 'minutes' });
      setMemberMenu(null);
      setShowMuteSubmenu(false);
      return;
    }
    if (!option.minutes) {
      setMemberMenu(null);
      setShowMuteSubmenu(false);
      return;
    }
    toggleMemberMute(member, option.minutes);
  }

  function customMuteMinutes(state: CustomMuteState): number | null {
    const value = Number(state.value);
    if (!Number.isFinite(value) || value <= 0) {
      return null;
    }
    if (state.unit === 'days') {
      return Math.round(value * 24 * 60);
    }
    if (state.unit === 'hours') {
      return Math.round(value * 60);
    }
    return Math.round(value);
  }

  function confirmCustomMute(): void {
    if (!customMute) {
      return;
    }
    const minutes = customMuteMinutes(customMute);
    if (!minutes) {
      showToast('请输入有效的禁言时长', 'error');
      return;
    }
    if (minutes > 365 * 24 * 60) {
      showToast('禁言时长不能超过365天', 'error');
      return;
    }
    toggleMemberMute(customMute.member, minutes);
    setCustomMute(null);
  }

  function removeMember(member: ConversationMember): void {
    const userId = memberUserId(member);
    if (!activeConversationId || !userId || !canRemoveMember(member) || removeMutation.isPending) {
      return;
    }
    const name = member.nickname?.trim() || getDisplayName(member.user, `用户 ${userId}`);
    if (!window.confirm(`确定将 ${name} 移出群聊吗？`)) {
      return;
    }
    removeMutation.mutate({ conversationId: activeConversationId, userId });
    setMemberMenu(null);
  }

  function toggleReaction(message: Message, emoji: string): void {
    const conversationId = activeConversationId ?? message.conversation_id;
    if (!conversationId || message.recalled_at || reactionMutation.isPending) {
      return;
    }
    reactionMutation.mutate({ conversationId, messageId: message.id, emoji });
    setMessageMenu(null);
    setReactionPicker(null);
  }

  function openReactionPicker(event: React.MouseEvent<HTMLElement>, message: Message): void {
    event.preventDefault();
    event.stopPropagation();
    setMessageMenu(null);
    setReactionPicker({ message, ...elementAnchorInContainer(event.currentTarget, overlayRootRef.current, 0) });
  }

  function canRecall(message: Message): boolean {
    if (message.recalled_at) {
      return false;
    }
    const senderId = message.sender_id ?? message.sender?.id;
    if (senderId === currentUser.id) {
      return true;
    }
    return Boolean(activeConversation?.type === 'group' && (currentRole === 'owner' || currentRole === 'admin'));
  }

  function canFeatureMessage(message: Message): boolean {
    return Boolean(!message.recalled_at && activeConversation?.type === 'group' && (currentRole === 'owner' || currentRole === 'admin'));
  }

  function recallSelectedMessage(message: Message): void {
    if (!activeConversationId || recallMutation.isPending) {
      return;
    }
    recallMutation.mutate({ conversationId: activeConversationId, messageId: message.id });
    setMessageMenu(null);
  }

  function deleteSelectedMessageLocal(message: Message): void {
    const conversationId = activeConversationId ?? message.conversation_id;
    if (!conversationId || deleteLocalMutation.isPending) {
      return;
    }
    deleteLocalMutation.mutate({ conversationId, messageId: message.id });
    setMessageMenu(null);
  }

  function toggleSelectedMessageBookmark(message: Message): void {
    const conversationId = activeConversationId ?? message.conversation_id;
    if (!conversationId || message.recalled_at || bookmarkMutation.isPending) {
      return;
    }
    bookmarkMutation.mutate({ conversationId, messageId: message.id });
    setMessageMenu(null);
  }

  function toggleSelectedMessageFeature(message: Message): void {
    const conversationId = activeConversationId ?? message.conversation_id;
    if (!conversationId || !canFeatureMessage(message) || featureMutation.isPending) {
      return;
    }
    featureMutation.mutate({ conversationId, messageId: message.id });
    setMessageMenu(null);
  }

  function scrollImageIntoView(): void {
    if (stickToBottomRef.current) {
      requestAnimationFrame(() => scrollMessagesToBottom(scrollRef.current, 'smooth'));
    }
  }

  function highlightMessage(messageId: number): void {
    if (jumpHighlightTimeoutRef.current !== null) {
      window.clearTimeout(jumpHighlightTimeoutRef.current);
    }
    setJumpHighlightMessageId(messageId);
    jumpHighlightTimeoutRef.current = window.setTimeout(() => {
      setJumpHighlightMessageId((current) => (current === messageId ? null : current));
      jumpHighlightTimeoutRef.current = null;
    }, 1000);
  }

  async function ensureMessageContextLoaded(messageId: number): Promise<boolean> {
    if (scrollRef.current?.querySelector<HTMLElement>(`[data-message-id="${messageId}"]`)) {
      return true;
    }
    if (!activeConversationId) {
      return false;
    }

    const contextMessages = await getMessageContext(activeConversationId, messageId, { before: 25, after: 25 });
    if (!contextMessages.some((message) => message.id === messageId)) {
      return false;
    }
    newerContextFetchRef.current = false;
    reachedLatestInContextRef.current = false;
    contextBottomArmedRef.current = false;
    setIsFetchingNewerContext(false);
    setJumpContextMessageId(messageId);
    queryClient.setQueryData<MessagesInfiniteData>(['messages', activeConversationId], replaceMessagesWithContextPage(contextMessages));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    return Boolean(scrollRef.current?.querySelector<HTMLElement>(`[data-message-id="${messageId}"]`));
  }

  async function jumpToMessageId(messageId: number): Promise<void> {
    setShowChatSearch(false);
    let loaded = false;
    try {
      loaded = await ensureMessageContextLoaded(messageId);
    } catch {
      showToast('已找到该消息，但无法加载它所在的上下文窗口。', 'error');
      return;
    }
    if (!loaded) {
      showToast('已找到该消息，但该消息对当前账号不可见或已被清除。', 'error');
      return;
    }
    const target = scrollRef.current?.querySelector<HTMLElement>(`[data-message-id="${messageId}"]`);
    if (!target) {
      return;
    }
    stickToBottomRef.current = false;
    requestAnimationFrame(() => {
      target.scrollIntoView({ block: 'center', behavior: 'auto' });
      highlightMessage(messageId);
    });
  }

  function jumpToQuotedMessage(quoteData: MessageQuoteMetadata): void {
    if (!quoteData.message_id) {
      return;
    }
    void jumpToMessageId(quoteData.message_id);
  }

  useEffect(() => {
    if (!pendingJumpMessage || pendingJumpMessage.conversationId !== activeConversationId || messagesQuery.isLoading) {
      return;
    }
    let cancelled = false;
    const messageId = pendingJumpMessage.messageId;
    window.setTimeout(() => {
      if (cancelled) {
        return;
      }
      void jumpToMessageId(messageId).finally(() => {
        if (!cancelled) {
          clearPendingJumpMessage(messageId);
        }
      });
    }, 80);
    return () => {
      cancelled = true;
    };
  }, [activeConversationId, clearPendingJumpMessage, messages.length, messagesQuery.isLoading, pendingJumpMessage]);

  if (!activeConversationId || !activeConversation) {
    return (
      <section className="grid h-full place-items-center p-8 text-center [background:var(--kc-chat)]">
        <div className="max-w-sm rounded-2xl p-8 [background:var(--kc-panel)]">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full [background:var(--kc-panel-muted)] [color:var(--kc-muted)]">
            <Icon name="message" className="h-7 w-7" />
          </div>
          <h3 className="text-lg font-semibold">选择一个会话</h3>
          <p className="mt-2 text-sm leading-6 [color:var(--kc-muted)]">{isMobile ? '返回会话列表开始聊天。' : '从左侧会话列表开始，或在好友页创建新的私聊和群聊。'}</p>
          {isMobile ? <button type="button" onClick={onBack} className="liquid-button mt-5 rounded-xl px-4 py-2 text-sm font-semibold">返回会话</button> : null}
        </div>
      </section>
    );
  }

  const conversation = activeConversation;
  const title = conversationDisplayTitle(conversation, currentUser);
  const mobileTitleParts = conversationMobileTitleParts(conversation, currentUser);
  const outgoingFriendRequests = outgoingFriendRequestsQuery.data ?? [];
  const isGroup = conversation.type === 'group';
  const canPublishAnnouncement = isGroup && (currentRole === 'owner' || currentRole === 'admin');
  const isTemporaryDirect = conversation.type === 'direct' && Boolean(conversation.is_temporary);
  const directUser = conversation.direct_user ?? members.find((member) => memberUserId(member) !== currentUser.id)?.user ?? null;
  const mobileVisibleHeaderActionCount = (isTemporaryDirect ? 2 : 0) + (isGroup && isMobile ? 1 : 0) + 1 + (isGroup ? 1 : 0) + 1;
  const mobileFriendActionWidth = isTemporaryDirect && directUser && !isFriendUser(directUser.id) && !isPendingFriendRequest(directUser.id) ? 62 : 0;
  const mobileHeaderActionsWidth = `${mobileVisibleHeaderActionCount * 32 + Math.max(0, mobileVisibleHeaderActionCount - 1) * 2 + mobileFriendActionWidth}px`;
  const memberCount = conversation.member_count ?? members.length;
  const announcementPreview = conversation.announcement?.trim();
  const memberKeyword = memberSearch.trim().toLowerCase();
  const sortedMembers = [...members].sort((left, right) => {
    const rank = (role: MemberRole): number => (role === 'owner' ? 0 : role === 'admin' ? 1 : 2);
    const roleDelta = rank(left.role) - rank(right.role);
    if (roleDelta !== 0) return roleDelta;
    return (left.joined_at ?? '').localeCompare(right.joined_at ?? '');
  });
  const compactMembers = memberKeyword && !isGroup ? sortedMembers.filter((member) => matchesMember(member, memberKeyword)) : sortedMembers;
  const overlayRoot = overlayRootRef.current;
  const messageMenuPosition = messageMenu ? clampOverlayPosition(messageMenu, MESSAGE_MENU_WIDTH, MESSAGE_MENU_HEIGHT, overlayRoot) : null;
  const memberMenuPosition = memberMenu ? clampOverlayPosition(memberMenu, MEMBER_MENU_WIDTH, MEMBER_MENU_HEIGHT, overlayRoot) : null;
  const reactionPickerPosition = reactionPicker ? clampOverlayPosition(reactionPicker, REACTION_PICKER_WIDTH, REACTION_PICKER_HEIGHT, overlayRoot) : null;
  const selectedMessages = visibleMessagesByIds(selectedMessageIds);
  const mentionQuery = mentionPicker?.query.trim().toLowerCase() ?? '';
  const fallbackMentionMembers = members
    .filter((member) => !mentionQuery || matchesMember(member, mentionQuery))
    .slice(0, 8);
  const mentionMembers = mentionMembersQuery.data ?? fallbackMentionMembers;
  const mentionMembersLoading = Boolean(mentionPicker && mentionMembersQuery.isFetching && !mentionMembersQuery.data);
  const activeMemberMenuMember = memberMenu?.member;
  const activeMemberMenuMuted = activeMemberMenuMember ? memberMuted(activeMemberMenuMember) : false;
  const canShowMuteSubmenu = Boolean(showMuteSubmenu && activeMemberMenuMember && canToggleMute(activeMemberMenuMember) && !activeMemberMenuMuted && !memberMenu?.loading);
  const muteSubmenuPosition = memberMenuPosition
    ? clampOverlayPosition({ left: memberMenuPosition.left + MEMBER_MENU_WIDTH + 8, top: memberMenuPosition.top + 168 }, 112, 196, overlayRoot)
    : null;
  const muteSubmenuBridgePosition = memberMenuPosition && muteSubmenuPosition ? (() => {
    const menuLeft = memberMenuPosition.left;
    const menuRight = memberMenuPosition.left + MEMBER_MENU_WIDTH;
    const submenuLeft = muteSubmenuPosition.left;
    const submenuRight = muteSubmenuPosition.left + 112;
    const gapLeft = Math.min(menuRight, submenuRight);
    const gapRight = Math.max(menuLeft, submenuLeft);
    if (gapRight <= gapLeft) {
      return null;
    }
    return {
      left: gapLeft,
      top: Math.min(memberMenuPosition.top, muteSubmenuPosition.top),
      width: gapRight - gapLeft,
      height: Math.max(memberMenuPosition.top + MEMBER_MENU_HEIGHT, muteSubmenuPosition.top + 196) - Math.min(memberMenuPosition.top, muteSubmenuPosition.top)
    };
  })() : null;

  function messageRoleBadge(message: Message, sender?: User | null): { label: string; className: string } | null {
    if (!isGroup) {
      return null;
    }

    const senderId = message.sender_id ?? sender?.id ?? null;
    const role = members.find((member) => memberUserId(member) === senderId)?.role ?? (senderId === currentUser.id ? currentRole : undefined);
    if (role === 'owner') {
      return { label: '群主', className: '[background:#ffe9d6] [color:#ff7a1a]' };
    }
    if (role === 'admin') {
      return { label: '管理员', className: '[background:#dff1ff] [color:#168bff]' };
    }
    return null;
  }

  function messageTitleBadge(message: Message, roleBadge: { label: string; className: string } | null): { label: string; className: string } | null {
    const title = message.sender_title?.trim();
    if (title) {
      return { label: title, className: '[background:rgba(139,92,246,0.16)] [color:#8b5cf6]' };
    }
    return roleBadge;
  }

  function renderMessageReactions(message: Message, mine: boolean): JSX.Element | null {
    const reactions = (message.reactions ?? []).filter((reaction) => reaction.count > 0);
    if (reactions.length === 0) {
      return null;
    }

    return (
      <div className={`flex flex-wrap gap-1 px-1 pt-0.5 ${mine ? 'justify-end' : 'justify-start'}`}>
        {reactions.map((reaction) => (
          <button key={reaction.emoji} type="button" disabled={reactionMutation.isPending} onClick={() => toggleReaction(message, reaction.emoji)} className={`group relative flex h-6 items-center gap-1 rounded-full border px-2 text-xs shadow-sm transition disabled:cursor-not-allowed disabled:opacity-55 ${reaction.reacted_by_me ? '[background:var(--kc-accent-soft)] [border-color:var(--kc-accent)] [color:var(--kc-accent)]' : '[background:var(--kc-panel)] [border-color:var(--kc-border)] [color:var(--kc-muted)] hover:[background:var(--kc-hover)] hover:[color:var(--kc-text)]'}`} aria-label={`回应 ${reaction.emoji}`}>
            <span className="text-sm leading-none">{reaction.emoji}</span>
            <span className="font-semibold leading-none">{reaction.count}</span>
            <span className={`pointer-events-none absolute bottom-full z-30 mb-2 hidden min-w-28 max-w-56 rounded-xl border px-2.5 py-1.5 text-left text-[11px] leading-5 shadow-float group-hover:block ${mine ? 'right-0' : 'left-0'} [background:var(--kc-panel)] [border-color:var(--kc-border)] [color:var(--kc-text)]`}>
              {reactionUserNames(reaction).length > 0 ? reactionUserNames(reaction).join('、') : `${reaction.count} 人回应`}
            </span>
          </button>
        ))}
        <button type="button" disabled={reactionMutation.isPending} onClick={(event) => openReactionPicker(event, message)} className="grid h-6 w-6 place-items-center rounded-full border text-xs shadow-sm transition [background:var(--kc-panel)] [border-color:var(--kc-border)] [color:var(--kc-muted)] hover:[background:var(--kc-hover)] hover:[color:var(--kc-text)] disabled:cursor-not-allowed disabled:opacity-55" aria-label="添加回应">
          <Icon name="plus" className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  function renderCompactMember(member: ConversationMember): JSX.Element {
    const user = member.user;
    const userId = memberUserId(member);
    const label = userId ? `用户 ${userId}` : '成员';
    const name = member.nickname?.trim() || getDisplayName(user, label);
    const badge = isGroup ? roleBadgeLabel(member.role) : null;
    const isSelf = userId === currentUser.id;

    return (
      <button key={member.id} type="button" onClick={(event) => openUserCard(event, user, label)} onContextMenu={(event) => openMemberMenu(event, member)} className="flex w-full min-w-0 max-w-full items-center gap-2 overflow-hidden rounded-md px-2 py-1.5 text-left transition hover:[background:var(--kc-hover)]">
        <span className="shrink-0 [&>*]:h-6 [&>*]:w-6 [&>*]:text-[10px]">
          <Avatar user={user} label={name} size="sm" />
        </span>
        <span className="min-w-0 flex-1 basis-0 overflow-hidden truncate text-xs [color:var(--kc-muted)]">{isSelf ? getDisplayName(currentUser, name) : name}</span>
        {badge ? <span className="max-w-[42px] shrink-0 truncate rounded px-1 py-0.5 text-[10px] leading-none [background:var(--kc-accent-soft)] [color:var(--kc-accent)]">{badge}</span> : null}
      </button>
    );
  }

  function renderCompactSidebar(): JSX.Element {
    const directName = getDisplayName(directUser, conversation.title || '好友');

    return (
      <aside className="hidden h-full min-h-0 w-full flex-col border-l [background:var(--kc-chat)] [border-color:var(--kc-border)] md:flex">
        {isGroup ? (
          <div role="button" tabIndex={0} onClick={() => setShowAnnouncements(true)} onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              setShowAnnouncements(true);
            }
          }} className="h-[168px] shrink-0 cursor-pointer border-b px-3.5 py-3 text-left transition hover:[background:var(--kc-hover)] [background:var(--kc-chat)] [border-color:var(--kc-border)]" aria-label="查看群公告">
            <div className="flex items-center justify-between gap-2">
              <h4 className="truncate text-sm font-semibold [color:var(--kc-text)]">群公告</h4>
              <Icon name="chevron" className="h-3.5 w-3.5 shrink-0 [color:var(--kc-muted)]" />
            </div>
            <p className={`mt-3 max-h-[112px] overflow-hidden whitespace-pre-wrap break-words text-xs leading-5 ${announcementPreview ? '[color:var(--kc-text)]' : '[color:var(--kc-muted)]'}`}>{announcementPreview ? renderLinkedPreview(announcementPreview) : '暂无群公告'}</p>
          </div>
        ) : (
          <div className="border-b px-3 py-3 [background:var(--kc-chat)] [border-color:var(--kc-border)]">
            <button type="button" onClick={(event) => openUserCard(event, directUser, '好友')} onContextMenu={(event) => openMemberMenu(event, memberFromUser(directUser))} className="flex w-full items-center gap-2 rounded-md p-1.5 text-left transition hover:[background:var(--kc-hover)]">
              <span className="shrink-0 [&>*]:h-7 [&>*]:w-7 [&>*]:text-xs">
                <Avatar user={directUser} label={directName} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{directName}</span>
                <span className="mt-0.5 block truncate text-xs [color:var(--kc-muted)]">{directUser?.bio?.trim() || '咕咕咕~'}</span>
              </span>
              <Icon name="chevron" className="h-3.5 w-3.5 shrink-0 [color:var(--kc-muted)]" />
            </button>
          </div>
        )}

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="px-3 pb-1.5 pt-3">
            <div className="flex items-center justify-between gap-2">
              <h4 className="truncate text-sm font-semibold [color:var(--kc-text)]">{isGroup ? `群聊成员 ${memberCount}` : '联系人'}</h4>
              <button type="button" className="kc-icon-button h-6 w-6" aria-label={isGroup ? '搜索群成员' : '搜索联系人'} aria-expanded={showMemberSearch} onClick={() => {
                const nextShowMemberSearch = !showMemberSearch;
                setShowMemberSearch(nextShowMemberSearch);
                if (!nextShowMemberSearch) {
                  setMemberSearch('');
                }
              }}>
                <Icon name="search" className="h-3.5 w-3.5" />
              </button>
            </div>
            {showMemberSearch ? (
              <label className="mt-2 flex h-8 items-center gap-2 rounded-md border px-2 [background:var(--kc-chat)] [border-color:var(--kc-border)] focus-within:[border-color:var(--kc-accent)]">
                <Icon name="search" className="h-3.5 w-3.5 shrink-0 [color:var(--kc-muted)]" />
                <input ref={memberSearchInputRef} value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} placeholder={isGroup ? '搜索群成员' : '搜索联系人'} className="min-w-0 flex-1 border-0 bg-transparent text-xs outline-none [color:var(--kc-text)] placeholder:[color:var(--kc-muted)]" />
              </label>
            ) : null}
          </div>

          <div className="scroll-soft min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-2 pb-3 [background:var(--kc-chat)]" onMouseDown={() => setMemberMenu(null)}>
            {membersLoading ? <p className="px-2 py-2 text-xs [color:var(--kc-muted)]">正在加载成员...</p> : null}
            {!membersLoading && compactMembers.length === 0 ? <p className="px-2 py-2 text-xs [color:var(--kc-muted)]">{memberKeyword ? '没有找到匹配成员。' : '暂无可显示成员。'}</p> : null}
            <div className="grid min-w-0 max-w-full gap-0.5 overflow-hidden">
              {!membersLoading && compactMembers.map((member) => renderCompactMember(member))}
            </div>
            {!membersLoading && isGroup && membersHasMore ? (
              <button type="button" disabled={membersLoadingMore} onClick={onLoadMoreMembers} className="mt-2 w-full rounded-lg border px-2 py-1.5 text-xs font-medium transition [background:var(--kc-panel)] [border-color:var(--kc-border)] [color:var(--kc-muted)] hover:[background:var(--kc-hover)] hover:[color:var(--kc-text)] disabled:cursor-not-allowed disabled:opacity-55">
                {membersLoadingMore ? '正在加载...' : '加载更多成员'}
              </button>
            ) : null}
          </div>
        </div>
      </aside>
    );
  }

  function renderComposerEditor(mobile: boolean): JSX.Element {
    return (
      <div className={`relative ${mobile ? 'kc-mobile-composer-input min-w-0 flex-1' : 'min-h-[68px]'}`}>
        {!draft.trim() && !quote ? <span className={`pointer-events-none absolute text-sm [color:var(--kc-muted)] ${mobile ? 'left-4 top-[7px] text-[14px] leading-6' : 'left-0 top-1'}`}>{isGroup ? '输入消息，@ 提醒群成员' : '输入消息'}</span> : null}
        <div
          ref={composerRef}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-label="输入消息"
          aria-multiline="true"
          enterKeyHint={mobile ? 'send' : undefined}
          spellCheck={false}
          onBeforeInput={mobile ? handleMobileComposerBeforeInput : undefined}
          onInput={handleComposerInput}
          onClick={() => {
            updateMentionPickerFromComposer();
          }}
          onKeyUp={(event) => handleComposerKeyUp(event, mobile)}
          onFocus={updateMentionPickerFromComposer}
          onTouchMove={mobile ? (event) => {
            event.preventDefault();
          } : undefined}
          onKeyDown={(event) => handleComposerKeyDown(event, mobile)}
          className={`scroll-soft box-border min-w-0 max-w-full max-h-40 overflow-y-auto whitespace-pre-wrap break-words border-0 bg-transparent text-sm leading-6 outline-none [color:var(--kc-text)] empty:before:content-[''] ${mobile ? 'min-h-[38px] px-4 py-[7px] text-[14px] leading-6' : 'min-h-[68px] py-1 pr-1'} ${WRAP_ANYWHERE_CLASS}`}
          style={mobile ? { overflowWrap: 'anywhere' } : undefined}
        />
      </div>
    );
  }

  function renderComposerPreviews(mobile: boolean): JSX.Element {
    return (
      <>
        {quote ? (
          <div className="mb-2">
            <div className={`${mobile ? 'kc-mobile-composer-quote' : 'flex w-fit max-w-full'} items-start gap-2 rounded-2xl px-3 py-2 [background:var(--kc-panel-muted)] [color:var(--kc-text)]`}>
              <div className="min-w-0 max-w-full flex-1 overflow-hidden">
                <p className="truncate text-sm font-semibold">{quote.sender_name}:</p>
                <p className="mt-0.5 min-w-0 max-w-full whitespace-pre-wrap break-words text-sm leading-5 [overflow-wrap:anywhere] [color:var(--kc-muted)]">{quote.preview}</p>
              </div>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setQuote(null)}
                className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full [color:var(--kc-muted)] transition hover:[background:var(--kc-hover)] hover:[color:var(--kc-text)]"
                aria-label="取消引用"
              >
                <Icon name="close" className="h-3 w-3" />
              </button>
            </div>
          </div>
        ) : null}
        {stagedImages.length > 0 ? (
          <div className="mb-2 flex max-w-full flex-wrap gap-2">
            {stagedImages.map((image) => (
              <div key={image.id} className={`${mobile ? 'h-14 w-14' : 'h-16 w-16'} group relative overflow-hidden rounded-xl border [border-color:var(--kc-border)] [background:var(--kc-panel-muted)]`}>
                <img src={image.previewUrl} alt={image.file.name || '待发送图片'} className="h-full w-full object-cover" />
                <button type="button" onClick={() => removeStagedImage(image.id)} className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-black/55 text-white opacity-100 transition md:opacity-0 md:group-hover:opacity-100" aria-label="移除图片">
                  <Icon name="close" className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        ) : null}
        {stagedVoice ? <StagedVoicePreview voice={stagedVoice} onRemove={clearStagedVoice} /> : null}
      </>
    );
  }

  function renderComposerStatus(mobile: boolean): JSX.Element | null {
    const showImageUploading = sendMutation.isPending && stagedImages.length > 0;
    const showVoiceUploading = sendMutation.isPending && Boolean(stagedVoice);
    if ((mobile || !isRecordingVoice) && !showImageUploading && !showVoiceUploading) {
      return null;
    }

    return (
      <div className={`${mobile ? 'kc-mobile-composer-status mb-2' : 'flex items-center gap-2'}`}>
        {!mobile && isRecordingVoice ? (
          <span className="flex items-center gap-2 rounded-full border border-red-500/20 bg-red-500/10 px-2.5 py-1 text-xs font-semibold text-red-500">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
            录音中 {formatVoiceDuration(voiceRecordingMs)}
            <button type="button" onClick={cancelVoiceRecording} className="rounded-full px-1.5 py-0.5 hover:bg-red-500/10">取消</button>
          </span>
        ) : null}
        {showImageUploading ? <span className="text-xs [color:var(--kc-muted)]">图片上传中...</span> : null}
        {showVoiceUploading ? <span className="text-xs [color:var(--kc-muted)]">语音上传中...</span> : null}
      </div>
    );
  }

  function renderMobileComposer(): JSX.Element {
    const sendDisabled = (!draft.trim() && stagedImages.length === 0 && !stagedVoice) || isRecordingVoice || draft.length > MAX_MESSAGE_CONTENT_LENGTH || sendMutation.isPending;
    const voiceHoldDisabled = sendMutation.isPending || stagedImages.length > 0;
    return (
      <div className="kc-mobile-composer-body">
        {renderComposerPreviews(true)}
        {renderComposerStatus(true)}
        <div className="kc-mobile-composer-input-row">
          {mobileVoiceMode ? (
            <div className={`kc-mobile-voice-panel ${isRecordingVoice ? 'kc-mobile-voice-panel-recording' : ''} ${mobileVoiceCanceling ? 'kc-mobile-voice-panel-canceling' : ''}`}>
              {(isRecordingVoice || mobileVoicePreparing) ? (
                <div className={`kc-mobile-voice-cancel-hint ${mobileVoiceCanceling ? 'kc-mobile-voice-cancel-hint-active' : ''}`}>
                  {mobileVoiceCanceling ? '松手取消' : '上滑取消'}
                </div>
              ) : null}
              <button
                type="button"
                className="kc-mobile-voice-hold"
                disabled={voiceHoldDisabled}
                onPointerDown={handleMobileVoicePointerDown}
                onPointerMove={handleMobileVoicePointerMove}
                onPointerUp={handleMobileVoicePointerUp}
                onPointerCancel={handleMobileVoicePointerCancel}
                onLostPointerCapture={handleMobileVoicePointerCancel}
                aria-label="按住说话，上滑取消，松开发送"
              >
                <span className="kc-mobile-voice-hold-main">{mobileVoiceCanceling ? '松手取消' : isRecordingVoice ? `松手发送 ${formatVoiceDuration(voiceRecordingMs)}` : mobileVoicePreparing ? '正在准备麦克风...' : '按住 说话'}</span>
              </button>
            </div>
          ) : renderComposerEditor(true)}
          {mobileVoiceMode ? (
            <button type="button" className="kc-mobile-composer-send kc-mobile-voice-exit" onClick={exitMobileVoiceMode}>
              键盘
            </button>
          ) : (
            <button
              disabled={sendDisabled}
              type="submit"
              className="kc-mobile-composer-send"
              data-keep-composer-focus="true"
              onPointerDown={handleMobileSendPointerDown}
              onMouseDown={handleMobileSendMouseDown}
              onTouchStart={handleMobileSendTouchStart}
              onTouchEnd={handleMobileSendTouchEnd}
              onClick={refocusMobileComposerAfterSubmit}
            >
              发送
            </button>
          )}
        </div>
        <div className="kc-mobile-composer-toolbar" aria-label="消息工具">
          <button className={`kc-mobile-composer-tool disabled:cursor-not-allowed disabled:opacity-45 ${mobileVoiceMode ? 'kc-mobile-composer-tool-active' : ''} ${isRecordingVoice ? 'kc-mobile-composer-tool-recording text-red-500' : ''}`} type="button" onClick={toggleMobileVoiceMode} disabled={sendMutation.isPending} aria-label={mobileVoiceMode ? '关闭语音输入' : '打开语音输入'} aria-expanded={mobileVoiceMode}>
            <Icon name="mic" className="h-6 w-6" />
          </button>
          <button className="kc-mobile-composer-tool disabled:cursor-not-allowed disabled:opacity-45" type="button" onClick={() => imageInputRef.current?.click()} disabled={sendMutation.isPending} aria-label="发送图片">
            <Icon name="image" className="h-6 w-6" />
          </button>
          <button className="kc-mobile-composer-tool disabled:cursor-not-allowed disabled:opacity-45" type="button" onClick={() => cameraInputRef.current?.click()} disabled={sendMutation.isPending} aria-label="拍摄照片">
            <Icon name="camera" className="h-6 w-6" />
          </button>
          <button className="kc-mobile-composer-tool" type="button" onClick={() => { setEmojiPickerTab('emoji'); setShowEmojiPicker((value) => emojiPickerTab !== 'emoji' || !value); }} aria-label="选择表情" aria-expanded={showEmojiPicker && emojiPickerTab === 'emoji'}>
            <Icon name="emoji" className="h-6 w-6" />
          </button>
          <button className="kc-mobile-composer-tool" type="button" onClick={showUnavailableAction} aria-label="更多功能">
            <Icon name="plus" className="h-6 w-6" />
          </button>
        </div>
      </div>
    );
  }

  function renderDesktopComposer(): JSX.Element {
    const sendDisabled = (!draft.trim() && stagedImages.length === 0 && !stagedVoice) || isRecordingVoice || draft.length > MAX_MESSAGE_CONTENT_LENGTH || sendMutation.isPending;
    return (
      <>
        {isTaskAssistantChat ? (
          <div className="mb-2 flex items-center gap-2 border-b pb-2 [border-color:var(--kc-border)]">
            <button type="button" onClick={() => openTaskCenter('assigned')} className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm [border-color:var(--kc-border)] hover:[background:var(--kc-hover)]">
              <Icon name="checkSquare" className="h-4 w-4 [color:var(--kc-accent)]" /> 创建任务
            </button>
            <button type="button" onClick={() => openTaskCenter('assigned')} className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm [border-color:var(--kc-border)] hover:[background:var(--kc-hover)]">
              <Icon name="list" className="h-4 w-4 [color:var(--kc-muted)]" /> 我的任务
            </button>
          </div>
        ) : null}
        <div className="mb-1 flex items-center gap-4 [color:var(--kc-text)]">
          <button className="kc-icon-button h-7 w-7" type="button" onClick={() => setShowEmojiPicker((value) => !value)} aria-label="选择表情" aria-expanded={showEmojiPicker}><Icon name="emoji" className="h-4 w-4" /></button>
          <button className="kc-icon-button h-7 w-7 disabled:cursor-not-allowed disabled:opacity-45" type="button" onClick={() => imageInputRef.current?.click()} disabled={sendMutation.isPending} title="发送图片">
            <Icon name="image" className="h-4 w-4" />
          </button>
          <button className={`kc-icon-button h-7 w-7 disabled:cursor-not-allowed disabled:opacity-45 ${isRecordingVoice ? 'text-red-500' : ''}`} type="button" onClick={() => isRecordingVoice ? stopVoiceRecording() : void startVoiceRecording()} disabled={sendMutation.isPending} title={isRecordingVoice ? '停止录音' : '录制语音'}>
            <Icon name="mic" className="h-4 w-4" />
          </button>
          <button className="kc-icon-button h-7 w-7" type="button" onClick={showUnavailableAction} title="发送文件"><Icon name="folder" className="h-4 w-4" /></button>
          {canCreateTask ? (
            <button className="kc-icon-button h-7 w-7" type="button" onClick={() => setTaskComposerOpen(true)} title="创建任务"><Icon name="checkSquare" className="h-4 w-4" /></button>
          ) : null}
          {renderComposerStatus(false)}
        </div>
        <div className="flex min-h-[92px] items-end gap-3">
          <div className="min-w-0 flex-1 min-h-[92px]">
            {renderComposerPreviews(false)}
            {renderComposerEditor(false)}
          </div>
          <span className={`shrink-0 text-[11px] ${draft.length > MAX_MESSAGE_CONTENT_LENGTH ? 'text-red-500' : '[color:var(--kc-muted)]'}`}>{draft.length}/{MAX_MESSAGE_CONTENT_LENGTH}</span>
          <button disabled={sendDisabled} type="submit" className="liquid-button h-9 shrink-0 rounded-xl px-5 text-sm transition disabled:cursor-not-allowed disabled:opacity-45">
            发送
          </button>
        </div>
      </>
    );
  }

  return (
    <section ref={overlayRootRef} className={`relative grid h-full min-h-0 grid-cols-1 overflow-hidden [background:var(--kc-chat)] [color:var(--kc-text)] ${isMobile ? 'kc-mobile-panel' : 'kc-pc-chat-panel md:grid-cols-[minmax(0,1fr)_180px]'}`}>
      {taskComposerOpen && activeConversationId && activeConversation?.type === 'group' ? (
        <TaskEditorModal
          conversationId={activeConversationId}
          currentUser={currentUser}
          onClose={() => setTaskComposerOpen(false)}
          onCreated={() => void queryClient.invalidateQueries({ queryKey: ['tasks'] })}
        />
      ) : null}
      {showGroupTasks && activeConversationId && activeConversation?.type === 'group' && activeConversation.tasks_enabled ? (
        <GroupTasksPanel
          conversationId={activeConversationId}
          groupName={title}
          onClose={() => setShowGroupTasks(false)}
          onOpenTask={(id) => { setShowGroupTasks(false); openChatTaskDetail(id); }}
          onCreateTask={canCreateTask ? () => { setShowGroupTasks(false); setTaskComposerOpen(true); } : undefined}
        />
      ) : null}
      {chatTaskDetailId != null ? (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={closeChatTaskDetail}>
          <div className="h-full w-full max-w-[460px] [background:var(--kc-panel)]" onClick={(event) => event.stopPropagation()}>
            <TaskDetailPanel
              taskId={chatTaskDetailId}
              currentUser={currentUser}
              onClose={closeChatTaskDetail}
              onOpenTask={(id) => openChatTaskDetail(id)}
              onCreateSubtask={(task) => setSubtaskParent({ conversationId: task.conversation_id, parentId: task.id })}
            />
          </div>
        </div>
      ) : null}
      {subtaskParent ? (
        <TaskEditorModal
          conversationId={subtaskParent.conversationId}
          currentUser={currentUser}
          defaultParentId={subtaskParent.parentId}
          onClose={() => setSubtaskParent(null)}
          onCreated={() => {
            setSubtaskParent(null);
            void queryClient.invalidateQueries({ queryKey: ['tasks'] });
          }}
        />
      ) : null}
      {toast ? (
        <div className="pointer-events-none absolute inset-0 z-[70] grid place-items-center px-4">
          <div className={`kc-toast flex max-w-[min(380px,calc(100%-32px))] items-center gap-3 rounded-[22px] border px-5 py-4 text-sm font-semibold shadow-float ${toast.exiting ? 'kc-toast-exit' : 'kc-toast-enter'} ${toast.tone === 'error' ? 'kc-toast-error' : 'kc-toast-info'}`}>
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-black">{toast.tone === 'error' ? '!' : 'i'}</span>
            <span className="min-w-0 break-words">{toast.message}</span>
          </div>
        </div>
      ) : null}
        <div className={`relative grid min-h-0 overflow-hidden ${isMobile ? isNativeApp ? 'kc-qq-chat-page kc-native-chat-page grid-rows-[auto_minmax(0,1fr)_auto]' : 'kc-qq-chat-page grid-rows-[30px_56px_minmax(0,1fr)_auto]' : 'grid-rows-[52px_minmax(0,1fr)_auto]'}`}>
        {isMobile && !isNativeApp ? <MobileStatusBar /> : null}
        <div className={`border-b [background:var(--kc-chat)] [border-color:var(--kc-border)] ${isMobile ? 'kc-qq-chat-header flex min-w-0 items-center justify-between gap-2 overflow-hidden border-b-0 px-2' : 'flex items-center justify-between px-5'}`}>
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden" style={isMobile ? { maxWidth: `calc(100vw - ${mobileHeaderActionsWidth} - 64px)` } : undefined}>
            {isMobile ? (
              <button type="button" onClick={onBack} className="kc-mobile-chat-back-button relative grid h-10 w-10 shrink-0 place-items-center rounded-full [color:var(--kc-text)]" aria-label="返回会话列表">
                <Icon name="chevronLeft" className="h-6 w-6" />
                {mobileBackUnreadCount > 0 ? <span className="kc-mobile-chat-back-unread absolute -right-1 top-0 grid h-5 min-w-5 place-items-center rounded-full bg-[#168bff] px-1 text-[10px] font-bold text-white">{mobileBackUnreadCount > 99 ? '99+' : mobileBackUnreadCount}</span> : null}
              </button>
            ) : null}
            <div className="min-w-0 flex-1 overflow-hidden">
              <h3 className={`flex min-w-0 max-w-full items-center gap-1 truncate font-semibold ${isMobile ? 'text-[16px] leading-tight [color:var(--kc-text)]' : 'text-base'}`}>
                {isMobile ? (
                  <>
                    <span className="min-w-0 flex-1 truncate">{mobileTitleParts.name}</span>
                    {mobileTitleParts.suffix ? <span className="shrink-0">{mobileTitleParts.suffix}</span> : null}
                  </>
                ) : <span className="truncate">{title}</span>}
                {isTemporaryDirect ? <span className="shrink-0 text-xs font-medium [color:var(--kc-muted)]">临时会话</span> : null}
              </h3>
              {isMobile ? <p className="mt-0.5 max-w-full truncate text-[12px] font-medium [color:var(--kc-muted)]">{isGroup ? `${memberCount}人 · 群聊` : directUser?.bio?.trim() || '在线'}</p> : null}
            </div>
          </div>
          <div className="ml-auto flex max-w-[calc(100vw-64px)] shrink-0 items-center justify-end gap-0.5 overflow-hidden">
            {isTemporaryDirect && directUser && !isFriendUser(directUser.id) && !isPendingFriendRequest(directUser.id) ? <button className="rounded-full border px-3 py-1.5 text-xs font-semibold transition hover:[background:var(--kc-hover)] [border-color:var(--kc-border)] [color:var(--kc-text)]" type="button" disabled={friendRequestMutation.isPending} onClick={() => requestFriend(directUser)}>{friendRequestMutation.isPending ? '发送中' : '加好友'}</button> : null}
            {isTemporaryDirect ? <button className="kc-icon-button h-8 w-8" type="button" disabled={closeTemporaryMutation.isPending} onClick={closeTemporaryCurrent} title="关闭临时会话"><Icon name="close" className="h-4 w-4" /></button> : null}
            {isTemporaryDirect ? <button className="kc-icon-button h-8 w-8" type="button" disabled={blockTemporaryMutation.isPending} onClick={blockTemporaryCurrent} title="屏蔽此人的临时会话"><Icon name="shield" className="h-4 w-4" /></button> : null}
            {isGroup && isMobile ? <button className="kc-icon-button h-8 w-8" type="button" onClick={() => setShowAnnouncements(true)} aria-label="查看群公告" aria-expanded={showAnnouncements}><Icon name="announcement" className="h-4 w-4" /></button> : null}
            <button className="kc-icon-button h-8 w-8" type="button" onClick={() => setShowChatSearch(true)} aria-label="搜索聊天记录" aria-expanded={showChatSearch}><Icon name="search" className="h-4 w-4" /></button>
            {isGroup && Boolean(activeConversation?.tasks_enabled) ? <button className="kc-icon-button h-8 w-8" type="button" onClick={() => setShowGroupTasks(true)} aria-label="群任务" aria-expanded={showGroupTasks} title="群任务"><Icon name="checkSquare" className="h-4 w-4" /></button> : null}
            {isGroup ? <button className="kc-icon-button h-8 w-8" type="button" onClick={() => setShowFeaturedMessages(true)} aria-label="查看群精华消息" aria-expanded={showFeaturedMessages}><Icon name="sparkles" className="h-4 w-4" /></button> : null}
            {!isTemporaryDirect && !isMobile ? <button className="kc-icon-button h-8 w-8" type="button" onClick={showUnavailableAction} title="语音通话"><Icon name="phone" className="h-4 w-4" /></button> : null}
            {!isTemporaryDirect && !isMobile ? <button className="kc-icon-button h-8 w-8" type="button" onClick={showUnavailableAction} title="视频通话"><Icon name="video" className="h-4 w-4" /></button> : null}
            <button className="kc-icon-button h-8 w-8" type="button" onClick={openInfoDrawer} aria-label="打开聊天资料" aria-expanded={showInfoDrawer}><Icon name="more" className="h-4 w-4" /></button>
          </div>
        </div>

        <div className="relative min-h-0 overflow-hidden">
            <div ref={scrollRef} className={`scroll-soft h-full select-text overflow-y-auto ${isMobile ? 'kc-qq-chat-scroll kc-mobile-page-transition px-2.5 py-3' : 'px-5 py-8'}`} onScroll={handleMessagesScroll} onMouseDown={() => {
            setMessageMenu(null);
            setMemberMenu(null);
          }}>
            {actionError ? <p className="mb-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-500">{actionError}</p> : null}
            {messagesQuery.isLoading ? <p className="rounded-xl p-4 text-sm [background:var(--kc-panel-muted)] [color:var(--kc-muted)]">正在加载消息...</p> : null}
            {messagesQuery.isFetchingNextPage ? <p className="mb-3 text-center text-xs [color:var(--kc-muted)]">正在加载更早消息...</p> : null}
            {!messagesQuery.hasNextPage && messages.length > 0 ? <p className="mb-3 text-center text-xs [color:var(--kc-muted)]">没有更早消息了</p> : null}
            <div className={`grid ${isMobile ? 'kc-mobile-message-list min-w-0 max-w-full gap-3 overflow-x-hidden' : 'gap-7'}`}>
            {messages.map((message, index) => {
              const showTimeDivider = shouldShowTimeDivider(message, messages[index - 1]);
              const sender = senderOf(message);
              const mine = (message.sender_id ?? sender?.id) === currentUser.id;
              const recalled = Boolean(message.recalled_at);
              const senderRoleBadge = messageRoleBadge(message, sender);
              const senderTitleBadge = messageTitleBadge(message, senderRoleBadge);
              const senderMember = memberFromMessage(message, mine ? currentUser : sender);
              const selected = selectedMessageIds.includes(message.id);
              const messageQuote = quoteMetadataOf(message);
              const rawMentionData = mentionMetadataOf(message);
              const messageMentionData = {
                mentionAll: rawMentionData.mentionAll,
                mentions: rawMentionData.mentions.map((mention) => {
                  const fallback = /^用户\s*\d+$/.test(mention.name.trim()) ? memberMentionName(findMemberByUserId(mention.user_id), mention.name) : mention.name;
                  return fallback === mention.name ? mention : { ...mention, name: fallback };
                })
              };
              const messageImages = messageImageUrls(message);
              const groupShareCard = groupShareCardOf(message);
              const postShareCard = postShareCardOf(message);
              const botShareCard = botShareCardOf(message);
              const userShareCard = userShareCardOf(message);
              const teamupShareCard = teamupShareCardOf(message);
              const taskShareCard = taskShareCardOf(message);
              const taskEventCard = taskEventCardOf(message);
              const stickerMessage = isStickerMessage(message);
              if (message.type === 'system') {
                return (
                  <div key={message.id}>
                    {showTimeDivider ? <MessageTimeDivider value={message.created_at} /> : null}
                    <div data-message-id={message.id} className="kc-message-enter kc-pc-message-row flex justify-center" onContextMenu={(event) => openMessageMenu(event, message)}>
                      <div className={`min-w-0 max-w-[76%] select-text rounded-full px-3 py-1.5 text-center text-xs leading-5 [background:var(--kc-panel-muted)] [color:var(--kc-muted)] ${WRAP_ANYWHERE_CLASS}`}>
                        <span className="whitespace-pre-wrap">{message.content || '系统消息'}</span>
                      </div>
                    </div>
                  </div>
                );
              }
              if (recalled) {
                return (
                  <div key={message.id}>
                    {showTimeDivider ? <MessageTimeDivider value={message.created_at} /> : null}
                    <div data-message-id={message.id} className="kc-message-enter kc-pc-message-row flex justify-center" onContextMenu={(event) => openMessageMenu(event, message)}>
                      <div className="select-none rounded-full px-3 py-1.5 text-xs leading-none [background:var(--kc-panel-muted)] [color:var(--kc-muted)]">消息已撤回</div>
                    </div>
                  </div>
                );
              }

              return (
                <div key={message.id} className={isMobile ? 'min-w-0 max-w-full overflow-hidden' : undefined}>
                  {showTimeDivider ? <MessageTimeDivider value={message.created_at} /> : null}
                  <div data-message-id={message.id} className={`kc-message-enter ${isMobile ? 'kc-mobile-message-row w-full min-w-0 max-w-full overflow-hidden' : 'kc-pc-message-row'} flex items-start rounded-2xl transition ${isMobile ? 'gap-2 px-1 py-0.5' : 'gap-3 px-2 py-1'} ${jumpHighlightMessageId === message.id ? '[background:rgba(22,139,255,0.12)]' : ''} ${mine ? 'justify-end' : 'justify-start'}`} onContextMenu={(event) => openMessageMenu(event, message)} onDoubleClick={() => quoteMessage(message)}>
                  {multiSelectMode && !mine ? (
                    <label className="mt-8 grid h-5 w-5 shrink-0 place-items-center rounded-full border [background:var(--kc-panel)] [border-color:var(--kc-border)]">
                      <input type="checkbox" checked={selected} onChange={() => toggleMessageSelected(message)} className="h-3.5 w-3.5 accent-[var(--kc-accent)]" aria-label="选择消息" />
                    </label>
                  ) : null}
                  {!mine ? (
                    <button type="button" onClick={(event) => openUserCard(event, sender, '好友', senderMember)} onContextMenu={(event) => openMemberMenu(event, senderMember)} className={`${isMobile ? 'h-9 w-9' : 'h-9 w-9'} shrink-0 rounded-full text-left [&>*]:h-full [&>*]:w-full`}>
                      <Avatar user={sender} size="message" />
                    </button>
                  ) : null}
                  <div className={`min-w-0 ${isMobile ? 'kc-mobile-message-stack' : 'max-w-[75%]'} ${mine ? 'items-end' : 'items-start'} flex flex-col gap-0.5`} style={isMobile ? { flex: '0 1 auto', width: 'auto', maxWidth: isNativeApp ? '72vw' : '78%' } : undefined}>
                    <div className={`kc-mobile-message-meta flex flex-nowrap items-center gap-1 px-1 text-[11px] [color:var(--kc-muted)] ${mine ? 'justify-end' : 'justify-start'}`}>
                      <span className={`kc-mobile-message-identity inline-flex min-w-0 max-w-full items-center gap-1 ${mine ? 'justify-end' : 'justify-start'}`}>
                        <span className="kc-mobile-message-name min-w-0 truncate">{messageSenderLabel(message)}</span>
                        {message.sender?.is_bot ? (
                          <span className="kc-mobile-message-title inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-semibold leading-none [background:#dbeafe] [color:#2563eb]"><Icon name="bot" className="h-3 w-3" />机器人</span>
                        ) : isGroup && senderTitleBadge ? (
                          <span className={`kc-mobile-message-title inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-semibold leading-none ${senderTitleBadge.className}`}>
                            {message.sender_level ? <span>Lv.{message.sender_level}</span> : null}
                            <span>{senderTitleBadge.label}</span>
                          </span>
                        ) : isGroup && message.sender_level ? <span className="kc-mobile-message-level rounded px-1 py-0.5 text-[10px] font-semibold leading-none [background:rgba(148,163,184,0.16)] [color:#64748b]">Lv.{message.sender_level}</span> : null}
                      </span>
                      {isGroup && senderRoleBadge && senderTitleBadge?.label !== senderRoleBadge.label ? <span className={`kc-mobile-message-badge rounded px-1 py-0.5 text-[10px] leading-none ${senderRoleBadge.className}`}>{senderRoleBadge.label}</span> : null}
                      {message.bookmarked_by_me ? <span className="kc-mobile-message-badge inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] leading-none [background:var(--kc-accent-soft)] [color:var(--kc-accent)]"><Icon name="star" className="h-3 w-3" />收藏</span> : null}
                      {message.featured ? <span className="kc-mobile-message-badge inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] leading-none [background:#fff5cc] [color:#b77900]"><Icon name="sparkles" className="h-3 w-3" />精华</span> : null}
                    </div>
                    {message.type === 'image' ? (
                      <div className={`kc-mobile-message-content flex max-w-full flex-col gap-2 ${mine ? 'items-end' : 'items-start'}`}>
                        {messageQuote ? renderQuoteBlock(messageQuote, false, jumpToQuotedMessage) : null}
                        {resolveAssetUrl(message.content) ? <button type="button" onClick={() => openImageViewer([message.content], 0)} onContextMenu={(event) => openMessageMenu(event, message, message.content)} className={`${stickerMessage ? 'kc-mobile-sticker-frame border-transparent bg-transparent' : 'kc-mobile-image-message [border-color:var(--kc-border)]'} kc-mobile-media-frame block select-text overflow-hidden rounded-xl border text-left`}><img src={resolveMessageImagePreviewUrl(message.content)} alt={stickerMessage ? '表情包' : '聊天图片'} onLoad={scrollImageIntoView} className={stickerMessage ? 'max-h-32 max-w-32 object-contain' : 'max-h-72 max-w-full object-contain'} /></button> : <UnavailableImageLabel />}
                      </div>
                    ) : message.type === 'voice' ? (
                      <div className={`kc-mobile-message-content flex max-w-full flex-col gap-2 ${mine ? 'items-end' : 'items-start'}`}>
                        {messageQuote ? renderQuoteBlock(messageQuote, false, jumpToQuotedMessage) : null}
                        <VoiceMessageBubble message={message} mine={mine} onContextMenu={openMessageMenu} />
                      </div>
                    ) : message.type === 'forward_bundle' ? (
                      <div className={`kc-mobile-message-content flex max-w-full flex-col gap-2 ${mine ? 'items-end' : 'items-start'}`}>
                        {messageQuote ? renderQuoteBlock(messageQuote, false, jumpToQuotedMessage) : null}
                        <ForwardBundleCard message={message} onOpen={() => setForwardDetailMessage(message)} />
                      </div>
                    ) : groupShareCard ? (
                      <div className={`kc-mobile-message-content flex max-w-full flex-col gap-2 ${mine ? 'items-end' : 'items-start'}`}>
                        {messageQuote ? renderQuoteBlock(messageQuote, false, jumpToQuotedMessage) : null}
                        <GroupShareCard card={groupShareCard} conversations={conversations} onToast={showToast} onError={setActionError} />
                      </div>
                    ) : postShareCard ? (
                      <div className={`kc-mobile-message-content flex max-w-full flex-col gap-2 ${mine ? 'items-end' : 'items-start'}`}>
                        {messageQuote ? renderQuoteBlock(messageQuote, false, jumpToQuotedMessage) : null}
                        <PostShareCard card={postShareCard} onOpenPost={onOpenPost} />
                      </div>
                    ) : botShareCard ? (
                      <div className={`kc-mobile-message-content flex max-w-full flex-col gap-2 ${mine ? 'items-end' : 'items-start'}`}>
                        {messageQuote ? renderQuoteBlock(messageQuote, false, jumpToQuotedMessage) : null}
                        <BotShareCard card={botShareCard} />
                      </div>
                    ) : userShareCard ? (
                      <div className={`kc-mobile-message-content flex max-w-full flex-col gap-2 ${mine ? 'items-end' : 'items-start'}`}>
                        {messageQuote ? renderQuoteBlock(messageQuote, false, jumpToQuotedMessage) : null}
                        <UserShareCard card={userShareCard} />
                      </div>
                    ) : teamupShareCard ? (
                      <div className={`kc-mobile-message-content flex max-w-full flex-col gap-2 ${mine ? 'items-end' : 'items-start'}`}>
                        {messageQuote ? renderQuoteBlock(messageQuote, false, jumpToQuotedMessage) : null}
                        <TeamupShareCard card={teamupShareCard} />
                      </div>
                    ) : taskShareCard ? (
                      <div className={`kc-mobile-message-content flex max-w-full flex-col gap-2 ${mine ? 'items-end' : 'items-start'}`}>
                        {messageQuote ? renderQuoteBlock(messageQuote, false, jumpToQuotedMessage) : null}
                        <TaskShareCard card={taskShareCard} />
                      </div>
                    ) : taskEventCard ? (
                      <div className={`kc-mobile-message-content flex max-w-full flex-col gap-2 ${mine ? 'items-end' : 'items-start'}`}>
                        {messageQuote ? renderQuoteBlock(messageQuote, false, jumpToQuotedMessage) : null}
                        <TaskEventCard event={taskEventCard} />
                      </div>
                    ) : messageImages.length > 0 ? (
                      <div className={`min-w-0 max-w-full select-text rounded-xl shadow-none ${isMobile ? 'kc-mobile-message-bubble rounded-[16px] px-3 py-2 text-[13px] leading-5' : 'px-3.5 py-2.5 text-sm leading-6'} ${mine ? 'rounded-tr-sm [background:var(--kc-bubble-out)] [color:var(--kc-text)]' : 'rounded-tl-sm [background:var(--kc-bubble-in)] [color:var(--kc-text)]'} ${WRAP_ANYWHERE_CLASS}`}>
                        {messageQuote ? renderQuoteBlock(messageQuote, false, jumpToQuotedMessage) : null}
                        {message.content || hasBotRenderableElements(message) ? <><div className={`break-words ${!isBotMarkdownMessage(message) && !hasBotRenderableElements(message) ? 'whitespace-pre-wrap' : ''} ${WRAP_ANYWHERE_CLASS}`}>{hasBotRenderableElements(message) ? renderBotElementContent(message, messageMentionData, (interaction) => handleBotInteraction(message, interaction)) : isBotMarkdownMessage(message) ? renderSafeBotMarkdown(botMarkdownContent(message), (interaction) => handleBotInteraction(message, interaction), message) : renderMentionedText(message.content, messageMentionData)}</div><CcwCreationCards previews={ccwCreationPreviewsFromMetadata(message.metadata)} compact={isMobile} /></> : null}
                        <div className={`mt-2 grid gap-2 ${messageImages.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                          {messageImages.map((imageUrl, index) => {
                            const originalSrc = resolveAssetUrl(imageUrl);
                            const src = resolveMessageImagePreviewUrl(imageUrl);
                            return originalSrc && src ? <button key={`${imageUrl}-${index}`} type="button" onClick={() => openImageViewer(messageImages, index)} onContextMenu={(event) => openMessageMenu(event, message, imageUrl)} className="kc-mobile-media-frame kc-mobile-image-message block overflow-hidden rounded-xl border text-left [border-color:var(--kc-border)]" style={isMobile ? { width: '100%', maxWidth: '100%' } : undefined}><img src={src} alt="聊天图片" onLoad={scrollImageIntoView} className={isMobile ? 'max-h-64 w-full object-cover' : 'max-h-60 w-full object-cover'} /></button> : <UnavailableImageLabel key={`${imageUrl}-${index}`} />;
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className={`min-w-0 max-w-full select-text whitespace-pre-wrap rounded-xl shadow-none ${isMobile ? 'kc-mobile-message-bubble rounded-[16px] px-3 py-2 text-[13px] leading-5' : 'px-3.5 py-2.5 text-sm leading-6'} ${mine ? 'rounded-tr-sm [background:var(--kc-bubble-out)] [color:var(--kc-text)]' : 'rounded-tl-sm [background:var(--kc-bubble-in)] [color:var(--kc-text)]'} ${WRAP_ANYWHERE_CLASS}`}>
                        {messageQuote ? renderQuoteBlock(messageQuote, false, jumpToQuotedMessage) : null}
                        {hasBotRenderableElements(message) ? renderBotElementContent(message, messageMentionData, (interaction) => handleBotInteraction(message, interaction)) : isBotMarkdownMessage(message) ? renderSafeBotMarkdown(botMarkdownContent(message), (interaction) => handleBotInteraction(message, interaction), message) : renderMentionedText(message.content, messageMentionData)}
                        {message.content ? <CcwCreationCards previews={ccwCreationPreviewsFromMetadata(message.metadata)} compact={isMobile} /> : null}
                      </div>
                    )}
                    {renderMessageReactions(message, mine)}
                  </div>
                  {mine ? (
                    <button type="button" onClick={(event) => openUserCard(event, currentUser, getDisplayName(currentUser, '用户'), senderMember)} onContextMenu={(event) => openMemberMenu(event, senderMember)} className={`${isMobile ? 'h-9 w-9' : 'h-9 w-9'} shrink-0 rounded-full text-left [&>*]:h-full [&>*]:w-full`}>
                      <Avatar user={currentUser} size="message" />
                    </button>
                  ) : null}
                  {multiSelectMode && mine ? (
                    <label className="mt-8 grid h-5 w-5 shrink-0 place-items-center rounded-full border [background:var(--kc-panel)] [border-color:var(--kc-border)]">
                      <input type="checkbox" checked={selected} onChange={() => toggleMessageSelected(message)} className="h-3.5 w-3.5 accent-[var(--kc-accent)]" aria-label="选择消息" />
                    </label>
                  ) : null}
                  </div>
                </div>
              );
            })}
            </div>
            {isFetchingNewerContext ? <p className="mt-3 text-center text-xs [color:var(--kc-muted)]">正在加载更新消息...</p> : null}
            {isMobile && multiSelectMode ? <div className="h-24 shrink-0" aria-hidden="true" /> : null}
            <div ref={bottomRef} />
          </div>

          {showScrollToBottom ? (
            <button
              type="button"
              onClick={scrollToLatestMessage}
              className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-semibold shadow-float transition hover:-translate-x-1/2 hover:-translate-y-0.5 hover:[background:var(--kc-hover)] [background:var(--kc-panel)] [border-color:var(--kc-border)] [color:var(--kc-text)]"
            >
              回到底部
            </button>
          ) : null}
        </div>

        <form onSubmit={submit} onPaste={handlePaste} className={`relative border-t [background:var(--kc-chat)] [border-color:var(--kc-border)] ${isMobile ? `kc-mobile-composer border-t-0 ${isNativeApp ? 'kc-native-composer' : ''}` : 'kc-pc-composer px-5 py-3'}`}>
          {multiSelectMode ? (
            <div className={`absolute left-5 right-5 flex items-center justify-between gap-3 rounded-2xl border px-4 py-2.5 shadow-float [background:var(--kc-panel)] [border-color:var(--kc-border)] ${isMobile ? '-top-16 z-30' : '-top-14'}`}>
              <span className="text-sm font-semibold">已选择 {selectedMessages.length} 条消息</span>
              <div className="flex items-center gap-2">
                <button type="button" disabled={selectedMessages.length === 0} onClick={copySelectedMessages} className="rounded-xl px-3 py-1.5 text-sm font-semibold transition hover:[background:var(--kc-hover)] disabled:cursor-not-allowed disabled:opacity-45">复制</button>
                <button type="button" disabled={selectedMessages.length === 0} onClick={() => openForwardModal(selectedMessageIds)} className="liquid-button rounded-xl px-3 py-1.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-45">转发</button>
                <button type="button" onClick={cancelMultiSelect} className="rounded-xl px-3 py-1.5 text-sm font-semibold transition hover:[background:var(--kc-hover)]">取消</button>
              </div>
            </div>
          ) : null}
          {sendMutation.error && !actionError ? <p className="mb-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-500">发送失败，请稍后重试。</p> : null}
          <input ref={imageInputRef} type="file" accept="image/*" onChange={chooseImage} className="hidden" />
          <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={chooseImage} className="hidden" />
          {showEmojiPicker ? (
            <div ref={emojiPickerRef} onMouseDown={(event) => event.stopPropagation()} className="absolute bottom-[154px] left-5 z-20 flex h-[248px] w-[292px] max-w-[calc(100vw-40px)] flex-col overflow-hidden rounded-[20px] border shadow-float [background:var(--kc-panel)] [border-color:var(--kc-border)]">
              <div className="flex min-h-0 flex-1 flex-col px-3 pb-2 pt-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[13px] font-semibold">{emojiPickerTab === 'emoji' ? 'Emoji 表情' : '收藏表情包'}</p>
                    <p className="text-[11px] [color:var(--kc-muted)]">{emojiPickerTab === 'emoji' ? '点击插入到输入框' : `共 ${favoriteStickersQuery.data?.length ?? 0} 个收藏表情`}</p>
                  </div>
                </div>
                <div className="scroll-soft min-h-0 flex-1 overflow-y-auto pr-1">
                  {emojiPickerTab === 'emoji' ? (
                    <div className="grid grid-cols-7 gap-1.5">
                      {EMOJIS.map((emoji) => (
                        <button key={emoji} type="button" onClick={() => insertEmoji(emoji)} className="grid h-8 w-8 place-items-center rounded-lg text-lg transition hover:[background:var(--kc-hover)]" aria-label={`插入表情 ${emoji}`}>
                          {emoji}
                        </button>
                      ))}
                    </div>
                  ) : favoriteStickersQuery.isLoading ? (
                    <div className="grid h-full place-items-center rounded-xl [background:var(--kc-panel-muted)]">
                      <p className="text-xs [color:var(--kc-muted)]">正在加载收藏表情...</p>
                    </div>
                  ) : favoriteStickersQuery.error ? (
                    <div className="grid h-full place-items-center rounded-xl [background:var(--kc-panel-muted)] px-4 text-center">
                      <p className="text-xs [color:var(--kc-muted)]">收藏表情加载失败，请稍后再试</p>
                    </div>
                  ) : (favoriteStickersQuery.data ?? []).length === 0 ? (
                    <div className="grid h-full place-items-center rounded-xl [background:var(--kc-panel-muted)] px-4 text-center">
                      <div>
                        <p className="text-[13px] font-semibold">还没有收藏表情</p>
                        <p className="mt-1 text-[11px] leading-4 [color:var(--kc-muted)]">在聊天图片上右键，选择“添加表情”即可收藏</p>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-4 gap-1.5">
                      {(favoriteStickersQuery.data ?? []).map((sticker) => {
                        const src = resolveMessageImagePreviewUrl(sticker.url);
                        return (
                          <div key={sticker.asset_id} className="group relative aspect-square">
                            <button
                              type="button"
                              onClick={() => sendFavoriteSticker(sticker)}
                              className="h-full w-full overflow-hidden rounded-xl border transition hover:-translate-y-0.5 hover:[border-color:var(--kc-accent)] [background:var(--kc-panel-muted)] [border-color:var(--kc-border)]"
                              title="发送收藏表情"
                            >
                              {src ? <img src={src} alt="收藏表情" className="h-full w-full object-cover" /> : <span className="grid h-full w-full place-items-center text-[11px] [color:var(--kc-muted)]">不可用</span>}
                            </button>
                            <button
                              type="button"
                              onClick={(event) => deleteFavoriteSticker(event, sticker)}
                              disabled={removeFavoriteStickerMutation.isPending}
                              className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full border border-red-500/25 bg-white/90 text-red-500 opacity-0 shadow-sm transition hover:bg-red-500 hover:text-white group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-45"
                              title="删除收藏表情"
                              aria-label="删除收藏表情"
                            >
                              <Icon name="trash" className="h-3 w-3" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5 border-t px-2.5 py-2 [background:var(--kc-panel-muted)] [border-color:var(--kc-border)]">
                <button type="button" onClick={() => setEmojiPickerTab('emoji')} className={`grid h-8 w-8 place-items-center rounded-xl transition ${emojiPickerTab === 'emoji' ? '[background:var(--kc-panel)] [color:var(--kc-accent)] shadow-sm' : '[color:var(--kc-muted)] hover:[background:var(--kc-hover)] hover:[color:var(--kc-text)]'}`} aria-label="普通 Emoji">
                  <Icon name="emoji" className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => setEmojiPickerTab('stickers')} className={`grid h-8 w-8 place-items-center rounded-xl transition ${emojiPickerTab === 'stickers' ? '[background:var(--kc-panel)] [color:var(--kc-accent)] shadow-sm' : '[color:var(--kc-muted)] hover:[background:var(--kc-hover)] hover:[color:var(--kc-text)]'}`} aria-label="收藏表情包">
                  <Icon name="heart" className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : null}
          {mentionPicker ? (
            <div className="absolute bottom-[106px] left-5 z-30 w-72 overflow-hidden rounded-2xl border shadow-float [background:var(--kc-panel)] [border-color:var(--kc-border)]">
              {(currentRole === 'owner' || currentRole === 'admin') ? (
                <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={insertMentionAll} className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:[background:var(--kc-hover)]">
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full [background:var(--kc-accent-soft)] [color:var(--kc-accent)]"><Icon name="users" className="h-4 w-4" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">全体成员</p>
                    <p className="text-xs [color:var(--kc-muted)]">剩余 {MENTION_ALL_REMAINING} 次</p>
                  </div>
                </button>
              ) : null}
              {mentionMembersLoading ? <p className="px-3 py-3 text-sm [color:var(--kc-muted)]">正在搜索成员...</p> : null}
              {!mentionMembersLoading && mentionMembers.length === 0 ? <p className="px-3 py-3 text-sm [color:var(--kc-muted)]">没有匹配成员</p> : null}
              {mentionMembers.map((member) => {
                const userId = memberUserId(member);
                const name = member.nickname?.trim() || getDisplayName(member.user, userId ? `用户 ${userId}` : '成员');
                return (
                  <button key={member.id} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => insertMention(member)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:[background:var(--kc-hover)]">
                    <Avatar user={member.user} label={name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{name}</p>
                      <p className="text-xs [color:var(--kc-muted)]">@{name}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : null}
          {isMobile ? renderMobileComposer() : renderDesktopComposer()}
        </form>
      </div>

      {!isMobile ? renderCompactSidebar() : null}
      {messageMenu && messageMenuPosition ? (
        <div className="absolute inset-0 z-40" onMouseDown={() => setMessageMenu(null)}>
          <ContextMenuSurface onMouseDown={(event) => event.stopPropagation()} style={messageMenuPosition} className="scroll-soft absolute max-h-[min(416px,calc(100%-16px))] w-[252px] overflow-y-auto">
            {!messageMenu.message.recalled_at ? (
              <div className="flex items-center gap-1 border-b px-2 py-2 [border-color:var(--kc-border)]">
                {QUICK_REACTION_EMOJIS.map((emoji) => (
                  <button key={emoji} type="button" disabled={reactionMutation.isPending} onClick={() => toggleReaction(messageMenu.message, emoji)} className="grid h-8 w-8 place-items-center rounded-full text-lg transition hover:[background:var(--kc-hover)] disabled:cursor-not-allowed disabled:opacity-45" aria-label={`回应 ${emoji}`}>
                    {emoji}
                  </button>
                ))}
                <button type="button" disabled={reactionMutation.isPending} onClick={(event) => openReactionPicker(event, messageMenu.message)} className="grid h-8 w-8 place-items-center rounded-full text-base transition [color:var(--kc-muted)] hover:[background:var(--kc-hover)] hover:[color:var(--kc-text)] disabled:cursor-not-allowed disabled:opacity-40" aria-label="更多回应">
                  <Icon name="plus" className="h-4 w-4" />
                </button>
              </div>
            ) : null}
            <div className="py-1">
              {messageMenu.message.type !== 'image' ? (
                <ContextMenuItem label="复制" icon="copy" disabled={Boolean(messageMenu.message.recalled_at)} onClick={() => {
                  copyText(messageCopyText(messageMenu.message));
                  setMessageMenu(null);
                }} />
              ) : null}
              {messageMenu.clickedImageUrl ? <ContextMenuItem label="添加表情" icon="heart" disabled={Boolean(messageMenu.message.recalled_at) || favoriteStickerMutation.isPending} onClick={favoriteClickedImage} /> : null}
              <ContextMenuItem label="转发" icon="send" disabled={Boolean(messageMenu.message.recalled_at)} onClick={() => openForwardModal([messageMenu.message.id])} />
              <ContextMenuItem label={messageMenu.message.bookmarked_by_me ? '取消收藏' : '收藏'} icon="star" disabled={Boolean(messageMenu.message.recalled_at) || bookmarkMutation.isPending} onClick={() => toggleSelectedMessageBookmark(messageMenu.message)} />
              <ContextMenuItem label="多选" icon="checkSquare" disabled={Boolean(messageMenu.message.recalled_at)} onClick={() => startMultiSelect(messageMenu.message)} />
              <ContextMenuItem label="引用" icon="quote" disabled={Boolean(messageMenu.message.recalled_at)} onClick={() => quoteMessage(messageMenu.message)} />
              {isGroup && (currentRole === 'owner' || currentRole === 'admin') ? <ContextMenuItem label={messageMenu.message.featured ? '取消精华' : '设为精华'} icon="sparkles" disabled={!canFeatureMessage(messageMenu.message) || featureMutation.isPending} onClick={() => toggleSelectedMessageFeature(messageMenu.message)} /> : null}
              <ContextMenuItem label="撤回" icon="recall" disabled={!canRecall(messageMenu.message) || recallMutation.isPending} onClick={() => recallSelectedMessage(messageMenu.message)} />
              <ContextMenuItem label="删除" icon="trash" danger disabled={deleteLocalMutation.isPending} onClick={() => deleteSelectedMessageLocal(messageMenu.message)} />
              <div className="my-1 border-t [border-color:var(--kc-border)]" />
              <ContextMenuItem label="举报" icon="flag" disabled={Boolean(messageMenu.message.recalled_at)} onClick={() => openMessageReport(messageMenu.message)} />
            </div>
          </ContextMenuSurface>
        </div>
      ) : null}
      {memberMenu && memberMenuPosition ? (
        <div className="absolute inset-0 z-40" onMouseDown={() => setMemberMenu(null)}>
          <ContextMenuSurface onMouseLeave={closeMuteSubmenuSoon} onMouseDown={(event) => event.stopPropagation()} style={memberMenuPosition} className="scroll-soft absolute z-10 max-h-[min(356px,calc(100%-16px))] w-[220px] overflow-y-auto py-1">
            <ContextMenuItem label="发送消息" icon="message" disabled={memberUserId(memberMenu.member) === currentUser.id || directMutation.isPending} onMouseEnter={closeMuteSubmenuNow} onClick={() => startDirectMessage(memberMenu.member)} />
            {!isFriendUser(memberUserId(memberMenu.member)) && !isPendingFriendRequest(memberUserId(memberMenu.member)) ? <ContextMenuItem label="添加好友" icon="plus" disabled={!canSendFriendRequest(memberUserId(memberMenu.member))} onMouseEnter={closeMuteSubmenuNow} onClick={() => requestFriendFromMember(memberMenu.member)} /> : null}
            <ContextMenuItem label="@TA" icon="atSign" disabled={!isGroup || memberUserId(memberMenu.member) === currentUser.id} onMouseEnter={closeMuteSubmenuNow} onClick={() => mentionMemberFromMenu(memberMenu.member)} />
            <ContextMenuItem label="查看资料" icon="profile" onMouseEnter={closeMuteSubmenuNow} onClick={() => openMemberProfile(memberMenu.member)} />
            {(canChangeMemberRole(memberMenu.member) || canSetMemberTitle(memberMenu.member) || canToggleMute(memberMenu.member) || canRemoveMember(memberMenu.member)) ? <div className="my-1 border-t [border-color:var(--kc-border)]" /> : null}
            {canChangeMemberRole(memberMenu.member) ? <ContextMenuItem label={memberMenu.member.role === 'admin' ? '取消管理员' : '设为管理员'} icon={memberMenu.member.role === 'admin' ? 'shield' : 'shieldCheck'} disabled={roleMutation.isPending} onMouseEnter={closeMuteSubmenuNow} onClick={() => changeMemberRole(memberMenu.member)} /> : null}
            {canSetMemberTitle(memberMenu.member) ? <ContextMenuItem label={memberMenu.member.title?.trim() ? '修改群头衔' : '设置群头衔'} icon="profile" disabled={titleMutation.isPending} onMouseEnter={closeMuteSubmenuNow} onClick={() => setMemberCustomTitle(memberMenu.member)} /> : null}
            {memberMenu.loading ? <ContextMenuItem label="正在同步成员状态..." icon="clock" disabled onMouseEnter={closeMuteSubmenuNow} onClick={() => undefined} /> : null}
            {canToggleMute(memberMenu.member) && !memberMenu.loading ? <ContextMenuItem label={activeMemberMenuMuted ? '解除禁言' : '设置群内禁言'} icon={activeMemberMenuMuted ? 'volume' : 'clock'} suffix={activeMemberMenuMuted ? undefined : '›'} disabled={muteMutation.isPending} onMouseEnter={() => activeMemberMenuMuted ? closeMuteSubmenuNow() : openMuteSubmenu()} onClick={() => activeMemberMenuMuted ? toggleMemberMute(memberMenu.member) : undefined} /> : null}
            {canRemoveMember(memberMenu.member) ? <ContextMenuItem label="移出本群" icon="trash" danger disabled={removeMutation.isPending} onMouseEnter={closeMuteSubmenuNow} onClick={() => removeMember(memberMenu.member)} /> : null}
            <div className="my-1 border-t [border-color:var(--kc-border)]" />
            <ContextMenuItem label="举报" icon="flag" disabled={memberUserId(memberMenu.member) === currentUser.id} onMouseEnter={closeMuteSubmenuNow} onClick={() => openMemberReport(memberMenu.member)} />
          </ContextMenuSurface>
          {canShowMuteSubmenu && muteSubmenuBridgePosition ? (
            <div onMouseDown={(event) => event.stopPropagation()} onMouseEnter={openMuteSubmenu} onMouseLeave={closeMuteSubmenuSoon} className="absolute z-0" style={muteSubmenuBridgePosition} />
          ) : null}
          {canShowMuteSubmenu && activeMemberMenuMember && muteSubmenuPosition ? (
              <ContextMenuSurface onMouseDown={(event) => event.stopPropagation()} onMouseEnter={openMuteSubmenu} onMouseLeave={closeMuteSubmenuSoon} style={muteSubmenuPosition} className="absolute z-20 w-28 rounded-xl py-1">
                {MUTE_MENU_OPTIONS.map((option) => (
                  <button key={option.label} type="button" disabled={muteMutation.isPending} onClick={() => setMemberMuteDuration(activeMemberMenuMember, option)} className="flex w-full items-center px-3 py-2 text-left transition hover:[background:var(--kc-hover)] disabled:cursor-not-allowed disabled:opacity-45">
                    {option.label}
                  </button>
                ))}
              </ContextMenuSurface>
          ) : null}
        </div>
      ) : null}
      {customMute ? (
        <div className="fixed inset-0 z-[60] grid place-items-center p-4 [background:rgba(15,23,42,0.24)]" onMouseDown={() => setCustomMute(null)}>
          <div onMouseDown={(event) => event.stopPropagation()} className="w-full max-w-[320px] overflow-hidden rounded-[24px] border shadow-float [background:var(--kc-panel)] [border-color:var(--kc-border)] [color:var(--kc-text)]">
            <div className="border-b px-5 py-4 [border-color:var(--kc-border)]">
              <h3 className="text-base font-semibold">自定义禁言时长</h3>
              <p className="mt-1 text-xs [color:var(--kc-muted)]">设置后到期会自动解除禁言。</p>
            </div>
            <div className="space-y-3 px-5 py-4">
              <label className="block text-xs font-medium [color:var(--kc-muted)]" htmlFor="custom-mute-value">时长</label>
              <div className="flex gap-2">
                <input
                  id="custom-mute-value"
                  value={customMute.value}
                  onChange={(event) => setCustomMute((state) => state ? { ...state, value: event.target.value.replace(/[^0-9.]/g, '') } : state)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      confirmCustomMute();
                    }
                  }}
                  autoFocus
                  inputMode="decimal"
                  placeholder="输入数字"
                  className="min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm outline-none transition focus:border-[var(--kc-accent)] [background:var(--kc-panel-muted)] [border-color:var(--kc-border)]"
                />
                <select
                  value={customMute.unit}
                  onChange={(event) => setCustomMute((state) => state ? { ...state, unit: event.target.value as CustomMuteState['unit'] } : state)}
                  className="rounded-xl border px-2 py-2 text-sm outline-none transition focus:border-[var(--kc-accent)] [background:var(--kc-panel-muted)] [border-color:var(--kc-border)]"
                >
                  <option value="minutes">分钟</option>
                  <option value="hours">小时</option>
                  <option value="days">天</option>
                </select>
              </div>
              <p className="text-xs [color:var(--kc-muted)]">最长 365 天，支持小数小时/天。</p>
            </div>
            <div className="flex justify-end gap-2 border-t px-5 py-3 [border-color:var(--kc-border)]">
              <button type="button" onClick={() => setCustomMute(null)} className="rounded-xl px-4 py-2 text-sm transition hover:[background:var(--kc-hover)]">取消</button>
              <button type="button" disabled={muteMutation.isPending} onClick={confirmCustomMute} className="liquid-button rounded-xl px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-45">确定</button>
            </div>
          </div>
        </div>
      ) : null}
      {reactionPicker && reactionPickerPosition ? (
        <div className="absolute inset-0 z-50" onMouseDown={() => setReactionPicker(null)}>
          <div onMouseDown={(event) => event.stopPropagation()} style={reactionPickerPosition} className="scroll-soft absolute max-h-[min(320px,calc(100%-16px))] w-[320px] overflow-y-auto rounded-[24px] border p-3 shadow-float [background:var(--kc-panel)] [border-color:var(--kc-border)] [color:var(--kc-text)]">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">选择回应</p>
                <p className="text-xs [color:var(--kc-muted)]">常用表情</p>
              </div>
              <button type="button" onClick={() => setReactionPicker(null)} className="kc-icon-button h-7 w-7" aria-label="关闭表情回应"><Icon name="close" className="h-3.5 w-3.5" /></button>
            </div>
            <div className="mb-3 flex gap-1.5 rounded-2xl p-2 [background:var(--kc-panel-muted)]">
              {QUICK_REACTION_EMOJIS.map((emoji) => (
                <button key={emoji} type="button" disabled={reactionMutation.isPending} onClick={() => toggleReaction(reactionPicker.message, emoji)} className="grid h-9 w-9 place-items-center rounded-xl text-xl transition hover:[background:var(--kc-hover)] disabled:cursor-not-allowed disabled:opacity-45" aria-label={`回应 ${emoji}`}>{emoji}</button>
              ))}
            </div>
            <div className="scroll-soft max-h-56 overflow-y-auto pr-1">
              <div className="grid grid-cols-8 gap-1.5">
                {FULL_REACTION_EMOJIS.map((emoji) => (
                  <button key={emoji} type="button" disabled={reactionMutation.isPending} onClick={() => toggleReaction(reactionPicker.message, emoji)} className="grid h-8 w-8 place-items-center rounded-lg text-lg transition hover:[background:var(--kc-hover)] disabled:cursor-not-allowed disabled:opacity-45" aria-label={`回应 ${emoji}`}>{emoji}</button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {forwardTarget ? (
        <ForwardTargetModal
          conversations={conversations}
          currentUser={currentUser}
          activeConversationId={activeConversationId}
          messageIds={forwardTarget.messageIds}
          isPending={forwardMutation.isPending}
          onConfirm={(targetConversationId, note) => forwardMutation.mutate({ targetConversationId, sourceConversationId: activeConversationId, messageIds: forwardTarget.messageIds, note })}
          onClose={() => setForwardTarget(null)}
        />
      ) : null}
      {forwardDetailMessage ? <ForwardBundleDetailModal message={forwardDetailMessage} mobile={isMobile} onClose={() => setForwardDetailMessage(null)} /> : null}
      {imageViewer ? <ImageViewer viewer={imageViewer} mobile={isMobile} onClose={() => setImageViewer(null)} onNavigate={(index) => setImageViewer((current) => current ? { ...current, index } : current)} /> : null}
      {showChatSearch ? <ChatSearchModal conversationId={activeConversationId} title={title} mobile={isMobile} onOpenForwardBundle={(message) => setForwardDetailMessage(message)} onOpenImage={openImageViewer} onJump={(messageId) => void jumpToMessageId(messageId)} onClose={() => setShowChatSearch(false)} /> : null}
      {reportTarget ? (
        <ReportModal
          targetType={reportTarget.targetType}
          targetId={reportTarget.targetId}
          targetLabel={reportTarget.targetLabel}
          conversationId={reportTarget.conversationId}
          messageId={reportTarget.messageId}
          reportedUserId={reportTarget.reportedUserId}
          isPending={reportMutation.isPending}
          error={reportMutation.error}
          onSubmit={(payload) => reportMutation.mutate(payload)}
          onClose={() => setReportTarget(null)}
        />
      ) : null}
      {showFeaturedMessages && isGroup ? (
        <FeaturedMessagesModal
          items={featuredMessagesQuery.data ?? []}
          isLoading={featuredMessagesQuery.isLoading}
          error={featuredMessagesQuery.error}
          canManage={currentRole === 'owner' || currentRole === 'admin'}
          isToggling={featureMutation.isPending}
          onToggleFeature={(message) => toggleSelectedMessageFeature(message)}
          onOpenForwardBundle={(message) => setForwardDetailMessage(message)}
          onClose={() => setShowFeaturedMessages(false)}
          mobile={isMobile}
        />
      ) : null}
      {userCard ? <UserCard user={userCard.user} label={userCard.label} anchor={userCard.anchor} containerRef={overlayRootRef} action={profileActionForUser(userCard.user)} onClose={() => setUserCard(null)} /> : null}
      {mobileUserProfile ? <MobileUserProfilePage user={mobileUserProfile.user} label={mobileUserProfile.label} fallbackUserId={mobileUserProfile.fallbackUserId} currentUserId={currentUser.id} currentUser={currentUser} action={profileActionForUser(mobileUserProfile.user)} groupContext={mobileUserProfile.member && activeConversation ? { conversationId: activeConversation.id, member: mobileUserProfile.member, currentRole, onMemberUpdated: (member) => setMobileUserProfile((current) => current ? { ...current, member } : current) } : undefined} onClose={() => setMobileUserProfile(null)} /> : null}
      {showAnnouncements && isGroup ? <AnnouncementModal conversation={conversation} canPublish={canPublishAnnouncement} mobile={isMobile} onClose={() => setShowAnnouncements(false)} /> : null}
      {showInfoDrawer ? <ChatInfoDrawer conversation={conversation} currentUser={currentUser} members={members} friends={friends} membersLoading={membersLoading} currentRole={currentRole} conversations={conversations} isMobile={isMobile} onReportConversation={openConversationReport} onClose={closeInfoDrawer} /> : null}
    </section>
  );
}
