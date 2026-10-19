import { isTauriDesktopApp } from '@/utils/appMode';
import { apiRequest } from './client';
import { isRecord } from './normalizers';

/**
 * 设备标识（防小号）。每个 /api/v1 请求带上这几个头，契约在 KukeChat-Server 那边：
 * - X-Kuke-Device：服务端发的设备令牌，不透明，存好了就一直带；
 * - X-Kuke-Machine：桌面端才有，系统机器 ID 的哈希（Rust 那边算好，原始 ID 不进 JS）；
 * - X-Kuke-Fp：轻量浏览器指纹的哈希，网页和桌面 WebView 都带；
 * - X-Kuke-Platform：desktop / web。
 * 响应里出现 X-Kuke-Device-Issue 就是服务端新发了令牌，存到所有副本里，之后都带它。
 *
 * 这里任何一步失败都只是少带一个头，绝不能挡住请求或抛错。
 */

export const DEVICE_ISSUE_HEADER = 'X-Kuke-Device-Issue';

const TOKEN_PATTERN = /^kd_[A-Za-z0-9_-]{10,40}\.[A-Za-z0-9_-]{10,40}$/;
const LOCAL_STORAGE_KEY = 'kukechat.deviceToken';
const COOKIE_NAME = 'kuke_device';
/** 约 400 天，浏览器允许的 cookie 最长有效期 */
const COOKIE_MAX_AGE = 400 * 24 * 60 * 60;
const IDB_NAME = 'kukechat-device';
const IDB_STORE = 'kv';
const IDB_KEY = 'device';

/** 这几个请求要先等设备令牌（最多 3 秒），保证第一次注册 / 登录就带着它 */
const TOKEN_FIRST_PATHS = new Set(['/auth/login', '/auth/register', '/auth/ip-login', '/auth/session']);
const TOKEN_FIRST_TIMEOUT_MS = 3000;
/** 普通请求只等本地读取（不等网络），读得慢就先不带 */
const LOCAL_SIGNAL_TIMEOUT_MS = 1500;

let currentToken: string | null = null;
let restorePromise: Promise<string | null> | null = null;
let ensurePromise: Promise<string | null> | null = null;
let ensureKicked = false;
let machinePromise: Promise<string | null> | null = null;
let fingerprintPromise: Promise<string | null> | null = null;

export function isValidDeviceToken(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 64 && TOKEN_PATTERN.test(value);
}

export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      }
    );
  });
}

async function invokeDesktop<T>(command: string, args?: Record<string, unknown>): Promise<T | null> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<T>(command, args);
  } catch {
    return null;
  }
}

/* ---------- 各个存储副本 ---------- */

function readLocalCopy(): string | null {
  try {
    return localStorage.getItem(LOCAL_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeLocalCopy(token: string): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, token);
  } catch {
    // 隐私模式 / 存储满了：还有别的副本
  }
}

function readCookieCopy(): string | null {
  try {
    const prefix = `${COOKIE_NAME}=`;
    const entry = document.cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith(prefix));
    return entry ? decodeURIComponent(entry.slice(prefix.length)) : null;
  } catch {
    return null;
  }
}

function writeCookieCopy(token: string): void {
  try {
    const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${COOKIE_NAME}=${encodeURIComponent(token)}; Max-Age=${COOKIE_MAX_AGE}; Path=/; SameSite=Lax${secure}`;
  } catch {
    // 被禁用 cookie 时忽略
  }
}

function openDeviceDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') {
        resolve(null);
        return;
      }
      const request = indexedDB.open(IDB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(IDB_STORE)) {
          request.result.createObjectStore(IDB_STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function readIdbCopy(): Promise<string | null> {
  const db = await openDeviceDb();
  if (!db) {
    return null;
  }
  return new Promise((resolve) => {
    try {
      const request = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(IDB_KEY);
      request.onsuccess = () => {
        db.close();
        resolve(typeof request.result === 'string' ? request.result : null);
      };
      request.onerror = () => {
        db.close();
        resolve(null);
      };
    } catch {
      db.close();
      resolve(null);
    }
  });
}

async function writeIdbCopy(token: string): Promise<void> {
  const db = await openDeviceDb();
  if (!db) {
    return;
  }
  try {
    const transaction = db.transaction(IDB_STORE, 'readwrite');
    transaction.objectStore(IDB_STORE).put(token, IDB_KEY);
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => db.close();
    transaction.onabort = () => db.close();
  } catch {
    db.close();
  }
}

/** 写所有副本：桌面端是 Rust 的 device.json + localStorage；网页是 localStorage + IndexedDB + cookie。 */
function writeAllCopies(token: string): void {
  writeLocalCopy(token);
  if (isTauriDesktopApp()) {
    void invokeDesktop<boolean>('device_token_set', { token });
    return;
  }
  writeCookieCopy(token);
  void writeIdbCopy(token).catch(() => undefined);
}

/* ---------- 读取 / 恢复 ---------- */

async function restoreFromCopies(): Promise<string | null> {
  const local = readLocalCopy();
  if (isTauriDesktopApp()) {
    // 桌面端以 Rust 那份为准（WebView 缓存被清了它还在），缺哪份补哪份
    const durable = await invokeDesktop<string | null>('device_token_get');
    const token = isValidDeviceToken(durable) ? durable : isValidDeviceToken(local) ? local : null;
    if (token) {
      if (durable !== token) {
        void invokeDesktop<boolean>('device_token_set', { token });
      }
      if (local !== token) {
        writeLocalCopy(token);
      }
    }
    return token;
  }

  const cookie = readCookieCopy();
  const idb = await withTimeout(readIdbCopy(), 1000, null);
  const token = [local, idb, cookie].find(isValidDeviceToken) ?? null;
  if (token) {
    if (local !== token) writeLocalCopy(token);
    if (idb !== token) void writeIdbCopy(token).catch(() => undefined);
    if (cookie !== token) writeCookieCopy(token);
  }
  return token;
}

/** 从本地副本恢复令牌，只做一次。读取期间服务端已经发了新令牌的，以新令牌为准并把副本对齐。 */
function restoreDeviceToken(): Promise<string | null> {
  if (!restorePromise) {
    restorePromise = restoreFromCopies()
      .catch(() => null)
      .then((restored) => {
        if (currentToken) {
          if (restored !== currentToken) writeAllCopies(currentToken);
        } else if (restored) {
          currentToken = restored;
        }
        return currentToken;
      });
  }
  return restorePromise;
}

/**
 * 确保手里有设备令牌：先从本地副本恢复，都没有就问服务端要一个（GET /auth/device）。
 * 启动时会自动调一次（不等它）；登录 / 注册前会再等它一下。上一次没拿到（断网之类）时下一次调用会重试。
 */
export function ensureDeviceToken(): Promise<string | null> {
  if (currentToken) {
    return Promise.resolve(currentToken);
  }
  if (!ensurePromise) {
    ensurePromise = (async () => {
      const restored = await restoreDeviceToken();
      if (restored) {
        return restored;
      }
      try {
        const body = await apiRequest<unknown>('/auth/device', { token: null });
        if (isRecord(body)) {
          rememberIssuedDevice(typeof body.device === 'string' ? body.device : null, null);
        }
      } catch {
        // 拿不到就算了：之后任何一个响应里的 X-Kuke-Device-Issue 也能补上
      }
      return currentToken;
    })().then((token) => {
      if (!token) {
        ensurePromise = null;
      }
      return token;
    });
  }
  return ensurePromise;
}

/**
 * 处理服务端新发的令牌（响应头 X-Kuke-Device-Issue，或 /auth/device 的响应体）。
 * sentToken 是发这个请求时带的令牌：只有它和手里的一致才采用 ——
 * 启动时几个请求同时没带令牌出去，会各拿到一个，只留第一个，免得令牌来回换。
 */
export function rememberIssuedDevice(issued: string | null | undefined, sentToken: string | null): void {
  const token = issued?.trim();
  if (!isValidDeviceToken(token) || token === currentToken) {
    return;
  }
  if (sentToken !== currentToken) {
    return;
  }
  currentToken = token;
  writeAllCopies(token);
}

/* ---------- 机器码 / 浏览器指纹 ---------- */

/** 桌面端的机器码哈希（Rust 算好的 64 位十六进制），整个页面生命周期只取一次。 */
function getMachineHash(): Promise<string | null> {
  if (!machinePromise) {
    machinePromise = invokeDesktop<string | null>('machine_id').then((value) => (typeof value === 'string' && /^[0-9a-f]{64}$/.test(value) ? value : null));
  }
  return machinePromise;
}

function canvasComponent(): string {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 240;
    canvas.height = 60;
    const context = canvas.getContext('2d');
    if (!context) {
      return '';
    }
    // 字体、抗锯齿、混合模式在不同显卡 / 系统上画出来有细微差别
    context.textBaseline = 'top';
    context.font = '16px Arial, sans-serif';
    context.fillStyle = '#f60';
    context.fillRect(110, 2, 70, 22);
    context.fillStyle = '#069';
    context.fillText('KukeChat 设备 Fp,1.0', 4, 16);
    context.fillStyle = 'rgba(102, 204, 0, 0.7)';
    context.font = 'bold 14px Georgia, serif';
    context.fillText('KukeChat 设备 Fp,1.0', 6, 34);
    context.globalCompositeOperation = 'multiply';
    for (const [x, color] of [[40, '#f2f'], [70, '#2ff'], [100, '#ff2']] as const) {
      context.fillStyle = color;
      context.beginPath();
      context.arc(x, 30, 22, 0, Math.PI * 2, true);
      context.closePath();
      context.fill();
    }
    return canvas.toDataURL();
  } catch {
    return '';
  }
}

function webglComponent(): string {
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl') ?? canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (!gl) {
      return '';
    }
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const vendor = info ? gl.getParameter(info.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
    const renderer = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return `${String(vendor)}~${String(renderer)}`;
  } catch {
    return '';
  }
}

async function computeFingerprint(): Promise<string | null> {
  if (typeof crypto === 'undefined' || !crypto.subtle || typeof document === 'undefined') {
    return null;
  }
  const nav = navigator as Navigator & { deviceMemory?: number };
  const safe = (read: () => unknown): string => {
    try {
      const value = read();
      return value === undefined || value === null ? '' : String(value);
    } catch {
      return '';
    }
  };
  const canvas = canvasComponent();
  // 屏幕宽高按大小排序：手机横竖屏切换不算换了设备。不放 userAgent，浏览器一升级就变
  const parts = [
    'v1',
    canvas ? await sha256Hex(canvas) : '',
    webglComponent(),
    safe(() => [screen.width, screen.height].sort((a, b) => b - a).join('x')),
    safe(() => screen.colorDepth),
    safe(() => window.devicePixelRatio),
    safe(() => Intl.DateTimeFormat().resolvedOptions().timeZone),
    safe(() => (nav.languages ?? []).join(',')),
    safe(() => nav.hardwareConcurrency),
    safe(() => nav.deviceMemory),
    safe(() => nav.platform),
    safe(() => nav.maxTouchPoints)
  ];
  return sha256Hex(parts.join('|'));
}

/** 浏览器指纹哈希，每次页面加载只算一次。 */
function getBrowserFingerprint(): Promise<string | null> {
  if (!fingerprintPromise) {
    fingerprintPromise = computeFingerprint().catch(() => null);
  }
  return fingerprintPromise;
}

/* ---------- 给请求加头 ---------- */

/**
 * 给一个 /api/v1 请求加上设备相关的头，返回这次带出去的令牌（交给 rememberIssuedDevice 比对）。
 * 第一次调用时顺手在后台确保令牌（启动时那一次）。
 */
export async function attachDeviceHeaders(headers: Record<string, string>, path: string): Promise<string | null> {
  const desktop = isTauriDesktopApp();
  if (!ensureKicked) {
    ensureKicked = true;
    void ensureDeviceToken();
  }
  if (TOKEN_FIRST_PATHS.has(path.split('?')[0] || path)) {
    await withTimeout(ensureDeviceToken(), TOKEN_FIRST_TIMEOUT_MS, null);
  }
  const [, machine, fingerprint] = await Promise.all([
    withTimeout(restoreDeviceToken(), LOCAL_SIGNAL_TIMEOUT_MS, null),
    desktop ? withTimeout(getMachineHash(), LOCAL_SIGNAL_TIMEOUT_MS, null) : Promise.resolve(null),
    withTimeout(getBrowserFingerprint(), LOCAL_SIGNAL_TIMEOUT_MS, null)
  ]);

  headers['X-Kuke-Platform'] = desktop ? 'desktop' : 'web';
  const token = currentToken;
  if (token) {
    headers['X-Kuke-Device'] = token;
  }
  if (machine) {
    headers['X-Kuke-Machine'] = machine;
  }
  if (fingerprint) {
    headers['X-Kuke-Fp'] = fingerprint;
  }
  return token;
}
