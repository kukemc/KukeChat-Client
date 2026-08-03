import { API_BASE_URL } from '@/config';
import { useKukeStore } from '@/store/kukeStore';
import { isRecord } from './normalizers';
import type { AccountSuspension } from '@/types/api';

function resolveApiBaseUrl(): string {
  if (import.meta.env.DEV) {
    return window.__KukeChatPreviewConfig?.apiBaseUrl ?? API_BASE_URL;
  }
  return API_BASE_URL;
}

export function getApiBaseUrl(): string {
  return resolveApiBaseUrl();
}

export class ApiError extends Error {
  readonly status: number;
  readonly detail: unknown;

  constructor(status: number, detail: unknown) {
    super(readErrorMessage(detail, status));
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

export class NetworkError extends Error {
  readonly url: string;

  constructor(url: string, cause: unknown) {
    const suffix = cause instanceof Error && cause.message ? `（${cause.message}）` : '';
    super(`无法连接到服务器：${url}${suffix}。请确认后端已启动，并且后端 CORS 已允许当前桌面客户端来源。`);
    this.name = 'NetworkError';
    this.url = url;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  token?: string | null;
  headers?: Record<string, string>;
  credentials?: RequestCredentials;
  cache?: RequestCache;
}

function readErrorMessage(detail: unknown, status: number): string {
  if (typeof detail === 'string') {
    return detail;
  }

  if (isRecord(detail)) {
    if (isRecord(detail.detail) && typeof detail.detail.message === 'string') {
      return detail.detail.message;
    }
    if (typeof detail.detail === 'string') {
      return detail.detail;
    }

    if (typeof detail.message === 'string') {
      return detail.message;
    }
  }

  return `请求失败：${status}`;
}

export function accountSuspensionFromError(error: unknown): AccountSuspension | null {
  const payload = error instanceof ApiError ? error.detail : error;
  if (!isRecord(payload)) {
    return null;
  }
  const detail = isRecord(payload.detail) ? payload.detail : payload;
  if (detail.code !== 'account_suspended') {
    return null;
  }
  return {
    code: 'account_suspended',
    reason: typeof detail.reason === 'string' ? detail.reason : null,
    banned_until: typeof detail.banned_until === 'string' ? detail.banned_until : null,
    permanent: detail.permanent === true || detail.banned_until === null
  };
}

function handleAccountSuspension(payload: unknown): void {
  const suspension = accountSuspensionFromError(payload);
  if (suspension) {
    useKukeStore.getState().setAccountSuspension(suspension);
  }
}

function joinApiPath(baseUrl: string, path: string): string {
  const cleanBase = baseUrl.replace(/\/$/, '');
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const prefix = cleanBase.endsWith('/api/v1') ? '' : '/api/v1';
  return `${cleanBase}${prefix}${cleanPath}`;
}

function randomHex(length: number): string {
  const bytes = new Uint8Array(Math.ceil(length / 2));
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, length);
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function attachClientProof(headers: Record<string, string>, method: string, path: string): Promise<void> {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    return;
  }
  const timestamp = Date.now().toString();
  const nonce = randomHex(16);
  const proofPath = path.split('?')[0] || path;
  headers['X-Kuke-Client'] = 'kukechat-web/0.2.0';
  headers['X-Kuke-Timestamp'] = timestamp;
  headers['X-Kuke-Nonce'] = nonce;
  headers['X-Kuke-Proof'] = await sha256Hex(`${method.toUpperCase()}|${proofPath}|${timestamp}|${nonce}|KukeChat`);
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const state = useKukeStore.getState();
  const token = options.token === undefined ? state.token : options.token;
  const headers: Record<string, string> = { ...(options.headers ?? {}) };
  let body: BodyInit | undefined;

  if (options.body instanceof URLSearchParams) {
    body = options.body;
    headers['Content-Type'] = headers['Content-Type'] ?? 'application/x-www-form-urlencoded';
  } else if (options.body !== undefined) {
    body = JSON.stringify(options.body);
    headers['Content-Type'] = headers['Content-Type'] ?? 'application/json';
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const method = options.method ?? 'GET';
  await attachClientProof(headers, method, path);

  const url = joinApiPath(resolveApiBaseUrl(), path);
  const response = await fetch(url, {
    method,
    headers,
    body,
    credentials: options.credentials,
    cache: options.cache
  }).catch((error: unknown) => {
    throw new NetworkError(url, error);
  });

  const payload = await readJson(response);
  if (!response.ok) {
    handleAccountSuspension(payload);
    throw new ApiError(response.status, payload);
  }

  return payload as T;
}

export async function uploadFile<T>(path: string, file: File, fieldName = 'file'): Promise<T> {
  const state = useKukeStore.getState();
  const headers: Record<string, string> = {};
  const body = new FormData();
  body.append(fieldName, file);

  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }

  await attachClientProof(headers, 'POST', path);

  const url = joinApiPath(resolveApiBaseUrl(), path);
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body
  }).catch((error: unknown) => {
    throw new NetworkError(url, error);
  });

  const payload = await readJson(response);
  if (!response.ok) {
    handleAccountSuspension(payload);
    throw new ApiError(response.status, payload);
  }

  return payload as T;
}
