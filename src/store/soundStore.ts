import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * 提示音的本机偏好：五种声音各自放哪个、总音量。和主题一样只存在这台设备上，不跨设备同步。
 *
 * 总开关不在这里，仍是 kukeStore.soundNotificationMode —— 那是 1.x 就有的字段，各处都在读。
 * 自定义音频本身存在 IndexedDB（src/utils/customSounds.ts），这里只记它的 id 和界面上要显示的信息。
 */

/** 顺序就是设置页里的顺序。 */
export const SOUND_KINDS = ['message', 'mention', 'join', 'leave', 'start'] as const;
export type SoundKind = (typeof SOUND_KINDS)[number];
export type SoundMode = 'default' | 'off' | 'custom';

export interface CustomSoundInfo {
  /** IndexedDB 里的键，'snd:xxxx'。 */
  id: string;
  /** 上传时的文件名，只用来显示。 */
  name: string;
  /** 秒。 */
  duration: number;
  bytes: number;
}

export interface SoundSlot {
  mode: SoundMode;
  /** 上传过的音频。切到「关闭」时留着，切回来不用重新上传；恢复默认时清掉。 */
  custom: CustomSoundInfo | null;
}

/** 总音量，0–100。72 就是加音量设置之前写死的 0.72。 */
export const DEFAULT_SOUND_VOLUME = 72;
const MAX_SOUND_NAME = 80;

const DEFAULT_SLOT: SoundSlot = { mode: 'default', custom: null };

function defaultSlots(): Record<SoundKind, SoundSlot> {
  return { message: DEFAULT_SLOT, mention: DEFAULT_SLOT, join: DEFAULT_SLOT, leave: DEFAULT_SLOT, start: DEFAULT_SLOT };
}

export function isCustomSoundId(value: unknown): value is string {
  return typeof value === 'string' && /^snd:[a-z0-9-]{6,40}$/.test(value);
}

/** 文件名只当文字显示，去掉控制字符并限长。 */
export function cleanSoundName(value: unknown): string {
  const cleaned = typeof value === 'string' ? Array.from(value.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202f\ufeff]/g, '').trim()).slice(0, MAX_SOUND_NAME).join('') : '';
  return cleaned || '自定义声音';
}

function sanitizeVolume(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(100, Math.max(0, Math.round(value))) : DEFAULT_SOUND_VOLUME;
}

function sanitizeSlot(value: unknown): SoundSlot {
  if (typeof value !== 'object' || value === null) {
    return DEFAULT_SLOT;
  }
  const source = value as Record<string, unknown>;
  const info = typeof source.custom === 'object' && source.custom !== null ? source.custom as Record<string, unknown> : null;
  const custom: CustomSoundInfo | null = info && isCustomSoundId(info.id)
    ? {
        id: info.id,
        name: cleanSoundName(info.name),
        duration: typeof info.duration === 'number' && Number.isFinite(info.duration) && info.duration > 0 ? info.duration : 0,
        bytes: typeof info.bytes === 'number' && Number.isFinite(info.bytes) && info.bytes > 0 ? info.bytes : 0
      }
    : null;
  if (source.mode === 'off') {
    return { mode: 'off', custom };
  }
  // 标着「自定义」却没有音频信息：当默认处理
  return custom && source.mode === 'custom' ? { mode: 'custom', custom } : DEFAULT_SLOT;
}

interface SoundStoreState {
  volume: number;
  slots: Record<SoundKind, SoundSlot>;
  setVolume: (volume: number) => void;
  setSlot: (kind: SoundKind, slot: SoundSlot) => void;
}

type PersistedSoundState = Pick<SoundStoreState, 'volume' | 'slots'>;

/** 没存过（老版本升级上来）就是全部默认声音、音量 72，和以前的表现一样。 */
function sanitizePersisted(value: unknown): PersistedSoundState {
  const source = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
  const stored = typeof source.slots === 'object' && source.slots !== null ? source.slots as Record<string, unknown> : {};
  const slots = defaultSlots();
  for (const kind of SOUND_KINDS) {
    slots[kind] = sanitizeSlot(stored[kind]);
  }
  return { volume: 'volume' in source ? sanitizeVolume(source.volume) : DEFAULT_SOUND_VOLUME, slots };
}

export const useSoundStore = create<SoundStoreState>()(
  persist<SoundStoreState, [], [], PersistedSoundState>(
    (set) => ({
      volume: DEFAULT_SOUND_VOLUME,
      slots: defaultSlots(),
      setVolume: (volume) => set({ volume: sanitizeVolume(volume) }),
      setSlot: (kind, slot) => set((state) => ({ slots: { ...state.slots, [kind]: sanitizeSlot(slot) } }))
    }),
    {
      name: 'kukechat-sounds',
      version: 1,
      migrate: (persisted) => sanitizePersisted(persisted),
      merge: (persisted, current) => ({ ...current, ...sanitizePersisted(persisted) }),
      partialize: (state) => ({ volume: state.volume, slots: state.slots })
    }
  )
);

/** 设置里正引用着的自定义音频 id（包括暂时关掉的）。 */
export function customSoundsInUse(): Set<string> {
  const ids = new Set<string>();
  for (const slot of Object.values(useSoundStore.getState().slots)) {
    if (slot.custom) {
      ids.add(slot.custom.id);
    }
  }
  return ids;
}
