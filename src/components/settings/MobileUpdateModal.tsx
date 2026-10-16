import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PluginListenerHandle } from '@capacitor/core';
import { ChangelogText } from '@/components/update/ChangelogText';
import { updatePortalRoot } from '@/components/update/ReleaseNotes';
import { UpdateProgress } from '@/components/update/UpdateProgress';
import { FORCED_UPDATE_TITLE, formatBytes, formatReleaseDate } from '@/components/update/updateFormat';
import {
  checkMobileUpdate,
  downloadUpdateApk,
  installUpdateApk,
  isMobileUpdateSupported,
  onDownloadProgress,
  type MobileUpdateInfo
} from '@/native/appUpdate';

export const MOBILE_CHECK_UPDATE_EVENT = 'kukechat:check-update';

type UpdatePhase =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'permission'
  | 'installing'
  | 'uptodate'
  | 'error';

interface UpdateState {
  phase: UpdatePhase;
  info: MobileUpdateInfo | null;
  downloaded: number;
  total: number | null;
  error: string | null;
  manual: boolean;
}

const INITIAL_STATE: UpdateState = {
  phase: 'idle',
  info: null,
  downloaded: 0,
  total: null,
  error: null,
  manual: false
};

/**
 * Dispatch this to trigger a manual "check for update" from anywhere (e.g. the
 * settings screen). The gate below listens for it.
 */
export function requestMobileUpdateCheck(): void {
  window.dispatchEvent(new CustomEvent(MOBILE_CHECK_UPDATE_EVENT));
}

function pluginErrorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error && typeof (error as { code: unknown }).code === 'string') {
    return (error as { code: string }).code;
  }
  return error instanceof Error ? error.message : '';
}

/**
 * Capacitor 安卓壳的更新弹窗：启动后静默检查，有新版本时弹出更新内容，用户点「下载并安装」才下载。
 * 强制更新（当前版本低于 min_supported_version）时弹窗关不掉、挡住整个应用。样式在 styles/app-update.css（kup-）。
 */
export function MobileUpdateGate(): JSX.Element | null {
  const [state, setState] = useState<UpdateState>(INITIAL_STATE);
  const progressListenerRef = useRef<PluginListenerHandle | null>(null);
  const downloadedPathRef = useRef<string | null>(null);
  const busyRef = useRef(false);

  const startInstall = useCallback(async (path: string) => {
    try {
      await installUpdateApk(path);
      setState((current) => ({ ...current, phase: 'installing' }));
    } catch (error) {
      if (pluginErrorCode(error).includes('PERMISSION')) {
        setState((current) => ({ ...current, phase: 'permission' }));
        return;
      }
      setState((current) => ({ ...current, phase: 'error', error: '安装启动失败，请稍后重试。' }));
    }
  }, []);

  const runDownload = useCallback(async (info: MobileUpdateInfo) => {
    if (!info.downloadUrl) {
      setState((current) => ({ ...current, phase: 'error', error: '缺少下载链接。' }));
      return;
    }
    setState((current) => ({ ...current, phase: 'downloading', downloaded: 0, total: info.size, error: null }));
    try {
      progressListenerRef.current = await onDownloadProgress((update) => {
        setState((current) => (current.phase === 'downloading'
          ? { ...current, downloaded: update.downloaded, total: update.total > 0 ? update.total : info.size }
          : current));
      });
      const path = await downloadUpdateApk(info.downloadUrl, info.sha256);
      await progressListenerRef.current?.remove();
      progressListenerRef.current = null;
      downloadedPathRef.current = path;
      await startInstall(path);
    } catch (error) {
      await progressListenerRef.current?.remove();
      progressListenerRef.current = null;
      const mismatch = pluginErrorCode(error).includes('CHECKSUM');
      setState((current) => ({ ...current, phase: 'error', error: mismatch ? '安装包校验失败，请重新下载。' : '下载失败，请检查网络后重试。' }));
    }
  }, [startInstall]);

  const runCheck = useCallback(async (manual: boolean) => {
    if (busyRef.current) {
      return;
    }
    busyRef.current = true;
    setState({ ...INITIAL_STATE, phase: 'checking', manual });
    try {
      const info = await checkMobileUpdate();
      if (!info.hasUpdate) {
        busyRef.current = false;
        if (manual) {
          setState({ ...INITIAL_STATE, phase: 'uptodate', info, manual });
        } else {
          setState(INITIAL_STATE);
        }
        return;
      }
      setState({ ...INITIAL_STATE, phase: 'available', info, manual });
    } catch {
      busyRef.current = false;
      if (manual) {
        setState({ ...INITIAL_STATE, phase: 'error', error: '检查更新失败，请稍后重试。', manual });
      } else {
        setState(INITIAL_STATE);
      }
    }
  }, []);

  useEffect(() => {
    if (!isMobileUpdateSupported()) {
      return undefined;
    }
    const timer = window.setTimeout(() => void runCheck(false), 3200);
    const onManual = (): void => void runCheck(true);
    window.addEventListener(MOBILE_CHECK_UPDATE_EVENT, onManual);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(MOBILE_CHECK_UPDATE_EVENT, onManual);
      void progressListenerRef.current?.remove();
      progressListenerRef.current = null;
    };
  }, [runCheck]);

  const forced = state.info?.forced === true;

  const dismiss = useCallback(() => {
    if (forced) return;
    busyRef.current = false;
    setState(INITIAL_STATE);
  }, [forced]);

  if (!isMobileUpdateSupported() || state.phase === 'idle') {
    return null;
  }

  if (state.phase === 'checking' && !state.manual) {
    return null;
  }

  const info = state.info;
  const canDismiss = !forced && state.phase !== 'downloading' && state.phase !== 'installing';
  const meta: string[] = [];
  const date = formatReleaseDate(info?.publishedAt ?? null);
  if (date) meta.push(date);
  if (info?.size) meta.push(formatBytes(info.size));
  if (info) meta.push(`当前 v${info.currentVersion}`);
  const changelog = info?.changelog ? <ChangelogText text={info.changelog} /> : null;
  const forcedNote = forced ? <p className="kup-forced">{FORCED_UPDATE_TITLE}<span>更新完成前暂时无法使用 KukeChat，聊天记录不会丢失。</span></p> : null;

  let eyebrow = forced ? '需要更新' : '软件更新';
  let title = '';
  let body: JSX.Element | null = null;
  let actions: JSX.Element | null = null;
  const later = canDismiss ? <button type="button" className="kup-btn-quiet" onClick={dismiss}>稍后</button> : null;

  if (state.phase === 'checking') {
    title = '正在检查更新…';
    body = <p className="kup-text">正在获取最新版本信息。</p>;
    actions = <button type="button" className="kup-btn-quiet" onClick={dismiss}>关闭</button>;
  } else if (state.phase === 'uptodate') {
    title = '已是最新版本';
    body = <p className="kup-text">当前版本 v{info?.currentVersion} 已是最新，无需更新。</p>;
    actions = <button type="button" className="kup-btn" onClick={dismiss}>好的</button>;
  } else if (state.phase === 'available') {
    eyebrow = forced ? '需要更新' : '发现新版本';
    title = `KukeChat ${info?.latestVersion ?? ''}`;
    body = <>{forcedNote}{changelog ?? <p className="kup-text">新版本已经可以下载。</p>}</>;
    actions = <>{later}<button type="button" className="kup-btn" onClick={() => info && void runDownload(info)}>下载并安装</button></>;
  } else if (state.phase === 'downloading') {
    eyebrow = '正在下载';
    title = `KukeChat ${info?.latestVersion ?? ''}`;
    body = <>{forcedNote}<UpdateProgress downloaded={state.downloaded} total={state.total} />{changelog}</>;
  } else if (state.phase === 'installing') {
    eyebrow = '准备安装';
    title = '已打开系统安装程序';
    body = <>{forcedNote}<p className="kup-text">请按系统提示完成安装。没有看到安装界面的话，可以再点一次「安装」。</p></>;
    actions = <>{later}<button type="button" className="kup-btn" onClick={() => downloadedPathRef.current && void startInstall(downloadedPathRef.current)}>安装</button></>;
  } else if (state.phase === 'permission') {
    eyebrow = '需要权限';
    title = '允许安装应用';
    body = <>{forcedNote}<p className="kup-text">请在打开的系统设置里允许 KukeChat「安装未知应用」，然后回到这里点「继续安装」。</p></>;
    actions = <>{later}<button type="button" className="kup-btn" onClick={() => downloadedPathRef.current && void startInstall(downloadedPathRef.current)}>继续安装</button></>;
  } else {
    title = '更新失败';
    body = <>{forcedNote}<p className="kup-error">{state.error ?? '请稍后重试。'}</p></>;
    actions = <>
      {later}
      <button
        type="button"
        className="kup-btn"
        onClick={() => {
          if (info?.hasUpdate) {
            void runDownload(info);
          } else {
            busyRef.current = false;
            void runCheck(true);
          }
        }}
      >重试</button>
    </>;
  }

  const showMeta = state.phase === 'available' || state.phase === 'downloading';
  return createPortal(
    <div className={`kup-layer ${forced ? 'is-forced' : ''}`} onClick={canDismiss ? dismiss : undefined}>
      <section role={forced ? 'alertdialog' : 'dialog'} aria-modal="true" aria-label={title} className="kup-sheet" onClick={(event) => event.stopPropagation()}>
        <header className="kup-head">
          <span className="kup-eyebrow">{eyebrow}</span>
          <h2 className="kup-title">{title}</h2>
          {showMeta && meta.length ? <div className="kup-meta">{meta.map((item) => <span key={item}>{item}</span>)}</div> : null}
        </header>
        {body ? <div className="kup-body">{body}</div> : null}
        {actions ? <footer className="kup-foot">{actions}</footer> : null}
      </section>
    </div>,
    updatePortalRoot()
  );
}
