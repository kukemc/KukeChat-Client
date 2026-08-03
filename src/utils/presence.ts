import type { PresenceStatus, User, UserOnlineStatusRead } from '@/types/api';

export const presenceOptions: Array<{ value: PresenceStatus; label: string; detail: string }> = [
  { value: 'online', label: '在线', detail: '正常聊天和接收消息' },
  { value: 'creating', label: '正在创作', detail: '适合做作品时展示' },
  { value: 'busy', label: '忙碌', detail: '暂时不方便回复' },
  { value: 'dnd', label: '请勿打扰', detail: '告诉别人先别打扰' },
  { value: 'away', label: '离开', detail: '人不在电脑前' },
  { value: 'custom', label: '自定义', detail: '展示自己的状态文案' }
];

export function presenceLabel(status?: PresenceStatus | 'offline' | null, text?: string | null, online = true): string {
  if (!online || status === 'offline') {
    return '离线';
  }
  const customText = text?.trim();
  if (customText) {
    return customText;
  }
  return presenceOptions.find((option) => option.value === status)?.label ?? '在线';
}

export function userPresenceLabel(user?: User | null, onlineStatus?: UserOnlineStatusRead | null): string {
  const online = onlineStatus?.online ?? true;
  return presenceLabel(onlineStatus?.presence_status ?? user?.presence_status ?? 'online', onlineStatus?.presence_text ?? user?.presence_text, online);
}
