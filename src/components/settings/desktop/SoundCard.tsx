import { Icon, type IconName } from '@/components/ui/Icon';
import { useKukeStore } from '@/store/kukeStore';
import { useSoundStore, type SoundKind } from '@/store/soundStore';
import { SOUND_LIMIT_TEXT, canUseCustomSounds } from '@/utils/customSounds';
import { previewNotificationSound } from '@/utils/notifications';
import { SOUND_FILE_ACCEPT, SOUND_ROWS, useSoundSlot } from '../soundSettings';
import { Card, Choice, Notice, Row, Toggle, btn } from './settingsUi';
import { Slider } from './theme/controls';

function SoundRow({ kind, label, hint, icon }: { kind: SoundKind; label: string; hint: string; icon: IconName }): JSX.Element {
  const sound = useSoundSlot(kind);
  const { slot } = sound;
  return (
    <Row wrap icon={icon} description={hint} title={(
      <span className="flex min-w-0 items-baseline gap-2">
        <span className="shrink-0">{label}</span>
        <span className={`truncate text-xs font-normal ${sound.missing ? 'text-amber-600' : '[color:var(--kc-muted)]'}`} title={slot.mode === 'custom' ? slot.custom?.name : undefined} aria-live="polite">{sound.status}</span>
      </span>
    )}>
      <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-1.5">
        <button type="button" className={btn.ghost} disabled={slot.mode === 'off'} title={slot.mode === 'off' ? '这一种已经关掉了' : undefined} aria-label={`试听${label}`} onClick={sound.preview}><Icon name="play" className="h-4 w-4" />试听</button>
        {slot.custom && sound.canUpload ? <button type="button" className={btn.ghost} disabled={sound.busy} aria-label={`更换${label}的音频`} onClick={sound.pickFile}><Icon name="upload" className="h-4 w-4" />更换</button> : null}
        <Choice value={slot.mode} options={sound.options} onChange={sound.choose} />
        <input ref={sound.fileInputRef} type="file" accept={SOUND_FILE_ACCEPT} className="hidden" onChange={sound.onFileChange} />
      </div>
      {sound.error ? <div className="basis-full"><Notice tone="error">{sound.error}</Notice></div> : null}
    </Row>
  );
}

/** 通用设置里的「提示音」一组：总开关、音量、五种声音各一行。 */
export function SoundCard(): JSX.Element {
  const soundMode = useKukeStore((state) => state.soundNotificationMode);
  const setSoundMode = useKukeStore((state) => state.setSoundNotificationMode);
  const volume = useSoundStore((state) => state.volume);
  const setVolume = useSoundStore((state) => state.setVolume);
  return (
    <Card title="提示音" description={canUseCustomSounds() ? `每一种都可以换成自己的声音（${SOUND_LIMIT_TEXT}）。音频只保存在这台设备上，不会上传。` : undefined}>
      <Row icon="volume" title="播放提示音" description="关掉后全部静音，下面各项的设置会留着。">
        <Toggle label="提示音" checked={soundMode === 'on'} onChange={(on) => setSoundMode(on ? 'on' : 'off')} />
      </Row>
      <Row wrap icon="sliders" title="音量" description="默认和自定义的声音都按这个音量放。">
        <div className="ml-auto w-[260px] max-w-full">
          <Slider bare label="提示音音量" value={volume} min={0} max={100} unit="%" onChange={setVolume} onCommit={() => previewNotificationSound('message')} />
        </div>
      </Row>
      {SOUND_ROWS.map((row) => <SoundRow key={row.kind} {...row} />)}
    </Card>
  );
}
