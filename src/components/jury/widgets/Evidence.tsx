import { useEffect, useMemo, useRef, useState } from 'react';
import { cx } from '@/components/chat/desktop/runtime';
import { Icon } from '@/components/ui/Icon';
import { ImageViewer, type ImageViewerState } from '@/components/ui/ImageViewer';
import type { JuryCaseMessage, JuryCaseView } from '@/types/jury';
import { resolveAssetUrl } from '@/utils/assetUrl';
import { formatClockTime } from '@/utils/dateTime';
import { VoiceWaveform } from '@/components/chat/message/VoiceMessage';
import { finiteNumber, formatVoiceDuration } from '@/components/chat/message/messageMeta';
import { formatDateTime } from '../labels';
import { useRestoreFocus } from './focus';

/**
 * 匿名的案件证据：群聊消息是一段对话记录，公开动态是一篇正文。
 *
 * 内容已经由服务端匿名化。这里只按原样展示 —— 不显示、不推断、不补全任何身份信息：
 * 发言人只有「被举报人」「成员A」这类代称，没有头像，图片地址不解析出处。
 */

function Thumbs({ images, onOpen }: { images: string[]; onOpen: (images: string[], index: number) => void }): JSX.Element | null {
  const resolved = images.map((url) => resolveAssetUrl(url)).filter((url): url is string => Boolean(url));
  if (resolved.length === 0) {
    return images.length > 0 ? <p className="kjr-msg-note">图片不可用</p> : null;
  }
  return (
    <div className="kjr-thumbs">
      {resolved.map((src, index) => (
        <button key={`${src}-${index}`} type="button" className="kjr-thumb" aria-label={`查看图片 ${index + 1}`} onClick={() => onOpen(resolved, index)}>
          <img src={src} alt="案件图片" loading="lazy" />
        </button>
      ))}
    </div>
  );
}

/**
 * 案件里的语音：和聊天里的语音气泡同一套波形和时长写法，但不带气泡皮肤、不带右键菜单。
 * 证据里没有录音时长元数据，时长只能从音频本身读；MediaRecorder 录的 webm 往往报 Infinity，
 * 这时把播放头拨到末尾逼浏览器算一遍真实时长，再拨回开头。
 */
function VoiceEvidence({ url }: { url: string }): JSX.Element {
  const src = resolveAssetUrl(url);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const probingRef = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playError, setPlayError] = useState('');
  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;

  function readDuration(audio: HTMLAudioElement): void {
    const value = audio.duration;
    if (Number.isFinite(value) && value > 0) {
      setDuration(value);
      if (probingRef.current) {
        probingRef.current = false;
        audio.currentTime = 0;
        setCurrentTime(0);
      }
      return;
    }
    if (value === Infinity && !probingRef.current) {
      probingRef.current = true;
      audio.currentTime = 1e7;
    }
  }

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

  function seekRatio(ratio: number): void {
    const audio = audioRef.current;
    if (!audio || duration <= 0) {
      return;
    }
    const nextTime = Math.min(duration, Math.max(0, ratio) * duration);
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  }

  if (!src) {
    return <p className="kjr-msg-note">语音不可用</p>;
  }

  return (
    <div className="kjr-voice">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(event) => readDuration(event.currentTarget)}
        onDurationChange={(event) => readDuration(event.currentTarget)}
        onTimeUpdate={(event) => { if (!probingRef.current) setCurrentTime(finiteNumber(event.currentTarget.currentTime, 0)); }}
        onPause={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
        onError={() => { setPlaying(false); setPlayError('语音加载失败'); }}
        onEnded={() => { setPlaying(false); setCurrentTime(0); }}
      />
      <button type="button" className="kjr-voice-play" onClick={() => void togglePlayback()} aria-label={playing ? '暂停语音' : '播放语音'}>
        <span aria-hidden>{playing ? 'Ⅱ' : '▶'}</span>
      </button>
      <div className="kjr-voice-main">
        <div className="kjr-voice-meta">
          <span>语音消息</span>
          <span>{duration > 0 ? formatVoiceDuration((playing || currentTime > 0 ? currentTime : duration) * 1000) : '--:--'}</span>
        </div>
        <VoiceWaveform progress={progress} onSeek={seekRatio} label="语音进度" />
        {playError ? <p className="kjr-voice-error">{playError}</p> : null}
      </div>
    </div>
  );
}

// 后端给被举报人的固定代称。被举报人在上下文里说的每一句都标出来（淡边线 + 加粗），被举报的那一条再额外强调
const REPORTED_SPEAKER = '被举报人';

function messageImages(message: JuryCaseMessage): string[] {
  return [...(message.type === 'image' && message.content ? [message.content] : []), ...(message.images ?? [])];
}

function MessageRow({ message, onOpen }: { message: JuryCaseMessage; onOpen: (images: string[], index: number) => void }): JSX.Element {
  const images = messageImages(message);
  const empty = !message.content?.trim() && images.length === 0;
  return (
    <li className={cx('kjr-msg', message.is_target && 'is-target', message.speaker === REPORTED_SPEAKER && 'is-reported', empty && 'is-recalled')}>
      <div className="kjr-msg-who">
        <span>{message.speaker}</span>
        <time>{formatClockTime(message.created_at)}</time>
      </div>
      <div className="kjr-msg-body">
        {message.is_target ? <span className="kjr-msg-flag">被举报的消息</span> : null}
        {message.type === 'voice' && message.content ? <VoiceEvidence url={message.content} />
          : empty ? <p className="kjr-msg-note">这条消息已被撤回或删除</p>
            : message.type === 'image' || !message.content?.trim() ? null : <p>{message.content}</p>}
        <Thumbs images={images} onOpen={onOpen} />
      </div>
    </li>
  );
}

function FoldButton({ count, where, onClick }: { count: number; where: 'before' | 'after'; onClick: () => void }): JSX.Element {
  return (
    <li className="kjr-fold">
      <button type="button" className="kui-btn kui-btn--ghost kui-btn--sm" onClick={onClick}>
        <Icon name="more" className="h-3.5 w-3.5" />
        展开{where === 'before' ? '更早' : '之后'}的 {count} 条
      </button>
    </li>
  );
}

function Transcript({ messages, near, onOpen }: { messages: JuryCaseMessage[]; near: number; onOpen: (images: string[], index: number) => void }): JSX.Element {
  const [showBefore, setShowBefore] = useState(false);
  const [showAfter, setShowAfter] = useState(false);
  // 旧后端不带 offset：按目标消息的位置自己算
  const withOffset = useMemo(() => {
    const targetIndex = Math.max(0, messages.findIndex((message) => message.is_target));
    return messages.map((message, index) => ({ message, offset: message.offset ?? index - targetIndex }));
  }, [messages]);
  const hiddenBefore = showBefore ? 0 : withOffset.filter((item) => item.offset < -near).length;
  const hiddenAfter = showAfter ? 0 : withOffset.filter((item) => item.offset > near).length;
  const visible = withOffset.filter((item) => (item.offset >= -near || showBefore) && (item.offset <= near || showAfter));
  // 「展开」按钮点完就没了，焦点会掉到 body 上，评审台的数字键跟着失灵：把焦点留在这段对话上
  const listRef = useRef<HTMLOListElement>(null);
  useRestoreFocus(listRef, `${showBefore}-${showAfter}`);

  return (
    <ol ref={listRef} tabIndex={-1} className="kjr-ts" aria-label="匿名对话记录">
      {hiddenBefore > 0 ? <FoldButton count={hiddenBefore} where="before" onClick={() => setShowBefore(true)} /> : null}
      {visible.map((item, index) => <MessageRow key={`${item.offset}-${index}`} message={item.message} onOpen={onOpen} />)}
      {hiddenAfter > 0 ? <FoldButton count={hiddenAfter} where="after" onClick={() => setShowAfter(true)} /> : null}
    </ol>
  );
}

export function CaseEvidence({ view, contextNear, onViewerOpenChange }: {
  view: Pick<JuryCaseView, 'kind' | 'messages' | 'post' | 'case_id'>;
  /** 默认展示目标消息前后各几条，其余折叠 */
  contextNear: number;
  /** 看图浮层开着的时候，评审台要停掉数字快捷键 */
  onViewerOpenChange?: (open: boolean) => void;
}): JSX.Element {
  const [viewer, setViewer] = useState<ImageViewerState | null>(null);
  const open = viewer !== null;
  useEffect(() => {
    onViewerOpenChange?.(open);
  }, [onViewerOpenChange, open]);
  const openImages = (images: string[], index: number): void => setViewer({ images, index });

  return (
    <>
      {view.kind === 'post' ? (
        <article className="kjr-post" aria-label="被举报的动态">
          <header><span className="kjr-msg-flag">被举报的动态</span><time>{view.post ? formatDateTime(view.post.created_at) : ''}</time></header>
          {view.post?.content ? <p>{view.post.content}</p> : <p className="kjr-msg-note">{view.post ? '这篇动态没有文字' : '这篇动态已被删除'}</p>}
          <Thumbs images={view.post?.image_urls ?? []} onOpen={openImages} />
        </article>
      ) : view.messages.length === 0 ? <p className="kjr-msg-note">没有可以展示的消息</p> : <Transcript key={view.case_id} messages={view.messages} near={contextNear} onOpen={openImages} />}
      {viewer ? <ImageViewer viewer={viewer} onClose={() => setViewer(null)} onNavigate={(index) => setViewer((current) => (current ? { ...current, index } : current))} /> : null}
    </>
  );
}
