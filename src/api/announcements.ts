import type { Announcement } from '@/types/api';
import { apiRequest } from './client';
import { asList } from './normalizers';

export async function getAnnouncements(): Promise<Announcement[]> {
  const response = await apiRequest<unknown>('/announcements');
  return asList<Announcement>(response);
}

export async function getLatestAnnouncement(): Promise<Announcement | null> {
  return apiRequest<Announcement | null>('/announcements/latest');
}
