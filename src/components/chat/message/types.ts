import type { InfiniteData } from '@tanstack/react-query';
import type { Conversation, ConversationMember, Friendship, MemberRole, Message, MessageComponentState, MessageMetadata, MessageType, ReportTargetType, User } from '@/types/api';

export interface MessagePanelProps {
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

export interface MessageMenuState {
  message: Message;
  left: number;
  top: number;
  clickedImageUrl?: string | null;
}

export interface MemberMenuState {
  member: ConversationMember;
  left: number;
  top: number;
  loading?: boolean;
}

export interface MemberMuteStatus {
  muted: boolean;
  muted_until: string | null;
}

export interface ToastState {
  id: number;
  message: string;
  tone?: 'info' | 'error';
  exiting?: boolean;
}

export interface BotInteraction {
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

export interface CardState {
  user?: User | null;
  label?: string;
  anchor: OverlayPosition;
}

export interface UserProfilePageState {
  user?: User | null;
  label?: string;
  fallbackUserId?: number;
  member?: ConversationMember | null;
}

export interface ForwardTargetState {
  messageIds: number[];
}

export interface ReportTargetState {
  targetType: ReportTargetType;
  targetId: number;
  targetLabel: string;
  conversationId?: number;
  messageId?: number;
  reportedUserId?: number;
}

export interface ReactionPickerState {
  message: Message;
  left: number;
  top: number;
}

export interface MentionPickerState {
  query: string;
  range: Range | null;
  open: boolean;
}

export interface ForwardBundleSnapshot {
  id?: number;
  senderId?: number;
  senderName: string;
  senderAvatarUrl?: string;
  type: MessageType;
  content: string;
  createdAt?: string;
  metadata?: Record<string, unknown> | null;
}

export interface ForwardBundleData {
  title: string;
  note?: string;
  count: number;
  snapshots: ForwardBundleSnapshot[];
}

export interface OverlayPosition {
  left: number;
  top: number;
}

export interface StagedImage {
  id: string;
  file: File;
  previewUrl: string;
}

export interface StagedVoice {
  file: File;
  previewUrl: string;
  durationMs: number;
  contentType: string;
  size: number;
  waveform: number[];
}

export type EmojiPickerTab = 'emoji' | 'stickers';

export interface SendMessageVariables {
  content: string;
  type: MessageType;
  metadata?: MessageMetadata;
  files?: File[];
  voiceFile?: File;
  voiceDurationMs?: number;
  voiceWaveform?: number[];
}

export type MessagesInfiniteData = InfiniteData<Message[], number | undefined>;

export type ConversationMembersPageData = InfiniteData<{ items: ConversationMember[] }, number | undefined>;

export interface MuteMenuOption {
  label: string;
  minutes?: number;
  custom?: boolean;
}

export interface CustomMuteState {
  member: ConversationMember;
  value: string;
  unit: 'minutes' | 'hours' | 'days';
}
