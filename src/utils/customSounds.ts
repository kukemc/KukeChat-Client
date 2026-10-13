import { cleanSoundName, customSoundsInUse, useSoundStore, type CustomSoundInfo, type SoundKind, type SoundSlot } from '@/store/soundStore';
import { withStore } from '@/theme/wallpaperStore';

/**
 * 用户上传的提示音。和背景图一样只存在本机的 IndexedDB 里（同一个库、同一张表，见 src/theme/wallpaperStore.ts），
 * 不上传服务器；键名 'snd:<id>'，值是原文件的 Blob，用的时候换成 object URL。
 *
 * 五种提示音各自最多一段。哪一种用哪一段记在 soundStore 里；这里管文件本身：校验、存、读、删。
 * 每次上传都是一个新 id —— 先写新的、再改设置、最后删旧的，中途哪一步失败都不会把原来的设置弄坏。
 */

export const MAX_SOUND_BYTES = 1024 * 1024;
export const MAX_SOUND_SECONDS = 10;
/** 编码器会在首尾垫一点静音，标称 10 秒的 mp3 读出来可能是 10.05 秒。 */
const DURATION_TOLERANCE = 0.1;
const PROBE_TIMEOUT = 8000;
const KEY_PREFIX = 'snd:';
/** 清理没人引用的音频时放过刚写进去的：可能是另一个标签页正在上传，设置还没来得及改。 */
const PRUNE_GRACE = 60_000;
/** 系统按扩展名报的类型不一定是 audio/*：只有音轨的 .webm / .ogg / .mp4 常被报成这些。能不能用最后看解码。 */
const CONTAINER_TYPES = new Set(['video/webm', 'video/ogg', 'video/mp4', 'application/ogg']);

const urls = new Map<string, Promise<string | null>>();

/** 这个环境能不能存、能不能放自定义提示音。不能就不显示上传入口。 */
export function canUseCustomSounds(): boolean {
  return typeof indexedDB !== 'undefined' && typeof Audio !== 'undefined' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function';
}

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${Number((bytes / 1024 / 1024).toFixed(1))} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export const SOUND_LIMIT_TEXT = `${formatSize(MAX_SOUND_BYTES)} 以内、最长 ${MAX_SOUND_SECONDS} 秒`;

/** 某段自定义音频的 object URL；文件不在了（被清了缓存、换了浏览器）是 null。 */
export function customSoundUrl(id: string): Promise<string | null> {
  let pending = urls.get(id);
  if (!pending) {
    pending = withStore<unknown>('readonly', (store) => store.get(id)).then(
      (blob) => (blob instanceof Blob ? URL.createObjectURL(blob) : null),
      () => {
        // 读库本身出错不记下来，下次再试
        urls.delete(id);
        return null;
      }
    );
    urls.set(id, pending);
  }
  return pending;
}

function release(id: string): void {
  const pending = urls.get(id);
  urls.delete(id);
  void pending?.then((url) => {
    if (url) {
      URL.revokeObjectURL(url);
    }
  });
}

class UndecodableError extends Error {}

/** 用 <audio> 读时长：实际播放走的也是它，它放不了的就不收。 */
function probeWithElement(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    let seeking = false;
    const finish = (settle: () => void): void => {
      window.clearTimeout(timer);
      audio.removeEventListener('loadedmetadata', check);
      audio.removeEventListener('durationchange', check);
      audio.removeEventListener('error', fail);
      audio.removeAttribute('src');
      audio.load();
      settle();
    };
    const check = (): void => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        const { duration } = audio;
        finish(() => resolve(duration));
      } else if (audio.duration === Infinity && !seeking) {
        // 录音得到的 webm / ogg 头里没写时长，跳到末尾浏览器才会算出来
        seeking = true;
        audio.currentTime = 1e101;
      }
    };
    const fail = (): void => finish(() => reject(new UndecodableError()));
    const timer = window.setTimeout(() => finish(() => reject(new Error('timeout'))), PROBE_TIMEOUT);
    audio.addEventListener('loadedmetadata', check);
    audio.addEventListener('durationchange', check);
    audio.addEventListener('error', fail);
    audio.preload = 'auto';
    audio.src = url;
    audio.load();
  });
}

/** <audio> 迟迟不给时长（有的浏览器没有用户操作就不预加载）时的退路：整段解码一遍。 */
async function probeWithDecoder(file: Blob): Promise<number> {
  const Context = window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  if (!Context) {
    throw new UndecodableError();
  }
  try {
    const buffer = await new Context(1, 1, 44100).decodeAudioData(await file.arrayBuffer());
    return buffer.duration;
  } catch {
    throw new UndecodableError();
  }
}

async function measureDuration(file: Blob, url: string): Promise<number> {
  try {
    return await probeWithElement(url);
  } catch (error) {
    if (error instanceof UndecodableError) {
      throw error;
    }
    return probeWithDecoder(file);
  }
}

function newId(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return `${KEY_PREFIX}${Date.now().toString(36)}-${Array.from(bytes, (byte) => (byte % 36).toString(36)).join('')}`;
}

/** 校验并存下一段音频。出错时抛出的 Error.message 可以直接给用户看。 */
async function saveCustomSound(file: Blob, name: string): Promise<CustomSoundInfo> {
  if (file.type && !file.type.startsWith('audio/') && !CONTAINER_TYPES.has(file.type)) {
    throw new Error('这不是音频文件，请选 mp3、ogg、wav 这类声音文件。');
  }
  if (file.size === 0) {
    throw new Error('这个文件是空的，换一个试试。');
  }
  if (file.size > MAX_SOUND_BYTES) {
    throw new Error(`文件太大了（${formatSize(file.size)}），提示音要在 ${formatSize(MAX_SOUND_BYTES)} 以内。`);
  }
  const blob = file.slice(0, file.size, file.type);
  const url = URL.createObjectURL(blob);
  try {
    let duration: number;
    try {
      duration = await measureDuration(blob, url);
    } catch {
      throw new Error('这个文件放不出来，可能不是音频或者格式不支持。换成 mp3、ogg、wav 试试。');
    }
    if (!(duration > 0)) {
      throw new Error('这段音频读不出时长，换一个文件试试。');
    }
    if (duration > MAX_SOUND_SECONDS + DURATION_TOLERANCE) {
      throw new Error(`这段声音有 ${duration.toFixed(1)} 秒，提示音最长 ${MAX_SOUND_SECONDS} 秒，剪短一点再传。`);
    }
    const id = newId();
    try {
      await withStore('readwrite', (store) => store.put(blob, id));
      // 写入请求成功不等于事务提交成功（空间不够时会在提交那一步失败），再读一次确认真的存下了
      if ((await withStore('readonly', (store) => store.count(id))) === 0) {
        throw new Error('not stored');
      }
    } catch {
      throw new Error('没存上：本机存储空间可能满了，或者浏览器不让这个页面存文件。原来的设置没有变。');
    }
    urls.set(id, Promise.resolve(url));
    return { id, name: cleanSoundName(name), duration, bytes: blob.size };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

async function deleteCustomSound(id: string): Promise<void> {
  release(id);
  await withStore('readwrite', (store) => store.delete(id)).catch(() => undefined);
}

/** 改设置。偏好写不进本机存储（满了、被禁用）时抛错；内存里的状态已经变了，这次打开期间照新的来。 */
function commit(kind: SoundKind, slot: SoundSlot): void {
  try {
    useSoundStore.getState().setSlot(kind, slot);
  } catch {
    throw new Error('设置没能保存到这台设备上，刷新后可能会变回原来的样子。');
  }
}

/** 给某一种提示音换上自己的音频。之前传的那一段随后删掉。 */
export async function uploadCustomSound(kind: SoundKind, file: File): Promise<void> {
  const custom = await saveCustomSound(file, file.name);
  const previous = useSoundStore.getState().slots[kind].custom;
  commit(kind, { mode: 'custom', custom });
  if (previous) {
    await deleteCustomSound(previous.id);
  }
}

/**
 * 切换某一种提示音放什么。
 * 「关闭」留着上传过的音频，之后可以直接切回「自定义」；「默认」把它从本机删掉。
 * 还没上传过就选「自定义」什么也不做 —— 界面应该先让用户选文件。
 */
export async function chooseSoundMode(kind: SoundKind, mode: SoundSlot['mode']): Promise<void> {
  const { custom } = useSoundStore.getState().slots[kind];
  if (mode === 'default') {
    commit(kind, { mode: 'default', custom: null });
    if (custom) {
      await deleteCustomSound(custom.id);
    }
  } else if (mode === 'off' || custom) {
    commit(kind, { mode, custom });
  }
}

function isStale(id: string): boolean {
  const createdAt = parseInt(id.slice(KEY_PREFIX.length).split('-')[0], 36);
  return !Number.isFinite(createdAt) || Date.now() - createdAt > PRUNE_GRACE;
}

async function warmUp(): Promise<void> {
  if (!canUseCustomSounds()) {
    return;
  }
  await Promise.all(Array.from(customSoundsInUse(), (id) => customSoundUrl(id)));
  // 偏好没读出来（本机存储被禁用）时不知道哪些还在用，不清
  if (!useSoundStore.persist?.hasHydrated()) {
    return;
  }
  try {
    const keys = await withStore('readonly', (store) => store.getAllKeys(IDBKeyRange.bound(KEY_PREFIX, `${KEY_PREFIX}\uffff`)));
    for (const key of keys) {
      // 每删一个都重新看一眼设置：这期间用户可能刚传了新的
      if (typeof key === 'string' && isStale(key) && !customSoundsInUse().has(key)) {
        await deleteCustomSound(key);
      }
    }
  } catch {
    // 清不掉就留着，下次启动再试
  }
}

let warming: Promise<void> | null = null;

/**
 * 把在用的自定义音频先读出来（免得之后每一声都慢半拍），顺手清掉没人引用的
 * （上传到一半关了页面、删除那一步失败留下的）。每次打开只做一遍，重复调用没有副作用。
 */
export function loadCustomSounds(): Promise<void> {
  warming ??= warmUp();
  return warming;
}
