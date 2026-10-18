import { useRef, useState } from 'react';
import type { Message } from '@/types/api';
import { Icon } from '@/components/ui/Icon';
import { bubbleSkinClass, type BubbleSkin } from '@/components/shop/skin/bubbleSkin';
import { SkinDecor } from '@/components/shop/skin/SkinDecor';
import { resolveAssetUrl } from '@/utils/assetUrl';
import { redPacketVoiceOf } from '@/utils/redPacket';
import type { StagedVoice } from './types';
import { finiteNumber, formatVoiceDuration, voiceMetadataOf, normalizeVoiceDuration, defaultVoiceWaveform } from './messageMeta';

export function VoiceWaveform({ waveform, progress, onSeek, label }: { waveform?: number[]; progress: number; onSeek: (ratio: number) => void; label: string }): JSX.Element {
  const bars = waveform && waveform.length >= 8 ? waveform : defaultVoiceWaveform();
  const clampedProgress = Math.min(1, Math.max(0, progress));

  function seekFromEvent(event: React.MouseEvent<HTMLButtonElement>): void {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) {
      return;
    }
    onSeek((event.clientX - rect.left) / rect.width);
  }

  return (
    <button type="button" onClick={seekFromEvent} className="flex h-8 w-full items-center gap-[3px] rounded-lg px-0.5" aria-label={label}>
      {bars.map((level, index) => {
        const ratio = bars.length <= 1 ? 1 : index / (bars.length - 1);
        const active = ratio <= clampedProgress;
        return (
          <span
            key={`${index}-${level}`}
            className={`kc-voice-bar w-[3px] flex-1 rounded-full transition-colors ${active ? 'is-active [background:var(--kc-accent)]' : '[background:rgba(31,41,55,0.24)]'}`}
            style={{ height: `${Math.max(6, Math.round((0.22 + Math.min(1, Math.max(0, level)) * 0.78) * 28))}px` }}
          />
        );
      })}
    </button>
  );
}

/**
 * skin / skinMotion：发送者装备的气泡皮肤、要不要播它的动效（由消息列表算好传进来），语音气泡和文字气泡穿同一件。
 * onContextMenu：聊天里右键 / 长按出消息菜单；收藏、精华这些只读列表不给，事件照常冒泡给外层自己的菜单。
 */
export function VoiceMessageBubble({ message, mine, skin = null, skinMotion = true, onContextMenu }: { message: Message; mine: boolean; skin?: BubbleSkin | null; skinMotion?: boolean; onContextMenu?: (event: React.MouseEvent<HTMLElement>, message: Message) => void }): JSX.Element {
  const src = resolveAssetUrl(message.content);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const metadata = voiceMetadataOf(message);
  // 领语音红包时发出的那段录音：气泡里标一句
  const fromRedPacket = redPacketVoiceOf(message) !== null;
  const metadataDuration = finiteNumber(metadata.durationMs, 0) / 1000;
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(metadataDuration);
  const [currentTime, setCurrentTime] = useState(0);
  const [playError, setPlayError] = useState('');

  const effectiveDuration = normalizeVoiceDuration(duration, metadataDuration || 1);
  const progress = effectiveDuration > 0 ? Math.min(1, currentTime / effectiveDuration) : 0;

  async function togglePlayback(): Promise<void> {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    if (audio.paused) {
      try {
        setPlayError('');
        if (audio.readyState === 0) {
          audio.load();
        }
        await audio.play();
        setPlaying(true);
      } catch {
        setPlaying(false);
        setPlayError('播放失败');
      }
      return;
    }
    audio.pause();
    setPlaying(false);
  }

  function seek(value: string): void {
    const audio = audioRef.current;
    const nextTime = Number(value);
    if (!audio || !Number.isFinite(nextTime)) {
      return;
    }
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  }

  function seekRatio(ratio: number): void {
    const audio = audioRef.current;
    if (!audio || effectiveDuration <= 0) {
      return;
    }
    const nextTime = Math.min(effectiveDuration, Math.max(0, ratio) * effectiveDuration);
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  }

  if (!src) {
    return <span className="inline-flex rounded-xl border px-3 py-2 text-xs font-semibold [border-color:var(--kc-border)] [background:var(--kc-panel-muted)] [color:var(--kc-muted)]">语音不可用</span>;
  }

  return (
    <div onContextMenu={onContextMenu ? (event) => onContextMenu(event, message) : undefined} style={skin?.vars} className={`kc-voice w-[min(260px,68vw)] rounded-[22px] border px-3 py-2 shadow-none ${mine ? 'rounded-tr-sm [background:linear-gradient(135deg,var(--kc-bubble-out),var(--kc-accent-soft))] [border-color:rgba(79,70,229,0.16)]' : 'rounded-tl-sm [background:var(--kc-bubble-in)] [border-color:var(--kc-border)]'} [color:var(--kc-text)] ${skin ? `kcsk-m ${bubbleSkinClass(skin, mine)}` : ''}`}>
      {skin ? <SkinDecor skin={skin} motion={skinMotion} seed={message.id} /> : null}
      <audio ref={audioRef} src={src} preload="metadata" onLoadedMetadata={(event) => setDuration(normalizeVoiceDuration(event.currentTarget.duration, metadataDuration))} onDurationChange={(event) => setDuration(normalizeVoiceDuration(event.currentTarget.duration, metadataDuration))} onTimeUpdate={(event) => setCurrentTime(finiteNumber(event.currentTarget.currentTime, 0))} onPause={() => setPlaying(false)} onPlay={() => setPlaying(true)} onError={() => { setPlaying(false); setPlayError('播放失败'); }} onEnded={() => { setPlaying(false); setCurrentTime(0); }} />
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => void togglePlayback()} className="kc-voice-play grid h-9 w-9 shrink-0 place-items-center rounded-full shadow-sm transition hover:-translate-y-0.5 [background:var(--kc-panel)] [color:var(--kc-accent)]" aria-label={playing ? '暂停语音' : '播放语音'}>
          <span className="text-sm font-black">{playing ? 'Ⅱ' : '▶'}</span>
        </button>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center justify-between gap-2 text-xs">
            <span className="font-semibold">语音消息</span>
            <span className="tabular-nums [color:var(--kc-muted)]">{formatVoiceDuration((playing ? currentTime : effectiveDuration) * 1000)}</span>
          </div>
          <VoiceWaveform waveform={metadata.waveform} progress={progress} onSeek={seekRatio} label="语音进度" />
          {playError ? <p className="mt-0.5 text-[10px] text-red-500">{playError}</p> : null}
          {fromRedPacket ? <p className="kc-voice-red-packet mt-0.5 inline-flex items-center gap-1 text-[10.5px] leading-4 [color:var(--kc-muted)]" data-red-packet-voice=""><Icon name="redPacket" className="h-3 w-3 [color:#d5392c]" />领取了语音红包</p> : null}
        </div>
      </div>
    </div>
  );
}

export function StagedVoicePreview({ voice, onRemove }: { voice: StagedVoice; onRemove: () => void }): JSX.Element {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const metadataDuration = voice.durationMs / 1000;
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(metadataDuration);
  const [currentTime, setCurrentTime] = useState(0);
  const [playError, setPlayError] = useState('');
  const effectiveDuration = normalizeVoiceDuration(duration, metadataDuration || 1);
  const progress = effectiveDuration > 0 ? Math.min(1, currentTime / effectiveDuration) : 0;

  async function togglePlayback(): Promise<void> {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    if (audio.paused) {
      try {
        setPlayError('');
        if (audio.readyState === 0) {
          audio.load();
        }
        await audio.play();
        setPlaying(true);
      } catch {
        setPlaying(false);
        setPlayError('播放失败');
      }
      return;
    }
    audio.pause();
    setPlaying(false);
  }

  function seek(value: string): void {
    const audio = audioRef.current;
    const nextTime = Number(value);
    if (!audio || !Number.isFinite(nextTime)) {
      return;
    }
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  }

  function seekRatio(ratio: number): void {
    const audio = audioRef.current;
    if (!audio || effectiveDuration <= 0) {
      return;
    }
    const nextTime = Math.min(effectiveDuration, Math.max(0, ratio) * effectiveDuration);
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  }

  return (
    <div className="mb-2 flex w-[min(300px,100%)] items-center gap-3 rounded-[22px] border px-3 py-2 [background:var(--kc-panel-muted)] [border-color:var(--kc-border)]">
      <audio ref={audioRef} src={voice.previewUrl} preload="metadata" onLoadedMetadata={(event) => setDuration(normalizeVoiceDuration(event.currentTarget.duration, metadataDuration))} onDurationChange={(event) => setDuration(normalizeVoiceDuration(event.currentTarget.duration, metadataDuration))} onTimeUpdate={(event) => setCurrentTime(finiteNumber(event.currentTarget.currentTime, 0))} onPause={() => setPlaying(false)} onPlay={() => setPlaying(true)} onError={() => { setPlaying(false); setPlayError('播放失败'); }} onEnded={() => { setPlaying(false); setCurrentTime(0); }} />
      <button type="button" onClick={() => void togglePlayback()} className="grid h-9 w-9 shrink-0 place-items-center rounded-full shadow-sm transition hover:-translate-y-0.5 [background:var(--kc-panel)] [color:var(--kc-accent)]" aria-label={playing ? '暂停待发送语音' : '播放待发送语音'}>
        <span className="text-xs font-black">{playing ? 'Ⅱ' : '▶'}</span>
      </button>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center justify-between gap-2 text-xs">
          <span className="font-semibold">待发送语音</span>
          <span className="tabular-nums [color:var(--kc-muted)]">{formatVoiceDuration((playing ? currentTime : effectiveDuration) * 1000)}</span>
        </div>
        <VoiceWaveform waveform={voice.waveform} progress={progress} onSeek={seekRatio} label="待发送语音进度" />
        {playError ? <p className="mt-0.5 text-[10px] text-red-500">{playError}</p> : null}
      </div>
      <button type="button" onClick={onRemove} className="grid h-8 w-8 shrink-0 place-items-center rounded-full transition hover:[background:var(--kc-hover)]" aria-label="移除语音"><Icon name="close" className="h-3.5 w-3.5" /></button>
    </div>
  );
}
