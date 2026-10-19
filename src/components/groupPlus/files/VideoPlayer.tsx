import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { downloadGroupFileViaServer, getGroupFileLink } from '@/api/groupPlus';
import { Icon } from '@/components/ui/Icon';
import { getDesktopPortalRoot, useEscapeLayer } from '@/components/ui/desktop/Modal';
import { getKukePortalRoot } from '@/components/ui/imageViewerState';
import { toast } from '@/components/ui/toast';
import { registerNativeBackHandler } from '@/native/back';
import { useKukeStore } from '@/store/kukeStore';
import { formatFileSize } from '../tier';
import { useGroupPlusUi, type VideoTarget } from '../ui';
import { downloadAndSave, downloadErrorText, videoMimeOf } from './fileUtils';

/**
 * 群文件视频的应用内播放器（样式在 styles/video-player.css，前缀 kvp-）。
 * 桌面是居中浮层：深色遮罩，上面一条文件名 + 下载 + 关闭，底下一条控件；移动端整屏，点画面显示 / 收起控件。
 *
 * 地址：开了直连（私有桶）就现取 5 分钟的预签名地址直接交给 <video>，边下边放、能拖进度；
 * 播到一半链接过期（拖进度、断网重连时会重新请求）就再取一条，从原来的位置接着放。
 * 没开直连只能经服务器整份取回（要带登录令牌，<video> 自己带不上），做成 objectURL，关掉时释放。
 *
 * 格式：WebView2 / Chromium 能放 mp4（H.264 / AAC）、webm（VP8 / VP9 / AV1）、ogv；mov、mkv 看里面的编码，
 * HEVC 之类放不了。放不了时不白屏，显示「这个视频格式不支持在线播放」和下载按钮。
 */

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];
const SEEK_STEP = 5;
const IDLE_MS = 2600;
/** 播放中链接过期最多换几次新链接，免得服务器出问题时一直重试 */
const MAX_LINK_REFRESHES = 3;

interface VideoSource {
  url: string;
  /** 预签名直连地址（会过期，可以换新的）；false 是 objectURL */
  direct: boolean;
  release: () => void;
}

type Phase =
  | { kind: 'loading' }
  | { kind: 'ready' }
  | { kind: 'unsupported' }
  | { kind: 'failed'; text: string; gone: boolean };

type FullscreenVideo = HTMLVideoElement & { webkitEnterFullscreen?: () => void };

async function loadVideoSource(conversationId: number, fileId: number, name: string): Promise<VideoSource> {
  const link = await getGroupFileLink(conversationId, fileId);
  if (link) {
    return { url: link, direct: true, release: () => undefined };
  }
  const blob = await downloadGroupFileViaServer(conversationId, fileId);
  // 服务器回的是 application/octet-stream：按扩展名重新标一下类型
  const url = URL.createObjectURL(new Blob([blob], { type: videoMimeOf(name) }));
  return { url, direct: false, release: () => URL.revokeObjectURL(url) };
}

/**
 * 直连地址第一次就加载失败时，分清是「地址取不到」还是「取到了但放不了」：
 * Chromium 对这两种都报 MEDIA_ERR_SRC_NOT_SUPPORTED。桶对所有来源放行跨域，所以可以直接探一下前两个字节。
 */
async function reachable(url: string): Promise<boolean> {
  const controller = new AbortController();
  try {
    const response = await fetch(url, { headers: { Range: 'bytes=0-1' }, signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    controller.abort();
  }
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '0:00';
  }
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

function rateLabel(rate: number): string {
  return rate === 1 ? '倍速' : `${rate}x`;
}

/** 键盘事件真正落在哪：扩展形态在 Shadow DOM 里，window 上看到的 target 是宿主元素 */
function eventTarget(event: Event): Element | null {
  const first = event.composedPath()[0];
  return first instanceof Element ? first : null;
}

function isEditable(element: Element): boolean {
  return element instanceof HTMLTextAreaElement
    || (element instanceof HTMLInputElement && element.type !== 'range' && element.type !== 'checkbox')
    || (element instanceof HTMLElement && element.isContentEditable);
}

/** 点在 <video> 上的位置是不是落在画面里（object-fit: contain 两边 / 上下的留黑算遮罩） */
function insidePicture(video: HTMLVideoElement, clientX: number, clientY: number): boolean {
  const rect = video.getBoundingClientRect();
  if (!video.videoWidth || !video.videoHeight || rect.width === 0 || rect.height === 0) {
    return true;
  }
  const scale = Math.min(rect.width / video.videoWidth, rect.height / video.videoHeight);
  const width = video.videoWidth * scale;
  const height = video.videoHeight * scale;
  const left = rect.left + (rect.width - width) / 2;
  const top = rect.top + (rect.height - height) / 2;
  return clientX >= left && clientX <= left + width && clientY >= top && clientY <= top + height;
}

export function VideoPlayer({ target, onClose }: { target: VideoTarget; onClose: () => void }): JSX.Element {
  const { conversationId, fileId, name, size } = target;
  const mobile = useKukeStore((state) => state.layoutMode === 'mobile');
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const sourceRef = useRef<VideoSource | null>(null);
  const onUnavailableRef = useRef(target.onUnavailable);
  onUnavailableRef.current = target.onUnavailable;
  /** 拿到过元数据：之后的出错算「播到一半断了」，可以换新链接接着放 */
  const metaLoadedRef = useRef(false);
  const refreshesRef = useRef(0);
  /** 换了新链接后要恢复到的位置 */
  const resumeRef = useRef<{ time: number; play: boolean } | null>(null);
  const playingRef = useRef(false);
  const hideTimerRef = useRef<number | null>(null);

  const [attempt, setAttempt] = useState(0);
  const [src, setSrc] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [waiting, setWaiting] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [rateMenu, setRateMenu] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [downloading, setDownloading] = useState(false);

  const ready = phase.kind === 'ready';
  const canFullscreen = typeof document !== 'undefined' && (document.fullscreenEnabled || typeof (videoRef.current as FullscreenVideo | null)?.webkitEnterFullscreen === 'function');

  // 取播放地址；「重试」时 attempt + 1 重新来一遍
  useEffect(() => {
    let cancelled = false;
    setPhase({ kind: 'loading' });
    setSrc(null);
    metaLoadedRef.current = false;
    refreshesRef.current = 0;
    resumeRef.current = null;
    loadVideoSource(conversationId, fileId, name).then((source) => {
      if (cancelled) {
        source.release();
        return;
      }
      sourceRef.current = source;
      setSrc(source.url);
    }).catch((error: unknown) => {
      if (cancelled) {
        return;
      }
      const text = downloadErrorText(error);
      const gone = text === '文件已过期' || text === '文件已不存在';
      if (gone) {
        onUnavailableRef.current?.(text);
      }
      setPhase({ kind: 'failed', text, gone });
    });
    return () => {
      cancelled = true;
      sourceRef.current?.release();
      sourceRef.current = null;
    };
  }, [conversationId, fileId, name, attempt]);

  // 关掉时停止播放、断开地址：不然 Chromium 还会在后台继续缓冲
  useEffect(() => {
    const video = videoRef.current;
    return () => {
      if (video) {
        video.pause();
        video.removeAttribute('src');
        video.load();
      }
      if (hideTimerRef.current !== null) {
        window.clearTimeout(hideTimerRef.current);
      }
      if (document.fullscreenElement) {
        void document.exitFullscreen().catch(() => undefined);
      }
    };
  }, []);

  // 打开时把焦点挪进来：空格、方向键不再落到后面的聊天输入框里
  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    function handleChange(): void {
      setFullscreen(Boolean(document.fullscreenElement));
    }
    document.addEventListener('fullscreenchange', handleChange);
    return () => document.removeEventListener('fullscreenchange', handleChange);
  }, []);

  /** 有动静就把控件亮出来，播放中静止一会儿再收起 */
  function poke(): void {
    setChromeVisible(true);
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    if (playingRef.current) {
      hideTimerRef.current = window.setTimeout(() => setChromeVisible(false), IDLE_MS);
    }
  }

  useEffect(() => {
    playingRef.current = playing;
    poke();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  const showChrome = chromeVisible || rateMenu || !ready;

  function togglePlay(): void {
    const video = videoRef.current;
    if (!video || !ready) {
      return;
    }
    if (video.paused || video.ended) {
      void video.play().catch(() => undefined);
    } else {
      video.pause();
    }
  }

  function seekTo(value: number): void {
    const video = videoRef.current;
    if (!video || !ready) {
      return;
    }
    const next = Math.min(Math.max(value, 0), Number.isFinite(video.duration) ? video.duration : value);
    video.currentTime = next;
    setTime(next);
  }

  function changeVolume(value: number): void {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    const next = Math.min(Math.max(value, 0), 1);
    video.volume = next;
    video.muted = next === 0;
  }

  function toggleMute(): void {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    if (video.muted || video.volume === 0) {
      video.muted = false;
      if (video.volume === 0) {
        video.volume = 0.6;
      }
    } else {
      video.muted = true;
    }
  }

  function pickRate(next: number): void {
    const video = videoRef.current;
    if (video) {
      video.playbackRate = next;
    }
    setRateMenu(false);
    poke();
  }

  function toggleFullscreen(): void {
    const root = rootRef.current;
    const video = videoRef.current as FullscreenVideo | null;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
      return;
    }
    if (root && document.fullscreenEnabled) {
      // 整个播放器进全屏（而不是只有 <video>），自己的控件才留得住
      void root.requestFullscreen().catch(() => toast.error('没能进入全屏'));
      return;
    }
    video?.webkitEnterFullscreen?.();
  }

  function download(): void {
    if (downloading) {
      return;
    }
    setDownloading(true);
    downloadAndSave(conversationId, fileId, name)
      .catch((error: unknown) => toast.error(downloadErrorText(error)))
      .finally(() => setDownloading(false));
  }

  function close(): void {
    if (rateMenu) {
      setRateMenu(false);
      return;
    }
    onClose();
  }

  useEscapeLayer(close);

  useEffect(() => {
    if (!mobile) {
      return undefined;
    }
    return registerNativeBackHandler(() => {
      onClose();
      return true;
    }, 190);
  }, [mobile, onClose]);

  // 键盘：空格 / K 播放暂停，← → 快退快进，↑ ↓ 音量，F 全屏，M 静音（焦点在按钮、滑块上时让它们自己处理）
  const keyHandlerRef = useRef<(event: KeyboardEvent) => void>(() => undefined);
  keyHandlerRef.current = (event: KeyboardEvent) => {
    if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey || !ready) {
      return;
    }
    const target = eventTarget(event);
    // 焦点还留在播放器后面的输入框里（比如聊天输入框）：按键归它，不抢
    if (target && !rootRef.current?.contains(target) && isEditable(target)) {
      return;
    }
    const onControl = target instanceof HTMLButtonElement || target instanceof HTMLInputElement;
    const video = videoRef.current;
    if (!video) {
      return;
    }
    const key = event.key.toLowerCase();
    if ((key === ' ' && !onControl) || key === 'k') {
      event.preventDefault();
      togglePlay();
    } else if ((key === 'arrowleft' || key === 'arrowright') && !(target instanceof HTMLInputElement)) {
      event.preventDefault();
      seekTo(video.currentTime + (key === 'arrowleft' ? -SEEK_STEP : SEEK_STEP));
    } else if ((key === 'arrowup' || key === 'arrowdown') && !(target instanceof HTMLInputElement)) {
      event.preventDefault();
      changeVolume((video.muted ? 0 : video.volume) + (key === 'arrowup' ? 0.1 : -0.1));
    } else if (key === 'f') {
      toggleFullscreen();
    } else if (key === 'm') {
      toggleMute();
    } else {
      return;
    }
    poke();
  };
  useEffect(() => {
    const handler = (event: KeyboardEvent): void => keyHandlerRef.current(event);
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  async function handleError(): Promise<void> {
    const video = videoRef.current;
    const source = sourceRef.current;
    const code = video?.error?.code;
    if (!video || !source || code === undefined || code === MediaError.MEDIA_ERR_ABORTED) {
      return;
    }
    setWaiting(false);
    if (source.direct && metaLoadedRef.current && refreshesRef.current < MAX_LINK_REFRESHES) {
      // 播到一半出错，多半是 5 分钟的链接过期了（拖进度、断网重连都要重新请求）：换一条接着放
      refreshesRef.current += 1;
      resumeRef.current = { time: video.currentTime, play: playingRef.current };
      try {
        const url = await getGroupFileLink(conversationId, fileId);
        if (url && sourceRef.current === source) {
          source.url = url;
          setSrc(url);
          return;
        }
      } catch (error) {
        const text = downloadErrorText(error);
        const gone = text === '文件已过期' || text === '文件已不存在';
        if (gone) {
          onUnavailableRef.current?.(text);
        }
        setPhase({ kind: 'failed', text, gone });
        return;
      }
    }
    if (code === MediaError.MEDIA_ERR_DECODE) {
      setPhase({ kind: 'unsupported' });
      return;
    }
    if (code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED && (!source.direct || metaLoadedRef.current || await reachable(source.url))) {
      setPhase({ kind: 'unsupported' });
      return;
    }
    setPhase({ kind: 'failed', text: '视频加载失败，检查网络后重试', gone: false });
  }

  function handleLoadedMetadata(event: React.SyntheticEvent<HTMLVideoElement>): void {
    const video = event.currentTarget;
    // 有声音没画面（比如 HEVC 编码的 mp4）：当成放不了，别让人对着黑屏听声音
    if (video.videoWidth === 0 && video.videoHeight === 0) {
      video.pause();
      setPhase({ kind: 'unsupported' });
      return;
    }
    const firstTime = !metaLoadedRef.current;
    metaLoadedRef.current = true;
    setDuration(Number.isFinite(video.duration) ? video.duration : 0);
    video.playbackRate = rate;
    setPhase({ kind: 'ready' });
    const resume = resumeRef.current;
    resumeRef.current = null;
    if (resume) {
      video.currentTime = resume.time;
      if (resume.play) {
        void video.play().catch(() => undefined);
      }
    } else if (firstTime) {
      void video.play().catch(() => undefined);
    }
  }

  function handleProgress(event: React.SyntheticEvent<HTMLVideoElement>): void {
    const video = event.currentTarget;
    const ranges = video.buffered;
    for (let index = ranges.length - 1; index >= 0; index -= 1) {
      if (ranges.start(index) <= video.currentTime + 0.5) {
        setBuffered(ranges.end(index));
        return;
      }
    }
  }

  const played = duration > 0 ? Math.min(100, (time / duration) * 100) : 0;
  const loaded = duration > 0 ? Math.min(100, (buffered / duration) * 100) : 0;
  const volumeLevel = muted ? 0 : volume;
  const sizeText = size > 0 ? formatFileSize(size) : '';

  const status = phase.kind === 'loading' ? (
    <div className="kvp-status" role="status">
      <Icon name="loader" className="h-6 w-6 kvp-spin" />
      <p>正在载入视频…</p>
    </div>
  ) : phase.kind === 'unsupported' ? (
    <div className="kvp-status" role="alert">
      <span className="kvp-status-icon"><Icon name="video" className="h-6 w-6" /></span>
      <p className="kvp-status-title">这个视频格式不支持在线播放</p>
      <p className="kvp-status-sub">下载后用本地播放器打开</p>
      <button type="button" className="kvp-pill is-ink" disabled={downloading} onClick={download}>
        <Icon name={downloading ? 'refresh' : 'download'} className={`h-4 w-4${downloading ? ' kvp-spin' : ''}`} />下载
      </button>
    </div>
  ) : phase.kind === 'failed' ? (
    <div className="kvp-status" role="alert">
      <span className="kvp-status-icon"><Icon name="alertCircle" className="h-6 w-6" /></span>
      <p className="kvp-status-title">{phase.text}</p>
      {phase.gone ? null : (
        <div className="kvp-status-actions">
          <button type="button" className="kvp-pill" onClick={() => setAttempt((value) => value + 1)}>重试</button>
          <button type="button" className="kvp-pill is-ink" disabled={downloading} onClick={download}>
            <Icon name={downloading ? 'refresh' : 'download'} className={`h-4 w-4${downloading ? ' kvp-spin' : ''}`} />下载
          </button>
        </div>
      )}
    </div>
  ) : waiting ? (
    <div className="kvp-status is-quiet" aria-hidden="true"><Icon name="loader" className="h-7 w-7 kvp-spin" /></div>
  ) : null;

  const node = (
    <div
      ref={rootRef}
      className={`kvp${mobile ? ' is-mobile' : ''}${showChrome ? '' : ' is-idle'}${fullscreen ? ' is-fullscreen' : ''}`}
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
      aria-label={`播放 ${name}`}
      onPointerMove={(event) => {
        if (event.pointerType === 'mouse') {
          poke();
        }
      }}
      onMouseDown={(event) => {
        // 点遮罩关闭（移动端整屏，没有遮罩）
        if (!mobile && event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="kvp-stage">
        <video
          ref={videoRef}
          className={ready ? undefined : 'is-hidden'}
          src={src ?? undefined}
          preload="auto"
          playsInline
          controlsList="nodownload noremoteplayback"
          disablePictureInPicture
          onLoadedMetadata={handleLoadedMetadata}
          onDurationChange={(event) => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)}
          onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
          onProgress={handleProgress}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onWaiting={() => setWaiting(true)}
          onPlaying={() => setWaiting(false)}
          onCanPlay={() => setWaiting(false)}
          onVolumeChange={(event) => {
            setVolume(event.currentTarget.volume);
            setMuted(event.currentTarget.muted);
          }}
          onRateChange={(event) => setRate(event.currentTarget.playbackRate)}
          onError={() => void handleError()}
          onClick={(event) => {
            if (mobile) {
              // 手机上点画面是显示 / 收起控件
              if (showChrome && playingRef.current) {
                setChromeVisible(false);
              } else {
                poke();
              }
              return;
            }
            if (!insidePicture(event.currentTarget, event.clientX, event.clientY)) {
              onClose();
              return;
            }
            togglePlay();
          }}
          onDoubleClick={(event) => {
            if (!mobile && insidePicture(event.currentTarget, event.clientX, event.clientY)) {
              toggleFullscreen();
            }
          }}
        />
        {status}
        {mobile && ready && !playing && !waiting ? (
          <button type="button" className="kvp-center" aria-label="播放" onClick={togglePlay}><Icon name="play" className="h-7 w-7" /></button>
        ) : null}
      </div>

      <header className="kvp-top">
        {mobile ? (
          <button type="button" className="kvp-btn kvp-round" aria-label="关闭视频" onClick={onClose}><Icon name="chevronLeft" className="h-5 w-5" /></button>
        ) : null}
        <div className="kvp-title">
          <span className="kvp-name" title={name}>{name}</span>
          {sizeText ? <span className="kvp-size">{sizeText}</span> : null}
        </div>
        <button type="button" className="kvp-pill is-ink" disabled={downloading} title={`下载 ${name}`} onClick={download}>
          <Icon name={downloading ? 'refresh' : 'download'} className={`h-4 w-4${downloading ? ' kvp-spin' : ''}`} />下载
        </button>
        {mobile ? null : (
          <button type="button" className="kvp-btn kvp-round" aria-label="关闭视频" title="关闭（Esc）" onClick={onClose}><Icon name="close" className="h-[18px] w-[18px]" /></button>
        )}
      </header>

      {ready ? (
        <div className="kvp-bar">
          <div className="kvp-seek">
            <input
              type="range"
              className="kvp-range"
              aria-label="播放进度"
              min={0}
              max={duration || 0}
              step={0.1}
              value={Math.min(time, duration || 0)}
              style={{ '--kvp-fill': `${played}%`, '--kvp-buffer': `${loaded}%` } as React.CSSProperties}
              onChange={(event) => seekTo(Number(event.currentTarget.value))}
            />
          </div>
          <div className="kvp-row">
            <button type="button" className="kvp-btn" aria-label={playing ? '暂停' : '播放'} title={playing ? '暂停（空格）' : '播放（空格）'} onClick={togglePlay}>
              <Icon name={playing ? 'pause' : 'play'} className="h-[18px] w-[18px]" />
            </button>
            <span className="kvp-time">{formatTime(time)} <i>/</i> {formatTime(duration)}</span>
            <span className="kvp-spacer" />
            <div className="kvp-volume">
              <button type="button" className="kvp-btn" aria-label={volumeLevel === 0 ? '取消静音' : '静音'} title={volumeLevel === 0 ? '取消静音（M）' : '静音（M）'} onClick={toggleMute}>
                <Icon name={volumeLevel === 0 ? 'muted' : 'volume'} className="h-[18px] w-[18px]" />
              </button>
              {mobile ? null : (
                <input
                  type="range"
                  className="kvp-range kvp-volume-range"
                  aria-label="音量"
                  min={0}
                  max={1}
                  step={0.05}
                  value={volumeLevel}
                  style={{ '--kvp-fill': `${volumeLevel * 100}%`, '--kvp-buffer': '0%' } as React.CSSProperties}
                  onChange={(event) => changeVolume(Number(event.currentTarget.value))}
                />
              )}
            </div>
            <div className="kvp-rate">
              <button type="button" className={`kvp-pill is-small${rate !== 1 ? ' is-on' : ''}`} aria-haspopup="menu" aria-expanded={rateMenu} title="播放速度" onClick={() => setRateMenu((value) => !value)}>
                {rateLabel(rate)}
              </button>
              {rateMenu ? (
                <div className="kvp-rate-menu" role="menu" aria-label="播放速度">
                  {[...RATES].reverse().map((value) => (
                    <button key={value} type="button" role="menuitemradio" aria-checked={value === rate} className={value === rate ? 'is-active' : undefined} onClick={() => pickRate(value)}>
                      {value === 1 ? '正常' : `${value}x`}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            {canFullscreen ? (
              <button type="button" className="kvp-btn" aria-label={fullscreen ? '退出全屏' : '全屏'} title={fullscreen ? '退出全屏（F）' : '全屏（F）'} onClick={toggleFullscreen}>
                <Icon name={fullscreen ? 'shrink' : 'maximize'} className="h-[18px] w-[18px]" />
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
  return createPortal(node, mobile ? getKukePortalRoot() : getDesktopPortalRoot());
}

/** 播放器的宿主：主界面上挂一份（GroupPlusHosts）。入口只管 useGroupPlusUi().openVideo(...)。 */
export function GroupVideoHost(): JSX.Element | null {
  const target = useGroupPlusUi((state) => state.video);
  const close = useGroupPlusUi((state) => state.closeVideo);
  if (!target) {
    return null;
  }
  // key：换了一个视频就是新的播放器，进度、倍速、出错状态都不带过去
  return <VideoPlayer key={`${target.conversationId}-${target.fileId}`} target={target} onClose={close} />;
}
