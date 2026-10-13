import { useEffect, useRef, useState, type ChangeEvent, type RefObject } from 'react';
import type { IconName } from '@/components/ui/Icon';
import { useSoundStore, type SoundKind, type SoundMode, type SoundSlot } from '@/store/soundStore';
import { canUseCustomSounds, chooseSoundMode, customSoundUrl, uploadCustomSound } from '@/utils/customSounds';
import { previewNotificationSound } from '@/utils/notifications';

/** 提示音设置里桌面端和移动端共用的部分：五种声音的文案，以及每一行背后的状态和操作。界面各写各的。 */

export const SOUND_ROWS: Array<{ kind: SoundKind; label: string; hint: string; icon: IconName }> = [
  { kind: 'message', label: '新消息', hint: '收到新消息时响，正在看的聊天不响。', icon: 'message' },
  { kind: 'mention', label: '@ 提醒', hint: '有人 @ 你或 @ 全体成员时响，代替新消息的声音。', icon: 'atSign' },
  { kind: 'join', label: '成员进入', hint: '你在的群里有人加入时响。', icon: 'userPlus' },
  { kind: 'leave', label: '成员离开', hint: '你在的群里有人退出或被移出时响。', icon: 'logout' },
  { kind: 'start', label: '连接成功', hint: '打开 KukeChat、连上服务器时响一次。', icon: 'signal' }
];

/** 系统的文件选择框按 audio/* 过滤时不带 .webm（它被归在视频里），单独补上。 */
export const SOUND_FILE_ACCEPT = 'audio/*,.webm';

export interface SoundSlotControls {
  slot: SoundSlot;
  /** 一句话的当前状态：默认声音 / 已关闭 / 文件名和时长。 */
  status: string;
  /** 设置里记着自定义音频，但本机已经找不到这个文件了（此时实际放的是默认声音）。 */
  missing: boolean;
  busy: boolean;
  error: string;
  /** 这个环境能不能上传。不能时不显示上传入口。 */
  canUpload: boolean;
  options: Array<{ value: SoundMode; label: string }>;
  fileInputRef: RefObject<HTMLInputElement>;
  /** 选「自定义」而还没有音频时会打开文件选择。 */
  choose: (mode: SoundMode) => void;
  pickFile: () => void;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  preview: () => void;
}

export function useSoundSlot(kind: SoundKind): SoundSlotControls {
  const slot = useSoundStore((state) => state.slots[kind]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [missingId, setMissingId] = useState<string | null>(null);
  const canUpload = canUseCustomSounds();
  const customId = slot.custom?.id ?? null;

  useEffect(() => {
    if (!customId) {
      return undefined;
    }
    let alive = true;
    void customSoundUrl(customId).then((url) => {
      if (alive && !url) {
        setMissingId(customId);
      }
    });
    return () => {
      alive = false;
    };
  }, [customId]);

  const missing = customId !== null && missingId === customId;

  async function run(task: () => Promise<void>, fallback: string): Promise<void> {
    setBusy(true);
    setError('');
    try {
      await task();
    } catch (taskError) {
      setError(taskError instanceof Error && taskError.message ? taskError.message : fallback);
    } finally {
      setBusy(false);
    }
  }

  const pickFile = (): void => {
    if (!busy) {
      fileInputRef.current?.click();
    }
  };

  const status = busy ? '处理中…'
    : slot.mode === 'off' ? '已关闭'
    : slot.mode === 'custom' && slot.custom ? (missing ? '音频找不到了，现在放的是默认声音' : `${slot.custom.name} · ${slot.custom.duration.toFixed(1)} 秒`)
    : '默认声音';

  return {
    slot,
    status,
    missing,
    busy,
    error,
    canUpload,
    options: [
      { value: 'default', label: '默认' },
      { value: 'off', label: '关闭' },
      ...(slot.custom ? [{ value: 'custom' as const, label: '自定义' }] : canUpload ? [{ value: 'custom' as const, label: '上传…' }] : [])
    ],
    fileInputRef,
    choose: (mode) => {
      if (busy) {
        return;
      }
      if (mode === 'custom' && !slot.custom) {
        pickFile();
      } else if (mode !== slot.mode) {
        void run(() => chooseSoundMode(kind, mode), '设置没能保存，请再试一次。');
      }
    },
    pickFile,
    onFileChange: (event) => {
      const file = event.target.files?.[0];
      // 清掉才能连着两次选同一个文件
      event.target.value = '';
      if (file) {
        void run(() => uploadCustomSound(kind, file), '这段音频没能保存，换一个试试。');
      }
    },
    preview: () => previewNotificationSound(kind)
  };
}
