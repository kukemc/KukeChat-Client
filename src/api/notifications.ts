import type { UnifiedNotificationList } from '@/types/api';
import { apiRequest } from './client';


export async function getNotifications(limit = 100): Promise<UnifiedNotificationList> {
  return apiRequest<UnifiedNotificationList>(`/notifications?limit=${limit}`);
}
