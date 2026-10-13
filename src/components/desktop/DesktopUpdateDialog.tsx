import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from '@/components/ui/Icon';
import {
  cancelDesktopUpdateDownload, checkForDesktopUpdate, dismissJustUpdated, downloadDesktopUpdate, installDesktopUpdate,
  setDesktopUpdateDialogOpen, skipDesktopUpdateVersion, useDesktopUpdate
} from '@/native/desktopUpdate';
import { openExternalUrl } from '@/utils/openExternalUrl';

function portalRoot(): Element {
  return document.querySelector('.kc-desktop-app') ?? document.body;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function UpdateProgressBar({ downloaded, total }: { downloaded: number; total: number | null }): JSX.Element {
  const percent = total ? Math.min(100, Math.floor((downloaded / total) * 100)) : null;
  return (
    <div>
      <div className="h-2 overflow-hidden rounded-full [background:var(--kc-panel-muted)]">
        <div className={`h-full rounded-full transition-[width] duration-200 [background:var(--kc-accent)] ${percent === null ? 'w-1/3 animate-pulse' : ''}`} style={percent === null ? undefined : { width: `${percent}%` }} />
      </div>
      <div className="mt-1.5 flex justify-between text-xs tabular-nums [color:var(--kc-muted)]">
        <span>{formatBytes(downloaded)}{total ? ` / ${formatBytes(total)}` : ''}</span>
        <span>{percent === null ? '下载中…' : `${percent}%`}</span>
      </div>
    </div>
  );
}

// 外观用 kui.css 的按钮和对话框，对话框自己的排版（kwf-update-*）在 desktop-settings.css
const primary = 'kui-btn kui-btn--primary';
const secondary = 'kui-btn';
const ghost = 'kui-btn kui-btn--ghost';

/** Global update dialog for the desktop app; opened by automatic checks, the title-bar pill and settings. */
export function DesktopUpdateDialog(): JSX.Element | null {
  const state = useDesktopUpdate();
  const { phase, dialogOpen, latestVersion, currentVersion } = state;
  const close = (): void => setDesktopUpdateDialogOpen(false);

  useEffect(() => {
    if (!dialogOpen) return undefined;
    const onKey = (event: KeyboardEvent): void => { if (event.key === 'Escape' && phase !== 'installing') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialogOpen, phase]);

  if (!dialogOpen) return null;

  let icon: IconName = 'download';
  let tone = '';
  let title = '';
  let body: JSX.Element | null = null;
  let actions: JSX.Element | null = null;

  if (phase === 'checking' || phase === 'idle') {
    icon = 'refresh';
    title = '正在检查更新…';
    body = <p className="text-sm [color:var(--kc-muted)]">当前版本 v{currentVersion}</p>;
    actions = <button type="button" className={secondary} onClick={close}>关闭</button>;
  } else if (phase === 'upToDate') {
    icon = 'check';
    tone = 'is-ok';
    title = state.message === '已是最新版本' ? '已是最新版本' : '暂无可用更新';
    body = <p className="text-sm [color:var(--kc-muted)]">当前版本 v{currentVersion}{state.message && state.message !== '已是最新版本' ? `。${state.message}。` : '，无需更新。'}</p>;
    actions = <button type="button" className={primary} onClick={close}>好的</button>;
  } else if (phase === 'available') {
    title = `发现新版本 v${latestVersion}`;
    body = (
      <div className="grid gap-3 text-sm">
        <p className="[color:var(--kc-muted)]">当前版本 v{currentVersion}。更新包会在后台下载，下载期间可以继续聊天。</p>
        <p className="kui-note">安装时 KukeChat 会短暂关闭，装好后自动重新打开。Windows 可能会弹出一次管理员权限确认。</p>
      </div>
    );
    actions = <>
      <button type="button" className={`${ghost} mr-auto`} onClick={skipDesktopUpdateVersion}>跳过这个版本</button>
      <button type="button" className={secondary} onClick={close}>稍后</button>
      <button type="button" className={primary} onClick={() => void downloadDesktopUpdate()}><Icon name="download" className="h-4 w-4" />立即更新</button>
    </>;
  } else if (phase === 'downloading') {
    title = `正在下载 v${latestVersion}`;
    body = <UpdateProgressBar downloaded={state.downloaded} total={state.total} />;
    actions = <>
      <button type="button" className={`${ghost} mr-auto`} onClick={cancelDesktopUpdateDownload}>取消下载</button>
      <button type="button" className={secondary} onClick={close}>后台下载</button>
    </>;
  } else if (phase === 'ready') {
    icon = 'check';
    tone = 'is-ok';
    title = `v${latestVersion} 已准备好`;
    body = <p className="text-sm [color:var(--kc-muted)]">现在安装会关闭 KukeChat，安装完成后自动重新打开，大约需要半分钟。也可以稍后在设置里安装。</p>;
    actions = <>
      <button type="button" className={secondary} onClick={close}>稍后安装</button>
      <button type="button" className={primary} onClick={() => void installDesktopUpdate()}>重启并安装</button>
    </>;
  } else if (phase === 'installing') {
    icon = 'refresh';
    title = '正在启动安装程序…';
    body = <p className="text-sm [color:var(--kc-muted)]">KukeChat 即将关闭，安装完成后会自动重新打开。</p>;
  } else {
    icon = 'alert';
    tone = 'is-danger';
    title = '更新失败';
    body = (
      <div className="grid gap-2 text-sm">
        <p className="break-words [color:var(--kc-muted)]">{state.error ?? '发生未知错误'}</p>
        {state.installerUrl ? <p className="text-xs [color:var(--kc-muted)]">也可以手动下载安装包，覆盖安装即可，聊天记录不会丢失。</p> : null}
      </div>
    );
    actions = <>
      {state.installerUrl ? <button type="button" className={`${ghost} mr-auto`} onClick={() => void openExternalUrl(state.installerUrl as string)}><Icon name="external" className="h-4 w-4" />手动下载</button> : null}
      <button type="button" className={secondary} onClick={close}>关闭</button>
      <button type="button" className={primary} onClick={() => void (state.installerUrl && latestVersion ? downloadDesktopUpdate() : checkForDesktopUpdate({ manual: true }))}>重试</button>
    </>;
  }

  return createPortal(
    <div className="kui-backdrop" onMouseDown={() => { if (phase !== 'installing' && phase !== 'downloading') close(); }}>
      <section role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()} className="kui-dialog kwf-update">
        <div className="kwf-update-head">
          <span className={`kwf-update-icon ${tone}`}><Icon name={icon} className={`h-5 w-5 ${phase === 'checking' || phase === 'installing' ? 'animate-spin' : ''}`} /></span>
          <h2>{title}</h2>
        </div>
        {body ? <div className="kwf-update-body">{body}</div> : null}
        {actions ? <div className="kui-dialog-footer kwf-update-actions">{actions}</div> : null}
      </section>
    </div>,
    portalRoot()
  );
}

/** One-off notice on the first launch after an update. */
export function DesktopJustUpdatedNotice(): JSX.Element | null {
  const version = useDesktopUpdate((state) => state.justUpdatedTo);
  useEffect(() => {
    if (!version) return undefined;
    const timer = window.setTimeout(dismissJustUpdated, 6000);
    return () => window.clearTimeout(timer);
  }, [version]);
  if (!version) return null;
  return createPortal(
    <div role="status" className="kwf-toast">
      <Icon name="check" className="h-4 w-4" />已更新到 v{version}
      <button type="button" onClick={dismissJustUpdated} className="kui-icon-btn" aria-label="关闭"><Icon name="close" className="h-3.5 w-3.5" /></button>
    </div>,
    portalRoot()
  );
}

/** Title-bar entry point while an update is pending. */
export function DesktopUpdatePill(): JSX.Element | null {
  const { phase, latestVersion, downloaded, total } = useDesktopUpdate();
  if (phase !== 'available' && phase !== 'downloading' && phase !== 'ready') return null;
  const label = phase === 'ready' ? '重启以更新' : phase === 'downloading' ? `下载更新 ${total ? Math.floor((downloaded / total) * 100) : 0}%` : `新版本 v${latestVersion}`;
  return (
    <button type="button" data-window-action onClick={() => setDesktopUpdateDialogOpen(true)} className="kui-btn kui-btn--primary kui-btn--sm kwf-update-pill">
      <Icon name="download" className="h-3.5 w-3.5" />{label}
    </button>
  );
}
