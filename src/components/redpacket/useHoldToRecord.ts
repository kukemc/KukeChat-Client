import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useVoiceRecorder } from '@/components/chat/desktop/useVoiceRecorder';
import { MOBILE_VOICE_CANCEL_DISTANCE } from '@/components/chat/message/constants';
import { useEscapeLayer } from '@/components/ui/desktop/Modal';
import { RED_PACKET_VOICE_MAX_MS } from '@/utils/redPacket';
import type { RedPacketClaimRecording } from './data';

/**
 * 计时器每 250ms 看一次有没有到点，到点之后录音器还要收尾：留一点余量，交上去的录音才不会超过服务端的 15 秒（voice_too_long）。
 */
const RECORD_LIMIT_MS = RED_PACKET_VOICE_MAX_MS - 600;

/** idle 等着按；starting 正在要麦克风；recording 录着；finishing 松手了，录音在收尾（解码、查有没有声音） */
export type HoldPhase = 'idle' | 'starting' | 'recording' | 'finishing';

interface HoldToRecord {
  phase: HoldPhase;
  /** 手指 / 鼠标往上滑够了距离：松开就作废 */
  canceling: boolean;
  elapsedMs: number;
  limitMs: number;
  /** 绑到「按住说话」按钮上 */
  bind: {
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
    onPointerMove: (event: PointerEvent<HTMLButtonElement>) => void;
    onPointerUp: (event: PointerEvent<HTMLButtonElement>) => void;
    onPointerCancel: (event: PointerEvent<HTMLButtonElement>) => void;
    onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
    onKeyUp: (event: KeyboardEvent<HTMLButtonElement>) => void;
    onContextMenu: (event: React.MouseEvent<HTMLButtonElement>) => void;
  };
}

type Press = { kind: 'pointer'; id: number; startY: number } | { kind: 'key' };

/**
 * 按住说话：按下开始录（和聊天里发语音用的是同一个录音器，格式、检查都一样），松开交给 onRecorded；
 * 往上滑出 56px（和移动端按住说话一样）再松开、按 Esc、或者系统打断（pointercancel）都作废。键盘上按住空格 / 回车也行。
 * 最长 15 秒，到点自动结束并交上去。disabled 时按下没有反应。
 */
export function useHoldToRecord({ disabled, onStart, onRecorded, onError }: { disabled: boolean; /** 按下去的那一下（清掉上一次的提示） */ onStart?: () => void; onRecorded: (recording: RedPacketClaimRecording) => void; onError: (message: string) => void }): HoldToRecord {
  const [phase, setPhase] = useState<HoldPhase>('idle');
  const [canceling, setCanceling] = useState(false);
  const pressRef = useRef<Press | null>(null);
  const cancelingRef = useRef(false);
  const callbacksRef = useRef({ onStart, onRecorded, onError });
  callbacksRef.current = { onStart, onRecorded, onError };

  const recorder = useVoiceRecorder({
    maxDurationMs: RECORD_LIMIT_MS,
    onRecorded: (voice) => {
      // 预览地址这里用不着
      URL.revokeObjectURL(voice.previewUrl);
      pressRef.current = null;
      setPhase('idle');
      setCanceling(false);
      callbacksRef.current.onRecorded({ file: voice.file, durationMs: Math.min(voice.durationMs, RED_PACKET_VOICE_MAX_MS), waveform: voice.waveform });
    },
    onError: (message) => {
      pressRef.current = null;
      setPhase('idle');
      setCanceling(false);
      callbacksRef.current.onError(message);
    }
  });
  const { start: startRecorder, stop: stopRecorder, cancel: cancelRecorder, recording } = recorder;

  // 录音器到点自己停了（手还按着）：进入收尾，等 onRecorded
  useEffect(() => {
    if (!recording && phase === 'recording') {
      pressRef.current = null;
      setCanceling(false);
      setPhase('finishing');
    }
  }, [phase, recording]);

  const setCancel = useCallback((value: boolean) => {
    cancelingRef.current = value;
    setCanceling(value);
  }, []);

  const begin = useCallback((press: Press) => {
    pressRef.current = press;
    setCancel(false);
    setPhase('starting');
    callbacksRef.current.onStart?.();
    void startRecorder().then((started) => {
      if (!started) {
        // 原因已经从 onError 交出去了
        pressRef.current = null;
        setPhase('idle');
        return;
      }
      // 要麦克风的时候（可能弹了权限框）就已经松手了：这次不算
      if (pressRef.current !== press) {
        cancelRecorder();
        setPhase('idle');
        return;
      }
      setPhase('recording');
    });
  }, [cancelRecorder, setCancel, startRecorder]);

  const finish = useCallback((cancel: boolean) => {
    pressRef.current = null;
    setCancel(false);
    if (phase === 'starting') {
      // 还没真正开始：begin 那边发现 pressRef 换了会自己作废
      return;
    }
    if (phase !== 'recording') {
      return;
    }
    if (cancel) {
      cancelRecorder();
      setPhase('idle');
      return;
    }
    setPhase('finishing');
    stopRecorder();
  }, [cancelRecorder, phase, setCancel, stopRecorder]);

  // 录着录着按钮没了（红包刚被抢完、过期、撤回）：这次作废
  useEffect(() => {
    if (disabled && (phase === 'starting' || phase === 'recording')) {
      finish(true);
    }
  }, [disabled, finish, phase]);

  // 录着的时候 Esc 是「作废这次录音」，不是关掉红包
  useEscapeLayer(phase === 'starting' || phase === 'recording' ? () => finish(true) : null);

  const idle = phase === 'idle';
  const bind: HoldToRecord['bind'] = {
    onPointerDown: (event) => {
      if (disabled || !idle || pressRef.current || (event.pointerType === 'mouse' && event.button !== 0)) {
        return;
      }
      event.preventDefault();
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // 老的 WebView 上拿不到指针也照常录
      }
      begin({ kind: 'pointer', id: event.pointerId, startY: event.clientY });
    },
    onPointerMove: (event) => {
      const press = pressRef.current;
      if (press?.kind !== 'pointer' || press.id !== event.pointerId) {
        return;
      }
      const next = press.startY - event.clientY >= MOBILE_VOICE_CANCEL_DISTANCE;
      if (next !== cancelingRef.current) {
        setCancel(next);
      }
    },
    onPointerUp: (event) => {
      const press = pressRef.current;
      if (press?.kind !== 'pointer' || press.id !== event.pointerId) {
        return;
      }
      event.preventDefault();
      finish(cancelingRef.current || press.startY - event.clientY >= MOBILE_VOICE_CANCEL_DISTANCE);
    },
    onPointerCancel: (event) => {
      const press = pressRef.current;
      if (press?.kind === 'pointer' && press.id === event.pointerId) {
        finish(true);
      }
    },
    onKeyDown: (event) => {
      if (event.key !== ' ' && event.key !== 'Enter') {
        return;
      }
      event.preventDefault();
      if (event.repeat || disabled || !idle || pressRef.current) {
        return;
      }
      begin({ kind: 'key' });
    },
    onKeyUp: (event) => {
      if ((event.key === ' ' || event.key === 'Enter') && pressRef.current?.kind === 'key') {
        event.preventDefault();
        finish(false);
      }
    },
    // 长按不弹系统菜单
    onContextMenu: (event) => event.preventDefault()
  };

  return { phase, canceling, elapsedMs: recorder.elapsedMs, limitMs: RECORD_LIMIT_MS, bind };
}
