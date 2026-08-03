import { isTauriDesktopApp } from '@/utils/appMode';

type TauriNotificationModule = {
  isPermissionGranted: () => Promise<boolean>;
  requestPermission: () => Promise<NotificationPermission>;
  sendNotification: (options: { title: string; body: string }) => void;
};

const TAURI_NOTIFICATION_MODULE = '@tauri-apps/plugin-notification';
const importTauriNotification = (): Promise<TauriNotificationModule> => import(TAURI_NOTIFICATION_MODULE) as Promise<TauriNotificationModule>;

export type DesktopNotificationPermission = NotificationPermission | 'unsupported';

export async function requestDesktopNotificationPermission(): Promise<DesktopNotificationPermission> {
  if (!isTauriDesktopApp()) {
    return 'unsupported';
  }

  try {
    const { isPermissionGranted, requestPermission } = await importTauriNotification();
    if (await isPermissionGranted()) {
      return 'granted';
    }
    return await requestPermission();
  } catch {
    return 'unsupported';
  }
}

export async function showDesktopMessageNotification(title: string, body: string): Promise<boolean> {
  if (!isTauriDesktopApp()) {
    return false;
  }

  try {
    const { isPermissionGranted, sendNotification } = await importTauriNotification();
    if (!(await isPermissionGranted())) {
      return false;
    }

    sendNotification({ title, body });
    return true;
  } catch {
    return false;
  }
}
