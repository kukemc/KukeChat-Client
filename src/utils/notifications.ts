import { useKukeStore } from '@/store/kukeStore';
import type { Conversation, Message, MessageMentionMetadata } from '@/types/api';
import { resolveAssetUrl } from '@/utils/assetUrl';
import { showDesktopMessageNotification } from '@/native/desktopNotifications';
import { isNativeMobileApp, isTauriDesktopApp } from '@/utils/appMode';
import startSoundUrl from '@/sounds/开始提示音.mp3';
import leaveSoundUrl from '@/sounds/离开服务器.mp3';
import joinSoundUrl from '@/sounds/进入服务器.mp3';
import mentionSoundUrl from '@/sounds/@提示.mp3';
import messageSoundUrl from '@/sounds/消息提示.mp3';

type SoundKind = 'start' | 'leave' | 'join' | 'mention' | 'message';

const soundUrls: Record<SoundKind, string> = {
  start: startSoundUrl,
  leave: leaveSoundUrl,
  join: joinSoundUrl,
  mention: mentionSoundUrl,
  message: messageSoundUrl
};

const audioCache = new Map<SoundKind, HTMLAudioElement>();
let playedConnectionReadySound = false;

async function showNativeNotification(title: string, body: string, iconUrl: string | undefined, conversationId: number): Promise<boolean> {
  if (!isNativeMobileApp()) {
    return false;
  }

  try {
    const [{ LocalNotifications }, { Capacitor }] = await Promise.all([
      import('@capacitor/local-notifications'),
      import('@capacitor/core')
    ]);
    if (!Capacitor.isNativePlatform()) {
      return false;
    }

    const permission = await LocalNotifications.checkPermissions();
    const display = permission.display === 'granted' ? permission : await LocalNotifications.requestPermissions();
    if (display.display !== 'granted') {
      return false;
    }

    await LocalNotifications.schedule({
      notifications: [
        {
          id: Number(`${conversationId}${Date.now()}`.slice(-9)),
          title,
          body,
          largeBody: body,
          summaryText: 'KukeChat',
          extra: { conversationId },
          largeIcon: iconUrl,
          attachments: iconUrl ? [{ id: 'avatar', url: iconUrl }] : undefined,
          channelId: 'messages'
        }
      ]
    });
    return true;
  } catch {
    return false;
  }
}

function audioFor(kind: SoundKind): HTMLAudioElement | null {
  if (typeof Audio === 'undefined') {
    return null;
  }

  const cached = audioCache.get(kind);
  if (cached) {
    return cached;
  }

  const audio = new Audio(soundUrls[kind]);
  audio.preload = 'auto';
  audio.volume = 0.72;
  audioCache.set(kind, audio);
  return audio;
}

export function playNotificationSound(kind: SoundKind): void {
  if (useKukeStore.getState().soundNotificationMode !== 'on') {
    return;
  }

  const audio = audioFor(kind);
  if (!audio) {
    return;
  }

  audio.pause();
  audio.currentTime = 0;
  void audio.play().catch(() => undefined);
}

function messagePreview(message: Message): string {
  if (message.type === 'image') {
    return '[图片]';
  }
  if (message.type === 'voice') {
    return '[语音]';
  }
  if (message.type === 'forward_bundle') {
    return '[聊天记录]';
  }
  return message.content.replace(/\s+/g, ' ').trim() || '新消息';
}

function conversationTitle(conversation: Conversation | undefined, message: Message): string {
  return conversation?.display_title || conversation?.title || message.sender_display_name || message.sender?.nickname || message.sender?.username || 'KukeChat';
}

function senderName(message: Message): string {
  return message.sender_display_name || message.sender?.nickname || message.sender?.username || '有人';
}

function mentionsCurrentUser(message: Message, currentUserId: number): boolean {
  const metadata = message.metadata;
  if (!metadata) {
    return false;
  }
  if (metadata.mention_all === true) {
    return true;
  }
  const mentions = Array.isArray(metadata.mentions) ? metadata.mentions : [];
  return mentions.some((mention: MessageMentionMetadata) => mention.user_id === currentUserId);
}

export function canAlertConversation(conversation: Conversation | undefined): boolean {
  if (!conversation) {
    return true;
  }
  return conversation.my_message_setting !== 'ignore' && !isConversationMuted(conversation);
}

export function isConversationMuted(conversation: Conversation | undefined): boolean {
  return Boolean(conversation?.my_do_not_disturb || conversation?.my_message_setting === 'silent');
}

export function isConversationBlocked(conversation: Conversation | undefined): boolean {
  return conversation?.my_message_setting === 'ignore';
}

export function notifyIncomingMessage(message: Message, conversation: Conversation | undefined): void {
  const state = useKukeStore.getState();
  if (!state.currentUser || message.sender_id === state.currentUser.id) {
    return;
  }

  const chatVisible = state.isOpen && !state.isMinimized && document.visibilityState === 'visible';
  if (message.conversation_id === state.visibleConversationId && chatVisible) {
    return;
  }

  if (!canAlertConversation(conversation)) {
    return;
  }

  const isMention = mentionsCurrentUser(message, state.currentUser.id);
  playNotificationSound(isMention ? 'mention' : 'message');

  const title = conversationTitle(conversation, message);
  const body = conversation?.type === 'group' ? `${senderName(message)}：${messagePreview(message)}` : messagePreview(message);
  const iconUrl = resolveAssetUrl(conversation?.avatar_url || message.sender?.avatar_url) || undefined;

  if (isNativeMobileApp()) {
    void showNativeNotification(title, body, iconUrl, message.conversation_id);
    return;
  }

  if (isTauriDesktopApp()) {
    if (state.browserNotificationMode === 'on') {
      void showDesktopMessageNotification(title, body);
    }
    return;
  }

  if (state.browserNotificationMode !== 'on' || !('Notification' in window) || Notification.permission !== 'granted') {
    return;
  }

  const notification = new Notification(title, {
    body,
    icon: iconUrl,
    tag: `kukechat-${message.conversation_id}`,
    silent: true
  });

  notification.onclick = () => {
    state.openWindow();
    state.setActiveConversationId(message.conversation_id);
    window.focus();
    notification.close();
  };
}

export function notifyConnectionReady(): void {
  if (playedConnectionReadySound) {
    return;
  }
  playedConnectionReadySound = true;
  playNotificationSound('start');
}

export function notifyMemberJoined(conversation: Conversation | undefined): void {
  if (canAlertConversation(conversation)) {
    playNotificationSound('join');
  }
}

export function notifyMemberLeft(conversation: Conversation | undefined): void {
  if (canAlertConversation(conversation)) {
    playNotificationSound('leave');
  }
}
