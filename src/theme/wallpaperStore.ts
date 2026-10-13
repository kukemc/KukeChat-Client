import { useSyncExternalStore } from 'react';

/**
 * 用户的背景图库。只存在本机的 IndexedDB 里，不上传服务器。
 *
 * 图片存的是压缩后的 Blob，用的时候换成 object URL。最多留 MAX_IMAGES 张，超了就淘汰最久没用、
 * 又没被任何主题引用的那一张；全都被引用着就拒绝新增，让用户自己删。
 *
 * 库里的键：
 *   'wallpaper'   1.x 时期唯一的那张自定义背景，对应设置里的 'custom'，保留原样；
 *   'img:<id>'    之后上传的图片，键名就是设置里写的值；
 *   'library'     元数据列表（尺寸、最近使用时间）；
 *   'snd:<id>'    自定义提示音，归 src/utils/customSounds.ts 管，这里不读也不删。
 */

const DATABASE = 'kukechat-theme';
const STORE = 'assets';
const LEGACY_KEY = 'wallpaper';
const LEGACY_ID = 'custom';
const INDEX_KEY = 'library';
/** 背景图不需要原图精度，压到这个边长以内，省空间也省解码时间。 */
const MAX_EDGE = 2560;
export const MAX_IMAGES = 8;
export const MAX_WALLPAPER_BYTES = 20 * 1024 * 1024;

export interface WallpaperEntry {
  /** 写进主题设置里的值：'custom' 或 'img:xxxx'。 */
  id: string;
  url: string;
  width: number;
  height: number;
  bytes: number;
  usedAt: number;
}

interface StoredMeta {
  id: string;
  width: number;
  height: number;
  bytes: number;
  usedAt: number;
}

let entries: WallpaperEntry[] = [];
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function publish(next: WallpaperEntry[]): void {
  const kept = new Set(next.map((entry) => entry.url));
  for (const entry of entries) {
    if (!kept.has(entry.url)) {
      URL.revokeObjectURL(entry.url);
    }
  }
  entries = next;
  listeners.forEach((listener) => listener());
}

function storageKey(id: string): string {
  return id === LEGACY_ID ? LEGACY_KEY : id;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('当前环境不支持本地存储图片。'));
      return;
    }
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('无法打开本地存储。'));
  });
}

/** 导出给自定义提示音用：它和背景图存在同一个库里。 */
export async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = run(database.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('本地存储读写失败。'));
    });
  } finally {
    database.close();
  }
}

function saveIndex(list: WallpaperEntry[]): Promise<unknown> {
  const metas: StoredMeta[] = list.map(({ id, width, height, bytes, usedAt }) => ({ id, width, height, bytes, usedAt }));
  return withStore('readwrite', (store) => store.put(metas, INDEX_KEY));
}

async function measure(blob: Blob): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(blob);
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return size;
}

async function compress(file: Blob): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const original = { blob: file, width: bitmap.width, height: bitmap.height };
  // 动图保留原样，重新编码会丢掉动画
  if (file.type === 'image/gif') {
    bitmap.close();
    return original;
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
    return original;
  }
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
  return blob ? { blob, width, height } : original;
}

function isMeta(value: unknown): value is StoredMeta {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const meta = value as Record<string, unknown>;
  return typeof meta.id === 'string' && typeof meta.width === 'number' && typeof meta.height === 'number' && typeof meta.usedAt === 'number';
}

async function readLibrary(): Promise<void> {
  try {
    const index = await withStore<unknown>('readonly', (store) => store.get(INDEX_KEY));
    const metas = Array.isArray(index) ? index.filter(isMeta) : [];
    const next: WallpaperEntry[] = [];
    for (const meta of metas) {
      const blob = await withStore<unknown>('readonly', (store) => store.get(storageKey(meta.id)));
      if (blob instanceof Blob) {
        next.push({ id: meta.id, url: URL.createObjectURL(blob), width: meta.width, height: meta.height, bytes: blob.size, usedAt: meta.usedAt });
      }
    }
    // 1.x 存下来的那张还没登记进列表：量一下尺寸补进去
    if (!next.some((entry) => entry.id === LEGACY_ID)) {
      const legacy = await withStore<unknown>('readonly', (store) => store.get(LEGACY_KEY));
      if (legacy instanceof Blob) {
        const size = await measure(legacy);
        next.push({ id: LEGACY_ID, url: URL.createObjectURL(legacy), ...size, bytes: legacy.size, usedAt: Date.now() });
        await saveIndex(next);
      }
    }
    publish(next);
  } catch {
    // 读不到就当图库是空的
  }
}

/** 启动时调用一次，把图库读出来。重复调用没有副作用。 */
export function loadWallpaperLibrary(): Promise<void> {
  loading ??= readLibrary();
  return loading;
}

function newId(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return `img:${Array.from(bytes, (byte) => (byte % 36).toString(36)).join('')}${Date.now().toString(36).slice(-4)}`;
}

/**
 * 往图库里加一张图，返回要写进主题设置的 id。
 * @param inUse 正被当前主题或「我的主题」引用的 id，淘汰旧图时跳过它们。
 */
export async function addWallpaper(file: Blob, inUse: Iterable<string> = []): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('请选择图片文件。');
  }
  if (file.size > MAX_WALLPAPER_BYTES) {
    throw new Error('图片太大了，请选择 20MB 以内的图片。');
  }
  await loadWallpaperLibrary();
  const protectedIds = new Set(inUse);
  const removable = entries.filter((entry) => !protectedIds.has(entry.id)).sort((left, right) => left.usedAt - right.usedAt);
  if (entries.length >= MAX_IMAGES && removable.length === 0) {
    throw new Error(`背景图库已满（${MAX_IMAGES} 张，都在使用中）。请先删掉不用的图片或主题。`);
  }
  let compressed: Awaited<ReturnType<typeof compress>>;
  try {
    compressed = await compress(file);
  } catch {
    throw new Error('这张图片打不开，请换一张试试。');
  }
  const id = newId();
  await withStore('readwrite', (store) => store.put(compressed.blob, id));
  // 新图排在最前；列表的顺序就是界面上的顺序，选用某张图不会让它们跳来跳去
  let next = [{ id, url: URL.createObjectURL(compressed.blob), width: compressed.width, height: compressed.height, bytes: compressed.blob.size, usedAt: Date.now() }, ...entries];
  for (const victim of removable.slice(0, Math.max(0, next.length - MAX_IMAGES))) {
    await withStore('readwrite', (store) => store.delete(storageKey(victim.id))).catch(() => undefined);
    next = next.filter((entry) => entry.id !== victim.id);
  }
  await saveIndex(next);
  publish(next);
  return id;
}

export async function removeWallpaper(id: string): Promise<void> {
  const next = entries.filter((entry) => entry.id !== id);
  try {
    await withStore('readwrite', (store) => store.delete(storageKey(id)));
    await saveIndex(next);
  } finally {
    publish(next);
  }
}

/** 选用某张图时记一下时间，图库满了按它决定先淘汰谁。 */
export function touchWallpaper(id: string): void {
  if (!entries.some((entry) => entry.id === id)) {
    return;
  }
  const next = entries.map((entry) => (entry.id === id ? { ...entry, usedAt: Date.now() } : entry));
  publish(next);
  void saveIndex(next).catch(() => undefined);
}

export async function readWallpaperBlob(id: string): Promise<Blob | null> {
  try {
    const blob = await withStore<unknown>('readonly', (store) => store.get(storageKey(id)));
    return blob instanceof Blob ? blob : null;
  } catch {
    return null;
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const EMPTY: WallpaperEntry[] = [];

/** 图库里的全部图片，新上传的在前。 */
export function useWallpaperLibrary(): WallpaperEntry[] {
  return useSyncExternalStore(subscribe, () => entries, () => EMPTY);
}

/** 某个背景 id 对应的图库条目；内置背景、还没读出来的图片都是 null。 */
export function useWallpaperEntry(id: string): WallpaperEntry | null {
  const library = useWallpaperLibrary();
  return library.find((entry) => entry.id === id) ?? null;
}
