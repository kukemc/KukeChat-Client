import { useEffect, useMemo, useRef, useState } from 'react';
import type { Message } from '@/types/api';
import { Icon } from '@/components/ui/Icon';
import { RedPacketGlyph } from '@/components/redpacket/RedPacketGlyph';
import { bubbleSkinClass, type BubbleSkin } from '@/components/shop/skin/bubbleSkin';
import { SkinDecor } from '@/components/shop/skin/SkinDecor';
import { resolveAssetUrl } from '@/utils/assetUrl';
import { redPacketVoiceOf } from '@/utils/redPacket';
import type { StagedVoice } from './types';
import { finiteNumber, formatVoiceDuration, voiceMetadataOf, normalizeVoiceDuration, defaultVoiceWaveform } from './messageMeta';
import { closeVoiceTranscript, useVoiceTranscript, type VoiceTranscriptView } from './voiceTranscripts';

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

/** 同一时间只放一段语音：哪段开始放，正在放的那段就停下（聊天、收藏、精华、转发详情、待发送预览共用这一个） */
let playingAudio: HTMLAudioElement | null = null;

export function claimVoicePlayback(audio: HTMLAudioElement): void {
  if (playingAudio && playingAudio !== audio && !playingAudio.paused) {
    playingAudio.pause();
  }
  playingAudio = audio;
}

/** 胶囊的宽度跟着时长走：最短 PILL_MIN_WIDTH，到 PILL_FULL_SECONDS 秒封顶；开根号是为了让几秒和十几秒的也拉得开 */
const PILL_MIN_WIDTH = 112;
const PILL_MAX_WIDTH = 232;
const PILL_FULL_SECONDS = 60;
/** 胶囊里波形以外占掉的宽度（左右内边距、播放键、两道间距、时长），用来算放几根条 */
const PILL_CHROME_WIDTH = 94;
/** 一根条 2px，加 2px 的缝 */
const BAR_PITCH = 4;
const BAR_MIN_HEIGHT = 3;
const BAR_MAX_HEIGHT = 16;

export function voicePillWidth(seconds: number): number {
  const ratio = Math.sqrt(Math.min(PILL_FULL_SECONDS, Math.max(0, seconds)) / PILL_FULL_SECONDS);
  return Math.round(PILL_MIN_WIDTH + (PILL_MAX_WIDTH - PILL_MIN_WIDTH) * ratio);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 把录音时存下的波形（最多 40 个点）重采样成 count 根条：点多就每段取峰值，点少就线性插值；最高的那根拉满 */
function resampleWaveform(source: number[] | undefined, count: number): number[] {
  const points = source && source.length >= 8 ? source : defaultVoiceWaveform();
  const bars = Array.from({ length: count }, (_, index) => {
    if (points.length >= count) {
      const start = Math.floor((index * points.length) / count);
      const end = Math.max(start + 1, Math.floor(((index + 1) * points.length) / count));
      return Math.max(...points.slice(start, end));
    }
    const position = count <= 1 ? 0 : (index * (points.length - 1)) / (count - 1);
    const low = Math.floor(position);
    const high = Math.min(points.length - 1, low + 1);
    return points[low] + (points[high] - points[low]) * (position - low);
  });
  const top = Math.max(0, ...bars);
  return top > 0.05 ? bars.map((level) => level / top) : bars.map(() => 0.3);
}

/** 气泡下面转出来的那行字：小字、灰、能选中复制；右边一个「收起」 */
function VoiceTranscriptLine({ message, view }: { message: Message; view: VoiceTranscriptView }): JSX.Element | null {
  if (!view.open) {
    return null;
  }
  if (view.status === 'loading') {
    return (
      <div className="kc-voice-transcript is-loading" role="status">
        <Icon name="loader" className="kc-voice-transcript-spin" />
        <span>正在转文字…</span>
      </div>
    );
  }
  return (
    <div className="kc-voice-transcript">
      <p className={view.text ? 'kc-voice-transcript-text' : 'kc-voice-transcript-text is-empty'}>{view.text || '没有听出文字'}</p>
      <button type="button" className="kc-voice-transcript-fold" onClick={(event) => { event.stopPropagation(); closeVoiceTranscript(message); }} title="收起转出来的文字">收起</button>
    </div>
  );
}

/**
 * 语音气泡：一枚小胶囊 ——「播放键 · 细波形 · 时长」，宽度随时长变。
 *   · 点胶囊（波形以外的地方）播放 / 暂停；同一时间只放一段；
 *   · 波形就是进度条：放的时候从左往右填实，点一下或按住拖动跳到那里，方向键也能挪；
 *   · 别人的是白面墨字、自己的跟文字气泡一个底色，播放键是一枚前景色的小实心圆；
 *   · 下面依次挂：播放失败的提示、「领取了语音红包」、转出来的文字（voiceTranscripts.ts）。
 *
 * skin / skinMotion：发送者装备的气泡皮肤、要不要播它的动效（由消息列表算好传进来），语音气泡和文字气泡穿同一件。
 * plain：不在聊天流里（收藏、精华、转发详情）——不要朝头像的尖角，加一圈细描边免得白面贴在白底上看不出来。
 * onContextMenu：聊天里右键 / 长按出消息菜单；收藏、精华这些只读列表不给，事件照常冒泡给外层自己的菜单。
 */
export function VoiceMessageBubble({ message, mine, skin = null, skinMotion = true, plain = false, onContextMenu }: { message: Message; mine: boolean; skin?: BubbleSkin | null; skinMotion?: boolean; plain?: boolean; onContextMenu?: (event: React.MouseEvent<HTMLElement>, message: Message) => void }): JSX.Element {
  const src = resolveAssetUrl(message.content);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveRef = useRef<HTMLDivElement | null>(null);
  const metadata = voiceMetadataOf(message);
  // 领语音红包时发出的那段录音：气泡下面标一句
  const fromRedPacket = redPacketVoiceOf(message) !== null;
  const metadataDuration = finiteNumber(metadata.durationMs, 0) / 1000;
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(metadataDuration);
  const [currentTime, setCurrentTime] = useState(0);
  const [playError, setPlayError] = useState('');
  // 按住波形拖动时手指 / 鼠标所在的位置（秒）；松手才真的跳过去
  const [scrubbing, setScrubbing] = useState<number | null>(null);
  // 还没加载就点了波形：等元数据到了再跳
  const pendingSeekRef = useRef<number | null>(null);
  const transcript = useVoiceTranscript(message);

  const effectiveDuration = normalizeVoiceDuration(duration, metadataDuration || 1);
  // 宽度按录音时记下的时长算（不等音频加载，列表不会因为元数据回来而抖一下）
  const width = voicePillWidth(metadataDuration || effectiveDuration);
  const barCount = Math.max(8, Math.floor((width - PILL_CHROME_WIDTH) / BAR_PITCH));
  const waveformKey = metadata.waveform?.join(',') ?? '';
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const bars = useMemo(() => resampleWaveform(metadata.waveform, barCount), [waveformKey, barCount]);
  const position = scrubbing ?? currentTime;
  const progress = effectiveDuration > 0 ? clamp(position / effectiveDuration, 0, 1) : 0;
  const showPosition = scrubbing !== null || playing || currentTime > 0;

  // 放的时候每帧读一次进度，波形是连续填过去的（timeupdate 一秒只来四次，会一格一格跳）
  useEffect(() => {
    if (!playing) {
      return undefined;
    }
    let frame = 0;
    const tick = (): void => {
      const audio = audioRef.current;
      if (audio) {
        setCurrentTime(finiteNumber(audio.currentTime, 0));
      }
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [playing]);

  // 卸载（关掉收藏面板、切走会话）时停下，不在背后接着放
  useEffect(() => () => {
    const audio = audioRef.current;
    if (audio && !audio.paused) {
      audio.pause();
    }
  }, []);

  async function togglePlayback(): Promise<void> {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    if (!audio.paused) {
      audio.pause();
      return;
    }
    try {
      setPlayError('');
      if (audio.readyState === 0) {
        audio.load();
      }
      claimVoicePlayback(audio);
      await audio.play();
    } catch (error) {
      // 刚点播放又马上点了暂停（或者被别的语音抢走）会是 AbortError，不算失败
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        setPlaying(false);
        setPlayError('播放失败');
      }
    }
  }

  function seekTo(seconds: number): void {
    const next = clamp(seconds, 0, effectiveDuration);
    setCurrentTime(next);
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    if (audio.readyState === 0) {
      pendingSeekRef.current = next;
      audio.load();
      return;
    }
    audio.currentTime = next;
  }

  function secondsAt(clientX: number): number {
    const rect = waveRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) {
      return 0;
    }
    return clamp((clientX - rect.left) / rect.width, 0, 1) * effectiveDuration;
  }

  function handleWavePointerDown(event: React.PointerEvent<HTMLDivElement>): void {
    if (event.button !== 0) {
      return;
    }
    // 拖的时候别顺手选中旁边的字
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setScrubbing(secondsAt(event.clientX));
  }

  function handleWavePointerMove(event: React.PointerEvent<HTMLDivElement>): void {
    if (scrubbing !== null) {
      setScrubbing(secondsAt(event.clientX));
    }
  }

  function handleWavePointerUp(event: React.PointerEvent<HTMLDivElement>): void {
    if (scrubbing === null) {
      return;
    }
    seekTo(secondsAt(event.clientX));
    setScrubbing(null);
  }

  function handleWaveKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    const step = Math.max(1, effectiveDuration / 20);
    const targets: Record<string, number> = {
      ArrowLeft: position - step,
      ArrowDown: position - step,
      ArrowRight: position + step,
      ArrowUp: position + step,
      Home: 0,
      End: effectiveDuration
    };
    if (event.key in targets) {
      event.preventDefault();
      seekTo(targets[event.key]);
    }
  }

  function handlePillClick(event: React.MouseEvent<HTMLDivElement>): void {
    // 收藏、转发详情里外层整行可点（跳到原消息），点语音不该带着它走
    event.stopPropagation();
    if ((event.target as HTMLElement).closest('.kc-voice-wave')) {
      return;
    }
    void togglePlayback();
  }

  function applyDuration(audio: HTMLAudioElement): void {
    setDuration(normalizeVoiceDuration(audio.duration, metadataDuration));
  }

  if (!src) {
    return <span className="kc-voice-unavailable">语音不可用</span>;
  }

  const className = [
    'kc-voice',
    mine ? 'is-mine' : 'is-theirs',
    plain ? 'is-plain' : '',
    playing ? 'is-playing' : '',
    skin ? `kcsk-m ${bubbleSkinClass(skin, mine)}` : ''
  ].filter(Boolean).join(' ');
  const barHeight = (level: number): string => `${Math.round(BAR_MIN_HEIGHT + level * (BAR_MAX_HEIGHT - BAR_MIN_HEIGHT))}px`;

  return (
    <div className={mine ? 'kc-voice-msg is-mine' : 'kc-voice-msg'} onContextMenu={onContextMenu ? (event) => onContextMenu(event, message) : undefined}>
      <div className={className} style={{ ...skin?.vars, width }} onClick={handlePillClick} data-voice-message={message.id}>
        {skin ? <SkinDecor skin={skin} motion={skinMotion} seed={message.id} /> : null}
        <audio
          ref={audioRef}
          src={src}
          preload="metadata"
          onLoadedMetadata={(event) => {
            applyDuration(event.currentTarget);
            if (pendingSeekRef.current !== null) {
              event.currentTarget.currentTime = pendingSeekRef.current;
              pendingSeekRef.current = null;
            }
          }}
          onDurationChange={(event) => applyDuration(event.currentTarget)}
          onTimeUpdate={(event) => setCurrentTime(finiteNumber(event.currentTarget.currentTime, 0))}
          onPause={() => setPlaying(false)}
          onPlay={(event) => { claimVoicePlayback(event.currentTarget); setPlaying(true); }}
          onError={() => { setPlaying(false); setPlayError('播放失败'); }}
          onEnded={() => { setPlaying(false); setCurrentTime(0); }}
        />
        <button type="button" className="kc-voice-play" aria-label={playing ? '暂停语音' : '播放语音'}>
          <Icon name={playing ? 'pause' : 'play'} className="kc-voice-play-icon" />
        </button>
        <div
          ref={waveRef}
          className={scrubbing !== null ? 'kc-voice-wave is-scrubbing' : 'kc-voice-wave'}
          role="slider"
          tabIndex={0}
          aria-label="语音进度"
          aria-valuemin={0}
          aria-valuemax={Math.round(effectiveDuration)}
          aria-valuenow={Math.round(position)}
          aria-valuetext={`${formatVoiceDuration(position * 1000)} / ${formatVoiceDuration(effectiveDuration * 1000)}`}
          onPointerDown={handleWavePointerDown}
          onPointerMove={handleWavePointerMove}
          onPointerUp={handleWavePointerUp}
          onPointerCancel={() => setScrubbing(null)}
          onKeyDown={handleWaveKeyDown}
        >
          {/* 底下一层淡的、上面一层实的；实的那层按进度裁出左边一截，填得是连续的 */}
          <span className="kc-voice-bars" aria-hidden="true">
            {bars.map((level, index) => <span key={index} className="kc-voice-bar" style={{ height: barHeight(level) }} />)}
          </span>
          <span className="kc-voice-bars is-played" aria-hidden="true" style={{ clipPath: `inset(0 ${((1 - progress) * 100).toFixed(2)}% 0 0)` }}>
            {bars.map((level, index) => <span key={index} className="kc-voice-bar is-active" style={{ height: barHeight(level) }} />)}
          </span>
        </div>
        <span className="kc-voice-time" aria-hidden="true">{formatVoiceDuration((showPosition ? position : effectiveDuration) * 1000)}</span>
      </div>
      {playError ? <p className="kc-voice-note is-error">{playError}</p> : null}
      {fromRedPacket ? <p className="kc-voice-note kc-voice-red-packet" data-red-packet-voice=""><RedPacketGlyph size={14} className="kc-voice-red-packet-icon" />领取了语音红包</p> : null}
      <VoiceTranscriptLine message={message} view={transcript} />
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
      <audio ref={audioRef} src={voice.previewUrl} preload="metadata" onLoadedMetadata={(event) => setDuration(normalizeVoiceDuration(event.currentTarget.duration, metadataDuration))} onDurationChange={(event) => setDuration(normalizeVoiceDuration(event.currentTarget.duration, metadataDuration))} onTimeUpdate={(event) => setCurrentTime(finiteNumber(event.currentTarget.currentTime, 0))} onPause={() => setPlaying(false)} onPlay={(event) => { claimVoicePlayback(event.currentTarget); setPlaying(true); }} onError={() => { setPlaying(false); setPlayError('播放失败'); }} onEnded={() => { setPlaying(false); setCurrentTime(0); }} />
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
