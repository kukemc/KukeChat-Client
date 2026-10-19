import { API_BASE_URL } from '@/config';
import { useKukeStore } from '@/store/kukeStore';
import { isRecord } from './normalizers';
import type { AccountSuspension } from '@/types/api';
import { prepareImageUpload } from '@/utils/imageUpload';
import { DEVICE_ISSUE_HEADER, attachDeviceHeaders, rememberIssuedDevice, sha256Hex } from './device';

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
  /** 中止请求（搜索输入防抖后取消过期的请求） */
  signal?: AbortSignal;
}

/**
 * 参数校验失败（422）时 detail 是一个数组：[{ loc: ['body', 'content'], msg: '…' }, …]。
 * 拼成一句能看的话；数组里没有可读的内容时返回 null，让调用方退回「请求失败：422」。
 */
function readValidationMessage(items: unknown[]): string | null {
  const lines: string[] = [];
  for (const item of items) {
    if (typeof item === 'string') {
      lines.push(item);
    } else if (isRecord(item)) {
      const text = typeof item.msg === 'string' ? item.msg : typeof item.message === 'string' ? item.message : '';
      // loc 的第一段是 body / query / path，后面才是字段名
      const field = Array.isArray(item.loc) ? item.loc.slice(1).filter((part) => typeof part === 'string' || typeof part === 'number').join('.') : '';
      if (text) {
        lines.push(field ? `${field}：${text}` : text);
      }
    }
  }
  return lines.length > 0 ? `提交的内容不符合要求（${lines.slice(0, 3).join('；')}）` : null;
}

/**
 * 服务端错误里的 detail 有三种形状，都要读得出一句话：
 * 新接口是 { code, message }，老接口是字符串，参数校验失败（422）是数组。
 */
function readErrorMessage(detail: unknown, status: number): string {
  if (typeof detail === 'string') {
    // 不是 JSON 的响应体（网关的报错页之类）不拿来当提示
    return detail.trim() && !detail.trimStart().startsWith('<') ? detail : `请求失败：${status}`;
  }

  if (isRecord(detail)) {
    if (isRecord(detail.detail) && typeof detail.detail.message === 'string' && detail.detail.message) {
      return detail.detail.message;
    }
    if (typeof detail.detail === 'string' && detail.detail) {
      return detail.detail;
    }
    if (Array.isArray(detail.detail)) {
      const text = readValidationMessage(detail.detail);
      if (text) {
        return text;
      }
    }

    if (typeof detail.message === 'string' && detail.message) {
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
  if (detail.code === 'device_banned') {
    // 设备封禁和账号封禁共用一个提示层，只是标题、措辞不同；期限字段叫 expires_at
    const expiresAt = typeof detail.expires_at === 'string' ? detail.expires_at : null;
    return {
      code: 'device_banned',
      reason: typeof detail.reason === 'string' ? detail.reason : null,
      banned_until: expiresAt,
      permanent: detail.permanent === true || !expiresAt,
      appeal_token: null
    };
  }
  if (detail.code !== 'account_suspended') {
    return null;
  }
  return {
    code: 'account_suspended',
    reason: typeof detail.reason === 'string' ? detail.reason : null,
    banned_until: typeof detail.banned_until === 'string' ? detail.banned_until : null,
    permanent: detail.permanent === true || detail.banned_until === null,
    appeal_token: typeof detail.appeal_token === 'string' ? detail.appeal_token : null
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

/**
 * 每个 /api/v1 请求都要带的头：设备标识（见 device.ts）+ 客户端证明。
 * 先加设备头再算证明：设备头第一次可能要等一会儿，证明的时间戳要尽量贴近真正发出的时刻。
 * 返回这次带出去的设备令牌，收到响应后交给 noteDeviceIssue。
 */
async function attachRequestHeaders(headers: Record<string, string>, method: string, path: string): Promise<string | null> {
  const sentDevice = await attachDeviceHeaders(headers, path).catch(() => null);
  await attachClientProof(headers, method, path);
  return sentDevice;
}

function noteDeviceIssue(responseHeaders: Pick<Headers, 'get'>, sentDevice: string | null): void {
  try {
    rememberIssuedDevice(responseHeaders.get(DEVICE_ISSUE_HEADER), sentDevice);
  } catch {
    // 读不到响应头（跨域没暴露之类）就算了
  }
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
  const sentDevice = await attachRequestHeaders(headers, method, path);

  const url = joinApiPath(resolveApiBaseUrl(), path);
  const response = await fetch(url, {
    method,
    headers,
    body,
    credentials: options.credentials,
    cache: options.cache,
    signal: options.signal
  }).catch((error: unknown) => {
    // 被主动中止的请求原样抛出（AbortError），不当成网络故障
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }
    throw new NetworkError(url, error);
  });
  noteDeviceIssue(response.headers, sentDevice);

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
  const imagePaths = new Set([
    '/uploads/avatar', '/uploads/profile-cover', '/uploads/message-image',
    '/uploads/post-image', '/uploads/teamup-image'
  ]);
  body.append(fieldName, imagePaths.has(path.split('?')[0]) ? await prepareImageUpload(file) : file);

  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }

  const sentDevice = await attachRequestHeaders(headers, 'POST', path);

  const url = joinApiPath(resolveApiBaseUrl(), path);
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body
  }).catch((error: unknown) => {
    throw new NetworkError(url, error);
  });
  noteDeviceIssue(response.headers, sentDevice);

  const payload = await readJson(response);
  if (!response.ok) {
    handleAccountSuspension(payload);
    throw new ApiError(response.status, payload);
  }

  return payload as T;
}

/**
 * 和 apiRequest 一样，但把响应头一起交出来。精华列表的分页信息在 X-Total-Count / X-Has-More 里，
 * 响应体仍是数组（老客户端不受影响），所以要读头。
 */
export async function apiRequestWithHeaders<T>(path: string, options: RequestOptions = {}): Promise<{ data: T; headers: Headers }> {
  const state = useKukeStore.getState();
  const token = options.token === undefined ? state.token : options.token;
  const headers: Record<string, string> = { ...(options.headers ?? {}) };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const method = options.method ?? 'GET';
  const sentDevice = await attachRequestHeaders(headers, method, path);
  const url = joinApiPath(resolveApiBaseUrl(), path);
  const response = await fetch(url, { method, headers, cache: options.cache }).catch((error: unknown) => {
    throw new NetworkError(url, error);
  });
  noteDeviceIssue(response.headers, sentDevice);
  const payload = await readJson(response);
  if (!response.ok) {
    handleAccountSuspension(payload);
    throw new ApiError(response.status, payload);
  }
  return { data: payload as T, headers: response.headers };
}

/**
 * 带上传进度的 multipart 上传（fetch 拿不到上传进度，所以这里用 XMLHttpRequest）。
 * 群文件最大 100MB，没有进度条用户会以为卡死。signal 中止时请求被取消，抛出 name 为 AbortError 的错误。
 */
export function uploadFormWithProgress<T>(path: string, form: FormData, onProgress?: (loaded: number, total: number) => void, signal?: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const state = useKukeStore.getState();
    const headers: Record<string, string> = {};
    if (state.token) {
      headers.Authorization = `Bearer ${state.token}`;
    }
    void attachRequestHeaders(headers, 'POST', path).then((sentDevice) => {
      const url = joinApiPath(resolveApiBaseUrl(), path);
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url);
      for (const [name, value] of Object.entries(headers)) {
        xhr.setRequestHeader(name, value);
      }
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          onProgress?.(event.loaded, event.total);
        }
      };
      xhr.onerror = () => reject(new NetworkError(url, null));
      xhr.onabort = () => reject(new DOMException('上传已取消', 'AbortError'));
      xhr.onload = () => {
        noteDeviceIssue({ get: (name: string) => xhr.getResponseHeader(name) }, sentDevice);
        let payload: unknown;
        try {
          payload = xhr.responseText ? JSON.parse(xhr.responseText) as unknown : undefined;
        } catch {
          payload = xhr.responseText;
        }
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(payload as T);
          return;
        }
        handleAccountSuspension(payload);
        reject(new ApiError(xhr.status, payload));
      };
      if (signal) {
        if (signal.aborted) {
          reject(new DOMException('上传已取消', 'AbortError'));
          return;
        }
        signal.addEventListener('abort', () => xhr.abort(), { once: true });
      }
      xhr.send(form);
    }, reject);
  });
}

/** 存储桶拒绝了直传（签名过期、大小不符、桶没配好）。和 NetworkError 分开：网络 / 跨域失败时可以退回经后端上传。 */
export class StorageUploadError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`存储服务拒绝了上传（${status}）`);
    this.name = 'StorageUploadError';
    this.status = status;
  }
}

/**
 * 把文件直接 PUT 到存储桶的签名地址（群文件直传）。不带 Authorization 和客户端证明头：
 * 签名已经在地址里，多带别的头会让签名对不上；headers 只放服务端发地址时要求的那几个。
 * 跨域没配好时浏览器会在预检那一步拦下，表现为 onerror → NetworkError。
 */
export function putToSignedUrl(url: string, headers: Record<string, string>, body: Blob, onProgress?: (loaded: number, total: number) => void, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    for (const [name, value] of Object.entries(headers)) {
      xhr.setRequestHeader(name, value);
    }
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress?.(event.loaded, event.total);
      }
    };
    xhr.onerror = () => reject(new NetworkError(url, null));
    xhr.onabort = () => reject(new DOMException('上传已取消', 'AbortError'));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      reject(new StorageUploadError(xhr.status));
    };
    if (signal) {
      if (signal.aborted) {
        reject(new DOMException('上传已取消', 'AbortError'));
        return;
      }
      signal.addEventListener('abort', () => xhr.abort(), { once: true });
    }
    xhr.send(body);
  });
}

/** 带鉴权下载二进制（群文件的下载接口要 Authorization 头，不能用 <a href> 直链）。 */
export async function apiDownloadBlob(path: string): Promise<Blob> {
  const state = useKukeStore.getState();
  const headers: Record<string, string> = {};
  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }
  const sentDevice = await attachRequestHeaders(headers, 'GET', path);
  const url = joinApiPath(resolveApiBaseUrl(), path);
  const response = await fetch(url, { method: 'GET', headers }).catch((error: unknown) => {
    throw new NetworkError(url, error);
  });
  noteDeviceIssue(response.headers, sentDevice);
  if (!response.ok) {
    const payload = await readJson(response);
    handleAccountSuspension(payload);
    throw new ApiError(response.status, payload);
  }
  return response.blob();
}
