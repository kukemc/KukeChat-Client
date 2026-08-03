import type { AccountLookup, AuthSession, AuthToken, CcwPasswordChallengeInfo, IpLoginStatus, LoginPayload, PasswordResetRequestPayload, PasswordResetRequestRead, RegisterPayload, User } from '@/types/api';
import { CCW_SITE_URL } from '@/config';
import { apiRequest, getApiBaseUrl } from './client';
import { isRecord, pickToken } from './normalizers';

const REMEMBER_LOGIN_KEY = 'kukechat-remember-ip-login';
const REMEMBER_USERNAME_KEY = 'kukechat-remember-username';

function isUser(value: unknown): value is User {
  return isRecord(value) && typeof value.id === 'number' && typeof value.username === 'string' && (value.email === undefined || value.email === null || typeof value.email === 'string');
}

function tokenToSession(tokenResponse: unknown, fallbackUser?: User): AuthSession | null {
  const token = pickToken(tokenResponse);
  if (!token) {
    return null;
  }

  const user = isRecord(tokenResponse) && isUser(tokenResponse.user) ? tokenResponse.user : fallbackUser;
  return user ? { token, user } : null;
}

async function fetchMeWithToken(token: string): Promise<User> {
  return apiRequest<User>('/auth/me', { token });
}

export async function login(payload: LoginPayload): Promise<AuthSession> {
  const tokenResponse = await apiRequest<AuthToken>('/auth/login', {
    method: 'POST',
    body: { username_or_email: payload.username, password: payload.password, remember_me: Boolean(payload.rememberMe) },
    token: null
  });
  const token = tokenResponse.access_token;
  const user = tokenResponse.user ?? (await fetchMeWithToken(token));
  return { token, user };
}

export async function getCookieSession(): Promise<AuthSession> {
  const tokenResponse = await apiRequest<AuthToken>('/auth/session', {
    token: null,
    credentials: 'include'
  });
  const token = tokenResponse.access_token;
  const user = tokenResponse.user ?? (await fetchMeWithToken(token));
  return { token, user };
}

export function openSecureLoginPopup(): Window | null {
  const origin = typeof window === 'undefined' ? CCW_SITE_URL : window.location.origin;
  const url = `${getApiBaseUrl().replace(/\/$/, '')}/login?origin=${encodeURIComponent(origin)}`;
  return window.open(url, 'kukechat-secure-login', 'popup=yes,width=460,height=680');
}

export async function logoutCookieSession(): Promise<void> {
  await apiRequest('/auth/session/logout', {
    method: 'POST',
    token: null,
    credentials: 'include'
  });
}

export async function register(payload: RegisterPayload): Promise<AuthSession> {
  const response = await apiRequest<unknown>('/auth/register', {
    method: 'POST',
    body: payload,
    token: null
  });

  const directSession = tokenToSession(response);
  if (directSession) {
    return directSession;
  }

  return login({ username: payload.username, password: payload.password, rememberMe: true });
}


export async function submitPasswordResetRequest(payload: PasswordResetRequestPayload): Promise<PasswordResetRequestRead> {
  return apiRequest<PasswordResetRequestRead>('/auth/password-reset-requests', {
    method: 'POST',
    body: payload,
    token: null
  });
}

export async function lookupAccount(username: string): Promise<AccountLookup> {
  return apiRequest<AccountLookup>(`/auth/account-lookup?username=${encodeURIComponent(username)}`, { token: null });
}

export async function createCcwResetChallenge(username: string): Promise<CcwPasswordChallengeInfo> {
  return apiRequest<CcwPasswordChallengeInfo>('/auth/password-reset/ccw/challenge', {
    method: 'POST',
    body: { username },
    token: null
  });
}

export async function confirmCcwReset(payload: { username: string; code: string; new_password: string }): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>('/auth/password-reset/ccw/confirm', {
    method: 'POST',
    body: payload,
    token: null
  });
}

export async function createPasswordChangeChallenge(): Promise<CcwPasswordChallengeInfo> {
  return apiRequest<CcwPasswordChallengeInfo>('/auth/password/change/challenge', { method: 'POST' });
}

export async function confirmPasswordChange(payload: { code: string; new_password: string }): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>('/auth/password/change/confirm', {
    method: 'POST',
    body: payload
  });
}

export async function ipLogin(): Promise<AuthSession> {
  const tokenResponse = await apiRequest<AuthToken>('/auth/ip-login', {
    method: 'POST',
    token: null
  });
  const token = tokenResponse.access_token;
  const user = tokenResponse.user ?? (await fetchMeWithToken(token));
  return { token, user };
}

export async function getMe(): Promise<User> {
  return apiRequest<User>('/auth/me');
}

export async function getIpLoginStatus(token?: string): Promise<IpLoginStatus> {
  return apiRequest<IpLoginStatus>('/auth/ip-login/status', { token });
}

export function shouldRememberIpLogin(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.localStorage.getItem(REMEMBER_LOGIN_KEY) === '1';
}

export function setRememberIpLogin(remember: boolean): void {
  if (typeof window === 'undefined') {
    return;
  }

  if (remember) {
    window.localStorage.setItem(REMEMBER_LOGIN_KEY, '1');
    return;
  }

  window.localStorage.removeItem(REMEMBER_LOGIN_KEY);
  window.localStorage.removeItem(REMEMBER_USERNAME_KEY);
}

export function getRememberedUsername(): string {
  if (typeof window === 'undefined') {
    return '';
  }
  return window.localStorage.getItem(REMEMBER_USERNAME_KEY) ?? '';
}

export function setRememberedUsername(username: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  const value = username.trim();
  if (value) {
    window.localStorage.setItem(REMEMBER_LOGIN_KEY, '1');
    window.localStorage.setItem(REMEMBER_USERNAME_KEY, value);
    return;
  }
  window.localStorage.removeItem(REMEMBER_USERNAME_KEY);
}
