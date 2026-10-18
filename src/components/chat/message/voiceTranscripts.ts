import { useSyncExternalStore } from 'react';
import { ApiError } from '@/api/client';
import { transcribeVoiceMessage } from '@/api/messages';
import { toast } from '@/components/ui/toast';
import type { Message } from '@/types/api';
import { apiErrorCode } from '@/utils/poke';

/*
 * 语音转文字的状态（按消息 id 记，这次运行里有效）。
 *
 * 右键菜单的「转文字」和气泡下面那行字不在一个组件里，所以放在这里：菜单调 toggleVoiceTranscript，
 * 气泡用 useVoiceTranscript 读。和 QQ 一样，自己点了「转文字」才显示；服务端已经转过的（消息带着 voice_transcript）点了马上出来，不再请求。
 * 收起只是不显示，转出来的字还留着，再点「转文字」立刻展开。
 */

export type VoiceTranscriptStatus = 'idle' | 'loading' | 'done';

export interface VoiceTranscriptView {
  status: VoiceTranscriptStatus;
  text: string;
  /** 要不要显示在气泡下面 */
  open: boolean;
}

interface Entry {
  status: 'loading' | 'done';
  text: string;
  open: boolean;
}

const entries = new Map<number, Entry>();
const listeners = new Set<() => void>();
let version = 0;

function emit(): void {
  version += 1;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function snapshot(): number {
  return version;
}

function serverTranscriptOf(message: Message): string | null {
  return typeof message.voice_transcript === 'string' ? message.voice_transcript : null;
}

/** 这条语音现在的转文字状态：本机请求过的以本机为准；消息自带 voice_transcript 的算已经转好、但先收着，点了「转文字」才展开 */
export function voiceTranscriptOf(message: Message): VoiceTranscriptView {
  const entry = entries.get(message.id);
  if (entry) {
    return { status: entry.status, text: entry.text, open: entry.open };
  }
  const server = serverTranscriptOf(message);
  return server !== null ? { status: 'done', text: server, open: false } : { status: 'idle', text: '', open: false };
}

/** 能不能转：真发出去了的、没撤回的语音 */
export function canTranscribeVoice(message: Message): boolean {
  return message.type === 'voice' && message.id > 0 && !message.recalled_at;
}

/** 转文字失败时给用户看的话 */
export function describeTranscribeError(error: unknown): string {
  const code = apiErrorCode(error);
  const status = error instanceof ApiError ? error.status : 0;
  if (code === 'not_voice') {
    return '这条不是语音消息，转不了文字';
  }
  if (code === 'voice_too_long') {
    return '这段语音太长了，暂时转不了文字';
  }
  if (code === 'transcribe_rate_limited' || status === 429) {
    return '转得太频繁了，等一会儿再试';
  }
  if (code === 'transcribe_unavailable' || status === 503) {
    return '转文字服务暂时不可用，稍后再试';
  }
  if (status === 404 || status === 405 || status === 501) {
    return '暂时还不能转文字';
  }
  return '转文字失败，请稍后重试';
}

/** 让气泡下面显示转出来的字：已经有字就直接展开，没有就去转（正在转的不重复请求） */
export function openVoiceTranscript(message: Message): void {
  const current = voiceTranscriptOf(message);
  if (current.status === 'loading') {
    return;
  }
  if (current.status === 'done') {
    entries.set(message.id, { status: 'done', text: current.text, open: true });
    emit();
    return;
  }
  if (!canTranscribeVoice(message)) {
    return;
  }
  entries.set(message.id, { status: 'loading', text: '', open: true });
  emit();
  void transcribeVoiceMessage(message.conversation_id, message.id).then((result) => {
    entries.set(message.id, { status: 'done', text: result.text.trim(), open: entries.get(message.id)?.open ?? true });
    emit();
  }).catch((error: unknown) => {
    entries.delete(message.id);
    emit();
    toast.warning(describeTranscribeError(error));
  });
}

/** 收起气泡下面那行字（字留着，再展开不用重新转） */
export function closeVoiceTranscript(message: Message): void {
  const current = voiceTranscriptOf(message);
  entries.set(message.id, { status: current.status === 'idle' ? 'done' : current.status, text: current.text, open: false });
  emit();
}

/** 菜单用：展开着就收起，否则展开 / 去转 */
export function toggleVoiceTranscript(message: Message): void {
  if (voiceTranscriptOf(message).open) {
    closeVoiceTranscript(message);
  } else {
    openVoiceTranscript(message);
  }
}

/** 气泡用：这条语音的转文字状态，变了就重渲染 */
export function useVoiceTranscript(message: Message): VoiceTranscriptView {
  useSyncExternalStore(subscribe, snapshot, snapshot);
  return voiceTranscriptOf(message);
}
