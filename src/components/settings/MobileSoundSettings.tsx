import { useEffect, useRef, type CSSProperties } from 'react';
import { Icon, type IconName } from '@/components/ui/Icon';
import { useSoundStore, type SoundKind } from '@/store/soundStore';
import { SOUND_LIMIT_TEXT, canUseCustomSounds } from '@/utils/customSounds';
import { previewNotificationSound } from '@/utils/notifications';
import { SOUND_FILE_ACCEPT, SOUND_ROWS, useSoundSlot } from './soundSettings';

/** 移动端设置里「通用外观」页的提示音部分：音量，以及五种声音各自放什么。总开关在它上面那张卡片里。 */

function VolumeControl(): JSX.Element {
  const volume = useSoundStore((state) => state.volume);
  const setVolume = useSoundStore((state) => state.setVolume);
  const inputRef = useRef<HTMLInputElement | null>(null);
  // 「松手」是原生的 change 事件；React 的 onChange 在拖动途中也一直触发
  useEffect(() => {
    const input = inputRef.current;
    if (!input) {
      return undefined;
    }
    const commit = (): void => previewNotificationSound('message');
    input.addEventListener('change', commit);
    return () => input.removeEventListener('change', commit);
  }, []);
  return (
    <section className="kc-qq-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-[16px] font-black [color:var(--kc-text)]">提示音音量</h4>
          <p className="mt-1 text-[12px] [color:var(--kc-muted)]">默认和自定义的声音都按这个音量放，松手会响一下。</p>
        </div>
        <span className="shrink-0 rounded-full px-3 py-1 text-xs font-bold tabular-nums [background:var(--kc-accent-soft)] [color:var(--kc-accent)]">{volume}%</span>
      </div>
      <input ref={inputRef} type="range" min={0} max={100} step={1} value={volume} onChange={(event) => setVolume(Number(event.target.value))} style={{ '--kc-range-progress': `${volume}%` } as CSSProperties} className="kc-font-size-range mt-2 w-full" aria-label="提示音音量" />
    </section>
  );
}

function SoundItem({ kind, label, hint, icon }: { kind: SoundKind; label: string; hint: string; icon: IconName }): JSX.Element {
  const sound = useSoundSlot(kind);
  const { slot } = sound;
  return (
    <div className="kc-qq-settings-row flex-wrap">
      <span className="kc-qq-settings-icon"><Icon name={icon} className="h-5 w-5" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-semibold [color:var(--kc-text)]">{label}</span>
        <span className="mt-0.5 block text-[12px] [color:var(--kc-muted)]">{hint}</span>
      </span>
      <button type="button" onClick={sound.preview} disabled={slot.mode === 'off'} className="grid h-9 w-9 shrink-0 place-items-center rounded-full disabled:opacity-40 [background:var(--kc-accent-soft)] [color:var(--kc-accent)]" aria-label={`试听${label}`}><Icon name="play" className="h-4 w-4" /></button>
      <div className="grid basis-full gap-2" style={{ gridTemplateColumns: `repeat(${sound.options.length}, minmax(0, 1fr))` }} role="radiogroup" aria-label={label}>
        {sound.options.map((option) => {
          const active = slot.mode === option.value;
          return <button key={option.value} type="button" role="radio" aria-checked={active} onClick={() => sound.choose(option.value)} className={`rounded-[14px] px-2 py-2 text-center text-[13px] font-bold ${active ? 'text-white [background:var(--kc-accent)]' : '[background:var(--kc-panel-muted)] [color:var(--kc-muted)]'}`}>{option.label}</button>;
        })}
      </div>
      <div className="flex min-w-0 basis-full items-center gap-2 text-[12px]">
        <span className={`min-w-0 flex-1 truncate ${sound.missing ? 'text-amber-600' : '[color:var(--kc-muted)]'}`} aria-live="polite">当前：{sound.status}</span>
        {slot.custom && sound.canUpload ? <button type="button" onClick={sound.pickFile} disabled={sound.busy} className="shrink-0 font-bold disabled:opacity-50 [color:var(--kc-accent)]">更换音频</button> : null}
      </div>
      {sound.error ? <p className="basis-full rounded-[18px] bg-red-50 px-4 py-3 text-[13px] text-red-500">{sound.error}</p> : null}
      <input ref={sound.fileInputRef} type="file" accept={SOUND_FILE_ACCEPT} className="hidden" onChange={sound.onFileChange} />
    </div>
  );
}

export function MobileSoundSettings(): JSX.Element {
  return (
    <>
      <VolumeControl />
      <section>
        <p className="kc-qq-section-title">各种提示音</p>
        <div className="kc-qq-card overflow-hidden p-0">
          {SOUND_ROWS.map((row) => <SoundItem key={row.kind} {...row} />)}
        </div>
        {canUseCustomSounds() ? <p className="mt-2 px-1 text-[12px] leading-5 [color:var(--kc-muted)]">每一种都可以换成自己的声音（{SOUND_LIMIT_TEXT}）。音频只保存在这台设备上，不会上传。</p> : null}
      </section>
    </>
  );
}
