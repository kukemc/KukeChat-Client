import type { CcwBindingChallenge, User } from '@/types/api';
import { apiRequest } from './client';

export async function getMyCcwBindingChallenge(): Promise<CcwBindingChallenge | null> {
  return apiRequest<CcwBindingChallenge | null>('/ccw/binding/me');
}

export async function startCcwBindingChallenge(): Promise<CcwBindingChallenge> {
  return apiRequest<CcwBindingChallenge>('/ccw/binding/challenge', { method: 'POST' });
}

export async function checkCcwBindingChallenge(): Promise<CcwBindingChallenge | null> {
  return apiRequest<CcwBindingChallenge | null>('/ccw/binding/check', { method: 'POST' });
}

export async function syncMyCcwProfile(syncProfile: boolean): Promise<User> {
  return apiRequest<User>('/ccw/me/sync', {
    method: 'POST',
    body: { sync_profile: syncProfile }
  });
}

export async function unbindMyCcwProfile(): Promise<User> {
  return apiRequest<User>('/ccw/me', { method: 'DELETE' });
}
