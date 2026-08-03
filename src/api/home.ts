import type { HomeData } from '@/types/api';
import { apiRequest } from './client';

export async function getHome(seed: number): Promise<HomeData> {
  return apiRequest<HomeData>(`/home?seed=${seed}`, { cache: 'no-store' });
}
