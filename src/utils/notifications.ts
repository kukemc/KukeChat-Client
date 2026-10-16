import { useKukeStore } from '@/store/kukeStore';
import { SOUND_KINDS, useSoundStore, type SoundKind } from '@/store/soundStore';
import type { Conversation, Message } from '@/types/api';
import { resolveAssetUrl } from '@/utils/assetUrl';
import { showDesktopMessageNotification } from '@/native/desktopNotifications';
import { isNativeMobileApp, isTauriDesktopApp } from '@/utils/appMode';
import { customSoundUrl, loadCustomSounds } from '@/utils/customSounds';
import { messageMentionKind } from '@/utils/mentions';
import { pokeInfoOf, pokeText } from '@/utils/poke';
import { giftPreview } from '@/utils/gift';
import { redPacketPreview } from '@/utils/redPacket';
import startSoundUrl from '@/sounds/开始提示音.mp3';
import leaveSoundUrl from '@/sounds/离开服务器.mp3';
import joinSoundUrl from '@/sounds/进入服务器.mp3';
import mentionSoundUrl from '@/sounds/@提示.mp3';
import messageSoundUrl from '@/sounds/消息提示.mp3';

const soundUrls: Record<SoundKind, string> = {
  start: startSoundUrl,
  leave: leaveSoundUrl,
  join: joinSoundUrl,
  mention: mentionSoundUrl,
  message: messageSoundUrl
};

/** 每种提示音留一个播放器，记着它装的是哪个地址：设置换了声音，地址对不上就重建。 */
const audioCache = new Map<SoundKind, { url: string; audio: HTMLAudioElement }>();
let playedConnectionReadySound = false;

function dropCachedAudio(kind: SoundKind): void {
  audioCache.get(kind)?.audio.pause();
  audioCache.delete(kind);
}

// 某一种的设置变了（换了音频、关掉、恢复默认）就丢掉它的播放器，旧音频的地址随后会被回收
useSoundStore.subscribe((state, previous) => {
  for (const kind of SOUND_KINDS) {
    if (state.slots[kind] !== previous.slots[kind]) {
      dropCachedAudio(kind);
    }
  }
});

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

function audioFor(kind: SoundKind, url: string): HTMLAudioElement {
  const cached = audioCache.get(kind);
  if (cached?.url === url) {
    return cached.audio;
  }

  cached?.audio.pause();
  const audio = new Audio(url);
  audio.preload = 'auto';
  audioCache.set(kind, { url, audio });
  return audio;
}

/** 从头放一遍。返回 false 表示这个音频本身坏了（读不到、解不了码），调用方该换一个放。 */
function start(kind: SoundKind, url: string, volume: number): Promise<boolean> {
  const audio = audioFor(kind, url);
  audio.volume = volume / 100;
  audio.pause();
  audio.currentTime = 0;
  // 被浏览器拦下（页面还没有过用户操作）、被下一次播放打断都会让 play() 失败，但那不是音频的问题
  return audio.play().then(() => true, () => audio.error === null);
}

/** 按设置放某一种提示音。走默认声音时到 play() 为止都是同步的，和加设置之前一样。 */
async function playSound(kind: SoundKind): Promise<void> {
  if (typeof Audio === 'undefined') {
    return;
  }

  // 第一次要出声时把自定义音频读出来备着（通常是刚连上服务器那一声），之后的调用什么也不做
  void loadCustomSounds();
  const { slots, volume } = useSoundStore.getState();
  const slot = slots[kind];
  if (slot.mode === 'off') {
    return;
  }

  const customUrl = slot.mode === 'custom' && slot.custom ? await customSoundUrl(slot.custom.id) : null;
  if (customUrl) {
    if (await start(kind, customUrl, volume)) {
      return;
    }
    // 自定义的放不出来：退回默认声音
    dropCachedAudio(kind);
  }
  await start(kind, soundUrls[kind], volume);
}

export function playNotificationSound(kind: SoundKind): void {
  if (useKukeStore.getState().soundNotificationMode !== 'on') {
    return;
  }

  void playSound(kind);
}

/** 设置页的试听：不看总开关，音量和各自的设置照常生效。 */
export function previewNotificationSound(kind: SoundKind): void {
  void playSound(kind);
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
  const redPacket = redPacketPreview(message);
  if (redPacket) {
    return redPacket;
  }
  const gift = giftPreview(message);
  if (gift) {
    return gift;
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
  return messageMentionKind(message, currentUserId) !== null;
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

  // 戳一戳只提醒被戳的人：群里别人互相戳照常计未读，但不响、不弹通知
  const poke = pokeInfoOf(message);
  if (poke && poke.userId !== state.currentUser.id) {
    return;
  }

  const isMention = mentionsCurrentUser(message, state.currentUser.id);
  playNotificationSound(isMention ? 'mention' : 'message');

  const title = conversationTitle(conversation, message);
  // 戳一戳的文案里已经有发起人，不再加「某某：」前缀
  const body = poke ? pokeText(poke, state.currentUser.id) : conversation?.type === 'group' ? `${senderName(message)}：${messagePreview(message)}` : messagePreview(message);
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
