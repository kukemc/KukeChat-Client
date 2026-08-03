import { useCallback, useEffect, useRef, useState } from 'react';
import type { PluginListenerHandle } from '@capacitor/core';
import { Icon } from '@/components/ui/Icon';
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
  progress: number;
  error: string | null;
  manual: boolean;
}

const INITIAL_STATE: UpdateState = {
  phase: 'idle',
  info: null,
  progress: 0,
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
      const code = error instanceof Error ? error.message : '';
      if (typeof code === 'string' && code.includes('PERMISSION')) {
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
    setState((current) => ({ ...current, phase: 'downloading', progress: 0, error: null }));
    try {
      progressListenerRef.current = await onDownloadProgress((update) => {
        setState((current) => (current.phase === 'downloading' ? { ...current, progress: update.progress } : current));
      });
      const path = await downloadUpdateApk(info.downloadUrl);
      await progressListenerRef.current?.remove();
      progressListenerRef.current = null;
      downloadedPathRef.current = path;
      await startInstall(path);
    } catch {
      await progressListenerRef.current?.remove();
      progressListenerRef.current = null;
      setState((current) => ({ ...current, phase: 'error', error: '下载失败，请检查网络后重试。' }));
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
          window.setTimeout(() => setState((current) => (current.phase === 'uptodate' ? INITIAL_STATE : current)), 2200);
        } else {
          setState(INITIAL_STATE);
        }
        return;
      }
      setState({ ...INITIAL_STATE, phase: 'available', info, manual });
      void runDownload(info);
    } catch {
      busyRef.current = false;
      if (manual) {
        setState({ ...INITIAL_STATE, phase: 'error', error: '检查更新失败，请稍后重试。', manual });
      } else {
        setState(INITIAL_STATE);
      }
    }
  }, [runDownload]);

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

  const dismiss = useCallback(() => {
    busyRef.current = false;
    setState(INITIAL_STATE);
  }, []);

  if (!isMobileUpdateSupported() || state.phase === 'idle') {
    return null;
  }

  if (state.phase === 'checking' && !state.manual) {
    return null;
  }

  const latest = state.info?.latestVersion;
  const percent = Math.round(Math.min(1, Math.max(0, state.progress)) * 100);
  const canDismiss = state.phase === 'available' || state.phase === 'permission' || state.phase === 'uptodate' || state.phase === 'error' || state.phase === 'checking';

  return (
    <div className="fixed inset-0 z-[2147483600] grid place-items-center bg-black/45 p-6" onClick={canDismiss ? dismiss : undefined}>
      <div
        className="w-full max-w-[360px] rounded-[26px] border p-6 shadow-2xl [background:var(--kc-panel)] [border-color:var(--kc-border)] [color:var(--kc-text)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="grid h-14 w-14 place-items-center rounded-[20px] [background:var(--kc-accent-soft)] [color:var(--kc-accent)]">
          <Icon name={state.phase === 'error' ? 'flag' : state.phase === 'uptodate' ? 'check' : 'sparkles'} className="h-7 w-7" />
        </div>

        {state.phase === 'checking' ? (
          <>
            <h2 className="mt-4 text-lg font-black">正在检查更新</h2>
            <p className="mt-2 text-sm [color:var(--kc-muted)]">正在获取最新版本信息…</p>
          </>
        ) : null}

        {state.phase === 'uptodate' ? (
          <>
            <h2 className="mt-4 text-lg font-black">已是最新版本</h2>
            <p className="mt-2 text-sm [color:var(--kc-muted)]">当前版本 v{state.info?.currentVersion} 已是最新。</p>
          </>
        ) : null}

        {state.phase === 'available' ? (
          <>
            <h2 className="mt-4 text-lg font-black">发现新版本 v{latest}</h2>
            <p className="mt-2 text-sm [color:var(--kc-muted)]">正在为你准备下载最新版本…</p>
          </>
        ) : null}

        {state.phase === 'downloading' ? (
          <>
            <h2 className="mt-4 text-lg font-black">正在下载 v{latest}</h2>
            <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full [background:var(--kc-hover)]">
              <div className="h-full rounded-full transition-[width] duration-200 [background:var(--kc-accent)]" style={{ width: `${percent}%` }} />
            </div>
            <p className="mt-2 text-right text-xs font-semibold [color:var(--kc-muted)]">{percent}%</p>
          </>
        ) : null}

        {state.phase === 'installing' ? (
          <>
            <h2 className="mt-4 text-lg font-black">准备安装</h2>
            <p className="mt-2 text-sm [color:var(--kc-muted)]">已唤起系统安装程序，请按提示完成安装。</p>
          </>
        ) : null}

        {state.phase === 'permission' ? (
          <>
            <h2 className="mt-4 text-lg font-black">需要安装权限</h2>
            <p className="mt-2 text-sm [color:var(--kc-muted)]">请在弹出的系统设置中允许“安装未知应用”，然后返回点击“重新安装”。</p>
          </>
        ) : null}

        {state.phase === 'error' ? (
          <>
            <h2 className="mt-4 text-lg font-black">更新失败</h2>
            <p className="mt-2 text-sm [color:var(--kc-muted)]">{state.error ?? '请稍后重试。'}</p>
          </>
        ) : null}

        <div className="mt-6 flex items-center justify-end gap-2">
          {state.phase === 'available' || state.phase === 'permission' || state.phase === 'error' || state.phase === 'uptodate' ? (
            <button type="button" onClick={dismiss} className="rounded-xl border px-4 py-2 text-sm font-semibold [border-color:var(--kc-border)] hover:[background:var(--kc-hover)]">
              {state.phase === 'uptodate' ? '好的' : '稍后再说'}
            </button>
          ) : null}
          {state.phase === 'permission' ? (
            <button type="button" onClick={() => downloadedPathRef.current && void startInstall(downloadedPathRef.current)} className="rounded-xl px-5 py-2 text-sm font-semibold text-white [background:var(--kc-accent)]">重新安装</button>
          ) : null}
          {state.phase === 'error' && state.info?.hasUpdate ? (
            <button type="button" onClick={() => state.info && void runDownload(state.info)} className="rounded-xl px-5 py-2 text-sm font-semibold text-white [background:var(--kc-accent)]">重试</button>
          ) : null}
          {state.phase === 'error' && !state.info?.hasUpdate ? (
            <button type="button" onClick={() => { busyRef.current = false; void runCheck(true); }} className="rounded-xl px-5 py-2 text-sm font-semibold text-white [background:var(--kc-accent)]">重试</button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
