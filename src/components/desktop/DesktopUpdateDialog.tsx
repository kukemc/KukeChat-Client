import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/components/ui/Icon';
import { toast } from '@/components/ui/toast';
import { ChangelogText } from '@/components/update/ChangelogText';
import { UpdateProgress } from '@/components/update/UpdateProgress';
import { FORCED_UPDATE_TITLE, formatBytes, formatReleaseDate } from '@/components/update/updateFormat';
import {
  cancelDesktopUpdateDownload, checkForDesktopUpdate, dismissJustUpdated, downloadDesktopUpdate, installDesktopUpdate,
  setDesktopUpdateDialogOpen, skipDesktopUpdateVersion, useDesktopUpdate
} from '@/native/desktopUpdate';
import { openExternalUrl } from '@/utils/openExternalUrl';
import { isMacPlatform } from '@/utils/platform';

export { formatBytes };

function portalRoot(): Element {
  return document.querySelector('.kc-desktop-app') ?? document.body;
}

export function UpdateProgressBar({ downloaded, total }: { downloaded: number; total: number | null }): JSX.Element {
  return <UpdateProgress downloaded={downloaded} total={total} />;
}

/**
 * Global update dialog for the desktop app; opened by automatic checks, the title-bar pill and settings.
 * 样式在 styles/app-update.css（kup-），和群升级同一套克制的黑白。强制更新时遮罩不透明、对话框关不掉。
 */
export function DesktopUpdateDialog(): JSX.Element | null {
  const state = useDesktopUpdate();
  const { phase, dialogOpen, latestVersion, currentVersion, forced } = state;
  const busy = phase === 'installing' || phase === 'downloading';
  const close = (): void => setDesktopUpdateDialogOpen(false);

  useEffect(() => {
    if (!dialogOpen || forced) return undefined;
    const onKey = (event: KeyboardEvent): void => { if (event.key === 'Escape' && phase !== 'installing') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialogOpen, phase, forced]);

  if (!dialogOpen) return null;

  const meta: string[] = [];
  const date = formatReleaseDate(state.publishedAt);
  if (date) meta.push(date);
  if (state.installerSize) meta.push(formatBytes(state.installerSize));
  meta.push(`当前 v${currentVersion}`);

  let eyebrow = '软件更新';
  let title = '';
  let body: JSX.Element | null = null;
  let actions: JSX.Element | null = null;
  const changelog = state.changelog ? <ChangelogText text={state.changelog} /> : null;
  const forcedNote = forced ? <p className="kup-forced">{FORCED_UPDATE_TITLE}<span>更新完成前暂时无法使用 KukeChat，聊天记录不会丢失。</span></p> : null;

  if (phase === 'checking' || phase === 'idle') {
    title = '正在检查更新…';
    body = <p className="kup-text">当前版本 v{currentVersion}</p>;
    actions = <button type="button" className="kup-btn-quiet" onClick={close}>关闭</button>;
  } else if (phase === 'upToDate') {
    title = state.message === '已是最新版本' || !state.message ? '已是最新版本' : '暂无可用更新';
    body = <p className="kup-text">当前版本 v{currentVersion}{state.message && state.message !== '已是最新版本' ? `。${state.message}。` : '，无需更新。'}</p>;
    actions = <button type="button" className="kup-btn" onClick={close}>好的</button>;
  } else if (phase === 'available') {
    eyebrow = forced ? '需要更新' : '发现新版本';
    title = `KukeChat ${latestVersion}`;
    body = <>
      {forcedNote}
      {changelog ?? <p className="kup-text">新版本已经可以下载。</p>}
      <p className="kup-text">{isMacPlatform() ? '安装时 KukeChat 会短暂关闭，替换好后自动重新打开。' : '安装时 KukeChat 会短暂关闭，装好后自动重新打开。Windows 可能会弹出一次管理员权限确认。'}</p>
    </>;
    actions = <>
      {forced ? null : <button type="button" className="kup-link kup-foot-start" onClick={skipDesktopUpdateVersion}>跳过此版本</button>}
      {forced ? null : <button type="button" className="kup-btn-quiet" onClick={close}>稍后</button>}
      <button type="button" className="kup-btn" onClick={() => void downloadDesktopUpdate()}><Icon name="download" className="h-4 w-4" />下载并安装</button>
    </>;
  } else if (phase === 'downloading') {
    eyebrow = forced ? '需要更新' : '正在下载';
    title = `KukeChat ${latestVersion}`;
    body = <>
      {forcedNote}
      <UpdateProgress downloaded={state.downloaded} total={state.total} />
      {changelog}
    </>;
    actions = <>
      <button type="button" className="kup-link kup-foot-start" onClick={cancelDesktopUpdateDownload}>取消下载</button>
      {forced ? null : <button type="button" className="kup-btn-quiet" onClick={close}>后台下载</button>}
    </>;
  } else if (phase === 'ready') {
    eyebrow = '已准备好';
    title = `KukeChat ${latestVersion}`;
    body = <>
      {forcedNote}
      <p className="kup-text">安装包已下载并校验。现在安装会关闭 KukeChat，安装完成后自动重新打开，大约需要半分钟。</p>
      {changelog}
    </>;
    actions = <>
      {forced ? null : <button type="button" className="kup-btn-quiet" onClick={close}>稍后安装</button>}
      <button type="button" className="kup-btn" onClick={() => void installDesktopUpdate()}>安装并重启</button>
    </>;
  } else if (phase === 'installing') {
    eyebrow = '正在安装';
    title = '正在启动安装程序…';
    body = <p className="kup-text">KukeChat 即将关闭，安装完成后会自动重新打开。</p>;
  } else {
    eyebrow = forced ? '需要更新' : '软件更新';
    title = '更新失败';
    body = <>
      {forcedNote}
      <p className="kup-error">{state.error ?? '发生未知错误'}</p>
      {state.installerUrl ? <p className="kup-text">也可以手动下载安装包，覆盖安装即可，聊天记录不会丢失。</p> : null}
    </>;
    actions = <>
      {state.installerUrl ? <button type="button" className="kup-link kup-foot-start" onClick={() => void openExternalUrl(state.installerUrl as string)}><Icon name="external" className="h-4 w-4" />手动下载</button> : null}
      {forced ? null : <button type="button" className="kup-btn-quiet" onClick={close}>关闭</button>}
      <button type="button" className="kup-btn" onClick={() => void (state.installerUrl && latestVersion ? downloadDesktopUpdate() : checkForDesktopUpdate({ manual: true }))}>重试</button>
    </>;
  }

  const showMeta = phase === 'available' || phase === 'downloading' || phase === 'ready';
  return createPortal(
    <div className={`kup-layer ${forced ? 'is-forced' : ''}`} onMouseDown={() => { if (!forced && !busy) close(); }}>
      <section role={forced ? 'alertdialog' : 'dialog'} aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()} className="kup-sheet">
        <header className="kup-head">
          <span className="kup-eyebrow">{eyebrow}</span>
          <h2 className="kup-title">{title}</h2>
          {showMeta ? <div className="kup-meta">{meta.map((item) => <span key={item}>{item}</span>)}</div> : null}
        </header>
        {body ? <div className="kup-body">{body}</div> : null}
        {actions ? <footer className="kup-foot">{actions}</footer> : null}
      </section>
    </div>,
    portalRoot()
  );
}

/** One-off notice on the first launch after an update. Rendered by the app-wide toast host. */
export function DesktopJustUpdatedNotice(): null {
  const version = useDesktopUpdate((state) => state.justUpdatedTo);
  useEffect(() => {
    if (!version) return;
    toast.success(`已更新到 v${version}`, { id: 'desktop.just-updated', duration: 6000 });
    // The flag only drives this one-off notice; clear it once the toast has been queued.
    dismissJustUpdated();
  }, [version]);
  return null;
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
