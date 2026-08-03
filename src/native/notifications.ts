import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { useKukeStore } from '@/store/kukeStore';

let installed = false;
let pendingOpenConversationId: number | null = null;

const OPEN_CONVERSATION_EVENT = 'kukechat:native-open-conversation';

export function dispatchNativeOpenConversation(conversationId: number): void {
  pendingOpenConversationId = conversationId;
  window.dispatchEvent(new CustomEvent<{ conversationId: number }>(OPEN_CONVERSATION_EVENT, { detail: { conversationId } }));
}

export function addNativeOpenConversationListener(listener: (conversationId: number) => void): () => void {
  const handler = (event: Event): void => {
    const conversationId = Number((event as CustomEvent<{ conversationId?: number }>).detail?.conversationId);
    if (Number.isFinite(conversationId)) {
      listener(conversationId);
    }
  };
  window.addEventListener(OPEN_CONVERSATION_EVENT, handler);
  if (pendingOpenConversationId !== null) {
    const conversationId = pendingOpenConversationId;
    pendingOpenConversationId = null;
    window.setTimeout(() => listener(conversationId), 0);
  }
  return () => window.removeEventListener(OPEN_CONVERSATION_EVENT, handler);
}

export async function clearNativeMessageNotifications(): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  await Promise.all([
    LocalNotifications.removeAllDeliveredNotifications().catch(() => undefined),
    LocalNotifications.getPending()
      .then((pending) => {
        if (pending.notifications.length === 0) {
          return undefined;
        }
        return LocalNotifications.cancel({ notifications: pending.notifications.map(({ id }) => ({ id })) });
      })
      .catch(() => undefined)
  ]);
}

export async function installNativeNotificationHandlers(): Promise<void> {
  if (installed || !Capacitor.isNativePlatform()) {
    return;
  }
  installed = true;

  if (Capacitor.getPlatform() === 'android') {
    await LocalNotifications.createChannel({
      id: 'messages',
      name: '消息通知',
      description: 'KukeChat 新消息提醒',
      importance: 4,
      visibility: 1,
      lights: true,
      vibration: true,
      sound: 'default'
    }).catch(() => undefined);
  }

  const permission = await LocalNotifications.checkPermissions().catch(() => null);
  if (permission?.display !== 'granted') {
    await LocalNotifications.requestPermissions().catch(() => undefined);
  }

  await clearNativeMessageNotifications();

  await LocalNotifications.addListener('localNotificationActionPerformed', (event) => {
    const conversationId = Number(event.notification.extra?.conversationId);
    if (Number.isFinite(conversationId)) {
      const state = useKukeStore.getState();
      state.openWindow();
      state.setLayoutMode('mobile');
      state.setActiveConversationId(conversationId);
      dispatchNativeOpenConversation(conversationId);
    }
  });
}
