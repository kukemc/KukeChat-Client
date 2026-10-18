import { useCallback, useEffect, useRef, useState } from 'react';
import { MAX_VOICE_RECORDING_MS, MAX_VOICE_UPLOAD_BYTES } from '../message/constants';
import { defaultVoiceWaveform } from '../message/messageMeta';
import type { StagedVoice } from '../message/types';

const WAVEFORM_BARS = 28;

function preferredMimeType(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg', 'audio/mp4'];
  return candidates.find((candidate) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(candidate)) ?? '';
}

function fileExtension(mimeType: string): string {
  const cleanType = mimeType.split(';', 1)[0];
  if (cleanType === 'audio/ogg') return 'ogg';
  if (cleanType === 'audio/mp4') return 'm4a';
  return 'webm';
}

async function analyze(blob: Blob): Promise<{ waveform: number[]; rms: number | null; peak: number | null }> {
  try {
    const AudioContextCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) {
      return { waveform: defaultVoiceWaveform(WAVEFORM_BARS), rms: null, peak: null };
    }
    const audioContext = new AudioContextCtor();
    const buffer = await audioContext.decodeAudioData(await blob.arrayBuffer());
    await audioContext.close();
    const samples = buffer.getChannelData(0);
    let squareSum = 0;
    let peak = 0;
    for (let index = 0; index < samples.length; index += 1) {
      const level = Math.abs(samples[index] ?? 0);
      squareSum += level * level;
      if (level > peak) peak = level;
    }
    const rms = samples.length > 0 ? Math.sqrt(squareSum / samples.length) : 0;
    const samplesPerBar = Math.max(1, Math.floor(samples.length / WAVEFORM_BARS));
    const bars = Array.from({ length: WAVEFORM_BARS }, (_, bar) => {
      const start = bar * samplesPerBar;
      const end = Math.min(samples.length, start + samplesPerBar);
      let sum = 0;
      for (let index = start; index < end; index += 1) {
        sum += Math.abs(samples[index] ?? 0);
      }
      return end > start ? sum / (end - start) : 0;
    });
    const max = Math.max(...bars, 0.01);
    return { waveform: bars.map((item) => Math.min(1, Math.max(0.08, item / max))), rms, peak };
  } catch {
    return { waveform: defaultVoiceWaveform(WAVEFORM_BARS), rms: null, peak: null };
  }
}

interface VoiceRecorder {
  recording: boolean;
  elapsedMs: number;
  /** 开始录音；拿到麦克风、真的开始录了才是 true（不支持、没权限是 false，原因已经交给 onError） */
  start: () => Promise<boolean>;
  stop: () => void;
  cancel: () => void;
}

/**
 * 录音：start 开始、stop 结束（录好的交给 onRecorded）、cancel 作废。桌面输入框点一下开始、再点一下结束，暂存待发；
 * 领语音红包时按住开始、松开结束（maxDurationMs 给 15 秒，到点自动结束）。
 */
export function useVoiceRecorder({ onRecorded, onError, maxDurationMs = MAX_VOICE_RECORDING_MS }: { onRecorded: (voice: StagedVoice) => void; onError: (message: string) => void; /** 最长录多久，到点自动结束；默认和语音消息一样 */ maxDurationMs?: number }): VoiceRecorder {
  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const cancelledRef = useRef(false);
  const callbacksRef = useRef({ onRecorded, onError });
  callbacksRef.current = { onRecorded, onError };
  const maxDurationRef = useRef(maxDurationMs);
  maxDurationRef.current = maxDurationMs;

  const release = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(async () => {
    if (recorderRef.current?.state === 'recording') {
      return false;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      callbacksRef.current.onError('当前环境不支持录音。');
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: true } });
      const mimeType = preferredMimeType();
      const recorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 48000 });
      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      cancelledRef.current = false;
      startedAtRef.current = Date.now();
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      recorder.onstop = () => {
        void (async () => {
          release();
          setRecording(false);
          setElapsedMs(0);
          const chunks = chunksRef.current;
          chunksRef.current = [];
          if (cancelledRef.current) {
            return;
          }
          const durationMs = Date.now() - startedAtRef.current;
          const type = recorder.mimeType || mimeType || 'audio/webm';
          const blob = new Blob(chunks, { type });
          if (durationMs < 700 || blob.size === 0) {
            callbacksRef.current.onError('录音太短，请重新录制。');
            return;
          }
          if (blob.size > MAX_VOICE_UPLOAD_BYTES) {
            callbacksRef.current.onError('语音太长了，请控制在 3 分钟以内。');
            return;
          }
          const analysis = await analyze(blob);
          if (analysis.rms !== null && analysis.peak !== null && analysis.rms < 0.003 && analysis.peak < 0.015) {
            callbacksRef.current.onError('没有检测到声音，请确认麦克风权限和系统输入设备后重新录制。');
            return;
          }
          const file = new File([blob], `voice-${Date.now()}.${fileExtension(type)}`, { type });
          callbacksRef.current.onRecorded({ file, previewUrl: URL.createObjectURL(blob), durationMs, contentType: type, size: blob.size, waveform: analysis.waveform });
        })();
      };
      recorder.start(1000);
      setRecording(true);
      setElapsedMs(0);
      timerRef.current = window.setInterval(() => {
        const elapsed = Date.now() - startedAtRef.current;
        setElapsedMs(elapsed);
        if (elapsed >= maxDurationRef.current) {
          recorderRef.current?.stop();
        }
      }, 250);
      return true;
    } catch {
      release();
      setRecording(false);
      callbacksRef.current.onError('无法访问麦克风，请检查权限设置。');
      return false;
    }
  }, [release]);

  const stop = useCallback(() => {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop();
    }
  }, []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop();
      return;
    }
    release();
    setRecording(false);
    setElapsedMs(0);
  }, [release]);

  useEffect(() => () => {
    cancelledRef.current = true;
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop();
    }
    release();
  }, [release]);

  return { recording, elapsedMs, start, stop, cancel };
}
