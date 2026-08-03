import { Capacitor, registerPlugin } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import { getApiBaseUrl } from '@/api/client';
import { WS_URL } from '@/config';
import { dispatchNativeOpenConversation } from '@/native/notifications';
import type { Conversation } from '@/types/api';
import { isNativeMobileApp } from '@/utils/appMode';

interface BackgroundRealtimeConfig {
  token: string;
  wsUrl: string;
  apiBaseUrl: string;
  currentUserId: number;
  appForeground: boolean;
}

interface KukeBackgroundRealtimePlugin {
  configure(options: BackgroundRealtimeConfig): Promise<void>;
  start(options: Partial<BackgroundRealtimeConfig>): Promise<void>;
  stop(options?: { clearSession?: boolean }): Promise<void>;
  setAppState(options: { foreground: boolean }): Promise<void>;
  clearMessageNotifications(): Promise<void>;
  updateConversations(options: { conversations: NativeConversationNotificationState[] }): Promise<void>;
  consumePendingOpenConversation(): Promise<{ conversationId?: number }>;
  addListener(eventName: 'openConversation', listener: (event: { conversationId?: number }) => void): Promise<PluginListenerHandle>;
}

interface NativeConversationNotificationState {
  id: number;
  type?: string;
  title?: string | null;
  display_title?: string | null;
  avatar_url?: string | null;
  my_message_setting?: string | null;
  my_do_not_disturb?: boolean;
}

const KukeBackgroundRealtime = registerPlugin<KukeBackgroundRealtimePlugin>('KukeBackgroundRealtime');

let openConversationHandle: PluginListenerHandle | null = null;

function canUseNativeBackgroundRealtime(): boolean {
  return isNativeMobileApp() && Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

function resolveWsUrl(): string {
  if (import.meta.env.DEV) {
    return window.__KukeChatPreviewConfig?.wsUrl ?? WS_URL;
  }
  return WS_URL;
}

function buildConfig(token: string, currentUserId: number, appForeground: boolean): BackgroundRealtimeConfig {
  return {
    token,
    currentUserId,
    appForeground,
    apiBaseUrl: getApiBaseUrl(),
    wsUrl: resolveWsUrl()
  };
}

export async function configureNativeBackgroundRealtime(token: string | null, currentUserId: number | null, appForeground = true): Promise<void> {
  if (!canUseNativeBackgroundRealtime() || !token || !currentUserId) {
    return;
  }
  await KukeBackgroundRealtime.configure(buildConfig(token, currentUserId, appForeground)).catch(() => undefined);
}

export async function startNativeBackgroundRealtime(token: string | null, currentUserId: number | null): Promise<void> {
  if (!canUseNativeBackgroundRealtime() || !token || !currentUserId) {
    return;
  }
  await KukeBackgroundRealtime.start(buildConfig(token, currentUserId, false)).catch(() => undefined);
}

export async function stopNativeBackgroundRealtime(clearSession = false): Promise<void> {
  if (!canUseNativeBackgroundRealtime()) {
    return;
  }
  await KukeBackgroundRealtime.stop({ clearSession }).catch(() => undefined);
}

export async function setNativeBackgroundRealtimeForeground(foreground: boolean): Promise<void> {
  if (!canUseNativeBackgroundRealtime()) {
    return;
  }
  await KukeBackgroundRealtime.setAppState({ foreground }).catch(() => undefined);
}

export async function clearNativeBackgroundRealtimeMessageNotifications(): Promise<void> {
  if (!canUseNativeBackgroundRealtime()) {
    return;
  }
  await KukeBackgroundRealtime.clearMessageNotifications().catch(() => undefined);
}

export async function updateNativeBackgroundRealtimeConversations(conversations: Conversation[]): Promise<void> {
  if (!canUseNativeBackgroundRealtime()) {
    return;
  }
  await KukeBackgroundRealtime.updateConversations({
    conversations: conversations.map((conversation) => ({
      id: conversation.id,
      type: conversation.type,
      title: conversation.title,
      display_title: conversation.display_title,
      avatar_url: conversation.avatar_url,
      my_message_setting: conversation.my_message_setting ?? 'notify',
      my_do_not_disturb: Boolean(conversation.my_do_not_disturb)
    }))
  }).catch(() => undefined);
}

export async function installNativeBackgroundRealtimeOpenHandler(): Promise<void> {
  if (!canUseNativeBackgroundRealtime()) {
    return;
  }
  if (!openConversationHandle) {
    openConversationHandle = await KukeBackgroundRealtime.addListener('openConversation', (event) => {
      const conversationId = Number(event.conversationId);
      if (Number.isFinite(conversationId) && conversationId > 0) {
        dispatchNativeOpenConversation(conversationId);
      }
    }).catch(() => null);
  }

  const pending = await KukeBackgroundRealtime.consumePendingOpenConversation().catch((): { conversationId?: number } => ({}));
  const conversationId = Number(pending.conversationId);
  if (Number.isFinite(conversationId) && conversationId > 0) {
    dispatchNativeOpenConversation(conversationId);
  }
}
